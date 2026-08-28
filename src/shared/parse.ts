/**
 * Safe readers for untrusted JSON.
 *
 * The League client and the SGP endpoints are undocumented and change shape
 * between patches. Reading them field by field with ad-hoc `typeof` checks made
 * that fragility invisible: when Riot renames something, the value quietly
 * becomes 0 or null and the number shown to the user is simply wrong, with
 * nothing anywhere to say so.
 *
 * These helpers make each read state what it expects, and give the callers a
 * single place to notice when an expectation stops holding.
 *
 * Keep this free of runtime imports: it is compiled into both projects.
 */

/** A finite number, or `fallback` (0 by default). */
export function asNum(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/** A finite number, or null when absent — for genuinely optional values. */
export function asNumOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** A string, or `fallback` (empty by default). */
export function asStr(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

/** Strictly `true`; anything else (including truthy values) reads as false. */
export function asBool(value: unknown): boolean {
  return value === true
}

/** An array, or an empty one — never null, so callers can iterate freely. */
export function asArr<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

/** A plain object, or an empty one, so property access is always safe. */
export function asObj(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

/**
 * Describe an unexpected payload compactly enough to log: the keys present,
 * not the values, so nothing personal ends up in a file the user may share.
 */
export function shapeOf(value: unknown, limit = 20): string {
  if (value == null) return String(value)
  if (Array.isArray(value)) return `array(${value.length})`
  if (typeof value !== 'object') return typeof value
  const keys = Object.keys(value as object)
  const shown = keys.slice(0, limit).join(',')
  return `{${shown}${keys.length > limit ? `,+${keys.length - limit}` : ''}}`
}
