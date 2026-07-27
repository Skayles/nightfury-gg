import { useEffect, useState } from 'react'
import type { MatchRecord, LcuStatus, ExportStatus, AppSettings } from '../../preload/index.d'
import { LangContext, Lang } from './i18n'
import Sidebar, { Tab } from './components/Sidebar'
import StatusBar from './components/StatusBar'
import LivePanel from './components/LivePanel'
import Profile from './components/Profile'
import ExportPanel from './components/ExportPanel'
import Options from './components/Options'

export default function App(): JSX.Element {
  const [tab, setTab] = useState<Tab>('profile')
  const [matches, setMatches] = useState<MatchRecord[]>([])
  const [lcu, setLcu] = useState<LcuStatus>({ state: 'connecting' })
  const [exp, setExp] = useState<ExportStatus | null>(null)
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [lang, setLang] = useState<Lang>('fr')

  async function reloadSettings(): Promise<void> {
    const s = await window.api.getSettings()
    setSettings(s)
    setLang(s.language ?? 'fr')
  }

  useEffect(() => {
    window.api.listMatches().then(setMatches)
    window.api.getLcuStatus().then((s) => setLcu(s as LcuStatus))
    reloadSettings()
    const off1 = window.api.onMatchesUpdated((m) => setMatches(m as MatchRecord[]))
    const off2 = window.api.onLcuStatus((s) => setLcu(s as LcuStatus))
    const off3 = window.api.onExportStatus((s) => setExp(s as ExportStatus))
    return () => {
      off1()
      off2()
      off3()
    }
  }, [])

  async function changeLang(next: Lang): Promise<void> {
    setLang(next)
    await window.api.setSettings({ language: next })
    reloadSettings()
  }

  return (
    <LangContext.Provider value={lang}>
      <div className="flex h-full">
        <Sidebar tab={tab} onTab={setTab} lcu={lcu} />
        <div className="flex min-w-0 flex-1 flex-col">
          <main className="flex-1 overflow-y-auto px-8 py-7">
            {tab === 'live' && settings && (
              <LivePanel lcu={lcu} settings={settings} onChanged={reloadSettings} />
            )}
            {tab === 'profile' && <Profile matches={matches} />}
            {tab === 'export' && settings && (
              <ExportPanel
                matches={matches}
                settings={settings}
                exp={exp}
                onChanged={reloadSettings}
              />
            )}
            {tab === 'options' && settings && (
              <Options
                lang={lang}
                onLang={changeLang}
                settings={settings}
                onChanged={reloadSettings}
              />
            )}
          </main>
          <StatusBar lcu={lcu} exp={exp} matchCount={matches.length} />
        </div>
      </div>
    </LangContext.Provider>
  )
}
