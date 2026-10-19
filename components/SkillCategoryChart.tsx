'use client'

/**
 * SkillCategoryChart — a 6-slice animated donut/pie that rolls the student's
 * assessment-derived skills into core categories: Cognitive, AI Engineering,
 * Software Development, Core Subjects, Mental Maths and Soft Skills.
 *
 * Each slice is an SVG `<circle>` rendered with exact concentric alignment
 * (same center cx, cy and radius r) and positioned clockwise using SVG
 * `strokeDasharray` and `strokeDashoffset` — preventing bounding-box deformation
 * and eliminating hover jitter / flickering.
 */
import { useMemo, useState } from 'react'
import type { AssessmentSkillRollup } from '@/lib/assessmentSkills'

interface CategoryDef {
  id: string
  label: string
  emoji: string
  skills: string[]
  color: string
  bg: string
}

const CATEGORIES: CategoryDef[] = [
  {
    id: 'cognitive',
    label: 'Cognitive',
    emoji: '🧠',
    color: '#6366f1', // indigo-500
    bg: 'bg-indigo-50/70 dark:bg-slate-900/80 border-indigo-200/70 dark:border-indigo-500/30 text-indigo-700 dark:text-indigo-300',
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
    bg: 'bg-violet-50/70 dark:bg-slate-900/80 border-violet-200/70 dark:border-violet-500/30 text-violet-700 dark:text-violet-300',
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
    bg: 'bg-sky-50/70 dark:bg-slate-900/80 border-sky-200/70 dark:border-sky-500/30 text-sky-700 dark:text-sky-300',
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
    bg: 'bg-pink-50/70 dark:bg-slate-900/80 border-pink-200/70 dark:border-pink-500/30 text-pink-700 dark:text-pink-300',
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
    bg: 'bg-amber-50/70 dark:bg-slate-900/80 border-amber-200/70 dark:border-amber-500/30 text-amber-700 dark:text-amber-300',
    skills: [
      'Quantitative Aptitude', 'Verbal Ability', 'Business & Financial Aptitude',
    ],
  },
  {
    id: 'soft',
    label: 'Soft Skills',
    emoji: '🗣️',
    color: '#10b981', // emerald-500
    bg: 'bg-emerald-50/70 dark:bg-slate-900/80 border-emerald-200/70 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300',
    skills: [
      'Behavioural Interviewing', 'Listening Comprehension', 'Spoken Communication',
      'Reading Comprehension', 'Written Communication', 'English Communication',
      'Teamwork', 'Accountability', 'Workplace Competencies', 'Technical Communication',
    ],
  },
]

export interface AssessedSkillItem {
  name: string
  score: number
}

export interface CategoryStat {
  id: string
  label: string
  emoji: string
  color: string
  bg: string
  percent: number
  share: number
  count: number
  unassessed: number
  assessedSkills: AssessedSkillItem[]
  unassessedSkills: string[]
}

function buildIndex(skills: AssessmentSkillRollup[]): Map<string, AssessmentSkillRollup> {
  const idx = new Map<string, AssessmentSkillRollup>()
  for (const s of skills) idx.set(s.name.trim().toLowerCase(), s)
  return idx
}

