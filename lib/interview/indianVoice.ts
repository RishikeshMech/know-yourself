/**
 * Indian English (en-IN / hi-IN) Voice Selection & Natural Speech Synthesis
 *
 * Ensures Sam speaks with a clear, warm Indian voice across Chrome, Edge,
 * Safari, macOS, Windows, and Android:
 *   1. Ranks voices to prioritize Neural/Natural/Online Indian voices
 *      (Microsoft Neerja/Prabhat/Kavya/Swara, Google English (India) / Google हिन्दी,
 *       Apple Rishi/Veena/Sangeeta/Isha/Lekha, Microsoft Heera/Ravi).
 *   2. Waits for async `speechSynthesis.onvoiceschanged` before speaking so
 *      browsers never fall back to an uninitialized robotic default voice.
 *   3. Sets BOTH `utter.voice` AND `utter.lang = utter.voice.lang` so Chrome
 *      never overrides the selected voice due to lang mismatch.
 *   4. Cleans markdown, resolves `{track}` placeholders, and expands technical
 *      abbreviations (`SWE`, `AI/ML`, `DBMS`, `OOP`, `O(n)`, `1NF`) for natural
 *      Indian English pronunciation.
 *   5. Splits speech into sentence chunks with a keep-alive timer so Chrome's
 *      15-second SpeechSynthesis cutoff bug never truncates questions.
 */

export interface VoiceLike {
  name: string
  lang: string
  localService?: boolean
  voiceURI?: string
  default?: boolean
}

export interface RankedVoice<T extends VoiceLike = VoiceLike> {
  voice: T
  score: number
  isIndian: boolean
  badge: string
}

const INDIAN_VOICE_NAMES = [
  'neerja',
  'prabhat',
  'kavya',
  'rehaan',
  'ananya',
  'aashi',
  'swara',
  'madhur',
  'rishi',
  'veena',
  'sangeeta',
  'isha',
  'lekha',
  'kiyara',
  'neel',
  'heera',
  'ravi',
  'aditi',
  'raveena',
  'priya',
  'kajal',
  'india',
  'indian',
  'हिन्दी',
  'हिंदी',
  'bharat',
]

/**
 * Scores a browser SpeechSynthesisVoice for Indian English interview suitability.
 */
export function scoreVoiceForIndianEnglish(voice: VoiceLike): {
  score: number
  isIndian: boolean
  badge: string
} {
  const name = String(voice?.name || '')
  const nameLower = name.toLowerCase()
  const lang = String(voice?.lang || '').replace('_', '-')
  const langLower = lang.toLowerCase()

  const isEnIn = langLower === 'en-in' || langLower.startsWith('en-in-')
  const isHiIn = langLower === 'hi-in' || langLower.startsWith('hi-in-')
  const isOtherIn = langLower.endsWith('-in')
  const hasIndianName = INDIAN_VOICE_NAMES.some(k => nameLower.includes(k))
  const isIndian = isEnIn || isHiIn || isOtherIn || hasIndianName

  const isNaturalOrNeural =
    nameLower.includes('natural') ||
    nameLower.includes('neural') ||
    nameLower.includes('wavenet') ||
    nameLower.includes('studio') ||
    nameLower.includes('premium') ||
    nameLower.includes('enhanced')
  const isOnlineOrGoogle =
    nameLower.includes('online') ||
    nameLower.includes('google') ||
    nameLower.includes('network') ||
    voice.localService === false

  let score = 0

  if (isEnIn) {
    score += 200
  } else if (hasIndianName && langLower.startsWith('en')) {
    score += 185
  } else if (isHiIn && (isNaturalOrNeural || isOnlineOrGoogle)) {
    // Google हिन्दी / Microsoft Swara Online in Chrome/Edge read English Latin text
    // with a smooth, natural neural Indian accent — far better than robotic SAPI en-US!
    score += 175
  } else if (isHiIn || isOtherIn || hasIndianName) {
    score += 145
  } else if (langLower === 'en-gb' || langLower.startsWith('en-gb')) {
    score += 70
  } else if (langLower.startsWith('en')) {
    score += 40
  } else {
    score -= 100
  }

  if (isNaturalOrNeural) score += 55
  if (isOnlineOrGoogle) score += 30

  // Prefer flagship Indian English voices
  if (nameLower.includes('neerja') || nameLower.includes('prabhat')) score += 35
  if (nameLower.includes('rishi') || nameLower.includes('veena') || nameLower.includes('sangeeta') || nameLower.includes('isha')) {
    score += 25
  }
  if (nameLower.includes('google') && (isEnIn || isHiIn || nameLower.includes('india'))) {
    score += 30
  }

  let badge = 'English Voice'
  if (isEnIn && (isNaturalOrNeural || isOnlineOrGoogle)) {
    badge = '🇮🇳 Indian English (Neural HD)'
  } else if (isEnIn) {
    badge = '🇮🇳 Indian English (en-IN)'
  } else if (isIndian && (isNaturalOrNeural || isOnlineOrGoogle)) {
    badge = '🇮🇳 Indian Accent (Neural)'
  } else if (isIndian) {
    badge = '🇮🇳 Indian Voice'
  }

  return { score, isIndian, badge }
}

