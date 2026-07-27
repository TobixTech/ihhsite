'use client'

import { Suspense, useState, useTransition, useEffect } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import {
  ArrowLeft, ShieldCheck, Wallet, Loader2, Copy, Check,
  User, Clock, AlertTriangle, RotateCcw, CreditCard, Building2,
} from 'lucide-react'
import { toast } from 'sonner'
import { AppHeader } from '@/components/app-header'
import { BottomNav } from '@/components/bottom-nav'
import { PLANS, SITE, formatNaira } from '@/lib/plans'
import { startDeposit, updateDepositSenderName, markDepositAsPaid } from '@/app/actions/deposit'
import { getWithdrawalCharges } from '@/app/actions/system-config'
import { cn } from '@/lib/utils'

const QUICK_AMOUNTS = [1000, 2000, 3000, 5000, 7500, 10000, 15000, 20000, 50000]

type BankAccountInfo = {
  bankName: string
  accountNumber: string
  accountName: string
}

type PaymentMethod = 'korapay' | 'bank_transfer'

function TopupContent() {
  const params = useSearchParams()
  const router = useRouter()
  const planId = Number(params.get('plan'))
  const presetPlan = PLANS.find((p) => p.id === planId)

  const [selected, setSelected] = useState<number | null>(presetPlan?.price ?? null)
  const [custom, setCustom] = useState('')
  const [step, setStep] = useState<'amount' | 'confirm' | 'unavailable'>('amount')
  const [payMethod, setPayMethod] = useState<PaymentMethod>('korapay')
  const [depositRef, setDepositRef] = useState<string | null>(null)
  const [bankAccount, setBankAccount] = useState<BankAccountInfo | null>(null)
  const [expiryTime, setExpiryTime] = useState<Date | null>(null)
  const [copied, setCopied] = useState(false)
  const [senderName, setSenderName] = useState('')
  const [savingSenderName, setSavingSenderName] = useState(false)
  const [markingPaid, setMarkingPaid] = useState(false)
  const [liveMinDeposit, setLiveMinDeposit] = useState(SITE.minDeposit)

  useEffect(() => {
    getWithdrawalCharges().then((c) => {
      if (c.minDeposit) setLiveMinDeposit(c.minDeposit)
    })
  }, [])

  const customValue = Number(custom)
  const amount = custom ? customValue : selected ?? 0
  const valid = amount >= liveMinDeposit
  const [pending, startTransition] = useTransition()

  // ── Korapay checkout ─────────────────────────────────────────────────────────
  function handleKorapay() {
    if (!valid) return
    startTransition(async () => {
      try {
        const res = await fetch('/api/korapay/initialize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount }),
        })
        const data = await res.json()
        if (data.ok && data.checkoutUrl) {
          // Open Korapay checkout in the current tab
          window.location.href = data.checkoutUrl
        } else {
          toast.error(data.message ?? 'Could not start payment. Please try again.')
        }
      } catch {
        toast.error('Network error. Please try again.')
      }
    })
  }

  // ── Bank transfer ─────────────────────────────────────────────────────────────
  function handleProceed() {
    if (!valid) return
    startTransition(async () => {
      const res = await startDeposit(amount)
      if (res.ok && res.reference && res.bankAccount) {
        setDepositRef(res.reference)
        setBankAccount(res.bankAccount)
        setExpiryTime(res.expiresAt ? new Date(res.expiresAt) : null)
        setStep('confirm')
      } else if ('unavailable' in res && res.unavailable) {
        setStep('unavailable')
      } else {
        toast.error(res.message ?? 'Could not submit deposit request')
      }
    })
  }

  function handleSubmit() {
    if (payMethod === 'korapay') {
      handleKorapay()
    } else {
      handleProceed()
    }
  }

  function handleRetry() {
    startTransition(async () => {
      const res = await startDeposit(amount)
      if (res.ok && res.reference && res.bankAccount) {
        setDepositRef(res.reference)
        setBankAccount(res.bankAccount)
        setExpiryTime(res.expiresAt ? new Date(res.expiresAt) : null)
        setStep('confirm')
      } else {
        setStep('unavailable')
      }
    })
  }

  function handleCopyAccount() {
    if (!bankAccount) return
    navigator.clipboard.writeText(bankAccount.accountNumber)
    setCopied(true)
    toast.success('Account number copied!')
    setTimeout(() => setCopied(false), 2000)
  }

  function handleBack() {
    setStep('amount')
    setDepositRef(null)
    setBankAccount(null)
    setExpiryTime(null)
    setSenderName('')
  }

  async function handleSaveSenderName() {
    if (!depositRef || !senderName.trim()) return
    setSavingSenderName(true)
    const res = await updateDepositSenderName(depositRef, senderName)
    setSavingSenderName(false)
    if (res.ok) {
      toast.success('Sender name saved')
    } else {
      toast.error(res.message ?? 'Failed to save sender name')
    }
  }

  async function handleMarkAsPaid() {
    if (!depositRef) return
    setMarkingPaid(true)
    if (senderName.trim()) {
      await updateDepositSenderName(depositRef, senderName)
    }
    const res = await markDepositAsPaid(depositRef)
    if (res.ok) {
      toast.success('Payment marked as complete')
      router.push(`/deposits/${depositRef}`)
    } else {
      toast.error(res.message ?? 'Failed to mark as paid')
      setMarkingPaid(false)
    }
  }

  function formatExpiry(date: Date) {
    return date.toLocaleString('en-NG', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: true,
    })
  }

  // ── Unavailable ───────────────────────────────────────────────────────────────
  if (step === 'unavailable') {
    return (
      <main className="mx-auto flex max-w-md flex-col">
        <div className="flex items-center gap-3 bg-card px-4 py-4">
          <button
            onClick={() => setStep('amount')}
            aria-label="Back"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-foreground"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="flex-1 text-center text-lg font-bold">Payment Details</h1>
          <div className="w-10" />
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 py-16 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-8 w-8 text-destructive" />
          </span>
          <div className="flex flex-col gap-2">
            <h2 className="text-xl font-bold">Service Unavailable</h2>
            <p className="text-sm text-muted-foreground">
              We couldn&apos;t process your payment right now. Please try again in a moment.
            </p>
          </div>
          <button
            onClick={handleRetry}
            disabled={pending}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-4 text-base font-bold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <RotateCcw className="h-5 w-5" />}
            Try Again
          </button>
        </div>
      </main>
    )
  }

  // ── Bank transfer confirm ─────────────────────────────────────────────────────
  if (step === 'confirm' && bankAccount) {
    return (
      <main className="mx-auto flex max-w-md flex-col gap-0">
        <div className="flex items-center gap-3 border-b border-border/60 bg-card px-4 py-3.5">
          <button
            onClick={handleBack}
            aria-label="Back"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-border/60 bg-secondary/60 text-muted-foreground transition-all hover:text-foreground active:scale-95"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex-1">
            <h1 className="text-base font-bold">Bank Transfer Details</h1>
            <p className="text-[11px] text-muted-foreground">Transfer funds to the account below</p>
          </div>
          <span className="rounded-xl border border-primary/25 bg-primary/10 px-3 py-1.5 text-sm font-bold text-primary tabular-nums">
            {formatNaira(amount)}
          </span>
        </div>

        <div className="flex flex-col gap-3 bg-background p-4">
          <div className="flex items-start gap-3 rounded-xl border border-amber-400/25 bg-amber-400/8 px-3.5 py-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <p className="text-xs leading-relaxed text-foreground/80">
              Send <span className="font-bold text-foreground">exactly {formatNaira(amount)}</span>. A different amount may delay or fail verification.
            </p>
          </div>

          <div className="overflow-hidden rounded-2xl border border-border/60 bg-card">
            {[
              { label: 'Bank', value: bankAccount.bankName },
              { label: 'Account Name', value: bankAccount.accountName },
            ].map((row, i) => (
              <div key={row.label} className={`flex items-center justify-between px-4 py-3.5 ${i !== 0 ? 'border-t border-border/40' : ''}`}>
                <span className="text-xs text-muted-foreground">{row.label}</span>
                <span className="text-sm font-semibold text-foreground">{row.value}</span>
              </div>
            ))}
            <div className="flex items-center justify-between border-t border-border/40 px-4 py-3.5">
              <span className="text-xs text-muted-foreground">Account Number</span>
              <button
                onClick={handleCopyAccount}
                className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/8 px-3 py-1.5 transition-all hover:bg-primary/15 active:scale-95"
              >
                <span className="font-mono text-sm font-bold text-primary tracking-widest">{bankAccount.accountNumber}</span>
                {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5 text-primary" />}
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-border/60 bg-card px-4 py-4">
            <label className="mb-1.5 flex items-center gap-2 text-xs font-semibold text-foreground">
              <User className="h-3.5 w-3.5 text-muted-foreground" />
              Your Sender Name
              <span className="ml-auto rounded-full bg-secondary px-2 py-0.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">Recommended</span>
            </label>
            <p className="mb-2.5 text-[11px] text-muted-foreground">Helps us verify your transfer faster</p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Name on your bank account"
                value={senderName}
                onChange={(e) => setSenderName(e.target.value)}
                className="flex-1 rounded-xl border border-border/60 bg-secondary/50 px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground/60 focus:border-primary/60 transition-colors"
              />
              <button
                onClick={handleSaveSenderName}
                disabled={!senderName.trim() || savingSenderName}
                className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-all hover:opacity-90 disabled:opacity-40 active:scale-95"
              >
                {savingSenderName ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-1.5 rounded-xl border border-border/40 bg-secondary/30 px-4 py-3">
            {expiryTime && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Expires</span>
                <span className="font-medium text-foreground">{formatExpiry(expiryTime)}</span>
              </div>
            )}
            {depositRef && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Reference</span>
                <span className="font-mono text-foreground">{depositRef}</span>
              </div>
            )}
          </div>

          <button
            onClick={handleMarkAsPaid}
            disabled={markingPaid}
            className="group relative mt-1 flex w-full items-center justify-center overflow-hidden rounded-2xl bg-primary py-4 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:-translate-y-0.5 hover:shadow-primary/35 active:translate-y-0 active:scale-[0.98] disabled:opacity-60 disabled:shadow-none disabled:translate-y-0"
          >
            <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent transition-transform duration-500 group-hover:translate-x-full" />
            {markingPaid ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <span className="flex items-center gap-2">
                I&apos;ve Made the Transfer
                <ShieldCheck className="h-4 w-4" />
              </span>
            )}
          </button>

          <p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-success" />
            Funds reflect within 0–15 minutes after confirmation
          </p>

          <Link
            href="/deposits"
            className="flex items-center justify-center gap-1 text-center text-xs font-medium text-primary hover:underline"
          >
            <Clock className="h-3.5 w-3.5" />
            View deposit history
          </Link>
        </div>
      </main>
    )
  }

  // ── Step 1: Select amount + payment method ────────────────────────────────────
  return (
    <main className="mx-auto flex max-w-md flex-col gap-5 px-4 py-5">
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard"
          aria-label="Back"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-secondary text-muted-foreground"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold tracking-tight">Topup / Recharge</h1>
          <p className="text-xs text-muted-foreground">
            Minimum deposit {formatNaira(liveMinDeposit)}
          </p>
        </div>
      </div>

      {presetPlan && (
        <div className="flex items-center gap-3 rounded-2xl border border-primary/40 bg-primary/10 p-4">
          <Wallet className="h-5 w-5 text-primary" />
          <p className="text-sm">
            Activating <span className="font-bold">{presetPlan.name}</span> — earns{' '}
            <span className="font-semibold text-success">{formatNaira(presetPlan.daily)}</span>/day
          </p>
        </div>
      )}

      {/* Amount selector */}
      <section>
        <p className="mb-2 text-sm font-semibold">Select amount</p>
        <div className="grid grid-cols-3 gap-2.5">
          {QUICK_AMOUNTS.map((amt) => {
            const active = !custom && selected === amt
            return (
              <button
                key={amt}
                onClick={() => { setSelected(amt); setCustom('') }}
                className={cn(
                  'rounded-xl border py-3 text-sm font-bold tabular-nums transition-colors',
                  active
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-card text-foreground hover:bg-secondary',
                )}
              >
                {formatNaira(amt)}
              </button>
            )
          })}
        </div>
      </section>

      <section>
        <label htmlFor="custom" className="mb-2 block text-sm font-semibold">
          Custom Amount
        </label>
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-1 focus-within:border-primary">
          <span className="text-lg font-bold text-muted-foreground">₦</span>
          <input
            id="custom"
            type="number"
            inputMode="numeric"
            placeholder="Enter amount"
            value={custom}
            onChange={(e) => { setCustom(e.target.value); setSelected(null) }}
            className="w-full bg-transparent py-3 text-base font-semibold outline-none placeholder:font-normal placeholder:text-muted-foreground"
          />
        </div>
      </section>

      {/* Payment method */}
      <section>
        <p className="mb-2 text-sm font-semibold">Payment method</p>
        <div className="grid grid-cols-2 gap-2.5">
          <button
            onClick={() => setPayMethod('korapay')}
            className={cn(
              'flex flex-col items-start gap-1.5 rounded-2xl border p-4 text-left transition-colors',
              payMethod === 'korapay'
                ? 'border-primary bg-primary/10'
                : 'border-border bg-card hover:bg-secondary',
            )}
          >
            <div className={cn(
              'flex h-9 w-9 items-center justify-center rounded-xl',
              payMethod === 'korapay' ? 'bg-primary/20' : 'bg-secondary',
            )}>
              <CreditCard className={cn('h-5 w-5', payMethod === 'korapay' ? 'text-primary' : 'text-muted-foreground')} />
            </div>
            <span className="text-sm font-bold">Korapay</span>
            <span className="text-[11px] text-muted-foreground leading-tight">Card, bank transfer, USSD</span>
            <span className="mt-0.5 rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-semibold text-success">Instant</span>
          </button>

          <button
            onClick={() => setPayMethod('bank_transfer')}
            className={cn(
              'flex flex-col items-start gap-1.5 rounded-2xl border p-4 text-left transition-colors',
              payMethod === 'bank_transfer'
                ? 'border-primary bg-primary/10'
                : 'border-border bg-card hover:bg-secondary',
            )}
          >
            <div className={cn(
              'flex h-9 w-9 items-center justify-center rounded-xl',
              payMethod === 'bank_transfer' ? 'bg-primary/20' : 'bg-secondary',
            )}>
              <Building2 className={cn('h-5 w-5', payMethod === 'bank_transfer' ? 'text-primary' : 'text-muted-foreground')} />
            </div>
            <span className="text-sm font-bold">Bank Transfer</span>
            <span className="text-[11px] text-muted-foreground leading-tight">Manual transfer, admin confirms</span>
            <span className="mt-0.5 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-500">0–15 min</span>
          </button>
        </div>
      </section>

      {/* Summary */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Amount to deposit</span>
          <span className="text-xl font-bold tabular-nums">{formatNaira(amount)}</span>
        </div>
        {!valid && amount > 0 && (
          <p className="mt-2 text-xs text-destructive">
            Amount must be at least {formatNaira(liveMinDeposit)}.
          </p>
        )}
      </div>

      <button
        disabled={!valid || pending}
        onClick={handleSubmit}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-4 text-base font-bold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {pending && <Loader2 className="h-5 w-5 animate-spin" />}
        {payMethod === 'korapay' ? 'Pay with Korapay' : 'Proceed to Bank Transfer'}
      </button>

      <p className="flex items-center justify-center gap-2 text-center text-xs text-muted-foreground">
        <ShieldCheck className="h-4 w-4 text-success" />
        {payMethod === 'korapay'
          ? 'Secured by Korapay — card, bank transfer, USSD supported'
          : 'Secure payment — funds reflect within 0–15 minutes'}
      </p>
    </main>
  )
}

export default function TopupPage() {
  return (
    <div className="min-h-screen pb-24">
      <AppHeader title="Topup" />
      <Suspense fallback={<div className="mx-auto max-w-md px-4 py-8 text-muted-foreground">Loading...</div>}>
        <TopupContent />
      </Suspense>
      <BottomNav />
    </div>
  )
}
