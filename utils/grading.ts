/**
 * Parse a string answer into a numeric value.
 * Handles: integers, decimals, fractions (a/b), negative numbers, leading dots (.5)
 */
export function parseNumericAnswer(input: string): number | null {
  const s = input.trim()
  if (s === '') return null

  // Handle fractions like "5/2", "-3/4"
  const fractionMatch = s.match(/^(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)$/)
  if (fractionMatch) {
    const num = parseFloat(fractionMatch[1])
    const den = parseFloat(fractionMatch[2])
    if (den === 0) return null
    return num / den
  }

  // Handle regular numbers (integers, decimals, negative, leading dot)
  const num = parseFloat(s)
  if (!isNaN(num) && isFinite(num)) return num

  return null
}

/**
 * Check if a student's free-response answer is correct.
 * The correct_answer field may contain multiple acceptable answers separated by commas,
 * or a single value. We parse and compare numerically.
 *
 * Examples:
 *   correct = "2.5", student = "5/2" → true
 *   correct = "7/2, 3.5", student = "3.50" → true
 *   correct = "1/3", student = "0.333" → true (within tolerance)
 */
export function checkFreeResponse(studentAnswer: string, correctAnswer: string): boolean {
  const studentVal = parseNumericAnswer(studentAnswer)
  if (studentVal === null) return false

  // Split correct answer by comma (some questions accept multiple forms)
  // Also try the whole string as one answer
  const possibleCorrect = correctAnswer.split(/[,;]/).map(s => s.trim()).filter(Boolean)
  // Also add the whole string in case there's no separator
  if (possibleCorrect.length === 0) possibleCorrect.push(correctAnswer.trim())

  for (const correct of possibleCorrect) {
    const correctVal = parseNumericAnswer(correct)
    if (correctVal === null) {
      // Direct string comparison as fallback
      if (studentAnswer.trim().toLowerCase() === correct.toLowerCase()) return true
      continue
    }

    // Check exact or within tolerance
    if (correctVal === studentVal) return true
    // Relative tolerance for floating point (0.001% or absolute 0.0001)
    const absDiff = Math.abs(correctVal - studentVal)
    if (absDiff < 0.0001) return true
    if (correctVal !== 0 && absDiff / Math.abs(correctVal) < 0.00001) return true
  }

  return false
}

/**
 * Determine if a question is free-response (not multiple choice).
 * Multiple choice correct_answer will be exactly "A", "B", "C", or "D".
 */
export function isFreeResponse(correctAnswer: string): boolean {
  const trimmed = correctAnswer.trim().toUpperCase()
  return !['A', 'B', 'C', 'D'].includes(trimmed)
}
