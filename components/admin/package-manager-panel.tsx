"use client"

import { useState, useTransition, useEffect } from "react"
import {
  Package,
  Plus,
  Pencil,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Zap,
  Check,
  X,
  Loader2,
  Rocket,
} from "lucide-react"
import { toast } from "sonner"
import { formatNaira } from "@/lib/plans"
import {
  createCustomPlan,
  updateCustomPlan,
  toggleCustomPlan,
  releasePlan,
  deleteCustomPlan,
  type CustomPlanInput,
} from "@/app/actions/admin"
import { cn } from "@/lib/utils"

type CustomPlan = {
  id: number
  name: string
  price: string
  daily: string
  durationDays: number
  points: number
  maxPurchases: number | null
  isActive: boolean
  comingSoon: boolean
  sortOrder: number
  createdAt: Date | string
}

const EMPTY_FORM: CustomPlanInput = {
  name: "",
  price: 0,
  daily: 0,
  durationDays: 15,
  points: 0,
  maxPurchases: 5,
  comingSoon: false,
  sortOrder: 0,
}

type Props = {
  initialPlans: CustomPlan[]
  onUpdate: () => void
}

export function PackageManagerPanel({ initialPlans, onUpdate }: Props) {
  const [plans, setPlans] = useState<CustomPlan[]>(initialPlans)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState<CustomPlanInput>(EMPTY_FORM)
  const [pending, startTransition] = useTransition()

  // Sync local list whenever the parent refreshes data (e.g. after create/delete)
  useEffect(() => {
    setPlans(initialPlans)
  }, [initialPlans])

  function openCreate() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
  }

  function openEdit(plan: CustomPlan) {
    setEditingId(plan.id)
    setForm({
      name: plan.name,
      price: Number(plan.price),
      daily: Number(plan.daily),
      durationDays: plan.durationDays,
      points: plan.points,
      maxPurchases: plan.maxPurchases,
      comingSoon: plan.comingSoon,
      sortOrder: plan.sortOrder,
    })
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditingId(null)
  }

  function set(key: keyof CustomPlanInput, value: unknown) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function handleSave() {
    startTransition(async () => {
      const res = editingId
        ? await updateCustomPlan(editingId, form)
        : await createCustomPlan(form)

      toast[res.ok ? "success" : "error"](res.message)
      if (res.ok) {
        closeForm()
        onUpdate()
        // Optimistically refresh list
        if (editingId) {
          setPlans((prev) =>
            prev.map((p) =>
              p.id === editingId
                ? { ...p, ...form, price: String(form.price), daily: String(form.daily) }
                : p
            )
          )
        }
      }
    })
  }

  function handleToggle(id: number) {
    startTransition(async () => {
      const res = await toggleCustomPlan(id)
      toast[res.ok ? "success" : "error"](res.message)
      if (res.ok) {
        setPlans((prev) =>
          prev.map((p) =>
            p.id === id ? { ...p, isActive: !p.isActive, comingSoon: !p.isActive ? false : p.comingSoon } : p
          )
        )
        onUpdate()
      }
    })
  }

  function handleRelease(id: number) {
    if (!confirm("Release this package as active now?")) return
    startTransition(async () => {
      const res = await releasePlan(id)
      toast[res.ok ? "success" : "error"](res.message)
      if (res.ok) {
        setPlans((prev) =>
          prev.map((p) =>
            p.id === id ? { ...p, isActive: true, comingSoon: false } : p
          )
        )
        onUpdate()
      }
    })
  }

  function handleDelete(id: number) {
    if (!confirm("Permanently delete this package?")) return
    startTransition(async () => {
      const res = await deleteCustomPlan(id)
      toast[res.ok ? "success" : "error"](res.message)
      if (res.ok) {
        setPlans((prev) => prev.filter((p) => p.id !== id))
        onUpdate()
      }
    })
  }

  return (
    <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4 text-primary" />
          <div>
            <h3 className="text-sm font-bold">Package Manager</h3>
            <p className="text-[11px] text-muted-foreground">Create, edit, and release investment packages</p>
          </div>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.97]"
        >
          <Plus className="h-3.5 w-3.5" />
          New Package
        </button>
      </div>

      {/* Create / Edit Form */}
      {showForm && (
        <div className="border-b border-border/60 bg-secondary/20 p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-bold text-foreground">
              {editingId ? "Edit Package" : "Create New Package"}
            </p>
            <button onClick={closeForm} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Name */}
            <div className="col-span-2">
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Package Name
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="e.g. Surge"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>

            {/* Price */}
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Price (₦)
              </label>
              <input
                type="number"
                min={0}
                value={form.price || ""}
                onChange={(e) => set("price", Number(e.target.value))}
                placeholder="10000"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm font-mono font-bold focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>

            {/* Daily */}
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Daily Earning (₦)
              </label>
              <input
                type="number"
                min={0}
                value={form.daily || ""}
                onChange={(e) => set("daily", Number(e.target.value))}
                placeholder="2200"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm font-mono font-bold focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>

            {/* Duration */}
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Duration (days)
              </label>
              <input
                type="number"
                min={1}
                value={form.durationDays}
                onChange={(e) => set("durationDays", Number(e.target.value))}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm font-mono font-bold focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>

            {/* Points */}
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Reward Points
              </label>
              <input
                type="number"
                min={0}
                value={form.points}
                onChange={(e) => set("points", Number(e.target.value))}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm font-mono font-bold focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>

            {/* Max Purchases */}
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Max Purchases (blank = unlimited)
              </label>
              <input
                type="number"
                min={1}
                value={form.maxPurchases ?? ""}
                onChange={(e) =>
                  set("maxPurchases", e.target.value === "" ? null : Number(e.target.value))
                }
                placeholder="5"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm font-mono font-bold focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>

            {/* Sort Order */}
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Sort Order
              </label>
              <input
                type="number"
                min={0}
                value={form.sortOrder}
                onChange={(e) => set("sortOrder", Number(e.target.value))}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm font-mono font-bold focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>

            {/* Coming Soon toggle */}
            <div className="col-span-2 flex items-center justify-between rounded-xl border border-border/60 bg-secondary/30 px-3.5 py-2.5">
              <div>
                <p className="text-xs font-semibold">Coming Soon</p>
                <p className="text-[10px] text-muted-foreground">
                  Shows badge but blocks purchase until released
                </p>
              </div>
              <button
                onClick={() => set("comingSoon", !form.comingSoon)}
                className="flex items-center"
              >
                {form.comingSoon
                  ? <ToggleRight className="h-5 w-5 text-primary" />
                  : <ToggleLeft className="h-5 w-5 text-muted-foreground" />}
              </button>
            </div>

            {/* Preview */}
            {form.price > 0 && form.daily > 0 && (
              <div className="col-span-2 rounded-xl border border-primary/20 bg-primary/5 px-3.5 py-2.5 text-xs text-muted-foreground">
                <span className="font-bold text-foreground">{form.name || "Package"}</span>
                {" · "}{formatNaira(form.price)}
                {" · "}{formatNaira(form.daily)}/day
                {" · "} Total: {formatNaira(form.daily * form.durationDays)}
              </div>
            )}
          </div>

          <div className="mt-4 flex gap-2">
            <button
              onClick={handleSave}
              disabled={pending}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-60"
            >
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              {editingId ? "Save Changes" : "Create Package"}
            </button>
            <button
              onClick={closeForm}
              className="rounded-xl border border-border bg-secondary px-4 py-2.5 text-sm font-semibold text-muted-foreground hover:bg-secondary/80"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Package List */}
      {plans.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-muted-foreground">
          No custom packages yet. Click &quot;New Package&quot; to create one.
        </div>
      ) : (
        <div className="divide-y divide-border/40">
          {plans.map((plan) => {
            const total = Number(plan.daily) * plan.durationDays
            return (
              <div key={plan.id} className={cn("px-4 py-3", !plan.isActive && !plan.comingSoon && "opacity-50")}>
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-bold text-foreground">{plan.name}</span>
                      {plan.comingSoon && (
                        <span className="rounded-full border border-sky-400/30 bg-sky-400/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-sky-400">
                          Coming Soon
                        </span>
                      )}
                      {!plan.comingSoon && plan.isActive && (
                        <span className="rounded-full border border-success/30 bg-success/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-success">
                          Active
                        </span>
                      )}
                      {!plan.comingSoon && !plan.isActive && (
                        <span className="rounded-full border border-destructive/30 bg-destructive/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-destructive">
                          Disabled
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-[10px] text-muted-foreground tabular-nums">
                      {formatNaira(Number(plan.price))} · {formatNaira(Number(plan.daily))}/day · {plan.durationDays}d · Total: {formatNaira(total)}
                      {plan.maxPurchases ? ` · Up to ${plan.maxPurchases}×` : ""}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    {/* Release (coming soon only) */}
                    {plan.comingSoon && (
                      <button
                        onClick={() => handleRelease(plan.id)}
                        disabled={pending}
                        title="Release now"
                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-border/50 bg-secondary/50 text-sky-400 hover:border-sky-400/40 hover:bg-sky-400/10 disabled:opacity-30"
                      >
                        <Rocket className="h-3.5 w-3.5" />
                      </button>
                    )}

                    {/* Edit */}
                    <button
                      onClick={() => openEdit(plan)}
                      title="Edit"
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-border/50 bg-secondary/50 text-muted-foreground hover:border-primary/40 hover:text-primary"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>

                    {/* Toggle active (non-coming-soon only) */}
                    {!plan.comingSoon && (
                      <button
                        onClick={() => handleToggle(plan.id)}
                        disabled={pending}
                        title={plan.isActive ? "Disable" : "Enable"}
                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-border/50 bg-secondary/50 text-muted-foreground hover:border-primary/40 hover:text-primary disabled:opacity-30"
                      >
                        {plan.isActive
                          ? <ToggleRight className="h-4 w-4 text-success" />
                          : <ToggleLeft className="h-4 w-4" />}
                      </button>
                    )}

                    {/* Delete */}
                    <button
                      onClick={() => handleDelete(plan.id)}
                      disabled={pending}
                      title="Delete"
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-border/50 bg-secondary/50 text-muted-foreground hover:border-destructive/40 hover:text-destructive disabled:opacity-30"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
