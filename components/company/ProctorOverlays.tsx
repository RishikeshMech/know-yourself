'use client'
import { useMemo } from 'react'
import { Maximize2, TriangleAlert } from 'lucide-react'
import {
  MAX_FOCUS_STRIKES, watermarkBackgroundImage, watermarkIdentity, WATERMARK_TILE_HEIGHT, WATERMARK_TILE_WIDTH,
} from '@/lib/proctoring'
import type { ProctoringState } from './useProctoring'

/** Leak-prevention watermark: candidate identity tiled across the live test. */
export function Watermark({ name, email, id, sessionId, companyName }: {
  name?: string | null; email?: string | null; id?: string | null; sessionId?: string | null; companyName: string
}) {
  const style = useMemo(() => {
    const text = `${watermarkIdentity({ name, email, id, sessionId })} · ${companyName.toUpperCase()}`
    return {
      backgroundImage: watermarkBackgroundImage(text),
      backgroundSize: `${WATERMARK_TILE_WIDTH}px ${WATERMARK_TILE_HEIGHT}px`,
    }
  }, [name, email, id, sessionId, companyName])
  return <div aria-hidden className="pointer-events-none fixed inset-0 z-40 watermark-overlay" style={style} />
}

export function ProctorOverlays({ p, companyName, live }: { p: ProctoringState; companyName: string; live: boolean }) {
  return (
    <>
      {/* Pre-test environment gate */}
      {p.envState === 'gate' && (
        <div className="fixed inset-0 z-[70] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="glass-card max-w-md w-full !p-8 animate-pop">
            <div className="text-5xl text-center">🛡️</div>
            <h3 className="mt-4 text-xl font-black text-slate-900 text-center">Secure your test environment</h3>
            <p className="mt-2 text-sm text-slate-500 text-center">
              Before the {companyName} questions are revealed we run an anti-cheat check and lock the browser.
            </p>
            <ul className="mt-5 space-y-2.5 text-sm text-slate-700">
              <li className="flex gap-2.5"><span className="shrink-0">🔒</span><span>The browser is <b>locked in fullscreen</b>. Pressing Esc re-enters automatically — leaving fullscreen is a warning.</span></li>
              <li className="flex gap-2.5"><span className="shrink-0">🖥️</span><span><b>External or mirrored displays</b> are not allowed. Connecting one mid-test ends the assessment.</span></li>
              <li className="flex gap-2.5"><span className="shrink-0">🚫</span><span><b>Right-click, copying questions, printing</b> and developer tools are disabled; pastes and screenshot keys are recorded.</span></li>
              <li className="flex gap-2.5"><span className="shrink-0">🗂️</span><span>Close every other tab and window — <b>switching away {MAX_FOCUS_STRIKES} times submits your test</b>.</span></li>
            </ul>
            <label className="mt-5 flex gap-2 text-sm text-slate-700 cursor-pointer">
              <input type="checkbox" checked={p.envConsent} onChange={(e) => p.setEnvConsent(e.target.checked)} className="accent-indigo-600 mt-0.5 w-4 h-4" />
              I have closed all other tabs and windows and will not connect or mirror an external display during the test.
            </label>
            {p.fsBlocked && (
              <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-600 animate-fade-in">
                Fullscreen permission was not granted. The assessment cannot run in a normal window — press the button again and choose <b>Allow</b>, or enable fullscreen for this site in your browser settings.
              </div>
            )}
            <button onClick={p.runEnvCheck} disabled={!p.envConsent || p.envBusy}
              className={`mt-5 w-full rounded-full font-black text-sm transition ${p.envConsent && !p.envBusy ? 'btn-primary !py-3.5' : 'bg-slate-200 text-slate-400 cursor-not-allowed py-3.5'}`}>
              {p.envBusy ? 'Checking environment…' : p.fsBlocked ? 'Re-enter fullscreen & re-check →' : 'Enter fullscreen & begin security check →'}
            </button>
          </div>
        </div>
      )}

      {p.envState === 'blocked' && (
        <div className="fixed inset-0 z-[70] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="glass-card max-w-md w-full !p-8 animate-pop text-center">
            <div className="text-5xl">⛔</div>
            <h3 className="mt-4 text-xl font-black text-rose-600">Test can’t start</h3>
            <p className="mt-3 text-sm text-slate-600 leading-relaxed">{p.envBlockReason || 'An external or mirrored display appears to be connected.'}</p>
            <p className="mt-3 text-xs text-slate-500">Disconnect any external / second display and re-run the check. Your timer is running.</p>
            <button onClick={p.runEnvCheck} disabled={p.envBusy} className="btn-primary mt-5 w-full !py-3">
              {p.envBusy ? 'Re-checking…' : 'I’ve disconnected it — re-check'}
            </button>
          </div>
        </div>
      )}

      {/* Camera & microphone gate */}
      {!p.mediaReady && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="glass-card max-w-md w-full text-center !p-8 animate-pop">
            <div className="text-5xl">🎥</div>
            <h3 className="mt-4 text-xl font-black text-slate-900">Enable camera & microphone</h3>
            <p className="mt-2 text-sm text-slate-500">A live proctoring preview stays on screen for the whole test. Please remain visible to the camera. <b className="text-slate-700">{MAX_FOCUS_STRIKES} warnings close the assessment.</b></p>
            <button onClick={p.enableMedia} className="btn-primary mt-6 w-full">Turn on camera & mic →</button>
            {p.mediaError && <div className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-2">{p.mediaError}</div>}
            <button onClick={p.continueWithoutCamera} className="mt-3 text-xs text-indigo-600 font-semibold">Continue without camera (recorded — focus monitoring stays active)</button>
          </div>
        </div>
      )}

      {/* Fullscreen lock */}
      {live && p.envState === 'cleared' && p.fsEngaged && !p.isFullscreen && (
        <div className="fixed inset-0 z-[45] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="max-w-sm w-full rounded-3xl border-2 border-indigo-300 bg-white p-7 text-center shadow-2xl animate-pop">
            <div className="text-5xl">🖥️</div>
            <h3 className="mt-3 text-xl font-black text-indigo-700">Fullscreen required</h3>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">The assessment is paused until you re-enter fullscreen. The timer keeps running.</p>
            <button onClick={() => { p.enterFullscreen() }} className="btn-primary mt-5 w-full !py-3">
              <span className="inline-flex items-center gap-2"><Maximize2 className="h-4 w-4" aria-hidden /> Re-enter fullscreen</span>
            </button>
          </div>
        </div>
      )}

      {/* Warning */}
      {live && p.showViolation && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="relative w-full max-w-sm rounded-3xl border border-amber-200 bg-white p-7 text-center shadow-2xl shadow-amber-200/40 animate-slide-down">
            <div className="relative mx-auto h-20 w-20">
              <span className="absolute inset-0 rounded-full bg-amber-400/30 animate-ping" />
              <div className="relative grid h-20 w-20 place-items-center rounded-full bg-gradient-to-br from-amber-100 to-amber-200 shadow-inner animate-shake">
                <TriangleAlert className="h-9 w-9 text-amber-600" aria-hidden />
              </div>
            </div>
            <h3 className="mt-4 text-xl font-black text-slate-900">Warning {p.strikes} of {MAX_FOCUS_STRIKES}</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{p.violationMsg}</p>
            <div className="mt-4 flex items-center justify-center gap-1.5">
              {Array.from({ length: MAX_FOCUS_STRIKES }).map((_, i) => (
                <span key={i} className={`h-2.5 rounded-full transition-all duration-500 ${i < p.strikes ? (i === p.strikes - 1 ? 'w-7 bg-amber-500 animate-pulse' : 'w-7 bg-amber-400/70') : 'w-2.5 bg-slate-200'}`} />
              ))}
            </div>
            {p.strikes >= MAX_FOCUS_STRIKES - 1 && (
              <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-bold text-rose-600">
                ⚠ One more warning and your assessment will be submitted automatically.
              </div>
            )}
            <button onClick={p.acknowledgeViolation} className="btn-primary mt-6 w-full">I’m back — resume</button>
          </div>
        </div>
      )}

      {p.toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[80] max-w-md px-5 py-3 rounded-2xl bg-white/95 backdrop-blur border border-indigo-200 shadow-2xl text-sm text-slate-800 animate-pop">{p.toast}</div>
      )}
    </>
  )
}
