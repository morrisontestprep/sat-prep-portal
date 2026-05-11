import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
import Link from 'next/link'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Recent worksheet assignments (teacher view — what you've sent to students)
  const { data: recentAssignments } = await supabase
    .from('student_assignments')
    .select(`
      id,
      assigned_at,
      due_date,
      status,
      worksheets ( id, title ),
      profiles ( full_name, email )
    `)
    .order('assigned_at', { ascending: false })
    .limit(10)

  const { count: totalQuestions } = await supabase
    .from('questions')
    .select('*', { count: 'exact', head: true })

  const { count: worksheetCount } = await supabase
    .from('worksheets')
    .select('*', { count: 'exact', head: true })

  const { count: studentCount } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('role', 'student')

  const assignments = (recentAssignments ?? []) as unknown as Array<{
    id: string
    assigned_at: string
    due_date: string | null
    status: string
    worksheets: { id: string; title: string } | null
    profiles: { full_name: string | null; email: string | null } | null
  }>

  return (
    <div className="min-h-screen flex flex-col">
      <Nav userEmail={user.email} />

      <main className="flex-1 p-4 sm:p-6 max-w-5xl mx-auto w-full">
        <div className="mb-6">
          <h1 className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>Dashboard</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Welcome back, {user.email}</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="rounded-xl border p-5" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
            <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Question Bank</p>
            <p className="text-3xl font-bold" style={{ color: 'var(--foreground)' }}>{totalQuestions?.toLocaleString()}</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Math + English</p>
          </div>
          <div className="rounded-xl border p-5" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
            <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Worksheets</p>
            <p className="text-3xl font-bold" style={{ color: 'var(--foreground)' }}>{worksheetCount ?? 0}</p>
            <Link href="/worksheets" className="text-xs mt-1 hover:underline" style={{ color: 'var(--accent)' }}>
              View all →
            </Link>
          </div>
          <div className="rounded-xl border p-5" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
            <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Students</p>
            <p className="text-3xl font-bold" style={{ color: 'var(--foreground)' }}>{studentCount ?? 0}</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Active accounts</p>
          </div>
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          <Link
            href="/questions"
            className="rounded-xl border p-5 flex items-start gap-4 hover:shadow-sm transition-shadow group"
            style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
          >
            <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--accent-light)' }}>
              <svg className="w-5 h-5" style={{ color: 'var(--accent)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-sm" style={{ color: 'var(--foreground)' }}>Browse Questions</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Filter by subject, domain, skill, difficulty, and tags. Select questions to build a worksheet.</p>
            </div>
          </Link>

          <Link
            href="/worksheets"
            className="rounded-xl border p-5 flex items-start gap-4 hover:shadow-sm transition-shadow"
            style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
          >
            <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: '#f0fdf4' }}>
              <svg className="w-5 h-5" style={{ color: '#16a34a' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-sm" style={{ color: 'var(--foreground)' }}>Worksheets</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>View saved worksheets, assign them to students, or create a new one from the question bank.</p>
            </div>
          </Link>
        </div>

        {/* Recent assignments */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold" style={{ color: 'var(--foreground)' }}>Recently Assigned</h2>
            <Link href="/worksheets" className="text-xs hover:underline" style={{ color: 'var(--accent)' }}>
              See all worksheets →
            </Link>
          </div>

          {assignments.length === 0 ? (
            <div className="rounded-xl border p-8 text-center" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                No assignments yet. Create a worksheet from the Question Bank and assign it to a student.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border overflow-hidden" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
              {assignments.map((a, i) => {
                const ws = a.worksheets as { id: string; title: string } | null
                const student = a.profiles as { full_name: string | null; email: string | null } | null
                const assignedDate = new Date(a.assigned_at).toLocaleDateString('en-US', {
                  month: 'short', day: 'numeric', year: 'numeric',
                })
                return (
                  <Link
                    key={a.id}
                    href={ws ? `/worksheets/${ws.id}` : '#'}
                    className={`px-5 py-4 flex items-center justify-between gap-4 hover:opacity-80 transition-opacity ${i < assignments.length - 1 ? 'border-b' : ''}`}
                    style={{ borderColor: 'var(--border)' }}
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate" style={{ color: 'var(--foreground)' }}>
                        {ws?.title ?? 'Untitled Worksheet'}
                      </p>
                      <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
                        → {student?.full_name || student?.email || 'Unknown student'}
                        {a.due_date && ` · Due ${new Date(a.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{assignedDate}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full"
                        style={{
                          background: a.status === 'complete' ? '#f0fdf4' : '#fffbeb',
                          color: a.status === 'complete' ? '#16a34a' : '#d97706',
                        }}>
                        {a.status === 'complete' ? 'Complete' : 'Pending'}
                      </span>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
