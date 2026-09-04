'use client'
export function Stepper({step}:{step:number}){
  const steps = ['Login','Profile','Resume','WhatsApp','LinkedIn','Confirm','Instructions','Assessment']
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto py-2">
      {steps.map((s,i)=>(
        <div key={s} className="flex items-center gap-1.5 shrink-0">
          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${i+1<step ? 'bg-emerald-500 text-white' : i+1===step ? 'calibiai-gradient text-white shadow' : 'bg-white/10 text-white/50'}`}>{i+1}</div>
          <span className={`text-xs ${i+1===step ? 'text-white font-semibold' : 'text-white/50'} hidden sm:inline`}>{s}</span>
          {i<steps.length-1 && <div className={`w-6 h-[2px] ${i+1<step ? 'bg-emerald-500' : 'bg-white/10'}`} />}
        </div>
      ))}
    </div>
  )
}
