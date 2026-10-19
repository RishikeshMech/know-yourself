'use client'

/**
 * AnimatedScore — a premium glassmorphic metric badge for the Assessment Overview.
 *
 * Replaces the cramped circular design with a modern, high-contrast
 * glass podium card:
 * - Top glowing pill with Grade/Tier status
 * - Bold, crystal-clear score typography (/1000)
 * - Sleek glowing readiness progress bar
 * - Distinct metadata sublabel (e.g. "Average of 2 assessments")
 */
import { useEffect, useState } from 'react'

interface Props {
  /** Calibi score 0-1000. Null/undefined renders a quiet placeholder. */
  score: number | null | undefined
  /** Tier label ("Grade D", "Grade A+", "Gold", "Platinum", etc.). */
  tier?: string
  /** Hex gradient stops for accent [from, to]. */
  gradient?: [string, string]
  /** Hex stroke colour for accent. */
  ringColor?: string
  /** Size in px (optional override). */
  size?: number
  /** Optional sublabel under the tier. */
  sublabel?: string
}

export function AnimatedScore({
  score,
  tier,
  gradient = ['#818cf8', '#c084fc'],
  sublabel,
}: Props) {
  const numeric = Number.isFinite(Number(score)) ? Math.max(0, Math.min(1000, Number(score))) : 0
  const percent = Math.round((numeric / 1000) * 100)

  // Smooth count-up animation for the number
  const [display, setDisplay] = useState(0)
  useEffect(() => {
    if (!Number.isFinite(numeric) || numeric === 0) {
      setDisplay(0)
      return
    }
    let raf = 0
    const start = performance.now()
    const dur = 1000
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur)
      // Ease-out cubic for a crisp settle
      const eased = 1 - Math.pow(1 - t, 3)
      setDisplay(Math.round(eased * numeric))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [numeric])

  return (
    <div className="relative group overflow-hidden rounded-3xl border border-white/20 bg-gradient-to-b from-white/15 via-white/8 to-white/5 p-4 sm:p-5 shadow-2xl shadow-indigo-950/60 backdrop-blur-2xl w-full sm:w-[210px] text-center flex flex-col items-center justify-between transition-all duration-300 hover:border-indigo-400/50 hover:shadow-indigo-500/20">
      {/* Ambient neon backglow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-1 rounded-3xl opacity-30 blur-xl transition duration-500 group-hover:opacity-60"
        style={{
          background: `radial-gradient(circle at center, ${gradient[0]}, ${gradient[1]}, transparent 70%)`,
        }}
      />

      {/* Top subtle accent line */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-indigo-400 via-violet-400 to-fuchsia-400"
      />

      {/* Top Tier/Grade Pill */}
      <div className="relative z-10 w-full flex items-center justify-center">
        {tier ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-300/30 bg-indigo-950/70 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-indigo-200 shadow-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            {tier}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-300">
            Score Card
          </span>
        )}
      </div>

      {/* Massive Bold Score Typography */}
      <div className="relative z-10 my-3 flex flex-col items-center justify-center">
        <div className="flex items-baseline justify-center gap-1.5">
          <span
            className="text-5xl sm:text-6xl font-black tracking-tight tabular-nums leading-none animate-stat-in"
            style={{
              background: `linear-gradient(135deg, #ffffff 30%, ${gradient[0]} 80%, ${gradient[1]} 100%)`,
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
              filter: 'drop-shadow(0 2px 10px rgba(129, 140, 248, 0.35))',
            }}
          >
            {Number.isFinite(numeric) ? display : '—'}
          </span>
          <span className="text-xs sm:text-sm font-bold uppercase tracking-wider text-indigo-200/80">
            / 1000
          </span>
        </div>
      </div>

      {/* Glowing Linear Readiness Bar */}
      <div className="relative z-10 w-full px-1 mb-2">
        <div className="flex items-center justify-between text-[10px] font-bold text-indigo-200/80 mb-1">
          <span className="uppercase tracking-wider">Readiness</span>
          <span className="font-mono text-white font-black">{percent}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-black/40 border border-white/10 p-[1px]">
          <div
            className="h-full rounded-full transition-all duration-1000 shadow-[0_0_10px_rgba(168,85,247,0.5)]"
            style={{
              width: `${Math.max(3, Math.min(100, percent))}%`,
              background: `linear-gradient(90deg, ${gradient[0]}, ${gradient[1]})`,
            }}
          />
        </div>
      </div>

      {/* Clean Sublabel Pill */}
      {sublabel && (
        <div className="relative z-10 w-full mt-1">
          <div className="rounded-xl border border-white/10 bg-black/25 px-2.5 py-1 text-[11px] font-semibold text-indigo-100/90 leading-tight truncate" title={sublabel}>
            {sublabel}
          </div>
        </div>
      )}
    </div>
  )
}
