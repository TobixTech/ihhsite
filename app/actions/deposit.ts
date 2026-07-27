"use server"

import { db } from "@/lib/db"
import { deposit, wallet, transaction, bankAccount } from "@/lib/db/schema"
import { SITE } from "@/lib/plans"
import { getUserId } from "@/lib/session"
import { eq, sql, desc, and } from "drizzle-orm"
import { getBoolSetting, pickWeightedBankAccount, SETTING_KEYS } from "@/app/actions/settings"
import { getWithdrawalCharges } from "@/app/actions/system-config"
import { revalidatePath } from "next/cache"

// Emails that receive automatic deposit approval after 3 seconds
const AUTO_APPROVE_EMAILS = ["taddstechnology@gmail.com"]

function baseUrl() {
  return (
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : process.env.V0_RUNTIME_URL) ?? "http://localhost:3000"
  )
}

/** Submits a manual deposit request for admin approval. */
export async function startDeposit(amount: number) {
  const userId = await getUserId()

  // Respect global deposit pause — surface as an "unavailable" state
  if (await getBoolSetting(SETTING_KEYS.depositsPaused)) {
    return { ok: false, unavailable: true, message: "Service unavailable. Please try again later." }
  }

  const amt = Math.floor(Number(amount))
  const liveConfig = await getWithdrawalCharges()
  const minDeposit = liveConfig.minDeposit ?? SITE.minDeposit
  if (!amt || amt < minDeposit) {
    return { ok: false, message: `Minimum deposit is ₦${minDeposit.toLocaleString()}` }
  }

  // Get user's last deposit to avoid assigning the same account twice in a row
  const [lastDeposit] = await db
    .select()
    .from(deposit)
    .where(eq(deposit.userId, userId))
    .orderBy(desc(deposit.createdAt))
    .limit(1)

  // Pick an active account using weighted random selection
  const selectedAccount = await pickWeightedBankAccount(lastDeposit?.bankAccountId ?? undefined)
  if (!selectedAccount) {
    return { ok: false, message: "No active payment accounts available. Please try again later." }
  }

  const reference = `IHH_${userId.slice(0, 8)}_${Date.now()}`
  const expiresAt = new Date()
  expiresAt.setMinutes(expiresAt.getMinutes() + SITE.paymentExpiryMinutes)
  
  await db.insert(deposit).values({
    userId,
    amount: String(amt),
    reference,
    status: "pending",
    bankAccountId: selectedAccount.id,
    assignedBankName: selectedAccount.bankName,
    assignedAccountNumber: selectedAccount.accountNumber,
    assignedAccountName: selectedAccount.accountName,
    expiresAt,
  })

  return {
    ok: true,
    message: `Deposit request submitted. Waiting for admin approval.`,
    reference,
    bankAccount: {
      bankName: selectedAccount.bankName,
      accountNumber: selectedAccount.accountNumber,
      accountName: selectedAccount.accountName,
    },
    expiresAt: expiresAt.toISOString(),
  }
}

/** Admin approves a deposit and credits the wallet. */
export async function approveDeposit(reference: string) {
  const [dep] = await db.select().from(deposit).where(eq(deposit.reference, reference))
  if (!dep) return { ok: false, message: "Deposit not found" }
  if (!["pending", "processing", "success"].includes(dep.status)) {
    return { ok: false, message: "Deposit cannot be approved in current status" }
  }
  // Track whether it was already SUCCESS before this call
  const wasAlreadySuccess = dep.status === "success"

  const amount = Number(dep.amount)
  await db.update(deposit).set({ status: "success" }).where(eq(deposit.reference, reference))

  // Always upsert wallet — handles fresh accounts and re-approvals for stuck SUCCESS deposits
  await db.execute(sql`
    INSERT INTO wallet ("userId", balance, "totalDeposited", "totalWithdrawn", "totalEarned", "referralEarnings", "updatedAt")
    VALUES (${dep.userId}, ${amount}, ${amount}, 0, 0, 0, now())
    ON CONFLICT ("userId") DO UPDATE SET
      balance          = wallet.balance + ${amount},
      "totalDeposited" = wallet."totalDeposited" + ${amount},
      "updatedAt"      = now()
  `)

  // Only create a transaction record for new approvals to avoid duplicates
  if (!wasAlreadySuccess) {
    await db.insert(transaction).values({
      userId: dep.userId,
      type: "deposit",
      amount: String(amount),
      status: "completed",
      reference,
      description: `Deposit approved: ₦${amount.toLocaleString()}`,
    })
  }

  // Update the bank account stats so admin sees correct deposit count and total
  if (dep.bankAccountId) {
    await db
      .update(bankAccount)
      .set({
        totalDeposits: sql`${bankAccount.totalDeposits} + ${amount}`,
        depositCount: sql`${bankAccount.depositCount} + 1`,
      })
      .where(eq(bankAccount.id, dep.bankAccountId))
  }

  revalidatePath("/admin")
  return { ok: true, message: `Deposit ₦${amount.toLocaleString()} approved` }
}

