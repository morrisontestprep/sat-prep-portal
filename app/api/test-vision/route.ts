import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const TEACHER_EMAIL = process.env.TEACHER_EMAIL ?? 'morrisontestprep@gmail.com'

const VISION_PROMPT = `You are analyzing an SAT practice question image.

IMPORTANT: Look for a metadata table near the top of the image with columns including "Difficulty". That column contains filled blue bar segments — count them:
- 1 blue bar = Easy
- 2 blue bars = Medium
- 3 blue bars = Hard

Use the bar count as your difficulty_estimate. If you cannot see the bars clearly, use null.

Also extract the question content and return ONLY valid JSON with no other text:

{
  "difficulty_estimate": "Easy" | "Medium" | "Hard" | null,
  "difficulty_confidence": "bar_count" | "inferred" | "unclear",
  "question_text": "The full text of the question, including any passage or context. If there is a graph/table/diagram, describe it briefly.",
  "features": ["list of applicable features from: has_graph, has_table, has_diagram, has_passage, word_problem, multiple_choice, free_response, data_interpretation, vocabulary, grammar, punctuation, reading_comprehension, algebra, geometry, statistics, functions"]
}`

export async function POST(request: Request) {
  try {
    // Auth check
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || user.email !== TEACHER_EMAIL) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check for API key
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({
        error: 'ANTHROPIC_API_KEY not found in environment variables. Add it to portal/.env.local and restart the dev server.',
      }, { status: 400 })
    }

    const anthropic = new Anthropic({ apiKey })

    // Fetch 10 questions WITH known difficulty + 10 WITHOUT
    const [{ data: rated }, { data: unrated }] = await Promise.all([
      supabase
        .from('questions')
        .select('id, subject, domain, skill, difficulty, question_image_url')
        .not('difficulty', 'is', null)
        .neq('difficulty', '')
        .limit(500),
      supabase
        .from('questions')
        .select('id, subject, domain, skill, difficulty, question_image_url')
        .or('difficulty.is.null,difficulty.eq.')
        .limit(500),
    ])

    // Randomly pick 10 from each pool
    const shuffle = <T,>(arr: T[]) => [...arr].sort(() => Math.random() - 0.5)
    const ratedSample = shuffle(rated ?? []).slice(0, 10)
    const unratedSample = shuffle(unrated ?? []).slice(0, 10)
    const testQuestions = [...ratedSample, ...unratedSample]

    // Process each question through Claude Vision
    const results = []

    for (const q of testQuestions) {
      try {
        const imageUrl = q.question_image_url as string
        if (!imageUrl) {
          results.push({
            id: q.id,
            subject: q.subject,
            domain: q.domain,
            skill: q.skill,
            current_difficulty: q.difficulty || null,
            ai_difficulty: null,
            question_text: null,
            features: [],
            error: 'No image URL',
          })
          continue
        }

        const message = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1024,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image',
                  source: { type: 'url', url: imageUrl },
                },
                {
                  type: 'text',
                  text: VISION_PROMPT,
                },
              ],
            },
          ],
        })

        // Parse the response
        const responseText = message.content
          .filter(b => b.type === 'text')
          .map(b => (b as { type: 'text'; text: string }).text)
          .join('')

        // Extract JSON from response (handle markdown code blocks)
        const jsonMatch = responseText.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0])
          results.push({
            id: q.id,
            subject: q.subject,
            domain: q.domain,
            skill: q.skill,
            current_difficulty: q.difficulty || null,
            ai_difficulty: parsed.difficulty_estimate ?? null,
            difficulty_confidence: parsed.difficulty_confidence ?? 'unclear',
            question_text: parsed.question_text ?? null,
            features: parsed.features ?? [],
            match: q.difficulty ? (q.difficulty === parsed.difficulty_estimate ? 'correct' : 'mismatch') : 'new',
          })
        } else {
          results.push({
            id: q.id,
            subject: q.subject,
            domain: q.domain,
            skill: q.skill,
            current_difficulty: q.difficulty || null,
            ai_difficulty: null,
            question_text: responseText.slice(0, 200),
            features: [],
            error: 'Could not parse JSON from response',
          })
        }
      } catch (err) {
        results.push({
          id: q.id,
          subject: q.subject,
          domain: q.domain,
          skill: q.skill,
          current_difficulty: q.difficulty || null,
          ai_difficulty: null,
          question_text: null,
          features: [],
          error: String(err),
        })
      }
    }

    // Calculate accuracy on rated questions
    const ratedResults = results.filter(r => r.current_difficulty && !r.error)
    const correctCount = ratedResults.filter(r => r.match === 'correct').length
    const accuracy = ratedResults.length > 0 ? Math.round((correctCount / ratedResults.length) * 100) : 0

    return NextResponse.json({
      results,
      summary: {
        total_processed: results.length,
        rated_tested: ratedResults.length,
        correct_matches: correctCount,
        accuracy_percent: accuracy,
        errors: results.filter(r => r.error).length,
        estimated_cost: `~$${(results.length * 0.003).toFixed(2)}`,
        full_bank_estimate: `~$${(3135 * 0.003).toFixed(2)}`,
      },
    })

  } catch (err) {
    console.error('test-vision error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
