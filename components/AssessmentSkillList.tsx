'use client'

import type { AssessmentSkillRollup } from '@/lib/assessmentSkills'

function scoreTone(score: number): string {
  if (score >= 75) return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (score >= 50) return 'border-indigo-200 bg-indigo-50 text-indigo-700'
  if (score >= 30) return 'border-amber-200 bg-amber-50 text-amber-700'
  return 'border-rose-200 bg-rose-50 text-rose-700'
}

export function AssessmentSkillList({ skills }: { skills: AssessmentSkillRollup[] }) {
  if (!skills.length) return null
  return (
    <div className="flex flex-wrap gap-2">
      {skills.map((skill) => (
        <span
          key={skill.key}
          title={`${skill.name}: ${skill.score}% average across ${skill.sources.join(', ')}`}
          className="inline-flex max-w-full items-center gap-2 rounded-full border border-indigo-100 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm"
        >
          <span className="truncate">{skill.name}</span>
          <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-black tabular-nums ${scoreTone(skill.score)}`}>
            {skill.score}%
          </span>
          {skill.assessmentCount > 1 && (
            <span className="shrink-0 text-[10px] font-bold text-slate-400">×{skill.assessmentCount}</span>
          )}
        </span>
      ))}
    </div>
  )
}
