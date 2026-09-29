'use client'
import { useEffect, useRef, useState } from 'react'

interface Props {
  enabled: boolean
  onTranscript: (text: string, isFinal: boolean) => void
  onMicStatus: (ok: boolean) => void
  interviewerText?: string // text to speak via TTS
  autoSpeak?: boolean
}

export function VoiceControls({ enabled, onTranscript, onMicStatus, interviewerText, autoSpeak = true }: Props) {
  const [listening, setListening] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [supported, setSupported] = useState({ stt: false, tts: false })
  const recognitionRef = useRef<any>(null)
  const [lastInterim, setLastInterim] = useState('')

  useEffect(() => {
    const stt = typeof window !== 'undefined' && ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)
    const tts = typeof window !== 'undefined' && 'speechSynthesis' in window
    setSupported({ stt: !!stt, tts })
    if (stt && !recognitionRef.current) {
      const Rec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      const rec = new Rec()
      rec.continuous = true
      rec.interimResults = true
      rec.lang = 'en-IN'
      rec.onresult = (event: any) => {
        let interim = ''
        let final = ''
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript
          if (event.results[i].isFinal) final += transcript + ' '
          else interim += transcript
        }
        if (interim) setLastInterim(interim)
        if (final) {
          onTranscript(final.trim(), true)
          setLastInterim('')
        } else if (interim) {
          onTranscript(interim, false)
        }
      }
      rec.onerror = () => {
        setListening(false)
        onMicStatus(false)
      }
      rec.onend = () => {
        setListening(false)
      }
      recognitionRef.current = rec
    }
  }, [])

  useEffect(() => {
    if (!enabled || !recognitionRef.current) return
    // Auto-start listening when enabled
    try {
      recognitionRef.current.start()
      setListening(true)
      onMicStatus(true)
    } catch {}
  }, [enabled])

  const toggleListening = () => {
    const rec = recognitionRef.current
    if (!rec) return
    if (listening) {
      rec.stop()
      setListening(false)
    } else {
      try {
        rec.start()
        setListening(true)
        onMicStatus(true)
      } catch {}
    }
  }

  // TTS for interviewer
  useEffect(() => {
    if (!autoSpeak || !interviewerText || !supported.tts) return
    if (typeof window === 'undefined') return
    const utter = new SpeechSynthesisUtterance(interviewerText)
    utter.lang = 'en-IN'
    utter.rate = 0.95
    utter.pitch = 1
    utter.onstart = () => setSpeaking(true)
    utter.onend = () => setSpeaking(false)
    // Cancel previous
    window.speechSynthesis.cancel()
    // Small delay to avoid overlap
    setTimeout(() => window.speechSynthesis.speak(utter), 150)
    return () => window.speechSynthesis.cancel()
  }, [interviewerText, autoSpeak, supported.tts])

  if (!enabled) return null

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-violet-200 bg-violet-50/60 p-3">
      <div className="flex items-center gap-2">
        <button
          onClick={toggleListening}
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition ${
            listening ? 'bg-rose-500 text-white animate-pulse' : 'bg-white border border-slate-200 text-slate-700'
          }`}
        >
          <span className={`h-2 w-2 rounded-full ${listening ? 'bg-white' : 'bg-emerald-500'}`} />
          {listening ? 'Listening… (tap to pause)' : 'Mic paused — tap to speak'}
        </button>
        {supported.tts && (
          <span className={`text-[10px] px-2 py-0.5 rounded-full ${speaking ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}>
            {speaking ? '🔊 Sam speaking…' : '🔇 TTS ready'}
          </span>
        )}
      </div>
      {lastInterim && <div className="text-xs italic text-slate-500">…{lastInterim}</div>}
      {!supported.stt && <div className="text-[11px] text-amber-700">Voice recognition not supported — use text input. Chrome recommended.</div>}
    </div>
  )
}
