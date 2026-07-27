import Link from "next/link"
import { redirect } from "next/navigation"
import { getSession } from "@/lib/session"
import { getDashboardData } from "@/app/actions/account"
import { getInvestments, getPublicPlanSlots } from "@/app/actions/investments"
import { getPendingDeposits } from "@/app/actions/deposit"
import { AppHeader } from "@/components/app-header"
import { BottomNav } from "@/components/bottom-nav"
import { BalanceCard } from "@/components/balance-card"
import { QuickActions } from "@/components/quick-actions"
import { PlanCard } from "@/components/plan-card"
import { ActiveInvestments } from "@/components/active-investments"
import { DailyBonusStrip } from "@/components/daily-bonus-strip"
import { WelcomePopup } from "@/components/welcome-popup"
import { PendingDepositPopup } from "@/components/pending-deposit-popup"
import { PageTransition } from "@/components/page-transition"
import { PLANS, SITE } from "@/lib/plans"
import { ChevronRight, TrendingUp, Package } from "lucide-react"

export const dynamic = "force-dynamic"

export default async function DashboardPage() {
  const session = await getSession()
  if (!session?.user) redirect("/")

  const [data, investments, pendingDeposits, planSlots] = await Promise.all([
    getDashboardData(),
    getInvestments(),
    getPendingDeposits(),
    getPublicPlanSlots(),
  ])

  const todayIncome = investments
    .filter((i) => i.status === "active")
    .reduce((s, i) => s + Number(i.dailyEarning), 0)

  // Only show active (non-soldOut, non-comingSoon) plans on the dashboard — max 4
  const activePlans = PLANS.filter((p) => !p.soldOut && !p.comingSoon).slice(0, 4)

  const activeCount = investments.filter((i) => i.status === "active").length

  return (
    <div className="min-h-screen pb-28">
      <WelcomePopup />
      <PendingDepositPopup deposits={pendingDeposits} />
      <AppHeader />

      <main className="mx-auto max-w-md px-4 py-4">
        <PageTransition className="flex flex-col gap-4">

          {/* Greeting row */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                {SITE.short} Portal
              </p>
              <h1 className="mt-0.5 text-lg font-bold tracking-tight text-foreground text-balance">
                {data.name}
              </h1>
            </div>
            <div className="flex items-center gap-2">
              {data.isPromoter && (
                <span className="rounded-full border border-gold/30 bg-gold/10 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wide text-gold">
                  Promoter
                </span>
              )}
              {activeCount > 0 && (
                <div className="flex items-center gap-1 rounded-full border border-success/25 bg-success/10 px-2.5 py-1">
                  <TrendingUp className="h-3 w-3 text-success" />
                  <span className="text-[10px] font-bold text-success">{activeCount} active</span>
                </div>
              )}
            </div>
          </div>

          {/* Balance card */}
          <BalanceCard balance={data.balance} todayIncome={todayIncome} />

          {/* Quick actions */}
          <QuickActions />

          {/* Daily bonus strip */}
          <DailyBonusStrip signedInToday={data.signedInToday} />

          {/* Active investments */}
          <ActiveInvestments investments={investments} />

          {/* Packages section — only active plans, max 4 */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15">
                  <Package className="h-3.5 w-3.5 text-primary" />
                </div>
                <div>
                  <h2 className="text-sm font-bold tracking-tight">Investment Packages</h2>
                  <p className="text-[10px] text-muted-foreground">{SITE.packageCount} packages · 7-day cycle</p>
                </div>
              </div>
              <Link
                href="/products"
                className="flex items-center gap-0.5 rounded-lg border border-border/50 bg-card px-2.5 py-1.5 text-[11px] font-semibold text-muted-foreground transition-all hover:border-primary/30 hover:text-primary"
              >
                All <ChevronRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="flex flex-col gap-2.5">
              {activePlans.map((plan) => (
                <PlanCard key={plan.id} plan={plan} slot={planSlots.find((s) => s.planId === plan.id)} />
              ))}
            </div>
          </section>

        </PageTransition>
      </main>

      <BottomNav />
    </div>
  )
}
