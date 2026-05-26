import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'

const TEACHER_EMAIL = process.env.TEACHER_EMAIL || 'morrisontestprep@gmail.com'

function randomHexId(len = 8) {
  return Array.from(crypto.getRandomValues(new Uint8Array(len / 2)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

// ── PATCH /api/ai-questions ───────────────────────────────────────────────────
// Update the review status of an AI-generated question.
// Body: { id: string, status: 'pending' | 'approved' | 'discarded' }
//
// 'approved'  → insert a row into questions (is_ai_generated=true), store back-ref
// 'discarded' → just update status
// 'pending'   → undo: if previously approved, delete the promoted questions row
export async function PATCH(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user || user.email !== TEACHER_EMAIL) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { id, status } = body as { id: string; status: string }

  if (!id || !['pending', 'approved', 'discarded'].includes(status)) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Fetch the AI question record so we can use its data
  const { data: aiQ, error: fetchErr } = await admin
    .from('ai_generated_questions')
    .select('*')
    .eq('id', id)
    .single()

  if (fetchErr || !aiQ) {
    return NextResponse.json({ error: 'Question not found' }, { status: 404 })
  }

  // ── APPROVE: promote to main questions table ────────────────────────────────
  if (status === 'approved') {
    // If already approved + promoted, nothing to do
    if (aiQ.status === 'approved' && aiQ.promoted_question_id) {
      return NextResponse.json({ ok: true, questionId: aiQ.promoted_question_id })
    }

    const newId = randomHexId(8)

    const { error: insertErr } = await admin
      .from('questions')
      .insert({
        id:                 newId,
        subject:            aiQ.subject,
        domain:             aiQ.domain,
        skill:              aiQ.skill,
        difficulty:         aiQ.difficulty,
        correct_answer:     aiQ.correct_answer,
        is_ai_generated:    true,
        stem:               aiQ.stem,
        choices:            aiQ.choices,
        distractor_notes:   aiQ.distractor_notes,
        question_image_url: null,
        answer_image_url:   null,
      })

    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 })
    }

    const { error: updateErr } = await admin
      .from('ai_generated_questions')
      .update({ status: 'approved', promoted_question_id: newId })
      .eq('id', id)

    if (updateErr) {
      // Roll back the questions insert
      await admin.from('questions').delete().eq('id', newId)
      return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, questionId: newId })
  }

  // ── UNDO APPROVE: delete the promoted question row ──────────────────────────
  if (status === 'pending' && aiQ.status === 'approved' && aiQ.promoted_question_id) {
    await admin.from('questions').delete().eq('id', aiQ.promoted_question_id)
  }

  // ── DISCARD or UNDO (pending from discarded): just update status ─────────────
  const updatePayload: Record<string, unknown> = { status }
  if (status === 'pending') updatePayload.promoted_question_id = null

  const { error } = await admin
    .from('ai_generated_questions')
    .update(updatePayload)
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
