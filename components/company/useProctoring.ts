'use client'
/**
 * Proctoring for the company assessments — the same protections as the
 * original assessments (components/AssessmentRunner.tsx), packaged as a hook:
 *
 *   • Pre-test environment gate: consent + mandatory fullscreen + external /
 *     mirrored display check (Window-Management API where available).
 *   • Camera & microphone gate with a live preview (continuing without a
 *     camera is allowed, as in the original assessments, but recorded).
 *   • Focus monitoring: leaving the tab/window is a warning; 3 warnings end
 *     the attempt automatically. Bursts of blur/visibility/fullscreen events
 *     from ONE action are coalesced into a single warning.
 *   • Fullscreen lock with automatic re-entry; exiting is a warning.
 *   • A display connected mid-test terminates the attempt; moving the window
 *     to another screen / changing resolution is a warning.
 *   • Right-click, copying question text, printing and dev-tools shortcuts are
 *     blocked; pastes and screenshot keys are logged for reviewers.
 *   • Native permission prompts never count as violations (prompt guard).
 *
 * Every signal is appended to an event log that the runner autosaves to the
 * server, so reviewers can see exactly what happened during an attempt.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  MAX_FOCUS_STRIKES, classifyDisplayEvent, evaluateStartGate, safeRequestFullscreen, resolveScreenFacts,
  rightClickShouldBlock, FULLSCREEN_EXIT_MSG, DISPLAY_CONNECT_MSG, DISPLAY_CHANGE_MSG,
  type ScreenFacts,
} from '@/lib/proctoring'
import type { ProctorEvent } from '@/lib/company/types'

const STRIKE_COOLDOWN_MS = 2500
const LEAVE_MSG = 'You left the assessment window. Switching away is recorded as a proctoring violation.'

export interface ProctoringState {
  envState: 'gate' | 'blocked' | 'cleared'
  envConsent: boolean
  setEnvConsent: (v: boolean) => void
  envBusy: boolean
  envBlockReason: string | null
  fsBlocked: boolean
  fsEngaged: boolean
  isFullscreen: boolean
  mediaReady: boolean
  mediaError: string
  videoOn: boolean
  videoRef: React.MutableRefObject<HTMLVideoElement | null>
  strikes: number
  showViolation: boolean
  violationMsg: string
  toast: string | null
  runEnvCheck: () => Promise<void>
  enterFullscreen: () => Promise<boolean>
  enableMedia: () => Promise<void>
  continueWithoutCamera: () => void
  acknowledgeViolation: () => void
  releaseMedia: () => void
  /** Snapshot for the server: strikes, camera/fullscreen state, event log. */
  report: () => { strikes: number; camera: boolean | null; fullscreen: boolean | null; events: ProctorEvent[] }
  logEvent: (type: string, detail?: string) => void
}

