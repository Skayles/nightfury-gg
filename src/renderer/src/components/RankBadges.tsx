import type { SummonerProfile } from '../../../preload/index.d'
import { useT } from '../i18n'
import { fmtRank, rankEmblem } from '../lib'

// Community Dragon emblems have different amounts of transparent padding per
// tier (Master+ artwork fills more of the canvas than Iron/Bronze), so we zoom
// each tier by a different factor to normalize the on-screen size.
const TIER_ZOOM: Record<string, number> = {
  IRON: 3.5,
  BRONZE: 3.5,
  SILVER: 3.4,
  GOLD: 3.3,
  PLATINUM: 3.2,
  EMERALD: 3.2,
  DIAMOND: 3.0,
  MASTER: 2.7,
  GRANDMASTER: 2.5,
  CHALLENGER: 2.4
}

function RankRow({
  label,
  tier,
  division,
  lp,
  wins,
  losses,
  big
}: {
  label: string
  tier: string | null
  division: string | null
  lp: number | null
  wins: number | null
  losses: number | null
  big?: boolean
}): JSX.Element {
  const t = useT()
  const rank = fmtRank(tier, division, lp)
  const emblem = rank ? rankEmblem(tier) : null
  const box = big ? 'h-20 w-36' : 'h-16 w-28'
  const zoom = TIER_ZOOM[(tier ?? '').toUpperCase()] ?? 3.3
  const total = (wins ?? 0) + (losses ?? 0)
  const wr = total > 0 ? Math.round(((wins ?? 0) / total) * 100) : null
  return (
    <div className="flex items-center gap-1">
      {emblem ? (
        <div className={'relative shrink-0 overflow-hidden ' + box}>
          <img
            src={emblem}
            alt=""
            style={{ transform: `scale(${zoom})` }}
            className="h-full w-full object-contain"
            onError={(e) => {
              const el = e.currentTarget.parentElement
              if (el) el.style.display = 'none'
            }}
          />
        </div>
      ) : (
        <div className={'shrink-0 ' + box} />
      )}
      <div className="leading-tight">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-mute">{label}</div>
        <div className={rank ? 'text-sm font-medium text-gold' : 'text-sm text-mute'}>
          {rank || t('profile.unranked')}
        </div>
        {rank && wr != null && (
          <div className="text-[11px] text-mute">
            <span className={wr >= 50 ? 'text-win' : 'text-loss'}>{wr}%</span>
            {total > 0 && (
              <span>
                {' '}
                · {wins}
                {t('common.winShort')} {losses}
                {t('common.lossShort')}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default function RankBadges({
  summoner,
  col = false,
  big = false
}: {
  summoner: SummonerProfile
  col?: boolean
  big?: boolean
}): JSX.Element {
  return (
    <div className={col ? 'flex flex-col gap-3' : 'flex flex-wrap gap-x-8 gap-y-3'}>
      <RankRow
        label="Solo/Duo"
        tier={summoner.rankedTier}
        division={summoner.rankedDivision}
        lp={summoner.rankedLp}
        wins={summoner.rankedWins}
        losses={summoner.rankedLosses}
        big={big}
      />
      <RankRow
        label="Flex"
        tier={summoner.flexTier}
        division={summoner.flexDivision}
        lp={summoner.flexLp}
        wins={summoner.flexWins}
        losses={summoner.flexLosses}
        big={big}
      />
    </div>
  )
}
