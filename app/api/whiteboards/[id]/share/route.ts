import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'

const TEACHER_EMAIL = 'morrisontestprep@gmail.com'

type Ctx = { params: Promise<{ id: string }> }

// GET /api/whiteboards/[id]/share — current shares for this board
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: sharesRaw, error } = await supabase
    .from('whiteboard_shares')
    .select('id, shared_with, access_level, created_at')
    .eq('whiteboard_id', id)
    .is('revoked_at', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!sharesRaw?.length) return NextResponse.json([])

  // Fetch profile info separately (shared_with → auth.users → profiles)
  const userIds = sharesRaw.map(s => s.shared_with)
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .in('id', userIds)

  const profileMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p]))

  const result = sharesRaw.map(s => ({
    ...s,
    profiles: profileMap[s.shared_with] ?? null,
  }))

  return NextResponse.json(result)
}

// POST /api/whiteboards/[id]/share — create or restore shares
// Body (teacher → students): { studentIds: string[], accessLevel: 'view'|'edit' }
// Body (student → teacher):  { withTeacher: true }
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()

  // Student sharing back with teacher
  if (body.withTeacher) {
    const { data: teacherProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', TEACHER_EMAIL)
      .maybeSingle()

    if (!teacherProfile) return NextResponse.json({ error: 'Teacher not found' }, { status: 404 })

    const { error } = await supabase
      .from('whiteboard_shares')
      .upsert({
        whiteboard_id: id,
        shared_with:   teacherProfile.id,
        access_level:  'edit',
        revoked_at:    null,
      }, { onConflict: 'whiteboard_id,shared_with' })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // Teacher sharing with students
  const { studentIds, accessLevel } = body as { studentIds: string[]; accessLevel: 'view' | 'edit' }
  // Multiple recipients → force view-only
  const effectiveAccess: 'view' | 'edit' = studentIds.length > 1 ? 'view' : (accessLevel ?? 'view')

  const rows = studentIds.map((sid: string) => ({
    whiteboard_id: id,
    shared_with:   sid,
    access_level:  effectiveAccess,
    revoked_at:    null,
  }))

  const { error } = await supabase
    .from('whiteboard_shares')
    .upsert(rows, { onConflict: 'whiteboard_id,shared_with' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// PATCH /api/whiteboards/[id]/share — change access level for a share
// Body: { shareId: string, accessLevel: 'view'|'edit' }
export async function PATCH(req: Request, { params }: Ctx) {
  const { id: _id } = await params   // board id not needed but kept for route symmetry
  void _id
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { shareId, accessLevel } = await req.json()

  const { error } = await supabase
    .from('whiteboard_shares')
    .update({ access_level: accessLevel })
    .eq('id', shareId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE /api/whiteboards/[id]/share?shareId=xxx — revoke a share
export async function DELETE(req: Request, { params }: Ctx) {
  const { id: _id } = await params
  void _id
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const shareId = new URL(req.url).searchParams.get('shareId')
  if (!shareId) return NextResponse.json({ error: 'shareId required' }, { status: 400 })

  const { error } = await supabase
    .from('whiteboard_shares')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', shareId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
