import { useEffect, useState, type JSX } from 'react'
import type { MatchRecord, AppSettings, ExportStatus, MatchFilter } from '../../../preload/index.d'
import { useT } from '../i18n'
import FilterBar from './FilterBar'
import Toggle from './Toggle'
import { applyFilter } from '../lib'

const SCRIPT = `function doPost(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Games') || ss.insertSheet('Games');
  const data = JSON.parse(e.postData.contents);
  // Jeton optionnel : décommente pour verrouiller ton endpoint.
  // if (data.token !== 'MON_JETON') return json({ ok:false, error:'bad token' });
  if (sheet.getLastRow() === 0 && data.header) sheet.appendRow(data.header);
  data.rows.forEach(r => sheet.appendRow(r));
  return json({ ok:true, added: data.rows.length });
}
function json(o){return ContentService.createTextOutput(JSON.stringify(o))
  .setMimeType(ContentService.MimeType.JSON);}`

export default function ExportPanel({
  matches,
  settings,
  exp,
  onChanged
}: {
  matches: MatchRecord[]
  settings: AppSettings
  exp: ExportStatus | null
  onChanged: () => void
}): JSX.Element {
  const t = useT()
  const [url, setUrl] = useState(settings.scriptUrl ?? '')
  const [token, setToken] = useState(settings.exportToken ?? '')
  const [showSetup, setShowSetup] = useState(!settings.scriptUrl)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const matching = applyFilter(matches, settings.exportFilter).length

  useEffect(() => {
    setUrl(settings.scriptUrl ?? '')
    setToken(settings.exportToken ?? '')
  }, [settings.scriptUrl, settings.exportToken])

  async function saveUrl(): Promise<void> {
    await window.api.setSettings({ scriptUrl: url.trim() || null, exportToken: token.trim() || null })
    onChanged()
    setMsg(t('export.msg.urlSaved'))
  }

  async function setFilter(f: MatchFilter): Promise<void> {
    await window.api.setSettings({ exportFilter: f })
    onChanged()
  }

  async function toggle(key: 'autoExportOnGameEnd' | 'onlyNewOnExport', v: boolean): Promise<void> {
    await window.api.setSettings({ [key]: v } as Partial<AppSettings>)
    onChanged()
  }

  async function runExport(): Promise<void> {
    setBusy('run')
    setMsg(null)
    try {
      const { added } = await window.api.exportRun()
      setMsg(added > 0 ? t('export.msg.sent', { n: added }) : t('export.msg.upToDate'))
    } catch (e: any) {
      setMsg(e?.message ?? t('export.msg.fail'))
    } finally {
      setBusy(null)
    }
  }

  async function exportCsv(): Promise<void> {
    setBusy('csv')
    try {
      const res = await window.api.exportCsv()
      if (res.saved) setMsg(t('export.msg.csvSaved', { n: res.count ?? 0 }))
      else if (res.reason === 'empty') setMsg(t('export.msg.empty'))
    } finally {
      setBusy(null)
    }
  }

  async function copyScript(): Promise<void> {
    await navigator.clipboard.writeText(SCRIPT)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const hasUrl = Boolean(settings.scriptUrl)

  return (
    <section className="max-w-2xl">
      <header className="mb-5">
        <h1 className="font-display text-2xl text-slate-100">{t('export.title')}</h1>
        <p className="text-sm text-mute">{t('export.subtitle')}</p>
      </header>

      <div className="mb-4 rounded-lg border border-edge bg-panel">
        <button
          onClick={() => setShowSetup((v) => !v)}
          className="flex w-full items-center justify-between px-5 py-3 text-left text-sm font-medium text-slate-200"
        >
          {t('export.setup')}
          <span className="text-mute">{showSetup ? '▾' : '▸'}</span>
        </button>
        {showSetup && (
          <div className="space-y-3 border-t border-edge px-5 py-4 text-sm text-slate-300">
            <ol className="list-decimal space-y-1 pl-5 text-mute">
              <li>{t('export.step1')}</li>
              <li>{t('export.step2')}</li>
              <li>{t('export.step3')}</li>
              <li>{t('export.step4')}</li>
              <li>{t('export.step5')}</li>
            </ol>
            <div className="relative">
              <pre className="overflow-x-auto rounded-md border border-edge bg-night p-3 text-[11px] leading-relaxed text-slate-300">
                {SCRIPT}
              </pre>
              <button
                onClick={copyScript}
                className="absolute right-2 top-2 rounded border border-edge bg-panel2 px-2 py-1 text-[11px] text-slate-200 hover:border-teal"
              >
                {copied ? t('export.copied') : t('export.copy')}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-5">
        <div className="rounded-lg border border-edge bg-panel p-5">
          <div className="mb-2 text-sm font-medium text-slate-200">{t('export.urlLabel')}</div>
          <div className="flex gap-2">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://script.google.com/macros/s/…/exec"
              className="flex-1 rounded-md border border-edge bg-night px-3 py-2 text-sm text-slate-100 outline-none focus:border-teal"
            />
            <button
              onClick={saveUrl}
              className="rounded-md bg-teal px-4 py-2 text-sm font-semibold text-night hover:brightness-110"
            >
              {t('export.save')}
            </button>
          </div>
          <input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={t('export.tokenPlaceholder')}
            className="mt-2 w-full rounded-md border border-edge bg-night px-3 py-2 text-xs text-slate-300 outline-none focus:border-teal"
          />
        </div>

        <div className="rounded-lg border border-edge bg-panel p-5">
          <div className="mb-2 text-sm font-medium text-slate-200">{t('export.whatExport')}</div>
          <FilterBar
            matches={matches}
            filter={settings.exportFilter}
            onChange={setFilter}
            compact
          />
          <div className="mt-2 text-[11px] text-mute">
            {t('export.matching', { n: matching })}
            {settings.onlyNewOnExport ? t('export.matchingNew') : ''}.
          </div>
        </div>

        <div className="rounded-lg border border-edge bg-panel p-5">
          <Toggle
            label={t('export.autoToggle')}
            on={settings.autoExportOnGameEnd}
            onChange={(v) => toggle('autoExportOnGameEnd', v)}
          />
          <Toggle
            label={t('export.newOnlyToggle')}
            on={settings.onlyNewOnExport}
            onChange={(v) => toggle('onlyNewOnExport', v)}
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              onClick={runExport}
              disabled={busy === 'run' || !hasUrl}
              className="rounded-md bg-gold px-4 py-2 text-sm font-semibold text-night hover:brightness-110 disabled:opacity-50"
            >
              {busy === 'run' ? t('export.sending') : t('export.doExport')}
            </button>
            <button
              onClick={exportCsv}
              disabled={busy === 'csv'}
              className="rounded-md border border-edge bg-panel2 px-4 py-2 text-sm font-medium text-slate-200 hover:border-teal hover:text-teal disabled:opacity-50"
            >
              {busy === 'csv' ? t('export.csvBusy') : t('export.csv')}
            </button>
            {exp?.state === 'ok' && (
              <span className="text-xs text-win">{t('export.autoSent', { n: exp.added })}</span>
            )}
          </div>
        </div>
      </div>

      {msg && <div className="mt-4 text-sm text-mute">{msg}</div>}
    </section>
  )
}
