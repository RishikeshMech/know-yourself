'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState, useRef, useMemo } from 'react'
import { StoreProvider, useStore } from '@/lib/store'
import { bank, shuffledOptions, shuffledChoiceOptions, mulberry32 } from '@/lib/questions'
import { computeScores } from '@/lib/scoring'
import { getSupabase } from '@/lib/supabase'

const STAGES = [
  { id: 'english', label: 'English Communication', sub: ['Listening', 'Speaking', 'Reading', 'Writing'], min: 15 },
  { id: 'problem', label: 'Problem Solving', sub: [], min: 20 },
  { id: 'debugging', label: 'AI-Assisted Debugging', sub: [], min: 20 },
  { id: 'feature', label: 'AI Feature Development', sub: [], min: 25 },
  { id: 'prompt', label: 'Prompt Engineering', sub: [], min: 15 },
  { id: 'cognitive', label: 'Cognitive Assessment', sub: ['Grid Challenge', 'Logical Reasoning', 'Behavioural'], min: 25 },
]

const clamp01 = (n: number) => Math.max(0, Math.min(1, n))

function AssessmentInner() {
  const { session, setSession, setScores } = useStore()
  const [answers, setAnswers] = useState<Record<string, any>>({})
  const [aiResults, setAiResults] = useState<Record<string, any>>({})
  const [stage, setStage] = useState(0)
  const [sub, setSub] = useState(0)
  const [remaining, setRemaining] = useState(7200)
  const [strikes, setStrikes] = useState(0)
  const [showViolation, setShowViolation] = useState(false)
  const [terminated, setTerminated] = useState(false)
  const [mediaReady, setMediaReady] = useState(false)
  const [mediaError, setMediaError] = useState('')
  const [videoOn, setVideoOn] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [recording, setRecording] = useState<string | null>(null)
  const [busy, setBusy] = useState<Record<string, boolean>>({})
  const [playCounts, setPlayCounts] = useState<Record<string, number>>({})
  const [showHint, setShowHint] = useState<Record<string, boolean>>({})

  const gridCfg = bank.cognitive.grid
  const [gridRound, setGridRound] = useState(0)
  const [gridPattern, setGridPattern] = useState<number[]>([])
  const [gridShow, setGridShow] = useState(false)
  const [gridSelected, setGridSelected] = useState<number[]>([])
  const [gridScores, setGridScores] = useState<number[]>([])
  const gridHideAt = useRef(0)

  const intervalRef = useRef<any>(null)
  const mediaRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const proctorStreamRef = useRef<MediaStream | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const awayRef = useRef(false)
  const suppressRef = useRef(false)
  const strikesRef = useRef(0)
  const submitRef = useRef<(auto?: boolean) => void>(() => {})
  const mediaReadyRef = useRef(false)

  const seed: number = session?.question_seed ?? 8675309
  const sid = session?.id

  useEffect(() => {
    // Read session from localStorage. A short retry covers the rare case where
    // another effect hasn't finished writing yet right after navigation from
    // /instructions (START 120-MIN TIMER).
    let cancelled = false
    let intervalId: any = null
    let pollId: any = null
    let attempts = 0

    const boot = (raw: string) => {
      if (cancelled) return
      let s: any
      try { s = JSON.parse(raw) } catch { window.location.href = '/instructions'; return }
      if (!s?.id || !s?.expires_at) { window.location.href = '/instructions'; return }
      if (!session) setSession(s)
      try {
        const a = localStorage.getItem('calibiai_answers_' + s.id); if (a) setAnswers(JSON.parse(a))
        const ai = localStorage.getItem('calibiai_ai_' + s.id); if (ai) setAiResults(JSON.parse(ai))
      } catch { }
      const expires = new Date(s.expires_at).getTime()
      const tick = () => {
        const rem = Math.max(0, Math.floor((expires - Date.now()) / 1000))
        setRemaining(rem)
        if (rem <= 0) handleSubmit(true)
      }
      tick()
      intervalId = setInterval(tick, 1000)
      pollId = setInterval(tick, 5000)
      intervalRef.current = intervalId
    }

    const tryLoad = () => {
      if (cancelled) return
      const raw = localStorage.getItem('calibiai_session')
      if (raw) { boot(raw); return }
      attempts += 1
      if (attempts >= 8) { window.location.href = '/instructions'; return }
      setTimeout(tryLoad, 50)
    }
    tryLoad()

    return () => {
      cancelled = true
      clearInterval(intervalId)
      clearInterval(pollId)
      clearInterval(intervalRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { if (sid) localStorage.setItem('calibiai_answers_' + sid, JSON.stringify(answers)) }, [answers, sid])
  useEffect(() => { if (sid) localStorage.setItem('calibiai_ai_' + sid, JSON.stringify(aiResults)) }, [aiResults, sid])

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3200) }

  const enableMedia = async () => {
    setMediaError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      proctorStreamRef.current = stream
      setMediaReady(true); mediaReadyRef.current = true; setVideoOn(true)
    } catch (e: any) {
      setMediaError(e?.name === 'NotAllowedError'
        ? 'Camera/mic permission was denied. The live preview is off, but focus monitoring is still active.'
        : 'No camera/mic detected on this device. Focus monitoring is still active.')
      setMediaReady(true); mediaReadyRef.current = true
    }
  }

  useEffect(() => {
    if (videoRef.current && proctorStreamRef.current) {
      videoRef.current.srcObject = proctorStreamRef.current
      videoRef.current.play().catch(() => {})
    }
  }, [mediaReady, videoOn])

  useEffect(() => {
    const onLeave = () => {
      if (!mediaReadyRef.current || suppressRef.current || terminated) return
      if (document.hidden || !document.hasFocus()) {
        if (awayRef.current) return
        awayRef.current = true
        const n = strikesRef.current + 1
        strikesRef.current = n
        setStrikes(n)
        if (n >= 3) { setTerminated(true); setShowViolation(false); submitRef.current(true) }
        else setShowViolation(true)
      }
    }
    document.addEventListener('visibilitychange', onLeave)
    window.addEventListener('blur', onLeave)
    return () => {
      document.removeEventListener('visibilitychange', onLeave)
      window.removeEventListener('blur', onLeave)
    }
  }, [terminated])

  useEffect(() => () => { proctorStreamRef.current?.getTracks().forEach(t => t.stop()) }, [])

  useEffect(() => {
    if (stage !== 5 || sub !== 0) return
    const rng = mulberry32(seed + gridRound * 101 + 7)
    const set = new Set<number>()
    while (set.size < gridCfg.patternSize) set.add(Math.floor(rng() * gridCfg.gridCells))
    setGridPattern([...set]); setGridShow(true); setGridSelected([])
    const t = setTimeout(() => { setGridShow(false); gridHideAt.current = Date.now() }, gridCfg.showMs)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, sub, gridRound])

  const handleAnswer = (qid: string, val: any) => setAnswers(a => ({ ...a, [qid]: val }))

  const runAi = async (key: string, kind: any, payload: any) => {
    setBusy(b => ({ ...b, [key]: true }))
    try {
      const res = await fetch('/api/ai/evaluate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, ...payload }),
      })
      const data = await res.json()
      if (data.ok) setAiResults(prev => ({ ...prev, [key]: data.result }))
      else showToast('Evaluation failed — the built-in engine will score this on submit.')
    } catch { showToast('AI evaluation offline — the built-in engine will score this on submit.') }
    finally { setBusy(b => ({ ...b, [key]: false })) }
  }

  const startRecording = async (id: string) => {
    try {
      const proctorAudio = proctorStreamRef.current?.getAudioTracks()[0]
      const stream = proctorAudio ? new MediaStream([proctorAudio]) : await navigator.mediaDevices.getUserMedia({ audio: true })
      const ownsStream = !proctorAudio
      const rec = new MediaRecorder(stream)
      chunksRef.current = []
      rec.ondataavailable = e => chunksRef.current.push(e.data)
      rec.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' })
        if (ownsStream) stream.getTracks().forEach(t => t.stop())
        const meta = { name: id + '.webm', size: blob.size, type: blob.type, at: new Date().toISOString(), uploaded: false }
        const sb = getSupabase()
        if (sb && sid) {
          try {
            const { data: { user } } = await sb.auth.getUser()
            if (user) {
              const up = await sb.storage.from('speaking').upload(`${user.id}/${sid}/${id}.webm`, blob, { contentType: blob.type, upsert: true })
              if (!up.error) meta.uploaded = true
            }
          } catch { }
        }
        handleAnswer(id + '_audio', meta)
        setRecording(null)
      }
      rec.start(); mediaRef.current = rec; setRecording(id)
    } catch {
      showToast('Microphone access is needed for the speaking task — please allow the mic and try again.')
    }
  }
  const stopRecording = () => mediaRef.current?.stop()

  const speakingCount = (answers['SP1_audio'] ? 1 : 0) + (answers['SP2_audio'] ? 1 : 0)

  const handleSubmit = async (auto = false) => {
    if (terminated) return
    if (!auto && !confirm('Submit assessment? You cannot change answers afterwards.')) return
    clearInterval(intervalRef.current)
    proctorStreamRef.current?.getTracks().forEach(t => t.stop())
    proctorStreamRef.current = null
    const scores = computeScores(answers, aiResults, { gridAcc: answers['GRID'], speakingCount })
    const payload = { session_id: sid || 'sess_demo', ...scores, tab_switches: strikes, auto_submitted: !!auto, submitted_at: new Date().toISOString() }
    localStorage.setItem('calibiai_scores', JSON.stringify(payload))
    setScores(payload)
    const sb = getSupabase()
    if (sb && sid) {
      try {
        const { data: { user } } = await sb.auth.getUser()
        if (user) {
          await sb.from('assessment_sessions').update({ answers, status: auto ? 'expired' : 'submitted', submitted_at: new Date().toISOString(), tab_switches: strikes }).eq('id', sid)
          await sb.from('assessment_results').upsert({ session_id: sid, student_id: user.id, scores, total: scores.total, grade: scores.grade, percentile: scores.percentile, verifiable_hash: scores.verifiable_hash, ai_feedback: aiResults })
        }
      } catch (e) { /* demo mode */ }
    }
    const s = JSON.parse(localStorage.getItem('calibiai_session') || '{}')
    s.status = 'submitted'
    localStorage.setItem('calibiai_session', JSON.stringify(s))
    window.location.href = '/result'
  }
  useEffect(() => { submitRef.current = handleSubmit })

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
  const critical = remaining < 600
  if (!session) return <div className="p-16 text-center text-slate-500">Loading your session…</div>

  const OptionList = ({ qid, options, accent = 'indigo' }: { qid: string; options: string[]; accent?: 'indigo' | 'violet' }) => {
    const opts = useMemo(() => shuffledOptions(options, seed, qid), [qid, options])
    const sel = accent === 'violet' ? 'bg-violet-600 text-white border-violet-500' : 'bg-indigo-600 text-white border-indigo-500'
    return (
      <div className="space-y-2">
        {opts.map(opt => (
          <label key={opt} className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer border transition ${answers[qid] === opt ? `${sel} shadow-md` : 'bg-white/70 border-slate-200 hover:bg-white hover:shadow-sm'}`}>
            <input type="radio" name={qid} checked={answers[qid] === opt} onChange={() => handleAnswer(qid, opt)} className={accent === 'violet' ? 'accent-violet-600' : 'accent-indigo-600'} />
            <span className="text-sm">{opt}</span>
          </label>
        ))}
      </div>
    )
  }

  const AiFeedback = ({ r }: { r: any }) => !r ? null : (
    <div className="mt-3 rounded-2xl bg-emerald-50/80 border border-emerald-200 p-3.5 text-sm animate-fade-in">
      <div className="flex items-center justify-between">
        <span className="font-bold text-emerald-700">AI score: {r.score}/100</span>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white text-emerald-700 border border-emerald-200">{r.engine === 'deepseek' ? 'DeepSeek' : 'rule engine'}</span>
      </div>
      {r.rubric && (
        <div className="mt-2 space-y-1.5">
          {Object.entries(r.rubric).map(([k, v]: any) => (
            <div key={k} className="flex items-center gap-2 text-xs">
              <span className="w-40 capitalize text-slate-500">{k.replace(/_/g, ' ')}</span>
              <div className="flex-1 h-1.5 rounded-full bg-emerald-100 overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: `${v}%` }} /></div>
              <span className="w-8 text-right font-mono text-slate-600">{v}</span>
            </div>
          ))}
        </div>
      )}
      {r.strengths?.length > 0 && <div className="mt-2 text-xs text-emerald-700"><b>Strengths:</b> {r.strengths.join(' • ')}</div>}
      {r.improvements?.length > 0 && <div className="mt-1 text-xs text-amber-700"><b>Improve:</b> {r.improvements.join(' • ')}</div>}
      {r.summary && <div className="mt-1 text-xs text-slate-500 italic">{r.summary}</div>}
    </div>
  )

  const EvalButton = ({ id, kind, payload }: any) => (
    <button disabled={busy[id]} onClick={() => runAi(id, kind, payload)}
      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold shadow-sm shadow-violet-300 disabled:opacity-50 transition">
      {busy[id] ? 'Evaluating…' : '✨ Evaluate with AI'}
    </button>
  )

  const renderStage = () => {
    switch (STAGES[stage].id) {
      case 'english':
        if (sub === 0) {
          return (
            <div className="space-y-5">
              <p className="text-xs text-slate-500">{bank.english.listening.instruction}</p>
              {bank.english.listening.clips.map((c: any) => {
                const plays = playCounts[c.id] || 0
                return (
                  <div key={c.id} className="panel p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-bold text-slate-800">🎧 {c.title}</div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100 shrink-0">plays {plays}/2</span>
                    </div>
                    <audio controls className="w-full mt-3" src={c.audio}
                      onPlay={(e) => { if ((playCounts[c.id] || 0) >= 2) { e.currentTarget.pause(); return } setPlayCounts(p => ({ ...p, [c.id]: (p[c.id] || 0) + 1 })) }} />
                    {plays >= 2 && <div className="mt-1 text-[11px] text-amber-600">Play limit reached — answer from memory.</div>}
                    <div className="mt-4 space-y-4">
                      {c.questions.map((q: any) => (
                        <div key={q.id} className="p-3.5 rounded-xl bg-white/70 border border-slate-200">
                          <div className="text-sm font-semibold text-slate-800 mb-2.5">{q.question}</div>
                          <OptionList qid={q.id} options={q.options} />
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        }
        if (sub === 1) {
          return (
            <div className="space-y-5">
              <p className="text-xs text-slate-500">{bank.english.speaking.instruction}</p>
              {bank.english.speaking.tasks.map((t: any) => {
                const rec = answers[t.id + '_audio']
                return (
                  <div key={t.id} className="panel p-4">
                    <div className="text-sm font-bold text-slate-800">{t.label}</div>
                    <div className="text-sm text-slate-600 mt-1">{t.prompt}</div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button onClick={() => recording === t.id ? stopRecording() : startRecording(t.id)}
                        className={`px-4 py-2 rounded-full text-xs font-bold transition ${recording === t.id ? 'bg-rose-500 text-white animate-pulse shadow shadow-rose-300' : rec ? 'bg-emerald-500 text-white shadow shadow-emerald-300' : 'btn-primary !py-2 !px-4'}`}>
                        {recording === t.id ? '● Recording… click to stop' : rec ? '✓ Recorded — re-record' : '● Start recording'}
                      </button>
                      {rec && <span className="text-xs text-emerald-600 font-medium">Saved {rec.name} ({Math.round(rec.size / 1024)} KB){rec.uploaded ? ' · uploaded' : ''}</span>}
                    </div>
                    {recording === t.id && (
                      <div className="mt-3 h-9 rounded-xl bg-slate-100 border border-slate-200 flex items-center px-3 gap-1">
                        {Array.from({ length: 28 }).map((_, i) => <div key={i} className="w-1 bg-indigo-400 rounded-full" style={{ height: `${8 + Math.random() * 22}px` }} />)}
                        <span className="ml-2 text-xs text-slate-400">Recording…</span>
                      </div>
                    )}
                  </div>
                )
              })}
              <div className="flex flex-wrap items-center gap-3">
                <EvalButton id="SP_speaking" kind="speaking" payload={{ recordingCount: speakingCount }} />
                <span className="text-xs text-slate-400">Your spoken answer is recorded for fluency, pronunciation, confidence and grammar.</span>
              </div>
              <AiFeedback r={aiResults['SP_speaking']} />
            </div>
          )
        }
        if (sub === 2) {
          return (
            <div className="grid lg:grid-cols-2 gap-4">
              <div className="panel p-4 h-fit">
                <div className="text-xs font-bold text-indigo-600 mb-2">📖 Passage</div>
                <p className="text-sm leading-relaxed text-slate-700">{bank.english.reading.passage}</p>
              </div>
              <div className="space-y-3">
                <p className="text-xs text-slate-500">{bank.english.reading.instruction}</p>
                {bank.english.reading.questions.map((q: any, i: number) => (
                  <div key={q.id} className="panel p-3.5">
                    <div className="text-sm font-semibold text-slate-800 mb-2.5">{i + 1}. {q.question}</div>
                    <OptionList qid={q.id} options={q.options} />
                  </div>
                ))}
              </div>
            </div>
          )
        }
        const w = bank.english.writing
        return (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">{w.instruction}</p>
            <div className="panel p-4">
              <div className="text-sm font-bold text-slate-800">✍️ Writing — scenario</div>
              <div className="mt-2 text-sm text-slate-600 p-3.5 rounded-xl bg-indigo-50/70 border border-indigo-100">{w.scenario}</div>
              <textarea value={answers['WRITING'] || ''} onChange={e => handleAnswer('WRITING', e.target.value)} placeholder="Dear [Client], ..." className="field mt-3 min-h-[180px] leading-relaxed" />
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
                <span>{(answers['WRITING'] || '').trim().split(/\s+/).filter(Boolean).length} words · target 150–300</span>
                <EvalButton id="WRITING" kind="writing" payload={{ text: answers['WRITING'] || '', scenario: w.scenario }} />
              </div>
              <AiFeedback r={aiResults['WRITING']} />
            </div>
          </div>
        )

      case 'problem':
        return (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">Logic, approach, correctness and data interpretation. Options are shuffled for your session.</p>
            {bank.problem.map((q: any, i: number) => (
              <div key={q.id} className="panel p-3.5">
                <div className="text-sm font-semibold text-slate-800 mb-2.5">{i + 1}. {q.q}</div>
                <OptionList qid={q.id} options={q.options} />
              </div>
            ))}
          </div>
        )

      case 'debugging':
        return (
          <div className="space-y-4">
            <p className="text-xs text-slate-500">You may use any AI assistant — you're assessed on finding the root cause, fixing it correctly and handling edge cases.</p>
            {bank.debugging.map((d: any) => (
              <div key={d.id} className="panel p-4">
                <div className="text-sm font-bold text-slate-800">{d.title} <span className="text-slate-400 font-normal">· {d.tests} hidden tests</span></div>
                <pre className="mt-2 code-panel p-3.5 text-xs overflow-x-auto whitespace-pre-wrap">{d.buggy}</pre>
                <div className="text-xs text-slate-500 mt-2">{d.prompt}</div>
                <button onClick={() => setShowHint(h => ({ ...h, [d.id]: !h[d.id] }))} className="mt-1 text-[11px] text-indigo-600 font-semibold">{showHint[d.id] ? 'Hide hint' : '💡 Show hint'}</button>
                {showHint[d.id] && <div className="mt-1 text-[11px] text-indigo-700 bg-indigo-50 rounded-lg p-2">{d.hint}</div>}
                <textarea value={answers[d.id + '_fix'] || ''} onChange={e => handleAnswer(d.id + '_fix', e.target.value)} placeholder="Paste your fixed code here…" className="field mt-3 min-h-[130px] font-mono !text-xs" />
                <div className="mt-2 flex flex-wrap gap-2">
                  <button onClick={() => { suppressRef.current = true; setTimeout(() => (suppressRef.current = false), 400); showToast(`Sandbox (mock): ${(answers[d.id + '_fix'] || '').length > 60 ? Math.max(2, d.tests - 1) : Math.floor(d.tests / 2)}/${d.tests} hidden tests passed.`) }}
                    className="btn-soft !py-2 !px-4 !text-xs font-bold">▶ Run hidden tests</button>
                  <EvalButton id={d.id} kind="debugging" payload={{ taskId: d.id, buggy: d.buggy, prompt: d.prompt, fix: answers[d.id + '_fix'] || '' }} />
                </div>
                <AiFeedback r={aiResults[d.id]} />
              </div>
            ))}
          </div>
        )

      case 'feature': {
        const f = bank.feature
        return (
          <div className="panel p-4 space-y-3">
            <p className="text-xs text-slate-500">Build a feature in an existing codebase. You may use AI. Assessed on requirement understanding, code quality, correctness and testing.</p>
            <div className="text-sm font-bold text-slate-800">{f.title} <span className="text-slate-400 font-normal">· {f.tests} tests</span></div>
            <div className="text-sm text-slate-600">{f.spec}</div>
            <div className="code-panel p-3 text-xs overflow-x-auto">{f.sample}</div>
            <button onClick={() => setShowHint(h => ({ ...h, AF1: !h.AF1 }))} className="text-[11px] text-indigo-600 font-semibold">{showHint.AF1 ? 'Hide hint' : '💡 Show hint'}</button>
            {showHint.AF1 && <div className="text-[11px] text-indigo-700 bg-indigo-50 rounded-lg p-2">{f.hint}</div>}
            <textarea value={answers['AF1_code'] || ''} onChange={e => handleAnswer('AF1_code', e.target.value)} placeholder="function isAllowed(userId){ ... }&#10;// plus Express middleware → 429 + Retry-After" className="field min-h-[220px] font-mono !text-xs" />
            <div className="flex flex-wrap gap-2">
              <button onClick={() => { suppressRef.current = true; setTimeout(() => (suppressRef.current = false), 400); showToast(`Test harness (mock): ${(answers['AF1_code'] || '').length > 120 ? 4 : 2}/${f.tests} tests passed.`) }}
                className="btn-soft !py-2 !px-4 !text-xs font-bold">▶ Run feature tests</button>
              <EvalButton id="AF1" kind="feature" payload={{ spec: f.spec, code: answers['AF1_code'] || '' }} />
            </div>
            <AiFeedback r={aiResults['AF1']} />
          </div>
        )
      }

      case 'prompt':
        return (
          <div className="space-y-4">
            <p className="text-xs text-slate-500">Write a prompt that makes an AI solve the task. Graded on role, context, constraints, output format and specificity.</p>
            {bank.prompt.map((t: any) => (
              <div key={t.id} className="panel p-4">
                <div className="text-sm font-bold text-slate-800">{t.id} — Prompt Engineering</div>
                <div className="mt-1 text-sm text-slate-600">{t.task}</div>
                <div className="text-xs text-slate-400">Hint: {t.hint}</div>
                <textarea value={answers[t.id] || ''} onChange={e => handleAnswer(t.id, e.target.value)} placeholder="Act as… Your task is… Constraints:… Output format:…" className="field mt-3 min-h-[110px]" />
                <div className="mt-2"><EvalButton id={t.id} kind="prompt" payload={{ task: t.task, hint: t.hint, prompt: answers[t.id] || '' }} /></div>
                <AiFeedback r={aiResults[t.id]} />
              </div>
            ))}
          </div>
        )

      case 'cognitive':
        if (sub === 0) {
          return (
            <div className="panel p-5">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="text-sm font-bold text-slate-800">🧩 Motion & Grid Challenge — Round {gridRound + 1} / {gridCfg.rounds}</div>
                <div className="text-xs text-slate-400">{gridShow ? 'Memorise the pattern…' : 'Now reproduce it'}</div>
              </div>
              <p className="mt-1 text-xs text-slate-400">{gridCfg.note}</p>
              <div className="mt-4 grid gap-2 max-w-[320px] mx-auto" style={{ gridTemplateColumns: `repeat(${Math.sqrt(gridCfg.gridCells)}, 1fr)` }}>
                {Array.from({ length: gridCfg.gridCells }).map((_, i) => {
                  const active = gridShow ? gridPattern.includes(i) : gridSelected.includes(i)
                  return (
                    <button key={i} disabled={gridShow} onClick={() => setGridSelected(s => s.includes(i) ? s.filter(x => x !== i) : [...s, i])}
                      className={`aspect-square rounded-xl border text-xs font-bold transition ${active ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-300 scale-105' : 'bg-white/70 border-slate-200 text-slate-500 hover:bg-white'}`}>{i}</button>
                  )
                })}
              </div>
              <div className="mt-5 flex gap-2 justify-center">
                <button disabled={gridShow} onClick={() => {
                  const hits = gridPattern.filter(p => gridSelected.includes(p)).length
                  const acc = clamp01(hits / Math.max(1, gridPattern.length) - gridSelected.filter(s => !gridPattern.includes(s)).length * 0.2)
                  const secs = (Date.now() - gridHideAt.current) / 1000
                  const speed = clamp01(1 - Math.max(0, secs - 1.5) / 8)
                  const score = acc * 0.7 + speed * 0.3
                  const scores = [...gridScores, score]
                  setGridScores(scores)
                  if (gridRound < gridCfg.rounds - 1) setGridRound(r => r + 1)
                  else {
                    handleAnswer('GRID', scores.reduce((a, b) => a + b, 0) / scores.length)
                    showToast(`Grid complete! Average accuracy/speed ${Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100)}%. Continue to Logical Reasoning →`)
                  }
                }} className="btn-primary !py-2.5 disabled:opacity-40">Submit pattern</button>
                <button onClick={() => { setGridRound(0); setGridScores([]) }} className="btn-soft !py-2.5">Reset</button>
              </div>
            </div>
          )
        }
        if (sub === 1) {
          return (
            <div className="space-y-3">
              <p className="text-xs text-slate-500">Sequences, patterns, syllogisms, pseudocode and data interpretation.</p>
              {bank.cognitive.logical.map((q: any, i: number) => (
                <div key={q.id} className="panel p-3.5">
                  <div className="text-sm font-semibold text-slate-800 mb-2.5">{i + 1}. {q.q}</div>
                  <OptionList qid={q.id} options={q.options} />
                </div>
              ))}
            </div>
          )
        }
        return (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">No right or wrong — real workplace scenarios. Answer honestly; they build your behavioural profile.</p>
            {bank.cognitive.behavioral.map((b: any, i: number) => {
              const opts = shuffledChoiceOptions(b.options, seed, b.id)
              return (
                <div key={b.id} className="panel p-3.5">
                  <div className="text-sm font-semibold text-slate-800">{i + 1}. {b.q} <span className="text-xs text-slate-400 font-normal">({b.trait.replace(/_/g, ' ')})</span></div>
                  <div className="mt-2.5 space-y-2">
                    {opts.map((opt: any) => (
                      <label key={opt.text} className={`flex gap-2.5 p-3 rounded-xl text-sm border cursor-pointer transition ${answers[b.id] === opt.score ? 'bg-violet-600 text-white border-violet-500 shadow-md' : 'bg-white/70 border-slate-200 hover:bg-white'}`}>
                        <input type="radio" name={b.id} checked={answers[b.id] === opt.score} onChange={() => handleAnswer(b.id, opt.score)} className="accent-violet-600 mt-0.5" />
                        <span>{opt.text}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )
      default: return null
    }
  }

  const subs = STAGES[stage].sub

  return (
    <div className="min-h-screen text-slate-800">
      {/* Header */}
      <div className="sticky top-0 z-30 border-b border-white/60 bg-white/70 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg calibiai-gradient flex items-center justify-center font-black text-white text-sm">C</div>
            <span className="hidden sm:inline font-extrabold text-slate-900 text-sm">Calibiai Assessment</span>
            <span className="hidden md:inline text-[11px] text-slate-400 font-mono">{String(sid).slice(0, 13)}…</span>
          </div>
          <div className="flex items-center gap-2.5 sm:gap-3">
            <span className="hidden sm:flex items-center gap-1.5 text-xs text-slate-500">
              Warnings
              <span className={`px-2 py-0.5 rounded-full font-bold ${strikes >= 3 ? 'bg-rose-500 text-white' : strikes >= 1 ? 'bg-amber-400 text-slate-900' : 'bg-slate-100 text-slate-500'}`}>{strikes}/3</span>
            </span>
            <div className={`px-4 py-1.5 rounded-full font-mono font-black text-sm border ${critical ? 'bg-rose-500 text-white border-rose-400 timer-pulse' : 'bg-white text-slate-800 border-slate-200'}`}>⏱ {fmt(remaining)}</div>
            <button onClick={() => handleSubmit(false)} className="btn-primary !px-4 !py-2 !text-xs">Submit</button>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-2.5">
          <div className="flex gap-1.5 overflow-x-auto py-1">
            {STAGES.map((s, i) => (
              <button key={s.id} onClick={() => { setStage(i); setSub(0) }}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold border transition ${i === stage ? 'calibiai-gradient text-white border-transparent shadow-md shadow-indigo-200' : 'bg-white/70 text-slate-600 border-slate-200 hover:bg-white'}`}>
                {i + 1}. {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 grid lg:grid-cols-12 gap-6">
        {/* Sidebar */}
        <div className="lg:col-span-3">
          <div className="glass-card !p-4 sticky top-[120px] space-y-3 animate-fade-up">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-black text-slate-800">Live Preview</span>
                <span className="flex items-center gap-1 text-[10px] text-rose-500 font-bold"><span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" /> LIVE</span>
              </div>
              <div className="mt-2 relative rounded-xl overflow-hidden border border-slate-700 bg-slate-900 aspect-video">
                {videoOn ? <video ref={videoRef} muted playsInline autoPlay className="w-full h-full object-cover" />
                  : <div className="absolute inset-0 flex items-center justify-center text-center text-[10px] text-slate-400 p-2">Camera preview off<br />focus monitoring still active</div>}
                <div className="absolute bottom-1 left-1 flex items-center gap-1 bg-black/50 rounded-full px-2 py-0.5 text-[9px] text-white">🎤 mic on</div>
              </div>
              <div className="mt-1.5 text-[10px] text-slate-400 leading-snug">Live view only — video/audio are <b className="text-slate-600">not recorded or stored</b>. Leaving this tab counts as a warning (3 auto-submits).</div>
            </div>

            <div className="text-sm font-black text-slate-800 pt-1 border-t border-slate-200/70">Sections</div>
            {STAGES.map((s, i) => (
              <button key={s.id} onClick={() => { setStage(i); setSub(0) }}
                className={`w-full text-left px-3 py-2 rounded-xl text-xs border transition ${i === stage ? 'bg-indigo-600 border-indigo-500 text-white shadow-md shadow-indigo-200' : 'bg-white/70 border-slate-200 text-slate-600 hover:bg-white'}`}>
                <div className="font-bold">{i + 1}. {s.label}</div>
                <div className={`text-[10px] ${i === stage ? 'text-indigo-100' : 'text-slate-400'}`}>Suggested {s.min} min</div>
              </button>
            ))}
          </div>
        </div>

        {/* Main */}
        <div className="lg:col-span-9">
          <div className="glass-card animate-fade-up">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-lg font-black text-slate-900">{STAGES[stage].label} <span className="text-slate-400 font-normal text-sm">· suggested {STAGES[stage].min} min</span></h2>
              <span className="text-xs px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100 font-bold">Section {stage + 1} / {STAGES.length}</span>
            </div>

            {subs.length > 0 && (
              <div className="mt-3 flex gap-2 flex-wrap">
                {subs.map((label, i) => (
                  <button key={label} onClick={() => setSub(i)}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-bold border transition ${i === sub ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm' : 'bg-white/70 text-slate-600 border-slate-200 hover:bg-white'}`}>{label}</button>
                ))}
              </div>
            )}

            <div className="mt-5">{renderStage()}</div>

            <div className="mt-7 flex justify-between pt-2">
              <button disabled={stage === 0} onClick={() => { setStage(s => Math.max(0, s - 1)); setSub(0) }} className="btn-soft disabled:opacity-30">← Previous section</button>
              {stage < STAGES.length - 1
                ? <button onClick={() => { setStage(s => s + 1); setSub(0); window.scrollTo({ top: 0, behavior: 'smooth' }) }} className="btn-primary">Next section →</button>
                : <button onClick={() => handleSubmit(false)} className="btn-primary !px-7">Submit assessment →</button>}
            </div>
          </div>

          <div className="mt-4 rounded-2xl bg-amber-50 border border-amber-200 p-3.5 text-xs text-amber-800">
            Keep this tab focused — the 120-minute timer keeps running. Leaving the window shows a warning; after <b>3 warnings your test is submitted automatically</b> with the answers you've completed.
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 max-w-md px-5 py-3 rounded-2xl bg-white/90 backdrop-blur border border-indigo-200 shadow-2xl text-sm text-slate-800 animate-pop">{toast}</div>}

      {/* Camera/mic gate */}
      {!mediaReady && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="glass-card max-w-md w-full text-center !p-8 animate-pop">
            <div className="text-5xl">🎥</div>
            <h3 className="mt-4 text-xl font-black text-slate-900">Enable camera & microphone</h3>
            <p className="mt-2 text-sm text-slate-500">A live proctoring preview appears on the left while you take the assessment. It's <b className="text-slate-700">never recorded or stored</b> — it only verifies you're present. Your screen focus is also monitored.</p>
            <button onClick={enableMedia} className="btn-primary mt-6 w-full">Turn on camera & mic →</button>
            {mediaError && <div className="mt-3 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-xl p-2">{mediaError}</div>}
            <button onClick={() => { setMediaReady(true); mediaReadyRef.current = true }} className="mt-3 text-xs text-indigo-600 font-semibold">Continue without camera (focus monitoring still active)</button>
          </div>
        </div>
      )}

      {/* Violation warning */}
      {showViolation && !terminated && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="max-w-sm w-full rounded-3xl border-2 border-amber-300 bg-white p-7 text-center shadow-2xl animate-pop">
            <div className="text-5xl">⚠️</div>
            <h3 className="mt-3 text-xl font-black text-amber-600">Warning {strikes} of 3</h3>
            <p className="mt-2 text-sm text-slate-600">You left the assessment window. Switching away is recorded as a proctoring violation.
              {strikes >= 2 && <b className="text-rose-600"> One more warning and your assessment will be submitted automatically.</b>}</p>
            <button onClick={() => { setShowViolation(false); awayRef.current = false }} className="btn-primary mt-6 w-full">I'm back — resume</button>
          </div>
        </div>
      )}

      {/* Terminated */}
      {terminated && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="max-w-sm w-full rounded-3xl border-2 border-rose-300 bg-white p-7 text-center shadow-2xl animate-pop">
            <div className="text-5xl">⛔</div>
            <h3 className="mt-3 text-xl font-black text-rose-600">Assessment submitted</h3>
            <p className="mt-2 text-sm text-slate-600">You reached 3 focus warnings. Your answers up to this point have been submitted for evaluation.</p>
            <div className="mt-4 inline-block text-xs px-3 py-1.5 rounded-full bg-slate-100 text-slate-500">Redirecting to your results…</div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Page() {
  return <StoreProvider><AssessmentInner /></StoreProvider>
}
