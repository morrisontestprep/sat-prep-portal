import { createClient } from '@/utils/supabase/server'
import { redirect, notFound } from 'next/navigation'
import PracticeTestClient from './PracticeTestClient'

// Practice test runner page — resumes from current position if in progress.

export default async function PracticeTestPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: testId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/callback')

  // Fetch test record
  const { data: test, error } = await supabase
    .from('practice_tests')
    .select('*')
    .eq('id', testId)
    .eq('student_id', user.id)
    .single()

  if (error || !test) notFound()
  if (test.status === 'completed') redirect(`/practice-test/${testId}/results`)

  // Determine current module + question IDs
  let currentModule: string
  let questionIds: string[]
  let timeSeconds: number

  switch (test.status) {
    case 'active':
      currentModule = 'rw_m1'; questionIds = test.rw_m1_question_ids; timeSeconds = test.rw_m1_seconds_remaining ?? 32 * 60; break
    case 'rw_m2_ready':
      currentModule = 'rw_m2'; questionIds = test.rw_m2_question_ids ?? []; timeSeconds = test.rw_m2_seconds_remaining ?? 32 * 60; break
    case 'break':
      currentModule = 'math_m1'; questionIds = test.math_m1_question_ids; timeSeconds = test.math_m1_seconds_remaining ?? 35 * 60; break
    case 'math_m2_ready':
      currentModule = 'math_m2'; questionIds = test.math_m2_question_ids ?? []; timeSeconds = test.math_m2_seconds_remaining ?? 35 * 60; break
    default:
      currentModule = 'rw_m1'; questionIds = test.rw_m1_question_ids; timeSeconds = 32 * 60
  }

  // Fetch question details
  const { data: questions } = await supabase
    .from('questions')
    .select('id, subject, domain, skill, difficulty, correct_answer, question_image_url, answer_image_url')
    .in('id', questionIds)

  const orderedQuestions = questionIds
    .map(id => (questions ?? []).find((q: { id: string }) => q.id === id))
    .filter(Boolean)

  // Fetch any saved answers for the current module
  const { data: savedAnswers } = await supabase
    .from('practice_test_answers')
    .select('question_id, selected_answer, flagged, time_spent_seconds, position')
    .eq('test_id', testId)
    .eq('module', currentModule)

  return (
    <PracticeTestClient
      testId={testId}
      initialModule={currentModule as 'rw_m1' | 'rw_m2' | 'math_m1' | 'math_m2'}
      initialQuestions={orderedQuestions as Parameters<typeof PracticeTestClient>[0]['initialQuestions']}
      initialTimeSeconds={timeSeconds}
      initialSavedAnswers={(savedAnswers ?? []).map(a => ({
        question_id:        a.question_id,
        selected_answer:    a.selected_answer,
        flagged:            a.flagged,
        time_spent_seconds: a.time_spent_seconds,
        position:           a.position,
      }))}
    />
  )
}
