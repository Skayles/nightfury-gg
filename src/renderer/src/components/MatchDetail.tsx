import { useEffect, useState, type ReactNode } from 'react'
import type { MatchRecord, DdragonInfo, TimelineEvent, ScorePlayer } from '../../../preload/index.d'
import { useT, type TFunc } from '../i18n'
import { champIcon, fmtDate, fmtDuration, fmtNum } from '../lib'
import ItemRow from './ItemRow'

function Section({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2">
        <span className="h-3 w-0.5 rounded bg-teal" />
        <span className="text-[11px] uppercase tracking-wide text-mute">{title}</span>
      </div>
      <div className="divide-y divide-edge/50">{children}</div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string | number }): JSX.Element {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-mute">{label}</span>
      <span className="font-mono text-sm text-slate-100">{value}</span>
    </div>
  )
}

function Highlight({ label, value, tone }: { label: string; value: string; tone?: string }): JSX.Element {
  return (
    <div className="flex-1 rounded-lg bg-night px-3 py-2 text-center">
      <div className={'font-display text-xl ' + (tone ?? 'text-slate-100')}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-mute">{label}</div>
    </div>
  )
}

function ScoreRow({
  p,
  ddragon,
  me
}: {
  p: ScorePlayer
  ddragon: DdragonInfo | null
  me: boolean
}): JSX.Element {
  const icon = champIcon(ddragon?.version ?? '', ddragon?.champions?.[p.championId])
  return (
    <div
      className={
        'flex items-center gap-2 rounded px-2 py-1 ' + (me ? 'bg-teal/10' : '')
      }
    >
      {icon ? (
        <img src={icon} alt="" className="h-7 w-7 shrink-0 rounded" />
      ) : (
        <div className="h-7 w-7 shrink-0 rounded bg-panel2" />
      )}
      <span
        className={'flex-1 truncate text-xs ' + (me ? 'font-semibold text-teal' : 'text-slate-100')}
      >
        {p.name || '—'}
      </span>
      <span className="w-16 text-center font-mono text-xs text-slate-200">
        {p.kills}/{p.deaths}/{p.assists}
      </span>
      <span className="w-10 text-center text-xs text-mute">{p.cs}</span>
      <span className="w-12 text-center text-xs text-mute">{fmtNum(p.damage)}</span>
      <span className="w-12 text-center text-xs text-mute">{fmtNum(p.gold)}</span>
      <div className="w-[150px] shrink-0">
        <ItemRow items={p.items} ddragon={ddragon} size={20} />
      </div>
    </div>
  )
}

