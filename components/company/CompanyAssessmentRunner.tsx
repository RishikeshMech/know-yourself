'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bookmark, BookmarkCheck, ChevronLeft, ChevronRight, Maximize2, Play, RotateCcw, Send, CheckCircle2, XCircle, Timer, AlertTriangle } from 'lucide-react'
import { useStore } from '@/lib/store'
import { Logo } from '@/components/Logo'
import { AssessmentReview } from '@/components/AssessmentReview'
import { getCompany } from '@/lib/company/catalog'
import { SECTION_BY_ID } from '@/lib/company/sections'
import { companyApi, type AttemptView } from '@/lib/company/client'
import { buildCompanyReview, itemAnswered } from '@/lib/company/review'
import { MAX_FOCUS_STRIKES } from '@/lib/proctoring'
import type { ClientItem } from '@/lib/company/types'
import type { TestRunResult } from '@/lib/runTests'
import { useProctoring } from './useProctoring'
import { ProctorOverlays, Watermark } from './ProctorOverlays'
import { CompanyBadge } from './CompanyBadge'

type CodeValue = { lang: 'python' | 'javascript'; code: string }

const SAVE_MIN_INTERVAL_MS = 10_000
const SAVE_DEBOUNCE_MS = 1_500
const DIFF_STYLE: Record<string, string> = {
  easy: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-200',
  hard: 'bg-rose-50 text-rose-700 border-rose-200',
}

const fmtClock = (s: number) => {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}
const words = (t: unknown) => String(t || '').trim().split(/\s+/).filter(Boolean).length
const storageKey = (attemptId: string, what: string) => `calibiai_company_${attemptId}_${what}`
function readLocal<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : fallback } catch { return fallback }
}
function writeLocal(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* storage full / private mode */ }
}

