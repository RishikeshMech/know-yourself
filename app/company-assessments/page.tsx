'use client'
export const dynamic = 'force-dynamic'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Navbar } from '@/components/Navbar'
import { Footer } from '@/components/Footer'
import { useStore } from '@/lib/store'
import { CompanyCatalog } from '@/components/company/CompanyCatalog'

/** Full-page view of every company assessment, grouped by company tag. */
export default function Page() {
  const router = useRouter()
  const { user, hydrated } = useStore()
  useEffect(() => { if (hydrated && !user) router.replace('/login') }, [hydrated, user, router])
  return (
    <div className="min-h-screen flex flex-col justify-between">
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex-1 w-full">
        <Link href="/dashboard/student" className="text-xs font-semibold text-indigo-600">← Back to dashboard</Link>
        <div className="mt-3 glass-card animate-fade-up">
          {hydrated && user ? <CompanyCatalog /> : <div className="h-64 animate-pulse rounded-2xl bg-slate-100/60" />}
        </div>
      </main>
      <Footer />
    </div>
  )
}
