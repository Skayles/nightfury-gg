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
}

const defaults: Settings = {
  scriptUrl: null,
  exportToken: null,
  autoExportOnGameEnd: false,
  onlyNewOnExport: true,
  exportFilter: { ...EMPTY_FILTER },
  scoutingEnabled: true,
  language: 'fr',
  discordEnabled: false
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
