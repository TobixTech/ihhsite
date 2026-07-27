import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { getPublicPlanSlots } from '@/app/actions/investments'
import { AppHeader } from '@/components/app-header'
import { BottomNav } from '@/components/bottom-nav'
import { PlanCard } from '@/components/plan-card'
import { PLANS, SITE, formatNaira } from '@/lib/plans'
import { TrendingUp, Clock, Layers, ShieldCheck } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function ProductsPage() {
  const session = await getSession()
  if (!session?.user) redirect('/')

  const planSlots = await getPublicPlanSlots()

  const activePlans = PLANS.filter((p) => !p.soldOut && !p.comingSoon)
  const comingSoonPlans = PLANS.filter((p) => p.comingSoon)

  // Min / max daily among active plans
  const minDaily = Math.min(...activePlans.map((p) => p.daily))
  const maxDaily = Math.max(...activePlans.map((p) => p.daily))

  return (
    <div className="min-h-screen pb-28">
      <AppHeader title="Packages" />

      <main className="mx-auto max-w-md px-4 py-4">

        {/* Stats header */}
        <div className="mb-5 grid grid-cols-2 gap-2.5">
          <StatCard
            icon={Layers}
            label="Active Packages"
            value={`${activePlans.length} plans`}
            sub="7-day cycle"
          />
          <StatCard
            icon={TrendingUp}
            label="Daily Earnings"
            value={`${formatNaira(minDaily)} – ${formatNaira(maxDaily)}`}
            sub="per package"
            accent
          />
          <StatCard
            icon={ShieldCheck}
            label="Min. Capital"
            value={formatNaira(SITE.minDeposit)}
            sub="to start investing"
          />
          <StatCard
            icon={Clock}
            label="Coming Soon"
            value={`${comingSoonPlans.length} packages`}
            sub="releasing soon"
          />
        </div>

        {/* Active plans — full list */}
        <section className="mb-6">
          <SectionHeader
            title="Active Packages"
            count={activePlans.length}
            badge="Live"
            badgeColor="bg-success/15 text-success border-success/25"
          />
          <div className="flex flex-col gap-2.5">
            {activePlans.map((plan) => (
              <PlanCard key={plan.id} plan={plan} slot={planSlots.find((s) => s.planId === plan.id)} />
            ))}
          </div>
        </section>

        {/* Coming soon */}
        {comingSoonPlans.length > 0 && (
          <section className="mb-4">
            <SectionHeader
              title="Coming Soon"
              count={comingSoonPlans.length}
              badge="Soon"
              badgeColor="bg-primary/15 text-primary border-primary/25"
            />
            <p className="mb-3 text-[11px] text-muted-foreground">
              Premium packages launching shortly. Watch out for announcements.
            </p>
            <div className="flex flex-col gap-2.5">
              {comingSoonPlans.map((plan) => (
                <PlanCard key={plan.id} plan={plan} slot={planSlots.find((s) => s.planId === plan.id)} />
              ))}
            </div>
          </section>
        )}

        {/* Footer note */}
        <div className="rounded-2xl border border-border/40 bg-card/50 px-4 py-3 text-center">
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Each package runs for <span className="font-semibold text-foreground">7 days</span> with daily payouts.
            Max <span className="font-semibold text-foreground">5 purchases</span> per package.
            Min. deposit {formatNaira(SITE.minDeposit)}.
          </p>
        </div>
      </main>

      <BottomNav />
    </div>
  )
}

function StatCard({
  icon: Icon, label, value, sub, accent,
}: {
  icon: React.ElementType
  label: string
  value: string
  sub: string
  accent?: boolean
}) {
  return (
    <div className={`flex flex-col gap-2 rounded-2xl border p-4 ${accent ? 'border-primary/20 bg-primary/5' : 'border-border/50 bg-card'}`}>
      <div className={`flex h-8 w-8 items-center justify-center rounded-xl ${accent ? 'bg-primary/15' : 'bg-surface'}`}>
        <Icon className={`h-4 w-4 ${accent ? 'text-primary' : 'text-muted-foreground'}`} />
      </div>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={`mt-0.5 text-sm font-black tabular-nums ${accent ? 'text-primary' : 'text-foreground'}`}>{value}</p>
        <p className="text-[10px] text-muted-foreground">{sub}</p>
      </div>
    </div>
  )
}

function SectionHeader({ title, count, badge, badgeColor }: {
  title: string
  count: number
  badge: string
  badgeColor: string
}) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-sm font-bold tracking-tight text-foreground">{title}</h2>
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-muted-foreground">{count} packages</span>
        <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${badgeColor}`}>
          {badge}
        </span>
      </div>
    </div>
  )
}
