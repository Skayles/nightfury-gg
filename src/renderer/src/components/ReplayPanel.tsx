import { useEffect, useRef, useState, type JSX } from 'react'
import type { ReplayStatus, ReplayFile } from '../../../preload/index.d'
import { useT } from '../i18n'
import LevelMeter from './LevelMeter'
import * as recorder from '../recorder'
import EngineCard from './replay/EngineCard'
import ReplayList from './replay/ReplayList'
import FolderCard from './replay/FolderCard'
import AudioSettings from './replay/AudioSettings'

const QUOTA_PRESETS = [10, 25, 50]

function fmtClock(ms: number): string {
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const sec = total % 60
  const pad = (n: number): string => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`
}

function fmtSize(bytes: number): string {
  if (bytes >= 1e9) return (bytes / 1e9).toFixed(1) + ' Go'
  if (bytes >= 1e6) return (bytes / 1e6).toFixed(0) + ' Mo'
  return (bytes / 1e3).toFixed(0) + ' Ko'
}

type QualityPatch = {
  replayResolution?: 720 | 1080 | 1440
  replayFps?: 30 | 60
  replayEncoder?: 'auto' | 'cpu' | 'amd' | 'nvidia' | 'intel'
  replayCapture?: 'windowed' | 'fullscreen' | 'window'
  replayWindowTitle?: string
  replayAudio?: boolean
  replayAudioDevice?: string
  replayMic?: boolean
  replayMicDevice?: string
  replayAudioVolume?: number
  replayMicVolume?: number
  replayAudioOffsetMs?: number
  replayMaxGb?: number
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
  const [encoder, setEncoder] = useState<'auto' | 'cpu' | 'amd' | 'nvidia' | 'intel'>('auto')
  const [capture, setCapture] = useState<'windowed' | 'fullscreen' | 'window'>('windowed')
  const [windowTitle, setWindowTitle] = useState('')
  const [windows, setWindows] = useState<string[]>([])
  const [audio, setAudio] = useState(false)
  const [audioDevice, setAudioDevice] = useState('')
  const [audioInputs, setAudioInputs] = useState<string[]>([])
  const [mic, setMic] = useState(false)
  const [micDevice, setMicDevice] = useState('')
  const [audioVolume, setAudioVolume] = useState(100)
  const [micVolume, setMicVolume] = useState(100)
  const [audioOffset, setAudioOffset] = useState(0)
  const [recording, setRecording] = useState(false)
  const [recError, setRecError] = useState<string | null>(null)
  const [recDetail, setRecDetail] = useState<string | null>(null)
  const [recSince, setRecSince] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [encoders, setEncoders] = useState<string[]>([])
  const [autoEncoder, setAutoEncoder] = useState<string>('')
  const [maxGb, setMaxGb] = useState(0)
  const [customGb, setCustomGb] = useState(false)
  const [quota, setQuota] = useState<{
    usedBytes: number
    limitBytes: number
    files: number
  } | null>(null)
  const [pruned, setPruned] = useState<string[]>([])

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
    setWindowTitle(settings.replayWindowTitle)
    setAudio(settings.replayAudio)
    setAudioDevice(settings.replayAudioDevice)
    setMic(settings.replayMic)
    setMicDevice(settings.replayMicDevice)
    setAudioVolume(settings.replayAudioVolume ?? 100)
    setMicVolume(settings.replayMicVolume ?? 100)
    setAudioOffset(settings.replayAudioOffsetMs ?? 0)
    const gb = settings.replayMaxGb ?? 0
    setMaxGb(gb)
    setCustomGb(gb > 0 && !QUOTA_PRESETS.includes(gb))
    setQuota(await window.api.getReplayQuota())
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

  async function loadWindows(): Promise<void> {
    const w = await window.api.getWindows()
    setWindows(w)
  }

  // Sliders fire onChange on every step, so persisting each one would rewrite
  // settings.json (and broadcast settings:updated back to us) dozens of times
  // per drag. Local state moves immediately; the write is coalesced.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingPatch = useRef<QualityPatch>({})

  function applyLocal(patch: QualityPatch): void {
    if (patch.replayResolution) setResolution(patch.replayResolution)
    if (patch.replayFps) setFps(patch.replayFps)
    if (patch.replayEncoder) setEncoder(patch.replayEncoder)
    if (patch.replayCapture) setCapture(patch.replayCapture)
    if (patch.replayCapture === 'window') void loadWindows()
    if (patch.replayWindowTitle !== undefined) setWindowTitle(patch.replayWindowTitle)
    if (patch.replayAudio !== undefined) setAudio(patch.replayAudio)
    if (patch.replayAudioDevice !== undefined) setAudioDevice(patch.replayAudioDevice)
    if (patch.replayMic !== undefined) setMic(patch.replayMic)
    if (patch.replayMicDevice !== undefined) setMicDevice(patch.replayMicDevice)
    if (patch.replayAudioVolume !== undefined) setAudioVolume(patch.replayAudioVolume)
    if (patch.replayMicVolume !== undefined) setMicVolume(patch.replayMicVolume)
    if (patch.replayAudioOffsetMs !== undefined) setAudioOffset(patch.replayAudioOffsetMs)
    if (patch.replayMaxGb !== undefined) setMaxGb(patch.replayMaxGb)
  }

  function flushPending(): void {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = null
    const p = pendingPatch.current
    pendingPatch.current = {}
    if (Object.keys(p).length) void window.api.setSettings(p)
  }

  /** Immediate write — for discrete controls (buttons, dropdowns, toggles). */
  async function setQuality(patch: QualityPatch): Promise<void> {
    applyLocal(patch)
    await window.api.setSettings(patch)
  }

  /** Coalesced write — for continuous controls (sliders, number input). */
  function setQualityDeferred(patch: QualityPatch): void {
    applyLocal(patch)
    pendingPatch.current = { ...pendingPatch.current, ...patch }
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(flushPending, 300)
  }

  // Elapsed time, driven off the start timestamp main already reports, so it
  // stays right even when the tab is opened mid-recording.
  useEffect(() => {
    if (!recording || !recSince) {
      setElapsed(0)
      return
    }
    const tick = (): void => setElapsed(Math.max(0, Date.now() - recSince))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [recording, recSince])

  useEffect(() => {
    reload()
    loadAudioDevicesSilent()
    window.api
      .getEncoders()
      .then((e) => {
        setEncoders(e.available)
        setAutoEncoder(e.auto)
      })
      .catch(() => setEncoders([]))
    window.api.getRecordingInfo().then((i) => {
      setRecording(i.recording)
      setRecSince(i.since)
    })
    const offProg = window.api.onEngineProgress((p) => setProgress(p))
    const offRec = window.api.onRecordingState((i) => {
      setRecording(i.recording)
      setRecSince(i.since)
    })
    const offFail = window.api.onRecordingFailed((info) => {
      setRecording(false)
      setRecError(t('replay.err_' + info.reason))
      setRecDetail(info.detail || null)
    })
    const offList = window.api.onReplaysUpdated((l) => {
      setReplays(l)
      window.api.getReplayQuota().then(setQuota).catch(() => {})
    })
    const offPruned = window.api.onReplaysPruned((names) => setPruned(names))
    const offSettings = window.api.onSettingsUpdated(() => {
      // Skip the echo of a write we have not flushed yet — reloading now would
      // snap the slider being dragged back to the stored value.
      if (saveTimer.current) return
      reload()
    })
    return () => {
      flushPending()
      offFail()
      offPruned()
      offProg()
      offRec()
      offList()
      offSettings()
    }
  }, [])

  async function startRecording(): Promise<void> {
    setRecError(null)
    setRecDetail(null)
    const r = await recorder.startRecording()
    if (!r.ok) {
      setRecError(t('replay.err_' + (r.error ?? 'error')))
      return
    }
    setRecording(true)
  }

  async function stopRecording(): Promise<void> {
    await recorder.stopRecording()
    setRecording(false)
    await reload()
  }

  async function toggleRecording(): Promise<void> {
    if (recording) await stopRecording()
    else await startRecording()
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
  const micOptions =
    micDevice && !micInputs.includes(micDevice) ? [micDevice, ...micInputs] : micInputs

  const micMeterLabel = micDevice || ''

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
              {recording && (
                <span className="ml-2 font-mono text-slate-300">{fmtClock(elapsed)}</span>
              )}
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
      {recError && (
        <div className="mb-4 rounded-lg border border-loss/40 bg-loss/10 px-4 py-3">
          <div className="text-xs font-medium text-loss">{recError}</div>
          {recDetail && (
            <div className="mt-1 break-all font-mono text-[10px] text-mute">{recDetail}</div>
          )}
        </div>
      )}

      <EngineCard
        installed={!!status?.installed}
        downloading={downloading}
        progress={progress}
        error={error}
        onDownload={download}
        onRemove={async () => {
          await window.api.removeEngine()
          await reload()
        }}
      />

      <FolderCard
        folder={folder}
        maxGb={maxGb}
        customGb={customGb}
        quota={quota}
        pruned={pruned}
        onPickFolder={pickFolder}
        onSet={setQuality}
        onSetDeferred={setQualityDeferred}
        onCustomChange={setCustomGb}
        onDismissPruned={() => setPruned([])}
      />

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
            {(['auto', 'cpu', 'amd', 'nvidia', 'intel'] as const).map((e) => {
              // Empty list = not probed yet (or no engine): leave everything on.
              const usable = e === 'auto' || encoders.length === 0 || encoders.includes(e)
              return (
                <button
                  key={e}
                  onClick={() => setQuality({ replayEncoder: e })}
                  disabled={!usable}
                  title={usable ? undefined : t('replay.encUnavailable')}
                  className={
                    'segmented-item disabled:cursor-not-allowed disabled:opacity-40 ' +
                    (encoder === e ? 'segmented-item-active' : 'segmented-item-idle')
                  }
                >
                  {t('replay.enc_' + e)}
                </button>
              )
            })}
          </div>
          {encoder === 'auto' && autoEncoder && (
            <div className="mt-1 text-[11px] text-mute">
              {t('replay.encAutoPicked', { name: t('replay.enc_' + autoEncoder) })}
            </div>
          )}
          {encoders.length > 0 && encoders.length < 4 && (
            <div className="mt-1 text-[11px] text-mute">{t('replay.encProbed')}</div>
          )}
        </div>
        <div className="mt-4">
          <div className="section-label mb-1.5">{t('replay.capture')}</div>
          <div className="segmented">
            {(['windowed', 'fullscreen', 'window'] as const).map((c) => (
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
          {capture === 'window' && (
            <div className="mt-2 flex gap-2">
              <select
                value={windowTitle}
                onChange={(e) => setQuality({ replayWindowTitle: e.target.value })}
                className="min-w-0 flex-1 rounded-md border border-edge bg-panel2 px-2 py-1.5 text-xs text-slate-200"
              >
                <option value="">{t('replay.pickWindow')}</option>
                {windowTitle && !windows.includes(windowTitle) && (
                  <option value={windowTitle}>{windowTitle}</option>
                )}
                {windows.map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>
              <button
                onClick={loadWindows}
                className="shrink-0 rounded-md border border-edge px-2.5 py-1.5 text-xs text-slate-200 hover:border-teal hover:text-teal"
              >
                {t('replay.detect')}
              </button>
            </div>
          )}
          <div className="mt-1 text-[11px] text-mute">{t('replay.captureHint')}</div>
        </div>

        <AudioSettings
          audio={audio}
          audioDevice={audioDevice}
          loopbackInputs={loopbackInputs}
          mic={mic}
          micDevice={micDevice}
          micOptions={micOptions}
          micMeterLabel={micMeterLabel}
          audioVolume={audioVolume}
          micVolume={micVolume}
          audioOffset={audioOffset}
          recording={recording}
          onSet={setQuality}
          onSetDeferred={setQualityDeferred}
          onDetect={loadAudioDevices}
        />

      </div>

      <ReplayList replays={replays} onRefresh={reload} />
    </div>
  )
}
