'use client'
import { useTheme } from './ThemeProvider'
import { Sun, Moon } from 'lucide-react'
import { useEffect, useState } from 'react'

export function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, toggleTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <div className={`h-9 w-9 rounded-full border border-slate-200/60 bg-white/60 dark:border-slate-700/60 dark:bg-slate-800/60 ${className}`} />
    )
  }

  const isDark = theme === 'dark'

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
      title={isDark ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
      className={`group relative flex h-9 w-9 items-center justify-center rounded-full border border-slate-200/80 bg-white/80 shadow-xs backdrop-blur-md transition-all duration-300 hover:scale-105 hover:border-indigo-300 hover:bg-white hover:shadow-md active:scale-95 dark:border-slate-700/80 dark:bg-slate-800/80 dark:hover:border-indigo-400 dark:hover:bg-slate-800 ${className}`}
    >
      {/* Sun icon for Dark Mode */}
      <Sun
        className={`h-4 w-4 text-amber-400 transition-all duration-500 ${
          isDark
            ? 'rotate-0 scale-100 opacity-100 drop-shadow-[0_0_8px_rgba(251,191,36,0.6)]'
            : '-rotate-90 scale-0 opacity-0 absolute'
        }`}
        aria-hidden
      />

      {/* Moon icon for Light Mode */}
      <Moon
        className={`h-4 w-4 text-indigo-600 transition-all duration-500 ${
          isDark
            ? 'rotate-90 scale-0 opacity-0 absolute'
            : 'rotate-0 scale-100 opacity-100 drop-shadow-[0_0_8px_rgba(99,102,241,0.4)]'
        }`}
        aria-hidden
      />
    </button>
  )
}
