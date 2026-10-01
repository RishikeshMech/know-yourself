'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import {
  listRankedVoices,
  pickBestIndianVoice,
  speakWithIndianVoice,
  cleanTextForIndianSpeech,
  type RankedVoice,
} from '@/lib/interview/indianVoice.ts'

interface Props {
  enabled: boolean
  disabled?: boolean
  track?: 'swe' | 'ai_ml'
  currentQuestionId?: string
  onTranscript: (text: string, isFinal: boolean) => void
  onMicStatus: (ok: boolean) => void
  onRecordingSaved?: (questionId: string, audioUrl: string, durationSec: number) => void
  interviewerText?: string // text to speak via Indian TTS
  autoSpeak?: boolean
}

export function VoiceControls({
  enabled,
  disabled = false,
  track = 'swe',
  currentQuestionId = 'q1',
  onTranscript,
  onMicStatus,
  onRecordingSaved,
  interviewerText,
  autoSpeak = true,
}: Props) {
  const [userMutedMic, setUserMutedMic] = useState(false)
  const [listening, setListening] = useState(true)
  const [speaking, setSpeaking] = useState(false)
  const [ttsMuted, setTtsMuted] = useState(false)
  const [supported, setSupported] = useState({ stt: false, tts: false, mediaRecorder: false })
  const [lastInterim, setLastInterim] = useState('')
  const [micPermissionError, setMicPermissionError] = useState<string | null>(null)

  // Indian Voice state
  const [rankedVoices, setRankedVoices] = useState<Array<RankedVoice<SpeechSynthesisVoice>>>([])
  const [selectedVoiceURI, setSelectedVoiceURI] = useState<string>('')
  const [activeVoiceLabel, setActiveVoiceLabel] = useState<string>('Indian English (en-IN)')
  const [voiceRate, setVoiceRate] = useState<number>(0.98)

  // Live audio recording & waveform visualizer state
  const [isLiveRecording, setIsLiveRecording] = useState(false)
  const [recordingSec, setRecordingSec] = useState(0)
  const [audioBars, setAudioBars] = useState<number[]>(() => Array(16).fill(12))

  // Refs for continuous mic & echo protection
  const recognitionRef = useRef<any>(null)
  const shouldKeepListeningRef = useRef<boolean>(true)
  const isRecognitionRunningRef = useRef<boolean>(false)
  const restartTimerRef = useRef<any>(null)
  const speakingRef = useRef<boolean>(false)
  const interviewerTextRef = useRef<string>('')
  const onTranscriptRef = useRef(onTranscript)
  const onMicStatusRef = useRef(onMicStatus)
  const onRecordingSavedRef = useRef(onRecordingSaved)
  const stopTtsRef = useRef<(() => void) | null>(null)

  // MediaRecorder & Web Audio refs
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const recordingStartRef = useRef<number>(Date.now())
  const activeQuestionIdRef = useRef<string>(currentQuestionId)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    onTranscriptRef.current = onTranscript
  }, [onTranscript])

  useEffect(() => {
    onMicStatusRef.current = onMicStatus
  }, [onMicStatus])

  useEffect(() => {
    onRecordingSavedRef.current = onRecordingSaved
  }, [onRecordingSaved])

  useEffect(() => {
    interviewerTextRef.current = interviewerText || ''
  }, [interviewerText])

  // Load and rank browser voices, prioritizing Indian English (en-IN / hi-IN)
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
    const synth = window.speechSynthesis

    const refreshVoices = () => {
      const raw = synth.getVoices() || []
      if (raw.length === 0) return
      const ranked = listRankedVoices(raw)
      setRankedVoices(ranked)
      const best = pickBestIndianVoice(raw, selectedVoiceURI || null)
      if (best) {
        if (!selectedVoiceURI) {
          setSelectedVoiceURI(best.voiceURI || best.name)
        }
        const entry = ranked.find(r => r.voice.name === best.name)
        setActiveVoiceLabel(entry ? `${best.name} (${entry.badge})` : `${best.name} (${best.lang})`)
      }
    }

    refreshVoices()
    synth.addEventListener?.('voiceschanged', refreshVoices)
    return () => {
      synth.removeEventListener?.('voiceschanged', refreshVoices)
    }
  }, [selectedVoiceURI])

  // Start / keep SpeechRecognition continuously alive (never turns off on silence!)
  const startRecognitionSafely = useCallback(() => {
    const rec = recognitionRef.current
    if (!rec || !shouldKeepListeningRef.current) return
    if (isRecognitionRunningRef.current) return
    try {
      rec.start()
      isRecognitionRunningRef.current = true
      setListening(true)
      onMicStatusRef.current(true)
    } catch {
      // Already started or transitioning — schedule a gentle retry
    }
  }, [])

  useEffect(() => {
    const stt =
      typeof window !== 'undefined' &&
      ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)
    const tts = typeof window !== 'undefined' && 'speechSynthesis' in window
    const mr = typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined'
    setSupported({ stt: !!stt, tts, mediaRecorder: mr })

    if (stt && !recognitionRef.current) {
      const Rec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      const rec = new Rec()
      rec.continuous = true
      rec.interimResults = true
      rec.maxAlternatives = 1
      rec.lang = 'en-IN'

      rec.onstart = () => {
        isRecognitionRunningRef.current = true
        setListening(true)
        setMicPermissionError(null)
        onMicStatusRef.current(true)
      }

      rec.onresult = (event: any) => {
        let interim = ''
        let final = ''
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const t = event.results[i][0].transcript
          if (event.results[i].isFinal) final += t + ' '
          else interim += t
        }

        // Echo guard: if Sam is currently speaking aloud and the mic picks up
        // verbatim words from Sam's own prompt over laptop speakers, ignore echo
        const spokenPromptClean = cleanTextForIndianSpeech(interviewerTextRef.current, track).toLowerCase()
        if (speakingRef.current && spokenPromptClean.length > 15) {
          const candidate = (final || interim).trim().toLowerCase()
          if (candidate.length > 12 && spokenPromptClean.includes(candidate)) {
            return
          }
        }

        if (interim) setLastInterim(interim)
        if (final.trim()) {
          onTranscriptRef.current(final.trim(), true)
          setLastInterim('')
        } else if (interim) {
          onTranscriptRef.current(interim, false)
        }
      }

      rec.onerror = (event: any) => {
        const err = event?.error
        isRecognitionRunningRef.current = false
        if (err === 'not-allowed' || err === 'service-not-allowed') {
          setMicPermissionError('Microphone permission blocked — please allow mic access in browser.')
          shouldKeepListeningRef.current = false
          setListening(false)
          onMicStatusRef.current(false)
          return
        }
        // For 'no-speech', 'aborted', 'network', 'audio-capture':
        // DO NOT turn off the mic! Keep listening state true and auto-restart in onend.
        if (shouldKeepListeningRef.current) {
          setListening(true)
        }
      }

      rec.onend = () => {
        isRecognitionRunningRef.current = false
        // CRITICAL: Automatically restart SpeechRecognition so the mic NEVER turns off
        // during pauses, thinking time, or between questions!
        if (shouldKeepListeningRef.current) {
          setListening(true)
          if (restartTimerRef.current) clearTimeout(restartTimerRef.current)
          restartTimerRef.current = setTimeout(() => {
            startRecognitionSafely()
          }, 140)
        } else {
          setListening(false)
        }
      }

      recognitionRef.current = rec
    }

    return () => {
      shouldKeepListeningRef.current = false
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current)
      try {
        recognitionRef.current?.stop()
      } catch {}
    }
  }, [startRecognitionSafely, track])

  // Sync enabled / userMutedMic / disabled with continuous listening
  useEffect(() => {
    const shouldListen = enabled && !userMutedMic && !disabled
    shouldKeepListeningRef.current = shouldListen

    if (shouldListen) {
      setListening(true)
      startRecognitionSafely()
    } else {
      setListening(false)
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current)
      try {
        recognitionRef.current?.stop()
      } catch {}
    }
  }, [enabled, userMutedMic, disabled, startRecognitionSafely])

  // Live Microphone Stream + Web Audio Waveform Visualizer + MediaRecorder
  useEffect(() => {
    if (!enabled || userMutedMic || disabled) {
      setIsLiveRecording(false)
      return
    }
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return

    let cancelled = false

    ;(async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        })
        if (cancelled) {
          stream.getTracks().forEach(t => t.stop())
          return
        }
        mediaStreamRef.current = stream
        setIsLiveRecording(true)
        setMicPermissionError(null)
        onMicStatusRef.current(true)

        // Setup Web Audio API AnalyserNode for real-time voice level bars
        const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext
        if (AudioCtx) {
          const ctx: AudioContext = new AudioCtx()
          audioCtxRef.current = ctx
          const source = ctx.createMediaStreamSource(stream)
          const analyser = ctx.createAnalyser()
          analyser.fftSize = 64
          analyser.smoothingTimeConstant = 0.75
          source.connect(analyser)

          const dataArray = new Uint8Array(analyser.frequencyBinCount)
          let lastPaint = 0
          const updateWaveform = (ts: number) => {
            if (cancelled) return
            if (ts - lastPaint > 65) {
              lastPaint = ts
              analyser.getByteFrequencyData(dataArray)
              const bars: number[] = []
              for (let i = 0; i < 16; i++) {
                const val = dataArray[i] || 0
                const pct = Math.max(12, Math.min(100, Math.round((val / 255) * 100)))
                bars.push(pct)
              }
              setAudioBars(bars)
            }
            rafRef.current = requestAnimationFrame(updateWaveform)
          }
          rafRef.current = requestAnimationFrame(updateWaveform)
        }

        // Start MediaRecorder for live audio capture
        if (typeof MediaRecorder !== 'undefined') {
          audioChunksRef.current = []
          recordingStartRef.current = Date.now()
          const mr = new MediaRecorder(stream)
          mr.ondataavailable = e => {
            if (e.data && e.data.size > 0) {
              audioChunksRef.current.push(e.data)
            }
          }
          mr.start(1000)
          mediaRecorderRef.current = mr
        }
      } catch (e: any) {
        if (!cancelled) {
          setIsLiveRecording(false)
        }
      }
    })()

    return () => {
      cancelled = true
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      try {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop()
        }
      } catch {}
      try {
        audioCtxRef.current?.close()
      } catch {}
      mediaStreamRef.current?.getTracks().forEach(t => t.stop())
      mediaStreamRef.current = null
    }
  }, [enabled, userMutedMic, disabled])

  // When question changes, save the recorded audio blob for the completed question and reset timer
  useEffect(() => {
    const prevQ = activeQuestionIdRef.current
    if (prevQ && prevQ !== currentQuestionId) {
      if (audioChunksRef.current.length > 0 && typeof Blob !== 'undefined' && typeof URL !== 'undefined') {
        try {
          const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
          const url = URL.createObjectURL(blob)
          const dur = Math.max(1, Math.round((Date.now() - recordingStartRef.current) / 1000))
          onRecordingSavedRef.current?.(prevQ, url, dur)
        } catch {}
      }
      audioChunksRef.current = []
      recordingStartRef.current = Date.now()
      setRecordingSec(0)
    }
    activeQuestionIdRef.current = currentQuestionId
  }, [currentQuestionId])

  // Live recording timer tick
  useEffect(() => {
    if (!enabled || userMutedMic || disabled) return
    const iv = setInterval(() => {
      setRecordingSec(Math.max(0, Math.floor((Date.now() - recordingStartRef.current) / 1000)))
    }, 1000)
    return () => clearInterval(iv)
  }, [enabled, userMutedMic, disabled])

  const triggerSpeak = useCallback(
    (textToSpeak?: string) => {
      const txt = textToSpeak ?? interviewerText
      if (!txt || ttsMuted || !supported.tts) return
      stopTtsRef.current?.()
      speakingRef.current = true
      setSpeaking(true)

      stopTtsRef.current = speakWithIndianVoice(txt, {
        preferredVoiceURI: selectedVoiceURI || null,
        rate: voiceRate,
        pitch: 1.02,
        track,
        onStart: voiceUsed => {
          speakingRef.current = true
          setSpeaking(true)
          if (voiceUsed) {
            setActiveVoiceLabel(`${voiceUsed.name} (${voiceUsed.lang})`)
          }
        },
        onEnd: () => {
          speakingRef.current = false
          setSpeaking(false)
          // Ensure mic recognition is actively running as soon as Sam finishes speaking
          if (shouldKeepListeningRef.current) {
            startRecognitionSafely()
          }
        },
        onError: () => {
          speakingRef.current = false
          setSpeaking(false)
        },
      })
    },
    [interviewerText, ttsMuted, supported.tts, selectedVoiceURI, voiceRate, track, startRecognitionSafely],
  )

  // Auto-speak whenever Sam's interviewerText changes
  useEffect(() => {
    if (!autoSpeak || !interviewerText || ttsMuted || !supported.tts) return
    triggerSpeak(interviewerText)
    return () => {
      stopTtsRef.current?.()
      speakingRef.current = false
    }
  }, [interviewerText, autoSpeak, ttsMuted, supported.tts, triggerSpeak])

  const toggleMicMute = () => {
    setUserMutedMic(prev => !prev)
  }

  const formatRecTime = (sec: number) => {
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  if (!enabled) return null

  const micActive = !userMutedMic && !disabled

  return (
    <div className="rounded-2xl border border-indigo-200/90 bg-gradient-to-r from-indigo-50/80 via-violet-50/70 to-emerald-50/50 p-3.5 shadow-sm space-y-2.5">
      {/* Top Row: Live Recording Indicator + Waveform + Continuous Mic Control + Indian Voice Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        {/* Left: Continuous Live Recording & Mic Status */}
        <div className="flex flex-wrap items-center gap-2">
          <div
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-black tracking-wide shadow-sm ${
              micActive
                ? 'bg-rose-600 text-white'
                : 'bg-slate-200 text-slate-600'
            }`}
          >
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                micActive ? 'bg-white animate-ping' : 'bg-slate-400'
              }`}
            />
            <span>{micActive ? `LIVE RECORDING · ${formatRecTime(recordingSec)}` : 'MIC MUTED'}</span>
          </div>

          {/* 16-Bar Live Audio Waveform Visualizer */}
          {micActive && (
            <div
              className="flex items-end gap-0.5 h-6 px-2.5 py-1 rounded-xl bg-slate-900/90 border border-slate-700"
              title="Live microphone audio waveform (Always-On Mic)"
            >
              {audioBars.map((h, i) => (
                <span
                  key={i}
                  className="w-1 rounded-full bg-gradient-to-t from-emerald-400 via-teal-300 to-indigo-300 transition-all duration-75"
                  style={{ height: `${Math.max(15, h)}%` }}
                />
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={toggleMicMute}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition ${
              micActive
                ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm'
                : 'bg-amber-500 text-white hover:bg-amber-600'
            }`}
            title={
              micActive
                ? 'Microphone is locked ON continuously for the interview. Click only if you want to mute.'
                : 'Click to resume continuous microphone'
            }
          >
            <span className={`h-2 w-2 rounded-full ${micActive ? 'bg-white animate-pulse' : 'bg-white'}`} />
            {micActive ? '🎙️ Mic Always ON (Continuous)' : '🔇 Mic Muted — Tap to Unmute'}
          </button>
        </div>

        {/* Right: Indian AI Voice Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full border ${
              speaking
                ? 'bg-indigo-600 text-white border-indigo-600 animate-pulse'
                : 'bg-white text-indigo-700 border-indigo-200'
            }`}
          >
            <span>🇮🇳</span>
            <span>{speaking ? '🔊 Sam Speaking (Indian Voice)…' : '🇮🇳 Indian AI Voice Ready'}</span>
          </span>

          <button
            type="button"
            onClick={() => triggerSpeak(interviewerText)}
            disabled={!interviewerText}
            className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-white px-2.5 py-1 text-[11px] font-bold text-indigo-700 hover:bg-indigo-50 disabled:opacity-40"
            title="Replay Sam's current question in Indian English voice"
          >
            🔊 Replay Question
          </button>

          <button
            type="button"
            onClick={() => {
              if (speaking) {
                stopTtsRef.current?.()
                speakingRef.current = false
                setSpeaking(false)
              }
              setTtsMuted(m => !m)
            }}
            className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
          >
            {ttsMuted ? '🔇 Unmute Sam' : '🔈 Mute Sam'}
          </button>
        </div>
      </div>

      {/* Second Row: Indian Voice Selector + Speed + Live Speech Caption */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-indigo-100/80 text-[11px]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-bold text-slate-600">🇮🇳 Voice:</span>
          {rankedVoices.length > 0 ? (
            <select
              value={selectedVoiceURI}
              onChange={e => {
                const uri = e.target.value
                setSelectedVoiceURI(uri)
                setTimeout(() => triggerSpeak(interviewerText), 60)
              }}
              className="rounded-lg border border-indigo-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 max-w-[260px] truncate"
            >
              {rankedVoices.slice(0, 12).map((rv, idx) => (
                <option key={(rv.voice.voiceURI || rv.voice.name) + idx} value={rv.voice.voiceURI || rv.voice.name}>
                  {rv.isIndian ? '🇮🇳 ' : '🌐 '}
                  {rv.voice.name} ({rv.voice.lang})
                </option>
              ))}
            </select>
          ) : (
            <span className="text-indigo-700 font-semibold">{activeVoiceLabel}</span>
          )}

          <select
            value={voiceRate}
            onChange={e => setVoiceRate(Number(e.target.value))}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600"
            title="Interviewer speaking pace"
          >
            <option value={0.9}>Pace: 0.9x (Calm)</option>
            <option value={0.98}>Pace: 1.0x (Natural Indian)</option>
            <option value={1.06}>Pace: 1.1x (Brisk)</option>
          </select>
        </div>

        <div className="flex items-center gap-2 text-slate-500">
          {lastInterim ? (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/90 border border-emerald-200 px-2.5 py-0.5 text-xs font-medium text-emerald-800 shadow-sm">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
              <span>Capturing speech: “{lastInterim}”</span>
            </span>
          ) : micActive ? (
            <span className="text-[11px] text-emerald-700 font-semibold">
              ● Speak naturally — your words transcribe live into the answer box below
            </span>
          ) : null}
        </div>
      </div>

      {micPermissionError && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] font-semibold text-amber-800">
          ⚠️ {micPermissionError}
        </div>
      )}
      {!supported.stt && (
        <div className="text-[11px] text-amber-700">
          Browser speech-to-text is unavailable in this browser — live audio is still recording and you can type your answer below (Chrome or Edge recommended for live voice transcription).
        </div>
      )}
    </div>
  )
}
