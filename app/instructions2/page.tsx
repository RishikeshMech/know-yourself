'use client'
import { useRouter } from 'next/navigation'
import { Navbar } from '@/components/Navbar'
import { useStore } from '@/lib/store'
import { useEffect, useRef, useState } from 'react'
import { resolveInstructions2Redirect, safeRead } from '@/lib/attemptAccess2'
import { AFTER_ASSESSMENT_ROUTE } from '@/lib/nextStep'
import { ASSESSMENT_2 } from '@/lib/assessment2Config'

// The 5 stages of the Capgemini "Assessment Journey".
const ALLOCATION = [
  [1, 'English Communication', '30 min'],
  [2, 'Technical Module (AI Literacy)', '25 min'],
  [3, 'Debugging Assessment', '25 min'],
  [4, 'AI-assisted Coding', '20 min'],
  [5, 'Cognitive Assessment', '20 min'],
]

const MODULES = [
  ['English Communication', '200 pts · Listening, Speaking, Reading and Writing'],
  ['Technical Module', '250 pts · 50 AI-literacy scenario MCQs — situational and problem-solving'],
  ['Debugging Assessment', '200 pts · identify and correct code issues — 30 code MCQs + 3 compiler tasks'],
  ['AI-assisted Coding', '200 pts · use AI effectively to solve a coding task in the in-built compiler'],
  ['Cognitive Assessment', '150 pts · Motion & Grid Challenge, Logical Reasoning and Behavioural Module'],
]

/** If the scores lookup stalls we still let the page through rather than
 *  leaving the visitor staring at a spinner forever. */
const SCORES_LOOKUP_TIMEOUT_MS = 2500

function Spinner() {
  return (
    <span
      className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600"
      role="status"
      aria-label="Loading"
    />
  )
}

