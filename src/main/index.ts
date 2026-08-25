import {
  app,
  shell,
  BrowserWindow,
  ipcMain,
  dialog,
  Menu,
  Tray,
  nativeImage,
  session,
  desktopCapturer,
  type MenuItemConstructorOptions
} from 'electron'
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
import {
  engineInstalled,
  downloadEngine,
  removeEngine,
  replayDir,
  listReplays,
  pickReplayFolder,
  openReplay,
  revealReplay,
  deleteReplay,
  startVideoOnly,
  saveAudio,
  finishRecording,
  isRecording,
  recordingInfo,
  listAudioDevices,
  listWindows,
  cleanupTempFiles
} from './replay'
import {
  validateKey,
  riotScout,
  accountByRiotId,
  activeGameByPuuid,
  playerProfile,
  playerMatches
} from './riot'
import { exportToSheet } from './export'
import { applyFilter, toCsv, MatchRecord } from './stats'
import { loadDdragon, ddragonInfo, championName, championIdFromImage } from './ddragon'
import { initDiscord, setPresence, stopDiscord } from './discord'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false

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

function destroyTray(): void {
  if (tray) {
    try {
      tray.destroy()
    } catch {
      /* already gone */
    }
    tray = null
  }
}

function showWindow(): void {
  if (!mainWindow) {
    createWindow()
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
  // The window is visible again — the tray icon should only exist while hidden.
  destroyTray()
}

function refreshTrayMenu(): void {
  if (!tray) return
  const en = getSettings().language === 'en'
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: en ? 'Open Nightfury.gg' : 'Ouvrir Nightfury.gg', click: () => showWindow() },
      { type: 'separator' },
      {
        label: en ? 'Quit' : 'Quitter',
        click: () => {
          isQuitting = true
          app.quit()
        }
      }
    ])
  )
}

function iconPath(name: string): string {
  // Packaged: icons are copied to resources/ (see electron-builder.yml).
  // Dev: read straight from the build folder.
  return app.isPackaged
    ? join(process.resourcesPath, name)
    : join(__dirname, '../../build', name)
}

