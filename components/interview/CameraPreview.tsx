'use client'
import { useEffect, useRef, useState } from 'react'

export function CameraPreview({
  enabled,
  onStatusChange,
}: {
  enabled: boolean
  onStatusChange?: (ok: boolean) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [active, setActive] = useState(false)

  useEffect(() => {
    if (!enabled) {
      if (videoRef.current?.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream
        stream.getTracks().forEach(t => t.stop())
        videoRef.current.srcObject = null
      }
      setActive(false)
      onStatusChange?.(false)
      return
    }

    let stream: MediaStream | null = null
    ;(async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 }, audio: false })
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play().catch(() => {})
        }
        setActive(true)
        setError(null)
        onStatusChange?.(true)
      } catch (e: any) {
        setError(e?.message || 'Camera access denied')
        setActive(false)
        onStatusChange?.(false)
      }
    })()

    return () => {
      stream?.getTracks().forEach(t => t.stop())
    }
  }, [enabled])

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-900">
      <video ref={videoRef} muted playsInline className="h-36 w-full object-cover" />
      {!active && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80 text-xs text-slate-400">
          {error ? `Camera: ${error}` : enabled ? 'Starting camera…' : 'Camera off'}
        </div>
      )}
      <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1.5 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-bold text-white">
        <span className={`h-2 w-2 rounded-full ${active ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
        {active ? 'Camera ON — preview only (not stored)' : 'Camera preview'}
      </div>
    </div>
  )
}
