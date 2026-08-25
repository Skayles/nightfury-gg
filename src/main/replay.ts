/**
 * Replay/recording support (infrastructure).
 *
 * The video-encoding "engine" is ffmpeg. It is NOT bundled — the user chooses to
 * download it on demand (~50 MB) from the Replay tab, so the portable .exe stays
 * light for people who don't record. Recordings are listed from a user-chosen
 * folder (default: Videos/Nightfury.gg).
 */

import { app, net, shell, dialog } from 'electron'
import { spawn, type ChildProcess } from 'child_process'
import { join } from 'path'
import {
  existsSync,
  mkdirSync,
  createWriteStream,
  writeFileSync,
  renameSync,
  readdirSync,
  statSync,
  unlinkSync
} from 'fs'
import { createGunzip } from 'zlib'
import { getSettings, setSettings } from './store'

// ffmpeg static binary (gzipped) — Node's built-in zlib unpacks it, so no extra
// dependency is needed. Asset names follow `ffmpeg-{platform}-{arch}.gz`.
const ENGINE_ARCH = process.arch === 'arm64' ? 'arm64' : 'x64'
const ENGINE_PLATFORM =
  process.platform === 'win32' ? 'win32' : process.platform === 'darwin' ? 'darwin' : 'linux'
const ENGINE_URL = `https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffmpeg-${ENGINE_PLATFORM}-${ENGINE_ARCH}.gz`

const VIDEO_EXT = new Set(['.mp4', '.webm', '.mkv', '.mov'])

export function engineDir(): string {
  return join(app.getPath('userData'), 'engine')
}

export function enginePath(): string {
  return join(engineDir(), process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg')
}

export function engineInstalled(): boolean {
  return existsSync(enginePath())
}

/** Delete the downloaded ffmpeg engine to free disk space. */
export function removeEngine(): boolean {
  try {
    if (existsSync(enginePath())) unlinkSync(enginePath())
    return true
  } catch {
    return false
  }
}

export function replayDir(): string {
  const custom = getSettings().replayFolder?.trim()
  if (custom) return custom
  const base = app.getPath('videos') || app.getPath('userData')
  return join(base, 'Nightfury.gg')
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

export interface ReplayFile {
  name: string
  path: string
  size: number
  mtime: number
}

export function listReplays(): ReplayFile[] {
  const dir = replayDir()
  if (!existsSync(dir)) return []
  const out: ReplayFile[] = []
  for (const name of readdirSync(dir)) {
    const dot = name.lastIndexOf('.')
    const ext = dot >= 0 ? name.slice(dot).toLowerCase() : ''
    if (!VIDEO_EXT.has(ext)) continue
    try {
      const full = join(dir, name)
      const st = statSync(full)
      if (st.isFile()) out.push({ name, path: full, size: st.size, mtime: st.mtimeMs })
    } catch {
      /* skip unreadable entry */
    }
  }
  return out.sort((a, b) => b.mtime - a.mtime)
}

/** Download + unpack the ffmpeg engine, reporting progress via onProgress. */
export function downloadEngine(onProgress: (done: number, total: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      ensureDir(engineDir())
    } catch (e) {
      reject(e)
      return
    }
    const tmp = enginePath() + '.part'
    const request = net.request(ENGINE_URL)
    request.on('response', (response) => {
      const status = response.statusCode
      if (status !== 200) {
        reject(new Error(`HTTP ${status}`))
        return
      }
      const total = parseInt(String(response.headers['content-length'] ?? '0'), 10) || 0
      let done = 0
      const gunzip = createGunzip()
      const out = createWriteStream(tmp)
      gunzip.pipe(out)
      response.on('data', (chunk: Buffer) => {
        done += chunk.length
        gunzip.write(chunk)
        onProgress(done, total)
      })
      response.on('end', () => gunzip.end())
      response.on('error', reject)
      gunzip.on('error', reject)
      out.on('error', reject)
      out.on('finish', () => {
        try {
          renameSync(tmp, enginePath())
          resolve()
        } catch (e) {
          reject(e)
        }
      })
    })
    request.on('error', reject)
    request.end()
  })
}

export async function pickReplayFolder(): Promise<string | null> {
  const res = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory'],
    defaultPath: replayDir()
  })
  if (res.canceled || !res.filePaths[0]) return null
  setSettings({ replayFolder: res.filePaths[0] })
  return res.filePaths[0]
}

export function openReplay(path: string): void {
  shell.openPath(path)
}

export function revealReplay(path: string): void {
  shell.showItemInFolder(path)
}

export function deleteReplay(path: string): boolean {
  try {
    // Only allow deleting inside the replay folder, as a safety guard.
    if (!path.startsWith(replayDir())) return false
    unlinkSync(path)
    return true
  } catch {
    return false
  }
}

