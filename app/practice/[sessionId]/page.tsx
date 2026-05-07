import { createClient } from '@/utils/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Nav from '@/components/Nav'
import PracticeClient from './PracticeClient'

export type PracticeQuestion = {
  id: string
  subject: string
  domain: string
  skill: string
  difficulty: string
  correct_answer: string
  question_image_url: string | null
  answer_image_url:   string | null
}

export type PracticeSession = {
  id: string
  student_id: string
  completed_at: string | null
  subject_filter:    string | null
  domain_filter:     string | null
  skill_filter:      string | null
  difficulty_filter: string[] | null
  question_ids:      string[]
  questions_attempted: number
  questions_correct:   number
}

export default async function PracticePage({
  params,
}: {
  params: Promise<{ sessionId: string }>
}) {
  const { sessionId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Fetch session — student can only see their own; teacher can see all
  const TEACHER_EMAIL = process.env.TEACHER_EMAIL ?? 'morrisontestprep@gmail.com'
  const isTeacher = user.email === TEACHER_EMAIL

  const sessionQuery = supabase
    .from('practice_sessions')
    .select('*')
    .eq('id', sessionId)

  if (!isTeacher) {
    sessionQuery.eq('student_id', user.id)
  }

  const { data: session } = await sessionQuery.single()
  if (!session) notFound()

  // Fetch the questions for this session in order
  const questionIds: string[] = session.question_ids ?? []
  if (questionIds.length === 0) notFound()

  const { data: questionsRaw } = await supabase
    .from('questions')
    .select('id, subject, domain, skill, difficulty, correct_answer, question_image_url, answer_image_url')
    .in('id', questionIds)

  // Re-order to match session's question_ids order
  const qMap = new Map((questionsRaw ?? []).map((q: PracticeQuestion) => [q.id, q]))
  const questions: PracticeQuestion[] = questionIds
    .map(id => qMap.get(id))
    .filter(Boolean) as PracticeQuestion[]

  // Fetch any answers already recorded for this session (for resume support)
  const { data: existingAnswers } = await supabase
    .from('practice_answers')
    .select('question_id, selected_answer, is_correct, time_spent_seconds, answered_at')
    .eq('session_id', sessionId)

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--background)' }}>
      <Nav userEmail={user.email} />
      <main className="flex-1 p-6 max-w-3xl mx-auto w-full">
        <PracticeClient
          session={session as PracticeSession}
          questions={questions}
          existingAnswers={(existingAnswers ?? []) as {
            question_id: string
            selected_answer: string | null
            is_correct: boolean
            time_spent_seconds: number | null
            answered_at: string
          }[]}
        />
      </main>
    </div>
  )
}
