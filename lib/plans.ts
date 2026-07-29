export type Plan = {
  id: number
  name: string
  price: number | string
  daily: number | string
  total?: number | string
  durationDays: number
  points?: number
  popular?: boolean
  soldOut?: boolean       // legacy plans — hidden from products page
  maxPurchases?: number   // max times a single user can buy this plan
  comingSoon?: boolean    // shows Coming Soon badge, blocks purchase
  isActive?: boolean      // for custom plans from DB
}

// Tier labels — grouped by exchange phase
export const PLAN_TIERS: Record<number, { phase: string; label: string; color: string }> = {
  // Legacy plans (soldOut) — kept for existing investment display
  1:  { phase: 'Foundation', label: 'F-01', color: 'text-stone-400' },
  2:  { phase: 'Foundation', label: 'F-02', color: 'text-stone-400' },
  3:  { phase: 'Foundation', label: 'F-03', color: 'text-stone-400' },
  4:  { phase: 'Structure',  label: 'S-01', color: 'text-primary' },
  5:  { phase: 'Structure',  label: 'S-02', color: 'text-primary' },
  6:  { phase: 'Structure',  label: 'S-03', color: 'text-primary' },
  7:  { phase: 'Framework',  label: 'FW-01', color: 'text-sky-400' },
  8:  { phase: 'Framework',  label: 'FW-02', color: 'text-sky-400' },
  9:  { phase: 'Framework',  label: 'FW-03', color: 'text-sky-400' },
  // Active packages
  10: { phase: 'Starter', label: 'STR-1', color: 'text-primary' },
  11: { phase: 'Starter', label: 'STR-2', color: 'text-primary' },
  12: { phase: 'Starter', label: 'STR-3', color: 'text-primary' },
  13: { phase: 'Growth',  label: 'GRW-1', color: 'text-sky-400' },
  14: { phase: 'Growth',  label: 'GRW-2', color: 'text-sky-400' },
  15: { phase: 'Growth',  label: 'GRW-3', color: 'text-sky-400' },
  16: { phase: 'Core',    label: 'PRO',   color: 'text-amber-400' },
  // Coming soon packages
  17: { phase: 'Elite', label: 'ELT-1', color: 'text-amber-400' },
  18: { phase: 'Elite', label: 'ELT-2', color: 'text-amber-400' },
  19: { phase: 'Elite', label: 'ELT-3', color: 'text-amber-400' },
  20: { phase: 'Elite', label: 'ELT-4', color: 'text-amber-400' },
}

