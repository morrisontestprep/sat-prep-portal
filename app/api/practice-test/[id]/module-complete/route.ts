import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'
import { isFreeResponse, checkFreeResponse } from '@/utils/grading'
import {
  getSeenQuestionIds,
  buildRWModule,
  buildMathModule,
} from '@/utils/practice-test-selection'
import {
  routeRWModule2,
  routeMathModule2,
  computeScores,
} from '@/utils/sat-scoring'
import { notifyTeacher } from '@/utils/teacherNotify'

// POST /api/practice-test/[id]/module-complete
// Body: {
//   module: 'rw_m1' | 'rw_m2' | 'math_m1' | 'math_m2'
//   answers: Array<{
//     questionId: string
//     correctAnswer: string
//     selectedAnswer: string | null
//     flagged: boolean
//     timeSpentSeconds: number
//     position: number
//   }>
//   secondsRemaining: number  -- for saving timer state (unused seconds)
// }
//
// Saves all answers, updates routing/scoring, generates next module questions.
// Returns: { nextModule, questions?, timeSeconds?, done?, scores? }

type AnswerInput = {
  questionId:       string
  correctAnswer:    string
  selectedAnswer:   string | null
  flagged:          boolean
  timeSpentSeconds: number
  position:         number
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: testId } = await params
  const { module, answers, secondsRemaining } = await request.json() as {
    module: string
    answers: AnswerInput[]
    secondsRemaining: number
  }

  // ── Fetch test record ────────────────────────────────────────────────────────
  const { data: test, error: testError } = await supabase
    .from('practice_tests')
    .select('*')
    .eq('id', testId)
    .eq('student_id', user.id)
    .single()

  if (testError || !test) {
    return NextResponse.json({ error: 'Test not found' }, { status: 404 })
  }

  // ── Score each answer ────────────────────────────────────────────────────────
  let correctCount = 0
  const answerRows = answers.map(a => {
    let isCorrect: boolean | null = null
    if (a.selectedAnswer) {
      isCorrect = isFreeResponse(a.correctAnswer)
        ? checkFreeResponse(a.selectedAnswer, a.correctAnswer)
        : a.selectedAnswer.trim().toUpperCase() === a.correctAnswer.trim().toUpperCase()
    }
    if (isCorrect === true) correctCount++
    return {
      test_id:           testId,
      student_id:        user.id,
      module,
      position:          a.position,
      question_id:       a.questionId,
      selected_answer:   a.selectedAnswer ?? null,
      correct_answer:    a.correctAnswer,
      is_correct:        isCorrect,
      flagged:           a.flagged,
      time_spent_seconds: a.timeSpentSeconds,
    }
  })

  // Delete any existing answers for this module (handles re-submission on resume)
  await supabase
    .from('practice_test_answers')
    .delete()
    .eq('test_id', testId)
    .eq('module', module)

  // Insert all answers
  const { error: insertError } = await supabase
    .from('practice_test_answers')
    .insert(answerRows)

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  // ── Timer save field ─────────────────────────────────────────────────────────
  const timerField: Record<string, number> = {}
  if (module === 'rw_m1')   timerField['rw_m1_seconds_remaining']   = secondsRemaining ?? 0
  if (module === 'rw_m2')   timerField['rw_m2_seconds_remaining']   = secondsRemaining ?? 0
  if (module === 'math_m1') timerField['math_m1_seconds_remaining'] = secondsRemaining ?? 0
  if (module === 'math_m2') timerField['math_m2_seconds_remaining'] = secondsRemaining ?? 0

  // ── Determine next step ──────────────────────────────────────────────────────

  if (module === 'rw_m1') {
    const m2Difficulty = routeRWModule2(correctCount)

    // Retakes reuse the original M2 question IDs (same exam, fresh attempt)
    const isRetake = !!test.retake_of && (test.rw_m2_question_ids ?? []).length > 0
    let m2Ids: string[]
    let m2Questions: Record<string, unknown>[]

    if (isRetake) {
      m2Ids = test.rw_m2_question_ids
      const { data: qData } = await supabase
        .from('questions')
        .select('id, subject, domain, skill, difficulty, correct_answer, question_image_url, answer_image_url')
        .in('id', m2Ids)
      m2Questions = m2Ids.map(id => (qData ?? []).find((q: { id: string }) => q.id === id)).filter(Boolean) as Record<string, unknown>[]
    } else {
      const seenIds = await getSeenQuestionIds(supabase, user.id)
      const usedIds = new Set<string>([...test.rw_m1_question_ids, ...test.math_m1_question_ids])
      const built = await buildRWModule(supabase, `${m2Difficulty}_m2` as 'hard_m2' | 'easy_m2', seenIds, usedIds)
      m2Ids = built.map(q => q.id)
      m2Questions = built as unknown as Record<string, unknown>[]
    }

    await supabase.from('practice_tests').update({
      rw_m1_correct:           correctCount,
      rw_m2_difficulty:        m2Difficulty,
      rw_m2_question_ids:      m2Ids,
      status:                  'rw_m2_ready',
      rw_m2_seconds_remaining: 32 * 60,
      ...timerField,
    }).eq('id', testId)

    return NextResponse.json({
      nextModule:  'rw_m2',
      questions:   m2Questions,
      timeSeconds: 32 * 60,
    })
  }

  if (module === 'rw_m2') {
    // Between RW and Math: 10-minute break
    await supabase.from('practice_tests').update({
      rw_m2_correct: correctCount,
      status:        'break',
      math_m1_seconds_remaining: 35 * 60,
      ...timerField,
    }).eq('id', testId)

    return NextResponse.json({ nextModule: 'break' })
  }

  if (module === 'math_m1') {
    const m2Difficulty = routeMathModule2(correctCount)

    // Retakes reuse original Math M2 question IDs
    const isRetake = !!test.retake_of && (test.math_m2_question_ids ?? []).length > 0
    let m2Ids: string[]
    let m2Questions: Record<string, unknown>[]

    if (isRetake) {
      m2Ids = test.math_m2_question_ids
      const { data: qData } = await supabase
        .from('questions')
        .select('id, subject, domain, skill, difficulty, correct_answer, question_image_url, answer_image_url')
        .in('id', m2Ids)
      m2Questions = m2Ids.map(id => (qData ?? []).find((q: { id: string }) => q.id === id)).filter(Boolean) as Record<string, unknown>[]
    } else {
      const seenIds = await getSeenQuestionIds(supabase, user.id)
      const usedIds = new Set<string>([
        ...test.rw_m1_question_ids,
        ...(test.rw_m2_question_ids ?? []),
        ...test.math_m1_question_ids,
      ])
      const built = await buildMathModule(supabase, `${m2Difficulty}_m2` as 'hard_m2' | 'easy_m2', seenIds, usedIds)
      m2Ids = built.map(q => q.id)
      m2Questions = built as unknown as Record<string, unknown>[]
    }

    await supabase.from('practice_tests').update({
      math_m1_correct:           correctCount,
      math_m2_difficulty:        m2Difficulty,
      math_m2_question_ids:      m2Ids,
      status:                    'math_m2_ready',
      math_m2_seconds_remaining: 35 * 60,
      ...timerField,
    }).eq('id', testId)

    return NextResponse.json({
      nextModule:  'math_m2',
      questions:   m2Questions,
      timeSeconds: 35 * 60,
    })
  }

  if (module === 'math_m2') {
    // ── Final module: compute scaled scores ────────────────────────────────────
    const rwM1Correct   = test.rw_m1_correct   ?? 0
    const rwM2Correct   = test.rw_m2_correct   ?? 0  // set when RW M2 completed
    const mathM1Correct = test.math_m1_correct ?? 0
    const mathM2Correct = correctCount                 // current module's count

    const { rw, math, total } = computeScores(rwM1Correct, rwM2Correct, mathM1Correct, mathM2Correct)

    await supabase.from('practice_tests').update({
      math_m2_correct:   correctCount,
      rw_scaled_score:   rw,
      math_scaled_score: math,
      total_scaled_score: total,
      status:            'completed',
      completed_at:      new Date().toISOString(),
      ...timerField,
    }).eq('id', testId)

    // Notify teacher
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', user.id)
      .single()

    notifyTeacher('practice_test_completed', {
      studentName:   profile?.full_name ?? '',
      studentEmail:  profile?.email ?? user.email ?? '',
      studentId:     user.id,
      testId,
      rwScore:       rw,
      mathScore:     math,
      satTotalScore: total,
    }).catch(console.error)

    return NextResponse.json({
      nextModule: 'done',
      scores: { rw, math, total },
    })
  }

  return NextResponse.json({ error: 'Invalid module' }, { status: 400 })
}
