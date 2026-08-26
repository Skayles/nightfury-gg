import { useState, type JSX } from 'react'
import { createPortal } from 'react-dom'
import type { DdragonInfo } from '../../../preload/index.d'
import { spellIcon } from '../lib'

interface Tip {
  x: number
  y: number
  below: boolean
  name: string
  desc: string
}

export default function SpellPair({
  spell1,
  spell2,
  ddragon,
  size = 34,
  vertical = false
}: {
  spell1?: number
  spell2?: number
  ddragon: DdragonInfo | null
  size?: number
  vertical?: boolean
}): JSX.Element {
  const version = ddragon?.version ?? ''
  const [tip, setTip] = useState<Tip | null>(null)

  const cell = (id: number | undefined, key: number): JSX.Element => {
    const src = spellIcon(version, ddragon?.spells, id ?? 0)
    const info = id ? ddragon?.spellInfo?.[id] : undefined
    const style = { width: size, height: size }
    return (
      <div
        key={key}
        onMouseEnter={(e) => {
          if (!info) return
          const r = e.currentTarget.getBoundingClientRect()
          const below = r.top < 180
          setTip({
            x: r.left + r.width / 2,
            y: below ? r.bottom + 8 : r.top - 8,
            below,
            name: info.name,
            desc: info.desc
          })
        }}
        onMouseLeave={() => setTip(null)}
      >
        {src ? (
          <img src={src} alt="" style={style} className="rounded" />
        ) : (
          <div style={style} className="rounded bg-night/40" />
        )}
      </div>
    )
  }

  return (
    <div className={'flex gap-0.5 ' + (vertical ? 'flex-col' : '')}>
      {cell(spell1, 0)}
      {cell(spell2, 1)}
      {tip &&
        createPortal(
          <div
            style={{
              position: 'fixed',
              left: tip.x,
              top: tip.y,
              transform: `translate(-50%, ${tip.below ? '0' : '-100%'})`,
              zIndex: 1000,
              width: 260
            }}
            className="pointer-events-none rounded-lg border border-edge bg-night p-3 text-left text-[11px] leading-relaxed text-slate-300 shadow-2xl"
          >
            <div className="mb-1 font-display text-sm text-gold">{tip.name}</div>
            <div>{tip.desc}</div>
          </div>,
          document.body
        )}
    </div>
  )
}
