// Mock question banks — deterministic, realistic, used both client and scoring engine

export const englishListening = [
  { id:'EL_L1', audio:'https://cdn.calibiai.local/audio/listening1.mp3', title:'Audio 1 — Client Meeting (42s)', question:'What is the speaker’s primary concern?', options:['Budget overrun','Missed deadline and client impact','Team conflict','Technical debt'], answer:'B', weight:10 },
  { id:'EL_L2', audio:'', title:'Audio 2 — Product Pitch (38s)', question:'Which feature does the speaker emphasize as differentiator?', options:['Speed','Security','AI automation','Price'], answer:'C', weight:10 },
  { id:'EL_L3', audio:'', title:'Audio 3 — Support Call (35s)', question:'What action does the agent promise?', options:['Refund','Escalate to engineering within 2h','Schedule callback tomorrow','Send documentation'], answer:'B', weight:10 },
  { id:'EL_L4', audio:'', title:'Audio 4 — Standup (28s)', question:'What blocker is mentioned?', options:['API rate limit','Database migration','Design approval','Vacation'], answer:'A', weight:10 },
  { id:'EL_L5', audio:'', title:'Audio 5 — Interview (45s)', question:'Which strength does candidate highlight?', options:['Leadership under pressure','Coding speed','Domain expertise','Communication'], answer:'A', weight:10 },
]

export const englishReadingPassage = `The rise of AI-augmented development has shifted hiring signals. Employers no longer screen solely for syntax recall; they screen for the ability to collaborate with models — crafting precise prompts, reviewing generated code, and owning the final output. A recent multi-region study of 12,000 engineers found that those who could debug AI-generated code 30% faster were 2.4x more likely to ship features on time. Yet responsible AI usage — citing sources, checking bias, securing secrets — was the strongest predictor of production incidents (or lack thereof). Institutes that embed these habits early see 18% higher placement stability at 12 months.`

export const englishReading = [
  { id:'EL_R1', question:'According to passage, what is the strongest predictor of production incidents?', options:['Prompt length','Responsible AI usage','Typing speed','Years of experience'], answer:'B' },
  { id:'EL_R2', question:'How much more likely were fast AI-debuggers to ship on time?', options:['1.4x','2.4x','3.1x','1.8x'], answer:'B' },
  { id:'EL_R3', question:'What % higher placement stability did embedding AI habits yield?', options:['8%','12%','18%','24%'], answer:'C' },
  { id:'EL_R4', question:'What has replaced syntax recall as hiring signal?', options:['Degree prestige','Collaboration with models','Whiteboard speed','Certifications'], answer:'B' },
  { id:'EL_R5', question:'Study size?', options:['1,200','5,000','12,000','20,000'], answer:'C' },
]

export const problemSolving = [
  { id:'PS1', q:'If all Bloops are Razzies and some Razzies are Loppies, which is true?', options:['All Bloops are Loppies','Some Bloops are Loppies','Some Loppies are Bloops','None necessarily'], answer:'D' },
  { id:'PS2', q:'Sequence: 2, 6, 12, 20, 30, ?', options:['36','40','42','44'], answer:'C' },
  { id:'PS3', q:'Pseudocode: x=5; for i in 1..3: x=x+i; print x  -> output?', options:['8','11','14','9'], answer:'B' },
  { id:'PS4', q:'A/B test: 12% lift, p=0.04, n=800. Decision?', options:['Ship immediately','Need larger n','Reject','Ignore p'], answer:'A' },
  { id:'PS5', q:'Data: funnel 1000->600->300->120. Biggest drop?', options:['Step1','Step2','Step3','Equal'], answer:'A' },
  { id:'PS6', q:'Cache hit 85%, miss penalty 10x. Avg cost 1 vs 10. Effective cost?', options:['1. 85','2.35','2.15','3.0'], answer:'B' },
  { id:'PS7', q:'If API latency p95 400ms, p50 80ms, what suggests tail issue?', options:['Mean high','P95 far from P50 indicates outliers','Normal','Need more data'], answer:'B' },
  { id:'PS8', q:'Syllogism: No cats are dogs, some pets are cats =>', options:['Some pets are not dogs','All pets are dogs','No pets are dogs','Invalid'], answer:'A' },
  { id:'PS9', q:'Complexity: for i 1..n: for j 1..i: O(?)', options:['O(n)','O(n log n)','O(n²)','O(2^n)'], answer:'C' },
  { id:'PS10', q:'A car travels 60km/h for 30min then 90km/h for 30min. Average?', options:['70','75','80','85'], answer:'B' },
]

