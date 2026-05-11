import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'

const TEACHER_EMAIL = process.env.TEACHER_EMAIL || 'morrisontestprep@gmail.com'

// ── GET /api/teacher-notifications ───────────────────────────────────────────
// Returns all teacher notifications (most recent first, limit 50).
// Only accessible by the teacher.
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email !== TEACHER_EMAIL) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('teacher_notifications')
    .select('id, type, data, read, created_at')
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ notifications: data ?? [] })
}

// ── PATCH /api/teacher-notifications ─────────────────────────────────────────
// Mark notifications as read. Body: { ids: string[] } or { all: true }
// Only marks read (does NOT delete — keep the log).
export async function PATCH(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email !== TEACHER_EMAIL) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const admin = createAdminClient()

  if (body.all) {
    await admin
      .from('teacher_notifications')
      .update({ read: true })
      .eq('read', false)
  } else if (Array.isArray(body.ids) && body.ids.length > 0) {
    await admin
      .from('teacher_notifications')
      .update({ read: true })
      .in('id', body.ids)
  }

  return NextResponse.json({ ok: true })
}

// ── POST /api/teacher-notifications ──────────────────────────────────────────
// Insert a new notification. Called internally from other API routes.
// Requires the internal secret header to avoid being called by anyone.
export async function POST(request: Request) {
  const secret = request.headers.get('x-internal-secret')
  if (secret !== (process.env.INTERNAL_API_SECRET ?? 'sat-prep-internal')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const { type, data } = body
  if (!type) return NextResponse.json({ error: 'type required' }, { status: 400 })

  const admin = createAdminClient()
  const { error } = await admin
    .from('teacher_notifications')
    .insert({ type, data: data ?? {} })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
