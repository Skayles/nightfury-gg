import https from 'https'
import {
  authenticate,
  createHttp1Request,
  createWebSocketConnection,
  Credentials,
  LeagueWebSocket
} from 'league-connect'
import {
  parseGame,
  MatchRecord,
  TimelineEvent,
  LiveGame,
  ScoutResult,
  ScoutDiag,
  Friend,
  setQueueNames
} from './stats'
import { championImageFromLive, ddragonInfo } from './ddragon'

type SgpCtx = {
  sessionToken: string
  rsoToken: string
  base: string
  region: string
  hosts: string[]
}
type StatusListener = (status: LcuStatus) => void
type MatchesListener = (records: MatchRecord[], reason: 'backfill' | 'game-end') => void
type SkipIdsProvider = () => Set<number>
type ProfileListener = (profile: SummonerProfile) => void

export interface SummonerProfile {
  gameName: string
  tagLine: string
  profileIconId: number
  summonerLevel: number
  rankedTier: string | null
  rankedDivision: string | null
  rankedLp: number | null
  rankedWins: number | null
  rankedLosses: number | null
  flexTier: string | null
  flexDivision: string | null
  flexLp: number | null
  flexWins: number | null
  flexLosses: number | null
  region: string
}

export type LcuStatus =
  | { state: 'disconnected' }
  | { state: 'connecting' }
  | { state: 'connected'; summoner: string }
  | { state: 'in-game' }
  | { state: 'error'; message: string }

export class LcuService {
  private creds: Credentials | null = null
  private ws: LeagueWebSocket | null = null
  private puuid: string | null = null
  private summonerName = 'Invocateur'
  private lastPhase = ''
  private statusCb: StatusListener
  private matchesCb: MatchesListener
  private skipIds: SkipIdsProvider
  private profileCb: ProfileListener
  private queuesCb: () => void

  constructor(
    statusCb: StatusListener,
    matchesCb: MatchesListener,
    skipIds: SkipIdsProvider,
    profileCb: ProfileListener,
    queuesCb: () => void = () => {}
  ) {
    this.statusCb = statusCb
    this.matchesCb = matchesCb
    this.skipIds = skipIds
    this.profileCb = profileCb
    this.queuesCb = queuesCb
  }

  /** Blocks until the League client is running, then wires everything up. */
  async connect(): Promise<void> {
    this.statusCb({ state: 'connecting' })
    try {
      this.creds = await authenticate({ awaitConnection: true, pollInterval: 2500 })
      const summoner = await this.request<any>(
        'GET',
        '/lol-summoner/v1/current-summoner'
      )
      this.puuid = summoner?.puuid ?? null
      this.summonerName = summoner?.gameName ?? summoner?.displayName ?? 'Invocateur'
      this.statusCb({ state: 'connected', summoner: this.summonerName })

      // Ranked (Solo/Duo) for the profile header — best effort.
      let tier: string | null = null
      let division: string | null = null
      let lp: number | null = null
      let wins: number | null = null
      let losses: number | null = null
      let flexTier: string | null = null
      let flexDivision: string | null = null
      let flexLp: number | null = null
      let flexWins: number | null = null
      let flexLosses: number | null = null
      try {
        const rs = await this.request<any>('GET', '/lol-ranked/v1/current-ranked-stats')
        const solo = rs?.queueMap?.RANKED_SOLO_5x5
        if (solo && solo.tier) {
          tier = solo.tier
          division = solo.division ?? null
          lp = typeof solo.leaguePoints === 'number' ? solo.leaguePoints : null
          wins = typeof solo.wins === 'number' ? solo.wins : null
          losses = typeof solo.losses === 'number' ? solo.losses : null
        }
        const flex = rs?.queueMap?.RANKED_FLEX_SR
        if (flex && flex.tier) {
          flexTier = flex.tier
          flexDivision = flex.division ?? null
          flexLp = typeof flex.leaguePoints === 'number' ? flex.leaguePoints : null
          flexWins = typeof flex.wins === 'number' ? flex.wins : null
          flexLosses = typeof flex.losses === 'number' ? flex.losses : null
        }
      } catch {
        /* rank optional */
      }

      let region = ''
      try {
        const rl = await this.request<any>('GET', '/riotclient/region-locale')
        region = String(rl?.region || '').toLowerCase()
      } catch {
        /* region optional */
      }

      // Queue names straight from the client — covers event queues (Mayhem, etc.)
      // that aren't in any static list.
      try {
        const qs = await this.request<any[]>('GET', '/lol-game-queues/v1/queues')
        if (Array.isArray(qs)) {
          const m: Record<number, string> = {}
          for (const q of qs) {
            const nm = String(q?.name || q?.shortName || q?.description || '').trim()
            if (q?.id != null && nm) m[q.id] = nm
          }
          setQueueNames(m)
          this.queuesCb()
        }
      } catch {
        /* keep static fallback names */
      }

      this.profileCb({
        gameName: summoner?.gameName ?? summoner?.displayName ?? 'Invocateur',
        tagLine: summoner?.tagLine ?? '',
        profileIconId: summoner?.profileIconId ?? 0,
        summonerLevel: summoner?.summonerLevel ?? 0,
        rankedTier: tier,
        rankedDivision: division,
        rankedLp: lp,
        rankedWins: wins,
        rankedLosses: losses,
        flexTier,
        flexDivision,
        flexLp,
        flexWins,
        flexLosses,
        region
      })

      // Initial backfill of recent history.
      await this.refreshHistory('backfill')

      // Live end-of-game detection.
      await this.openSocket()

      // If a game is ALREADY in progress when we start, the socket won't fire an
      // initial event — check the current phase once so live tracking works.
      try {
        const phase = await this.request<any>('GET', '/lol-gameflow/v1/gameflow-phase')
        const p = String(phase)
        this.lastPhase = p
        if (p === 'InProgress') this.statusCb({ state: 'in-game' })
      } catch {
        /* ignore */
      }
    } catch (e: any) {
      this.statusCb({ state: 'error', message: e?.message ?? String(e) })
      // Retry after a delay — the client may just not be open yet.
      setTimeout(() => this.connect(), 8000)
    }
  }

