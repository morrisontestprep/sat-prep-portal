import { createClient } from '@/utils/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Nav from '@/components/Nav'
import ScoreReportClient, { type SRQuestion } from '@/components/ScoreReportClient'

type ModuleKey = 'rw_m1' | 'rw_m2' | 'math_m1' | 'math_m2'
const MODULE_ORDER: ModuleKey[] = ['rw_m1', 'rw_m2', 'math_m1', 'math_m2']

export default async function TeacherTestReviewPage({
  params,
}: {
  params: Promise<{ id: string; testId: string }>
}) {
  const { id: studentId, testId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const TEACHER_EMAIL = process.env.TEACHER_EMAIL ?? 'morrisontestprep@gmail.com'
  if (user.email !== TEACHER_EMAIL) redirect('/my-analytics')

  const { data: student } = await supabase
    .from('profiles').select('id, full_name, email').eq('id', studentId).single()
  if (!student) notFound()

  const { data: test } = await supabase
    .from('practice_tests').select('*').eq('id', testId).eq('student_id', studentId).single()
  if (!test || test.status !== 'completed') notFound()

  // Fetch all answers
  const { data: answers } = await supabase
    .from('practice_test_answers')
    .select('*')
    .eq('test_id', testId)
    .order('module').order('position')

  const moduleIds: Record<ModuleKey, string[]> = {
    rw_m1:   test.rw_m1_question_ids   ?? [],
    rw_m2:   test.rw_m2_question_ids   ?? [],
    math_m1: test.math_m1_question_ids ?? [],
    math_m2: test.math_m2_question_ids ?? [],
  }
  const allIds = [...new Set(Object.values(moduleIds).flat())]

  const { data: questions } = await supabase
    .from('questions')
    .select('id, domain, skill, difficulty, correct_answer, question_image_url, answer_image_url')
    .in('id', allIds)

  type QRow = { id: string; domain: string; skill: string; difficulty: string; correct_answer: string; question_image_url: string | null; answer_image_url: string | null }
  const qMap = Object.fromEntries((questions ?? []).map(q => [q.id, q])) as Record<string, QRow>

  type AnswerRow = {
    question_id: string; module: string; selected_answer: string | null; correct_answer: string
    is_correct: boolean | null; flagged: boolean; time_spent_seconds: number | null; position: number
  }
  const answerMap = Object.fromEntries(
    (answers ?? [] as AnswerRow[]).map((a: AnswerRow) => [`${a.module}:${a.question_id}`, a])
  )

  const srQuestions: SRQuestion[] = MODULE_ORDER.flatMap(mod =>
    moduleIds[mod].map((qid, i) => {
      const q = qMap[qid]
      const a = answerMap[`${mod}:${qid}`] as AnswerRow | undefined
      return {
        position:           i + 1,
        module:             mod,
        domain:             q?.domain             ?? '',
        skill:              q?.skill              ?? '',
        difficulty:         q?.difficulty         ?? '',
        correct_answer:     a?.correct_answer ?? q?.correct_answer ?? '',
        question_image_url: q?.question_image_url ?? null,
        answer_image_url:   q?.answer_image_url   ?? null,
        selected_answer:    a?.selected_answer ?? null,
        is_correct:         a?.is_correct ?? null,
        flagged:            a?.flagged ?? false,
        time_spent_seconds: a?.time_spent_seconds ?? null,
      }
    })
  )

  const rawCorrect: Record<string, number> = {
    rw_m1:   test.rw_m1_correct   ?? 0,
    rw_m2:   test.rw_m2_correct   ?? 0,
    math_m1: test.math_m1_correct ?? 0,
    math_m2: test.math_m2_correct ?? 0,
  }
  const rawTotal: Record<string, number> = Object.fromEntries(
    MODULE_ORDER.map(mod => [mod, moduleIds[mod].length])
  )

  const studentName = student.full_name || student.email || 'Student'

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--background)' }}>
      <Nav userEmail={user.email} />
      <main className="flex-1 p-6 max-w-3xl mx-auto w-full">
        <p className="text-sm mb-1" style={{ color: 'var(--accent)' }}>
          Score Report — {studentName}
        </p>
        <ScoreReportClient
          questions={srQuestions}
          rwScore={test.rw_scaled_score}
          mathScore={test.math_scaled_score}
          totalScore={test.total_scaled_score}
          rawCorrect={rawCorrect}
          rawTotal={rawTotal}
          mode="teacher"
          testDate={test.created_at}
          retake={!!test.retake_of}
          backHref={`/students/${studentId}/practice-tests`}
          backLabel="Practice Tests"
        />
      </main>
    </div>
  )
}
