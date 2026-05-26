import { createClient } from '@/utils/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Nav from '@/components/Nav'
import Link from 'next/link'

// Teacher: detailed practice test review — module by module, question overlay

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

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

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

  // Collect all question IDs
  type ModuleKey = 'rw_m1' | 'rw_m2' | 'math_m1' | 'math_m2'
  const moduleOrder: ModuleKey[] = ['rw_m1', 'rw_m2', 'math_m1', 'math_m2']
  const moduleIds: Record<ModuleKey, string[]> = {
    rw_m1:   test.rw_m1_question_ids   ?? [],
    rw_m2:   test.rw_m2_question_ids   ?? [],
    math_m1: test.math_m1_question_ids ?? [],
    math_m2: test.math_m2_question_ids ?? [],
  }
  const rawCorrect: Record<ModuleKey, number> = {
    rw_m1:   test.rw_m1_correct   ?? 0,
    rw_m2:   test.rw_m2_correct   ?? 0,
    math_m1: test.math_m1_correct ?? 0,
    math_m2: test.math_m2_correct ?? 0,
  }

  const allIds = [...new Set([
    ...moduleIds.rw_m1, ...moduleIds.rw_m2, ...moduleIds.math_m1, ...moduleIds.math_m2,
  ])]

  const { data: questions } = await supabase
    .from('questions')
    .select('id, domain, skill, difficulty, correct_answer, question_image_url, answer_image_url')
    .in('id', allIds)
  type QFull = { id: string; domain: string; skill: string; difficulty: string; correct_answer: string; question_image_url: string | null; answer_image_url: string | null }
  const questionMap = Object.fromEntries((questions ?? []).map(q => [q.id, q])) as Record<string, QFull>

  type AnswerRow = {
    question_id: string; selected_answer: string | null; correct_answer: string
    is_correct: boolean | null; flagged: boolean; time_spent_seconds: number | null; position: number
  }
  const answersByModule = Object.fromEntries(
    moduleOrder.map(mod => [mod, (answers ?? []).filter((a: AnswerRow & { module: string }) => a.module === mod) as AnswerRow[]])
  )

  const scoreColor = (s: number | null) => {
    if (s == null) return 'var(--text-muted)'
    if (s >= 700) return '#16a34a'
    if (s >= 500) return '#d97706'
    return '#dc2626'
  }

  const diffColor = (d: string) => {
    if (d === 'Easy')      return { bg: '#f0fdf4', color: '#16a34a' }
    if (d === 'Medium')    return { bg: '#fffbeb', color: '#d97706' }
    if (d === 'Hard')      return { bg: '#fef2f2', color: '#dc2626' }
    if (d === 'Very Hard') return { bg: '#fdf2f8', color: '#9333ea' }
    return { bg: 'var(--border)', color: 'var(--text-muted)' }
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--background)' }}>
      <Nav userEmail={user.email} />
      <main className="flex-1 p-6 max-w-4xl mx-auto w-full flex flex-col gap-8 pb-16">

        {/* Header */}
        <div>
          <Link href={`/students/${studentId}/practice-tests`} className="text-sm" style={{ color: 'var(--accent)' }}>
            ← Practice Tests
          </Link>
          <h1 className="text-2xl font-bold mt-1" style={{ color: 'var(--foreground)' }}>
            Practice Test Review — {student.full_name || student.email}
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {fmtDate(test.created_at)}
            {test.retake_of && <span className="ml-2">(Retake)</span>}
          </p>
        </div>

        {/* Score summary */}
        <div
          className="rounded-2xl border p-6"
          style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
          <div className="flex items-end gap-10 flex-wrap">
            {[
              { label: 'Total Score',       val: test.total_scaled_score, max: 1600, big: true },
              { label: 'Reading & Writing', val: test.rw_scaled_score,    max: 800 },
              { label: 'Math',              val: test.math_scaled_score,   max: 800 },
            ].map(({ label, val, max, big }) => (
              <div key={label} className="text-center">
                <p className={`font-bold ${big ? 'text-4xl' : 'text-2xl'}`} style={{ color: scoreColor(val) }}>
                  {val ?? '—'}
                </p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{label} / {max}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 flex gap-6 text-sm flex-wrap">
            {moduleOrder.map(mod => (
              <div key={mod}>
                <span className="font-semibold" style={{ color: 'var(--foreground)' }}>{rawCorrect[mod]}/{moduleIds[mod].length}</span>
                <span className="ml-1" style={{ color: 'var(--text-muted)' }}>{MODULE_LABELS[mod]}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Per-module review */}
        {moduleOrder.map(mod => {
          const ids        = moduleIds[mod]
          const modAnswers = answersByModule[mod]
          if (ids.length === 0) return null

          const answerMap = Object.fromEntries(modAnswers.map(a => [a.question_id, a]))
          const correct   = modAnswers.filter(a => a.is_correct === true).length

          return (
            <div key={mod} className="flex flex-col gap-3">
              <div className="flex items-baseline gap-3">
                <h2 className="text-base font-bold" style={{ color: 'var(--foreground)' }}>
                  {MODULE_LABELS[mod]}
                </h2>
                <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  {correct} / {ids.length} correct
                </span>
              </div>

              {ids.map((qid, i) => {
                const q   = questionMap[qid] as QFull | undefined
                const a   = answerMap[qid]
                const pos = i + 1

                const answered  = a?.selected_answer != null
                const isCorrect = a?.is_correct
                const dc = diffColor(q?.difficulty ?? '')

                return (
                  <div
                    key={qid}
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
                        {pos}
                      </span>
                      <span style={{ color: 'var(--text-muted)' }}>{q?.domain}</span>
                      <span style={{ color: 'var(--text-muted)' }}>·</span>
                      <span className="flex-1 truncate" style={{ color: 'var(--text-muted)' }}>{q?.skill}</span>
                      {q?.difficulty && (
                        <span className="px-2 py-0.5 rounded-full font-medium flex-shrink-0" style={dc}>
                          {q.difficulty}
                        </span>
                      )}
                      {a?.flagged && (
                        <span className="px-2 py-0.5 rounded-full text-xs flex-shrink-0" style={{ background: '#fefce8', color: '#854d0e' }}>
                          🚩 Flagged
                        </span>
                      )}
                      <span className="ml-auto text-xs flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
                        ⏱ {fmtTime(a?.time_spent_seconds)}
                      </span>
                    </div>

                    {/* Question image */}
                    {q?.question_image_url && (
                      <div className="px-4 pt-3 pb-2">
                        <img src={q.question_image_url} alt="Question" className="w-full rounded-lg" />
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
                          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Student:</span>
                          <span
                            className="font-semibold px-2 py-0.5 rounded"
                            style={{ background: isCorrect ? '#f0fdf4' : '#fef2f2', color: isCorrect ? '#16a34a' : '#dc2626' }}>
                            {a.selected_answer}
                          </span>
                          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Correct:</span>
                          <span className="font-semibold px-2 py-0.5 rounded" style={{ background: '#f0fdf4', color: '#16a34a' }}>
                            {a.correct_answer ?? q?.correct_answer}
                          </span>
                        </>
                      )}
                    </div>

                    {/* Explanation (always shown for teacher) */}
                    {q?.answer_image_url && (
                      <details className="px-4 pb-3 border-t" style={{ borderColor: 'var(--border)' }}>
                        <summary className="text-xs cursor-pointer pt-3" style={{ color: 'var(--accent)' }}>
                          Show explanation
                        </summary>
                        <img src={q.answer_image_url} alt="Explanation" className="w-full rounded-lg mt-2" />
                      </details>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })}
      </main>
    </div>
  )
}
