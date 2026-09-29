'use client'

import { useState } from 'react'
import type { Company } from '@/lib/company/types'
import { companyLogoUrl } from '@/lib/company/logos'

/** Company logo from its official site's favicon, with the brand-colour initials as a resilient fallback. */
export function CompanyBadge({ company, size = 40 }: { company: Pick<Company, 'slug' | 'initials' | 'color' | 'name'>; size?: number }) {
  const logoUrl = companyLogoUrl(company.slug)
  const [failedLogoUrl, setFailedLogoUrl] = useState<string | null>(null)
  const showLogo = !!logoUrl && failedLogoUrl !== logoUrl

  return (
    <span
      aria-hidden
      title={company.name}
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-2xl font-black shadow-sm ring-1 ring-black/5 ${showLogo ? 'border border-slate-200/80 bg-white' : 'text-white'}`}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(10, Math.round(size * 0.36)),
        background: showLogo ? '#fff' : `linear-gradient(135deg, ${company.color}, ${company.color}cc)`,
      }}
    >
      {showLogo ? (
        <img
          src={logoUrl!}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          className="h-full w-full object-contain p-1.5"
          onError={() => setFailedLogoUrl(logoUrl)}
        />
      ) : (
        company.initials
      )}
    </span>
  )
}
