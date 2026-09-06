'use client'
import { useState, useRef, useEffect } from 'react'
import { useStore } from '@/lib/store'
import { Logo } from '@/components/Logo'
import { User, LogOut, ChevronDown, Sparkles } from 'lucide-react'

function initials(name?: string, email?: string): string {
  const source = (name || email || '?').trim()
  const parts = source.split(/[\s@.]+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

export function Navbar() {
  const { user, logout } = useStore()
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close the dropdown when clicking outside.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const displayName = (user?.name || user?.email?.split('@')[0] || 'User').trim()

  return (
    <header className="sticky top-0 z-40 border-b border-white/50 bg-white/55 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <a href="/" className="flex items-center gap-2.5">
          <Logo className="drop-shadow-lg" />
          <span className="font-extrabold tracking-tight text-slate-900 text-lg">CALIBIAI<span className="text-indigo-600"> SCORE</span></span>
        </a>
        <div className="flex items-center gap-2 text-sm">
          {user ? (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setOpen(o => !o)}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-label="Account menu"
                className="group flex items-center gap-1.5 rounded-full border border-white/60 bg-white/70 py-1 pl-1 pr-2 shadow-sm backdrop-blur transition hover:bg-white hover:shadow-md"
              >
                {/* Circular AI avatar — initials on the brand gradient with a sparkle badge */}
                <span className="relative flex h-9 w-9 items-center justify-center rounded-full calibiai-gradient text-sm font-black text-white select-none shadow-inner ring-2 ring-white/70">
                  {initials(user.name, user.email)}
                  <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-white text-indigo-600 shadow ring-1 ring-indigo-100">
                    <Sparkles className="h-2.5 w-2.5" fill="currentColor" />
                  </span>
                </span>
                <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
              </button>

              {open && (
                <div
                  role="menu"
                  className="absolute right-0 mt-2 w-64 origin-top-right animate-pop overflow-hidden rounded-2xl border border-white/60 bg-white/95 shadow-xl shadow-slate-500/15 backdrop-blur-xl"
                >
                  {/* Account header */}
                  <div className="border-b border-slate-100 px-4 py-3">
                    <div className="truncate text-sm font-bold text-slate-800">{displayName}</div>
                    <div className="truncate text-xs text-slate-500">{user.email}</div>
                    <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-indigo-100 bg-indigo-50 px-2 py-0.5 text-xs font-semibold capitalize text-indigo-600">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      {user.role}
                    </span>
                  </div>

                  {/* Menu items */}
                  <div className="p-1.5">
                    <a
                      href="/profile"
                      role="menuitem"
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-indigo-50 hover:text-indigo-700"
                    >
                      <User className="h-4 w-4 text-slate-400" />
                      See My Profile
                    </a>
                    <button
                      onClick={logout}
                      role="menuitem"
                      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-rose-50 hover:text-rose-600"
                    >
                      <LogOut className="h-4 w-4 text-slate-400" />
                      Logout
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <a href="/login" className="btn-primary !px-5 !py-2 text-xs">Sign in</a>
          )}
        </div>
      </div>
    </header>
  )
}
