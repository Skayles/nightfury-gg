import type { LcuStatus } from '../../../preload/index.d'
import { useT } from '../i18n'
import logo from '../assets/logo.png'

export type Tab = 'live' | 'profile' | 'export' | 'options'

export default function Sidebar({
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

  const items: { id: Tab; label: string; hint: string }[] = [
    { id: 'live', label: t('nav.live'), hint: t('nav.live.hint') },
    { id: 'profile', label: t('nav.profile'), hint: t('nav.profile.hint') },
    { id: 'export', label: t('nav.export'), hint: t('nav.export.hint') },
    { id: 'options', label: t('nav.options'), hint: t('nav.options.hint') }
  ]

  return (
    <aside className="flex w-60 flex-col border-r border-edge bg-panel">
      <div className="flex items-center gap-2.5 px-5 pb-4 pt-6">
        <img src={logo} alt="" className="h-12 w-12" />
        <div className="font-display text-xl tracking-wide">
          <span className="text-slate-100">Night</span>
          <span className="text-teal">fury</span>
          <span className="text-mute">.gg</span>
        </div>
      </div>
      <nav className="mt-2 flex flex-col gap-1 px-3">
        {items.map((it) => {
          const active = tab === it.id
          return (
            <button
              key={it.id}
              onClick={() => onTab(it.id)}
              className={
                'group rounded-md px-3 py-2 text-left transition-colors ' +
                (active ? 'bg-panel2 text-teal' : 'text-slate-300 hover:bg-panel2/60')
              }
            >
              <div className="flex items-center gap-2 text-sm font-medium">
                <span className={'h-4 w-0.5 rounded ' + (active ? 'bg-teal' : 'bg-transparent')} />
                {it.label}
                {it.id === 'live' && live && (
                  <span className="ml-auto h-2 w-2 animate-pulse rounded-full bg-teal" />
                )}
              </div>
              <div className="pl-3.5 text-[11px] text-mute">{it.hint}</div>
            </button>
          )
        })}
      </nav>

      <button
        onClick={onOpenFriends}
        className="mx-3 mb-4 mt-auto flex items-center gap-2 rounded-md border border-edge px-3 py-2 text-left text-sm font-medium text-slate-300 transition-colors hover:border-teal hover:text-teal"
      >
        <span className={'h-2 w-2 rounded-full ' + (connected ? 'bg-teal' : 'bg-mute')} />
        {t('friends.title')}
      </button>
    </aside>
  )
}
