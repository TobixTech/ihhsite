import { db, dbReady } from "@/lib/db"
import { siteSetting, bankAccount } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { SITE } from "@/lib/plans"

/** Returns true if a Postgres error is "table does not exist" (code 42P01). */
function isTableMissingError(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "42P01"
}

export const SETTING_KEYS = {
  siteFrozen: "site_frozen",               // "true" = entire site frozen for all non-admin users
  depositsPaused: "deposits_paused",
  withdrawalsPaused: "withdrawals_paused",
  // Withdrawal charge — stored in DB so admin can change it and it applies immediately
  withdrawalCharge: "withdrawal_charge_percent",  // percent e.g. "18"
  // Game config — stored in site_setting, override SITE defaults at runtime
  stakeHouseEdge: "game_stake_house_edge",       // fraction e.g. "0.70"
  stakeMin: "game_stake_min",                     // naira e.g. "500"
  stakeMax: "game_stake_max",                     // naira e.g. "50000"
  stakeMultipliers: "game_stake_multipliers",     // JSON array e.g. "[1.5,2,3]"
  luckyDrawSlotCost: "game_lucky_draw_slot_cost", // naira e.g. "200"
  vaultBonus7: "game_vault_bonus_7",              // percent e.g. "8"
  vaultBonus14: "game_vault_bonus_14",            // percent e.g. "18"
  vaultBonus30: "game_vault_bonus_30",            // percent e.g. "40"
  vaultPenalty: "game_vault_penalty",             // percent e.g. "10"
  vaultMin: "game_vault_min",                     // naira e.g. "1000"
} as const

/** Reads a single setting value, returns null if missing or table not yet created. */
export async function getSetting(key: string): Promise<string | null> {
  try {
    await dbReady
    const [row] = await db.select().from(siteSetting).where(eq(siteSetting.key, key))
    return row?.value ?? null
  } catch (err) {
    if (isTableMissingError(err)) return null
    throw err
  }
}

/** Reads a boolean setting (defaults to false if unset). */
export async function getBoolSetting(key: string): Promise<boolean> {
  const v = await getSetting(key)
  return v === "true"
}

/** Upserts a setting value. */
export async function setSetting(key: string, value: string): Promise<void> {
  await db
    .insert(siteSetting)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: siteSetting.key, set: { value, updatedAt: new Date() } })
}

/**
 * Returns live game config from the DB, falling back to SITE defaults.
 * Called by game server actions so config changes take effect immediately.
 */
export async function getGameConfig() {
  await dbReady
  let rows: { key: string; value: string }[] = []
  try {
    rows = await db.select().from(siteSetting)
  } catch (err) {
    if (!isTableMissingError(err)) throw err
  }
  const map = new Map(rows.map((r) => [r.key, r.value]))

  const g = SETTING_KEYS
  const raw = (k: string, def: string) => map.get(k) ?? def

  const withdrawalChargePct = parseFloat(raw(g.withdrawalCharge, String(SITE.withdrawalCharge)))
  const houseEdge = parseFloat(raw(g.stakeHouseEdge, String(SITE.stakeHouseEdge)))
  const stakeMin = parseInt(raw(g.stakeMin, String(SITE.stakeMin)), 10)
  const stakeMax = parseInt(raw(g.stakeMax, String(SITE.stakeMax)), 10)
  const multipliers: number[] = JSON.parse(raw(g.stakeMultipliers, JSON.stringify(SITE.stakeMultipliers)))
  const slotCost = parseInt(raw(g.luckyDrawSlotCost, String(SITE.luckyDrawSlotCost)), 10)
  const vaultBonus7 = parseFloat(raw(g.vaultBonus7, String(SITE.vaultTiers[0].bonusPercent)))
  const vaultBonus14 = parseFloat(raw(g.vaultBonus14, String(SITE.vaultTiers[1].bonusPercent)))
  const vaultBonus30 = parseFloat(raw(g.vaultBonus30, String(SITE.vaultTiers[2].bonusPercent)))
  const vaultPenalty = parseFloat(raw(g.vaultPenalty, String(SITE.vaultTiers[0].penaltyPercent)))
  const vaultMin = parseInt(raw(g.vaultMin, String(SITE.vaultMin)), 10)

  return {
    withdrawalCharge: withdrawalChargePct,
    stakeHouseEdge: houseEdge,
    stakeMin,
    stakeMax,
    stakeMultipliers: multipliers,
    luckyDrawSlotCost: slotCost,
    vaultTiers: [
      { days: 7,  bonusPercent: vaultBonus7,  penaltyPercent: vaultPenalty },
      { days: 14, bonusPercent: vaultBonus14, penaltyPercent: vaultPenalty },
      { days: 30, bonusPercent: vaultBonus30, penaltyPercent: vaultPenalty },
    ],
    vaultMin,
  }
}

/**
 * Returns the current withdrawal charge percent from DB (falls back to SITE default).
 * Called at approval time so admin changes apply to pending withdrawals immediately.
 */
export async function getLiveWithdrawalCharge(): Promise<number> {
  const v = await getSetting(SETTING_KEYS.withdrawalCharge)
  const parsed = v ? parseFloat(v) : NaN
  return isNaN(parsed) ? SITE.withdrawalCharge : parsed
}

/** Convenience: returns pause flags + site freeze state. */
export async function getPauseFlags(): Promise<{ depositsPaused: boolean; withdrawalsPaused: boolean; siteFrozen: boolean }> {
  await dbReady
  let rows: { key: string; value: string }[] = []
  try {
    rows = await db.select().from(siteSetting)
  } catch (err) {
    if (!isTableMissingError(err)) throw err
  }
  const map = new Map(rows.map((r) => [r.key, r.value]))
  return {
    siteFrozen: map.get(SETTING_KEYS.siteFrozen) === "true",
    depositsPaused: map.get(SETTING_KEYS.depositsPaused) === "true",
    withdrawalsPaused: map.get(SETTING_KEYS.withdrawalsPaused) === "true",
  }
}

/**
 * Picks an active bank account using weighted random selection.
 * Higher `weight` = higher chance of being shown. Optionally avoids
 * re-picking the same account that was used last (when more than one is active).
 */
export async function pickWeightedBankAccount(excludeId?: number) {
  const accounts = await db.select().from(bankAccount).where(eq(bankAccount.isActive, true))
  if (accounts.length === 0) return null

  let pool = accounts
  if (excludeId != null && accounts.length > 1) {
    const filtered = accounts.filter((a) => a.id !== excludeId)
    if (filtered.length > 0) pool = filtered
  }

  // Sabuss-enabled accounts (have an API key) are given 5x their base weight
  // so they are strongly preferred over manual-only accounts.
  // If ALL accounts in the pool have no Sabuss key, fallback is normal weighting.
  const hasSabuss = pool.some((a) => a.sabussApiKey)
  const effectiveWeight = (a: (typeof pool)[number]) => {
    const base = Math.max(1, a.weight ?? 1)
    return hasSabuss && a.sabussApiKey ? base * 5 : base
  }

  const totalWeight = pool.reduce((sum, a) => sum + effectiveWeight(a), 0)
  let r = Math.random() * totalWeight
  for (const acc of pool) {
    r -= effectiveWeight(acc)
    if (r <= 0) return acc
  }
  return pool[pool.length - 1]
}
