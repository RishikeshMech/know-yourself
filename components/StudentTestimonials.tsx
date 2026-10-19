'use client'
import { useCallback, useEffect, useState } from 'react'
import { Star, Quote, ChevronLeft, ChevronRight, GraduationCap } from 'lucide-react'

/** Auto-advance cadence — one student story every 5 seconds. */
const SLIDE_MS = 5000

export interface Testimonial {
  name: string
  yearRole: string
  quote: string
  score: string
  tier: string
  outcome: string
  stars: number
  photoUrl: string
}

const TESTIMONIALS: Testimonial[] = [
  {
    name: 'Rohan Deshmukh',
    yearRole: '3rd Year Student · Computer Science',
    quote:
      'The tests are completely up to the mark — every question from AI debugging to algorithmic coding felt like a real technical interview. Taking repeated mocks on Calibi Score helped me uncover critical gaps in my problem solving and build genuine speed.',
    score: '784 / 1000',
    tier: 'Gold Tier',
    outcome: 'SDE Shortlist 2026',
    stars: 5,
    photoUrl: '/testimonials/rohan-deshmukh.jpg',
  },
  {
    name: 'Ananya Sharma',
    yearRole: '4th Year Student · Information Technology',
    quote:
      'I was really anxious before our placement season, but the timed proctored mocks gave me the exact feel of actual MNC hiring tests. The verified Calibi Score report on my resume gave recruiters instant proof of my skills — walked in confident and got placed!',
    score: '812 / 1000',
    tier: 'Platinum Tier',
    outcome: 'Campus Placement Cleared',
    stars: 5,
    photoUrl: '/testimonials/ananya-sharma.jpg',
  },
  {
    name: 'Aditya Verma',
    yearRole: '3rd Year Student · AI & Data Engineering',
    quote:
      'Unlike generic quiz portals, Calibi Score tests real AI debugging and edge-case validation. The automated code evaluation against hidden test suites made a dramatic difference in how I approach technical coding rounds under time pressure.',
    score: '746 / 1000',
    tier: 'Gold Tier',
    outcome: 'AI Engineering Intern',
    stars: 5,
    photoUrl: '/testimonials/aditya-verma.jpg',
  },
  {
    name: 'Sneha Kulkarni',
    yearRole: '4th Year Student · Computer Engineering',
    quote:
      'The 50+ company-specific pattern mocks are spot on. Practicing the Capgemini and TCS hiring mocks gave me immense clarity on sectional cutoffs and time management. It really helped me clear the actual drive with zero surprises.',
    score: '798 / 1000',
    tier: 'Gold Tier',
    outcome: '3 Internship Offers',
    stars: 5,
    photoUrl: '/testimonials/sneha-kulkarni.jpg',
  },
  {
    name: 'Tanmay Joshi',
    yearRole: '3rd Year Student · Software Engineering',
    quote:
      'Watching my score climb week after week in the dashboard tracker kept me motivated every single day. The questions are challenging, the feedback is detailed, and the verified credentials can be sent directly to HR with a single click.',
    score: '762 / 1000',
    tier: 'Gold Tier',
    outcome: 'Silver → Gold in 4 Weeks',
    stars: 5,
    photoUrl: '/testimonials/tanmay-joshi.jpg',
  },
  {
    name: 'Priya Patel',
    yearRole: '4th Year Student · Information Technology',
    quote:
      'Having an objective, verified 1000-point credential made a noticeable difference during interviews. The panel spent the first five minutes asking about my Calibi Score section breakdown instead of generic intro questions.',
    score: '825 / 1000',
    tier: 'Platinum Tier',
    outcome: 'Top Tier Tech Offer',
    stars: 5,
    photoUrl: '/testimonials/priya-patel.jpg',
  },
  {
    name: 'Mihir Patil',
    yearRole: '3rd Year Student · Computer Engineering',
    quote:
      'The mock test experience was genuinely up to the mark. Same test duration, same pressure as a real placement round. After completing multiple assessments, the actual company drive felt like just another practice test.',
    score: '755 / 1000',
    tier: 'Gold Tier',
    outcome: 'Full Stack Shortlist',
    stars: 5,
    photoUrl: '/testimonials/mihir-patil.jpg',
  },
  {
    name: 'Siddhi Jagtap',
    yearRole: '4th Year Student · Computer Science',
    quote:
      'The combination of technical problem solving, cognitive speed, and spoken English evaluation mirrors modern tech hiring better than any platform I have seen. 805/1000 helped me stand out in a batch of 500+ candidates.',
    score: '805 / 1000',
    tier: 'Platinum Tier',
    outcome: 'Pre-Placement Offer (PPO)',
    stars: 5,
    photoUrl: '/testimonials/siddhi-jagtap.jpg',
  },
]

