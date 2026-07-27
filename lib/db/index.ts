import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import * as schema from "./schema"

export const pool = new Pool({ connectionString: process.env.DATABASE_URL })
export const db = drizzle(pool, { schema })

// Lazy schema migrations — idempotent DDL that runs on every cold start.
// All CREATE TABLE IF NOT EXISTS are here so a fresh Neon DB is fully bootstrapped.
// Stored as a module-level promise; settings.ts awaits it before querying.
export const dbReady: Promise<void> = pool.query(`
  -- ── Better Auth core tables ─────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS "user" (
    id            text PRIMARY KEY,
    name          text NOT NULL,
    email         text NOT NULL UNIQUE,
    "emailVerified" boolean NOT NULL DEFAULT false,
    image         text,
    role          text NOT NULL DEFAULT 'user',
    "createdAt"   timestamp NOT NULL DEFAULT now(),
    "updatedAt"   timestamp NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS "session" (
    id          text PRIMARY KEY,
    "expiresAt" timestamp NOT NULL,
    token       text NOT NULL UNIQUE,
    "createdAt" timestamp NOT NULL DEFAULT now(),
    "updatedAt" timestamp NOT NULL DEFAULT now(),
    "ipAddress" text,
    "userAgent" text,
    "userId"    text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS "account" (
    id                       text PRIMARY KEY,
    "accountId"              text NOT NULL,
    "providerId"             text NOT NULL,
    "userId"                 text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    "accessToken"            text,
    "refreshToken"           text,
    "idToken"                text,
    "accessTokenExpiresAt"   timestamp,
    "refreshTokenExpiresAt"  timestamp,
    scope                    text,
    password                 text,
    "createdAt"              timestamp NOT NULL DEFAULT now(),
    "updatedAt"              timestamp NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS "verification" (
    id          text PRIMARY KEY,
    identifier  text NOT NULL,
    value       text NOT NULL,
    "expiresAt" timestamp NOT NULL,
    "createdAt" timestamp DEFAULT now(),
    "updatedAt" timestamp DEFAULT now()
  );

  -- ── App tables ───────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS profile (
    id                   serial PRIMARY KEY,
    "userId"             text NOT NULL UNIQUE,
    phone                text,
    "inviteCode"         text NOT NULL UNIQUE,
    "referredBy"         text,
    role                 text NOT NULL DEFAULT 'user',
    "isPromoter"         boolean NOT NULL DEFAULT false,
    "promoterCommission" integer,
    "signinBonusGiven"   boolean NOT NULL DEFAULT false,
    "savedBankName"      text,
    "savedAccountName"   text,
    "savedAccountNumber" text,
    "createdAt"          timestamp NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS wallet (
    id                serial PRIMARY KEY,
    "userId"          text NOT NULL UNIQUE,
    balance           numeric(14,2) NOT NULL DEFAULT 0,
    "totalDeposited"  numeric(14,2) NOT NULL DEFAULT 0,
    "totalWithdrawn"  numeric(14,2) NOT NULL DEFAULT 0,
    "totalEarned"     numeric(14,2) NOT NULL DEFAULT 0,
    "referralEarnings" numeric(14,2) NOT NULL DEFAULT 0,
    "updatedAt"       timestamp NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS investment (
    id              serial PRIMARY KEY,
    "userId"        text NOT NULL,
    "planId"        integer NOT NULL,
    "planName"      text NOT NULL,
    price           numeric(14,2) NOT NULL,
    "dailyEarning"  numeric(14,2) NOT NULL,
    "totalEarning"  numeric(14,2) NOT NULL,
    "durationDays"  integer NOT NULL,
    "daysPaid"      integer NOT NULL DEFAULT 0,
    "amountEarned"  numeric(14,2) NOT NULL DEFAULT 0,
    status          text NOT NULL DEFAULT 'active',
    "autoReinvest"  boolean NOT NULL DEFAULT true,
    "lastPayoutAt"  timestamp NOT NULL DEFAULT now(),
    "createdAt"     timestamp NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS "transaction" (
    id          serial PRIMARY KEY,
    "userId"    text NOT NULL,
    type        text NOT NULL,
    amount      numeric(14,2) NOT NULL,
    status      text NOT NULL DEFAULT 'completed',
    description text,
    reference   text,
    "createdAt" timestamp NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS deposit (
    id                     serial PRIMARY KEY,
    "userId"               text NOT NULL,
    amount                 numeric(14,2) NOT NULL,
    reference              text NOT NULL UNIQUE,
    status                 text NOT NULL DEFAULT 'pending',
    "bankAccountId"        integer,
    "assignedBankName"     text,
    "assignedAccountNumber" text,
    "assignedAccountName"  text,
    "senderName"           text,
    "sabussRef"            text,
    provider               text NOT NULL DEFAULT 'bank_transfer',
    "expiresAt"            timestamp,
    "createdAt"            timestamp NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS withdrawal (
    id              serial PRIMARY KEY,
    "userId"        text NOT NULL,
    amount          numeric(14,2) NOT NULL,
    charge          numeric(14,2) NOT NULL DEFAULT 0,
    "netAmount"     numeric(14,2) NOT NULL,
    "bankName"      text,
    "accountNumber" text,
    "accountName"   text,
    status          text NOT NULL DEFAULT 'pending',
    "createdAt"     timestamp NOT NULL DEFAULT now(),
    "processedAt"   timestamp
  );

  CREATE TABLE IF NOT EXISTS referral (
    id                serial PRIMARY KEY,
    "referrerId"      text NOT NULL,
    "referredId"      text NOT NULL,
    level             integer NOT NULL,
    "totalCommission" numeric(14,2) NOT NULL DEFAULT 0,
    "commissionPaid"  boolean NOT NULL DEFAULT false,
    "createdAt"       timestamp NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS daily_signin (
    id          serial PRIMARY KEY,
    "userId"    text NOT NULL,
    "signedAt"  timestamp NOT NULL DEFAULT now(),
    amount      numeric(14,2) NOT NULL DEFAULT 50
  );

  CREATE TABLE IF NOT EXISTS gift_code (
    id          serial PRIMARY KEY,
    code        text NOT NULL UNIQUE,
    amount      numeric(14,2) NOT NULL,
    "maxUses"   integer NOT NULL DEFAULT 1,
    uses        integer NOT NULL DEFAULT 0,
    active      boolean NOT NULL DEFAULT true,
    "createdAt" timestamp NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS gift_code_redemption (
    id            serial PRIMARY KEY,
    "userId"      text NOT NULL,
    "giftCodeId"  integer NOT NULL,
    code          text NOT NULL,
    amount        numeric(14,2) NOT NULL,
    "createdAt"   timestamp NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS bank_account (
    id               serial PRIMARY KEY,
    "accountNumber"  text NOT NULL UNIQUE,
    "bankName"       text NOT NULL,
    "accountName"    text NOT NULL,
    label            text,
    "isActive"       boolean NOT NULL DEFAULT true,
    weight           integer NOT NULL DEFAULT 1,
    "totalDeposits"  numeric(14,2) NOT NULL DEFAULT 0,
    "depositCount"   integer NOT NULL DEFAULT 0,
    "sabussApiKey"   text,
    "sabussSecret"   text,
    "sabussPin"      text,
    "createdAt"      timestamp NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS site_setting (
    key       text PRIMARY KEY,
    value     text NOT NULL,
    "updatedAt" timestamp NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS referral_milestone (
    id              serial PRIMARY KEY,
    "referralCount" integer NOT NULL UNIQUE,
    "rewardAmount"  numeric(14,2) NOT NULL,
    "isActive"      boolean NOT NULL DEFAULT true,
    "createdAt"     timestamp NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS milestone_claim (
    id              serial PRIMARY KEY,
    "userId"        text NOT NULL,
    "milestoneId"   integer NOT NULL,
    "referralCount" integer NOT NULL,
    "rewardAmount"  numeric(14,2) NOT NULL,
    "claimedAt"     timestamp NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS plan_slot (
    id           serial PRIMARY KEY,
    "planId"     integer NOT NULL UNIQUE,
    "totalSlots" integer,
    "soldSlots"  integer NOT NULL DEFAULT 0,
    "isActive"   boolean NOT NULL DEFAULT true,
    "updatedAt"  timestamp NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS promoter_code (
    id               serial PRIMARY KEY,
    code             text NOT NULL UNIQUE,
    label            text,
    "isActive"       boolean NOT NULL DEFAULT true,
    signups          integer NOT NULL DEFAULT 0,
    "maxSignups"     integer,
    "commissionRate" integer,
    "createdAt"      timestamp NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS system_config (
    id           serial PRIMARY KEY,
    key          text NOT NULL UNIQUE,
    value        text NOT NULL,
    "updatedAt"  timestamp NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS stake_spin (
    id            serial PRIMARY KEY,
    "userId"      text NOT NULL,
    "stakeAmount" numeric(14,2) NOT NULL,
    outcome       text NOT NULL,
    multiplier    numeric(6,3) NOT NULL,
    "winAmount"   numeric(14,2) NOT NULL,
    "createdAt"   timestamp NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS lucky_draw_slot (
    id               serial PRIMARY KEY,
    "userId"         text NOT NULL,
    source           text NOT NULL DEFAULT 'free',
    "purchaseAmount" numeric(14,2),
    "drawDate"       text NOT NULL,
    "createdAt"      timestamp NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS lucky_draw_round (
    id              serial PRIMARY KEY,
    "drawDate"      text NOT NULL UNIQUE,
    "prizePool"     numeric(14,2) NOT NULL DEFAULT 0,
    status          text NOT NULL DEFAULT 'open',
    "winner1Id"     text,
    "winner1Amount" numeric(14,2),
    "winner2Id"     text,
    "winner2Amount" numeric(14,2),
    "winner3Id"     text,
    "winner3Amount" numeric(14,2),
    "executedAt"    timestamp,
    "createdAt"     timestamp NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS lock_vault (
    id             serial PRIMARY KEY,
    "userId"       text NOT NULL,
    amount         numeric(14,2) NOT NULL,
    "lockDays"     integer NOT NULL,
    "bonusPercent" numeric(6,2) NOT NULL,
    "bonusAmount"  numeric(14,2) NOT NULL,
    status         text NOT NULL DEFAULT 'locked',
    "unlocksAt"    timestamp NOT NULL,
    "penaltyAmount" numeric(14,2),
    "createdAt"    timestamp NOT NULL DEFAULT now(),
    "completedAt"  timestamp
  );

  CREATE TABLE IF NOT EXISTS custom_plan (
    id           serial PRIMARY KEY,
    name         text NOT NULL,
    price        numeric(14,2) NOT NULL,
    daily        numeric(14,2) NOT NULL,
    "durationDays" integer NOT NULL DEFAULT 7,
    points       integer NOT NULL DEFAULT 0,
    "maxPurchases" integer,
    "isActive"   boolean NOT NULL DEFAULT false,
    "comingSoon" boolean NOT NULL DEFAULT true,
    "sortOrder"  integer NOT NULL DEFAULT 0,
    "createdAt"  timestamp NOT NULL DEFAULT now(),
    "updatedAt"  timestamp NOT NULL DEFAULT now()
  );

  -- ── Column additions (safe on DBs that already have the base tables) ────
  ALTER TABLE "user" ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'user';
  ALTER TABLE profile ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'user';
  ALTER TABLE profile ADD COLUMN IF NOT EXISTS "isPromoter" boolean NOT NULL DEFAULT false;
  ALTER TABLE profile ADD COLUMN IF NOT EXISTS "promoterCommission" integer;
  ALTER TABLE profile ADD COLUMN IF NOT EXISTS "signinBonusGiven" boolean NOT NULL DEFAULT false;
  ALTER TABLE profile ADD COLUMN IF NOT EXISTS "savedBankName" text;
  ALTER TABLE profile ADD COLUMN IF NOT EXISTS "savedAccountName" text;
  ALTER TABLE profile ADD COLUMN IF NOT EXISTS "savedAccountNumber" text;
  ALTER TABLE bank_account ADD COLUMN IF NOT EXISTS "sabussApiKey" text;
  ALTER TABLE bank_account ADD COLUMN IF NOT EXISTS "sabussSecret" text;
  ALTER TABLE bank_account ADD COLUMN IF NOT EXISTS "sabussPin" text;
  ALTER TABLE bank_account ADD COLUMN IF NOT EXISTS weight integer NOT NULL DEFAULT 1;
  ALTER TABLE bank_account ADD COLUMN IF NOT EXISTS "totalDeposits" numeric(14,2) NOT NULL DEFAULT 0;
  ALTER TABLE bank_account ADD COLUMN IF NOT EXISTS "depositCount" integer NOT NULL DEFAULT 0;
  ALTER TABLE deposit ADD COLUMN IF NOT EXISTS "sabussRef" text;
  ALTER TABLE deposit ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'bank_transfer';
  ALTER TABLE deposit ADD COLUMN IF NOT EXISTS "senderName" text;
  ALTER TABLE deposit ADD COLUMN IF NOT EXISTS "expiresAt" timestamp;
  ALTER TABLE investment ADD COLUMN IF NOT EXISTS "autoReinvest" boolean NOT NULL DEFAULT true;
  ALTER TABLE investment ADD COLUMN IF NOT EXISTS "amountEarned" numeric(14,2) NOT NULL DEFAULT 0;
  ALTER TABLE referral ADD COLUMN IF NOT EXISTS "commissionPaid" boolean NOT NULL DEFAULT false;
  ALTER TABLE referral ADD COLUMN IF NOT EXISTS "totalCommission" numeric(14,2) NOT NULL DEFAULT 0;
  ALTER TABLE withdrawal ADD COLUMN IF NOT EXISTS charge numeric(14,2) NOT NULL DEFAULT 0;
  ALTER TABLE withdrawal ADD COLUMN IF NOT EXISTS "netAmount" numeric(14,2) NOT NULL DEFAULT 0;
  ALTER TABLE daily_signin ALTER COLUMN amount SET DEFAULT 50;
`).then(() => {}).catch(() => { /* safe to ignore — tables/columns already exist or DB not connected yet */ })
