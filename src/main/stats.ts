/**
 * Parsing of the LCU match-history format + aggregates, filtering and export
 * serialization. The LCU returns the legacy match shape; field access is
 * defensive because the LCU is unofficial and shifts between patches.
 */
import type { MatchFilter } from './store'
import { championName } from './ddragon'

export interface MatchDetails {
  champLevel: number
  laneCs: number
  jungleCs: number
  totalDamage: number
  damageTaken: number
  objectiveDamage: number
  turretKills: number
  wardsPlaced: number
  wardsKilled: number
  pinks: number
  doubleKills: number
  tripleKills: number
  quadraKills: number
  pentaKills: number
  largestKillingSpree: number
  largestMultiKill: number
  items: number[]
  spell1: number
  spell2: number
}

export interface ScorePlayer {
  pid: number
  teamId: number
  name: string
  championId: number
  kills: number
  deaths: number
  assists: number
  cs: number
  gold: number
  damage: number
  vision: number
  items: number[]
}

export interface MatchRecord {
  gameId: number
  participantId: number
  playedAt: number
  queueId: number
  queueName: string
  champion: string
  championId: number
  win: boolean
  kills: number
  deaths: number
  assists: number
  cs: number
  csPerMin: number
  kpPct: number
  vision: number
  damage: number
  gold: number
  durationS: number
  details?: MatchDetails
  players?: ScorePlayer[]
}

export const QUEUES: Record<number, string> = {
  420: 'Ranked Solo/Duo',
  440: 'Ranked Flex',
  400: 'Normal Draft',
  430: 'Normal Blind',
  450: 'ARAM',
  490: 'Quickplay',
  700: 'Clash',
  1700: 'Arena',
  1710: 'Arena',
  2400: 'ARAM Mayhem',
  1900: 'URF',
  900: 'ARURF'
}

export function queueName(id: number): string {
  return QUEUES[id] ?? `Queue ${id}`
}

const RANKED_QUEUES = new Set([420, 440])
export function isRanked(queueId: number): boolean {
  return RANKED_QUEUES.has(queueId)
}

export interface ItemPurchase {
  itemId: number
  timestamp: number // ms into the game
}

export interface TimelineEvent {
  t: number // timestamp in ms
  kind: 'kill' | 'monster' | 'building'
  killerId: number
  victimId?: number
  assists?: number[]
  monster?: string // DRAGON | BARON_NASHOR | RIFTHERALD
  subType?: string // dragon element
  building?: string // TOWER_BUILDING | INHIBITOR_BUILDING
  lane?: string // TOP_LANE | MID_LANE | BOT_LANE
  teamId?: number
  firstBlood?: boolean
}

export interface LivePlayer {
  name: string
  championImage: string
  championName: string
  skinId: number
  puuid: string
  // Filled by the (keyless SGP) scouting pass — null until available.
  rankTier?: string | null
  rankDivision?: string | null
  rankLp?: number | null
  winrate?: number | null
  games?: number | null
  champGames?: number | null
  champWinrate?: number | null
}
export interface LiveGame {
  teamOne: LivePlayer[]
  teamTwo: LivePlayer[]
  queueId: number
}

export interface Friend {
  id: string
  name: string
  tagLine: string
  iconId: number
  availability: string // chat | away | dnd | mobile | offline
  game: string // lol | tft | valorant | lor | wildrift | other | offline
  status: string // gameStatus for LoL (inGame, championSelect, inQueue…)
  championId: number
  note: string
}

export interface ScoutResult {
  puuid: string
  rankTier: string | null
  rankDivision: string | null
  rankLp: number | null
  winrate: number | null
  games: number | null
  champGames: number | null
  champWinrate: number | null
}

export interface ScoutDiag {
  ok: boolean
  tokenFound: boolean
  baseFound: boolean
  historyOk: boolean
  base: string
  region: string
  error: string
  sample: string
}

const num = (v: unknown): number => (typeof v === 'number' ? v : 0)

