import { Navbar } from '@/components/Navbar'
import { Footer } from '@/components/Footer'
import Link from 'next/link'
import { RefreshCcw, ArrowLeft, CheckCircle2, AlertCircle } from 'lucide-react'

export const metadata = {
  title: 'Cancellation & Refund Policy — Calibi Score',
  description: 'Policy regarding assessment attempts, cancellations, technical disruptions, and refund eligibility.',
}

export default function RefundsPage() {
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
          <span className="chip !bg-amber-50 !text-amber-800 !border-amber-200 font-bold mb-3">
            <RefreshCcw className="h-3.5 w-3.5 mr-1 text-amber-600" /> Transparent Billing &amp; Credits
          </span>
          <h1 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
            Cancellation &amp; Refund Policy
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Last Updated: January 2026 · Calibi Score Employability &amp; Assessment Platform
          </p>
        </div>

        {/* Policy Body */}
        <div className="glass-card !p-8 sm:!p-10 space-y-8 text-slate-700 leading-relaxed text-sm sm:text-base">
          <section>
            <h2 className="text-lg font-black text-slate-900 mb-2 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-100 text-amber-800 text-xs font-black">1</span>
              Free Student Assessments
            </h2>
            <p>
              The baseline Calibi Score assessment and select placement diagnostic mocks are provided free of charge to eligible university engineering and technology students. For complimentary evaluations, no payment details are requested, and cancellation involves simply discontinuing the session.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-black text-slate-900 mb-2 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-100 text-amber-800 text-xs font-black">2</span>
              Paid Mock Packs &amp; Company Assessment Credits
            </h2>
            <p className="mb-3">
              Where premium company mock packs or specialized institutional evaluations are purchased:
            </p>
            <ul className="space-y-2 pl-2">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-1 shrink-0" />
                <span><strong>Pre-Start Cancellation:</strong> If an assessment credit has been purchased but not yet initiated, candidates may request a 100% refund or credit transfer within 7 days of purchase.</span>
              </li>
              <li className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-amber-600 mt-1 shrink-0" />
                <span><strong>Initiated / Completed Assessments:</strong> Once an assessment timer begins and questions are delivered, or once a verified Calibi Score report and tamper-evident PDF credential have been generated, the fee becomes non-refundable due to consumed serverless evaluation compute and AI grading infrastructure.</span>
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-black text-slate-900 mb-2 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-100 text-amber-800 text-xs font-black">3</span>
              Platform Technical Failures &amp; Session Resets
            </h2>
            <p>
              In the unlikely event that a verifiable technical defect on our platform (e.g., server outage, grader failure, or database connectivity interruption) prevents a candidate from completing their assessment or receiving their score, Calibi Score guarantees:
            </p>
            <div className="mt-3 p-4 rounded-2xl bg-indigo-50/70 border border-indigo-200 text-sm text-indigo-900 space-y-1.5 font-medium">
              <div>✓ An immediate, complimentary reset of the assessment attempt.</div>
              <div>✓ Full preservation of candidate profile data and prior completed benchmarks.</div>
              <div>✓ A 100% refund of any paid fees if the candidate opts not to retake the test.</div>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-black text-slate-900 mb-2 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-100 text-amber-800 text-xs font-black">4</span>
              Refund Processing Window
            </h2>
            <p>
              Approved refunds are initiated within 48 hours of review and credited back to the original payment source (UPI, net banking, or debit/credit card) within 5 to 7 business days, depending on your banking provider.
            </p>
          </section>

          <section className="pt-2 border-t border-slate-200/80">
            <h2 className="text-lg font-black text-slate-900 mb-2 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-100 text-amber-800 text-xs font-black">5</span>
              How to Submit a Refund or Reset Request
            </h2>
            <p>
              To file a cancellation, reset, or refund inquiry, email{' '}
              <a href="mailto:support@calibiai.com" className="font-semibold text-indigo-600 hover:underline">
                support@calibiai.com
              </a>{' '}
              with your registered email address, assessment name, and a brief description of the issue. You can also reach our team via our official{' '}
              <a
                href="https://www.instagram.com/calibiai/"
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-pink-600 hover:underline"
              >
                Instagram
              </a>{' '}
              or{' '}
              <a
                href="https://www.linkedin.com/company/calibiai-academy"
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-indigo-600 hover:underline"
              >
                LinkedIn
              </a>{' '}
              support desks.
            </p>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  )
}
