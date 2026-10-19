import { Navbar } from '@/components/Navbar'
import { Footer } from '@/components/Footer'
import Link from 'next/link'
import { ShieldCheck, FileText, ArrowLeft, CheckCircle2 } from 'lucide-react'

export const metadata = {
  title: 'Terms & Conditions — Calibi Score',
  description: 'Terms of service and code of conduct for taking Calibi Score employability assessments.',
}

export default function TermsPage() {
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
          <span className="chip !bg-indigo-50 !text-indigo-700 !border-indigo-200 font-bold mb-3">
            <FileText className="h-3.5 w-3.5 mr-1" /> Legal Agreement
          </span>
          <h1 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
            Terms &amp; Conditions
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Last Updated: January 2026 · Calibi Score Employability &amp; Assessment Platform
          </p>
        </div>

        {/* Terms Content Body */}
        <div className="glass-card !p-8 sm:!p-10 space-y-8 text-slate-700 leading-relaxed text-sm sm:text-base">
          <section>
            <h2 className="text-lg font-black text-slate-900 mb-2 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700 text-xs font-black">1</span>
              Acceptance of Terms
            </h2>
            <p>
              By accessing or using the Calibi Score platform (accessible via web and mobile interfaces), registering an account, or undertaking any proctored assessment or company mock exam, you agree to be bound by these Terms &amp; Conditions and our Privacy Policy. If you do not agree to these terms, you may not register or attempt any assessment.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-black text-slate-900 mb-2 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700 text-xs font-black">2</span>
              Candidate Eligibility and Account Responsibility
            </h2>
            <p>
              The platform is provided primarily for engineering, science, and technology students, graduates, and professionals seeking career readiness evaluation. You agree to provide true, accurate, and current information regarding your identity, academic status, and contact details. Each candidate is permitted only one active profile; creating duplicate accounts to re-attempt tests dishonestly is strictly prohibited.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-black text-slate-900 mb-2 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700 text-xs font-black">3</span>
              Assessment Integrity and Anti-Cheat Regulations
            </h2>
            <p className="mb-3">
              To ensure every Calibi Score represents an honest, verified reflection of technical and cognitive capability, all official assessments employ browser-level proctoring and telemetry. While undergoing an assessment, candidates agree to:
            </p>
            <ul className="space-y-2 pl-2">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-1 shrink-0" />
                <span>Maintain full-screen mode without switching tabs, minimizing windows, or launching unauthorized applications.</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-1 shrink-0" />
                <span>Refrain from using secondary monitors, external communication software, or unapproved generative AI assistants during coding stages.</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-1 shrink-0" />
                <span>Complete all English verbal and listening recordings independently without impersonation or third-party assistance.</span>
              </li>
            </ul>
            <p className="mt-3 text-xs text-rose-600 font-medium bg-rose-50 p-3 rounded-xl border border-rose-200">
              Violations of test integrity will result in immediate disqualification, cancellation of the assessment result, and flagging on verified credential reports.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-black text-slate-900 mb-2 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700 text-xs font-black">4</span>
              Scoring Methodology and Credential Verification
            </h2>
            <p>
              The Calibi Score is an objective 1000-point benchmark computed across English communication, problem solving, AI debugging, feature development, prompt engineering, and cognitive evaluation. Every generated PDF report contains a cryptographic, tamper-evident hash that employers and campus placement cells can verify directly against our database.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-black text-slate-900 mb-2 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700 text-xs font-black">5</span>
              Intellectual Property
            </h2>
            <p>
              All assessment questions, algorithmic problem statements, test suites, rubric scoring models, UI designs, and logos are the intellectual property of Calibi Score. You may not copy, scrape, distribute, publish, or leak question banks or solution code onto third-party forums or repositories.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-black text-slate-900 mb-2 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700 text-xs font-black">6</span>
              Limitation of Liability
            </h2>
            <p>
              While Calibi Score strives for 99.9% uptime, we are not liable for candidate internet disconnections, device malfunctions, or power outages during live exams. In the event of a verified platform-side technical fault, eligible candidates are granted an assessment reset pursuant to our Cancellation &amp; Refund Policy.
            </p>
          </section>

          <section className="pt-2 border-t border-slate-200/80">
            <h2 className="text-lg font-black text-slate-900 mb-2 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700 text-xs font-black">7</span>
              Contact &amp; Grievance Redressal
            </h2>
            <p>
              If you have any questions, disputes, or inquiries regarding these Terms, please reach out to our team at{' '}
              <a href="mailto:support@calibiai.com" className="font-semibold text-indigo-600 hover:underline">
                support@calibiai.com
              </a>{' '}
              or connect with our LinkedIn / Instagram channels.
            </p>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  )
}
