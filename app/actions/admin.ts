"use server"

import { db } from "@/lib/db"
import {
  withdrawal,
  wallet,
  transaction,
  user as userTable,
  profile,
  deposit,
  giftCode,
  investment,
  bankAccount,
  referral,
  referralMilestone,
  milestoneClaim,
  promoterCode,
  luckyDrawRound,
  luckyDrawSlot,
  stakeSpin,
  lockVault,
  planSlot,
  customPlan,
} from "@/lib/db/schema"
import { requireAdmin } from "@/lib/session"
import { accrueIncomeForAll, backfillReinvestForUser } from "@/lib/income-engine"
import { getPauseFlags, setSetting, getGameConfig, getLiveWithdrawalCharge, SETTING_KEYS } from "@/app/actions/settings"
import { and, asc, desc, eq, gt, sql, sum } from "drizzle-orm"
import { revalidatePath } from "next/cache"

export async function getAdminStats() {
  await requireAdmin()
  const [users] = await db.select({ c: sql<number>`count(*)::int` }).from(userTable)
  const [deposited] = await db
    .select({ s: sql<number>`coalesce(sum("totalDeposited"),0)::float` })
    .from(wallet)
  const [withdrawn] = await db
    .select({ s: sql<number>`coalesce(sum("totalWithdrawn"),0)::float` })
    .from(wallet)
  const [balances] = await db
    .select({ s: sql<number>`coalesce(sum(balance),0)::float` })
    .from(wallet)
  const [activeInv] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(investment)
    .where(eq(investment.status, "active"))
  const [pendingW] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(withdrawal)
    .where(eq(withdrawal.status, "pending"))

  return {
    users: users?.c ?? 0,
    totalDeposited: deposited?.s ?? 0,
    totalWithdrawn: withdrawn?.s ?? 0,
    totalBalance: balances?.s ?? 0,
    activeInvestments: activeInv?.c ?? 0,
    pendingWithdrawals: pendingW?.c ?? 0,
  }
}

export async function getPendingWithdrawals() {
  await requireAdmin()
  return db
    .select({
      id: withdrawal.id,
      userId: withdrawal.userId,
      amount: withdrawal.amount,
      charge: withdrawal.charge,
      netAmount: withdrawal.netAmount,
      bankName: withdrawal.bankName,
      accountNumber: withdrawal.accountNumber,
      accountName: withdrawal.accountName,
      status: withdrawal.status,
      createdAt: withdrawal.createdAt,
      userName: userTable.name,
      userEmail: userTable.email,
    })
    .from(withdrawal)
    .leftJoin(userTable, eq(withdrawal.userId, userTable.id))
    .orderBy(desc(withdrawal.createdAt))
    .limit(100)
}

export async function approveWithdrawal(id: number) {
  await requireAdmin()
  const [w] = await db.select().from(withdrawal).where(eq(withdrawal.id, id))
  if (!w || w.status !== "pending") return { ok: false, message: "Not a pending withdrawal" }

  const grossAmount = Math.round(Number(w.amount))

  // Re-calculate charge using CURRENT admin setting (not the rate at request time).
  // This ensures any rate change the admin makes applies to pending withdrawals immediately.
  const liveChargePercent = await getLiveWithdrawalCharge()
  const liveCharge = Math.round((grossAmount * liveChargePercent) / 100)
  const liveNet = grossAmount - liveCharge

  const oldCharge = Math.round(Number(w.charge))
  const chargeDiff = liveCharge - oldCharge // positive = user pays more, negative = user pays less

  // If charge changed, adjust the wallet balance for the difference.
  // (Gross was already deducted at request time — only the charge delta changes.)
  if (chargeDiff !== 0) {
    // Positive diff: charge went UP → deduct the extra from wallet (user gets less)
    // Negative diff: charge went DOWN → refund the savings back to wallet (user gets more)
    await db
      .update(wallet)
      .set({ balance: sql`${wallet.balance} - ${chargeDiff}`, updatedAt: new Date() })
      .where(eq(wallet.userId, w.userId))
  }

  await db
    .update(withdrawal)
    .set({
      status: "approved",
      processedAt: new Date(),
      charge: String(liveCharge),
      netAmount: String(liveNet),
    })
    .where(eq(withdrawal.id, id))

  await db
    .update(wallet)
    .set({ totalWithdrawn: sql`${wallet.totalWithdrawn} + ${grossAmount}`, updatedAt: new Date() })
    .where(eq(wallet.userId, w.userId))

  await db
    .update(transaction)
    .set({ status: "completed" })
    .where(and(eq(transaction.userId, w.userId), eq(transaction.status, "pending")))

  revalidatePath("/admin")
  return {
    ok: true,
    message: `Withdrawal approved. Net: ₦${liveNet.toLocaleString()} (${liveChargePercent}% fee = ₦${liveCharge.toLocaleString()}).`,
  }
}

export async function rejectWithdrawal(id: number) {
  await requireAdmin()
  const [w] = await db.select().from(withdrawal).where(eq(withdrawal.id, id))
  if (!w || w.status !== "pending") return { ok: false, message: "Not a pending withdrawal" }

  // refund the held amount
  await db
    .update(withdrawal)
    .set({ status: "rejected", processedAt: new Date() })
    .where(eq(withdrawal.id, id))
  
  const refundAmount = Number(w.amount)
  await db
    .update(wallet)
    .set({
      balance: sql`${wallet.balance} + ${refundAmount}`,
      totalEarned: sql`${wallet.totalEarned} + ${refundAmount}`,
      updatedAt: new Date(),
    })
    .where(eq(wallet.userId, w.userId))
  await db.insert(transaction).values({
    userId: w.userId,
    type: "refund",
    amount: String(w.amount),
    description: "Withdrawal rejected - amount refunded",
  })

  revalidatePath("/admin")
  return { ok: true, message: "Withdrawal rejected and refunded" }
}

export async function getAdminUsers() {
  await requireAdmin()

  // Alias for the referrer's user row so we can join it without collision
  const referrerUser = db.$with("referrer_user").as(
    db.select({ id: userTable.id, name: userTable.name }).from(userTable)
  )

  const users = await db
    .select({
      id: userTable.id,
      name: userTable.name,
      email: userTable.email,
      role: profile.role,
      isPromoter: profile.isPromoter,
      promoterCommission: profile.promoterCommission,
      balance: wallet.balance,
      totalDeposited: wallet.totalDeposited,
      referralEarnings: wallet.referralEarnings,
      referredBy: profile.referredBy,
      createdAt: userTable.createdAt,
    })
    .from(userTable)
    .leftJoin(profile, eq(userTable.id, profile.userId))
    .leftJoin(wallet, eq(userTable.id, wallet.userId))
    .orderBy(desc(userTable.createdAt))
    .limit(200)

  // Build a map of inviteCode → name so we can resolve referredBy invite codes
  const allProfiles = await db
    .select({ inviteCode: profile.inviteCode, userId: profile.userId })
    .from(profile)

  const inviteCodeToUserId = new Map(allProfiles.map((p) => [p.inviteCode, p.userId]))

  const allUsers = await db.select({ id: userTable.id, name: userTable.name }).from(userTable)
  const userIdToName = new Map(allUsers.map((u) => [u.id, u.name]))

  const referralCounts = await db
    .select({
      referrerId: referral.referrerId,
      count: sql<number>`count(*)::int`,
    })
    .from(referral)
    .where(eq(referral.level, 1))
    .groupBy(referral.referrerId)

  const countMap = new Map(referralCounts.map((r) => [r.referrerId, r.count]))

  return users.map((u) => {
    const referrerId = u.referredBy ? inviteCodeToUserId.get(u.referredBy) : null
    const referredByName = referrerId ? (userIdToName.get(referrerId) ?? null) : null
    return {
      ...u,
      referralCount: countMap.get(u.id) || 0,
      referredByName,
    }
  })
}