export function CompanyAssessmentRunner({ slug }: { slug: string }) {
  const router = useRouter()
  const { user, hydrated } = useStore()
  const company = getCompany(slug)

  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading')
  const [loadError, setLoadError] = useState('')
  const [view, setView] = useState<AttemptView | null>(null)
  const [answers, setAnswers] = useState<Record<string, unknown>>({})
  const [flags, setFlags] = useState<Record<string, boolean>>({})
  const [drafts, setDrafts] = useState<Record<string, Partial<Record<'python' | 'javascript', string>>>>({})
  const [roundIdx, setRoundIdx] = useState(0)
  const [itemIdx, setItemIdx] = useState(0)
  const [remaining, setRemaining] = useState(0)
  const [reviewMode, setReviewMode] = useState<'manual' | 'auto' | null>(null)
  const [autoReason, setAutoReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [tests, setTests] = useState<Record<string, TestRunResult | undefined>>({})
  const [running, setRunning] = useState<Record<string, boolean>>({})
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'offline'>('idle')

  const offsetRef = useRef(0)
  const answersRef = useRef<Record<string, unknown>>({})
  const submittingRef = useRef(false)
  const autoRef = useRef(false)
  const saveTimerRef = useRef<any>(null)
  const lastSaveRef = useRef(0)
  const dirtyRef = useRef(false)
  const lastIdxRef = useRef<Record<number, number>>({})
  answersRef.current = answers

  const attemptId = view?.attempt.id || ''
  const live = phase === 'ready' && !submitting && !submitted && reviewMode !== 'auto'

  /* ------------------------------ submission ------------------------------ */
  const proctorRef = useRef<ReturnType<typeof useProctoring> | null>(null)

  const doSubmit = useCallback(async (auto: boolean, reason?: string) => {
    if (!user?.id || submittingRef.current) return
    submittingRef.current = true
    setSubmitting(true)
    setSubmitError('')
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    proctorRef.current?.releaseMedia()
    const res = await companyApi.submit(user.id, slug, answersRef.current, proctorRef.current?.report(), auto, reason)
    if (res.ok || res.status === 409) {
      setSubmitted(true)
      setSubmitting(false)
      try { if (document.fullscreenElement) await document.exitFullscreen() } catch { /* ignore */ }
      if (attemptId) {
        for (const k of ['answers', 'flags', 'drafts']) { try { localStorage.removeItem(storageKey(attemptId, k)) } catch { /* ignore */ } }
      }
      if (!auto) router.replace(`/company-assessments/${slug}/result?just=1`)
      return
    }
    submittingRef.current = false
    setSubmitting(false)
    setSubmitError(res.data?.error || 'Submission failed — your answers are saved. Please retry.')
  }, [user?.id, slug, router, attemptId])

  const beginAutoSubmit = useCallback((reason: string) => {
    if (autoRef.current || submittingRef.current) return
    autoRef.current = true
    setAutoReason(reason)
    setReviewMode('auto')
    void doSubmit(true, reason)
  }, [doSubmit])

  const proctoring = useProctoring({ active: live, onTerminate: beginAutoSubmit })
  proctorRef.current = proctoring

  /* --------------------------------- load --------------------------------- */
  useEffect(() => {
    if (!hydrated) return
    if (!user?.id) { router.replace('/login'); return }
    if (!company) { setLoadError('This company assessment does not exist.'); setPhase('error'); return }
    let cancelled = false
    ;(async () => {
      const res = await companyApi.attempt(user.id, company.slug)
      if (cancelled) return
      if (!res.ok) {
        setLoadError(res.status === 401 ? 'Your session has expired — please sign in again.' : res.data?.error || 'Could not load your assessment.')
        setPhase('error')
        return
      }
      if (res.data.state === 'none') { router.replace(`/company-assessments/${company.slug}`); return }
      if (res.data.state === 'completed') { router.replace(`/company-assessments/${company.slug}/result`); return }
      const v = res.data as AttemptView
      offsetRef.current = Date.parse(v.server_now) - Date.now()
      const local = readLocal<Record<string, unknown>>(storageKey(v.attempt.id, 'answers'), {})
      setAnswers({ ...(v.answers || {}), ...local })
      setFlags(readLocal(storageKey(v.attempt.id, 'flags'), {}))
      setDrafts(readLocal(storageKey(v.attempt.id, 'drafts'), {}))
      setView(v)
      setPhase('ready')
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, user?.id, slug])

  /* --------------------------------- timer -------------------------------- */
  useEffect(() => {
    if (!view) return
    const expires = Date.parse(view.attempt.expires_at)
    const tick = () => {
      const rem = Math.max(0, Math.floor((expires - (Date.now() + offsetRef.current)) / 1000))
      setRemaining(rem)
      if (rem <= 0 && !submittingRef.current && !autoRef.current) beginAutoSubmit('Time is up — your assessment was submitted automatically.')
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [view, beginAutoSubmit])

  /* ------------------------------- autosave ------------------------------- */
  const saveNow = useCallback(async (keepalive = false) => {
    if (!user?.id || submittingRef.current || autoRef.current) return
    dirtyRef.current = false
    lastSaveRef.current = Date.now()
    setSaveState('saving')
    const res = await companyApi.save(user.id, slug, answersRef.current, proctorRef.current?.report(), keepalive)
    if (res.ok) { setSaveState('saved'); return }
    if (res.status === 409) {
      if (res.data?.reason === 'expired') beginAutoSubmit('Time is up — your assessment was submitted automatically.')
      else router.replace(`/company-assessments/${slug}/result`)
      return
    }
    dirtyRef.current = true
    setSaveState('offline')
  }, [user?.id, slug, router, beginAutoSubmit])

  const scheduleSave = useCallback(() => {
    dirtyRef.current = true
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    const wait = Math.max(SAVE_DEBOUNCE_MS, SAVE_MIN_INTERVAL_MS - (Date.now() - lastSaveRef.current))
    saveTimerRef.current = setTimeout(() => { void saveNow() }, wait)
  }, [saveNow])

  useEffect(() => {
    if (!attemptId) return
    writeLocal(storageKey(attemptId, 'answers'), answers)
  }, [answers, attemptId])
  useEffect(() => { if (attemptId) writeLocal(storageKey(attemptId, 'flags'), flags) }, [flags, attemptId])
  useEffect(() => { if (attemptId) writeLocal(storageKey(attemptId, 'drafts'), drafts) }, [drafts, attemptId])

  // Proctoring events and retries ride on a periodic checkpoint.
  useEffect(() => {
    if (phase !== 'ready') return
    const id = setInterval(() => {
      if (dirtyRef.current || proctorRef.current?.report().events.length) {
        if (Date.now() - lastSaveRef.current >= 20_000) void saveNow()
      }
    }, 5_000)
    return () => clearInterval(id)
  }, [phase, saveNow])

  // Leaving mid-test: warn, and push a final keepalive checkpoint.
  useEffect(() => {
    if (!live) return
    const onUnload = (e: BeforeUnloadEvent) => {
      void saveNow(true)
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [live, saveNow])

  useEffect(() => () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }, [])

  /* ------------------------------- answers -------------------------------- */
  const setAnswer = useCallback((id: string, value: unknown) => {
    if (!live) return
    setAnswers((a) => ({ ...a, [id]: value }))
    scheduleSave()
  }, [live, scheduleSave])

  const clearAnswer = useCallback((id: string) => {
    if (!live) return
    setAnswers((a) => { const next = { ...a }; delete next[id]; return next })
    scheduleSave()
  }, [live, scheduleSave])

  /* ------------------------------ navigation ------------------------------ */
  const rounds = view?.paper.rounds || []
  const round = rounds[roundIdx]
  const item: ClientItem | undefined = round?.items[itemIdx]

  const goto = useCallback((r: number, i: number) => {
    lastIdxRef.current[roundIdx] = itemIdx
    setRoundIdx(r)
    setItemIdx(i)
    requestAnimationFrame(() => { try { window.scrollTo({ top: 0, behavior: 'smooth' }) } catch { /* ignore */ } })
  }, [roundIdx, itemIdx])

  const next = () => {
    if (!round) return
    if (itemIdx < round.items.length - 1) goto(roundIdx, itemIdx + 1)
    else if (roundIdx < rounds.length - 1) goto(roundIdx + 1, lastIdxRef.current[roundIdx + 1] ?? 0)
    else setReviewMode('manual')
  }
  const prev = () => {
    if (itemIdx > 0) goto(roundIdx, itemIdx - 1)
    else if (roundIdx > 0) goto(roundIdx - 1, rounds[roundIdx - 1].items.length - 1)
  }

  // ← / → navigate when focus is not inside an editor.
  useEffect(() => {
    if (!live) return
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.tagName === 'SELECT')) return
      if (e.key === 'ArrowRight') next()
      if (e.key === 'ArrowLeft') prev()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  /* -------------------------------- coding -------------------------------- */
  const codeOf = (it: Extract<ClientItem, { kind: 'coding' }>): CodeValue => {
    const v = answers[it.id] as CodeValue | undefined
    if (v && typeof v === 'object' && typeof v.code === 'string') return v
    return { lang: 'python', code: it.starter.python }
  }
  const setCode = (it: Extract<ClientItem, { kind: 'coding' }>, patch: Partial<CodeValue>) => {
    const cur = codeOf(it)
    const nextVal = { ...cur, ...patch }
    setDrafts((d) => ({ ...d, [it.id]: { ...(d[it.id] || {}), [nextVal.lang]: nextVal.code } }))
    setAnswer(it.id, nextVal)
  }
  const switchLang = (it: Extract<ClientItem, { kind: 'coding' }>, lang: 'python' | 'javascript') => {
    const cur = codeOf(it)
    if (cur.lang === lang) return
    setDrafts((d) => ({ ...d, [it.id]: { ...(d[it.id] || {}), [cur.lang]: cur.code } }))
    setAnswer(it.id, { lang, code: drafts[it.id]?.[lang] ?? it.starter[lang] })
    setTests((t) => ({ ...t, [it.id]: undefined }))
  }
  const runTests = async (it: Extract<ClientItem, { kind: 'coding' }>) => {
    if (!user?.id) return
    const cur = codeOf(it)
    setRunning((r) => ({ ...r, [it.id]: true }))
    setTests((t) => ({ ...t, [it.id]: undefined }))
    const res = await companyApi.runTests(user.id, slug, it.id, cur.lang, cur.code)
    setRunning((r) => ({ ...r, [it.id]: false }))
    setTests((t) => ({
      ...t,
      [it.id]: res.ok ? (res.data as TestRunResult) : { passed: 0, total: it.testCount, results: [], engine: cur.lang === 'python' ? 'python' : 'node', error: res.data?.error || 'The test runner is unavailable — please retry.' },
    }))
  }
  const onEditorKey = (e: React.KeyboardEvent<HTMLTextAreaElement>, it: Extract<ClientItem, { kind: 'coding' }>) => {
    if (e.key !== 'Tab' || e.shiftKey) return
    e.preventDefault()
    const el = e.currentTarget
    const { selectionStart: s, selectionEnd: end, value } = el
    const indent = codeOf(it).lang === 'python' ? '    ' : '  '
    const updated = value.slice(0, s) + indent + value.slice(end)
    setCode(it, { code: updated })
    requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = s + indent.length })
  }

  /* --------------------------------- review ------------------------------- */
  const review = useMemo(() => (view ? buildCompanyReview(view.paper, answers) : null), [view, answers])
  const answeredIn = (r: number) => (rounds[r]?.items || []).filter((it) => itemAnswered(it, answers[it.id])).length
  const totalAnswered = review?.stats.answered || 0
  const totalItems = review?.stats.total || 0

  /* --------------------------------- render ------------------------------- */
  if (!company) {
    return <div className="p-16 text-center text-slate-500">This company assessment does not exist.</div>
  }
  if (phase === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="glass-card flex items-center gap-3 px-6 py-4">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
          <span className="text-sm font-bold text-slate-700">Loading your {company.name} assessment…</span>
        </div>
      </div>
    )
  }
  if (phase === 'error' || !view || !round) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="glass-card max-w-md text-center !p-8">
          <div className="text-4xl">⚠️</div>
          <p className="mt-3 text-sm font-semibold text-slate-700">{loadError || 'Could not load your assessment.'}</p>
          <button onClick={() => router.replace('/dashboard/student')} className="btn-primary mt-5">Back to dashboard</button>
        </div>
      </div>
    )
  }

  const unlocked = proctoring.envState === 'cleared' && proctoring.mediaReady
  const critical = remaining < 300
  const isLastItem = roundIdx === rounds.length - 1 && itemIdx === round.items.length - 1

  return (
    <div className="min-h-screen text-slate-800">
      {live && <style>{'@media print { body { display: none !important; } }'}</style>}
      {unlocked && live && (
        <Watermark name={user?.name} email={user?.email} id={user?.id} sessionId={view.attempt.id} companyName={company.name} />
      )}

      {/* Header */}
      <div className="sticky top-0 z-30 border-b border-white/60 bg-white/75 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Logo height={30} />
            <CompanyBadge company={company} size={30} />
            <div className="min-w-0 hidden sm:block">
              <div className="font-extrabold text-slate-900 text-sm truncate">{company.name} · Mock Assessment</div>
              <div className="text-[11px] text-slate-400 font-mono truncate">{company.track}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <span className={`hidden md:inline text-[11px] font-semibold ${saveState === 'offline' ? 'text-rose-500' : 'text-slate-400'}`}>
              {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? '✓ Saved' : saveState === 'offline' ? '⚠ Offline — saved on this device' : ''}
            </span>
            <span className="hidden sm:flex items-center gap-1.5 text-xs text-slate-500">
              Warnings
              <span className={`px-2 py-0.5 rounded-full font-bold ${proctoring.strikes >= MAX_FOCUS_STRIKES ? 'bg-rose-500 text-white' : proctoring.strikes >= 1 ? 'bg-amber-400 text-slate-900' : 'bg-slate-100 text-slate-500'}`}>{proctoring.strikes}/{MAX_FOCUS_STRIKES}</span>
            </span>
            {unlocked && live && !proctoring.isFullscreen && (
              <button onClick={() => { proctoring.enterFullscreen() }} className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700 hover:bg-amber-100">
                <Maximize2 className="h-3.5 w-3.5" aria-hidden /> Fullscreen
              </button>
            )}
            <div className={`px-3 sm:px-4 py-1.5 rounded-full font-mono font-black text-sm border ${critical ? 'bg-rose-500 text-white border-rose-400 timer-pulse' : 'bg-white text-slate-800 border-slate-200'}`}>⏱ {fmtClock(remaining)}</div>
            <button onClick={() => setReviewMode('manual')} disabled={!live || !unlocked} className="btn-primary !px-4 !py-2 !text-xs">Submit</button>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-2.5">
          <div className="flex gap-1.5 overflow-x-auto py-1">
            {rounds.map((r, i) => (
              <button key={r.id} onClick={() => goto(i, lastIdxRef.current[i] ?? 0)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${i === roundIdx ? 'calibiai-gradient text-white border-transparent shadow-md shadow-indigo-200' : 'bg-white/70 text-slate-600 border-slate-200 hover:bg-white'}`}>
                {i + 1}. {r.label} <span className={`ml-1 font-mono font-normal ${i === roundIdx ? 'text-indigo-100' : 'text-slate-400'}`}>{answeredIn(i)}/{r.items.length}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 grid lg:grid-cols-12 gap-6">
        {/* Sidebar */}
        <aside className="lg:col-span-3 space-y-4">
          <div className="glass-card !p-4 lg:sticky lg:top-[124px] space-y-4">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-black text-slate-800">Live proctoring</span>
                <span className="flex items-center gap-1 text-[10px] text-rose-500 font-bold"><span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" /> LIVE</span>
              </div>
              <div className="mt-2 relative rounded-xl overflow-hidden border border-slate-700 bg-slate-900 aspect-video">
                {proctoring.videoOn
                  ? <video ref={proctoring.videoRef} muted playsInline autoPlay className="w-full h-full object-cover" />
                  : <div className="absolute inset-0 flex items-center justify-center text-center text-[10px] text-slate-400 p-2">Camera preview off<br />focus monitoring active</div>}
              </div>
              <p className="mt-1.5 text-[10px] text-slate-400 leading-snug">Stay in view and in this window. <b className="text-slate-600">{MAX_FOCUS_STRIKES} warnings submit the test.</b></p>
            </div>

            <div className="pt-3 border-t border-slate-200/70">
              <div className="flex items-center justify-between">
                <span className="text-sm font-black text-slate-800">Round {roundIdx + 1}: palette</span>
                <span className="text-[11px] font-mono text-slate-400">{answeredIn(roundIdx)}/{round.items.length}</span>
              </div>
              <div className="mt-2 grid grid-cols-6 gap-1.5">
                {round.items.map((it, i) => {
                  const done = itemAnswered(it, answers[it.id])
                  const flagged = !!flags[it.id]
                  const current = i === itemIdx
                  return (
                    <button key={it.id} onClick={() => goto(roundIdx, i)} title={`${it.part || ''}${flagged ? ' · marked for review' : ''}`}
                      className={`relative h-8 rounded-lg text-[11px] font-bold border transition ${current ? 'bg-indigo-600 text-white border-indigo-500 shadow' : done ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-white/80 text-slate-500 border-slate-200 hover:bg-white'}`}>
                      {i + 1}
                      {flagged && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-400 ring-2 ring-white" />}
                    </button>
                  )
                })}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-400">
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-emerald-100 border border-emerald-200" /> answered</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-400" /> review</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-white border border-slate-200" /> not answered</span>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-200/70 space-y-1.5">
              {rounds.map((r, i) => {
                const a = answeredIn(i)
                return (
                  <button key={r.id} onClick={() => goto(i, lastIdxRef.current[i] ?? 0)}
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs border transition ${i === roundIdx ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-white/70 border-slate-200 text-slate-600 hover:bg-white'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold truncate">{i + 1}. {r.label}</span>
                      <span className={`font-mono shrink-0 ${i === roundIdx ? 'text-indigo-100' : a === r.items.length ? 'text-emerald-600' : 'text-slate-400'}`}>{a === r.items.length ? '✓' : `${a}/${r.items.length}`}</span>
                    </div>
                    <div className={`text-[10px] ${i === roundIdx ? 'text-indigo-100' : 'text-slate-400'}`}>Step {r.step} · ~{r.minutes} min · {r.weight}% weight</div>
                  </button>
                )
              })}
            </div>
          </div>
        </aside>

        {/* Main */}
        <main className="lg:col-span-9">
          {!unlocked ? (
            <div className="glass-card min-h-[24rem] flex flex-col items-center justify-center text-center">
              <div className="text-5xl">🔐</div>
              <p className="mt-3 text-sm font-bold text-slate-700">Questions unlock after the security check and camera step.</p>
              <p className="mt-1 text-xs text-slate-400">Your {Math.round(view.attempt.duration_sec / 60)}-minute timer is already running.</p>
            </div>
          ) : (
            <div className="glass-card animate-fade-up">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-indigo-600">Round {roundIdx + 1} · Step {round.step}</div>
                  <h2 className="text-lg font-black text-slate-900">{round.label}</h2>
                  <p className="text-xs text-slate-500 max-w-2xl">{round.about}</p>
                </div>
                <span className="text-xs px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100 font-bold">Question {itemIdx + 1} / {round.items.length}</span>
              </div>

              {item && (
                <div key={item.id} className="mt-5 animate-sub-fade">
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    {item.part && <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-semibold">{item.part}</span>}
                    <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100">{SECTION_BY_ID[item.section]?.icon} {item.topic}</span>
                    <span className={`px-2 py-0.5 rounded-full border capitalize ${DIFF_STYLE[item.difficulty]}`}>{item.difficulty}</span>
                    <span className="px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-500 font-mono">{item.marks} mark{item.marks === 1 ? '' : 's'}</span>
                  </div>

                  {item.kind === 'mcq' && (
                    <div className="mt-4">
                      <div className="text-[15px] leading-relaxed font-semibold text-slate-800 whitespace-pre-line select-none">{item.q}</div>
                      {item.code && <pre className="code-panel mt-3 p-3.5 text-xs overflow-x-auto whitespace-pre leading-relaxed select-none">{item.code}</pre>}
                      <div className="mt-4 space-y-2" role="radiogroup">
                        {item.options.map((opt, oi) => {
                          const chosen = answers[item.id] === opt
                          return (
                            <label key={opt} className={`flex items-start gap-3 p-3.5 rounded-xl cursor-pointer border transition select-none ${chosen ? 'bg-indigo-600 text-white border-indigo-500 shadow-md' : 'bg-white/75 border-slate-200 hover:bg-white hover:shadow-sm'}`}>
                              <input type="radio" name={item.id} checked={chosen} onChange={() => setAnswer(item.id, opt)} className="sr-only" />
                              <span className={`shrink-0 w-6 h-6 rounded-full grid place-items-center text-[11px] font-black ${chosen ? 'bg-white/25 text-white' : 'bg-slate-100 text-slate-500'}`}>{String.fromCharCode(65 + oi)}</span>
                              <span className="text-sm leading-relaxed">{opt}</span>
                            </label>
                          )
                        })}
                      </div>
                      {answers[item.id] != null && (
                        <button onClick={() => clearAnswer(item.id)} className="mt-2 text-[11px] font-semibold text-slate-400 hover:text-slate-600">Clear selection</button>
                      )}
                    </div>
                  )}

                  {item.kind === 'written' && (
                    <div className="mt-4">
                      <div className="text-[15px] leading-relaxed font-semibold text-slate-800 select-none">{item.q}</div>
                      <p className="mt-1 text-xs text-slate-500">Aim for {item.minWords}–{item.maxWords} words. Graded on the key concepts, structure (examples, trade-offs) and clarity — very short answers score 0.</p>
                      <textarea value={String(answers[item.id] ?? '')} onChange={(e) => setAnswer(item.id, e.target.value)} disabled={!live}
                        placeholder="Type your answer here…" className="field mt-3 min-h-[260px] leading-relaxed" />
                      {(() => {
                        const w = words(answers[item.id])
                        const pct = Math.min(100, Math.round((w / item.minWords) * 100))
                        return (
                          <div className="mt-2 flex items-center gap-2.5">
                            <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden"><div className={`h-full rounded-full progress-smooth ${w >= item.minWords ? 'bg-emerald-500' : 'calibiai-gradient'}`} style={{ width: `${pct}%` }} /></div>
                            <span className={`text-[11px] font-mono shrink-0 ${w > item.maxWords ? 'text-amber-600' : 'text-slate-500'}`}>{w} / {item.minWords}–{item.maxWords} words</span>
                          </div>
                        )
                      })()}
                    </div>
                  )}

                  {item.kind === 'coding' && (() => {
                    const cv = codeOf(item)
                    const tr = tests[item.id]
                    return (
                      <div className="mt-4 grid xl:grid-cols-2 gap-4">
                        <div className="space-y-3 select-none">
                          <h3 className="text-base font-black text-slate-900">{item.title}</h3>
                          <p className="text-sm leading-relaxed text-slate-700 whitespace-pre-line">{item.statement}</p>
                          {item.examples.map((ex, i) => (
                            <div key={i} className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-xs">
                              <div className="font-bold text-slate-700">Example {i + 1}</div>
                              <div className="mt-1 font-mono text-slate-600"><b>Input:</b> {ex.input}</div>
                              <div className="font-mono text-slate-600"><b>Output:</b> {ex.output}</div>
                              {ex.explain && <div className="text-slate-500 mt-0.5">{ex.explain}</div>}
                            </div>
                          ))}
                          {item.constraints.length > 0 && (
                            <ul className="list-disc ml-5 text-xs text-slate-500 space-y-0.5">{item.constraints.map((c) => <li key={c}>{c}</li>)}</ul>
                          )}
                          <p className="text-[11px] text-slate-400">Your function is judged on {item.testCount} tests — the examples above plus hidden edge cases and large <b>stress tests</b> (up to 10⁵ elements) with time limits, so an inefficient algorithm gets <i>Time Limit Exceeded</i>. The final score re-runs every test on the server when you submit.</p>
                        </div>
                        <div>
                          <div className="flex items-center justify-between gap-2">
                            <div className="inline-flex rounded-full border border-slate-200 bg-white p-0.5">
                              {(['python', 'javascript'] as const).map((l) => (
                                <button key={l} onClick={() => switchLang(item, l)} disabled={!live}
                                  className={`px-3 py-1 rounded-full text-xs font-bold ${cv.lang === l ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-800'}`}>{l === 'python' ? 'Python 3' : 'JavaScript'}</button>
                              ))}
                            </div>
                            <button onClick={() => setCode(item, { code: item.starter[cv.lang] })} disabled={!live} className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-slate-800">
                              <RotateCcw className="h-3 w-3" aria-hidden /> Reset
                            </button>
                          </div>
                          <textarea value={cv.code} onChange={(e) => setCode(item, { code: e.target.value })} onKeyDown={(e) => onEditorKey(e, item)} disabled={!live}
                            spellCheck={false} className="code-panel mt-2 w-full min-h-[300px] p-3.5 font-mono !text-xs leading-relaxed outline-none focus:ring-4 focus:ring-indigo-200" />
                          <div className="mt-2 flex items-center gap-2">
                            <button onClick={() => runTests(item)} disabled={!live || running[item.id]} className="btn-soft !py-2 !px-4 !text-xs font-bold inline-flex items-center gap-1.5">
                              <Play className="h-3.5 w-3.5" aria-hidden /> {running[item.id] ? 'Running tests…' : 'Run hidden tests'}
                            </button>
                            <span className="text-[11px] text-slate-400">{cv.lang === 'python' ? 'Python 3' : 'Node.js'} · keep the function name</span>
                          </div>
                          {tr && (
                            <div className={`mt-3 rounded-2xl border p-3.5 text-sm animate-fade-up ${tr.total > 0 && tr.passed === tr.total ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : tr.passed > 0 ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-rose-50 border-rose-200 text-rose-700'}`}>
                              <TestRunSummary tr={tr} />
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })()}
                </div>
              )}

              <div className="mt-7 pt-4 border-t border-slate-200/70 flex items-center justify-between gap-3 flex-wrap">
                <button onClick={prev} disabled={roundIdx === 0 && itemIdx === 0} className="btn-soft !px-4 !py-2.5 !text-xs disabled:opacity-30">
                  <ChevronLeft className="h-4 w-4" aria-hidden /> Previous
                </button>
                {item && (
                  <button onClick={() => setFlags((f) => ({ ...f, [item.id]: !f[item.id] }))}
                    className={`inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full text-xs font-bold border transition ${flags[item.id] ? 'bg-amber-50 text-amber-700 border-amber-300' : 'bg-white/70 text-slate-500 border-slate-200 hover:bg-white'}`}>
                    {flags[item.id] ? <BookmarkCheck className="h-4 w-4" aria-hidden /> : <Bookmark className="h-4 w-4" aria-hidden />}
                    {flags[item.id] ? 'Marked for review' : 'Mark for review'}
                  </button>
                )}
                {isLastItem ? (
                  <button onClick={() => setReviewMode('manual')} className="btn-primary !px-5 !py-2.5 !text-xs"><Send className="h-4 w-4" aria-hidden /> Review & submit</button>
                ) : (
                  <button onClick={next} className="btn-primary !px-5 !py-2.5 !text-xs">
                    {itemIdx === round.items.length - 1 ? `Next round: ${rounds[roundIdx + 1]?.label}` : 'Next'} <ChevronRight className="h-4 w-4" aria-hidden />
                  </button>
                )}
              </div>
            </div>
          )}
          <div className="mt-4 rounded-2xl bg-amber-50 border border-amber-200 p-3.5 text-xs text-amber-800">
            One attempt only — answers save automatically ({totalAnswered}/{totalItems} answered). Leaving the window, exiting fullscreen or changing displays counts as a warning; <b>{MAX_FOCUS_STRIKES} warnings submit the assessment automatically</b>.
          </div>
        </main>
      </div>

      {/* Review: manual (editable) or automatic (read-only) */}
      {reviewMode && review && (
        <AssessmentReview
          sections={review.sections}
          stats={review.stats}
          timeLeft={fmtClock(remaining)}
          strikes={proctoring.strikes}
          submitting={submitting}
          readOnly={reviewMode === 'auto'}
          autoReason={reviewMode === 'auto' ? (submitError ? `${autoReason} — ${submitError}` : autoReason) : undefined}
          scoreLabel={`${company.name} mock score`}
          onJump={(t) => { setReviewMode(null); goto(t.stage, t.sub) }}
          onCancel={() => setReviewMode(null)}
          onSubmit={() => {
            if (reviewMode === 'auto') {
              if (submitted) router.replace(`/company-assessments/${slug}/result?just=1`)
              else void doSubmit(true, autoReason)
            } else {
              void doSubmit(false)
            }
          }}
        />
      )}

      {submitError && reviewMode !== 'auto' && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[75] max-w-md w-[calc(100%-2rem)] rounded-2xl border border-rose-200 bg-white p-4 shadow-2xl animate-pop">
          <div className="text-sm font-bold text-rose-600">{submitError}</div>
          <button onClick={() => doSubmit(false)} className="btn-primary mt-3 !py-2 !text-xs">Retry submission</button>
        </div>
      )}

      {submitting && reviewMode !== 'auto' && (
        <div className="fixed inset-0 z-[65] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="glass-card flex items-center gap-3 px-6 py-5 animate-pop">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
            <span className="text-sm font-bold text-slate-700">Submitting and evaluating your answers…</span>
          </div>
        </div>
      )}

      <ProctorOverlays p={proctoring} companyName={company.name} live={live} />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* LeetCode-style per-test verdicts                                     */
/* ------------------------------------------------------------------ */

const VERDICT: Record<string, { Icon: typeof CheckCircle2; label: string; cls: string }> = {
  passed: { Icon: CheckCircle2, label: 'Passed', cls: 'text-emerald-600' },
  wrong: { Icon: XCircle, label: 'Wrong answer', cls: 'text-rose-600' },
  tle: { Icon: Timer, label: 'Time limit exceeded', cls: 'text-amber-600' },
  error: { Icon: AlertTriangle, label: 'Runtime error', cls: 'text-rose-600' },
}

function TestRunSummary({ tr }: { tr: TestRunResult }) {
  const count = (s: string) => tr.results.filter((r) => (r.status || (r.passed ? 'passed' : 'wrong')) === s).length
  const tle = count('tle'), wrong = count('wrong'), err = count('error')
  return (
    <>
      <div className="font-bold">
        {tr.passed}/{tr.total} tests passed{tr.timedOut ? ' · run timed out' : ''}
      </div>
      {(tle > 0 || wrong > 0 || err > 0) && (
        <div className="mt-1 flex flex-wrap gap-1.5 text-[11px] font-semibold">
          {wrong > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-white/70 px-2 py-0.5 text-rose-700"><XCircle className="h-3 w-3" aria-hidden /> {wrong} wrong</span>}
          {tle > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-white/70 px-2 py-0.5 text-amber-700"><Timer className="h-3 w-3" aria-hidden /> {tle} time limit exceeded — try a faster algorithm</span>}
          {err > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-white/70 px-2 py-0.5 text-rose-700"><AlertTriangle className="h-3 w-3" aria-hidden /> {err} runtime error{err > 1 ? 's' : ''}</span>}
        </div>
      )}
      {tr.error && <div className="mt-1 flex items-start gap-1 text-xs opacity-90"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden /> {tr.error}</div>}
      {tr.results.length > 0 && (
        <ul className="mt-2 grid sm:grid-cols-2 gap-x-3 gap-y-1">
          {tr.results.map((t, i) => {
            const v = VERDICT[t.status || (t.passed ? 'passed' : 'wrong')] || VERDICT.wrong
            return (
              <li key={i} className="text-xs" title={v.label}>
                <div className="flex items-center gap-1.5">
                  <v.Icon className={`h-3.5 w-3.5 shrink-0 ${v.cls}`} aria-label={v.label} />
                  <span className="truncate">{t.name}</span>
                  {t.stress && <span className="rounded bg-slate-900/80 px-1 text-[9px] font-bold uppercase tracking-wide text-white">stress</span>}
                  {typeof t.ms === 'number' && t.status !== 'tle' && <span className="ml-auto shrink-0 font-mono text-[10px] text-slate-500">{t.ms} ms</span>}
                  {t.status === 'tle' && <span className="ml-auto shrink-0 text-[10px] font-semibold text-amber-700">TLE</span>}
                </div>
                {t.message && <div className="ml-5 text-[10px] text-slate-500 break-words">{t.message}</div>}
                {t.sample && t.status === 'wrong' && (t.got !== undefined || t.expected !== undefined) && (
                  <div className="ml-5 mt-0.5 rounded-lg bg-white/80 px-2 py-1 font-mono text-[10px] text-slate-600 break-all">
                    <div><b>Your output:</b> {t.got}</div>
                    <div><b>Expected:</b> {t.expected}</div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
