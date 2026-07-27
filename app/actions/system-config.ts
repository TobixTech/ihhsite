"use server"

import { db } from "@/lib/db"
import { systemConfig } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/session"
import type { WithdrawalCharges } from "@/lib/withdrawal"

const DEFAULT_CHARGES: WithdrawalCharges = {
  fixedFeeNaira: 100,
  percentageFee: 2,
  minWithdrawal: 500,
  minDeposit: 1000,
  minInvestment: 1000,
}

/**
 * Get current withdrawal charges from system config
 * Falls back to defaults if not set or on error
 */
export async function getWithdrawalCharges(): Promise<WithdrawalCharges> {
  try {
    const config = await db
      .select()
      .from(systemConfig)
      .where(eq(systemConfig.key, "withdrawalCharges"))
      .limit(1)

    if (config.length === 0) return DEFAULT_CHARGES
    try {
      return JSON.parse(config[0].value) as WithdrawalCharges
    } catch {
      return DEFAULT_CHARGES
    }
  } catch (err) {
    // If table doesn't exist or query fails, return defaults
    console.error("[v0] Failed to fetch withdrawal charges, using defaults:", err)
    return DEFAULT_CHARGES
  }
}

/**
 * Set withdrawal charges (admin only)
 * Updates system-wide charges that apply to all withdrawals
 */
export async function setWithdrawalCharges(charges: WithdrawalCharges) {
  try {
    await requireAdmin()

    // Validate inputs
    if (charges.fixedFeeNaira < 0 || charges.percentageFee < 0 || charges.percentageFee > 100) {
      return { ok: false, message: "Invalid charges: fees must be non-negative and percentage ≤ 100" }
    }

    // Upsert the config
    const existing = await db
      .select()
      .from(systemConfig)
      .where(eq(systemConfig.key, "withdrawalCharges"))
      .limit(1)

    if (existing.length > 0) {
      await db
        .update(systemConfig)
        .set({
          value: JSON.stringify(charges),
          updatedAt: new Date(),
        })
        .where(eq(systemConfig.key, "withdrawalCharges"))
    } else {
      await db.insert(systemConfig).values({
        key: "withdrawalCharges",
        value: JSON.stringify(charges),
      })
    }

    revalidatePath("/admin")
    return { ok: true, message: "Withdrawal charges updated" }
  } catch (err) {
    console.error("[v0] Failed to set withdrawal charges:", err)
    return { ok: false, message: "Failed to update withdrawal charges" }
  }
}

// ─── Telegram Config ───────────────────────────────────────────────────────

export type TelegramConfig = {
  groupLink: string
  channelLink: string
  supportUsername: string
}

const DEFAULT_TELEGRAM: TelegramConfig = {
  groupLink: "https://t.me/cilsupport",
  channelLink: "https://t.me/cilimited",
  supportUsername: "cilsupport",
}

export async function getTelegramConfig(): Promise<TelegramConfig> {
  try {
    const config = await db
      .select()
      .from(systemConfig)
      .where(eq(systemConfig.key, "telegramConfig"))
      .limit(1)

    if (config.length === 0) return DEFAULT_TELEGRAM
    try {
      return JSON.parse(config[0].value) as TelegramConfig
    } catch {
      return DEFAULT_TELEGRAM
    }
  } catch (err) {
    console.error("[v0] Failed to fetch telegram config, using defaults:", err)
    return DEFAULT_TELEGRAM
  }
}

export async function setTelegramConfig(config: TelegramConfig) {
  try {
    await requireAdmin()

    const existing = await db
      .select()
      .from(systemConfig)
      .where(eq(systemConfig.key, "telegramConfig"))
      .limit(1)

    if (existing.length > 0) {
      await db
        .update(systemConfig)
        .set({ value: JSON.stringify(config), updatedAt: new Date() })
        .where(eq(systemConfig.key, "telegramConfig"))
    } else {
      await db.insert(systemConfig).values({
        key: "telegramConfig",
        value: JSON.stringify(config),
      })
    }

    revalidatePath("/admin")
    return { ok: true, message: "Telegram links updated" }
  } catch (err) {
    console.error("[v0] Failed to set telegram config:", err)
    return { ok: false, message: "Failed to update Telegram links" }
  }
}
