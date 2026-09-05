'use client'
export const dynamic = 'force-dynamic'
import { Navbar } from '@/components/Navbar'
import { StoreProvider } from '@/lib/store'
import { useState, useEffect } from 'react'

const institutions = [
  {name:'IIT Madras', avg:742, students:4200, top: 921},
  {name:'IIT Delhi', avg:738, students:3800, top: 915},
  {name:'BITS Pilani', avg:715, students:3100, top: 902},
  {name:'Your Institution', avg:728, students:1240, top: 884, isYours:true},
]

function Inner(){
  const [minScore,setMinScore]=useState(750)
  const [apiKey,setApiKey]=useState('calibiai_live_demo')
  useEffect(()=>{ setApiKey('calibiai_live_'+Math.random().toString(16).slice(2,10)) },[])
  const candidates = [
    {name:'Priya Sharma', score:842, skills:['Python','React'], hash:'sha256:a3f...', college:'IIT Madras'},
    {name:'Ananya Singh', score:884, skills:['Python','SQL'], hash:'sha256:9c1...', college:'IIT Madras'},
    {name:'Rohan Mehta', score:721, skills:['Java'], hash:'sha256:4b2...', college:'BITS'},
    {name:'Sara Joseph', score:760, skills:['React','Node'], hash:'sha256:7e9...', college:'IIT Delhi'},
  ].filter(c=>c.score>=minScore)

  return (
    <div>
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <h1 className="text-xl font-black">Institution / Enterprise Dashboard</h1>
        <p className="text-sm text-white/60">Cross-institution benchmarking • cohort analytics • bulk hiring pipelines • verified score API.</p>

        <div className="mt-6 grid sm:grid-cols-4 gap-3">
          <div className="rounded-2xl glass p-4"><div className="text-xs text-white/50">Total Students (platform)</div><div className="text-2xl font-black">2.4M</div><div className="text-xs text-emerald-300">+12% MoM</div></div>
          <div className="rounded-2xl glass p-4"><div className="text-xs text-white/50">Avg Calibiai</div><div className="text-2xl font-black">728</div><div className="text-xs text-white/40">National avg 702</div></div>
          <div className="rounded-2xl glass p-4"><div className="text-xs text-white/50">Placement-Ready (≥750)</div><div className="text-2xl font-black">38%</div><div className="text-xs text-white/40">S+A grades</div></div>
          <div className="rounded-2xl calibiai-gradient p-4 text-white"><div className="text-xs opacity-80">Your Rank (institutions)</div><div className="text-2xl font-black">#12 / 240</div><div className="text-xs opacity-80">Top 5% zone: 760+</div></div>
        </div>

        <div className="mt-6 grid lg:grid-cols-2 gap-4">
          <div className="rounded-2xl glass p-4">
            <div className="text-sm font-bold">Cross-Institution Benchmarking</div>
            <div className="mt-3 space-y-2">
              {institutions.map(inst=>(
                <div key={inst.name} className={`flex items-center gap-3 p-2 rounded-xl ${inst.isYours ? 'bg-sky-500 text-white' : 'bg-white/5'}`}>
                  <span className="flex-1 text-sm font-semibold">{inst.name} {inst.isYours && '• You'}</span>
                  <span className="text-xs font-mono">avg {inst.avg}</span>
                  <div className="w-24 h-2 rounded-full bg-black/10 overflow-hidden"><div className="h-full bg-white" style={{width:`${(inst.avg/900)*100}%`}} /></div>
                </div>
              ))}
            </div>
            <div className="mt-3 text-xs text-white/40">Powered by ClickHouse + Trino over Parquet cold storage. Tenant-isolated, but aggregates anonymized for benchmarking.</div>
          </div>

          <div className="rounded-2xl glass p-4">
            <div className="text-sm font-bold">API Access for Enterprise Hiring Partners</div>
            <div className="mt-3 rounded-xl bg-navy-800 border border-white/10 p-3 font-mono text-xs">
              <div className="text-white/50">API Key (scoped to tenant)</div>
              <div className="mt-1 flex items-center gap-2"><code className="flex-1 bg-black/30 rounded px-2 py-1.5 break-all">{apiKey}</code><button onClick={()=>navigator.clipboard.writeText(apiKey)} className="px-3 py-1.5 rounded-full bg-white text-navy-900 font-bold">Copy</button></div>
              <div className="mt-2 text-white/60">Endpoints: GET /enterprise/candidates?min_score=750 • POST /enterprise/verify • Webhook evaluation.completed (HMAC signed)</div>
            </div>
            <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
              <input value={apiKey} readOnly className="rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-xs font-mono" />
              <button onClick={()=>alert('Verify endpoint tester: POST /enterprise/verify {user_id,hash} → valid:true')} className="px-3 py-2 rounded-xl bg-white text-navy-900 text-xs font-bold">Test Verify</button>
            </div>
            <div className="text-xs text-white/40 mt-2">Keys rotated via Vault, rate-limited at Kong (1000 req/s per key), audit logged to Kafka.</div>
          </div>
        </div>

        <div className="mt-6 rounded-2xl glass p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm font-bold">Bulk Hiring Pipeline</div>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-white/60">Min Score</span>
              <input type="range" min={400} max={900} value={minScore} onChange={e=>setMinScore(Number(e.target.value))} />
              <span className="font-mono font-bold w-10">{minScore}</span>
              <select className="rounded-full bg-white/10 border border-white/10 px-2 py-1"><option>All skills</option><option>Python</option><option>React</option></select>
            </div>
          </div>
          <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {candidates.map(c=>(
              <div key={c.name} className="rounded-2xl bg-white text-navy-900 p-4">
                <div className="flex items-center justify-between"><span className="font-bold text-sm">{c.name}</span><span className="px-2 py-0.5 rounded-full calibiai-gradient text-white text-xs font-bold">{c.score}</span></div>
                <div className="text-xs text-black/60 mt-1">{c.college} • {c.skills.join(', ')}</div>
                <div className="text-xs font-mono mt-2 bg-black/5 rounded px-2 py-1">{c.hash}</div>
                <div className="mt-3 flex gap-2">
                  <button onClick={()=>alert('Verified: '+c.hash+' → valid:true, score:'+c.score)} className="flex-1 py-1.5 rounded-full bg-navy-900 text-white text-xs font-bold">Verify</button>
                  <button onClick={()=>alert('Added to ATS pipeline (webhook to enterprise callback)')} className="flex-1 py-1.5 rounded-full border border-black/10 text-xs font-bold">Add to pipeline</button>
                </div>
              </div>
            ))}
            {candidates.length===0 && <div className="text-sm text-white/50">No candidates ≥ {minScore}</div>}
          </div>
          <div className="mt-3 text-xs text-white/40">{candidates.length} candidates ≥ {minScore} • Pagination cursor-based, sharded query fan-out then merge (avoids scatter-gather via institution filter).</div>
        </div>

        <div className="mt-6 rounded-2xl glass p-4 text-xs">
          <div className="font-bold">Architecture Recap — Enterprise Ready</div>
          <div className="mt-2 text-white/60 leading-relaxed">
            Data residency enforced per institution (list partition). Encryption at rest (AES-256) + in transit (mTLS). Audit 7-year retention in ClickHouse Parquet on MinIO WORM. API gateway enforces tenant isolation; verifiable hashes allow offline verification without exposing DB. Webhooks HMAC-signed; retry with exponential backoff via Redpanda.
          </div>
        </div>
      </main>
    </div>
  )
}
export default function Page(){ return <StoreProvider><Inner/></StoreProvider> }