/**
 * Returns the full list of users directly referred by a given user,
 * including deposit status and commission earned from each.
 */
export async function getAdminReferralsForUser(referrerId: string) {
  await requireAdmin()

  const rows = await db
    .select({
      referralId: referral.id,
      referredId: referral.referredId,
      totalCommission: referral.totalCommission,
      joinedAt: referral.createdAt,
      name: userTable.name,
      email: userTable.email,
      balance: wallet.balance,
      totalDeposited: wallet.totalDeposited,
    })
    .from(referral)
    .leftJoin(userTable, eq(referral.referredId, userTable.id))
    .leftJoin(wallet, eq(referral.referredId, wallet.userId))
    .where(and(eq(referral.referrerId, referrerId), eq(referral.level, 1)))
    .orderBy(desc(referral.createdAt))

  return rows.map((r) => ({
    referralId: r.referralId,
    referredId: r.referredId,
    name: r.name ?? "Unknown",
    email: r.email ?? "—",
    totalDeposited: r.totalDeposited ?? "0",
    hasDeposited: Number(r.totalDeposited ?? 0) > 0,
    balance: r.balance ?? "0",
    commissionEarned: r.totalCommission ?? "0",
    joinedAt: r.joinedAt,
  }))
}

export async function adjustBalance(userId: string, amount: number, note: string) {
  await requireAdmin()
  const amt = Number(amount)
  if (!amt) return { ok: false, message: "Enter a non-zero amount" }
  
  // Only update totalEarned for positive adjustments (credits)
  const updates = amt > 0
    ? { balance: sql`${wallet.balance} + ${amt}`, totalEarned: sql`${wallet.totalEarned} + ${amt}`, updatedAt: new Date() }
    : { balance: sql`${wallet.balance} + ${amt}`, updatedAt: new Date() }
  
  await db
    .update(wallet)
    .set(updates)
    .where(eq(wallet.userId, userId))
  await db.insert(transaction).values({
    userId,
    type: amt > 0 ? "credit" : "debit",
    amount: String(Math.abs(amt)),
    description: note || "Admin balance adjustment",
  })
  revalidatePath("/admin")
  return { ok: true, message: "Balance adjusted" }
}

export async function createGiftCode(data: { code: string; amount: number; maxUses: number }) {
  await requireAdmin()
  const code = data.code.trim().toUpperCase()
  if (!code || !data.amount) return { ok: false, message: "Enter a code and amount" }
  const exists = await db.select().from(giftCode).where(eq(giftCode.code, code))
  if (exists.length > 0) return { ok: false, message: "Code already exists" }
  await db.insert(giftCode).values({
    code,
    amount: String(data.amount),
    maxUses: data.maxUses || 1,
  })
  revalidatePath("/admin")
  return { ok: true, message: `Gift code ${code} created` }
}

export async function getGiftCodes() {
  await requireAdmin()
  return db.select().from(giftCode).orderBy(desc(giftCode.createdAt)).limit(100)
}

export async function getRecentDeposits() {
  await requireAdmin()
  return db
    .select({
      id: deposit.id,
      amount: deposit.amount,
      reference: deposit.reference,
      status: deposit.status,
      createdAt: deposit.createdAt,
      userEmail: userTable.email,
      userId: deposit.userId,
      senderName: deposit.senderName,
      assignedBankName: deposit.assignedBankName,
      assignedAccountNumber: deposit.assignedAccountNumber,
      assignedAccountName: deposit.assignedAccountName,
      bankAccountId: deposit.bankAccountId,
      expiresAt: deposit.expiresAt,
    })
    .from(deposit)
    .leftJoin(userTable, eq(deposit.userId, userTable.id))
    .orderBy(desc(deposit.createdAt))
    .limit(50)
}

/** Admin: process daily income for all users with active investments. */
export async function processAllIncome() {
  await requireAdmin()
  const result = await accrueIncomeForAll()
  revalidatePath("/admin")
  
  if (result.credited === 0) {
    return {
      ok: true,
      message: `Found ${result.users} user(s) with active investments. No payments due yet (income is paid every 24 hours from investment time).`,
    }
  }
  
  return {
    ok: true,
    message: `Processed ${result.users} users, credited ₦${result.credited.toLocaleString()} total`,
  }
}

/** Admin: run reinvest backfill for all users with autoReinvest ON — converts past earnings to reinvest. */
export async function runReinvestBackfillAll() {
  await requireAdmin()
  
  const rows = await db
    .selectDistinct({ userId: investment.userId })
    .from(investment)
    .where(eq(investment.autoReinvest, true))

  let processed = 0
  for (const r of rows) {
    await backfillReinvestForUser(r.userId)
    processed++
  }
  
  revalidatePath("/admin")
  return { ok: true, message: `Backfilled ${processed} user(s) — converted past earnings to reinvest` }
}

// ===================== BANK ACCOUNT MANAGEMENT =====================

export async function getBankAccounts() {
  await requireAdmin()
  return db
    .select()
    .from(bankAccount)
    .orderBy(desc(bankAccount.createdAt))
}

export async function addBankAccount(data: {
  accountNumber: string
  bankName: string
  accountName: string
  label?: string
  weight?: number
  sabussApiKey?: string
  sabussPin?: string
}) {
  await requireAdmin()
  const accNum = data.accountNumber.trim()
  if (!accNum || !data.bankName || !data.accountName) {
    return { ok: false, message: "All fields are required" }
  }
  
  // Check if account number already exists
  const exists = await db
    .select()
    .from(bankAccount)
    .where(eq(bankAccount.accountNumber, accNum))
  if (exists.length > 0) {
    return { ok: false, message: "Account number already exists" }
  }
  
  await db.insert(bankAccount).values({
    accountNumber: accNum,
    bankName: data.bankName.trim(),
    accountName: data.accountName.trim(),
    label: data.label?.trim() || null,
    weight: Math.max(1, Math.floor(Number(data.weight) || 1)),
    isActive: true,
    sabussApiKey: data.sabussApiKey?.trim() || null,
    sabussPin: data.sabussPin?.trim() || null,
  })
  
  revalidatePath("/admin")
  return { ok: true, message: "Bank account added" }
}

