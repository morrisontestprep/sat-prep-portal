import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'

// GET /api/practice-test/[id]/resume
// Returns current test state so the client can rehydrate exactly where left off.
// Includes: current module, question IDs + details, previously saved answers, seconds remaining.

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: testId } = await params

  const { data: test, error } = await supabase
    .from('practice_tests')
    .select('*')
    .eq('id', testId)
    .eq('student_id', user.id)
    .single()

  if (error || !test) return NextResponse.json({ error: 'Test not found' }, { status: 404 })

  // Determine which module the student is currently on
  let currentModule: string
  let questionIds: string[]
  let timeSeconds: number

  switch (test.status) {
    case 'active':
      currentModule = 'rw_m1'
      questionIds   = test.rw_m1_question_ids
      timeSeconds   = test.rw_m1_seconds_remaining ?? 32 * 60
      break
    case 'rw_m2_ready':
      currentModule = 'rw_m2'
      questionIds   = test.rw_m2_question_ids ?? []
      timeSeconds   = test.rw_m2_seconds_remaining ?? 32 * 60
      break
    case 'break':
      currentModule = 'math_m1'
      questionIds   = test.math_m1_question_ids
      timeSeconds   = test.math_m1_seconds_remaining ?? 35 * 60
      break
    case 'math_m2_ready':
      currentModule = 'math_m2'
      questionIds   = test.math_m2_question_ids ?? []
      timeSeconds   = test.math_m2_seconds_remaining ?? 35 * 60
      break
    case 'completed':
      return NextResponse.json({
        status: 'completed',
        scores: {
          rw:    test.rw_scaled_score,
          math:  test.math_scaled_score,
          total: test.total_scaled_score,
        },
      })
    default:
      currentModule = 'rw_m1'
      questionIds   = test.rw_m1_question_ids
      timeSeconds   = test.rw_m1_seconds_remaining ?? 32 * 60
  }

  // Fetch question details
  const { data: questions } = await supabase
    .from('questions')
    .select('id, subject, domain, skill, difficulty, correct_answer, question_image_url, answer_image_url')
    .in('id', questionIds)

  const ordered = questionIds
    .map(id => (questions ?? []).find((q: { id: string }) => q.id === id))
    .filter(Boolean)

  // Fetch existing answers for the current module (so client can restore state)
  const { data: savedAnswers } = await supabase
    .from('practice_test_answers')
    .select('question_id, selected_answer, flagged, time_spent_seconds, position')
    .eq('test_id', testId)
    .eq('module', currentModule)

  return NextResponse.json({
    testId,
    status:        test.status,
    currentModule,
    questions:     ordered,
    timeSeconds,
    savedAnswers:  savedAnswers ?? [],
  })
}
