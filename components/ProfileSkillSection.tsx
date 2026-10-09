'use client'

/**
 * ProfileSkillSection — the "Your skills" panel on the student profile page.
 *
 * Three coordinated charts that auto-update from the same source data:
 *   1. Assessment-derived skills, rolled up into a 6-category animated
 *      donut (SkillCategoryChart).
 *   2. Self-reported skills from the profile form, drawn as an animated
 *      horizontal bar chart of family coverage (SkillCoverageChart).
 *   3. Resume-detected skills, drawn as an animated hexagonal radar
 *      (ResumeSkillRadar).
 *
 * The panel re-mounts (via React `key`) whenever the input strings change so
 * every entrance animation replays.
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
    <div key={remountKey} className="space-y-5">
      {/* Scored-skill donut + legend */}
      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-indigo-600">Assessment-mapped skills</div>
          <span className="rounded-full border border-indigo-100 bg-indigo-50/70 px-2 py-0.5 text-[10px] font-bold text-indigo-600">Scored</span>
        </div>
        <SkillCategoryChart skills={assessmentSkills} />
      </div>

      {/* Two claim-based mini-charts side-by-side on md+. */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200/70 bg-white/70 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-indigo-600">
              <span aria-hidden>🛠️</span> Self-reported
            </div>
            <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-600 border border-indigo-200/70">Claimed</span>
          </div>
          <SkillCoverageChart skills={selfReportedSkills} palette="indigo" />
        </div>
        <div className="rounded-2xl border border-slate-200/70 bg-white/70 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-rose-600">
              <span aria-hidden>📄</span> Resume-detected
            </div>
            <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-600 border border-rose-200/70">Parsed</span>
          </div>
          <ResumeSkillRadar skills={resumeSkills} />
        </div>
      </div>
    </div>
  )
}
