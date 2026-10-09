import Link from 'next/link'
import { ArrowUpRight, FileText, Lightbulb, Sparkles } from 'lucide-react'
import type { AssessmentSkillRollup } from '@/lib/assessmentSkills'

/** Next actions are drawn from real skill evidence and resume feedback, not a fixed checklist. */
export function ReadinessSidebar({ resume, skills, hasAssessment }: {
  resume: any
  skills: AssessmentSkillRollup[]
  hasAssessment: boolean
}) {
  const focus = [...skills].sort((a, b) => a.score - b.score).slice(0, 2)
  const gaps: string[] = (resume?.feedback?.gaps?.length ? resume.feedback.gaps : resume?.feedback?.suggestions || []).slice(0, 2)
  const steps = [
    ...focus.map(s => `Practise ${s.name} — currently ${Math.round(s.score)}% across your assessments.`),
    ...gaps.map(g => String(g)),
  ].slice(0, 3)
  if (!steps.length) steps.push(hasAssessment ? 'Review your assessment reports for section-by-section improvement ideas.' : 'Take your first assessment to unlock a personal skill map.')
  if (!resume && steps.length < 3) steps.push('Upload a resume to discover skills and tailored feedback.')

  return (
    <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start" aria-label="Resume and next steps">
      <div className="overflow-hidden rounded-[24px] border border-indigo-100 bg-gradient-to-br from-white via-indigo-50/50 to-violet-50/70 p-5 shadow-sm">
        <div className="flex items-center gap-2 text-sm font-black text-slate-900"><span className="rounded-xl bg-indigo-100 p-2 text-indigo-600"><FileText className="h-4 w-4" /></span> Resume health</div>
        {resume ? (
          <>
            <div className="mt-4 flex items-center gap-4">
              <div className="relative flex h-20 w-20 shrink-0 items-center justify-center rounded-full" role="img" aria-label={`Resume score ${resume.resume_score} out of 100`} style={{ background: `conic-gradient(#6366f1 ${Math.max(0, Math.min(100, Number(resume.resume_score) || 0))}%, #e2e8f0 0)` }}>
                <span className="flex h-[68px] w-[68px] items-center justify-center rounded-full bg-white text-2xl font-black text-indigo-600">{resume.resume_score}</span>
              </div>
              <div><p className="text-xs font-bold text-slate-700">out of 100</p><p className="mt-1 text-xs leading-relaxed text-slate-500">Your resume analysis, at a glance.</p></div>
            </div>
            {(resume.feedback?.strengths || []).length > 0 && <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50/80 p-3"><p className="text-[10px] font-black uppercase tracking-wide text-emerald-700">What’s working</p><p className="mt-1 text-xs leading-relaxed text-slate-700">{resume.feedback.strengths[0]}</p></div>}
          </>
        ) : <p className="mt-3 text-xs leading-relaxed text-slate-600">Your resume score and strengths will appear after you upload a resume.</p>}
        <Link href="/resume?edit=1" className="mt-4 inline-flex items-center gap-1 text-xs font-black text-indigo-600 hover:text-indigo-800">{resume ? 'Improve my resume' : 'Upload my resume'} <ArrowUpRight className="h-3.5 w-3.5" /></Link>
      </div>

      <div className="relative overflow-hidden rounded-[24px] bg-gradient-to-br from-indigo-700 via-violet-700 to-fuchsia-600 p-5 text-white shadow-lg shadow-indigo-200/60">
        <div aria-hidden className="pointer-events-none absolute -right-12 -top-14 h-40 w-40 rounded-full border border-white/20 bg-white/10" />
        <div className="relative flex items-center gap-2 text-sm font-black"><Lightbulb className="h-5 w-5 text-amber-200" /> Your next best moves</div>
        <p className="relative mt-2 text-xs text-white/75">Based on your assessments and resume.</p>
        <ol className="relative mt-4 space-y-3">
          {steps.map((step, i) => <li key={`${i}-${step}`} className="flex gap-3 text-xs leading-relaxed"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-white/15 font-black">{i + 1}</span><span className="pt-1 text-white/95">{step}</span></li>)}
        </ol>
        {hasAssessment && <Link href="/dashboard/student#assessment-reports" className="relative mt-5 inline-flex items-center gap-1 text-xs font-bold text-white hover:underline"><Sparkles className="h-3.5 w-3.5" /> Explore my reports</Link>}
      </div>
    </aside>
  )
}
