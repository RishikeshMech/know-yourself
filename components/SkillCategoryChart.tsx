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
 *
 * Interactivity:
 * - Hovering over a slice (or category row) displays the category's percentage,
 *   its distribution share, and the exact skills that are assessed in that category
 *   along with their individual percentage scores.
 * - Clicking a slice (or category row) pins that category active so the details
 *   and skill percentages remain visible. Clicking again deselects it.
 * - The center of the donut dynamically displays the percentage, label, and skill
 *   count of the hovered/clicked category (or the overall average when idle).
 */
import { useMemo, useState } from 'react'
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
  /** Average percent across the skills in this category that were assessed. */
  percent: number
  /** Share of total distribution in the pie chart. */
  share: number
  /** How many of the listed skills actually have a score (>0). */
  count: number
  /** How many of the listed skills are unassessed. */
  unassessed: number
  /** Assessed skills with individual percentage scores. */
  assessedSkills: AssessedSkillItem[]
  /** Skill names in this category not yet assessed. */
  unassessedSkills: string[]
}

/** Build a quick case-insensitive lookup so the dashboard stays robust if a
 *  candidate's stored skill name differs only by trailing whitespace. */
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

/** Interactive SVG donut/pie: each slice is a stroked `<circle>` whose `stroke-dasharray`
 *  reveals the right amount of perimeter. `pathLength="100"` normalises the
 *  circumference to 100 so we can compute `offset = 100 - share` directly. */
