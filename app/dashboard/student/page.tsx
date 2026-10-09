'use client'
export const dynamic = 'force-dynamic'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FeedbackGate } from '@/components/FeedbackGate'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Navbar } from '@/components/Navbar'
import { useStore } from '@/lib/store'
import { isProfileComplete } from '@/lib/validate'
import { consumeJustSubmittedTicket } from '@/lib/justSubmitted'
import { readFeedbackDraft } from '@/lib/feedback'
import { flattenAssessmentResult } from '@/lib/resultShape'
import { getLiveUser } from '@/lib/session'
import { ReportModal } from '@/components/ReportModal'
import { SkillChips } from '@/components/SkillChips'
import { ReadinessSidebar } from '@/components/ReadinessSidebar'
import { assessmentVisibility } from '@/lib/assessmentVisibility'
import { CompanyCatalog } from '@/components/company/CompanyCatalog'
import { CalibiScoreCard } from '@/components/CalibiScoreCard'
import { AssessmentSkillList } from '@/components/AssessmentSkillList'
import { platformAssessmentSkills, rollupAssessmentSkills } from '@/lib/assessmentSkills'
import type { AttemptSummary } from '@/lib/company/types'
import { authenticatedFetch } from '@/lib/clientAuth'

function Inner(){
  const router = useRouter()
  const { user, profile, setProfile, resume, setResume, scores, setScores, scores2, setScores2, hydrated, setUser, reconcileForUser } = useStore()
  const [showReport, setShowReport] = useState(false)
  const [companyAttempts, setCompanyAttempts] = useState<AttemptSummary[]>([])
  const [companyLoaded, setCompanyLoaded] = useState(false)
  const onCompanyAttempts = useCallback((list: AttemptSummary[] | null) => { if (list) setCompanyAttempts(list); setCompanyLoaded(true) }, [])
  // Which assessment the report pop-up is showing (1 = CalibiAI, 2 = Capgemini mock).
  const [reportFor, setReportFor] = useState<1 | 2>(1)
  // True only on the landing right after the assessment was submitted.
  const [justCompleted, setJustCompleted] = useState(false)
  // True when the candidate left the feedback step unfinished ("Skip for now"),
  // so the dashboard can offer to finish it — without ever forcing them back.
  const [feedbackPendingDraft, setFeedbackPendingDraft] = useState(false)
  const ticketChecked = useRef(false)
  // True once the cached account has been validated against Supabase Auth.
  const [validated, setValidated] = useState(false)
  const assessmentSkillRollups = useMemo(() => rollupAssessmentSkills([
    ...platformAssessmentSkills(scores, 1),
    ...platformAssessmentSkills(scores2, 2),
    ...companyAttempts.flatMap(attempt => attempt.skillEvidence || []),
  ]), [scores, scores2, companyAttempts])

  // Protect the student dashboard: a signed-out visitor is sent to /login
  // smoothly, and a cached account is validated against Supabase Auth first so
  // a deleted-and-recreated account never sees the previous user's data.
  useEffect(()=>{
    if (!hydrated) return
    if (!user) { router.replace('/login'); return }
    let cancelled = false
    ;(async () => {
      const live = await getLiveUser()
      if (cancelled) return
      if (live === null) {
        localStorage.clear()
        setUser(null)
        router.replace('/login')
        return
      }
      if (live && live.id !== user.id) {
        await reconcileForUser(live)
      }
      setValidated(true)
    })()
    return () => { cancelled = true }
  // Only the account id controls this auth check. The store exposes setter
  // functions through context; depending on their render-time identities made
  // this effect run again after every profile/score update and created a
  // request storm (hundreds of /profiles and /assessment_results reads per
  // minute for one student).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[hydrated, user?.id])

  // The assessment page hands the candidate here after submitting and leaves a
  // single-use ticket behind, so this is where "assessment complete" is
  // acknowledged. `reactStrictMode` runs mount effects twice in development —
  // the ref keeps the (already consumed) ticket from being read twice.
  useEffect(()=>{
    if (ticketChecked.current) return
    ticketChecked.current = true
    setJustCompleted(consumeJustSubmittedTicket())
  },[])

  // Two housekeeping jobs on arrival:
  //  1. push any feedback/help request the server had to queue (a failed
  //     Supabase write is retried here, so nothing is ever lost), and
  //  2. notice an unfinished feedback draft so we can offer to complete it.
  useEffect(()=>{
    fetch('/api/feedback/flush', { method: 'POST' }).catch(()=>{})
    const checkDraft = () => setFeedbackPendingDraft(!!readFeedbackDraft())
    checkDraft()
    window.addEventListener('storage', checkDraft)
    return () => window.removeEventListener('storage', checkDraft)
  },[])

  // Enrich the (locally hydrated) store with the latest DB data when signed in.
  // Data is written through the store so the navbar and every other page sees
  // the same profile — including the full name set on the profile page.
  // Extracted into a `refresh` so it can also run on window focus (returning
  // from the edit-profile / update-resume pages) so the score is always live.
  // Focus events fire far more often than data changes (alt-tab, devtools,
  // notifications). Throttle background re-syncs to one per minute so a
  // student idling on the dashboard doesn't re-pull their rows constantly.
  const lastRefreshRef = useRef(0)
  const refresh = useCallback((force = false)=>{
    // Wait until the cached account has been validated (and possibly reconciled
    // to a different live user) so we never fetch the previous account's data.
    if(!user?.id || !validated) return
    const now = Date.now()
    if(!force && now - lastRefreshRef.current < 60000) return
    lastRefreshRef.current = now
    authenticatedFetch('/api/user/profile?user_id='+encodeURIComponent(user.id), { cache: 'no-store' }).then(r=>r.json()).then(data=>{
      if(data.profile) setProfile(data.profile)
    }).catch(()=>{})
    authenticatedFetch('/api/user/resume?student_id='+encodeURIComponent(user.id), { cache: 'no-store' }).then(r=>r.json()).then(data=>{
      if(data.analysis) setResume(data.analysis)
    }).catch(()=>{})
    authenticatedFetch('/api/user/scores?student_id='+encodeURIComponent(user.id), { cache: 'no-store' }).then(r=>r.json()).then(data=>{
      // Always write through — including `null` when there is no result, so a
      // stale cached score from a deleted/previous account never lingers on
      // screen or in the downloaded PDF.
      setScores(flattenAssessmentResult(data.result))
    }).catch(()=>{})
    authenticatedFetch('/api/user/scores?student_id='+encodeURIComponent(user.id)+'&assessment=2', { cache: 'no-store' }).then(r=>r.json()).then(data=>{
      setScores2(flattenAssessmentResult(data.result))
    }).catch(()=>{})
  // The setters are intentionally omitted: they are context wrappers whose
  // identity changes when the store updates. Including them recreates `refresh`,
  // which re-runs the forced refresh effect and loops back into Supabase.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[user?.id, validated])

  useEffect(()=>{
    refresh(true)
  },[refresh])

  // Re-sync when the user returns to this tab (e.g. after editing their profile
  // or resume on the dedicated pages) so the score reflects the latest data.
  useEffect(()=>{
    const onFocus = () => refresh()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  },[refresh])

  // The dashboard initially renders a hydration skeleton, so the browser's
  // first hash scroll can happen before the report list exists in the DOM.
  useEffect(() => {
    if (!hydrated || !validated || !companyLoaded || window.location.hash !== '#assessment-reports') return
    requestAnimationFrame(() => document.getElementById('assessment-reports')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }, [hydrated, validated, companyLoaded, scores, scores2])

  if (!hydrated) {
    return (
      <div>
        <Navbar />
        <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
          <div className="animate-pulse space-y-6">
            <div className="h-8 w-64 bg-slate-200/70 rounded-xl" />
            <div className="grid lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 glass-card h-80 bg-white/40" />
              <div className="glass-card h-80 bg-white/40" />
            </div>
          </div>
        </main>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="glass-card animate-fade-up flex items-center gap-3 px-6 py-4">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
          <span className="text-sm font-bold text-slate-700">Redirecting to login…</span>
        </div>
      </div>
    )
  }

  const onboarded = isProfileComplete(profile)
  const startHref = onboarded ? '/instructions' : '/onboarding'
  // Assessment 2 (the Capgemini 2027 mock) is unlocked only once the first
  // assessment has produced a result — a first-time user must take that one
  // first. Once unlocked it is, like the first, a single attempt.
  const { firstDone: assessment1Done, showFirstResultCard, showSecondLaunchCard } = assessmentVisibility(scores, scores2)

  return (
    <div>
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="animate-fade-up">
          <h1 className="text-2xl font-black text-slate-900">Hello{profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''} 👋</h1>
          <p className="text-slate-500 text-sm mt-1">Here's your readiness overview and next steps.</p>
        </div>

        {/* Shown once, right after the assessment is submitted. */}
        {justCompleted && (
          <div className="mt-6 animate-fade-up rounded-3xl border border-emerald-200 bg-emerald-50/80 p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <span className="text-2xl" aria-hidden>🎉</span>
                <div>
                  <div className="text-sm font-black text-emerald-800">Assessment submitted — your CalibiAI Score is updated</div>
                  <p className="mt-1 text-xs text-emerald-700">
                    This dashboard is your home from now on: score, full report, PDF download and resume all live here.
                  </p>
                </div>
              </div>
              {(scores2 || scores) && (
                <button onClick={() => { setReportFor(scores2 ? 2 : 1); setShowReport(true) }} className="btn-primary !py-2.5 text-xs">
                  View my full report →
                </button>
              )}
            </div>
          </div>
        )}

        {feedbackPendingDraft && (
          <div className="mt-6 animate-fade-up rounded-3xl border border-violet-200 bg-violet-50/80 p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <span className="text-2xl" aria-hidden>💬</span>
                <div>
                  <div className="text-sm font-black text-violet-800">You skipped the feedback step</div>
                  <p className="mt-1 text-xs text-violet-700">
                    It takes 20 seconds and tells us what to improve. We kept what you typed.
                  </p>
                </div>
              </div>
              <Link href="/feedback" className="btn-primary !py-2.5 text-xs" onClick={()=>setFeedbackPendingDraft(false)}>
                Give feedback →
              </Link>
            </div>
          </div>
        )}

        {/* Headline: the average of every completed assessment. */}
        <CalibiScoreCard a1={scores} a2={scores2} company={companyAttempts} companyLoaded={companyLoaded || !user?.id} startHref={startHref} onOpenReport={(no) => { setReportFor(no); setShowReport(true) }} />

        {/* Claimed skills stay separate from scored skills; resume and actions live beside the map. */}
        <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)] lg:items-start">
        <div className="glass-card !p-5 sm:!p-6 animate-fade-up">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><div className="text-[10px] font-black uppercase tracking-[0.18em] text-indigo-500">Your readiness</div><h2 className="mt-1 text-lg font-black text-slate-900">Your profile &amp; skill map</h2></div>
            <div className="flex gap-3">
              <Link href="/profile" className="text-xs font-semibold text-indigo-600">See my profile →</Link>
              <Link href="/edit-profile" className="text-xs font-semibold text-indigo-600">Edit profile →</Link>
            </div>
          </div>
          <div className="mt-3 grid gap-4 lg:grid-cols-3">
            <div className="space-y-2 text-sm text-slate-600">
              <div>👤 {profile?.full_name || '—'}</div>
              <div>🎓 {profile?.college || '—'}</div>
            </div>
            <div className="min-w-0">
              <div className="mb-1.5 text-[10px] font-black uppercase tracking-[0.15em] text-slate-500">Self-reported skills</div>
              <SkillChips skills={profile?.skills} icon="🛠️" />
            </div>
            <div className="min-w-0">
              <div className="mb-1.5 text-[10px] font-black uppercase tracking-[0.15em] text-slate-500">Resume-detected skills</div>
              <SkillChips skills={Array.isArray(resume?.parsed?.skills) ? resume.parsed.skills.join(', ') : ''} icon="📄" />
            </div>
          </div>
          <div className="mt-4 border-t border-slate-100 pt-4">
            <div className="mb-2 text-[10px] font-black uppercase tracking-[0.15em] text-indigo-600">Skills mapped from completed assessments</div>
            {assessmentSkillRollups.length ? (
              <AssessmentSkillList skills={assessmentSkillRollups} />
            ) : (
              <p className="text-xs text-slate-500">Complete an assessment and its scored skills will appear here automatically.</p>
            )}
          </div>
        </div>

        <ReadinessSidebar resume={resume} skills={assessmentSkillRollups} hasAssessment={!!(scores || scores2 || companyAttempts.some(a => a.status === 'submitted' || a.status === 'expired'))} />
        </div>

        {/* Show the first result here until assessment 2 is done. After that,
            all completed reports live exclusively in the CalibiAI Score above. */}
        {showFirstResultCard && scores && (
        <div className="mt-6">
          {/* Assessment 1 */}
          <div className="glass-card animate-fade-up" style={{animationDelay:'.05s'}}>
            <div className="text-sm font-bold text-slate-700">CalibiAI Assessment <span className="font-medium text-slate-400">· 120-minute core assessment</span></div>
            <div className="mt-4">
                <div className="flex items-baseline gap-3 flex-wrap">
                  <span className="text-5xl font-black text-gradient">{scores.total}</span>
                  <span className="text-slate-400 font-bold">/1000</span>
                  <span className="chip text-indigo-700 border-indigo-200 bg-indigo-50/70">Grade {scores.grade} · {scores.percentile}th percentile</span>
                </div>
                <div className="mt-5 grid sm:grid-cols-2 gap-2.5">
                  {[
                    ['English', scores.english?.total ?? 0, 200],['Problem Solving', scores.problem_solving ?? 0, 200],
                    ['AI Debugging', scores.ai_debugging ?? 0, 150],['AI Feature Dev', scores.ai_feature ?? 0, 150],
                    ['Prompt Eng', scores.prompt_engineering ?? 0, 100],['Cognitive', scores.cognitive?.total ?? 0, 200],
                  ].map(([k,v,m])=>(
                    <div key={k as string} className="panel p-3">
                      <div className="flex justify-between text-xs mb-1"><span className="text-slate-600 font-medium">{k}</span><span className="font-mono font-bold text-slate-700">{v}/{m}</span></div>
                      <div className="h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full calibiai-gradient rounded-full" style={{width:`${(Number(v))/(Number(m))*100}%`}}/></div>
                    </div>
                  ))}
                </div>
                <div className="mt-5 flex flex-wrap gap-3">
                  <button onClick={() => { setReportFor(1); setShowReport(true) }} className="btn-primary !py-2.5 text-xs">View report</button>
                </div>
              </div>

          </div>

        </div>
        )}

        {/* ---------------- Assessment 2 — Capgemini 2027 mock ---------------- */}
        {showSecondLaunchCard && <div className="mt-6 glass-card animate-fade-up" style={{animationDelay:'.18s'}}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-700">Assessment 2 · Capgemini 2027 mock</span>
                {assessment1Done ? (
                  <span className="chip text-violet-700 border-violet-200 bg-violet-50/70">Unlocked</span>
                ) : (
                  <span className="chip text-slate-500 border-slate-200 bg-slate-50">🔒 Locked</span>
                )}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                120 minutes · 5 stages — English Communication, Technical Module (AI Literacy), Debugging Assessment, AI-assisted Coding and a Cognitive Assessment.
                Same fullscreen proctoring as your first assessment.
              </p>
            </div>
          </div>

          {assessment1Done ? (
            <div className="mt-4 rounded-2xl border-2 border-dashed border-violet-200 bg-violet-50/40 p-6 text-center">
              <div className="text-3xl">🚀</div>
              <p className="mt-2 text-sm text-slate-600">Your second assessment is ready — 5 stages, 1000 points, one attempt.</p>
              <Link href="/instructions2" className="btn-primary mt-4 inline-flex">Start assessment 2 →</Link>
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/60 p-6 text-center">
              <div className="text-3xl">🔒</div>
              <p className="mt-2 text-sm text-slate-500">
                Complete your first assessment to unlock the Capgemini 2027 mock.
              </p>
              <Link href={startHref} className="btn-soft mt-4 inline-flex !py-2.5 text-xs">Start your first assessment →</Link>
            </div>
          )}
        </div>}

        {/* ---------------- Company assessments — every company, grouped by tag ---------------- */}
        <div id="company-assessments" className="mt-6 glass-card animate-fade-up scroll-mt-24" style={{animationDelay:'.2s'}}>
          <CompanyCatalog onAttempts={onCompanyAttempts} />
        </div>

        {/* Report pop-up — assessment 1 or 2 depending on which card opened it */}
        {showReport && (reportFor === 2 ? scores2 : scores) && (
          <ReportModal
            scores={reportFor === 2 ? scores2 : scores}
            onClose={() => setShowReport(false)}
          />
        )}

      </main>
    </div>
  )
}
export default function Page(){ return <FeedbackGate><Inner/></FeedbackGate> }