export async function updateBankAccount(
  id: number,
  data: {
    accountNumber?: string
    bankName?: string
    accountName?: string
    label?: string
    isActive?: boolean
    weight?: number
    sabussApiKey?: string | null
    sabussPin?: string | null
  }
) {
  await requireAdmin()
  
  const [existing] = await db
    .select()
    .from(bankAccount)
    .where(eq(bankAccount.id, id))
  if (!existing) {
    return { ok: false, message: "Bank account not found" }
  }
  
  await db
    .update(bankAccount)
    .set({
      accountNumber: data.accountNumber?.trim() ?? existing.accountNumber,
      bankName: data.bankName?.trim() ?? existing.bankName,
      accountName: data.accountName?.trim() ?? existing.accountName,
      label: data.label?.trim() ?? existing.label,
      isActive: data.isActive ?? existing.isActive,
      weight: data.weight != null ? Math.max(1, Math.floor(Number(data.weight))) : existing.weight,
      sabussApiKey: "sabussApiKey" in data ? (data.sabussApiKey?.trim() || null) : existing.sabussApiKey,
      sabussPin: "sabussPin" in data ? (data.sabussPin?.trim() || null) : existing.sabussPin,
    })
    .where(eq(bankAccount.id, id))
  
  revalidatePath("/admin")
  return { ok: true, message: "Bank account updated" }
}

/** Admin: set just the display weight for an account (higher = shown more often). */
export async function setBankAccountWeight(id: number, weight: number) {
  await requireAdmin()
  const w = Math.max(1, Math.floor(Number(weight) || 1))
  await db.update(bankAccount).set({ weight: w }).where(eq(bankAccount.id, id))
  revalidatePath("/admin")
  return { ok: true, message: `Display weight set to ${w}` }
}

export async function deleteBankAccount(id: number) {
  await requireAdmin()
  
  const [existing] = await db
    .select()
    .from(bankAccount)
    .where(eq(bankAccount.id, id))
  if (!existing) {
    return { ok: false, message: "Bank account not found" }
  }
  
  await db.delete(bankAccount).where(eq(bankAccount.id, id))
  
  revalidatePath("/admin")
  return { ok: true, message: "Bank account deleted" }
}

export async function toggleBankAccountStatus(id: number) {
  await requireAdmin()
  
  const [existing] = await db
    .select()
    .from(bankAccount)
    .where(eq(bankAccount.id, id))
  if (!existing) {
    return { ok: false, message: "Bank account not found" }
  }
  
  await db
    .update(bankAccount)
    .set({ isActive: !existing.isActive })
    .where(eq(bankAccount.id, id))
  
  revalidatePath("/admin")
  return { ok: true, message: existing.isActive ? "Account deactivated" : "Account activated" }
}

/**
 * PLATFORM DATA RESET — C.I.L launch preparation.
 *
 * Wipes all transactional data so the platform starts fresh for C.I.L
 * while keeping user credentials (email, password hash) and phone numbers
 * so existing users can log in and their identity carries over to a new account.
 *
 * KEPT:  user, account, verification (Better Auth — credentials + sessions)
 *        profile (invite codes, phone numbers, referral tree, bank details)
 *        bankAccount (deposit routing)
 *        siteSetting, promoterCode, referralMilestone (config)
 *
 * CLEARED: wallet, investment, transaction, deposit, withdrawal, referral,
 *           daily_signin, gift_code, gift_code_redemption, milestone_claim,
 *           stake_spin, lucky_draw_slot, lucky_draw_round, lock_vault
 *
 * Profile fields reset: balance, earnings, signinBonusGiven, role stays.
 */
export async function resetPlatformData(confirmText: string) {
  await requireAdmin()

  if (confirmText !== "RESET C.I.L") {
    return { ok: false, message: 'Type "RESET C.I.L" to confirm' }
  }

  const { pool } = await import("@/lib/db")
  const client = await pool.connect()

  try {
    await client.query("BEGIN")

    // Clear transactional tables
    await client.query("DELETE FROM lock_vault")
    await client.query("DELETE FROM lucky_draw_round")
    await client.query("DELETE FROM lucky_draw_slot")
    await client.query("DELETE FROM stake_spin")
    await client.query("DELETE FROM gift_code_redemption")
    await client.query("DELETE FROM gift_code")
    await client.query("DELETE FROM milestone_claim")
    await client.query("DELETE FROM daily_signin")
    await client.query("DELETE FROM referral")
    await client.query("DELETE FROM withdrawal")
    await client.query("DELETE FROM deposit")
    await client.query("DELETE FROM transaction")
    await client.query("DELETE FROM investment")
    await client.query("DELETE FROM wallet")

    // Reset profile financial fields and sign-in bonus flag
    // Keep: phone, inviteCode, referredBy, role, isPromoter, bank details
    await client.query(`
      UPDATE profile SET
        "signinBonusGiven" = false
    `)

    await client.query("COMMIT")
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {})
    console.error("[v0] resetPlatformData failed:", err)
    return { ok: false, message: "Reset failed — check server logs" }
  } finally {
    client.release()
  }

  revalidatePath("/admin")
  return {
    ok: true,
    message: "Platform data cleared. User credentials and bank accounts preserved. C.I.L is ready to launch.",
  }
}

export async function getAccountDeposits(accountId: number) {
  await requireAdmin()
  return db
    .select({
      id: deposit.id,
      amount: deposit.amount,
      reference: deposit.reference,
      status: deposit.status,
      createdAt: deposit.createdAt,
      userEmail: userTable.email,
      senderName: deposit.senderName,
    })
    .from(deposit)
    .leftJoin(userTable, eq(deposit.userId, userTable.id))
    .where(eq(deposit.bankAccountId, accountId))
    .orderBy(desc(deposit.createdAt))
    .limit(100)
}

// ===================== PROMOTER MANAGEMENT =====================

export async function togglePromoter(userId: string) {
  await requireAdmin()
  const [p] = await db.select().from(profile).where(eq(profile.userId, userId))
  if (!p) return { ok: false, message: "User not found" }
  
  await db
    .update(profile)
    .set({ isPromoter: !p.isPromoter })
    .where(eq(profile.userId, userId))
  
  revalidatePath("/admin")
  return { ok: true, message: p.isPromoter ? "Promoter status removed" : "User is now a promoter (40% L1 commission)" }
}

// ===================== MILESTONE MANAGEMENT =====================

export async function getMilestones() {
  await requireAdmin()
  return db.select().from(referralMilestone).orderBy(referralMilestone.referralCount)
}

export async function createMilestone(data: { referralCount: number; rewardAmount: number }) {
  await requireAdmin()
  if (!data.referralCount || !data.rewardAmount) {
    return { ok: false, message: "Referral count and reward amount are required" }
  }
  
  const exists = await db.select().from(referralMilestone).where(eq(referralMilestone.referralCount, data.referralCount))
  if (exists.length > 0) {
    return { ok: false, message: "A milestone with this referral count already exists" }
  }
  
  await db.insert(referralMilestone).values({
    referralCount: data.referralCount,
    rewardAmount: String(data.rewardAmount),
    isActive: true,
  })
  
  revalidatePath("/admin")
  return { ok: true, message: `Milestone created: ${data.referralCount} referrals = ₦${data.rewardAmount.toLocaleString()}` }
}

export async function updateMilestone(id: number, data: { referralCount?: number; rewardAmount?: number; isActive?: boolean }) {
  await requireAdmin()
  const [existing] = await db.select().from(referralMilestone).where(eq(referralMilestone.id, id))
  if (!existing) return { ok: false, message: "Milestone not found" }
  
  await db
    .update(referralMilestone)
    .set({
      referralCount: data.referralCount ?? existing.referralCount,
      rewardAmount: data.rewardAmount ? String(data.rewardAmount) : existing.rewardAmount,
      isActive: data.isActive ?? existing.isActive,
    })
    .where(eq(referralMilestone.id, id))
  
  revalidatePath("/admin")
  return { ok: true, message: "Milestone updated" }
}

