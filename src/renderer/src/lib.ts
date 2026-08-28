import type { MatchRecord } from '../../preload/index.d'
export { applyFilter } from '../../shared/filter'

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
  championId: number
  games: number
  wins: number
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
        championId: ms[0].championId,
        games: ms.length,
        wins,
        winrate: Math.round((wins / ms.length) * 1000) / 10,
        kda: Math.round(((k + a) / (d || 1)) * 100) / 100
      }
    })
    .sort((x, y) => y.games - x.games)
}

export function fmtDate(ms: number): string {
  // Uses the PC's local locale (undefined) and local time zone (default) so the
  // time shown is exactly the player's local clock time.
  const d = new Date(ms)
  const opts: Intl.DateTimeFormatOptions = {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = '2-digit'
  return d.toLocaleString(undefined, opts)
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

export function spellIcon(
  version: string,
  spells: Record<number, string> | undefined,
  id: number
): string | null {
  const img = spells?.[id]
  if (!version || !img) return null
  return `${DD}/${version}/img/spell/${img}`
}

// Rune/rune-style icons are served unversioned under /cdn/img/.
export function runeIcon(icon: string | undefined): string | null {
  if (!icon) return null
  return `https://ddragon.leagueoflegends.com/cdn/img/${icon}`
}

// Stat shards aren't in Data Dragon's rune data, so we map them here.
const SHARD_INFO: Record<number, { icon: string; name: string; desc: string }> = {
  5008: { icon: 'perk-images/StatMods/StatModsAdaptiveForceIcon.png', name: 'Force adaptative', desc: '+9 Force adaptative' },
  5005: { icon: 'perk-images/StatMods/StatModsAttackSpeedIcon.png', name: "Vitesse d'attaque", desc: "+10% Vitesse d'attaque" },
  5007: { icon: 'perk-images/StatMods/StatModsCDRScalingIcon.png', name: 'Accélération de compétence', desc: '+8 Accélération de compétence' },
  5010: { icon: 'perk-images/StatMods/StatModsMovementSpeedIcon.png', name: 'Vitesse de déplacement', desc: '+2% Vitesse de déplacement' },
  5001: { icon: 'perk-images/StatMods/StatModsHealthScalingIcon.png', name: 'Vie (évolutive)', desc: '+10-180 Vie (selon le niveau)' },
  5011: { icon: 'perk-images/StatMods/StatModsHealthPlusIcon.png', name: 'Vie', desc: '+65 Vie' },
  5013: { icon: 'perk-images/StatMods/StatModsTenacityIcon.png', name: 'Ténacité et résist. ralent.', desc: '+10% Ténacité et résistance aux ralentissements' }
}

export function shardInfo(id: number): { icon: string; name: string; desc: string } | null {
  return SHARD_INFO[id] ?? null
}

// Accent colour per rune tree (style id), matching LoL's palette.
const TREE_COLOR: Record<number, string> = {
  8000: '#C8AA6E', // Precision
  8100: '#D0424E', // Domination
  8200: '#9B6BF0', // Sorcery
  8300: '#49AAB9', // Inspiration
  8400: '#5CBE63' // Resolve
}

export function treeColor(styleId: number | undefined): string {
  return TREE_COLOR[styleId ?? 0] ?? '#7C93A8'
}

/** Ranked tier emblem (Community Dragon). Falls back to text via onError. */
export function rankEmblem(tier: string | null | undefined): string | null {
  if (!tier) return null
  return `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-emblem/emblem-${tier.toLowerCase()}.png`
}

export function profileIcon(version: string, iconId: number): string | null {
  if (!version) return null
  return `${DD}/${version}/img/profileicon/${iconId}.png`
}

/** Localized "N games" / "N parties" (handles singular). */
export function gamesLabel(n: number, t: (k: string, v?: Record<string, string | number>) => string): string {
  return t(n === 1 ? 'common.game' : 'common.games', { n })
}

/** Compact localized relative time, e.g. "il y a 3 j" / "3d ago". */
export function agoShort(
  ms: number,
  t: (k: string, v?: Record<string, string | number>) => string
): string {
  const diff = Math.max(0, Date.now() - ms)
  const h = diff / 3600000
  const d = diff / 86400000
  const w = d / 7
  const mo = d / 30
  if (mo >= 1) return t('time.moAgo', { n: Math.round(mo) })
  if (w >= 1) return t('time.wAgo', { n: Math.round(w) })
  if (d >= 1) return t('time.dAgo', { n: Math.round(d) })
  if (h >= 1) return t('time.hAgo', { n: Math.round(h) })
  return t('time.recent')
}

/** Champion loading-screen art (the vertical card), for a given skin. Not versioned. */
export function loadingArt(imageId: string | undefined, skinId = 0): string | null {
  if (!imageId) return null
  return `https://ddragon.leagueoflegends.com/cdn/img/champion/loading/${imageId}_${skinId}.jpg`
}

type Role = 'TOP' | 'JUNGLE' | 'MID' | 'ADC' | 'SUPPORT'
const ROLE_ORDER: Record<Role, number> = { TOP: 0, JUNGLE: 1, MID: 2, ADC: 3, SUPPORT: 4 }

// Primary role per champion (keyed by Data Dragon image id). Best-effort for a
// loading-screen-style ordering; flex picks use their most common lane.
const CHAMP_ROLE: Record<string, Role> = {
  // TOP
  Aatrox: 'TOP', Camille: 'TOP', Chogath: 'TOP', Darius: 'TOP', DrMundo: 'TOP',
  Fiora: 'TOP', Gangplank: 'TOP', Garen: 'TOP', Gnar: 'TOP', Gwen: 'TOP',
  Illaoi: 'TOP', Jax: 'TOP', Jayce: 'TOP', Kayle: 'TOP', Kled: 'TOP', KSante: 'TOP',
  Malphite: 'TOP', Maokai: 'TOP', Mordekaiser: 'TOP', Nasus: 'TOP', Ornn: 'TOP',
  Quinn: 'TOP', Renekton: 'TOP', Riven: 'TOP', Rumble: 'TOP', Sett: 'TOP',
  Shen: 'TOP', Singed: 'TOP', Sion: 'TOP', Teemo: 'TOP', Trundle: 'TOP',
  Tryndamere: 'TOP', Urgot: 'TOP', Volibear: 'TOP', Yorick: 'TOP', Kennen: 'TOP',
  Aurora: 'TOP',
  // JUNGLE
  Amumu: 'JUNGLE', Belveth: 'JUNGLE', Briar: 'JUNGLE', Diana: 'JUNGLE', Ekko: 'JUNGLE',
  Elise: 'JUNGLE', Evelynn: 'JUNGLE', Fiddlesticks: 'JUNGLE', Gragas: 'JUNGLE',
  Graves: 'JUNGLE', Hecarim: 'JUNGLE', Ivern: 'JUNGLE', JarvanIV: 'JUNGLE',
  Karthus: 'JUNGLE', Kayn: 'JUNGLE', Khazix: 'JUNGLE', Kindred: 'JUNGLE',
  LeeSin: 'JUNGLE', Lillia: 'JUNGLE', MasterYi: 'JUNGLE', Nidalee: 'JUNGLE',
  Nocturne: 'JUNGLE', Nunu: 'JUNGLE', Olaf: 'JUNGLE', Poppy: 'JUNGLE', Rammus: 'JUNGLE',
  RekSai: 'JUNGLE', Rengar: 'JUNGLE', Sejuani: 'JUNGLE', Shaco: 'JUNGLE',
  Skarner: 'JUNGLE', Udyr: 'JUNGLE', Vi: 'JUNGLE', Viego: 'JUNGLE', Warwick: 'JUNGLE',
  XinZhao: 'JUNGLE', Zac: 'JUNGLE', MonkeyKing: 'JUNGLE', Naafiri: 'JUNGLE',
  // MID
  Ahri: 'MID', Akali: 'MID', Anivia: 'MID', Annie: 'MID', AurelionSol: 'MID',
  Azir: 'MID', Cassiopeia: 'MID', Fizz: 'MID', Galio: 'MID', Hwei: 'MID',
  Irelia: 'MID', Kassadin: 'MID', Katarina: 'MID', Leblanc: 'MID', Lissandra: 'MID',
  Malzahar: 'MID', Orianna: 'MID', Qiyana: 'MID', Ryze: 'MID', Sylas: 'MID',
  Syndra: 'MID', Taliyah: 'MID', TwistedFate: 'MID', Veigar: 'MID', Vex: 'MID',
  Viktor: 'MID', Vladimir: 'MID', Yasuo: 'MID', Yone: 'MID', Zed: 'MID', Zoe: 'MID',
  Ziggs: 'MID', Neeko: 'MID',
  // ADC
  Aphelios: 'ADC', Ashe: 'ADC', Caitlyn: 'ADC', Corki: 'ADC', Draven: 'ADC',
  Ezreal: 'ADC', Jhin: 'ADC', Jinx: 'ADC', Kaisa: 'ADC', Kalista: 'ADC',
  KogMaw: 'ADC', Lucian: 'ADC', MissFortune: 'ADC', Nilah: 'ADC', Samira: 'ADC',
  Sivir: 'ADC', Smolder: 'ADC', Tristana: 'ADC', Twitch: 'ADC', Varus: 'ADC',
  Vayne: 'ADC', Xayah: 'ADC', Zeri: 'ADC',
  // SUPPORT
  Alistar: 'SUPPORT', Bard: 'SUPPORT', Blitzcrank: 'SUPPORT', Brand: 'SUPPORT',
  Braum: 'SUPPORT', Janna: 'SUPPORT', Karma: 'SUPPORT', Leona: 'SUPPORT',
  Lulu: 'SUPPORT', Lux: 'SUPPORT', Milio: 'SUPPORT', Morgana: 'SUPPORT',
  Nami: 'SUPPORT', Nautilus: 'SUPPORT', Pyke: 'SUPPORT', Rakan: 'SUPPORT',
  Rell: 'SUPPORT', Renata: 'SUPPORT', Senna: 'SUPPORT', Seraphine: 'SUPPORT',
  Sona: 'SUPPORT', Soraka: 'SUPPORT', Swain: 'SUPPORT', TahmKench: 'SUPPORT',
  Taric: 'SUPPORT', Thresh: 'SUPPORT', Velkoz: 'SUPPORT', Xerath: 'SUPPORT',
  Yuumi: 'SUPPORT', Zilean: 'SUPPORT', Zyra: 'SUPPORT'
}

/** Order a team's players into TOP → JUNGLE → MID → ADC → SUPPORT (best effort). */
export function orderByRole<T extends { championImage: string }>(players: T[]): T[] {
  const slots: (T | null)[] = [null, null, null, null, null]
  const leftover: T[] = []
  for (const p of players) {
    const role = CHAMP_ROLE[p.championImage]
    const idx = role != null ? ROLE_ORDER[role] : -1
    if (idx >= 0 && slots[idx] == null) slots[idx] = p
    else leftover.push(p)
  }
  let li = 0
  for (let i = 0; i < slots.length; i++) {
    if (slots[i] == null && li < leftover.length) slots[i] = leftover[li++]
  }
  const ordered = slots.filter((x): x is T => x != null)
  return ordered.concat(leftover.slice(li))
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