  private async openSocket(): Promise<void> {
    this.ws = await createWebSocketConnection({
      authenticationOptions: { awaitConnection: true },
      pollInterval: 2500,
      maxRetries: 20
    })
    this.ws.subscribe('/lol-gameflow/v1/gameflow-phase', (phase: any) => {
      const p = String(phase)
      if (p === 'InProgress') {
        this.statusCb({ state: 'in-game' })
      } else if (this.lastPhase === 'InProgress') {
        // Just left a game → back in the client.
        this.statusCb({ state: 'connected', summoner: this.summonerName })
      }
      // EndOfGame (SR) / WaitingForStats (ARAM etc.) both signal a finished game.
      if (
        (p === 'EndOfGame' || p === 'WaitingForStats' || p === 'PreEndOfGame') &&
        this.lastPhase !== p
      ) {
        // History takes a few seconds to populate after the game ends.
        setTimeout(() => this.refreshHistory('game-end'), 6000)
      }
      this.lastPhase = p
    })
  }

  // How deep to go when backfilling (the LCU serves ~20 games per request, and
  // only keeps a limited recent window — a few hundred at most).
  private static PAGE = 20
  private static MAX_BACKFILL = 300

  async refreshHistory(reason: 'backfill' | 'game-end'): Promise<MatchRecord[]> {
    if (!this.puuid) return []

    const maxGames = reason === 'game-end' ? LcuService.PAGE : LcuService.MAX_BACKFILL

    // 1) Page through the summary list to enumerate the games.
    const summaries: any[] = []
    for (let beg = 0; beg < maxGames; beg += LcuService.PAGE) {
      const end = beg + LcuService.PAGE - 1
      const data = await this.request<any>(
        'GET',
        `/lol-match-history/v1/products/lol/current-summoner/matches?begIndex=${beg}&endIndex=${end}`
      )
      const games: any[] = data?.games?.games ?? []
      summaries.push(...games)
      if (games.length < LcuService.PAGE) break
    }

    // 2) For each game we don't already have correct data for, fetch the FULL
    //    game detail — the summary list only fully populates the current
    //    summoner's stats, so team totals (and thus KP) are wrong from it.
    const skip = this.skipIds()
    const wanted = summaries.filter((g) => !(typeof g.gameId === 'number' && skip.has(g.gameId)))

    // A schema bump re-fetches every stored game — up to 300 details, which one
    // at a time made the first launch crawl. The client is local, so a handful
    // of concurrent requests is comfortable.
    const fetched = await mapPool(wanted, 6, async (g) => {
      let parsed: MatchRecord | null = null
      try {
        const detail = await this.request<any>('GET', `/lol-match-history/v1/games/${g.gameId}`)
        parsed = parseGame(detail, this.puuid as string)
      } catch {
        /* detail unavailable → fall back to the summary object */
      }
      return parsed ?? parseGame(g, this.puuid as string)
    })
    const records: MatchRecord[] = fetched.filter((r): r is MatchRecord => r !== null)

    this.matchesCb(records, reason)
    return records
  }

