'use client'
import React, { createContext, useContext, useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'

interface ThemeContextType {
  theme: Theme
  toggleTheme: () => void
  setTheme: (t: Theme) => void
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'light',
  toggleTheme: () => {},
  setTheme: () => {},
})

export const THEME_STORAGE_KEY = 'calibi_theme'

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('light')
  const [mounted, setMounted] = useState(false)

  // Initialize theme from localStorage or system preference
  useEffect(() => {
    setMounted(true)
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY) as Theme | null
      if (stored === 'dark' || stored === 'light') {
        setThemeState(stored)
        applyTheme(stored)
      } else {
        // Fallback to system preference
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
        const initial: Theme = prefersDark ? 'dark' : 'light'
        setThemeState(initial)
        applyTheme(initial)
      }
    } catch {
      applyTheme('light')
    }
  }, [])

  const applyTheme = (t: Theme) => {
    const root = document.documentElement
    if (t === 'dark') {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
  }

  const setTheme = (t: Theme) => {
    setThemeState(t)
    try {
      localStorage.setItem(THEME_STORAGE_KEY, t)
    } catch {}
    applyTheme(t)
  }

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
