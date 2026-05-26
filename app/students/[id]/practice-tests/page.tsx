import { createClient } from '@/utils/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Nav from '@/components/Nav'
import Link from 'next/link'

// Teacher: list of all practice tests for a student

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default async function StudentPracticeTestsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: studentId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const TEACHER_EMAIL = process.env.TEACHER_EMAIL ?? 'morrisontestprep@gmail.com'
  if (user.email !== TEACHER_EMAIL) redirect('/my-analytics')

  const { data: student } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .eq('id', studentId)
    .single()

  if (!student) notFound()

  const { data: tests } = await supabase
    .from('practice_tests')
    .select('id, created_at, completed_at, status, rw_scaled_score, math_scaled_score, total_scaled_score, rw_m1_correct, rw_m2_correct, math_m1_correct, math_m2_correct, retake_of')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })

  const scoreColor = (s: number | null) => {
    if (s == null) return 'var(--text-muted)'
    if (s >= 700) return '#16a34a'
    if (s >= 500) return '#d97706'
    return '#dc2626'
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--background)' }}>
      <Nav userEmail={user.email} />
      <main className="flex-1 p-6 max-w-4xl mx-auto w-full flex flex-col gap-6">
        <div>
          <Link href={`/students/${studentId}/analytics`} className="text-sm" style={{ color: 'var(--accent)' }}>
            ← Analytics
          </Link>
          <h1 className="text-2xl font-bold mt-1" style={{ color: 'var(--foreground)' }}>
            Practice Tests — {student.full_name || student.email}
          </h1>
        </div>

        {(tests ?? []).length === 0 && (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No practice tests yet.</p>
        )}

        {(tests ?? []).map(t => (
          <div
            key={t.id}
            className="rounded-2xl border p-4 flex items-center gap-4 flex-wrap"
            style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>
                {fmtDate(t.created_at)}
                {t.retake_of && <span className="ml-2 text-xs font-normal" style={{ color: 'var(--text-muted)' }}>(Retake)</span>}
              </p>
              {t.status !== 'completed' && (
                <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#eff6ff', color: '#1d4ed8' }}>
                  In Progress
                </span>
              )}
              {t.status === 'completed' && (
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  M1: {t.rw_m1_correct}/27 · M2: {t.rw_m2_correct}/27 · Math M1: {t.math_m1_correct}/22 · Math M2: {t.math_m2_correct}/22
                </p>
              )}
            </div>

            {t.status === 'completed' && (
              <div className="flex gap-5 items-baseline">
                <div className="text-center">
                  <p className="text-xl font-bold" style={{ color: scoreColor(t.total_scaled_score) }}>{t.total_scaled_score ?? '—'}</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Total</p>
                </div>
                <div className="text-center">
                  <p className="text-base font-semibold" style={{ color: scoreColor(t.rw_scaled_score) }}>{t.rw_scaled_score ?? '—'}</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>R&amp;W</p>
                </div>
                <div className="text-center">
                  <p className="text-base font-semibold" style={{ color: scoreColor(t.math_scaled_score) }}>{t.math_scaled_score ?? '—'}</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Math</p>
                </div>
              </div>
            )}

            {t.status === 'completed' && (
              <Link
                href={`/students/${studentId}/practice-tests/${t.id}`}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-white flex-shrink-0"
                style={{ background: 'var(--accent)' }}>
                Review
              </Link>
            )}
          </div>
        ))}
      </main>
    </div>
  )
}