  /** Current gameflow phase, or null when the client cannot be reached. */
  async gameflowPhase(): Promise<string | null> {
    if (!this.creds) return null
    try {
      const p = await this.request<any>('GET', '/lol-gameflow/v1/gameflow-phase')
      return String(p)
    } catch {
      return null
    }
  }

  /** Champion id the current player is on in the live game (0 if unknown). */
  async currentChampionId(): Promise<number> {
    if (!this.creds || !this.puuid) return 0
    try {
      const data = await this.request<any>('GET', '/lol-gameflow/v1/session')
      const gd = data?.gameData
      if (!gd) return 0
      const all = [...(gd.teamOne ?? []), ...(gd.teamTwo ?? [])]
      const me = all.find((p: any) => p?.puuid && p.puuid === this.puuid)
      return me?.championId || 0
    } catch {
      return 0
    }
  }

  /** The 10 players of the current game (name + champion + puuid), from the
   *  in-game Live Client Data API merged with the LCU gameflow (for puuids). */
  async fetchLiveGame(): Promise<LiveGame | null> {
    const players = await liveClientGet('/liveclientdata/playerlist')
    if (!Array.isArray(players) || !players.length) return null

    // Gameflow gives puuids + championIds + queue (names are empty there).
    let gd: any = null
    try {
      const gf = await this.request<any>('GET', '/lol-gameflow/v1/session')
      gd = gf?.gameData
    } catch {
      /* ignore */
    }
    const queueId = gd?.queue?.id ?? gd?.queueId ?? 0
    const champById = ddragonInfo().champions
    // Keyed per side: in a mirror matchup (same champion on both teams) a single
    // map would collapse to one puuid and mis-assign one player's scout data.
    const puuidByImage: Record<'ORDER' | 'CHAOS', Map<string, string>> = {
      ORDER: new Map(),
      CHAOS: new Map()
    }
    const index = (list: any[], side: 'ORDER' | 'CHAOS'): void => {
      for (const p of list ?? []) {
        const img = champById[p.championId]
        if (img && p.puuid) puuidByImage[side].set(img, p.puuid)
      }
    }
    index(gd?.teamOne ?? [], 'ORDER')
    index(gd?.teamTwo ?? [], 'CHAOS')

    const map = (side: 'ORDER' | 'CHAOS') => (p: any): any => {
      const championImage = championImageFromLive(p.championName, p.rawChampionName)
      return {
        name: p.riotIdGameName || p.summonerName || p.riotId || '',
        tagLine: p.riotIdTagLine || (p.riotId ? String(p.riotId).split('#')[1] : '') || '',
        championImage,
        championName: p.championName || '',
        skinId: Number(p.skinID ?? p.skinId ?? 0),
        puuid: puuidByImage[side].get(championImage) || ''
      }
    }
    const teamOne = players.filter((p: any) => p.team === 'ORDER').map(map('ORDER'))
    const teamTwo = players.filter((p: any) => p.team === 'CHAOS').map(map('CHAOS'))
    if (!teamOne.length && !teamTwo.length) return null
    return { teamOne, teamTwo, queueId }
  }

  // ---------- Keyless scouting via the SGP (client session token) ----------

  private sgpCtx: SgpCtx | null = null

