import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'

const TEACHER_EMAIL = process.env.TEACHER_EMAIL ?? 'morrisontestprep@gmail.com'

/** Average multiple embedding vectors into a single centroid. */
function averageEmbeddings(embeddings: number[][]): number[] {
  if (embeddings.length === 0) return []
  if (embeddings.length === 1) return embeddings[0]
  const dim = embeddings[0].length
  const centroid = new Array(dim).fill(0)
  for (const emb of embeddings) {
    for (let i = 0; i < dim; i++) {
      centroid[i] += emb[i]
    }
  }
  return centroid.map(v => v / embeddings.length)
}

/** Parse a Supabase vector column (may come back as string or array). */
function parseEmbedding(raw: unknown): number[] | null {
  if (!raw) return null
  if (Array.isArray(raw)) return raw as number[]
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) } catch { return null }
  }
  return null
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || user.email !== TEACHER_EMAIL) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { questionIds, count = 10, sameDifficulty = false } = body

    if (!Array.isArray(questionIds) || questionIds.length === 0) {
      return NextResponse.json({ error: 'questionIds is required' }, { status: 400 })
    }

    // Fetch full data + embeddings for seed questions
    const { data: seedRows, error: seedError } = await supabase
      .from('questions')
      .select('id, subject, domain, skill, difficulty, correct_answer, question_image_url, answer_image_url, embedding')
      .in('id', questionIds)

    if (seedError || !seedRows) {
      return NextResponse.json({ error: seedError?.message ?? 'Failed to fetch seed questions' }, { status: 500 })
    }

    // Parse embeddings and build centroid
    const embeddings = seedRows
      .map(q => parseEmbedding((q as { embedding?: unknown }).embedding))
      .filter(Boolean) as number[][]

    if (embeddings.length === 0) {
      return NextResponse.json({
        error: 'None of the selected questions have embeddings yet. Run the semantic index first at /ai-test/embeddings.',
      }, { status: 400 })
    }

    const centroid = averageEmbeddings(embeddings)

    // Determine difficulty filter if requested
    // Collect all unique difficulties from the seed set
    const seedDifficulties = sameDifficulty
      ? [...new Set(seedRows.map(q => q.difficulty).filter(Boolean))]
      : null

    // Fetch more than needed so we can exclude seeds and still return `count` results
    const fetchCount = count + questionIds.length + 10

    const { data: matches, error: matchError } = await supabase.rpc('match_questions', {
      query_embedding: centroid,
      match_count: fetchCount,
      filter_subject: null,   // don't lock subject — similar questions may live across subjects
      filter_difficulties: seedDifficulties && seedDifficulties.length > 0 ? seedDifficulties : null,
    })

    if (matchError) {
      return NextResponse.json({ error: matchError.message }, { status: 500 })
    }

    // Exclude the seed questions from the suggestions
    const seedIdSet = new Set(questionIds)
    const suggested = (matches ?? [])
      .filter((m: { id: string }) => !seedIdSet.has(m.id))
      .slice(0, count)

    // Return seed questions (without the embedding blob) and suggestions
    const seedQuestions = seedRows.map(({ embedding: _e, ...rest }) => rest)

    return NextResponse.json({ seedQuestions, suggestedQuestions: suggested })
  } catch (err) {
    console.error('find-similar error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
