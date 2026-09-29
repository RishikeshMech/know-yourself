'use client'
export const dynamic = 'force-dynamic'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Navbar } from '@/components/Navbar'
import { useStore } from '@/lib/store'
import { CompanyCatalog } from '@/components/company/CompanyCatalog'

/** Full-page view of every company assessment, grouped by company tag. */
export default function Page() {
  const router = useRouter()
  const { user, hydrated } = useStore()
  useEffect(() => { if (hydrated && !user) router.replace('/login') }, [hydrated, user, router])
  return (
    <div>
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <Link href="/dashboard/student" className="text-xs font-semibold text-indigo-600">← Back to dashboard</Link>
        <div className="mt-3 glass-card animate-fade-up">
          {hydrated && user ? <CompanyCatalog /> : <div className="h-64 animate-pulse rounded-2xl bg-slate-100/60" />}
        </div>
      </main>
    </div>
  )
}
