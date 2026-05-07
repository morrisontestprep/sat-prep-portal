import type { SupabaseClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────────
// Shared types for the analytics dashboard
// ─────────────────────────────────────────────────────────────────────────────

export type AnswerSource = 'worksheet' | 'sat_rush' | 'practice'

export type UnifiedAnswer = {
  // Question metadata
  question_id: string
  subject: string
  domain: string
  skill: string
  difficulty: string
  correct_answer: string
  question_image_url: string | null
  answer_image_url: string | null

  // Answer data
  selected_answer: string | null
  is_correct: boolean | null
  time_spent_seconds: number | null
  student_notes: string | null
  confidence_level: number | null

  // Provenance
  source: AnswerSource
  answered_at: string        // ISO timestamp — sort key for trend chart
  source_label: string       // human-readable: "Worksheet: Title", "SAT Rush", "Practice"
}

// ─────────────────────────────────────────────────────────────────────────────
// Fetch all answers for a student across all 3 sources, enriched with question
// metadata and sorted chronologically.
// Works for both teacher (any studentId) and student (own id).
// ─────────────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchAllAnswers(supabase: SupabaseClient<any>, studentId: string): Promise<UnifiedAnswer[]> {
  // ── 1. Worksheet answers ─────────────────────────────────────────────────
  const { data: assignments } = await supabase
    .from('student_assignments')
    .select('id, worksheets(id, title)')
    .eq('student_id', studentId)

  const worksheetAnswers: UnifiedAnswer[] = []
  if (assignments && assignments.length > 0) {
    const assignmentIds = (assignments as { id: string }[]).map(a => a.id)

    // Build a map of assignment_id → worksheet title
    // Supabase returns relations as arrays, so we access [0]
    const titleMap = new Map<string, string>()
    for (const a of assignments as unknown as { id: string; worksheets: { title: string }[] | { title: string } | null }[]) {
      const ws = Array.isArray(a.worksheets) ? a.worksheets[0] : a.worksheets
      if (ws) titleMap.set(a.id, ws.title)
    }

    const { data: wsAnswers } = await supabase
      .from('student_answers')
      .select(`
        assignment_id,
        question_id,
        selected_answer,
        is_correct,
        time_spent_seconds,
        student_notes,
        confidence_level,
        answered_at,
        questions (
          id, subject, domain, skill, difficulty,
          correct_answer, question_image_url, answer_image_url
        )
      `)
      .in('assignment_id', assignmentIds)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const row of (wsAnswers ?? []) as any[]) {
      // Supabase may return questions as array or object depending on the relationship type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = row as any
      const q = Array.isArray(r.questions) ? r.questions[0] : r.questions
      if (!q || !r.answered_at) continue

      worksheetAnswers.push({
        question_id:        r.question_id,
        subject:            q.subject    ?? '',
        domain:             q.domain     ?? '',
        skill:              q.skill      ?? '',
        difficulty:         q.difficulty ?? '',
        correct_answer:     q.correct_answer ?? '',
        question_image_url: q.question_image_url ?? null,
        answer_image_url:   q.answer_image_url  ?? null,
        selected_answer:    r.selected_answer,
        is_correct:         r.is_correct,
        time_spent_seconds: r.time_spent_seconds,
        student_notes:      r.student_notes,
        confidence_level:   r.confidence_level,
        source:             'worksheet',
        answered_at:        r.answered_at,
        source_label:       `Worksheet: ${titleMap.get(r.assignment_id) ?? 'Unknown'}`,
      })
    }
  }

  // ── 2. SAT Rush answers ──────────────────────────────────────────────────
  const { data: rushAnswers } = await supabase
    .from('sat_rush_answers')
    .select('question_id, selected_answer, is_correct, time_taken_seconds, answered_at')
    .eq('student_id', studentId)

  const rushQuestionIds = [...new Set((rushAnswers ?? []).map((r: { question_id: string }) => r.question_id))]
  const rushAnswersList: UnifiedAnswer[] = []

  if (rushQuestionIds.length > 0) {
    const { data: rushQuestions } = await supabase
      .from('questions')
      .select('id, subject, domain, skill, difficulty, correct_answer, question_image_url, answer_image_url')
      .in('id', rushQuestionIds)

    const qMap = new Map((rushQuestions ?? []).map((q: { id: string; subject: string; domain: string; skill: string; difficulty: string; correct_answer: string; question_image_url: string | null; answer_image_url: string | null }) => [q.id, q]))

    for (const row of rushAnswers ?? []) {
      const r = row as {
        question_id: string; selected_answer: string | null; is_correct: boolean
        time_taken_seconds: number | null; answered_at: string | null
      }
      const q = qMap.get(r.question_id)
      if (!q || !r.answered_at) continue

      rushAnswersList.push({
        question_id:        r.question_id,
        subject:            q.subject    ?? '',
        domain:             q.domain     ?? '',
        skill:              q.skill      ?? '',
        difficulty:         q.difficulty ?? '',
        correct_answer:     q.correct_answer ?? '',
        question_image_url: q.question_image_url ?? null,
        answer_image_url:   q.answer_image_url  ?? null,
        selected_answer:    r.selected_answer,
        is_correct:         r.is_correct,
        time_spent_seconds: r.time_taken_seconds,
        student_notes:      null,
        confidence_level:   null,
        source:             'sat_rush',
        answered_at:        r.answered_at,
        source_label:       'SAT Rush',
      })
    }
  }

  // ── 3. Practice answers ──────────────────────────────────────────────────
  const { data: practiceAnswers } = await supabase
    .from('practice_answers')
    .select('question_id, selected_answer, is_correct, time_spent_seconds, answered_at')
    .eq('student_id', studentId)

  const practiceQuestionIds = [...new Set((practiceAnswers ?? []).map((r: { question_id: string }) => r.question_id))]
  const practiceAnswersList: UnifiedAnswer[] = []

  if (practiceQuestionIds.length > 0) {
    const { data: practiceQuestions } = await supabase
      .from('questions')
      .select('id, subject, domain, skill, difficulty, correct_answer, question_image_url, answer_image_url')
      .in('id', practiceQuestionIds)

    const qMap = new Map((practiceQuestions ?? []).map((q: { id: string; subject: string; domain: string; skill: string; difficulty: string; correct_answer: string; question_image_url: string | null; answer_image_url: string | null }) => [q.id, q]))

    for (const row of practiceAnswers ?? []) {
      const r = row as {
        question_id: string; selected_answer: string | null; is_correct: boolean
        time_spent_seconds: number | null; answered_at: string | null
      }
      const q = qMap.get(r.question_id)
      if (!q || !r.answered_at) continue

      practiceAnswersList.push({
        question_id:        r.question_id,
        subject:            q.subject    ?? '',
        domain:             q.domain     ?? '',
        skill:              q.skill      ?? '',
        difficulty:         q.difficulty ?? '',
        correct_answer:     q.correct_answer ?? '',
        question_image_url: q.question_image_url ?? null,
        answer_image_url:   q.answer_image_url  ?? null,
        selected_answer:    r.selected_answer,
        is_correct:         r.is_correct,
        time_spent_seconds: r.time_spent_seconds,
        student_notes:      null,
        confidence_level:   null,
        source:             'practice',
        answered_at:        r.answered_at,
        source_label:       'Practice',
      })
    }
  }

  // ── 4. Merge and sort chronologically ────────────────────────────────────
  const all = [...worksheetAnswers, ...rushAnswersList, ...practiceAnswersList]
  all.sort((a, b) => new Date(a.answered_at).getTime() - new Date(b.answered_at).getTime())

  return all
}
