import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'

// POST /api/sat-rush/end
// Body: { gameId, reason } — reason: 'time_up' | 'three_wrong' | 'manual'
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

  return NextResponse.json({ ok: true })
}
