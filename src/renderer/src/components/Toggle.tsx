export default function Toggle({
  on,
  onChange,
  label
}: {
  on: boolean
  onChange: (v: boolean) => void
  label?: string
}): JSX.Element {
  const control = (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ' +
        (on ? 'bg-teal' : 'bg-edge')
      }
    >
      <span
        className={
          'inline-block h-4 w-4 transform rounded-full bg-slate-100 transition-transform ' +
          (on ? 'translate-x-6' : 'translate-x-1')
        }
      />
    </button>
  )

  if (!label) return control

  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 py-1.5">
      <span className="text-sm text-slate-200">{label}</span>
      {control}
    </label>
  )
}
