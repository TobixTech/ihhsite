import {
  pgTable,
  text,
  timestamp,
  boolean,
  serial,
  integer,
  numeric,
} from "drizzle-orm/pg-core"

// ---------- Better Auth tables ----------
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("emailVerified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expiresAt").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
})

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: timestamp("accessTokenExpiresAt"),
  refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
})

// Alias for backwards compatibility
export { user as userTable }

// ---------- App tables ----------
export const profile = pgTable("profile", {
  id: serial("id").primaryKey(),
  userId: text("userId").notNull().unique(),
  phone: text("phone"),
  inviteCode: text("inviteCode").notNull().unique(),
  referredBy: text("referredBy"),
  role: text("role").notNull().default("user"),
  isPromoter: boolean("isPromoter").notNull().default(false),
  promoterCommission: integer("promoterCommission"), // nullable – override for this user's L1 promoter rate
  signinBonusGiven: boolean("signinBonusGiven").notNull().default(false),
  savedBankName: text("savedBankName"),
  savedAccountName: text("savedAccountName"),
  savedAccountNumber: text("savedAccountNumber"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

export const wallet = pgTable("wallet", {
  id: serial("id").primaryKey(),
  userId: text("userId").notNull().unique(),
  balance: numeric("balance", { precision: 14, scale: 2 }).notNull().default("0"),
  totalDeposited: numeric("totalDeposited", { precision: 14, scale: 2 }).notNull().default("0"),
  totalWithdrawn: numeric("totalWithdrawn", { precision: 14, scale: 2 }).notNull().default("0"),
  totalEarned: numeric("totalEarned", { precision: 14, scale: 2 }).notNull().default("0"),
  referralEarnings: numeric("referralEarnings", { precision: 14, scale: 2 }).notNull().default("0"),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

export const investment = pgTable("investment", {
  id: serial("id").primaryKey(),
  userId: text("userId").notNull(),
  planId: integer("planId").notNull(),
  planName: text("planName").notNull(),
  price: numeric("price", { precision: 14, scale: 2 }).notNull(),
  dailyEarning: numeric("dailyEarning", { precision: 14, scale: 2 }).notNull(),
  totalEarning: numeric("totalEarning", { precision: 14, scale: 2 }).notNull(),
  durationDays: integer("durationDays").notNull(),
  daysPaid: integer("daysPaid").notNull().default(0),
  amountEarned: numeric("amountEarned", { precision: 14, scale: 2 }).notNull().default("0"),
  status: text("status").notNull().default("active"),
  autoReinvest: boolean("autoReinvest").notNull().default(true),
  lastPayoutAt: timestamp("lastPayoutAt").notNull().defaultNow(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

export const transaction = pgTable("transaction", {
  id: serial("id").primaryKey(),
  userId: text("userId").notNull(),
  type: text("type").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  status: text("status").notNull().default("completed"),
  description: text("description"),
  reference: text("reference"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

export const deposit = pgTable("deposit", {
  id: serial("id").primaryKey(),
  userId: text("userId").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  reference: text("reference").notNull().unique(),
  status: text("status").notNull().default("pending"),
  // Bank account assigned for this deposit
  bankAccountId: integer("bankAccountId"),
  assignedBankName: text("assignedBankName"),
  assignedAccountNumber: text("assignedAccountNumber"),
  assignedAccountName: text("assignedAccountName"),
  // Sender name for verification (optional)
  senderName: text("senderName"),
  // Sabuss's own transaction reference (e.g. 000010260606070124411111104069021)
  // stored when the webhook arrives — used to query Sabuss by their reference
  sabussRef: text("sabussRef"),
  // Payment provider: 'bank_transfer' | 'korapay' | 'sabuss' — helps admin filter
  provider: text("provider").notNull().default("bank_transfer"),
  expiresAt: timestamp("expiresAt"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

export const withdrawal = pgTable("withdrawal", {
  id: serial("id").primaryKey(),
  userId: text("userId").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  charge: numeric("charge", { precision: 14, scale: 2 }).notNull().default("0"),
  netAmount: numeric("netAmount", { precision: 14, scale: 2 }).notNull(),
  bankName: text("bankName"),
  accountNumber: text("accountNumber"),
  accountName: text("accountName"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  processedAt: timestamp("processedAt"),
})

export const referral = pgTable("referral", {
  id: serial("id").primaryKey(),
  referrerId: text("referrerId").notNull(),
  referredId: text("referredId").notNull(),
  level: integer("level").notNull(),
  totalCommission: numeric("totalCommission", { precision: 14, scale: 2 }).notNull().default("0"),
  // Prevents the one-time commission from being paid more than once.
  commissionPaid: boolean("commissionPaid").notNull().default(false),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

export const dailySignin = pgTable("daily_signin", {
  id: serial("id").primaryKey(),
  userId: text("userId").notNull(),
  signedAt: timestamp("signedAt").notNull().defaultNow(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull().default("100"),
})

export const giftCode = pgTable("gift_code", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  maxUses: integer("maxUses").notNull().default(1),
  uses: integer("uses").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

export const giftCodeRedemption = pgTable("gift_code_redemption", {
  id: serial("id").primaryKey(),
  userId: text("userId").notNull(),
  giftCodeId: integer("giftCodeId").notNull(),
  code: text("code").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

// Bank accounts pool for rotating deposit accounts
export const bankAccount = pgTable("bank_account", {
  id: serial("id").primaryKey(),
  accountNumber: text("accountNumber").notNull().unique(),
  bankName: text("bankName").notNull(),
  accountName: text("accountName").notNull(),
  label: text("label"),
  isActive: boolean("isActive").notNull().default(true),
  // Relative display weight. Higher = shown more often (weighted random).
  weight: integer("weight").notNull().default(1),
  totalDeposits: numeric("totalDeposits", { precision: 14, scale: 2 }).notNull().default("0"),
  depositCount: integer("depositCount").notNull().default(0),
  // Sabuss VTU API — each account can have its own API key for auto-detection
  // sabussApiKey: used to query transactions via Sabuss API
  // sabussSecret: optional shared secret to verify webhook payloads
  sabussApiKey: text("sabussApiKey"),
  sabussSecret: text("sabussSecret"),
  sabussPin: text("sabussPin"), // Transaction PIN required by Sabuss query API
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

// Global key/value settings (e.g. deposits_paused, withdrawals_paused)
export const siteSetting = pgTable("site_setting", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

// Referral milestones - rewards for referring X number of people
export const referralMilestone = pgTable("referral_milestone", {
  id: serial("id").primaryKey(),
  referralCount: integer("referralCount").notNull().unique(),
  rewardAmount: numeric("rewardAmount", { precision: 14, scale: 2 }).notNull(),
  isActive: boolean("isActive").notNull().default(true),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

// Track which milestones users have claimed
export const milestoneClaim = pgTable("milestone_claim", {
  id: serial("id").primaryKey(),
  userId: text("userId").notNull(),
  milestoneId: integer("milestoneId").notNull(),
  referralCount: integer("referralCount").notNull(),
  rewardAmount: numeric("rewardAmount", { precision: 14, scale: 2 }).notNull(),
  claimedAt: timestamp("claimedAt").notNull().defaultNow(),
})

// Admin-created promoter codes. Anyone registering with one of these codes
// is automatically tagged as a promoter.
// ── Games ──────────────────────────────────────────────────────────────────

// Stake & Spin: single-round bet, resolved immediately
export const stakeSpin = pgTable("stake_spin", {
  id: serial("id").primaryKey(),
  userId: text("userId").notNull(),
  stakeAmount: numeric("stakeAmount", { precision: 14, scale: 2 }).notNull(),
  outcome: text("outcome").notNull(), // "win" | "lose"
  multiplier: numeric("multiplier", { precision: 6, scale: 3 }).notNull(),
  winAmount: numeric("winAmount", { precision: 14, scale: 2 }).notNull(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

// Lucky Draw: one slot = one ticket for today's draw
export const luckyDrawSlot = pgTable("lucky_draw_slot", {
  id: serial("id").primaryKey(),
  userId: text("userId").notNull(),
  source: text("source").notNull().default("free"), // "free" | "purchased"
  purchaseAmount: numeric("purchaseAmount", { precision: 14, scale: 2 }),
  drawDate: text("drawDate").notNull(), // "YYYY-MM-DD"
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

// Lucky Draw: one round per day, admin triggers the draw
export const luckyDrawRound = pgTable("lucky_draw_round", {
  id: serial("id").primaryKey(),
  drawDate: text("drawDate").notNull().unique(), // "YYYY-MM-DD"
  prizePool: numeric("prizePool", { precision: 14, scale: 2 }).notNull().default("0"),
  status: text("status").notNull().default("open"), // "open" | "drawn"
  winner1Id: text("winner1Id"),
  winner1Amount: numeric("winner1Amount", { precision: 14, scale: 2 }),
  winner2Id: text("winner2Id"),
  winner2Amount: numeric("winner2Amount", { precision: 14, scale: 2 }),
  winner3Id: text("winner3Id"),
  winner3Amount: numeric("winner3Amount", { precision: 14, scale: 2 }),
  executedAt: timestamp("executedAt"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

// Lock Vault: time-locked savings with a bonus on maturity
export const lockVault = pgTable("lock_vault", {
  id: serial("id").primaryKey(),
  userId: text("userId").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  lockDays: integer("lockDays").notNull(),
  bonusPercent: numeric("bonusPercent", { precision: 6, scale: 2 }).notNull(),
  bonusAmount: numeric("bonusAmount", { precision: 14, scale: 2 }).notNull(),
  status: text("status").notNull().default("locked"), // "locked" | "completed" | "broken"
  unlocksAt: timestamp("unlocksAt").notNull(),
  penaltyAmount: numeric("penaltyAmount", { precision: 14, scale: 2 }),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  completedAt: timestamp("completedAt"),
})

// Per-plan slot control — admin sets totalSlots, system tracks soldSlots.
// When soldSlots >= totalSlots the plan shows as "Sold Out" and cannot be purchased.
// planId maps to PLANS[].id. A null totalSlots means unlimited (default).
export const planSlot = pgTable("plan_slot", {
  id: serial("id").primaryKey(),
  planId: integer("planId").notNull().unique(),
  totalSlots: integer("totalSlots"),          // null = unlimited
  soldSlots: integer("soldSlots").notNull().default(0),
  isActive: boolean("isActive").notNull().default(true),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

export const promoterCode = pgTable("promoter_code", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  label: text("label"),
  isActive: boolean("isActive").notNull().default(true),
  signups: integer("signups").notNull().default(0),
  maxSignups: integer("maxSignups"),       // null = unlimited
  commissionRate: integer("commissionRate"), // null = use SITE.promoterLevel1 default
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

// Admin-managed dynamic packages. These augment (not replace) the static PLANS array.
// id starts at 100 to avoid collision with static plan ids (1-20).
export const customPlan = pgTable("custom_plan", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  price: numeric("price", { precision: 14, scale: 2 }).notNull(),
  daily: numeric("daily", { precision: 14, scale: 2 }).notNull(),
  durationDays: integer("durationDays").notNull().default(7),
  points: integer("points").notNull().default(0),
  maxPurchases: integer("maxPurchases"),          // null = unlimited
  isActive: boolean("isActive").notNull().default(false), // false = coming soon
  comingSoon: boolean("comingSoon").notNull().default(true),
  sortOrder: integer("sortOrder").notNull().default(0),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

// System config — stores platform-wide settings like withdrawal charges
export const systemConfig = pgTable("system_config", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(), // "withdrawalCharges", etc
  value: text("value").notNull(), // JSON string for complex values
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})
