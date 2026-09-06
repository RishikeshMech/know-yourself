'use client'
import { useState, useEffect } from 'react'

export function Typewriter({ text, delay = 80, className = '' }: { text: string; delay?: number; className?: string }) {
  const [displayed, setDisplayed] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    setDisplayed('')
    setDone(false)
    let i = 0
    const timer = setInterval(() => {
      if (i < text.length) {
        setDisplayed(text.slice(0, i + 1))
        i++
      } else {
        setDone(true)
        clearInterval(timer)
      }
    }, delay)
    return () => clearInterval(timer)
  }, [text, delay])

  return (
    <span className={className}>
      {displayed}
      <span className={`inline-block w-[3px] h-[0.85em] ml-0.5 align-middle bg-slate-900 rounded-sm animate-pulse ${done ? 'opacity-0' : 'opacity-100'}`} />
    </span>
  )
}
