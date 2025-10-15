import { analyzeSentiment, Analysis } from './sentiment'

export type TextEntry = { id?: string; text: string; date?: string | Date }

export type RiskTrend = {
  avgComparative: number
  negativeRatio: number
  riskScoreAvg: number
  joyAvg: number
  lowJoyDays: number
  riskTermsTop: string[]
  atRisk: boolean
}

export function computeRiskTrend(entries: TextEntry[]): RiskTrend {
  if (!entries || entries.length === 0) {
    return { avgComparative: 0, negativeRatio: 0, riskScoreAvg: 0, joyAvg: 0, lowJoyDays: 0, riskTermsTop: [], atRisk: false }
  }
  const analyses: Analysis[] = entries.map((e) => analyzeSentiment(e.text))
  const avgComparative = analyses.reduce((a, b) => a + (b.comparative || 0), 0) / analyses.length
  const negativeRatio = analyses.filter((a) => a.label === 'negative').length / analyses.length
  const riskScoreAvg = analyses.reduce((a, b) => a + (b.risk.score || 0), 0) / analyses.length
  const joyAvg = analyses.reduce((a, b) => a + (b.emotions.joy || 0), 0) / analyses.length
  const lowJoyDays = analyses.filter((a) => (a.emotions.joy || 0) < 0.2).length
  const termCounts: Record<string, number> = {}
  analyses.forEach((a) => {
    for (const t of a.risk.terms || []) termCounts[t] = (termCounts[t] || 0) + 1
  })
  const riskTermsTop = Object.entries(termCounts)
    .sort((x, y) => y[1] - x[1])
    .slice(0, 5)
    .map(([t]) => t)

  const anyCrisis = analyses.some((a) => a.risk.crisis)
  const atRisk = anyCrisis || (avgComparative < -0.5 && riskScoreAvg > 0.4 && lowJoyDays >= 3)

  return { avgComparative, negativeRatio, riskScoreAvg, joyAvg, lowJoyDays, riskTermsTop, atRisk }
}
