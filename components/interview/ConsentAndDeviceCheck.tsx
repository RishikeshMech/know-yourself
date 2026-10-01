'use client'
import { useEffect, useState } from 'react'
import { CameraPreview } from './CameraPreview.tsx'
import { speakWithIndianVoice } from '@/lib/interview/indianVoice.ts'
import { formatTrackName } from '@/lib/interview/questionBank.ts'

export function ConsentAndDeviceCheck({
  session,
  onComplete,
}: {
  session?: any
  onComplete: (data: { consent: any; device: any }) => void
}) {
  const [aiNotice, setAiNotice] = useState(true)
  const [record, setRecord] = useState(true)
  const [shareFaculty, setShareFaculty] = useState(false)
  const [cameraMic, setCameraMic] = useState(true)
  const [cameraOk, setCameraOk] = useState(false)
  const [micOk, setMicOk] = useState(true)
  const [speakerOk, setSpeakerOk] = useState(true)
  const [networkOk, setNetworkOk] = useState(true)
  const [voiceMode, setVoiceMode] = useState(true)
  const [checking, setChecking] = useState(false)

  const trackLabel = session?.track ? formatTrackName(session.track) : 'Software Engineer (SWE)'
  const yearLabel = session?.year === 3 ? '3rd Year Profile' : '2nd Year Profile'
  const totalQuestions =
    (session?.blueprint?.sections || []).reduce(
      (sum: number, s: any) => sum + (s.question_ids?.length || 0),
      0,
    ) || 8

  useEffect(() => {
    setNetworkOk(navigator.onLine)
    const onOnline = () => setNetworkOk(true)
    const onOffline = () => setNetworkOk(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  // Auto-check mic permission gently on mount
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then(stream => {
        setMicOk(true)
        setSpeakerOk(true)
        stream.getTracks().forEach(t => t.stop())
      })
      .catch(() => {})
  }, [])

  const checkMicAndIndianVoice = async () => {
    setChecking(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      setMicOk(true)
      stream.getTracks().forEach(t => t.stop())
      setSpeakerOk(true)
      speakWithIndianVoice(
        `Namaste! I am Sam, your AI interviewer for the ${trackLabel} track. Your microphone and Indian English voice are ready.`,
        { track: session?.track || 'swe' },
      )
    } catch {
      setMicOk(false)
    } finally {
      setChecking(false)
    }
  }

  const canProceed = aiNotice && networkOk

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <div className="glass-card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-indigo-50 border border-indigo-200 px-3 py-1 text-xs font-black text-indigo-700">
              <span>🎯 Track: {trackLabel}</span>
              <span>·</span>
              <span>{yearLabel}</span>
              <span>·</span>
              <span className="capitalize">{session?.mode || 'standard'} Mode ({totalQuestions} Questions)</span>
            </div>
            <h2 className="mt-2 text-xl font-black text-slate-900">Before we start — Live AI Interview Setup</h2>
            <p className="mt-1 text-sm text-slate-500">
              AI interviewer <b>Sam (🇮🇳 Indian English Voice)</b> will ask {totalQuestions} questions in continuation on the <b>{trackLabel}</b> track with continuous microphone & live recording.
            </p>
          </div>
        </div>

        <div className="mt-6 space-y-4 rounded-2xl border border-amber-200 bg-amber-50/60 p-4 text-sm">
          <div className="font-bold text-amber-800">🔒 Transparency & Consent (G3)</div>
          <ul className="list-disc ml-5 space-y-1 text-amber-900/80 text-xs">
            <li>You are talking to an AI interviewer (Sam, Indian English voice), not a human.</li>
            <li>Questions on your chosen track (<b>{trackLabel}</b>) are asked in continuation based on your answers.</li>
            <li>Your microphone stays on continuously for live recording and real-time speech-to-text transcription.</li>
            <li>Personal identifiers (email, phone, PRN) are redacted before sending to the AI evaluator.</li>
            <li>Camera preview is for realistic interview simulation — no video is stored.</li>
          </ul>
          <label className="mt-3 flex items-start gap-2 cursor-pointer">
            <input type="checkbox" checked={aiNotice} onChange={e => setAiNotice(e.target.checked)} className="mt-1" />
            <span className="text-xs font-semibold text-slate-700">
              I understand I am talking to an AI interviewer and agree to transcript storage for practice improvement.
            </span>
          </label>
          <label className="flex items-start gap-2 cursor-pointer">
            <input type="checkbox" checked={record} onChange={e => setRecord(e.target.checked)} className="mt-1" />
            <span className="text-xs text-slate-600">Enable live recording & Question-Answer session log for report and learning plan (recommended).</span>
          </label>
          <label className="flex items-start gap-2 cursor-pointer">
            <input type="checkbox" checked={shareFaculty} onChange={e => setShareFaculty(e.target.checked)} className="mt-1" />
            <span className="text-xs text-slate-600">Allow faculty to view this transcript (optional, consent per session).</span>
          </label>
          <label className="flex items-start gap-2 cursor-pointer">
            <input type="checkbox" checked={cameraMic} onChange={e => setCameraMic(e.target.checked)} className="mt-1" />
            <span className="text-xs text-slate-600">Keep camera & continuous microphone active during the interview.</span>
          </label>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="panel p-4">
            <div className="text-xs font-bold text-slate-700">Device & Indian Voice Checks</div>
            <div className="mt-3 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span>Network</span>
                <span className={networkOk ? 'text-emerald-600 font-bold' : 'text-rose-600'}>
                  {networkOk ? '✓ Online' : '✗ Offline'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Camera</span>
                <span className={cameraOk ? 'text-emerald-600 font-bold' : 'text-slate-400'}>
                  {cameraOk ? '✓ Active' : 'Starting…'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Continuous Mic & Live Recording</span>
                <span className={micOk ? 'text-emerald-600 font-bold' : 'text-amber-600'}>
                  {micOk ? '✓ Ready (Always-On)' : 'Allow mic permission'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Interviewer Voice</span>
                <span className={speakerOk ? 'text-indigo-600 font-bold' : 'text-slate-400'}>
                  🇮🇳 Indian English (en-IN)
                </span>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={checkMicAndIndianVoice}
                disabled={checking}
                className="btn-soft !py-1.5 !px-3 !text-xs"
              >
                {checking ? 'Testing…' : '🔊 Test Mic & Indian Voice'}
              </button>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-indigo-700 cursor-pointer">
                <input type="checkbox" checked={voiceMode} onChange={e => setVoiceMode(e.target.checked)} />
                🇮🇳 Live Voice & Recording Mode
              </label>
            </div>
          </div>
          <CameraPreview enabled={cameraMic} onStatusChange={setCameraOk} />
        </div>

        <div className="mt-6 flex justify-end">
          <button
            disabled={!canProceed}
            onClick={() =>
              onComplete({
                consent: {
                  accepted_ai_notice: aiNotice,
                  record_session: record,
                  share_with_faculty: shareFaculty,
                  camera_mic_enabled: cameraMic,
                },
                device: {
                  camera_ok: cameraOk,
                  mic_ok: micOk,
                  speaker_ok: speakerOk,
                  network_ok: networkOk,
                  voice_mode_enabled: voiceMode,
                },
              })
            }
            className="btn-primary disabled:opacity-40"
          >
            Start Live Interview ({trackLabel}) →
          </button>
        </div>
      </div>
    </div>
  )
}
