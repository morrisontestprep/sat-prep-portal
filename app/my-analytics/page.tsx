import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
import AnalyticsClient from '@/app/students/[id]/analytics/AnalyticsClient'
import { fetchAllAnswers } from '@/lib/analyticsData'

export default async function MyAnalyticsPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Teacher shouldn't land here
  const TEACHER_EMAIL = process.env.TEACHER_EMAIL ?? 'morrisontestprep@gmail.com'
  if (user.email === TEACHER_EMAIL) redirect('/students')

  // Fetch student profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .eq('id', user.id)
    .single()

  const student = profile ?? { id: user.id, full_name: null, email: user.email ?? null }

  // Fetch all answers across all 3 sources
  const answers = await fetchAllAnswers(supabase, user.id)

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--background)' }}>
      <Nav userEmail={user.email} />
      <main className="flex-1 p-6 max-w-6xl mx-auto w-full">
        <AnalyticsClient
          student={student}
          allStudents={[]}
          answers={answers}
          isTeacher={false}
        />
      </main>
    </div>
  )
}