function buildStats(skills: AssessmentSkillRollup[]): {
  stats: CategoryStat[]
  max: number
  assessedAny: boolean
  overallAvg: number
  total: number
} {
  const idx = buildIndex(skills)
  let assessedAny = false

  const rawStats = CATEGORIES.map((c) => {
    let totalScore = 0
    let count = 0
    let unassessed = 0
    const assessedSkills: AssessedSkillItem[] = []
    const unassessedSkills: string[] = []

    for (const name of c.skills) {
      const hit = idx.get(name.toLowerCase())
      if (hit && hit.score > 0) {
        totalScore += hit.score
        count++
        assessedAny = true
        assessedSkills.push({
          name: hit.name || name,
          score: Math.round(hit.score * 10) / 10,
        })
      } else {
        unassessed++
        unassessedSkills.push(name)
      }
    }

    assessedSkills.sort((a, b) => b.score - a.score)

    return {
      id: c.id,
      label: c.label,
      emoji: c.emoji,
      color: c.color,
      bg: c.bg,
      percent: count ? Math.round((totalScore / count) * 10) / 10 : 0,
      share: 0,
      count,
      unassessed,
      assessedSkills,
      unassessedSkills,
    }
  })

  const total = rawStats.reduce((s, c) => s + c.percent, 0)
  const assessedStats = rawStats.filter((s) => s.count > 0)
  const overallAvg = assessedStats.length
    ? Math.round(
        (assessedStats.reduce((sum, s) => sum + s.percent, 0) / assessedStats.length) * 10
      ) / 10
    : 0

  const stats: CategoryStat[] = rawStats.map((s) => ({
    ...s,
    share: total > 0 ? Math.round((s.percent / total) * 100) : 0,
  }))

  return {
    stats,
    max: Math.max(1, ...stats.map((s) => s.percent)),
    assessedAny,
    overallAvg,
    total,
  }
}

/**
 * Concentric SVG Donut:
 * Every slice circle shares the exact same center (cx, cy) and radius r.
 * Rotated once via the parent group so 0 sits cleanly at 12 o'clock.
 * Constant stroke width and container-level onMouseLeave prevent all hover jitter.
 */
