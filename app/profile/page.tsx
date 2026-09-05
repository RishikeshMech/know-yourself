'use client'
import { useState, useEffect } from 'react'
import { Navbar } from '@/components/Navbar'
import { StoreProvider, useStore } from '@/lib/store'
import { Stepper } from '@/components/Stepper'

function ProfileInner(){
  const {user, profile, setProfile} = useStore()
  const [form,setForm] = useState<any>({ full_name:'', phone:'+91 ', dob:'2003-04-12', gender:'Female', degree:'B.Tech CSE', college:'IIT Madras', graduation_year:2026, cgpa:8.7, skills:'Python, React, SQL', linkedin_url:'https://linkedin.com/in/priya', github_url:'https://github.com/priya' })
  const [saved,setSaved] = useState(false)

  useEffect(()=>{
    if(profile) setForm(profile)
    else if(user) setForm((f:any)=>({...f, full_name: user.name || ''}))
  },[user, profile])

  const onSave = (e:any)=>{
    e.preventDefault()
    setProfile(form)
    setSaved(true)
    setTimeout(()=> window.location.href='/resume', 600)
  }

  if(!user) return <div className="p-6 text-center"><a href="/login" className="text-sky-400">Please login →</a></div>

  return (
    <div>
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        <Stepper step={2} />
        <div className="mt-6 rounded-[24px] glass p-6 sm:p-8">
          <h1 className="text-xl font-black">Student Profile</h1>
          <p className="text-sm text-white/60">Tenant-aware • sharded by institution_id • encrypted at rest (pgcrypto). {user.email}</p>
          <form onSubmit={onSave} className="mt-6 grid sm:grid-cols-2 gap-4">
            {[
              ['full_name','Full Name'], ['phone','Phone'], ['dob','DOB'], ['gender','Gender'],
              ['degree','Degree'], ['college','College'], ['graduation_year','Graduation Year'], ['cgpa','CGPA'],
            ].map(([k,label])=>(
              <div key={k}>
                <label className="text-xs text-white/60">{label}</label>
                <input value={form[k]||''} onChange={e=>setForm({...form,[k]:e.target.value})} className="mt-1 w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 text-sm outline-none focus:border-sky-500" />
              </div>
            ))}
            <div className="sm:col-span-2">
              <label className="text-xs text-white/60">Skills (comma separated)</label>
              <input value={form.skills} onChange={e=>setForm({...form,skills:e.target.value})} className="mt-1 w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 text-sm" />
            </div>
            <div>
              <label className="text-xs text-white/60">LinkedIn URL</label>
              <input value={form.linkedin_url} onChange={e=>setForm({...form,linkedin_url:e.target.value})} className="mt-1 w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 text-sm" />
            </div>
            <div>
              <label className="text-xs text-white/60">GitHub URL</label>
              <input value={form.github_url} onChange={e=>setForm({...form,github_url:e.target.value})} className="mt-1 w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 text-sm" />
            </div>
            <div className="sm:col-span-2 flex gap-3 pt-2">
              <button type="submit" className="px-6 py-3 rounded-full calibiai-gradient font-bold text-sm">Save & Continue →</button>
              {saved && <span className="text-xs text-emerald-400 self-center">Saved • audit logged</span>}
            </div>
          </form>
        </div>
      </main>
    </div>
  )
}
export default function Page(){ return <StoreProvider><ProfileInner/></StoreProvider> }
