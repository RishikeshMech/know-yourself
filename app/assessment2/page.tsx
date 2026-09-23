'use client'
export const dynamic = 'force-dynamic'
import { AssessmentRunner } from '@/components/AssessmentRunner'
import { ASSESSMENT_2 } from '@/lib/assessment2Config'

/**
 * Assessment 2 — the Capgemini 2027 mock test.
 *
 * Runs on exactly the same engine as assessment 1 (`AssessmentRunner`), so it
 * inherits fullscreen proctoring, the external-display check, focus warnings,
 * the in-built compiler with hidden tests and the in-exam AI assistant. Only
 * the question bank, stages, duration, storage keys and scoring differ.
 *
 * Access is gated: `/instructions2` only lets a candidate start once
 * assessment 1 has been completed, and the runner bounces anyone who arrives
 * here without a valid assessment-2 session (see ASSESSMENT_2.fallbackRoute).
 */
export default function Page() {
  return <AssessmentRunner config={ASSESSMENT_2} />
}
