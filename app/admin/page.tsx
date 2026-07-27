import { redirect } from "next/navigation"
import { getSession } from "@/lib/session"
import { db } from "@/lib/db"
import { profile } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import {
  getAdminStats,
  getPendingWithdrawals,
  getAdminUsers,
  getGiftCodes,
  getRecentDeposits,
  getBankAccounts,
  getMilestones,
  getSiteControls,
  getAllTransactions,
  getPromoterCodes,
  getAllInvestments,
  getFinancials,
  getLuckyDrawRounds,
  getAllSpins,
  getAllVaults,
  getAllDrawSlots,
  getGameStats,
  getPlanSlots,
  getCustomPlans,
} from "@/app/actions/admin"
import { getGameConfig } from "@/app/actions/settings"
import { AdminDashboard } from "@/components/admin/admin-dashboard"

export const dynamic = "force-dynamic"

export default async function AdminPage() {
  const session = await getSession()
  if (!session?.user) redirect("/")

  const [p] = await db.select().from(profile).where(eq(profile.userId, session.user.id))
  if (!p || p.role !== "admin") redirect("/dashboard")

  const [
    stats,
    withdrawals,
    users,
    giftCodes,
    deposits,
    bankAccounts,
    milestones,
    controls,
    transactions,
    promoterCodes,
    investments,
    financials,
    drawRounds,
    spins,
    vaults,
    drawSlots,
    gameStats,
    gameConfig,
    planSlots,
    customPlans,
  ] = await Promise.all([
    getAdminStats(),
    getPendingWithdrawals(),
    getAdminUsers(),
    getGiftCodes(),
    getRecentDeposits(),
    getBankAccounts(),
    getMilestones(),
    getSiteControls(),
    getAllTransactions({ limit: 100 }),
    getPromoterCodes(),
    getAllInvestments(),
    getFinancials(),
    getLuckyDrawRounds(),
    getAllSpins(),
    getAllVaults(),
    getAllDrawSlots(),
    getGameStats(),
    getGameConfig(),
    getPlanSlots(),
    getCustomPlans(),
  ])

  return (
    <AdminDashboard
      stats={stats}
      withdrawals={withdrawals}
      users={users}
      giftCodes={giftCodes}
      deposits={deposits}
      bankAccounts={bankAccounts}
      milestones={milestones}
      controls={controls}
      transactions={transactions}
      promoterCodes={promoterCodes}
      investments={investments}
      financials={financials}
      drawRounds={drawRounds}
      spins={spins}
      vaults={vaults}
      drawSlots={drawSlots}
      gameStats={gameStats}
      gameConfig={gameConfig}
      planSlots={planSlots}
      customPlans={customPlans}
    />
  )
}
