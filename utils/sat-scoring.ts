// ─────────────────────────────────────────────────────────────────────────────
// SAT Score Lookup Tables
//
// Source: albert.io Digital SAT Score Calculator
// (https://www.albert.io/blog/sat-score-calculator/)
//
// Formula: section_score = M1_TABLE[m1_correct] + M2_TABLE[m2_correct]
// Both tables indexed 0..maxRaw (0 correct → index 0, maxRaw correct → last index)
//
// Verified example: RW 18/27 M1 + 22/27 M2 → 310 + 280 = 590 ✓
//
// Note: albert.io uses a single M2 curve regardless of hard/easy routing.
// The adaptive routing affects question difficulty (and thus score accuracy),
// but both M2 paths use the same raw→scaled conversion table here.
// ─────────────────────────────────────────────────────────────────────────────

// Reading & Writing Module 1 — 28 values (index 0 = 0 correct … index 27 = 27 correct)
const RW_M1: readonly number[] = [
   100, 100, 120, 140, 160, 170, 180, 190,
   200, 200, 210, 210, 220, 230, 240, 260,
   270, 290, 310, 320, 340, 360, 370, 390,
   410, 430, 440, 460,
]

// Reading & Writing Module 2 — 28 values (index 0 = 0 correct … index 27 = 27 correct)
const RW_M2: readonly number[] = [
   100, 100, 100, 110, 110, 110, 120, 120,
   120, 130, 130, 140, 150, 170, 190, 190,
   200, 210, 230, 240, 250, 260, 280, 290,
   300, 310, 330, 340,
]

// Math Module 1 — 23 values (index 0 = 0 correct … index 22 = 22 correct)
const MATH_M1: readonly number[] = [
   100, 100, 120, 140, 160, 160, 180, 180,
   200, 200, 210, 240, 260, 280, 300, 320,
   340, 360, 390, 410, 430, 450, 470,
]

// Math Module 2 — 23 values (index 0 = 0 correct … index 22 = 22 correct)
const MATH_M2: readonly number[] = [
   100, 100, 100, 120, 120, 130, 150, 170,
   170, 170, 190, 190, 200, 200, 210, 230,
   240, 260, 270, 290, 300, 320, 330,
]

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function computeRWScore(m1Correct: number, m2Correct: number): number {
  const m1 = RW_M1[clamp(m1Correct, 0, 27)]
  const m2 = RW_M2[clamp(m2Correct, 0, 27)]
  return clamp(m1 + m2, 200, 800)
}

export function computeMathScore(m1Correct: number, m2Correct: number): number {
  const m1 = MATH_M1[clamp(m1Correct, 0, 22)]
  const m2 = MATH_M2[clamp(m2Correct, 0, 22)]
  return clamp(m1 + m2, 200, 800)
}

export function computeTotalScore(rwScore: number, mathScore: number): number {
  return clamp(rwScore + mathScore, 400, 1600)
}

// Convenience: compute all three scores at once
export function computeScores(
  rwM1Correct: number,
  rwM2Correct: number,
  mathM1Correct: number,
  mathM2Correct: number,
): { rw: number; math: number; total: number } {
  const rw    = computeRWScore(rwM1Correct, rwM2Correct)
  const math  = computeMathScore(mathM1Correct, mathM2Correct)
  const total = computeTotalScore(rw, math)
  return { rw, math, total }
}

// Routing thresholds (from SAT YAML spec)
export const RW_HARD_MODULE_THRESHOLD   = 19  // ≥ this → hard M2
export const MATH_HARD_MODULE_THRESHOLD = 15  // ≥ this → hard M2

export function routeRWModule2(m1Correct: number): 'hard' | 'easy' {
  return m1Correct >= RW_HARD_MODULE_THRESHOLD ? 'hard' : 'easy'
}

export function routeMathModule2(m1Correct: number): 'hard' | 'easy' {
  return m1Correct >= MATH_HARD_MODULE_THRESHOLD ? 'hard' : 'easy'
}
