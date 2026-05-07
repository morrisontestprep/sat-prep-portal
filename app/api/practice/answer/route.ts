import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'
import { isFreeResponse, checkFreeResponse } from '@/utils/grading'

// POST /api/practice/answer
// Body: { sessionId, questionId, selectedAnswer, correctAnswer, timeSpentSeconds }
// Records the answer and updates session totals. Returns isCorrect.

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { sessionId, questionId, selectedAnswer, correctAnswer, timeSpentSeconds } = await request.json()

  // Verify session belongs to this student
  const { data: session } = await supabase
    .from('practice_sessions')
    .select('id, student_id, questions_attempted, questions_correct')
    .eq('id', sessionId)
    .eq('student_id', user.id)
    .single()

  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  // Grade the answer
  let isCorrect = false
  if (selectedAnswer) {
    if (isFreeResponse(correctAnswer)) {
      isCorrect = checkFreeResponse(selectedAnswer, correctAnswer)
    } else {
      isCorrect = selectedAnswer.trim().toUpperCase() === correctAnswer.trim().toUpperCase()
    }
  }

  // Insert answer record
  await supabase.from('practice_answers').insert({
    session_id:         sessionId,
    student_id:         user.id,
    question_id:        questionId,
    selected_answer:    selectedAnswer ?? null,
    is_correct:         isCorrect,
    time_spent_seconds: timeSpentSeconds ?? null,
  })

  // Update session totals
  await supabase.from('practice_sessions').update({
    questions_attempted: (session.questions_attempted ?? 0) + 1,
    questions_correct:   (session.questions_correct   ?? 0) + (isCorrect ? 1 : 0),
  }).eq('id', sessionId)

  return NextResponse.json({ isCorrect })
}
