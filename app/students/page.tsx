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
      worksheet_id,
      attempt_number,
      assigned_at,
      due_date,
      status,
      completed_at,
      worksheets ( id, title )
    `)
    .order('assigned_at', { ascending: false })

  // Fetch all guides (for the per-student guide panel)
  const { data: allGuides, error: guidesError } = await supabase
    .from('instructional_guides')
    .select('*')
    .order('updated_at', { ascending: false })
  if (guidesError) console.error('guides fetch error:', guidesError.message)

  // Fetch all guide shares (table may not exist yet if migration hasn't run)
  let allShares: { guide_id: string; student_id: string }[] | null = null
  try {
    const { data } = await supabase.from('guide_shares').select('guide_id, student_id')
    allShares = data
  } catch { /* table not yet created */ }

  // Group assignments by student
  type Assignment = {
    id: string
    student_id: string
    worksheet_id: string | null
    attempt_number: number | null
    assigned_at: string
    due_date: string | null
    status: string
    completed_at: string | null
    worksheets: { id: string; title: string } | null
  }

  const assignmentsByStudent: Record<string, Assignment[]> = {}
  for (const a of (allAssignments ?? []) as unknown as Assignment[]) {
    if (!assignmentsByStudent[a.student_id]) assignmentsByStudent[a.student_id] = []
    assignmentsByStudent[a.student_id].push(a)
  }

  // Build sharesByStudent: { studentId: guideId[] }
  const sharesByStudent: Record<string, string[]> = {}
  for (const s of (allShares ?? []) as { guide_id: string; student_id: string }[]) {
    if (!sharesByStudent[s.student_id]) sharesByStudent[s.student_id] = []
    sharesByStudent[s.student_id].push(s.guide_id)
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
          allGuides={(allGuides ?? []) as { id: string; title: string; subject: string | null; domain: string | null }[]}
          sharesByStudent={sharesByStudent}
        />
      </main>
    </div>
  )
}
