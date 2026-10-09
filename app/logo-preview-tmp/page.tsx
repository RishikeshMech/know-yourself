/**
 * TEMPORARY verification page — shows every company badge at the four sizes the
 * app actually uses (30 / 40 / 48 / 56 px) so a logo change can be eyeballed in
 * one place instead of clicking through the catalog. Delete this route once the
 * fix is signed off.
 */
import { CompanyBadge } from '@/components/company/CompanyBadge'
import { COMPANIES } from '@/lib/company/catalog'

const BUNDLED = ['tcs', 'hcltech', 'ibm', 'dream11', 'ola', 'ltimindtree']
const COMPARISON = ['infosys', 'wipro', 'google', 'accenture']

export default function Page() {
  const rows = [
    { label: 'Bundled brand marks (were falling back to initials)', slugs: BUNDLED },
    { label: 'Favicon-service marks (unchanged, for comparison)', slugs: COMPARISON },
  ]

  return (
    <main className="mx-auto max-w-4xl p-8">
      <h1 className="text-xl font-black text-slate-900">Company badge check</h1>
      {rows.map((row) => (
        <section key={row.label} className="mt-8">
          <h2 className="text-sm font-bold text-slate-500">{row.label}</h2>
          <div className="mt-3 space-y-3">
            {[30, 40, 48, 56].map((size) => (
              <div key={size} className="flex items-end gap-4 rounded-2xl border border-slate-200 bg-white p-4">
                <span className="w-10 shrink-0 text-xs font-black text-slate-400">{size}px</span>
                {row.slugs.map((slug) => {
                  const company = COMPANIES.find((c) => c.slug === slug)!
                  return (
                    <div key={slug} className="flex flex-col items-center gap-1">
                      <CompanyBadge company={company} size={size} />
                      <span className="text-[10px] font-semibold text-slate-400">{company.name}</span>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </section>
      ))}
    </main>
  )
}