  private async buildSgpContext(): Promise<{ ctx: SgpCtx | null; diag: ScoutDiag }> {
    const diag: ScoutDiag = {
      ok: false,
      tokenFound: false,
      baseFound: false,
      historyOk: false,
      base: '',
      region: '',
      error: '',
      sample: ''
    }
    // 1) tokens — ranked (ledge) uses the league-session JWT; match history
    //    (match-history-query) uses the RSO access token. Get both.
    let sessionToken = ''
    try {
      const t = await this.request<any>('GET', '/lol-league-session/v1/league-session-token')
      sessionToken = typeof t === 'string' ? t : t?.token || ''
    } catch {
      /* ignore */
    }
    let rsoToken = ''
    try {
      const t = await this.request<any>('GET', '/lol-rso-auth/v1/authorization/access-token')
      rsoToken = t?.token || ''
    } catch {
      /* ignore */
    }
    if (!rsoToken) {
      try {
        const t = await this.request<any>('GET', '/entitlements/v1/token')
        rsoToken = t?.accessToken || ''
      } catch {
        /* ignore */
      }
    }
    diag.tokenFound = Boolean(sessionToken || rsoToken)

    // 2) region
    let region = ''
    try {
      const rl = await this.request<any>('GET', '/riotclient/region-locale')
      region = (rl?.region || '').toUpperCase()
    } catch {
      /* ignore */
    }
    diag.region = region

    // 3) SGP base — discover from platform config, else construct from region.
    let base = ''
    let hosts: string[] = []
    try {
      const cfg = await this.request<any>('GET', '/lol-platform-config/v1/namespaces')
      base = findSgpBase(cfg)
      hosts = findAllSgpHosts(cfg)
    } catch {
      /* ignore */
    }
    if (!base) base = sgpBaseFromRegion(region)
    diag.base = base
    diag.baseFound = Boolean(base)

    if ((!sessionToken && !rsoToken) || !base) {
      diag.error = !sessionToken && !rsoToken ? 'token introuvable' : 'serveur SGP introuvable'
      this.sgpCtx = null
      return { ctx: null, diag }
    }
    diag.ok = true
    this.sgpCtx = { sessionToken, rsoToken, base, region, hosts }
    return { ctx: this.sgpCtx, diag }
  }

