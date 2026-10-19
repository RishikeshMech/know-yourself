'use client'
import { useEffect } from 'react'

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Application error:', error)
  }, [error])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
      <div className="glass-card max-w-md w-full p-8 space-y-4">
        <div className="h-12 w-12 mx-auto rounded-full bg-red-100 dark:bg-red-950/80 flex items-center justify-center text-red-600 dark:text-red-400 font-bold text-xl">
          !
        </div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">Something went wrong</h2>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          An unexpected error occurred while loading this view.
        </p>
        <div className="flex justify-center gap-3 pt-2">
          <button
            onClick={() => reset()}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-700 transition"
          >
            Try Again
          </button>
          <a
            href="/"
            className="rounded-xl border border-slate-300 dark:border-slate-700 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            Go Home
          </a>
        </div>
      </div>
    </div>
  )
}
