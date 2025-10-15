import { analyzeSentiment, SentimentLabel } from './sentiment'

export type LabeledSentiment = { text: string; label: SentimentLabel }
export type LabeledRisk = { text: string; atRisk: boolean }

export type Metrics = { precision: number; recall: number; f1: number; support: number }
export type BinaryReport = { positive: Metrics; negative: Metrics; macroAvg: Metrics }
export type TernaryReport = { positive: Metrics; neutral: Metrics; negative: Metrics; macroAvg: Metrics }

function safeDiv(a: number, b: number) {
  return b === 0 ? 0 : a / b
}

function metrics(tp: number, fp: number, fn: number, support: number): Metrics {
  const precision = safeDiv(tp, tp + fp)
  const recall = safeDiv(tp, tp + fn)
  const f1 = safeDiv(2 * precision * recall, precision + recall)
  return { precision, recall, f1, support }
}

export function evaluateSentiment(entries: LabeledSentiment[]): { report: TernaryReport; confusion: Record<string, Record<string, number>> } {
  const labels: SentimentLabel[] = ['positive', 'neutral', 'negative']
  const conf: Record<string, Record<string, number>> = { positive: { positive: 0, neutral: 0, negative: 0 }, neutral: { positive: 0, neutral: 0, negative: 0 }, negative: { positive: 0, neutral: 0, negative: 0 } }
  for (const e of entries) {
    const pred = analyzeSentiment(e.text).label
    conf[e.label][pred] += 1
  }
  const classReports: Record<SentimentLabel, Metrics> = {
    positive: metrics(conf.positive.positive, conf.neutral.positive + conf.negative.positive, conf.positive.neutral + conf.positive.negative, Object.values(conf.positive).reduce((a, b) => a + b, 0)),
    neutral: metrics(conf.neutral.neutral, conf.positive.neutral + conf.negative.neutral, conf.neutral.positive + conf.neutral.negative, Object.values(conf.neutral).reduce((a, b) => a + b, 0)),
    negative: metrics(conf.negative.negative, conf.positive.negative + conf.neutral.negative, conf.negative.positive + conf.negative.neutral, Object.values(conf.negative).reduce((a, b) => a + b, 0)),
  }
  const macroAvg: Metrics = {
    precision: (classReports.positive.precision + classReports.neutral.precision + classReports.negative.precision) / 3,
    recall: (classReports.positive.recall + classReports.neutral.recall + classReports.negative.recall) / 3,
    f1: (classReports.positive.f1 + classReports.neutral.f1 + classReports.negative.f1) / 3,
    support: entries.length,
  }
  return { report: { positive: classReports.positive, neutral: classReports.neutral, negative: classReports.negative, macroAvg }, confusion: conf }
}

export function evaluateRisk(entries: LabeledRisk[], threshold = 0.4): { report: BinaryReport; confusion: { tp: number; tn: number; fp: number; fn: number } } {
  let tp = 0, tn = 0, fp = 0, fn = 0
  for (const e of entries) {
    const a = analyzeSentiment(e.text)
    const pred = a.risk.crisis || (a.risk.score ?? 0) >= threshold
    if (e.atRisk && pred) tp++
    else if (!e.atRisk && !pred) tn++
    else if (!e.atRisk && pred) fp++
    else fn++
  }
  const pos = metrics(tp, fp, fn, tp + fn)
  const neg = metrics(tn, fn, fp, tn + fp)
  const macroAvg: Metrics = { precision: (pos.precision + neg.precision) / 2, recall: (pos.recall + neg.recall) / 2, f1: (pos.f1 + neg.f1) / 2, support: entries.length }
  return { report: { positive: pos, negative: neg, macroAvg }, confusion: { tp, tn, fp, fn } }
}
