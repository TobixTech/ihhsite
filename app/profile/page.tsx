import { redirect } from "next/navigation"
import { getSession } from "@/lib/session"
import { getDashboardData } from "@/app/actions/account"
import { AppHeader } from "@/components/app-header"
import { BottomNav } from "@/components/bottom-nav"
import { ProfileView } from "@/components/profile-view"

export const dynamic = "force-dynamic"

export default async function ProfilePage() {
  const session = await getSession()
  if (!session?.user) redirect("/")
  const data = await getDashboardData()

  return (
    <div className="min-h-screen pb-24">
      <AppHeader title="Profile" />
      <ProfileView
        name={data.name}
        email={data.email}
        phone={data.phone}
        role={data.role}
        inviteCode={data.inviteCode}
        balance={data.balance}
        frozenBalance={(data as { frozenBalance?: number }).frozenBalance ?? 0}
        totalDeposited={data.totalDeposited}
        totalEarned={data.totalEarned}
        referralEarnings={data.referralEarnings}
      />
      <BottomNav />
    </div>
  )
}
