import { cn } from '@/lib/utils'

export function Logo({ className }: { className?: string }) {
  return (
    <div className={cn("relative flex items-center justify-center", className)} aria-label="Crox Exchange">
      <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-full w-full">
        <defs>
          <filter id="crox-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id="crox-x-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="oklch(0.72 0.22 258)" />
            <stop offset="100%" stopColor="oklch(0.55 0.22 258)" />
          </linearGradient>
        </defs>
        {/* Background tile */}
        <rect width="48" height="48" rx="10" fill="oklch(0.17 0.022 258)" />
        {/* Subtle inner border */}
        <rect x="1" y="1" width="46" height="46" rx="9.5" stroke="oklch(0.62 0.22 258 / 20%)" strokeWidth="1" />
        {/* X mark — two crossing strokes with glow */}
        <g filter="url(#crox-glow)">
          <line x1="12" y1="12" x2="36" y2="36" stroke="url(#crox-x-grad)" strokeWidth="6" strokeLinecap="round" />
          <line x1="36" y1="12" x2="12" y2="36" stroke="url(#crox-x-grad)" strokeWidth="6" strokeLinecap="round" />
        </g>
        {/* Center highlight dot */}
        <circle cx="24" cy="24" r="3.5" fill="oklch(0.80 0.20 258 / 60%)" />
      </svg>
    </div>
  )
}

export function LogoWordmark({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <Logo className="h-8 w-8" />
      <div className="flex flex-col leading-none">
        <span className="text-[14px] font-black uppercase tracking-widest text-foreground">CROX</span>
        <span className="text-[9px] font-light uppercase tracking-[0.15em] text-muted-foreground">
          Exchange
        </span>
      </div>
    </div>
  )
}
