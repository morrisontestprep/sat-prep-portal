import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
import Link from 'next/link'

export default async function NewAssignmentPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="min-h-screen flex flex-col">
      <Nav userEmail={user.email} />

      <main className="flex-1 p-6 max-w-3xl mx-auto w-full">
        <div className="mb-6">
          <h1 className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>New Assignment</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Choose how you'd like to build this assignment.</p>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {/* Manual selection */}
          <Link
            href="/questions"
            className="rounded-xl border p-6 flex items-start gap-5 hover:shadow-sm transition-shadow"
            style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
          >
            <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--accent-light)' }}>
              <svg className="w-6 h-6" style={{ color: 'var(--accent)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="font-semibold" style={{ color: 'var(--foreground)' }}>Browse & Select Manually</p>
              <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
                Open the question bank, filter by subject, domain, skill, and difficulty, then check the questions you want to include.
              </p>
              <p className="text-xs mt-3 font-medium" style={{ color: 'var(--accent)' }}>Go to Question Bank →</p>
            </div>
          </Link>

          {/* AI query */}
          <Link
            href="/assignments/new/ai"
            className="rounded-xl border p-6 flex items-start gap-5 hover:shadow-sm transition-shadow"
            style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
          >
            <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#fdf4ff' }}>
              <svg className="w-6 h-6" style={{ color: '#7e22ce' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="font-semibold" style={{ color: 'var(--foreground)' }}>AI Query</p>
              <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
                Describe what you need in plain English — "10 medium Algebra problems on linear equations" — and AI will find the best matches.
              </p>
              <p className="text-xs mt-3 font-medium" style={{ color: '#7e22ce' }}>Try AI Query →</p>
            </div>
          </Link>

          {/* Meeting notes — coming soon */}
          <div
            className="rounded-xl border p-6 flex items-start gap-5 opacity-60"
            style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
          >
            <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#fffbeb' }}>
              <svg className="w-6 h-6" style={{ color: 'var(--warning)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="font-semibold" style={{ color: 'var(--foreground)' }}>From Tutoring Notes</p>
                <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: '#fffbeb', color: 'var(--warning)' }}>Coming soon</span>
              </div>
              <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
                Paste your notes from a tutoring session and AI will extract the weak areas and automatically suggest matching homework problems.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
