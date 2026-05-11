import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'
import { isFreeResponse, checkFreeResponse } from '@/utils/grading'
import { notifyTeacher } from '@/utils/teacherNotify'

// POST /api/sat-rush/answer
// Body: { gameId, questionId, questionOrder, selectedAnswer, timeTakenSeconds, timePerQuestion, currentStreak }
// Records the answer, calculates points (including streak bonuses), updates game totals.
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const {
    gameId,
    questionId,
    questionOrder,
    selectedAnswer,
    correctAnswer,
    timeTakenSeconds,
    timePerQuestion,
    currentStreak, // consecutive correct-within-time answers before this one
  } = await request.json()

  // ── Determine correctness ────────────────────────────────────────────────
  let isCorrect = false
  if (selectedAnswer) {
    if (isFreeResponse(correctAnswer)) {
      isCorrect = checkFreeResponse(selectedAnswer, correctAnswer)
    } else {
      isCorrect = selectedAnswer.trim().toUpperCase() === correctAnswer.trim().toUpperCase()
    }
  }

  const withinTimeLimit = timeTakenSeconds <= timePerQuestion

  // ── Base points ──────────────────────────────────────────────────────────
  let basePoints = 0
  if (isCorrect) {
    basePoints = withinTimeLimit ? 2 : 1
  }

  // ── Streak bonus (only counts if this answer is correct AND within limit) ─
  // Streak bonus triggers at exactly hitting streak 3 (+1) and streak 5 (+2).
  // currentStreak is the count BEFORE this answer.
  let bonusPoints = 0
  if (isCorrect && withinTimeLimit) {
    const newStreak = currentStreak + 1
    if (newStreak === 3) bonusPoints = 1
    if (newStreak === 5) bonusPoints = 2
    // Continue rewarding every 3 and 5 milestones on longer streaks
    if (newStreak > 5 && newStreak % 5 === 0) bonusPoints = 2
    else if (newStreak > 5 && newStreak % 3 === 0) bonusPoints = 1
  }

  const pointsEarned = basePoints + bonusPoints

  // ── Write answer record ──────────────────────────────────────────────────
  await supabase.from('sat_rush_answers').insert({
    game_id:            gameId,
    student_id:         user.id,
    question_id:        questionId,
    question_order:     questionOrder,
    selected_answer:    selectedAnswer ?? null,
    correct_answer:     correctAnswer,
    is_correct:         isCorrect,
    time_taken_seconds: timeTakenSeconds,
    within_time_limit:  withinTimeLimit,
    points_earned:      pointsEarned,
  })

  // ── Update game totals ───────────────────────────────────────────────────
  const { data: game } = await supabase
    .from('sat_rush_games')
    .select('total_score, questions_correct, questions_incorrect, questions_attempted, current_position')
    .eq('id', gameId)
    .eq('student_id', user.id)
    .single()

  if (game) {
    await supabase.from('sat_rush_games').update({
      total_score:          (game.total_score ?? 0) + pointsEarned,
      questions_attempted:  (game.questions_attempted ?? 0) + 1,
      questions_correct:    (game.questions_correct ?? 0) + (isCorrect ? 1 : 0),
      questions_incorrect:  (game.questions_incorrect ?? 0) + (isCorrect ? 0 : 1),
      current_position:     (game.current_position ?? 0) + 1,
    })
    .eq('id', gameId)
  }

  // ── Notify teacher on the first answer of each game ──────────────────────
  // This fires immediately when a student starts playing, even if they never
  // finish, so you always see the activity.
  if (questionOrder === 0) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', user.id)
      .single()

    notifyTeacher('sat_rush_started', {
      studentName:  profile?.full_name ?? '',
      studentEmail: profile?.email ?? user.email ?? '',
      studentId:    user.id,
    }).catch(console.error)
  }

  return NextResponse.json({
    isCorrect,
    withinTimeLimit,
    basePoints,
    bonusPoints,
    pointsEarned,
    newStreak: isCorrect && withinTimeLimit ? currentStreak + 1 : 0,
  })
}
