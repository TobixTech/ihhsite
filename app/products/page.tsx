import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { getPublicPlanSlots } from '@/app/actions/investments'
import { AppHeader } from '@/components/app-header'
import { BottomNav } from '@/components/bottom-nav'
import { PlanCard } from '@/components/plan-card'
import { PLANS, SITE, formatNaira } from '@/lib/plans'

export const dynamic = 'force-dynamic'

// Active plan groups (soldOut plans excluded)
const ACTIVE_GROUPS = [
  {
    phase: 'Starter',
    ids: [10, 11, 12],
    desc: 'Entry-level packages. Low capital, 7-day daily earning cycles.',
  },
  {
    phase: 'Growth',
    ids: [13, 14, 15],
    desc: 'Mid-tier packages with stronger daily returns and higher earning potential.',
  },
  {
    phase: 'Core',
    ids: [16],
    desc: 'Our flagship package. Maximum returns for serious investors.',
  },
]

export default async function ProductsPage() {
  const session = await getSession()
  if (!session?.user) redirect('/')

  const planSlots = await getPublicPlanSlots()

  // Only active (non-soldOut, non-comingSoon) plans for the rate sheet
  const activePlans = PLANS.filter((p) => !p.soldOut && !p.comingSoon)
  const comingSoonPlans = PLANS.filter((p) => p.comingSoon)

  return (
    <div className="min-h-screen pb-24">
      <AppHeader title="Packages" />

      <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-5">
        {/* Intro banner */}
        <section className="overflow-hidden rounded-2xl border border-primary/20 bg-card">
          <div className="flex items-center justify-between gap-4 border-b border-border/60 bg-primary/5 px-4 py-3">
            <div>
              <h2 className="text-sm font-bold text-foreground">{SITE.name} Packages</h2>
              <p className="text-[11px] text-muted-foreground">
                {SITE.packageCount} packages · {activePlans.length} active · {comingSoonPlans.length} coming soon
              </p>
            </div>
            <span className="rounded-full border border-success/30 bg-success/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-success">
              7-day cycle
            </span>
          </div>

          {/* Rate sheet — active plans only */}
          <div className="grid grid-cols-4 border-b border-border/60 bg-secondary/30 text-center text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            {["Plan", "Capital", "Daily", "Total"].map((h) => (
              <div key={h} className="py-2.5">{h}</div>
            ))}
          </div>
          {activePlans.map((plan, i) => (
            <div
              key={plan.id}
              className={`grid grid-cols-4 text-center text-xs tabular-nums ${
                i % 2 === 0 ? 'bg-card' : 'bg-secondary/20'
              } ${i !== activePlans.length - 1 ? 'border-b border-border/40' : ''}`}
            >
              <div className="px-2 py-2.5 text-left text-[10px] font-semibold text-primary">{plan.name}</div>
              <div className="px-1 py-2.5 text-[11px]">{formatNaira(plan.price)}</div>
              <div className="px-1 py-2.5 text-[11px] font-semibold text-success">{formatNaira(plan.daily)}</div>
              <div className="px-1 py-2.5 text-[11px]">{formatNaira(plan.total)}</div>
            </div>
          ))}
        </section>

        {/* Active plan groups */}
        {ACTIVE_GROUPS.map((group) => {
          const plans = PLANS.filter((p) => group.ids.includes(p.id))
          return (
            <section key={group.phase}>
              <div className="mb-3">
                <h2 className="text-base font-bold">{group.phase} Tier</h2>
                <p className="text-[11px] text-muted-foreground">{group.desc}</p>
              </div>
              <div className="flex flex-col gap-3">
                {plans.map((plan) => (
                  <PlanCard key={plan.id} plan={plan} slot={planSlots.find((s) => s.planId === plan.id)} />
                ))}
              </div>
            </section>
          )
        })}

        {/* Coming Soon section */}
        {comingSoonPlans.length > 0 && (
          <section>
            <div className="mb-3 flex items-center gap-2">
              <h2 className="text-base font-bold">Coming Soon</h2>
              <span className="rounded-full border border-blue-500/30 bg-blue-950/40 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-blue-400">
                {comingSoonPlans.length} packages
              </span>
            </div>
            <p className="mb-3 text-[11px] text-muted-foreground">
              Premium packages launching soon. Keep an eye out for notifications.
            </p>
            <div className="flex flex-col gap-3">
              {comingSoonPlans.map((plan) => (
                <PlanCard key={plan.id} plan={plan} slot={planSlots.find((s) => s.planId === plan.id)} />
              ))}
            </div>
          </section>
        )}

        <p className="px-1 text-center text-xs text-muted-foreground">
          Min. deposit {formatNaira(SITE.minDeposit)} · Returns credited every 24 hours · Up to 5 purchases per package
        </p>
      </main>

      <BottomNav />
    </div>
  )
}