function Pie({
  stats,
  total,
  overallAvg,
  activeId,
  selectedId,
  onHover,
  onSelect,
}: {
  stats: CategoryStat[]
  total: number
  overallAvg: number
  activeId: string | null
  selectedId: string | null
  onHover: (id: string | null) => void
  onSelect: (id: string) => void
}) {
  const size = 180
  const cx = size / 2
  const cy = size / 2
  const r = 62
  const strokeWidth = 20

  const activeSlices = stats.filter((s) => s.percent > 0)
  const sliceCount = activeSlices.length
  // Crisp uniform gap between slices when multiple slices exist
  const gap = total > 0 && sliceCount > 1 ? 1.5 : 0
  const totalGap = gap * sliceCount
  const availableLength = Math.max(0, 100 - totalGap)

  let currentOffset = 0
  const activeStat = stats.find((s) => s.id === activeId) || null

  return (
    <div className="relative mx-auto w-full max-w-[200px] select-none">
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="w-full h-auto block"
        role="img"
        aria-label="Skill category distribution pie chart"
        onMouseLeave={() => onHover(null)}
      >
        {/* Background track circle */}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-slate-100 dark:text-slate-800 transition-colors"
          onClick={() => onSelect('')}
        />

        {/* Rotated group: angle 0 at 12 o'clock */}
        {total > 0 && (
          <g transform={`rotate(-90 ${cx} ${cy})`}>
            {activeSlices.map((s) => {
              const share = (s.percent / total) * availableLength
              if (share <= 0) return null

              const offset = currentOffset
              currentOffset += share + gap

              const isSelected = selectedId === s.id
              const isActive = activeId === s.id
              const isDimmed = activeId !== null && !isActive

              return (
                <circle
                  key={s.id}
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill="none"
                  pathLength={100}
                  stroke={s.color}
                  strokeDasharray={`${share} ${100 - share}`}
                  strokeDashoffset={-offset}
                  strokeWidth={strokeWidth}
                  strokeLinecap="round"
                  className="pie-slice"
                  role="button"
                  tabIndex={0}
                  aria-pressed={isSelected}
                  aria-label={`${s.label}: ${s.percent}% average score (${s.count} skill${
                    s.count === 1 ? '' : 's'
                  } assessed)`}
                  onMouseEnter={() => onHover(s.id)}
                  onClick={(e) => {
                    e.stopPropagation()
                    onSelect(s.id)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onSelect(s.id)
                    }
                  }}
                  style={{
                    opacity: isDimmed ? 0.35 : 1,
                    filter: isActive ? `drop-shadow(0 0 6px ${s.color}aa) brightness(1.2)` : 'none',
                    cursor: 'pointer',
                    transition: 'opacity 0.15s ease, filter 0.15s ease',
                  }}
                >
                  <title>{`${s.label}: ${s.percent}% score (${s.share}% of chart, ${
                    s.count
                  } assessed skills: ${s.assessedSkills
                    .map((sk) => `${sk.name} ${sk.score}%`)
                    .join(', ')})`}</title>
                </circle>
              )
            })}
          </g>
        )}
      </svg>

      {/* Donut Center Display */}
      <div
        className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center px-4"
        aria-live="polite"
      >
        {activeStat ? (
          <div className="flex flex-col items-center justify-center transition-all">
            <span className="text-base sm:text-lg leading-none" aria-hidden>
              {activeStat.emoji}
            </span>
            <span className="font-mono text-xl sm:text-2xl font-black text-slate-900 dark:text-white tabular-nums leading-tight tracking-tight mt-0.5 animate-stat-in">
              {activeStat.percent}%
            </span>
            <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 truncate max-w-[85px] leading-tight">
              {activeStat.label}
            </span>
            <span className="text-[9px] font-bold text-indigo-600 dark:text-indigo-400 leading-tight mt-0.5">
              {activeStat.count} {activeStat.count === 1 ? 'skill' : 'skills'}
            </span>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center transition-all">
            <span className="font-mono text-xl sm:text-2xl font-black text-slate-800 dark:text-slate-100 tabular-nums leading-tight tracking-tight animate-stat-in">
              {overallAvg}%
            </span>
            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider leading-tight mt-0.5">
              Avg score
            </span>
            <span className="text-[9px] font-medium text-indigo-500 dark:text-indigo-400 leading-tight mt-0.5">
              Hover / click
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

export function SkillCategoryChart({ skills }: { skills: AssessmentSkillRollup[] }) {
  const { stats, assessedAny, overallAvg, total } = useMemo(() => buildStats(skills), [skills])

  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const activeId = hoveredId || selectedId
  const activeStat = stats.find((s) => s.id === activeId) || null
  const selectedStat = stats.find((s) => s.id === selectedId) || null
  const hoveredStat = stats.find((s) => s.id === hoveredId) || null

  const handleSelect = (id: string) => {
    setSelectedId((prev) => (prev === id || !id ? null : id))
  }

  if (!assessedAny) {
    return (
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Complete an assessment and your skills will roll up into these six categories automatically.
      </p>
    )
  }

  return (
    <div key={skills.map((s) => `${s.key}:${s.score}`).join('|')} className="relative">
      {/* sm:items-start ensures the top of the Donut column never shifts vertically when content updates */}
      <div className="grid min-w-0 gap-4 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] sm:items-start">
        {/* Left column: Concentric Donut Chart + Category distribution / skills details */}
        <div className="min-w-0">
          <Pie
            stats={stats}
            total={total}
            overallAvg={overallAvg}
            activeId={activeId}
            selectedId={selectedId}
            onHover={setHoveredId}
            onSelect={handleSelect}
          />

          {/* Details below chart: Stable container that does not bounce layout */}
          <div className="mt-3 min-h-[50px]">
            {selectedStat ? (
              <div className="rounded-2xl border border-indigo-200/80 dark:border-indigo-800/60 bg-white/95 dark:bg-slate-900/95 p-3 shadow-md transition-all text-left animate-fade-in">
                <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-white/10 pb-1.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-sm" aria-hidden>
                      {selectedStat.emoji}
                    </span>
                    <span className="text-xs font-black text-slate-900 dark:text-white truncate">
                      {selectedStat.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="font-mono text-xs font-black text-indigo-600 dark:text-indigo-400 tabular-nums">
                      {selectedStat.percent}%
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedId(null)}
                      className="ml-1 text-[10px] font-semibold text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 underline"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div className="mt-2">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5 flex items-center justify-between">
                    <span>Skills in this category ({selectedStat.assessedSkills.length}):</span>
                  </div>

                  {selectedStat.assessedSkills.length > 0 ? (
                    <div className="flex flex-wrap gap-1 max-h-36 overflow-y-auto pr-1">
                      {selectedStat.assessedSkills.map((sk) => (
                        <span
                          key={sk.name}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50/90 dark:bg-slate-800/90 px-2 py-0.5 text-[10px] font-medium text-slate-700 dark:text-slate-200 shadow-2xs"
                        >
                          <span className="truncate max-w-[130px]">{sk.name}</span>
                          <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">{sk.score}%</span>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 italic">
                      No assessed skills in this category yet
                    </p>
                  )}

                  {selectedStat.unassessed > 0 && (
                    <p className="mt-1.5 text-[10px] text-slate-400 dark:text-slate-500 font-medium">
                      + {selectedStat.unassessed} more skill{selectedStat.unassessed === 1 ? '' : 's'} not
                      yet assessed
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center pt-1">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                  {hoveredStat ? `${hoveredStat.emoji} ${hoveredStat.label} (${hoveredStat.percent}%)` : 'Category distribution'}
                </p>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                  {hoveredStat ? `${hoveredStat.count} assessed · Click slice to pin details` : 'Hover or click any slice to see details'}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right column: Category rows with interactive hover/click and expanded skill chips on click */}
        <ul className="grid min-w-0 gap-2">
          {stats.map((c, i) => {
            const isSelected = selectedId === c.id
            const isHovered = hoveredId === c.id
            const isActive = isSelected || isHovered

            return (
              <li
                key={c.id}
                role="button"
                tabIndex={0}
                aria-pressed={isSelected}
                onClick={() => handleSelect(c.id)}
                onMouseEnter={() => setHoveredId(c.id)}
                onMouseLeave={() => setHoveredId(null)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    handleSelect(c.id)
                  }
                }}
                className={`animate-fade-up flex min-w-0 flex-col gap-1.5 rounded-xl border px-3 py-2.5 cursor-pointer transition-colors duration-150 ${
                  c.bg
                } ${
                  isActive
                    ? 'ring-2 ring-indigo-500/80 shadow-md !bg-white dark:!bg-slate-800'
                    : 'hover:border-slate-300 dark:hover:border-white/20'
                }`}
                style={{ animationDelay: `${120 + i * 80}ms` }}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span aria-hidden className="shrink-0 text-base leading-none">
                    {c.emoji}
                  </span>
                  <span className="min-w-0 flex-1 break-words text-xs font-black leading-tight text-slate-900 dark:text-white">
                    {c.label}
                  </span>
                  <span className="shrink-0 font-mono text-xs font-black tabular-nums text-slate-800 dark:text-slate-100">
                    {c.percent}%
                  </span>
                </div>
                <div className="ml-6 flex min-w-0 items-center gap-2">
                  <span className="min-w-0 flex-1 break-words text-[11px] font-semibold leading-snug text-slate-500 dark:text-slate-400">
                    {c.count} skill{c.count === 1 ? '' : 's'} assessed
                    {c.unassessed ? ` · ${c.unassessed} not yet` : ''}
                  </span>
                  <div className="h-1.5 w-10 shrink-0 overflow-hidden rounded-full bg-slate-200/70 dark:bg-white/10">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${Math.max(2, Math.min(100, c.percent))}%`,
                        background: c.color,
                      }}
                    />
                  </div>
                </div>

                {/* Show the assessed skills and percentages when pinned (selected) */}
                {isSelected && c.assessedSkills.length > 0 && (
                  <div className="ml-6 mt-1.5 pt-1.5 border-t border-slate-200/60 dark:border-white/10 animate-fade-in">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                      Assessed skills &amp; scores:
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {c.assessedSkills.map((sk) => (
                        <span
                          key={sk.name}
                          className="inline-flex items-center gap-1 rounded-md bg-white/95 dark:bg-slate-700/90 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700 dark:text-slate-200 shadow-2xs border border-slate-200 dark:border-white/10"
                        >
                          <span className="truncate max-w-[140px]">{sk.name}</span>
                          <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">{sk.score}%</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
