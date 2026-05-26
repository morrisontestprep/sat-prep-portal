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

  // Fetch any pending practice test assignments from the teacher
  const { data: assignments } = await supabase
    .from('practice_test_assignments')
    .select('id, due_date, assigned_at, status, test_id')
    .eq('student_id', user.id)
    .eq('status', 'pending')
    .order('assigned_at', { ascending: false })

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--background)' }}>
      <Nav userEmail={user.email} />
      <main className="flex-1 p-6 max-w-3xl mx-auto w-full">
        <PracticeTestLauncher
          tests={tests ?? []}
          assignedTests={(assignments ?? []).map(a => ({
            id:         a.id,
            due_date:   a.due_date,
            assigned_at: a.assigned_at,
            status:     a.status,
          }))}
        />
      </main>
    </div>
  )
}
