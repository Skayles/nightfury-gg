import { useMemo, type ReactNode } from 'react'
import type { MatchRecord, DdragonInfo } from '../../../preload/index.d'
import { useT } from '../i18n'
import { perChampion, champIcon, gamesLabel } from '../lib'

const PALETTE = [
  '#2DD4BF',
  '#C8A04A',
  '#6C8CFF',
  '#B06CFF',
  '#57C7E3',
  '#E38A57',
  '#2E9E7B',
  '#C0435A'
]

function Panel({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <div className="rounded-lg border border-edge bg-panel p-5">
      <h2 className="mb-3 text-sm font-medium text-slate-300">{title}</h2>
      {children}
    </div>
  )
}

function Legend({
  color,
  label,
  value
}: {
  color: string
  label: string
  value: ReactNode
}): JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: color }} />
      <span className="truncate text-slate-200">{label}</span>
      <span className="ml-auto shrink-0 text-mute">{value}</span>
    </div>
  )
}

function RingChart({
  segments,
  size = 150,
  thickness = 26,
  center
}: {
  segments: { value: number; color: string }[]
  size?: number
  thickness?: number
  center?: ReactNode
}): JSX.Element {
  const r = (size - thickness) / 2
  const C = 2 * Math.PI * r
  const total = segments.reduce((s, x) => s + x.value, 0) || 1
  let offset = 0
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="#132A3E"
            strokeWidth={thickness}
          />
          {segments.map((seg, i) => {
            const dash = (seg.value / total) * C
            const el = (
              <circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={seg.color}
                strokeWidth={thickness}
                strokeDasharray={`${dash} ${C - dash}`}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
              />
            )
            offset += dash
            return el
          })}
        </g>
      </svg>
      {center && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">{center}</div>
      )}
    </div>
  )
}

function WinrateTrend({ chrono }: { chrono: MatchRecord[] }): JSX.Element {
  const W = 720
  const H = 150
  const pad = 24
  let w = 0
  const pts = chrono.map((m, i) => {
    if (m.win) w++
    return Math.round((w / (i + 1)) * 100)
  })
  const n = pts.length
  const x = (i: number): number => pad + (n <= 1 ? 0 : (i / (n - 1)) * (W - 2 * pad))
  const y = (v: number): number => pad + (1 - v / 100) * (H - 2 * pad)
  const path = pts
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
    .join(' ')
  const area = `${path} L${x(n - 1).toFixed(1)},${y(0).toFixed(1)} L${x(0).toFixed(1)},${y(0).toFixed(1)} Z`
  const last = pts[pts.length - 1] ?? 0

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full">
      {[0, 50, 100].map((g) => (
        <g key={g}>
          <line
            x1={pad}
            x2={W - pad}
            y1={y(g)}
            y2={y(g)}
            stroke={g === 50 ? '#1E3A52' : '#16233a'}
            strokeWidth={g === 50 ? 1 : 0.5}
            strokeDasharray={g === 50 ? '4 4' : ''}
          />
          <text x={4} y={y(g) + 3} fontSize="10" fill="#7C93A8">
            {g}
          </text>
        </g>
      ))}
      <path d={area} fill="#2DD4BF" opacity="0.12" />
      <path d={path} fill="none" stroke="#2DD4BF" strokeWidth="2" strokeLinejoin="round" />
      {n > 0 && <circle cx={x(n - 1)} cy={y(last)} r="3.5" fill="#2DD4BF" />}
    </svg>
  )
}