export function useProctoring(opts: {
  /** False while submitting / reviewing — monitors stand down. */
  active: boolean
  /** Called once when the attempt must end (3 warnings, display connected). */
  onTerminate: (reason: string) => void
}): ProctoringState {
  const [envState, setEnvState] = useState<'gate' | 'blocked' | 'cleared'>('gate')
  const [envConsent, setEnvConsent] = useState(false)
  const [envBusy, setEnvBusy] = useState(false)
  const [envBlockReason, setEnvBlockReason] = useState<string | null>(null)
  const [fsBlocked, setFsBlocked] = useState(false)
  const [fsEngaged, setFsEngaged] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [mediaReady, setMediaReady] = useState(false)
  const [mediaError, setMediaError] = useState('')
  const [videoOn, setVideoOn] = useState(false)
  const [strikes, setStrikes] = useState(0)
  const [showViolation, setShowViolation] = useState(false)
  const [violationMsg, setViolationMsg] = useState('')
  const [toast, setToast] = useState<string | null>(null)

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const suppressRef = useRef(false)
  const suppressTimerRef = useRef<any>(null)
  const mediaReadyRef = useRef(false)
  const awayRef = useRef(false)
  const strikesRef = useRef(0)
  const lastStrikeAtRef = useRef(0)
  const envFactsRef = useRef<ScreenFacts | null>(null)
  const envFsEngagedRef = useRef(false)
  const eventsRef = useRef<ProctorEvent[]>([])
  const cameraRef = useRef<boolean | null>(null)
  const terminatedRef = useRef(false)
  const activeRef = useRef(opts.active)
  const onTerminateRef = useRef(opts.onTerminate)
  activeRef.current = opts.active
  onTerminateRef.current = opts.onTerminate

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast((t) => (t === msg ? null : t)), 3200)
  }, [])

  const logEvent = useCallback((type: string, detail?: string) => {
    eventsRef.current.push({ type, at: new Date().toISOString(), ...(detail ? { detail: detail.slice(0, 200) } : {}) })
    if (eventsRef.current.length > 200) eventsRef.current = eventsRef.current.slice(-200)
  }, [])

  const terminate = useCallback((reason: string) => {
    if (terminatedRef.current) return
    terminatedRef.current = true
    setShowViolation(false)
    logEvent('auto_submit', reason)
    onTerminateRef.current(reason)
  }, [logEvent])

  const bumpStrike = useCallback((type: string, msg: string) => {
    if (!activeRef.current || terminatedRef.current || suppressRef.current) return false
    if (Date.now() - lastStrikeAtRef.current < STRIKE_COOLDOWN_MS) return false
    lastStrikeAtRef.current = Date.now()
    const n = strikesRef.current + 1
    strikesRef.current = n
    setStrikes(n)
    setViolationMsg(msg)
    logEvent(type, `warning ${n}/${MAX_FOCUS_STRIKES}`)
    if (n >= MAX_FOCUS_STRIKES) terminate(`You reached ${MAX_FOCUS_STRIKES} proctoring warnings — your assessment was submitted automatically.`)
    else setShowViolation(true)
    return true
  }, [logEvent, terminate])

  /* Native permission prompts steal focus — never count them. */
  const withPromptGuard = useCallback(async <T,>(fn: () => Promise<T>): Promise<T> => {
    suppressRef.current = true
    if (suppressTimerRef.current) clearTimeout(suppressTimerRef.current)
    try {
      return await fn()
    } finally {
      suppressTimerRef.current = setTimeout(() => { suppressRef.current = false }, 1500)
    }
  }, [])

  const enterFullscreen = useCallback(async () => {
    return withPromptGuard(async () => {
      try { return await safeRequestFullscreen(document) } catch { return false }
    })
  }, [withPromptGuard])

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (videoRef.current) {
      try { videoRef.current.srcObject = null } catch { /* noop */ }
    }
  }, [])

  const releaseMedia = useCallback(() => {
    stopTracks()
    setVideoOn(false)
  }, [stopTracks])

  const enableMedia = useCallback(async () => {
    setMediaError('')
    await withPromptGuard(async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        streamRef.current = stream
        cameraRef.current = true
        setVideoOn(true)
        logEvent('camera_on')
      } catch (e: any) {
        cameraRef.current = false
        setMediaError(e?.name === 'NotAllowedError'
          ? 'Camera/mic permission was denied. The live preview is off, but focus monitoring is still active.'
          : 'No camera/mic was detected on this device. Focus monitoring is still active.')
        logEvent('camera_unavailable', String(e?.name || 'error'))
      }
      mediaReadyRef.current = true
      setMediaReady(true)
    })
  }, [withPromptGuard, logEvent])

  const continueWithoutCamera = useCallback(() => {
    cameraRef.current = false
    mediaReadyRef.current = true
    setMediaReady(true)
    logEvent('camera_skipped')
  }, [logEvent])

  const acknowledgeViolation = useCallback(() => {
    setShowViolation(false)
    awayRef.current = false
  }, [])

  const runEnvCheck = useCallback(async () => {
    setEnvBusy(true)
    setFsBlocked(false)
    try {
      const engaged = await enterFullscreen()
      envFsEngagedRef.current = engaged
      setFsEngaged(engaged)
      setIsFullscreen(!!document.fullscreenElement)
      if (!engaged) {
        setFsBlocked(true)
        setEnvState('gate')
        logEvent('fullscreen_denied')
        return
      }
      const facts = await withPromptGuard(() => resolveScreenFacts(window))
      const verdict = evaluateStartGate(facts)
      if (!verdict.allow) {
        setEnvBlockReason(verdict.reason)
        setEnvState('blocked')
        logEvent('multiple_displays_at_start', String(facts.accessibleDisplays))
        return
      }
      envFactsRef.current = facts
      setEnvBlockReason(null)
      setEnvState('cleared')
      logEvent('environment_cleared', verdict.detectible ? 'display check: window-management API' : 'display check: consent only')
    } catch {
      setEnvBlockReason('The environment check could not run in this browser. Close other tabs, disable screen mirroring and try again.')
      setEnvState('blocked')
    } finally {
      setEnvBusy(false)
    }
  }, [enterFullscreen, withPromptGuard, logEvent])

  /* Live camera preview. */
  useEffect(() => {
    if (videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current
      videoRef.current.play().catch(() => {})
    }
  }, [mediaReady, videoOn])

  /* Focus / visibility monitoring (starts once the camera gate is passed). */
  useEffect(() => {
    const onLeave = () => {
      if (!mediaReadyRef.current || suppressRef.current || !activeRef.current || terminatedRef.current) return
      if (document.hidden || !document.hasFocus()) {
        if (awayRef.current) return
        if (bumpStrike(document.hidden ? 'tab_hidden' : 'window_blur', LEAVE_MSG)) awayRef.current = true
      }
    }
    document.addEventListener('visibilitychange', onLeave)
    window.addEventListener('blur', onLeave)
    return () => {
      document.removeEventListener('visibilitychange', onLeave)
      window.removeEventListener('blur', onLeave)
    }
  }, [bumpStrike])

  /* Display + fullscreen monitor (after the environment gate). */
  useEffect(() => {
    if (envState !== 'cleared') return
    let running = false
    const id = window.setInterval(async () => {
      if (running || !activeRef.current || terminatedRef.current) return
      running = true
      try {
        const now = await resolveScreenFacts(window)
        const last = envFactsRef.current
        if (!last) { envFactsRef.current = now; return }
        if (envFsEngagedRef.current && last.fullscreen && !now.fullscreen) bumpStrike('fullscreen_exit', FULLSCREEN_EXIT_MSG)
        const ev = classifyDisplayEvent(last, now)
        if (ev === 'display_connect') {
          logEvent('display_connected', `${last.accessibleDisplays} → ${now.accessibleDisplays}`)
          terminate(DISPLAY_CONNECT_MSG)
        } else if (ev === 'display_layout_change') {
          bumpStrike('display_change', DISPLAY_CHANGE_MSG)
        }
        envFactsRef.current = now
      } finally {
        running = false
      }
    }, 1500)
    return () => window.clearInterval(id)
  }, [envState, bumpStrike, logEvent, terminate])

  /* Keep the fullscreen indicator honest. */
  useEffect(() => {
    const sync = () => setIsFullscreen(!!document.fullscreenElement)
    sync()
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [])

  /* Fullscreen lock: re-enter automatically after Esc (browsers may refuse briefly). */
  useEffect(() => {
    if (envState !== 'cleared' || !fsEngaged) return
    let attempts = 0
    let timer: any = null
    const attempt = async () => {
      if (suppressRef.current || document.fullscreenElement || !activeRef.current || terminatedRef.current) return
      const ok = await safeRequestFullscreen(document)
      if (ok) showToast('Fullscreen restored — it must stay on for the whole test.')
      else if (++attempts < 6) { clearTimeout(timer); timer = setTimeout(attempt, 500) }
      else showToast('⚠ Fullscreen was exited — use the Fullscreen button in the header to go back.')
    }
    const onChange = () => { if (!suppressRef.current && !document.fullscreenElement) { attempts = 0; attempt() } }
    document.addEventListener('fullscreenchange', onChange)
    return () => { document.removeEventListener('fullscreenchange', onChange); clearTimeout(timer) }
  }, [envState, fsEngaged, showToast])

  /* Page-level locks: right-click, copying questions, printing, dev tools. */
  useEffect(() => {
    if (envState !== 'cleared') return
    const editable = (t: EventTarget | null) => {
      const el = t as HTMLElement | null
      return !!el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' || el.isContentEditable)
    }
    const onCtx = (e: MouseEvent) => {
      if (!activeRef.current) return
      if (rightClickShouldBlock(true).block) e.preventDefault()
    }
    const onCopy = (e: ClipboardEvent) => {
      if (!activeRef.current || editable(e.target)) return
      e.preventDefault()
      logEvent('copy_blocked')
      showToast('Copying question content is disabled during the assessment.')
    }
    const onPaste = (e: ClipboardEvent) => {
      if (!activeRef.current) return
      const n = e.clipboardData?.getData('text')?.length || 0
      if (n >= 40) logEvent('paste', `${n} characters`)
    }
    const onKey = (e: KeyboardEvent) => {
      if (!activeRef.current) return
      const k = e.key.toLowerCase()
      const mod = e.ctrlKey || e.metaKey
      if (mod && k === 'p') { e.preventDefault(); logEvent('print_blocked'); showToast('Printing is disabled during the assessment.') }
      else if (e.key === 'F12' || (mod && e.shiftKey && ['i', 'j', 'c'].includes(k)) || (mod && k === 'u')) {
        e.preventDefault()
        logEvent('devtools_shortcut', e.key)
      } else if (mod && !editable(e.target) && ['c', 'x', 'a', 's'].includes(k)) {
        e.preventDefault()
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (activeRef.current && e.key === 'PrintScreen') {
        logEvent('screenshot_key')
        showToast('Screenshots are not allowed — this has been recorded.')
        try { navigator.clipboard?.writeText?.('') } catch { /* ignore */ }
      }
    }
    document.addEventListener('contextmenu', onCtx)
    document.addEventListener('copy', onCopy)
    document.addEventListener('cut', onCopy)
    document.addEventListener('paste', onPaste, true)
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('keyup', onKeyUp, true)
    return () => {
      document.removeEventListener('contextmenu', onCtx)
      document.removeEventListener('copy', onCopy)
      document.removeEventListener('cut', onCopy)
      document.removeEventListener('paste', onPaste, true)
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('keyup', onKeyUp, true)
    }
  }, [envState, logEvent, showToast])

  /* Release the camera/mic when the exam page unmounts. */
  useEffect(() => () => {
    stopTracks()
    if (suppressTimerRef.current) clearTimeout(suppressTimerRef.current)
  }, [stopTracks])

  const report = useCallback(() => ({
    strikes: strikesRef.current,
    camera: cameraRef.current,
    fullscreen: envFsEngagedRef.current,
    events: eventsRef.current.slice(-120),
  }), [])

  return {
    envState, envConsent, setEnvConsent, envBusy, envBlockReason, fsBlocked, fsEngaged, isFullscreen,
    mediaReady, mediaError, videoOn, videoRef, strikes, showViolation, violationMsg, toast,
    runEnvCheck, enterFullscreen, enableMedia, continueWithoutCamera, acknowledgeViolation, releaseMedia,
    report, logEvent,
  }
}
