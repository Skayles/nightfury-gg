import type { MatchRecord, MatchFilter } from '../../preload/index.d'

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

export interface Agg {
  games: number
  wins: number
  losses: number
  winrate: number
  kda: number
  cspm: number
  kp: number
  vision: number
}

export function aggregate(matches: MatchRecord[]): Agg | null {
  const games = matches.length
  if (!games) return null
  const wins = matches.filter((m) => m.win).length
  const k = matches.reduce((s, m) => s + m.kills, 0)
  const d = matches.reduce((s, m) => s + m.deaths, 0)
  const a = matches.reduce((s, m) => s + m.assists, 0)
  const cspm = matches.reduce((s, m) => s + m.csPerMin, 0) / games
  const kp = matches.reduce((s, m) => s + m.kpPct, 0) / games
  const vis = matches.reduce((s, m) => s + m.vision, 0) / games
  return {
    games,
    wins,
    losses: games - wins,
    winrate: Math.round((wins / games) * 1000) / 10,
    kda: Math.round(((k + a) / (d || 1)) * 100) / 100,
    cspm: Math.round(cspm * 10) / 10,
    kp: Math.round(kp * 10) / 10,
    vision: Math.round(vis * 10) / 10
  }
}

export interface ChampStat {
  champion: string
  games: number
  winrate: number
  kda: number
}

export function perChampion(matches: MatchRecord[]): ChampStat[] {
  const map = new Map<string, MatchRecord[]>()
  for (const m of matches) {
    const arr = map.get(m.champion) ?? []
    arr.push(m)
    map.set(m.champion, arr)
  }
  return [...map]
    .map(([champion, ms]) => {
      const wins = ms.filter((m) => m.win).length
      const k = ms.reduce((s, m) => s + m.kills, 0)
      const d = ms.reduce((s, m) => s + m.deaths, 0)
      const a = ms.reduce((s, m) => s + m.assists, 0)
      return {
        champion,
        games: ms.length,
        winrate: Math.round((wins / ms.length) * 1000) / 10,
        kda: Math.round(((k + a) / (d || 1)) * 100) / 100
      }
    })
    .sort((x, y) => y.games - x.games)
}

export function fmtDate(ms: number): string {
  return new Date(ms).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const DD = 'https://ddragon.leagueoflegends.com/cdn'

export function champIcon(version: string, imageId: string | undefined): string | null {
  if (!version || !imageId) return null
  return `${DD}/${version}/img/champion/${imageId}.png`
}

export function itemIcon(version: string, id: number): string | null {
  if (!version || !id) return null
  return `${DD}/${version}/img/item/${id}.png`
}

export function profileIcon(version: string, iconId: number): string | null {
  if (!version) return null
  return `${DD}/${version}/img/profileicon/${iconId}.png`
}

export function fmtRank(
  tier: string | null,
  division: string | null,
  lp: number | null
): string | null {
  if (!tier) return null
  const t = tier.charAt(0).toUpperCase() + tier.slice(1).toLowerCase()
  const apex = t === 'Master' || t === 'Grandmaster' || t === 'Challenger'
  let s = apex || !division ? t : `${t} ${division}`
  if (lp != null) s += ` · ${lp} LP`
  return s
}

export function fmtDuration(s: number): string {
  const m = Math.floor(s / 60)
  const sec = Math.round(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

export function fmtNum(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}

/**
 * Convert a Data Dragon item `description` (Riot's custom-tag HTML) into safe,
 * lightly-styled HTML for a tooltip. All tags are stripped except the few we
 * re-insert ourselves, and text is escaped — so it's XSS-safe.
 */
export function itemTooltipHtml(desc: string): string {
  if (!desc) return ''
  let s = desc
  s = s.replace(/<br\s*\/?>/gi, '\n')
  s = s.replace(/<\/?(mainText|stats|rules)>/gi, '')
  // Mark passive/active names and highlighted numbers before stripping tags.
  s = s.replace(/<(passive|active)>/gi, '\uE001').replace(/<\/(passive|active)>/gi, '\uE002')
  s = s.replace(/<attention>/gi, '\uE003').replace(/<\/attention>/gi, '\uE004')
  s = s.replace(/<[^>]+>/g, '') // strip every remaining tag
  s = s.replace(/\n{3,}/g, '\n\n').trim()
  // Escape HTML now that no real tags remain.
  s = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  // Restore our markers as styled spans and newlines as <br>.
  s = s
    .replace(/\uE001/g, '<span style="color:#C8A04A;font-weight:600">')
    .replace(/\uE002/g, '</span>')
    .replace(/\uE003/g, '<span style="color:#2DD4BF">')
    .replace(/\uE004/g, '</span>')
    .replace(/\n/g, '<br/>')
  return s
}
