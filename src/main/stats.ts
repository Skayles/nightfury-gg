/**
 * Parsing of the LCU match-history format + aggregates, filtering and export
 * serialization. The LCU returns the legacy match shape; field access is
 * defensive because the LCU is unofficial and shifts between patches.
 */
import type { MatchFilter } from './store'
import { championName } from './ddragon'
import { asNum, asBool, asArr, shapeOf } from '../shared/parse'
import { logWarnOnce } from './log'
export { applyFilter } from '../shared/filter'
import type { MatchDetails, ScorePlayer, MatchRecord } from '../shared/types'
// Declared once in src/shared/types.ts; re-exported so existing
// imports from this module keep working.
export type { MatchDetails, ScorePlayer, MatchRecord, TimelineEvent, LivePlayer, LiveGame, Friend, ScoutResult, ScoutDiag } from '../shared/types'


export const QUEUES: Record<number, string> = {
  420: 'Ranked Solo/Duo',
  440: 'Ranked Flex',
  400: 'Normal Draft',
  430: 'Normal Blind',
  450: 'ARAM',
  490: 'Quickplay',
  700: 'Clash',
  1700: 'Arena',
  1710: 'Arena',
  2400: 'ARAM: Mayhem',
  2450: 'ARAM: Mayhem',
  1900: 'URF',
  900: 'ARURF'
}

// Filled at runtime from the League client (/lol-game-queues/v1/queues) so event
// queues resolve correctly even when they're absent from the static list above.
let dynamicQueues: Record<number, string> = {}
export function setQueueNames(map: Record<number, string>): void {
  dynamicQueues = map
}

export function queueName(id: number): string {
  return dynamicQueues[id] ?? QUEUES[id] ?? `Queue ${id}`
}

const num = asNum

