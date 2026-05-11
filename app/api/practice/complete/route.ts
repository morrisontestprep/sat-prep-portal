import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'
import { notifyTeacher } from '@/utils/teacherNotify'

// POST /api/practice/complete
// Body: { sessionId }
// Sets completed_at on the session and notifies the teacher.

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { sessionId } = await request.json()

  const { error } = await supabase
    .from('practice_sessions')
    .update({ completed_at: new Date().toISOString() })
    .eq('id', sessionId)
    .eq('student_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Fetch session details for teacher notification
  const { data: session } = await supabase
    .from('practice_sessions')
    .select('question_count')
    .eq('id', sessionId)
    .single()

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, email')
    .eq('id', user.id)
    .single()

  notifyTeacher('practice_completed', {
    studentName:   profile?.full_name ?? '',
    studentEmail:  profile?.email ?? user.email ?? '',
    studentId:     user.id,
    sessionId,
    questionCount: (session as { question_count?: number } | null)?.question_count ?? 0,
  }).catch(console.error)

  return NextResponse.json({ ok: true })
}
