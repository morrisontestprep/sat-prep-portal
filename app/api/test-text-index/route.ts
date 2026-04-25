import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const TEACHER_EMAIL = process.env.TEACHER_EMAIL ?? 'morrisontestprep@gmail.com'

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

    // Fetch 500 random questions and shuffle to get 20 representative ones
    const { data: pool } = await supabase
      .from('questions')
      .select('id, subject, domain, skill, difficulty, question_image_url')
      .not('question_image_url', 'is', null)
      .limit(500)

    const shuffle = <T,>(arr: T[]) => [...arr].sort(() => Math.random() - 0.5)
    const sample = shuffle(pool ?? []).slice(0, 20)

    const results = []

    for (const q of sample) {
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
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0])
          results.push({
            id: q.id,
            subject: q.subject,
            domain: q.domain,
            skill: q.skill,
            difficulty: q.difficulty || null,
            question_text: parsed.question_text ?? null,
            features: parsed.features ?? [],
            status: 'ok',
          })
        } else {
          results.push({
            id: q.id,
            subject: q.subject,
            domain: q.domain,
            skill: q.skill,
            difficulty: q.difficulty || null,
            question_text: null,
            features: [],
            status: 'parse_error',
          })
        }
      } catch (err) {
        results.push({
          id: q.id,
          subject: q.subject,
          domain: q.domain,
          skill: q.skill,
          difficulty: q.difficulty || null,
          question_text: null,
          features: [],
          status: `error: ${String(err).slice(0, 80)}`,
        })
      }
    }

    const successCount = results.filter(r => r.question_text).length
    const avgTextLength = successCount > 0
      ? Math.round(results.filter(r => r.question_text).reduce((sum, r) => sum + (r.question_text?.length ?? 0), 0) / successCount)
      : 0

    // Tally features across all results
    const featureCounts: Record<string, number> = {}
    for (const r of results) {
      for (const f of r.features) {
        featureCounts[f] = (featureCounts[f] ?? 0) + 1
      }
    }

    return NextResponse.json({
      results,
      summary: {
        total: results.length,
        extracted: successCount,
        errors: results.length - successCount,
        avg_text_length: avgTextLength,
        feature_counts: featureCounts,
        estimated_cost: `~$${(results.length * 0.003).toFixed(2)}`,
        full_bank_estimate: `~$${(3135 * 0.003).toFixed(2)}`,
      },
    })
  } catch (err) {
    console.error('test-text-index error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
