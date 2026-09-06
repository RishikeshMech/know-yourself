'use client'
/**
 * SkillGraph — radar ("skill graph") chart for the profile page.
 * Pure SVG, no dependencies. Shows 3–6 skills as axes with a filled value
 * polygon; renders an empty state when there are not enough skills yet.
 */

export interface SkillDatum {
  label: string
  value: number // 0..100
  sources?: string[] // e.g. ['assessment', 'resume']
}

const C = 130
const R = 92

function point(cx: number, cy: number, r: number, i: number, n: number): [number, number] {
  const a = (Math.PI * 2 * i) / n - Math.PI / 2
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)]
}

function ringPoints(n: number, r: number): string {
  return Array.from({ length: n }, (_, i) => point(C, C, r, i, n).join(',')).join(' ')
}

export function SkillGraph({ skills }: { skills: SkillDatum[] }) {
  const data = skills.slice(0, 6)
  const n = data.length

  if (n < 3) {
    return (
      <div className="flex flex-col items-center py-6">
        <svg viewBox="0 0 260 260" className="w-full max-w-[240px]">
          {[0.25, 0.5, 0.75, 1].map(f => (
            <polygon key={f} points={ringPoints(5, R * f)} fill="none" stroke="rgba(100,116,139,.18)" strokeWidth="1" strokeDasharray="4 5" />
          ))}
        </svg>
        <p className="mt-2 text-xs font-semibold text-slate-400">No verified skills yet</p>
        <p className="mt-1 text-[11px] text-slate-400">Take the assessment or upload your resume to unlock your skill graph.</p>
      </div>
    )
  }

  const poly = data.map((d, i) => point(C, C, Math.max(6, (Math.min(100, d.value) / 100) * R), i, n).join(',')).join(' ')

  return (
    <svg viewBox="0 0 260 260" className="w-full max-w-[280px] mx-auto">
      <defs>
        <linearGradient id="skill-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#4f46e5" />
          <stop offset="100%" stopColor="#a855f7" />
        </linearGradient>
      </defs>

      {/* grid rings */}
      {[0.25, 0.5, 0.75, 1].map(f => (
        <polygon key={f} points={ringPoints(n, R * f)} fill="none" stroke="rgba(100,116,139,.22)" strokeWidth="1" />
      ))}
      {/* axes */}
      {data.map((_, i) => {
        const [x, y] = point(C, C, R, i, n)
        return <line key={i} x1={C} y1={C} x2={x} y2={y} stroke="rgba(100,116,139,.22)" strokeWidth="1" />
      })}

      {/* value polygon */}
      <polygon points={poly} fill="url(#skill-grad)" fillOpacity=".32" stroke="url(#skill-grad)" strokeWidth="2" strokeLinejoin="round" />

      {/* value dots */}
      {data.map((d, i) => {
        const [x, y] = point(C, C, Math.max(6, (Math.min(100, d.value) / 100) * R), i, n)
        return <circle key={i} cx={x} cy={y} r="4" fill="#4f46e5" stroke="#fff" strokeWidth="1.5" />
      })}

      {/* labels */}
      {data.map((d, i) => {
        const [x, y] = point(C, C, R + 20, i, n)
        const anchor = Math.abs(x - C) < 12 ? 'middle' : x > C ? 'start' : 'end'
        return (
          <g key={i}>
            <text x={x} y={y} textAnchor={anchor} dominantBaseline="middle" className="fill-slate-600" fontSize="11" fontWeight="700">
              {d.label.length > 14 ? d.label.slice(0, 13) + '…' : d.label}
            </text>
            <text x={x} y={y + 13} textAnchor={anchor} dominantBaseline="middle" className="fill-slate-400" fontSize="9.5" fontWeight="600">
              {Math.round(Math.min(100, d.value))}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
