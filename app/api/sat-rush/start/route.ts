import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'

// POST /api/sat-rush/start
// Body: { totalDuration, timePerQuestion, subjects, domains, skills, difficulties }
// Creates a game record, builds a shuffled question queue (unseen first, then repeats if needed),
// and returns the game ID + the full question list for the client to drive locally.
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const {
    totalDuration,
    timePerQuestion,
    subjects,
    domains,
    skills,
    difficulties,
  } = await request.json()

  // ── 1. Get all questions matching the filters ────────────────────────────
  let query = supabase
    .from('questions')
    .select('id, subject, domain, skill, difficulty, correct_answer, question_image_url, answer_image_url')

  if (subjects    && subjects.length    > 0) query = query.in('subject', subjects)
  if (domains     && domains.length     > 0) query = query.in('domain', domains)
  if (skills      && skills.length      > 0) query = query.in('skill', skills)
  if (difficulties && difficulties.length > 0) {
    const hasUnrated = difficulties.includes('Unrated')
    const realDiffs  = difficulties.filter((d: string) => d !== 'Unrated')
    if (hasUnrated && realDiffs.length > 0) {
      query = query.or(`difficulty.in.(${realDiffs.join(',')}),difficulty.is.null`)
    } else if (hasUnrated) {
      query = query.or('difficulty.is.null,difficulty.eq.')
    } else {
      query = query.in('difficulty', realDiffs)
    }
  }

  const { data: allQuestions, error: qError } = await query.limit(5000)
  if (qError) return NextResponse.json({ error: qError.message }, { status: 500 })
  if (!allQuestions || allQuestions.length === 0) {
    return NextResponse.json({ error: 'No questions found for these filters' }, { status: 400 })
  }

  // ── 2. Get seen question IDs ─────────────────────────────────────────────
  const [wsResult, rushResult] = await Promise.all([
    supabase
      .from('student_answers')
      .select('question_id')
      .in('assignment_id',
        (await supabase
          .from('student_assignments')
          .select('id')
          .eq('student_id', user.id)
          .then(r => (r.data ?? []).map(a => a.id)))
      ),
    supabase
      .from('sat_rush_answers')
      .select('question_id')
      .eq('student_id', user.id),
  ])

  const seenIds = new Set([
    ...((wsResult.data ?? []).map(r => r.question_id).filter(Boolean)),
    ...((rushResult.data ?? []).map(r => r.question_id).filter(Boolean)),
  ])

  // ── 3. Separate unseen vs seen, shuffle both, unseen first ──────────────
  const unseen = allQuestions.filter(q => !seenIds.has(q.id))
  const seen   = allQuestions.filter(q =>  seenIds.has(q.id))

  function shuffle<T>(arr: T[]): T[] {
    const a = [...arr]
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]]
    }
    return a
  }

  const orderedQuestions = [...shuffle(unseen), ...shuffle(seen)]

  // ── 4. Create the game record ────────────────────────────────────────────
  const { data: game, error: gameError } = await supabase
    .from('sat_rush_games')
    .insert({
      student_id:               user.id,
      total_duration_seconds:   totalDuration,
      time_per_question_seconds: timePerQuestion,
      subject_filter:           subjects   ?? null,
      domain_filter:            domains    ?? null,
      skill_filter:             skills     ?? null,
      difficulty_filter:        difficulties ?? null,
      question_queue:           orderedQuestions.map(q => q.id),
      status:                   'active',
    })
    .select('id')
    .single()

  if (gameError) return NextResponse.json({ error: gameError.message }, { status: 500 })

  return NextResponse.json({
    gameId: game.id,
    questions: orderedQuestions,
    unseenCount: unseen.length,
  })
}
