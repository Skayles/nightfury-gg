import { useEffect, useState } from 'react'
import type {
  MatchRecord,
  LcuStatus,
  ExportStatus,
  AppSettings,
  SummonerProfile,
  DdragonInfo
} from '../../preload/index.d'
import { LangContext, Lang, makeT } from './i18n'
import Sidebar, { Tab } from './components/Sidebar'
import TitleBar from './components/TitleBar'
import ReplayPanel from './components/ReplayPanel'
import StatusBar from './components/StatusBar'
import LivePanel from './components/LivePanel'
import Profile from './components/Profile'
import ExportPanel from './components/ExportPanel'
import Options from './components/Options'
import FriendsDrawer from './components/FriendsDrawer'

export default function App(): JSX.Element {
  const [tab, setTab] = useState<Tab>('profile')
  const [matches, setMatches] = useState<MatchRecord[]>([])
  const [lcu, setLcu] = useState<LcuStatus>({ state: 'connecting' })
  const [exp, setExp] = useState<ExportStatus | null>(null)
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [lang, setLang] = useState<Lang>('fr')
  const [friendsOpen, setFriendsOpen] = useState(false)
  const [meSummoner, setMeSummoner] = useState<SummonerProfile | null>(null)
  const [ddragon, setDdragon] = useState<DdragonInfo | null>(null)
  const [update, setUpdate] = useState<{
    updateAvailable: boolean
    latest: string
    url: string
  } | null>(null)
  const [profileSearch, setProfileSearch] = useState<{
    gameName: string
    tagLine: string
    nonce: number
  } | null>(null)

  function openPlayerProfile(gameName: string, tagLine: string): void {
    setProfileSearch({ gameName, tagLine, nonce: Date.now() })
    setTab('profile')
  }

  async function reloadSettings(): Promise<void> {
    const s = await window.api.getSettings()
    setSettings(s)
    setLang(s.language ?? 'fr')
  }

  useEffect(() => {
    window.api.listMatches().then(setMatches)
    window.api.getLcuStatus().then((s) => setLcu(s as LcuStatus))
    window.api.checkUpdate().then(setUpdate).catch(() => setUpdate(null))
    window.api.getSummoner().then(setMeSummoner).catch(() => setMeSummoner(null))
    window.api.getDdragonInfo().then(setDdragon).catch(() => setDdragon(null))
    reloadSettings()
    const off1 = window.api.onMatchesUpdated((m) => setMatches(m as MatchRecord[]))
    const off2 = window.api.onLcuStatus((s) => setLcu(s as LcuStatus))
    const off3 = window.api.onExportStatus((s) => setExp(s as ExportStatus))
    const off4 = window.api.onSummonerUpdated((p) => setMeSummoner(p as SummonerProfile))
    const off5 = window.api.onDdragonUpdated((i) => setDdragon(i as DdragonInfo))
    const off6 = window.api.onSettingsUpdated(() => reloadSettings())
    return () => {
      off1()
      off2()
      off3()
      off4()
      off5()
      off6()
    }
  }, [])

  async function changeLang(next: Lang): Promise<void> {
    setLang(next)
    await window.api.setSettings({ language: next })
    reloadSettings()
  }

  const t = makeT(lang)

  return (
    <LangContext.Provider value={lang}>
      <div className="flex h-full">
        <Sidebar
          tab={tab}
          onTab={setTab}
          lcu={lcu}
          onOpenFriends={() => setFriendsOpen(true)}
          summoner={meSummoner}
          ddragon={ddragon}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <TitleBar onOptions={() => setTab('options')} active={tab === 'options'} />
          {update?.updateAvailable && (
            <div className="flex shrink-0 items-center justify-center gap-3 border-b border-teal/30 bg-teal/10 px-4 py-2 text-sm text-teal">
              <span>{t('update.available', { v: update.latest })}</span>
              <button
                onClick={() => window.api.openExternal(update.url)}
                className="rounded border border-teal/50 px-2 py-0.5 font-medium hover:bg-teal/20"
              >
                {t('update.download')}
              </button>
              <button
                onClick={() => setUpdate(null)}
                className="text-teal/60 hover:text-teal"
                aria-label="close"
              >
                ✕
              </button>
            </div>
          )}
          <main className="flex-1 overflow-y-auto px-8 py-7">
            {tab === 'live' && settings && (
              <LivePanel
                lcu={lcu}
                settings={settings}
                onChanged={reloadSettings}
                onGoToOptions={() => setTab('options')}
                onOpenProfile={openPlayerProfile}
                matches={matches}
              />
            )}
            {tab === 'profile' && (
              <Profile
                matches={matches}
                hasApiKey={!!settings?.riotApiKey}
                pendingSearch={profileSearch}
                onSearchConsumed={() => setProfileSearch(null)}
              />
            )}
            {tab === 'export' && settings && (
              <ExportPanel
                matches={matches}
                settings={settings}
                exp={exp}
                onChanged={reloadSettings}
              />
            )}
            {tab === 'replay' && <ReplayPanel />}
            {tab === 'options' && settings && (
              <Options lang={lang} onLang={changeLang} settings={settings} onChanged={reloadSettings} />
            )}
          </main>
          <StatusBar lcu={lcu} exp={exp} matchCount={matches.length} />
        </div>
      </div>
      {friendsOpen && <FriendsDrawer onClose={() => setFriendsOpen(false)} />}
    </LangContext.Provider>
  )
}