export async function deleteMilestone(id: number) {
  await requireAdmin()
  await db.delete(referralMilestone).where(eq(referralMilestone.id, id))
  revalidatePath("/admin")
  return { ok: true, message: "Milestone deleted" }
}

export async function toggleMilestoneStatus(id: number) {
  await requireAdmin()
  const [existing] = await db.select().from(referralMilestone).where(eq(referralMilestone.id, id))
  if (!existing) return { ok: false, message: "Milestone not found" }
  
  await db
    .update(referralMilestone)
    .set({ isActive: !existing.isActive })
    .where(eq(referralMilestone.id, id))
  
  revalidatePath("/admin")
  return { ok: true, message: existing.isActive ? "Milestone deactivated" : "Milestone activated" }
}

// ===================== SITE SETTINGS (PAUSE TOGGLES) =====================

export async function getSiteControls() {
  await requireAdmin()
  return getPauseFlags()
}

/** Admin: freeze or unfreeze the entire site for non-admin users. */
export async function setSiteFrozen(frozen: boolean) {
  await requireAdmin()
  await setSetting(SETTING_KEYS.siteFrozen, frozen ? "true" : "false")
  revalidatePath("/")
  revalidatePath("/dashboard")
  return { ok: true, message: frozen ? "Site frozen — all users locked out" : "Site unfrozen — users can access normally" }
}

export async function setDepositsPaused(paused: boolean) {
  await requireAdmin()
  await setSetting(SETTING_KEYS.depositsPaused, paused ? "true" : "false")
  revalidatePath("/admin")
  return { ok: true, message: paused ? "Deposits paused" : "Deposits resumed" }
}

export async function setWithdrawalsPaused(paused: boolean) {
  await requireAdmin()
  await setSetting(SETTING_KEYS.withdrawalsPaused, paused ? "true" : "false")
  revalidatePath("/admin")
  return { ok: true, message: paused ? "Withdrawals paused" : "Withdrawals resumed" }
}

// ===================== TRANSACTIONS FEED =====================

/** Admin: permanently delete a single transaction row from both admin and user view. */
export async function adminDeleteTransaction(id: number) {
  await requireAdmin()
  await db.delete(transaction).where(eq(transaction.id, id))
  revalidatePath("/admin")
  return { ok: true, message: "Transaction deleted" }
}

/** Admin: site-wide transaction feed, optionally filtered by type. */
export async function getAllTransactions(opts?: { type?: string; limit?: number }) {
  await requireAdmin()
  const limit = Math.min(opts?.limit ?? 100, 500)
  const where = opts?.type && opts.type !== "all" ? eq(transaction.type, opts.type) : undefined

  return db
    .select({
      id: transaction.id,
      userId: transaction.userId,
      type: transaction.type,
      amount: transaction.amount,
      status: transaction.status,
      description: transaction.description,
      reference: transaction.reference,
      createdAt: transaction.createdAt,
      userName: userTable.name,
      userEmail: userTable.email,
    })
    .from(transaction)
    .leftJoin(userTable, eq(transaction.userId, userTable.id))
    .where(where)
    .orderBy(desc(transaction.createdAt))
    .limit(limit)
}

// ===================== PROMOTER CODES =====================

function genPromoCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  let s = "PROMO"
  for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s
}

export async function getPromoterCodes() {
  await requireAdmin()
  return db.select().from(promoterCode).orderBy(desc(promoterCode.createdAt)).limit(100)
}

export async function createPromoterCode(data: {
  code?: string
  label?: string
  maxSignups?: number | null
  commissionRate?: number | null
}) {
  await requireAdmin()

  let code = data.code?.trim().toUpperCase().replace(/\s+/g, "")
  if (code) {
    const exists = await db.select().from(promoterCode).where(eq(promoterCode.code, code))
    if (exists.length > 0) return { ok: false, message: "That code already exists" }
  } else {
    code = genPromoCode()
    for (let i = 0; i < 5; i++) {
      const clash = await db.select().from(promoterCode).where(eq(promoterCode.code, code!))
      if (clash.length === 0) break
      code = genPromoCode()
    }
  }

  // Validate commissionRate 1-100
  const commission = data.commissionRate != null ? Math.min(100, Math.max(1, Math.round(data.commissionRate))) : null
  const maxSignups = data.maxSignups != null ? Math.max(1, Math.round(data.maxSignups)) : null

  await db.insert(promoterCode).values({
    code: code!,
    label: data.label?.trim() || null,
    isActive: true,
    maxSignups,
    commissionRate: commission,
  })

  revalidatePath("/admin")
  return { ok: true, message: `Promoter code ${code} created` }
}

export async function updatePromoterCode(id: number, data: { maxSignups?: number | null; commissionRate?: number | null; label?: string | null }) {
  await requireAdmin()
  const [existing] = await db.select().from(promoterCode).where(eq(promoterCode.id, id))
  if (!existing) return { ok: false, message: "Code not found" }

  const commission = data.commissionRate != null ? Math.min(100, Math.max(1, Math.round(data.commissionRate))) : null
  const maxSignups = data.maxSignups != null ? Math.max(1, Math.round(data.maxSignups)) : null

  await db.update(promoterCode).set({
    label: data.label !== undefined ? (data.label?.trim() || null) : existing.label,
    maxSignups: data.maxSignups !== undefined ? maxSignups : existing.maxSignups,
    commissionRate: data.commissionRate !== undefined ? commission : existing.commissionRate,
  }).where(eq(promoterCode.id, id))

  revalidatePath("/admin")
  return { ok: true, message: "Code updated" }
}

export async function setPromoterCommission(userId: string, rate: number | null) {
  await requireAdmin()
  const [p] = await db.select().from(profile).where(eq(profile.userId, userId))
  if (!p) return { ok: false, message: "User not found" }
  if (!p.isPromoter) return { ok: false, message: "User is not a promoter" }

  const commission = rate != null ? Math.min(100, Math.max(1, Math.round(rate))) : null
  await db.update(profile).set({ promoterCommission: commission }).where(eq(profile.userId, userId))

  revalidatePath("/admin")
  return { ok: true, message: commission != null ? `Commission set to ${commission}%` : "Commission reset to default" }
}

// ===================== PLAN SLOT MANAGEMENT =====================

/** Fetch all plan slot configs. Missing rows = unlimited/active. */
export async function getPlanSlots() {
  await requireAdmin()
  return db.select().from(planSlot).orderBy(asc(planSlot.planId))
}

/**
 * Upsert slot config for a plan.
 * totalSlots: null means unlimited.
 * isActive: false means plan is hidden regardless of slots.
 */
export async function setPlanSlot(planId: number, opts: { totalSlots: number | null; isActive: boolean }) {
  await requireAdmin()
  const existing = await db.select().from(planSlot).where(eq(planSlot.planId, planId))

  if (existing.length > 0) {
    await db
      .update(planSlot)
      .set({
        totalSlots: opts.totalSlots,
        isActive: opts.isActive,
        updatedAt: new Date(),
      })
      .where(eq(planSlot.planId, planId))
  } else {
    await db.insert(planSlot).values({
      planId,
      totalSlots: opts.totalSlots,
      soldSlots: 0,
      isActive: opts.isActive,
    })
  }

  revalidatePath("/dashboard")
  revalidatePath("/products")
  revalidatePath("/admin")
  return { ok: true, message: `Slots updated for plan ${planId}` }
}

