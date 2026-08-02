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
import ItemRow from './ItemRow'
import { applyFilter, aggregate, perChampion, fmtDate, champIcon, profileIcon, fmtRank, gamesLabel } from '../lib'

const NO_FILTER: MatchFilter = { queueId: null, champion: null, result: null, sinceDays: null }

function Card({ label, value, accent }: { label: string; value: string; accent?: boolean }): JSX.Element {
  return (
    <div className="rounded-lg border border-edge bg-panel px-4 py-3">
      <div className="text-[11px] uppercase tracking-wide text-mute">{label}</div>
      <div className={'mt-0.5 font-display text-2xl ' + (accent ? 'text-teal' : 'text-slate-100')}>
        {value}
      </div>
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
      className="flex items-stretch overflow-hidden rounded-lg bg-panel text-left transition-colors hover:bg-panel2"
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
        <div className="hidden flex-1 justify-center lg:flex">
          <ItemRow items={m.details?.items ?? []} ddragon={ddragon} size={34} />
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
      <header className="mb-5 flex items-center justify-between">
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
              {fmtRank(
                activeSummoner.rankedTier,
                activeSummoner.rankedDivision,
                activeSummoner.rankedLp
              ) ? (
                <div className="text-sm text-gold">
                  {fmtRank(
                    activeSummoner.rankedTier,
                    activeSummoner.rankedDivision,
                    activeSummoner.rankedLp
                  )}
                </div>
              ) : (
                <div className="text-sm text-mute">{t('profile.unranked')}</div>
              )}
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

      <div className="mb-4 mt-3 flex gap-1">
        {(['overview', 'charts'] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={
              'rounded-md px-3 py-1.5 text-sm font-medium transition-colors ' +
              (view === v ? 'bg-panel2 text-teal' : 'text-mute hover:text-slate-200')
            }
          >
            {v === 'overview' ? t('profile.tabOverview') : t('profile.tabCharts')}
          </button>
        ))}
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
            <Card label={t('profile.winrate')} value={`${agg.winrate}%`} accent />
            <Card
              label={t('profile.record')}
              value={`${agg.wins}${t('common.winShort')} ${agg.losses}${t('common.lossShort')}`}
            />
            <Card label={t('profile.avgKda')} value={agg.kda.toFixed(2)} />
            <Card label={t('profile.csmin')} value={agg.cspm.toFixed(1)} />
            <Card label={t('profile.avgKp')} value={`${agg.kp}%`} />
            <Card label={t('profile.vision')} value={agg.vision.toFixed(1)} />
          </div>

          {champs.length > 1 && (
            <div className="mb-6">
              <h2 className="mb-2 text-sm font-medium text-slate-300">{t('profile.byChampion')}</h2>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                {champs.map((c) => (
                  <div
                    key={c.champion}
                    className="flex items-center justify-between rounded-md border border-edge bg-panel px-3 py-2"
                  >
                    <span className="text-sm text-slate-100">{c.champion}</span>
                    <span className="text-xs text-mute">
                      <span className={c.winrate >= 50 ? 'text-win' : 'text-loss'}>
                        {c.winrate}%
                      </span>{' '}
                      · {gamesLabel(c.games, t)} · {c.kda} KDA
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

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
        </>
      )}

      {selected && (
        <MatchDetail match={selected} ddragon={ddragon} onClose={() => setSelected(null)} />
      )}
    </section>
  )
}
