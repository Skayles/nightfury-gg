import { useState } from 'react'
import { createPortal } from 'react-dom'
import type { DdragonInfo } from '../../../preload/index.d'
import { itemIcon, itemTooltipHtml } from '../lib'

interface Tip {
  x: number
  y: number
  below: boolean
  name: string
  desc: string
}

export default function ItemRow({
  items,
  ddragon,
  size = 28
}: {
  items: number[]
  ddragon: DdragonInfo | null
  size?: number
}): JSX.Element {
  const version = ddragon?.version ?? ''
  const slots = items.slice(0, 7)
  while (slots.length < 7) slots.push(0)
  const [tip, setTip] = useState<Tip | null>(null)

  return (
    <div className="flex items-center gap-1">
      {slots.map((id, i) => {
        const url = id ? itemIcon(version, id) : null
        const info = id ? ddragon?.items?.[id] : null
        const style = { width: size, height: size }
        return (
          <div
            key={i}
            className="relative"
            onMouseEnter={(e) => {
              if (!info) return
              const r = e.currentTarget.getBoundingClientRect()
              const below = r.top < 170
              setTip({
                x: r.left + r.width / 2,
                y: below ? r.bottom + 8 : r.top - 8,
                below,
                name: info.name,
                desc: info.description
              })
            }}
            onMouseLeave={() => setTip(null)}
          >
            {url ? (
              <img src={url} alt="" style={style} className="rounded border border-edge/60" />
            ) : (
              <div style={style} className="rounded border border-edge/25 bg-night/40" />
            )}
          </div>
        )
      })}
      {tip &&
        createPortal(
          <div
            style={{
              position: 'fixed',
              left: tip.x,
              top: tip.y,
              transform: `translate(-50%, ${tip.below ? '0' : '-100%'})`,
              zIndex: 1000,
              width: 256
            }}
            className="pointer-events-none rounded-lg border border-edge bg-night p-3 text-left text-[11px] leading-relaxed text-slate-300 shadow-2xl"
          >
            <div className="mb-1 font-display text-sm text-gold">{tip.name}</div>
            <div dangerouslySetInnerHTML={{ __html: itemTooltipHtml(tip.desc) }} />
          </div>,
          document.body
        )}
    </div>
  )
}
