import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
import Link from 'next/link'

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

        {(!students || students.length === 0) ? (
          <div className="text-center py-20 rounded-2xl border-2 border-dashed"
            style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
            <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            <p className="font-medium">No students yet</p>
            <p className="text-sm mt-1">Students will appear here once they sign in with Google.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {students.map(student => {
              const assignments = assignmentsByStudent[student.id] ?? []
              const completedCount = assignments.filter(a => a.status === 'complete').length
              const pendingCount = assignments.filter(a => a.status === 'pending').length
              const joinedDate = new Date(student.created_at).toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', year: 'numeric',
              })

              return (
                <div key={student.id} className="rounded-2xl border overflow-hidden"
                  style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
                  {/* Student header */}
                  <div className="px-6 py-4 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4 min-w-0">
                      {/* Avatar */}
                      <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-semibold text-white"
                        style={{ background: 'var(--accent)' }}>
                        {(student.full_name || student.email || '?').charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-sm truncate" style={{ color: 'var(--foreground)' }}>
                          {student.full_name || 'No name'}
                        </p>
                        <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                          {student.email}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 flex-shrink-0">
                      {/* Stats badges */}
                      <div className="flex items-center gap-2">
                        <span className="text-xs px-2 py-0.5 rounded-full"
                          style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}>
                          {assignments.length} assigned
                        </span>
                        {completedCount > 0 && (
                          <span className="text-xs px-2 py-0.5 rounded-full"
                            style={{ background: '#f0fdf4', color: '#16a34a' }}>
                            {completedCount} complete
                          </span>
                        )}
                        {pendingCount > 0 && (
                          <span className="text-xs px-2 py-0.5 rounded-full"
                            style={{ background: '#fffbeb', color: '#d97706' }}>
                            {pendingCount} pending
                          </span>
                        )}
                      </div>
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        Joined {joinedDate}
                      </span>
                    </div>
                  </div>

                  {/* Assignments list (if any) */}
                  {assignments.length > 0 && (
                    <div className="border-t" style={{ borderColor: 'var(--border)' }}>
                      <table className="w-full text-sm">
                        <thead>
                          <tr style={{ background: 'var(--background)' }}>
                            <th className="text-left text-xs font-medium px-6 py-2" style={{ color: 'var(--text-muted)' }}>Worksheet</th>
                            <th className="text-left text-xs font-medium px-4 py-2" style={{ color: 'var(--text-muted)' }}>Assigned</th>
                            <th className="text-left text-xs font-medium px-4 py-2" style={{ color: 'var(--text-muted)' }}>Due</th>
                            <th className="text-left text-xs font-medium px-4 py-2" style={{ color: 'var(--text-muted)' }}>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {assignments.map((a, i) => {
                            const ws = a.worksheets as { id: string; title: string } | null
                            return (
                              <tr key={a.id}
                                className={i < assignments.length - 1 ? 'border-b' : ''}
                                style={{ borderColor: 'var(--border)' }}>
                                <td className="px-6 py-2.5">
                                  {ws ? (
                                    <Link href={`/worksheets/${ws.id}`}
                                      className="hover:underline truncate block max-w-xs"
                                      style={{ color: 'var(--accent)' }}>
                                      {ws.title}
                                    </Link>
                                  ) : (
                                    <span style={{ color: 'var(--text-muted)' }}>Deleted worksheet</span>
                                  )}
                                </td>
                                <td className="px-4 py-2.5" style={{ color: 'var(--text-muted)' }}>
                                  {new Date(a.assigned_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                </td>
                                <td className="px-4 py-2.5" style={{ color: 'var(--text-muted)' }}>
                                  {a.due_date
                                    ? new Date(a.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                                    : '—'
                                  }
                                </td>
                                <td className="px-4 py-2.5">
                                  <span className="text-xs px-2 py-0.5 rounded-full"
                                    style={{
                                      background: a.status === 'complete' ? '#f0fdf4' : '#fffbeb',
                                      color: a.status === 'complete' ? '#16a34a' : '#d97706',
                                    }}>
                                    {a.status === 'complete' ? 'Complete' : 'Pending'}
                                  </span>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
