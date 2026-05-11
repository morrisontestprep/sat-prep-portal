import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'
import { notifyTeacher } from '@/utils/teacherNotify'

// POST /api/sat-rush/end
// Body: { gameId, reason } — reason: 'time_up' | 'three_wrong' | 'manual' | 'completed'
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { gameId, reason } = await request.json()

  await supabase
    .from('sat_rush_games')
    .update({
      status:       'completed',
      completed_at: new Date().toISOString(),
      ended_reason: reason ?? 'manual',
    })
    .eq('id', gameId)
    .eq('student_id', user.id)

  // Fetch game totals to include in teacher notification
  const { data: game } = await supabase
    .from('sat_rush_games')
    .select('total_score, questions_attempted, questions_correct')
    .eq('id', gameId)
    .eq('student_id', user.id)
    .single()

  // Fetch student profile for display name
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, email')
    .eq('id', user.id)
    .single()

  // Notify teacher (fire-and-forget)
  notifyTeacher('sat_rush_completed', {
    studentName:        profile?.full_name ?? '',
    studentEmail:       profile?.email ?? user.email ?? '',
    studentId:          user.id,
    totalScore:         game?.total_score ?? 0,
    questionsAttempted: game?.questions_attempted ?? 0,
    questionsCorrect:   game?.questions_correct ?? 0,
  }).catch(console.error)

  return NextResponse.json({ ok: true })
}
