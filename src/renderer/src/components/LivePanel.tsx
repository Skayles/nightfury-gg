import { useEffect, useMemo, useState } from 'react'
import type {
  LcuStatus,
  AppSettings,
  LiveGame,
  DdragonInfo,
  LivePlayer,
  ScoutResult,
  ScoutDiag
} from '../../../preload/index.d'
import { useT } from '../i18n'
import { champIcon, fmtRank } from '../lib'
import Toggle from './Toggle'

function Stat({ value, sub }: { value: string; sub: string }): JSX.Element {
  return (
    <div className="text-right leading-tight">
      <div className="text-[13px] font-semibold text-slate-100">{value}</div>
      <div className="text-[10px] text-mute">{sub}</div>
    </div>
  )
}

function PlayerCard({
  p,
  s,
  ddragon,
  side
}: {
  p: LivePlayer
  s?: ScoutResult
  ddragon: DdragonInfo | null
  side: 'blue' | 'red'
}): JSX.Element {
  const t = useT()
  const version = ddragon?.version ?? ''
  const icon = champIcon(version, p.championImage)
  const accent = side === 'blue' ? 'border-l-teal' : 'border-l-loss'
  const rank = fmtRank(s?.rankTier ?? null, s?.rankDivision ?? null, s?.rankLp ?? null)
  const hasWr = s?.winrate != null
  const hasChamp = s?.champGames != null
  return (
    <div className={'flex items-center gap-3 rounded-lg border-l-2 bg-panel px-3 py-2 ' + accent}>
      {icon ? (
        <img src={icon} alt="" className="h-11 w-11 rounded-md ring-1 ring-edge" />
      ) : (
        <div className="h-11 w-11 rounded-md bg-panel2" />
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-slate-100">{p.name || '—'}</div>
        <div className={'text-[11px] ' + (rank ? 'text-gold' : 'text-mute')}>
          {rank || t('profile.unranked')}
        </div>
      </div>
      {hasWr && (
        <Stat value={`${s?.winrate}%`} sub={s?.games != null ? `${s.games}G` : 'WR'} />
      )}
      {hasChamp && (
        <div className="flex items-center gap-1.5" title={t('live.onChamp')}>
          {icon ? <img src={icon} alt="" className="h-5 w-5 rounded" /> : null}
          <Stat value={`${s?.champWinrate}%`} sub={`${s?.champGames}G`} />
        </div>
      )}
    </div>
  )
}

function TeamColumn({
  label,
  color,
  players,
  scout,
  ddragon,
  side
}: {
  label: string
  color: string
  players: LivePlayer[]
  scout: Record<string, ScoutResult>
  ddragon: DdragonInfo | null
  side: 'blue' | 'red'
}): JSX.Element {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className={'h-2.5 w-2.5 rounded-full ' + color} />
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-300">{label}</span>
      </div>
      <div className="flex flex-col gap-2">
        {players.map((p, i) => (
          <PlayerCard key={i} p={p} s={scout[p.puuid]} ddragon={ddragon} side={side} />
        ))}
      </div>
    </div>
  )
}

export default function LivePanel({
  lcu,
  settings,
  onChanged
}: {
  lcu: LcuStatus
  settings: AppSettings
  onChanged: () => void
}): JSX.Element {
  const t = useT()
  const inGame = lcu.state === 'in-game'
  const [ddragon, setDdragon] = useState<DdragonInfo | null>(null)
  const [game, setGame] = useState<LiveGame | null>(null)
  const [loading, setLoading] = useState(false)
  const [scout, setScout] = useState<Record<string, ScoutResult>>({})
  const [scouting, setScouting] = useState(false)
  const [diag, setDiag] = useState<ScoutDiag | null>(null)

  useEffect(() => {
    window.api.getDdragonInfo().then(setDdragon).catch(() => setDdragon(null))
    const offDd = window.api.onDdragonUpdated((info) => setDdragon(info as DdragonInfo))
    return () => offDd()
  }, [])

  useEffect(() => {
    if (!inGame || !settings.scoutingEnabled) {
      setGame(null)
      setScout({})
      setDiag(null)
      return
    }
    let alive = true
    setLoading(true)
    const load = (): void => {
      window.api
        .getLiveGame()
        .then((g) => alive && setGame(g))
        .catch(() => alive && setGame(null))
        .finally(() => alive && setLoading(false))
    }
    load()
    const id = setInterval(load, 15000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [inGame, settings.scoutingEnabled])

  // Stable key for the current game (its players) so scouting runs once per game.
  const gameKey = useMemo(
    () => (game ? [...game.teamOne, ...game.teamTwo].map((p) => p.puuid).join(',') : ''),
    [game]
  )

  useEffect(() => {
    if (!game || !gameKey) return
    const players = [...game.teamOne, ...game.teamTwo]
      .filter((p) => p.puuid)
      .map((p) => ({ puuid: p.puuid, championImage: p.championImage }))
    if (!players.length) {
      setDiag({ ok:false, tokenFound:false, baseFound:false, historyOk:false, base:'', region:'', error:'puuid indisponible', sample:'' })
      return
    }
    let alive = true
    setScouting(true)
    window.api
      .scoutLiveGame(players, game.queueId)
      .then(({ results, diag }) => {
        if (!alive) return
        const m: Record<string, ScoutResult> = {}
        results.forEach((r) => (m[r.puuid] = r))
        setScout(m)
        setDiag(diag)
      })
      .catch(() => alive && setDiag({ ok:false, tokenFound:false, baseFound:false, historyOk:false, base:'', region:'', error:t('live.scoutFail'), sample:'' }))
      .finally(() => alive && setScouting(false))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameKey])

  async function toggleScouting(v: boolean): Promise<void> {
    await window.api.setSettings({ scoutingEnabled: v })
    onChanged()
  }

  return (
    <section className="max-w-4xl">
      <header className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl text-slate-100">{t('nav.live')}</h1>
          <p className="text-sm text-mute">{t('live.subtitle')}</p>
        </div>
        <div className="flex items-center gap-3 text-sm text-slate-200">
          {t('live.scouting')}
          <Toggle on={settings.scoutingEnabled} onChange={toggleScouting} />
        </div>
      </header>

      {!settings.scoutingEnabled ? (
        <div className="rounded-lg border border-dashed border-edge px-6 py-16 text-center text-mute">
          {t('live.disabled')}
        </div>
      ) : !inGame ? (
        <div className="rounded-lg border border-dashed border-edge px-6 py-16 text-center text-mute">
          <div className="mb-2 text-sm font-medium text-slate-300">{t('live.waiting')}</div>
          <p className="mx-auto max-w-md text-sm text-mute">{t('live.desc')}</p>
        </div>
      ) : game ? (
        <>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <TeamColumn
              label={t('live.teamBlue')}
              color="bg-teal"
              players={game.teamOne}
              scout={scout}
              ddragon={ddragon}
              side="blue"
            />
            <TeamColumn
              label={t('live.teamRed')}
              color="bg-loss"
              players={game.teamTwo}
              scout={scout}
              ddragon={ddragon}
              side="red"
            />
          </div>
          <div className="mt-5 flex items-center justify-center gap-3 text-[11px] text-mute">
            <span>
              {scouting
                ? t('live.scouting2')
                : diag && !diag.historyOk
                  ? t('live.rankOnly')
                  : ''}
            </span>
            {!scouting && diag && !diag.historyOk && diag.sample && (
              <button
                onClick={() => navigator.clipboard.writeText(JSON.stringify(diag, null, 2))}
                className="rounded border border-edge px-2 py-1 text-slate-400 hover:border-teal hover:text-teal"
              >
                Copier le diagnostic
              </button>
            )}
          </div>
        </>
      ) : (
        <div className="rounded-lg border border-teal/40 bg-teal/5 px-6 py-16 text-center text-mute">
          {loading ? t('live.loadingGame') : t('live.detected')}
        </div>
      )}
    </section>
  )
}
