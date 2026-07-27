"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Lock, Clock, Zap, ArrowRight } from "lucide-react"
import { toast } from "sonner"
import { type Plan, PLAN_TIERS, formatNaira } from "@/lib/plans"
import { buyPlan } from "@/app/actions/investments"
import { cn } from "@/lib/utils"

export type SlotInfo = {
  planId: number
  totalSlots: number | null
  soldSlots: number
  isActive: boolean
}

// Accent color per tier phase
const PHASE_ACCENT: Record<string, { dot: string; text: string; bg: string; border: string; btn: string }> = {
  Foundation: { dot: "bg-slate-400",  text: "text-slate-400",  bg: "bg-slate-400/10",  border: "border-slate-400/20",  btn: "bg-slate-500/20 text-slate-300 hover:bg-slate-500/30" },
  Structure:  { dot: "bg-primary",    text: "text-primary",    bg: "bg-primary/10",    border: "border-primary/20",    btn: "bg-primary text-primary-foreground hover:bg-primary/90" },
  Framework:  { dot: "bg-sky-400",    text: "text-sky-400",    bg: "bg-sky-400/10",    border: "border-sky-400/20",    btn: "bg-sky-500/20 text-sky-300 hover:bg-sky-500/30" },
  Starter:    { dot: "bg-primary",    text: "text-primary",    bg: "bg-primary/10",    border: "border-primary/20",    btn: "bg-primary text-primary-foreground hover:bg-primary/90" },
  Growth:     { dot: "bg-sky-400",    text: "text-sky-400",    bg: "bg-sky-400/10",    border: "border-sky-400/20",    btn: "bg-sky-500 text-white hover:bg-sky-600" },
  Core:       { dot: "bg-gold",       text: "text-gold",       bg: "bg-gold/10",       border: "border-gold/25",       btn: "bg-gold text-background hover:bg-gold/90" },
  Elite:      { dot: "bg-indigo-400", text: "text-indigo-400", bg: "bg-indigo-400/10", border: "border-indigo-400/20", btn: "bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30" },
  Skyline:    { dot: "bg-amber-400",  text: "text-amber-400",  bg: "bg-amber-400/10",  border: "border-amber-400/20",  btn: "bg-amber-500/20 text-amber-300 hover:bg-amber-500/30" },
}

const DEFAULT_ACCENT = PHASE_ACCENT.Starter

export function PlanCard({ plan, slot }: { plan: Plan; slot?: SlotInfo }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const tier = PLAN_TIERS[plan.id]
  const acc = PHASE_ACCENT[tier?.phase ?? "Starter"] ?? DEFAULT_ACCENT

  const isSoldOut = slot
    ? (!slot.isActive || (slot.totalSlots !== null && slot.soldSlots >= slot.totalSlots))
    : false
  const isComingSoon = !!plan.comingSoon
  const isDisabled = isSoldOut || isComingSoon

  const roi = plan.price > 0 && plan.total > 0
    ? Math.round(((plan.total - plan.price) / plan.price) * 100)
    : 0

  function handleBuy() {
    startTransition(async () => {
      const res = await buyPlan(plan.id, {})
      if (res.ok) {
        toast.success(res.message)
        router.refresh()
      } else {
        toast.error(res.message)
        if (res.message.toLowerCase().includes("insufficient")) router.push(`/topup?plan=${plan.id}`)
      }
    })
  }

  return (
    <article className={cn(
      "group relative overflow-hidden rounded-2xl border bg-card transition-all duration-200",
      isDisabled ? "border-border/40 opacity-75" : cn("border-border/60 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5"),
    )}>
      {/* Left accent bar */}
      <div className={cn("absolute left-0 top-0 h-full w-0.5", acc.dot)} />

      <div className="flex items-center gap-3 p-4 pl-5">
        {/* Plan icon / identifier */}
        <div className={cn("flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-xl border text-center", acc.bg, acc.border)}>
          <span className={cn("text-[9px] font-bold uppercase leading-none tracking-wide", acc.text)}>
            {tier?.phase?.slice(0, 3) ?? "PKG"}
          </span>
          <span className={cn("mt-0.5 text-base font-black leading-none", acc.text)}>
            {plan.name.slice(0, 2)}
          </span>
        </div>

        {/* Plan info */}
        <div className="flex flex-1 flex-col gap-0.5 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-bold text-foreground">{plan.name}</span>
            {plan.popular && !isDisabled && (
              <span className="flex items-center gap-0.5 rounded-full bg-gold/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-gold">
                <Zap className="h-2.5 w-2.5" /> Hot
              </span>
            )}
            {isComingSoon && (
              <span className="flex items-center gap-0.5 rounded-full border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-primary">
                <Clock className="h-2.5 w-2.5" /> Soon
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="font-semibold text-foreground">{formatNaira(plan.price)}</span>
            <span className="opacity-40">·</span>
            {isComingSoon ? (
              <span>Details coming soon</span>
            ) : (
              <>
                <span className="font-semibold text-success">{formatNaira(plan.daily)}/day</span>
                <span className="opacity-40">·</span>
                <span>{roi}% ROI</span>
              </>
            )}
          </div>
        </div>

        {/* Right: action */}
        <div className="shrink-0">
          {isSoldOut ? (
            <div className="flex items-center gap-1 rounded-lg border border-border/40 px-2.5 py-1.5 text-[11px] font-semibold text-muted-foreground">
              <Lock className="h-3 w-3" /> Sold Out
            </div>
          ) : isComingSoon ? (
            <div className="flex items-center gap-1 rounded-lg border border-primary/20 bg-primary/10 px-2.5 py-1.5 text-[11px] font-semibold text-primary">
              <Clock className="h-3 w-3" /> Soon
            </div>
          ) : (
            <button
              onClick={handleBuy}
              disabled={pending}
              className={cn(
                "flex items-center gap-1 rounded-xl px-3.5 py-2 text-xs font-bold transition-all active:scale-95 disabled:opacity-60",
                acc.btn,
              )}
            >
              {pending
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <><span>Buy</span><ArrowRight className="h-3 w-3" /></>
              }
            </button>
          )}
        </div>
      </div>

      {/* Bottom stat strip — only for active plans */}
      {!isComingSoon && !isSoldOut && (
        <div className={cn("flex items-center gap-3 border-t px-5 py-2", acc.border)}>
          <StatChip label="Daily" value={formatNaira(plan.daily)} accent={acc.text} />
          <div className="h-3 w-px bg-border/60" />
          <StatChip label="Total" value={formatNaira(plan.total)} accent={acc.text} highlight />
          <div className="h-3 w-px bg-border/60" />
          <StatChip label="Days" value={`${plan.durationDays}d`} />
          {plan.maxPurchases && (
            <>
              <div className="h-3 w-px bg-border/60" />
              <StatChip label="Max" value={`${plan.maxPurchases}x`} />
            </>
          )}
        </div>
      )}
    </article>
  )
}

function StatChip({ label, value, accent, highlight }: {
  label: string; value: string; accent?: string; highlight?: boolean
}) {
  return (
    <div className="flex flex-col items-start">
      <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className={cn("text-[11px] font-black tabular-nums", highlight && accent ? accent : "text-foreground")}>
        {value}
      </span>
    </div>
  )
}
