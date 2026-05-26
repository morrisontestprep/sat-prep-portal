import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
import PracticeTestLauncher from './PracticeTestLauncher'

export default async function PracticeTestsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/callback')

  const { data: tests } = await supabase
    .from('practice_tests')
    .select('id, created_at, completed_at, status, rw_scaled_score, math_scaled_score, total_scaled_score, rw_m1_correct, rw_m2_correct, math_m1_correct, math_m2_correct, retake_of')
    .eq('student_id', user.id)
    .order('created_at', { ascending: false })
    .limit(20)

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--background)' }}>
      <Nav userEmail={user.email} />
      <main className="flex-1 p-6 max-w-3xl mx-auto w-full">
        <PracticeTestLauncher tests={tests ?? []} />
      </main>
    </div>
  )
}
