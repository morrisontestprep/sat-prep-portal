import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'

// ── GET /api/explanations?questionId=xxx ─────────────────────────────────────
// Returns all saved explanations for a question (teacher view for reuse picker).
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const teacherEmail = process.env.TEACHER_EMAIL || 'morrisontestprep@gmail.com'
  if (!user || user.email !== teacherEmail) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const questionId = searchParams.get('questionId')
  if (!questionId) return NextResponse.json({ error: 'questionId required' }, { status: 400 })

  const { data, error } = await supabase
    .from('question_explanations')
    .select('id, steps, sent_at, created_at, student_id, profiles!student_id(full_name, email)')
    .eq('question_id', questionId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ explanations: data ?? [] })
}

// ── POST /api/explanations ────────────────────────────────────────────────────
// Creates an explanation and sends it to a student (or saves draft).
// Body: { questionId, assignmentId, studentId, steps }
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const teacherEmail = process.env.TEACHER_EMAIL || 'morrisontestprep@gmail.com'
  if (!user || user.email !== teacherEmail) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { questionId, assignmentId, studentId, steps, worksheetTitle } = body

  if (!questionId || !assignmentId || !studentId || !steps) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Upsert: if explanation already exists for this assignment+question, update it
  const { data: existing } = await admin
    .from('question_explanations')
    .select('id')
    .eq('question_id', questionId)
    .eq('assignment_id', assignmentId)
    .maybeSingle()

  let explanationId: string

  if (existing) {
    // Update existing
    const { error } = await admin
      .from('question_explanations')
      .update({ steps, sent_at: new Date().toISOString() })
      .eq('id', existing.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    explanationId = existing.id
  } else {
    // Insert new
    const { data: inserted, error } = await admin
      .from('question_explanations')
      .insert({
        question_id: questionId,
        assignment_id: assignmentId,
        student_id: studentId,
        created_by: user.id,
        steps,
        sent_at: new Date().toISOString(),
      })
      .select('id')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    explanationId = inserted.id
  }

  // Create in-app notification for the student
  await admin.from('notifications').insert({
    student_id: studentId,
    type: 'explanation',
    data: {
      assignment_id: assignmentId,
      question_id: questionId,
      explanation_id: explanationId,
      worksheet_title: worksheetTitle ?? '',
    },
  })

  return NextResponse.json({ ok: true, explanationId })
}