export function parseGame(game: any, myPuuid: string): MatchRecord | null {
  const identities: any[] = asArr(game?.participantIdentities)
  if (!identities.length) {
    logWarnOnce(
      'parseGame:no-identities',
      'lcu',
      'a game had no participantIdentities — the client format may have changed',
      shapeOf(game)
    )
    return null
  }
  const mine = identities.find((pi) => pi?.player?.puuid && pi.player.puuid === myPuuid)
  if (!mine) return null

  const participants: any[] = asArr(game?.participants)
  const me = participants.find((p) => p.participantId === mine.participantId)
  if (!me) {
    logWarnOnce(
      'parseGame:no-participant',
      'lcu',
      'a game listed the player but carried no matching participant',
      shapeOf(game)
    )
    return null
  }

  // Full scoreboard (all 10 players) — names come from participantIdentities.
  const nameByPid = new Map<number, string>()
  const tagByPid = new Map<number, string>()
  for (const pi of identities) {
    const pl = pi?.player
    if (pl) {
      nameByPid.set(pi.participantId, pl.gameName || pl.summonerName || '')
      tagByPid.set(pi.participantId, pl.tagLine || '')
    }
  }
  const players: ScorePlayer[] = participants.map((p) => {
    const st = p.stats ?? {}
    return {
      pid: p.participantId,
      teamId: p.teamId,
      name: nameByPid.get(p.participantId) || '',
      tagLine: tagByPid.get(p.participantId) || '',
      championId: p.championId,
      kills: num(st.kills),
      deaths: num(st.deaths),
      assists: num(st.assists),
      cs: num(st.totalMinionsKilled) + num(st.neutralMinionsKilled),
      gold: num(st.goldEarned),
      damage: num(st.totalDamageDealtToChampions),
      vision: num(st.visionScore),
      items: [st.item0, st.item1, st.item2, st.item3, st.item4, st.item5, st.item6].map(num)
    }
  })

  const s = me.stats ?? {}
  const kills = num(s.kills)
  const assists = num(s.assists)
  const deaths = num(s.deaths)

  // Team kills = sum of every teammate's kills (mine included).
  const teamKills = participants
    .filter((p) => p.teamId === me.teamId)
    .reduce((sum, p) => sum + num(p.stats?.kills), 0)

  const laneCs = num(s.totalMinionsKilled)
  const jungleCs = num(s.neutralMinionsKilled)
  const cs = laneCs + jungleCs
  const durationS = num(game.gameDuration)
  if (durationS <= 0) {
    logWarnOnce(
      'parseGame:no-duration',
      'lcu',
      'a game reported no duration — cs/min and similar rates will be wrong',
      'gameId=' + game?.gameId
    )
  }
  const minutes = Math.max(durationS / 60, 1)

  // KP% = (my kills + my assists) / team's total kills.
  const kpPct = teamKills > 0 ? Math.round(((kills + assists) / teamKills) * 100) : 0

  const details: MatchDetails = {
    champLevel: num(s.champLevel),
    laneCs,
    jungleCs,
    totalDamage: num(s.totalDamageDealt),
    damageTaken: num(s.totalDamageTaken),
    objectiveDamage: num(s.damageDealtToObjectives),
    turretKills: num(s.turretKills),
    wardsPlaced: num(s.wardsPlaced),
    wardsKilled: num(s.wardsKilled),
    pinks: num(s.visionWardsBoughtInGame),
    doubleKills: num(s.doubleKills),
    tripleKills: num(s.tripleKills),
    quadraKills: num(s.quadraKills),
    pentaKills: num(s.pentaKills),
    largestKillingSpree: num(s.largestKillingSpree),
    largestMultiKill: num(s.largestMultiKill),
    items: [s.item0, s.item1, s.item2, s.item3, s.item4, s.item5, s.item6].map(num),
    spell1: num(me.spell1Id),
    spell2: num(me.spell2Id),
    keystone: num(s.perk0),
    primaryStyle: num(s.perkPrimaryStyle),
    subStyle: num(s.perkSubStyle),
    runes: [s.perk0, s.perk1, s.perk2, s.perk3, s.perk4, s.perk5].map(num),
    shards: [s.statPerk0, s.statPerk1, s.statPerk2].map(num)
  }

  return {
    gameId: game.gameId,
    participantId: num(me.participantId),
    playedAt: num(game.gameCreation) || Date.now(),
    queueId: num(game.queueId),
    queueName: queueName(num(game.queueId)),
    champion: championName(me.championId),
    championId: me.championId,
    win: asBool(s.win),
    kills,
    deaths,
    assists,
    cs,
    csPerMin: Math.round((cs / minutes) * 10) / 10,
    kpPct,
    vision: num(s.visionScore),
    damage: num(s.totalDamageDealtToChampions),
    gold: num(s.goldEarned),
    durationS,
    details,
    players
  }
}

// ---------- Export serialization ----------

export const SHEET_HEADER = [
  'Date',
  'Mode',
  'Champion',
  'Résultat',
  'K',
  'D',
  'A',
  'KDA',
  'CS',
  'CS/min',
  'KP %',
  'Vision',
  'Dégâts',
  'Or',
  'Durée (min)'
]

export function toRow(m: MatchRecord): (string | number)[] {
  const kda =
    m.deaths > 0 ? Math.round(((m.kills + m.assists) / m.deaths) * 100) / 100 : m.kills + m.assists
  return [
    new Date(m.playedAt).toISOString().slice(0, 16).replace('T', ' '),
    m.queueName,
    m.champion,
    m.win ? 'Victoire' : 'Défaite',
    m.kills,
    m.deaths,
    m.assists,
    kda,
    m.cs,
    m.csPerMin,
    m.kpPct,
    m.vision,
    m.damage,
    m.gold,
    Math.round(m.durationS / 60)
  ]
}

export function toCsv(matches: MatchRecord[]): string {
  const esc = (v: string | number): string => {
    const s = String(v)
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [SHEET_HEADER.map(esc).join(',')]
  for (const m of matches) lines.push(toRow(m).map(esc).join(','))
  return lines.join('\n')
}
