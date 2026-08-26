import { useMemo, type JSX } from 'react'
import type { MatchRecord, MatchFilter } from '../../../preload/index.d'
import { useT } from '../i18n'

function selectCls(): string {
  return 'rounded-md border border-edge bg-panel2 px-2.5 py-1.5 text-sm text-slate-200 outline-none focus:border-teal'
}

export default function FilterBar({
  matches,
  filter,
  onChange,
  compact
}: {
  matches: MatchRecord[]
  filter: MatchFilter
  onChange: (f: MatchFilter) => void
  compact?: boolean
}): JSX.Element {
  const t = useT()

  const periods: { label: string; days: number | null }[] = [
    { label: t('filter.always'), days: null },
    { label: t('filter.7d'), days: 7 },
    { label: t('filter.30d'), days: 30 },
    { label: t('filter.90d'), days: 90 }
  ]

  const queues = useMemo(() => {
    const map = new Map<number, string>()
    matches.forEach((m) => map.set(m.queueId, m.queueName))
    return [...map].map(([id, name]) => ({ id, name }))
  }, [matches])

  const champions = useMemo(() => {
    return [...new Set(matches.map((m) => m.champion))].sort()
  }, [matches])

  const set = (patch: Partial<MatchFilter>): void => onChange({ ...filter, ...patch })
  const isDefault =
    filter.queueId == null &&
    filter.champion == null &&
    filter.result == null &&
    filter.sinceDays == null

  return (
    <div className={'flex flex-wrap items-center gap-2 ' + (compact ? '' : 'mb-4')}>
      <select
        className={selectCls()}
        value={filter.queueId ?? ''}
        onChange={(e) => set({ queueId: e.target.value ? Number(e.target.value) : null })}
      >
        <option value="">{t('filter.allQueues')}</option>
        {queues.map((q) => (
          <option key={q.id} value={q.id}>
            {q.name}
          </option>
        ))}
      </select>

      <select
        className={selectCls()}
        value={filter.champion ?? ''}
        onChange={(e) => set({ champion: e.target.value || null })}
      >
        <option value="">{t('filter.allChamps')}</option>
        {champions.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>

      <select
        className={selectCls()}
        value={filter.result ?? ''}
        onChange={(e) => set({ result: (e.target.value || null) as MatchFilter['result'] })}
      >
        <option value="">{t('filter.winloss')}</option>
        <option value="win">{t('filter.wins')}</option>
        <option value="loss">{t('filter.losses')}</option>
      </select>

      <select
        className={selectCls()}
        value={filter.sinceDays ?? ''}
        onChange={(e) => set({ sinceDays: e.target.value ? Number(e.target.value) : null })}
      >
        {periods.map((p) => (
          <option key={p.label} value={p.days ?? ''}>
            {p.label}
          </option>
        ))}
      </select>

      {!isDefault && (
        <button
          onClick={() => onChange({ queueId: null, champion: null, result: null, sinceDays: null })}
          className="rounded-md px-2.5 py-1.5 text-sm text-mute hover:text-loss"
        >
          {t('filter.reset')}
        </button>
      )}
    </div>
  )
}
