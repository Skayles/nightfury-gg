import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { writeFileSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import {
  initDb,
  upsertMatches,
  listMatches,
  allMatches,
  unexportedIdSet,
  markExported,
  skipIdSet,
  markSchemaCurrent,
  resetHistory,
  pruneOlderThan,
  storageInfo,
  remapQueueNames,
  ONE_MONTH_MS
} from './db'
import { LcuService, LcuStatus, SummonerProfile } from './lcu'
import { getSettings, setSettings, MatchFilter } from './store'
import { exportToSheet } from './export'
import { applyFilter, toCsv, MatchRecord } from './stats'
import { loadDdragon, ddragonInfo, championName, championIdFromImage } from './ddragon'
import { initDiscord, setPresence, stopDiscord } from './discord'

let mainWindow: BrowserWindow | null = null

const GITHUB_REPO = 'Skayles/nightfury-gg'

/** True if `latest` (e.g. "v1.0.2") is a higher version than `current`. */
function isNewerVersion(latest: string, current: string): boolean {
  const a = latest.replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0)
  const b = current.replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] || 0
    const y = b[i] || 0
    if (x > y) return true
    if (x < y) return false
  }
  return false
}

/** Check GitHub for a newer release (keyless, public API). */
async function checkForUpdate(): Promise<{ updateAvailable: boolean; latest: string; url: string }> {
  const fallback = { updateAvailable: false, latest: '', url: '' }
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: { 'User-Agent': 'Nightfury.gg', Accept: 'application/vnd.github+json' }
    })
    if (!res.ok) return fallback
    const data: any = await res.json()
    const latest = String(data.tag_name || '')
    const url = String(data.html_url || `https://github.com/${GITHUB_REPO}/releases`)
    if (!latest) return fallback
    return { updateAvailable: isNewerVersion(latest, app.getVersion()), latest, url }
  } catch {
    return fallback
  }
}
let lcu: LcuService
let summonerProfile: SummonerProfile | null = null
let lastLcuState = 'connecting'
let lastStatus: LcuStatus = { state: 'connecting' }
let gameStartTs = Date.now()

async function updateDiscord(): Promise<void> {
  if (!getSettings().discordEnabled) return
  const lang = getSettings().language === 'en' ? 'en' : 'fr'
  const w =
    lang === 'en'
      ? { game: 'In game', client: 'In the League client', idle: 'Idle' }
      : { game: 'En partie', client: 'Dans le client League', idle: 'Au repos' }
  const me = summonerProfile?.gameName || 'Nightfury.gg'

  if (lastLcuState === 'in-game') {
    let champ = ''
    try {
      const id = await lcu.currentChampionId()
      if (id) champ = championName(id)
    } catch {
      /* ignore */
    }
    // Line 1: "In game", line 2: champion (fallback to summoner). Timer = game start.
    setPresence(w.game, champ || me, gameStartTs)
  } else if (lastLcuState === 'connected') {
    setPresence(me, w.client)
  } else {
    setPresence('Nightfury.gg', w.idle)
  }
}

