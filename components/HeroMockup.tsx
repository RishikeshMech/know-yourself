'use client'
import { useEffect, useState } from 'react'

// Report rows that "type themselves" inside the MacBook window. Same shape as
// a real result so the story is honest: evaluation -> sections -> verified.
const ROWS = [
  { label: 'English', value: '172/200' },
  { label: 'Problem Solving', value: '168/200' },
  { label: 'AI Debugging', value: '132/150' },
  { label: 'Prompt Eng', value: '88/100' },
  { label: 'Cognitive', value: '154/200' },
]

const TOTAL = ROWS.reduce((n, r) => n + r.label.length + 1 + r.value.length, 0)
const HOLD_MS = 3400

/** Character at flat index i (used to vary typing cadence). */
function charAt(i: number): string {
  let used = 0
  for (const r of ROWS) {
    const need = r.label.length + 1 + r.value.length
    if (i < used + need) {
      const j = i - used
      if (j < r.label.length) return r.label[j]
      if (j === r.label.length) return ' '
      return r.value[j - r.label.length - 1]
    }
    used += need
  }
  return ''
}

/** Looping typewriter: types all rows, holds, restarts the cycle. */
function useTypewriter() {
  const [count, setCount] = useState(0)
  const [cycle, setCycle] = useState(0)

  useEffect(() => {
    if (count >= TOTAL) {
      const t = setTimeout(() => { setCount(0); setCycle(c => c + 1) }, HOLD_MS)
      return () => clearTimeout(t)
    }
    const ch = charAt(count)
    // Human-ish cadence: slower after spaces, slight random jitter.
    const delay = ch === ' ' ? 110 : 20 + Math.random() * 42
    const t = setTimeout(() => setCount(c => c + 1), delay)
    return () => clearTimeout(t)
  }, [count])

  return { count, cycle }
}

function derive(count: number) {
  const rows: any[] = []
  let used = 0
  for (const r of ROWS) {
    const start = used
    const need = r.label.length + 1 + r.value.length
    const end = start + need
    const got = Math.max(0, Math.min(need, count - start))
    const labelLen = Math.min(r.label.length, got)
    const valueLen = Math.max(0, Math.min(r.value.length, got - r.label.length - 1))
    rows.push({
      label: r.label.slice(0, labelLen),
      value: r.value.slice(0, valueLen),
      full: count >= end,
      current: count >= start && count < end,
    })
    used = end
  }
  return { rows, done: count >= TOTAL }
}

/** Small SVG chart inside the window — redraws on every typing cycle. */
function ScoreChart({ cycle }: { cycle: number }) {
  return (
    <svg key={cycle} viewBox="0 0 320 96" className="h-20 w-full sm:h-24" aria-hidden>
      <defs>
        <linearGradient id="hc-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8b5cf6" stopOpacity=".30" />
          <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="hc-line" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#c026d3" />
        </linearGradient>
      </defs>
      <path
        d="M0 78 C28 72 40 58 62 60 C84 62 96 42 120 44 C144 46 156 28 182 30 C208 32 222 20 248 22 C272 24 296 12 320 10 L320 96 L0 96 Z"
        fill="url(#hc-area)" className="graph-fill"
      />
      <path
        d="M0 78 C28 72 40 58 62 60 C84 62 96 42 120 44 C144 46 156 28 182 30 C208 32 222 20 248 22 C272 24 296 12 320 10"
        fill="none" stroke="url(#hc-line)" strokeWidth="2.5" strokeLinecap="round" className="graph-draw"
      />
      {[[0, 78], [62, 60], [120, 44], [182, 30], [248, 22], [320, 10]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="3" fill="#7c3aed" className="dot-in" style={{ animationDelay: `${0.45 + i * 0.3}s` }} />
      ))}
    </svg>
  )
}