export default function ProfileCharts({
  matches,
  ddragon
}: {
  matches: MatchRecord[]
  ddragon: DdragonInfo | null
}): JSX.Element {
  const t = useT()
  const chrono = useMemo(() => [...matches].reverse(), [matches])
  const champs = useMemo(() => perChampion(matches).slice(0, 8), [matches])
  const champIdByName = useMemo(
    () => new Map(matches.map((m) => [m.champion, m.championId])),
    [matches]
  )
  const queueSegs = useMemo(() => {
    const m = new Map<string, number>()
    for (const g of matches) m.set(g.queueName, (m.get(g.queueName) ?? 0) + 1)
    return [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, count], i) => ({ name, count, color: PALETTE[i % PALETTE.length] }))
  }, [matches])

  const version = ddragon?.version ?? ''
  const form = chrono.slice(-20)
  const maxGames = Math.max(1, ...champs.map((c) => c.games))
  const wins = matches.filter((m) => m.win).length
  const losses = matches.length - wins
  const winrate = matches.length ? Math.round((wins / matches.length) * 100) : 0

  if (matches.length < 3) {
    return (
      <div className="rounded-lg border border-dashed border-edge px-6 py-16 text-center text-mute">
        {t('charts.needMore')}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Panel title={t('charts.form')}>
        <div className="flex flex-wrap gap-1.5">
          {form.map((m, i) => (
            <span
              key={i}
              title={m.champion}
              className={
                'flex h-7 w-7 items-center justify-center rounded text-[11px] font-bold text-white ' +
                (m.win ? 'bg-win' : 'bg-loss')
              }
            >
              {m.win ? t('common.winShort') : t('common.lossShort')}
            </span>
          ))}
        </div>
      </Panel>

      <div className="grid gap-4 md:grid-cols-2">
        <Panel title={t('charts.winLoss')}>
          <div className="flex items-center gap-5">
            <RingChart
              segments={[
                { value: wins, color: '#2E9E7B' },
                { value: losses, color: '#C0435A' }
              ]}
              center={
                <>
                  <div className="font-display text-2xl text-teal">{winrate}%</div>
                  <div className="text-[11px] text-mute">{gamesLabel(matches.length, t)}</div>
                </>
              }
            />
            <div className="flex-1 space-y-1.5 text-sm">
              <Legend color="#2E9E7B" label={t('common.win')} value={`${wins}`} />
              <Legend color="#C0435A" label={t('common.loss')} value={`${losses}`} />
            </div>
          </div>
        </Panel>

        <Panel title={t('charts.byQueue')}>
          <div className="flex items-center gap-5">
            <RingChart segments={queueSegs.map((q) => ({ value: q.count, color: q.color }))} />
            <div className="flex-1 space-y-1.5 text-sm">
              {queueSegs.slice(0, 6).map((q) => (
                <Legend key={q.name} color={q.color} label={q.name} value={`${q.count}`} />
              ))}
            </div>
          </div>
        </Panel>
      </div>

      <Panel title={t('charts.winrateTrend')}>
        <div className="max-w-2xl">
          <WinrateTrend chrono={chrono} />
        </div>
      </Panel>

      <Panel title={t('charts.topChampions')}>
        <div className="space-y-2">
          {champs.map((c) => {
            const icon = champIcon(version, ddragon?.champions?.[champIdByName.get(c.champion) ?? -1])
            const good = c.winrate >= 50
            return (
              <div key={c.champion} className="flex items-center gap-3">
                {icon ? (
                  <img src={icon} alt="" className="h-7 w-7 shrink-0 rounded" />
                ) : (
                  <div className="h-7 w-7 shrink-0 rounded bg-panel2" />
                )}
                <div className="w-24 shrink-0 truncate text-sm text-slate-100">{c.champion}</div>
                <div className="h-3 flex-1 overflow-hidden rounded-full bg-night">
                  <div
                    className={'h-full rounded-full ' + (good ? 'bg-win' : 'bg-loss')}
                    style={{ width: `${Math.max(6, (c.games / maxGames) * 100)}%` }}
                  />
                </div>
                <div className="w-28 shrink-0 text-right text-xs text-mute">
                  <span className={good ? 'text-win' : 'text-loss'}>{c.winrate}%</span> ·{' '}
                  {gamesLabel(c.games, t)} · {c.kda} KDA
                </div>
              </div>
            )
          })}
        </div>
      </Panel>
    </div>
  )
}
