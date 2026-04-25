import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
import Link from 'next/link'
import AssignmentActions from './AssignmentActions'

export default async function MyAssignmentsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Fetch this student's assignments — try with attempt_number, fall back without
  type Assignment = {
    id: string
    assigned_at: string
    due_date: string | null
    status: string
    attempt_number: number
    worksheets: { id: string; title: string } | null
  }

  let items: Assignment[] = []

  const { data: withAttempt, error: fetchErr } = await supabase
    .from('student_assignments')
    .select('id, assigned_at, due_date, status, attempt_number, worksheets ( id, title )')
    .eq('student_id', user.id)
    .order('assigned_at', { ascending: false })

  if (fetchErr) {
    // attempt_number column may not exist yet
    const { data: fallback } = await supabase
      .from('student_assignments')
      .select('id, assigned_at, due_date, status, worksheets ( id, title )')
      .eq('student_id', user.id)
      .order('assigned_at', { ascending: false })
    items = ((fallback ?? []) as any[]).map(a => ({ ...a, attempt_number: 1 }))
  } else {
    items = ((withAttempt ?? []) as any[]).map(a => ({ ...a, attempt_number: a.attempt_number ?? 1 }))
  }

  // Fetch answer counts for all assignments (completed for scores, pending to detect "in progress")
  const allIds = items.map(a => a.id)
  let answerStats: Record<string, { correct: number; total: number }> = {}
  if (allIds.length > 0) {
    const { data: answers } = await supabase
      .from('student_answers')
      .select('assignment_id, is_correct')
      .in('assignment_id', allIds)

    if (answers) {
      for (const a of answers) {
        if (!answerStats[a.assignment_id]) answerStats[a.assignment_id] = { correct: 0, total: 0 }
        answerStats[a.assignment_id].total++
        if (a.is_correct) answerStats[a.assignment_id].correct++
      }
    }
  }

  // Group by worksheet to show attempts together
  const worksheetGroups: Record<string, Assignment[]> = {}
  for (const a of items) {
    const wsId = a.worksheets?.id ?? 'unknown'
    if (!worksheetGroups[wsId]) worksheetGroups[wsId] = []
    worksheetGroups[wsId].push(a)
  }

  // Sort each group by attempt_number
  for (const wsId in worksheetGroups) {
    worksheetGroups[wsId].sort((a, b) => (b.attempt_number ?? 1) - (a.attempt_number ?? 1))
  }

  // Get student's profile for name
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .maybeSingle()

  const totalAssignments = Object.keys(worksheetGroups).length

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--background)' }}>
      <Nav userEmail={user.email} />

      <main className="flex-1 p-6 max-w-3xl mx-auto w-full">
        <div className="mb-6">
          <h1 className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>
            {profile?.full_name ? `Hi, ${profile.full_name.split(' ')[0]}!` : 'My Assignments'}
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {totalAssignments} worksheet{totalAssignments !== 1 ? 's' : ''} assigned
          </p>
        </div>

        {totalAssignments === 0 ? (
          <div className="text-center py-20 rounded-2xl border-2 border-dashed"
            style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
            <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="font-medium">No assignments yet</p>
            <p className="text-sm mt-1">Your teacher will assign worksheets for you to complete.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(worksheetGroups).map(([wsId, attempts]) => {
              const latestAttempt = attempts[0]
              const ws = latestAttempt.worksheets
              const latestComplete = latestAttempt.status === 'complete'
              const latestStats = answerStats[latestAttempt.id]
              const maxAttempt = Math.max(...attempts.map(a => a.attempt_number ?? 1))
              const assignedDate = new Date(attempts[attempts.length - 1].assigned_at).toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', year: 'numeric',
              })

              return (
                <div key={wsId} className="rounded-2xl border overflow-hidden"
                  style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
                  {/* Worksheet header */}
                  <div className="p-5">
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="font-semibold text-base truncate" style={{ color: 'var(--foreground)' }}>
                          {ws?.title ?? 'Untitled Worksheet'}
                        </p>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                          Assigned {assignedDate}
                          {latestAttempt.due_date && ` · Due ${new Date(latestAttempt.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        {latestComplete && latestStats && (
                          <span className="text-sm font-bold"
                            style={{ color: latestStats.correct / latestStats.total >= 0.7 ? '#16a34a' : latestStats.correct / latestStats.total >= 0.5 ? '#ca8a04' : '#dc2626' }}>
                            {Math.round((latestStats.correct / latestStats.total) * 100)}%
                          </span>
                        )}
                        <Link
                          href={`/take/${latestAttempt.id}`}
                          className="text-xs px-3 py-1.5 rounded-lg font-medium text-white"
                          style={{ background: latestComplete ? 'var(--text-muted)' : 'var(--accent)' }}>
                          {latestComplete ? 'View Results' : (answerStats[latestAttempt.id]?.total ?? 0) > 0 ? 'Continue' : 'Start'}
                        </Link>
                        {latestComplete && ws && (
                          <AssignmentActions
                            worksheetId={ws.id}
                            studentId={user.id}
                            nextAttemptNumber={maxAttempt + 1}
                          />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Attempt history (if more than 1 attempt) */}
                  {attempts.length > 1 && (
                    <div className="border-t px-5 py-3" style={{ borderColor: 'var(--border)', background: 'var(--background)' }}>
                      <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>
                        All attempts
                      </p>
                      <div className="space-y-1.5">
                        {attempts.map(a => {
                          const stats = answerStats[a.id]
                          return (
                            <Link key={a.id} href={`/take/${a.id}`}
                              className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:opacity-80 transition-opacity">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-medium" style={{ color: 'var(--foreground)' }}>
                                  Attempt {a.attempt_number ?? 1}
                                </span>
                                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                  {new Date(a.assigned_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                {a.status === 'complete' && stats ? (
                                  <span className="text-xs font-medium"
                                    style={{ color: stats.correct / stats.total >= 0.7 ? '#16a34a' : stats.correct / stats.total >= 0.5 ? '#ca8a04' : '#dc2626' }}>
                                    {stats.correct}/{stats.total} ({Math.round((stats.correct / stats.total) * 100)}%)
                                  </span>
                                ) : (
                                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                    {a.status === 'complete' ? 'Complete' : 'In progress'}
                                  </span>
                                )}
                              </div>
                            </Link>
                          )
                        })}
                      </div>
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
