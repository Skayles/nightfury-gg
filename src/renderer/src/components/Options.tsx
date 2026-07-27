import { useEffect, useState } from 'react'
import type { Lang } from '../i18n'
import type { AppSettings } from '../../../preload/index.d'
import { useT } from '../i18n'
import Toggle from './Toggle'

const LANGS: { id: Lang; label: string; flag: string }[] = [
  { id: 'fr', label: 'Français', flag: '🇫🇷' },
  { id: 'en', label: 'English', flag: '🇬🇧' }
]

function fmtBytes(b: number): string {
  if (b < 1024) return `${b} o`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} Ko`
  return `${(b / 1024 / 1024).toFixed(1)} Mo`
}

export default function Options({
  lang,
  onLang,
  settings,
  onChanged
}: {
  lang: Lang
  onLang: (l: Lang) => void
  settings: AppSettings
  onChanged: () => void
}): JSX.Element {
  const t = useT()
  const [info, setInfo] = useState<{ count: number; bytes: number } | null>(null)
  const [pruning, setPruning] = useState(false)
  const [pruneMsg, setPruneMsg] = useState<string | null>(null)

  useEffect(() => {
    window.api.getStorageInfo().then(setInfo).catch(() => setInfo(null))
  }, [])

  async function toggleDiscord(v: boolean): Promise<void> {
    await window.api.setSettings({ discordEnabled: v })
    onChanged()
  }

  async function freeSpace(): Promise<void> {
    setPruning(true)
    setPruneMsg(null)
    try {
      const res = await window.api.pruneHistory()
      setInfo({ count: res.count, bytes: res.bytes })
      setPruneMsg(
        res.removed > 0 ? t('options.freeSpaceDone', { n: res.removed }) : t('options.freeSpaceNone')
      )
    } finally {
      setPruning(false)
    }
  }

  return (
    <section className="max-w-xl space-y-4">
      <header className="mb-1">
        <h1 className="font-display text-2xl text-slate-100">{t('options.title')}</h1>
      </header>

      <div className="rounded-lg border border-edge bg-panel p-5">
        <div className="text-sm font-medium text-slate-200">{t('options.language')}</div>
        <div className="mb-3 text-xs text-mute">{t('options.languageHint')}</div>
        <div className="flex gap-2">
          {LANGS.map((l) => {
            const active = lang === l.id
            return (
              <button
                key={l.id}
                onClick={() => onLang(l.id)}
                className={
                  'flex items-center gap-2 rounded-md border px-4 py-2 text-sm transition-colors ' +
                  (active
                    ? 'border-teal bg-teal/10 text-teal'
                    : 'border-edge bg-panel2 text-slate-200 hover:border-teal')
                }
              >
                <span className="text-base">{l.flag}</span>
                {l.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="rounded-lg border border-edge bg-panel p-5">
        <div className="flex items-center justify-between">
          <div className="pr-4">
            <div className="text-sm font-medium text-slate-200">{t('options.discord')}</div>
            <div className="mt-0.5 text-xs text-mute">{t('options.discordHint')}</div>
          </div>
          <Toggle on={settings.discordEnabled} onChange={toggleDiscord} />
        </div>
      </div>

      <div className="rounded-lg border border-edge bg-panel p-5">
        <div className="text-sm font-medium text-slate-200">{t('options.storage')}</div>
        <div className="mb-1 mt-0.5 text-xs text-mute">{t('options.freeSpaceHint')}</div>
        {info && (
          <div className="mb-3 text-xs text-slate-300">
            {t('options.storageCount', { n: info.count, size: fmtBytes(info.bytes) })}
          </div>
        )}
        <div className="flex items-center gap-3">
          <button
            onClick={freeSpace}
            disabled={pruning}
            className="rounded-md border border-edge bg-panel2 px-4 py-2 text-sm font-medium text-slate-200 hover:border-teal hover:text-teal disabled:opacity-50"
          >
            {pruning ? '…' : t('options.freeSpace')}
          </button>
          {pruneMsg && <span className="text-xs text-mute">{pruneMsg}</span>}
        </div>
      </div>
    </section>
  )
}
