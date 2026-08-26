import type { JSX } from 'react'
import { useT } from '../i18n'

/**
 * Custom drag strip that sits to the left of the OS caption buttons (which stay
 * native thanks to titleBarOverlay). Hosts the Options (gear) button, DPM-style.
 * Its width is constrained to the titlebar drag area so the gear never slides
 * under the native minimize/maximize/close buttons.
 */
export default function TitleBar({
  onOptions,
  active
}: {
  onOptions: () => void
  active: boolean
}): JSX.Element {
  const t = useT()
  return (
    <div
      className="drag flex h-[38px] shrink-0 items-center justify-end gap-1"
      style={{ paddingRight: 'calc(100vw - env(titlebar-area-width, 100vw))' }}
    >
      <button
        onClick={onOptions}
        title={t('nav.options')}
        className={
          'no-drag flex h-7 w-7 items-center justify-center rounded-md transition-colors ' +
          (active ? 'text-teal' : 'text-mute hover:bg-panel2/60 hover:text-slate-200')
        }
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="h-[18px] w-[18px]"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
    </div>
  )
}
