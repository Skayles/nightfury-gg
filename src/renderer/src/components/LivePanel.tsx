import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type {
  LcuStatus,
  AppSettings,
  LiveGame,
  LivePlayer,
  ScoutResult,
  ScoutDiag,
  SummonerProfile
} from '../../../preload/index.d'
import { useT } from '../i18n'
import { loadingArt, fmtRank, gamesLabel, orderByRole } from '../lib'
import Toggle from './Toggle'

const PREMADE_COLORS = ['#F59E0B', '#8B5CF6', '#22D3EE', '#EC4899']

function LoadingCard({
  p,
  s,
  side,
  onOpen
}: {
  p: LivePlayer
  s?: ScoutResult
  side: 'blue' | 'red'
  onOpen?: () => void
}): JSX.Element {
  const t = useT()
  const art = loadingArt(p.championImage, p.skinId)
  const rank = fmtRank(s?.rankTier ?? null, s?.rankDivision ?? null, s?.rankLp ?? null)
  const topBorder = side === 'blue' ? 'bg-teal' : 'bg-loss'
  const clickable = !!onOpen && !!p.tagLine
  return (
    <div
      onClick={clickable ? onOpen : undefined}
      title={clickable ? `${p.name} #${p.tagLine}` : undefined}
      className={
        'relative h-full min-h-0 w-auto shrink aspect-[308/560] overflow-hidden rounded-lg ring-1 ring-edge ' +
        (clickable ? 'cursor-pointer transition-shadow hover:ring-2 hover:ring-teal' : '')
      }
    >
      <span className={'absolute inset-x-0 top-0 z-10 h-1 ' + topBorder} />
      {art ? (
        <img
          src={art}
          alt={p.championName}
          className="absolute inset-0 h-full w-full object-cover object-center"
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
        <div className="mb-0.5 flex items-center gap-1.5">
          {s?.premadeGroup ? (
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/40"
              style={{ background: PREMADE_COLORS[(s.premadeGroup - 1) % PREMADE_COLORS.length] }}
              title={t('live.premade')}
            />
          ) : null}
          <span className="truncate text-sm font-semibold text-white">{p.name || '—'}</span>
          {s?.smurf && (
            <span
              className="ml-auto shrink-0 rounded bg-gold/25 px-1 text-[9px] font-bold uppercase text-gold"
              title={t('live.smurfHint')}
            >
              {t('live.smurf')}
            </span>
          )}
        </div>
        <div className="truncate text-[11px] text-slate-300">{p.championName}</div>
        <div className={'truncate text-[11px] ' + (rank ? 'text-gold' : 'text-slate-400')}>
          {rank || t('profile.unranked')}
          {s?.level ? <span className="text-mute"> · lvl {s.level}</span> : null}
        </div>
        {s?.winrate != null && (
          <div className="truncate text-[11px]">
            <span className={s.winrate >= 50 ? 'text-win' : 'text-loss'}>{s.winrate}%</span>
            <span className="text-mute"> · {gamesLabel(s.games ?? 0, t)}</span>
          </div>
        )}
      </div>
    </div>
  )
}

function Team({
  label,
  color,
  players,
  scout,
  side,
  onOpenProfile
}: {
  label: string
  color: string
  players: LivePlayer[]
  scout: Record<string, ScoutResult>
  side: 'blue' | 'red'
  onOpenProfile?: (gameName: string, tagLine: string) => void
}): JSX.Element {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-2 flex shrink-0 items-center gap-2">
        <span className={'h-2.5 w-2.5 rounded-full ' + color} />
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-300">{label}</span>
      </div>
      <div className="flex min-h-0 flex-1 items-stretch justify-center gap-3">
        {orderByRole(players).map((p, i) => (
          <LoadingCard
            key={i}
            p={p}
            s={scout[p.puuid]}
            side={side}
            onOpen={onOpenProfile ? () => onOpenProfile(p.name, p.tagLine) : undefined}
          />
        ))}
      </div>
    </div>
  )
}

export default function LivePanel({
  lcu,
  settings,
  onChanged,
  onGoToOptions,
  onOpenProfile
}: {
  lcu: LcuStatus
  settings: AppSettings
  onChanged: () => void
  onGoToOptions: () => void
  onOpenProfile: (gameName: string, tagLine: string) => void
}): JSX.Element {
  const t = useT()
  const inGame = lcu.state === 'in-game'
  const [game, setGame] = useState<LiveGame | null>(null)
  const [loading, setLoading] = useState(false)
  const [scout, setScout] = useState<Record<string, ScoutResult>>({})
  const [scouting, setScouting] = useState(false)
  const [diag, setDiag] = useState<ScoutDiag | null>(null)
  const [summoner, setSummoner] = useState<SummonerProfile | null>(null)
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchGame, setSearchGame] = useState<LiveGame | null>(null)
  const [searchScout, setSearchScout] = useState<Record<string, ScoutResult>>({})
  const [searchMsg, setSearchMsg] = useState<string | null>(null)
  const [searchName, setSearchName] = useState('')

  async function runSearch(): Promise<void> {
    const q = query.trim()
    const hash = q.lastIndexOf('#')
    if (hash < 1 || hash === q.length - 1) {
      setSearchMsg(t('live.searchFormat'))
      return
    }
    const gameName = q.slice(0, hash).trim()
    const tagLine = q.slice(hash + 1).trim()
    setSearching(true)
    setSearchMsg(null)
    setSearchGame(null)
    try {
      const r = await window.api.getPlayerLive(gameName, tagLine)
      if (r.status === 'ok' && r.game) {
        const m: Record<string, ScoutResult> = {}
        ;(r.scout ?? []).forEach((s) => (m[s.puuid] = s))
        setSearchScout(m)
        setSearchGame(r.game)
        setSearchName(`${gameName} #${tagLine}`)
      } else {
        setSearchMsg(
          r.status === 'not-in-game'
            ? t('live.searchNotInGame')
            : r.status === 'not-found'
              ? t('live.searchNotFound')
              : t('live.searchNoKey')
        )
      }
    } catch {
      setSearchMsg(t('live.searchNotFound'))
    } finally {
      setSearching(false)
    }
  }

  function clearSearch(): void {
    setSearchGame(null)
    setSearchMsg(null)
    setQuery('')
  }

  useEffect(() => {
    window.api.getSummoner().then(setSummoner).catch(() => setSummoner(null))
    const off = window.api.onSummonerUpdated((p) => setSummoner(p as SummonerProfile))
    return () => off()
  }, [])

  const porofessorUrl =
    summoner && summoner.gameName
      ? `https://porofessor.gg/live/${summoner.region || 'euw'}/${encodeURIComponent(
          summoner.gameName
        )}-${encodeURIComponent(summoner.tagLine)}`
      : null

  const cardOpen = settings.riotApiKey ? onOpenProfile : undefined

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
    const players = [
      ...game.teamOne.map((p) => ({ ...p, teamId: 100 })),
      ...game.teamTwo.map((p) => ({ ...p, teamId: 200 }))
    ]
      .filter((p) => p.puuid)
      .map((p) => ({ puuid: p.puuid, championImage: p.championImage, teamId: p.teamId }))
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
        <div className="flex items-center gap-4">
          {porofessorUrl && (
            <button
              onClick={() => window.api.openExternal(porofessorUrl)}
              className="rounded-md border border-edge px-3 py-1.5 text-sm font-medium text-slate-200 transition-colors hover:border-teal hover:text-teal"
            >
              {t('live.porofessor')}
            </button>
          )}
          <div className="flex items-center gap-3 text-sm text-slate-200">
            {t('live.scouting')}
            <Toggle on={settings.scoutingEnabled} onChange={toggleScouting} />
          </div>
        </div>
      </header>

      {settings.riotApiKey && (
        <div className="mb-4 flex shrink-0 flex-wrap items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && runSearch()}
            placeholder={t('live.searchPlaceholder')}
            spellCheck={false}
            className="w-72 rounded-md border border-edge bg-night px-3 py-1.5 text-sm text-slate-100 outline-none focus:border-teal"
          />
          <button
            onClick={runSearch}
            disabled={searching}
            className="rounded-md border border-teal bg-teal/10 px-3 py-1.5 text-sm font-medium text-teal hover:bg-teal/20 disabled:opacity-50"
          >
            {searching ? '…' : t('live.searchBtn')}
          </button>
          {searchGame && (
            <button onClick={clearSearch} className="text-xs text-mute hover:text-slate-200">
              {t('live.searchClear')}
            </button>
          )}
          {searchMsg && <span className="text-xs text-mute">{searchMsg}</span>}
        </div>
      )}

      {searchGame ? (
        <div className="flex min-h-0 flex-1 flex-col gap-4">
          <div className="shrink-0 text-sm text-slate-300">
            {t('live.searchViewing')}{' '}
            <span className="font-semibold text-slate-100">{searchName}</span>
          </div>
          <Team
            label={t('live.teamBlue')}
            color="bg-teal"
            players={searchGame.teamOne}
            scout={searchScout}
            side="blue"
            onOpenProfile={cardOpen}
          />
          <Team
            label={t('live.teamRed')}
            color="bg-loss"
            players={searchGame.teamTwo}
            scout={searchScout}
            side="red"
            onOpenProfile={cardOpen}
          />
        </div>
      ) : !settings.scoutingEnabled ? (
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
            onOpenProfile={cardOpen}
          />
          <Team
            label={t('live.teamRed')}
            color="bg-loss"
            players={game.teamTwo}
            scout={scout}
            side="red"
            onOpenProfile={cardOpen}
          />
          {scouting ? (
            <p className="shrink-0 text-center text-[11px] text-mute">{t('live.scouting2')}</p>
          ) : !settings.riotApiKey ? (
            <p className="shrink-0 text-center text-[11px] text-mute">
              {t('live.rankOnly')}{' '}
              <button
                onClick={onGoToOptions}
                className="text-teal underline-offset-2 hover:underline"
              >
                {t('live.unlockWinrate')}
              </button>
            </p>
          ) : null}
        </div>
      ) : (
        placeholder(loading ? t('live.loadingGame') : t('live.detected'))
      )}
    </section>
  )
}
