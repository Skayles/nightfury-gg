import { useEffect, useRef, useState } from 'react'

/**
 * Live audio level meter (OBS-style) for a given input device label.
 * Uses the Web Audio API to read the RMS level of a captured stream.
 */
export default function LevelMeter({
  deviceLabel,
  active,
  loopback
}: {
  deviceLabel?: string
  active: boolean
  loopback?: boolean
}): JSX.Element {
  const [level, setLevel] = useState(0)
  const [error, setError] = useState(false)
  const rafRef = useRef<number | null>(null)
  const ctxRef = useRef<AudioContext | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!active) {
      setLevel(0)
      return
    }

    async function start(): Promise<void> {
      setError(false)
      try {
        let stream: MediaStream
        if (loopback) {
          // Meter the default playback device (system loopback).
          const disp = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
          disp.getVideoTracks().forEach((t) => t.stop())
          const audioTracks = disp.getAudioTracks()
          if (!audioTracks.length) {
            setError(true)
            return
          }
          stream = new MediaStream(audioTracks)
        } else {
          let constraints: MediaStreamConstraints = { audio: true }
          if (deviceLabel) {
            try {
              const devs = await navigator.mediaDevices.enumerateDevices()
              const match = devs.find(
                (d) => d.kind === 'audioinput' && d.label && d.label === deviceLabel
              )
              if (match) constraints = { audio: { deviceId: { exact: match.deviceId } } }
            } catch {
              /* fall back to default */
            }
          }
          stream = await navigator.mediaDevices.getUserMedia(constraints)
        }
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        const Ctx = window.AudioContext
        const ctx = new Ctx()
        ctxRef.current = ctx
        const source = ctx.createMediaStreamSource(stream)
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 512
        source.connect(analyser)
        const data = new Uint8Array(analyser.fftSize)

        const tick = (): void => {
          analyser.getByteTimeDomainData(data)
          let sum = 0
          for (let i = 0; i < data.length; i++) {
            const v = (data[i] - 128) / 128
            sum += v * v
          }
          const rms = Math.sqrt(sum / data.length)
          setLevel(Math.min(1, rms * 2.2))
          rafRef.current = requestAnimationFrame(tick)
        }
        tick()
      } catch {
        if (!cancelled) setError(true)
      }
    }
    start()

    return () => {
      cancelled = true
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      streamRef.current?.getTracks().forEach((t) => t.stop())
      ctxRef.current?.close().catch(() => {})
      streamRef.current = null
      ctxRef.current = null
    }
  }, [deviceLabel, active, loopback])

  // Segmented meter: green up to ~75%, amber, then red near clipping.
  const pct = Math.round(level * 100)
  const color = pct > 90 ? 'bg-loss' : pct > 75 ? 'bg-gold' : 'bg-win'

  return (
    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-panel2">
      {!error && (
        <div
          className={'h-full ' + color}
          style={{ width: `${pct}%`, transition: 'width 60ms linear' }}
        />
      )}
    </div>
  )
}
