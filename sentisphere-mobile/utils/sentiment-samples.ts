import { analyzeSentiment, Analysis } from './sentiment'

export const SAMPLE_TEXTS: string[] = [
  "I'm tired, tired, tired.",
  "I feel like giving up.",
  "Everything sucks. Nothing is working. I'm fine.",
  "I'm dead 😂",
  "I can't handle this",
  "Today I felt content and peaceful after a walk.",
]

export function analyzeSamples(texts: string[] = SAMPLE_TEXTS): Analysis[] {
  return texts.map((t) => analyzeSentiment(t))
}
