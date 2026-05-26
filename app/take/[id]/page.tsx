import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
import TakeWorksheet from './TakeWorksheet'

export default async function TakeAssignmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: assignmentId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Fetch the assignment — try with attempt_number, fall back without
  let assignment: any = null
  const { data: withAttempt, error: fetchErr } = await supabase
    .from('student_assignments')
    .select('id, student_id, status, attempt_number, worksheets ( id, title )')
    .eq('id', assignmentId)
    .maybeSingle()

  if (fetchErr) {
    // attempt_number column may not exist yet
    const { data: fallback } = await supabase
      .from('student_assignments')
      .select('id, student_id, status, worksheets ( id, title )')
      .eq('id', assignmentId)
      .maybeSingle()
    if (fallback) assignment = { ...fallback, attempt_number: 1 }
  } else {
    if (withAttempt) assignment = { ...withAttempt, attempt_number: withAttempt.attempt_number ?? 1 }
  }

  if (!assignment) redirect('/my-assignments')

  // Verify this assignment belongs to the student
  if (assignment.student_id !== user.id) redirect('/my-assignments')

  const ws = (assignment.worksheets as unknown) as { id: string; title: string }

  // Fetch worksheet items with full question data
  const { data: items } = await supabase
    .from('worksheet_items')
    .select(`
      id,
      position,
      type,
      question_id,
      content,
      questions (
        id,
        subject,
        domain,
        skill,
        difficulty,
        question_image_url,
        answer_image_url,
        correct_answer
      )
    `)
    .eq('worksheet_id', ws.id)
    .order('position')

  // Fetch any existing answers
  const { data: existingAnswers } = await supabase
    .from('student_answers')
    .select('question_id, selected_answer, is_correct, time_spent_seconds, student_notes, confidence_level')
    .eq('assignment_id', assignmentId)

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--background)' }}>
      <Nav userEmail={user.email} />
      <TakeWorksheet
        assignmentId={assignmentId}
        worksheetTitle={ws.title}
        worksheetId={ws.id}
        status={assignment.status}
        items={(items ?? []) as unknown as WorksheetItem[]}
        existingAnswers={(existingAnswers ?? []) as ExistingAnswer[]}
        studentId={user.id}
        attemptNumber={assignment.attempt_number ?? 1}
      />
    </div>
  )
}

export type WorksheetItem = {
  id: string
  position: number
  type: 'question' | 'section_header' | 'note'
  question_id: string | null
  content: string | null
  questions: {
    id: string
    subject: string
    domain: string
    skill: string
    difficulty: string
    question_image_url: string | null
    answer_image_url: string | null
    correct_answer: string
    stem?: string | null
    passage?: string | null
    choices?: Record<string, string> | null
  } | null
}

export type ExistingAnswer = {
  question_id: string
  selected_answer: string | null
  is_correct: boolean | null
  time_spent_seconds: number
  student_notes: string | null
  confidence_level: number | null
}