export function listRankedVoices<T extends VoiceLike>(voices: T[]): Array<RankedVoice<T>> {
  if (!Array.isArray(voices) || voices.length === 0) return []
  const ranked = voices
    .map(voice => {
      const { score, isIndian, badge } = scoreVoiceForIndianEnglish(voice)
      return { voice, score, isIndian, badge }
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)

  return ranked
}

export function pickBestIndianVoice<T extends VoiceLike>(
  voices: T[],
  preferredURI?: string | null,
): T | null {
  if (!Array.isArray(voices) || voices.length === 0) return null
  if (preferredURI) {
    const exact = voices.find(v => (v.voiceURI && v.voiceURI === preferredURI) || v.name === preferredURI)
    if (exact) return exact
  }
  const ranked = listRankedVoices(voices)
  return ranked[0]?.voice || voices[0] || null
}

/**
 * Normalizes interviewer text so TTS speaks naturally in Indian English without
 * reading raw punctuation, markdown, `{track}`, or cryptic CS notation.
 */
export function cleanTextForIndianSpeech(text: string, track?: 'swe' | 'ai_ml'): string {
  if (!text) return ''
  const trackFull = track === 'ai_ml' ? 'AI and Machine Learning Engineer' : 'Software Engineer'

  let out = String(text)
    // Resolve any remaining placeholders
    .replace(/\{track\}/gi, trackFull)
    .replace(/\{track_field\}/gi, trackFull)
    // Remove code blocks from spoken voice (replace with brief cue)
    .replace(/```[\s\S]*?```/g, ' Please refer to the code snippet on your screen. ')
    // Remove inline markdown symbols
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    // Expand CS / Interview notations for natural Indian pronunciation
    .replace(/\bSWE\b/g, 'Software Engineering')
    .replace(/\bAI\/ML\b/gi, 'AI and ML')
    .replace(/\bO\(1\)/g, 'Big O of 1')
    .replace(/\bO\(n\)/gi, 'Big O of n')
    .replace(/\bO\(log\s*n\)/gi, 'Big O of log n')
    .replace(/\bO\(n\s*log\s*n\)/gi, 'Big O of n log n')
    .replace(/\bO\(n\^2\)/gi, 'Big O of n squared')
    .replace(/\bO\(m\s*\+\s*n\)/gi, 'Big O of m plus n')
    .replace(/\bO\(V\s*\+\s*E\)/gi, 'Big O of V plus E')
    .replace(/\b1NF\b/g, 'First Normal Form')
    .replace(/\b2NF\b/g, 'Second Normal Form')
    .replace(/\b3NF\b/g, 'Third Normal Form')
    .replace(/\bk-NN\b/gi, 'k Nearest Neighbors')
    .replace(/\bDAU\b/g, 'Daily Active Users')
    // Clean visual separators
    .replace(/[·•]/g, ', ')
    .replace(/→/g, ' to ')
    .replace(/\s+/g, ' ')
    .trim()

  return out
}

/**
 * Splits long text into natural sentence chunks (<= maxLen chars) so
 * browser SpeechSynthesis never hits the 15-second cutoff and pauses
 * naturally between sentences.
 */
export function splitIntoSpeechSentences(text: string, maxLen = 185): string[] {
  const cleaned = String(text || '').trim()
  if (!cleaned) return []

  // Split on sentence boundaries (. ? ! : ;) followed by space
  const rawSentences = cleaned
    .split(/(?<=[.?!:;])\s+/)
    .map(s => s.trim())
    .filter(Boolean)

  const chunks: string[] = []
  for (const sentence of rawSentences) {
    if (sentence.length <= maxLen) {
      chunks.push(sentence)
    } else {
      // Split long sentence on commas or conjunctions
      const parts = sentence.split(/(?<=[,])\s+/)
      let cur = ''
      for (const p of parts) {
        if ((cur + ' ' + p).trim().length <= maxLen) {
          cur = (cur ? cur + ' ' : '') + p
        } else {
          if (cur) chunks.push(cur)
          cur = p
        }
      }
      if (cur) chunks.push(cur)
    }
  }

  return chunks.length ? chunks : [cleaned]
}

export interface SpeakIndianOptions {
  preferredVoiceURI?: string | null
  rate?: number
  pitch?: number
  track?: 'swe' | 'ai_ml'
  onStart?: (voiceUsed: SpeechSynthesisVoice | null) => void
  onEnd?: () => void
  onError?: () => void
}

/**
 * Speaks `text` using the best available Indian voice in the browser.
 * Returns a cleanup function that cancels playback.
 */
export function speakWithIndianVoice(text: string, opts: SpeakIndianOptions = {}): () => void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    opts.onEnd?.()
    return () => {}
  }

  const synth = window.speechSynthesis
  const cleaned = cleanTextForIndianSpeech(text, opts.track)
  const sentences = splitIntoSpeechSentences(cleaned)
  if (sentences.length === 0) {
    opts.onEnd?.()
    return () => {}
  }

  let cancelled = false
  let keepAliveInterval: any = null
  let startTimer: any = null

  const stopAll = () => {
    cancelled = true
    if (keepAliveInterval) clearInterval(keepAliveInterval)
    if (startTimer) clearTimeout(startTimer)
    try {
      synth.cancel()
    } catch {}
  }

  const beginSpeaking = () => {
    if (cancelled) return
    try {
      synth.cancel()
    } catch {}

    const voices = synth.getVoices() || []
    const chosenVoice = pickBestIndianVoice(voices, opts.preferredVoiceURI)
    const rate = opts.rate ?? 0.98
    const pitch = opts.pitch ?? 1.02

    let idx = 0
    opts.onStart?.(chosenVoice)

    // Keep-alive workaround for Chromium 15s pause bug
    keepAliveInterval = setInterval(() => {
      if (cancelled) {
        clearInterval(keepAliveInterval)
        return
      }
      try {
        if (synth.speaking && synth.paused) {
          synth.resume()
        }
      } catch {}
    }, 3000)

    const speakNext = () => {
      if (cancelled) return
      if (idx >= sentences.length) {
        if (keepAliveInterval) clearInterval(keepAliveInterval)
        opts.onEnd?.()
        return
      }

      const chunk = sentences[idx++]
      const utter = new SpeechSynthesisUtterance(chunk)
      if (chosenVoice) {
        utter.voice = chosenVoice
        // CRITICAL: utter.lang MUST match chosenVoice.lang so Chrome doesn't discard utter.voice
        utter.lang = chosenVoice.lang || 'en-IN'
      } else {
        utter.lang = 'en-IN'
      }
      utter.rate = rate
      utter.pitch = pitch
      utter.volume = 1

      utter.onend = () => {
        if (cancelled) return
        if (idx < sentences.length) {
          startTimer = setTimeout(speakNext, 90)
        } else {
          if (keepAliveInterval) clearInterval(keepAliveInterval)
          opts.onEnd?.()
        }
      }

      utter.onerror = () => {
        if (cancelled) return
        if (idx < sentences.length) {
          startTimer = setTimeout(speakNext, 90)
        } else {
          if (keepAliveInterval) clearInterval(keepAliveInterval)
          opts.onEnd?.()
        }
      }

      try {
        synth.speak(utter)
      } catch {
        if (keepAliveInterval) clearInterval(keepAliveInterval)
        opts.onError?.()
        opts.onEnd?.()
      }
    }

    startTimer = setTimeout(speakNext, 80)
  }

  // Wait for voices if not yet populated by browser
  const initialVoices = synth.getVoices() || []
  if (initialVoices.length > 0) {
    beginSpeaking()
  } else {
    let started = false
    const handleVoicesChanged = () => {
      if (started || cancelled) return
      started = true
      synth.removeEventListener?.('voiceschanged', handleVoicesChanged)
      beginSpeaking()
    }
    synth.addEventListener?.('voiceschanged', handleVoicesChanged)
    // Fallback timeout in case voiceschanged never fires
    startTimer = setTimeout(() => {
      if (started || cancelled) return
      started = true
      synth.removeEventListener?.('voiceschanged', handleVoicesChanged)
      beginSpeaking()
    }, 350)
  }

  return stopAll
}