export function HeroMockup() {
  const { count, cycle } = useTypewriter()
  const { rows, done } = derive(count)

  return (
    <div className="relative animate-fade-up" style={{ animationDelay: '.12s' }}>
      {/* Ambient animated graph behind the device */}
      <svg
        key={`bg-${cycle}`}
        viewBox="0 0 1000 640"
        aria-hidden
        className="pointer-events-none absolute -inset-x-24 -top-16 -z-10 h-[130%] w-[calc(100%+12rem)] opacity-[.14] blur-[2px]"
      >
        <defs>
          <linearGradient id="bg-line" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="55%" stopColor="#a855f7" />
            <stop offset="100%" stopColor="#ec4899" />
          </linearGradient>
          <linearGradient id="bg-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#a855f7" stopOpacity=".35" />
            <stop offset="100%" stopColor="#a855f7" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[80, 180, 280, 380, 480].map((y) => (
          <line key={y} x1="0" y1={y} x2="1000" y2={y} stroke="#6366f1" strokeWidth="1" strokeDasharray="3 10" opacity=".5" />
        ))}
        <path
          d="M0 520 C140 460 220 500 330 400 C440 300 520 350 640 260 C760 170 860 210 1000 120 L1000 640 L0 640 Z"
          fill="url(#bg-area)" className="graph-fill"
        />
        <path
          d="M0 520 C140 460 220 500 330 400 C440 300 520 350 640 260 C760 170 860 210 1000 120"
          fill="none" stroke="url(#bg-line)" strokeWidth="4" className="graph-draw-slow"
        />
      </svg>

      {/* Soft glow behind the device */}
      <div aria-hidden className="animate-glow absolute -inset-8 -z-10 rounded-[48px] bg-gradient-to-tr from-indigo-400/35 via-violet-400/25 to-fuchsia-300/35 blur-3xl" />

      {/* Floating mini-cards */}
      <div aria-hidden className="absolute -left-6 top-8 z-20 hidden animate-float-slow lg:flex items-center gap-2 rounded-2xl border border-white/70 bg-white/80 px-3.5 py-2.5 shadow-xl shadow-indigo-200/50 backdrop-blur">
        <span className="flex h-7 w-7 items-center justify-center rounded-xl calibiai-gradient text-xs text-white">🧠</span>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Evaluated by</div>
          <div className="text-xs font-bold text-slate-800">DeepSeek AI</div>
        </div>
      </div>
      <div aria-hidden className="absolute -right-4 bottom-14 z-20 hidden animate-float-slower lg:flex items-center gap-2 rounded-2xl border border-white/70 bg-white/80 px-3.5 py-2.5 shadow-xl shadow-violet-200/50 backdrop-blur">
        <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-emerald-500 text-xs text-white">✓</span>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Credential</div>
          <div className="text-xs font-bold text-slate-800">Shareable PDF</div>
        </div>
      </div>

      {/* MacBook */}
      <div className="relative mx-auto max-w-[580px]">
        <div className="relative rounded-[26px] border-[10px] border-slate-900 bg-slate-900 shadow-[0_50px_100px_-28px_rgba(79,70,229,.5)]">
          <div className="relative overflow-hidden rounded-[16px] bg-gradient-to-br from-white via-white to-slate-50">
            {/* Notch */}
            <div aria-hidden className="absolute left-1/2 top-0 z-20 h-2.5 w-24 -translate-x-1/2 rounded-b-xl bg-slate-900" />

            {/* Browser chrome */}
            <div className="flex items-center gap-2 border-b border-slate-100 bg-white/90 px-4 py-2.5">
              <span className="flex gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
              </span>
              <span className="mx-auto flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-[10px] font-medium text-slate-500">
                <span aria-hidden>🔒</span> calibiai.app/score
              </span>
              <span className="hidden items-center gap-1 text-[8px] font-bold uppercase tracking-widest text-emerald-600 sm:flex">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" /> Live
              </span>
            </div>

            {/* Screen content */}
            <div className="relative px-5 pb-4 pt-5 sm:px-7 sm:pt-6">
              {/* Scan line */}
              <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden opacity-30">
                <div className="scan-line absolute inset-x-0 h-14 bg-gradient-to-b from-transparent via-indigo-300/40 to-transparent" />
              </div>

              {/* Headline — appears once the report is "ready" */}
              <div className={`flex items-end justify-between gap-3 transition-all duration-500 ${done ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'}`}>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-indigo-600">CalibiAI Score</div>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-4xl font-black text-gradient sm:text-[2.6rem]">842</span>
                    <span className="text-xs font-bold text-slate-400">/1000</span>
                  </div>
                </div>
                <span className="chip !px-2.5 !py-1 text-[10px] font-bold !text-indigo-700 !bg-indigo-50/80 !border-indigo-100">Grade A · 92nd pct</span>
              </div>

              {/* Chart */}
              <div className="mt-4 rounded-xl border border-slate-100 bg-white/60 p-2">
                <ScoreChart cycle={cycle} />
              </div>

              {/* Typed rows */}
              <div className="mt-4 space-y-2">
                {rows.map((r: any, i: number) => (
                  <div key={i} className={`flex h-5 items-center justify-between gap-3 ${r.full ? '' : r.current ? '' : 'opacity-30'}`}>
                    <div className="flex min-w-0 items-center gap-2">
                      {r.full && <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-[9px] font-bold text-white">✓</span>}
                      <span className={`truncate text-[11px] font-semibold sm:text-xs ${r.full ? 'text-slate-700' : 'text-slate-500'}`}>{r.label}</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <span className={`font-mono text-[11px] font-bold sm:text-xs ${r.full ? 'text-slate-900' : 'text-slate-500'}`}>{r.value}</span>
                      {r.current && <span aria-hidden className="cursor-blink h-3.5 w-[2px] rounded bg-indigo-600" />}
                    </div>
                  </div>
                ))}
              </div>

              {/* Status line */}
              <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                <span className={`flex items-center gap-1.5 text-[10px] font-semibold ${done ? 'text-emerald-600' : 'text-slate-400'}`}>
                  {done ? (
                    <>
                      <span aria-hidden>✓</span> Report verified
                    </>
                  ) : (
                    <>
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-500" /> Evaluating evidence…
                    </>
                  )}
                </span>
                <span className="font-mono text-[9px] text-slate-400">sha256:9f4c2e8a</span>
              </div>
            </div>
          </div>
        </div>

        {/* MacBook base */}
        <div className="mx-auto h-4 w-[104%] -translate-x-[2%] rounded-b-2xl bg-gradient-to-b from-slate-700 to-slate-900 shadow-xl shadow-slate-900/30">
          <div aria-hidden className="mx-auto h-1.5 w-28 rounded-b-xl bg-slate-950/80" />
        </div>
      </div>
    </div>
  )
}