function Inner() {
  const router = useRouter()
  const { setSession, user, hydrated } = useStore()
  const [checked, setChecked] = useState(false)
  const [starting, setStarting] = useState(false)
  // Same one-time-attempt gate as assessment 1, plus the extra rule that the
  // first assessment must be finished before this one unlocks.
  const [gate, setGate] = useState<'checking' | 'show'>('checking')
  const navigatedRef = useRef(false)

  const go = (to: string) => {
    if (navigatedRef.current) return
    navigatedRef.current = true
    router.replace(to)
  }

  useEffect(() => {
    if (!hydrated) return

    const target = resolveInstructions2Redirect(safeRead)
    if (target) { go(target); return }

    if (!user?.id) { setGate('show'); return }

    // Signed in → confirm against the server that assessment 2 has not already
    // been submitted (a different device / a cleared cache would look fresh).
    let cancelled = false
    let settled = false
    const finish = () => { if (cancelled || settled) return; settled = true; setGate('show') }
    const timer = setTimeout(finish, SCORES_LOOKUP_TIMEOUT_MS)

    fetch('/api/user/scores?student_id=' + user.id + '&assessment=2')
      .then(r => r.json())
      .then(d => { if (cancelled) return; clearTimeout(timer); if (d?.result) go(AFTER_ASSESSMENT_ROUTE); else finish() })
      .catch(() => { clearTimeout(timer); finish() })

    return () => { cancelled = true; clearTimeout(timer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, user?.id])

  const start = async () => {
    if (starting) return
    setStarting(true)
    const now = Date.now()
    const durationSec = ASSESSMENT_2.durationSec
    const seed = Math.floor(Math.random() * 1_000_000_000)
    let session: any = null
    try {
      const studentId = user?.id || ''
      if (studentId) {
        const sessionRes = await fetch('/api/user/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            student_id: studentId,
            question_seed: seed,
            assessment_no: 2,
            duration_sec: durationSec,
          }),
        })
        const sessionData = await sessionRes.json()
        if (sessionData.session) session = sessionData.session
      }
    } catch (e) { /* fall through to a local session */ }
    if (!session) {
      session = {
        id: 'sess2_' + Math.random().toString(16).slice(2, 10),
        student_id: user?.id || '',
        started_at: new Date(now).toISOString(),
        expires_at: new Date(now + durationSec * 1000).toISOString(),
        duration_sec: durationSec,
        status: 'in_progress',
        question_seed: seed,
        assessment_no: 2,
      }
      try {
        await fetch('/api/user/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...session, student_id: user?.id || session.student_id || 'unknown' }),
        })
      } catch { /* demo mode */ }
    }
    session.assessment_no = 2
    try {
      localStorage.setItem(ASSESSMENT_2.keys.session, JSON.stringify(session))
      localStorage.setItem('calibiai2_session_server_start', String(now))
    } catch { }
    // The runner reads its session from the assessment-2 storage key, so the
    // shared store slice is left untouched for the first assessment.
    window.location.replace('/assessment2')
  }

  if (gate !== 'show') {
    return (
      <div>
        <Navbar />
        <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
          <div className="mt-6 glass-card flex min-h-[22rem] flex-col items-center justify-center gap-3 text-center">
            <Spinner />
            <div className="text-sm font-bold text-slate-700">Checking your assessment status…</div>
            <div className="text-xs text-slate-400">This is a one-time attempt — making sure you land in the right place.</div>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div>
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 glass-card animate-fade-up">
            <div className="inline-flex items-center gap-2 rounded-full bg-violet-100 px-3 py-1 text-[11px] font-black text-violet-700 border border-violet-200">
              ASSESSMENT 2 · UNLOCKED
            </div>
            <h1 className="mt-3 text-2xl font-black text-slate-900">Capgemini 2027 mock — instructions</h1>
            <p className="text-sm text-slate-500 mt-1">
              120 minutes · 5 stages · 1000 points. Take it somewhere quiet with a working camera and microphone.
            </p>

            <div className="mt-6 grid sm:grid-cols-2 gap-3 text-sm">
              {[
                ['⏱ Duration', '120 min · auto-submits when time runs out · no pause'],
                ['🎥 Proctoring', 'Live camera preview · fullscreen lock · focus monitoring'],
                ['🎧 Listening', 'One audio passage with 10 questions — plays up to 2 times'],
                ['⌨️ In-built compiler', 'Debugging Lab and AI-assisted Coding run your code against hidden tests'],
              ].map(([t, d]) => (
                <div key={t} className="panel p-3"><div className="font-bold text-slate-800">{t}</div><div className="text-slate-500 text-xs mt-0.5">{d}</div></div>
              ))}
            </div>

            <h3 className="mt-7 font-black text-slate-900">The 5 stages</h3>
            <div className="mt-3 grid sm:grid-cols-2 gap-2.5">
              {MODULES.map(([t, d]) => (
                <div key={t} className="panel p-3"><div className="font-bold text-sm text-slate-800">{t}</div><div className="text-slate-500 text-xs mt-0.5">{d}</div></div>
              ))}
            </div>

            <h3 className="mt-7 font-black text-slate-900">Suggested time allocation</h3>
            <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white/60 text-sm">
              <table className="w-full">
                <thead className="bg-slate-50 text-slate-500 text-xs">
                  <tr><th className="text-left px-4 py-2.5 w-14">Stage</th><th className="text-left px-4 py-2.5">Section</th><th className="text-right px-4 py-2.5 w-24">Time</th></tr>
                </thead>
                <tbody>
                  {ALLOCATION.map(([n, t, time]) => (
                    <tr key={n as number} className="border-t border-slate-100">
                      <td className="px-4 py-2.5 text-slate-400 font-mono">{n}</td>
                      <td className="px-4 py-2.5 font-medium text-slate-700">{t}</td>
                      <td className="px-4 py-2.5 text-right text-slate-500 font-mono">{time}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-slate-200 bg-indigo-50/60 font-bold text-indigo-700">
                    <td className="px-4 py-2.5" colSpan={2}>TOTAL</td>
                    <td className="px-4 py-2.5 text-right font-mono">120 min</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="mt-6 rounded-2xl bg-amber-50 border border-amber-200 p-4 text-xs leading-relaxed text-slate-600">
              <div className="font-bold text-amber-700 mb-1">Please note</div>
              <ul className="list-disc ml-4 space-y-1">
                <li><b>No tab switching:</b> Keep this tab/window focused — switching windows/tabs 3 times terminates and submits your test automatically.</li>
                <li><b>Close other tabs before starting:</b> When you start, the app will ask you to close every other tab/window and confirm.</li>
                <li><b>Fullscreen is required:</b> The test locks you into fullscreen with right-click disabled. If you press Esc, fullscreen re-enters automatically, and leaving fullscreen mid-test is recorded as a violation. Disconnect any external or second display — if one is detected the test won't start, and connecting one mid-test terminates the assessment as cheating.</li>
                <li><b>In-built compiler:</b> In the Debugging Lab and AI-assisted Coding stages you write the corrected code and press <b>Run hidden tests</b> — your code is executed against the real test cases, exactly like the first assessment.</li>
                <li><b>In-Exam AI Assistant:</b> Embedded below each Debugging Lab and AI-assisted Coding task. <b>It answers a maximum of 5 prompts per task and then locks</b> — plan your best questions before asking.</li>
                <li>Your answers are saved automatically as you go.</li>
                <li>This is a one-time attempt — once submitted you can't retake it. You land back on your student dashboard, where both reports stay available.</li>
              </ul>
            </div>

            <label className="mt-6 flex gap-2 text-sm text-slate-700 cursor-pointer">
              <input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} className="accent-indigo-600 mt-0.5 w-4 h-4" />
              I have read and understood the instructions.
            </label>
            <button onClick={start} disabled={!checked || starting}
              className={`mt-4 w-full sm:w-auto px-8 py-3.5 rounded-full font-black text-sm transition ${checked && !starting ? 'btn-primary !py-3.5' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}>
              {starting ? 'Creating your session…' : 'START 120-MIN TIMER →'}
            </button>
          </div>

          <div className="space-y-4">
            <div className="glass-card animate-fade-up !p-5" style={{ animationDelay: '.1s' }}>
              <div className="text-sm font-black text-slate-800">What happens next?</div>
              <ol className="mt-3 text-xs space-y-2 text-slate-500 list-decimal ml-4">
                <li>Your 120-minute timer starts</li>
                <li>Answer each of the 5 stages</li>
                <li>Submit when done (or it auto-submits)</li>
                <li>Get your Capgemini mock score out of 1000 + a PDF report</li>
              </ol>
            </div>
            <div className="rounded-3xl calibiai-gradient p-5 text-white shadow-xl shadow-indigo-200 animate-fade-up" style={{ animationDelay: '.18s' }}>
              <div className="text-xs font-bold opacity-80">Score breakdown</div>
              <div className="mt-3 text-xs space-y-1.5 font-mono">
                {[['English', '200'], ['Technical', '250'], ['Debugging', '200'], ['AI Coding', '200'], ['Cognitive', '150']].map(([k, v]) => (
                  <div key={k} className="flex justify-between"><span>{k}</span><span>{v}</span></div>
                ))}
                <div className="flex justify-between font-black border-t border-white/30 pt-1.5"><span>Total</span><span>1000</span></div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
export default function Page() { return <Inner /> }
