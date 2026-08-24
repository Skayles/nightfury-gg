import { useEffect, useState } from 'react'
import type { ReplayStatus, ReplayFile } from '../../../preload/index.d'
import { useT } from '../i18n'
import { agoShort } from '../lib'

function fmtSize(bytes: number): string {
  if (bytes >= 1e9) return (bytes / 1e9).toFixed(1) + ' Go'
  if (bytes >= 1e6) return (bytes / 1e6).toFixed(0) + ' Mo'
  return (bytes / 1e3).toFixed(0) + ' Ko'
}

export default function ReplayPanel(): JSX.Element {
  const t = useT()
  const [status, setStatus] = useState<ReplayStatus | null>(null)
  const [folder, setFolder] = useState('')
  const [replays, setReplays] = useState<ReplayFile[]>([])
  const [downloading, setDownloading] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [resolution, setResolution] = useState<720 | 1080 | 1440>(1080)
  const [fps, setFps] = useState<30 | 60>(60)
  const [encoder, setEncoder] = useState<'cpu' | 'amd' | 'nvidia' | 'intel'>('cpu')
  const [capture, setCapture] = useState<'windowed' | 'fullscreen'>('windowed')
  const [audio, setAudio] = useState(false)
  const [audioDevice, setAudioDevice] = useState('')
  const [audioInputs, setAudioInputs] = useState<string[]>([])
  const [mic, setMic] = useState(false)
  const [micDevice, setMicDevice] = useState('')
  const [recording, setRecording] = useState(false)
  const [recError, setRecError] = useState<string | null>(null)

  async function reload(): Promise<void> {
    const s = await window.api.getReplayStatus()
    setStatus(s)
    setFolder(s.folder)
    setReplays(s.replays)
    const settings = await window.api.getSettings()
    setResolution(settings.replayResolution)
    setFps(settings.replayFps)
    setEncoder(settings.replayEncoder)
    setCapture(settings.replayCapture)
    setAudio(settings.replayAudio)
    setAudioDevice(settings.replayAudioDevice)
    setMic(settings.replayMic)
    setMicDevice(settings.replayMicDevice)
  }

  async function loadAudioDevices(): Promise<void> {
    // Recording devices (mic, Stereo Mix…) come from ffmpeg (exact capture names).
    const ffInputs = await window.api.getAudioDevices()
    // Chromium also sees playback (output) devices and adds proper labels.
    let enumInputs: string[] = []
    try {
      const st = await navigator.mediaDevices.getUserMedia({ audio: true })
      st.getTracks().forEach((t) => t.stop())
    } catch {
      /* permission denied → labels may be blank, still try */
    }
    try {
      const devs = await navigator.mediaDevices.enumerateDevices()
      enumInputs = devs.filter((d) => d.kind === 'audioinput' && d.label).map((d) => d.label)
    } catch {
      /* enumerate failed */
    }
    setAudioInputs([...new Set([...ffInputs, ...enumInputs])])
  }

  // Populate lists on load without prompting for mic permission, so a saved
  // device shows up in its dropdown after reopening the app.
  async function loadAudioDevicesSilent(): Promise<void> {
    let enumInputs: string[] = []
    try {
      enumInputs = await window.api.getAudioDevices()
    } catch {
      /* ignore */
    }
    try {
      const devs = await navigator.mediaDevices.enumerateDevices()
      enumInputs = [
        ...enumInputs,
        ...devs.filter((d) => d.kind === 'audioinput' && d.label).map((d) => d.label)
      ]
    } catch {
      /* ignore */
    }
    setAudioInputs([...new Set(enumInputs)])
  }

  async function setQuality(patch: {
    replayResolution?: 720 | 1080 | 1440
    replayFps?: 30 | 60
    replayEncoder?: 'cpu' | 'amd' | 'nvidia' | 'intel'
    replayCapture?: 'windowed' | 'fullscreen'
    replayAudio?: boolean
    replayAudioDevice?: string
    replayMic?: boolean
    replayMicDevice?: string
  }): Promise<void> {
    if (patch.replayResolution) setResolution(patch.replayResolution)
    if (patch.replayFps) setFps(patch.replayFps)
    if (patch.replayEncoder) setEncoder(patch.replayEncoder)
    if (patch.replayCapture) setCapture(patch.replayCapture)
    if (patch.replayAudio !== undefined) setAudio(patch.replayAudio)
    if (patch.replayAudioDevice !== undefined) setAudioDevice(patch.replayAudioDevice)
    if (patch.replayMic !== undefined) setMic(patch.replayMic)
    if (patch.replayMicDevice !== undefined) setMicDevice(patch.replayMicDevice)
    await window.api.setSettings(patch)
  }

  useEffect(() => {
    reload()
    loadAudioDevicesSilent()
    window.api.getRecordingInfo().then((i) => setRecording(i.recording))
    const offProg = window.api.onEngineProgress((p) => setProgress(p))
    const offRec = window.api.onRecordingState((i) => setRecording(i.recording))
    const offList = window.api.onReplaysUpdated((l) => setReplays(l))
    const offSettings = window.api.onSettingsUpdated(() => reload())
    return () => {
      offProg()
      offRec()
      offList()
      offSettings()
    }
  }, [])

  async function toggleRecording(): Promise<void> {
    setRecError(null)
    if (recording) {
      await window.api.stopRecording()
      setRecording(false)
      await reload()
    } else {
      const r = await window.api.startRecording()
      if (r.ok) setRecording(true)
      else setRecError(r.error ?? 'error')
    }
  }

  async function download(): Promise<void> {
    setError(null)
    setDownloading(true)
    setProgress({ done: 0, total: 0 })
    const res = await window.api.downloadEngine()
    setDownloading(false)
    setProgress(null)
    if (!res.ok) setError(res.error ?? 'error')
    await reload()
  }

  async function pickFolder(): Promise<void> {
    const f = await window.api.pickReplayFolder()
    if (f) await reload()
  }

  const pct =
    progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : null

  // ffmpeg (dshow) can only capture RECORDING devices, so "game audio" must use
  // a loopback capture device (Stereo Mix, virtual cable) — not a playback one.
  const LOOPBACK_KEYS = [
    'stereo mix',
    'loopback',
    'what u hear',
    'wave out',
    'cable output',
    'voicemeeter out',
    'mix'
  ]
  const isLoopback = (d: string): boolean => LOOPBACK_KEYS.some((k) => d.toLowerCase().includes(k))
  const loopbackInputs = audioInputs.filter(isLoopback)
  const micInputs = audioInputs.filter((d) => !isLoopback(d))

  // Always include the saved device as an option, even before "Detect" is run,
  // so the dropdown shows the remembered selection instead of "auto-detect".
  const gameOptions =
    audioDevice && !loopbackInputs.includes(audioDevice)
      ? [audioDevice, ...loopbackInputs]
      : loopbackInputs
  const micOptions =
    micDevice && !micInputs.includes(micDevice) ? [micDevice, ...micInputs] : micInputs

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-1 font-display text-2xl text-slate-100">{t('replay.title')}</h1>
      <p className="mb-5 text-sm text-mute">{t('replay.intro')}</p>

      {/* Record button */}
      <div className="card mb-4 flex items-center justify-between gap-4 p-5">
        <div className="flex items-center gap-3">
          <span
            className={
              'h-3 w-3 rounded-full ' + (recording ? 'animate-pulse bg-loss' : 'bg-mute')
            }
          />
          <div>
            <div className="text-sm font-medium text-slate-200">
              {recording ? t('replay.recording') : t('replay.ready')}
            </div>
            <div className="mt-0.5 text-xs text-mute">
              {resolution}p · {fps} fps
            </div>
          </div>
        </div>
        <button
          onClick={toggleRecording}
          disabled={!status?.installed}
          className={
            'shrink-0 rounded-lg px-5 py-2 text-sm font-semibold disabled:opacity-50 ' +
            (recording
              ? 'bg-loss text-white hover:bg-loss/90'
              : 'bg-teal text-night hover:bg-teal/90')
          }
        >
          {recording ? t('replay.stop') : t('replay.start')}
        </button>
      </div>
      {!status?.installed && (
        <div className="mb-4 text-xs text-mute">{t('replay.needEngine')}</div>
      )}
      {recError && <div className="mb-4 text-xs text-loss">{recError}</div>}

      {/* Engine card */}
      <div className="card mb-4 p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-sm font-medium text-slate-200">{t('replay.engine')}</div>
            <div className="mt-0.5 text-xs text-mute">
              {status?.installed ? t('replay.engineReady') : t('replay.engineHint')}
            </div>
          </div>
          {status?.installed ? (
            <div className="flex shrink-0 items-center gap-2">
              <span className="rounded-full bg-win/15 px-3 py-1 text-xs font-medium text-win">
                {t('replay.installed')}
              </span>
              <button
                onClick={async () => {
                  await window.api.removeEngine()
                  await reload()
                }}
                className="rounded-lg border border-edge px-3 py-1.5 text-xs font-medium text-mute hover:border-loss hover:text-loss"
              >
                {t('replay.removeEngine')}
              </button>
            </div>
          ) : (
            <button
              onClick={download}
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

      {/* Folder card */}
      <div className="card mb-4 flex items-center justify-between gap-4 p-5">
        <div className="min-w-0">
          <div className="text-sm font-medium text-slate-200">{t('replay.folder')}</div>
          <div className="mt-0.5 truncate text-xs text-mute" title={folder}>
            {folder || '—'}
          </div>
        </div>
        <button
          onClick={pickFolder}
          className="shrink-0 rounded-lg border border-edge px-3 py-1.5 text-sm font-medium text-slate-200 hover:border-teal hover:text-teal"
        >
          {t('replay.change')}
        </button>
      </div>

      {/* Quality card */}
      <div className="card mb-4 p-5">
        <div className="text-sm font-medium text-slate-200">{t('replay.quality')}</div>
        <div className="mt-3 flex flex-wrap items-center gap-6">
          <div>
            <div className="section-label mb-1.5">{t('replay.resolution')}</div>
            <div className="segmented">
              {([720, 1080, 1440] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setQuality({ replayResolution: r })}
                  className={
                    'segmented-item ' +
                    (resolution === r ? 'segmented-item-active' : 'segmented-item-idle')
                  }
                >
                  {r}p
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="section-label mb-1.5">{t('replay.fps')}</div>
            <div className="segmented">
              {([30, 60] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setQuality({ replayFps: f })}
                  className={
                    'segmented-item ' +
                    (fps === f ? 'segmented-item-active' : 'segmented-item-idle')
                  }
                >
                  {f} fps
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-4">
          <div className="section-label mb-1.5">{t('replay.encoder')}</div>
          <div className="segmented">
            {(['cpu', 'amd', 'nvidia', 'intel'] as const).map((e) => (
              <button
                key={e}
                onClick={() => setQuality({ replayEncoder: e })}
                className={
                  'segmented-item ' +
                  (encoder === e ? 'segmented-item-active' : 'segmented-item-idle')
                }
              >
                {t('replay.enc_' + e)}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4">
          <div className="section-label mb-1.5">{t('replay.capture')}</div>
          <div className="segmented">
            {(['windowed', 'fullscreen'] as const).map((c) => (
              <button
                key={c}
                onClick={() => setQuality({ replayCapture: c })}
                className={
                  'segmented-item ' +
                  (capture === c ? 'segmented-item-active' : 'segmented-item-idle')
                }
              >
                {t('replay.cap_' + c)}
              </button>
            ))}
          </div>
          <div className="mt-1 text-[11px] text-mute">{t('replay.captureHint')}</div>
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between">
            <div className="section-label">{t('replay.audio')}</div>
            <button
              onClick={() => setQuality({ replayAudio: !audio })}
              className={
                'rounded-md px-3 py-1 text-xs font-medium ' +
                (audio ? 'bg-teal/20 text-teal' : 'bg-panel2 text-mute')
              }
            >
              {audio ? t('replay.on') : t('replay.off')}
            </button>
          </div>
          {audio && (
            <div className="mt-2">
              <div className="flex gap-2">
                <select
                  value={audioDevice}
                  onChange={(e) => setQuality({ replayAudioDevice: e.target.value })}
                  className="min-w-0 flex-1 rounded-md border border-edge bg-panel2 px-2 py-1.5 text-xs text-slate-200"
                >
                  <option value="">{t('replay.audioAuto')}</option>
                  {gameOptions.map((d) => (
                    <option key={'o-' + d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
                <button
                  onClick={loadAudioDevices}
                  className="shrink-0 rounded-md border border-edge px-2.5 py-1.5 text-xs text-slate-200 hover:border-teal hover:text-teal"
                >
                  {t('replay.detect')}
                </button>
              </div>
              <div className="mt-1 text-[11px] text-mute">{t('replay.audioHint')}</div>
            </div>
          )}
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between">
            <div className="section-label">{t('replay.mic')}</div>
            <button
              onClick={() => setQuality({ replayMic: !mic })}
              className={
                'rounded-md px-3 py-1 text-xs font-medium ' +
                (mic ? 'bg-teal/20 text-teal' : 'bg-panel2 text-mute')
              }
            >
              {mic ? t('replay.on') : t('replay.off')}
            </button>
          </div>
          {mic && (
            <div className="mt-2">
              <div className="flex gap-2">
                <select
                  value={micDevice}
                  onChange={(e) => setQuality({ replayMicDevice: e.target.value })}
                  className="min-w-0 flex-1 rounded-md border border-edge bg-panel2 px-2 py-1.5 text-xs text-slate-200"
                >
                  <option value="">{t('replay.audioAuto')}</option>
                  {micOptions.map((d) => (
                    <option key={'m-' + d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
                <button
                  onClick={loadAudioDevices}
                  className="shrink-0 rounded-md border border-edge px-2.5 py-1.5 text-xs text-slate-200 hover:border-teal hover:text-teal"
                >
                  {t('replay.detect')}
                </button>
              </div>
              <div className="mt-1 text-[11px] text-mute">{t('replay.micHint')}</div>
            </div>
          )}
        </div>

        <div className="mt-3 text-[11px] text-mute">{t('replay.qualityHint')}</div>
      </div>

      {/* Replay list */}
      <div className="mb-2 flex items-center justify-between">
        <h2 className="section-label">{t('replay.recordings')}</h2>
        <button onClick={reload} className="text-xs text-mute hover:text-slate-200">
          {t('profile.refresh')}
        </button>
      </div>

      {replays.length === 0 ? (
        <div className="card p-8 text-center text-sm text-mute">{t('replay.empty')}</div>
      ) : (
        <div className="flex flex-col gap-2">
          {replays.map((r) => (
            <div
              key={r.path}
              className="card flex items-center gap-3 p-3"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-panel2 text-teal">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
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
                  reload()
                }}
                className="shrink-0 rounded-md border border-edge px-2.5 py-1 text-xs text-mute hover:border-loss hover:text-loss"
              >
                {t('replay.delete')}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
