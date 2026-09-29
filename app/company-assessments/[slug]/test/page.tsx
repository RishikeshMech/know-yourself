'use client'
export const dynamic = 'force-dynamic'
import { CompanyAssessmentRunner } from '@/components/company/CompanyAssessmentRunner'

/**
 * The proctored exam screen of a company mock assessment. All exam behaviour
 * (fullscreen lock, display and focus proctoring, camera gate, watermark,
 * autosave, review and auto-submit) lives in CompanyAssessmentRunner.
 */
export default function Page({ params }: { params: { slug: string } }) {
  return <CompanyAssessmentRunner slug={params.slug} />
}