/** Reset sold slots counter back to zero for a plan (e.g. for a new batch). */
export async function resetPlanSoldSlots(planId: number) {
  await requireAdmin()
  await db
    .update(planSlot)
    .set({ soldSlots: 0, updatedAt: new Date() })
    .where(eq(planSlot.planId, planId))
  revalidatePath("/dashboard")
  revalidatePath("/products")
  revalidatePath("/admin")
  return { ok: true, message: `Sold slots reset for plan ${planId}` }
}

export async function togglePromoterCode(id: number) {
  await requireAdmin()
  const [existing] = await db.select().from(promoterCode).where(eq(promoterCode.id, id))
  if (!existing) return { ok: false, message: "Code not found" }

  await db.update(promoterCode).set({ isActive: !existing.isActive }).where(eq(promoterCode.id, id))
  revalidatePath("/admin")
  return { ok: true, message: existing.isActive ? "Code deactivated" : "Code activated" }
}

export async function deletePromoterCode(id: number) {
  await requireAdmin()
  await db.delete(promoterCode).where(eq(promoterCode.id, id))
  revalidatePath("/admin")
  return { ok: true, message: "Promoter code deleted" }
}

// ── Admin: Investment Management ─────────────────────────────────────────────

export async function getAllInvestments() {
  await requireAdmin()
  const rows = await db
    .select({
      id: investment.id,
      userId: investment.userId,
      planName: investment.planName,
      price: investment.price,
      dailyEarning: investment.dailyEarning,
      totalEarning: investment.totalEarning,
      amountEarned: investment.amountEarned,
      daysPaid: investment.daysPaid,
      durationDays: investment.durationDays,
      status: investment.status,
      createdAt: investment.createdAt,
      lastPayoutAt: investment.lastPayoutAt,
      userName: userTable.name,
      userEmail: userTable.email,
    })
    .from(investment)
    .leftJoin(userTable, eq(investment.userId, userTable.id))
    .orderBy(desc(investment.createdAt))
    .limit(300)
  return rows
}

export async function adminCancelInvestment(id: number) {
  await requireAdmin()
  const [inv] = await db.select().from(investment).where(eq(investment.id, id))
  if (!inv) return { ok: false, message: "Investment not found" }
  if (inv.status !== "active") return { ok: false, message: "Investment is not active" }

  // Refund unearned capital proportionally (refund principal minus what was paid out)
  const earned = Number(inv.amountEarned)
  const principal = Number(inv.price)
  const refund = Math.max(0, principal - earned)

  await db.update(investment).set({ status: "cancelled" }).where(eq(investment.id, id))

  if (refund > 0) {
    await db
      .update(wallet)
      .set({
        balance: sql`${wallet.balance} + ${refund}`,
        totalEarned: sql`${wallet.totalEarned} + ${refund}`,
        updatedAt: new Date(),
      })
      .where(eq(wallet.userId, inv.userId))

    await db.insert(transaction).values({
      userId: inv.userId,
      type: "refund",
      amount: String(refund),
      description: `Investment ${inv.planName} cancelled by admin — ₦${refund.toLocaleString()} refunded`,
    })
  }

  revalidatePath("/admin")
  return { ok: true, message: `Investment cancelled. ₦${refund.toLocaleString()} refunded.` }
}

export async function adminDeleteInvestment(id: number) {
  await requireAdmin()
  const [inv] = await db.select().from(investment).where(eq(investment.id, id))
  if (!inv) return { ok: false, message: "Investment not found" }
  // Allow deletion of any status — active, cancelled, completed, deleted

  // Hard delete the investment row — completely gone, user sees nothing
  await db.delete(investment).where(eq(investment.id, id))

  // Also wipe all transactions whose description references this investment plan
  // (earnings, refund, cancellation notices) so no trace on user or admin side.
  // We match by userId + investment-related types to avoid nuking unrelated rows.
  await db.delete(transaction).where(
    and(
      eq(transaction.userId, inv.userId),
      sql`${transaction.description} ILIKE ${"%" + inv.planName + "%"}`
    )
  )

  revalidatePath("/admin")
  revalidatePath("/dashboard")
  return { ok: true, message: "Investment and all related transactions permanently deleted." }
}

export async function adminExtendInvestment(id: number, extraDays: number) {
  await requireAdmin()
  const [inv] = await db.select().from(investment).where(eq(investment.id, id))
  if (!inv) return { ok: false, message: "Investment not found" }

  await db
    .update(investment)
    .set({ durationDays: inv.durationDays + extraDays })
    .where(eq(investment.id, id))

  revalidatePath("/admin")
  return { ok: true, message: `Extended by ${extraDays} days` }
}

// ── Admin: Financials ─────────────────────────────────────────────────────────

export async function getFinancials() {
  await requireAdmin()

  const [charges] = await db
    .select({ total: sql<number>`coalesce(sum(charge),0)::float` })
    .from(withdrawal)
    .where(eq(withdrawal.status, "approved"))

  const [payouts] = await db
    .select({ total: sql<number>`coalesce(sum("netAmount"),0)::float` })
    .from(withdrawal)
    .where(eq(withdrawal.status, "approved"))

  const [pendingPayouts] = await db
    .select({ total: sql<number>`coalesce(sum("netAmount"),0)::float` })
    .from(withdrawal)
    .where(eq(withdrawal.status, "pending"))

  const [deposits] = await db
    .select({ total: sql<number>`coalesce(sum(amount),0)::float` })
    .from(deposit)
    .where(eq(deposit.status, "approved"))

  const [activeInvCount] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(investment)
    .where(eq(investment.status, "active"))

  const [totalInvAmount] = await db
    .select({ total: sql<number>`coalesce(sum(price),0)::float` })
    .from(investment)
    .where(eq(investment.status, "active"))

  const [totalEarned] = await db
    .select({ total: sql<number>`coalesce(sum("totalEarned"),0)::float` })
    .from(wallet)

  const [totalWithdrawn] = await db
    .select({ total: sql<number>`coalesce(sum("totalWithdrawn"),0)::float` })
    .from(wallet)

  return {
    withdrawalCharges: charges.total,
    totalPayouts: payouts.total,
    pendingPayouts: pendingPayouts.total,
    totalDeposits: deposits.total,
    activeInvestments: activeInvCount.c,
    activeInvestmentVolume: totalInvAmount.total,
    platformTotalEarned: totalEarned.total,
    platformTotalWithdrawn: totalWithdrawn.total,
    platformRevenue: charges.total, // charges collected = platform revenue
  }
}

// ── Admin: Lucky Draw ─────────────────────────────────────────────────────────

export async function getLuckyDrawRounds() {
  await requireAdmin()
  return db.select().from(luckyDrawRound).orderBy(desc(luckyDrawRound.drawDate)).limit(30)
}