function Pie({
  stats,
  total,
  overallAvg,
  activeId,
  selectedId,
  onHover,
  onSelect,
  onMouseMove,
}: {
  stats: CategoryStat[]
  total: number
  overallAvg: number
  activeId: string | null
  selectedId: string | null
  onHover: (id: string | null) => void
  onSelect: (id: string) => void
  onMouseMove: (e: React.MouseEvent<SVGSVGElement>) => void
}) {
  const size = 180
  const cx = size / 2
  const cy = size / 2
  const r = 64

  const activeSlices = stats.filter((s) => s.percent > 0)
  const sliceCount = activeSlices.length
  // 1-unit gap between slices so segments stay visually distinct when multiple slices exist
  const gap = total > 0 && sliceCount > 1 ? Math.min(1.5, (sliceCount * 1.5) / total) : 0
  let offset = 0

  const activeStat = stats.find((s) => s.id === activeId) || null

  return (
    <div className="relative mx-auto w-full max-w-[200px] select-none">
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="w-full h-auto block"
        role="img"
        aria-label="Skill category distribution pie chart"
        onMouseMove={onMouseMove}
        onMouseLeave={() => onHover(null)}
      >
        {/* Background ring so empty categories/background are visible */}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth={22}
          className="cursor-pointer"
          onClick={() => onSelect('')}
        />
        {total > 0 &&
          activeSlices.map((s, i) => {
            const share = (s.percent / total) * (100 - gap * sliceCount)
            if (share <= 0) return null
            // Rotate each slice so the previous one ends and the next begins.
            const rotate = (offset / 100) * 360 - 90
            offset += share + gap

            const isSelected = selectedId === s.id
            const isActive = activeId === s.id
            const isDimmed = activeId !== null && !isActive

            return (
              <circle
                key={s.id}
                cx={cx}
                cy={cy}
                r={r}
                stroke={s.color}
                className="pie-slice is-drawing"
                pathLength={100}
                role="button"
                tabIndex={0}
                aria-pressed={isSelected}
                aria-label={`${s.label}: ${s.percent}% average score (${s.count} skill${
                  s.count === 1 ? '' : 's'
                } assessed)`}
                onMouseEnter={() => onHover(s.id)}
                onMouseLeave={() => onHover(null)}
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
                style={
                  {
                    ['--pie-len' as any]: `${share}`,
                    transform: `rotate(${rotate}deg)`,
                    transformOrigin: `${cx}px ${cy}px`,
                    animationDelay: `${i * 90}ms`,
                    strokeWidth: isActive ? 28 : isDimmed ? 20 : 22,
                    opacity: isDimmed ? 0.45 : 1,
                    filter: isActive ? `drop-shadow(0 2px 8px ${s.color}66)` : 'none',
                    cursor: 'pointer',
                    transition:
                      'stroke-width 0.22s cubic-bezier(.2,.8,.2,1), opacity 0.22s ease, filter 0.22s ease',
                  } as React.CSSProperties
                }
              >
                <title>{`${s.label}: ${s.percent}% score (${s.share}% of chart, ${
                  s.count
                } assessed skills: ${s.assessedSkills.map((sk) => `${sk.name} ${sk.score}%`).join(', ')})`}</title>
              </circle>
            )
          })}
      </svg>

      {/* Donut Center Display: Always clearly shows the percentage and category details */}
      <div
        className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center px-4"
        aria-live="polite"
      >
        {activeStat ? (
          <div className="flex flex-col items-center justify-center transition-all">
            <span className="text-base sm:text-lg leading-none" aria-hidden>
              {activeStat.emoji}
            </span>
            <span className="font-mono text-xl sm:text-2xl font-black text-slate-900 tabular-nums leading-tight tracking-tight mt-0.5">
              {activeStat.percent}%
            </span>
            <span className="text-[10px] font-bold text-slate-600 truncate max-w-[85px] leading-tight">
              {activeStat.label}
            </span>
            <span className="text-[9px] font-bold text-indigo-600 leading-tight mt-0.5">
              {activeStat.count} {activeStat.count === 1 ? 'skill' : 'skills'}
            </span>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center transition-all">
            <span className="font-mono text-xl sm:text-2xl font-black text-slate-700 tabular-nums leading-tight tracking-tight">
              {overallAvg}%
            </span>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider leading-tight mt-0.5">
              Avg score
            </span>
            <span className="text-[9px] font-medium text-slate-400 leading-tight mt-0.5">
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
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null)

  const activeId = hoveredId || selectedId
  const activeStat = stats.find((s) => s.id === activeId) || null
  const hoveredStat = stats.find((s) => s.id === hoveredId) || null

  const handleSelect = (id: string) => {
    setSelectedId((prev) => (prev === id || !id ? null : id))
  }

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    setMousePos({ x: e.clientX, y: e.clientY })
  }

  if (!assessedAny) {
    return (
      <p className="text-xs text-slate-500">
        Complete an assessment and your skills will roll up into these six categories automatically.
      </p>
    )
  }

  // Guard against tooltip overflowing screen edges
  const tooltipX =
    typeof window !== 'undefined' && mousePos && mousePos.x + 260 > window.innerWidth
      ? mousePos.x - 260
      : (mousePos?.x ?? 0) + 16
  const tooltipY =
    typeof window !== 'undefined' && mousePos && mousePos.y + 180 > window.innerHeight
      ? mousePos.y - 140
      : (mousePos?.y ?? 0) + 16

  return (
    <div key={skills.map((s) => `${s.key}:${s.score}`).join('|')} className="relative">
      <div className="grid min-w-0 gap-4 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] sm:items-center">
        {/* Left column: Interactive Donut Chart + Category distribution / skills details */}
        <div className="min-w-0 animate-fade-up">
          <Pie
            stats={stats}
            total={total}
            overallAvg={overallAvg}
            activeId={activeId}
            selectedId={selectedId}
            onHover={setHoveredId}
            onSelect={handleSelect}
            onMouseMove={handleMouseMove}
          />

          {/* Details below chart: shows Category Distribution, or details with skills and percentage */}
          {activeStat ? (
            <div className="mt-3 rounded-2xl border border-indigo-200 bg-white/95 p-3 shadow-md transition-all text-left animate-fade-in">
              <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-1.5">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-sm" aria-hidden>
                    {activeStat.emoji}
                  </span>
                  <span className="text-xs font-black text-slate-900 truncate">
                    {activeStat.label}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="font-mono text-xs font-black text-indigo-600 tabular-nums">
                    {activeStat.percent}%
                  </span>
                  <span className="text-[10px] text-slate-400 font-semibold">
                    ({activeStat.share}% share)
                  </span>
                </div>
              </div>

              <div className="mt-2">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center justify-between">
                  <span>Skills in this category ({activeStat.assessedSkills.length}):</span>
                  {selectedId === activeStat.id && (
                    <button
                      type="button"
                      onClick={() => setSelectedId(null)}
                      className="text-[10px] font-semibold text-slate-400 hover:text-slate-600 underline"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {activeStat.assessedSkills.length > 0 ? (
                  <div className="flex flex-wrap gap-1 max-h-36 overflow-y-auto pr-1">
                    {activeStat.assessedSkills.map((sk) => (
                      <span
                        key={sk.name}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50/90 px-2 py-0.5 text-[10px] font-medium text-slate-700 shadow-2xs"
                      >
                        <span className="truncate max-w-[130px]">{sk.name}</span>
                        <span className="font-mono font-bold text-indigo-600">{sk.score}%</span>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-[10px] text-slate-400 italic">
                    No assessed skills in this category yet
                  </p>
                )}

                {activeStat.unassessed > 0 && (
                  <p className="mt-1.5 text-[10px] text-slate-400 font-medium">
                    + {activeStat.unassessed} more skill{activeStat.unassessed === 1 ? '' : 's'} not
                    yet assessed
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="mt-2 text-center">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                Category distribution
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5">
                Hover or click any slice to see skill percentages
              </p>
            </div>
          )}
        </div>

        {/* Right column: Category rows with interactive hover/click and expanded skill chips */}
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
                className={`animate-fade-up flex min-w-0 flex-col gap-1.5 rounded-xl border px-3 py-2.5 cursor-pointer transition-all ${
                  c.bg
                } ${
                  isActive
                    ? 'ring-2 ring-indigo-500/80 shadow-md scale-[1.01] bg-white'
                    : 'hover:border-slate-300 hover:shadow-xs'
                }`}
                style={{ animationDelay: `${120 + i * 80}ms` }}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span aria-hidden className="shrink-0 text-base leading-none">
                    {c.emoji}
                  </span>
                  <span className="min-w-0 flex-1 break-words text-xs font-black leading-tight">
                    {c.label}
                  </span>
                  <span className="shrink-0 font-mono text-xs font-black tabular-nums">
                    {c.percent}%
                  </span>
                </div>
                <div className="ml-6 flex min-w-0 items-center gap-2">
                  <span className="min-w-0 flex-1 break-words text-[11px] font-semibold leading-snug opacity-80">
                    {c.count} skill{c.count === 1 ? '' : 's'} assessed
                    {c.unassessed ? ` · ${c.unassessed} not yet` : ''}
                  </span>
                  <div className="h-1.5 w-10 shrink-0 overflow-hidden rounded-full bg-white/70">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.max(2, Math.min(100, c.percent))}%`,
                        background: c.color,
                        transformOrigin: 'left center',
                        animation: 'bar-grow .9s cubic-bezier(.22,.8,.32,1) both',
                        animationDelay: `${200 + i * 90}ms`,
                      }}
                    />
                  </div>
                </div>

                {/* Show the assessed skills and percentages when hovered or selected */}
                {isActive && c.assessedSkills.length > 0 && (
                  <div className="ml-6 mt-1.5 pt-1.5 border-t border-slate-200/60 animate-fade-in">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                      Assessed skills &amp; scores:
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {c.assessedSkills.map((sk) => (
                        <span
                          key={sk.name}
                          className="inline-flex items-center gap-1 rounded-md bg-white/95 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700 shadow-2xs border border-slate-200"
                        >
                          <span className="truncate max-w-[140px]">{sk.name}</span>
                          <span className="font-mono font-bold text-indigo-600">{sk.score}%</span>
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

      {/* Floating tooltip on mouse hover over pie slices */}
      {hoveredStat && mousePos && (
        <div
          className="pointer-events-none fixed z-50 rounded-2xl border border-slate-200 bg-white/95 px-3.5 py-2.5 shadow-xl backdrop-blur-md transition-all duration-75 text-left"
          style={{
            left: `${tooltipX}px`,
            top: `${tooltipY}px`,
            maxWidth: '260px',
            minWidth: '180px',
          }}
        >
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-1.5">
            <span className="flex items-center gap-1.5 text-xs font-black text-slate-800">
              <span aria-hidden>{hoveredStat.emoji}</span>
              <span>{hoveredStat.label}</span>
            </span>
            <span className="font-mono text-xs font-black text-indigo-600 tabular-nums">
              {hoveredStat.percent}%
            </span>
          </div>

          <div className="mt-1.5">
            <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              {hoveredStat.assessedSkills.length > 0
                ? `Skills assessed (${hoveredStat.assessedSkills.length}):`
                : 'No skills assessed yet'}
            </div>
            {hoveredStat.assessedSkills.length > 0 ? (
              <div className="flex flex-col gap-1 max-h-36 overflow-y-auto pr-0.5">
                {hoveredStat.assessedSkills.slice(0, 6).map((sk) => (
                  <div
                    key={sk.name}
                    className="flex items-center justify-between gap-2 text-[10px] leading-tight"
                  >
                    <span className="text-slate-600 truncate">{sk.name}</span>
                    <span className="font-mono font-bold text-slate-900 shrink-0">
                      {sk.score}%
                    </span>
                  </div>
                ))}
                {hoveredStat.assessedSkills.length > 6 && (
                  <span className="text-[9px] text-slate-400 font-medium pt-0.5">
                    +{hoveredStat.assessedSkills.length - 6} more skills
                  </span>
                )}
              </div>
            ) : (
              <span className="text-[10px] text-slate-400 italic">0% score</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
