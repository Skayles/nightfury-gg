import { useEffect, useMemo, useState, type JSX } from 'react'
import type { Friend, DdragonInfo } from '../../../preload/index.d'
import { useT, type TFunc } from '../i18n'
import { profileIcon, champIcon } from '../lib'

function isOnline(f: Friend): boolean {
  return f.availability !== 'offline' && f.game !== 'offline'
}

function statusDot(f: Friend): string {
  if (!isOnline(f)) return 'bg-mute'
  if (f.availability === 'away' || f.availability === 'dnd') return 'bg-gold'
  if (f.availability === 'mobile') return 'bg-teal/60'
  return 'bg-win'
}

function subLine(f: Friend, t: TFunc): string {
  if (!isOnline(f)) return t('friends.offline')
  const gameLabel =
    f.game === 'lol'
      ? t('friends.lol')
      : f.game === 'tft'
        ? t('friends.tft')
        : f.game === 'valorant'
          ? t('friends.valorant')
          : f.game === 'lor'
            ? t('friends.lor')
            : f.game === 'wildrift'
              ? t('friends.wildrift')
              : f.availability === 'mobile'
                ? t('friends.mobile')
                : t('friends.online')
  let st = ''
  if (f.status === 'inGame') st = t('friends.inGame')
  else if (f.status === 'championSelect') st = t('friends.champSelect')
  else if (f.status === 'inQueue') st = t('friends.inQueue')
  return st ? `${gameLabel} · ${st}` : gameLabel
}

function FriendRow({
  f,
  ddragon,
  t
}: {
  f: Friend
  ddragon: DdragonInfo | null
  t: TFunc
}): JSX.Element {
  const version = ddragon?.version ?? ''
  const icon = profileIcon(version, f.iconId)
  const online = isOnline(f)
  const champ =
    f.game === 'lol' && f.championId ? champIcon(version, ddragon?.champions?.[f.championId]) : null
  return (
    <div className={'flex items-center gap-3 rounded-lg px-2 py-2 ' + (online ? '' : 'opacity-50')}>
      <div className="relative shrink-0">
        {icon ? (
          <img src={icon} alt="" className="h-9 w-9 rounded-full ring-1 ring-edge" />
        ) : (
          <div className="h-9 w-9 rounded-full bg-panel2" />
        )}
        <span
          className={
            'absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-panel ' +
            statusDot(f)
          }
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-slate-100">
          {f.name || '—'}
          {f.tagLine ? <span className="text-mute"> #{f.tagLine}</span> : null}
        </div>
        <div className="truncate text-[11px] text-mute">{subLine(f, t)}</div>
      </div>
      {champ && <img src={champ} alt="" className="h-7 w-7 shrink-0 rounded ring-1 ring-edge" />}
    </div>
  )
}

export default function FriendsDrawer({ onClose }: { onClose: () => void }): JSX.Element {
  const t = useT()
  const [friends, setFriends] = useState<Friend[] | null>(null)
  const [ddragon, setDdragon] = useState<DdragonInfo | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    window.api.getDdragonInfo().then(setDdragon).catch(() => setDdragon(null))
    let alive = true
    const load = (): void => {
      window.api
        .getFriends()
        .then((f) => alive && setFriends(f))
        .catch(() => alive && setFriends([]))
    }
    load()
    const id = setInterval(load, 15000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [])

  const list = useMemo(() => {
    const all = friends ?? []
    return [...all].sort((a, b) => {
      const oa = isOnline(a) ? 0 : 1
      const ob = isOnline(b) ? 0 : 1
      if (oa !== ob) return oa - ob
      return (a.name || '').localeCompare(b.name || '')
    })
  }, [friends])

  const onlineCount = (friends ?? []).filter(isOnline).length

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        onClick={(e) => e.stopPropagation()}
        className={
          'relative flex h-full w-[360px] flex-col border-l border-edge bg-panel pt-[38px] shadow-2xl transition-transform duration-200 ' +
          (mounted ? 'translate-x-0' : 'translate-x-full')
        }
      >
        <div className="flex items-center justify-between border-b border-edge px-5 py-4">
          <div>
            <h2 className="font-display text-lg text-slate-100">{t('friends.title')}</h2>
            <div className="text-[11px] text-mute">
              {onlineCount} {t('friends.online').toLowerCase()}
            </div>
          </div>
          <button onClick={onClose} className="rounded-md px-2 py-1 text-mute hover:text-slate-100">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-2">
          {friends === null ? (
            <div className="px-2 py-10 text-center text-sm text-mute">…</div>
          ) : list.length === 0 ? (
            <div className="px-2 py-10 text-center text-sm text-mute">{t('friends.needClient')}</div>
          ) : (
            list.map((f) => <FriendRow key={f.id} f={f} ddragon={ddragon} t={t} />)
          )}
        </div>
      </div>
    </div>
  )
}
