import type { LcuStatus } from '../../../preload/index.d'
import { useT } from '../i18n'
import logo from '../assets/logo.png'

export type Tab = 'live' | 'profile' | 'export' | 'options'

function Gear(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

export default function Topbar({
  tab,
  onTab,
  lcu,
  onOpenFriends
}: {
  tab: Tab
  onTab: (t: Tab) => void
  lcu: LcuStatus
  onOpenFriends: () => void
}): JSX.Element {
  const t = useT()
  const live = lcu.state === 'in-game'
  const connected = lcu.state === 'connected' || lcu.state === 'in-game'

  const items: { id: Tab; label: string }[] = [
    { id: 'live', label: t('nav.live') },
    { id: 'profile', label: t('nav.profile') },
    { id: 'export', label: t('nav.export') }
  ]

  return (
    <header className="flex items-center gap-6 border-b border-edge bg-panel px-6 py-2.5">
      <div className="flex items-center gap-2">
        <img src={logo} alt="" className="h-8 w-8" />
        <div className="font-display text-lg tracking-wide">
          <span className="text-slate-100">Night</span>
          <span className="text-teal">fury</span>
          <span className="text-mute">.gg</span>
        </div>
      </div>

      <nav className="flex items-center gap-1">
        {items.map((it) => {
          const active = tab === it.id
          return (
            <button
              key={it.id}
              onClick={() => onTab(it.id)}
              className={
                'relative rounded-md px-3 py-1.5 text-sm font-medium transition-colors ' +
                (active ? 'bg-panel2 text-teal' : 'text-slate-300 hover:text-slate-100')
              }
            >
              {it.label}
              {it.id === 'live' && live && (
                <span className="absolute -right-0 -top-0 h-2 w-2 animate-pulse rounded-full bg-teal" />
              )}
            </button>
          )
        })}
      </nav>

      <div className="ml-auto flex items-center gap-2">
        <button
          onClick={onOpenFriends}
          className="flex items-center gap-2 rounded-md border border-edge px-3 py-1.5 text-sm font-medium text-slate-300 transition-colors hover:border-teal hover:text-teal"
        >
          <span className={'h-2 w-2 rounded-full ' + (connected ? 'bg-teal' : 'bg-mute')} />
          {t('friends.title')}
        </button>
        <button
          onClick={() => onTab('options')}
          title={t('nav.options')}
          className={
            'rounded-md p-2 transition-colors ' +
            (tab === 'options' ? 'bg-panel2 text-teal' : 'text-mute hover:text-slate-100')
          }
        >
          <Gear />
        </button>
      </div>
    </header>
  )
}
