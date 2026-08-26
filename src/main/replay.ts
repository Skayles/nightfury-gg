/**
 * Replay/recording support (infrastructure).
 *
 * The video-encoding "engine" is ffmpeg. It is NOT bundled — the user chooses to
 * download it on demand (~50 MB) from the Replay tab, so the portable .exe stays
 * light for people who don't record. Recordings are listed from a user-chosen
 * folder (default: Videos/Nightfury.gg).
 */

import { app, net, shell, dialog, desktopCapturer } from 'electron'
import { spawn, type ChildProcess } from 'child_process'
import { join, sep } from 'path'
import {
  existsSync,
  mkdirSync,
  createWriteStream,
  writeFileSync,
  appendFileSync,
  renameSync,
  readdirSync,
  statSync,
  unlinkSync
} from 'fs'
import { createGunzip } from 'zlib'
import { statfsSync } from 'fs'
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
    // Skip our own in-progress temp files (.tmp_video_*.mp4 / .tmp_audio_*.webm),
    // which would otherwise show up as a replay while a recording is running.
    if (name.startsWith('.tmp_')) continue
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

/**
 * Drop temp files left behind by a recording that never finished (app killed or
 * crashed mid-game). A video temp cut short by a hard kill has no moov atom, so
 * it is not reliably playable — and since listReplays() hides them, they would
 * otherwise pile up in the replay folder unnoticed.
 */
export function cleanupTempFiles(): number {
  const dir = replayDir()
  if (!existsSync(dir)) return 0
  let removed = 0
  for (const name of readdirSync(dir)) {
    if (!name.startsWith('.tmp_')) continue
    try {
      unlinkSync(join(dir, name))
      removed++
    } catch {
      /* in use or unreadable — leave it */
    }
  }
  return removed
}

// Refuse to start a recording with less than this much room left.
const MIN_FREE_BYTES = 2 * 1024 * 1024 * 1024

