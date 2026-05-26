import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'

// POST /api/practice-test/assignments/[assignmentId]/start
// Called when a student starts a test from an assignment card.
// Links the new practice_tests row to the assignment and marks it as 'started'.
// Body: { testId }

export async function POST(
  request: Request,
  { params }: { params: Promise<{ assignmentId: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { assignmentId } = await params

  let body: { testId: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  // Verify the assignment belongs to this student
  const { data: assignment } = await supabase
    .from('practice_test_assignments')
    .select('id, student_id, status')
    .eq('id', assignmentId)
    .eq('student_id', user.id)
    .single()

  if (!assignment) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (assignment.status !== 'pending') return NextResponse.json({ ok: true }) // already started

  const { error } = await supabase
    .from('practice_test_assignments')
    .update({ status: 'started', test_id: body.testId })
    .eq('id', assignmentId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
