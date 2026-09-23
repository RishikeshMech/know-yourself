/**
 * Assessment 1 (the CalibiAI assessment) configuration.
 *
 * Kept in its own module so that importing it never pulls the assessment-2
 * question bank into the /assessment client bundle — a candidate sitting the
 * first test must not be able to read the second test's questions or answers
 * out of the JavaScript they were served.
 */
import type { AssessmentConfig } from './assessmentConfig'
import { readLocal } from './assessmentConfig'
import bank1 from '@/data/questions.json'
import { computeScores } from './scoring'
import { buildReview } from './reviewModel'
import { AFTER_ASSESSMENT_ROUTE } from './nextStep'

export const ASSESSMENT_1: AssessmentConfig = {
  no: 1,
  title: 'CalibiAI Assessment',
  durationSec: 7200,
  stages: [
    { id: 'english', label: 'English Communication', sub: ['Listening', 'Speaking', 'Reading', 'Writing'], min: 15 },
    { id: 'problem', label: 'Problem Solving', sub: [], min: 20 },
    { id: 'debugging', label: 'AI-Assisted Debugging', sub: [], min: 20 },
    { id: 'feature', label: 'AI Feature Development', sub: [], min: 25 },
    { id: 'prompt', label: 'Prompt Engineering', sub: [], min: 15 },
    { id: 'cognitive', label: 'Cognitive Assessment', sub: ['Grid Challenge', 'Logical Reasoning', 'Behavioural'], min: 25 },
  ],
  bank: bank1,
  keys: {
    session: 'calibiai_session',
    answers: (sid) => `calibiai_answers_${sid}`,
    ai: (sid) => `calibiai_ai_${sid}`,
    scores: 'calibiai_scores',
  },
  computeScores,
  buildReview,
  fallbackRoute: () => (readLocal('calibiai_scores') ? AFTER_ASSESSMENT_ROUTE : '/instructions'),
}

