'use client'
import { useStore } from '@/lib/store'
import { Logo } from '@/components/Logo'

export function Navbar(){
  const {user, logout} = useStore()
  return (
    <header className="sticky top-0 z-40 border-b border-white/50 bg-white/55 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <a href="/" className="flex items-center gap-2.5">
          <Logo className="drop-shadow-lg" />
          <span className="font-extrabold tracking-tight text-slate-900 text-lg">CALIBIAI<span className="text-indigo-600"> SCORE</span></span>
        </a>
        <div className="flex items-center gap-3 text-sm">
          {user ? <>
            <span className="hidden sm:flex items-center gap-2 text-xs font-semibold text-slate-600 bg-white/70 border border-slate-200 rounded-full px-3 py-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              {user.name || user.email} • <span className="capitalize text-indigo-600">{user.role}</span>
            </span>
            <button onClick={logout} className="btn-soft !px-4 !py-1.5 text-xs">Sign out</button>
          </> : <a href="/login" className="btn-primary !px-5 !py-2 text-xs">Sign in</a>}
        </div>
      </div>
    </header>
  )
}