  async scoutPlayers(
    inputs: { puuid: string; championId: number }[],
    queueId: number
  ): Promise<{ results: ScoutResult[]; diag: ScoutDiag }> {
    const { ctx, diag } = await this.buildSgpContext()
    if (!ctx) return { results: [], diag }

    let rawOk = false
    let sampleMh: any = null
    const ppBase = ctx.base.replace('.lol.sgp.pvp.net', '.pp.sgp.pvp.net')
    const mhProbe: { label: string; status: number; body?: string }[] = []
    let mhCombo: { base: string; token: string; label: string } | null = null

    const mhPath = (puuid: string): string =>
      `/match-history-query/v1/products/lol/player/${puuid}/SUMMONER?startIndex=0&count=20`

    const valid = inputs.filter((i) => i.puuid)
    const blank = (puuid: string): ScoutResult => ({
      puuid,
      rankTier: null,
      rankDivision: null,
      rankLp: null,
      winrate: null,
      games: null,
      champGames: null,
      champWinrate: null
    })

    /** Ranked tier/division/LP for one player, from the ledge host. */
    const fetchRanked = async (puuid: string): Promise<Partial<ScoutResult>> => {
      try {
        const r = await sgpGet(ctx.base, `/leagues-ledge/v2/rankedStats/puuid/${puuid}`, ctx.sessionToken)
        if (r) rawOk = true
        const arr: any[] = Array.isArray(r) ? r : (r?.queues ?? r?.queueMap ?? [])
        const list = Array.isArray(arr) ? arr : Object.values(arr)
        const solo = list.find(
          (q: any) => q?.queueType === 'RANKED_SOLO_5x5' || q?.queue === 'RANKED_SOLO_5x5'
        )
        if (!solo?.tier) return {}
        return {
          rankTier: solo.tier,
          rankDivision: solo.rank ?? solo.division ?? null,
          rankLp:
            typeof solo.leaguePoints === 'number'
              ? solo.leaguePoints
              : typeof solo.lp === 'number'
                ? solo.lp
                : null
        }
      } catch {
        return {}
      }
    }

    /** Winrate + per-champion record, read out of one match-history payload. */
    const readHistory = (
      mh: any,
      inp: { puuid: string; championId: number }
    ): Partial<ScoutResult> => {
      const games: any[] =
        mh?.games?.games ?? mh?.games ?? mh?.matches ?? (Array.isArray(mh) ? mh : [])
      const rankedQueues = new Set([420, 440])
      const filterToRanked = rankedQueues.has(queueId)
      let w = 0
      let g = 0
      let cw = 0
      let cg = 0
      for (const gm of games) {
        // SGP stores the flat match under `.json`; match-v5 nests under `.info`.
        const info = gm?.json ?? gm?.info ?? gm
        if (!info) continue
        const q = info.queueId ?? info.queue ?? 0
        // In a ranked game, only count ranked history; otherwise count all.
        if (filterToRanked && !rankedQueues.has(q)) continue
        let parts: any[] = info.participants ?? []
        // Legacy shape: puuid lives in participantIdentities.
        if (parts.length && parts[0] && parts[0].puuid === undefined && info.participantIdentities) {
          const idOf = new Map<number, string>()
          for (const pi of info.participantIdentities)
            if (pi?.player?.puuid) idOf.set(pi.participantId, pi.player.puuid)
          parts = parts.map((p: any) => ({ ...p, puuid: idOf.get(p.participantId) }))
        }
        const me = parts.find((p: any) => p.puuid === inp.puuid)
        if (!me) continue
        const win = me.win ?? me.stats?.win ?? false
        const champId = me.championId ?? me.stats?.championId ?? 0
        g++
        if (win) w++
        if (inp.championId && champId === inp.championId) {
          cg++
          if (win) cw++
        }
      }
      const out: Partial<ScoutResult> = {}
      if (g > 0) {
        out.games = g
        out.winrate = Math.round((w / g) * 100)
      }
      if (cg > 0) {
        out.champGames = cg
        out.champWinrate = Math.round((cw / cg) * 100)
      }
      return out
    }

    // Ranked is a plain per-player GET, so fire all ten at once.
    const rankedAll = await Promise.all(valid.map((i) => fetchRanked(i.puuid)))

    // Match history is different: we first have to discover which host/token
    // pair actually answers. That probe walks a matrix of combinations and must
    // stay sequential — running it for every player would multiply it by ten.
    // So: probe on the first player, then fetch the rest in parallel.
    let firstMh: any = null
    if (valid.length) {
      const hostSet = Array.from(new Set([ctx.base, ppBase, ...ctx.hosts]))
      const combos: { label: string; base: string; token: string }[] = []
      for (const h of hostSet) {
        if (ctx.rsoToken) combos.push({ label: `${h} | rso`, base: h, token: ctx.rsoToken })
        if (ctx.sessionToken) combos.push({ label: `${h} | session`, base: h, token: ctx.sessionToken })
      }
      for (const c of combos) {
        const raw = await httpsGetRaw(c.base + mhPath(valid[0].puuid), {
          Authorization: `Bearer ${c.token}`,
          Accept: 'application/json'
        })
        mhProbe.push({
          label: c.label,
          status: raw.status,
          body: raw.status === 200 ? undefined : (raw.text || '').slice(0, 80)
        })
        if (raw.status === 200 && raw.json && !isSgpError(raw.json)) {
          mhCombo = { base: c.base, token: c.token, label: c.label }
          firstMh = raw.json
          break
        }
      }
    }

    const combo = mhCombo
    const restMh = combo
      ? await Promise.all(
          valid
            .slice(1)
            .map((i) => sgpGet(combo.base, mhPath(i.puuid), combo.token).catch(() => null))
        )
      : valid.slice(1).map(() => null)

    const results: ScoutResult[] = valid.map((inp, i) => {
      let mh = i === 0 ? firstMh : restMh[i - 1]
      if (isSgpError(mh)) mh = null
      if (mh) {
        rawOk = true
        if (!sampleMh) sampleMh = mh
      }
      return { ...blank(inp.puuid), ...rankedAll[i], ...(mh ? readHistory(mh, inp) : {}) }
    })

    const gotRank = results.some((r) => r.rankTier !== null)
    const gotGames = results.some((r) => r.games !== null)
    diag.ok = gotRank || gotGames
    diag.historyOk = gotGames
    if (!gotGames) {
      try {
        diag.sample = JSON.stringify({
          hosts: this.sgpCtx?.hosts ?? [],
          mhProbe,
          rankedOk: gotRank,
          matchHistory: sampleMh
        }).slice(0, 6000)
      } catch {
        diag.sample = ''
      }
      if (!diag.error) {
        diag.error = rawOk
          ? 'historique reçu mais non lu (format à ajuster)'
          : 'historique : aucune réponse du serveur'
      }
      console.log('[scout] match-history probe:', diag.sample)
    }
    return { results, diag }
  }

