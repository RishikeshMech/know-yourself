'use client'
import { useStore } from '@/lib/store'

export function Navbar(){
  const {user, logout} = useStore()
  return (
    <header className="sticky top-0 z-40 backdrop-blur bg-navy-900/70 border-b border-white/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg calibiai-gradient flex items-center justify-center font-black text-sm">C</div>
          <span className="font-bold tracking-tight">CALIBIAI<span className="text-sky-400"> SCORE</span></span>
          <span className="hidden sm:inline text-xs text-white/40 ml-2 border border-white/10 rounded-full px-2 py-0.5">Global Standard • /1000</span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          {user ? <>
            <span className="hidden sm:inline text-white/60">{user.email} <span className="text-white/30">• {user.role}</span></span>
            <button onClick={logout} className="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/15 text-xs font-medium">Sign out</button>
          </> : <a href="/login" className="px-3 py-1.5 rounded-full calibiai-gradient text-xs font-bold">Sign in</a>}
        </div>
      </div>
    </header>
  )
}
