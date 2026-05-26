import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'

// DELETE /api/practice-test/[id]
// Deletes the test and all its answers (cascade).
// Students can only delete their own tests.

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: testId } = await params

  // Verify ownership before deleting
  const { data: test } = await supabase
    .from('practice_tests')
    .select('id')
    .eq('id', testId)
    .eq('student_id', user.id)
    .single()

  if (!test) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // practice_test_answers cascade deletes automatically
  const { error } = await supabase
    .from('practice_tests')
    .delete()
    .eq('id', testId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
