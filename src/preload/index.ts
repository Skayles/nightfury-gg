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
  getLiveGame: () => ipcRenderer.invoke('live:get'),
  scoutLiveGame: (players: { puuid: string; championImage: string }[], queueId: number) =>
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
