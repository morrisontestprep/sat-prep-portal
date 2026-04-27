import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
import StudentsClient from './StudentsClient'

export default async function StudentsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Fetch all students
  const { data: students } = await supabase
    .from('profiles')
    .select('id, full_name, email, created_at')
    .eq('role', 'student')
    .order('full_name', { ascending: true })

  // Fetch all student assignments with worksheet info
  const { data: allAssignments } = await supabase
    .from('student_assignments')
    .select(`
      id,
      student_id,
      assigned_at,
      due_date,
      status,
      worksheets ( id, title )
    `)
    .order('assigned_at', { ascending: false })

  // Group assignments by student
  type Assignment = {
    id: string
    student_id: string
    assigned_at: string
    due_date: string | null
    status: string
    worksheets: { id: string; title: string } | null
  }

  const assignmentsByStudent: Record<string, Assignment[]> = {}
  for (const a of (allAssignments ?? []) as unknown as Assignment[]) {
    if (!assignmentsByStudent[a.student_id]) assignmentsByStudent[a.student_id] = []
    assignmentsByStudent[a.student_id].push(a)
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--background)' }}>
      <Nav userEmail={user.email} />

      <main className="flex-1 p-6 max-w-5xl mx-auto w-full">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>Students</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {students?.length ?? 0} student{students?.length !== 1 ? 's' : ''} enrolled
            </p>
          </div>
        </div>

        <StudentsClient
          students={students ?? []}
          assignmentsByStudent={assignmentsByStudent}
        />
      </main>
    </div>
  )
}
