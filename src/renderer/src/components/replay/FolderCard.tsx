import type { JSX } from 'react'
import { useT } from '../../i18n'

const QUOTA_PRESETS = [10, 25, 50]

function fmtSize(bytes: number): string {
  if (bytes >= 1e9) return (bytes / 1e9).toFixed(1) + ' Go'
  if (bytes >= 1e6) return (bytes / 1e6).toFixed(0) + ' Mo'
  return (bytes / 1e3).toFixed(0) + ' Ko'
}

/** Where recordings go, and how much room they may take. */
export default function FolderCard({
  folder,
  maxGb,
  customGb,
  quota,
  pruned,
  onPickFolder,
  onSet,
  onSetDeferred,
  onCustomChange,
  onDismissPruned
}: {
  folder: string
  maxGb: number
  customGb: boolean
  quota: { usedBytes: number; limitBytes: number; files: number } | null
  pruned: string[]
  onPickFolder: () => void
  onSet: (patch: { replayMaxGb?: number }) => void
  onSetDeferred: (patch: { replayMaxGb?: number }) => void
  onCustomChange: (v: boolean) => void
  onDismissPruned: () => void
}): JSX.Element {
  const t = useT()

  return (
    <div className="card mb-4 p-5">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="text-sm font-medium text-slate-200">{t('replay.folder')}</div>
          <div className="mt-0.5 truncate text-xs text-mute" title={folder}>
            {folder || '—'}
          </div>
        </div>
        <button
          onClick={onPickFolder}
          className="shrink-0 rounded-lg border border-edge px-3 py-1.5 text-sm font-medium text-slate-200 hover:border-teal hover:text-teal"
        >
          {t('replay.change')}
        </button>
      </div>

      <div className="mt-4 border-t border-edge/60 pt-4">
        <div className="section-label mb-1.5">{t('replay.limit')}</div>
        <div className="segmented">
          {QUOTA_PRESETS.map((g) => (
            <button
              key={g}
              onClick={() => {
                onCustomChange(false)
                onSet({ replayMaxGb: g })
              }}
              className={
                'segmented-item ' +
                (!customGb && maxGb === g ? 'segmented-item-active' : 'segmented-item-idle')
              }
            >
              {g} Go
            </button>
          ))}
          <button
            onClick={() => {
              onCustomChange(true)
              if (QUOTA_PRESETS.includes(maxGb) || maxGb === 0) onSet({ replayMaxGb: 100 })
            }}
            className={
              'segmented-item ' + (customGb ? 'segmented-item-active' : 'segmented-item-idle')
            }
          >
            {t('replay.limitCustom')}
          </button>
          <button
            onClick={() => {
              onCustomChange(false)
              onSet({ replayMaxGb: 0 })
            }}
            className={
              'segmented-item ' +
              (maxGb === 0 && !customGb ? 'segmented-item-active' : 'segmented-item-idle')
            }
          >
            {t('replay.limitNone')}
          </button>
        </div>

        {customGb && (
          <div className="mt-2 flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={2000}
              step={1}
              value={maxGb || ''}
              onChange={(e) => {
                const v = Math.max(1, Math.min(2000, Math.round(Number(e.target.value) || 0)))
                onSetDeferred({ replayMaxGb: v })
              }}
              className="w-24 rounded-md border border-edge bg-panel2 px-2 py-1 text-right text-xs text-slate-200"
            />
            <span className="text-xs text-mute">Go</span>
          </div>
        )}

        {quota && (
          <div className="mt-2.5">
            {quota.limitBytes > 0 ? (
              <>
                <div className="h-1.5 overflow-hidden rounded-full bg-panel2">
                  <div
                    className={
                      'h-full transition-all ' +
                      (quota.usedBytes / quota.limitBytes > 0.9 ? 'bg-gold' : 'bg-teal')
                    }
                    style={{ width: `${Math.min(100, Math.round((quota.usedBytes / quota.limitBytes) * 100))}%` }}
                  />
                </div>
                <div className="mt-1 text-[11px] text-mute">
                  {t('replay.limitUsed', {
                    used: fmtSize(quota.usedBytes),
                    total: fmtSize(quota.limitBytes),
                    n: quota.files
                  })}
                </div>
              </>
            ) : (
              <div className="text-[11px] text-mute">
                {t('replay.limitUsedNone', { used: fmtSize(quota.usedBytes), n: quota.files })}
              </div>
            )}
            <div className="mt-1 text-[11px] text-mute">{t('replay.limitHint')}</div>
          </div>
        )}

        {pruned.length > 0 && (
          <div className="mt-2 rounded-md border border-edge bg-panel2/40 px-3 py-2 text-[11px] text-mute">
            {t('replay.limitPruned', { n: pruned.length })}
            <button onClick={() => onDismissPruned()} className="ml-2 text-teal hover:underline">
              {t('replay.limitPrunedOk')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