  /** Item purchase order (reconciled with undos) for one game + participant. */
  /** The current player's Riot friends list (keyless, from the LCU chat). */
  async fetchFriends(): Promise<Friend[]> {
    if (!this.creds) return []
    let list: any
    try {
      list = await this.request<any>('GET', '/lol-chat/v1/friends')
    } catch {
      return []
    }
    if (!Array.isArray(list)) return []
    return list.map((f: any): Friend => {
      let lol: any = f.lol
      if (typeof lol === 'string') {
        try {
          lol = JSON.parse(lol)
        } catch {
          lol = {}
        }
      }
      lol = lol || {}
      const product = String(f.productId || '').toLowerCase()
      const avail = String(f.availability || 'offline')
      let game = 'other'
      if (avail === 'offline') game = 'offline'
      else if (product.includes('valorant')) game = 'valorant'
      else if (product === 'bacon' || product.includes('runeterra')) game = 'lor'
      else if (product.includes('wildrift') || product.includes('wild_rift')) game = 'wildrift'
      else if (product.includes('league') || product === 'lol') {
        const mode = String(lol.gameMode || '')
        const q = Number(lol.queueId || 0)
        game = mode === 'TFT' || (q >= 1090 && q <= 1200) ? 'tft' : 'lol'
      }
      return {
        id: String(f.puuid || f.summonerId || f.id || f.name || Math.random()),
        name: f.gameName || f.name || '',
        tagLine: f.gameTag || '',
        iconId: Number(f.icon || 0),
        availability: avail,
        game,
        status: String(lol.gameStatus || ''),
        championId: Number(lol.championId || 0),
        note: String(f.statusMessage || f.note || '')
      }
    })
  }

  /** Highlight events (kills, objectives, buildings) of a game, from the LCU
   *  timeline. Item purchases aren't included by the client, so we surface the
   *  game's key moments instead. */
  async fetchTimeline(gameId: number): Promise<TimelineEvent[]> {
    if (!this.creds) return []
    let data: any
    try {
      data = await this.request<any>('GET', `/lol-match-history/v1/game-timelines/${gameId}`)
    } catch {
      return []
    }
    const frames: any[] = data?.frames ?? data?.info?.frames ?? []
    const events: any[] = []
    for (const f of frames) for (const e of f.events ?? []) events.push(e)
    events.sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0))

    const out: TimelineEvent[] = []
    let firstKill = true
    for (const e of events) {
      const t = e.timestamp ?? 0
      if (e.type === 'CHAMPION_KILL') {
        out.push({
          t,
          kind: 'kill',
          killerId: e.killerId ?? 0,
          victimId: e.victimId ?? 0,
          assists: e.assistingParticipantIds ?? [],
          firstBlood: firstKill
        })
        firstKill = false
      } else if (e.type === 'ELITE_MONSTER_KILL') {
        out.push({
          t,
          kind: 'monster',
          killerId: e.killerId ?? 0,
          monster: e.monsterType || '',
          subType: e.monsterSubType || ''
        })
      } else if (e.type === 'BUILDING_KILL') {
        out.push({
          t,
          kind: 'building',
          killerId: e.killerId ?? 0,
          building: e.buildingType || '',
          lane: e.laneType || '',
          teamId: e.teamId ?? 0
        })
      }
    }
    return out
  }

  private async request<T>(method: string, url: string): Promise<T> {
    if (!this.creds) throw new Error('LCU not authenticated')
    const res = await createHttp1Request({ method, url } as any, this.creds)
    // league-connect returns an object exposing .json()
    return (await (res as any).json()) as T
  }

  close(): void {
    try {
      this.ws?.close()
    } catch {
      /* noop */
    }
  }
}

/**
 * Run an async mapper over items with a bounded number of requests in flight.
 * Results keep the input order, which matters for chronological match lists.
 * Bounded rather than Promise.all: a full page is 20+ calls and a development
 * key is capped at 20 requests/second.
 */
