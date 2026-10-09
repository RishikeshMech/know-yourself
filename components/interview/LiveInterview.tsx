'use client'
import { authenticatedFetch } from '@/lib/clientAuth'
import { useEffect, useRef, useState } from 'react'
import { CameraPreview } from './CameraPreview.tsx'
import { VoiceControls } from './VoiceControls.tsx'
import { CodeEditorPanel } from './CodeEditorPanel.tsx'
import type { CodeLang } from '@/lib/company/languages.ts'

interface Props {
  sessionId: string
  initialSession: any
  initialQuestion: any
}

export function LiveInterview({ sessionId, initialSession, initialQuestion }: Props) {
  const [session, setSession] = useState(initialSession)
  const [currentQuestion, setCurrentQuestion] = useState(initialQuestion)
  const [transcript, setTranscript] = useState<Array<{ role: 'interviewer' | 'student'; text: string; time: string }>>(() => {
    const turns = initialSession.turns || []
    return turns.map((t: any) => ({ role: t.role, text: t.text, time: new Date(t.timestamp).toLocaleTimeString() }))
  })
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [interviewerSpeakingText, setInterviewerSpeakingText] = useState('')
  const [voiceEnabled, setVoiceEnabled] = useState(!!initialSession.device_check?.voice_mode_enabled)
  const [cameraEnabled, setCameraEnabled] = useState(!!initialSession.consent?.camera_mic_enabled)
  const [codeRunning, setCodeRunning] = useState(false)
  const [codeResults, setCodeResults] = useState<any>(null)
  const [timerSec, setTimerSec] = useState(0)
  const [showEndConfirm, setShowEndConfirm] = useState(false)
  const [hintLoading, setHintLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Timer
  useEffect(() => {
    const started = session.started_at ? new Date(session.started_at).getTime() : Date.now()
    const iv = setInterval(() => {
      const elapsed = Math.floor((Date.now() - started) / 1000) - (session.total_paused_sec || 0)
      setTimerSec(Math.max(0, elapsed))
    }, 1000)
    return () => clearInterval(iv)
  }, [session.started_at, session.total_paused_sec])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [transcript])

  // Initialize interviewer speaking text from last interviewer turn
  useEffect(() => {
    const lastInterviewer = [...(session.turns || [])].reverse().find((t: any) => t.role === 'interviewer')
    if (lastInterviewer) setInterviewerSpeakingText(lastInterviewer.text)
    else if (currentQuestion) setInterviewerSpeakingText(currentQuestion.prompt)
  }, [])

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  const sendAnswer = async (text: string, opts: { skip?: boolean; code?: string; lang?: CodeLang } = {}) => {
    if (!text.trim() && !opts.skip && !opts.code) return
    setSending(true)
    const studentText = opts.skip ? '[SKIPPED]' : text

    // Optimistic UI
    setTranscript(prev => [...prev, { role: 'student', text: studentText, time: new Date().toLocaleTimeString() }])
    setInput('')

    try {
      const res = await authenticatedFetch(`/api/interviews/${sessionId}/turns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: studentText,
          input_mode: opts.code ? 'code' : voiceEnabled ? 'voice' : 'text',
          code_snapshot: opts.code,
          language: opts.lang,
          skip: !!opts.skip,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error || 'Failed to send')
        return
      }

      setTranscript(prev => [...prev, { role: 'interviewer', text: data.interviewer_reply, time: new Date().toLocaleTimeString() }])
      setInterviewerSpeakingText(data.interviewer_reply)
      setSession((s: any) => ({ ...s, state: data.state, blueprint: { ...s.blueprint, ...data.blueprint_progress } }))

      // If next question, fetch fresh session to get new question prompt
      if (data.next_question_id) {
        const sessRes = await authenticatedFetch(`/api/interviews/${sessionId}`)
        const sessData = await sessRes.json()
        if (sessData.current_question) setCurrentQuestion(sessData.current_question)
        setSession(sessData.session)
      }

      if (data.state === 'EVALUATING' || data.state === 'WRAP_UP' && !data.next_question_id) {
        // Auto-end after wrap-up if no more questions
        if (!data.next_question_id) {
          setTimeout(() => handleEnd(), 1500)
        }
      }
    } catch (e: any) {
      alert('Send failed: ' + (e?.message || e))
    } finally {
      setSending(false)
    }
  }

  const handleHint = async () => {
    setHintLoading(true)
    try {
      const res = await authenticatedFetch(`/api/interviews/${sessionId}/hint`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error)
        return
      }
      setTranscript(prev => [...prev, { role: 'interviewer', text: data.interviewer_reply, time: new Date().toLocaleTimeString() }])
      setInterviewerSpeakingText(data.interviewer_reply)
    } catch (e: any) {
      alert('Hint failed')
    } finally {
      setHintLoading(false)
    }
  }

  const handleCodeRun = async (code: string, lang: CodeLang) => {
    setCodeRunning(true)
    try {
      const res = await authenticatedFetch(`/api/interviews/${sessionId}/code/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, language: lang, question_id: currentQuestion?.id }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error)
        return
      }
      setCodeResults(data)
      // Also send as answer with code snapshot
      await sendAnswer(`I ran my code — ${data.summary}`, { code, lang })
    } catch (e: any) {
      alert('Code run failed')
    } finally {
      setCodeRunning(false)
    }
  }

  const handlePause = async () => {
    try {
      const res = await authenticatedFetch(`/api/interviews/${sessionId}/pause`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) { alert(data.error); return }
      setSession((s: any) => ({ ...s, state: 'PAUSED' }))
    } catch {}
  }

  const handleResume = async () => {
    try {
      const res = await authenticatedFetch(`/api/interviews/${sessionId}/resume`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) { alert(data.error); return }
      setSession((s: any) => ({ ...s, state: data.state }))
    } catch {}
  }

  const handleEnd = async () => {
    try {
      const res = await authenticatedFetch(`/api/interviews/${sessionId}/end`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) { alert(data.error); return }
      window.location.href = `/interviews/${sessionId}/report`
    } catch (e: any) {
      alert('End failed: ' + (e?.message || e))
    }
  }

  const isPaused = session.state === 'PAUSED'
  const isEnded = ['REPORT_READY', 'ABANDONED', 'TERMINATED', 'EVALUATING'].includes(session.state)

  return (
    <div className="mx-auto max-w-6xl grid gap-4 p-3 md:grid-cols-3">
      {/* Left: transcript & input */}
      <div className="md:col-span-2 flex flex-col rounded-3xl border border-white/60 bg-white/70 backdrop-blur-xl shadow-lg overflow-hidden min-h-[600px]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-white/80 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center text-white font-black text-xs">SAM</div>
            <div>
              <div className="text-sm font-bold text-slate-800">Sam — AI Interviewer</div>
              <div className="text-[11px] text-slate-500">{session.track === 'swe' ? 'SWE' : 'AI/ML'} · {session.mode} · Attempt {session.attempt_number}/3 · State: {session.state}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-mono font-bold text-white">{formatTime(timerSec)} / {session.blueprint?.total_duration_min || 35}:00</span>
            <button onClick={isPaused ? handleResume : handlePause} disabled={isEnded} className="btn-soft !py-1.5 !px-3 !text-xs disabled:opacity-40">
              {isPaused ? 'Resume' : 'Pause (once, 5m)'}
            </button>
            <button onClick={() => setShowEndConfirm(true)} className="btn-soft !py-1.5 !px-3 !text-xs !border-rose-200 !text-rose-600">End</button>
          </div>
        </div>

        {/* Transcript */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gradient-to-b from-white/60 to-slate-50/40">
          {currentQuestion && (
            <div className="rounded-2xl border border-indigo-200 bg-indigo-50/70 p-3">
              <div className="text-[10px] font-black uppercase tracking-wide text-indigo-600">Current Question · {currentQuestion.section} · {currentQuestion.topic?.join(', ')}</div>
              <div className="mt-1 text-sm font-semibold text-slate-800">{currentQuestion.prompt}</div>
              {currentQuestion.coding_spec && <div className="mt-1 text-[11px] text-slate-500">Complexity target: {currentQuestion.coding_spec.target_complexity}</div>}
            </div>
          )}
          {transcript.map((t, i) => (
            <div key={i} className={`flex ${t.role === 'student' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm ${t.role === 'student' ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-800'}`}>
                <div>{t.text}</div>
                <div className={`mt-1 text-[10px] ${t.role === 'student' ? 'text-indigo-200' : 'text-slate-400'}`}>{t.time}</div>
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Voice & input */}
        <div className="border-t border-slate-100 bg-white p-3 space-y-3">
          <VoiceControls
            enabled={voiceEnabled}
            onTranscript={(text, isFinal) => {
              if (isFinal) setInput(prev => (prev ? prev + ' ' : '') + text)
            }}
            onMicStatus={() => {}}
            interviewerText={interviewerSpeakingText}
            autoSpeak={true}
          />
          <div className="flex gap-2">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder={voiceEnabled ? 'Speak or type your answer…' : 'Type your answer… (Shift+Enter for new line, Enter to send)'}
              className="field min-h-[60px] flex-1 resize-none"
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  sendAnswer(input)
                }
              }}
              disabled={sending || isPaused || isEnded}
            />
            <div className="flex flex-col gap-1.5">
              <button disabled={sending || isPaused || isEnded || !input.trim()} onClick={() => sendAnswer(input)} className="btn-primary !px-4 !py-2.5 text-xs disabled:opacity-40">
                {sending ? '…' : 'Send →'}
              </button>
              <button disabled={sending || isPaused || isEnded} onClick={() => sendAnswer('', { skip: true })} className="btn-soft !px-3 !py-1.5 text-[11px]">Skip</button>
              <button disabled={hintLoading || isPaused || isEnded} onClick={handleHint} className="btn-soft !px-3 !py-1.5 text-[11px] border-amber-200">
                {hintLoading ? '…' : '💡 Hint'}
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <span>Press Enter to send, Shift+Enter for newline</span>
            <span>·</span>
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={voiceEnabled} onChange={e => setVoiceEnabled(e.target.checked)} />
              Voice mode
            </label>
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={cameraEnabled} onChange={e => setCameraEnabled(e.target.checked)} />
              Camera
            </label>
          </div>
        </div>
      </div>

      {/* Right: camera, code, progress */}
      <div className="space-y-4">
        <CameraPreview enabled={cameraEnabled} />

        <div className="panel p-3">
          <div className="text-xs font-bold text-slate-700">Session progress</div>
          <div className="mt-2 space-y-1.5">
            {(session.blueprint?.sections || []).map((sec: any, idx: number) => {
              const isActive = idx === session.blueprint?.active_section_index
              const isPast = idx < session.blueprint?.active_section_index
              return (
                <div key={sec.id} className={`flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-xs ${isActive ? 'bg-indigo-600 text-white font-bold' : isPast ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-50 text-slate-500'}`}>
                  <span className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] ${isActive ? 'bg-white text-indigo-600' : isPast ? 'bg-emerald-500 text-white' : 'bg-slate-200'}`}>{isPast ? '✓' : idx + 1}</span>
                  <span className="flex-1 truncate">{sec.label}</span>
                  <span className="text-[10px] opacity-70">{sec.time_budget_min}m</span>
                </div>
              )
            })}
          </div>
          <div className="mt-3 text-[11px] text-slate-500">
            Q {session.blueprint?.active_question_index + 1} / {session.blueprint?.sections?.[session.blueprint?.active_section_index]?.question_ids?.length || 1} in current section
          </div>
        </div>

        {currentQuestion?.type === 'coding' && currentQuestion?.coding_spec && (
          <CodeEditorPanel starterCode={currentQuestion.coding_spec.starter_code} onRun={handleCodeRun} running={codeRunning} results={codeResults} />
        )}

        <div className="rounded-2xl border border-slate-200 bg-white p-3 text-[11px] text-slate-500">
          <div className="font-bold text-slate-700">Integrity signals (transparent, not auto-fail)</div>
          <div className="mt-1">Tab switches, large pastes, fast answers logged as information for you.</div>
          <div className="mt-2 text-[10px]">Cost: ~₹{session.token_usage?.estimated_cost_inr || 0} · Tokens: {session.token_usage?.prompt_tokens || 0} prompt + {session.token_usage?.completion_tokens || 0} completion</div>
        </div>
      </div>

      {showEndConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="glass-card max-w-sm w-full">
            <div className="text-sm font-bold">End interview and generate report?</div>
            <p className="mt-1 text-xs text-slate-500">Your progress will be evaluated and a report generated. This counts as an attempt.</p>
            <div className="mt-4 flex gap-2 justify-end">
              <button onClick={() => setShowEndConfirm(false)} className="btn-soft !py-2 !px-4 text-xs">Cancel</button>
              <button onClick={() => { setShowEndConfirm(false); handleEnd() }} className="btn-primary !py-2 !px-4 text-xs">End & get report →</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
