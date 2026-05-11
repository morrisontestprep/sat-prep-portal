import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { sendDueDateUpdatedNotification } from '@/utils/email'

const TEACHER_EMAIL = process.env.TEACHER_EMAIL || 'morrisontestprep@gmail.com'

async function requireTeacher() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email !== TEACHER_EMAIL) return null
  return user
}

// ── DELETE /api/students — remove a student ───────────────────────────────────
export async function DELETE(request: Request) {
  const user = await requireTeacher()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { studentId } = await request.json()
  if (!studentId) return NextResponse.json({ error: 'studentId required' }, { status: 400 })

  const admin = createAdminClient()
  const { error } = await admin.from('profiles').delete().eq('id', studentId)
  if (error) {
    console.error('Delete student error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

// ── PATCH /api/students — update assignment due date ──────────────────────────
// Body: { assignmentId, dueDate: string | null, studentEmail?, studentName? }
export async function PATCH(request: Request) {
  const user = await requireTeacher()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { assignmentId, dueDate, studentEmail, studentName } = await request.json()
  if (!assignmentId) return NextResponse.json({ error: 'assignmentId required' }, { status: 400 })

  const admin = createAdminClient()
  const { error } = await admin
    .from('student_assignments')
    .update({ due_date: dueDate ?? null })
    .eq('id', assignmentId)

  if (error) {
    console.error('Update due date error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Notify student if email provided and a due date was set
  if (dueDate && studentEmail) {
    // Fetch worksheet title for the assignment
    const { data: assignment } = await admin
      .from('student_assignments')
      .select('worksheets ( title )')
      .eq('id', assignmentId)
      .single()

    const worksheetTitle =
      (assignment?.worksheets as unknown as { title: string } | null)?.title ?? 'your assignment'

    const formattedDate = new Date(dueDate).toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric',
    })

    // Fire-and-forget email directly
    sendDueDateUpdatedNotification(
      studentEmail,
      studentName ?? studentEmail,
      worksheetTitle,
      formattedDate,
      assignmentId,
    ).catch(console.error)
  }

  return NextResponse.json({ ok: true })
}
