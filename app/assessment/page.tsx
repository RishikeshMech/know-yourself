'use client'
export const dynamic = 'force-dynamic'
import { AssessmentRunner } from '@/components/AssessmentRunner'
import { ASSESSMENT_1 } from '@/lib/assessment1Config'

/**
 * Assessment 1 — the CalibiAI 120-minute assessment.
 *
 * All exam behaviour (fullscreen lock, external-display and focus proctoring,
 * camera/mic gate, autosave, in-built compiler, in-exam AI assistant, review
 * page and auto-submit) lives in the shared `AssessmentRunner`, which the
 * second assessment reuses unchanged.
 */
export default function Page() {
  return <AssessmentRunner config={ASSESSMENT_1} />
}
