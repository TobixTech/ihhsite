"use server"

import { db } from "@/lib/db"
import { investment, wallet, transaction, profile, referral, planSlot } from "@/lib/db/schema"
import { PLANS, SITE } from "@/lib/plans"
import { getUserId } from "@/lib/session"
import { accrueIncomeForUser } from "@/lib/income-engine"
import { and, count, desc, eq, sql } from "drizzle-orm"
import { revalidatePath } from "next/cache"

/** Count how many non-cancelled purchases a user has made for a given plan. */
async function countUserPlanPurchases(userId: string, planId: number): Promise<number> {
  const [{ value }] = await db
    .select({ value: count() })
    .from(investment)
    .where(
      and(
        eq(investment.userId, userId),
        eq(investment.planId, planId),
        sql`${investment.status} NOT IN ('cancelled', 'deleted')`
      )
    )
  return value
}

export async function buyPlan(planId: number, opts?: { autoReinvest?: boolean }) {
  const userId = await getUserId()
  const plan = PLANS.find((p) => p.id === planId)
  if (!plan) return { ok: false, message: "Plan not found" }

  // Guard: coming soon plans cannot be purchased
  if (plan.comingSoon) return { ok: false, message: "This package is coming soon." }

  // Guard: per-plan purchase cap
  if (plan.maxPurchases) {
    const purchaseCount = await countUserPlanPurchases(userId, planId)
    if (purchaseCount >= plan.maxPurchases) {
      return { ok: false, message: `You can only buy this package ${plan.maxPurchases} times.` }
    }
  }

  // Check slot availability
  const [slot] = await db.select().from(planSlot).where(eq(planSlot.planId, planId))
  if (slot) {
    if (!slot.isActive) return { ok: false, message: "This plan is currently unavailable." }
    if (slot.totalSlots !== null && slot.soldSlots >= slot.totalSlots) {
      return { ok: false, message: "This plan is sold out. Check back later." }
    }
  }

  const [w] = await db.select().from(wallet).where(eq(wallet.userId, userId))
  const balance = Number(w?.balance ?? 0)
  if (balance < plan.price) {
    return { ok: false, message: "Insufficient balance. Please top up your account." }
  }

  // deduct price
  await db
    .update(wallet)
    .set({ balance: sql`${wallet.balance} - ${plan.price}`, updatedAt: new Date() })
    .where(eq(wallet.userId, userId))

  await db.insert(investment).values({
    userId,
    planId: plan.id,
    planName: plan.name,
    price: String(plan.price),
    dailyEarning: String(plan.daily),
    totalEarning: String(plan.total),
    durationDays: plan.durationDays,
    autoReinvest: false,
  })

  // Increment sold slots counter
  if (slot) {
    await db
      .update(planSlot)
      .set({ soldSlots: sql`${planSlot.soldSlots} + 1`, updatedAt: new Date() })
      .where(eq(planSlot.planId, planId))
  }

  await db.insert(transaction).values({
    userId,
    type: "investment",
    amount: String(plan.price),
    description: `Purchased ${plan.name}`,
  })

  // 10% instant bonus — first investment only
  // Count investments BEFORE this one (the INSERT above already added one row,
  // so a count of 1 means this is the first investment)
  const [{ value: invCount }] = await db
    .select({ value: count() })
    .from(investment)
    .where(eq(investment.userId, userId))

  if (invCount === 1) {
    const investBonus = Math.round(plan.price * 0.10)
    await db
      .update(wallet)
      .set({
        balance: sql`${wallet.balance} + ${investBonus}`,
        totalEarned: sql`${wallet.totalEarned} + ${investBonus}`,
        updatedAt: new Date(),
      })
      .where(eq(wallet.userId, userId))

    await db.insert(transaction).values({
      userId,
      type: "bonus",
      amount: String(investBonus),
      description: `10% first investment bonus on ${plan.name}`,
    })
  }

  // pay referral commissions on the purchase amount
  await payReferralCommission(userId, plan.price)

  revalidatePath("/")
  revalidatePath("/products")
  return { ok: true, message: `${plan.name} activated! You'll earn daily for ${plan.durationDays} days.` }
}

async function payReferralCommission(buyerId: string, amount: number) {
  const refs = await db.select().from(referral).where(eq(referral.referredId, buyerId))
  for (const r of refs) {
    // Only pay once — skip if this referral has already been settled.
    if (r.commissionPaid) continue

    // Determine rate
    let rate = r.level === 1 ? SITE.referralLevel1 : SITE.referralLevel2
    if (r.level === 1) {
      const [referrerProfile] = await db.select().from(profile).where(eq(profile.userId, r.referrerId))
      if (referrerProfile?.isPromoter) {
        rate = referrerProfile.promoterCommission ?? SITE.promoterLevel1
      }
    }
    const commission = Math.round((amount * rate) / 100)
    if (commission <= 0) continue

    await db
      .update(wallet)
      .set({
        balance: sql`${wallet.balance} + ${commission}`,
        referralEarnings: sql`${wallet.referralEarnings} + ${commission}`,
        totalEarned: sql`${wallet.totalEarned} + ${commission}`,
        updatedAt: new Date(),
      })
      .where(eq(wallet.userId, r.referrerId))

    // Mark as paid and record the commission amount — will never fire again.
    await db
      .update(referral)
      .set({
        totalCommission: sql`${referral.totalCommission} + ${commission}`,
        commissionPaid: true,
      })
      .where(eq(referral.id, r.id))

    await db.insert(transaction).values({
      userId: r.referrerId,
      type: "referral",
      amount: String(commission),
      description: `Level ${r.level} referral commission (${rate}%)`,
    })
  }
}

/** Public — returns slot data for all plans so cards can show sold-out state. */
export async function getPublicPlanSlots() {
  return db.select().from(planSlot)
}

export async function getInvestments() {
  const userId = await getUserId()
  await accrueIncomeForUser(userId)
  return db
    .select()
    .from(investment)
    .where(
      and(
        eq(investment.userId, userId),
        // Never show cancelled or admin-deleted investments to the user
        sql`${investment.status} NOT IN ('cancelled', 'deleted')`
      )
    )
    .orderBy(desc(investment.createdAt))
}

export async function toggleAutoReinvest(investmentId: number) {
  const userId = await getUserId()

  // Verify ownership
  const [inv] = await db
    .select({ autoReinvest: investment.autoReinvest })
    .from(investment)
    .where(and(eq(investment.id, investmentId), eq(investment.userId, userId)))

  if (!inv) return { ok: false, message: "Investment not found" }

  const newState = !inv.autoReinvest
  await db
    .update(investment)
    .set({ autoReinvest: newState })
    .where(eq(investment.id, investmentId))

  revalidatePath("/dashboard")
  return { ok: true, autoReinvest: newState, message: newState ? "Auto-reinvest enabled" : "Auto-reinvest disabled" }
}
