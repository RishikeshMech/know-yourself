'use client'

/**
 * ResumeSkillRadar — a compact radar chart and readable legend for the six
 * skill families extracted from a resume. The family names live in the
 * adjacent legend (rather than tiny SVG labels) so they remain readable at
 * the narrow widths used by the profile sidebar.
 */
import { useMemo } from 'react'

const FAMILIES = ['Languages', 'Frontend', 'Backend', 'Databases', 'Cloud / DevOps', 'AI / ML'] as const
const COLORS = ['#f43f5e', '#ec4899', '#8b5cf6', '#6366f1', '#0ea5e9', '#14b8a6'] as const

const REGEX: Record<(typeof FAMILIES)[number], RegExp> = {
  'Languages': /\b(python|java|c\+\+|c#|javascript|typescript|ruby|go|rust|kotlin|swift|php|scala)\b/i,
  'Frontend': /\b(html|css|react|next|vue|angular|tailwind|sass|bootstrap|redux)\b/i,
  'Backend': /\b(node|express|django|flask|spring|fastapi|rails|nestjs|laravel)\b/i,
  'Databases': /\b(sql|mysql|postgres|mongodb|redis|elasticsearch|cassandra|sqlite|oracle)\b/i,
  'Cloud / DevOps': /\b(aws|azure|gcp|docker|kubernetes|terraform|ansible|jenkins|ci\/cd|github actions)\b/i,
  'AI / ML': /\b(machine learning|tensorflow|pytorch|keras|sklearn|nlp|computer vision|llm|generative ai|pandas|numpy)\b/i,
}

export function ResumeSkillRadar({ skills }: { skills: string }) {
  const counts = useMemo(() => {
    const list = String(skills ?? '').split(/[,\n;]/).map((s) => s.trim()).filter(Boolean)
    return FAMILIES.map((f) => {
      const re = REGEX[f]
      // Count distinct occurrences in the resume — same skill mentioned twice
      // still counts as one, but a list of "python, java" gives 1+1 = 2.
      return list.reduce((sum, name) => sum + (re.test(name) ? 1 : 0), 0)
    })
  }, [skills])
  const total = counts.reduce((s, n) => s + n, 0)
  const max = Math.max(1, ...counts)

  // Geometry — regular hexagon centred in a 200×180 viewBox.
  const cx = 100
  const cy = 90
  const r = 64
  const step = (Math.PI * 2) / FAMILIES.length
  // Rotate so the first axis points straight up.
  const angleAt = (i: number) => -Math.PI / 2 + i * step
  const point = (i: number, radius: number) => {
    const a = angleAt(i)
    return { x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a) }
  }
  // Concentric radar guide rings
  const ticks = [0.25, 0.5, 0.75, 1]
  // The filled polygon path
  const polyPoints = counts.map((c, i) => {
    const p = point(i, (c / max) * r)
    return `${p.x},${p.y}`
  }).join(' ')

  if (total === 0) return <p className="text-sm text-slate-500">—</p>

  return (
    <div key={skills} className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,8rem)_minmax(0,1fr)] sm:items-center">
      <svg viewBox="0 0 200 180" className="mx-auto w-full max-w-[144px] sm:w-32" role="img" aria-label="Resume skill coverage radar">
        {/* Concentric guide rings */}
        {ticks.map((t) => (
          <polygon
            key={t}
            points={FAMILIES.map((_, i) => { const p = point(i, r * t); return `${p.x},${p.y}` }).join(' ')}
            fill="none"
            stroke="#e2e8f0"
            strokeWidth={1}
            strokeDasharray={t === 1 ? '0' : '2 3'}
          />
        ))}
        {/* Colored spokes correspond to the family dots in the legend. */}
        {FAMILIES.map((f, i) => (
          <line
            key={f}
            x1={cx}
            y1={cy}
            x2={point(i, r).x}
            y2={point(i, r).y}
            stroke={COLORS[i]}
            strokeOpacity={0.35}
            strokeWidth={1}
          />
        ))}
        {/* The actual coverage polygon */}
        <polygon
          points={polyPoints}
          fill="rgba(244, 63, 94, 0.18)"
          stroke="#f43f5e"
          strokeWidth={2}
          className="line-path"
          strokeLinejoin="round"
        />
        {/* Vertex dots (one per family axis) */}
        {counts.map((c, i) => {
          const p = point(i, (c / max) * r)
          return (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={3}
              fill={COLORS[i]}
              stroke="white"
              strokeWidth={1.5}
              className="dot-pop"
              style={{ animationDelay: `${800 + i * 90}ms` }}
            />
          )
        })}
      </svg>
      <ul className="grid min-w-0 gap-1.5 text-xs">
        {FAMILIES.map((f, i) => (
          <li key={f} className="flex min-w-0 items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
            <span className="min-w-0 flex-1 truncate font-semibold text-slate-700">{f}</span>
            <span className="shrink-0 font-mono text-[11px] font-bold tabular-nums text-slate-600">{counts[i]}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
