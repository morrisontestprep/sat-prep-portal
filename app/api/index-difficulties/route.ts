import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const TEACHER_EMAIL = process.env.TEACHER_EMAIL ?? 'morrisontestprep@gmail.com'
const BATCH_SIZE = 10 // Process in small batches to stay responsive

const VISION_PROMPT = `You are analyzing an SAT practice question image.

IMPORTANT: Look for a metadata table near the top of the image with columns including "Difficulty". That column contains filled blue bar segments — count them:
- 1 blue bar = Easy
- 2 blue bars = Medium
- 3 blue bars = Hard

Use the bar count as your difficulty. If you cannot see the bars clearly, return null.

Return ONLY valid JSON with no other text:
{
  "difficulty": "Easy" | "Medium" | "Hard" | null,
  "confidence": "bar_count" | "unclear"
}`

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || user.email !== TEACHER_EMAIL) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 400 })
    }

    // Always query from offset 0 — as questions get rated they leave the
    // unrated pool, so the next batch is always at the top of the list.
    const offset = 0

    const anthropic = new Anthropic({ apiKey })

    // Fetch next batch of unrated questions
    const { data: questions, error: fetchError } = await supabase
      .from('questions')
      .select('id, question_image_url')
      .or('difficulty.is.null,difficulty.eq.')
      .range(offset, offset + BATCH_SIZE - 1)
      .order('id')

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    if (!questions || questions.length === 0) {
      return NextResponse.json({ done: true, processed: 0, offset })
    }

    // Get total unrated count for progress reporting
    const { count: totalUnrated } = await supabase
      .from('questions')
      .select('id', { count: 'exact', head: true })
      .or('difficulty.is.null,difficulty.eq.')

    const results: { id: string; difficulty: string | null; confidence: string }[] = []

    for (const q of questions) {
      try {
        if (!q.question_image_url) {
          results.push({ id: q.id, difficulty: null, confidence: 'no_image' })
          continue
        }

        const message = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 256,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'url', url: q.question_image_url } },
              { type: 'text', text: VISION_PROMPT },
            ],
          }],
        })

        const text = message.content
          .filter(b => b.type === 'text')
          .map(b => (b as { type: 'text'; text: string }).text)
          .join('')

        const jsonMatch = text.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0])
          results.push({
            id: q.id,
            difficulty: parsed.difficulty ?? null,
            confidence: parsed.confidence ?? 'unclear',
          })
        } else {
          results.push({ id: q.id, difficulty: null, confidence: 'parse_error' })
        }
      } catch (err) {
        results.push({ id: q.id, difficulty: null, confidence: `error: ${String(err).slice(0, 80)}` })
      }
    }

    // Write results back to DB (only for bar_count confident reads)
    const toUpdate = results.filter(r => r.difficulty && r.confidence === 'bar_count')
    if (toUpdate.length > 0) {
      for (const r of toUpdate) {
        await supabase
          .from('questions')
          .update({ difficulty: r.difficulty })
          .eq('id', r.id)
      }
    }

    return NextResponse.json({
      done: questions.length < BATCH_SIZE,
      processed: questions.length,
      updated: toUpdate.length,
      skipped: results.filter(r => !r.difficulty || r.confidence !== 'bar_count').length,
      next_offset: offset + questions.length,
      total_remaining: totalUnrated ?? 0,
      results,
    })

  } catch (err) {
    console.error('index-difficulties error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
