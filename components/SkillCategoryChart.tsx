'use client'

/**
 * SkillCategoryChart — a 6-slice animated donut/pie that rolls the student's
 * long list of assessment-derived skills up into the categories they actually
 * care about: Cognitive, AI Engineering, Software Development, Core Subjects,
 * Mental Maths and Soft Skills.
 *
 * Each slice's arc length equals the **average** score of the skills in that
 * category, so a strong Cognitive profile shows a much bigger slice than a
 * weak AI-Engineering one even when both have the same number of skills.
 * The component is purely data-driven: change the `skills` prop and the chart
 * re-mounts via `key` to replay the entrance animation.
 */
import { useMemo } from 'react'
import type { AssessmentSkillRollup } from '@/lib/assessmentSkills'

interface CategoryDef {
  id: string
  label: string
  emoji: string
  /** Skill names that belong to this category (case-insensitive, trimmed). */
  skills: string[]
  /** Hex colour used for the slice (Tailwind 500/600 palette). */
  color: string
  /** Subtle background tone for the legend row. */
  bg: string
}

const CATEGORIES: CategoryDef[] = [
  {
    id: 'cognitive',
    label: 'Cognitive',
    emoji: '🧠',
    color: '#6366f1', // indigo-500
    bg: 'bg-indigo-50/70 border-indigo-200/70 text-indigo-700',
    skills: [
      'Logical Reasoning', 'Visual-spatial Reasoning', 'Decision Making',
      'Adaptability', 'Learning Mindset', 'Problem Solving', 'Cognitive Ability',
    ],
  },
  {
    id: 'ai',
    label: 'AI Engineering',
    emoji: '🤖',
    color: '#8b5cf6', // violet-500
    bg: 'bg-violet-50/70 border-violet-200/70 text-violet-700',
    skills: [
      'AI-assisted Debugging', 'AI Feature Development', 'AI-assisted Coding',
      'Prompt Engineering', 'AI Output Review', 'AI Literacy', 'Responsible AI',
      'Code Debugging', 'Code Debugging Concepts', 'Practical Code Debugging',
    ],
  },
  {
    id: 'swe',
    label: 'Software Development',
    emoji: '💻',
    color: '#0ea5e9', // sky-500
    bg: 'bg-sky-50/70 border-sky-200/70 text-sky-700',
    skills: [
      'Operating Systems', 'Database Management (DBMS)', 'Computer Networks',
      'Object-Oriented Programming', 'Computer Architecture', 'Compilers & Runtimes',
      'SQL', 'Database Concepts', 'Software Design Principles', 'Design Patterns',
      'Object Modelling', 'Scalable System Design', 'System Data & Storage',
      'Messaging & Async Systems', 'System Reliability', 'System Architecture',
      'Software Testing', 'Software Delivery', 'DevOps & Cloud', 'API Design',
      'HTTP & REST', 'Web Security', 'Frontend Development', 'Data Structures',
    ],
  },
  {
    id: 'core',
    label: 'Core Subjects',
    emoji: '📚',
    color: '#ec4899', // pink-500
    bg: 'bg-pink-50/70 border-pink-200/70 text-pink-700',
    skills: [
      'Data Structures & Algorithms', 'Algorithm Analysis', 'Coding Problems',
      'Programming Fundamentals', 'Code Tracing & Pseudocode',
    ],
  },
  {
    id: 'maths',
    label: 'Mental Maths',
    emoji: '🧮',
    color: '#f59e0b', // amber-500
    bg: 'bg-amber-50/70 border-amber-200/70 text-amber-700',
    skills: [
      'Quantitative Aptitude', 'Verbal Ability', 'Business & Financial Aptitude',
    ],
  },
  {
    id: 'soft',
    label: 'Soft Skills',
    emoji: '🗣️',
    color: '#10b981', // emerald-500
    bg: 'bg-emerald-50/70 border-emerald-200/70 text-emerald-700',
    skills: [
      'Behavioural Interviewing', 'Listening Comprehension', 'Spoken Communication',
      'Reading Comprehension', 'Written Communication', 'English Communication',
      'Teamwork', 'Accountability', 'Workplace Competencies', 'Technical Communication',
    ],
  },
]

interface CategoryStat {
  id: string
  label: string
  emoji: string
  color: string
  bg: string
  /** Average percent across the skills in this category that were assessed. */
  percent: number
  /** How many of the listed skills actually have a score (>0). */
  count: number
  /** How many of the listed skills are unassessed. */
  unassessed: number
}

/** Build a quick case-insensitive lookup so the dashboard stays robust if a
 *  candidate's stored skill name differs only by trailing whitespace. */
function buildIndex(skills: AssessmentSkillRollup[]): Map<string, AssessmentSkillRollup> {
  const idx = new Map<string, AssessmentSkillRollup>()
  for (const s of skills) idx.set(s.name.trim().toLowerCase(), s)
  return idx
}

