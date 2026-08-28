import type { JSX } from 'react'
import { useT } from '../../i18n'

/** Download / remove the ffmpeg engine, with its progress bar. */
export default function EngineCard({
  installed,
  downloading,
  progress,
  error,
  onDownload,
  onRemove
}: {
  installed: boolean
  downloading: boolean
  progress: { done: number; total: number } | null
  error: string | null
  onDownload: () => void
  onRemove: () => void
}): JSX.Element {
  const t = useT()
  const pct =
    progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : null

  return (
    <div className="card mb-4 p-5">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="text-sm font-medium text-slate-200">{t('replay.engine')}</div>
          <div className="mt-0.5 text-xs text-mute">
            {installed ? t('replay.engineReady') : t('replay.engineHint')}
          </div>
        </div>
        {installed ? (
          <div className="flex shrink-0 items-center gap-2">
            <span className="rounded-full bg-win/15 px-3 py-1 text-xs font-medium text-win">
              {t('replay.installed')}
            </span>
            <button
              onClick={onRemove}
              className="rounded-lg border border-edge px-3 py-1.5 text-xs font-medium text-mute hover:border-loss hover:text-loss"
            >
              {t('replay.removeEngine')}
            </button>
          </div>
        ) : (
          <button
            onClick={onDownload}
            disabled={downloading}
            className="shrink-0 rounded-lg bg-teal px-4 py-2 text-sm font-semibold text-night hover:bg-teal/90 disabled:opacity-60"
          >
            {downloading ? t('replay.downloading') : t('replay.downloadEngine')}
          </button>
        )}
      </div>

      {downloading && (
        <div className="mt-4">
          <div className="h-2 overflow-hidden rounded-full bg-panel2">
            <div
              className="h-full bg-teal transition-all"
              style={{ width: pct != null ? `${pct}%` : '25%' }}
            />
          </div>
          <div className="mt-1 text-[11px] text-mute">
            {pct != null ? `${pct}%` : t('replay.downloading')}
          </div>
        </div>
      )}
      {error && <div className="mt-3 text-xs text-loss">{error}</div>}
    </div>
  )
}