export function parseGame(game: any, myPuuid: string): MatchRecord | null {
  const identities: any[] = game.participantIdentities ?? []
  const mine = identities.find((pi) => pi?.player?.puuid && pi.player.puuid === myPuuid)
  if (!mine) return null

  const participants: any[] = game.participants ?? []
  const me = participants.find((p) => p.participantId === mine.participantId)
  if (!me) return null

  // Full scoreboard (all 10 players) — names come from participantIdentities.
  const nameByPid = new Map<number, string>()
  for (const pi of identities) {
    const pl = pi?.player
    if (pl) nameByPid.set(pi.participantId, pl.gameName || pl.summonerName || '')
  }
  const players: ScorePlayer[] = participants.map((p) => {
    const st = p.stats ?? {}
    return {
      pid: p.participantId,
      teamId: p.teamId,
      name: nameByPid.get(p.participantId) || '',
      championId: p.championId,
      kills: num(st.kills),
      deaths: num(st.deaths),
      assists: num(st.assists),
      cs: num(st.totalMinionsKilled) + num(st.neutralMinionsKilled),
      gold: num(st.goldEarned),
      damage: num(st.totalDamageDealtToChampions),
      vision: num(st.visionScore),
      items: [st.item0, st.item1, st.item2, st.item3, st.item4, st.item5, st.item6].map(num)
    }
  })

  const s = me.stats ?? {}
  const kills = num(s.kills)
  const assists = num(s.assists)
  const deaths = num(s.deaths)

  // Team kills = sum of every teammate's kills (mine included).
  const teamKills = participants
    .filter((p) => p.teamId === me.teamId)
    .reduce((sum, p) => sum + num(p.stats?.kills), 0)

  const laneCs = num(s.totalMinionsKilled)
  const jungleCs = num(s.neutralMinionsKilled)
  const cs = laneCs + jungleCs
  const durationS = num(game.gameDuration)
  const minutes = Math.max(durationS / 60, 1)

  // KP% = (my kills + my assists) / team's total kills.
  const kpPct = teamKills > 0 ? Math.round(((kills + assists) / teamKills) * 100) : 0

  const details: MatchDetails = {
    champLevel: num(s.champLevel),
    laneCs,
    jungleCs,
    totalDamage: num(s.totalDamageDealt),
    damageTaken: num(s.totalDamageTaken),
    objectiveDamage: num(s.damageDealtToObjectives),
    turretKills: num(s.turretKills),
    wardsPlaced: num(s.wardsPlaced),
    wardsKilled: num(s.wardsKilled),
    pinks: num(s.visionWardsBoughtInGame),
    doubleKills: num(s.doubleKills),
    tripleKills: num(s.tripleKills),
    quadraKills: num(s.quadraKills),
    pentaKills: num(s.pentaKills),
    largestKillingSpree: num(s.largestKillingSpree),
    largestMultiKill: num(s.largestMultiKill),
    items: [s.item0, s.item1, s.item2, s.item3, s.item4, s.item5, s.item6].map(num),
    spell1: num(me.spell1Id),
    spell2: num(me.spell2Id)
  }

  return {
    gameId: game.gameId,
    participantId: num(me.participantId),
    playedAt: num(game.gameCreation) || Date.now(),
    queueId: num(game.queueId),
    queueName: queueName(num(game.queueId)),
    champion: championName(me.championId),
    championId: me.championId,
    win: Boolean(s.win),
    kills,
    deaths,
    assists,
    cs,
    csPerMin: Math.round((cs / minutes) * 10) / 10,
    kpPct,
    vision: num(s.visionScore),
    damage: num(s.totalDamageDealtToChampions),
    gold: num(s.goldEarned),
    durationS,
    details,
    players
  }
}

// ---------- Filtering ----------

export function applyFilter(matches: MatchRecord[], f: MatchFilter): MatchRecord[] {
  const cutoff =
    f.sinceDays != null ? Date.now() - f.sinceDays * 24 * 60 * 60 * 1000 : null
  return matches.filter((m) => {
    if (f.queueId != null && m.queueId !== f.queueId) return false
    if (f.champion && m.champion !== f.champion) return false
    if (f.result === 'win' && !m.win) return false
    if (f.result === 'loss' && m.win) return false
    if (cutoff != null && m.playedAt < cutoff) return false
    return true
  })
}

