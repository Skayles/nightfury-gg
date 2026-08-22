import { useMemo } from 'react'
import type { MatchRecord, DdragonInfo } from '../../../preload/index.d'
import { useT, type TFunc } from '../i18n'
import { champIcon, perChampion, fmtDate, gamesLabel } from '../lib'

interface Session {
  games: MatchRecord[]
  wins: number
  winrate: number
  kda: number
  start: number
  end: number
}

function wr(games: MatchRecord[]): number {
  return games.length ? Math.round((games.filter((g) => g.win).length / games.length) * 100) : 0
}

interface Insight {
  text: string
  tone: 'good' | 'bad' | 'neutral'
  eff: number
}

/** Detect meaningful behavioral trends across sessions (min sample + effect). */
function computeInsights(matches: MatchRecord[], sessions: Session[], t: TFunc): Insight[] {
  const out: Insight[] = []
  const sub = (tpl: string, v: Record<string, string | number>): string => {
    let s = tpl
    for (const k of Object.keys(v)) s = s.replace(`{${k}}`, String(v[k]))
    return s
  }

  // 1. After a break — first game of each session vs the rest.
  if (sessions.length >= 5) {
    const firsts = sessions.map((s) => s.games[0])
    const firstIds = new Set(firsts.map((g) => g.gameId))
    const rest = matches.filter((m) => !firstIds.has(m.gameId))
    if (firsts.length >= 5 && rest.length >= 8) {
      const fw = wr(firsts)
      const rw = wr(rest)
      if (fw - rw >= 8)
        out.push({ text: sub(t('insight.afterBreakUp'), { x: fw, y: rw }), tone: 'good', eff: fw - rw })
      else if (rw - fw >= 8)
        out.push({ text: sub(t('insight.afterBreakDown'), { x: fw, y: rw }), tone: 'bad', eff: rw - fw })
    }
  }

  // 2. Fatigue — first 3 games of a session vs later ones.
  {
    let ew = 0, eg = 0, lw = 0, lg = 0
    for (const s of sessions)
      s.games.forEach((m, i) => {
        if (i < 3) { eg++; if (m.win) ew++ } else { lg++; if (m.win) lw++ }
      })
    if (eg >= 8 && lg >= 8) {
      const e = Math.round((ew / eg) * 100)
      const l = Math.round((lw / lg) * 100)
      if (e - l >= 8) out.push({ text: sub(t('insight.fatigue'), { x: e, y: l }), tone: 'bad', eff: e - l })
      else if (l - e >= 8) out.push({ text: sub(t('insight.warmup'), { x: e, y: l }), tone: 'good', eff: l - e })
    }
  }

  // 3. Time of day.
  {
    const key = (h: number): string => (h < 6 ? 'night' : h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening')
    const groups: Record<string, MatchRecord[]> = { morning: [], afternoon: [], evening: [], night: [] }
    for (const m of matches) groups[key(new Date(m.playedAt).getHours())].push(m)
    const cand = Object.entries(groups)
      .filter(([, g]) => g.length >= 8)
      .map(([k, g]) => ({ k, w: wr(g) }))
      .sort((a, b) => a.w - b.w)
    if (cand.length >= 2) {
      const worst = cand[0]
      const best = cand[cand.length - 1]
      if (best.w - worst.w >= 12)
        out.push({
          text: sub(t('insight.timeBest'), {
            a: t('insight.' + best.k),
            x: best.w,
            b: t('insight.' + worst.k),
            y: worst.w
          }),
          tone: 'neutral',
          eff: best.w - worst.w
        })
    }
  }

  // 4. Momentum — game after a win vs after a loss (within sessions).
  {
    let aw = 0, ag = 0, lw = 0, lg = 0
    for (const s of sessions)
      for (let i = 1; i < s.games.length; i++) {
        const prev = s.games[i - 1]
        const cur = s.games[i]
        if (prev.win) { ag++; if (cur.win) aw++ } else { lg++; if (cur.win) lw++ }
      }
    if (ag >= 8 && lg >= 8) {
      const awr = Math.round((aw / ag) * 100)
      const lwr = Math.round((lw / lg) * 100)
      if (awr - lwr >= 12)
        out.push({
          text: sub(t('insight.momentumTilt'), { x: awr, y: lwr, d: awr - lwr }),
          tone: 'bad',
          eff: awr - lwr
        })
    }
  }

  // 5. Weekend vs weekday.
  {
    const we = matches.filter((m) => [0, 6].includes(new Date(m.playedAt).getDay()))
    const wd = matches.filter((m) => ![0, 6].includes(new Date(m.playedAt).getDay()))
    if (we.length >= 8 && wd.length >= 8) {
      const w = wr(we)
      const d = wr(wd)
      if (w - d >= 10) out.push({ text: sub(t('insight.weekend'), { x: w, y: d }), tone: 'neutral', eff: w - d })
      else if (d - w >= 10) out.push({ text: sub(t('insight.weekday'), { x: d, y: w }), tone: 'neutral', eff: d - w })
    }
  }

  return out.sort((a, b) => b.eff - a.eff).slice(0, 4)
}

function median(arr: number[]): number {
  if (!arr.length) return 0
  const s = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/**
 * Group games into sessions using an adaptive gap threshold learned from the
 * player's own cadence, rather than a fixed duration. The break that separates
 * two sessions is ~3× the player's median between-games gap (partie + queue +
 * champ select), clamped to a sensible 45 min – 3 h window.
 */
function buildSessions(matches: MatchRecord[]): { sessions: Session[]; thresholdMin: number } {
  const chrono = [...matches].sort((a, b) => a.playedAt - b.playedAt)
  if (chrono.length === 0) return { sessions: [], thresholdMin: 0 }

  // Gaps (minutes) between the end of a game and the start of the next one.
  const gaps: number[] = []
  for (let i = 1; i < chrono.length; i++) {
    const prevEnd = chrono[i - 1].playedAt + chrono[i - 1].durationS * 1000
    gaps.push(Math.max(0, (chrono[i].playedAt - prevEnd) / 60000))
  }

  // Cadence = median of "within-session" gaps (ignore obvious long breaks).
  const withinSession = gaps.filter((g) => g <= 90)
  const cadence = withinSession.length ? median(withinSession) : 25
  const thresholdMin = Math.min(180, Math.max(45, Math.round(cadence * 3)))

  const groups: MatchRecord[][] = [[chrono[0]]]
  for (let i = 1; i < chrono.length; i++) {
    if (gaps[i - 1] > thresholdMin) groups.push([chrono[i]])
    else groups[groups.length - 1].push(chrono[i])
  }

  const sessions = groups
    .map((g) => {
      const wins = g.filter((x) => x.win).length
      const k = g.reduce((s, x) => s + x.kills, 0)
      const d = g.reduce((s, x) => s + x.deaths, 0)
      const a = g.reduce((s, x) => s + x.assists, 0)
      return {
        games: g,
        wins,
        winrate: Math.round((wins / g.length) * 100),
        kda: Math.round(((k + a) / Math.max(d, 1)) * 100) / 100,
        start: g[0].playedAt,
        end: g[g.length - 1].playedAt
      }
    })
    .reverse() // most recent session first

  return { sessions, thresholdMin }
}

function WLStrip({ games, t }: { games: MatchRecord[]; t: TFunc }): JSX.Element {
  return (
    <div className="flex flex-wrap gap-1">
      {games.map((m, i) => (
        <span
          key={i}
          className={
            'flex h-6 w-6 items-center justify-center rounded text-[10px] font-bold text-white ' +
            (m.win ? 'bg-win' : 'bg-loss')
          }
        >
          {m.win ? t('common.winShort') : t('common.lossShort')}
        </span>
      ))}
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }): JSX.Element {
  return (
    <div className="rounded-lg bg-panel2 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-mute">{label}</div>
      <div className={'text-lg font-semibold ' + (tone ?? 'text-slate-100')}>{value}</div>
    </div>
  )
}

export default function SessionAnalysis({
  matches,
  ddragon,
  onClose
}: {
  matches: MatchRecord[]
  ddragon: DdragonInfo | null
  onClose: () => void
}): JSX.Element {
  const t = useT()
  const { sessions, thresholdMin } = useMemo(() => buildSessions(matches), [matches])
  const latest = sessions[0]

  // Fatigue: winrate over the first 3 games of each session vs the rest.
  const fatigue = useMemo(() => {
    let ew = 0
    let eg = 0
    let lw = 0
    let lg = 0
    for (const s of sessions) {
      s.games.forEach((m, i) => {
        if (i < 3) {
          eg++
          if (m.win) ew++
        } else {
          lg++
          if (m.win) lw++
        }
      })
    }
    return {
      earlyWr: eg ? Math.round((ew / eg) * 100) : null,
      lateWr: lg ? Math.round((lw / lg) * 100) : null,
      eg,
      lg
    }
  }, [sessions])

  const latestChamps = useMemo(
    () => (latest ? perChampion(latest.games).slice(0, 4) : []),
    [latest]
  )
  const version = ddragon?.version ?? ''
  const champIdByName = useMemo(
    () => new Map(matches.map((m) => [m.champion, m.championId])),
    [matches]
  )

  // Losing streak at the very end of the latest session.
  const tailStreak = useMemo(() => {
    if (!latest) return 0
    let n = 0
    for (let i = latest.games.length - 1; i >= 0; i--) {
      if (!latest.games[i].win) n++
      else break
    }
    return n
  }, [latest])

  // Overall averages (across the analysed set) to compare the session against.
  const overall = useMemo(() => {
    const total = matches.length || 1
    const wins = matches.filter((m) => m.win).length
    const k = matches.reduce((s, m) => s + m.kills, 0)
    const d = matches.reduce((s, m) => s + m.deaths, 0)
    const a = matches.reduce((s, m) => s + m.assists, 0)
    return {
      winrate: Math.round((wins / total) * 100),
      kda: Math.round(((k + a) / Math.max(d, 1)) * 100) / 100
    }
  }, [matches])

  // Extended stats for the latest session.
  const extra = useMemo(() => {
    if (!latest) return null
    const g = latest.games
    const kdaOf = (m: MatchRecord): number => (m.kills + m.assists) / Math.max(m.deaths, 1)
    let best = g[0]
    for (const m of g) if (kdaOf(m) > kdaOf(best)) best = m
    return {
      csPerMin: Math.round((g.reduce((s, m) => s + m.csPerMin, 0) / g.length) * 10) / 10,
      kp: Math.round(g.reduce((s, m) => s + m.kpPct, 0) / g.length),
      timeMin: Math.round(g.reduce((s, m) => s + m.durationS, 0) / 60),
      best
    }
  }, [latest])

  const verdict = useMemo(() => {
    if (!latest) return null
    if (latest.winrate >= 60) return { label: t('session.verdictGood'), cls: 'win' }
    if (latest.winrate <= 40) return { label: t('session.verdictRough'), cls: 'loss' }
    return { label: t('session.verdictMixed'), cls: 'gold' }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latest])

  const fmtMin = (m: number): string =>
    m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}` : `${m}min`

  const insights = useMemo(() => computeInsights(matches, sessions, t), [matches, sessions, t])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        onClick={(e) => e.stopPropagation()}
        className="dialog relative flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden"
      >
        <div className="flex items-center justify-between border-b border-edge px-6 py-4">
          <div>
            <h2 className="font-display text-lg text-slate-100">{t('session.title')}</h2>
            {sessions.length > 0 && (
              <div className="text-[11px] text-mute">
                {t('session.detected')
                  .replace('{count}', String(sessions.length))
                  .replace('{gap}', String(thresholdMin))}
              </div>
            )}
          </div>
          <button onClick={onClose} className="rounded-md px-2 py-1 text-mute hover:text-slate-100">
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto p-6">
          {!latest ? (
            <div className="py-12 text-center text-mute">{t('session.none')}</div>
          ) : (
            <>
              <div>
                <div className="mb-2 flex items-center gap-2 text-sm text-slate-300">
                  {t('session.latest')}{' '}
                  <span className="text-mute">
                    · {fmtDate(latest.start)} → {fmtDate(latest.end)}
                  </span>
                  {verdict && (
                    <span
                      className={
                        'ml-auto rounded-full px-2.5 py-0.5 text-xs font-semibold ' +
                        (verdict.cls === 'win'
                          ? 'bg-win/15 text-win'
                          : verdict.cls === 'loss'
                            ? 'bg-loss/15 text-loss'
                            : 'bg-gold/15 text-gold')
                      }
                    >
                      {verdict.label}
                    </span>
                  )}
                </div>
                <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Stat label={t('session.games')} value={gamesLabel(latest.games.length, t)} />
                  <Stat
                    label={t('session.record')}
                    value={`${latest.wins}V ${latest.games.length - latest.wins}D`}
                  />
                  <Stat
                    label={t('session.winrate')}
                    value={`${latest.winrate}%`}
                    tone={latest.winrate >= 50 ? 'text-win' : 'text-loss'}
                  />
                  <Stat label={t('session.avgKda')} value={`${latest.kda}`} tone="text-teal" />
                </div>
                {extra && (
                  <div className="mb-3 grid grid-cols-3 gap-2">
                    <Stat label="CS/min" value={`${extra.csPerMin}`} />
                    <Stat label="KP" value={`${extra.kp}%`} />
                    <Stat label={t('session.timePlayed')} value={fmtMin(extra.timeMin)} />
                  </div>
                )}
                <WLStrip games={latest.games} t={t} />
              </div>

              <div className="rounded-lg border border-edge bg-panel2/40 px-4 py-3 text-sm">
                <div className="mb-1 text-[11px] uppercase tracking-wide text-mute">
                  {t('session.vsAvg')}
                </div>
                <div className="flex flex-wrap gap-x-8 gap-y-1">
                  <span>
                    {t('session.winrate')} :{' '}
                    <span className={latest.winrate >= overall.winrate ? 'text-win' : 'text-loss'}>
                      {latest.winrate >= overall.winrate ? '+' : ''}
                      {latest.winrate - overall.winrate}%
                    </span>{' '}
                    <span className="text-mute">({t('session.avg')} {overall.winrate}%)</span>
                  </span>
                  <span>
                    KDA :{' '}
                    <span className={latest.kda >= overall.kda ? 'text-win' : 'text-loss'}>
                      {latest.kda >= overall.kda ? '+' : ''}
                      {Math.round((latest.kda - overall.kda) * 100) / 100}
                    </span>{' '}
                    <span className="text-mute">({t('session.avg')} {overall.kda})</span>
                  </span>
                </div>
              </div>

              {extra && (
                <div className="flex items-center gap-3 rounded-lg border border-teal/25 bg-teal/5 px-4 py-3">
                  <span className="text-[11px] uppercase tracking-wide text-mute">
                    {t('session.best')}
                  </span>
                  {champIcon(version, ddragon?.champions?.[extra.best.championId]) ? (
                    <img
                      src={champIcon(version, ddragon?.champions?.[extra.best.championId]) as string}
                      alt=""
                      className="h-8 w-8 rounded"
                    />
                  ) : null}
                  <span className="text-sm text-slate-100">{extra.best.champion}</span>
                  <span className="text-sm text-teal">
                    {extra.best.kills}/{extra.best.deaths}/{extra.best.assists}
                  </span>
                  <span className={'ml-auto text-xs ' + (extra.best.win ? 'text-win' : 'text-loss')}>
                    {extra.best.win ? t('common.win') : t('common.loss')}
                  </span>
                </div>
              )}

              {insights.length > 0 && (
                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <span className="h-3 w-0.5 rounded bg-teal" />
                    <span className="text-[11px] uppercase tracking-wide text-mute">
                      {t('insight.title')}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {insights.map((ins, i) => (
                      <div
                        key={i}
                        className={
                          'flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ' +
                          (ins.tone === 'good'
                            ? 'border-win/30 bg-win/5 text-slate-200'
                            : ins.tone === 'bad'
                              ? 'border-loss/30 bg-loss/5 text-slate-200'
                              : 'border-edge bg-panel2/40 text-slate-200')
                        }
                      >
                        <span
                          className={
                            'mt-0.5 shrink-0 ' +
                            (ins.tone === 'good'
                              ? 'text-win'
                              : ins.tone === 'bad'
                                ? 'text-loss'
                                : 'text-teal')
                          }
                        >
                          {ins.tone === 'good' ? '▲' : ins.tone === 'bad' ? '▼' : '●'}
                        </span>
                        <span>{ins.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {tailStreak >= 3 && (
                <div className="rounded-lg border border-loss/40 bg-loss/10 px-4 py-3 text-sm text-loss">
                  {t('session.streakWarn').replace('{n}', String(tailStreak))}
                </div>
              )}

              {fatigue.earlyWr != null && fatigue.lateWr != null && fatigue.lg >= 3 && (
                <div className="rounded-lg border border-edge bg-panel2/50 px-4 py-3">
                  <div className="mb-1 text-[11px] uppercase tracking-wide text-mute">
                    {t('session.fatigueTitle')}
                  </div>
                  <div className="flex items-center gap-6 text-sm">
                    <div>
                      {t('session.early')} :{' '}
                      <span className={fatigue.earlyWr >= 50 ? 'text-win' : 'text-loss'}>
                        {fatigue.earlyWr}%
                      </span>
                    </div>
                    <div>
                      {t('session.late')} :{' '}
                      <span className={fatigue.lateWr >= 50 ? 'text-win' : 'text-loss'}>
                        {fatigue.lateWr}%
                      </span>
                    </div>
                  </div>
                  {fatigue.earlyWr - fatigue.lateWr >= 15 && (
                    <div className="mt-1 text-xs text-mute">{t('session.fatigueHint')}</div>
                  )}
                </div>
              )}

              {latestChamps.length > 0 && (
                <div>
                  <div className="mb-2 text-[11px] uppercase tracking-wide text-mute">
                    {t('session.champions')}
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {latestChamps.map((c) => {
                      const icon = champIcon(version, ddragon?.champions?.[champIdByName.get(c.champion) ?? -1])
                      return (
                        <div key={c.champion} className="flex items-center gap-2">
                          {icon ? (
                            <img src={icon} alt="" className="h-7 w-7 rounded" />
                          ) : (
                            <div className="h-7 w-7 rounded bg-panel2" />
                          )}
                          <span className="text-sm text-slate-200">
                            {gamesLabel(c.games, t)} · <span className={c.winrate >= 50 ? 'text-win' : 'text-loss'}>{c.winrate}%</span>
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {sessions.length > 1 && (
                <div>
                  <div className="mb-2 text-[11px] uppercase tracking-wide text-mute">
                    {t('session.previous')}
                  </div>
                  <div className="space-y-1.5">
                    {sessions.slice(1, 8).map((s, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between rounded-md bg-panel2/40 px-3 py-2 text-sm"
                      >
                        <span className="text-mute">{fmtDate(s.start)}</span>
                        <span className="text-slate-300">
                          {gamesLabel(s.games.length, t)} · {s.wins}V {s.games.length - s.wins}D
                        </span>
                        <span className={s.winrate >= 50 ? 'text-win' : 'text-loss'}>
                          {s.winrate}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
