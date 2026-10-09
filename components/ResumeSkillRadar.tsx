'use client'

/**
 * ResumeSkillRadar — a small SVG radar/spider chart that visualises the
 * breadth of the candidate's resume-detected skills across the six skill
 * families that matter most for a software role. Each axis is the count of
 * skills in that family; the resulting polygon shows the candidate's
 * coverage shape at a glance.
 *
 * Re-mounts (via React `key`) on every input change so the line-draw
 * animation replays when the resume is re-parsed.
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
  // Axis tick lines + labels
  const ticks = [0.25, 0.5, 0.75, 1]
  // The filled polygon path
  const polyPoints = counts.map((c, i) => {
    const p = point(i, (c / max) * r)
    return `${p.x},${p.y}`
  }).join(' ')

  if (total === 0) return <p className="text-xs text-slate-400">—</p>

  return (
    <div key={skills} className="flex items-center gap-3">
      <svg viewBox="0 0 200 180" className="w-32 shrink-0" role="img" aria-label="Resume skill coverage radar">
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
        {/* Axis lines + family labels */}
        {FAMILIES.map((f, i) => {
          const p = point(i, r + 14)
          return (
            <g key={f}>
              <line x1={cx} y1={cy} x2={point(i, r).x} y2={point(i, r).y} stroke="#cbd5e1" strokeWidth={0.8} />
              <text x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle" fontSize={8.5} fontWeight={700} fill="#475569">
                {f}
              </text>
            </g>
          )
        })}
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
              fill="#f43f5e"
              stroke="white"
              strokeWidth={1.5}
              className="dot-pop"
              style={{ animationDelay: `${800 + i * 90}ms` }}
            />
          )
        })}
      </svg>
      <ul className="min-w-0 flex-1 space-y-1.5 text-[11px]">
        {FAMILIES.map((f, i) => (
          <li key={f} className="flex items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
            <span className="truncate font-semibold text-slate-700">{f}</span>
            <span className="ml-auto shrink-0 font-mono text-[10px] font-bold text-slate-500">{counts[i]}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
