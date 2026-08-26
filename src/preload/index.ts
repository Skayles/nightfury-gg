import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  listMatches: () => ipcRenderer.invoke('matches:list'),
  allMatches: () => ipcRenderer.invoke('matches:all'),
  refreshMatches: () => ipcRenderer.invoke('matches:refresh'),
  resetHistory: () => ipcRenderer.invoke('history:reset'),
  getStorageInfo: () => ipcRenderer.invoke('history:info'),
  pruneHistory: () => ipcRenderer.invoke('history:prune'),

  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch: Record<string, unknown>) => ipcRenderer.invoke('settings:set', patch),
  onSettingsUpdated: (cb: (s: unknown) => void) => {
    const h = (_e: unknown, s: unknown): void => cb(s)
    ipcRenderer.on('settings:updated', h)
    return () => ipcRenderer.removeListener('settings:updated', h)
  },

  getReplayStatus: () => ipcRenderer.invoke('replay:status'),
  downloadEngine: () => ipcRenderer.invoke('replay:download-engine'),
  removeEngine: () => ipcRenderer.invoke('replay:remove-engine'),
  startVideo: () => ipcRenderer.invoke('replay:start-video'),
  saveAudio: (buf: Uint8Array) => ipcRenderer.invoke('replay:save-audio', buf),
  finishRecording: (offsetMs: number) => ipcRenderer.invoke('replay:finish', offsetMs),
  getRecordingInfo: () => ipcRenderer.invoke('replay:recording-info'),
  onAutoRecord: (cb: (action: 'start' | 'stop') => void) => {
    const h = (_e: unknown, p: { action: 'start' | 'stop' }): void => cb(p.action)
    ipcRenderer.on('replay:auto', h)
    return () => ipcRenderer.removeListener('replay:auto', h)
  },
  getAudioDevices: () => ipcRenderer.invoke('replay:audio-devices'),
  getEncoders: () => ipcRenderer.invoke('replay:encoders'),
  getReplayQuota: () => ipcRenderer.invoke('replay:quota'),
  onReplaysPruned: (cb: (names: string[]) => void) => {
    const h = (_e: unknown, names: string[]): void => cb(names)
    ipcRenderer.on('replay:pruned', h)
    return () => ipcRenderer.removeListener('replay:pruned', h)
  },
  onRecordingFailed: (cb: (info: { reason: string; detail: string }) => void) => {
    const h = (_e: unknown, info: { reason: string; detail: string }): void => cb(info)
    ipcRenderer.on('replay:failed', h)
    return () => ipcRenderer.removeListener('replay:failed', h)
  },
  getWindows: () => ipcRenderer.invoke('replay:windows'),
  onRecordingState: (cb: (info: { recording: boolean; file: string; since: number }) => void) => {
    const h = (_e: unknown, info: { recording: boolean; file: string; since: number }): void =>
      cb(info)
    ipcRenderer.on('replay:recording-state', h)
    return () => ipcRenderer.removeListener('replay:recording-state', h)
  },
  onReplaysUpdated: (cb: (list: unknown) => void) => {
    const h = (_e: unknown, list: unknown): void => cb(list)
    ipcRenderer.on('replay:updated', h)
    return () => ipcRenderer.removeListener('replay:updated', h)
  },
  listReplays: () => ipcRenderer.invoke('replay:list'),
  pickReplayFolder: () => ipcRenderer.invoke('replay:pick-folder'),
  openReplay: (path: string) => ipcRenderer.invoke('replay:open', path),
  revealReplay: (path: string) => ipcRenderer.invoke('replay:reveal', path),
  deleteReplay: (path: string) => ipcRenderer.invoke('replay:delete', path),
  onEngineProgress: (cb: (p: { done: number; total: number }) => void) => {
    const h = (_e: unknown, p: { done: number; total: number }): void => cb(p)
    ipcRenderer.on('replay:download-progress', h)
    return () => ipcRenderer.removeListener('replay:download-progress', h)
  },
  getDdragonInfo: () => ipcRenderer.invoke('ddragon:info'),
  onDdragonUpdated: (cb: (info: unknown) => void) => {
    const h = (_e: unknown, info: unknown): void => cb(info)
    ipcRenderer.on('ddragon:updated', h)
    return () => ipcRenderer.removeListener('ddragon:updated', h)
  },
  getSummoner: () => ipcRenderer.invoke('summoner:get'),
  getLcuStatus: () => ipcRenderer.invoke('lcu:status:get'),
  onSummonerUpdated: (cb: (p: unknown) => void) => {
    const h = (_e: unknown, p: unknown): void => cb(p)
    ipcRenderer.on('summoner:updated', h)
    return () => ipcRenderer.removeListener('summoner:updated', h)
  },
  getMatchTimeline: (gameId: number) => ipcRenderer.invoke('match:timeline', gameId),
  getFriends: () => ipcRenderer.invoke('friends:get'),
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  openExternal: (url: string) => ipcRenderer.invoke('shell:open', url),
  validateRiotKey: (key: string) => ipcRenderer.invoke('riot:validate', key),
  getPlayerLive: (gameName: string, tagLine: string) =>
    ipcRenderer.invoke('riot:player-live', gameName, tagLine),
  getPlayerProfile: (gameName: string, tagLine: string) =>
    ipcRenderer.invoke('riot:player-profile', gameName, tagLine),
  getPlayerMatches: (gameName: string, tagLine: string, start: number, count: number) =>
    ipcRenderer.invoke('riot:player-matches', gameName, tagLine, start, count),
  getLiveGame: () => ipcRenderer.invoke('live:get'),
  scoutLiveGame: (
    players: { puuid: string; championImage: string; teamId?: number }[],
    queueId: number
  ) =>
    ipcRenderer.invoke('live:scout', players, queueId),

  exportRun: () => ipcRenderer.invoke('export:run'),
  exportPreview: () => ipcRenderer.invoke('export:preview'),
  exportCsv: () => ipcRenderer.invoke('export:csv'),

  onLcuStatus: (cb: (s: unknown) => void) => {
    const h = (_e: unknown, s: unknown): void => cb(s)
    ipcRenderer.on('lcu:status', h)
    return () => ipcRenderer.removeListener('lcu:status', h)
  },
  onMatchesUpdated: (cb: (m: unknown) => void) => {
    const h = (_e: unknown, m: unknown): void => cb(m)
    ipcRenderer.on('matches:updated', h)
    return () => ipcRenderer.removeListener('matches:updated', h)
  },
  onExportStatus: (cb: (s: unknown) => void) => {
    const h = (_e: unknown, s: unknown): void => cb(s)
    ipcRenderer.on('export:status', h)
    return () => ipcRenderer.removeListener('export:status', h)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.electron = electronAPI
  // @ts-ignore
  window.api = api
}

export type Api = typeof api
