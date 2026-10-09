'use client'

/**
 * SkillCoverageChart — a horizontal bar chart that visualises the breadth of
 * the candidate's self-reported or resume-detected skills.
 *
 * Self-reported / resume skills don't carry a numeric score, so we draw each
 * as a bar whose width represents how many other skills in the same family
 * the candidate also listed. Bars animate in left-to-right on mount and the
 * chart re-plays whenever the input list changes.
 */
import { useMemo } from 'react'

/** Loose skill families — used to group related skills into a "coverage"
 *  bucket. The chart shows the top 6 families by skill count; everything
 *  else rolls up under "Other" so the chart never explodes. */
const FAMILY: Array<[RegExp, string]> = [
  [/\b(python|java|c\+\+|c#|javascript|typescript|ruby|go|rust|kotlin|swift|php|scala)\b/i, 'Languages'],
  [/\b(html|css|react|next|vue|angular|tailwind|sass|bootstrap|redux)\b/i, 'Frontend'],
  [/\b(node|express|django|flask|spring|fastapi|rails|nestjs|laravel)\b/i, 'Backend'],
  [/\b(sql|mysql|postgres|mongodb|redis|elasticsearch|cassandra|sqlite|oracle)\b/i, 'Databases'],
  [/\b(aws|azure|gcp|docker|kubernetes|terraform|ansible|jenkins|ci\/cd|github actions)\b/i, 'Cloud / DevOps'],
  [/\b(machine learning|tensorflow|pytorch|keras|sklearn|nlp|computer vision|llm|generative ai|pandas|numpy)\b/i, 'AI / ML'],
  [/\b(git|jira|figma|linux|bash|shell|excel|powerbi|tableau)\b/i, 'Tools'],
  [/\b(api|rest|graphql|grpc|microservices|kafka|rabbitmq|websocket)\b/i, 'APIs'],
  [/\b(testing|jest|pytest|junit|selenium|cypress|playwright)\b/i, 'Testing'],
  [/\b(communication|leadership|teamwork|presentation|writing|public speaking)\b/i, 'Soft Skills'],
]

function familyOf(name: string): string {
  for (const [re, label] of FAMILY) if (re.test(name)) return label
  return 'Other'
}

interface CoverageBar {
  family: string
  count: number
  /** Shortest, most representative skill name in the family. */
  highlight: string
  /** Pick a stable colour per family. */
  color: string
}

const COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#0ea5e9', '#10b981', '#f43f5e', '#a855f7', '#14b8a6', '#64748b',
]

export function SkillCoverageChart({ skills, palette }: { skills: string; palette: 'indigo' | 'rose' }) {
  const bars = useMemo<CoverageBar[]>(() => {
    const list = String(skills ?? '')
      .split(/[,\n;]/)
      .map((s) => s.trim())
      .filter(Boolean)
    if (!list.length) return []
    const grouped = new Map<string, { count: number; first: string }>()
    for (const name of list) {
      const f = familyOf(name)
      const cur = grouped.get(f) || { count: 0, first: name }
      cur.count++
      grouped.set(f, cur)
    }
    const all = [...grouped.entries()]
      .map(([family, v], i) => ({
        family,
        count: v.count,
        highlight: v.first,
        color: COLORS[i % COLORS.length],
      }))
      .sort((a, b) => b.count - a.count)
    const top = all.slice(0, 6)
    // Re-stamp colours deterministically by sorted rank so the palette stays
    // stable when the input list grows or shrinks.
    return top.map((b, i) => ({ ...b, color: COLORS[i % COLORS.length] }))
  }, [skills])

  if (!bars.length) {
    return <p className="text-xs text-slate-400">—</p>
  }

  const max = Math.max(1, ...bars.map((b) => b.count))
  const headerTint = palette === 'indigo'
    ? 'text-indigo-600'
    : 'text-rose-600'

  return (
    <div key={skills} className="space-y-2">
      {bars.map((b, i) => (
        <div key={b.family} className="flex items-center gap-2 text-[11px]">
          <div className={`w-20 shrink-0 truncate font-bold ${headerTint}`} title={b.family}>{b.family}</div>
          <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
            <div
              className="bar-grow h-full rounded-full"
              style={{
                width: `${(b.count / max) * 100}%`,
                background: `linear-gradient(90deg, ${b.color}cc, ${b.color})`,
                animationDelay: `${i * 80}ms`,
              }}
            />
          </div>
          <div className="w-12 shrink-0 text-right font-mono text-[10px] font-bold text-slate-500">{b.count} skill{b.count === 1 ? '' : 's'}</div>
        </div>
      ))}
    </div>
  )
}
