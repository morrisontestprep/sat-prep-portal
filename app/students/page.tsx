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

  // Fetch whiteboard shares: teacher→student and student→teacher
  const studentIds = (students ?? []).map(s => s.id)
  type WBShareItem = { shareId: string; boardId: string; boardName: string; accessLevel: string }
  type WBStudentBoard = { shareId: string; boardId: string; boardName: string }
  let wbSharedWithStudents: Record<string, WBShareItem[]> = {}
  let wbStudentBoardsForTeacher: Record<string, WBStudentBoard[]> = {}

  if (studentIds.length > 0) {
    // Teacher → student shares (boards teacher created, shared with students)
    const { data: t2s } = await supabase
      .from('whiteboard_shares')
      .select('id, shared_with, access_level, whiteboards(id, name, created_by)')
      .in('shared_with', studentIds)
      .is('revoked_at', null)

    for (const s of (t2s ?? []) as any[]) {
      const board = s.whiteboards
      if (!board || board.created_by !== user.id) continue
      if (!wbSharedWithStudents[s.shared_with]) wbSharedWithStudents[s.shared_with] = []
      wbSharedWithStudents[s.shared_with].push({
        shareId: s.id, boardId: board.id, boardName: board.name || 'Untitled Board', accessLevel: s.access_level,
      })
    }

    // Student → teacher shares (boards students created, shared with teacher)
    // Use two separate queries to avoid circular RLS recursion
    const { data: s2tShares } = await supabase
      .from('whiteboard_shares')
      .select('id, whiteboard_id')
      .eq('shared_with', user.id)
      .is('revoked_at', null)

    const s2tBoardIds = (s2tShares ?? []).map((s: any) => s.whiteboard_id).filter(Boolean)
    const { data: s2tBoards } = s2tBoardIds.length > 0
      ? await supabase.from('whiteboards').select('id, name, created_by').in('id', s2tBoardIds)
      : { data: [] as { id: string; name: string; created_by: string }[] }

    const s2tBoardMap = Object.fromEntries((s2tBoards ?? []).map((b: any) => [b.id, b]))
    for (const s of (s2tShares ?? []) as any[]) {
      const board = s2tBoardMap[s.whiteboard_id]
      if (!board) continue
      if (!studentIds.includes(board.created_by)) continue
      if (!wbStudentBoardsForTeacher[board.created_by]) wbStudentBoardsForTeacher[board.created_by] = []
      wbStudentBoardsForTeacher[board.created_by].push({
        shareId: s.id, boardId: board.id, boardName: board.name || 'Untitled Board',
      })
    }
  }

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

  // Fetch per-assignment score + time from student_answers
  const completedAssignmentIds = (allAssignments ?? [])
    .filter((a: any) => a.status === 'complete')
    .map((a: any) => a.id)

  type AssignmentStat = { correct: number; total: number; seconds: number }
  const assignmentStats: Record<string, AssignmentStat> = {}

  if (completedAssignmentIds.length > 0) {
    const { data: answerRows } = await supabase
      .from('student_answers')
      .select('assignment_id, is_correct, time_spent_seconds')
      .in('assignment_id', completedAssignmentIds)

    for (const row of (answerRows ?? []) as { assignment_id: string; is_correct: boolean | null; time_spent_seconds: number | null }[]) {
      if (!assignmentStats[row.assignment_id]) {
        assignmentStats[row.assignment_id] = { correct: 0, total: 0, seconds: 0 }
      }
      const s = assignmentStats[row.assignment_id]
      s.total += 1
      if (row.is_correct) s.correct += 1
      s.seconds += Math.round(row.time_spent_seconds ?? 0)
    }
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
          assignmentStats={assignmentStats}
          allGuides={(allGuides ?? []) as { id: string; title: string; subject: string | null; domain: string | null }[]}
          sharesByStudent={sharesByStudent}
          wbSharedWithStudents={wbSharedWithStudents}
          wbStudentBoardsForTeacher={wbStudentBoardsForTeacher}
        />
      </main>
    </div>
  )
}
