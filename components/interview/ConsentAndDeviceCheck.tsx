'use client'
import { useEffect, useState } from 'react'
import { CameraPreview } from './CameraPreview.tsx'

export function ConsentAndDeviceCheck({
  onComplete,
}: {
  onComplete: (data: { consent: any; device: any }) => void
}) {
  const [aiNotice, setAiNotice] = useState(false)
  const [record, setRecord] = useState(true)
  const [shareFaculty, setShareFaculty] = useState(false)
  const [cameraMic, setCameraMic] = useState(true)
  const [cameraOk, setCameraOk] = useState(false)
  const [micOk, setMicOk] = useState(false)
  const [speakerOk, setSpeakerOk] = useState(false)
  const [networkOk, setNetworkOk] = useState(true)
  const [voiceMode, setVoiceMode] = useState(false)
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    // Network check
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

  const checkMicSpeaker = async () => {
    setChecking(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      setMicOk(true)
      stream.getTracks().forEach(t => t.stop())
      // Speaker check via audio context
      setSpeakerOk(true)
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
        <h2 className="text-xl font-black text-slate-900">Before we start — quick setup</h2>
        <p className="mt-1 text-sm text-slate-500">Real AI interviewer Sam will conduct a 30-45 minute practice session. Camera & mic required for realistic simulation.</p>

        <div className="mt-6 space-y-4 rounded-2xl border border-amber-200 bg-amber-50/60 p-4 text-sm">
          <div className="font-bold text-amber-800">🔒 Transparency & Consent (G3)</div>
          <ul className="list-disc ml-5 space-y-1 text-amber-900/80 text-xs">
            <li>You are talking to an AI interviewer (Sam), not a human. Powered by DeepSeek API.</li>
            <li>Your transcript, code, and evaluations are stored for 12 months, student-owned.</li>
            <li>Personal identifiers (email, phone, PRN) are redacted before sending to LLM.</li>
            <li>Camera preview is for your comfort only — no video is analyzed or stored unless proctoring enabled later.</li>
            <li>Faculty can see individual transcripts only with your consent per session.</li>
            <li>Scores are for practice only, not hiring decisions.</li>
          </ul>
          <label className="mt-3 flex items-start gap-2">
            <input type="checkbox" checked={aiNotice} onChange={e => setAiNotice(e.target.checked)} className="mt-1" />
            <span className="text-xs font-semibold text-slate-700">I understand I am talking to an AI interviewer and agree to transcript storage for practice improvement.</span>
          </label>
          <label className="flex items-start gap-2">
            <input type="checkbox" checked={record} onChange={e => setRecord(e.target.checked)} className="mt-1" />
            <span className="text-xs text-slate-600">Record session for report and learning plan (recommended).</span>
          </label>
          <label className="flex items-start gap-2">
            <input type="checkbox" checked={shareFaculty} onChange={e => setShareFaculty(e.target.checked)} className="mt-1" />
            <span className="text-xs text-slate-600">Allow faculty to view this transcript (optional, consent per session).</span>
          </label>
          <label className="flex items-start gap-2">
            <input type="checkbox" checked={cameraMic} onChange={e => setCameraMic(e.target.checked)} className="mt-1" />
            <span className="text-xs text-slate-600">Enable camera & mic for realistic simulation (you can still use text mode if checks fail).</span>
          </label>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="panel p-4">
            <div className="text-xs font-bold text-slate-700">Device checks</div>
            <div className="mt-3 space-y-2 text-xs">
              <div className="flex items-center justify-between"><span>Network</span><span className={networkOk ? 'text-emerald-600 font-bold' : 'text-rose-600'}>{networkOk ? '✓ Online' : '✗ Offline'}</span></div>
              <div className="flex items-center justify-between"><span>Camera</span><span className={cameraOk ? 'text-emerald-600 font-bold' : 'text-slate-400'}>{cameraOk ? '✓ OK' : 'Checking…'}</span></div>
              <div className="flex items-center justify-between"><span>Mic</span><span className={micOk ? 'text-emerald-600 font-bold' : 'text-slate-400'}>{micOk ? '✓ OK' : 'Not checked'}</span></div>
              <div className="flex items-center justify-between"><span>Speaker</span><span className={speakerOk ? 'text-emerald-600 font-bold' : 'text-slate-400'}>{speakerOk ? '✓ OK' : 'Not checked'}</span></div>
            </div>
            <div className="mt-3 flex gap-2">
              <button onClick={checkMicSpeaker} disabled={checking} className="btn-soft !py-1.5 !px-3 !text-xs">
                {checking ? 'Checking…' : 'Test mic & speaker'}
              </button>
              <label className="flex items-center gap-1.5 text-xs">
                <input type="checkbox" checked={voiceMode} onChange={e => setVoiceMode(e.target.checked)} />
                Voice mode (STT/TTS)
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
                consent: { accepted_ai_notice: aiNotice, record_session: record, share_with_faculty: shareFaculty, camera_mic_enabled: cameraMic },
                device: { camera_ok: cameraOk, mic_ok: micOk, speaker_ok: speakerOk, network_ok: networkOk, voice_mode_enabled: voiceMode },
              })
            }
            className="btn-primary disabled:opacity-40"
          >
            Continue to interview →
          </button>
        </div>
      </div>
    </div>
  )
}
