import { formatPercent, type DealDto, type ReasonTone } from '@znyzhky/shared'
import { ClaimCompare } from './ClaimCompare'
import { CheckIcon, CloseIcon, InfoIcon } from './icons'

const HEAD: Record<DealDto['status'], { title: string; tone: string }> = {
  real: { title: 'Справжня знижка', tone: 'bg-accent-weak text-accent' },
  fake: { title: 'Знижка не підтверджена', tone: 'bg-bad-weak text-bad' },
  insufficient_data: { title: 'Замало даних для висновку', tone: 'bg-surface-2 text-ink-2' },
  none: { title: 'Знижки зараз немає', tone: 'bg-surface-2 text-ink-2' },
}

const TONE_ICON: Record<ReasonTone, { Icon: typeof CheckIcon; cls: string }> = {
  positive: { Icon: CheckIcon, cls: 'bg-accent-weak text-accent' },
  negative: { Icon: CloseIcon, cls: 'bg-bad-weak text-bad' },
  neutral: { Icon: InfoIcon, cls: 'bg-surface-2 text-ink-2' },
}

/** Пояснення, чому знижка справжня або чому ми її не підтвердили: причини з модуля скору. */
export function DealVerdict({ deal }: { deal: DealDto }) {
  const head = HEAD[deal.status]
  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-surface" aria-labelledby="verdict-title">
      <div className={`flex items-center justify-between gap-3 px-5 py-3 ${head.tone}`}>
        <h2 id="verdict-title" className="text-base font-bold">
          {head.title}
        </h2>
        {deal.status === 'real' && <span className="tabular text-base font-bold">−{formatPercent(deal.discountPercent)}</span>}
      </div>

      <div className="flex flex-col gap-4 p-5">
        <ul className="flex flex-col gap-3">
          {deal.reasons.map((r) => {
            const { Icon, cls } = TONE_ICON[r.tone]
            return (
              <li key={r.code} className="flex items-start gap-3">
                <span className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full ${cls}`}>
                  <Icon size={14} strokeWidth={2.5} />
                </span>
                <span className="text-[0.95rem] leading-snug text-ink">{r.text}</span>
              </li>
            )
          })}
        </ul>

        {deal.claimedPercent !== null && deal.status !== 'real' && (
          <div className="border-t border-line pt-4">
            <ClaimCompare claimed={deal.claimedPercent} real={deal.discountPercent} />
          </div>
        )}
      </div>
    </section>
  )
}
