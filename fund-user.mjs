import { neon } from "@neondatabase/serverless";
import "dotenv/config";

const sql = neon(process.env.DATABASE_URL);

async function fundUser() {
  // Find user by email
  const user = await sql`SELECT id FROM "user" WHERE email = ${'taddstechnology@gmail.com'} LIMIT 1`;
  
  if (!user || user.length === 0) {
    console.log("❌ User not found");
    return;
  }

  const userId = user[0].id;
  const amount = 1000000;

  // Upsert wallet with the credit
  await sql`
    INSERT INTO wallet (
      "userId", balance, "totalDeposited", "totalWithdrawn", "totalEarned", "referralEarnings", "updatedAt"
    ) VALUES (
      ${userId}, ${amount}, 0, 0, ${amount}, 0, now()
    )
    ON CONFLICT ("userId") DO UPDATE SET
      balance = wallet.balance + ${amount},
      "totalEarned" = wallet."totalEarned" + ${amount},
      "updatedAt" = now()
  `;

  // Create transaction record
  await sql`
    INSERT INTO transaction (
      "userId", type, amount, description, status, "createdAt"
    ) VALUES (
      ${userId}, 'credit', ${String(amount)}, 'Admin fund: ₦1,000,000', 'completed', now()
    )
  `;

  console.log(`✅ Funded taddstechnology@gmail.com (${userId}) with ₦1,000,000`);
  console.log(`   Wallet balance increased by ₦1,000,000`);
  console.log(`   Transaction record created`);
}

fundUser().catch(console.error);
