'use client'
import { useMemo } from 'react'
import { mulberry32 } from '@/lib/questions'

/**
 * AiAvatar — a generated, animated "AI avatar" for the student profile.
 *
 * The face is a deterministic cartoon rendered in SVG from a small config:
 * { seed, style, version, generated_at }. The same config always draws the
 * same face, so the avatar is portable (stored in public.profiles.ai_avatar,
 * exported via the student_profiles_full view) and renders identically on
 * every device without storing any image file.
 *
 * Animations (CSS in globals.css): gentle float, eye blink, aurora background
 * drift and a twinkling AI sparkle — hence "animated avatar".
 */

export type AvatarStyle = 'aura' | 'emerald' | 'sunset' | 'cyber'

export interface AvatarConfig {
  seed: number
  style: AvatarStyle
  version: number
  generated_at: string
}

export const AVATAR_STYLES: { id: AvatarStyle; label: string; swatch: [string, string] }[] = [
  { id: 'aura', label: 'Aura', swatch: ['#4f46e5', '#a855f7'] },
  { id: 'emerald', label: 'Emerald', swatch: ['#059669', '#34d399'] },
  { id: 'sunset', label: 'Sunset', swatch: ['#f97316', '#ec4899'] },
  { id: 'cyber', label: 'Cyber', swatch: ['#0ea5e9', '#6366f1'] },
]

const PALETTES: Record<AvatarStyle, { bg: [string, string]; glow: string }> = {
  aura: { bg: ['#4f46e5', '#a855f7'], glow: 'rgba(168,85,247,.55)' },
  emerald: { bg: ['#047857', '#34d399'], glow: 'rgba(52,211,153,.55)' },
  sunset: { bg: ['#ea580c', '#ec4899'], glow: 'rgba(236,72,153,.55)' },
  cyber: { bg: ['#0284c7', '#6366f1'], glow: 'rgba(34,211,238,.55)' },
}

const SKINS = ['#ffd9b3', '#f6c39a', '#e8a875', '#c98a55', '#9c6b3f', '#6f4a2a']
const HAIR_COLORS = ['#111827', '#2b1d13', '#4a2c17', '#0f172a', '#7c2d12', '#4c1d95', '#0c4a6e']
const SHIRTS = ['#312e81', '#1e3a8a', '#4c1d95', '#831843', '#134e4a', '#7f1d1d', '#0f172a']

/** FNV-1a 32-bit string hash — stable across languages/browsers. */
export function hashStr(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** New avatar identity for a user. `nonce` changes the face on regeneration. */
export function makeAvatarConfig(
  name: string,
  style: AvatarStyle,
  nonce: number = Math.floor(Math.random() * 0xffffffff),
): AvatarConfig {
  const seed = (hashStr((name || 'candidate').trim().toLowerCase()) ^ (nonce * 0x9e3779b9)) >>> 0
  return { seed: seed || 1, style, version: 1, generated_at: new Date().toISOString() }
}

type Art = {
  pal: { bg: [string, string]; glow: string }
  skin: string
  hair: string
  hairStyle: number
  shirt: string
  glasses: number
  mouth: number
  blush: boolean
  earring: boolean
  beard: boolean
}

function buildArt(seed: number, style: AvatarStyle): Art {
  const rnd = mulberry32(seed || 1)
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)]
  return {
    pal: PALETTES[style] || PALETTES.aura,
    skin: pick(SKINS),
    hair: pick(HAIR_COLORS),
    hairStyle: Math.floor(rnd() * 6),
    shirt: pick(SHIRTS),
    glasses: Math.floor(rnd() * 10) < 3 ? (Math.floor(rnd() * 2) + 1) : 0, // 1 = round, 2 = square
    mouth: Math.floor(rnd() * 3), // 0 smile, 1 grin, 2 soft
    blush: rnd() < 0.35,
    earring: rnd() < 0.2,
    beard: rnd() < 0.25,
  }
}

