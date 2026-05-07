import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'
import OpenAI from 'openai'

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/practice/recommend
//
// Recommends practice questions for a student by:
//   1. Finding wrong answers in the active filter context
//   2. Computing a centroid embedding of those wrong-answer questions
//   3. Running vector similarity search (match_questions RPC) to find similar problems
//   4. Excluding questions already seen by the student (all sources)
//
// If no wrong answers exist yet (or no embeddings), falls back to filter-based
// random selection of unseen questions.
//
// Body: {
//   filters?: { subject?: string; domain?: string; skill?: string; difficulties?: string[] }
//   count?: number      // default 10
//   studentId?: string  // teacher override — look at a specific student's wrong answers
// }
// ─────────────────────────────────────────────────────────────────────────────

function parseEmbedding(raw: unknown): number[] | null {
  if (!raw) return null
  if (Array.isArray(raw)) return raw as number[]
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) } catch { return null }
  }
  return null
}

function averageEmbeddings(embeddings: number[][]): number[] {
  if (embeddings.length === 0) return []
  if (embeddings.length === 1) return embeddings[0]
  const dim = embeddings[0].length
  const centroid = new Array(dim).fill(0)
  for (const emb of embeddings) {
    for (let i = 0; i < dim; i++) centroid[i] += emb[i]
  }
  return centroid.map(v => v / embeddings.length)
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const {
      filters = {},
      count = 10,
      studentId: requestedStudentId,
    }: {
      filters?: { subject?: string; domain?: string; skill?: string; difficulties?: string[] }
      count?: number
      studentId?: string
    } = body

    const requestedCount = Math.min(Math.max(Number(count) || 10, 1), 30)

    // Teacher can pass a studentId to look at a specific student's wrong answers.
    // Students can only look at their own data.
    const TEACHER_EMAIL = process.env.TEACHER_EMAIL ?? 'morrisontestprep@gmail.com'
    const isTeacher = user.email === TEACHER_EMAIL
    const targetStudentId = (isTeacher && requestedStudentId) ? requestedStudentId : user.id

    // ── 1. Collect all seen question IDs across all 3 sources ────────────────
    const assignmentIds = await supabase
      .from('student_assignments')
      .select('id')
      .eq('student_id', targetStudentId)
      .then(r => (r.data ?? []).map((a: { id: string }) => a.id))

    const [wsResult, rushResult, practiceResult] = await Promise.all([
      assignmentIds.length > 0
        ? supabase.from('student_answers').select('question_id, is_correct').in('assignment_id', assignmentIds)
        : Promise.resolve({ data: [] }),
      supabase.from('sat_rush_answers').select('question_id, is_correct').eq('student_id', targetStudentId),
      supabase.from('practice_answers').select('question_id, is_correct').eq('student_id', user.id),
    ])

    // ── 2. Identify wrong-answer question IDs in current filter context ───────
    // All answers (for "seen" exclusion)
    const seenIds = new Set<string>([
      ...((wsResult.data ?? []).map((r: { question_id: string }) => r.question_id).filter(Boolean)),
      ...((rushResult.data ?? []).map((r: { question_id: string }) => r.question_id).filter(Boolean)),
      ...((practiceResult.data ?? []).map((r: { question_id: string }) => r.question_id).filter(Boolean)),
    ])

    // Collect wrong answers in the filter context
    type AnswerRow = { question_id: string; is_correct: boolean | null }
    const allAnswers: AnswerRow[] = [
      ...((wsResult.data ?? []) as AnswerRow[]),
      ...((rushResult.data ?? []) as AnswerRow[]),
      ...((practiceResult.data ?? []) as AnswerRow[]),
    ]

    // Get wrong question IDs (is_correct = false) — these are our "seeds"
    const wrongIds = [...new Set(
      allAnswers
        .filter(a => a.is_correct === false)
        .map(a => a.question_id)
        .filter(Boolean)
    )]

    // If filters are set, narrow to wrong answers whose question matches the filter
    // (fetch question subjects/domains to filter if needed)
    let seedIds = wrongIds
    if (seedIds.length > 0 && (filters.subject || filters.domain || filters.skill || filters.difficulties?.length)) {
      let seedQuery = supabase
        .from('questions')
        .select('id')
        .in('id', seedIds)

      if (filters.subject)                 seedQuery = seedQuery.eq('subject', filters.subject)
      if (filters.domain)                  seedQuery = seedQuery.eq('domain', filters.domain)
      if (filters.skill)                   seedQuery = seedQuery.eq('skill', filters.skill)
      if (filters.difficulties?.length === 1) seedQuery = seedQuery.eq('difficulty', filters.difficulties[0])
      else if (filters.difficulties?.length) seedQuery = seedQuery.in('difficulty', filters.difficulties)

      const { data: filteredSeeds } = await seedQuery.limit(500)
      seedIds = (filteredSeeds ?? []).map((q: { id: string }) => q.id)
    }

    // ── 3. Try vector similarity search if OpenAI key present & we have seeds ──
    if (process.env.OPENAI_API_KEY && seedIds.length > 0) {
      try {
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

        // Fetch embeddings for wrong-answer seed questions (cap at 50 to avoid huge payloads)
        const { data: seedRows } = await supabase
          .from('questions')
          .select('id, embedding')
          .in('id', seedIds.slice(0, 50))

        const embeddings = (seedRows ?? [])
          .map((q: { embedding?: unknown }) => parseEmbedding(q.embedding))
          .filter(Boolean) as number[][]

        if (embeddings.length > 0) {
          const centroid = averageEmbeddings(embeddings)

          // Fetch more than needed so we can exclude seen questions
          const fetchCount = requestedCount * 4 + seenIds.size + 20

          const { data: matches, error: matchError } = await supabase.rpc('match_questions', {
            query_embedding: centroid,
            match_count: Math.min(fetchCount, 500),
            filter_subject: filters.subject || null,
            filter_difficulties: filters.difficulties?.length ? filters.difficulties : null,
          })

          if (!matchError && matches && matches.length > 0) {
            // Further filter by domain/skill if needed (RPC only supports subject + difficulty)
            let filtered = matches as { id: string; subject: string; domain: string; skill: string; difficulty: string; correct_answer: string; question_image_url: string; answer_image_url: string }[]
            if (filters.domain) filtered = filtered.filter(q => q.domain === filters.domain)
            if (filters.skill)  filtered = filtered.filter(q => q.skill  === filters.skill)

            // Exclude all seen questions
            const unseen = filtered.filter(q => !seenIds.has(q.id))

            if (unseen.length >= Math.ceil(requestedCount * 0.5)) {
              // We have enough unseen similar questions
              return NextResponse.json({
                questions: unseen.slice(0, requestedCount),
                method: 'semantic',
                seedCount: seedIds.length,
              })
            }
          }
        }
      } catch (err) {
        console.warn('Vector recommendation failed, falling back to filter mode:', err)
      }
    }

    // ── 4. Fallback: filter-based random selection of unseen questions ────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query: any = supabase
      .from('questions')
      .select('id, subject, domain, skill, difficulty, correct_answer, question_image_url, answer_image_url')

    if (filters.subject)                    query = query.eq('subject', filters.subject)
    if (filters.domain)                     query = query.eq('domain', filters.domain)
    if (filters.skill)                      query = query.eq('skill', filters.skill)
    if (filters.difficulties?.length === 1) query = query.eq('difficulty', filters.difficulties[0])
    else if (filters.difficulties?.length)  query = query.in('difficulty', filters.difficulties)

    const { data: allMatching, error: qError } = await query.limit(2000)
    if (qError) return NextResponse.json({ error: qError.message }, { status: 500 })

    const pool = (allMatching ?? []).filter((q: { id: string }) => !seenIds.has(q.id))
    const shuffled = [...pool].sort(() => Math.random() - 0.5)

    return NextResponse.json({
      questions: shuffled.slice(0, requestedCount),
      method: 'filter',
      seedCount: seedIds.length,
    })

  } catch (err) {
    console.error('practice/recommend error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
