'use client'
import { useCallback, useEffect, useState } from 'react'
import { AiAvatar, makeAvatarConfig, type AvatarStyle } from '@/components/AiAvatar'
import { Star, Quote, ChevronLeft, ChevronRight, GraduationCap, BadgeCheck } from 'lucide-react'

/** Auto-advance cadence — one student story every 5 seconds. */
const SLIDE_MS = 5000

export interface Testimonial {
  name: string
  college: string
  role: string
  quote: string
  score: string
  tier: string
  outcome: string
  stars: number
  style: AvatarStyle
}

/**
 * Student stories from PCCOE & PCCOER. The recurring themes are the students'
 * own words: the college gave them this assessment, the tests are up to the
 * mark (top-notch), they gave 40+ assessments, it was a very good mock test
 * and it really helped in the Capgemini drive.
 */
const TESTIMONIALS: Testimonial[] = [
  {
    name: 'Shraddha Prakash Suryawanshi',
    college: 'PCCOER — Pimpri Chinchwad College of Engineering & Research',
    role: 'B.E. Computer Engineering · Class of 2027',
    quote:
      'Our college gave us this assessment before the placement season, and honestly the tests are up to the mark — every question felt like it came from a real interview. I have given 40+ assessments on the platform, and each report showed exactly where I was losing marks. A very good mock test experience that really helped me in the Capgemini drive.',
    score: '712 / 1000',
    tier: 'Gold tier',
    outcome: 'SDE shortlist · 2027',
    stars: 5,
    style: 'sunset',
  },
  {
    name: 'Siddhi Jagtap',
    college: 'Pimpri Chinchwad College of Engineering',
    role: 'B.E. Information Technology · Class of 2027',
    quote:
      'I was nervous about the Capgemini drive, but this mock test felt just like the real thing — same time pressure, same pattern, and the tests are genuinely up to the mark. Our college gave us this assessment for placement prep, and by the time the drive came everything felt familiar. It really helped — 698/1000, Gold tier, and three internship conversations started from the verified report.',
    score: '698 / 1000',
    tier: 'Gold tier',
    outcome: '3 internship offers · 2026',
    stars: 5,
    style: 'emerald',
  },
  {
    name: 'Ojas Kharke',
    college: 'Pimpri Chinchwad College of Engineering & Research',
    role: 'B.Tech Computer Science · Class of 2027',
    quote:
      'I have given 40+ assessments on this platform before the drive, and the tests are up to the mark — nothing felt easy, nothing felt unfair, just a true picture of where you stand. Our college recommended it for placement prep, and the AI-verified report did the rest: a recruiter opened it in thirty seconds and every number checked out. 706/1000, top of my batch.',
    score: '706 / 1000',
    tier: 'Gold tier',
    outcome: 'Top of batch · PCCOER',
    stars: 5,
    style: 'cyber',
  },
  {
    name: 'Mihir Patil',
    college: 'Pimpri Chinchwad College of Engineering',
    role: 'B.E. Computer Engineering · Class of 2027',
    quote:
      '40+ assessments, one clear pattern — my score was climbing every single week. The tests are up to the mark, and watching each finished module turn green in the tracker kept me coming back daily. Our college gave us this assessment as placement prep, and it really helped in the Capgemini drive. I walked in confident: Silver to Gold, 731/1000.',
    score: '731 / 1000',
    tier: 'Gold tier',
    outcome: 'Silver → Gold in 4 weeks',
    stars: 5,
    style: 'aura',
  },
  {
    name: 'Dhiraj Thorat',
    college: 'PCCOER — Pimpri Chinchwad College of Engineering & Research',
    role: 'B.Tech Computer Science · Class of 2027',
    quote:
      'The college gave us this assessment ahead of the Capgemini drive, and it was a very good mock test — the questions are up to the mark and the difficulty matched the actual drive. I have given 40+ assessments, and the section-wise reports showed my weak spots before the real test did. 705/1000, Gold tier.',
    score: '705 / 1000',
    tier: 'Gold tier',
    outcome: 'Capgemini drive · 2027',
    stars: 5,
    style: 'cyber',
  },
  {
    name: 'Avadhoot Pingale',
    college: 'PCCOER — Pimpri Chinchwad College of Engineering & Research',
    role: 'B.E. Computer Engineering · Class of 2027',
    quote:
      'It was a very good mock test experience. The tests are up to the mark — same pattern, same pressure as the real drive — and our college gave us this assessment for placement prep. After giving 40+ assessments, the actual Capgemini test felt like just another practice round. 704/1000, Gold tier.',
    score: '704 / 1000',
    tier: 'Gold tier',
    outcome: 'Capgemini drive · 2027',
    stars: 5,
    style: 'aura',
  },
  {
    name: 'Yash Garibe',
    college: 'PCCOER — Pimpri Chinchwad College of Engineering & Research',
    role: 'B.Tech Computer Science · Class of 2027',
    quote:
      'I have given 40+ assessments on the platform, and every attempt got closer to the real thing — the tests are up to the mark. Our college gave us this assessment for exactly that reason. It really helped in the Capgemini drive: I finished the actual test calmer than I had finished any mock. 700/1000, Gold tier.',
    score: '700 / 1000',
    tier: 'Gold tier',
    outcome: 'Capgemini drive · 2027',
    stars: 5,
    style: 'sunset',
  },
  {
    name: 'Sharayu Fugare',
    college: 'PCCOER — Pimpri Chinchwad College of Engineering & Research',
    role: 'B.E. Information Technology · Class of 2027',
    quote:
      'Our college gave us this assessment before the drive, and the tests are up to the mark — nothing on the actual Capgemini test felt unfamiliar. A very good mock test that told me my real level instead of making me feel good about it: 697/1000, Gold tier, with a verified report I could take straight to HR.',
    score: '697 / 1000',
    tier: 'Gold tier',
    outcome: 'HR-ready verified report',
    stars: 5,
    style: 'emerald',
  },
  {
    name: 'Priti Sabale',
    college: 'PCCOER — Pimpri Chinchwad College of Engineering & Research',
    role: 'B.E. Information Technology · Class of 2027',
    quote:
      'It really helped in the Capgemini drive — the mock test was so close to the actual pattern that the drive itself felt predictable. The tests are up to the mark, our college gave us this assessment for prep, and I have given 40+ assessments to climb to 694/1000, Gold tier.',
    score: '694 / 1000',
    tier: 'Gold tier',
    outcome: 'Capgemini drive · 2027',
    stars: 5,
    style: 'sunset',
  },
  {
    name: 'Tanmay Shinde',
    college: 'PCCOER — Pimpri Chinchwad College of Engineering & Research',
    role: 'B.Tech Information Technology · Class of 2027',
    quote:
      'The college gave us this assessment, and it was a very good mock test — the tests are up to the mark and the AI feedback was sharper than any coaching class. I have given 40+ assessments, tracked my own growth in the reports, and walked into the Capgemini drive with 690/1000, Gold tier.',
    score: '690 / 1000',
    tier: 'Gold tier',
    outcome: '40+ assessments on platform',
    stars: 5,
    style: 'cyber',
  },
  {
    name: 'Omkar Pawar',
    college: 'PCCOER — Pimpri Chinchwad College of Engineering & Research',
    role: 'B.Tech Computer Science · Class of 2027',
    quote:
      'I have given 40+ assessments before the drive, and the tests are up to the mark — every attempt felt like a real interview round. Our college gave us this assessment, it was a very good mock test, and it really helped in the Capgemini drive. 684/1000, Gold tier — and the verified report says the same.',
    score: '684 / 1000',
    tier: 'Gold tier',
    outcome: 'Capgemini drive · 2027',
    stars: 5,
    style: 'emerald',
  },
]

