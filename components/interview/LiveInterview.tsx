'use client'
import { useEffect, useRef, useState } from 'react'
import { CameraPreview } from './CameraPreview.tsx'
import { VoiceControls } from './VoiceControls.tsx'
import { CodeEditorPanel } from './CodeEditorPanel.tsx'
import { formatTrackName } from '@/lib/interview/questionBank.ts'
import type { CodeLang } from '@/lib/company/languages.ts'

interface Props {
  sessionId: string
  initialSession: any
  initialQuestion: any
  initialQuestionsPlan?: any[]
}

export function LiveInterview({
  sessionId,
  initialSession,
  initialQuestion,
  initialQuestionsPlan = [],
}: Props) {
  const [session, setSession] = useState(initialSession)
  const [currentQuestion, setCurrentQuestion] = useState(initialQuestion)
  const [questionsPlan, setQuestionsPlan] = useState<any[]>(initialQuestionsPlan)
  const [transcript, setTranscript] = useState<
    Array<{ role: 'interviewer' | 'student'; text: string; time: string; questionId?: string; isFollowUp?: boolean }>
  >(() => {
    const turns = initialSession.turns || []
    const trackName = formatTrackName(initialSession.track || 'swe')
    return turns.map((t: any) => ({
      role: t.role,
      text: String(t.text || '').replace(/\{track\}/gi, trackName),
      time: new Date(t.timestamp).toLocaleTimeString(),
      questionId: t.question_id,
      isFollowUp: !!t.is_follow_up,
    }))
  })
  const [input, setInput] = useState('')
  const [liveInterimText, setLiveInterimText] = useState('')
  const [sending, setSending] = useState(false)
  const [interviewerSpeakingText, setInterviewerSpeakingText] = useState('')
  // Voice mode & continuous mic are ON by default so mic never starts turned off
  const [voiceEnabled, setVoiceEnabled] = useState(
    initialSession.device_check?.voice_mode_enabled !== false,
  )
  const [cameraEnabled, setCameraEnabled] = useState(
    initialSession.consent?.camera_mic_enabled !== false,
  )
  const [micActiveStatus, setMicActiveStatus] = useState(true)
  const [recordedAudioByQuestion, setRecordedAudioByQuestion] = useState<
    Record<string, { url: string; durationSec: number }>
  >({})
  const [activeViewTab, setActiveViewTab] = useState<'qa' | 'transcript'>('qa')
  const [codeRunning, setCodeRunning] = useState(false)
  const [codeResults, setCodeResults] = useState<any>(null)
  const [timerSec, setTimerSec] = useState(0)
  const [showEndConfirm, setShowEndConfirm] = useState(false)
  const [hintLoading, setHintLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const trackLabel = formatTrackName(session.track || 'swe')
  const yearLabel = session.year === 3 ? '3rd Year' : '2nd Year'

  // Sync props if parent updates them after consent
  useEffect(() => {
    if (initialQuestion && (!currentQuestion || initialQuestion.id !== currentQuestion.id)) {
      setCurrentQuestion(initialQuestion)
    }
  }, [initialQuestion])

  useEffect(() => {
    if (Array.isArray(initialQuestionsPlan) && initialQuestionsPlan.length > 0 && questionsPlan.length === 0) {
      setQuestionsPlan(initialQuestionsPlan)
    }
  }, [initialQuestionsPlan])

  // Fetch full question plan & current question if missing on mount
  useEffect(() => {
    if (!currentQuestion || questionsPlan.length === 0 || (session.turns || []).length === 0) {
      fetch(`/api/interviews/${sessionId}`)
        .then(r => r.json())
        .then(data => {
          if (data.current_question) setCurrentQuestion(data.current_question)
          if (Array.isArray(data.questions_plan)) setQuestionsPlan(data.questions_plan)
          if (data.session) {
            setSession(data.session)
            const turns = data.session.turns || []
            if (turns.length > 0) {
              setTranscript(
                turns.map((t: any) => ({
                  role: t.role,
                  text: String(t.text || '').replace(/\{track\}/gi, trackLabel),
                  time: new Date(t.timestamp).toLocaleTimeString(),
                  questionId: t.question_id,
                  isFollowUp: !!t.is_follow_up,
                })),
              )
              const lastInterviewer = [...turns].reverse().find((t: any) => t.role === 'interviewer')
              if (lastInterviewer) {
                setInterviewerSpeakingText(String(lastInterviewer.text || '').replace(/\{track\}/gi, trackLabel))
              }
            }
          }
        })
        .catch(() => {})
    }
  }, [sessionId])

  // Timer
  useEffect(() => {
    const started = session.started_at ? new Date(session.started_at).getTime() : Date.now()
    const iv = setInterval(() => {
      const elapsed = Math.floor((Date.now() - started) / 1000) - (session.total_paused_sec || 0)
      setTimerSec(Math.max(0, elapsed))
    }, 1000)
    return () => clearInterval(iv)
  }, [session.started_at, session.total_paused_sec])

  // Initialize interviewer speaking text from last interviewer turn or current question
  useEffect(() => {
    const lastInterviewer = [...(session.turns || [])].reverse().find((t: any) => t.role === 'interviewer')
    if (lastInterviewer?.text) {
      setInterviewerSpeakingText(String(lastInterviewer.text).replace(/\{track\}/gi, trackLabel))
    } else if (currentQuestion?.prompt) {
      setInterviewerSpeakingText(
        `Namaste! Welcome to your ${trackLabel} mock interview. Let's start with Question 1: ${String(currentQuestion.prompt).replace(/\{track\}/gi, trackLabel)}`,
      )
    }
  }, [currentQuestion?.id])

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  const sendAnswer = async (
    text: string,
    opts: { skip?: boolean; askFollowUp?: boolean; code?: string; lang?: CodeLang } = {},
  ) => {
    const fullText = (text + (liveInterimText ? ' ' + liveInterimText : '')).trim()
    if (!fullText && !opts.skip && !opts.code) return
    setSending(true)
    setLiveInterimText('')
    const studentText = opts.skip ? '[SKIPPED]' : fullText

    // Optimistic UI
    setTranscript(prev => [
      ...prev,
      {
        role: 'student',
        text: studentText,
        time: new Date().toLocaleTimeString(),
        questionId: currentQuestion?.id,
      },
    ])
    setInput('')

    try {
      const res = await fetch(`/api/interviews/${sessionId}/turns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: studentText,
          input_mode: opts.code ? 'code' : voiceEnabled ? 'voice' : 'text',
          code_snapshot: opts.code,
          language: opts.lang,
          skip: !!opts.skip,
          ask_follow_up: !!opts.askFollowUp,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error || 'Failed to send')
        return
      }

      const cleanReply = String(data.interviewer_reply || '').replace(/\{track\}/gi, trackLabel)
      setTranscript(prev => [
        ...prev,
        {
          role: 'interviewer',
          text: cleanReply,
          time: new Date().toLocaleTimeString(),
          questionId: data.next_question_id || currentQuestion?.id,
          isFollowUp: !!data.is_follow_up,
        },
      ])
      setInterviewerSpeakingText(cleanReply)

      if (data.current_question) {
        setCurrentQuestion(data.current_question)
      }
      if (Array.isArray(data.questions_plan)) {
        setQuestionsPlan(data.questions_plan)
      }

      setSession((s: any) => ({
        ...s,
        state: data.state,
        token_usage: data.token_usage || s.token_usage,
        blueprint: {
          ...s.blueprint,
          ...data.blueprint_progress,
          current_question_id: data.next_question_id || '',
        },
      }))

      // Clear previous question's code results when moving to a new question
      if (!data.is_follow_up) {
        setCodeResults(null)
      }

      if (data.state === 'EVALUATING' || (data.state === 'WRAP_UP' && !data.next_question_id)) {
        if (!data.next_question_id) {
          setTimeout(() => handleEnd(), 1800)
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
      const res = await fetch(`/api/interviews/${sessionId}/hint`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error)
        return
      }
      const cleanHint = String(data.interviewer_reply || '').replace(/\{track\}/gi, trackLabel)
      setTranscript(prev => [
        ...prev,
        {
          role: 'interviewer',
          text: cleanHint,
          time: new Date().toLocaleTimeString(),
          questionId: currentQuestion?.id,
        },
      ])
      setInterviewerSpeakingText(cleanHint)
    } catch {
      alert('Hint failed')
    } finally {
      setHintLoading(false)
    }
  }

  const handleCodeRun = async (code: string, lang: CodeLang) => {
    setCodeRunning(true)
    try {
      const res = await fetch(`/api/interviews/${sessionId}/code/run`, {
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
      await sendAnswer(`I ran my ${lang} solution — ${data.summary}`, { code, lang })
    } catch {
      alert('Code run failed')
    } finally {
      setCodeRunning(false)
    }
  }

  const handlePause = async () => {
    try {
      const res = await fetch(`/api/interviews/${sessionId}/pause`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error)
        return
      }
      setSession((s: any) => ({ ...s, state: 'PAUSED' }))
    } catch {}
  }

  const handleResume = async () => {
    try {
      const res = await fetch(`/api/interviews/${sessionId}/resume`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error)
        return
      }
      setSession((s: any) => ({ ...s, state: data.state }))
    } catch {}
  }

  const handleEnd = async () => {
    try {
      const res = await fetch(`/api/interviews/${sessionId}/end`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error)
        return
      }
      window.location.href = `/interviews/${sessionId}/report`
    } catch (e: any) {
      alert('End failed: ' + (e?.message || e))
    }
  }

  const isPaused = session.state === 'PAUSED'
  const isEnded = ['REPORT_READY', 'ABANDONED', 'TERMINATED', 'EVALUATING'].includes(session.state)

  const totalQuestions =
    questionsPlan.length ||
    (session.blueprint?.sections || []).reduce(
      (sum: number, s: any) => sum + (s.question_ids?.length || 0),
      0,
    ) ||
    1
  const currentPlanItem = questionsPlan.find(q => q.id === currentQuestion?.id)
  const currentQuestionNumber =
    currentQuestion?.question_number || currentPlanItem?.question_number || 1
  const currentSectionLabel =
    currentQuestion?.section_label ||
    currentPlanItem?.section_label ||
    session.blueprint?.sections?.[session.blueprint?.active_section_index]?.label ||
    currentQuestion?.section ||
    'Interview'
  const answeredCount = questionsPlan.filter(
    q => q.status === 'answered' || q.status === 'skipped',
  ).length

  const currentPromptResolved = String(currentQuestion?.prompt || '').replace(
    /\{track\}/gi,
    trackLabel,
  )
  const lastInterviewerTurn = [...transcript].reverse().find(t => t.role === 'interviewer')

  const combinedDraftWordCount = (input + ' ' + liveInterimText)
    .trim()
    .split(/\s+/)
    .filter(Boolean).length

  return (
    <div className="mx-auto max-w-7xl px-3 py-2 space-y-4">
      {/* Top Track & Interview Status Banner */}
      <div className="rounded-3xl border border-indigo-200/80 bg-gradient-to-r from-slate-900 via-indigo-950 to-violet-950 px-5 py-3.5 text-white shadow-lg flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3.5">
          <div className="relative">
            <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-white font-black text-sm shadow-md">
              SAM
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-emerald-400 border-2 border-slate-900" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-black tracking-wide">Sam — AI Technical Interviewer</span>
              <span className="rounded-full bg-indigo-500/30 border border-indigo-400/50 px-2.5 py-0.5 text-[11px] font-bold text-indigo-100">
                🎯 Track: {trackLabel}
              </span>
              <span className="rounded-full bg-emerald-500/25 border border-emerald-400/40 px-2.5 py-0.5 text-[11px] font-bold text-emerald-200">
                🇮🇳 Indian English Voice
              </span>
              <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-semibold text-slate-200">
                {yearLabel} · <span className="capitalize">{session.mode}</span> Mode · Attempt #{session.attempt_number}/3
              </span>
            </div>
            <div className="mt-1 text-xs text-indigo-200/90 flex flex-wrap items-center gap-2">
              <span>
                Active Section: <b className="text-white">{currentSectionLabel}</b>
              </span>
              <span>·</span>
              <span>
                Question <b className="text-white">{currentQuestionNumber} of {totalQuestions}</b> (Asked in Continuation)
              </span>
              <span>·</span>
              <span className="inline-flex items-center gap-1 text-rose-300 font-semibold">
                <span className="h-2 w-2 rounded-full bg-rose-400 animate-ping" />
                Live Recording & Continuous Mic Active
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-white/15 border border-white/20 px-3.5 py-1.5 text-xs font-mono font-bold text-white">
            ⏱ {formatTime(timerSec)} / {session.blueprint?.total_duration_min || 35}:00
          </span>
          <button
            onClick={isPaused ? handleResume : handlePause}
            disabled={isEnded}
            className="rounded-full bg-white/10 hover:bg-white/20 border border-white/20 px-3.5 py-1.5 text-xs font-bold text-white transition disabled:opacity-40"
          >
            {isPaused ? '▶ Resume Interview' : '⏸ Pause (once, 5m)'}
          </button>
          <button
            onClick={() => setShowEndConfirm(true)}
            className="rounded-full bg-rose-500 hover:bg-rose-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm transition"
          >
            Finish & Get Report →
          </button>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Left 2 Columns: Active Question & Live Recording Workspace + Question & Answer Section */}
        <div className="lg:col-span-2 space-y-4">
          {/* 1. ACTIVE QUESTION & LIVE RECORDING WORKSPACE */}
          <div className="rounded-3xl border border-indigo-200/90 bg-white/90 backdrop-blur-xl shadow-lg overflow-hidden">
            {/* Active Question Header Bar */}
            <div className="bg-gradient-to-r from-indigo-50 via-violet-50 to-white border-b border-indigo-100 px-5 py-3.5 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-xl bg-indigo-600 px-3 py-1 text-xs font-black uppercase tracking-wider text-white shadow-sm">
                  Question {currentQuestionNumber} of {totalQuestions}
                </span>
                <span className="rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200 px-2.5 py-0.5 text-xs font-bold">
                  Track: {trackLabel}
                </span>
                <span className="rounded-full bg-violet-100 text-violet-800 border border-violet-200 px-2.5 py-0.5 text-xs font-bold">
                  {currentSectionLabel}
                </span>
                {(currentQuestion?.topic || []).map((t: string) => (
                  <span
                    key={t}
                    className="rounded-full bg-slate-100 text-slate-700 border border-slate-200 px-2.5 py-0.5 text-[11px] font-semibold uppercase"
                  >
                    {t}
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500 font-semibold">
                {currentQuestion?.time_limit_min && (
                  <span>Suggested time: ~{currentQuestion.time_limit_min} min</span>
                )}
              </div>
            </div>

            <div className="p-5 space-y-4">
              {/* Sam's Continuation Message + Current Question Prompt */}
              {currentQuestion ? (
                <div className="space-y-3">
                  {/* Show Sam's conversational continuation bridge if this is Q2+ or a follow-up */}
                  {lastInterviewerTurn &&
                    lastInterviewerTurn.text &&
                    lastInterviewerTurn.text !== currentPromptResolved && (
                      <div className="rounded-2xl border border-violet-200 bg-violet-50/70 p-3.5 text-xs text-slate-700 leading-relaxed">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="font-black uppercase tracking-wider text-violet-700 text-[10px]">
                            🇮🇳 Sam (Interviewer Continuation)
                          </span>
                          <span className="text-[10px] text-slate-400">{lastInterviewerTurn.time}</span>
                        </div>
                        <div className="whitespace-pre-line font-medium text-slate-800">
                          {lastInterviewerTurn.text}
                        </div>
                      </div>
                    )}

                  {/* Highlighted Current Question Box */}
                  <div className="rounded-2xl border-2 border-indigo-500/80 bg-gradient-to-br from-indigo-50/90 via-white to-indigo-50/40 p-4 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                      <span className="text-[11px] font-black uppercase tracking-wider text-indigo-700">
                        📌 Active Question #{currentQuestionNumber} ({trackLabel} · {currentSectionLabel})
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setInterviewerSpeakingText(
                            `Question ${currentQuestionNumber} on the ${trackLabel} track: ${currentPromptResolved} `,
                          )
                        }
                        className="inline-flex items-center gap-1 rounded-full bg-indigo-600 hover:bg-indigo-700 px-3 py-1 text-[11px] font-bold text-white shadow-sm transition"
                      >
                        🔊 Speak Question (Indian Voice)
                      </button>
                    </div>
                    <div className="text-base font-bold text-slate-900 leading-snug">
                      {currentPromptResolved}
                    </div>
                    {currentQuestion.coding_spec && (
                      <div className="mt-2 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-1 text-xs font-mono text-indigo-200">
                        <span>💻 Coding Problem</span>
                        <span>·</span>
                        <span>Target Complexity: {currentQuestion.coding_spec.target_complexity}</span>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  Loading question for {trackLabel}…
                </div>
              )}

              {/* LIVE RECORDING & CONTINUOUS INDIAN VOICE CONTROLS */}
              <VoiceControls
                enabled={voiceEnabled}
                disabled={isPaused || isEnded}
                track={session.track || 'swe'}
                currentQuestionId={currentQuestion?.id || `q_${currentQuestionNumber}`}
                onTranscript={(text, isFinal) => {
                  if (isFinal) {
                    setInput(prev => (prev ? prev.trim() + ' ' : '') + text)
                    setLiveInterimText('')
                  } else {
                    setLiveInterimText(text)
                  }
                }}
                onMicStatus={ok => setMicActiveStatus(ok)}
                onRecordingSaved={(qId, audioUrl, durationSec) => {
                  setRecordedAudioByQuestion(prev => ({
                    ...prev,
                    [qId]: { url: audioUrl, durationSec },
                  }))
                }}
                interviewerText={interviewerSpeakingText}
                autoSpeak={true}
              />

              {/* LIVE QUESTION-ANSWER INPUT BOX */}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-xs font-black uppercase tracking-wide text-slate-700 flex items-center gap-2">
                    <span>✍️ Your Answer for Question {currentQuestionNumber}</span>
                    {voiceEnabled && micActiveStatus && (
                      <span className="rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold">
                        ● Live Voice-to-Text Active ({combinedDraftWordCount} words)
                      </span>
                    )}
                  </label>
                  {input && (
                    <button
                      type="button"
                      onClick={() => {
                        setInput('')
                        setLiveInterimText('')
                      }}
                      className="text-[11px] font-semibold text-slate-400 hover:text-rose-600"
                    >
                      Clear draft
                    </button>
                  )}
                </div>

                <div className="relative">
                  <textarea
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    placeholder={
                      voiceEnabled
                        ? `Speak naturally into your microphone (your words appear here live) or type your answer to Question ${currentQuestionNumber}…`
                        : `Type your answer to Question ${currentQuestionNumber}… (Enter to submit, Shift+Enter for newline)`
                    }
                    className="field min-h-[105px] w-full resize-y text-sm leading-relaxed"
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        sendAnswer(input)
                      }
                    }}
                    disabled={sending || isPaused || isEnded}
                  />
                  {liveInterimText && (
                    <div className="mt-1 rounded-xl border border-emerald-200 bg-emerald-50/80 px-3 py-1.5 text-xs text-emerald-900">
                      <span className="font-bold">🎙️ Live speaking: </span>
                      <span className="italic">{liveInterimText}…</span>
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={sending || isPaused || isEnded || (!input.trim() && !liveInterimText.trim())}
                      onClick={() => sendAnswer(input)}
                      className="btn-primary !px-5 !py-2.5 text-xs font-black disabled:opacity-40"
                    >
                      {sending
                        ? 'Submitting & Continuing…'
                        : currentQuestionNumber < totalQuestions
                          ? `Submit Answer & Continue to Question ${currentQuestionNumber + 1} →`
                          : 'Submit Final Answer & Finish →'}
                    </button>

                    {(currentQuestion?.follow_ups?.length || 0) > 0 && (
                      <button
                        type="button"
                        disabled={sending || isPaused || isEnded || (!input.trim() && !liveInterimText.trim())}
                        onClick={() => sendAnswer(input, { askFollowUp: true })}
                        className="btn-soft !px-3.5 !py-2 text-xs font-bold !border-indigo-200 !text-indigo-700 disabled:opacity-40"
                        title="Submit this answer and have Sam ask a targeted follow-up question in continuation before moving to the next question"
                      >
                        💬 Submit & Ask Follow-up
                      </button>
                    )}

                    <button
                      type="button"
                      disabled={hintLoading || isPaused || isEnded}
                      onClick={handleHint}
                      className="btn-soft !px-3.5 !py-2 text-xs font-bold !border-amber-200 !text-amber-800"
                    >
                      {hintLoading ? 'Getting hint…' : '💡 Hint'}
                    </button>

                    <button
                      type="button"
                      disabled={sending || isPaused || isEnded}
                      onClick={() => sendAnswer('', { skip: true })}
                      className="btn-soft !px-3 !py-2 text-xs text-slate-600"
                    >
                      ⏭ Skip Question
                    </button>
                  </div>

                  <div className="flex items-center gap-3 text-[11px] text-slate-500">
                    <label className="flex items-center gap-1 cursor-pointer font-semibold">
                      <input
                        type="checkbox"
                        checked={voiceEnabled}
                        onChange={e => setVoiceEnabled(e.target.checked)}
                      />
                      Voice & Live Recording
                    </label>
                    <label className="flex items-center gap-1 cursor-pointer font-semibold">
                      <input
                        type="checkbox"
                        checked={cameraEnabled}
                        onChange={e => setCameraEnabled(e.target.checked)}
                      />
                      Camera
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 2. DEDICATED QUESTION & ANSWER (Q&A) SECTION + LIVE TRANSCRIPT */}
          <div className="rounded-3xl border border-white/80 bg-white/90 backdrop-blur-xl shadow-lg overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50/80 px-5 py-3">
              <div>
                <h3 className="text-sm font-black text-slate-900">
                  📋 Question & Answer Section — {trackLabel} ({answeredCount}/{totalQuestions} Answered)
                </h3>
                <p className="text-[11px] text-slate-500">
                  All {totalQuestions} interview questions in continuation with your recorded answers, follow-ups, and Sam’s feedback
                </p>
              </div>
              <div className="flex items-center gap-1.5 rounded-full bg-slate-200/70 p-1">
                <button
                  type="button"
                  onClick={() => setActiveViewTab('qa')}
                  className={`rounded-full px-3 py-1 text-xs font-bold transition ${
                    activeViewTab === 'qa'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Question & Answer Section ({totalQuestions})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveViewTab('transcript')}
                  className={`rounded-full px-3 py-1 text-xs font-bold transition ${
                    activeViewTab === 'transcript'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Live Chat Transcript ({transcript.length})
                </button>
              </div>
            </div>

            {activeViewTab === 'qa' ? (
              <div className="p-4 space-y-3 max-h-[540px] overflow-y-auto">
                {questionsPlan.map((qItem: any) => {
                  const isCurrent = qItem.status === 'current'
                  const isAnswered = qItem.status === 'answered'
                  const isSkipped = qItem.status === 'skipped'
                  const recordedAudio = recordedAudioByQuestion[qItem.id]
                  const resolvedPrompt = String(qItem.prompt || '').replace(/\{track\}/gi, trackLabel)

                  return (
                    <div
                      key={qItem.id}
                      className={`rounded-2xl border p-4 transition ${
                        isCurrent
                          ? 'border-2 border-indigo-500 bg-indigo-50/50 shadow-sm'
                          : isAnswered
                            ? 'border-emerald-200 bg-emerald-50/30'
                            : isSkipped
                              ? 'border-amber-200 bg-amber-50/30'
                              : 'border-slate-200 bg-white/80'
                      }`}
                    >
                      {/* Question Header */}
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex items-center justify-center rounded-lg px-2.5 py-0.5 text-xs font-black ${
                              isCurrent
                                ? 'bg-indigo-600 text-white'
                                : isAnswered
                                  ? 'bg-emerald-600 text-white'
                                  : isSkipped
                                    ? 'bg-amber-500 text-white'
                                    : 'bg-slate-200 text-slate-700'
                            }`}
                          >
                            Q{qItem.question_number} of {qItem.total_questions}
                          </span>
                          <span className="text-xs font-bold text-slate-700">{qItem.section_label}</span>
                          {(qItem.topic || []).map((top: string) => (
                            <span
                              key={top}
                              className="rounded-md bg-slate-100 border border-slate-200 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-600"
                            >
                              {top}
                            </span>
                          ))}
                        </div>

                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                            isCurrent
                              ? 'bg-rose-100 text-rose-700 border border-rose-200'
                              : isAnswered
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                : isSkipped
                                  ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                  : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {isCurrent
                            ? '🔴 Live Now — Asking & Recording'
                            : isAnswered
                              ? '✓ Answered'
                              : isSkipped
                                ? '⏭ Skipped'
                                : '○ Next in Continuation'}
                        </span>
                      </div>

                      {/* Question Prompt */}
                      <div className="mt-2 text-sm font-bold text-slate-900">
                        <span className="text-indigo-600 mr-1">Question:</span>
                        {resolvedPrompt}
                      </div>

                      {/* Student's Answer (if answered or current draft) */}
                      {(qItem.student_answer || (isCurrent && (input || liveInterimText))) && (
                        <div className="mt-3 rounded-xl border border-indigo-100 bg-white p-3 space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-[11px] font-black uppercase tracking-wide text-indigo-700">
                              🎙️ Your Recorded / Transcribed Answer:
                            </span>
                            {qItem.student_turn_timestamp && (
                              <span className="text-[10px] text-slate-400">
                                {new Date(qItem.student_turn_timestamp).toLocaleTimeString()}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-800 whitespace-pre-wrap leading-relaxed">
                            {isCurrent && !qItem.student_answer
                              ? `${input}${liveInterimText ? ' ' + liveInterimText + '…' : ''}`
                              : qItem.student_answer}
                          </div>

                          {/* Audio playback if voice recording was captured for this question */}
                          {recordedAudio?.url && (
                            <div className="pt-1 flex items-center gap-2 border-t border-slate-100">
                              <span className="text-[11px] font-semibold text-emerald-700">
                                🔊 Recorded Voice Clip ({recordedAudio.durationSec}s):
                              </span>
                              <audio controls src={recordedAudio.url} className="h-7 max-w-[240px]" />
                            </div>
                          )}
                        </div>
                      )}

                      {/* Follow-up Q&A on this question */}
                      {Array.isArray(qItem.follow_up_qa) && qItem.follow_up_qa.length > 0 && (
                        <div className="mt-2 space-y-1.5 pl-3 border-l-2 border-violet-300">
                          {qItem.follow_up_qa.map((fqa: any, fIdx: number) => (
                            <div key={fIdx} className="rounded-xl bg-violet-50/70 p-2.5 text-xs space-y-1">
                              <div className="font-semibold text-violet-900">
                                <b>Sam (Follow-up):</b> {fqa.interviewer}
                              </div>
                              {fqa.student && (
                                <div className="text-slate-700">
                                  <b>Your Follow-up Answer:</b> {fqa.student}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Evaluation Summary & Sam's Continuation */}
                      {qItem.evaluation_summary && (
                        <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[11px]">
                          <span className="rounded-md bg-emerald-100/80 text-emerald-800 px-2 py-0.5 font-bold">
                            Key Points Covered: {qItem.evaluation_summary.covered_points}/{qItem.evaluation_summary.total_points}
                          </span>
                          {qItem.evaluation_summary.strengths?.[0] && (
                            <span className="text-emerald-700 font-medium">
                              ✓ {qItem.evaluation_summary.strengths[0]}
                            </span>
                          )}
                          {qItem.evaluation_summary.gaps?.[0] && (
                            <span className="text-amber-700 font-medium">
                              • Focus: {qItem.evaluation_summary.gaps[0]}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="p-4 space-y-3 max-h-[540px] overflow-y-auto bg-gradient-to-b from-white/60 to-slate-50/40">
                {transcript.map((t, i) => (
                  <div key={i} className={`flex ${t.role === 'student' ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
                        t.role === 'student'
                          ? 'bg-indigo-600 text-white'
                          : 'bg-white border border-slate-200 text-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3 mb-1 text-[10px] opacity-75">
                        <span className="font-bold">
                          {t.role === 'student' ? 'You (Candidate)' : `🇮🇳 Sam — ${trackLabel} Interviewer`}
                        </span>
                        <span>{t.time}</span>
                      </div>
                      <div className="whitespace-pre-line leading-relaxed">{t.text}</div>
                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Camera Preview, Track & Questions Roadmap, Code Editor */}
        <div className="space-y-4">
          <CameraPreview enabled={cameraEnabled} />

          {/* Track & Section Progress + Questions Checklist */}
          <div className="panel p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-black uppercase tracking-wide text-indigo-600">
                  🎯 {trackLabel}
                </div>
                <div className="text-sm font-bold text-slate-800">
                  Interview Questions in Continuation ({answeredCount}/{totalQuestions})
                </div>
              </div>
              <span className="rounded-full bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 text-xs font-bold text-indigo-700">
                Q{currentQuestionNumber}/{totalQuestions}
              </span>
            </div>

            {/* Progress bar */}
            <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full calibiai-gradient transition-all duration-300"
                style={{ width: `${Math.min(100, Math.round((answeredCount / totalQuestions) * 100))}%` }}
              />
            </div>

            {/* Section pills */}
            <div className="space-y-1.5">
              {(session.blueprint?.sections || []).map((sec: any, idx: number) => {
                const isActive = idx === session.blueprint?.active_section_index
                const isPast = idx < session.blueprint?.active_section_index
                const secQuestions = questionsPlan.filter(q => q.section === sec.id)
                return (
                  <div
                    key={sec.id}
                    className={`rounded-xl border p-2.5 text-xs transition ${
                      isActive
                        ? 'border-indigo-500 bg-indigo-50/70'
                        : isPast
                          ? 'border-emerald-200 bg-emerald-50/40'
                          : 'border-slate-200 bg-slate-50/60'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                          isActive
                            ? 'bg-indigo-600 text-white'
                            : isPast
                              ? 'bg-emerald-500 text-white'
                              : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {isPast ? '✓' : idx + 1}
                      </span>
                      <span className="flex-1 font-bold text-slate-800 truncate">{sec.label}</span>
                      <span className="text-[10px] text-slate-500">{sec.time_budget_min}m</span>
                    </div>

                    {secQuestions.length > 0 && (
                      <div className="mt-2 pl-7 space-y-1">
                        {secQuestions.map((sq: any) => (
                          <div
                            key={sq.id}
                            className={`flex items-start gap-1.5 text-[11px] ${
                              sq.status === 'current'
                                ? 'font-bold text-indigo-700'
                                : sq.status === 'answered'
                                  ? 'text-emerald-700'
                                  : 'text-slate-500'
                            }`}
                          >
                            <span className="shrink-0">
                              {sq.status === 'answered'
                                ? '✓'
                                : sq.status === 'current'
                                  ? '●'
                                  : sq.status === 'skipped'
                                    ? '⏭'
                                    : '○'}
                            </span>
                            <span className="line-clamp-1">
                              Q{sq.question_number}: {String(sq.prompt || '').replace(/\{track\}/gi, trackLabel)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {currentQuestion?.type === 'coding' && currentQuestion?.coding_spec && (
            <CodeEditorPanel
              starterCode={currentQuestion.coding_spec.starter_code}
              onRun={handleCodeRun}
              running={codeRunning}
              results={codeResults}
            />
          )}

          <div className="rounded-2xl border border-slate-200 bg-white p-3 text-[11px] text-slate-500">
            <div className="font-bold text-slate-700">Session Details & Transparency</div>
            <div className="mt-1">
              Track: <b>{trackLabel}</b> · Profile: <b>{yearLabel}</b> · Voice: <b>🇮🇳 Indian English (en-IN)</b>
            </div>
            <div className="mt-1">
              Microphone stays on continuously for live recording & transcription.
            </div>
          </div>
        </div>
      </div>

      {showEndConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="glass-card max-w-sm w-full">
            <div className="text-sm font-bold">End interview and generate report?</div>
            <p className="mt-1 text-xs text-slate-500">
              Your {trackLabel} interview progress ({answeredCount}/{totalQuestions} questions answered) will be evaluated and a detailed readiness report generated.
            </p>
            <div className="mt-4 flex gap-2 justify-end">
              <button onClick={() => setShowEndConfirm(false)} className="btn-soft !py-2 !px-4 text-xs">
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowEndConfirm(false)
                  handleEnd()
                }}
                className="btn-primary !py-2 !px-4 text-xs"
              >
                End & get report →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
