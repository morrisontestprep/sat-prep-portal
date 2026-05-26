import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'
import { sendPracticeTestAssignedNotification } from '@/utils/email'

// POST /api/practice-test/assign
// Teacher assigns a practice test to a student.
// Body: { studentId, dueDate? }

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const TEACHER_EMAIL = process.env.TEACHER_EMAIL ?? 'morrisontestprep@gmail.com'
  if (user.email !== TEACHER_EMAIL) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: { studentId: string; dueDate?: string | null }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const { studentId, dueDate } = body
  if (!studentId) return NextResponse.json({ error: 'studentId required' }, { status: 400 })

  // Create the assignment
  const { data: assignment, error } = await supabase
    .from('practice_test_assignments')
    .insert({
      teacher_id: user.id,
      student_id: studentId,
      due_date:   dueDate ?? null,
      status:     'pending',
    })
    .select('id')
    .single()

  if (error || !assignment) {
    return NextResponse.json({ error: error?.message ?? 'Insert failed' }, { status: 500 })
  }

  // Fetch student info for notification
  const { data: student } = await supabase
    .from('profiles')
    .select('full_name, email')
    .eq('id', studentId)
    .single()

  if (student?.email) {
    try {
      await sendPracticeTestAssignedNotification(
        student.email,
        student.full_name ?? student.email,
        dueDate ?? null,
      )
    } catch (e) {
      console.error('Failed to send practice test assignment email:', e)
      // Don't fail the request — assignment was created
    }
  }

  return NextResponse.json({ ok: true, assignmentId: assignment.id })
}
