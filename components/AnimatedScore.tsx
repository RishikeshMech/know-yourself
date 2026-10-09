'use client'

/**
 * AnimatedScore — a circular score display for the profile page.
 *
 * Combines a soft pulsing halo, a progress ring that fills clockwise on
 * mount, and a large gradient number in the middle. The number itself is
 * bound to React state (so it never lies), while the ring's `pathLength` of
 * 100 keeps the math simple: `dasharray = score/10`.
 */
import { useEffect, useState } from 'react'

interface Props {
  /** CalibiAI score 0-1000. Null/undefined renders a quiet placeholder. */
  score: number | null | undefined
  /** Tier label shown under the number ("Bronze", "Silver", "Gold", "Platinum"). */
  tier?: string
  /** Hex gradient stops for the ring + number [from, to]. */
  gradient?: [string, string]
  /** Hex stroke colour for the ring (overrides gradient if set). */
  ringColor?: string
  /** Size in px (square). */
  size?: number
  /** Optional sublabel under the tier. */
  sublabel?: string
}

export function AnimatedScore({ score, tier, gradient = ['#a5b4fc', '#f0abfc'], ringColor, size = 168, sublabel }: Props) {
  const numeric = Number.isFinite(Number(score)) ? Math.max(0, Math.min(1000, Number(score))) : 0
  const share = numeric / 10 // 0..100, matches `pathLength="100"`
  const stroke = ringColor || gradient[0]
  // Count-up animation for the number itself.
  const [display, setDisplay] = useState(0)
  useEffect(() => {
    if (!Number.isFinite(numeric) || numeric === 0) { setDisplay(0); return }
    let raf = 0
    const start = performance.now()
    const dur = 1100
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur)
      // ease-out cubic for a confident "settle" feel.
      const eased = 1 - Math.pow(1 - t, 3)
      setDisplay(Math.round(eased * numeric))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [numeric])

  const gid = `score-grad-${Math.random().toString(36).slice(2, 8)}`
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" role="img" aria-label={`CalibiAI score ${numeric} out of 1000`}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={gradient[0]} />
            <stop offset="100%" stopColor={gradient[1]} />
          </linearGradient>
        </defs>
        {/* Soft pulsing halo behind everything. */}
        <circle cx="50" cy="50" r="46" fill={gradient[0]} opacity="0.18" className="halo-pulse" />
        {/* Background track */}
        <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(99,102,241,0.15)" strokeWidth="6" />
        {/* Animated progress ring (clamped so a zero score shows a dot, not nothing). */}
        <circle
          cx="50" cy="50" r="40"
          className="score-ring"
          pathLength="100"
          stroke={stroke}
          strokeWidth="6"
          style={{ ['--ring-len' as any]: `${Math.max(0.5, share)}` } as React.CSSProperties}
        />
      </svg>
      <div className="relative flex flex-col items-center justify-center text-center">
        <div className="score-in text-[44px] font-black leading-none tabular-nums" style={{ background: `linear-gradient(135deg, ${gradient[0]}, ${gradient[1]})`, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>
          {Number.isFinite(numeric) ? display : '—'}
        </div>
        <div className="mt-0.5 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-300">/ 1000</div>
        {tier && <div className="mt-1 text-[11px] font-black uppercase tracking-wider text-indigo-200">{tier}</div>}
        {sublabel && <div className="mt-0.5 text-[11px] font-semibold text-slate-300">{sublabel}</div>}
      </div>
    </div>
  )
}