/** Hair variants as simple path sets over the head ellipse (cx=60, cy=56, rx=26, ry=27). */
function Hair({ style, color }: { style: number; color: string }) {
  switch (style) {
    case 0: // short crop
      return <path d="M34 52 Q34 26 60 26 Q86 26 86 52 Q86 40 74 36 Q64 33 52 36 Q36 40 34 52 Z" fill={color} />
    case 1: // side part
      return (
        <g fill={color}>
          <path d="M33 54 Q32 24 62 25 Q87 27 87 52 Q84 38 70 35 Q50 32 40 40 Q34 45 33 54 Z" />
          <path d="M40 40 Q52 30 68 34 L66 38 Q52 35 42 44 Z" />
        </g>
      )
    case 2: // curly
      return (
        <g fill={color}>
          <circle cx="42" cy="38" r="9" />
          <circle cx="54" cy="31" r="10" />
          <circle cx="68" cy="31" r="10" />
          <circle cx="80" cy="38" r="9" />
          <path d="M34 50 Q34 30 60 28 Q86 30 86 50 L82 50 Q82 34 60 33 Q38 34 38 50 Z" />
        </g>
      )
    case 3: // long
      return (
        <g fill={color}>
          <path d="M32 74 Q28 30 60 26 Q92 30 88 74 L80 74 Q84 40 60 36 Q36 40 40 74 Z" />
          <path d="M32 74 Q30 52 36 44 L42 48 Q38 58 40 74 Z" />
          <path d="M88 74 Q90 52 84 44 L78 48 Q82 58 80 74 Z" />
        </g>
      )
    case 4: // buzz cut
      return <path d="M35 48 Q36 28 60 27 Q84 28 85 48 Q74 36 60 36 Q46 36 35 48 Z" fill={color} opacity=".85" />
    default: // mohawk
      return (
        <g fill={color}>
          <path d="M52 28 Q60 12 68 28 L66 40 Q60 34 54 40 Z" />
          <path d="M36 46 Q38 30 60 28 Q82 30 84 46 Q72 36 60 36 Q48 36 36 46 Z" opacity=".55" />
        </g>
      )
  }
}

