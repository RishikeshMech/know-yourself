import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
import { computeScores } from '../lib/scoring.ts'
import { computeScores2 } from '../lib/scoring2.ts'
import { persistAssessmentSubmission, toUuid } from '../lib/persist.ts'

function loadEnv() {
  for (const file of ['.env.local', '.env']) {
    const full = path.join(process.cwd(), file)
    if (!fs.existsSync(full)) continue
    for (const line of fs.readFileSync(full, 'utf-8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i)
      if (!m) continue
      const key = m[1]
      let value = m[2].trim().replace(/^["']|["']$/g, '')
      if (process.env[key] === undefined) process.env[key] = value
    }
  }
}

async function main() {
  loadEnv()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  const sb = createClient(url, key, { auth: { persistSession: false } })

  const { data: sessions, error } = await sb
    .from('assessment_sessions')
    .select('*')
    .order('started_at', { ascending: false })

  if (error) {
    console.error('Error fetching sessions:', error)
    process.exit(1)
  }

  console.log(`Checking ${sessions?.length || 0} total sessions in Supabase...`)

  let recovered = 0
  for (const s of sessions || []) {
    const { data: existingResults } = await sb
      .from('assessment_results')
      .select('id')
      .eq('session_id', s.id)
      .limit(1)

    if (existingResults && existingResults.length > 0) continue

    const isExpired = s.status === 'expired' || (s.expires_at && new Date(s.expires_at).getTime() <= Date.now())
    const isSubmitted = s.status === 'submitted' || !!s.submitted_at
    if (!isExpired && !isSubmitted) {
      console.log(`Session ${s.id} for student ${s.student_id} is still in progress. Skipping.`)
      continue
    }

    const answers = (s.answers && typeof s.answers === 'object') ? s.answers : {}
    const ansCount = Object.keys(answers).length
    const assessmentNo = Number(s.assessment_no || 1) === 2 ? 2 : 1

    console.log(`Recovering session ${s.id} (student: ${s.student_id}, ansCount: ${ansCount}, assessmentNo: ${assessmentNo})...`)

    const scores = assessmentNo === 2
      ? computeScores2(answers, {}, {})
      : computeScores(answers, {}, {})

    const now = new Date().toISOString()
    const finalSession = {
      ...s,
      status: isSubmitted ? 'submitted' : 'expired',
      submitted_at: s.submitted_at || s.expires_at || now,
    }

    const finalResult = {
      id: toUuid(`assessment-result:${s.id}`, 'result'),
      session_id: s.id,
      student_id: s.student_id,
      scores,
      total: Number(scores.total) || 0,
      grade: scores.grade || 'D',
      percentile: Number(scores.percentile) || 0,
      verifiable_hash: scores.verifiable_hash || '',
      ai_feedback: {},
      assessment_no: assessmentNo,
      created_at: s.submitted_at || s.expires_at || now,
    }

    const outcome = await persistAssessmentSubmission(sb, finalSession, finalResult)
    if (outcome.ok) {
      console.log(`  ✓ Recovered! Score: ${scores.total}/1000, Grade: ${scores.grade}`)
      recovered++
    } else {
      console.error(`  ✗ Failed to recover session ${s.id}:`, outcome.message)
    }
  }

  console.log(`\nReconciliation finished: ${recovered} sessions successfully recovered and saved to assessment_results.`)
}

main().catch(console.error)
