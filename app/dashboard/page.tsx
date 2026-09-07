'use client'
export const dynamic = 'force-dynamic'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useStore } from '@/lib/store'
import { dashboardRouteForRole } from '@/lib/nextStep'

function Inner() {
  const router = useRouter()
  const { user, hydrated } = useStore()

  // `/dashboard` is a stable, role-agnostic entry point: it forwards a signed-in
  // visitor to their own dashboard home and a signed-out one to /login.
  useEffect(() => {
    if (!hydrated) return
    if (!user) {
      router.replace('/login')
      return
    }
    router.replace(dashboardRouteForRole(user.role))
  }, [hydrated, user, router])

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="glass-card animate-fade-up flex items-center gap-3 px-6 py-4">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
        <span className="text-sm font-bold text-slate-700">Opening your dashboard…</span>
      </div>
    </div>
  )
}

export default function DashboardIndexPage() {
  return <Inner />
}