// All new plans run 15 days. Daily rate = 22% of investment price.
// Total = daily × 15
export const PLANS: Plan[] = [
  // ── Legacy plans (soldOut) — retained for existing investor records ──
  { id: 1,  name: 'Foundation F-01', price: 3000,   daily: 630,    total: 56700,    durationDays: 90, soldOut: true },
  { id: 2,  name: 'Foundation F-02', price: 6500,   daily: 1365,   total: 122850,   durationDays: 90, soldOut: true },
  { id: 3,  name: 'Foundation F-03', price: 10000,  daily: 2100,   total: 189000,   durationDays: 90, soldOut: true },
  { id: 4,  name: 'Structure S-01',  price: 15000,  daily: 3150,   total: 283500,   durationDays: 90, soldOut: true },
  { id: 5,  name: 'Structure S-02',  price: 20000,  daily: 4200,   total: 378000,   durationDays: 90, soldOut: true },
  { id: 6,  name: 'Structure S-03',  price: 30000,  daily: 6300,   total: 567000,   durationDays: 90, soldOut: true },
  { id: 7,  name: 'Framework FW-01', price: 50000,  daily: 10500,  total: 945000,   durationDays: 90, soldOut: true },
  { id: 8,  name: 'Framework FW-02', price: 80000,  daily: 16800,  total: 1512000,  durationDays: 90, soldOut: true },
  { id: 9,  name: 'Framework FW-03', price: 100000, daily: 21000,  total: 1890000,  durationDays: 90, soldOut: true },
  // ── Active packages (15 days) ──
  { id: 10, name: 'Nano',  price: 1000, daily: 220,  total: 3300,  durationDays: 15, points: 50,  maxPurchases: 5 },
  { id: 11, name: 'Micro', price: 1500, daily: 330,  total: 4950,  durationDays: 15, points: 75,  maxPurchases: 5 },
  { id: 12, name: 'Spark', price: 2000, daily: 440,  total: 6600,  durationDays: 15, points: 100, maxPurchases: 5 },
  { id: 13, name: 'Boost', price: 3000, daily: 660,  total: 9900,  durationDays: 15, points: 140, maxPurchases: 5 },
  { id: 14, name: 'Pulse', price: 4000, daily: 880,  total: 13200, durationDays: 15, points: 180, maxPurchases: 5 },
  { id: 15, name: 'Flow',  price: 5000, daily: 1100, total: 16500, durationDays: 15, points: 220, maxPurchases: 5 },
  { id: 16, name: 'Core',  price: 7500, daily: 1700, total: 25500, durationDays: 15, points: 300, maxPurchases: 5, popular: true },
  // ── Coming soon packages ──
  { id: 17, name: 'Surge', price: 10000, daily: 0, total: 0, durationDays: 15, comingSoon: true },
  { id: 18, name: 'Prime', price: 15000, daily: 0, total: 0, durationDays: 15, comingSoon: true },
  { id: 19, name: 'Apex',  price: 20000, daily: 0, total: 0, durationDays: 15, comingSoon: true },
  { id: 20, name: 'Elite', price: 50000, daily: 0, total: 0, durationDays: 15, comingSoon: true },
]

export const SITE = {
  name: 'Crox Exchange',
  short: 'Crox',
  tagline: 'Trade · Earn · Grow',
  packageCount: 11,          // 7 active + 4 coming soon
  signInBonus: 50,
  welcomeBonus: 100,
  investmentBonusPercent: 1,
  minWithdrawal: 500,
  minDeposit: 1000,
  withdrawalCharge: 18,
  referralLevel1: 21,
  referralLevel2: 3,
  promoterLevel1: 30,
  withdrawalHours: '9 AM – 5 PM',
  withdrawalProcessingTime: '0 – 1 hour',
  inviteCode: 'CILXQ7',
  telegramGroup: 'https://t.me/cilsupport',
  telegramChannel: 'https://t.me/cilimited',
  telegramSupport: 'cilsupport',
  paymentExpiryMinutes: 30,

  // Stake & Spin
  stakeMin: 500,
  stakeMax: 50000,
  // House win probability as a fraction (0.70 = 70% chance user loses)
  stakeHouseEdge: 0.70,
  // Multipliers applied to stake on win
  stakeMultipliers: [1.5, 1.8, 2.0, 2.5, 3.0] as number[],

  // Lucky Draw
  luckyDrawSlotCost: 200,
  luckyDrawFreePerInvestment: 1,
  luckyDrawPrizeShares: [0.5, 0.3, 0.2] as number[],

  // Lock Vault tiers: { days, bonusPercent, earlyPenaltyPercent }
  vaultTiers: [
    { days: 7,  bonusPercent: 8,  penaltyPercent: 10 },
    { days: 14, bonusPercent: 18, penaltyPercent: 10 },
    { days: 30, bonusPercent: 40, penaltyPercent: 10 },
  ] as { days: number; bonusPercent: number; penaltyPercent: number }[],
  vaultMin: 1000,

  // Feature flags (admin can toggle via site_settings table)
  features: {
    stakeAndSpin: true,
    luckyDraw: true,
    lockVault: true,
    flashMissions: false,
    referralRace: false,
  },
}

export function formatNaira(value: number | string | undefined): string {
  if (value === undefined || value === null || value === '') return '₦0'
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return '₦0'
  return '₦' + num.toLocaleString('en-NG')
}
