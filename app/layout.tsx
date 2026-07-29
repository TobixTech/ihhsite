import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Space_Grotesk } from 'next/font/google'
import { Toaster } from 'sonner'
import { getBoolSetting, SETTING_KEYS } from '@/app/actions/settings'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'
import { profile, investment } from '@/lib/db/schema'
import { eq, count } from 'drizzle-orm'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { ThemeProvider } from '@/components/theme-provider'
import './globals.css'

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
  weight: ['300', '400', '500', '600', '700'],
})

const SITE_URL = 'https://conltd.site'

export const metadata: Metadata = {
  title: 'Crox Exchange — Trade · Earn · Grow',
  description:
    'Crox Exchange — Earn consistent daily returns through our structured investment packages. Start with as little as ₦1,000.',
  metadataBase: new URL(SITE_URL),
  alternates: {
    canonical: SITE_URL,
  },
  openGraph: {
    title: 'Crox Exchange — Trade · Earn · Grow',
    description: 'Earn consistent daily returns with Crox Exchange. 11 packages, 15-day cycles, instant withdrawals.',
    siteName: 'Crox Exchange',
    url: SITE_URL,
    type: 'website',
    images: [
      {
        url: '/og.png',
        width: 1254,
        height: 1254,
        alt: 'Crox Exchange — Trade · Earn · Grow',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Crox Exchange — Trade · Earn · Grow',
    description: 'Earn consistent daily returns with Crox Exchange. 11 packages, 15-day cycles, instant withdrawals.',
    images: ['/og.png'],
  },
  // app/icon.png and app/apple-icon.png are auto-served by Next.js file convention
}

export const viewport: Viewport = {
  themeColor: '#0b0d18',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // Paths that must NEVER be frozen (auth + maintenance itself)
  const headersList = await headers()
  const pathname = headersList.get("x-pathname") ?? headersList.get("x-invoke-path") ?? ""
  const BYPASS_PATHS = ["/", "/sign-in", "/register", "/maintenance"]
  const isAuthPath = BYPASS_PATHS.includes(pathname) || pathname.startsWith("/r/")

  // Short-circuit: no freeze check needed for bypass pages
  const [frozen, session] = await Promise.all([
    isAuthPath ? Promise.resolve(false) : getBoolSetting(SETTING_KEYS.siteFrozen),
    getSession(),
  ])

  if (frozen && !isAuthPath) {
    const userId = session?.user?.id

    if (userId) {
      // Admins are never redirected
      const [p] = await db
        .select({ role: profile.role })
        .from(profile)
        .where(eq(profile.userId, userId))
      const isAdmin = p?.role === "admin"

      if (!isAdmin) {
        // Redirect all authenticated non-admin users when site is frozen
        redirect("/maintenance")
      }
    } else {
      // Unauthenticated users also cannot access the site when frozen
      redirect("/maintenance")
    }
  }

  return (
    <html lang="en" className={`${spaceGrotesk.variable} bg-background`} suppressHydrationWarning>
      <body className="font-sans antialiased">
        {/* Blocking script: apply stored theme class before first paint to avoid flash */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('cil-theme')||'dark';document.documentElement.classList.add(t);}catch(e){}})();`,
          }}
        />
        <ThemeProvider>
          {children}
          <Toaster position="top-center" richColors />
          {process.env.NODE_ENV === 'production' && <Analytics />}
        </ThemeProvider>
      </body>
    </html>
  )
}
