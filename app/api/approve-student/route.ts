import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'

const TEACHER_EMAIL = process.env.TEACHER_EMAIL || 'morrisontestprep@gmail.com'

// POST /api/approve-student
// Body: { studentId: string }
// Requires teacher auth. Sets approved = true on the student's profile.
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user || user.email !== TEACHER_EMAIL) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { studentId } = body

  if (!studentId || typeof studentId !== 'string') {
    return NextResponse.json({ error: 'studentId required' }, { status: 400 })
  }

  // Use admin client so RLS doesn't block the update
  const admin = createAdminClient()

  // Safety: only approve profiles with role = 'student' (never the teacher row)
  const { error } = await admin
    .from('profiles')
    .update({ approved: true })
    .eq('id', studentId)
    .eq('role', 'student')

  if (error) {
    console.error('[approve-student] update error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
