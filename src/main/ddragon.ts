/**
 * Data Dragon: champion id → name / image, item id → name, and the current
 * patch version. Loaded once at startup (in the user's language) so both
 * parsing (names) and the UI (icons + tooltips) can use it.
 *
 * Cached on disk (per patch + language) so we only re-download when the patch
 * actually changes; otherwise startup just fetches the tiny versions.json.
 */

import { app } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { logWarn, logError, logInfo } from './log'

const CACHE_SHAPE = 2 // bump when the cached data structure changes

let version = ''
let names: Record<number, string> = {}
let images: Record<number, string> = {} // numeric key -> image id (e.g. 102 -> "Shyvana")
let idByImage: Record<string, number> = {} // image id -> numeric key
let items: Record<number, { name: string; description: string }> = {}
let validImageIds = new Set<string>()
let nameToImage: Record<string, string> = {}
let spells: Record<number, string> = {} // spell numeric id -> image file (e.g. 4 -> "SummonerFlash.png")
let spellInfo: Record<number, { name: string; desc: string }> = {}
let runes: Record<number, { icon: string; name: string; desc: string }> = {}
let runeStyles: Record<number, { icon: string; name: string }> = {}

const normName = (s: string): string => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '')

function cacheFile(): string {
  return join(app.getPath('userData'), 'ddragon-cache.json')
}

function applyCached(d: any): void {
  version = d.version
  names = d.names
  images = d.images
  idByImage = d.idByImage
  validImageIds = new Set(d.validImageIds)
  nameToImage = d.nameToImage
  items = d.items
  spells = d.spells
  spellInfo = d.spellInfo
  runes = d.runes
  runeStyles = d.runeStyles
}

async function writeCache(lang: string): Promise<void> {
  // Only cache a complete load, never a partial/failed one.
  if (!version || !Object.keys(items).length || !Object.keys(runes).length) return
  try {
    await writeFile(
      cacheFile(),
      JSON.stringify({
        shape: CACHE_SHAPE,
        lang,
        version,
        names,
        images,
        idByImage,
        validImageIds: [...validImageIds],
        nameToImage,
        items,
        spells,
        spellInfo,
        runes,
        runeStyles
      })
    )
  } catch (e) {
    logWarn('ddragon', 'cache write failed', e)
  }
}

async function readCache(): Promise<any | null> {
  try {
    return JSON.parse(await readFile(cacheFile(), 'utf-8'))
  } catch {
    return null
  }
}

export async function loadDdragon(lang: string = 'fr_FR'): Promise<void> {
  try {
    // Latest patch (tiny request). If offline, latest stays ''.
    let latest = ''
    try {
      const versions: string[] = await fetch(
        'https://ddragon.leagueoflegends.com/api/versions.json'
      ).then((r) => r.json())
      latest = versions[0]
    } catch {
      /* offline — we'll fall back to the disk cache below */
    }

    // Fast path: reuse the disk cache when the patch (and language) match, or
    // when we're offline and have any cached copy.
    const cached = await readCache()
    if (
      cached &&
      cached.shape === CACHE_SHAPE &&
      cached.lang === lang &&
      cached.version &&
      (latest === '' || cached.version === latest)
    ) {
      applyCached(cached)
      return
    }

    version = latest || cached?.version || version
    if (!version) {
      logError('ddragon', 'no patch version and no disk cache — offline on first run?')
      return
    }

    const champs: any = await fetch(
      `https://ddragon.leagueoflegends.com/cdn/${version}/data/${lang}/champion.json`
    ).then((r) => r.json())
    const n: Record<number, string> = {}
    const im: Record<number, string> = {}
    const ibi: Record<string, number> = {}
    const valid = new Set<string>()
    const n2i: Record<string, string> = {}
    for (const key of Object.keys(champs.data)) {
      const c = champs.data[key]
      n[Number(c.key)] = c.name
      im[Number(c.key)] = c.id
      ibi[c.id] = Number(c.key)
      valid.add(c.id)
      n2i[normName(c.name)] = c.id
      n2i[normName(c.id)] = c.id
    }
    names = n
    images = im
    idByImage = ibi
    validImageIds = valid
    nameToImage = n2i

    const itemJson: any = await fetch(
      `https://ddragon.leagueoflegends.com/cdn/${version}/data/${lang}/item.json`
    ).then((r) => r.json())
    const it: Record<number, { name: string; description: string }> = {}
    for (const key of Object.keys(itemJson.data)) {
      const d = itemJson.data[key]
      it[Number(key)] = { name: d.name ?? '', description: d.description ?? '' }
    }
    items = it

    // Summoner spells: numeric id -> image file.
    try {
      const spellJson: any = await fetch(
        `https://ddragon.leagueoflegends.com/cdn/${version}/data/${lang}/summoner.json`
      ).then((r) => r.json())
      const sp: Record<number, string> = {}
      const spi: Record<number, { name: string; desc: string }> = {}
      for (const key of Object.keys(spellJson.data)) {
        const d = spellJson.data[key]
        sp[Number(d.key)] = d.image?.full ?? ''
        spi[Number(d.key)] = {
          name: d.name ?? '',
          desc: String(d.description ?? '').replace(/<[^>]*>/g, '')
        }
      }
      spells = sp
      spellInfo = spi
    } catch (e) {
      logWarn('ddragon', 'summoner spells load failed', e)
    }

    // Runes (Runes Reforged): perk id -> icon, style id -> icon.
    try {
      const runeJson: any[] = await fetch(
        `https://ddragon.leagueoflegends.com/cdn/${version}/data/${lang}/runesReforged.json`
      ).then((r) => r.json())
      const rn: Record<number, { icon: string; name: string; desc: string }> = {}
      const st: Record<number, { icon: string; name: string }> = {}
      const strip = (h: string): string => String(h || '').replace(/<[^>]*>/g, '')
      for (const style of runeJson) {
        st[Number(style.id)] = { icon: style.icon, name: style.name }
        for (const slot of style.slots ?? []) {
          for (const rune of slot.runes ?? []) {
            rn[Number(rune.id)] = {
              icon: rune.icon,
              name: rune.name,
              desc: strip(rune.shortDesc || rune.longDesc || '')
            }
          }
        }
      }
      runes = rn
      runeStyles = st
    } catch (e) {
      logWarn('ddragon', 'runes load failed', e)
    }

    // Persist the fully-loaded data so the next launch (same patch) is instant.
    await writeCache(lang)
  } catch (e) {
    logError('ddragon', 'load failed — champion names and icons will be missing', e)
  }
}

/** Resolve a Data Dragon champion image id from the in-game live-client data. */
export function championIdFromImage(imageId: string): number {
  return idByImage[imageId] ?? 0
}

export function championImageFromLive(championName: string, rawChampionName?: string): string {
  if (rawChampionName) {
    const seg = rawChampionName.split('_').pop() || ''
    if (validImageIds.has(seg)) return seg
  }
  return nameToImage[normName(championName)] ?? ''
}

export function championName(id: number): string {
  return names[id] ?? `Champion ${id}`
}

export function ddragonInfo(): {
  version: string
  champions: Record<number, string>
  champNames: Record<number, string>
  items: Record<number, { name: string; description: string }>
  spells: Record<number, string>
  spellInfo: Record<number, { name: string; desc: string }>
  runes: Record<number, { icon: string; name: string; desc: string }>
  runeStyles: Record<number, { icon: string; name: string }>
} {
  return { version, champions: images, champNames: names, items, spells, spellInfo, runes, runeStyles }
}