function createTray(): void {
  if (tray) return
  // Windows tray icons are tiny — prefer the .ico, fall back to a resized .png.
  let img = nativeImage.createFromPath(iconPath('icon.ico'))
  if (img.isEmpty()) {
    img = nativeImage.createFromPath(iconPath('icon.png'))
  }
  if (!img.isEmpty()) {
    img = img.resize({ width: 16, height: 16 })
  }
  tray = new Tray(img)
  tray.setToolTip('Nightfury.gg')
  refreshTrayMenu()
  tray.on('click', () => {
    if (mainWindow?.isVisible() && !mainWindow.isMinimized()) mainWindow.focus()
    else showWindow()
  })
  tray.on('double-click', () => showWindow())
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
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0B1622', symbolColor: '#C9D6E3', height: 38 },
    icon: iconPath('icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())
  // Fallback: some packaged builds don't reliably emit 'ready-to-show', which
  // would leave the window hidden — show it once the content has loaded too.
  mainWindow.webContents.once('did-finish-load', () => {
    if (!mainWindow?.isVisible()) mainWindow?.show()
  })

  // Close button hides to the system tray when enabled, instead of quitting.
  // The tray icon is created here (only while hidden), not at startup.
  mainWindow.on('close', (e) => {
    if (getSettings().closeToTray && !isQuitting) {
      e.preventDefault()
      mainWindow?.hide()
      createTray()
    }
  })
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Right-click menu (cut / copy / paste / select all) on editable fields.
  mainWindow.webContents.on('context-menu', (_e, params) => {
    const { editFlags, isEditable, selectionText } = params
    if (!isEditable && !selectionText) return
    const template: MenuItemConstructorOptions[] = isEditable
      ? [
          { role: 'cut', enabled: editFlags.canCut },
          { role: 'copy', enabled: editFlags.canCopy },
          { role: 'paste', enabled: editFlags.canPaste },
          { type: 'separator' },
          { role: 'selectAll' }
        ]
      : [{ role: 'copy', enabled: editFlags.canCopy }]
    Menu.buildFromTemplate(template).popup({ window: mainWindow ?? undefined })
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

// Safety net for auto-record. The gameflow websocket is the primary "the game
// ended" signal, but it can go silent (client killed, socket dropped) — and a
// recording that never stops quietly fills the disk with one huge MP4. While an
// auto recording runs we poll the phase; anything but InProgress ends it.
let autoWatchdog: ReturnType<typeof setInterval> | null = null
let autoWatchdogMisses = 0

function stopAutoWatchdog(): void {
  if (autoWatchdog) clearInterval(autoWatchdog)
  autoWatchdog = null
  autoWatchdogMisses = 0
}

function endAutoRecording(): void {
  stopAutoWatchdog()
  send('replay:auto', { action: 'stop' })
}

function startAutoWatchdog(): void {
  stopAutoWatchdog()
  autoWatchdog = setInterval(() => {
    void (async () => {
      if (!isRecording()) {
        // Never started (no engine) or already stopped by hand.
        stopAutoWatchdog()
        return
      }
      const phase = await lcu.gameflowPhase()
      if (phase === null) {
        // Client unreachable — tolerate a couple of blips before giving up.
        if (++autoWatchdogMisses < 3) return
      } else if (phase === 'InProgress') {
        autoWatchdogMisses = 0
        return
      }
      // The websocket never told us; treat the game as over.
      if (lastLcuState === 'in-game') lastLcuState = 'connected'
      endAutoRecording()
    })()
  }, 10000)
}

function onStatus(status: LcuStatus): void {
  const enteredGame = status.state === 'in-game' && lastLcuState !== 'in-game'
  const leftGame = lastLcuState === 'in-game' && status.state !== 'in-game'
  if (enteredGame) {
    gameStartTs = Date.now()
    // gameData (champion) can take a few seconds to populate — refresh once.
    setTimeout(() => void updateDiscord(), 8000)
    // Auto-record: the renderer drives audio capture, so ask it to start.
    if (getSettings().replayAuto && !isRecording()) {
      send('replay:auto', { action: 'start' })
      startAutoWatchdog()
    }
  }
  if (leftGame && getSettings().replayAuto && isRecording()) {
    endAutoRecording()
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

  ipcMain.handle('replay:status', () => ({
    installed: engineInstalled(),
    folder: replayDir(),
    replays: listReplays()
  }))
  ipcMain.handle('replay:download-engine', async () => {
    try {
      await downloadEngine((done, total) => send('replay:download-progress', { done, total }))
      return { ok: true }
    } catch (e) {
      return { ok: false, error: String((e as Error)?.message ?? e) }
    }
  })
  ipcMain.handle('replay:remove-engine', () => removeEngine())
  ipcMain.handle('replay:start-video', () => {
    const r = startVideoOnly()
    if (r.ok) send('replay:recording-state', recordingInfo())
    return r
  })
  ipcMain.handle('replay:save-audio', (_e, buf: Uint8Array) => {
    saveAudio(buf)
    return { ok: true }
  })
  ipcMain.handle('replay:finish', async (_e, offsetMs: number) => {
    const r = await finishRecording(offsetMs ?? 0)
    send('replay:recording-state', recordingInfo())
    send('replay:updated', listReplays())
    return r
  })
  ipcMain.handle('replay:audio-devices', () => listAudioDevices())
  ipcMain.handle('replay:windows', () => listWindows())
  ipcMain.handle('replay:recording-info', () => recordingInfo())
  ipcMain.handle('replay:list', () => listReplays())
  ipcMain.handle('replay:pick-folder', async () => {
    const f = await pickReplayFolder()
    if (f) send('settings:updated', getSettings())
    return f
  })
  ipcMain.handle('replay:open', (_e, path: string) => openReplay(path))
  ipcMain.handle('replay:reveal', (_e, path: string) => revealReplay(path))
  ipcMain.handle('replay:delete', (_e, path: string) => deleteReplay(path))

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
      refreshTrayMenu()
    }
    if (patch && typeof patch.discordEnabled === 'boolean') {
      if (patch.discordEnabled) {
        initDiscord().then(updateDiscord)
      } else {
        stopDiscord()
      }
    }
    send('settings:updated', next)
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
    async (
      _e,
      players: { puuid: string; championImage: string; teamId?: number }[],
      queueId: number
    ) => {
      const inputs = players.map((p) => ({
        puuid: p.puuid,
        championId: championIdFromImage(p.championImage),
        teamId: p.teamId ?? 0
      }))
      const key = getSettings().riotApiKey?.trim()
      const region = summonerProfile?.region || 'euw'
      // With a personal key: rank + real winrate via the official API.
      if (key) {
        try {
          const results = await riotScout(key, region, inputs)
          return {
            results,
            diag: {
              ok: true,
              tokenFound: true,
              baseFound: true,
              historyOk: true,
              base: 'riot-api',
              region,
              error: '',
              sample: ''
            }
          }
        } catch {
          /* fall back to keyless SGP below */
        }
      }
      return lcu.scoutPlayers(inputs, queueId)
    }
  )

  ipcMain.handle('riot:validate', async (_e, key: string) => {
    const region = summonerProfile?.region || 'euw'
    return validateKey((key ?? '').trim(), region)
  })

  ipcMain.handle(
    'riot:player-matches',
    async (_e, gameName: string, tagLine: string, start: number, count: number) => {
      const key = getSettings().riotApiKey?.trim()
      if (!key) return []
      const region = summonerProfile?.region || 'euw'
      return playerMatches(key, region, gameName.trim(), tagLine.trim(), start, count)
    }
  )

  ipcMain.handle('riot:player-profile', async (_e, gameName: string, tagLine: string) => {
    const key = getSettings().riotApiKey?.trim()
    if (!key) return { status: 'no-key' as const }
    const region = summonerProfile?.region || 'euw'
    return playerProfile(key, region, gameName.trim(), tagLine.trim())
  })

  ipcMain.handle('riot:player-live', async (_e, gameName: string, tagLine: string) => {
    const key = getSettings().riotApiKey?.trim()
    if (!key) return { status: 'no-key' as const }
    const region = summonerProfile?.region || 'euw'
    const acc = await accountByRiotId(key, region, gameName.trim(), tagLine.trim())
    if (!acc?.puuid) return { status: 'not-found' as const }
    const raw = await activeGameByPuuid(key, region, acc.puuid)
    if (!raw || !raw.participants?.length) return { status: 'not-in-game' as const }

    const dd = ddragonInfo()
    const mk = (p: {
      puuid: string
      championId: number
      riotId?: string
      summonerName?: string
    }): {
      name: string
      tagLine: string
      championImage: string
      championName: string
      skinId: number
      puuid: string
    } => {
      const [gn] = (p.riotId || '').split('#')
      const tl = (p.riotId || '').split('#')[1] || ''
      return {
        name: gn || p.summonerName || '',
        tagLine: tl,
        championImage: dd.champions?.[p.championId] || '',
        championName: dd.champNames?.[p.championId] || '',
        skinId: 0,
        puuid: p.puuid
      }
    }
    const teamOne = raw.participants.filter((p) => p.teamId === 100).map(mk)
    const teamTwo = raw.participants.filter((p) => p.teamId === 200).map(mk)
    const inputs = raw.participants.map((p) => ({
      puuid: p.puuid,
      championId: p.championId,
      teamId: p.teamId
    }))
    const scout = await riotScout(key, region, inputs)
    return {
      status: 'ok' as const,
      game: { teamOne, teamTwo, queueId: raw.gameQueueConfigId ?? 0 },
      scout
    }
  })

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

// Single instance: if the app is already running (e.g. hidden in the tray),
// relaunching the .exe just reveals the existing window instead of doing nothing.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => showWindow())
}

app.whenReady().then(async () => {
  // Stable data folder, decoupled from the display name: renaming/rebranding
  // the app must never move the user's stored history (%APPDATA%/nightfury).
  app.setName('nightfury')
  electronApp.setAppUserModelId('com.nightfury.app')
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

  initDb()
  registerIpc()
  cleanupTempFiles()

  // Allow the renderer to capture system (loopback) audio via getDisplayMedia —
  // this captures the default playback device's output, never the microphone.
  // (useSystemPicker only exists from Electron 33 on; on 31 this handler is
  // always the one used, so passing the option would just be a type error.)
  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
      callback({ video: sources[0], audio: 'loopback' })
    })
  })

  createWindow()

  app.on('before-quit', () => {
    isQuitting = true
  })
  // Remove the tray icon cleanly so Windows doesn't leave a "ghost" icon that
  // only disappears when the mouse hovers over the notification area.
  const destroyTrayOnQuit = (): void => destroyTray()
  app.on('will-quit', destroyTrayOnQuit)
  // Ctrl+C in the dev terminal kills the process with a signal, which bypasses
  // 'will-quit' — handle it explicitly so the tray icon is removed there too.
  process.on('SIGINT', () => {
    destroyTray()
    process.exit(0)
  })
  process.on('SIGTERM', () => {
    destroyTray()
    process.exit(0)
  })

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
