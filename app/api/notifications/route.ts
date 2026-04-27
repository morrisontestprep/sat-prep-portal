import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'

// ── GET /api/notifications ────────────────────────────────────────────────────
// Returns notifications for the currently authenticated student.
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('notifications')
    .select('id, type, data, read, created_at')
    .eq('student_id', user.id)
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ notifications: data ?? [] })
}

// ── PATCH /api/notifications ──────────────────────────────────────────────────
// Mark notifications as read. Body: { ids: string[] } or { all: true }
export async function PATCH(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const admin = createAdminClient()

  if (body.all) {
    await admin.from('notifications').update({ read: true }).eq('student_id', user.id).eq('read', false)
  } else if (Array.isArray(body.ids) && body.ids.length > 0) {
    await admin.from('notifications').update({ read: true }).in('id', body.ids).eq('student_id', user.id)
  }

  return NextResponse.json({ ok: true })
}