async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  const worker = async (): Promise<void> => {
    for (;;) {
      const i = next++
      if (i >= items.length) return
      out[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

/** GET the local in-game Live Client Data API (self-signed cert on port 2999). */
function liveClientGet(path: string): Promise<any> {
  return new Promise((resolve) => {
    const req = https.request(
      { host: '127.0.0.1', port: 2999, path, method: 'GET', rejectUnauthorized: false, timeout: 2000 },
      (res) => {
        let body = ''
        res.on('data', (c) => (body += c))
        res.on('end', () => {
          try {
            resolve(JSON.parse(body))
          } catch {
            resolve(null)
          }
        })
      }
    )
    req.on('error', () => resolve(null))
    req.on('timeout', () => {
      req.destroy()
      resolve(null)
    })
    req.end()
  })
}

/**
 * External HTTPS GET returning status + parsed JSON + raw text snippet.
 *
 * Certificate verification stays ON here, unlike liveClientGet(): these calls go
 * to Riot's public SGP servers and carry the user's league-session / RSO bearer
 * token in an Authorization header. Accepting any certificate would let anyone
 * positioned in the middle (proxy, hostile Wi-Fi) lift that token.
 */
function httpsGetRaw(
  url: string,
  headers: Record<string, string>
): Promise<{ status: number; json: any; text: string }> {
  return new Promise((resolve) => {
    let u: URL
    try {
      u = new URL(url)
    } catch {
      resolve({ status: 0, json: null, text: '' })
      return
    }
    const req = https.request(
      {
        host: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        method: 'GET',
        headers,
        timeout: 6000
      },
      (res) => {
        let body = ''
        res.on('data', (c) => (body += c))
        res.on('end', () => {
          let json: any = null
          try {
            json = JSON.parse(body)
          } catch {
            json = null
          }
          resolve({ status: res.statusCode || 0, json, text: body.slice(0, 300) })
        })
      }
    )
    req.on('error', () => resolve({ status: 0, json: null, text: '' }))
    req.on('timeout', () => {
      req.destroy()
      resolve({ status: 0, json: null, text: '' })
    })
    req.end()
  })
}

/** External HTTPS GET returning parsed JSON (used for the SGP servers). */
function httpsGetJson(url: string, headers: Record<string, string>): Promise<any> {
  return httpsGetRaw(url, headers).then((r) => r.json)
}

function sgpGet(base: string, path: string, token: string): Promise<any> {
  return httpsGetJson(base + path, { Authorization: `Bearer ${token}`, Accept: 'application/json' })
}

/** True when an SGP response is a Riot error body ({ status: { status_code } }). */
function isSgpError(r: any): boolean {
  return Boolean(r && r.status && typeof r.status.status_code === 'number')
}

/** Deep-scan a config object for a URL whose host is on the SGP network. */
function findSgpBase(cfg: any): string {
  let found = ''
  const visit = (v: any): void => {
    if (found) return
    if (typeof v === 'string') {
      const m = v.match(/https?:\/\/[^"'\s]*sgp\.pvp\.net/i)
      if (m) {
        try {
          found = new URL(m[0]).origin
        } catch {
          /* ignore */
        }
      }
    } else if (v && typeof v === 'object') {
      for (const k of Object.keys(v)) visit(v[k])
    }
  }
  visit(cfg)
  return found
}

/** Deep-scan for ALL distinct SGP / player-platform host origins in the config. */
function findAllSgpHosts(cfg: any): string[] {
  const set = new Set<string>()
  const visit = (v: any): void => {
    if (typeof v === 'string') {
      const rx = /https?:\/\/[^"'\s]*(?:sgp\.pvp\.net|pp\.riotgames\.com)[^"'\s]*/gi
      const matches = v.match(rx)
      if (matches) {
        for (const m of matches) {
          try {
            set.add(new URL(m).origin)
          } catch {
            /* ignore */
          }
        }
      }
    } else if (v && typeof v === 'object') {
      for (const k of Object.keys(v)) visit(v[k])
    }
  }
  visit(cfg)
  return Array.from(set).slice(0, 12)
}

const REGION_TO_SGP: Record<string, string> = {
  EUW: 'euw1',
  EUNE: 'eun1',
  NA: 'na1',
  BR: 'br1',
  LAN: 'la1',
  LAS: 'la2',
  OCE: 'oc1',
  TR: 'tr1',
  RU: 'ru',
  JP: 'jp1',
  KR: 'kr',
  PH: 'ph2',
  SG: 'sg2',
  TH: 'th2',
  TW: 'tw2',
  VN: 'vn2'
}

function sgpBaseFromRegion(region: string): string {
  const id = REGION_TO_SGP[region]
  return id ? `https://${id}-red.pp.sgp.pvp.net` : ''
}
