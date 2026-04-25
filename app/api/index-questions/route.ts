import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

// Extend the timeout for this route — each batch makes 10 Vision API calls
export const maxDuration = 120 // seconds

const TEACHER_EMAIL = process.env.TEACHER_EMAIL ?? 'morrisontestprep@gmail.com'
const BATCH_SIZE = 10

const TEXT_EXTRACT_PROMPT = `You are extracting content from an SAT practice question image.

Your job: read the question carefully and extract its text and visual features.

Return ONLY valid JSON with no other text:

{
  "question_text": "The complete text of the question. Include any passage, context, or setup text. If there is a graph, table, or diagram, describe it concisely (e.g., 'A scatter plot showing hours studied vs. test score for 12 students' or 'A bar chart comparing sales across 4 regions'). Include the answer choices if visible.",
  "features": ["list ONLY the features that apply from: has_graph, has_table, has_diagram, has_passage, has_equation, word_problem, multiple_choice, free_response, data_interpretation, vocabulary, grammar, punctuation, reading_comprehension, algebra, geometry, statistics, functions, quadratics, linear_equations, systems_of_equations, inequalities, ratios_proportions, percentages, probability, trigonometry"]
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

    const anthropic = new Anthropic({ apiKey })

    // Always fetch from offset 0 — pool shrinks as questions get indexed
    const { data: batch, error: fetchError } = await supabase
      .from('questions')
      .select('id, question_image_url')
      .or('question_text.is.null,question_text.eq.')
      .not('question_image_url', 'is', null)
      .limit(BATCH_SIZE)

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    // Count how many are still unindexed (for progress calculation)
    const { count: totalRemaining } = await supabase
      .from('questions')
      .select('id', { count: 'exact', head: true })
      .or('question_text.is.null,question_text.eq.')

    if (!batch || batch.length === 0) {
      return NextResponse.json({
        done: true,
        processed: 0,
        updated: 0,
        skipped: 0,
        total_remaining: 0,
        results: [],
      })
    }

    let updated = 0
    let skipped = 0
    const results = []

    for (const q of batch) {
      try {
        const message = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1024,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'url', url: q.question_image_url } },
              { type: 'text', text: TEXT_EXTRACT_PROMPT },
            ],
          }],
        })

        const responseText = message.content
          .filter(b => b.type === 'text')
          .map(b => (b as { type: 'text'; text: string }).text)
          .join('')

        const jsonMatch = responseText.match(/\{[\s\S]*\}/)
        if (!jsonMatch) {
          skipped++
          results.push({ id: q.id, status: 'parse_error' })
          continue
        }

        const parsed = JSON.parse(jsonMatch[0])
        const questionText = parsed.question_text?.trim()
        const features: string[] = parsed.features ?? []

        if (!questionText) {
          skipped++
          results.push({ id: q.id, status: 'empty_text' })
          continue
        }

        const { error: updateError } = await supabase
          .from('questions')
          .update({
            question_text: questionText,
            question_features: features,
          })
          .eq('id', q.id)

        if (updateError) {
          skipped++
          results.push({ id: q.id, status: `db_error: ${updateError.message}` })
        } else {
          updated++
          results.push({ id: q.id, status: 'ok', chars: questionText.length, features })
        }
      } catch (err) {
        skipped++
        results.push({ id: q.id, status: `error: ${String(err).slice(0, 80)}` })
      }
    }

    const newRemaining = (totalRemaining ?? 0) - updated

    return NextResponse.json({
      done: newRemaining <= 0,
      processed: batch.length,
      updated,
      skipped,
      total_remaining: Math.max(0, newRemaining),
      results,
    })
  } catch (err) {
    console.error('index-questions error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