// ---- Recording (ffmpeg captures video; PC/mic audio comes from the renderer
// via Chromium loopback, then gets muxed into the final MP4) ------------------
let rec: ChildProcess | null = null
let recFile = ''
let recStarted = 0
let videoTmp = ''
let audioTmp = ''

export function isRecording(): boolean {
  return rec !== null
}

export function recordingInfo(): { recording: boolean; file: string; since: number } {
  return { recording: rec !== null, file: recFile, since: recStarted }
}

function videoInput(fps: number, mode: string): string[] {
  if (process.platform === 'win32') {
    // ddagrab (Desktop Duplication) captures fullscreen/DirectX games; gdigrab
    // only works for borderless windowed but is more broadly compatible.
    if (mode === 'fullscreen') {
      return ['-f', 'lavfi', '-i', `ddagrab=framerate=${fps}`]
    }
    return ['-f', 'gdigrab', '-framerate', String(fps), '-i', 'desktop']
  }
  if (process.platform === 'darwin') {
    return ['-f', 'avfoundation', '-framerate', String(fps), '-i', '1:none']
  }
  return ['-f', 'x11grab', '-framerate', String(fps), '-i', ':0.0']
}

/** Enumerate DirectShow audio inputs (Windows) so the user can pick a device. */
export function listAudioDevices(): Promise<string[]> {
  return new Promise((resolve) => {
    if (!engineInstalled() || process.platform !== 'win32') {
      resolve([])
      return
    }
    const p = spawn(
      enginePath(),
      ['-hide_banner', '-list_devices', 'true', '-f', 'dshow', '-i', 'dummy'],
      { windowsHide: true }
    )
    let buf = ''
    p.stderr?.on('data', (d: Buffer) => {
      buf += d.toString()
    })
    p.on('error', () => resolve([]))
    p.on('close', () => resolve(parseDshowAudio(buf)))
  })
}

/** Parse `-list_devices` output across ffmpeg versions (6.x has no "(audio)" tag). */
function parseDshowAudio(buf: string): string[] {
  const names: string[] = []
  let inAudio = false
  for (const line of buf.split(/\r?\n/)) {
    if (/DirectShow audio devices/i.test(line)) {
      inAudio = true
      continue
    }
    if (/DirectShow video devices/i.test(line)) {
      inAudio = false
      continue
    }
    // ffmpeg 7.x annotates the type directly.
    const tagged = line.match(/"([^"]+)"\s*\(audio\)/)
    if (tagged) {
      names.push(tagged[1])
      continue
    }
    // ffmpeg 6.x: quoted friendly name under the "audio devices" header
    // (skip the "Alternative name ..." lines).
    if (inAudio && !/Alternative name/i.test(line)) {
      const m = line.match(/"([^"]+)"/)
      if (m) names.push(m[1])
    }
  }
  return [...new Set(names)]
}

function pickAudioDevice(devices: string[]): string {
  const priority = [
    'stereo mix',
    'loopback',
    'what u hear',
    'wave out',
    'voicemeeter',
    'cable output',
    'virtual'
  ]
  const lower = devices.map((d) => d.toLowerCase())
  for (const key of priority) {
    const i = lower.findIndex((d) => d.includes(key))
    if (i >= 0) return devices[i]
  }
  return devices[0] ?? ''
}

function pickMicDevice(devices: string[]): string {
  const lower = devices.map((d) => d.toLowerCase())
  const loopbackish = ['stereo mix', 'loopback', 'what u hear', 'wave out', 'cable output']
  const isLoopback = (d: string): boolean => loopbackish.some((k) => d.includes(k))
  // Prefer an obvious microphone that is not a loopback device.
  for (const key of ['microphone', 'mic', 'headset', 'input']) {
    const i = lower.findIndex((d) => d.includes(key) && !isLoopback(d))
    if (i >= 0) return devices[i]
  }
  const i = lower.findIndex((d) => !isLoopback(d))
  return i >= 0 ? devices[i] : ''
}

