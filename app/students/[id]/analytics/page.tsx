import { createClient } from '@/utils/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Nav from '@/components/Nav'
import AnalyticsClient from './AnalyticsClient'

// ── Types ────────────────────────────────────────────────────────────────────

export type QuestionMeta = {
  id: string
  subject: string
  domain: string
  skill: string
  correct_answer: string
  question_image_url: string | null
  answer_image_url: string | null
}

export type AnswerRow = {
  assignment_id: string
  question_id: string
  selected_answer: string | null
  is_correct: boolean | null
  student_notes: string | null
  confidence_level: number | null
  time_spent_seconds: number | null
}

export type EnrichedAnswer = AnswerRow & QuestionMeta & {
  worksheet_title: string
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function StudentAnalyticsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: studentId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // ── Fetch student profile ─────────────────────────────────────────────────
  const { data: student } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .eq('id', studentId)
    .eq('role', 'student')
    .single()

  if (!student) notFound()

  // ── Fetch all assignments for this student (all statuses) ─────────────────
  const { data: assignments } = await supabase
    .from('student_assignments')
    .select(`
      id,
      status,
      attempt_number,
      worksheets (
        id,
        title,
        worksheet_items (
          type,
          question_id,
          questions (
            id, subject, domain, skill,
            correct_answer, question_image_url, answer_image_url
          )
        )
      )
    `)
    .eq('student_id', studentId)

  if (!assignments || assignments.length === 0) {
    return (
      <div className="min-h-screen flex flex-col" style={{ background: 'var(--background)' }}>
        <Nav userEmail={user.email} />
        <main className="flex-1 p-6 max-w-5xl mx-auto w-full">
          <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--foreground)' }}>
            {student.full_name || student.email}
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            No assignments yet — nothing to analyse.
          </p>
        </main>
      </div>
    )
  }

  // ── Fetch all student answers for those assignments ───────────────────────
  const assignmentIds = assignments.map((a: any) => a.id)
  const { data: rawAnswers } = await supabase
    .from('student_answers')
    .select('assignment_id, question_id, selected_answer, is_correct, student_notes, confidence_level, time_spent_seconds')
    .in('assignment_id', assignmentIds)

  // ── Build question metadata map: question_id → QuestionMeta + worksheet title
  const questionMap = new Map<string, QuestionMeta & { worksheet_title: string }>()
  for (const assignment of assignments as any[]) {
    const ws = assignment.worksheets
    if (!ws) continue
    for (const item of ws.worksheet_items ?? []) {
      if (item.type !== 'question' || !item.question_id || !item.questions) continue
      const q = item.questions
      questionMap.set(q.id, {
        id: q.id,
        subject: q.subject ?? '',
        domain: q.domain ?? '',
        skill: q.skill ?? '',
        correct_answer: q.correct_answer ?? '',
        question_image_url: q.question_image_url ?? null,
        answer_image_url: q.answer_image_url ?? null,
        worksheet_title: ws.title ?? '',
      })
    }
  }

  // ── Build attempt_number lookup: assignment_id → attempt_number ──────────
  const attemptMap = new Map<string, number>()
  for (const a of assignments as any[]) {
    attemptMap.set(a.id, a.attempt_number ?? 1)
  }

  // ── Enrich answers with question metadata + attempt_number ───────────────
  type EnrichedWithAttempt = EnrichedAnswer & { attempt_number: number }
  const enrichedAnswers: EnrichedWithAttempt[] = []
  for (const ans of rawAnswers ?? []) {
    const meta = questionMap.get(ans.question_id)
    if (!meta) continue
    enrichedAnswers.push({
      ...ans,
      ...meta,
      attempt_number: attemptMap.get(ans.assignment_id) ?? 1,
    })
  }

  // ── Deduplicate: one answer per question_id ───────────────────────────────
  // Rule 1: use the most recent attempt (highest attempt_number) per question.
  // Rule 2: if that answer is blank (selected_answer === null), fall back to
  //         the most recent attempt that is not blank.
  const nonBlankBest = new Map<string, EnrichedWithAttempt>()
  const anyBest      = new Map<string, EnrichedWithAttempt>()

  for (const ans of enrichedAnswers) {
    // Track best overall (highest attempt_number regardless of blank)
    const prev = anyBest.get(ans.question_id)
    if (!prev || ans.attempt_number > prev.attempt_number) {
      anyBest.set(ans.question_id, ans)
    }
    // Track best non-blank (highest attempt_number where an answer was given)
    if (ans.selected_answer !== null) {
      const prevNB = nonBlankBest.get(ans.question_id)
      if (!prevNB || ans.attempt_number > prevNB.attempt_number) {
        nonBlankBest.set(ans.question_id, ans)
      }
    }
  }

  // Prefer the best non-blank; fall back to best overall if all attempts blank
  const dedupedAnswers: EnrichedAnswer[] = Array.from(anyBest.keys()).map(qid =>
    nonBlankBest.get(qid) ?? anyBest.get(qid)!
  )

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--background)' }}>
      <Nav userEmail={user.email} />
      <main className="flex-1 p-6 max-w-5xl mx-auto w-full">
        <AnalyticsClient student={student} answers={dedupedAnswers} />
      </main>
    </div>
  )
}