function buildStats(skills: AssessmentSkillRollup[]): { stats: CategoryStat[]; max: number; assessedAny: boolean } {
  const idx = buildIndex(skills)
  let assessedAny = false
  const stats: CategoryStat[] = CATEGORIES.map((c) => {
    let total = 0
    let count = 0
    let unassessed = 0
    for (const name of c.skills) {
      const hit = idx.get(name.toLowerCase())
      if (hit && hit.score > 0) { total += hit.score; count++; assessedAny = true }
      else unassessed++
    }
    return {
      id: c.id, label: c.label, emoji: c.emoji, color: c.color, bg: c.bg,
      percent: count ? Math.round((total / count) * 10) / 10 : 0,
      count, unassessed,
    }
  })
  return { stats, max: Math.max(1, ...stats.map((s) => s.percent)), assessedAny }
}

function polar(cx: number, cy: number, r: number, angleRad: number) {
  return { x: cx + r * Math.cos(angleRad), y: cy + r * Math.sin(angleRad) }
}

/** Tiny SVG donut/pie: each slice is a thick `<circle>` whose `stroke-dasharray`
 *  reveals the right amount of perimeter. `pathLength="100"` normalises the
 *  circumference to 100 so we can compute `offset = 100 - share` directly. */
function Pie({ stats, total }: { stats: CategoryStat[]; total: number }) {
  const size = 180
  const cx = size / 2
  const cy = size / 2
  const r = 64
  // 1-unit gap between slices so the segments stay visually distinct.
  const gap = total > 0 ? Math.min(1.5, (stats.length * 1.5) / total) : 0
  let offset = 0
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-[200px] mx-auto" role="img" aria-label="Skill category distribution">
      {/* Background ring so empty categories are still visible */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e2e8f0" strokeWidth={22} />
      {total > 0 && stats.map((s, i) => {
        const share = (s.percent / total) * (100 - gap * stats.length)
        if (share <= 0) return null
        // Rotate each slice so the previous one ends and the next begins.
        const rotate = (offset / 100) * 360 - 90
        offset += share + gap
        return (
          <circle
            key={s.id}
            cx={cx}
            cy={cy}
            r={r}
            stroke={s.color}
            className="pie-slice is-drawing"
            pathLength={100}
            // stroke-dasharray is the visible share; the rest is gap.
            // We bake the value into a CSS custom property so the keyframe
            // can grow the dasharray from 0 to that target.
            style={{
              ['--pie-len' as any]: `${share}`,
              transform: `rotate(${rotate}deg)`,
              animationDelay: `${i * 90}ms`,
            } as React.CSSProperties}
          />
        )
      })}
    </svg>
  )
}

export function SkillCategoryChart({ skills }: { skills: AssessmentSkillRollup[] }) {
  const { stats, assessedAny } = useMemo(() => buildStats(skills), [skills])
  // Sum of the per-category averages; the pie distributes by that sum so
  // larger categories visually take more space without the chart collapsing
  // when one category is at 0%.
  const total = stats.reduce((s, c) => s + c.percent, 0)

  if (!assessedAny) {
    return (
      <p className="text-xs text-slate-500">Complete an assessment and your skills will roll up into these six categories automatically.</p>
    )
  }

  return (
    // The `key` on the wrapper forces a remount when the underlying evidence
    // changes (e.g. after a new company mock is graded), which replays the
    // pie-draw + fade-up animations.
    <div key={skills.map((s) => `${s.key}:${s.score}`).join('|')}>
      <div className="grid min-w-0 gap-4 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] sm:items-center">
        <div className="min-w-0 animate-fade-up">
          <Pie stats={stats} total={total} />
          <p className="mt-2 text-center text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Category distribution</p>
        </div>
        <ul className="grid min-w-0 gap-2">
          {stats.map((c, i) => (
            <li
              key={c.id}
              className={`animate-fade-up flex min-w-0 flex-col gap-1.5 rounded-xl border px-3 py-2.5 ${c.bg}`}
              style={{ animationDelay: `${120 + i * 80}ms` }}
            >
              <div className="flex min-w-0 items-center gap-2">
                <span aria-hidden className="shrink-0 text-base leading-none">{c.emoji}</span>
                <span className="min-w-0 flex-1 break-words text-xs font-black leading-tight">{c.label}</span>
                <span className="shrink-0 font-mono text-xs font-black tabular-nums">{c.percent}%</span>
              </div>
              <div className="ml-6 flex min-w-0 items-center gap-2">
                <span className="min-w-0 flex-1 break-words text-[11px] font-semibold leading-snug opacity-80">
                  {c.count} skill{c.count === 1 ? '' : 's'} assessed{c.unassessed ? ` · ${c.unassessed} not yet` : ''}
                </span>
                <div className="h-1.5 w-10 shrink-0 overflow-hidden rounded-full bg-white/70">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${Math.max(2, Math.min(100, c.percent))}%`, background: c.color, transformOrigin: 'left center', animation: 'bar-grow .9s cubic-bezier(.22,.8,.32,1) both', animationDelay: `${200 + i * 90}ms` }}
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
