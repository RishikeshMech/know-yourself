/**
 * Assessment 2 (the Capgemini 2027 mock) configuration.
 *
 * Kept in its own module so the assessment-2 question bank is only ever sent
 * to a candidate who actually opened /assessment2 or /instructions2 — it must
 * never be bundled into the assessment-1 page.
 */
import type { AssessmentConfig } from './assessmentConfig'
import { readLocal } from './assessmentConfig'
import bank2 from '@/data/questions2.json'
import { computeScores2 } from './scoring2'
import { buildReview2 } from './reviewModel2'
import { AFTER_ASSESSMENT_ROUTE } from './nextStep'

export const ASSESSMENT_2: AssessmentConfig = {
  no: 2,
  title: 'Capgemini 2027 Mock',
  durationSec: 7200,
  // The 5 stages of the Capgemini "Assessment Journey":
  //   1 English Communication · 2 Technical Module (AI Literacy) ·
  //   3 Debugging Assessment · 4 AI-assisted Coding · 5 Cognitive Assessment
  stages: [
    { id: 'english', label: 'English Communication', sub: ['Listening', 'Speaking', 'Reading', 'Writing'], min: 30 },
    { id: 'problem', label: 'Technical Module', sub: [], min: 25 },
    { id: 'debugging', label: 'Debugging Assessment', sub: ['Code MCQs', 'Debugging Lab'], min: 25, bankKey: 'debugmcq' },
    { id: 'feature', label: 'AI-assisted Coding', sub: [], min: 20 },
    { id: 'cognitive', label: 'Cognitive Assessment', sub: ['Motion & Grid Challenge', 'Logical Reasoning', 'Behavioural'], min: 20 },
  ],
  bank: bank2,
  keys: {
    session: 'calibiai2_session',
    answers: (sid) => `calibiai2_answers_${sid}`,
    ai: (sid) => `calibiai2_ai_${sid}`,
    scores: 'calibiai2_scores',
  },
  computeScores: computeScores2,
  buildReview: buildReview2,
  // No local assessment-2 session: a finished candidate goes to the dashboard;
  // someone who finished assessment 1 belongs on the assessment-2 instructions;
  // anyone else is routed through the assessment-1 flow (which gates itself).
  fallbackRoute: () =>
    readLocal('calibiai2_scores')
      ? AFTER_ASSESSMENT_ROUTE
      : readLocal('calibiai_scores')
        ? '/instructions2'
        : '/instructions',
}