function stamp(): string {
  const d = new Date()
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(
    d.getMinutes()
  )}-${p(d.getSeconds())}`
}

function encoderArgs(encoder: string): string[] {
  // Tuned for small files + low performance impact while staying clean enough
  // for coaching. GPU encoders barely touch the CPU/in-game FPS.
  switch (encoder) {
    case 'amd':
      // AMF (AMD, e.g. RX 6700 XT): constant-quality on the GPU.
      return [
        '-c:v',
        'h264_amf',
        '-quality',
        'balanced',
        '-rc',
        'cqp',
        '-qp_i',
        '26',
        '-qp_p',
        '28'
      ]
    case 'nvidia':
      return ['-c:v', 'h264_nvenc', '-preset', 'p4', '-tune', 'hq', '-rc', 'vbr', '-cq', '27', '-b:v', '0']
    case 'intel':
      return ['-c:v', 'h264_qsv', '-preset', 'veryfast', '-global_quality', '27']
    default:
      // CPU: veryfast keeps the processor load low; higher CRF keeps files small.
      return ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26']
  }
}

/**
 * Voie A recording: ffmpeg records VIDEO ONLY to a temp file; the renderer
 * captures PC (loopback) + mic audio via Chromium and sends it here; on stop we
 * mux the two together (with a sync offset) into the final MP4.
 */
export function startVideoOnly(): { ok: boolean; error?: string; file?: string } {
  if (rec) return { ok: false, error: 'already-recording' }
  if (!engineInstalled()) return { ok: false, error: 'no-engine' }
  const s = getSettings()
  const height = s.replayResolution
  const fps = s.replayFps
  try {
    ensureDir(replayDir())
  } catch (e) {
    return { ok: false, error: String(e) }
  }
  const ts = stamp()
  recFile = join(replayDir(), `replay_${ts}.mp4`)
  videoTmp = join(replayDir(), `.tmp_video_${ts}.mp4`)
  audioTmp = join(replayDir(), `.tmp_audio_${ts}.webm`)

  const vf =
    s.replayCapture === 'fullscreen' && process.platform === 'win32'
      ? `hwdownload,format=bgra,scale=-2:${height}`
      : `scale=-2:${height}`
  const args = [
    '-y',
    ...videoInput(fps, s.replayCapture),
    '-vf',
    vf,
    ...encoderArgs(s.replayEncoder),
    '-pix_fmt',
    'yuv420p',
    '-r',
    String(fps),
    '-g',
    String(fps * 2),
    videoTmp
  ]
  try {
    const p = spawn(enginePath(), args, { windowsHide: true })
    p.on('error', () => {
      rec = null
    })
    rec = p
    recStarted = Date.now()
    // Fresh audio temp for this recording.
    try {
      if (existsSync(audioTmp)) unlinkSync(audioTmp)
    } catch {
      /* ignore */
    }
    return { ok: true, file: recFile }
  } catch (e) {
    rec = null
    return { ok: false, error: String((e as Error)?.message ?? e) }
  }
}

/** Append an audio blob (from the renderer's MediaRecorder) to the temp file. */
export function saveAudio(buf: Uint8Array): void {
  try {
    if (audioTmp) writeFileSync(audioTmp, Buffer.from(buf))
  } catch {
    /* ignore */
  }
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve) => {
    try {
      const p = spawn(enginePath(), args, { windowsHide: true })
      p.on('close', () => resolve())
      p.on('error', () => resolve())
    } catch {
      resolve()
    }
  })
}

/** Stop the video capture and mux the renderer audio into the final MP4. */
export function finishRecording(offsetMs: number): Promise<{ ok: boolean; file?: string }> {
  return new Promise((resolve) => {
    const p = rec
    const file = recFile
    if (!p) {
      resolve({ ok: false })
      return
    }
    let done = false
    const afterVideo = async (): Promise<void> => {
      if (done) return
      done = true
      rec = null
      const hasAudio = (() => {
        try {
          return existsSync(audioTmp) && statSync(audioTmp).size > 0
        } catch {
          return false
        }
      })()
      if (hasAudio) {
        const off = (offsetMs || 0) / 1000
        await runFfmpeg([
          '-y',
          '-i',
          videoTmp,
          '-itsoffset',
          String(off),
          '-i',
          audioTmp,
          '-map',
          '0:v:0',
          '-map',
          '1:a:0',
          '-c:v',
          'copy',
          '-c:a',
          'aac',
          '-b:a',
          '160k',
          '-shortest',
          '-movflags',
          '+faststart',
          file
        ])
      } else {
        // No audio captured — just finalize the video with a fast-start index.
        await runFfmpeg(['-y', '-i', videoTmp, '-c', 'copy', '-movflags', '+faststart', file])
      }
      try {
        if (existsSync(videoTmp)) unlinkSync(videoTmp)
        if (existsSync(audioTmp)) unlinkSync(audioTmp)
      } catch {
        /* ignore */
      }
      resolve({ ok: true, file })
    }
    p.once('close', afterVideo)
    try {
      p.stdin?.write('q')
      p.stdin?.end()
    } catch {
      try {
        p.kill()
      } catch {
        /* ignore */
      }
    }
    setTimeout(() => {
      if (!done) {
        try {
          p.kill()
        } catch {
          /* ignore */
        }
        void afterVideo()
      }
    }, 8000)
  })
}