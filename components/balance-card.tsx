'use client'

import { useState } from 'react'
import { Eye, EyeOff, TrendingUp, ArrowDownToLine, ArrowUpFromLine, Wallet } from 'lucide-react'
import { formatNaira } from '@/lib/plans'
import { useRouter } from 'next/navigation'

export function BalanceCard({ balance, todayIncome }: { balance: number; todayIncome: number }) {
  const [show, setShow] = useState(true)
  const router = useRouter()

  return (
    <section className="relative overflow-hidden rounded-2xl border border-primary/20 bg-card">
      {/* Top electric-blue glow strip */}
      <div className="h-0.5 w-full bg-gradient-to-r from-transparent via-primary to-transparent opacity-60" />

      {/* Ambient glow */}
      <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary/8 blur-3xl" />

      <div className="relative p-5">
        {/* Header row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15">
              <Wallet className="h-3.5 w-3.5 text-primary" />
            </div>
            <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
              Available Balance
            </p>
          </div>
          <button
            onClick={() => setShow((s) => !s)}
            aria-label={show ? 'Hide balance' : 'Show balance'}
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-surface text-muted-foreground transition-colors hover:text-foreground"
          >
            {show ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          </button>
        </div>

        {/* Balance amount */}
        <div className="mt-3">
          <p className="text-4xl font-black tabular-nums tracking-tight text-foreground">
            {show ? formatNaira(balance) : '₦ ••••••'}
          </p>
          <div className="mt-1.5 flex items-center gap-1.5">
            <div className="flex items-center gap-1 rounded-full bg-success/12 px-2 py-0.5">
              <TrendingUp className="h-3 w-3 text-success" />
              <span className="text-[11px] font-bold text-success">
                {show ? `+${formatNaira(todayIncome)}` : '+₦ •••'} today
              </span>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="my-4 h-px bg-border/40" />

        {/* Action buttons */}
        <div className="flex gap-2.5">
          <button
            onClick={() => router.push('/topup')}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.97]"
          >
            <ArrowDownToLine className="h-4 w-4" />
            Deposit
          </button>
          <button
            onClick={() => router.push('/withdraw')}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-border/60 bg-surface py-3 text-sm font-bold text-foreground transition-all hover:bg-surface/80 active:scale-[0.97]"
          >
            <ArrowUpFromLine className="h-4 w-4" />
            Withdraw
          </button>
        </div>
      </div>
    </section>
  )
}
