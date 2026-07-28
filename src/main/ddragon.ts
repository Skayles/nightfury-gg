/**
 * Data Dragon: champion id → name / image, item id → name, and the current
 * patch version. Loaded once at startup (in the user's language) so both
 * parsing (names) and the UI (icons + tooltips) can use it.
 */

let version = ''
let names: Record<number, string> = {}
let images: Record<number, string> = {} // numeric key -> image id (e.g. 102 -> "Shyvana")
let idByImage: Record<string, number> = {} // image id -> numeric key
let items: Record<number, { name: string; description: string }> = {}
let validImageIds = new Set<string>()
let nameToImage: Record<string, string> = {}

const normName = (s: string): string => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '')

export async function loadDdragon(lang: string = 'fr_FR'): Promise<void> {
  try {
    const versions: string[] = await fetch(
      'https://ddragon.leagueoflegends.com/api/versions.json'
    ).then((r) => r.json())
    version = versions[0]

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
  } catch (e) {
    console.error('[ddragon] load failed', e)
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
} {
  return { version, champions: images, champNames: names, items }
}
