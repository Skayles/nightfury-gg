/**
 * Match filtering, shared by the export pipeline in main and the history view
 * in the renderer. It lived in both, character for character, which is exactly
 * the kind of copy that quietly grows two different meanings.
 *
 * Keep this free of runtime imports: it is compiled into both projects.
 */
import type { MatchRecord, MatchFilter } from './types'

export function applyFilter(matches: MatchRecord[], f: MatchFilter): MatchRecord[] {
  const cutoff = f.sinceDays != null ? Date.now() - f.sinceDays * 86400000 : null
  return matches.filter((m) => {
    if (f.queueId != null && m.queueId !== f.queueId) return false
    if (f.champion && m.champion !== f.champion) return false
    if (f.result === 'win' && !m.win) return false
    if (f.result === 'loss' && m.win) return false
    if (cutoff != null && m.playedAt < cutoff) return false
    return true
  })
}
