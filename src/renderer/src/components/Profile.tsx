import { useEffect, useMemo, useState } from 'react'
import type {
  MatchRecord,
  MatchFilter,
  DdragonInfo,
  SummonerProfile
} from '../../../preload/index.d'
import { useT, type TFunc } from '../i18n'
import FilterBar from './FilterBar'
import MatchDetail from './MatchDetail'
import ProfileCharts from './ProfileCharts'
import SessionAnalysis from './SessionAnalysis'
import ItemRow from './ItemRow'
import { applyFilter, aggregate, perChampion, fmtDate, champIcon, profileIcon, gamesLabel, runeIcon } from '../lib'
import SpellPair from './SpellPair'
import RankBadges from './RankBadges'

const NO_FILTER: MatchFilter = { queueId: null, champion: null, result: null, sinceDays: null }

function Card({ label, value, accent }: { label: string; value: string; accent?: boolean }): JSX.Element {
  return (
    <div className="tile">
      <div className="section-label">{label}</div>
      <div className={'mt-0.5 font-display text-2xl ' + (accent ? 'text-teal' : 'text-slate-100')}>
        {value}
      </div>
    </div>
  )
}

function ProfileRail({
  summoner,
  champs,
  playedWith,
  ddragon
}: {
  summoner: SummonerProfile | null
  champs: ReturnType<typeof perChampion>
  playedWith: { name: string; games: number; wins: number; winrate: number }[]
  ddragon: DdragonInfo | null
}): JSX.Element {
  const t = useT()
  const version = ddragon?.version ?? ''

  return (
    <aside className="flex flex-col gap-4">
      <div className="card p-4">
        <div className="section-label mb-2">{t('profile.ranked')}</div>
        {summoner ? (
          <RankBadges summoner={summoner} col big />
        ) : (
          <div className="text-sm text-mute">{t('profile.unranked')}</div>
        )}
      </div>

      {champs.length > 0 && (
        <div className="card p-4">
          <div className="section-label mb-3">{t('profile.byChampion')}</div>
          <div className="flex flex-col gap-1">
            {champs.slice(0, 5).map((c) => {
              const icon = champIcon(version, ddragon?.champions?.[c.championId])
              const losses = c.games - c.wins
              return (
                <div key={c.champion} className="flex items-center gap-2.5 py-1">
                  {icon ? (
                    <img src={icon} alt="" className="h-8 w-8 rounded" />
                  ) : (
                    <div className="h-8 w-8 rounded bg-panel2" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-slate-200">{c.champion}</div>
                    <div className="text-[11px] text-mute">{c.kda} KDA</div>
                  </div>
                  <div className="text-right text-xs">
                    <div className={c.winrate >= 50 ? 'text-win' : 'text-loss'}>{c.winrate}%</div>
                    <div className="text-mute">
                      {c.wins}
                      {t('common.winShort')} {losses}
                      {t('common.lossShort')}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {playedWith.length > 0 && (
        <div className="card p-4">
          <div className="section-label mb-3">{t('profile.playedWith')}</div>
          <div className="flex flex-col gap-1.5">
            {playedWith.map((p) => (
              <div key={p.name} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate text-slate-200">{p.name}</span>
                <span className="shrink-0 text-xs">
                  <span className="text-mute">{gamesLabel(p.games, t)} · </span>
                  <span className={p.winrate >= 50 ? 'text-win' : 'text-loss'}>{p.winrate}%</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </aside>
  )
}

function Sparkline({ data, up }: { data: number[]; up: boolean }): JSX.Element {
  const w = 76
  const h = 30
  const pad = 3
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const pts = data
    .map((v, i) => {
      const x = pad + (data.length === 1 ? 0 : (i / (data.length - 1)) * (w - 2 * pad))
      const y = h - pad - ((v - min) / range) * (h - 2 * pad)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  return (
    <svg width={w} height={h} className={'shrink-0 ' + (up ? 'text-win' : 'text-loss')}>
      <polyline
        points={pts}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity="0.9"
      />
    </svg>
  )
}

function StatTile({
  label,
  value,
  series,
  delta,
  digits = 1,
  unit = '',
  accent
}: {
  label: string
  value: string
  series: number[]
  delta: number | null
  digits?: number
  unit?: string
  accent?: boolean
}): JSX.Element {
  const t = useT()
  const up = (delta ?? 0) >= 0
  return (
    <div className="tile flex items-center justify-between gap-2">
      <div className="min-w-0">
        <div className="section-label">{label}</div>
        <div className={'mt-0.5 font-display text-2xl ' + (accent ? 'text-teal' : 'text-slate-100')}>
          {value}
        </div>
        {delta != null && (
          <div className={'mt-0.5 flex items-center gap-1 text-[11px] ' + (up ? 'text-win' : 'text-loss')}>
            <span>{up ? '▲' : '▼'}</span>
            <span>
              {up ? '+' : ''}
              {delta.toFixed(digits)}
              {unit}
            </span>
            <span className="text-mute">{t('profile.vsEarlier')}</span>
          </div>
        )}
      </div>
      {series.length > 1 && <Sparkline data={series} up={up} />}
    </div>
  )
}

function MatchRow({
  m,
  ddragon,
  onOpen,
  t
}: {
  m: MatchRecord
  ddragon: DdragonInfo | null
  onOpen: () => void
  t: TFunc
}): JSX.Element {
  const kda =
    m.deaths > 0 ? ((m.kills + m.assists) / m.deaths).toFixed(2) : (m.kills + m.assists).toFixed(2)
  const icon = champIcon(ddragon?.version ?? '', ddragon?.champions?.[m.championId])
  return (
    <button
      onClick={onOpen}
      style={{ contain: 'paint' }}
      className={
        'flex items-stretch overflow-hidden rounded-lg text-left transition-colors ' +
        (m.win ? 'bg-win/[0.07] hover:bg-win/[0.13]' : 'bg-loss/[0.07] hover:bg-loss/[0.13]')
      }
    >
      <span className={'w-1 shrink-0 ' + (m.win ? 'bg-win' : 'bg-loss')} />
      <div className="flex flex-1 items-center gap-4 px-4 py-2.5">
        {icon ? (
          <img src={icon} alt={m.champion} className="h-10 w-10 shrink-0 rounded-md" />
        ) : (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-panel2 text-xs text-mute">
            {m.champion.slice(0, 2)}
          </div>
        )}
        <div className="w-28 shrink-0">
          <div className="font-medium text-slate-100">{m.champion}</div>
          <div className="text-[11px] text-mute">{m.queueName}</div>
        </div>
        <div className={'w-20 text-sm font-semibold ' + (m.win ? 'text-win' : 'text-loss')}>
          {m.win ? t('common.win') : t('common.loss')}
        </div>
        <div className="w-24 font-mono text-sm text-slate-200">
          {m.kills}/{m.deaths}/{m.assists}
          <span className="ml-2 text-mute">{kda}</span>
        </div>
        <div className="hidden flex-1 items-center justify-center gap-3 lg:flex">
          <SpellPair
            spell1={m.details?.spell1}
            spell2={m.details?.spell2}
            ddragon={ddragon}
            size={34}
          />
          <ItemRow items={m.details?.items ?? []} ddragon={ddragon} size={34} />
          <div className="flex w-[54px] shrink-0 items-center justify-center gap-1">
            {m.details?.keystone && runeIcon(ddragon?.runes?.[m.details.keystone]?.icon) ? (
              <img
                src={runeIcon(ddragon?.runes?.[m.details.keystone]?.icon) as string}
                alt=""
                className="h-8 w-8 rounded-full bg-night ring-1 ring-edge/60"
              />
            ) : (
              <div className="h-8 w-8 rounded-full bg-night/30" />
            )}
            {m.details?.subStyle && runeIcon(ddragon?.runeStyles?.[m.details.subStyle]?.icon) ? (
              <img
                src={runeIcon(ddragon?.runeStyles?.[m.details.subStyle]?.icon) as string}
                alt=""
                className="h-5 w-5"
              />
            ) : (
              <div className="h-5 w-5" />
            )}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-3 text-sm text-mute">
          <span>
            <span className="text-slate-200">{m.csPerMin}</span> cs/m
          </span>
          <span>
            <span className="text-slate-200">{m.kpPct}%</span> KP
          </span>
          <span className="w-20 text-right text-[11px]">{fmtDate(m.playedAt)}</span>
        </div>
      </div>
    </button>
  )
}

export default function Profile({
  matches,
  hasApiKey,
  pendingSearch,
  onSearchConsumed
}: {
  matches: MatchRecord[]
  hasApiKey: boolean
  pendingSearch?: { gameName: string; tagLine: string; nonce: number } | null
  onSearchConsumed?: () => void
}): JSX.Element {
  const t = useT()
  const [filter, setFilter] = useState<MatchFilter>(NO_FILTER)
  const [busy, setBusy] = useState(false)
  const [ddragon, setDdragon] = useState<DdragonInfo | null>(null)
  const [selected, setSelected] = useState<MatchRecord | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const [summoner, setSummoner] = useState<SummonerProfile | null>(null)
  const [view, setView] = useState<'overview' | 'charts'>('overview')
  const [showSession, setShowSession] = useState(false)
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchMsg, setSearchMsg] = useState<string | null>(null)
  const [searchSummoner, setSearchSummoner] = useState<SummonerProfile | null>(null)
  const [searchMatches, setSearchMatches] = useState<MatchRecord[] | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [noMore, setNoMore] = useState(false)

  const viewingOther = searchMatches != null
  const activeMatches = searchMatches ?? matches
  const activeSummoner = searchSummoner ?? summoner

  async function loadMore(): Promise<void> {
    if (!searchSummoner || !searchMatches) return
    setLoadingMore(true)
    try {
      const more = await window.api.getPlayerMatches(
        searchSummoner.gameName,
        searchSummoner.tagLine,
        searchMatches.length,
        20
      )
      const seen = new Set(searchMatches.map((m) => m.gameId))
      const fresh = more.filter((m) => !seen.has(m.gameId))
      if (fresh.length === 0) setNoMore(true)
      else setSearchMatches([...searchMatches, ...fresh])
      if (more.length < 20) setNoMore(true)
    } finally {
      setLoadingMore(false)
    }
  }

  async function doSearch(gameName: string, tagLine: string): Promise<void> {
    setSearching(true)
    setSearchMsg(null)
    try {
      const r = await window.api.getPlayerProfile(gameName, tagLine)
      if (r.status === 'ok' && r.summoner) {
        setSearchSummoner(r.summoner)
        setSearchMatches(r.matches ?? [])
        setNoMore((r.matches?.length ?? 0) < 20)
        setFilter(NO_FILTER)
      } else {
        setSearchMsg(
          r.status === 'not-found' ? t('profile.searchNotFound') : t('profile.searchNoKey')
        )
      }
    } catch {
      setSearchMsg(t('profile.searchNotFound'))
    } finally {
      setSearching(false)
    }
  }

  async function runSearch(): Promise<void> {
    const q = query.trim()
    const hash = q.lastIndexOf('#')
    if (hash < 1 || hash === q.length - 1) {
      setSearchMsg(t('profile.searchFormat'))
      return
    }
    await doSearch(q.slice(0, hash).trim(), q.slice(hash + 1).trim())
  }

  // Triggered when another tab (e.g. Live) asks to open a player's profile.
  // Consumed immediately so navigating back to Profile later shows your own again.
  useEffect(() => {
    if (!pendingSearch) return
    setQuery(`${pendingSearch.gameName} #${pendingSearch.tagLine}`)
    doSearch(pendingSearch.gameName, pendingSearch.tagLine)
    onSearchConsumed?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingSearch?.nonce])

  function backToMine(): void {
    setSearchMatches(null)
    setSearchSummoner(null)
    setSearchMsg(null)
    setNoMore(false)
    setQuery('')
    setFilter(NO_FILTER)
  }

  useEffect(() => {
    window.api.getDdragonInfo().then(setDdragon).catch(() => setDdragon(null))
    window.api.getSummoner().then(setSummoner).catch(() => setSummoner(null))
    const off = window.api.onSummonerUpdated((p) => setSummoner(p as SummonerProfile))
    const offDd = window.api.onDdragonUpdated((info) => setDdragon(info as DdragonInfo))
    return () => {
      off()
      offDd()
    }
  }, [])

  const filtered = useMemo(() => applyFilter(activeMatches, filter), [activeMatches, filter])
  const agg = aggregate(filtered)
  const champs = useMemo(() => perChampion(filtered).slice(0, 6), [filtered])

  // Splash art of the most-played champion, for the hero header background.
  const heroSplash = useMemo(() => {
    const top = champs[0]
    if (!top) return null
    const m = activeMatches.find((x) => x.champion === top.champion)
    const imageId = m ? ddragon?.champions?.[m.championId] : undefined
    return imageId
      ? `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${imageId}_0.jpg`
      : null
  }, [champs, activeMatches, ddragon])

  // Per-game series (chronological) + recent-vs-earlier deltas for the stat tiles.
  const stats = useMemo(() => {
    const chrono = [...filtered].sort((a, b) => a.playedAt - b.playedAt)
    const kda = chrono.map((m) => Math.round(((m.kills + m.assists) / Math.max(m.deaths, 1)) * 100) / 100)
    const cspm = chrono.map((m) => m.csPerMin)
    const kp = chrono.map((m) => m.kpPct)
    const vision = chrono.map((m) => m.vision)
    let w = 0
    const wr = chrono.map((m, i) => {
      if (m.win) w++
      return Math.round((w / (i + 1)) * 100)
    })
    const avg = (a: number[]): number => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0)
    const delta = (a: number[]): number | null => {
      if (a.length < 6) return null
      const mid = Math.floor(a.length / 2)
      return avg(a.slice(mid)) - avg(a.slice(0, mid))
    }
    const wrDelta = ((): number | null => {
      if (chrono.length < 6) return null
      const mid = Math.floor(chrono.length / 2)
      const rate = (a: typeof chrono): number =>
        a.length ? Math.round((a.filter((m) => m.win).length / a.length) * 100) : 0
      return rate(chrono.slice(mid)) - rate(chrono.slice(0, mid))
    })()
    return {
      kda,
      cspm,
      kp,
      vision,
      wr,
      dKda: delta(kda),
      dCspm: delta(cspm),
      dKp: delta(kp),
      dVision: delta(vision),
      dWr: wrDelta
    }
  }, [filtered])

  // Recurring teammates across the loaded history ("Played With").
  const playedWith = useMemo(() => {
    const me = activeSummoner?.gameName?.toLowerCase()
    const tally = new Map<string, { games: number; wins: number }>()
    for (const m of filtered) {
      if (!m.players?.length) continue
      const meP = m.players.find((p) => p.pid === m.participantId)
      const myTeam = meP?.teamId
      if (myTeam == null) continue
      for (const p of m.players) {
        if (p.teamId !== myTeam || p.pid === m.participantId || !p.name) continue
        if (me && p.name.toLowerCase() === me) continue
        const cur = tally.get(p.name) ?? { games: 0, wins: 0 }
        cur.games++
        if (m.win) cur.wins++
        tally.set(p.name, cur)
      }
    }
    return [...tally.entries()]
      .map(([name, v]) => ({
        name,
        games: v.games,
        wins: v.wins,
        winrate: Math.round((v.wins / v.games) * 100)
      }))
      .filter((x) => x.games >= 2)
      .sort((a, b) => b.games - a.games)
      .slice(0, 5)
  }, [filtered, activeSummoner])

  async function refresh(): Promise<void> {
    setBusy(true)
    try {
      await window.api.refreshMatches()
    } finally {
      setBusy(false)
    }
  }

  async function reset(): Promise<void> {
    setConfirmReset(false)
    setBusy(true)
    try {
      await window.api.resetHistory()
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <header className="card relative mb-5 overflow-hidden">
        {heroSplash && (
          <>
            <div
              className="absolute inset-0 bg-cover opacity-50"
              style={{ backgroundImage: `url(${heroSplash})`, backgroundPosition: 'center 22%' }}
            />
            <div className="absolute inset-0 bg-gradient-to-r from-panel via-panel/85 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-t from-panel/60 to-transparent" />
          </>
        )}
        <div className="relative flex items-center justify-between px-5 py-4">
          {activeSummoner ? (
          <div className="flex items-center gap-4">
            <div className="relative">
              {profileIcon(ddragon?.version ?? '', activeSummoner.profileIconId) ? (
                <img
                  src={profileIcon(ddragon?.version ?? '', activeSummoner.profileIconId) as string}
                  alt=""
                  className="h-16 w-16 rounded-xl ring-1 ring-edge"
                />
              ) : (
                <div className="h-16 w-16 rounded-xl bg-panel2" />
              )}
              <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full border border-edge bg-night px-2 py-0.5 text-[11px] font-medium text-slate-200">
                {activeSummoner.summonerLevel}
              </span>
            </div>
            <div>
              <div className="font-display text-2xl text-slate-100">
                {activeSummoner.gameName}
                {activeSummoner.tagLine && (
                  <span className="text-base text-mute"> #{activeSummoner.tagLine}</span>
                )}
              </div>
              <div className="mt-1.5">
                <RankBadges summoner={activeSummoner} />
              </div>
            </div>
          </div>
        ) : (
          <h1 className="font-display text-2xl text-slate-100">{t('nav.profile')}</h1>
        )}
        <div className="flex items-center gap-2">
          {viewingOther ? (
            <button
              onClick={backToMine}
              className="rounded-md border border-edge bg-panel2 px-4 py-2 text-sm font-medium text-slate-200 hover:border-teal hover:text-teal"
            >
              {t('profile.backToMine')}
            </button>
          ) : confirmReset ? (
            <>
              <span className="text-xs text-mute">{t('profile.resetConfirm')}</span>
              <button
                onClick={reset}
                disabled={busy}
                className="rounded-md border border-loss/50 px-3 py-2 text-sm font-medium text-loss hover:bg-loss/10 disabled:opacity-50"
              >
                {t('common.confirm')}
              </button>
              <button
                onClick={() => setConfirmReset(false)}
                className="rounded-md px-3 py-2 text-sm text-mute hover:text-slate-200"
              >
                {t('common.cancel')}
              </button>
            </>
          ) : (
            <button
              onClick={() => setConfirmReset(true)}
              disabled={busy || matches.length === 0}
              className="rounded-md border border-edge px-3 py-2 text-sm text-mute hover:border-loss hover:text-loss disabled:opacity-40"
            >
              {t('profile.reset')}
            </button>
          )}
          {!viewingOther && (
            <button
              onClick={refresh}
              disabled={busy}
              className="rounded-md border border-edge bg-panel2 px-4 py-2 text-sm font-medium text-slate-200 hover:border-teal hover:text-teal disabled:opacity-50"
            >
              {busy ? t('profile.refreshing') : t('profile.refresh')}
            </button>
          )}
        </div>
        </div>
      </header>

      {hasApiKey && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && runSearch()}
            placeholder={t('profile.searchPlaceholder')}
            spellCheck={false}
            className="w-72 rounded-md border border-edge bg-night px-3 py-1.5 text-sm text-slate-100 outline-none focus:border-teal"
          />
          <button
            onClick={runSearch}
            disabled={searching}
            className="rounded-md border border-teal bg-teal/10 px-3 py-1.5 text-sm font-medium text-teal hover:bg-teal/20 disabled:opacity-50"
          >
            {searching ? '…' : t('profile.searchBtn')}
          </button>
          {searchMsg && <span className="text-xs text-mute">{searchMsg}</span>}
        </div>
      )}

      <FilterBar matches={activeMatches} filter={filter} onChange={setFilter} />

      <div className="mb-4 mt-3 flex items-center gap-3">
        <div className="segmented">
          {(['overview', 'charts'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={
                'segmented-item ' +
                (view === v ? 'segmented-item-active' : 'segmented-item-idle')
              }
            >
              {v === 'overview' ? t('profile.tabOverview') : t('profile.tabCharts')}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowSession(true)}
          className="ml-auto rounded-lg border border-edge px-3 py-1.5 text-sm font-medium text-slate-200 transition-colors hover:border-teal hover:text-teal"
        >
          {t('profile.sessionAnalysis')}
        </button>
      </div>

      {busy ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-edge px-6 py-16 text-center text-mute">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-edge border-t-teal" />
          {t('profile.loading')}
        </div>
      ) : !agg ? (
        <div className="rounded-lg border border-dashed border-edge px-6 py-16 text-center text-mute">
          {t('profile.empty')}
        </div>
      ) : view === 'charts' ? (
        <ProfileCharts matches={filtered} ddragon={ddragon} />
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Card label={t('profile.games')} value={`${agg.games}`} />
            <StatTile
              label={t('profile.winrate')}
              value={`${agg.winrate}%`}
              series={stats.wr}
              delta={stats.dWr}
              digits={0}
              unit="%"
              accent
            />
            <Card
              label={t('profile.record')}
              value={`${agg.wins}${t('common.winShort')} ${agg.losses}${t('common.lossShort')}`}
            />
            <StatTile
              label={t('profile.avgKda')}
              value={agg.kda.toFixed(2)}
              series={stats.kda}
              delta={stats.dKda}
              digits={2}
            />
            <StatTile
              label={t('profile.csmin')}
              value={agg.cspm.toFixed(1)}
              series={stats.cspm}
              delta={stats.dCspm}
              digits={1}
            />
            <StatTile
              label={t('profile.avgKp')}
              value={`${agg.kp}%`}
              series={stats.kp}
              delta={stats.dKp}
              digits={0}
              unit="%"
            />
            <StatTile
              label={t('profile.vision')}
              value={agg.vision.toFixed(1)}
              series={stats.vision}
              delta={stats.dVision}
              digits={1}
            />
          </div>

          <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
            <div className="min-w-0">
              <h2 className="mb-2 text-sm font-medium text-slate-300">
                {t('profile.history', { n: filtered.length })}
              </h2>
              <div className="flex flex-col gap-2">
                {filtered.map((m) => (
                  <MatchRow
                    key={m.gameId}
                    m={m}
                    ddragon={ddragon}
                    onOpen={() => setSelected(m)}
                    t={t}
                  />
                ))}
              </div>

              {viewingOther && !noMore && (
                <div className="mt-4 flex justify-center">
                  <button
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="rounded-md border border-edge bg-panel2 px-5 py-2 text-sm font-medium text-slate-200 hover:border-teal hover:text-teal disabled:opacity-50"
                  >
                    {loadingMore ? t('profile.loadingMore') : t('profile.loadMore')}
                  </button>
                </div>
              )}
              {viewingOther && noMore && (
                <div className="mt-4 text-center text-xs text-mute">{t('profile.noMore')}</div>
              )}
            </div>

            <ProfileRail
              summoner={activeSummoner}
              champs={champs}
              playedWith={playedWith}
              ddragon={ddragon}
            />
          </div>
        </>
      )}

      {selected && (
        <MatchDetail match={selected} ddragon={ddragon} onClose={() => setSelected(null)} />
      )}
      {showSession && (
        <SessionAnalysis matches={filtered} ddragon={ddragon} onClose={() => setShowSession(false)} />
      )}
    </section>
  )
}
