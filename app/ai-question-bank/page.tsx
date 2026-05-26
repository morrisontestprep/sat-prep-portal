import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
import AIQuestionBankClient from './AIQuestionBankClient'
import type { AIQuestion } from './data'
import { SAT_SKILL_TREE } from './sat-taxonomy'

const TEACHER_EMAIL = 'morrisontestprep@gmail.com'

export default async function AIQuestionBankPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')
  if (user.email !== TEACHER_EMAIL) redirect('/my-assignments')

  const { data: questions, error } = await supabase
    .from('ai_generated_questions')
    .select('*')
    .order('created_at', { ascending: true })

  if (error) {
    console.error('Failed to load AI questions:', error.message)
  }

  // Use the hardcoded SAT taxonomy — avoids PostgREST row-cap issues with the DB query
  const skillTree = SAT_SKILL_TREE

  const typedQuestions: AIQuestion[] = (questions ?? []).map(q => ({
    ...q,
    choices: q.choices as Record<string, string>,
    distractor_notes: q.distractor_notes as Record<string, string>,
  }))

  const counts = {
    total:    typedQuestions.length,
    pending:  typedQuestions.filter(q => q.status === 'pending').length,
    approved: typedQuestions.filter(q => q.status === 'approved').length,
    discarded: typedQuestions.filter(q => q.status === 'discarded').length,
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--background)' }}>
      <Nav userEmail={user.email} />

      <main className="flex-1 p-4 sm:p-6 max-w-4xl mx-auto w-full">
        {/* Page header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: 'var(--accent)' }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            <h1 className="text-xl font-bold" style={{ color: 'var(--foreground)' }}>
              AI Question Bank
            </h1>
            <span
              className="text-xs font-semibold px-2 py-0.5 rounded-full"
              style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}
            >
              Preview
            </span>
          </div>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            AI-generated questions modeled on your existing question bank. Approve to add to the bank, or discard to remove from consideration.
          </p>
        </div>

        {/* Generation info */}
        {typedQuestions.length > 0 && (
          <div
            className="flex flex-wrap gap-x-6 gap-y-1 p-4 rounded-2xl mb-6 text-sm"
            style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
          >
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Seed skills — </span>
              <span style={{ color: 'var(--foreground)' }}>Algebra · Linear functions (Easy, Medium)</span>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>and — </span>
              <span style={{ color: 'var(--foreground)' }}>Craft and Structure · Words in Context (Easy)</span>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>{counts.total} questions — </span>
              <span style={{ color: '#166534' }}>{counts.approved} approved</span>
              <span style={{ color: 'var(--text-muted)' }}> · </span>
              <span style={{ color: 'var(--text-muted)' }}>{counts.pending} pending</span>
              <span style={{ color: 'var(--text-muted)' }}> · </span>
              <span style={{ color: '#6b7280' }}>{counts.discarded} discarded</span>
            </div>
          </div>
        )}

        <AIQuestionBankClient initialQuestions={typedQuestions} skillTree={skillTree} />
      </main>
    </div>
  )
}
