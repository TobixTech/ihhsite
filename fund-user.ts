import { db } from "@/lib/db"
import { user, wallet, transaction } from "@/lib/db/schema"
import { eq, sql } from "drizzle-orm"

async function fundUser() {
  try {
    // Find user by email
    const [foundUser] = await db.select({ id: user.id }).from(user).where(eq(user.email, 'taddstechnology@gmail.com'))
    
    if (!foundUser) {
      console.log("❌ User not found")
      return
    }

    const userId = foundUser.id
    const amount = 1000000

    // Upsert wallet with the credit
    await db.execute(sql`
      INSERT INTO wallet ("userId", balance, "totalDeposited", "totalWithdrawn", "totalEarned", "referralEarnings", "updatedAt")
      VALUES (${userId}, ${amount}, 0, 0, ${amount}, 0, now())
      ON CONFLICT ("userId") DO UPDATE SET
        balance = wallet.balance + ${amount},
        "totalEarned" = wallet."totalEarned" + ${amount},
        "updatedAt" = now()
    `)

    // Create transaction record
    await db.insert(transaction).values({
      userId,
      type: "credit",
      amount: String(amount),
      status: "completed",
      description: "Admin fund: ₦1,000,000",
    })

    console.log(`✅ Funded taddstechnology@gmail.com (${userId}) with ₦1,000,000`)
    console.log(`   Wallet balance increased by ₦1,000,000`)
    console.log(`   Transaction record created`)
  } catch (err) {
    console.error("❌ Error:", err)
  }
}

fundUser()
