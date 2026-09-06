'use client'
import { useState, useEffect } from 'react'
import { Navbar } from '@/components/Navbar'
import { StoreProvider, useStore } from '@/lib/store'
import { Stepper } from '@/components/Stepper'
import { getSupabase } from '@/lib/supabase'

function ProfileInner(){
  const {user, profile, setProfile} = useStore()
  const [form,setForm] = useState<any>({ full_name:'', phone:'+91 ', dob:'2003-04-12', gender:'Female', degree:'B.Tech CSE', college:'IIT Madras', graduation_year:2026, cgpa:8.7, skills:'Python, React, SQL', linkedin_url:'https://linkedin.com/in/you', github_url:'https://github.com/you' })
  const [saved,setSaved] = useState(false)

  useEffect(()=>{
    if(profile) setForm(profile)
    else if(user) setForm((f:any)=>({...f, full_name: user.name || ''}))
  },[user, profile])

  const onSave = async (e:any)=>{
    e.preventDefault()
    setProfile(form)
    setSaved(true)
    try {
      await fetch('/api/user/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, user_id: user?.id, email: user?.email }),
      })
    } catch (err) { /* demo mode fallback */ }
    setTimeout(()=> window.location.href='/resume', 550)
  }

  if(!user) return <div className="p-10 text-center text-slate-500"><Navbar/><a href="/login" className="text-indigo-600 font-semibold">Please sign in to continue →</a></div>

  const fields:[string,string][] = [
    ['full_name','Full name'], ['phone','Phone'], ['dob','Date of birth'], ['gender','Gender'],
    ['degree','Degree'], ['college','College'], ['graduation_year','Graduation year'], ['cgpa','CGPA'],
  ]

  return (
    <div>
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <Stepper step={2} />
        <div className="mt-6 glass-card animate-fade-up">
          <h1 className="text-2xl font-black text-slate-900">Your profile</h1>
          <p className="text-sm text-slate-500 mt-1">Tell us about yourself — this personalises your report and scorecard.</p>
          <form onSubmit={onSave} className="mt-6 grid sm:grid-cols-2 gap-4">
            {fields.map(([k,label])=>(
              <div key={k}>
                <label className="text-xs font-semibold text-slate-600">{label}</label>
                <input value={form[k]||''} onChange={e=>setForm({...form,[k]:e.target.value})} className="field mt-1.5" />
              </div>
            ))}
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold text-slate-600">Skills (comma separated)</label>
              <input value={form.skills} onChange={e=>setForm({...form,skills:e.target.value})} className="field mt-1.5" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600">LinkedIn URL</label>
              <input value={form.linkedin_url} onChange={e=>setForm({...form,linkedin_url:e.target.value})} className="field mt-1.5" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600">GitHub URL</label>
              <input value={form.github_url} onChange={e=>setForm({...form,github_url:e.target.value})} className="field mt-1.5" />
            </div>
            <div className="sm:col-span-2 flex items-center gap-3 pt-2">
              <button type="submit" className="btn-primary">Save & continue →</button>
              {saved && <span className="text-sm text-emerald-600 font-semibold animate-pop">✓ Saved</span>}
            </div>
          </form>
        </div>
      </main>
    </div>
  )
}
export default function Page(){ return <StoreProvider><ProfileInner/></StoreProvider> }
