import { createClient } from '@/utils/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import Nav from '@/components/Nav'

type ResultsQuestion = {
  position: number
  question: {
    id: string
    domain: string
    skill: string
    difficulty: string
    correct_answer: string
    question_image_url: string | null
    answer_image_url: string | null
  } | null
  selectedAnswer: string | null
  correctAnswer: string | null
  isCorrect: boolean | null
  flagged: boolean
  timeSpentSeconds: number | null
}

type ModuleResult = {
  module: string
  questions: ResultsQuestion[]
}

const MODULE_LABELS: Record<string, string> = {
  rw_m1:   'Reading & Writing — Module 1',
  rw_m2:   'Reading & Writing — Module 2',
  math_m1: 'Math — Module 1',
  math_m2: 'Math — Module 2',
}

function fmtTime(s: number | null): string {
  if (s == null) return '—'
  return `${s.toFixed(1)}s`
}

export default async function ResultsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: testId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/callback')

  // Fetch test
  const { data: test, error: testError } = await supabase
    .from('practice_tests')
    .select('*')
    .eq('id', testId)
    .eq('student_id', user.id)
    .single()

  if (testError || !test) notFound()
  if (test.status !== 'completed') redirect(`/practice-test/${testId}`)

  // Fetch all answers
  const { data: answers } = await supabase
    .from('practice_test_answers')
    .select('*')
    .eq('test_id', testId)
    .order('module').order('position')

  // Collect all question IDs
  const allIds = [
    ...(test.rw_m1_question_ids ?? []),
    ...(test.rw_m2_question_ids ?? []),
    ...(test.math_m1_question_ids ?? []),
    ...(test.math_m2_question_ids ?? []),
  ]

  const { data: questions } = await supabase
    .from('questions')
    .select('id, domain, skill, difficulty, correct_answer, question_image_url, answer_image_url')
    .in('id', allIds)

  type QDetail = { id: string; domain: string; skill: string; difficulty: string; correct_answer: string; question_image_url: string | null; answer_image_url: string | null }
  const questionMap = Object.fromEntries((questions ?? []).map(q => [q.id, q])) as Record<string, QDetail>

  // Build per-module structure
  type ModuleKey = 'rw_m1' | 'rw_m2' | 'math_m1' | 'math_m2'
  const moduleOrder: ModuleKey[] = ['rw_m1', 'rw_m2', 'math_m1', 'math_m2']
  const moduleIds: Record<ModuleKey, string[]> = {
    rw_m1:   test.rw_m1_question_ids ?? [],
    rw_m2:   test.rw_m2_question_ids ?? [],
    math_m1: test.math_m1_question_ids ?? [],
    math_m2: test.math_m2_question_ids ?? [],
  }
  const rawCorrect: Record<ModuleKey, number> = {
    rw_m1:   test.rw_m1_correct ?? 0,
    rw_m2:   test.rw_m2_correct ?? 0,
    math_m1: test.math_m1_correct ?? 0,
    math_m2: test.math_m2_correct ?? 0,
  }

  const answersByModule = Object.fromEntries(
    moduleOrder.map(mod => [
      mod,
      (answers ?? []).filter((a: { module: string }) => a.module === mod),
    ])
  )

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  const rw    = test.rw_scaled_score
  const math  = test.math_scaled_score
  const total = test.total_scaled_score

  const scoreColor = (s: number) => s >= 700 ? '#16a34a' : s >= 500 ? '#d97706' : '#dc2626'

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--background)' }}>
      <Nav userEmail={user.email} />
    <div className="flex flex-col gap-8 pb-16 p-6 max-w-3xl mx-auto w-full">

      {/* Score header */}
      <div
        className="rounded-2xl border p-8 text-center"
        style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
        <h1 className="text-2xl font-bold mb-6" style={{ color: 'var(--foreground)' }}>
          Practice Test Results
        </h1>
        <div className="flex items-end justify-center gap-10">
          {[
            { label: 'Reading & Writing', val: rw, max: 800 },
            { label: 'Total Score',       val: total, max: 1600 },
            { label: 'Math',              val: math, max: 800 },
          ].map(({ label, val, max }) => (
            <div key={label} className="flex flex-col items-center">
              <span
                className={`font-bold ${label === 'Total Score' ? 'text-5xl' : 'text-3xl'}`}
                style={{ color: label === 'Total Score' ? 'var(--foreground)' : scoreColor(val) }}>
                {val}
              </span>
              <span className="text-xs mt-1 text-center" style={{ color: 'var(--text-muted)' }}>
                {label}<br /><span style={{ color: 'var(--border)' }}>/ {max}</span>
              </span>
            </div>
          ))}
        </div>

        {/* Raw score breakdown */}
        <div className="mt-6 flex justify-center gap-6 text-sm flex-wrap">
          {moduleOrder.map(mod => (
            <div key={mod} className="text-center">
              <div className="font-semibold" style={{ color: 'var(--foreground)' }}>
                {rawCorrect[mod]} / {moduleIds[mod].length}
              </div>
              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {MODULE_LABELS[mod]}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Per-module question review */}
      {modules.map(mod => {
        const correct = mod.questions.filter(q => q.isCorrect).length
        const total   = mod.questions.length

        return (
          <div key={mod.module} className="flex flex-col gap-3">
            <div className="flex items-baseline gap-3">
              <h2 className="text-base font-bold" style={{ color: 'var(--foreground)' }}>
                {MODULE_LABELS[mod.module]}
              </h2>
              <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
                {correct} / {total} correct
              </span>
            </div>

            {mod.questions.map(q => {
              const answered  = q.selectedAnswer !== null
              const isCorrect = q.isCorrect

              return (
                <div
                  key={q.position}
                  className="rounded-2xl border overflow-hidden"
                  style={{
                    background:  'var(--card)',
                    borderColor: !answered ? 'var(--border)' : isCorrect ? '#bbf7d0' : '#fecaca',
                  }}>
                  {/* Header */}
                  <div
                    className="px-4 py-2 flex items-center gap-2 text-xs border-b flex-wrap"
                    style={{
                      background:  !answered ? 'var(--card)' : isCorrect ? '#f0fdf4' : '#fef2f2',
                      borderColor: !answered ? 'var(--border)' : isCorrect ? '#bbf7d0' : '#fecaca',
                    }}>
                    <span
                      className="w-5 h-5 rounded-full flex items-center justify-center font-bold text-white text-xs flex-shrink-0"
                      style={{ background: !answered ? '#9ca3af' : isCorrect ? '#16a34a' : '#dc2626' }}>
                      {q.position}
                    </span>
                    <span style={{ color: 'var(--text-muted)' }}>{q.question?.domain}</span>
                    <span style={{ color: 'var(--text-muted)' }}>·</span>
                    <span className="flex-1 truncate" style={{ color: 'var(--text-muted)' }}>{q.question?.skill}</span>
                    {q.flagged && (
                      <span className="px-2 py-0.5 rounded-full text-xs" style={{ background: '#fefce8', color: '#854d0e' }}>
                        🚩 Flagged
                      </span>
                    )}
                    {q.timeSpentSeconds != null && (
                      <span className="ml-auto text-xs" style={{ color: 'var(--text-muted)' }}>
                        ⏱ {fmtTime(q.timeSpentSeconds)}
                      </span>
                    )}
                  </div>

                  {/* Question image */}
                  {q.question?.question_image_url && (
                    <div className="px-4 pt-3 pb-2">
                      <img src={q.question.question_image_url} alt="Question" className="w-full rounded-lg" />
                    </div>
                  )}

                  {/* Answer row */}
                  <div className="px-4 pb-3 flex items-center gap-3 text-sm flex-wrap">
                    {!answered ? (
                      <span className="text-xs px-2 py-1 rounded" style={{ background: 'var(--border)', color: 'var(--text-muted)' }}>
                        Not answered
                      </span>
                    ) : (
                      <>
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Your answer:</span>
                        <span
                          className="font-semibold px-2 py-0.5 rounded"
                          style={{
                            background: isCorrect ? '#f0fdf4' : '#fef2f2',
                            color:      isCorrect ? '#16a34a' : '#dc2626',
                          }}>
                          {q.selectedAnswer}
                        </span>
                        {!isCorrect && q.correctAnswer && (
                          <>
                            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Correct:</span>
                            <span className="font-semibold px-2 py-0.5 rounded" style={{ background: '#f0fdf4', color: '#16a34a' }}>
                              {q.correctAnswer}
                            </span>
                          </>
                        )}
                      </>
                    )}
                  </div>

                  {/* Explanation */}
                  {q.question?.answer_image_url && (
                    <details className="px-4 pb-3 border-t" style={{ borderColor: 'var(--border)' }}>
                      <summary className="text-xs cursor-pointer pt-3" style={{ color: 'var(--accent)' }}>
                        Show explanation
                      </summary>
                      <img src={q.question.answer_image_url} alt="Explanation" className="w-full rounded-lg mt-2" />
                    </details>
                  )}
                </div>
              )
            })}
          </div>
        )
      })}

      {/* Footer actions */}
      <div className="flex gap-3">
        <Link
          href="/practice-test"
          className="px-6 py-3 rounded-xl font-semibold text-sm text-white"
          style={{ background: 'var(--accent)' }}>
          ← Practice Tests
        </Link>
        <Link
          href={`/practice-test/${testId}/retake`}
          className="px-6 py-3 rounded-xl font-semibold text-sm border"
          style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}>
          Retake This Test
        </Link>
      </div>
    </div>
    </div>
  )
}
