import type { ScoutResult, MatchRecord, ScorePlayer } from './stats'
import { queueName } from './stats'
import { championName } from './ddragon'

const nn = (v: unknown): number => (typeof v === 'number' ? v : 0)

// Region-locale codes (from the client) → Riot API routing hosts.
const PLATFORM: Record<string, string> = {
  euw: 'euw1',
  eune: 'eun1',
  na: 'na1',
  br: 'br1',
  lan: 'la1',
  las: 'la2',
  oce: 'oc1',
  kr: 'kr',
  jp: 'jp1',
  tr: 'tr1',
  ru: 'ru',
  ph: 'ph2',
  sg: 'sg2',
  th: 'th2',
  tw: 'tw2',
  vn: 'vn2'
}

const REGIONAL: Record<string, string> = {
  euw: 'europe',
  eune: 'europe',
  tr: 'europe',
  ru: 'europe',
  na: 'americas',
  br: 'americas',
  lan: 'americas',
  las: 'americas',
  oce: 'sea',
  kr: 'asia',
  jp: 'asia',
  ph: 'sea',
  sg: 'sea',
  th: 'sea',
  tw: 'sea',
  vn: 'sea'
}

export function routing(region: string): { platform: string; regional: string } {
  const r = (region || 'euw').toLowerCase()
  return { platform: PLATFORM[r] ?? 'euw1', regional: REGIONAL[r] ?? 'europe' }
}

// ---- In-memory response cache ----------------------------------------------
// Keyed by host+path. TTL depends on how fast the data changes: finished match
// details are effectively immutable, ranks/levels change slowly, live games fast.
interface CacheEntry {
  expires: number
  data: unknown
}
const cache = new Map<string, CacheEntry>()

function ttlFor(path: string): number {
  if (path.includes('/lol/status/')) return 0 // never cache key validation
  if (path.includes('/matches/by-puuid/')) return 2 * 60 * 1000 // match id list
  if (path.includes('/lol/match/v5/matches/')) return 6 * 60 * 60 * 1000 // match detail (immutable)
  if (path.startsWith('/riot/account/')) return 60 * 60 * 1000 // riot id -> puuid
  if (path.includes('/lol/league/')) return 3 * 60 * 1000 // rank / winrate
  if (path.includes('/lol/summoner/')) return 5 * 60 * 1000 // level / icon
  if (path.includes('/lol/spectator/')) return 30 * 1000 // live game
  return 60 * 1000
}

function pruneCache(): void {
  const now = Date.now()
  for (const [k, v] of cache) if (v.expires <= now) cache.delete(k)
  // Hard cap: drop the oldest entries (Map keeps insertion order).
  if (cache.size > 600) {
    let toDrop = cache.size - 500
    for (const k of cache.keys()) {
      if (toDrop-- <= 0) break
      cache.delete(k)
    }
  }
}

