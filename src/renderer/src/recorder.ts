/**
 * Recording controller — deliberately NOT a React component.
 *
 * "Voie A" splits a recording in two: ffmpeg captures the video in the main
 * process, while the PC (loopback) and microphone audio are captured here with
 * Chromium and muxed in on stop. That audio capture must outlive the Replay
 * panel: the panel is mounted only while its tab is open, so keeping the state
 * in a component would orphan an in-flight MediaRecorder the moment the user
 * switches tabs — and would make auto-record depend on which tab is showing.
 *
 * Everything lives in module scope instead, and both the manual button and the
 * auto-record trigger go through the same functions.
 */

interface Capture {
  recorder: MediaRecorder | null
  streams: MediaStream[]
  ctx: AudioContext | null
  // Chunks are shipped to main as they arrive; this chains the sends so they
  // reach the file in order, and gives stop() something to await.
  writes: Promise<void>
}

const empty = (): Capture => ({
  recorder: null,
  streams: [],
  ctx: null,
  writes: Promise.resolve()
})

// How often MediaRecorder hands us a chunk to flush to disk.
const CHUNK_MS = 5000

let cap: Capture = empty()
// Guards against a manual click and an auto-record trigger overlapping.
let transitioning = false

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** Resolve a device label to a getUserMedia constraint (falls back to default). */
async function micConstraint(label: string): Promise<MediaTrackConstraints | boolean> {
  try {
    const devs = await navigator.mediaDevices.enumerateDevices()
    const m = devs.find((d) => d.kind === 'audioinput' && d.label === label)
    if (m) return { deviceId: { exact: m.deviceId } }
  } catch {
    /* ignore */
  }
  return true
}

async function startAudioCapture(): Promise<void> {
  cap = empty()
  const settings = await window.api.getSettings()
  const wantPc = settings.replayAudio
  const wantMic = settings.replayMic
  if (!wantPc && !wantMic) return // video-only

  const ctx = new AudioContext()
  cap.ctx = ctx
  const dest = ctx.createMediaStreamDestination()

  if (wantPc) {
    try {
      let pcStream: MediaStream | null = null
      if (settings.replayAudioDevice) {
        // A specific recording device (Stereo Mix, virtual cable, line-in…).
        const constraints: MediaStreamConstraints = {
          audio: await micConstraint(settings.replayAudioDevice)
        }
        pcStream = await navigator.mediaDevices.getUserMedia(constraints)
      } else {
        // Default playback device via loopback (handled in main). Video is
        // requested for compatibility, then dropped — we only keep the audio.
        const disp = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
        disp.getVideoTracks().forEach((t) => t.stop())
        pcStream = new MediaStream(disp.getAudioTracks())
      }
      if (pcStream && pcStream.getAudioTracks().length) {
        const src = ctx.createMediaStreamSource(pcStream)
        const g = ctx.createGain()
        g.gain.value = (settings.replayAudioVolume ?? 100) / 100
        src.connect(g).connect(dest)
        cap.streams.push(pcStream)
      }
    } catch (e) {
      void window.api.writeLog('warn', 'recorder', 'PC audio source unavailable', String(e))
    }
  }
  if (wantMic) {
    try {
      const constraints: MediaStreamConstraints = settings.replayMicDevice
        ? { audio: await micConstraint(settings.replayMicDevice) }
        : { audio: true }
      const micStream = await navigator.mediaDevices.getUserMedia(constraints)
      const src = ctx.createMediaStreamSource(micStream)
      const g = ctx.createGain()
      g.gain.value = (settings.replayMicVolume ?? 100) / 100
      src.connect(g).connect(dest)
      cap.streams.push(micStream)
    } catch (e) {
      void window.api.writeLog('warn', 'recorder', 'microphone unavailable', String(e))
    }
  }

  const mr = new MediaRecorder(dest.stream, { mimeType: 'audio/webm;codecs=opus' })
  mr.ondataavailable = (e): void => {
    if (!e.data || !e.data.size) return
    const blob = e.data
    cap.writes = cap.writes.then(async () => {
      try {
        await window.api.saveAudio(new Uint8Array(await blob.arrayBuffer()))
      } catch (e) {
        // A dropped chunk costs a few seconds of audio, not the recording —
        // but it must not vanish without trace.
        void window.api.writeLog('warn', 'recorder', 'audio chunk not written', String(e))
      }
    })
  }
  // The gap between this instant and ffmpeg's own start is the drift that
  // main corrects for, so report it rather than make anyone dial it in.
  mr.onstart = (): void => {
    void window.api.audioStarted(Date.now())
  }
  cap.recorder = mr
  mr.start(CHUNK_MS)
}

async function stopAudioCapture(): Promise<void> {
  const mr = cap.recorder
  if (mr && mr.state !== 'inactive') {
    // stop() emits one last dataavailable before onstop; wait for that final
    // chunk to be written before letting main mux the file.
    await new Promise<void>((res) => {
      mr.onstop = (): void => res()
      mr.stop()
    })
    await cap.writes
  }
  cap.streams.forEach((s) => s.getTracks().forEach((t) => t.stop()))
  cap.ctx?.close().catch(() => {})
  cap = empty()
}

/**
 * Start a recording. The previous one may still be muxing (a `-c:v copy`
 * remux, so a matter of seconds) — back-to-back games are rare but a queue
 * dodge into a fast remake can get close, so wait it out rather than drop the
 * recording.
 */
export async function startRecording(): Promise<{ ok: boolean; error?: string }> {
  if (transitioning) return { ok: false, error: 'busy' }
  transitioning = true
  try {
    let r = await window.api.startVideo()
    for (let i = 0; !r.ok && r.error === 'finishing-previous' && i < 20; i++) {
      await delay(500)
      r = await window.api.startVideo()
    }
    if (!r.ok) return { ok: false, error: r.error ?? 'error' }
    try {
      await startAudioCapture()
    } catch (e) {
      // Keep the video even if audio fails, but say so.
      void window.api.writeLog('error', 'recorder', 'audio capture failed to start', String(e))
    }
    return { ok: true }
  } finally {
    transitioning = false
  }
}

/**
 * ffmpeg died on its own — there is no video to mux against, so tear the audio
 * capture down and keep nothing. Without this the microphone and the loopback
 * stream would stay open for the rest of the session.
 */
export async function abortRecording(): Promise<void> {
  const mr = cap.recorder
  if (mr && mr.state !== 'inactive') {
    try {
      mr.stop()
    } catch {
      /* already gone */
    }
  }
  cap.streams.forEach((s) => s.getTracks().forEach((t) => t.stop()))
  cap.ctx?.close().catch(() => {})
  cap = empty()
  transitioning = false
}

/** Stop the capture and mux the audio in. Safe to call when not recording. */
export async function stopRecording(): Promise<void> {
  if (transitioning) return
  transitioning = true
  try {
    await stopAudioCapture()
    const settings = await window.api.getSettings()
    await window.api.finishRecording(settings.replayAudioOffsetMs ?? 0)
  } finally {
    transitioning = false
  }
}
