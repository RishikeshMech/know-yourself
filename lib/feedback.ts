export const FEEDBACK_PENDING_KEY = 'calibiai_feedback_pending'
export const feedbackOptions = [
  { label: 'Needs work', text: 'The assessment did not meet my expectations. It should be more challenging and better test practical skills.' },
  { label: 'Could be better', text: 'The assessment could be improved with clearer questions and a better balance of difficulty.' },
  { label: 'Pretty good', text: 'The assessment was satisfactory, but there is room for more relevant, practical questions.' },
  { label: 'Really good', text: 'The assessment was good, well structured, and appropriately challenging. A few refinements would make it even better.' },
  { label: 'Up to the mark', text: 'Good assessment, up to the mark. The questions were relevant, well balanced, and a meaningful test of my skills.' },
] as const

export function validFeedback(rating: unknown, message: unknown): boolean {
  return typeof rating === 'number' && Number.isInteger(rating) && rating >= 1 && rating <= 5
    && typeof message === 'string' && message.trim().length >= 10 && message.length <= 1000
}
