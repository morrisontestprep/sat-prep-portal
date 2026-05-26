import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'

// GET /api/practice-test/history?studentId=<uuid>
// Returns list of practice tests for the current student (or specified student if teacher).

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const requestedStudentId = searchParams.get('studentId')

  const TEACHER_EMAIL = process.env.TEACHER_EMAIL ?? 'morrisontestprep@gmail.com'
  const isTeacher = user.email === TEACHER_EMAIL
  const targetStudentId = (isTeacher && requestedStudentId) ? requestedStudentId : user.id

  const { data, error } = await supabase
    .from('practice_tests')
    .select('id, created_at, completed_at, status, rw_scaled_score, math_scaled_score, total_scaled_score, rw_m1_correct, rw_m2_correct, math_m1_correct, math_m2_correct, retake_of')
    .eq('student_id', targetStudentId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ tests: data ?? [] })
}
