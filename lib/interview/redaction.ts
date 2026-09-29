/**
 * AI Mock Interview — Privacy Redaction, Prompt-Injection Defence & Safety
 *
 * Implements:
 *   - Guideline G9 & FR-05: Redact personal identifiers (emails, phones, PRNs,
 *     Aadhaar/PAN, social profile URLs) before sending text to DeepSeek API.
 *   - FR-61 & Section 10.5: Detect and neutralise prompt-injection attempts;
 *     wrap student answers in <student_answer> data delimiters.
 *   - FR-62 & Guideline G10: Content safety filter for abusive / unsafe input.
 */

export interface RedactionResult {
  redacted: string
  redactedCount: number
  categories: string[]
}

const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g
const PHONE_RE = /(?:\+?\d{1,3}[\s.-]?)?(?:\(\d{2,5}\)[\s.-]?)?[6-9]\d{9}\b|\b\d{3}[\s.-]\d{3}[\s.-]\d{4}\b/g
const AADHAAR_RE = /\b\d{4}[\s-]\d{4}[\s-]\d{4}\b/g
const PAN_RE = /\b[A-Z]{5}\d{4}[A-Z]\b/g
const PRN_RE = /\b(?:PRN|Roll\s*No\.?|Reg(?:istration)?\s*No\.?)[\s:-]*[A-Za-z0-9-]{5,20}\b/gi
const SOCIAL_URL_RE = /\bhttps?:\/\/(?:www\.)?(?:linkedin\.com|github\.com|instagram\.com|twitter\.com|x\.com)\/[^\s,;)]+/gi

/**
 * Redact personal identifiers from student resume text, project descriptions,
 * or answers before sending to an external LLM.
 */
export function redactPii(input: string): RedactionResult {
  let text = String(input || '')
  let count = 0
  const cats = new Set<string>()

  const replaceCount = (re: RegExp, replacement: string, cat: string) => {
    text = text.replace(re, () => {
      count++
      cats.add(cat)
      return replacement
    })
  }

  replaceCount(EMAIL_RE, '[EMAIL_REDACTED]', 'email')
  replaceCount(SOCIAL_URL_RE, '[PROFILE_URL_REDACTED]', 'social_url')
  replaceCount(AADHAAR_RE, '[ID_REDACTED]', 'gov_id')
  replaceCount(PAN_RE, '[PAN_REDACTED]', 'gov_id')
  replaceCount(PRN_RE, 'PRN: [PRN_REDACTED]', 'prn')
  replaceCount(PHONE_RE, '[PHONE_REDACTED]', 'phone')

  return {
    redacted: text,
    redactedCount: count,
    categories: [...cats],
  }
}

export interface InjectionScanResult {
  detected: boolean
  reasons: string[]
  sanitized: string
}

const INJECTION_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  {
    re: /ignore\s+(?:all\s+|your\s+|previous\s+|prior\s+|above\s+)*(?:instructions|rules|prompts|system|rubric)/i,
    reason: 'Attempted instruction override ("ignore instructions")',
  },
  {
    re: /(?:give|assign|award|set|output|return)\s+(?:me\s+|my\s+score\s+|a\s+score\s+of\s+)*(?:5\s*\/\s*5|100\s*\/\s*100|full\s+marks|maximum\s+score|perfect\s+score|"score"\s*:\s*5)/i,
    reason: 'Attempted score manipulation ("give me 5/5")',
  },
  {
    re: /(?:reveal|show|print|tell\s+me|output|leak)\s+(?:the\s+|your\s+)*(?:reference\s+answer|key_points|key\s+points|system\s+prompt|hidden\s+rubric|model\s+answer)/i,
    reason: 'Attempted extraction of hidden reference answer or system prompt',
  },
  {
    re: /<\/?\s*(?:student_answer|system|instructions|rubric|key_points)\s*>/i,
    reason: 'Attempted XML delimiter breakout',
  },
  {
    re: /you\s+are\s+now\s+(?:in\s+developer\s+mode|dan\b|an?\s+unrestricted|no\s+longer\s+an?\s+interviewer)/i,
    reason: 'Attempted persona / jailbreak override',
  },
]

/**
 * Scan student input for prompt-injection attempts and neutralise any XML
 * delimiter tags so `<student_answer>` boundaries can never be escaped.
 */
export function scanAndSanitizeStudentInput(raw: string): InjectionScanResult {
  const text = String(raw || '').slice(0, 8000)
  const reasons: string[] = []

  for (const { re, reason } of INJECTION_PATTERNS) {
    if (re.test(text)) reasons.push(reason)
  }

  // Neutralise angle-bracket delimiter tags that could break <student_answer>
  const sanitized = text
    .replace(/<\s*\/?\s*student_answer\s*>/gi, '[delimiter]')
    .replace(/<\s*\/?\s*system\s*>/gi, '[system]')
    .replace(/<\s*\/?\s*key_points\s*>/gi, '[key_points]')

  return {
    detected: reasons.length > 0,
    reasons,
    sanitized,
  }
}

/**
 * Wrap sanitized & PII-redacted student text inside `<student_answer>` tags
 * per Section 10.5 & 10.6.
 */
export function wrapStudentAnswerDelimiter(raw: string): {
  delimited: string
  sanitized: string
  injection: InjectionScanResult
  redaction: RedactionResult
} {
  const injection = scanAndSanitizeStudentInput(raw)
  const redaction = redactPii(injection.sanitized)
  return {
    delimited: `<student_answer>\n${redaction.redacted}\n</student_answer>`,
    sanitized: redaction.redacted,
    injection,
    redaction,
  }
}

const ABUSIVE_RE = /\b(?:fuck\s+you|bitch|asshole|bastard|idiot\s+ai|kill\s+yourself|stfu|motherfucker|chutiya|madarchod|bhenchod)\b/i

export interface SafetyCheckResult {
  safe: boolean
  abusive: boolean
  offTopic: boolean
  reason?: string
}

/**
 * Content safety check on student input (FR-62, Guideline G10).
 */
export function checkContentSafety(raw: string): SafetyCheckResult {
  const text = String(raw || '').trim()
  if (ABUSIVE_RE.test(text)) {
    return {
      safe: false,
      abusive: true,
      offTopic: false,
      reason: 'Abusive or inappropriate language detected.',
    }
  }
  if (/\b(?:write\s+my\s+essay|hack\s+into|ddos|steal\s+passwords|horoscope|betting\s+tips)\b/i.test(text)) {
    return {
      safe: false,
      abusive: false,
      offTopic: true,
      reason: 'Off-topic or unsafe request outside interview scope.',
    }
  }
  return { safe: true, abusive: false, offTopic: false }
}
