import { Navbar } from '@/components/Navbar'
import { Footer } from '@/components/Footer'
import Link from 'next/link'
import { Lock, ArrowLeft, CheckCircle2 } from 'lucide-react'

export const metadata = {
  title: 'Privacy Policy — Calibi Score',
  description: 'How Calibi Score collects, protects, and uses candidate data and assessment telemetry.',
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen flex flex-col justify-between">
      <Navbar />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-12 flex-1">
        {/* Breadcrumb / Back button */}
        <div className="mb-6">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-indigo-600 transition"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Home
          </Link>
        </div>

        {/* Hero header */}
        <div className="glass-card !p-8 sm:!p-10 mb-8 animate-fade-up">
          <span className="chip !bg-emerald-50 !text-emerald-700 !border-emerald-200 font-bold mb-3">
            <Lock className="h-3.5 w-3.5 mr-1" /> Data Protection &amp; Security
          </span>
          <h1 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
            Privacy Policy
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Last Updated: January 2026 · Calibi Score Employability &amp; Assessment Platform
          </p>
        </div>

        {/* Privacy Policy Body */}
        <div className="glass-card !p-8 sm:!p-10 space-y-8 text-slate-700 leading-relaxed text-sm sm:text-base">
          <section>
            <h2 className="text-lg font-black text-slate-900 mb-2 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 text-xs font-black">1</span>
              Information We Collect
            </h2>
            <p className="mb-3">
              We collect information that allows us to authenticate you, administer proctored assessments, and generate your verified Calibi Score:
            </p>
            <ul className="space-y-2 pl-2">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-indigo-600 mt-1 shrink-0" />
                <span><strong>Account &amp; Profile Details:</strong> Full name, university email address, graduation year, engineering branch, and phone number.</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-indigo-600 mt-1 shrink-0" />
                <span><strong>Assessment Submissions:</strong> Code drafts, unit test executions, aptitude responses, speech audio clips for English fluency evaluation, and prompt engineering solutions.</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-indigo-600 mt-1 shrink-0" />
                <span><strong>Proctoring Telemetry:</strong> Fullscreen events, window focus changes, and hardware check confirmations to preserve test integrity.</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-indigo-600 mt-1 shrink-0" />
                <span><strong>Resume &amp; Career Materials:</strong> Resumes voluntarily uploaded for AI parsing and technical skills gap analysis.</span>
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-black text-slate-900 mb-2 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 text-xs font-black">2</span>
              How We Use Candidate Information
            </h2>
            <p className="mb-2">Your data is utilized solely for legitimate educational and recruitment readiness objectives:</p>
            <ul className="list-disc pl-5 space-y-1.5 text-slate-600">
              <li>Computing your verified 1000-point Calibi Score across the 6 skill dimensions.</li>
              <li>Generating tamper-evident PDF talent reports and shareable credential hashes.</li>
              <li>Enabling approved enterprise recruiters and campus placement cells to verify candidate scores upon explicit consent.</li>
              <li>Training heuristic benchmark distributions to ensure fair percentiles across student cohorts.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-black text-slate-900 mb-2 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 text-xs font-black">3</span>
              Data Protection and Storage Security
            </h2>
            <p>
              All candidate data is protected by enterprise-grade 256-bit AES encryption at rest and TLS 1.3 in transit. Database access is governed by strict PostgreSQL Row-Level Security (RLS) policies ensuring students can only access their own submissions and evaluations. We never sell or lease candidate personal information to third-party ad brokers.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-black text-slate-900 mb-2 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 text-xs font-black">4</span>
              Camera, Microphone, and Audio Recordings
            </h2>
            <p>
              The English communication module records candidate speech responses to evaluate fluency, pronunciation, grammar, and vocabulary. Audio clips are processed strictly for grading purposes. We do not maintain perpetual invasive video surveillance feeds of candidates.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-black text-slate-900 mb-2 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 text-xs font-black">5</span>
              Candidate Rights &amp; Data Deletion
            </h2>
            <p>
              Candidates maintain complete control over their personal profile. You may review your test history, download PDF credential reports, or submit a request to wipe your account and stored submission logs by contacting our privacy compliance desk.
            </p>
          </section>

          <section className="pt-2 border-t border-slate-200/80">
            <h2 className="text-lg font-black text-slate-900 mb-2 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 text-xs font-black">6</span>
              Contact Our Data Protection Officer
            </h2>
            <p>
              For data protection questions or privacy requests, please write to{' '}
              <a href="mailto:privacy@calibiai.com" className="font-semibold text-indigo-600 hover:underline">
                privacy@calibiai.com
              </a>{' '}
              or visit our official LinkedIn page at{' '}
              <a
                href="https://www.linkedin.com/company/calibiai-academy"
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-indigo-600 hover:underline"
              >
                Calibi Academy
              </a>.
            </p>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  )
}