export const aiDebugging = [
  {
    id:'AD1',
    title:'Python — Off-by-one in pagination',
    buggy:`def paginate(items, page, size):
    start = page * size
    end = start + size
    return items[start:end]  # page 1 should be first page`,
    prompt:'Fix pagination so page=1 returns first page. Handle edge cases.',
    tests: 4,
  },
  {
    id:'AD2',
    title:'JS — Race condition in cache',
    buggy:`let cache={};
async function get(key, fetcher){
  if(cache[key]) return cache[key];
  const val=await fetcher();
  cache[key]=val;
  return val;
} // concurrent calls fetch twice`,
    prompt:'Fix so concurrent calls for same key deduplicate to one fetch.',
    tests: 4,
  }
]

export const aiFeature = {
  id:'AF1',
  title:'Build rate-limiter: sliding window',
  spec:`Implement function isAllowed(userId): boolean that allows max 5 requests per 60 seconds per user, sliding window. Use in-memory map. Return true if allowed, false if rate-limited. Must expire old entries.`,
  sample:`isAllowed('u1') 5 times -> true; 6th within 60s -> false`,
  tests: 5,
}

export const promptTasks = [
  { id:'PE1', task:'Write a prompt to summarize a 10-page research paper into 3 bullets for a CEO, focusing on business impact, not methodology.', hint:'Include role, constraints, audience' },
  { id:'PE2', task:'Create a prompt to generate Python code for CSV deduplication that handles 10M rows without OOM.', hint:'Specify constraints, memory, libraries' },
  { id:'PE3', task:'Design a prompt to critique an AI-generated business email for tone, bias, and factual accuracy.', hint:'Ask for structured output' },
]

export const cognitiveLogical = [
  { id:'CL1', q:'Grid 3x3 numbers: 2,4,6 / 3,6,9 / 4,8,?', options:['10','11','12','14'], answer:'C' },
  { id:'CL2', q:'If A>B, B>C, C>D, then?', options:['A>D','D>A','A=C','Unknown'], answer:'A' },
  { id:'CL3', q:'Pseudocode loop: s=0; for i=1..4: s+=i*i; print s', options:['20','30','25','14'], answer:'B' },
  { id:'CL4', q:'Which does NOT belong: TCP, UDP, HTTP, IP, FTP', options:['TCP','UDP','HTTP','IP'], answer:'C' },
  { id:'CL5', q:'Probability: 2 dice sum 7 = ?', options:['1/6','1/12','1/9','1/8'], answer:'A' },
  { id:'CL6', q:'Pattern: AB, DE, GH, JK, ?', options:['MN','MP','NO','KL'], answer:'A' },
]

export const behavioralScenarios = [
  { id:'BE1', q:'Teammate misses deadline affecting your work. You:', options:['Escalate immediately','Offer help, re-plan, document risk','Do their work silently','Wait and see'], trait:'teamwork' },
  { id:'BE2', q:'You ship a bug to production. You:', options:['Fix quietly','Own, communicate, postmortem','Blame reviewer','Rollback silently'], trait:'accountability' },
  { id:'BE3', q:'New framework released, project mid-flight. You:', options:['Rewrite immediately','Evaluate, spike, propose tradeoffs','Ignore','Adopt blindly'], trait:'adaptability' },
  { id:'BE4', q:'AI generates plausible but unverified code. You:', options:['Ship as is','Review, test, verify sources','Reject all AI','Trust if tests pass'], trait:'responsible_ai' },
  { id:'BE5', q:'Conflicting priorities from two managers. You:', options:['Pick one','Align, clarify, document decision','Escalate without context','Do both poorly'], trait:'decision_making' },
  { id:'BE6', q:'You lack skill for assigned task. You:', options:['Pretend','Ask mentor, plan learning, deliver incrementally','Decline','Copy solution'], trait:'learning_mindset' },
]
