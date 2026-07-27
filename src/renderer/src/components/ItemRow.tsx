import type { DdragonInfo } from '../../../preload/index.d'
import { itemIcon, itemTooltipHtml } from '../lib'

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

  return (
    <div className="flex items-center gap-1">
      {slots.map((id, i) => {
        const url = id ? itemIcon(version, id) : null
        const info = id ? ddragon?.items?.[id] : null
        const style = { width: size, height: size }
        return (
          <div key={i} className="group relative">
            {url ? (
              <img src={url} alt="" style={style} className="rounded border border-edge/60" />
            ) : (
              <div style={style} className="rounded border border-edge/25 bg-night/40" />
            )}
            {info && (
              <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 hidden w-64 -translate-x-1/2 rounded-lg border border-edge bg-night p-3 text-left text-[11px] leading-relaxed text-slate-300 shadow-2xl group-hover:block">
                <div className="mb-1 font-display text-sm text-gold">{info.name}</div>
                <div dangerouslySetInnerHTML={{ __html: itemTooltipHtml(info.description) }} />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
