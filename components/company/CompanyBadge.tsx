import type { Company } from '@/lib/company/types'

/** Brand-coloured initials badge (no third-party logos are shipped). */
export function CompanyBadge({ company, size = 40 }: { company: Pick<Company, 'initials' | 'color' | 'name'>; size?: number }) {
  return (
    <span
      aria-hidden
      title={company.name}
      className="inline-flex shrink-0 items-center justify-center rounded-xl font-black text-white shadow-sm ring-1 ring-black/5"
      style={{
        width: size,
        height: size,
        fontSize: Math.max(10, Math.round(size * 0.36)),
        background: `linear-gradient(135deg, ${company.color}, ${company.color}cc)`,
      }}
    >
      {company.initials}
    </span>
  )
}
