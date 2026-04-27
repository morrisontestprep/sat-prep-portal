import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'

export async function DELETE(request: Request) {
  // Verify the caller is the teacher
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const teacherEmail = process.env.TEACHER_EMAIL || 'morrisontestprep@gmail.com'

  if (!user || user.email !== teacherEmail) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { studentId } = await request.json()
  if (!studentId) {
    return NextResponse.json({ error: 'studentId required' }, { status: 400 })
  }

  // Use admin client to bypass RLS
  const admin = createAdminClient()
  const { error } = await admin.from('profiles').delete().eq('id', studentId)

  if (error) {
    console.error('Delete student error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
