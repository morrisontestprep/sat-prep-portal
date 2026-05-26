import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'
import {
  getSeenQuestionIds,
  buildRWModule,
  buildMathModule,
} from '@/utils/practice-test-selection'

// POST /api/practice-test/start
// Body: { retakeTestId?: string }
//   retakeTestId: if provided, clone that test's question IDs instead of generating new ones.
//
// Creates a practice_tests row, generates (or clones) RW M1 + Math M1 question sets,
// and returns the test ID + first module questions.
// RW M2 and Math M2 are generated after each M1 completes (adaptive routing).

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { retakeTestId } = await request.json().catch(() => ({}))

  let rwM1Ids:   string[]
  let mathM1Ids: string[]
  let retakeOf:  string | null = null

  if (retakeTestId) {
    // ── Retake: clone the same question sets ─────────────────────────────────
    const { data: original, error } = await supabase
      .from('practice_tests')
      .select('rw_m1_question_ids, math_m1_question_ids, rw_m2_question_ids, math_m2_question_ids, rw_m2_difficulty, math_m2_difficulty, student_id')
      .eq('id', retakeTestId)
      .single()

    if (error || !original) {
      return NextResponse.json({ error: 'Original test not found' }, { status: 404 })
    }
    // Students can only retake their own tests
    if (original.student_id !== user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    rwM1Ids   = original.rw_m1_question_ids
    mathM1Ids = original.math_m1_question_ids
    retakeOf  = retakeTestId

    // Create the retake test row immediately with all four module IDs cloned
    const { data: test, error: insertError } = await supabase
      .from('practice_tests')
      .insert({
        student_id:             user.id,
        status:                 'active',
        rw_m1_question_ids:     original.rw_m1_question_ids,
        rw_m2_question_ids:     original.rw_m2_question_ids,
        math_m1_question_ids:   original.math_m1_question_ids,
        math_m2_question_ids:   original.math_m2_question_ids,
        rw_m2_difficulty:       original.rw_m2_difficulty,
        math_m2_difficulty:     original.math_m2_difficulty,
        rw_m1_seconds_remaining: 32 * 60,
        retake_of:              retakeOf,
      })
      .select('id')
      .single()

    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

    // Fetch question details for RW M1
    const { data: questions } = await supabase
      .from('questions')
      .select('id, subject, domain, skill, difficulty, correct_answer, question_image_url, answer_image_url')
      .in('id', rwM1Ids)

    const ordered = rwM1Ids.map(id => (questions ?? []).find((q: { id: string }) => q.id === id)).filter(Boolean)

    return NextResponse.json({
      testId:    test.id,
      module:    'rw_m1',
      questions: ordered,
      timeSeconds: 32 * 60,
    })
  }

  // ── New test: generate fresh question sets ───────────────────────────────────
  const seenIds = await getSeenQuestionIds(supabase, user.id)
  const usedIds = new Set<string>()

  const [rwM1Questions, mathM1Questions] = await Promise.all([
    buildRWModule(supabase, 'm1', seenIds, usedIds),
    buildMathModule(supabase, 'm1', seenIds, usedIds),
  ])

  rwM1Ids   = rwM1Questions.map(q => q.id)
  mathM1Ids = mathM1Questions.map(q => q.id)

  const { data: test, error: insertError } = await supabase
    .from('practice_tests')
    .insert({
      student_id:             user.id,
      status:                 'active',
      rw_m1_question_ids:     rwM1Ids,
      math_m1_question_ids:   mathM1Ids,
      rw_m1_seconds_remaining: 32 * 60,
    })
    .select('id')
    .single()

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

  return NextResponse.json({
    testId:    test.id,
    module:    'rw_m1',
    questions: rwM1Questions,
    timeSeconds: 32 * 60,
  })
}
