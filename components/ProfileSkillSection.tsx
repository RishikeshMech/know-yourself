'use client'

/**
 * ProfileSkillSection — the "Your skills" panel on the student profile page.
 *
 * Keep assessment evidence distinct from skills supplied by the candidate or
 * parsed from their resume. The secondary panels stack vertically because
 * this section sits in a relatively narrow profile sidebar; keeping each
 * chart full-width prevents labels and cards from colliding at desktop and
 * tablet breakpoints.
 */
import type { AssessmentSkillRollup } from '@/lib/assessmentSkills'
import { SkillCategoryChart } from '@/components/SkillCategoryChart'
import { SkillCoverageChart } from '@/components/SkillCoverageChart'
import { ResumeSkillRadar } from '@/components/ResumeSkillRadar'

export function ProfileSkillSection({
  assessmentSkills,
  selfReportedSkills = '',
  resumeSkills = '',
}: {
  assessmentSkills: AssessmentSkillRollup[]
  selfReportedSkills?: string
  resumeSkills?: string
}) {
  const remountKey = `${assessmentSkills.length}|${selfReportedSkills || ''}|${resumeSkills || ''}`
  return (
    <div key={remountKey} className="min-w-0 space-y-5">
      {/* Scored-skill donut + legend */}
      <div className="min-w-0">
        <div className="mb-2 flex min-w-0 flex-wrap items-center justify-between gap-2">
          <div className="text-[11px] font-black uppercase tracking-[0.14em] text-indigo-700">Assessment-mapped skills</div>
          <span className="shrink-0 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-bold text-indigo-700">Scored</span>
        </div>
        <SkillCategoryChart skills={assessmentSkills} />
      </div>

      {/* Separate source panels remain full-width in the profile sidebar. */}
      <div className="grid min-w-0 gap-3">
        <div className="min-w-0 rounded-2xl border border-slate-200/80 bg-white/75 p-4">
          <div className="mb-3 flex min-w-0 flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2 text-[11px] font-black uppercase tracking-[0.12em] text-indigo-700">
              <span aria-hidden>🛠️</span> <span>Self-reported</span>
            </div>
            <span className="shrink-0 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-bold text-indigo-700">Claimed</span>
          </div>
          <SkillCoverageChart skills={selfReportedSkills} palette="indigo" />
        </div>
        <div className="min-w-0 rounded-2xl border border-slate-200/80 bg-white/75 p-4">
          <div className="mb-3 flex min-w-0 flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2 text-[11px] font-black uppercase tracking-[0.12em] text-rose-700">
              <span aria-hidden>📄</span> <span>Resume-detected</span>
            </div>
            <span className="shrink-0 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-700">Parsed</span>
          </div>
          <ResumeSkillRadar skills={resumeSkills} />
        </div>
      </div>
    </div>
  )
}
