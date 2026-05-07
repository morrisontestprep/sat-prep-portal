import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
import WorksheetEditor from './WorksheetEditor'

export default async function NewWorksheetPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; student?: string }>
}) {
  const { q, student: initialStudentId } = await searchParams
  const questionIds = q ? q.split(',').filter(Boolean) : []

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Fetch the selected questions
  let questions: Record<string, unknown>[] = []
  if (questionIds.length > 0) {
    const { data } = await supabase
      .from('questions')
      .select('id, subject, domain, skill, difficulty')
      .in('id', questionIds)
    questions = data ?? []

    // Preserve the original selection order
    const order = new Map(questionIds.map((id, i) => [id, i]))
    questions.sort((a, b) => (order.get(a.id as string) ?? 0) - (order.get(b.id as string) ?? 0))
  }

  // Fetch all students (profiles with role = 'student')
  const { data: students } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .eq('role', 'student')
    .order('full_name')

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--background)' }}>
      <Nav userEmail={user.email} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <WorksheetEditor
          initialQuestions={questions as { id: string; subject: string; domain: string; skill: string; difficulty: string }[]}
          students={students ?? []}
          initialStudentId={initialStudentId}
        />
      </div>
    </div>
  )
}
