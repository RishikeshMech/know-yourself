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
  },[])

  const setUser = (u:User|null)=>{
    setUserState(u)
    if(u) localStorage.setItem('calibiai_user', JSON.stringify(u))
    else localStorage.removeItem('calibiai_user')
  }
  useEffect(()=>{ if(profile) localStorage.setItem('calibiai_profile', JSON.stringify(profile)) },[profile])
  useEffect(()=>{ if(resume) localStorage.setItem('calibiai_resume', JSON.stringify(resume)) },[resume])
  useEffect(()=>{ localStorage.setItem('calibiai_tracking', JSON.stringify(tracking)) },[tracking])
  useEffect(()=>{ if(session) localStorage.setItem('calibiai_session', JSON.stringify(session)); else localStorage.removeItem('calibiai_session') },[session])
  useEffect(()=>{ if(scores) localStorage.setItem('calibiai_scores', JSON.stringify(scores)) },[scores])

  const logout = ()=>{
    localStorage.clear()
    setUserState(null); setProfile(null); setResume(null); setTracking({whatsapp:false,linkedin:false}); setSession(null); setScores(null)
    window.location.href='/login'
  }

  return <Ctx.Provider value={{user,setUser,profile,setProfile,resume,setResume,tracking,setTracking,session,setSession,scores,setScores,logout}}>{children}</Ctx.Provider>
}

export const useStore = ()=> useContext(Ctx)
