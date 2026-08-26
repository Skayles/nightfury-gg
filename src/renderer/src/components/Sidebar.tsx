import type { JSX } from 'react'
import type { LcuStatus, SummonerProfile, DdragonInfo } from '../../../preload/index.d'
import { useT } from '../i18n'
import { profileIcon, fmtRank } from '../lib'
import logo from '../assets/logo.png'

export type Tab = 'live' | 'profile' | 'export' | 'replay' | 'options'

function IconLive(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-[18px] w-[18px]">
      <path d="M3 12h4l2 5 4-12 2 7h6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function IconProfile(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-[18px] w-[18px]">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 4-6 8-6s8 2 8 6" strokeLinecap="round" />
    </svg>
  )
}
function IconExport(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-[18px] w-[18px]">
      <path d="M12 15V3m0 0L8 7m4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" strokeLinecap="round" />
    </svg>
  )
}
function IconReplay(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-[18px] w-[18px]">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M10 9.5v5l4-2.5-4-2.5z" fill="currentColor" stroke="none" />
    </svg>
  )
}
function IconFriends(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-[18px] w-[18px]">
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20c0-3 3-4.5 6-4.5s6 1.5 6 4.5" strokeLinecap="round" />
      <path d="M16 5.5a3 3 0 0 1 0 5.4M17 20c0-2.2-1-3.6-2.5-4.4" strokeLinecap="round" />
    </svg>
  )
}
function NavItem({
  icon,
  label,
  active,
  onClick,
  dot
}: {
  icon: JSX.Element
  label: string
  active: boolean
  onClick: () => void
  dot?: boolean
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      className={
        'group relative flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ' +
        (active
          ? 'bg-panel2 text-teal'
          : 'text-slate-300 hover:bg-panel2/50 hover:text-slate-100')
      }
    >
      {active && (
        <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r bg-teal" />
      )}
      <span className="shrink-0">{icon}</span>
      <span>{label}</span>
      {dot && <span className="ml-auto h-2 w-2 animate-pulse rounded-full bg-teal" />}
    </button>
  )
}

export default function Sidebar({
  tab,
  onTab,
  lcu,
  onOpenFriends,
  summoner,
  ddragon
}: {
  tab: Tab
  onTab: (t: Tab) => void
  lcu: LcuStatus
  onOpenFriends: () => void
  summoner: SummonerProfile | null
  ddragon: DdragonInfo | null
}): JSX.Element {
  const t = useT()
  const live = lcu.state === 'in-game'
  const connected = lcu.state === 'connected' || lcu.state === 'in-game'
  const icon = summoner ? profileIcon(ddragon?.version ?? '', summoner.profileIconId) : null
  const rank = summoner
    ? fmtRank(summoner.rankedTier, summoner.rankedDivision, summoner.rankedLp)
    : null

  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r border-edge bg-panel">
      <div className="flex items-center gap-2 px-5 py-5">
        <img src={logo} alt="" className="h-8 w-8" />
        <div className="font-display text-lg tracking-wide">
          <span className="text-slate-100">Night</span>
          <span className="text-teal">fury</span>
          <span className="text-mute">.gg</span>
        </div>
      </div>

      <div className="px-3">
        <div className="px-3 pb-1.5 pt-2 text-[10px] font-semibold uppercase tracking-widest text-mute">
          {t('nav.section')}
        </div>
        <nav className="flex flex-col gap-1">
          <NavItem
            icon={<IconLive />}
            label={t('nav.live')}
            active={tab === 'live'}
            onClick={() => onTab('live')}
            dot={live}
          />
          <NavItem
            icon={<IconProfile />}
            label={t('nav.profile')}
            active={tab === 'profile'}
            onClick={() => onTab('profile')}
          />
          <NavItem
            icon={<IconExport />}
            label={t('nav.export')}
            active={tab === 'export'}
            onClick={() => onTab('export')}
          />
          <NavItem
            icon={<IconReplay />}
            label={t('nav.replay')}
            active={tab === 'replay'}
            onClick={() => onTab('replay')}
          />
        </nav>
      </div>

      <div className="mt-auto px-3 pb-4">
        <div className="mb-2 h-px bg-edge/70" />
        <button
          onClick={onOpenFriends}
          className="group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-panel2/50 hover:text-slate-100"
        >
          <span className="shrink-0">
            <IconFriends />
          </span>
          <span>{t('friends.title')}</span>
          <span className={'ml-auto h-2 w-2 rounded-full ' + (connected ? 'bg-teal' : 'bg-mute')} />
        </button>
      </div>

      {summoner && (
        <div className="flex items-center gap-2.5 border-t border-edge px-4 py-3">
          <div className="relative shrink-0">
            {icon ? (
              <img src={icon} alt="" className="h-9 w-9 rounded-lg ring-1 ring-edge" />
            ) : (
              <div className="h-9 w-9 rounded-lg bg-panel2" />
            )}
            {summoner.summonerLevel ? (
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full border border-edge bg-night px-1 text-[9px] font-medium text-slate-200">
                {summoner.summonerLevel}
              </span>
            ) : null}
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-slate-100">
              {summoner.gameName || '—'}
            </div>
            <div className="truncate text-[11px] text-gold">
              {rank || t('profile.unranked')}
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}
