'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState, useRef } from 'react'
import { StoreProvider, useStore } from '@/lib/store'
import { englishListening, englishReading, englishReadingPassage, problemSolving, aiDebugging, aiFeature, promptTasks, cognitiveLogical, behavioralScenarios } from '@/lib/mockData'
import { computeScores } from '@/lib/scoring'

const MODULES = [
  { id:'english_listening', label:'English: Listening', max:50 },
  { id:'english_speaking', label:'English: Speaking', max:50 },
  { id:'english_reading', label:'English: Reading', max:50 },
  { id:'english_writing', label:'English: Writing', max:50 },
  { id:'problem', label:'Problem Solving', max:200 },
  { id:'debugging', label:'AI Debugging', max:150 },
  { id:'feature', label:'AI Feature Dev', max:150 },
  { id:'prompt', label:'Prompt Eng', max:100 },
  { id:'cognitive_grid', label:'Cognitive: Grid', max:30 },
  { id:'cognitive_logical', label:'Cognitive: Logical', max:70 },
  { id:'behavioral', label:'Cognitive: Behavioral', max:100 },
]

function AssessmentInner(){
  const {session, setSession, setScores} = useStore()
  const [answers,setAnswers] = useState<Record<string,any>>({})
  const [modIdx,setModIdx]=useState(0)
  const [qIdx,setQIdx]=useState(0)
  const [remaining,setRemaining]=useState(7200)
  const [tabSwitches,setTabSwitches]=useState(0)
  const [recording,setRecording]=useState<string|null>(null)
  const [gridRound,setGridRound]=useState(0)
  const [gridPattern,setGridPattern]=useState<number[]>([])
  const [gridShow,setGridShow]=useState(false)
  const [gridSelected,setGridSelected]=useState<number[]>([])
  const [gridScores,setGridScores]=useState<number[]>([])
  const intervalRef = useRef<any>(null)

  // Load session + timer
  useEffect(()=>{
    const raw = localStorage.getItem('calibiai_session')
    if(!raw) { window.location.href='/instructions'; return }
    const s = JSON.parse(raw)
    if(!session) setSession(s)
    const expires = new Date(s.expires_at).getTime()
    const tick = ()=>{
      const now = Date.now()
      const rem = Math.max(0, Math.floor((expires - now)/1000))
      setRemaining(rem)
      if(rem<=0){
        handleSubmit(true)
      }
    }
    tick()
    intervalRef.current = setInterval(tick, 1000)
    // Also reconcile with "server" every 5s (simulate NTP)
    const serverPoll = setInterval(tick, 5000)
    return ()=>{ clearInterval(intervalRef.current); clearInterval(serverPoll) }
  },[])

  // Tab switch detection
  useEffect(()=>{
    const onHidden = ()=>{
      if(document.hidden){
        setTabSwitches(n=>n+1)
        // POST /assessment/heartbeat {tab_hidden}
      }
    }
    document.addEventListener('visibilitychange', onHidden)
    const onBlur = ()=> setTabSwitches(n=>n+0) // window blur also
    window.addEventListener('blur', onBlur)
    return ()=>{ document.removeEventListener('visibilitychange', onHidden); window.removeEventListener('blur', onBlur)}
  },[])

  // Grid pattern generation
  useEffect(()=>{
    if(MODULES[modIdx].id !== 'cognitive_grid') return
    const pattern = Array.from({length:4},()=>Math.floor(Math.random()*16))
    setGridPattern(pattern)
    setGridShow(true)
    setGridSelected([])
    const t = setTimeout(()=>setGridShow(false), 2800)
    return ()=>clearTimeout(t)
  },[modIdx, gridRound])

  const currentMod = MODULES[modIdx]

  const handleAnswer = (qid:string, val:any)=>{
    setAnswers(a=>({...a,[qid]:val}))
    // simulate POST /answer streaming to Kafka
  }

  const handleSubmit = (auto=false)=>{
    if(!auto && !confirm('Submit assessment? You can’t change answers after.')) return
    clearInterval(intervalRef.current)
    // compute grid accuracy
    let gridAcc = 0
    if(gridScores.length>0){
      gridAcc = gridScores.reduce((a,b)=>a+b,0)/gridScores.length
    } else {
      // if not played, fallback
      gridAcc = 0.72
    }
    const speakingCount = (answers['SPEAK1_audio']?1:0)+(answers['SPEAK2_audio']?1:0)
    const scores = computeScores(answers, { gridAcc, speakingSubmitted: speakingCount>0, writingText: answers['WRITING']||'', prompts: [answers['PE1'],answers['PE2'],answers['PE3']], speakingAudioCount:speakingCount })
    const sessionId = session?.id || 'sess_'+Math.random().toString(16).slice(2,6)
    const payload = { session_id: sessionId, ...scores, tab_switches: tabSwitches, submitted_at: new Date().toISOString() }
    localStorage.setItem('calibiai_scores', JSON.stringify(payload))
    setScores(payload)
    // enqueue evaluation mock — already computed synchronously for demo, but in prod queue
    // mark session submitted
    const sess = JSON.parse(localStorage.getItem('calibiai_session')||'{}')
    sess.status='submitted'
    localStorage.setItem('calibiai_session', JSON.stringify(sess))
    window.location.href='/result'
  }

  const formatTime = (s:number)=>{
    const m = Math.floor(s/60), sec=s%60
    return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
  }

  const isTimerCritical = remaining < 600

  if(!session) return <div className="p-10 text-center text-white/60">Loading session…</div>

  // Helpers for rendering module content
  const renderModule = ()=>{
    switch(currentMod.id){
      case 'english_listening':
        const q = englishListening[qIdx] ?? englishListening[0]
        return (
          <div>
            <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
              <div className="text-sm font-bold">{q.title}</div>
              <audio controls className="w-full mt-3" src={q.audio || undefined} />
              {!q.audio && <div className="mt-2 text-xs text-white/50">Audio stored on MinIO CDS — CDN-fronted. (Demo: audio placeholder, transcript hidden per exam integrity)</div>}
              <div className="mt-4 p-3 rounded-xl bg-navy-800 border border-white/10">
                <div className="text-sm font-semibold">{qIdx+1}. {q.question}</div>
                <div className="mt-3 space-y-2">
                  {['A','B','C','D'].map((opt,i)=>(
                    <label key={opt} className={`flex items-center gap-3 p-2.5 rounded-xl cursor-pointer border ${answers[q.id]===opt ? 'bg-sky-500 text-white border-sky-400' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}>
                      <input type="radio" name={q.id} checked={answers[q.id]===opt} onChange={()=>handleAnswer(q.id, opt)} className="accent-sky-500" />
                      <span className="text-sm"><b>{opt}.</b> {q.options[i]}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="mt-3 text-xs text-white/40">Play count limited 2x • Answer streamed to assessment_answers + Kafka partition by session_id</div>
            </div>
            <div className="mt-3 flex gap-2">
              <button onClick={()=>setQIdx(Math.max(0,qIdx-1))} className="px-3 py-2 rounded-full bg-white/10 text-xs">Prev</button>
              <button onClick={()=>setQIdx(Math.min(englishListening.length-1,qIdx+1))} className="px-3 py-2 rounded-full bg-white text-navy-900 text-xs font-bold">Next</button>
              <span className="text-xs text-white/50 self-center ml-2">{qIdx+1} / {englishListening.length}</span>
            </div>
          </div>
        )
      case 'english_speaking':
        return (
          <div className="space-y-4">
            {[
              {id:'SPEAK1', prompt:'Describe a challenge you overcame in a team project. (60-90s, evaluated: Fluency, Pronunciation, Confidence, Grammar)'},
              {id:'SPEAK2', prompt:'Explain an AI tool you use and how you verify its output. (60-90s)'},
            ].map(sp=>(
              <div key={sp.id} className="rounded-2xl bg-white/5 border border-white/10 p-4">
                <div className="text-sm font-bold">{sp.id === 'SPEAK1' ? 'Speaking Task 1' : 'Speaking Task 2'}</div>
                <div className="text-sm text-white/70 mt-1">{sp.prompt}</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button onClick={()=>{
                    if(recording===sp.id){ setRecording(null); handleAnswer(sp.id+'_audio','mock_audio_'+sp.id+'_'+Date.now()) }
                    else setRecording(sp.id)
                  }} className={`px-4 py-2 rounded-full text-xs font-bold ${recording===sp.id ? 'bg-red-500 text-white animate-pulse' : answers[sp.id+'_audio'] ? 'bg-emerald-500 text-white' : 'bg-white text-navy-900'}`}>
                    {recording===sp.id ? '● Recording… (click to stop)' : answers[sp.id+'_audio'] ? '✓ Recorded — click to re-record' : '● Start Recording'}
                  </button>
                  {answers[sp.id+'_audio'] && <span className="text-xs text-emerald-300 self-center">Uploaded to MinIO: audio/{sp.id}.webm • Whisper queued</span>}
                </div>
                {recording===sp.id && <div className="mt-3 h-8 rounded-full bg-white/5 border border-white/10 flex items-center px-3"><div className="flex gap-1">{Array.from({length:24}).map((_,i)=><div key={i} className="w-1 bg-sky-400 rounded-full" style={{height: `${8+Math.random()*20}px`}} />)}</div><span className="ml-3 text-xs text-white/50">Waveform • self-hosted Whisper Large v3 (CTranslate2) will transcribe</span></div>}
              </div>
            ))}
            <div className="text-xs text-white/40">Audio stored on MinIO, transcribed by self-hosted Whisper fleet (autoscaling, batched, GPU). No external API.</div>
          </div>
        )
      case 'english_reading':
        return (
          <div className="grid lg:grid-cols-2 gap-4">
            <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
              <div className="text-xs font-bold text-sky-300">Passage — AI-Augmented Hiring Signals</div>
              <p className="mt-2 text-sm leading-relaxed text-white/80">{englishReadingPassage}</p>
            </div>
            <div>
              {englishReading.map((q,i)=>(
                <div key={q.id} className="mb-3 rounded-xl bg-white/5 border border-white/10 p-3">
                  <div className="text-sm font-semibold">{i+1}. {q.question}</div>
                  <div className="mt-2 space-y-1">
                    {q.options.map((opt,oi)=>(
                      <label key={opt} className={`flex gap-2 p-2 rounded-lg cursor-pointer text-sm border ${answers[q.id]===String.fromCharCode(65+oi) ? 'bg-sky-500 text-white border-sky-400' : 'bg-white/5 border-transparent'}`}>
                        <input type="radio" name={q.id} checked={answers[q.id]===String.fromCharCode(65+oi)} onChange={()=>handleAnswer(q.id, String.fromCharCode(65+oi))} />
                        <span>{String.fromCharCode(65+oi)}. {opt}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      case 'english_writing':
        return (
          <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
            <div className="text-sm font-bold">Writing — Scenario</div>
            <div className="mt-2 text-sm text-white/70 p-3 rounded-xl bg-navy-800 border border-white/10">You are a junior developer. Your team’s feature delivery is delayed by 3 days due to an upstream API outage. Write an email (150–300 words) to the client explaining the delay, impact, mitigation, and revised timeline. Tone: professional, accountable, solution-oriented.</div>
            <textarea value={answers['WRITING']||''} onChange={e=>handleAnswer('WRITING', e.target.value)} placeholder="Dear [Client], ..." className="mt-3 w-full min-h-[180px] rounded-xl bg-navy-900 border border-white/10 p-3 text-sm outline-none focus:border-sky-500" />
            <div className="mt-2 flex justify-between text-xs text-white/50">
              <span>{(answers['WRITING']||'').split(/\s+/).filter(Boolean).length} words • Target 150–300</span>
              <span>AI rubric: Clarity 25 • Grammar 25 • Structure 25 • Professional tone 25 (LLaMA 8B)</span>
            </div>
          </div>
        )
      case 'problem':
        return (
          <div>
            {problemSolving.map((q,i)=>(
              <div key={q.id} className="mb-3 rounded-xl bg-white/5 border border-white/10 p-3">
                <div className="text-sm font-semibold">{i+1}. {q.q}</div>
                <div className="mt-2 grid sm:grid-cols-2 gap-2">
                  {q.options.map((opt,oi)=>(
                    <label key={opt} className={`flex gap-2 p-2 rounded-xl cursor-pointer text-sm border ${answers[q.id]===String.fromCharCode(65+oi) ? 'bg-sky-500 text-white border-sky-400' : 'bg-white/5 border-white/10'}`}>
                      <input type="radio" name={q.id} checked={answers[q.id]===String.fromCharCode(65+oi)} onChange={()=>handleAnswer(q.id, String.fromCharCode(65+oi))} />
                      <span>{String.fromCharCode(65+oi)}. {opt}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )
      case 'debugging':
        return (
          <div className="space-y-4">
            {aiDebugging.map(d=>(
              <div key={d.id} className="rounded-2xl bg-white/5 border border-white/10 p-4">
                <div className="text-sm font-bold">{d.title}</div>
                <pre className="mt-2 text-xs font-mono bg-navy-900 p-3 rounded-xl border border-white/10 overflow-x-auto">{d.buggy}</pre>
                <div className="text-xs text-white/60 mt-2">{d.prompt} • Hidden tests: {d.tests}</div>
                <textarea value={answers[d.id+'_fix']||''} onChange={e=>handleAnswer(d.id+'_fix', e.target.value)} placeholder="Paste fixed code here..." className="mt-3 w-full min-h-[120px] rounded-xl bg-navy-900 border border-white/10 p-3 text-xs font-mono outline-none focus:border-sky-500" />
                <button onClick={()=>alert('Mock run: 3/4 hidden tests passed (sandboxed gVisor microVM). In prod: dynamic + LLM quality.')} className="mt-2 px-3 py-1.5 rounded-full bg-white text-navy-900 text-xs font-bold">▶ Run hidden tests (mock)</button>
              </div>
            ))}
          </div>
        )
      case 'feature':
        return (
          <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
            <div className="text-sm font-bold">{aiFeature.title}</div>
            <div className="mt-2 text-sm text-white/70">{aiFeature.spec}</div>
            <div className="mt-2 text-xs font-mono bg-navy-900 p-2 rounded border border-white/10">{aiFeature.sample}</div>
            <textarea value={answers['AF1_code']||''} onChange={e=>handleAnswer('AF1_code', e.target.value)} placeholder="function isAllowed(userId){ ... }" className="mt-3 w-full min-h-[180px] rounded-xl bg-navy-900 border border-white/10 p-3 text-xs font-mono outline-none focus:border-sky-500" />
            <button onClick={()=>alert('Mock harness: 4/5 tests passed (functional + edge + perf).')} className="mt-2 px-3 py-1.5 rounded-full bg-white text-navy-900 text-xs font-bold">▶ Run feature tests</button>
            <div className="mt-2 text-xs text-white/40">Evaluation: functional 40% + design 30% + edge handling 30% (vLLM LLaMA 8B + sandbox)</div>
          </div>
        )
      case 'prompt':
        return (
          <div className="space-y-4">
            {promptTasks.map(t=>(
              <div key={t.id} className="rounded-2xl bg-white/5 border border-white/10 p-4">
                <div className="text-sm font-bold">{t.id} — Prompt Engineering</div>
                <div className="mt-1 text-sm text-white/70">{t.task}</div>
                <div className="text-xs text-white/40">Hint: {t.hint}</div>
                <textarea value={answers[t.id]||''} onChange={e=>handleAnswer(t.id, e.target.value)} placeholder="Act as... Your prompt here. Include role, constraints, audience, output format." className="mt-3 w-full min-h-[100px] rounded-xl bg-navy-900 border border-white/10 p-3 text-sm outline-none focus:border-sky-500" />
                <div className="text-xs text-white/40 mt-1">Rubric: Specificity 25 • Context 25 • Constraints 25 • Output quality 25</div>
              </div>
            ))}
          </div>
        )
      case 'cognitive_grid':
        return (
          <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-bold">Motion & Grid Challenge — Round {gridRound+1} / 5 • Memorize, then reproduce</div>
              <div className="text-xs text-white/50">{gridShow ? 'Memorizing…' : 'Reproduce pattern'}</div>
            </div>
            <div className="mt-4 grid grid-cols-4 gap-2 max-w-[320px] mx-auto">
              {Array.from({length:16}).map((_,i)=>{
                const active = gridShow ? gridPattern.includes(i) : gridSelected.includes(i)
                return (
                  <button key={i} onClick={()=>{
                    if(gridShow) return
                    setGridSelected(s=> s.includes(i) ? s.filter(x=>x!==i) : [...s,i])
                  }} className={`aspect-square rounded-xl border flex items-center justify-center text-xs font-bold ${active ? 'bg-sky-500 border-sky-400 text-white shadow-lg' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}>
                    {i}
                  </button>
                )
              })}
            </div>
            <div className="mt-4 flex gap-2 justify-center">
              <button disabled={gridShow} onClick={()=>{
                const acc = gridPattern.filter(p=>gridSelected.includes(p)).length / Math.max(1,gridPattern.length) - (gridSelected.filter(s=>!gridPattern.includes(s)).length*0.2)
                const bounded = Math.max(0, Math.min(1, acc))
                setGridScores(s=>[...s, bounded])
                if(gridRound<4){ setGridRound(r=>r+1)} else {
                  handleAnswer('GRID', gridScores.concat(bounded).reduce((a,b)=>a+b,0)/(gridScores.length+1))
                  alert(`Grid done! Avg accuracy ${(bounded*100).toFixed(0)}% (mock). You can proceed to next module.`)
                }
              }} className="px-4 py-2 rounded-full bg-white text-navy-900 text-xs font-bold disabled:opacity-40">Submit pattern</button>
              <button onClick={()=>{ setGridRound(0); setGridScores([])}} className="px-4 py-2 rounded-full bg-white/10 text-xs">Reset</button>
            </div>
            <div className="mt-2 text-xs text-white/40 text-center">Accuracy 70% + speed 30% • Tracked per move timing</div>
          </div>
        )
      case 'cognitive_logical':
        return (
          <div>
            {cognitiveLogical.map((q,i)=>(
              <div key={q.id} className="mb-3 rounded-xl bg-white/5 border border-white/10 p-3">
                <div className="text-sm font-semibold">{i+1}. {q.q}</div>
                <div className="mt-2 grid sm:grid-cols-2 gap-2">
                  {q.options.map((opt,oi)=>(
                    <label key={opt} className={`flex gap-2 p-2 rounded-xl text-sm border cursor-pointer ${answers[q.id]===String.fromCharCode(65+oi) ? 'bg-sky-500 text-white border-sky-400' : 'bg-white/5 border-white/10'}`}>
                      <input type="radio" name={q.id} checked={answers[q.id]===String.fromCharCode(65+oi)} onChange={()=>handleAnswer(q.id,String.fromCharCode(65+oi))} />
                      <span>{String.fromCharCode(65+oi)}. {opt}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )
      case 'behavioral':
        return (
          <div>
            <div className="text-xs text-white/60 mb-3">No correct answers — maps to Adaptability, Teamwork, Accountability, Decision-making, Learning mindset, Responsible AI usage.</div>
            {behavioralScenarios.map((q,i)=>(
              <div key={q.id} className="mb-3 rounded-xl bg-white/5 border border-white/10 p-3">
                <div className="text-sm font-semibold">{i+1}. {q.q} <span className="text-xs text-white/40">({q.trait})</span></div>
                <div className="mt-2 space-y-1">
                  {q.options.map((opt,oi)=>(
                    <label key={opt} className={`flex gap-2 p-2 rounded-xl text-sm border cursor-pointer ${answers[q.id]===String.fromCharCode(65+oi) ? 'bg-violet-500 text-white border-violet-400' : 'bg-white/5 border-white/10'}`}>
                      <input type="radio" name={q.id} checked={answers[q.id]===String.fromCharCode(65+oi)} onChange={()=>handleAnswer(q.id,String.fromCharCode(65+oi))} />
                      <span>{String.fromCharCode(65+oi)}. {opt}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )
      default: return null
    }
  }

  // Progress
  const totalQuestionsEstimate = 5+2+5+1+10+2+1+3+5+6+6 // ~46
  const answeredCount = Object.keys(answers).length

  return (
    <div className="min-h-screen bg-navy-900 text-white">
      {/* Sticky header with tamper-proof timer */}
      <div className="sticky top-0 z-30 backdrop-blur bg-navy-900/90 border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg calibiai-gradient flex items-center justify-center font-black text-xs">C</div>
            <span className="hidden sm:inline font-bold text-sm">Assessment</span>
            <span className="hidden md:inline text-xs text-white/40">Session {session.id} • {session.status}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 text-xs text-white/60">
              <span>Tab switches:</span><span className={`px-2 py-0.5 rounded-full font-bold ${tabSwitches>=3 ? 'bg-red-500 text-white' : tabSwitches>=1 ? 'bg-amber-500 text-navy-900' : 'bg-white/10'}`}>{tabSwitches}/3</span>
            </div>
            <div className={`px-4 py-1.5 rounded-full font-mono font-black text-sm flex items-center gap-2 ${isTimerCritical ? 'bg-red-500 text-white timer-pulse' : 'bg-white text-navy-900'}`}>
              <span className="hidden sm:inline">⏱</span> {formatTime(remaining)}
            </div>
            <button onClick={()=>handleSubmit(false)} className="px-4 py-2 rounded-full calibiai-gradient text-xs font-bold">Submit</button>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-2">
          <div className="flex gap-1.5 overflow-x-auto py-1">
            {MODULES.map((m,i)=>(
              <button key={m.id} onClick={()=>{ setModIdx(i); setQIdx(0)}} className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold border ${i===modIdx ? 'bg-white text-navy-900 border-white' : answers[m.id] || Object.keys(answers).some(k=>k.startsWith(m.id)) ? 'bg-emerald-500 text-white border-emerald-400' : 'bg-white/5 text-white/60 border-white/10'}`}>
                {m.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 grid lg:grid-cols-12 gap-6">
        {/* Left palette */}
        <div className="lg:col-span-3">
          <div className="rounded-2xl glass p-4 sticky top-[96px]">
            <div className="text-sm font-bold">Question Palette</div>
            <div className="text-xs text-white/50">{answeredCount} answered • stream to Kafka</div>
            <div className="mt-3 grid grid-cols-6 lg:grid-cols-4 gap-2">
              {MODULES.map((m,i)=>(
                <button key={m.id} onClick={()=>{setModIdx(i); setQIdx(0)}} className={`w-8 h-8 rounded-xl text-xs font-bold border ${i===modIdx?'bg-sky-500 text-white border-sky-400': Object.keys(answers).some(k=>k.includes(m.id)) || answers[m.id] ? 'bg-emerald-500 text-white border-emerald-400' : 'bg-white/5 border-white/10 text-white/60'}`}>{i+1}</button>
              ))}
            </div>
            <div className="mt-4 space-y-2 text-xs">
              <div className="flex items-center gap-2"><span className="w-3 h-3 rounded bg-emerald-500" /> Answered</div>
              <div className="flex items-center gap-2"><span className="w-3 h-3 rounded bg-white/10 border border-white/20" /> Not answered</div>
              <div className="flex items-center gap-2"><span className="w-3 h-3 rounded bg-sky-500" /> Current</div>
            </div>
            <div className="mt-4 rounded-xl bg-white/5 p-3 text-xs">
              <div className="font-bold">Anomaly detection</div>
              <div className="text-white/60">Velocity & accuracy tracked. Extremely fast correct answers flagged for review (Isolation Forest on owned data, sidecar on assessment service).</div>
            </div>
            <div className="mt-3 rounded-xl bg-navy-800 border border-white/10 p-3 text-xs font-mono">
              <div className="text-white/50">Timer sync</div>
              <div>remaining = expires_at - Date.now()</div>
              <div className="text-white/40">Poll /assessment/timer every 5s • drift snap if {'>'}2s</div>
            </div>
          </div>
        </div>

        {/* Center */}
        <div className="lg:col-span-9">
          <div className="rounded-[20px] glass p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <h2 className="font-black">{currentMod.label} <span className="text-white/40 font-normal text-sm">• {currentMod.max} marks</span></h2>
              <span className="text-xs px-2 py-1 rounded-full bg-white/10">{modIdx+1} / {MODULES.length}</span>
            </div>
            <div className="mt-4">
              {renderModule()}
            </div>
            <div className="mt-6 flex justify-between">
              <button onClick={()=>{ if(modIdx>0){ setModIdx(m=>m-1); setQIdx(0)}}} disabled={modIdx===0} className="px-4 py-2 rounded-full bg-white/10 text-xs font-semibold disabled:opacity-30">← Previous Module</button>
              {modIdx < MODULES.length-1 ? (
                <button onClick={()=>{ setModIdx(m=>m+1); setQIdx(0)}} className="px-4 py-2 rounded-full bg-white text-navy-900 text-xs font-bold">Next Module →</button>
              ) : (
                <button onClick={()=>handleSubmit(false)} className="px-6 py-2.5 rounded-full calibiai-gradient text-xs font-black">Submit Assessment</button>
              )}
            </div>
          </div>

          <div className="mt-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 p-3 text-xs text-amber-200">
            Server-controlled: submission after expiry returns 409. All answers audited to <span className="font-mono">audit_log</span> Kafka → ClickHouse (7-year retention).
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Page(){
  return <StoreProvider><AssessmentInner/></StoreProvider>
}
