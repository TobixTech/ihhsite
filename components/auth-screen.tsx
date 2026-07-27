"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Mail, Phone, Lock, ShieldCheck, Tag, User, Loader2, Eye, EyeOff, ArrowRight, TrendingUp, Users, Zap } from "lucide-react"
import { toast } from "sonner"
import { Logo } from "@/components/logo"
import { SITE } from "@/lib/plans"
import { authClient } from "@/lib/auth-client"
import { initAccount, resolveLoginEmail } from "@/app/actions/account"
import { cn } from "@/lib/utils"

type Mode = "sign-in" | "sign-up"

function Field({
  id, label, hint, icon: Icon, type = "text", placeholder, value, onChange,
}: {
  id: string; label: string; hint?: string; icon: typeof Mail
  type?: string; placeholder?: string; value: string; onChange: (v: string) => void
}) {
  const [showPw, setShowPw] = useState(false)
  const isPassword = type === "password"
  const inputType = isPassword ? (showPw ? "text" : "password") : type

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {label}{hint && <span className="ml-1 normal-case font-normal opacity-60">({hint})</span>}
      </label>
      <div className="group flex items-center gap-2.5 rounded-lg border border-border/60 bg-secondary/50 px-3 py-2.5 transition-all focus-within:border-primary/60 focus-within:bg-secondary/80 focus-within:ring-1 focus-within:ring-primary/30">
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground/70" />
        <input
          id={id}
          type={inputType}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
        />
        {isPassword && (
          <button type="button" onClick={() => setShowPw(!showPw)} className="text-muted-foreground hover:text-foreground transition-colors">
            {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
      </div>
    </div>
  )
}

function StatCard({ icon: Icon, label, value }: { icon: typeof TrendingUp; label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-border/40 bg-gradient-to-br from-secondary/40 to-secondary/20 p-3.5 text-center">
      <Icon className="h-5 w-5 mx-auto text-primary" />
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-bold text-foreground">{value}</p>
    </div>
  )
}

export function AuthScreen({ defaultInvite = "", promoCode = "" }: { defaultInvite?: string; promoCode?: string }) {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>(promoCode ? "sign-up" : "sign-in")
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    name: "", identifier: "", email: "", phone: "",
    password: "", confirm: "", invite: defaultInvite,
  })
  const set = (key: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [key]: v }))

  async function handleSignIn() {
    if (!form.identifier || !form.password) { toast.error("Enter your email/phone and password"); return }
    setLoading(true)
    try {
      const { email } = await resolveLoginEmail(form.identifier)
      if (!email) { toast.error("No account found"); return }
      const { error } = await authClient.signIn.email({ email, password: form.password })
      if (error) { toast.error(error.message || "Invalid credentials"); return }
      toast.success("Welcome back.")
      router.push("/dashboard"); router.refresh()
    } catch { toast.error("Something went wrong. Try again.") }
    finally { setLoading(false) }
  }

  async function handleSignUp() {
    if (!form.name || !form.email || !form.phone || !form.password) {
      toast.error("Please fill all required fields"); return
    }
    if (form.password.length < 8) { toast.error("Password must be at least 8 characters"); return }
    if (form.password !== form.confirm) { toast.error("Passwords do not match"); return }
    setLoading(true)
    try {
      const result = await authClient.signUp.email({
        email: form.email.toLowerCase(), password: form.password, name: form.name,
      })
      if (result.error) { toast.error(result.error.message || "Could not create account"); return }
      await initAccount({ phone: form.phone, inviteCode: form.invite, promoCode })
      toast.success(`Account created. Welcome to ${SITE.short}.`)
      router.push("/dashboard"); router.refresh()
    } catch { toast.error("Something went wrong. Try again.") }
    finally { setLoading(false) }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <main className="flex flex-1 flex-col lg:flex-row">
        {/* Left: Hero / Value Prop */}
        <div className="flex flex-col justify-center px-6 py-12 lg:w-1/2 lg:px-12 lg:py-20">
          <div className="mb-8">
            <Logo className="h-10 w-10 mb-4" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-primary/70 mb-2">
                {SITE.tagline}
              </p>
              <h1 className="text-3xl lg:text-4xl font-bold tracking-tight text-foreground mb-3">
                Trade Smarter.<br />Earn Daily.
              </h1>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-sm">
                Join {SITE.name} and earn consistent daily returns across {SITE.packageCount} investment packages. Start with just ₦{SITE.minDeposit.toLocaleString()}.
              </p>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-2.5 mb-8">
            <StatCard icon={TrendingUp} label="Daily Earnings" value="22%" />
            <StatCard icon={Zap} label="Welcome Bonus" value={`₦${SITE.welcomeBonus.toLocaleString()}`} />
            <StatCard icon={Users} label="Packages" value={`${SITE.packageCount}`} />
          </div>

          {/* Trust badges */}
          <div className="text-xs text-muted-foreground/70 space-y-1.5 mb-8 pt-8 border-t border-border/40">
            <p className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-success" /> Secure transactions</p>
            <p className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-success" /> Real-time earnings tracking</p>
            <p className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-success" /> Instant withdrawals</p>
          </div>
        </div>

        {/* Right: Auth Form */}
        <div className="flex flex-col justify-center px-6 py-12 lg:w-1/2 lg:px-12 lg:py-20 bg-secondary/30 lg:bg-gradient-to-br lg:from-secondary/40 lg:to-background">
          <div className="mx-auto w-full max-w-sm">
            {/* Mode Toggle */}
            <div className="mb-8 flex rounded-lg border border-border/60 bg-secondary/50 p-1 gap-1">
              {(["sign-in", "sign-up"] as Mode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={cn(
                    "flex-1 rounded-md py-2.5 text-sm font-semibold transition-all duration-200",
                    mode === m
                      ? "bg-gradient-to-r from-primary to-primary/80 text-primary-foreground shadow-lg shadow-primary/20"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {m === "sign-in" ? "Sign In" : "Get Started"}
                </button>
              ))}
            </div>

            {/* Promo Alert */}
            {mode === "sign-up" && promoCode && (
              <div className="mb-5 flex items-start gap-2.5 rounded-lg border border-primary/20 bg-gradient-to-br from-primary/10 to-primary/5 p-3">
                <Zap className="h-4 w-4 shrink-0 text-primary mt-0.5" />
                <p className="text-xs text-foreground/80 leading-relaxed">
                  Registering with a <span className="font-semibold">Promoter</span> invite. Extra benefits unlocked!
                </p>
              </div>
            )}

            {/* Form */}
            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => { e.preventDefault(); mode === "sign-in" ? handleSignIn() : handleSignUp() }}
            >
              {mode === "sign-up" && (
                <Field id="name" label="Full Name" icon={User} placeholder="Your full name" value={form.name} onChange={set("name")} />
              )}

              {mode === "sign-in" ? (
                <Field id="identifier" label="Email or Phone" icon={Mail} placeholder="email@example.com or 080..." value={form.identifier} onChange={set("identifier")} />
              ) : (
                <>
                  <Field id="email" label="Email Address" icon={Mail} type="email" placeholder="email@example.com" value={form.email} onChange={set("email")} />
                  <Field id="phone" label="Phone Number" icon={Phone} type="tel" placeholder="080XXXXXXXX" value={form.phone} onChange={set("phone")} />
                </>
              )}

              <Field id="password" label="Password" icon={Lock} type="password" placeholder="Min. 8 characters" value={form.password} onChange={set("password")} />

              {mode === "sign-up" && (
                <>
                  <Field id="confirm" label="Confirm Password" icon={ShieldCheck} type="password" placeholder="Repeat password" value={form.confirm} onChange={set("confirm")} />
                  <Field id="invite" label="Invite Code" hint="optional" icon={Tag} placeholder="Enter invite code" value={form.invite} onChange={set("invite")} />
                </>
              )}

              <button
                type="submit"
                disabled={loading}
                className="group relative mt-3 flex w-full items-center justify-center overflow-hidden rounded-lg bg-gradient-to-r from-primary to-primary/80 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/30 transition-all duration-200 hover:shadow-primary/40 hover:-translate-y-0.5 active:scale-[0.98] active:translate-y-0 disabled:opacity-50 disabled:shadow-none disabled:translate-y-0"
              >
                <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent transition-transform duration-500 group-hover:translate-x-full" />
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <span className="flex items-center gap-2">
                    {mode === "sign-in" ? "Sign In" : "Create Account"}
                    <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
                  </span>
                )}
              </button>
            </form>

            <p className="mt-6 text-center text-xs text-muted-foreground">
              {mode === "sign-in" ? "New here? " : "Already registered? "}
              <button onClick={() => setMode(mode === "sign-in" ? "sign-up" : "sign-in")} className="font-semibold text-primary hover:underline transition-colors">
                {mode === "sign-in" ? "Create account" : "Sign in"}
              </button>
            </p>

            <p className="mt-8 text-center text-[10px] text-muted-foreground/50 uppercase tracking-widest">
              {SITE.short} &bull; {SITE.tagline}
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}
