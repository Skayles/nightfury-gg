/**
 * Rotating diagnostic log.
 *
 * The app talks to an undocumented API that shifts between patches, drives an
 * external ffmpeg process and touches audio devices — three things that fail in
 * ways we do not control. Failures used to be swallowed by bare `catch {}`, so
 * a user could only ever report "it doesn't work", with nothing to work from:
 * the packaged build shows no console.
 *
 * Deliberately dependency-free and deliberately unable to throw: logging must
 * never be the thing that breaks a recording.
 */

import { app, shell } from 'electron'
import { join } from 'path'
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  renameSync,
  statSync,
  unlinkSync,
  readdirSync
} from 'fs'

const MAX_BYTES = 1024 * 1024 // rotate past 1 MB
const KEEP = 3 // current + 2 previous

export type LogLevel = 'info' | 'warn' | 'error'

let dir = ''
let file = ''
let ready = false

function ensure(): boolean {
  if (ready) return true
  try {
    dir = join(app.getPath('userData'), 'logs')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    file = join(dir, 'nightfury.log')
    ready = true
  } catch {
    ready = false
  }
  return ready
}

/** Move the current file aside once it grows past MAX_BYTES. */
function rotate(): void {
  try {
    if (!existsSync(file) || statSync(file).size < MAX_BYTES) return
    for (let i = KEEP - 1; i >= 1; i--) {
      const from = i === 1 ? file : `${file}.${i - 1}`
      const to = `${file}.${i}`
      if (existsSync(from)) {
        if (existsSync(to)) unlinkSync(to)
        renameSync(from, to)
      }
    }
  } catch {
    /* a failed rotation must not stop logging */
  }
}

function stamp(): string {
  const d = new Date()
  const p = (n: number, w = 2): string => String(n).padStart(w, '0')
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
    `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`
  )
}

/** Render anything a catch block might hand us, without ever throwing. */
function render(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (value instanceof Error) return value.stack || `${value.name}: ${value.message}`
  try {
    const json = JSON.stringify(value)
    return json === undefined ? String(value) : json
  } catch {
    return String(value)
  }
}

export function log(level: LogLevel, scope: string, message: string, detail?: unknown): void {
  const extra = render(detail)
  const line = `${stamp()} ${level.toUpperCase().padEnd(5)} [${scope}] ${message}${
    extra ? ' :: ' + extra.slice(0, 2000) : ''
  }\n`
  // Mirror to the terminal in development, where it is actually visible.
  if (!app.isPackaged) process.stdout.write(line)
  if (!ensure()) return
  try {
    rotate()
    appendFileSync(file, line, 'utf-8')
  } catch {
    /* disk full, permissions, antivirus — never propagate */
  }
}

export const logInfo = (scope: string, message: string, detail?: unknown): void =>
  log('info', scope, message, detail)
export const logWarn = (scope: string, message: string, detail?: unknown): void =>
  log('warn', scope, message, detail)
export const logError = (scope: string, message: string, detail?: unknown): void =>
  log('error', scope, message, detail)

/**
 * Log a condition once per session.
 *
 * Shape problems repeat for every game in a backfill — up to 300 of them — so
 * an unthrottled warning would bury the file it is meant to make readable.
 */
const seen = new Set<string>()
export function logWarnOnce(key: string, scope: string, message: string, detail?: unknown): void {
  if (seen.has(key)) return
  seen.add(key)
  logWarn(scope, message, detail)
}

/** Folder holding the log files, for the "open logs" button in Options. */
export function logsDir(): string {
  ensure()
  return dir
}

export function openLogsFolder(): void {
  if (ensure()) void shell.openPath(dir)
}

/** Total bytes currently held by the log files. */
export function logsSize(): number {
  if (!ensure()) return 0
  try {
    return readdirSync(dir)
      .filter((n) => n.startsWith('nightfury.log'))
      .reduce((sum, n) => {
        try {
          return sum + statSync(join(dir, n)).size
        } catch {
          return sum
        }
      }, 0)
  } catch {
    return 0
  }
}

/**
 * Record the app's identity and anything that crashes outright. Called once at
 * startup so every log file opens with the context a bug report needs.
 */
export function initLogging(): void {
  logInfo(
    'app',
    `Nightfury.gg ${app.getVersion()} starting`,
    `electron=${process.versions.electron} chrome=${process.versions.chrome} node=${process.versions.node} platform=${process.platform} arch=${process.arch}`
  )
  process.on('uncaughtException', (e) => logError('process', 'uncaught exception', e))
  process.on('unhandledRejection', (e) => logError('process', 'unhandled rejection', e))
}