async function riotGet<T>(key: string, host: string, path: string): Promise<T> {
  const ttl = ttlFor(path)
  const ck = host + path
  if (ttl > 0) {
    const hit = cache.get(ck)
    if (hit && hit.expires > Date.now()) return hit.data as T
  }
  const res = await fetch(`https://${host}.api.riotgames.com${path}`, {
    headers: { 'X-Riot-Token': key }
  })
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`) as Error & { status?: number }
    err.status = res.status
    throw err
  }
  const data = (await res.json()) as T
  if (ttl > 0) {
    cache.set(ck, { expires: Date.now() + ttl, data })
    if (cache.size > 600) pruneCache()
  }
  return data
}

/** Validate a key by hitting a cheap authenticated endpoint. */
export async function validateKey(
  key: string,
  region: string
): Promise<{ ok: boolean; message: string }> {
  if (!key || key.length < 20) return { ok: false, message: 'empty' }
  const { platform } = routing(region)
  try {
    await riotGet(key, platform, '/lol/status/v4/platform-data')
    return { ok: true, message: 'ok' }
  } catch (e) {
    const status = (e as { status?: number }).status
    if (status === 401 || status === 403) return { ok: false, message: 'invalid' }
    if (status === 429) return { ok: false, message: 'rate' }
    return { ok: false, message: 'network' }
  }
}

/** Resolve a Riot ID (gameName#tagLine) to a PUUID. */
export async function accountByRiotId(
  key: string,
  region: string,
  gameName: string,
  tagLine: string
): Promise<{ puuid: string; gameName: string; tagLine: string } | null> {
  const { regional } = routing(region)
  try {
    return await riotGet(
      key,
      regional,
      `/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(
        tagLine
      )}`
    )
  } catch {
    return null
  }
}

export interface SpectatorParticipant {
  puuid: string
  championId: number
  teamId: number
  riotId?: string
  summonerName?: string
}

/** Current game of a player (spectator-v5). Returns null when not in a game. */
export async function activeGameByPuuid(
  key: string,
  region: string,
  puuid: string
): Promise<{ participants: SpectatorParticipant[]; gameQueueConfigId?: number } | null> {
  const { platform } = routing(region)
  try {
    return await riotGet(key, platform, `/lol/spectator/v5/active-games/by-summoner/${puuid}`)
  } catch {
    // 404 = simply not in a game right now
    return null
  }
}

interface LeagueEntry {
  queueType: string
  tier: string
  rank: string
  leaguePoints: number
  wins: number
  losses: number
}

function computeSmurf(r: ScoutResult): boolean {
  const wr = r.winrate ?? 0
  const g = r.games ?? 0
  const lvl = r.level ?? 0
  const ranked = r.rankTier != null
  const highWinrate = wr >= 65 && g >= 15 && g <= 200
  const lowLevelRanked = lvl > 0 && lvl < 45 && ranked
  const fewGamesClimbing = g > 0 && g < 80 && wr >= 60 && ranked
  return highWinrate || lowLevelRanked || fewGamesClimbing
}

/** Group players who share recent games (likely premade), within each team. */
function assignPremade(
  results: ScoutResult[],
  team: Map<string, number>,
  recent: Map<string, Set<string>>
): void {
  const puuids = results.map((r) => r.puuid).filter(Boolean)
  const parent = new Map<string, string>(puuids.map((p) => [p, p]))
  const find = (x: string): string => {
    let r = x
    while (parent.get(r) !== r) r = parent.get(r) as string
    return r
  }
  const union = (a: string, b: string): void => {
    parent.set(find(a), find(b))
  }
  for (let i = 0; i < puuids.length; i++) {
    for (let j = i + 1; j < puuids.length; j++) {
      const a = puuids[i]
      const b = puuids[j]
      if (team.get(a) !== team.get(b)) continue // premades are same-team
      const ra = recent.get(a)
      const rb = recent.get(b)
      if (!ra || !rb) continue
      let shared = 0
      for (const id of ra) if (rb.has(id)) shared++
      if (shared >= 2) union(a, b)
    }
  }
  const members = new Map<string, string[]>()
  for (const p of puuids) {
    const root = find(p)
    members.set(root, [...(members.get(root) ?? []), p])
  }
  let gid = 0
  const groupOf = new Map<string, number>()
  for (const [, list] of members) {
    if (list.length >= 2) {
      gid++
      for (const m of list) groupOf.set(m, gid)
    }
  }
  for (const r of results) r.premadeGroup = groupOf.get(r.puuid) ?? 0
}

/**
 * Rank + winrate + level, plus smurf & premade heuristics, for each player.
 * ~3 API calls per player (league, summoner, recent match ids).
 */
export async function riotScout(
  key: string,
  region: string,
  players: { puuid: string; championId: number; teamId?: number }[]
): Promise<ScoutResult[]> {
  const { platform, regional } = routing(region)
  const out: ScoutResult[] = []
  const team = new Map<string, number>()
  const recent = new Map<string, Set<string>>()

  for (const p of players) {
    const res: ScoutResult = {
      puuid: p.puuid,
      rankTier: null,
      rankDivision: null,
      rankLp: null,
      winrate: null,
      games: null,
      champGames: null,
      champWinrate: null,
      level: null,
      smurf: false,
      premadeGroup: 0
    }
    team.set(p.puuid, p.teamId ?? 0)
    if (p.puuid) {
      try {
        const entries = await riotGet<LeagueEntry[]>(
          key,
          platform,
          `/lol/league/v4/entries/by-puuid/${p.puuid}`
        )
        const solo =
          entries.find((e) => e.queueType === 'RANKED_SOLO_5x5') ??
          entries.find((e) => e.queueType === 'RANKED_FLEX_SR')
        if (solo?.tier) {
          res.rankTier = solo.tier
          res.rankDivision = solo.rank ?? null
          res.rankLp = typeof solo.leaguePoints === 'number' ? solo.leaguePoints : null
          const g = (solo.wins ?? 0) + (solo.losses ?? 0)
          res.games = g
          res.winrate = g > 0 ? Math.round((solo.wins / g) * 100) : null
        }
      } catch {
        /* no rank */
      }
      try {
        const sm = await riotGet<{ summonerLevel: number }>(
          key,
          platform,
          `/lol/summoner/v4/summoners/by-puuid/${p.puuid}`
        )
        res.level = nn(sm.summonerLevel)
      } catch {
        /* no level */
      }
      try {
        const ids = await riotGet<string[]>(
          key,
          regional,
          `/lol/match/v5/matches/by-puuid/${p.puuid}/ids?start=0&count=6`
        )
        recent.set(p.puuid, new Set(ids))
      } catch {
        /* no history */
      }
      res.smurf = computeSmurf(res)
    }
    out.push(res)
  }

  assignPremade(out, team, recent)
  return out
}

/** Parse a match-v5 object into the app's MatchRecord (from `puuid`'s POV). */
export function parseMatchV5(match: any, puuid: string): MatchRecord | null {
  const info = match?.info
  if (!info) return null
  const parts: any[] = info.participants ?? []
  const me = parts.find((p) => p.puuid === puuid)
  if (!me) return null

  const durationS = nn(info.gameDuration)
  const minutes = Math.max(durationS / 60, 1)
  const teamKills = parts
    .filter((p) => p.teamId === me.teamId)
    .reduce((s, p) => s + nn(p.kills), 0)
  const kills = nn(me.kills)
  const assists = nn(me.assists)
  const deaths = nn(me.deaths)
  const cs = nn(me.totalMinionsKilled) + nn(me.neutralMinionsKilled)
  const kpc = me.challenges?.killParticipation
  const kpPct =
    typeof kpc === 'number'
      ? Math.round(kpc * 100)
      : teamKills > 0
        ? Math.round(((kills + assists) / teamKills) * 100)
        : 0

  const players: ScorePlayer[] = parts.map((p) => ({
    pid: nn(p.participantId),
    teamId: nn(p.teamId),
    name: p.riotIdGameName || p.summonerName || '',
    championId: nn(p.championId),
    kills: nn(p.kills),
    deaths: nn(p.deaths),
    assists: nn(p.assists),
    cs: nn(p.totalMinionsKilled) + nn(p.neutralMinionsKilled),
    gold: nn(p.goldEarned),
    damage: nn(p.totalDamageDealtToChampions),
    vision: nn(p.visionScore),
    items: [p.item0, p.item1, p.item2, p.item3, p.item4, p.item5, p.item6].map(nn)
  }))

  const gameIdNum = Number(String(match?.metadata?.matchId || '').split('_')[1]) || nn(info.gameId)

  return {
    gameId: gameIdNum,
    participantId: nn(me.participantId),
    playedAt: nn(info.gameStartTimestamp) || nn(info.gameCreation) || Date.now(),
    queueId: nn(info.queueId),
    queueName: queueName(nn(info.queueId)),
    champion: championName(me.championId) || me.championName || '',
    championId: nn(me.championId),
    win: Boolean(me.win),
    kills,
    deaths,
    assists,
    cs,
    csPerMin: Math.round((cs / minutes) * 10) / 10,
    kpPct,
    vision: nn(me.visionScore),
    damage: nn(me.totalDamageDealtToChampions),
    gold: nn(me.goldEarned),
    durationS,
    details: {
      champLevel: nn(me.champLevel),
      laneCs: nn(me.totalMinionsKilled),
      jungleCs: nn(me.neutralMinionsKilled),
      totalDamage: nn(me.totalDamageDealt),
      damageTaken: nn(me.totalDamageTaken),
      objectiveDamage: nn(me.damageDealtToObjectives),
      turretKills: nn(me.turretKills),
      wardsPlaced: nn(me.wardsPlaced),
      wardsKilled: nn(me.wardsKilled),
      pinks: nn(me.visionWardsBoughtInGame),
      doubleKills: nn(me.doubleKills),
      tripleKills: nn(me.tripleKills),
      quadraKills: nn(me.quadraKills),
      pentaKills: nn(me.pentaKills),
      largestKillingSpree: nn(me.largestKillingSpree),
      largestMultiKill: nn(me.largestMultiKill),
      items: [me.item0, me.item1, me.item2, me.item3, me.item4, me.item5, me.item6].map(nn),
      spell1: nn(me.summoner1Id),
      spell2: nn(me.summoner2Id),
      keystone: nn(me.perks?.styles?.[0]?.selections?.[0]?.perk),
      primaryStyle: nn(me.perks?.styles?.[0]?.style),
      subStyle: nn(me.perks?.styles?.[1]?.style),
      runes: [
        ...(me.perks?.styles?.[0]?.selections ?? []).map((x: any) => nn(x.perk)),
        ...(me.perks?.styles?.[1]?.selections ?? []).map((x: any) => nn(x.perk))
      ],
      shards: [
        nn(me.perks?.statPerks?.offense),
        nn(me.perks?.statPerks?.flex),
        nn(me.perks?.statPerks?.defense)
      ]
    },
    players
  }
}

/** Extra pages of a player's match history (for "load more"). */
export async function playerMatches(
  key: string,
  region: string,
  gameName: string,
  tagLine: string,
  start: number,
  count: number
): Promise<MatchRecord[]> {
  const acc = await accountByRiotId(key, region, gameName, tagLine)
  if (!acc?.puuid) return []
  const { regional } = routing(region)
  const out: MatchRecord[] = []
  try {
    const ids = await riotGet<string[]>(
      key,
      regional,
      `/lol/match/v5/matches/by-puuid/${acc.puuid}/ids?start=${start}&count=${Math.min(count, 100)}`
    )
    for (const id of ids) {
      try {
        const m = await riotGet<any>(key, regional, `/lol/match/v5/matches/${id}`)
        const rec = parseMatchV5(m, acc.puuid)
        if (rec) out.push(rec)
      } catch {
        /* skip */
      }
    }
  } catch {
    /* none */
  }
  return out
}

export interface PlayerProfileResult {
  status: 'ok' | 'not-found'
  summoner?: {
    gameName: string
    tagLine: string
    profileIconId: number
    summonerLevel: number
    rankedTier: string | null
    rankedDivision: string | null
    rankedLp: number | null
    region: string
  }
  matches?: MatchRecord[]
}

/** Full read-only profile of another player: rank + recent match history. */
export async function playerProfile(
  key: string,
  region: string,
  gameName: string,
  tagLine: string,
  count = 20
): Promise<PlayerProfileResult> {
  const acc = await accountByRiotId(key, region, gameName, tagLine)
  if (!acc?.puuid) return { status: 'not-found' }
  const { platform, regional } = routing(region)

  let profileIconId = 0
  let summonerLevel = 0
  try {
    const sm = await riotGet<{ profileIconId: number; summonerLevel: number }>(
      key,
      platform,
      `/lol/summoner/v4/summoners/by-puuid/${acc.puuid}`
    )
    profileIconId = nn(sm.profileIconId)
    summonerLevel = nn(sm.summonerLevel)
  } catch {
    /* optional */
  }

  let rankedTier: string | null = null
  let rankedDivision: string | null = null
  let rankedLp: number | null = null
  try {
    const entries = await riotGet<LeagueEntry[]>(
      key,
      platform,
      `/lol/league/v4/entries/by-puuid/${acc.puuid}`
    )
    const solo =
      entries.find((e) => e.queueType === 'RANKED_SOLO_5x5') ??
      entries.find((e) => e.queueType === 'RANKED_FLEX_SR')
    if (solo?.tier) {
      rankedTier = solo.tier
      rankedDivision = solo.rank ?? null
      rankedLp = typeof solo.leaguePoints === 'number' ? solo.leaguePoints : null
    }
  } catch {
    /* optional */
  }

  const matches: MatchRecord[] = []
  try {
    const ids = await riotGet<string[]>(
      key,
      regional,
      `/lol/match/v5/matches/by-puuid/${acc.puuid}/ids?start=0&count=${count}`
    )
    for (const id of ids) {
      try {
        const m = await riotGet<any>(key, regional, `/lol/match/v5/matches/${id}`)
        const rec = parseMatchV5(m, acc.puuid)
        if (rec) matches.push(rec)
      } catch {
        /* skip a bad match */
      }
    }
  } catch {
    /* no history */
  }

  return {
    status: 'ok',
    summoner: {
      gameName: acc.gameName || gameName,
      tagLine: acc.tagLine || tagLine,
      profileIconId,
      summonerLevel,
      rankedTier,
      rankedDivision,
      rankedLp,
      region
    },
    matches
  }
}
