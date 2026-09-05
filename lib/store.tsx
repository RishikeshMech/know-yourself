'use client'
import React, { createContext, useContext, useEffect, useState } from 'react'

type User = { id: string, email: string, role: string, institution_id: string, name?: string }
type Store = {
  user: User | null,
  setUser: (u: User | null) => void,
  profile: any, setProfile: (p:any)=>void,
  resume: any, setResume: (r:any)=>void,
  tracking: { whatsapp:boolean, linkedin:boolean }, setTracking: (t:any)=>void,
  session: any, setSession: (s:any)=>void,
  scores: any, setScores: (s:any)=>void,
  logout: ()=>void,
}

const Ctx = createContext<Store>(null as any)

export function StoreProvider({children}:{children:React.ReactNode}){
  const [user,setUserState] = useState<User|null>(null)
  const [profile,setProfile] = useState<any>(null)
  const [resume,setResume] = useState<any>(null)
  const [tracking,setTracking] = useState({whatsapp:false, linkedin:false})
  const [session,setSession] = useState<any>(null)
  const [scores,setScores] = useState<any>(null)
  // Gate persistence until localStorage has been read once. Without this, the
  // session effect sees the initial `null` on mount and wipes `calibiai_session`
  // before hydration finishes — which made /assessment bounce straight back to
  // /instructions after clicking "START 120-MIN TIMER →".
  const [hydrated,setHydrated] = useState(false)

  useEffect(()=>{
    try{
      const u = localStorage.getItem('calibiai_user')
      if(u) setUserState(JSON.parse(u))
      const p = localStorage.getItem('calibiai_profile'); if(p) setProfile(JSON.parse(p))
      const r = localStorage.getItem('calibiai_resume'); if(r) setResume(JSON.parse(r))
      const t = localStorage.getItem('calibiai_tracking'); if(t) setTracking(JSON.parse(t))
      const s = localStorage.getItem('calibiai_session'); if(s) setSession(JSON.parse(s))
      const sc = localStorage.getItem('calibiai_scores'); if(sc) setScores(JSON.parse(sc))
    }catch{}
    setHydrated(true)
  },[])

  const setUser = (u:User|null)=>{
    setUserState(u)
    if(u) localStorage.setItem('calibiai_user', JSON.stringify(u))
    else localStorage.removeItem('calibiai_user')
  }
  // Persist synchronously inside the setters too. Relying only on the
  // useEffect-based persistence below is unsafe: callers can navigate away
  // (window.location.href) in the same tick, unloading the page before React
  // flushes the effect — the value then never reaches localStorage.
  const setProfileSafe = (p:any)=>{
    setProfile(p)
    if(p) localStorage.setItem('calibiai_profile', JSON.stringify(p))
  }
  const setResumeSafe = (r:any)=>{
    setResume(r)
    if(r) localStorage.setItem('calibiai_resume', JSON.stringify(r))
  }
  const setSessionSafe = (s:any)=>{
    setSession(s)
    if(s) localStorage.setItem('calibiai_session', JSON.stringify(s))
    else localStorage.removeItem('calibiai_session')
  }
  const setScoresSafe = (s:any)=>{
    setScores(s)
    if(s) localStorage.setItem('calibiai_scores', JSON.stringify(s))
  }
  useEffect(()=>{ if(!hydrated) return; if(profile) localStorage.setItem('calibiai_profile', JSON.stringify(profile)) },[profile, hydrated])
  useEffect(()=>{ if(!hydrated) return; if(resume) localStorage.setItem('calibiai_resume', JSON.stringify(resume)) },[resume, hydrated])
  useEffect(()=>{ if(!hydrated) return; localStorage.setItem('calibiai_tracking', JSON.stringify(tracking)) },[tracking, hydrated])
  // Only write when we have a session. NEVER remove on null here — initial
  // mount is null before hydration, and removing would drop a just-started
  // assessment session. Explicit clears go through setSessionSafe(null)/logout.
  useEffect(()=>{ if(!hydrated) return; if(session) localStorage.setItem('calibiai_session', JSON.stringify(session)) },[session, hydrated])
  useEffect(()=>{ if(!hydrated) return; if(scores) localStorage.setItem('calibiai_scores', JSON.stringify(scores)) },[scores, hydrated])

  const logout = ()=>{
    localStorage.clear()
    setUserState(null); setProfile(null); setResume(null); setTracking({whatsapp:false,linkedin:false}); setSession(null); setScores(null)
    window.location.href='/login'
  }

  return <Ctx.Provider value={{user,setUser,profile,setProfile:setProfileSafe,resume,setResume:setResumeSafe,tracking,setTracking,session,setSession:setSessionSafe,scores,setScores:setScoresSafe,logout}}>{children}</Ctx.Provider>
}

export const useStore = ()=> useContext(Ctx)
