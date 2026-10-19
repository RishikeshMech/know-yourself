'use client'
import Link from 'next/link'
import { Logo } from '@/components/Logo'
import { ShieldCheck, Award, FileText, Sparkles, ExternalLink } from 'lucide-react'
import { WHATSAPP_COMMUNITY_URL } from '@/lib/community'

export function Footer() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="mt-20 border-t border-slate-200/80 dark:border-slate-800/80 bg-white/65 dark:bg-slate-950/80 backdrop-blur-xl">
      {/* Upper footer band */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-14 pb-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10">
          {/* Brand & Mission column */}
          <div className="lg:col-span-2 space-y-4">
            <Link href="/" className="inline-flex items-center gap-2.5 group">
              <Logo className="drop-shadow-sm transition-transform group-hover:scale-105" />
              <span className="font-extrabold tracking-tight text-slate-900 dark:text-white text-lg sm:text-xl">
                CALIBI<span className="text-indigo-600 dark:text-indigo-400"> SCORE</span>
              </span>
            </Link>

            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed max-w-sm">
              The standardized employability credential for engineering graduates. Validating communication, algorithmic coding, AI debugging, and cognitive traits with tamper-proof reports.
            </p>

            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Powered by <span className="font-extrabold text-slate-800 dark:text-slate-200">MindLyft AI Pvt. Limited</span>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/90 dark:bg-emerald-950/60 px-3 py-1 text-xs font-bold text-emerald-800 dark:text-emerald-300">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" /> AI-Verified Evaluation
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 dark:border-indigo-800/60 bg-indigo-50/90 dark:bg-indigo-950/60 px-3 py-1 text-xs font-bold text-indigo-800 dark:text-indigo-300">
                <Award className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" /> 1000-Point Standard
              </span>
            </div>

            {/* Social Connect Icons */}
            <div className="pt-2">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3">Connect With Us</div>
              <div className="flex items-center gap-3">
                {/* LinkedIn */}
                <a
                  href="https://www.linkedin.com/company/calibiai-academy"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Follow Calibi Score on LinkedIn"
                  className="group flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs transition hover:-translate-y-0.5 hover:border-[#0077b5] hover:bg-[#0077b5]/10 hover:text-[#0077b5] hover:shadow-sm"
                >
                  <svg className="h-5 w-5 fill-slate-700 dark:fill-slate-300 transition group-hover:fill-[#0077b5]" viewBox="0 0 24 24" aria-hidden>
                    <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
                  </svg>
                </a>

                {/* Instagram */}
                <a
                  href="https://www.instagram.com/calibiai/"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Follow Calibi Score on Instagram"
                  className="group flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs transition hover:-translate-y-0.5 hover:border-[#E1306C] hover:bg-[#E1306C]/10 hover:shadow-sm"
                >
                  <svg className="h-5 w-5 fill-slate-700 dark:fill-slate-300 transition group-hover:fill-[#E1306C]" viewBox="0 0 24 24" aria-hidden>
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
                  </svg>
                </a>

                {/* WhatsApp Community */}
                <a
                  href={WHATSAPP_COMMUNITY_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Join WhatsApp Community"
                  className="group flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs transition hover:-translate-y-0.5 hover:border-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:shadow-sm"
                >
                  <svg className="h-5 w-5 fill-slate-700 dark:fill-slate-300 transition group-hover:fill-emerald-600 dark:group-hover:fill-emerald-400" viewBox="0 0 24 24" aria-hidden>
                    <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981z" />
                  </svg>
                </a>
              </div>
            </div>
          </div>

          {/* Assessment Column */}
          <div>
            <div className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white mb-4 flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" /> Assessments
            </div>
            <ul className="space-y-2.5 text-sm">
              <li>
                <Link href="/login" className="text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition font-medium">
                  Calibi Assessment
                </Link>
              </li>
              <li>
                <Link href="/company-assessments" className="text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition font-medium">
                  50+ Company Mocks
                </Link>
              </li>
              <li>
                <Link href="/company-assessments/capgemini" className="text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition font-medium">
                  Capgemini 2027 Mock
                </Link>
              </li>
              <li>
                <Link href="/company-assessments/tcs" className="text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition font-medium">
                  TCS NQT Blueprint
                </Link>
              </li>
              <li>
                <Link href="/sample-report" className="text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition font-medium">
                  Sample Score Report
                </Link>
              </li>
            </ul>
          </div>

          {/* Student Hub Column */}
          <div>
            <div className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white mb-4 flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" /> Platform
            </div>
            <ul className="space-y-2.5 text-sm">
              <li>
                <Link href="/dashboard/student" className="text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition font-medium">
                  Student Dashboard
                </Link>
              </li>
              <li>
                <Link href="/onboarding" className="text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition font-medium">
                  Candidate Profile
                </Link>
              </li>
              <li>
                <Link href="/instructions" className="text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition font-medium">
                  Assessment Instructions
                </Link>
              </li>
              <li>
                <a
                  href="https://chat.whatsapp.com/GzB9sV8hZf21eWzW"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition font-medium"
                >
                  Join Community <ExternalLink className="h-3 w-3" />
                </a>
              </li>

            </ul>
          </div>

          {/* Legal & Policies Column */}
          <div>
            <div className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white mb-4 flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" /> Legal &amp; Policies
            </div>
            <ul className="space-y-2.5 text-sm">
              <li>
                <Link
                  href="/terms"
                  className="text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition font-medium"
                >
                  Terms &amp; Conditions
                </Link>
              </li>
              <li>
                <Link
                  href="/privacy"
                  className="text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition font-medium"
                >
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link
                  href="/refunds"
                  className="text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition font-medium"
                >
                  Cancellation &amp; Refunds
                </Link>
              </li>
              <li>
                <a
                  href="mailto:support@calibiai.com"
                  className="text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition text-xs"
                >
                  Contact Support
                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Bottom copyright band */}
      <div className="border-t border-slate-200/60 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-950/90 py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400">
          <div className="flex flex-col sm:flex-row items-center gap-1.5 sm:gap-2.5 text-center sm:text-left">
            <span className="font-semibold text-slate-700 dark:text-slate-300">
              © {currentYear} Calibi Score. All rights reserved.
            </span>
            <span className="hidden sm:inline text-slate-300 dark:text-slate-700">·</span>
            <span className="text-slate-500 dark:text-slate-400 font-medium">
              Powered by <span className="font-bold text-slate-700 dark:text-slate-200">MindLyft AI Pvt. Limited</span>
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-slate-500 dark:text-slate-400">
            <Link href="/terms" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition">
              Terms
            </Link>
            <span>·</span>
            <Link href="/privacy" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition">
              Privacy
            </Link>
            <span>·</span>
            <Link href="/refunds" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition">
              Cancellation &amp; Refunds
            </Link>
            <span>·</span>
            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Verified &amp; Proctored
            </span>
          </div>
        </div>
      </div>
    </footer>
  )
}
