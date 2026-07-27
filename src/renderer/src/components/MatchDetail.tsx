import { useEffect, useState, type ReactNode } from 'react'
import type { MatchRecord, DdragonInfo, ItemPurchase, ScorePlayer } from '../../../preload/index.d'
import { useT } from '../i18n'
import { champIcon, itemIcon, fmtDate, fmtDuration, fmtNum } from '../lib'
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
  const [build, setBuild] = useState<ItemPurchase[] | null>(null)
  const [loadingBuild, setLoadingBuild] = useState(true)

  useEffect(() => {
    let alive = true
    setLoadingBuild(true)
    window.api
      .getMatchTimeline(m.gameId, m.participantId)
      .then((b) => alive && setBuild(b))
      .catch(() => alive && setBuild([]))
      .finally(() => alive && setLoadingBuild(false))
    return () => {
      alive = false
    }
  }, [m.gameId, m.participantId])

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
                  {t('detail.buildOrder')}
                </span>
              </div>
              {loadingBuild ? (
                <div className="text-sm text-mute">{t('detail.buildLoading')}</div>
              ) : build && build.length > 0 ? (
                <div className="flex items-start gap-1 overflow-x-auto pb-2">
                  {build.map((p, i) => {
                    const url = itemIcon(version, p.itemId)
                    return (
                      <div key={i} className="flex items-center gap-1">
                        <div className="flex shrink-0 flex-col items-center gap-1">
                          {url ? (
                            <img
                              src={url}
                              alt=""
                              title={ddragon?.items?.[p.itemId]?.name ?? ''}
                              className="h-9 w-9 rounded border border-edge"
                            />
                          ) : (
                            <div className="h-9 w-9 rounded border border-edge bg-night" />
                          )}
                          <span className="font-mono text-[10px] text-mute">
                            {fmtDuration(Math.round(p.timestamp / 1000))}
                          </span>
                        </div>
                        {i < build.length - 1 && <span className="pb-4 text-edge">›</span>}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="text-sm text-mute">{t('detail.buildNA')}</div>
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
