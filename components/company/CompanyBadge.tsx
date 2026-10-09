'use client'

import { useState } from 'react'
import type { Company } from '@/lib/company/types'
import { companyLogo } from '@/lib/company/logos'

/**
 * Every badge is drawn on the same 7:4 "logo plate".
 *
 * Brand marks are wildly different shapes — TCS and Dream11 are almost square,
 * but HCLTech, LTIMindtree, Ola and IBM are wide wordmarks that collapse into
 * an unreadable sliver when letterboxed into a square. One fixed plate shape
 * keeps the catalog grid tidy while giving wordmarks the width they need, and
 * square marks simply sit centred in it at their usual size.
 */
const PLATE_ASPECT = 1.75

/**
 * Company logo — a brand mark bundled in `/company-logos` when we ship one,
 * otherwise the official site's favicon, with the brand-colour initials as a
 * resilient fallback.
 */
export function CompanyBadge({ company, size = 40 }: { company: Pick<Company, 'slug' | 'initials' | 'color' | 'name'>; size?: number }) {
  const logo = companyLogo(company.slug)
  const [failedLogo, setFailedLogo] = useState<string | null>(null)
  const showLogo = !!logo && failedLogo !== logo.src

  const height = size
  const width = Math.round(size * PLATE_ASPECT)

  return (
    <span
      aria-hidden
      title={company.name}
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-2xl font-black shadow-sm ring-1 ring-black/5 ${showLogo ? 'border border-slate-200/80 bg-white' : 'text-white'}`}
      style={{
        width,
        height,
        fontSize: Math.max(10, Math.round(size * 0.36)),
        background: showLogo ? '#fff' : `linear-gradient(135deg, ${company.color}, ${company.color}cc)`,
      }}
    >
      {showLogo ? (
        <img
          src={logo!.src}
          alt=""
          width={width}
          height={height}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          className="h-full w-full object-contain p-1.5"
          onError={() => setFailedLogo(logo!.src)}
        />
      ) : (
        company.initials
      )}
    </span>
  )
}
