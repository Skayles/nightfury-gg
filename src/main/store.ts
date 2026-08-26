import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'

export interface MatchFilter {
  queueId: number | null
  champion: string | null
  result: 'win' | 'loss' | null
  sinceDays: number | null
}

export const EMPTY_FILTER: MatchFilter = {
  queueId: null,
  champion: null,
  result: null,
  sinceDays: null
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
  } catch {
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
    console.error('[settings] write failed', e)
  }
  return next
}
