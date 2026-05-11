import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'

// GET /api/whiteboards — list boards visible to the current user
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [ownRes, sharedRes] = await Promise.all([
    supabase
      .from('whiteboards')
      .select('id, name, created_at, updated_at')
      .eq('created_by', user.id)
      .order('updated_at', { ascending: false }),

    supabase
      .from('whiteboard_shares')
      .select('id, access_level, whiteboards(id, name, created_at, updated_at)')
      .eq('shared_with', user.id)
      .is('revoked_at', null),
  ])

  return NextResponse.json({
    ownBoards:    ownRes.data    ?? [],
    sharedBoards: sharedRes.data ?? [],
  })
}

// POST /api/whiteboards — create a new blank board
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('whiteboards')
    .insert({ created_by: user.id })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
