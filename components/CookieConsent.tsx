'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { getCookieConsent, setCookieConsent } from '@/lib/cookieAuth'

export default function CookieConsent() {
  const [mounted, setMounted] = useState(false)
  const [visible, setVisible] = useState(false)
  const [showPreferences, setShowPreferences] = useState(false)
  const [analytics, setAnalytics] = useState(true)
  const pathname = usePathname()

  useEffect(() => {
    setMounted(true)
    const existing = getCookieConsent()
    if (!existing) {
      // Delay slightly for smooth entrance
      const timer = setTimeout(() => setVisible(true), 1200)
      return () => clearTimeout(timer)
    }
  }, [])

  // Suppress completely during active test taking to ensure proctoring & fullscreen integrity
  const isTestScreen = pathname?.includes('/test') || pathname?.includes('/assessment/test')
  if (!mounted || !visible || isTestScreen) return null

  const handleAcceptAll = () => {
    setCookieConsent('all')
    setVisible(false)
  }

  const handleEssentialOnly = () => {
    setCookieConsent('essential')
    setVisible(false)
  }

  const handleSavePreferences = () => {
    setCookieConsent(analytics ? 'all' : 'essential')
    setVisible(false)
  }

  return (
    <div
      role="region"
      aria-label="Cookie consent banner"
      className="fixed bottom-4 left-4 right-4 z-40 mx-auto max-w-4xl animate-fade-up rounded-2xl border border-slate-200/80 bg-white/95 p-4 sm:p-5 shadow-2xl backdrop-blur-xl dark:border-slate-800/80 dark:bg-slate-900/95 transition-all duration-300"
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1 md:max-w-xl">
          <div className="flex items-center gap-2">
            <span className="text-lg" aria-hidden="true">🍪</span>
            <span className="text-sm font-black text-slate-900 dark:text-slate-100">
              Cookie & Session Preferences
            </span>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            We use essential cookies to maintain secure test sessions and verify exam integrity. Optional analytics cookies help us measure assessment loading speeds and optimize question delivery.
          </p>

          {showPreferences && (
            <div className="mt-3 space-y-2 rounded-xl border border-slate-100 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-slate-800/50">
              <label className="flex items-center justify-between gap-3 text-xs">
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  Essential Authentication & Anti-Cheat (Required)
                </span>
                <input type="checkbox" checked disabled className="rounded accent-indigo-600" />
              </label>
              <label className="flex items-center justify-between gap-3 text-xs cursor-pointer">
                <span className="font-medium text-slate-600 dark:text-slate-400">
                  Performance & Experience Analytics
                </span>
                <input
                  type="checkbox"
                  checked={analytics}
                  onChange={(e) => setAnalytics(e.target.checked)}
                  className="rounded accent-indigo-600"
                />
              </label>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {showPreferences ? (
            <button
              onClick={handleSavePreferences}
              className="btn-primary !py-2 !px-4 !text-xs font-bold"
            >
              Save Preferences
            </button>
          ) : (
            <>
              <button
                onClick={handleAcceptAll}
                className="btn-primary !py-2 !px-4 !text-xs font-bold"
              >
                Accept All
              </button>
              <button
                onClick={handleEssentialOnly}
                className="btn-secondary !py-2 !px-4 !text-xs font-medium"
              >
                Essential Only
              </button>
              <button
                onClick={() => setShowPreferences(true)}
                className="text-xs font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 underline ml-1"
              >
                Customize
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