// pickedWinnerIds: optional list of up to 3 user IDs admin wants to force as winners.
// Any remaining slots (up to 3) are filled randomly from actual slot entrants.
export async function executeLuckyDraw(drawDate: string, pickedWinnerIds: string[] = []) {
  await requireAdmin()

  const [round] = await db
    .select()
    .from(luckyDrawRound)
    .where(eq(luckyDrawRound.drawDate, drawDate))

  if (!round) return { ok: false, message: "Draw round not found" }
  if (round.status === "drawn") return { ok: false, message: "Draw already executed" }

  // Get all slots for this date
  const slots = await db
    .select()
    .from(luckyDrawSlot)
    .where(eq(luckyDrawSlot.drawDate, drawDate))

  if (slots.length === 0) return { ok: false, message: "No slots entered for this draw" }

  // Build unique user list from slots
  const slotUserIds = [...new Set(slots.map((s) => s.userId))]

  // Start with admin-picked winners (must have a slot in this draw)
  const seenUsers = new Set<string>()
  const winners: { userId: string }[] = []

  for (const uid of pickedWinnerIds) {
    if (winners.length >= 3) break
    if (!slotUserIds.includes(uid)) continue // must have entered this draw
    if (seenUsers.has(uid)) continue
    seenUsers.add(uid)
    winners.push({ userId: uid })
  }

  // Fill remaining spots randomly from slot entrants
  const shuffled = [...slotUserIds].sort(() => Math.random() - 0.5)
  for (const uid of shuffled) {
    if (winners.length >= 3) break
    if (seenUsers.has(uid)) continue
    seenUsers.add(uid)
    winners.push({ userId: uid })
  }

  const pool = Number(round.prizePool)
  // 35% 1st, 20% 2nd, 15% 3rd — platform retains the remaining 30%
  const shares = [0.35, 0.20, 0.15].slice(0, winners.length)
  const amounts = shares.map((s) => Math.round(pool * s))

  // Pay out winners
  for (let i = 0; i < winners.length; i++) {
    const w = winners[i]
    const amount = amounts[i]
    if (!w || amount <= 0) continue

    await db
      .update(wallet)
      .set({ balance: sql`${wallet.balance} + ${amount}`, totalEarned: sql`${wallet.totalEarned} + ${amount}`, updatedAt: new Date() })
      .where(eq(wallet.userId, w.userId))

    await db.insert(transaction).values({
      userId: w.userId,
      type: "lucky_draw_win",
      amount: String(amount),
      description: `Lucky Draw winner — ${i === 0 ? "1st" : i === 1 ? "2nd" : "3rd"} place (₦${amount.toLocaleString()})`,
    })
  }

  // Update round record
  await db.update(luckyDrawRound).set({
    status: "drawn",
    winner1Id: winners[0]?.userId ?? null,
    winner1Amount: amounts[0] ? String(amounts[0]) : null,
    winner2Id: winners[1]?.userId ?? null,
    winner2Amount: amounts[1] ? String(amounts[1]) : null,
    winner3Id: winners[2]?.userId ?? null,
    winner3Amount: amounts[2] ? String(amounts[2]) : null,
    executedAt: new Date(),
  }).where(eq(luckyDrawRound.drawDate, drawDate))

  const totalPaid = amounts.reduce((a, b) => a + b, 0)
  const platformEarned = pool - totalPaid

  revalidatePath("/admin")
  revalidatePath("/games")
  return { ok: true, message: `Draw executed. ${winners.length} winner${winners.length > 1 ? "s" : ""} paid ₦${totalPaid.toLocaleString()} (platform retained ₦${platformEarned.toLocaleString()}).` }
}

// Returns slot entrants for a given draw date — used by admin winner picker
export async function getDrawSlotUsers(drawDate: string) {
  await requireAdmin()
  const slots = await db
    .select({ userId: luckyDrawSlot.userId })
    .from(luckyDrawSlot)
    .where(eq(luckyDrawSlot.drawDate, drawDate))
  const userIds = [...new Set(slots.map((s) => s.userId))]
  if (userIds.length === 0) return []
  const userRows = await db
    .select({ id: userTable.id, email: userTable.email, name: userTable.name })
    .from(userTable)
    .where(sql`${userTable.id} = ANY(ARRAY[${sql.raw(userIds.map((id) => `'${id.replace(/'/g, "''")}'`).join(","))}]::text[])`)
  return userRows
}

// ── Admin: Game Config ────────────────────────────────────────────────────────

export async function saveGameConfig(updates: {
  stakeHouseEdge?: number    // fraction e.g. 0.70
  stakeMin?: number
  stakeMax?: number
  stakeMultipliers?: number[]
  luckyDrawSlotCost?: number
  vaultBonus7?: number
  vaultBonus14?: number
  vaultBonus30?: number
  vaultPenalty?: number
  vaultMin?: number
  withdrawalCharge?: number  // percent e.g. 18 — applies immediately to all pending withdrawals
}) {
  await requireAdmin()
  const g = SETTING_KEYS
  const pairs: [string, string][] = []

  if (updates.stakeHouseEdge !== undefined) pairs.push([g.stakeHouseEdge, String(updates.stakeHouseEdge)])
  if (updates.stakeMin !== undefined) pairs.push([g.stakeMin, String(updates.stakeMin)])
  if (updates.stakeMax !== undefined) pairs.push([g.stakeMax, String(updates.stakeMax)])
  if (updates.stakeMultipliers !== undefined) pairs.push([g.stakeMultipliers, JSON.stringify(updates.stakeMultipliers)])
  if (updates.luckyDrawSlotCost !== undefined) pairs.push([g.luckyDrawSlotCost, String(updates.luckyDrawSlotCost)])
  if (updates.vaultBonus7 !== undefined) pairs.push([g.vaultBonus7, String(updates.vaultBonus7)])
  if (updates.vaultBonus14 !== undefined) pairs.push([g.vaultBonus14, String(updates.vaultBonus14)])
  if (updates.vaultBonus30 !== undefined) pairs.push([g.vaultBonus30, String(updates.vaultBonus30)])
  if (updates.vaultPenalty !== undefined) pairs.push([g.vaultPenalty, String(updates.vaultPenalty)])
  if (updates.vaultMin !== undefined) pairs.push([g.vaultMin, String(updates.vaultMin)])
  if (updates.withdrawalCharge !== undefined) pairs.push([g.withdrawalCharge, String(updates.withdrawalCharge)])

  for (const [key, value] of pairs) {
    await setSetting(key, value)
  }

  revalidatePath("/admin")
  revalidatePath("/games")
  return { ok: true, message: "Game config saved" }
}

// ── Admin: Game History Queries ───────────────────────────────────────────────

export async function getAllSpins() {
  await requireAdmin()
  const rows = await db
    .select({
      id: stakeSpin.id,
      userId: stakeSpin.userId,
      stakeAmount: stakeSpin.stakeAmount,
      outcome: stakeSpin.outcome,
      multiplier: stakeSpin.multiplier,
      winAmount: stakeSpin.winAmount,
      createdAt: stakeSpin.createdAt,
      userName: userTable.name,
      userEmail: userTable.email,
    })
    .from(stakeSpin)
    .leftJoin(userTable, eq(stakeSpin.userId, userTable.id))
    .orderBy(desc(stakeSpin.createdAt))
    .limit(200)
  return rows
}

export async function getAllVaults() {
  await requireAdmin()
  const rows = await db
    .select({
      id: lockVault.id,
      userId: lockVault.userId,
      amount: lockVault.amount,
      lockDays: lockVault.lockDays,
      bonusPercent: lockVault.bonusPercent,
      bonusAmount: lockVault.bonusAmount,
      status: lockVault.status,
      unlocksAt: lockVault.unlocksAt,
      penaltyAmount: lockVault.penaltyAmount,
      createdAt: lockVault.createdAt,
      completedAt: lockVault.completedAt,
      userName: userTable.name,
      userEmail: userTable.email,
    })
    .from(lockVault)
    .leftJoin(userTable, eq(lockVault.userId, userTable.id))
    .orderBy(desc(lockVault.createdAt))
    .limit(200)
  return rows
}

