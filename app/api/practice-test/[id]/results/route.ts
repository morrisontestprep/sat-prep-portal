import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'

// GET /api/practice-test/[id]/results
// Returns full test results including scores, per-module answers with question details.
// Used by both the student results page and teacher review.

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: testId } = await params

  // Teacher can view any test; students can only view their own
  const TEACHER_EMAIL = process.env.TEACHER_EMAIL ?? 'morrisontestprep@gmail.com'
  const isTeacher = user.email === TEACHER_EMAIL

  const query = supabase
    .from('practice_tests')
    .select('*')
    .eq('id', testId)

  if (!isTeacher) query.eq('student_id', user.id)

  const { data: test, error } = await query.single()
  if (error || !test) return NextResponse.json({ error: 'Test not found' }, { status: 404 })

  if (test.status !== 'completed') {
    return NextResponse.json({ error: 'Test not completed yet' }, { status: 400 })
  }

  // Fetch all answers for this test
  const { data: answers } = await supabase
    .from('practice_test_answers')
    .select('*')
    .eq('test_id', testId)
    .order('module')
    .order('position')

  // Collect all unique question IDs
  const allQuestionIds = [
    ...test.rw_m1_question_ids,
    ...(test.rw_m2_question_ids ?? []),
    ...test.math_m1_question_ids,
    ...(test.math_m2_question_ids ?? []),
  ]

  const { data: questions } = await supabase
    .from('questions')
    .select('id, subject, domain, skill, difficulty, correct_answer, question_image_url, answer_image_url')
    .in('id', allQuestionIds)

  type QuestionDetail = { id: string; domain: string; skill: string; difficulty: string; correct_answer: string; question_image_url: string | null; answer_image_url: string | null }
  const questionMap = Object.fromEntries((questions ?? []).map((q) => [q.id, q])) as Record<string, QuestionDetail>

  // Build per-module structure preserving original question order
  type ModuleKey = 'rw_m1' | 'rw_m2' | 'math_m1' | 'math_m2'
  const moduleOrder: ModuleKey[] = ['rw_m1', 'rw_m2', 'math_m1', 'math_m2']
  const moduleIds: Record<ModuleKey, string[]> = {
    rw_m1:   test.rw_m1_question_ids,
    rw_m2:   test.rw_m2_question_ids ?? [],
    math_m1: test.math_m1_question_ids,
    math_m2: test.math_m2_question_ids ?? [],
  }

  const answersByModule = Object.fromEntries(
    moduleOrder.map(mod => [
      mod,
      (answers ?? []).filter((a: { module: string }) => a.module === mod),
    ])
  )

  const modules = moduleOrder.map(mod => {
    const ids = moduleIds[mod]
    const modAnswers = answersByModule[mod] as {
      question_id: string
      selected_answer: string | null
      correct_answer: string
      is_correct: boolean | null
      flagged: boolean
      time_spent_seconds: number | null
      position: number
    }[]
    const answerMap = Object.fromEntries(modAnswers.map(a => [a.question_id, a]))

    return {
      module: mod,
      questions: ids.map((qid, i) => ({
        position:         i + 1,
        question:         questionMap[qid] ?? null,
        selectedAnswer:   answerMap[qid]?.selected_answer ?? null,
        correctAnswer:    answerMap[qid]?.correct_answer ?? questionMap[qid]?.correct_answer ?? null,
        isCorrect:        answerMap[qid]?.is_correct ?? null,
        flagged:          answerMap[qid]?.flagged ?? false,
        timeSpentSeconds: answerMap[qid]?.time_spent_seconds ?? null,
      })),
    }
  })

  return NextResponse.json({
    testId,
    createdAt:   test.created_at,
    completedAt: test.completed_at,
    scores: {
      rw:    test.rw_scaled_score,
      math:  test.math_scaled_score,
      total: test.total_scaled_score,
    },
    rawCorrect: {
      rwM1:   test.rw_m1_correct,
      rwM2:   test.rw_m2_correct,
      mathM1: test.math_m1_correct,
      mathM2: test.math_m2_correct,
    },
    modules,
  })
}