/** Free bytes on the volume holding the replay folder (Infinity if unknown). */
export function freeSpaceBytes(): number {
  try {
    const st = statfsSync(replayDir())
    return st.bsize * st.bavail
  } catch {
    // Folder not created yet, or an OS that will not tell us — do not block.
    return Number.POSITIVE_INFINITY
  }
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

/**
 * True for a file this app produced itself: `replay_YYYY-MM-DD_HH-MM-SS.mp4`.
 *
 * The quota only ever deletes these. The replay folder is user-chosen and may
 * well be a general Videos folder, so automatically pruning "whatever video is
 * oldest" could destroy footage the app never created.
 */
export function isOwnRecording(name: string): boolean {
  const prefix = 'replay_'
  const lower = name.toLowerCase()
  if (!lower.startsWith(prefix) || !lower.endsWith('.mp4')) return false
  const stamp = name.slice(prefix.length, name.length - 4)
  const shape = 'dddd-dd-dd_dd-dd-dd'
  if (stamp.length !== shape.length) return false
  for (let i = 0; i < shape.length; i++) {
    const c = stamp[i]
    if (shape[i] === 'd') {
      if (c < '0' || c > '9') return false
    } else if (c !== shape[i]) return false
  }
  return true
}

/** Total bytes used by this app's own recordings. */
export function ownRecordingsSize(): number {
  return listReplays()
    .filter((r) => isOwnRecording(r.name))
    .reduce((sum, r) => sum + r.size, 0)
}

export interface QuotaInfo {
  usedBytes: number
  limitBytes: number
  files: number
}

export function quotaInfo(): QuotaInfo {
  const gb = getSettings().replayMaxGb || 0
  const own = listReplays().filter((r) => isOwnRecording(r.name))
  return {
    usedBytes: own.reduce((sum, r) => sum + r.size, 0),
    limitBytes: gb > 0 ? gb * 1024 * 1024 * 1024 : 0,
    files: own.length
  }
}

/**
 * Delete this app's oldest recordings until the folder fits the configured cap.
 * Returns the files removed (empty when there is no cap or nothing to do).
 */
export function enforceQuota(): string[] {
  const gb = getSettings().replayMaxGb || 0
  if (gb <= 0) return [] // unlimited
  const limit = gb * 1024 * 1024 * 1024

  // Oldest first, so we drop the least interesting footage.
  const own = listReplays()
    .filter((r) => isOwnRecording(r.name))
    .sort((a, b) => a.mtime - b.mtime)

  let used = own.reduce((sum, r) => sum + r.size, 0)
  const removed: string[] = []
  for (const r of own) {
    if (used <= limit) break
    // Never delete the file currently being written.
    if (r.path === recFile) continue
    try {
      unlinkSync(r.path)
      used -= r.size
      removed.push(r.name)
    } catch {
      /* locked or gone — skip it rather than spin */
    }
  }
  return removed
}

export function deleteReplay(path: string): boolean {
  try {
    // Only allow deleting inside the replay folder, as a safety guard. The
    // trailing separator matters: a bare prefix test would also accept a
    // sibling folder such as "...\Nightfury.gg-old".
    const dir = replayDir()
    const prefix = dir.endsWith(sep) ? dir : dir + sep
    if (!path.startsWith(prefix)) return false
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
// True while ffmpeg is muxing a finished recording. Starting a new capture then
// would reassign the temp paths below while the mux is still reading them.
let muxing = false
// Tail of ffmpeg's stderr, kept so a failure can be explained instead of just
// leaving the user with no file and no reason.
let recStderr = ''
// True once WE asked ffmpeg to stop, which tells the 'close' handler that the
// exit was expected and belongs to finishRecording().
let stopping = false
let failureCb: ((info: { reason: string; detail: string }) => void) | null = null

/** Called when ffmpeg dies on its own — i.e. the recording never really ran. */
export function onRecordingFailure(
  cb: (info: { reason: string; detail: string }) => void
): void {
  failureCb = cb
}

/**
 * Pick the line of ffmpeg's stderr that actually explains the failure. ffmpeg
 * prints its whole configuration first, so the useful part is near the end.
 */
function explainFfmpegError(buf: string): string {
  const lines = buf
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  const telling = [
    /unknown encoder/i,
    /cannot load/i,
    /not supported/i,
    /no such file or directory/i,
    /permission denied/i,
    /could not open/i,
    /failed to/i,
    /invalid/i,
    /error/i
  ]
  for (const rx of telling) {
    const hit = [...lines].reverse().find((l) => rx.test(l))
    if (hit) return hit.slice(0, 240)
  }
  return lines[lines.length - 1]?.slice(0, 240) ?? ''
}

export function isRecording(): boolean {
  return rec !== null
}

export function recordingInfo(): { recording: boolean; file: string; since: number } {
  return { recording: rec !== null, file: recFile, since: recStarted }
}

function videoInput(fps: number, mode: string, windowTitle?: string): string[] {
  if (process.platform === 'win32') {
    // ddagrab (Desktop Duplication) captures fullscreen/DirectX games; gdigrab
    // captures the desktop or a specific window (but not DirectX game windows).
    if (mode === 'fullscreen') {
      return ['-f', 'lavfi', '-i', `ddagrab=framerate=${fps}`]
    }
    if (mode === 'window' && windowTitle) {
      return ['-f', 'gdigrab', '-framerate', String(fps), '-i', `title=${windowTitle}`]
    }
    return ['-f', 'gdigrab', '-framerate', String(fps), '-i', 'desktop']
  }
  if (process.platform === 'darwin') {
    return ['-f', 'avfoundation', '-framerate', String(fps), '-i', '1:none']
  }
  return ['-f', 'x11grab', '-framerate', String(fps), '-i', ':0.0']
}

/** List open window titles so the user can capture a specific one. */
export async function listWindows(): Promise<string[]> {
  try {
    const sources = await desktopCapturer.getSources({ types: ['window'] })
    return sources.map((s) => s.name).filter((n) => !!n)
  } catch {
    return []
  }
}

/**
 * Which of our four encoder choices this machine can actually use.
 *
 * Note that `ffmpeg -encoders` is useless here: it lists what was compiled into
 * the binary, and the static build we download ships NVENC and QSV whatever GPU
 * is present. The only honest test is to actually open the encoder, so we run a
 * throwaway 128x128 encode against each one and keep those that exit cleanly.
 *
 * Picking an encoder the hardware cannot open makes ffmpeg exit a moment after
 * spawning, which used to look exactly like a working recording.
 */
const ENCODER_CODEC: Record<string, string> = {
  cpu: 'libx264',
  amd: 'h264_amf',
  nvidia: 'h264_nvenc',
  intel: 'h264_qsv'
}

let encoderCache: string[] | null = null

function canEncode(codec: string): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false
    const done = (v: boolean): void => {
      if (settled) return
      settled = true
      resolve(v)
    }
    try {
      const p = spawn(
        enginePath(),
        [
          '-hide_banner',
          '-loglevel',
          'error',
          '-f',
          'lavfi',
          '-i',
          'nullsrc=s=128x128:d=0.1',
          '-c:v',
          codec,
          '-f',
          'null',
          '-'
        ],
        { windowsHide: true }
      )
      // A wedged driver must not hang the probe.
      const guard = setTimeout(() => {
        try {
          p.kill()
        } catch {
          /* ignore */
        }
        done(false)
      }, 8000)
      p.on('error', () => {
        clearTimeout(guard)
        done(false)
      })
      p.on('close', (code) => {
        clearTimeout(guard)
        done(code === 0)
      })
    } catch {
      done(false)
    }
  })
}

