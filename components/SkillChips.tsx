'use client'

/**
 * Renders a comma-separated skills string ("python , sql") as individual chips
 * that pop in one by one (staggered `chip-in` animation) instead of showing the
 * raw text. Empty input renders a plain em dash, so callers can pass the
 * profile value through untouched.
 *
 * `key` includes the joined list so editing the skills remounts the chips and
 * replays the entrance animation.
 */
export function SkillChips({
  skills,
  icon,
  className = '',
}: {
  skills?: string
  /** Optional leading emoji (e.g. 🛠️) — omit to render chips only. */
  icon?: string
  className?: string
}) {
  // Dedupe case-insensitively ("python, Python" → one chip) keeping the first spelling.
  const seen = new Set<string>()
  const list: string[] = []
  for (const raw of String(skills ?? '').split(',')) {
    const skill = raw.trim()
    if (!skill) continue
    const key = skill.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    list.push(skill)
  }

  if (list.length === 0) return <span className={className}>—</span>

  return (
    <span key={list.join('|')} className={`inline-flex flex-wrap items-center gap-1.5 align-middle ${className}`}>
      {icon && <span aria-hidden className="mr-0.5">{icon}</span>}
      {list.map((skill, i) => (
        <span
          key={skill}
          className="chip !py-1 animate-chip"
          style={{ animationDelay: `${i * 90}ms` }}
        >
          {skill}
        </span>
      ))}
    </span>
  )
}