export function AiAvatar({
  name,
  config,
  size = 96,
  className = '',
}: {
  name?: string
  config?: AvatarConfig | null
  size?: number
  className?: string
}) {
  // No saved avatar yet → a deterministic default derived from the name so
  // every signed-in user has a face before their first generation.
  const cfg: AvatarConfig = config || {
    seed: hashStr((name || 'candidate').trim().toLowerCase()) || 1,
    style: 'aura',
    version: 0,
    generated_at: '',
  }
  const art = useMemo(() => buildArt(cfg.seed, cfg.style), [cfg.seed, cfg.style])
  const { pal, skin, hair, shirt } = art
  const uid = `av${(cfg.seed % 100000).toString(36)}${cfg.style}`

  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label={`AI avatar for ${name || 'candidate'}`}
    >
      <defs>
        <radialGradient id={`${uid}-bg`} cx="30%" cy="25%" r="90%">
          <stop offset="0%" stopColor={pal.bg[1]} />
          <stop offset="100%" stopColor={pal.bg[0]} />
        </radialGradient>
        <clipPath id={`${uid}-clip`}>
          <circle cx="60" cy="60" r="57" />
        </clipPath>
      </defs>

      {/* Rim + background */}
      <circle cx="60" cy="60" r="59" fill="none" stroke="rgba(255,255,255,.35)" strokeWidth="2" />
      <circle cx="60" cy="60" r="57" fill={`url(#${uid}-bg)`} />

      <g clipPath={`url(#${uid}-clip)`}>
        {/* Aurora drift */}
        <ellipse className="ai-avatar-aurora" cx="38" cy="34" rx="30" ry="20" fill="#ffffff" opacity=".25" />
        <ellipse className="ai-avatar-aurora-2" cx="86" cy="86" rx="34" ry="24" fill={pal.glow} opacity=".5" />

        {/* Character (floats gently) */}
        <g className="ai-avatar-float">
          {/* Shoulders */}
          <path d="M26 108 Q28 82 60 82 Q92 82 94 108 Z" fill={shirt} />
          <path d="M52 84 L60 94 L68 84" fill="none" stroke="rgba(255,255,255,.5)" strokeWidth="3" strokeLinecap="round" />
          {/* Neck */}
          <rect x="52" y="70" width="16" height="16" rx="6" fill={skin} />
          {/* Ears */}
          <circle cx="33" cy="58" r="6" fill={skin} />
          <circle cx="87" cy="58" r="6" fill={skin} />
          {art.earring && <circle cx="33" cy="63" r="2" fill="#fbbf24" />}
          {/* Head */}
          <ellipse cx="60" cy="54" rx="27" ry="28" fill={skin} />
          {/* Beard */}
          {art.beard && (
            <path d="M36 58 Q38 84 60 86 Q82 84 84 58 Q82 74 60 75 Q38 74 36 58 Z" fill={hair} opacity=".55" />
          )}
          {/* Blush */}
          {art.blush && (
            <g fill="#fb7185" opacity=".35">
              <ellipse cx="43" cy="62" rx="5" ry="3" />
              <ellipse cx="77" cy="62" rx="5" ry="3" />
            </g>
          )}
          {/* Hair */}
          <Hair style={art.hairStyle} color={hair} />
          {/* Brows */}
          <g stroke={hair} strokeWidth="3" strokeLinecap="round" fill="none">
            <path d="M42 46 Q48 42 54 45" />
            <path d="M66 45 Q72 42 78 46" />
          </g>
          {/* Eyes (blink) */}
          <g className="ai-avatar-blink">
            <ellipse cx="48" cy="54" rx="4.6" ry="5.4" fill="#fff" />
            <ellipse cx="72" cy="54" rx="4.6" ry="5.4" fill="#fff" />
            <circle cx="48.6" cy="55" r="2.6" fill="#0f172a" />
            <circle cx="72.6" cy="55" r="2.6" fill="#0f172a" />
            <circle cx="47.6" cy="53.6" r="0.9" fill="#fff" />
            <circle cx="71.6" cy="53.6" r="0.9" fill="#fff" />
          </g>
          {/* Glasses */}
          {art.glasses > 0 && (
            <g fill="none" stroke="rgba(15,23,42,.8)" strokeWidth="2.2">
              {art.glasses === 1 ? (
                <g>
                  <circle cx="48" cy="54" r="8.5" />
                  <circle cx="72" cy="54" r="8.5" />
                </g>
              ) : (
                <g>
                  <rect x="39" y="46" width="18" height="16" rx="4" />
                  <rect x="63" y="46" width="18" height="16" rx="4" />
                </g>
              )}
              <path d="M56.5 54 L63.5 54" />
            </g>
          )}
          {/* Nose */}
          <path d="M60 58 Q58 63 60 65" fill="none" stroke="rgba(15,23,42,.35)" strokeWidth="2" strokeLinecap="round" />
          {/* Mouth */}
          <g stroke="rgba(15,23,42,.75)" strokeWidth="2.4" strokeLinecap="round" fill="none">
            {art.mouth === 0 && <path d="M51 70 Q60 78 69 70" />}
            {art.mouth === 1 && (
              <g>
                <path d="M50 69 Q60 81 70 69 Q60 74 50 69 Z" fill="#0f172a" stroke="none" opacity=".8" />
              </g>
            )}
            {art.mouth === 2 && <path d="M53 71 Q60 75 67 71" />}
          </g>
        </g>
      </g>

      {/* AI sparkle badge */}
      <g className="ai-avatar-twinkle" style={{ transformOrigin: '101px 19px' }}>
        <circle cx="101" cy="19" r="12" fill="rgba(15,23,42,.55)" stroke="rgba(255,255,255,.5)" strokeWidth="1.5" />
        <path
          d="M101 11.5 L103 17 L108.5 19 L103 21 L101 26.5 L99 21 L93.5 19 L99 17 Z"
          fill="#fff"
        />
      </g>
    </svg>
  )
}
