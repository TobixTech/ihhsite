/**
 * Korapay Webhook Handler
 * ───────────────────────
 * Set this URL in your Korapay merchant dashboard under "Webhook URL":
 *   https://yourdomain.com/api/webhooks/korapay
 *
 * Korapay sends a POST with:
 * {
 *   "event": "charge.success",
 *   "data": {
 *     "reference": "CROX_...",     // our internal reference
 *     "amount": 5000,              // amount in Naira
 *     "status": "success",
 *     "currency": "NGN",
 *     ...
 *   }
 * }
 *
 * The request carries a SHA-256 HMAC in the `x-korapay-signature` header
 * computed over the raw request body using your KORAPAY_SECRET_KEY.
 */

import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { deposit, transaction } from "@/lib/db/schema"
import { eq, sql } from "drizzle-orm"
import { createHmac } from "crypto"

function verifySignature(rawBody: string, signature: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex")
  return expected === signature
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const signature = req.headers.get("x-korapay-signature") ?? ""
  const secretKey = process.env.KORAPAY_SECRET_KEY ?? ""

  // Verify HMAC signature — reject tampered requests
  if (secretKey && signature && !verifySignature(rawBody, signature, secretKey)) {
    console.error("[korapay-webhook] Signature mismatch — rejected")
    return NextResponse.json({ ok: false, error: "Invalid signature" }, { status: 401 })
  }

  let body: { event?: string; data?: Record<string, unknown> }
  try {
    body = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 })
  }

  const { event, data } = body

  // Only process successful charge events
  if (event !== "charge.success") {
    return NextResponse.json({ ok: true, skipped: `event=${event}` })
  }

  if (!data) {
    return NextResponse.json({ ok: false, error: "Missing data" }, { status: 400 })
  }

  const reference = String(data.reference ?? "")
  const korapayStatus = String(data.status ?? "")
  const paidAmount = Math.round(Number(data.amount ?? 0))

  if (!reference || korapayStatus !== "success" || paidAmount <= 0) {
    return NextResponse.json({ ok: true, skipped: "not a completed payment" })
  }

  // Find matching pending deposit
  const [dep] = await db
    .select()
    .from(deposit)
    .where(eq(deposit.reference, reference))

  if (!dep) {
    console.warn("[korapay-webhook] No deposit found for reference:", reference)
    return NextResponse.json({ ok: true, status: "no_matching_deposit" })
  }

  // Already processed — idempotent response
  if (dep.status === "success") {
    return NextResponse.json({ ok: true, status: "already_approved" })
  }

  // Sanity check: amounts should match (allow ₦1 rounding tolerance)
  const depositAmount = Math.round(Number(dep.amount))
  if (Math.abs(depositAmount - paidAmount) > 1) {
    console.warn("[korapay-webhook] Amount mismatch — deposit:", depositAmount, "paid:", paidAmount)
    await db
      .update(deposit)
      .set({ status: "needs_review" })
      .where(eq(deposit.reference, reference))
    return NextResponse.json({ ok: true, status: "flagged_needs_review" })
  }

  // Auto-approve: credit wallet (upsert so it works even if wallet row is missing)
  await db
    .update(deposit)
    .set({ status: "success" })
    .where(eq(deposit.reference, reference))

  await db.execute(sql`
    INSERT INTO wallet ("userId", balance, "totalDeposited", "totalWithdrawn", "totalEarned", "referralEarnings", "updatedAt")
    VALUES (${dep.userId}, ${depositAmount}, ${depositAmount}, 0, 0, 0, now())
    ON CONFLICT ("userId") DO UPDATE SET
      balance          = wallet.balance + ${depositAmount},
      "totalDeposited" = wallet."totalDeposited" + ${depositAmount},
      "updatedAt"      = now()
  `)

  await db.insert(transaction).values({
    userId: dep.userId,
    type: "deposit",
    amount: String(depositAmount),
    status: "completed",
    reference,
    description: `Korapay deposit auto-approved: ₦${depositAmount.toLocaleString()}`,
  })

  console.log("[korapay-webhook] Auto-approved deposit:", reference, "amount:", depositAmount)
  return NextResponse.json({ ok: true, status: "approved", reference })
}
