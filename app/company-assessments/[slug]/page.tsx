'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Navbar } from '@/components/Navbar'
import { useStore } from '@/lib/store'
import { isProfileComplete } from '@/lib/validate'
import { PRIORITY_LABEL, TAG_BY_ID, candidateStepText, companyMockFacts, getCompany } from '@/lib/company/catalog'
import { getBlueprint } from '@/lib/company/blueprints'
import { SECTION_BY_ID } from '@/lib/company/sections'
import { companyApi } from '@/lib/company/client'
import { CompanyBadge } from '@/components/company/CompanyBadge'
import type { SectionId } from '@/lib/company/types'

function Spinner({ label }: { label: string }) {
  return (
    <div className="mt-6 glass-card flex min-h-[18rem] flex-col items-center justify-center gap-3 text-center">
      <span className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" role="status" />
      <div className="text-sm font-bold text-slate-700">{label}</div>
    </div>
  )
}

export default function Page({ params }: { params: { slug: string } }) {
  const router = useRouter()
  const { user, profile, setProfile, hydrated } = useStore()
  // The profile may not be in the client store yet (fresh device, cleared site
  // data, deep link) — load it before deciding the student isn't onboarded.
  const [profileChecked, setProfileChecked] = useState(false)
  useEffect(() => {
    if (!hydrated || !user?.id) return
    if (isProfileComplete(profile)) { setProfileChecked(true); return }
    let cancelled = false
    fetch('/api/user/profile?user_id=' + encodeURIComponent(user.id), { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { if (!cancelled && d?.profile) setProfile(d.profile) })
      .catch(() => { /* keep whatever the store has */ })
      .finally(() => { if (!cancelled) setProfileChecked(true) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, user?.id])
  const company = getCompany(params.slug)
  const blueprint = company ? getBlueprint(company.blueprint) : undefined
  const facts = company ? companyMockFacts(company) : null
  const [state, setState] = useState<'checking' | 'none' | 'in_progress' | 'error'>('checking')
  const [error, setError] = useState('')
  const [consent, setConsent] = useState(false)
  const [starting, setStarting] = useState(false)

  useEffect(() => {
    if (!hydrated) return
    if (!user?.id) { router.replace('/login'); return }
    if (!company) return
    let cancelled = false
    companyApi.attempt(user.id, company.slug).then((res) => {
      if (cancelled) return
      if (!res.ok) { setError(res.data?.error || 'Could not check your attempt status.'); setState('error'); return }
      if (res.data.state === 'completed') { router.replace(`/company-assessments/${company.slug}/result`); return }
      setState(res.data.state === 'in_progress' ? 'in_progress' : 'none')
    })
    return () => { cancelled = true }
  }, [hydrated, user?.id, company, router])

  const sections = useMemo(() => {
    const set = new Set<SectionId>()
    blueprint?.rounds.forEach((r) => r.parts.forEach((p) => p.sections.forEach((s) => set.add(s))))
    return [...set].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))
  }, [blueprint])

  if (!company || !blueprint || !facts) {
    return (
      <div><Navbar />
        <main className="max-w-3xl mx-auto px-4 py-16 text-center">
          <div className="text-4xl">🔎</div>
          <p className="mt-3 text-sm text-slate-600">This company assessment does not exist.</p>
          <Link href="/dashboard/student" className="btn-primary mt-5 inline-flex">Back to dashboard</Link>
        </main>
      </div>
    )
  }

  const onboarded = isProfileComplete(profile)
  const assessedSteps = new Map(blueprint.rounds.map((r, i) => [r.step, { round: r, index: i }]))

  const start = async () => {
    if (!user?.id || starting) return
    setStarting(true)
    setError('')
    const res = await companyApi.start(user.id, company.slug)
    if (res.status === 409) { router.replace(`/company-assessments/${company.slug}/result`); return }
    if (!res.ok) { setError(res.data?.error || 'Could not start the assessment. Please retry.'); setStarting(false); return }
    router.push(`/company-assessments/${company.slug}/test`)
  }

  return (
    <div>
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <Link href="/dashboard/student" className="text-xs font-semibold text-indigo-600">← Back to dashboard</Link>
        {state === 'checking' ? <Spinner label="Checking your attempt status…" /> : (
          <div className="mt-3 grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <div className="glass-card animate-fade-up">
                <div className="flex items-start gap-4">
                  <CompanyBadge company={company} size={56} />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="chip !py-0.5">{TAG_BY_ID[company.tag].icon} {TAG_BY_ID[company.tag].label}</span>
                      <span className="chip !py-0.5 text-slate-900 font-bold">{PRIORITY_LABEL[company.priority]}</span>
                    </div>
                    <h1 className="mt-2 text-2xl font-black text-slate-900">{company.name} mock assessment</h1>
                    <p className="text-sm text-slate-500">{company.track} · modelled on the {company.name} hiring flow</p>
                  </div>
                </div>
                <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                  {[['⏱ Duration', `${facts.minutes} min`], ['🧭 Rounds', String(facts.rounds)], ['❓ Questions', String(facts.questions)], ['🔁 Attempts', 'Only 1']].map(([k, v]) => (
                    <div key={k} className="panel p-3"><div className="text-[11px] text-slate-500">{k}</div><div className="font-black text-slate-800">{v}</div></div>
                  ))}
                </div>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {company.focus.map((f) => <span key={f} className="text-[11px] px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">{f}</span>)}
                </div>
              </div>

              <div className="glass-card animate-fade-up">
                <h2 className="font-black text-slate-900">{company.name} hiring flow</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {company.documented
                    ? 'Steps from the CalibiAI research document. Highlighted steps are simulated in this mock.'
                    : 'Modelled on the documented IT-services hiring flows (this company has no dedicated section in the research document yet).'}
                </p>
                <ol className="mt-4 relative border-l-2 border-slate-200 ml-2 space-y-4">
                  {company.steps.map((s) => {
                    const a = assessedSteps.get(s.no)
                    return (
                      <li key={s.no} className="ml-5">
                        <span className={`absolute -left-[11px] mt-0.5 w-5 h-5 rounded-full grid place-items-center text-[10px] font-black ${a ? 'calibiai-gradient text-white shadow' : 'bg-slate-200 text-slate-500'}`}>{s.no}</span>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`text-sm font-bold ${a ? 'text-slate-900' : 'text-slate-500'}`}>{s.title}</span>
                          {a ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">Round {a.index + 1} in this mock</span>
                            : <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">Informational</span>}
                        </div>
                        <p className="text-xs text-slate-600 mt-0.5">{candidateStepText(s, s.no === company.steps[0].no, s.no === company.steps[company.steps.length - 1].no, a?.round.about)}</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">{company.documented ? 'Research plan' : 'Modelled flow'}: {s.detail}</p>
                      </li>
                    )
                  })}
                </ol>
              </div>

              <div className="glass-card animate-fade-up">
                <h2 className="font-black text-slate-900">Round breakdown</h2>
                <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-200 bg-white/60">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-slate-500 text-xs">
                      <tr><th className="text-left px-3 py-2.5">Round</th><th className="text-left px-3 py-2.5">What it covers</th><th className="text-right px-3 py-2.5">Qs</th><th className="text-right px-3 py-2.5">Time</th><th className="text-right px-3 py-2.5">Weight</th></tr>
                    </thead>
                    <tbody>
                      {blueprint.rounds.map((r, i) => (
                        <tr key={r.id} className="border-t border-slate-100 align-top">
                          <td className="px-3 py-2.5 font-bold text-slate-800 whitespace-nowrap">{i + 1}. {r.label}<div className="text-[10px] font-normal text-slate-400">Step {r.step}{r.cutoff ? ` · cut-off ${r.cutoff}%` : ''}</div></td>
                          <td className="px-3 py-2.5 text-xs text-slate-600">{r.parts.map((p) => `${p.label || p.kind} (${p.count})`).join(' · ')}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-slate-600">{r.parts.reduce((s, p) => s + p.count, 0)}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-slate-600">{r.minutes}m</td>
                          <td className="px-3 py-2.5 text-right font-mono text-slate-600">{r.weight}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {sections.map((s) => <span key={s} className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{SECTION_BY_ID[s].icon} {SECTION_BY_ID[s].title}</span>)}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="glass-card !p-5 animate-fade-up lg:sticky lg:top-24">
                <div className="text-sm font-black text-slate-800">Rules & proctoring</div>
                <ul className="mt-3 text-xs text-slate-600 space-y-2 list-disc ml-4">
                  <li><b>One attempt only.</b> Once you start, the {facts.minutes}-minute timer runs on our server — closing the tab does not pause it.</li>
                  <li>Fullscreen is mandatory and locked; external or mirrored displays are not allowed.</li>
                  <li>Camera & microphone preview stays on; your identity is watermarked on screen.</li>
                  <li>Leaving the window, exiting fullscreen or changing displays is a warning — <b>3 warnings submit automatically</b>.</li>
                  <li>Right-click, copying questions and printing are disabled; pastes and screenshot keys are recorded.</li>
                  <li>Coding questions run in Python 3 or JavaScript against hidden tests; written answers are graded against a rubric.</li>
                  <li>Answers autosave. Unanswered questions score 0; there is no negative marking.</li>
                </ul>
                {!onboarded && profileChecked && (
                  <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                    Complete your profile before starting a company assessment. <Link href="/onboarding" className="font-bold underline">Complete profile →</Link>
                  </div>
                )}
                {state === 'in_progress' ? (
                  <button onClick={() => router.push(`/company-assessments/${company.slug}/test`)} className="btn-primary mt-5 w-full !py-3.5">Resume your attempt →</button>
                ) : (
                  <>
                    <label className="mt-5 flex gap-2 text-xs text-slate-700 cursor-pointer">
                      <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="accent-indigo-600 mt-0.5 w-4 h-4" />
                      I understand this is my only attempt at the {company.name} assessment and agree to be proctored.
                    </label>
                    <button onClick={start} disabled={!consent || starting || !onboarded}
                      className={`mt-4 w-full rounded-full font-black text-sm transition ${consent && !starting && onboarded ? 'btn-primary !py-3.5' : 'bg-slate-200 text-slate-400 cursor-not-allowed py-3.5'}`}>
                      {starting ? 'Creating your paper…' : !onboarded && !profileChecked ? 'Checking your profile…' : `Start ${facts.minutes}-min assessment →`}
                    </button>
                  </>
                )}
                {error && <div className="mt-3 text-xs font-semibold text-rose-600">{error}</div>}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
