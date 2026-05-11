import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'

// GET /api/sat-rush/resume
// Returns the active game for the current student (if any), including the full
// question objects so the client can restore its state without re-running setup.
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Find the most recent active game
  const { data: game, error: gameError } = await supabase
    .from('sat_rush_games')
    .select(`
      id,
      created_at,
      total_score,
      questions_attempted,
      questions_correct,
      questions_incorrect,
      current_position,
      total_duration_seconds,
      time_per_question_seconds,
      subject_filter,
      domain_filter,
      skill_filter,
      difficulty_filter,
      question_queue
    `)
    .eq('student_id', user.id)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (gameError || !game) {
    return NextResponse.json({ game: null })
  }

  // Calculate remaining time
  const elapsedSeconds = (Date.now() - new Date(game.created_at).getTime()) / 1000
  const timeRemaining = Math.max(0, game.total_duration_seconds - elapsedSeconds)

  // If time has expired, mark the game complete and return nothing
  if (timeRemaining <= 0) {
    await supabase
      .from('sat_rush_games')
      .update({ status: 'completed', ended_reason: 'time_up', completed_at: new Date().toISOString() })
      .eq('id', game.id)
    return NextResponse.json({ game: null })
  }

  // Fetch the full question objects from the queue
  const questionIds = (game.question_queue as string[]) ?? []
  if (questionIds.length === 0) return NextResponse.json({ game: null })

  const { data: questions, error: qError } = await supabase
    .from('questions')
    .select('id, subject, domain, skill, difficulty, correct_answer, question_image_url, answer_image_url')
    .in('id', questionIds)

  if (qError || !questions) return NextResponse.json({ game: null })

  // Re-order questions to match the original queue order
  const qMap = new Map(questions.map(q => [q.id, q]))
  const orderedQuestions = questionIds.map(id => qMap.get(id)).filter(Boolean)

  // Current position (how many questions have been answered)
  const currentIdx = Math.min(game.current_position ?? 0, orderedQuestions.length - 1)

  // Fetch answers so far to restore lives and streak
  const { data: answers } = await supabase
    .from('sat_rush_answers')
    .select('question_id, is_correct, within_time_limit, points_earned, time_taken_seconds, selected_answer, correct_answer, question_order')
    .eq('game_id', game.id)
    .order('question_order', { ascending: true })

  // Lives left: start at 3, subtract wrong answers
  const wrongCount = (answers ?? []).filter(a => !a.is_correct).length
  const livesLeft = Math.max(0, 3 - wrongCount)

  // Current streak: consecutive correct+within-time from the end
  let streak = 0
  const sortedAnswers = [...(answers ?? [])].sort((a, b) => a.question_order - b.question_order)
  for (let i = sortedAnswers.length - 1; i >= 0; i--) {
    if (sortedAnswers[i].is_correct && sortedAnswers[i].within_time_limit) {
      streak++
    } else {
      break
    }
  }

  // Total score
  const totalScore = (answers ?? []).reduce((sum, a) => sum + (a.points_earned ?? 0), 0)

  return NextResponse.json({
    game: {
      id: game.id,
      settings: {
        totalDuration:   game.total_duration_seconds,
        timePerQuestion: game.time_per_question_seconds,
        subjects:        game.subject_filter    ?? [],
        domains:         game.domain_filter     ?? [],
        skills:          game.skill_filter      ?? [],
        difficulties:    game.difficulty_filter ?? [],
      },
      questions: orderedQuestions,
      currentIdx,
      livesLeft,
      streak,
      totalScore,
      timeRemaining,
      answers: (answers ?? []).map(a => ({
        questionId:      a.question_id,
        question:        qMap.get(a.question_id) ?? null,
        selectedAnswer:  a.selected_answer,
        isCorrect:       a.is_correct,
        withinTimeLimit: a.within_time_limit,
        timeTaken:       a.time_taken_seconds,
        pointsEarned:    a.points_earned,
        bonusPoints:     0,
        order:           a.question_order,
      })),
    },
  })
}