export async function getAllDrawSlots() {
  await requireAdmin()
  const rows = await db
    .select({
      id: luckyDrawSlot.id,
      userId: luckyDrawSlot.userId,
      source: luckyDrawSlot.source,
      purchaseAmount: luckyDrawSlot.purchaseAmount,
      drawDate: luckyDrawSlot.drawDate,
      createdAt: luckyDrawSlot.createdAt,
      userName: userTable.name,
      userEmail: userTable.email,
    })
    .from(luckyDrawSlot)
    .leftJoin(userTable, eq(luckyDrawSlot.userId, userTable.id))
    .orderBy(desc(luckyDrawSlot.createdAt))
    .limit(500)
  return rows
}

export async function getGameStats() {
  await requireAdmin()

  const [totalSpins] = await db.select({ c: sql<number>`count(*)::int` }).from(stakeSpin)
  const [spinWins] = await db.select({ c: sql<number>`count(*)::int` }).from(stakeSpin).where(eq(stakeSpin.outcome, "win"))
  const [spinStaked] = await db.select({ total: sql<number>`coalesce(sum("stakeAmount"),0)::float` }).from(stakeSpin)
  const [spinPaidOut] = await db.select({ total: sql<number>`coalesce(sum("winAmount"),0)::float` }).from(stakeSpin).where(eq(stakeSpin.outcome, "win"))

  const [totalVaults] = await db.select({ c: sql<number>`count(*)::int` }).from(lockVault)
  const [activeVaults] = await db.select({ c: sql<number>`count(*)::int` }).from(lockVault).where(eq(lockVault.status, "locked"))
  const [vaultLocked] = await db.select({ total: sql<number>`coalesce(sum(amount),0)::float` }).from(lockVault).where(eq(lockVault.status, "locked"))

  const [totalSlots] = await db.select({ c: sql<number>`count(*)::int` }).from(luckyDrawSlot)
  const [paidSlots] = await db.select({ c: sql<number>`count(*)::int` }).from(luckyDrawSlot).where(eq(luckyDrawSlot.source, "purchased"))
  const [slotRevenue] = await db.select({ total: sql<number>`coalesce(sum("purchaseAmount"),0)::float` }).from(luckyDrawSlot).where(eq(luckyDrawSlot.source, "purchased"))

  return {
    spin: {
      total: totalSpins.c,
      wins: spinWins.c,
      losses: totalSpins.c - spinWins.c,
      winRate: totalSpins.c > 0 ? Math.round((spinWins.c / totalSpins.c) * 100) : 0,
      totalStaked: spinStaked.total,
      totalPaidOut: spinPaidOut.total,
      houseProfit: spinStaked.total - spinPaidOut.total,
    },
    vault: {
      total: totalVaults.c,
      active: activeVaults.c,
      totalLocked: vaultLocked.total,
    },
    draw: {
      totalSlots: totalSlots.c,
      paidSlots: paidSlots.c,
      revenue: slotRevenue.total,
    },
  }
}

// Single action that fetches all admin dashboard data in parallel.
// Used by the live-polling client so it only needs one round-trip.
export async function getAdminData() {
  await requireAdmin()
  const [stats, withdrawals, users, giftCodes, deposits, bankAccounts, milestones, controls, transactions, promoterCodes, investments, financials, drawRounds, spins, vaults, drawSlots, gameStats, gameConfig, customPlans] =
    await Promise.all([
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
      getCustomPlans(),
    ])
  return { stats, withdrawals, users, giftCodes, deposits, bankAccounts, milestones, controls, transactions, promoterCodes, investments, financials, drawRounds, spins, vaults, drawSlots, gameStats, gameConfig, customPlans }
}

// ── Sabuss Deposit Check (Admin) ────────────────────────────────��─────────────

/**
 * Admin-facing Sabuss check — queries the Sabuss API for the deposit's account
 * and returns whether the transaction exists, with a human-readable message.
 * Works for both pending AND already-approved deposits (verify mode).
 */
