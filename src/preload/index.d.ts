import { ElectronAPI } from '@electron-toolkit/preload'
import type { Settings } from '../shared/types'

/**
 * The IPC contract. Every data shape it moves is declared once, in
 * src/shared/types.ts, and re-exported here so the renderer can keep importing
 * everything it needs from a single place.
 */
export type {
  MatchDetails,
  ScorePlayer,
  MatchRecord,
  DdragonInfo,
  SummonerProfile,
  TimelineEvent,
  LivePlayer,
  LiveGame,
  ScoutResult,
  ScoutDiag,
  MatchFilter,
  ReplayFile,
  ReplayStatus,
  Friend,
  LcuStatus,
  ExportStatus
} from '../shared/types'

// The renderer knows this shape as AppSettings; main calls it Settings.
export type AppSettings = Settings

export interface Api {
  getFriends(): Promise<Friend[]>
  onSettingsUpdated(cb: (s: AppSettings) => void): () => void
  getReplayStatus(): Promise<ReplayStatus>
  downloadEngine(): Promise<{ ok: boolean; error?: string }>
  removeEngine(): Promise<boolean>
  startVideo(): Promise<{ ok: boolean; error?: string; file?: string }>
  saveAudio(buf: Uint8Array): Promise<{ ok: boolean }>
  finishRecording(offsetMs: number): Promise<{ ok: boolean; file?: string }>
  getRecordingInfo(): Promise<{ recording: boolean; file: string; since: number }>
  onAutoRecord(cb: (action: 'start' | 'stop') => void): () => void
  getAudioDevices(): Promise<string[]>
  getEncoders(): Promise<{ available: string[]; auto: string }>
  audioStarted(ts: number): Promise<{ ok: boolean }>
  getReplayQuota(): Promise<{ usedBytes: number; limitBytes: number; files: number }>
  openLogs(): Promise<void>
  getLogsSize(): Promise<number>
  writeLog(level: string, scope: string, message: string, detail?: unknown): Promise<{ ok: boolean }>
  onReplaysPruned(cb: (names: string[]) => void): () => void
  onRecordingFailed(cb: (info: { reason: string; detail: string }) => void): () => void
  getWindows(): Promise<string[]>
  onRecordingState(
    cb: (info: { recording: boolean; file: string; since: number }) => void
  ): () => void
  onReplaysUpdated(cb: (list: ReplayFile[]) => void): () => void
  listReplays(): Promise<ReplayFile[]>
  pickReplayFolder(): Promise<string | null>
  openReplay(path: string): Promise<void>
  revealReplay(path: string): Promise<void>
  deleteReplay(path: string): Promise<boolean>
  onEngineProgress(cb: (p: { done: number; total: number }) => void): () => void
  checkUpdate(): Promise<{ updateAvailable: boolean; latest: string; url: string }>
  openExternal(url: string): Promise<void>
  validateRiotKey(key: string): Promise<{ ok: boolean; message: string }>
  getPlayerLive(
    gameName: string,
    tagLine: string
  ): Promise<{
    status: 'ok' | 'no-key' | 'not-found' | 'not-in-game'
    game?: LiveGame
    scout?: ScoutResult[]
  }>
  getPlayerProfile(
    gameName: string,
    tagLine: string
  ): Promise<{
    status: 'ok' | 'no-key' | 'not-found'
    summoner?: SummonerProfile
    matches?: MatchRecord[]
  }>
  getPlayerMatches(
    gameName: string,
    tagLine: string,
    start: number,
    count: number
  ): Promise<MatchRecord[]>
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
    players: { puuid: string; championImage: string; teamId?: number }[],
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
