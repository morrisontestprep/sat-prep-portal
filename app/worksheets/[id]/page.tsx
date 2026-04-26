import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { redirect, notFound } from 'next/navigation'
import Nav from '@/components/Nav'
import WorksheetView from './WorksheetView'

const TEACHER_EMAIL = process.env.TEACHER_EMAIL || 'morrisontestprep@gmail.com'

export default async function WorksheetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Only teacher can access this page
  if (user.email !== TEACHER_EMAIL) redirect('/my-assignments')

  const { data: ws } = await supabase
    .from('worksheets')
    .select('id, title, created_at, updated_at')
    .eq('id', id)
    .single()

  if (!ws) notFound()

  // Fetch items + full question data including image URLs
  const { data: items } = await supabase
    .from('worksheet_items')
    .select(`
      id, position, type, question_id, content,
      questions(id, subject, domain, skill, difficulty, question_image_url, answer_image_url, correct_answer)
    `)
    .eq('worksheet_id', id)
    .order('position')

  const { data: students } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .eq('role', 'student')
    .order('full_name')

  // Try with attempt_number first, fall back without it (column may not exist yet)
  let assignments: any[] | null = null
  const { data: assignmentsWithAttempt, error: assignErr } = await supabase
    .from('student_assignments')
    .select('id, assigned_at, due_date, status, student_id, attempt_number, profiles(id, full_name, email)')
    .eq('worksheet_id', id)
    .order('assigned_at', { ascending: false })

  if (assignErr) {
    // Fallback: query without attempt_number
    const { data: fallback } = await supabase
      .from('student_assignments')
      .select('id, assigned_at, due_date, status, student_id, profiles(id, full_name, email)')
      .eq('worksheet_id', id)
      .order('assigned_at', { ascending: false })
    assignments = (fallback ?? []).map((a: any) => ({ ...a, attempt_number: 1 }))
  } else {
    assignments = (assignmentsWithAttempt ?? []).map((a: any) => ({
      ...a,
      attempt_number: a.attempt_number ?? 1,
    }))
  }

  // Fetch student answers for all assignments of this worksheet
  const assignmentIds = assignments.map((a: any) => a.id)
  const { data: studentAnswers } = assignmentIds.length > 0
    ? await supabase
        .from('student_answers')
        .select('assignment_id, question_id, selected_answer, is_correct, time_spent_seconds, student_notes, confidence_level')
        .in('assignment_id', assignmentIds)
    : { data: [] }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--background)' }}>
      <Nav userEmail={user.email} />
      <WorksheetView
        worksheetId={id}
        initialTitle={ws.title}
        initialItems={(items ?? []) as unknown as WorksheetItemRaw[]}
        students={students ?? []}
        assignments={assignments as AssignmentRaw[]}
        studentAnswers={(studentAnswers ?? []) as StudentAnswerRaw[]}
      />
    </div>
  )
}

// Types exported for the client component
export type WorksheetItemRaw = {
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
    question_image_url: string
    answer_image_url: string
    correct_answer: string
  } | null
}

export type AssignmentRaw = {
  id: string
  assigned_at: string
  due_date: string | null
  status: string
  student_id: string
  attempt_number: number
  profiles: { id: string; full_name: string | null; email: string | null } | null
}

export type StudentAnswerRaw = {
  assignment_id: string
  question_id: string
  selected_answer: string | null
  is_correct: boolean | null
  time_spent_seconds: number
  student_notes: string | null
  confidence_level: number | null
}
