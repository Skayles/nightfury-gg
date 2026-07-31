import { ElectronAPI } from '@electron-toolkit/preload'

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

export interface DdragonInfo {
  version: string
  champions: Record<number, string>
  champNames: Record<number, string>
  items: Record<number, { name: string; description: string }>
}

export interface SummonerProfile {
  gameName: string
  tagLine: string
  profileIconId: number
  summonerLevel: number
  rankedTier: string | null
  rankedDivision: string | null
  rankedLp: number | null
  region: string
}

export interface ItemPurchase {
  itemId: number
  timestamp: number
}

export interface TimelineEvent {
  t: number
  kind: 'kill' | 'monster' | 'building'
  killerId: number
  victimId?: number
  assists?: number[]
  monster?: string
  subType?: string
  building?: string
  lane?: string
  teamId?: number
  firstBlood?: boolean
}

export interface LivePlayer {
  name: string
  championImage: string
  championName: string
  skinId: number
  puuid: string
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

export interface MatchFilter {
  queueId: number | null
  champion: string | null
  result: 'win' | 'loss' | null
  sinceDays: number | null
}

export interface AppSettings {
  scriptUrl: string | null
  exportToken: string | null
  autoExportOnGameEnd: boolean
  onlyNewOnExport: boolean
  exportFilter: MatchFilter
  scoutingEnabled: boolean
  language: 'fr' | 'en'
  discordEnabled: boolean
}

export type LcuStatus =
  | { state: 'disconnected' }
  | { state: 'connecting' }
  | { state: 'connected'; summoner: string }
  | { state: 'in-game' }
  | { state: 'error'; message: string }

export type ExportStatus =
  | { state: 'syncing' }
  | { state: 'ok'; added: number }
  | { state: 'error'; message: string }

export interface Friend {
  id: string
  name: string
  tagLine: string
  iconId: number
  availability: string
  game: string
  status: string
  championId: number
  note: string
}

export interface Api {
  getFriends(): Promise<Friend[]>
  checkUpdate(): Promise<{ updateAvailable: boolean; latest: string; url: string }>
  openExternal(url: string): Promise<void>
  listMatches(): Promise<MatchRecord[]>
  allMatches(): Promise<MatchRecord[]>
  refreshMatches(): Promise<MatchRecord[]>
  resetHistory(): Promise<MatchRecord[]>
  getStorageInfo(): Promise<{ count: number; bytes: number }>
  pruneHistory(): Promise<{ removed: number; count: number; bytes: number }>
  getSettings(): Promise<AppSettings>
  setSettings(patch: Partial<AppSettings>): Promise<AppSettings>
  getDdragonInfo(): Promise<DdragonInfo>
  onDdragonUpdated(cb: (info: DdragonInfo) => void): () => void
  getSummoner(): Promise<SummonerProfile | null>
  getLcuStatus(): Promise<LcuStatus>
  onSummonerUpdated(cb: (p: SummonerProfile) => void): () => void
  getMatchTimeline(gameId: number): Promise<TimelineEvent[]>
  getLiveGame(): Promise<LiveGame | null>
  scoutLiveGame(
    players: { puuid: string; championImage: string }[],
    queueId: number
  ): Promise<{ results: ScoutResult[]; diag: ScoutDiag }>
  exportRun(): Promise<{ added: number }>
  exportPreview(): Promise<number>
  exportCsv(): Promise<{ saved: boolean; reason?: string; filePath?: string; count?: number }>
  onLcuStatus(cb: (s: LcuStatus) => void): () => void
  onMatchesUpdated(cb: (m: MatchRecord[]) => void): () => void
  onExportStatus(cb: (s: ExportStatus) => void): () => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: Api
  }
}
