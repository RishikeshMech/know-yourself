/**
 * Parser for "Ques/50 Companies Steps Assessment Research.docx".
 *
 * The document has two parts that do not fully agree:
 *   1. A prioritised target list ("Priority 1 – Highest Priority" …).
 *   2. Fifty numbered company sections, each with "Step N: Title" + a detail
 *      paragraph. Ten Priority-1 targets have no section of their own, and ten
 *      sectioned companies are not on the target list.
 *
 * Both parts are returned; lib/company/catalog.ts reconciles them (the union of
 * 60 companies) so no documented flow and no priority target is dropped.
 */
export function parseResearch(paragraphs) {
  const targets = []
  let priority = null
  let i = 0
  for (; i < paragraphs.length; i++) {
    const p = paragraphs[i]
    const m = p.match(/^Priority\s+(\d)\b/)
    if (m) { priority = Number(m[1]); continue }
    if (/^Master Question Bank/i.test(p)) break
    if (priority && !/^Priority/.test(p) && p.length < 40 && !/[.:]$/.test(p)) {
      targets.push({ name: p.trim(), priority })
    }
  }

  const companies = {}
  let cur = null
  for (; i < paragraphs.length; i++) {
    const p = paragraphs[i]
    const head = p.match(/^(\d{1,2})\.\s+(.+)$/)
    if (head && Number(head[1]) <= 50 && !/^Step\s/.test(head[2]) && head[2].length < 40) {
      const next = paragraphs[i + 1] || ''
      const pr = next.match(/^Priority\s+(\d)$/)
      cur = {
        no: Number(head[1]),
        subtitle: !pr && !/^Assessment Flow/i.test(next) ? next : null,
        priority: pr ? Number(pr[1]) : null,
        steps: [],
      }
      companies[head[2].trim()] = cur
      continue
    }
    const step = p.match(/^Step\s+(\d+):\s+(.+)$/)
    if (step && cur) {
      cur.steps.push({ no: Number(step[1]), title: step[2].trim(), detail: (paragraphs[i + 1] || '').trim() })
    }
    if (/^Final Company Assessment Sheet Format/i.test(p)) break
  }
  return { targets, companies }
}
