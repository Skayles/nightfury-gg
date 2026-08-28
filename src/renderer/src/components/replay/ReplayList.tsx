import type { JSX } from 'react'
import type { ReplayFile } from '../../../../preload/index.d'
import { useT } from '../../i18n'
import { agoShort } from '../../lib'

function fmtSize(bytes: number): string {
  if (bytes >= 1e9) return (bytes / 1e9).toFixed(1) + ' Go'
  if (bytes >= 1e6) return (bytes / 1e6).toFixed(0) + ' Mo'
  return (bytes / 1e3).toFixed(0) + ' Ko'
}

/** The recorded files, with play / reveal / delete. */
export default function ReplayList({
  replays,
  onRefresh
}: {
  replays: ReplayFile[]
  onRefresh: () => void
}): JSX.Element {
  const t = useT()

  return (
    <>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="section-label">{t('replay.recordings')}</h2>
        <button onClick={onRefresh} className="text-xs text-mute hover:text-slate-200">
          {t('profile.refresh')}
        </button>
      </div>

      {replays.length === 0 ? (
        <div className="card p-8 text-center text-sm text-mute">{t('replay.empty')}</div>
      ) : (
        <div className="flex flex-col gap-2">
          {replays.map((r) => (
            <div key={r.path} className="card flex items-center gap-3 p-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-panel2 text-teal">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="h-5 w-5"
                >
                  <path d="M10 8v8l6-4-6-4z" fill="currentColor" stroke="none" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-slate-100">{r.name}</div>
                <div className="text-[11px] text-mute">
                  {fmtSize(r.size)} · {agoShort(r.mtime, t)}
                </div>
              </div>
              <button
                onClick={() => window.api.openReplay(r.path)}
                className="shrink-0 rounded-md border border-edge px-2.5 py-1 text-xs text-slate-200 hover:border-teal hover:text-teal"
              >
                {t('replay.play')}
              </button>
              <button
                onClick={() => window.api.revealReplay(r.path)}
                className="shrink-0 rounded-md border border-edge px-2.5 py-1 text-xs text-slate-200 hover:border-teal hover:text-teal"
              >
                {t('replay.reveal')}
              </button>
              <button
                onClick={async () => {
                  await window.api.deleteReplay(r.path)
                  onRefresh()
                }}
                className="shrink-0 rounded-md border border-edge px-2.5 py-1 text-xs text-mute hover:border-loss hover:text-loss"
              >
                {t('replay.delete')}
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