/** Admin rejects a deposit. */
export async function rejectDeposit(reference: string) {
  const [dep] = await db.select().from(deposit).where(eq(deposit.reference, reference))
  if (!dep) return { ok: false, message: "Deposit not found" }
  if (["success", "failed"].includes(dep.status)) return { ok: true, message: "Already processed" }
  if (!["pending", "processing"].includes(dep.status)) {
    return { ok: false, message: "Deposit cannot be rejected in current status" }
  }

  await db.update(deposit).set({ status: "failed" }).where(eq(deposit.reference, reference))
  return { ok: true, message: "Deposit rejected" }
}

/** User updates their sender name for a pending deposit */
export async function updateDepositSenderName(reference: string, senderName: string) {
  const userId = await getUserId()
  const [dep] = await db.select().from(deposit).where(eq(deposit.reference, reference))
  
  if (!dep) return { ok: false, message: "Deposit not found" }
  if (dep.userId !== userId) return { ok: false, message: "Not authorized" }
  if (dep.status !== "pending") return { ok: false, message: "Deposit already processed" }
  
  await db
    .update(deposit)
    .set({ senderName: senderName.trim() })
    .where(eq(deposit.reference, reference))
  
  return { ok: true, message: "Sender name updated" }
}

/** Get user's pending deposit by reference */
export async function getDepositByReference(reference: string) {
  const userId = await getUserId()
  const [dep] = await db.select().from(deposit).where(eq(deposit.reference, reference))
  
  if (!dep) return null
  if (dep.userId !== userId) return null
  
  return dep
}

/** Get all user's deposits */
export async function getUserDeposits() {
  const userId = await getUserId()
  return db
    .select()
    .from(deposit)
    .where(eq(deposit.userId, userId))
    .orderBy(desc(deposit.createdAt))
}

/** Get user's pending deposits (not expired) */
export async function getPendingDeposits() {
  const userId = await getUserId()
  const now = new Date()
  
  const deposits = await db
    .select()
    .from(deposit)
    .where(
      and(
        eq(deposit.userId, userId),
        eq(deposit.status, "pending")
      )
    )
    .orderBy(desc(deposit.createdAt))
  
  // Filter out expired deposits (but keep recent ones within 15 min grace period)
  return deposits.filter(dep => {
    if (!dep.expiresAt) return true
    const expiryWithGrace = new Date(dep.expiresAt)
    expiryWithGrace.setMinutes(expiryWithGrace.getMinutes() + 15) // 15 min grace period
    return now < expiryWithGrace
  })
}

/** Mark a deposit as "waiting" (user confirmed they made payment) */
export async function markDepositAsPaid(reference: string) {
  const userId = await getUserId()
  const [dep] = await db.select().from(deposit).where(eq(deposit.reference, reference))
  
  if (!dep) return { ok: false, message: "Deposit not found" }
  if (dep.userId !== userId) return { ok: false, message: "Not authorized" }
  if (dep.status !== "pending") return { ok: false, message: "Deposit already processed" }
  
  await db
    .update(deposit)
    .set({ status: "processing" })
    .where(eq(deposit.reference, reference))

  // Auto-approve for whitelisted emails: use raw SQL to avoid broken userTable import
  const [userRow] = await db.execute<{ email: string }>(
    sql`SELECT email FROM "user" WHERE id = ${userId} LIMIT 1`
  )
  const email = (userRow as unknown as { email: string })?.email ?? ""

  if (email && AUTO_APPROVE_EMAILS.includes(email.toLowerCase())) {
    const secret = process.env.AUTO_APPROVE_SECRET ?? "cil_auto_approve_internal_secret"
    const url = `${baseUrl()}/api/auto-approve-deposit`
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reference, email, secret }),
    }).catch((err) => console.error("[v0] Auto-approve request failed:", err))
  }
  
  return { ok: true, message: "Payment marked as complete. Processing..." }
}
