import { createClient } from '@/utils/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Nav from '@/components/Nav'
import AnalyticsClient from './AnalyticsClient'
import { fetchAllAnswers } from '@/lib/analyticsData'

export default async function StudentAnalyticsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: studentId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Teacher-only route
  const TEACHER_EMAIL = process.env.TEACHER_EMAIL ?? 'morrisontestprep@gmail.com'
  if (user.email !== TEACHER_EMAIL) redirect('/my-analytics')

  // Fetch the specific student
  const { data: student } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .eq('id', studentId)
    .eq('role', 'student')
    .single()

  if (!student) notFound()

  // Fetch all students for the switcher
  const { data: allStudents } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .eq('role', 'student')
    .order('full_name')

  // Fetch all answers across all 3 sources
  const answers = await fetchAllAnswers(supabase, studentId)

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--background)' }}>
      <Nav userEmail={user.email} />
      <main className="flex-1 p-6 max-w-6xl mx-auto w-full">
        <AnalyticsClient
          student={student as { id: string; full_name: string | null; email: string | null }}
          allStudents={(allStudents ?? []) as { id: string; full_name: string | null; email: string | null }[]}
          answers={answers}
          isTeacher={true}
        />
      </main>
    </div>
  )
}
