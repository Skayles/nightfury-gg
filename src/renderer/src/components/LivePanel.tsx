import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type {
  LcuStatus,
  AppSettings,
  LiveGame,
  LivePlayer,
  ScoutResult,
  ScoutDiag
} from '../../../preload/index.d'
import { useT } from '../i18n'
import { loadingArt, fmtRank } from '../lib'
import Toggle from './Toggle'

function LoadingCard({
  p,
  s,
  side
}: {
  p: LivePlayer
  s?: ScoutResult
  side: 'blue' | 'red'
}): JSX.Element {
  const t = useT()
  const art = loadingArt(p.championImage, p.skinId)
  const rank = fmtRank(s?.rankTier ?? null, s?.rankDivision ?? null, s?.rankLp ?? null)
  const topBorder = side === 'blue' ? 'bg-teal' : 'bg-loss'
  return (
    <div className="relative h-full min-h-0 overflow-hidden rounded-lg ring-1 ring-edge">
      <span className={'absolute inset-x-0 top-0 z-10 h-1 ' + topBorder} />
      {art ? (
        <img
          src={art}
          alt={p.championName}
          className="absolute inset-0 h-full w-full object-cover object-top"
          onError={(e) => {
            const img = e.currentTarget
            if (!img.dataset.fb) {
              img.dataset.fb = '1'
              img.src = loadingArt(p.championImage, 0) || ''
            }
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-panel2" />
      )}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/60 to-transparent px-2 pb-2 pt-8">
        <div className="truncate text-sm font-semibold text-white">{p.name || '—'}</div>
        <div className="truncate text-[11px] text-slate-300">{p.championName}</div>
        <div className={'truncate text-[11px] ' + (rank ? 'text-gold' : 'text-slate-400')}>
          {rank || t('profile.unranked')}
        </div>
      </div>
    </div>
  )
}

function Team({
  label,
  color,
  players,
  scout,
  side
}: {
  label: string
  color: string
  players: LivePlayer[]
  scout: Record<string, ScoutResult>
  side: 'blue' | 'red'
}): JSX.Element {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-2 flex shrink-0 items-center gap-2">
        <span className={'h-2.5 w-2.5 rounded-full ' + color} />
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-300">{label}</span>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-5 gap-2.5">
        {players.map((p, i) => (
          <LoadingCard key={i} p={p} s={scout[p.puuid]} side={side} />
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
  const [game, setGame] = useState<LiveGame | null>(null)
  const [loading, setLoading] = useState(false)
  const [scout, setScout] = useState<Record<string, ScoutResult>>({})
  const [scouting, setScouting] = useState(false)
  const [diag, setDiag] = useState<ScoutDiag | null>(null)

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

  const gameKey = useMemo(
    () => (game ? [...game.teamOne, ...game.teamTwo].map((p) => p.puuid).join(',') : ''),
    [game]
  )

  useEffect(() => {
    if (!game || !gameKey) return
    const players = [...game.teamOne, ...game.teamTwo]
      .filter((p) => p.puuid)
      .map((p) => ({ puuid: p.puuid, championImage: p.championImage }))
    if (!players.length) return
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
      .catch(() => {})
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

  const placeholder = (node: ReactNode): JSX.Element => (
    <div className="flex min-h-0 flex-1 items-center justify-center">
      <div className="rounded-lg border border-dashed border-edge px-6 py-16 text-center text-mute">
        {node}
      </div>
    </div>
  )

  return (
    <section className="flex h-full flex-col">
      <header className="mb-4 flex shrink-0 items-center justify-between">
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
        placeholder(t('live.disabled'))
      ) : !inGame ? (
        placeholder(
          <>
            <div className="mb-2 text-sm font-medium text-slate-300">{t('live.waiting')}</div>
            <p className="mx-auto max-w-md text-sm text-mute">{t('live.desc')}</p>
          </>
        )
      ) : game ? (
        <div className="flex min-h-0 flex-1 flex-col gap-4">
          <Team
            label={t('live.teamBlue')}
            color="bg-teal"
            players={game.teamOne}
            scout={scout}
            side="blue"
          />
          <Team
            label={t('live.teamRed')}
            color="bg-loss"
            players={game.teamTwo}
            scout={scout}
            side="red"
          />
          {(scouting || (diag && !diag.historyOk)) && (
            <p className="shrink-0 text-center text-[11px] text-mute">
              {scouting ? t('live.scouting2') : t('live.rankOnly')}
            </p>
          )}
        </div>
      ) : (
        placeholder(loading ? t('live.loadingGame') : t('live.detected'))
      )}
    </section>
  )
}