// ---------- Aggregates ----------

export interface Aggregate {
  games: number
  wins: number
  winrate: number
  avgKda: number
  avgCsPerMin: number
  avgKp: number
  avgVision: number
}

export function aggregate(matches: MatchRecord[]): Aggregate {
  const games = matches.length
  if (!games) {
    return { games: 0, wins: 0, winrate: 0, avgKda: 0, avgCsPerMin: 0, avgKp: 0, avgVision: 0 }
  }
  const wins = matches.filter((m) => m.win).length
  const t = matches.reduce(
    (a, m) => {
      a.k += m.kills
      a.d += m.deaths
      a.a += m.assists
      a.cspm += m.csPerMin
      a.kp += m.kpPct
      a.vis += m.vision
      return a
    },
    { k: 0, d: 0, a: 0, cspm: 0, kp: 0, vis: 0 }
  )
  return {
    games,
    wins,
    winrate: Math.round((wins / games) * 1000) / 10,
    avgKda: Math.round(((t.k + t.a) / (t.d || 1)) * 100) / 100,
    avgCsPerMin: Math.round((t.cspm / games) * 10) / 10,
    avgKp: Math.round((t.kp / games) * 10) / 10,
    avgVision: Math.round((t.vis / games) * 10) / 10
  }
}

export interface ChampionStat {
  champion: string
  championId: number
  games: number
  wins: number
  winrate: number
  kda: number
  csPerMin: number
}

export function perChampion(matches: MatchRecord[]): ChampionStat[] {
  const map = new Map<string, MatchRecord[]>()
  for (const m of matches) {
    const arr = map.get(m.champion) ?? []
    arr.push(m)
    map.set(m.champion, arr)
  }
  const out: ChampionStat[] = []
  for (const [champion, ms] of map) {
    const wins = ms.filter((m) => m.win).length
    const k = ms.reduce((s, m) => s + m.kills, 0)
    const d = ms.reduce((s, m) => s + m.deaths, 0)
    const a = ms.reduce((s, m) => s + m.assists, 0)
    const cspm = ms.reduce((s, m) => s + m.csPerMin, 0) / ms.length
    out.push({
      champion,
      championId: ms[0].championId,
      games: ms.length,
      wins,
      winrate: Math.round((wins / ms.length) * 1000) / 10,
      kda: Math.round(((k + a) / (d || 1)) * 100) / 100,
      csPerMin: Math.round(cspm * 10) / 10
    })
  }
  return out.sort((x, y) => y.games - x.games)
}

// ---------- Export serialization ----------

export const SHEET_HEADER = [
  'Date',
  'Mode',
  'Champion',
  'Résultat',
  'K',
  'D',
  'A',
  'KDA',
  'CS',
  'CS/min',
  'KP %',
  'Vision',
  'Dégâts',
  'Or',
  'Durée (min)'
]

export function toRow(m: MatchRecord): (string | number)[] {
  const kda =
    m.deaths > 0 ? Math.round(((m.kills + m.assists) / m.deaths) * 100) / 100 : m.kills + m.assists
  return [
    new Date(m.playedAt).toISOString().slice(0, 16).replace('T', ' '),
    m.queueName,
    m.champion,
    m.win ? 'Victoire' : 'Défaite',
    m.kills,
    m.deaths,
    m.assists,
    kda,
    m.cs,
    m.csPerMin,
    m.kpPct,
    m.vision,
    m.damage,
    m.gold,
    Math.round(m.durationS / 60)
  ]
}

export function toCsv(matches: MatchRecord[]): string {
  const esc = (v: string | number): string => {
    const s = String(v)
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [SHEET_HEADER.map(esc).join(',')]
  for (const m of matches) lines.push(toRow(m).map(esc).join(','))
  return lines.join('\n')
}