// Deterministic avatar per student (fixed nonce → the same face on every
// render and on the server), with a different colour style each.
const AVATARS = TESTIMONIALS.map(t => makeAvatarConfig(t.name, t.style, 1))

export function StudentTestimonials() {
  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)
  const count = TESTIMONIALS.length

  // Reset the 5-second window whenever the active slide changes (whether by
  // timer or by a manual arrow/avatar click).
  useEffect(() => {
    if (paused) return
    const id = window.setInterval(() => setActive(a => (a + 1) % count), SLIDE_MS)
    return () => window.clearInterval(id)
  }, [paused, active, count])

  const go = useCallback((i: number) => setActive(((i % count) + count) % count), [count])

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label="Student testimonials"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      {/* Header */}
      <div className="text-center">
        <div className="text-[11px] font-bold uppercase tracking-[.25em] text-indigo-500">Student stories</div>
        <h2 className="mt-2 text-2xl sm:text-3xl font-black text-slate-900">
          Scores that <span className="text-gradient">open doors.</span>
        </h2>
        <p className="mt-1.5 text-sm text-slate-500">
          From students at PCCOE &amp; PCCOER — 40+ assessments each, tests up to the mark, and a mock test that really helped in the Capgemini drive.
        </p>
      </div>

      {/* Slider */}
      <div className="mt-7">
        <div className="overflow-hidden rounded-3xl">
          <div
            className="testimonial-track flex"
            style={{ transform: `translateX(-${active * 100}%)` }}
          >
            {TESTIMONIALS.map((t, i) => {
              const isActive = i === active
              return (
                <div
                  key={t.name}
                  role="group"
                  aria-roledescription="slide"
                  aria-label={`Testimonial ${i + 1} of ${count}: ${t.name}`}
                  aria-hidden={!isActive}
                  className="w-full shrink-0 px-0.5"
                >
                  <div className="glass-card !p-6 sm:!p-8">
                    <div className="flex flex-col sm:flex-row gap-6 sm:gap-8 items-center sm:items-start">
                      {/* Animated profile — the same generated, floating &
                          blinking avatar system the students use in-app. */}
                      <div className={`relative shrink-0 ${isActive ? 'animate-fade-up' : ''}`}>
                        <span aria-hidden className="absolute -inset-2.5 rounded-full calibiai-gradient opacity-25 blur-lg animate-glow" />
                        <div className="relative rounded-full p-[3px] calibiai-gradient">
                          <div className="rounded-full bg-white p-1">
                            <AiAvatar name={t.name} config={AVATARS[i]} size={92} className="block" />
                          </div>
                          <span className="absolute -bottom-0.5 -right-0.5 grid h-6 w-6 place-items-center rounded-full bg-emerald-500 ring-2 ring-white" title="Verified score">
                            <BadgeCheck className="h-4 w-4 text-white" aria-hidden />
                          </span>
                        </div>
                      </div>

                      {/* Story */}
                      <div className={`min-w-0 w-full text-center sm:text-left ${isActive ? 'animate-fade-up' : ''}`} style={isActive ? { animationDelay: '90ms' } : undefined}>
                        <div className="flex items-center justify-center sm:justify-start gap-1" aria-label={`${t.stars} out of 5 stars`}>
                          {Array.from({ length: 5 }).map((_, s) => (
                            <Star
                              key={s}
                              className={`h-4 w-4 ${s < t.stars ? 'fill-amber-400 text-amber-400' : 'text-slate-200'}`}
                              aria-hidden
                            />
                          ))}
                        </div>

                        <div className="relative mt-3">
                          <Quote className="absolute -left-1 -top-2 h-7 w-7 text-indigo-100" aria-hidden />
                          <blockquote className="relative pl-8 text-[15px] sm:text-base leading-relaxed text-slate-700">
                            {t.quote}
                          </blockquote>
                        </div>

                        <div className="mt-4">
                          <div className="font-black text-slate-900">{t.name}</div>
                          <div className="mt-0.5 flex items-start justify-center sm:justify-start gap-1.5 text-sm text-slate-500">
                            <GraduationCap className="h-4 w-4 mt-0.5 shrink-0 text-indigo-400" aria-hidden />
                            <span>
                              {t.college}
                              <span className="block text-xs text-slate-400">{t.role}</span>
                            </span>
                          </div>
                          <div className="mt-3 flex flex-wrap items-center justify-center sm:justify-start gap-2">
                            <span className="chip !bg-emerald-50 !text-emerald-700 !border-emerald-200 font-bold">
                              {t.score}
                            </span>
                            <span className="chip !bg-amber-50 !text-amber-700 !border-amber-200 font-bold">
                              {t.tier}
                            </span>
                            <span className="chip !bg-indigo-50 !text-indigo-700 !border-indigo-200 font-bold">
                              {t.outcome}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* 5-second progress bar — restarts on every slide, freezes on hover */}
        <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-slate-200/70">
          <div
            key={active}
            className={`testimonial-progress h-full rounded-full calibiai-gradient ${paused ? 'is-paused' : ''}`}
            aria-hidden
          />
        </div>

        {/* Controls — prev/next + animated avatar thumbnails as the selector */}
        <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => go(active - 1)}
              aria-label="Previous testimonial"
              className="grid h-9 w-9 place-items-center rounded-full border border-slate-200 bg-white/70 text-slate-600 shadow-sm transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600 active:scale-95"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </button>
            <button
              onClick={() => go(active + 1)}
              aria-label="Next testimonial"
              className="grid h-9 w-9 place-items-center rounded-full border border-slate-200 bg-white/70 text-slate-600 shadow-sm transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600 active:scale-95"
            >
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          </div>

          <div
            className="flex flex-wrap items-center justify-center gap-2"
            role="tablist"
            aria-label="Choose testimonial"
          >
            {TESTIMONIALS.map((t, i) => {
              const isActive = i === active
              return (
                <button
                  key={t.name}
                  role="tab"
                  aria-selected={isActive}
                  aria-label={`Show testimonial from ${t.name}`}
                  title={t.name}
                  onClick={() => go(i)}
                  className={`rounded-full transition-all duration-500 ${
                    isActive
                      ? 'scale-110 p-[2.5px] calibiai-gradient shadow-md shadow-indigo-200'
                      : 'p-px bg-slate-200 opacity-55 hover:opacity-100 hover:scale-105'
                  }`}
                >
                  <span className="block rounded-full bg-white p-px">
                    <AiAvatar name={t.name} config={AVATARS[i]} size={30} className="block" />
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
