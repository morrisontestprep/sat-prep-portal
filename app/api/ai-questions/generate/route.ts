import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import Anthropic from '@anthropic-ai/sdk'

const TEACHER_EMAIL = process.env.TEACHER_EMAIL ?? 'morrisontestprep@gmail.com'
const NUM_SEED_QUESTIONS = 4   // How many real questions to show Claude as examples
const MAX_GENERATE     = 8    // Cap per request

function randomHexId(len = 8) {
  return Array.from(crypto.getRandomValues(new Uint8Array(len / 2)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

// Fetch an image URL and return base64 + mediaType, or null on failure
async function fetchImageAsBase64(url: string): Promise<{ base64: string; mediaType: 'image/png' | 'image/jpeg' | 'image/webp' } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const buf = await res.arrayBuffer()
    const base64 = Buffer.from(buf).toString('base64')
    const ct = res.headers.get('content-type') ?? ''
    const mediaType = ct.includes('jpeg') ? 'image/jpeg' : ct.includes('webp') ? 'image/webp' : 'image/png'
    return { base64, mediaType }
  } catch {
    return null
  }
}

// POST /api/ai-questions/generate
// Body: { subject, domain, skill, difficulty, count }
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email !== TEACHER_EMAIL) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { subject, domain, skill, difficulty, count } = body as {
    subject: string
    domain: string
    skill: string
    difficulty: string
    count: number
  }

  if (!subject || !domain || !skill || !difficulty || !count) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }
  const safeCount = Math.min(Math.max(1, Number(count)), MAX_GENERATE)

  const admin = createAdminClient()

  // ── 1. Fetch seed questions (prefer same difficulty, fall back to any) ───────
  let { data: seeds } = await admin
    .from('questions')
    .select('id, subject, domain, skill, difficulty, correct_answer, question_image_url')
    .eq('subject', subject)
    .eq('domain', domain)
    .eq('skill', skill)
    .eq('difficulty', difficulty)
    .not('question_image_url', 'is', null)
    .eq('is_ai_generated', false)
    .limit(NUM_SEED_QUESTIONS)

  // If not enough at the target difficulty, relax constraint
  if (!seeds || seeds.length < 2) {
    const { data: fallback } = await admin
      .from('questions')
      .select('id, subject, domain, skill, difficulty, correct_answer, question_image_url')
      .eq('subject', subject)
      .eq('domain', domain)
      .eq('skill', skill)
      .not('question_image_url', 'is', null)
      .eq('is_ai_generated', false)
      .limit(NUM_SEED_QUESTIONS)
    seeds = fallback
  }

  if (!seeds || seeds.length === 0) {
    return NextResponse.json({ error: 'No seed questions found for this skill. Try a different combination.' }, { status: 422 })
  }

  // ── 2. Fetch seed images and extract question text via Vision ────────────────
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

  const imagePayloads = await Promise.all(
    seeds.map(s => fetchImageAsBase64(s.question_image_url!))
  )

  const validSeeds = seeds
    .map((s, i) => ({ seed: s, img: imagePayloads[i] }))
    .filter(({ img }) => img !== null) as { seed: typeof seeds[0]; img: NonNullable<Awaited<ReturnType<typeof fetchImageAsBase64>>> }[]

  if (validSeeds.length === 0) {
    return NextResponse.json({ error: 'Could not load seed question images. Please try again.' }, { status: 500 })
  }

  // Extract text from all seed images in one Vision call
  const extractionContent: Anthropic.MessageParam['content'] = [
    {
      type: 'text',
      text: `Below are ${validSeeds.length} SAT ${subject === 'math' ? 'Math' : 'Reading & Writing'} questions from the domain "${domain}", skill "${skill}", difficulty "${difficulty}". For each image, extract the complete question text (including any passage or equation), the four answer choices (A, B, C, D), and the question format type. Return ONLY a JSON array with no commentary:\n\n[\n  {\n    "index": 0,\n    "passage": "<passage text or null>",\n    "stem": "<question stem text>",\n    "choices": {"A": "...", "B": "...", "C": "...", "D": "..."},\n    "correct_answer": "${validSeeds[0]?.seed.correct_answer ?? 'A'}",\n    "format": "<word_problem|equation_eval|equation_translate|fill_in_blank|as_used_in_text|rhetorical_synthesis|other>"\n  }\n]`,
    },
    ...validSeeds.flatMap(({ seed, img }, i) => [
      { type: 'text' as const, text: `Image ${i} (correct answer: ${seed.correct_answer}):` },
      { type: 'image' as const, source: { type: 'base64' as const, media_type: img.mediaType, data: img.base64 } },
    ]),
  ]

  let extractedSeeds: Array<{
    passage: string | null
    stem: string
    choices: Record<string, string>
    correct_answer: string
    format: string
  }> = []

  try {
    const extractMsg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      messages: [{ role: 'user', content: extractionContent }],
    })
    const extractText = extractMsg.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('')
    const match = extractText.match(/\[[\s\S]*\]/)
    if (match) extractedSeeds = JSON.parse(match[0])
  } catch {
    return NextResponse.json({ error: 'Failed to extract seed question text. Please try again.' }, { status: 500 })
  }

  if (extractedSeeds.length === 0) {
    return NextResponse.json({ error: 'Could not parse seed questions. Please try again.' }, { status: 500 })
  }

  // ── 3. Generate new questions ────────────────────────────────────────────────
  const subjectLabel = subject === 'math' ? 'SAT Math' : 'SAT Reading & Writing'
  const examplesText = extractedSeeds.map((s, i) => {
    const choiceLines = Object.entries(s.choices).map(([k, v]) => `  ${k}. ${v}`).join('\n')
    return `EXAMPLE ${i + 1}${s.passage ? `\nPassage: ${s.passage}` : ''}:\n${s.stem}\n${choiceLines}\nCorrect: ${s.correct_answer}`
  }).join('\n\n')

  const isEnglish = subject !== 'math'

  const generationPrompt = `You are generating ${safeCount} new ${subjectLabel} questions for the domain "${domain}", skill "${skill}", difficulty "${difficulty}".

Here are real SAT questions from this exact skill category to use as structural models:

${examplesText}

REQUIREMENTS:
1. Match the exact structure and format of the examples above — same question type, same stem style, same answer format
2. Use entirely new scenarios, numbers, or passages (do NOT copy or rephrase the examples)
3. Difficulty must match "${difficulty}": ${difficulty === 'Easy' ? 'straightforward single-step problems' : difficulty === 'Medium' ? 'two-step problems with one potential confusion point' : 'multi-step problems requiring careful reasoning'}
4. Each question must have EXACTLY ONE correct answer that is unambiguously correct
5. Wrong answers must be COMPELLING — each should represent a specific, realistic student error:
   - For math: sign errors, swapped slope/intercept, forgetting a step, wrong operation, off-by-one
   - For English: opposite meaning, too strong/weak, literal vs contextual meaning, grammatically plausible but logically wrong
6. ${isEnglish ? 'For fill-in-blank questions, write a clear 2-4 sentence passage. For "as used in text" questions, use a word that has multiple common meanings.' : 'Use concrete real-world contexts (cost, distance, temperature, rates). Keep arithmetic clean — answers should be integers or simple decimals.'}

Return ONLY a JSON array, no other text:
[
  {
    "passage": "<passage text for English questions, or null for math>",
    "stem": "<complete question text>",
    "choices": {"A": "...", "B": "...", "C": "...", "D": "..."},
    "correct_answer": "<A|B|C|D>",
    "distractor_notes": {
      "<wrong letter>": "<specific error this answer targets>",
      "<wrong letter>": "<specific error this answer targets>",
      "<wrong letter>": "<specific error this answer targets>"
    }
  }
]`

  let generated: Array<{
    passage?: string | null
    stem: string
    choices: Record<string, string>
    correct_answer: string
    distractor_notes: Record<string, string>
  }> = []

  try {
    const genMsg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [{ role: 'user', content: generationPrompt }],
    })
    const genText = genMsg.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('')
    const match = genText.match(/\[[\s\S]*\]/)
    if (match) generated = JSON.parse(match[0])
  } catch {
    return NextResponse.json({ error: 'Generation failed. Please try again.' }, { status: 500 })
  }

  if (!generated.length) {
    return NextResponse.json({ error: 'No questions were generated. Please try again.' }, { status: 500 })
  }

  // ── 4. Insert into ai_generated_questions ────────────────────────────────────
  const rows = generated.slice(0, safeCount).map(q => ({
    id:                randomHexId(8),
    subject,
    domain,
    skill,
    difficulty,
    passage:           q.passage ?? null,
    stem:              q.stem,
    choices:           q.choices,
    correct_answer:    q.correct_answer,
    distractor_notes:  q.distractor_notes ?? {},
    seed_question_ids: validSeeds.map(s => s.seed.id),
    status:            'pending',
    generated_at:      new Date().toISOString().slice(0, 10),
  }))

  const { error: insertErr } = await admin
    .from('ai_generated_questions')
    .insert(rows)

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, count: rows.length, ids: rows.map(r => r.id) })
}
