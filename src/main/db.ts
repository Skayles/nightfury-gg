import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync, statSync } from 'fs'
import type { MatchRecord } from './stats'

/**
 * Pure-JS storage (a single JSON file). No native module, so `npm install`
 * never needs a C++ compiler. For a personal match tracker (a few thousand
 * rows at most) this is more than fast enough.
 */

interface Stored extends MatchRecord {
  exported: boolean
}

// Bump when the way we COMPUTE/STORE a record changes (e.g. adding the full
// scoreboard). On a bump we re-fetch every stored game once.
const SCHEMA = 3

// One month, used by the manual "free up space" action in Options.
export const ONE_MONTH_MS = 31 * 24 * 60 * 60 * 1000

let games = new Map<number, Stored>()
let loadedSchema = 0

function file(): string {
  return join(app.getPath('userData'), 'matches.json')
}

function save(): void {
  try {
    writeFileSync(
      file(),
      JSON.stringify({ schema: SCHEMA, games: [...games.values()] }),
      'utf-8'
    )
  } catch (e) {
    console.error('[db] write failed', e)
  }
}

export function initDb(): void {
  games = new Map()
  loadedSchema = 0
  try {
    if (existsSync(file())) {
      const parsed = JSON.parse(readFileSync(file(), 'utf-8'))
      // New format: { schema, games }. Old format: a bare array.
      const arr: Stored[] = Array.isArray(parsed) ? parsed : (parsed.games ?? [])
      loadedSchema = Array.isArray(parsed) ? 0 : (parsed.schema ?? 0)
      for (const g of arr) games.set(g.gameId, g)
    }
  } catch (e) {
    console.error('[db] read failed, starting fresh', e)
    games = new Map()
  }
}

/** Remove games older than maxAgeMs. Returns how many were removed. */
export function pruneOlderThan(maxAgeMs: number): number {
  const cutoff = Date.now() - maxAgeMs
  let removed = 0
  for (const [id, g] of games) {
    if (g.playedAt && g.playedAt < cutoff) {
      games.delete(id)
      removed++
    }
  }
  if (removed > 0) save()
  return removed
}

/** Stored game count and on-disk size in bytes. */
export function storageInfo(): { count: number; bytes: number } {
  let bytes = 0
  try {
    if (existsSync(file())) bytes = statSync(file()).size
  } catch {
    /* ignore */
  }
  return { count: games.size, bytes }
}

/** Called once the initial backfill has recomputed everything for this schema. */
export function markSchemaCurrent(): void {
  loadedSchema = SCHEMA
  save()
}

/** Wipe all stored games (kept on the current schema). */
export function resetHistory(): void {
  games = new Map()
  loadedSchema = SCHEMA
  save()
}

/** Insert new matches; update existing ones (healing old/wrong data). */
export function upsertMatches(records: MatchRecord[]): number {
  let n = 0
  for (const r of records) {
    const existing = games.get(r.gameId)
    if (!existing) {
      games.set(r.gameId, { ...r, exported: false })
      n++
    } else {
      // Refresh the data fields but preserve the export flag.
      games.set(r.gameId, { ...r, exported: existing.exported })
      n++
    }
  }
  if (n > 0) save()
  return n
}

/**
 * Games we can safely skip re-downloading: already stored, plausible KP (≤100),
 * and carrying full details + scoreboard. Anything else is re-fetched.
 */
export function skipIdSet(): Set<number> {
  const set = new Set<number>()
  // On a schema bump, force a full re-fetch (skip nothing) so old values heal.
  if (loadedSchema < SCHEMA) return set
  for (const g of games.values()) {
    if (g.details && g.players && g.kpPct <= 100) set.add(g.gameId)
  }
  return set
}

function strip(s: Stored): MatchRecord {
  const { exported, ...rest } = s
  void exported
  return rest
}

function sortedDesc(): Stored[] {
  return [...games.values()].sort((a, b) => b.playedAt - a.playedAt)
}

export function listMatches(limit = 300): MatchRecord[] {
  return sortedDesc().slice(0, limit).map(strip)
}

export function allMatches(): MatchRecord[] {
  return sortedDesc().map(strip)
}

/** Set of game ids not yet exported to a sheet. */
export function unexportedIdSet(): Set<number> {
  const set = new Set<number>()
  for (const g of games.values()) if (!g.exported) set.add(g.gameId)
  return set
}

export function markExported(gameIds: number[]): void {
  let changed = false
  for (const id of gameIds) {
    const g = games.get(id)
    if (g && !g.exported) {
      g.exported = true
      changed = true
    }
  }
  if (changed) save()
}
