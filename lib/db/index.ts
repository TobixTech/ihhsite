import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import * as schema from "./schema"

export const pool = new Pool({ connectionString: process.env.DATABASE_URL })
export const db = drizzle(pool, { schema })

// Lazy schema migrations — idempotent DDL that runs on every cold start.
// Stored as a promise so callers can await it before issuing queries.
export const dbReady: Promise<void> = pool.query(`
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

  ALTER TABLE bank_account ADD COLUMN IF NOT EXISTS "sabussPin" text;
  ALTER TABLE deposit ADD COLUMN IF NOT EXISTS "sabussRef" text;
  ALTER TABLE deposit ADD COLUMN IF NOT EXISTS "provider" text NOT NULL DEFAULT 'bank_transfer';
  ALTER TABLE daily_signin ALTER COLUMN amount SET DEFAULT 50;
`).then(() => {}).catch(() => { /* safe to ignore — tables/columns already exist or DB not connected yet */ })
