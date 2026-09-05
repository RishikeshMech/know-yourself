'use client'
export function Stepper({step}:{step:number}){
  const steps = ['Login','Profile','Resume','WhatsApp','LinkedIn','Confirm','Instructions','Assessment']
  return (
    <div className="glass rounded-2xl px-4 py-3">
      <div className="flex items-center gap-1 overflow-x-auto">
        {steps.map((s,i)=>{
          const done = i+1 < step, current = i+1 === step
          return (
            <div key={s} className="flex items-center gap-1.5 shrink-0">
              <div className={`flex flex-col items-center gap-1 ${current?'animate-pop':''}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  done ? 'bg-emerald-500 text-white shadow-md shadow-emerald-300'
                  : current ? 'calibiai-gradient text-white shadow-lg shadow-indigo-300 scale-110 ring-4 ring-indigo-100'
                  : 'bg-white/70 border border-slate-200 text-slate-400'}`}>
                  {done ? '✓' : i+1}
                </div>
                <span className={`text-[10px] font-medium whitespace-nowrap ${current ? 'text-indigo-600 font-bold' : done ? 'text-emerald-600' : 'text-slate-400'} hidden md:block`}>{s}</span>
              </div>
              {i<steps.length-1 && <div className={`w-4 sm:w-6 h-[2px] rounded-full mb-5 ${i+1<step ? 'bg-emerald-400' : 'bg-slate-200'}`} />}
            </div>
          )
        })}
      </div>
    </div>
  )
}