function send(channel: string, payload?: unknown): void {
  mainWindow?.webContents.send(channel, payload)
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: '#0B1622',
    title: 'Nightfury.gg',
    autoHideMenuBar: true,
    icon: join(__dirname, '../../build/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

/** Matches selected for export = filter applied, optionally only-new. */
function selectForExport(filter: MatchFilter, onlyNew: boolean): MatchRecord[] {
  let picked = applyFilter(allMatches(), filter)
  if (onlyNew) {
    const unexported = unexportedIdSet()
    picked = picked.filter((m) => unexported.has(m.gameId))
  }
  return picked
}

async function runExport(): Promise<{ added: number }> {
  const s = getSettings()
  if (!s.scriptUrl) throw new Error('Aucune URL de script configurée.')
  const picked = selectForExport(s.exportFilter, s.onlyNewOnExport)
  const { added } = await exportToSheet(picked, s.scriptUrl, s.exportToken)
  markExported(picked.map((m) => m.gameId))
  return { added }
}

function onMatches(records: MatchRecord[], reason: 'backfill' | 'game-end'): void {
  upsertMatches(records)
  if (reason === 'backfill') markSchemaCurrent()
  send('matches:updated', listMatches(300))
  if (reason === 'game-end') {
    const s = getSettings()
    if (s.autoExportOnGameEnd && s.scriptUrl) {
      send('export:status', { state: 'syncing' })
      runExport()
        .then(({ added }) => send('export:status', { state: 'ok', added }))
        .catch((e) => send('export:status', { state: 'error', message: e?.message ?? String(e) }))
    }
  }
}

function onStatus(status: LcuStatus): void {
  if (status.state === 'in-game' && lastLcuState !== 'in-game') {
    gameStartTs = Date.now()
    // gameData (champion) can take a few seconds to populate — refresh once.
    setTimeout(() => void updateDiscord(), 8000)
  }
  lastLcuState = status.state
  lastStatus = status
  send('lcu:status', status)
  void updateDiscord()
}

function onProfile(profile: SummonerProfile): void {
  summonerProfile = profile
  send('summoner:updated', profile)
  void updateDiscord()
}

function registerIpc(): void {
  ipcMain.handle('matches:list', () => listMatches(300))
  ipcMain.handle('matches:all', () => allMatches())
  ipcMain.handle('matches:refresh', async () => {
    await lcu.refreshHistory('backfill')
    return listMatches(300)
  })
  ipcMain.handle('history:reset', async () => {
    resetHistory()
    send('matches:updated', [])
    // Re-pull fresh from the client (correct data) if it's available.
    await lcu.refreshHistory('backfill')
    return listMatches(300)
  })
  ipcMain.handle('history:info', () => storageInfo())
  ipcMain.handle('history:prune', () => {
    const removed = pruneOlderThan(ONE_MONTH_MS)
    if (removed > 0) send('matches:updated', listMatches(300))
    return { removed, ...storageInfo() }
  })

  ipcMain.handle('settings:get', () => getSettings())
  ipcMain.handle('settings:set', async (_e, patch) => {
    const prevLang = getSettings().language
    const next = setSettings(patch)
    if (patch && patch.language && patch.language !== prevLang) {
      await loadDdragon(patch.language === 'en' ? 'en_US' : 'fr_FR')
      send('ddragon:updated', ddragonInfo())
      updateDiscord()
    }
    if (patch && typeof patch.discordEnabled === 'boolean') {
      if (patch.discordEnabled) {
        initDiscord().then(updateDiscord)
      } else {
        stopDiscord()
      }
    }
    return next
  })
  ipcMain.handle('ddragon:info', () => ddragonInfo())
  ipcMain.handle('summoner:get', () => summonerProfile)
  ipcMain.handle('lcu:status:get', () => lastStatus)
  ipcMain.handle('match:timeline', (_e, gameId: number) => lcu.fetchTimeline(gameId))
  ipcMain.handle('friends:get', () => lcu.fetchFriends())
  ipcMain.handle('update:check', () => checkForUpdate())
  ipcMain.handle('shell:open', (_e, url: string) => shell.openExternal(url))
  ipcMain.handle('live:get', () => lcu.fetchLiveGame())
  ipcMain.handle(
    'live:scout',
    (_e, players: { puuid: string; championImage: string }[], queueId: number) => {
      const inputs = players.map((p) => ({
        puuid: p.puuid,
        championId: championIdFromImage(p.championImage)
      }))
      return lcu.scoutPlayers(inputs, queueId)
    }
  )

  ipcMain.handle('export:run', async () => runExport())
  ipcMain.handle('export:preview', () => {
    const s = getSettings()
    return selectForExport(s.exportFilter, s.onlyNewOnExport).length
  })
  ipcMain.handle('export:csv', async () => {
    const s = getSettings()
    const picked = applyFilter(allMatches(), s.exportFilter)
    if (!picked.length) return { saved: false, reason: 'empty' }
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow!, {
      title: 'Exporter en CSV',
      defaultPath: 'lol-games.csv',
      filters: [{ name: 'CSV', extensions: ['csv'] }]
    })
    if (canceled || !filePath) return { saved: false, reason: 'canceled' }
    writeFileSync(filePath, '\uFEFF' + toCsv(picked), 'utf-8')
    return { saved: true, filePath, count: picked.length }
  })
}

app.whenReady().then(async () => {
  // Stable data folder, decoupled from the display name: renaming/rebranding
  // the app must never move the user's stored history (%APPDATA%/nightfury).
  app.setName('nightfury')
  electronApp.setAppUserModelId('com.nightfury.app')
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

  initDb()
  registerIpc()
  createWindow()

  await loadDdragon(getSettings().language === 'en' ? 'en_US' : 'fr_FR')

  lcu = new LcuService(onStatus, onMatches, () => skipIdSet(), onProfile, () => {
    if (remapQueueNames() > 0) send('matches:updated', listMatches(300))
  })
  lcu.connect()

  if (getSettings().discordEnabled) initDiscord().then(updateDiscord)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  lcu?.close()
  stopDiscord()
  if (process.platform !== 'darwin') app.quit()
})
