// Public capability check: only show coding languages with a working runtime on this host.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { availableCodeLanguages } from '@/lib/company/nativeRunner'
import { CODE_LANGUAGES } from '@/lib/company/languages'

export async function GET() {
  const available = new Set(availableCodeLanguages())
  return Response.json({
    languages: CODE_LANGUAGES.filter(({ id }) => available.has(id)),
  }, { headers: { 'Cache-Control': 'public, max-age=60' } })
}
