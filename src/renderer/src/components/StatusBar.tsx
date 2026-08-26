import type { JSX } from 'react'
import type { LcuStatus, ExportStatus } from '../../../preload/index.d'
import { useT } from '../i18n'

export default function StatusBar({
  lcu,
  exp,
  matchCount
}: {
  lcu: LcuStatus
  exp: ExportStatus | null
  matchCount: number
}): JSX.Element {
  const t = useT()

  let dot = 'bg-mute'
  let text = t('status.disconnected')
  if (lcu.state === 'connected') {
    dot = 'bg-win'
    text = t('status.connected', { name: lcu.summoner })
  } else if (lcu.state === 'in-game') {
    dot = 'bg-teal'
    text = t('status.inGame')
  } else if (lcu.state === 'connecting') {
    dot = 'bg-gold'
    text = t('status.connecting')
  } else if (lcu.state === 'error') {
    dot = 'bg-loss'
    text = t('status.error')
  }

  return (
    <footer className="flex items-center gap-4 border-t border-edge bg-panel px-6 py-2 text-xs text-mute">
      <span className="flex items-center gap-2">
        <span className={'h-2 w-2 rounded-full ' + dot} />
        {text}
      </span>
      <span className="text-edge">·</span>
      <span>{t('status.matchCount', { n: matchCount })}</span>
      {exp?.state === 'syncing' && (
        <>
          <span className="text-edge">·</span>
          <span className="text-teal">{t('status.exporting')}</span>
        </>
      )}
      {exp?.state === 'ok' && (
        <>
          <span className="text-edge">·</span>
          <span className="text-win">{t('status.exportOk', { n: exp.added })}</span>
        </>
      )}
      {exp?.state === 'error' && (
        <>
          <span className="text-edge">·</span>
          <span className="text-loss">{t('status.exportErr', { msg: exp.message })}</span>
        </>
      )}
    </footer>
  )
}
