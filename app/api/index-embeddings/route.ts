import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'
import OpenAI from 'openai'

export const maxDuration = 60

const TEACHER_EMAIL = process.env.TEACHER_EMAIL ?? 'morrisontestprep@gmail.com'
const BATCH_SIZE = 50 // OpenAI supports up to 2048 per call; 50 keeps requests fast

/**
 * Build a rich text representation of a question for embedding.
 * Combining subject/domain/skill + extracted features + question text
 * gives the embedding model the full picture of what the question is about.
 */
function buildEmbeddingText(q: {
  subject: string
  domain: string
  skill: string
  question_features: string[] | null
  question_text: string | null
}): string {
  const parts = [
    `Subject: ${q.subject}`,
    `Domain: ${q.domain}`,
    `Skill: ${q.skill}`,
  ]
  if (q.question_features?.length) {
    parts.push(`Features: ${q.question_features.join(', ')}`)
  }
  if (q.question_text) {
    parts.push(q.question_text)
  }
  return parts.join(' | ')
}

export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || user.email !== TEACHER_EMAIL) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'OPENAI_API_KEY not set in .env.local' }, { status: 400 })
    }

    const openai = new OpenAI({ apiKey })

    // Always fetch from top — pool shrinks as questions get embedded
    const { data: batch, error: fetchError } = await supabase
      .from('questions')
      .select('id, subject, domain, skill, question_features, question_text')
      .is('embedding', null)
      .limit(BATCH_SIZE)

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    // Count remaining unembedded questions
    const { count: totalRemaining } = await supabase
      .from('questions')
      .select('id', { count: 'exact', head: true })
      .is('embedding', null)

    if (!batch || batch.length === 0) {
      return NextResponse.json({ done: true, processed: 0, updated: 0, skipped: 0, total_remaining: 0 })
    }

    // Build embedding input texts
    const texts = batch.map(q => buildEmbeddingText({
      subject: q.subject ?? '',
      domain: (q as { domain?: string }).domain ?? '',
      skill: q.skill ?? '',
      question_features: (q as { question_features?: string[] }).question_features ?? null,
      question_text: q.question_text ?? null,
    }))

    // Single batched OpenAI call for all questions in this batch
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: texts,
    })

    // Write embeddings back to Supabase
    let updated = 0
    let skipped = 0

    for (let i = 0; i < batch.length; i++) {
      const embedding = embeddingResponse.data[i]?.embedding
      if (!embedding) { skipped++; continue }

      const { error: updateError } = await supabase
        .from('questions')
        .update({ embedding: JSON.stringify(embedding) })
        .eq('id', batch[i].id)

      if (updateError) { skipped++; continue }
      updated++
    }

    const newRemaining = Math.max(0, (totalRemaining ?? 0) - updated)

    return NextResponse.json({
      done: newRemaining <= 0,
      processed: batch.length,
      updated,
      skipped,
      total_remaining: newRemaining,
    })
  } catch (err) {
    console.error('index-embeddings error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