function Scoreboard({
  players,
  ddragon,
  mePid
}: {
  players: ScorePlayer[]
  ddragon: DdragonInfo | null
  mePid: number
}): JSX.Element {
  const t = useT()
  const teams = [100, 200].map((tid) => players.filter((p) => p.teamId === tid))
  const header = (
    <div className="flex items-center gap-2 px-2 text-[10px] uppercase tracking-wide text-mute">
      <span className="h-7 w-7 shrink-0" />
      <span className="flex-1" />
      <span className="w-16 text-center">KDA</span>
      <span className="w-10 text-center">CS</span>
      <span className="w-12 text-center">{t('detail.colDmg')}</span>
      <span className="w-12 text-center">{t('detail.colGold')}</span>
      <span className="w-[150px] shrink-0 text-center">Items</span>
    </div>
  )
  return (
    <div className="space-y-4">
      {header}
      {teams.map((team, i) => (
        <div key={i}>
          <div className="mb-1 flex items-center gap-2">
            <span className={'h-2.5 w-2.5 rounded-full ' + (i === 0 ? 'bg-teal' : 'bg-loss')} />
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-300">
              {i === 0 ? t('live.teamBlue') : t('live.teamRed')}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            {team.map((p) => (
              <ScoreRow key={p.pid} p={p} ddragon={ddragon} me={p.pid === mePid} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function Highlights({
  events,
  players,
  ddragon,
  mePid,
  t
}: {
  events: TimelineEvent[]
  players: ScorePlayer[]
  ddragon: DdragonInfo | null
  mePid: number
  t: TFunc
}): JSX.Element {
  const version = ddragon?.version ?? ''
  const byPid = new Map(players.map((p) => [p.pid, p]))
  const cIcon = (pid: number): string | null =>
    champIcon(version, ddragon?.champions?.[byPid.get(pid)?.championId ?? -1])
  const cName = (pid: number): string =>
    ddragon?.champNames?.[byPid.get(pid)?.championId ?? -1] ?? '—'
  const teamColor = (pid: number): string =>
    byPid.get(pid)?.teamId === 200 ? 'text-loss' : 'text-teal'

  const involved = (e: TimelineEvent): boolean =>
    e.killerId === mePid || e.victimId === mePid || (e.assists?.includes(mePid) ?? false)
  const shown = events.filter((e) => e.kind !== 'kill' || e.firstBlood || involved(e))

  const monster = (e: TimelineEvent): { emoji: string; label: string } => {
    if (e.monster === 'BARON_NASHOR') return { emoji: '🟣', label: t('detail.baron') }
    if ((e.monster || '').includes('HERALD')) return { emoji: '👁', label: t('detail.herald') }
    const el = (e.subType || '').replace(/_?DRAGON.*/i, '').replace(/_/g, ' ').trim().toLowerCase()
    return { emoji: '🐉', label: el ? `${t('detail.dragon')} · ${el}` : t('detail.dragon') }
  }
  const lane = (l?: string): string =>
    (l || '').replace('_LANE', '').replace('TOP', 'top').replace('MID', 'mid').replace('BOT', 'bot').toLowerCase()

  return (
    <div className="flex max-h-72 flex-col gap-0.5 overflow-y-auto pr-1">
      {shown.map((e, i) => {
        const time = fmtDuration(Math.round(e.t / 1000))
        if (e.kind === 'kill') {
          const hasKiller = e.killerId > 0
          return (
            <div
              key={i}
              className={
                'flex items-center gap-2 rounded px-2 py-1 text-xs ' +
                (involved(e) ? 'bg-teal/10' : '')
              }
            >
              <span className="w-10 shrink-0 font-mono text-mute">{time}</span>
              {e.firstBlood && (
                <span className="shrink-0 rounded bg-gold/20 px-1.5 py-0.5 text-[10px] font-semibold text-gold">
                  {t('detail.firstBlood')}
                </span>
              )}
              {hasKiller && cIcon(e.killerId) && (
                <img src={cIcon(e.killerId) as string} alt="" className="h-5 w-5 rounded" />
              )}
              <span className={teamColor(e.killerId) + ' font-medium'}>
                {hasKiller ? cName(e.killerId) : '☠'}
              </span>
              <span className="text-mute">{t('detail.killed')}</span>
              <span className={teamColor(e.victimId ?? 0) + ' font-medium'}>
                {cName(e.victimId ?? 0)}
              </span>
              {cIcon(e.victimId ?? 0) && (
                <img
                  src={cIcon(e.victimId ?? 0) as string}
                  alt=""
                  className="h-5 w-5 rounded opacity-70"
                />
              )}
              {e.killerId === mePid && <span className="text-[10px] text-teal">★</span>}
            </div>
          )
        }
        if (e.kind === 'monster') {
          const mo = monster(e)
          return (
            <div key={i} className="flex items-center gap-2 rounded px-2 py-1 text-xs">
              <span className="w-10 shrink-0 font-mono text-mute">{time}</span>
              <span>{mo.emoji}</span>
              <span className={teamColor(e.killerId) + ' font-medium capitalize'}>{mo.label}</span>
            </div>
          )
        }
        const isInhib = (e.building || '').includes('INHIBITOR')
        const label = `${isInhib ? t('detail.inhibitor') : t('detail.tower')}${
          lane(e.lane) ? ` · ${lane(e.lane)}` : ''
        }`
        return (
          <div key={i} className="flex items-center gap-2 rounded px-2 py-1 text-xs">
            <span className="w-10 shrink-0 font-mono text-mute">{time}</span>
            <span>{isInhib ? '🔺' : '🏰'}</span>
            <span className={teamColor(e.killerId) + ' font-medium'}>{label}</span>
          </div>
        )
      })}
    </div>
  )
}

export default function MatchDetail({
  match,
  ddragon,
  onClose
}: {
  match: MatchRecord
  ddragon: DdragonInfo | null
  onClose: () => void
}): JSX.Element {
  const t = useT()
  const m = match
  const d = m.details
  const version = ddragon?.version ?? ''
  const icon = champIcon(version, ddragon?.champions?.[m.championId])
  const kda =
    m.deaths > 0 ? ((m.kills + m.assists) / m.deaths).toFixed(2) : (m.kills + m.assists).toFixed(2)

  const [tab, setTab] = useState<'perso' | 'full'>('perso')
  const [events, setEvents] = useState<TimelineEvent[] | null>(null)
  const [loadingTl, setLoadingTl] = useState(true)

  useEffect(() => {
    let alive = true
    setLoadingTl(true)
    window.api
      .getMatchTimeline(m.gameId)
      .then((e) => alive && setEvents(e))
      .catch(() => alive && setEvents([]))
      .finally(() => alive && setLoadingTl(false))
    return () => {
      alive = false
    }
  }, [m.gameId])

  const multis: string[] = []
  if (d) {
    if (d.pentaKills) multis.push(`${d.pentaKills}× Penta`)
    if (d.quadraKills) multis.push(`${d.quadraKills}× Quadra`)
    if (d.tripleKills) multis.push(`${d.tripleKills}× Triple`)
    if (d.doubleKills) multis.push(`${d.doubleKills}× Double`)
  }

  function TabButton({ id, label }: { id: 'perso' | 'full'; label: string }): JSX.Element {
    const active = tab === id
    return (
      <button
        onClick={() => setTab(id)}
        className={
          'rounded-md px-3 py-1.5 text-sm font-medium transition-colors ' +
          (active ? 'bg-panel2 text-teal' : 'text-mute hover:text-slate-200')
        }
      >
        {label}
      </button>
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-h-[86vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-edge bg-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={
            'relative flex items-center gap-4 rounded-t-2xl px-6 py-5 ' +
            (m.win
              ? 'bg-gradient-to-r from-win/20 via-win/5 to-transparent'
              : 'bg-gradient-to-r from-loss/20 via-loss/5 to-transparent')
          }
        >
          {icon ? (
            <img
              src={icon}
              alt={m.champion}
              className={'h-16 w-16 rounded-xl ring-2 ' + (m.win ? 'ring-win/50' : 'ring-loss/50')}
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-panel2 text-lg text-mute">
              {m.champion.slice(0, 2)}
            </div>
          )}
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-display text-2xl text-slate-100">{m.champion}</span>
              <span className={'text-sm font-semibold ' + (m.win ? 'text-win' : 'text-loss')}>
                {m.win ? t('common.win') : t('common.loss')}
              </span>
            </div>
            <div className="mt-0.5 text-xs text-mute">
              {m.queueName} · {fmtDate(m.playedAt)} · {fmtDuration(m.durationS)}
              {d ? ` · ${t('detail.level', { n: d.champLevel })}` : ''}
            </div>
          </div>
          <button
            onClick={onClose}
            className="absolute right-4 top-4 rounded-md px-2 py-1 text-mute hover:text-slate-100"
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-edge px-6 pt-3">
          <TabButton id="perso" label={t('detail.tabPerso')} />
          <TabButton id="full" label={t('detail.tabFull')} />
        </div>

        {tab === 'perso' ? (
          <div className="space-y-6 p-6">
            <div className="flex gap-2">
              <Highlight label="KDA" value={`${m.kills}/${m.deaths}/${m.assists}`} />
              <Highlight label={t('detail.ratio')} value={kda} tone="text-teal" />
              <Highlight label="KP" value={`${m.kpPct}%`} />
              <Highlight label="CS" value={`${m.cs}`} />
              <Highlight label="CS/min" value={`${m.csPerMin}`} />
            </div>

            <div>
              <div className="mb-2 flex items-center gap-2">
                <span className="h-3 w-0.5 rounded bg-gold" />
                <span className="text-[11px] uppercase tracking-wide text-mute">
                  {t('detail.highlights')}
                </span>
              </div>
              {loadingTl ? (
                <div className="text-sm text-mute">{t('detail.buildLoading')}</div>
              ) : events && events.length > 0 && m.players && m.players.length > 0 ? (
                <Highlights
                  events={events}
                  players={m.players}
                  ddragon={ddragon}
                  mePid={m.participantId}
                  t={t}
                />
              ) : (
                <div className="text-sm text-mute">{t('detail.noHighlights')}</div>
              )}
            </div>

            {d && (
              <div className="grid grid-cols-1 gap-x-8 gap-y-5 md:grid-cols-2">
                <Section title={t('detail.combat')}>
                  <Row label={t('detail.dmgChamps')} value={fmtNum(m.damage)} />
                  <Row label={t('detail.dmgTotal')} value={fmtNum(d.totalDamage)} />
                  <Row label={t('detail.dmgTaken')} value={fmtNum(d.damageTaken)} />
                  <Row label={t('detail.dmgObj')} value={fmtNum(d.objectiveDamage)} />
                  <Row label={t('detail.turrets')} value={d.turretKills} />
                  <Row label={t('detail.multi')} value={d.largestMultiKill} />
                  <Row label={t('detail.spree')} value={d.largestKillingSpree} />
                </Section>
                <div className="space-y-5">
                  <Section title={t('detail.farm')}>
                    <Row label={t('detail.cslj')} value={`${d.laneCs} / ${d.jungleCs}`} />
                    <Row label={t('detail.gold')} value={fmtNum(m.gold)} />
                  </Section>
                  <Section title="Vision">
                    <Row label={t('detail.visionScore')} value={m.vision} />
                    <Row label={t('detail.wardsPlaced')} value={d.wardsPlaced} />
                    <Row label={t('detail.wardsKilled')} value={d.wardsKilled} />
                    <Row label={t('detail.pinks')} value={d.pinks} />
                  </Section>
                </div>
              </div>
            )}

            {multis.length > 0 && (
              <div className="rounded-lg border border-gold/30 bg-gold/10 px-4 py-2 text-sm text-gold">
                {multis.join(' · ')}
              </div>
            )}
            {!d && <div className="text-xs text-mute">{t('detail.noDetails')}</div>}
          </div>
        ) : (
          <div className="p-6">
            {m.players && m.players.length > 0 ? (
              <Scoreboard players={m.players} ddragon={ddragon} mePid={m.participantId} />
            ) : (
              <div className="py-10 text-center text-sm text-mute">{t('detail.noScore')}</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
