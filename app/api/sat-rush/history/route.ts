import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'

// GET /api/sat-rush/history
// Returns this student's past completed games (most recent first), with answer details.
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: games, error } = await supabase
    .from('sat_rush_games')
    .select(`
      id,
      created_at,
      completed_at,
      status,
      total_duration_seconds,
      time_per_question_seconds,
      subject_filter,
      domain_filter,
      skill_filter,
      difficulty_filter,
      total_score,
      questions_attempted,
      questions_correct,
      questions_incorrect,
      ended_reason
    `)
    .eq('student_id', user.id)
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ games: games ?? [] })
}
