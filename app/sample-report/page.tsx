// Public preview of the CalibiAI Scorecard — reachable straight from the
// landing page ("See a sample report"). Shows the exact same report UI with
// bundled sample data; no account or assessment is needed.
import { StoreProvider } from '@/lib/store'
import { ScoreReport } from '@/components/ScoreReport'
import { SAMPLE_SCORES } from '@/lib/sample'

export default function Page() {
  return (
    <StoreProvider>
      <ScoreReport scores={SAMPLE_SCORES} sample />
    </StoreProvider>
  )
}
