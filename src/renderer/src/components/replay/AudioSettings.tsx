import type { JSX } from 'react'
import { useT } from '../../i18n'
import LevelMeter from '../LevelMeter'

/** PC sound, microphone, and the residual sync fine-tune. */
export default function AudioSettings({
  audio,
  audioDevice,
  loopbackInputs,
  mic,
  micDevice,
  micOptions,
  micMeterLabel,
  audioVolume,
  micVolume,
  audioOffset,
  recording,
  onSet,
  onSetDeferred,
  onDetect
}: {
  audio: boolean
  audioDevice: string
  loopbackInputs: string[]
  mic: boolean
  micDevice: string
  micOptions: string[]
  micMeterLabel: string
  audioVolume: number
  micVolume: number
  audioOffset: number
  recording: boolean
  onSet: (patch: {
    replayAudio?: boolean
    replayAudioDevice?: string
    replayMic?: boolean
    replayMicDevice?: string
  }) => void
  onSetDeferred: (patch: {
    replayAudioVolume?: number
    replayMicVolume?: number
    replayAudioOffsetMs?: number
  }) => void
  onDetect: () => void
}): JSX.Element {
  const t = useT()

  return (
    <>
      <div className="mt-4">
        <div className="flex items-center justify-between">
          <div className="section-label">{t('replay.audio')}</div>
          <button
            onClick={() => onSet({ replayAudio: !audio })}
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
                onChange={(e) => onSet({ replayAudioDevice: e.target.value })}
                className="min-w-0 flex-1 rounded-md border border-edge bg-panel2 px-2 py-1.5 text-xs text-slate-200"
              >
                <option value="">{t('replay.audioDefault')}</option>
                {loopbackInputs.map((d) => (
                  <option key={'a-' + d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              <button
                onClick={onDetect}
                className="shrink-0 rounded-md border border-edge px-2.5 py-1.5 text-xs text-slate-200 hover:border-teal hover:text-teal"
              >
                {t('replay.detect')}
              </button>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <span className="w-16 shrink-0 text-[11px] text-mute">{t('replay.volume')}</span>
              <input
                type="range"
                min={0}
                max={150}
                step={5}
                value={audioVolume}
                onChange={(e) => onSetDeferred({ replayAudioVolume: Number(e.target.value) })}
                className="flex-1 accent-teal"
              />
              <span className="w-10 shrink-0 text-right text-[11px] text-slate-200">
                {audioVolume}%
              </span>
            </div>
            <LevelMeter loopback={!audioDevice} deviceLabel={audioDevice} active={audio && !recording} />
          </div>
        )}
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between">
          <div className="section-label">{t('replay.mic')}</div>
          <button
            onClick={() => onSet({ replayMic: !mic })}
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
                onChange={(e) => onSet({ replayMicDevice: e.target.value })}
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
                onClick={onDetect}
                className="shrink-0 rounded-md border border-edge px-2.5 py-1.5 text-xs text-slate-200 hover:border-teal hover:text-teal"
              >
                {t('replay.detect')}
              </button>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <span className="w-16 shrink-0 text-[11px] text-mute">{t('replay.volume')}</span>
              <input
                type="range"
                min={0}
                max={150}
                step={5}
                value={micVolume}
                onChange={(e) => onSetDeferred({ replayMicVolume: Number(e.target.value) })}
                className="flex-1 accent-teal"
              />
              <span className="w-10 shrink-0 text-right text-[11px] text-slate-200">
                {micVolume}%
              </span>
            </div>
            <LevelMeter deviceLabel={micMeterLabel} active={mic && !recording} />
          </div>
        )}
      </div>

      {(audio || mic) && (
        <div className="mt-4">
          <div className="section-label mb-1.5">{t('replay.sync')}</div>
          <div className="mb-2 text-[11px] text-mute">{t('replay.syncAuto')}</div>
          <div className="flex items-center gap-3">
            <span className="w-16 shrink-0 text-[11px] text-mute">{t('replay.offset')}</span>
            <input
              type="range"
              min={-200}
              max={200}
              step={1}
              value={audioOffset}
              onChange={(e) => onSetDeferred({ replayAudioOffsetMs: Number(e.target.value) })}
              className="flex-1 accent-teal"
            />
            <input
              type="number"
              min={-200}
              max={200}
              step={1}
              value={audioOffset}
              onChange={(e) => {
                const v = Math.max(-200, Math.min(200, Math.round(Number(e.target.value) || 0)))
                onSetDeferred({ replayAudioOffsetMs: v })
              }}
              className="w-16 shrink-0 rounded-md border border-edge bg-panel2 px-1.5 py-1 text-right text-[11px] text-slate-200"
            />
            <span className="shrink-0 text-[11px] text-mute">ms</span>
          </div>
          <div className="mt-1 text-[11px] text-mute">{t('replay.syncHint')}</div>
          {audioOffset !== 0 && (
            <button
              onClick={() => onSetDeferred({ replayAudioOffsetMs: 0 })}
              className="mt-1.5 text-[11px] text-teal hover:underline"
            >
              {t('replay.syncReset')}
            </button>
          )}
        </div>
      )}
    </>
  )
}
