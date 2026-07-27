"use client"

import { useState, useTransition, useEffect } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowDownToLine, ArrowUpFromLine, Gift, Users, Wallet,
  Headphones, ChevronRight, LogOut, ListOrdered, ShieldCheck,
  Loader2, Clock, Copy, CheckCheck, TrendingUp, Star,
} from "lucide-react"
import { toast } from "sonner"
import { SITE, formatNaira } from "@/lib/plans"
import { getTelegramConfig } from "@/app/actions/system-config"
import type { TelegramConfig } from "@/app/actions/system-config"
import { authClient } from "@/lib/auth-client"
import { cn } from "@/lib/utils"

type Props = {
  name: string; email: string; phone: string; role: string; inviteCode: string
  balance: number; frozenBalance: number; totalDeposited: number; totalEarned: number; referralEarnings: number
}

export function ProfileView(props: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [copied, setCopied] = useState(false)
  const [tg, setTg] = useState<TelegramConfig | null>(null)

  useEffect(() => { getTelegramConfig().then(setTg) }, [])

  const initials = props.name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase() || "CX"

  const supportLink = tg?.supportUsername
    ? `https://t.me/${tg.supportUsername.replace(/^@/, "")}`
    : tg?.groupLink ?? SITE.telegramGroup

  const menuGroups = [
    {
      title: "Wallet",
      items: [
        { label: "Deposit",         icon: ArrowDownToLine, href: "/topup",       tint: "text-primary",          bg: "bg-primary/10"      },
        { label: "Withdraw",        icon: ArrowUpFromLine, href: "/withdraw",    tint: "text-success",          bg: "bg-success/10"      },
        { label: "Transactions",    icon: ListOrdered,     href: "/transactions",tint: "text-sky-400",          bg: "bg-sky-400/10"      },
        { label: "Deposit History", icon: Clock,           href: "/deposits",    tint: "text-muted-foreground", bg: "bg-surface"         },
      ],
    },
    {
      title: "Community",
      items: [
        { label: "My Team",   icon: Users,      href: "/team",       tint: "text-amber-400",        bg: "bg-amber-400/10" },
        { label: "Gift Code", icon: Gift,        href: "/gift-code", tint: "text-primary",          bg: "bg-primary/10"  },
        { label: "Support",   icon: Headphones,  href: supportLink,  tint: "text-muted-foreground", bg: "bg-surface"     },
      ],
    },
    ...(props.role === "admin"
      ? [{
          title: "Admin",
          items: [
            { label: "Admin Console", icon: ShieldCheck, href: "/admin", tint: "text-destructive", bg: "bg-destructive/10" },
          ],
        }]
      : []),
  ]

  function handleSignOut() {
    startTransition(async () => {
      await authClient.signOut()
      toast.success("Signed out")
      router.push("/")
      router.refresh()
    })
  }

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(props.inviteCode)
      setCopied(true)
      toast.success("Invite code copied")
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error("Could not copy")
    }
  }

  const stats = [
    { label: "Total Earned",    value: formatNaira(props.totalEarned),       icon: TrendingUp,    color: "text-success" },
    { label: "Referral Income", value: formatNaira(props.referralEarnings),  icon: Users,         color: "text-primary" },
    { label: "Total Deposited", value: formatNaira(props.totalDeposited),    icon: ArrowDownToLine, color: "text-sky-400" },
    { label: "Account Level",   value: props.role.charAt(0).toUpperCase() + props.role.slice(1), icon: Star, color: "text-gold" },
  ]

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-4 py-4">

      {/* Profile header */}
      <div className="flex items-center gap-4 rounded-2xl border border-border/50 bg-card p-4">
        {/* Avatar */}
        <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10">
          <span className="text-lg font-black text-primary">{initials}</span>
          {props.role === "admin" && (
            <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive">
              <ShieldCheck className="h-2.5 w-2.5 text-white" />
            </span>
          )}
        </div>
        {/* Info */}
        <div className="flex flex-1 flex-col gap-0.5 min-w-0">
          <h2 className="truncate text-base font-bold text-foreground">{props.name}</h2>
          <p className="truncate text-[11px] text-muted-foreground">{props.email}</p>
          {props.phone && (
            <p className="text-[11px] text-muted-foreground">{props.phone}</p>
          )}
        </div>
        {/* Balance pill */}
        <div className="flex flex-col items-end gap-0.5">
          <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">Balance</span>
          <span className="text-sm font-black tabular-nums text-foreground">{formatNaira(props.balance)}</span>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-2.5">
        {stats.map((s) => (
          <div key={s.label} className="flex flex-col gap-2 rounded-2xl border border-border/50 bg-card p-3.5">
            <div className={cn("flex h-7 w-7 items-center justify-center rounded-lg bg-surface")}>
              <s.icon className={cn("h-3.5 w-3.5", s.color)} />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{s.label}</p>
              <p className={cn("mt-0.5 text-sm font-black tabular-nums", s.color)}>{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Referral code card */}
      <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
        <div className="mb-2.5 flex items-center justify-between">
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Referral Code</p>
          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">
            {SITE.referralLevel1}% commission
          </span>
        </div>
        <button
          onClick={copyInvite}
          className="flex w-full items-center justify-between rounded-xl border border-primary/20 bg-background/60 px-4 py-3 transition-all hover:bg-background/80 active:scale-[0.98]"
        >
          <span className="font-black tracking-widest text-primary">{props.inviteCode}</span>
          {copied
            ? <CheckCheck className="h-4 w-4 text-success" />
            : <Copy className="h-4 w-4 text-muted-foreground" />
          }
        </button>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Share your code and earn {SITE.referralLevel1}% on every referral deposit
        </p>
      </div>

      {/* Menu groups */}
      {menuGroups.map((group) => (
        <section key={group.title}>
          <p className="mb-1.5 px-0.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            {group.title}
          </p>
          <div className="overflow-hidden rounded-2xl border border-border/50 bg-card">
            {group.items.map((item, i) => (
              <button
                key={item.label}
                onClick={() => item.href.startsWith("http") ? window.open(item.href, "_blank") : router.push(item.href)}
                className={cn(
                  "flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-surface active:bg-surface/70",
                  i !== group.items.length - 1 && "border-b border-border/40",
                )}
              >
                <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-xl", item.bg, item.tint)}>
                  <item.icon className="h-4 w-4" />
                </span>
                <span className="flex-1 text-sm font-medium text-foreground">{item.label}</span>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40" />
              </button>
            ))}
          </div>
        </section>
      ))}

      {/* Sign out */}
      <button
        onClick={handleSignOut}
        disabled={pending}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-destructive/20 bg-destructive/8 py-3.5 text-sm font-bold text-destructive transition-all hover:bg-destructive/15 disabled:opacity-60"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
        Sign Out
      </button>

      <p className="pb-2 text-center text-[10px] uppercase tracking-widest text-muted-foreground/40">
        {SITE.name} &bull; {SITE.tagline}
      </p>
    </main>
  )
}
