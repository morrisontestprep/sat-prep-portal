// Server component that starts a retake and redirects to the new test.
import { createClient } from '@/utils/supabase/server'
import { redirect, notFound } from 'next/navigation'


export default async function RetakePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: originalId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/callback')

  const { data: original } = await supabase
    .from('practice_tests')
    .select('*')
    .eq('id', originalId)
    .eq('student_id', user.id)
    .single()

  if (!original) notFound()

  // Clone question IDs from the original test
  const { data: newTest, error } = await supabase
    .from('practice_tests')
    .insert({
      student_id:               user.id,
      status:                   'active',
      rw_m1_question_ids:       original.rw_m1_question_ids,
      rw_m2_question_ids:       original.rw_m2_question_ids,
      math_m1_question_ids:     original.math_m1_question_ids,
      math_m2_question_ids:     original.math_m2_question_ids,
      rw_m2_difficulty:         original.rw_m2_difficulty,
      math_m2_difficulty:       original.math_m2_difficulty,
      rw_m1_seconds_remaining:  32 * 60,
      retake_of:                originalId,
    })
    .select('id')
    .single()

  if (error || !newTest) {
    redirect('/practice-test')
  }

  redirect(`/practice-test/${newTest.id}`)
}