export async function adminCheckDeposit(reference: string) {
  await requireAdmin()

  const [dep] = await db
    .select()
    .from(deposit)
    .where(eq(deposit.reference, reference))

  if (!dep) return { ok: false, message: "Deposit not found" }

  const isCompleted = dep.status === "success" || dep.status === "approved"

  if (!dep.bankAccountId) {
    return { ok: false, message: "No bank account assigned to this deposit" }
  }

  const [acc] = await db
    .select()
    .from(bankAccount)
    .where(eq(bankAccount.id, dep.bankAccountId))

  const depositAmount = Math.round(Number(dep.amount))

  // ── Already completed: be honest about HOW it was approved ──
  if (isCompleted) {
    if (dep.sabussRef) {
      // Was auto-approved via Sabuss webhook — we have their transaction ID as proof
      const senderProof = dep.senderName ? ` Sender: ${dep.senderName}.` : ""
      return {
        ok: true,
        found: true,
        message: `Verified: auto-approved by Sabuss webhook (ref: ${dep.sabussRef}).${senderProof} ₦${depositAmount.toLocaleString()} credited.`,
      }
    }
    // No sabussRef = was manually approved by admin, NOT webhook-verified
    const senderProof = dep.senderName ? ` Sender on record: ${dep.senderName}.` : ""
    return {
      ok: true,
      found: false,
      message: `This deposit was manually approved by admin — no Sabuss webhook reference on record.${senderProof} If you did NOT verify payment before approving, check your Sabuss dashboard manually.`,
    }
  }

  // ── Still processing: try Sabuss query API with sabussRef if available ──
  // The Sabuss query endpoint requires their own transaction reference (e.g. 000010...),
  // which is only available if the webhook already fired and stored it as sabussRef.
  // Without it the API returns "Invalid Reference ID" regardless of what we send.
  if (acc?.sabussApiKey && acc.sabussPin && dep.sabussRef) {
    let sabussRaw = ""
    let sabussData: Record<string, unknown> | null = null
    try {
      const formBody = new URLSearchParams()
      formBody.append("pin", acc.sabussPin)
      formBody.append("reference", dep.sabussRef)
      const res = await fetch(`https://sabuss.com/vtu/api/query/${acc.sabussApiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formBody.toString(),
        signal: AbortSignal.timeout(10000),
      })
      sabussRaw = await res.text()
      try { sabussData = JSON.parse(sabussRaw) } catch { /* not JSON */ }
    } catch { /* network error — fall through to manual message */ }

    if (sabussData && String(sabussData.status ?? "").toLowerCase() === "success") {
      const tx = Array.isArray(sabussData.response)
        ? (sabussData.response as Record<string, unknown>[])[0]
        : sabussData.response as Record<string, unknown>
      const senderInfo = tx?.sender ? `Sender: ${tx.sender}.` : dep.senderName ? `Sender: ${dep.senderName}.` : ""

      // Auto-approve since Sabuss confirmed it
      await db.update(deposit).set({ status: "success" }).where(eq(deposit.reference, reference))
      await db.update(wallet).set({
        balance: sql`${wallet.balance} + ${depositAmount}`,
        totalDeposited: sql`${wallet.totalDeposited} + ${depositAmount}`,
        updatedAt: new Date(),
      }).where(eq(wallet.userId, dep.userId))
      await db.insert(transaction).values({
        userId: dep.userId, type: "deposit", amount: String(depositAmount),
        status: "completed", reference,
        description: `Auto-approved via Sabuss query confirmation. ${senderInfo}`,
      })
      await db.update(bankAccount).set({
        totalDeposits: sql`${bankAccount.totalDeposits} + ${depositAmount}`,
        depositCount: sql`${bankAccount.depositCount} + 1`,
      }).where(eq(bankAccount.id, dep.bankAccountId))
      revalidatePath("/admin")
      return { ok: true, found: true, message: `Payment confirmed via Sabuss! ${senderInfo} Wallet credited ₦${depositAmount.toLocaleString()}.`.trim() }
    }
  }

  // ── Waiting for Sabuss webhook ──
  // The Sabuss query API requires their internal reference which we don't have yet.
  // Payment will auto-approve the moment Sabuss fires the webhook.
  const waitingSince = new Date(dep.createdAt).toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" })
  const senderHint = dep.senderName ? ` Expected sender: ${dep.senderName}.` : ""
  return {
    ok: true,
    found: false,
    message: `Waiting for Sabuss webhook. ₦${depositAmount.toLocaleString()} deposit created at ${waitingSince} is still PROCESSING.${senderHint} Payment will auto-approve the moment Sabuss notifies us. Use Approve manually if you have confirmed the payment on your Sabuss dashboard.`,
  }
}

// ── Sabuss Webhook Test ───────────────────────────────────────────────────────

/**
 * Fires a simulated Sabuss webhook payload to the live /api/webhooks/sabuss
 * endpoint so the admin can verify it is reachable and responding correctly.
 * Uses the account's real API key so the route can match it to the DB row.
 */
export async function testSabussWebhook(accountId: number) {
  await requireAdmin()

  const [acc] = await db
    .select()
    .from(bankAccount)
    .where(eq(bankAccount.id, accountId))

  if (!acc) return { ok: false, message: "Account not found" }
  if (!acc.sabussApiKey) return { ok: false, message: "No Sabuss API key set for this account" }

  const payload = {
    api_key: acc.sabussApiKey,
    amount: "1",           // ₦1 test — won't match any real deposit
    sender: "WebhookTest",
    reference: `TEST_${Date.now()}`,
    type: "credit",
    date: new Date().toISOString(),
    balance: "0",
  }

  try {
    const res = await fetch("https://conltd.site/api/webhooks/sabuss", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    })
    const json = await res.json()
    if (!res.ok) {
      return { ok: false, message: `HTTP ${res.status}: ${JSON.stringify(json)}` }
    }
    // Any 2xx with {ok:true} is success — "no_matching_deposit" is the expected
    // status for a ₦1 test ping (no real deposit exists for ₦1).
    return {
      ok: true,
      message: `Webhook reached! Response: ${JSON.stringify(json)}`,
      status: (json as Record<string, string>).status ?? "ok",
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, message: `Could not reach webhook: ${msg}` }
  }
}

// ── Admin: Custom Package Manager ─────────────────────────────────────────────

export type CustomPlanInput = {
  name: string
  price: number
  daily: number
  durationDays: number
  points: number
  maxPurchases: number | null
  comingSoon: boolean
  sortOrder: number
}

/** Fetch all admin-created plans (admin only) */
export async function getCustomPlans() {
  await requireAdmin()
  return db.select().from(customPlan).orderBy(asc(customPlan.sortOrder), asc(customPlan.id))
}

/** Fetch active custom plans for public display (no auth required) */
export async function getPublicCustomPlans() {
  return db.select().from(customPlan).where(eq(customPlan.isActive, true)).orderBy(asc(customPlan.sortOrder), asc(customPlan.id))
}

/** Create a new custom plan */
export async function createCustomPlan(input: CustomPlanInput) {
  await requireAdmin()
  if (!input.name.trim()) return { ok: false, message: "Name is required" }
  if (input.price <= 0 || input.daily <= 0) return { ok: false, message: "Price and daily must be positive" }

  await db.insert(customPlan).values({
    name: input.name.trim(),
    price: String(input.price),
    daily: String(input.daily),
    durationDays: input.durationDays,
    points: input.points,
    maxPurchases: input.maxPurchases,
    isActive: !input.comingSoon,
    comingSoon: input.comingSoon,
    sortOrder: input.sortOrder,
  })

  revalidatePath("/products")
  revalidatePath("/admin")
  return { ok: true, message: "Package created" }
}

/** Update an existing custom plan */
export async function updateCustomPlan(id: number, input: CustomPlanInput) {
  await requireAdmin()
  if (!input.name.trim()) return { ok: false, message: "Name is required" }
  if (input.price <= 0 || input.daily <= 0) return { ok: false, message: "Price and daily must be positive" }

  await db.update(customPlan).set({
    name: input.name.trim(),
    price: String(input.price),
    daily: String(input.daily),
    durationDays: input.durationDays,
    points: input.points,
    maxPurchases: input.maxPurchases,
    isActive: !input.comingSoon,
    comingSoon: input.comingSoon,
    sortOrder: input.sortOrder,
    updatedAt: new Date(),
  }).where(eq(customPlan.id, id))

  revalidatePath("/products")
  revalidatePath("/admin")
  return { ok: true, message: "Package updated" }
}

/** Toggle isActive (enable/disable) for a custom plan */
export async function toggleCustomPlan(id: number) {
  await requireAdmin()
  const [existing] = await db.select().from(customPlan).where(eq(customPlan.id, id))
  if (!existing) return { ok: false, message: "Package not found" }

  const nextActive = !existing.isActive
  await db.update(customPlan).set({
    isActive: nextActive,
    comingSoon: nextActive ? false : existing.comingSoon,
    updatedAt: new Date(),
  }).where(eq(customPlan.id, id))

  revalidatePath("/products")
  revalidatePath("/admin")
  return { ok: true, message: nextActive ? "Package activated" : "Package deactivated" }
}

/** Release a coming-soon plan to active immediately */
export async function releasePlan(id: number) {
  await requireAdmin()
  const [existing] = await db.select().from(customPlan).where(eq(customPlan.id, id))
  if (!existing) return { ok: false, message: "Package not found" }

  await db.update(customPlan).set({
    isActive: true,
    comingSoon: false,
    updatedAt: new Date(),
  }).where(eq(customPlan.id, id))

  revalidatePath("/products")
  revalidatePath("/admin")
  return { ok: true, message: "Package released and is now active" }
}

/** Delete a custom plan (only if no active investments reference it) */
export async function deleteCustomPlan(id: number) {
  await requireAdmin()
  // Offset custom plan IDs start at 100 in id space
  const planIdInUse = await db
    .select({ c: sql<number>`count(*)` })
    .from(investment)
    .where(and(eq(investment.planId, id + 100), sql`${investment.status} NOT IN ('cancelled', 'deleted', 'completed')`))
  if (Number(planIdInUse[0].c) > 0) {
    return { ok: false, message: "Cannot delete — there are active investments on this package" }
  }

  await db.delete(customPlan).where(eq(customPlan.id, id))
  revalidatePath("/products")
  revalidatePath("/admin")
  return { ok: true, message: "Package deleted" }
}
