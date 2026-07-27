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
import ItemRow from './ItemRow'
import { applyFilter, aggregate, perChampion, fmtDate, champIcon, profileIcon, fmtRank } from '../lib'

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
      className="flex items-stretch rounded-lg bg-panel text-left transition-colors hover:bg-panel2"
    >
      <span className={'w-1 shrink-0 rounded-l-lg ' + (m.win ? 'bg-win' : 'bg-loss')} />
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

export default function Profile({ matches }: { matches: MatchRecord[] }): JSX.Element {
  const t = useT()
  const [filter, setFilter] = useState<MatchFilter>(NO_FILTER)
  const [busy, setBusy] = useState(false)
  const [ddragon, setDdragon] = useState<DdragonInfo | null>(null)
  const [selected, setSelected] = useState<MatchRecord | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const [summoner, setSummoner] = useState<SummonerProfile | null>(null)

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

  const filtered = useMemo(() => applyFilter(matches, filter), [matches, filter])
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
        {summoner ? (
          <div className="flex items-center gap-4">
            <div className="relative">
              {profileIcon(ddragon?.version ?? '', summoner.profileIconId) ? (
                <img
                  src={profileIcon(ddragon?.version ?? '', summoner.profileIconId) as string}
                  alt=""
                  className="h-16 w-16 rounded-xl ring-1 ring-edge"
                />
              ) : (
                <div className="h-16 w-16 rounded-xl bg-panel2" />
              )}
              <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full border border-edge bg-night px-2 py-0.5 text-[11px] font-medium text-slate-200">
                {summoner.summonerLevel}
              </span>
            </div>
            <div>
              <div className="font-display text-2xl text-slate-100">
                {summoner.gameName}
                {summoner.tagLine && (
                  <span className="text-base text-mute"> #{summoner.tagLine}</span>
                )}
              </div>
              {fmtRank(summoner.rankedTier, summoner.rankedDivision, summoner.rankedLp) ? (
                <div className="text-sm text-gold">
                  {fmtRank(summoner.rankedTier, summoner.rankedDivision, summoner.rankedLp)}
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
          {confirmReset ? (
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
          <button
            onClick={refresh}
            disabled={busy}
            className="rounded-md border border-edge bg-panel2 px-4 py-2 text-sm font-medium text-slate-200 hover:border-teal hover:text-teal disabled:opacity-50"
          >
            {busy ? t('profile.refreshing') : t('profile.refresh')}
          </button>
        </div>
      </header>

      <FilterBar matches={matches} filter={filter} onChange={setFilter} />

      {busy ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-edge px-6 py-16 text-center text-mute">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-edge border-t-teal" />
          {t('profile.loading')}
        </div>
      ) : !agg ? (
        <div className="rounded-lg border border-dashed border-edge px-6 py-16 text-center text-mute">
          {t('profile.empty')}
        </div>
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
                      · {c.games}g · {c.kda} KDA
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
        </>
      )}

      {selected && (
        <MatchDetail match={selected} ddragon={ddragon} onClose={() => setSelected(null)} />
      )}
    </section>
  )
}
