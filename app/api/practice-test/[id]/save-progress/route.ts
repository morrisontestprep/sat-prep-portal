import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'

// POST /api/practice-test/[id]/save-progress
// Saves mid-module answers + timer state without advancing the test.
// Called on pause and on tab close (via sendBeacon).
// Body: { module, answers[], secondsRemaining }

type AnswerInput = {
  questionId: string
  correctAnswer: string
  selectedAnswer: string | null
  flagged: boolean
  timeSpentSeconds: number
  position: number
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: testId } = await params

  let body: { module: string; answers: AnswerInput[]; secondsRemaining: number }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }
  const { module, answers, secondsRemaining } = body

  // Verify test belongs to this student
  const { data: test } = await supabase
    .from('practice_tests')
    .select('id')
    .eq('id', testId)
    .eq('student_id', user.id)
    .single()

  if (!test) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Build answer rows (only include answered questions — skip nulls)
  const answerRows = answers
    .filter(a => a.selectedAnswer !== null || a.flagged)
    .map(a => ({
      test_id:            testId,
      student_id:         user.id,
      module,
      position:           a.position,
      question_id:        a.questionId,
      selected_answer:    a.selectedAnswer ?? null,
      correct_answer:     a.correctAnswer,
      is_correct:         null, // not graded until module submit
      flagged:            a.flagged,
      time_spent_seconds: a.timeSpentSeconds,
    }))

  // Delete existing partial answers for this module, then insert fresh
  await supabase
    .from('practice_test_answers')
    .delete()
    .eq('test_id', testId)
    .eq('module', module)

  if (answerRows.length > 0) {
    await supabase.from('practice_test_answers').insert(answerRows)
  }

  // Save seconds remaining for the current module
  const timerField: Record<string, number> = {}
  if (module === 'rw_m1')   timerField['rw_m1_seconds_remaining']   = secondsRemaining ?? 0
  if (module === 'rw_m2')   timerField['rw_m2_seconds_remaining']   = secondsRemaining ?? 0
  if (module === 'math_m1') timerField['math_m1_seconds_remaining'] = secondsRemaining ?? 0
  if (module === 'math_m2') timerField['math_m2_seconds_remaining'] = secondsRemaining ?? 0

  await supabase.from('practice_tests').update(timerField).eq('id', testId)

  return NextResponse.json({ ok: true })
}
