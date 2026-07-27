import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { deposit } from "@/lib/db/schema"
import { SITE } from "@/lib/plans"
import { getWithdrawalCharges } from "@/app/actions/system-config"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"

function baseUrl() {
  return (
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : process.env.V0_RUNTIME_URL) ?? "http://localhost:3000"
  )
}

export async function POST(req: NextRequest) {
  // Authenticate user
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 })
  }

  const userId = session.user.id
  const rawEmail = session.user.email ?? ""
  // Internal emails like xxx@247incum.user are rejected by Korapay — use a
  // real-looking fallback so the checkout request always succeeds.
  const isInternalEmail = rawEmail.endsWith(".user") || rawEmail.endsWith(".internal")
  const userEmail = isInternalEmail
    ? `user_${userId.slice(0, 8)}@croxexchange.com`
    : rawEmail
  const userName = session.user.name ?? "Customer"

  let body: { amount: number }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid request" }, { status: 400 })
  }

  const amt = Math.floor(Number(body.amount))
  if (!amt || amt <= 0) {
    return NextResponse.json({ ok: false, message: "Invalid amount" }, { status: 400 })
  }

  const liveConfig = await getWithdrawalCharges()
  const minDeposit = liveConfig.minDeposit ?? SITE.minDeposit
  if (amt < minDeposit) {
    return NextResponse.json(
      { ok: false, message: `Minimum deposit is ₦${minDeposit.toLocaleString()}` },
      { status: 400 },
    )
  }

  const secretKey = process.env.KORAPAY_SECRET_KEY
  if (!secretKey) {
    return NextResponse.json({ ok: false, message: "Payment provider not configured" }, { status: 500 })
  }

  // Generate a unique reference — this links Korapay's payment back to our deposit row
  const reference = `CROX_${userId.slice(0, 8)}_${Date.now()}`
  const origin = baseUrl()

  // Call Korapay's initialize charge API
  let korapayRes: Response
  try {
    korapayRes = await fetch("https://api.korapay.com/merchant/api/v1/charges/initialize", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secretKey}`,
      },
      body: JSON.stringify({
        reference,
        amount: amt,
        currency: "NGN",
        narration: `Crox Exchange wallet topup`,
        customer: {
          name: userName,
          email: userEmail,
        },
        notification_url: `${origin}/api/webhooks/korapay`,
        redirect_url: `${origin}/deposits/${reference}`,
        merchant_bears_cost: false,
      }),
    })
  } catch (err) {
    console.error("[korapay] Network error initializing charge:", err)
    return NextResponse.json({ ok: false, message: "Could not reach payment provider" }, { status: 502 })
  }

  const korapayData = await korapayRes.json()

  if (!korapayData?.status || !korapayData?.data?.checkout_url) {
    console.error("[korapay] Unexpected response:", JSON.stringify(korapayData))
    return NextResponse.json(
      { ok: false, message: korapayData?.message ?? "Payment provider error" },
      { status: 502 },
    )
  }

  const checkoutUrl = korapayData.data.checkout_url as string

  // Persist a pending deposit row so we can match the webhook later
  await db.insert(deposit).values({
    userId,
    amount: String(amt),
    reference,
    status: "pending",
    bankAccountId: null,
    assignedBankName: "Korapay",
    assignedAccountNumber: "—",
    assignedAccountName: "Online Payment",
    provider: "korapay",
  })

  return NextResponse.json({ ok: true, checkoutUrl, reference })
}
