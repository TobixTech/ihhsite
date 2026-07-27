import { Lock } from "lucide-react"
import { SITE } from "@/lib/plans"

export default function MaintenancePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full border border-destructive/40 bg-destructive/10">
        <Lock className="h-7 w-7 text-destructive" />
      </div>

      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-bold text-foreground">Service Temporarily Unavailable</h1>
        <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
          {SITE.name} is currently undergoing scheduled maintenance. Please check back shortly.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card px-5 py-3 text-xs text-muted-foreground">
        If you need help, contact support on Telegram.
      </div>
    </main>
  )
}
