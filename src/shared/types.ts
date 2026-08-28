/**
 * Data shapes shared by the main process, the preload bridge and the renderer.
 *
 * These used to be declared twice — once in main, once in preload/index.d.ts —
 * which meant TypeScript could not catch the two copies drifting apart: the IPC
 * contract would simply start lying while the build stayed green. Declaring
 * them once here makes that impossible.
 *
 * Keep this file free of imports from electron or any runtime module: it is
 * compiled into BOTH the node and the web projects.
 */

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
  keystone: number
  primaryStyle: number
  subStyle: number
  runes: number[]
  shards: number[]
}

export interface ScorePlayer {
  pid: number
  teamId: number
  name: string
  tagLine: string
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
  tagLine: string
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
  level?: number | null
  smurf?: boolean
  premadeGroup?: number
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

export interface MatchFilter {
  queueId: number | null
  champion: string | null
  result: 'win' | 'loss' | null
  sinceDays: number | null
}

export interface Settings {
  // Google Sheet export via an Apps Script web app URL (no login, no secret).
  scriptUrl: string | null
  // Optional shared secret the user can set in their script to lock the endpoint.
  exportToken: string | null
  autoExportOnGameEnd: boolean
  onlyNewOnExport: boolean
  // The filter applied when exporting (e.g. only Shyvana).
  exportFilter: MatchFilter
  // Enable/disable the lobby scouting (smurf/booster) features.
  scoutingEnabled: boolean
  // UI language.
  language: 'fr' | 'en'
  // Discord Rich Presence.
  discordEnabled: boolean
  // Optional personal Riot API key (dev 24h or production) to unlock winrate
  // and other-player lookups. Empty = fully keyless mode.
  riotApiKey: string
  // Close button hides the app to the system tray instead of quitting.
  closeToTray: boolean
  // Where recorded replays are stored ('' = default: Videos/Nightfury.gg).
  replayFolder: string
  // Recording quality.
  replayResolution: 720 | 1080 | 1440
  replayFps: 30 | 60
  // Video encoder. 'auto' picks the best GPU encoder actually available on
  // the machine, which both spares in-game FPS and starts ~10x faster than
  // libx264. Existing installs keep whatever they had.
  replayEncoder: 'auto' | 'cpu' | 'amd' | 'nvidia' | 'intel'
  // Capture method: 'windowed' (gdigrab) or 'fullscreen' (ddagrab, DirectX/fullscreen).
  replayCapture: 'windowed' | 'fullscreen' | 'window'
  // Title of the window to capture when replayCapture is 'window'.
  replayWindowTitle: string
  // Record game audio, and the dshow audio device to use ('' = auto-detect).
  replayAudio: boolean
  replayAudioDevice: string
  // Record the microphone too, and which input device.
  replayMic: boolean
  replayMicDevice: string
  // Capture volumes as a percentage (100 = original level).
  replayAudioVolume: number
  replayMicVolume: number
  // Audio sync offset in ms (+ = audio later) to align renderer audio with video.
  replayAudioOffsetMs: number
  // Cap on the disk space this app's own recordings may use, in GB.
  // 0 = unlimited. When exceeded, the oldest recordings are deleted first.
  replayMaxGb: number
  // Auto-record games detected by the client (manual otherwise).
  replayAuto: boolean
}

export interface ReplayFile {
  name: string
  path: string
  size: number
  mtime: number
}

export interface DdragonInfo {
  version: string
  champions: Record<number, string>
  champNames: Record<number, string>
  items: Record<number, { name: string; description: string }>
  spells: Record<number, string>
  spellInfo: Record<number, { name: string; desc: string }>
  runes: Record<number, { icon: string; name: string; desc: string }>
  runeStyles: Record<number, { icon: string; name: string }>
}

export interface ReplayStatus {
  installed: boolean
  folder: string
  replays: ReplayFile[]
}

export type ExportStatus =
  | { state: 'syncing' }
  | { state: 'ok'; added: number }
  | { state: 'error'; message: string }
