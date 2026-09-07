// Shared server-side row filtering for the admin table + CSV export.
// `college` matches exactly (case-insensitive); `q` searches name / email /
// prn / phone / college substrings. Passing an empty string keeps everything.
export function filterRows<T extends { college: string; name: string; email: string; prn: string; phone: string }>(
  rows: T[],
  opts: { college?: string; q?: string } = {},
): T[] {
  const college = String(opts.college || '').trim().toLowerCase()
  const q = String(opts.q || '').trim().toLowerCase()
  return rows.filter(r => {
    if (college && r.college.trim().toLowerCase() !== college) return false
    if (q) {
      const hay = [r.name, r.email, r.prn, r.phone, r.college].join(' ').toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
}