export async function listEncoders(): Promise<string[]> {
  if (encoderCache) return encoderCache
  if (!engineInstalled()) return ['cpu']
  const out: string[] = []
  for (const [id, codec] of Object.entries(ENCODER_CODEC)) {
    if (await canEncode(codec)) out.push(id)
  }
  // Never hand back an empty list: libx264 is always there in practice, and an
  // empty result would disable every button in the UI.
  encoderCache = out.length ? out : ['cpu']
  return encoderCache
}

/** Forget the probe result, e.g. after the engine is re-downloaded. */
export function resetEncoderCache(): void {
  encoderCache = null
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
  if (muxing) return { ok: false, error: 'finishing-previous' }
  if (!engineInstalled()) return { ok: false, error: 'no-engine' }
  const s = getSettings()
  const height = s.replayResolution
  const fps = s.replayFps
  try {
    ensureDir(replayDir())
  } catch (e) {
    return { ok: false, error: String(e) }
  }
  // A 1080p60 game runs to roughly a gigabyte; starting one on a nearly full
  // disk produces a truncated file and can wedge the whole system. Measured
  // after ensureDir, since statfs needs the folder to exist.
  if (freeSpaceBytes() < MIN_FREE_BYTES) return { ok: false, error: 'low-disk' }
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
    ...videoInput(fps, s.replayCapture, s.replayWindowTitle),
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
    recStderr = ''
    stopping = false
    // ffmpeg reports everything on stderr; keep only the tail for diagnostics.
    p.stderr?.on('data', (d: Buffer) => {
      recStderr = (recStderr + d.toString()).slice(-4000)
    })
    p.on('error', (e) => {
      if (rec !== p) return
      rec = null
      failureCb?.({ reason: 'spawn-failed', detail: String(e?.message ?? e) })
    })
    // A wrong encoder (NVENC on an AMD card), an unavailable ddagrab or a stale
    // window title all let ffmpeg spawn fine and then exit a moment later. Left
    // unhandled, rec stayed set and isRecording() lied for the rest of the run.
    p.on('close', () => {
      if (stopping || rec !== p) return
      rec = null
      cleanupTempFiles()
      failureCb?.({ reason: 'engine-failed', detail: explainFfmpegError(recStderr) })
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

/**
 * Append one audio chunk from the renderer's MediaRecorder.
 *
 * The renderer streams chunks every few seconds rather than handing over one
 * blob at the end: buffering a whole game meant ~30 MB sitting in renderer
 * memory, and a crash mid-game lost all of the audio even though the video was
 * already on disk. Concatenated MediaRecorder chunks form a valid WebM stream.
 */
export function saveAudio(buf: Uint8Array): void {
  try {
    if (audioTmp) appendFileSync(audioTmp, Buffer.from(buf))
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
    // Snapshot the paths: a new recording started later must not repoint the
    // temp files this mux is still reading from.
    const file = recFile
    const vTmp = videoTmp
    const aTmp = audioTmp
    if (!p) {
      resolve({ ok: false })
      return
    }
    let done = false
    const afterVideo = async (): Promise<void> => {
      if (done) return
      done = true
      rec = null
      muxing = true
      try {
        const hasAudio = (() => {
          try {
            return existsSync(aTmp) && statSync(aTmp).size > 0
          } catch {
            return false
          }
        })()
        if (hasAudio) {
          const off = (offsetMs || 0) / 1000
          await runFfmpeg([
            '-y',
            '-i',
            vTmp,
            '-itsoffset',
            String(off),
            '-i',
            aTmp,
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
          await runFfmpeg(['-y', '-i', vTmp, '-c', 'copy', '-movflags', '+faststart', file])
        }
        try {
          if (existsSync(vTmp)) unlinkSync(vTmp)
          if (existsSync(aTmp)) unlinkSync(aTmp)
        } catch {
          /* ignore */
        }
      } finally {
        muxing = false
      }
      resolve({ ok: true, file })
    }
    stopping = true
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
