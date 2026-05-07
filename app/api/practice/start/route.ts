import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'

// POST /api/practice/start
// Body: {
//   questionIds: string[]
//   filters?: { subject?: string; domain?: string; skill?: string; difficulties?: string[] }
// }
// Creates a practice_session record and returns the session ID.

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { questionIds, filters = {} }: {
    questionIds: string[]
    filters?: { subject?: string; domain?: string; skill?: string; difficulties?: string[] }
  } = body

  if (!Array.isArray(questionIds) || questionIds.length === 0) {
    return NextResponse.json({ error: 'questionIds is required' }, { status: 400 })
  }

  const { data: session, error } = await supabase
    .from('practice_sessions')
    .insert({
      student_id:        user.id,
      question_ids:      questionIds,
      subject_filter:    filters.subject    ?? null,
      domain_filter:     filters.domain     ?? null,
      skill_filter:      filters.skill      ?? null,
      difficulty_filter: filters.difficulties ?? null,
    })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ sessionId: session.id })
}