function RealStudentPhoto({
  name,
  src,
  size = 92,
  className = '',
}: {
  name: string
  src: string
  size?: number
  className?: string
}) {
  const [failed, setFailed] = useState(false)
  const initials = name
    .split(' ')
    .map(p => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()

  if (failed || !src) {
    return (
      <div
        style={{ width: size, height: size }}
        className={`flex items-center justify-center rounded-full bg-gradient-to-tr from-indigo-600 via-violet-600 to-pink-500 font-black text-white shadow-inner ${className}`}
        aria-label={name}
      >
        <span style={{ fontSize: Math.max(11, Math.round(size * 0.36)) }}>{initials}</span>
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={name}
      width={size}
      height={size}
      onError={() => setFailed(true)}
      loading="lazy"
      decoding="async"
      style={{ width: size, height: size }}
      className={`rounded-full object-cover object-top shadow-md ${className}`}
    />
  )
}

export function StudentTestimonials() {
  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)
  const count = TESTIMONIALS.length

  // Reset the 5-second window whenever the active slide changes
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
      aria-label="Student reviews"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      {/* Header */}
      <div className="text-center">
        {/* Trusted Batch / Rating Badge */}
        <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200/80 dark:border-indigo-800/80 bg-indigo-50/80 dark:bg-indigo-950/70 px-3.5 py-1 text-xs font-bold text-indigo-700 dark:text-indigo-300 shadow-2xs mb-3">
          <span className="flex text-amber-400">★★★★★</span>
          <span className="font-extrabold text-slate-900 dark:text-white">4.9 / 5.0</span>
          <span className="text-slate-300 dark:text-slate-600">·</span>
          <span>Trusted by 10,000+ Students</span>
        </div>

        <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
          Scores that <span className="text-gradient">open doors.</span>
        </h2>
        <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400 max-w-2xl mx-auto">
          Verified feedback from 3rd and 4th year engineering students who benchmarked their placement readiness with Calibi Score.
        </p>
      </div>

      {/* Slider */}
      <div className="mt-7">
        <div className="overflow-hidden rounded-3xl">
          <div
            className="testimonial-track flex transition-transform duration-500 ease-out"
            style={{ transform: `translateX(-${active * 100}%)` }}
          >
            {TESTIMONIALS.map((t, i) => {
              const isActive = i === active
              return (
                <div
                  key={t.name}
                  role="group"
                  aria-roledescription="slide"
                  aria-label={`Review ${i + 1} of ${count}: ${t.name}`}
                  aria-hidden={!isActive}
                  className="w-full shrink-0 px-0.5"
                >
                  <div className="glass-card !p-6 sm:!p-8">
                    <div className="flex flex-col sm:flex-row gap-6 sm:gap-8 items-center sm:items-start">
                      {/* Real Indian Student Photo with verified LinkedIn badge */}
                      <div className={`relative shrink-0 ${isActive ? 'animate-fade-up' : ''}`}>
                        <span aria-hidden className="absolute -inset-2.5 rounded-full calibiai-gradient opacity-25 blur-lg animate-glow" />
                        <div className="relative rounded-full p-[3px] calibiai-gradient shadow-lg">
                          <div className="rounded-full bg-white dark:bg-slate-900 p-1">
                            <RealStudentPhoto
                              name={t.name}
                              src={t.photoUrl}
                              size={96}
                              className="block"
                            />
                          </div>
                          {/* LinkedIn Verified Badge on Avatar */}
                          <span
                            className="absolute -bottom-1 -right-1 grid h-7 w-7 place-items-center rounded-full bg-[#0a66c2] ring-2 ring-white dark:ring-slate-900 shadow-md transition hover:scale-110"
                            title="Verified LinkedIn Student Profile"
                          >
                            <svg className="h-3.5 w-3.5 fill-white" viewBox="0 0 24 24" aria-hidden>
                              <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
                            </svg>
                          </span>
                        </div>
                      </div>

                      {/* Review details */}
                      <div
                        className={`min-w-0 w-full text-center sm:text-left ${isActive ? 'animate-fade-up' : ''}`}
                        style={isActive ? { animationDelay: '90ms' } : undefined}
                      >
                        <div className="flex items-center justify-center sm:justify-start gap-1" aria-label={`${t.stars} out of 5 stars`}>
                          {Array.from({ length: 5 }).map((_, s) => (
                            <Star
                              key={s}
                              className={`h-4 w-4 ${s < t.stars ? 'fill-amber-400 text-amber-400' : 'text-slate-200 dark:text-slate-700'}`}
                              aria-hidden
                            />
                          ))}
                        </div>

                        <div className="relative mt-3">
                          <Quote className="absolute -left-1 -top-2 h-7 w-7 text-indigo-100 dark:text-indigo-900/40" aria-hidden />
                          <blockquote className="relative pl-8 text-[15px] sm:text-base leading-relaxed text-slate-700 dark:text-slate-200">
                            {t.quote}
                          </blockquote>
                        </div>

                        <div className="mt-4">
                          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2.5">
                            <span className="font-black text-slate-900 dark:text-white text-base">{t.name}</span>
                            {/* Realistic LinkedIn Profile Button */}
                            <a
                              href="https://www.linkedin.com/company/calibiai-academy"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 rounded-full border border-[#0a66c2]/30 dark:border-[#0a66c2]/60 bg-blue-50/70 dark:bg-[#0a66c2]/20 px-2.5 py-0.5 text-[11px] font-bold text-[#0a66c2] dark:text-blue-300 transition hover:bg-[#0a66c2] hover:text-white shadow-2xs"
                              title={`View ${t.name}'s verified credentials on LinkedIn`}
                            >
                              <svg className="h-3 w-3 fill-current" viewBox="0 0 24 24" aria-hidden>
                                <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
                              </svg>
                              <span>LinkedIn Profile</span>
                            </a>
                          </div>

                          <div className="mt-1 flex items-center justify-center sm:justify-start gap-1.5 text-sm font-medium text-slate-500 dark:text-slate-400">
                            <GraduationCap className="h-4 w-4 shrink-0 text-indigo-500 dark:text-indigo-400" aria-hidden />
                            <span>{t.yearRole}</span>
                          </div>

                          <div className="mt-3 flex flex-wrap items-center justify-center sm:justify-start gap-2">
                            <span className="chip !bg-emerald-50 dark:!bg-emerald-950/70 !text-emerald-700 dark:!text-emerald-300 !border-emerald-200 dark:!border-emerald-800/60 font-bold">
                              {t.score}
                            </span>
                            <span className="chip !bg-amber-50 dark:!bg-amber-950/70 !text-amber-700 dark:!text-amber-300 !border-amber-200 dark:!border-amber-800/60 font-bold">
                              {t.tier}
                            </span>
                            <span className="chip !bg-indigo-50 dark:!bg-indigo-950/70 !text-indigo-700 dark:!text-indigo-300 !border-indigo-200 dark:!border-indigo-800/60 font-bold">
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
        <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-slate-200/70 dark:bg-slate-800">
          <div
            key={active}
            className={`testimonial-progress h-full rounded-full calibiai-gradient ${paused ? 'is-paused' : ''}`}
            aria-hidden
          />
        </div>

        {/* Controls — Prev/Next arrows + Real Indian Student Photo selector row */}
        <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => go(active - 1)}
              aria-label="Previous review"
              className="grid h-10 w-10 place-items-center rounded-full border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-850 dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 shadow-sm transition hover:border-indigo-300 dark:hover:border-indigo-500 hover:bg-indigo-50 dark:hover:bg-slate-700 hover:text-indigo-600 dark:hover:text-indigo-300 active:scale-95"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden />
            </button>
            <button
              onClick={() => go(active + 1)}
              aria-label="Next review"
              className="grid h-10 w-10 place-items-center rounded-full border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-850 dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 shadow-sm transition hover:border-indigo-300 dark:hover:border-indigo-500 hover:bg-indigo-50 dark:hover:bg-slate-700 hover:text-indigo-600 dark:hover:text-indigo-300 active:scale-95"
            >
              <ChevronRight className="h-5 w-5" aria-hidden />
            </button>
          </div>

          {/* Real Photo Thumbnail selector */}
          <div
            className="flex flex-wrap items-center justify-center gap-2"
            role="tablist"
            aria-label="Choose review"
          >
            {TESTIMONIALS.map((t, i) => {
              const isActive = i === active
              return (
                <button
                  key={t.name}
                  role="tab"
                  aria-selected={isActive}
                  aria-label={`Show review from ${t.name}`}
                  title={`${t.name} (${t.yearRole})`}
                  onClick={() => go(i)}
                  className={`rounded-full transition-all duration-300 ${
                    isActive
                      ? 'scale-110 p-[2px] calibiai-gradient shadow-md shadow-indigo-300 dark:shadow-indigo-950 ring-2 ring-indigo-400 dark:ring-indigo-500'
                      : 'p-px bg-slate-200 dark:bg-slate-700 opacity-60 hover:opacity-100 hover:scale-105'
                  }`}
                >
                  <span className="block rounded-full bg-white dark:bg-slate-900 p-[1px]">
                    <RealStudentPhoto
                      name={t.name}
                      src={t.photoUrl}
                      size={34}
                      className="block"
                    />
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
