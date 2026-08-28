import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { logError, logWarn } from './log'
import type { MatchFilter, Settings } from '../shared/types'
// Declared once in src/shared/types.ts; re-exported so existing
// imports from this module keep working.
export type { MatchFilter, Settings } from '../shared/types'


export const EMPTY_FILTER: MatchFilter = {
  queueId: null,
  champion: null,
  result: null,
  sinceDays: null
}

const defaults: Settings = {
  scriptUrl: null,
  exportToken: null,
  autoExportOnGameEnd: false,
  onlyNewOnExport: true,
  exportFilter: { ...EMPTY_FILTER },
  scoutingEnabled: true,
  language: 'fr',
  discordEnabled: false,
  riotApiKey: '',
  closeToTray: true,
  replayFolder: '',
  replayResolution: 1080,
  replayFps: 60,
  replayAuto: false,
  replayEncoder: 'auto',
  replayCapture: 'windowed',
  replayWindowTitle: '',
  replayAudio: false,
  replayAudioDevice: '',
  replayMic: false,
  replayMicDevice: '',
  replayAudioVolume: 100,
  replayMicVolume: 100,
  replayAudioOffsetMs: 0,
  replayMaxGb: 0
}

let cache: Settings | null = null

function file(): string {
  return join(app.getPath('userData'), 'settings.json')
}

export function getSettings(): Settings {
  if (cache) return cache
  let result: Settings = { ...defaults }
  try {
    if (existsSync(file())) {
      const parsed = JSON.parse(readFileSync(file(), 'utf-8'))
      result = {
        ...defaults,
        ...parsed,
        exportFilter: { ...EMPTY_FILTER, ...(parsed.exportFilter ?? {}) }
      }
    }
  } catch (e) {
    logWarn('settings', 'unreadable settings.json, falling back to defaults', e)
    result = { ...defaults }
  }
  cache = result
  return result
}

export function setSettings(patch: Partial<Settings>): Settings {
  const next = { ...getSettings(), ...patch }
  cache = next
  try {
    writeFileSync(file(), JSON.stringify(next, null, 2), 'utf-8')
  } catch (e) {
    logError('settings', 'write failed', e)
  }
  return next
}
