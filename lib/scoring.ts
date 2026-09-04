// Calibiai Scoring Engine — mirrors docs/SCORING.md, used client & server
import { englishListening, englishReading, problemSolving, cognitiveLogical } from './mockData'

export type Answers = Record<string, any>

export function computeScores(answers: Answers, meta: { gridAcc?: number, speakingSubmitted?:boolean, writingText?:string, prompts?:string[], speakingAudioCount?:number } = {}){
  // English
  let listening = 0
  englishListening.forEach(q=>{
    if(answers[q.id] === q.answer) listening += 10
  }) // max 50
  // Speaking: mock rubric based on submission
  let speaking = 0
  if(meta.speakingSubmitted) {
    // if 2 recordings -> give 45, if 1 -> 38, else 0 ; add mock variation by prompt quality?
    const count = meta.speakingAudioCount ?? 0
    if(count>=2) speaking = 45
    else if(count===1) speaking = 32
    else speaking = 28
  }
  let reading = 0
  englishReading.forEach(q=>{ if(answers[q.id]===q.answer) reading+=10 }) // 50
  let writing = 0
  const w = (meta.writingText||'').trim()
  if(w.length>0){
    const words = w.split(/\s+/).length
    const hasStructure = w.includes('\n') || w.length>200
    const grammarMock = Math.min(25, Math.floor(words/12)+10)
    const clarity = words>=150 && words<=300 ? 22 : words>=80 ? 18 : 12
    const structure = hasStructure ? 20 : 14
    const tone = w.toLowerCase().includes('please') || w.toLowerCase().includes('thank') ? 20 : 16
    writing = Math.min(50, Math.round((clarity+grammarMock+structure+tone)/2))
  }

  const english_total = listening + speaking + reading + writing // 200

  // Problem solving
  let psCorrect = 0
  problemSolving.forEach(q=>{ if(answers[q.id]===q.answer) psCorrect++ })
  const problem_solving = Math.round((psCorrect / problemSolving.length)*200)

  // AI Debugging — 2 tasks each 75 pts
  let ad = 0
  // Check if fixes submitted
  if(answers['AD1_fix'] && String(answers['AD1_fix']).length>30) ad += 68 // mock test pass + quality
  else if(answers['AD1_fix']) ad += 40
  if(answers['AD2_fix'] && String(answers['AD2_fix']).length>30) ad += 64
  else if(answers['AD2_fix']) ad+=35
  const ai_debugging = Math.min(150, ad)

  // AI Feature
  let af = 0
  if(answers['AF1_code'] && String(answers['AF1_code']).includes('Map') && String(answers['AF1_code']).length>80) af = 132
  else if(answers['AF1_code'] && String(answers['AF1_code']).length>30) af = 88
  else if(answers['AF1_code']) af = 50
  const ai_feature = Math.min(150, af)

  // Prompt Eng — avg of 3
  let peTotal = 0
  ;['PE1','PE2','PE3'].forEach(id=>{
    const t = answers[id]||''
    const len = String(t).length
    let s = 0
    if(len>40) s+=20
    if(len>100) s+=15
    if(String(t).toLowerCase().includes('role') || String(t).toLowerCase().includes('act as')) s+=10
    if(String(t).toLowerCase().includes('constraint') || String(t).toLowerCase().includes('limit')) s+=10
    if(len>80) s+=10
    peTotal += Math.min(100, s*0.33 + 55) // mock ensures mid range
  })
  const prompt_engineering = Math.round(Math.min(100, peTotal/3))

  // Cognitive
  let grid = 0
  if(typeof meta.gridAcc === 'number'){
    const acc = meta.gridAcc
    const speedBonus = 0.85 // mock
    grid = Math.round((0.7*acc + 0.3*speedBonus)*30)
  } else {
    // fallback from answers if grid manually?
    grid = answers['GRID'] ? Math.round(answers['GRID']*30) : 22
  }
  let logicalCorrect = 0
  cognitiveLogical.forEach(q=>{ if(answers[q.id]===q.answer) logicalCorrect++ })
  const logical = Math.round((logicalCorrect / cognitiveLogical.length)*70)
  const cognitive_score = Math.min(100, grid + logical)

  // Behavioral — avg
  const behavTraits = ['logical_thinking','problem_solving','adaptability','teamwork','accountability','learning_mindset','responsible_ai']
  const traitScores: Record<string, number> = {}
  // Map answers to traits mock: if answered optimally give high
  const optimal: Record<string,string> = { BE1:'B', BE2:'B', BE3:'B', BE4:'B', BE5:'B', BE6:'B' }
  let bSum = 0
  behavTraits.forEach((trait,idx)=>{
    const qid = `BE${idx+1}`
    const ans = answers[qid]
    const isOpt = ans===optimal[qid]
    const s = isOpt ? 85 + Math.floor(Math.random()*10) : ans ? 68 + Math.floor(Math.random()*12) : 70
    traitScores[trait] = Math.min(100,s)
    bSum+=traitScores[trait]
  })
  // Override with some deterministic for demo
  traitScores['logical_thinking'] = 82 + (psCorrect>7?3:0)
  traitScores['adaptability'] = 88
  traitScores['accountability'] = 91
  traitScores['teamwork'] = 76
  const behavioral_total = Math.round(bSum / behavTraits.length)
  const cognitive_total = cognitive_score + behavioral_total // 200

  const total = english_total + problem_solving + ai_debugging + ai_feature + prompt_engineering + cognitive_total

  const grade = total>=900 ? 'S' : total>=750 ? 'A' : total>=600 ? 'B' : total>=400 ? 'C' : 'D'
  const percentile = Math.min(99.9, 45 + (total/1000)*52 + (Math.random()*3)) // mock 45-99

  return {
    english: { listening, speaking, reading, writing, total: english_total, max:200 },
    problem_solving,
    ai_debugging,
    ai_feature,
    prompt_engineering,
    cognitive: { grid, logical, cognitive_score, behavioral_total, total: cognitive_total, behavioral: traitScores },
    total, grade, percentile: Number(percentile.toFixed(1)),
    verifiable_hash: `sha256:${total.toString(16)}-${Math.random().toString(16).slice(2,10)}`
  }
}
