import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'

const TEACHER_EMAIL = process.env.TEACHER_EMAIL ?? 'morrisontestprep@gmail.com'

const MATH_DOMAINS = ['Algebra', 'Advanced Math', 'Geometry and Trigonometry', 'Problem-Solving and Data Analysis']
const ENGLISH_DOMAINS = ['Craft and Structure', 'Information and Ideas', 'Standard English Conventions', 'Expression of Ideas']

type Tag = { id: number; name: string }

// ─── Mode 1: Vector search (OPENAI_API_KEY present) ──────────────────────────
// Extracts only the truly "hard" constraints — subject and difficulty.
// Everything else (concept, topic, visual content) is handled by semantic similarity.

interface HardFilters {
  count: number
  subject: string
  difficulties: string[]
}

async function extractHardFilters(prompt: string, requestedCount?: number): Promise<HardFilters> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 128,
    system: `Extract exactly 3 things from a teacher's SAT question request. Return ONLY valid JSON, nothing else:
{"count": <number 1-30, default 10>, "subject": "<math|english|empty string>", "difficulties": [<"Easy"|"Medium"|"Hard">]}

Rules:
- subject: "math" if teacher mentions math, algebra, geometry, trigonometry, statistics, equations, or any math concept. "english" if they mention english, reading, writing, grammar, passages, vocabulary. Empty string if not clear.
- difficulties: ONLY include if the teacher explicitly mentions difficulty. easy/simple/basic→Easy, medium/moderate→Medium, hard/difficult/challenging/tough→Hard. Empty array if not mentioned.
- count: use number if mentioned (e.g. "10 questions", "give me 5"). Default 10.`,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = message.content
    .filter(b => b.type === 'text')
    .map(b => (b as { type: 'text'; text: string }).text)
    .join('')

  const match = text.match(/\{[\s\S]*\}/)
  if (!match) return { count: requestedCount ?? 10, subject: '', difficulties: [] }

  try {
    const parsed = JSON.parse(match[0])
    return {
      count: requestedCount ?? Math.min(Math.max(Number(parsed.count) || 10, 1), 30),
      subject: parsed.subject ?? '',
      difficulties: Array.isArray(parsed.difficulties) ? parsed.difficulties.filter((d: string) => ['Easy', 'Medium', 'Hard'].includes(d)) : [],
    }
  } catch {
    return { count: requestedCount ?? 10, subject: '', difficulties: [] }
  }
}

async function runVectorSearch(prompt: string, filters: HardFilters) {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })
  const supabase = await createClient()

  // Embed the teacher's prompt
  const embeddingResponse = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: prompt,
  })
  const queryEmbedding = embeddingResponse.data[0].embedding

  // Fetch top matches (3× the requested count for random variety, min 30)
  const fetchCount = Math.max(filters.count * 3, 30)

  const { data: matches, error } = await supabase.rpc('match_questions', {
    query_embedding: queryEmbedding,
    match_count: fetchCount,
    filter_subject: filters.subject || null,
    filter_difficulties: filters.difficulties.length > 0 ? filters.difficulties : null,
  })

  return { matches, error }
}

// ─── Mode 2: LLM filter search (ANTHROPIC_API_KEY, no OPENAI_API_KEY) ────────

interface ParsedFilters {
  count: number
  subject: string
  domain: string
  skill: string
  difficulties: string[]
  tagIds: number[]
  text_search?: string
  features?: string[]
}

async function parseWithLLM(
  prompt: string,
  allTags: Tag[],
  allSkills: string[],
  requestedCount?: number,
): Promise<ParsedFilters> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

  const systemPrompt = `You are a search assistant for an SAT question bank. Translate a teacher's request into search filters.

## Golden rule: FEWER filters = MORE results. Prefer broad searches.

## text_search is your primary tool — expand synonyms liberally:
- "circle problems" → "circle radius diameter circumference arc chord sector"
- "sports questions" → "sport athlete player team game score race runner"
- "percent questions" → "percent percentage increase decrease"
- "triangle questions" → "triangle angle hypotenuse pythagorean"

## features: only for visual/structural elements:
- tables/charts → ["has_table", "has_graph"]
- diagrams → ["has_diagram"]
- word problems → ["word_problem"]
- reading passages → ["has_passage"]
- open ended/grid-in → ["free_response"]

## Critical: skill and tag_names should be EMPTY unless the teacher explicitly names one.

Available features: has_graph, has_table, has_diagram, has_passage, has_equation, word_problem, multiple_choice, free_response, data_interpretation, vocabulary, grammar, punctuation, reading_comprehension, algebra, geometry, statistics, functions, quadratics, linear_equations, systems_of_equations, inequalities, ratios_proportions, percentages, probability, trigonometry
Tags (exact only): ${allTags.map(t => t.name).join(', ')}

Return ONLY valid JSON:
{"count": 10, "subject": "", "domain": "", "skill": "", "difficulties": [], "tag_names": [], "features": [], "text_search": ""}`

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    messages: [{ role: 'user', content: prompt }],
    system: systemPrompt,
  })

  const responseText = message.content
    .filter(b => b.type === 'text')
    .map(b => (b as { type: 'text'; text: string }).text)
    .join('')

  const jsonMatch = responseText.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('LLM did not return valid JSON')

  const parsed = JSON.parse(jsonMatch[0])

  const tagIds: number[] = []
  if (Array.isArray(parsed.tag_names)) {
    for (const name of parsed.tag_names) {
      const tag = allTags.find(t => t.name.toLowerCase() === name.toLowerCase())
      if (tag) tagIds.push(tag.id)
    }
  }

  const VALID_FEATURES = new Set([
    'has_graph','has_table','has_diagram','has_passage','has_equation','word_problem',
    'multiple_choice','free_response','data_interpretation','vocabulary','grammar',
    'punctuation','reading_comprehension','algebra','geometry','statistics','functions',
    'quadratics','linear_equations','systems_of_equations','inequalities',
    'ratios_proportions','percentages','probability','trigonometry',
  ])
  const features: string[] = Array.isArray(parsed.features)
    ? parsed.features.filter((f: string) => VALID_FEATURES.has(f))
    : []

  return {
    count: requestedCount ?? parsed.count ?? 10,
    subject: parsed.subject ?? '',
    domain: parsed.domain ?? '',
    skill: parsed.skill ?? '',
    difficulties: Array.isArray(parsed.difficulties) ? parsed.difficulties : [],
    tagIds,
    features: features.length > 0 ? features : undefined,
    text_search: typeof parsed.text_search === 'string' && parsed.text_search.trim() ? parsed.text_search.trim() : undefined,
  }
}

// ─── Mode 3: Keyword parser (no API keys) ────────────────────────────────────

function parsePrompt(prompt: string, allTags: Tag[], allSkills: string[]): ParsedFilters {
  const lower = prompt.toLowerCase()

  const countMatch = lower.match(/\b(\d+)\b/)
  const count = countMatch ? Math.min(Math.max(parseInt(countMatch[1]), 1), 30) : 10

  const difficulties: string[] = []
  if (/\beasy\b|\bsimple\b|\bbasic\b/.test(lower)) difficulties.push('Easy')
  if (/\bmedium\b|\bmoderate\b|\bintermediate\b/.test(lower)) difficulties.push('Medium')
  if (/\bhard\b|\bdifficult\b|\bchallenging\b|\badvanced\b|\btough\b/.test(lower)) difficulties.push('Hard')

  let subject = ''
  if (/\bmath\b|\balgebra\b|\bgeometr|\btrigonom|\barithmetic\b|\bequation|\bstatistic|\bprobabilit/.test(lower)) subject = 'math'
  if (/\benglish\b|\breading\b|\bwriting\b|\bgrammar\b|\bpassage\b|\bvocab|\bpunctuation\b|\btransition\b/.test(lower)) subject = 'english'

  const domainAliases: [RegExp, string][] = [
    [/\badvanced math\b/, 'Advanced Math'],
    [/\balgebra\b/, 'Algebra'],
    [/\bgeometr|\btrigonom|\btrig\b/, 'Geometry and Trigonometry'],
    [/\bproblem.solv|\bdata anal|\bstatistic|\bprobabilit/, 'Problem-Solving and Data Analysis'],
    [/\bcraft and structure\b/, 'Craft and Structure'],
    [/\binformation and ideas\b/, 'Information and Ideas'],
    [/\bstandard english\b|\bconventions\b/, 'Standard English Conventions'],
    [/\bexpression of ideas\b/, 'Expression of Ideas'],
  ]

  let domain = ''
  for (const [pattern, fullDomain] of domainAliases) {
    if (pattern.test(lower)) {
      domain = fullDomain
      if (!subject) subject = MATH_DOMAINS.includes(fullDomain) ? 'math' : 'english'
      break
    }
  }

  let skill = ''
  let bestMatchScore = 0
  for (const s of allSkills) {
    const sLower = s.toLowerCase()
    if (lower.includes(sLower) && sLower.length > bestMatchScore) {
      skill = s; bestMatchScore = sLower.length; continue
    }
    const skillWords = sLower.split(/\s+/).filter(w => w.length > 3)
    if (skillWords.length === 0) continue
    const matchCount = skillWords.filter(w => lower.includes(w)).length
    const matchRatio = matchCount / skillWords.length
    if (matchCount >= 2 && matchRatio >= 0.5 && sLower.length > bestMatchScore) {
      skill = s; bestMatchScore = sLower.length
    }
  }

  const tagIds: number[] = []
  for (const tag of allTags) {
    if (lower.includes(tag.name.toLowerCase())) tagIds.push(tag.id)
  }

  return { count, subject, domain, skill, difficulties, tagIds }
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user || user.email !== TEACHER_EMAIL) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { prompt, count: requestedCount } = body

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 })
    }

    const cleanPrompt = prompt.trim()
    const lowerPrompt = cleanPrompt.toLowerCase()

    // ── Fetch tags early — needed for both vector and filter modes ────────────
    const [{ data: allTagsData }, { data: skillRows }] = await Promise.all([
      supabase.from('tags').select('id, name'),
      supabase.from('questions').select('skill'),
    ])
    const allTags = allTagsData ?? []
    const allSkills = [...new Set((skillRows ?? []).map(r => (r as { skill: string }).skill).filter(Boolean))]

    // Words that should never be matched as tag names — they're structural filters
    const RESERVED_FILTER_WORDS = new Set(['easy', 'medium', 'hard', 'math', 'english', 'reading', 'writing'])

    // Scan the prompt for any tag names that appear verbatim (case-insensitive)
    // Skip tags whose entire name is a reserved structural keyword
    const matchedTags = allTags.filter(t => {
      const tLower = t.name.toLowerCase()
      // Skip if the tag name itself is a reserved word
      if (RESERVED_FILTER_WORDS.has(tLower)) return false
      return lowerPrompt.includes(tLower)
    })
    const matchedTagIds = matchedTags.map(t => t.id)

    // Pre-compute question IDs that have ALL matched tags (empty = no tag filter)
    let tagFilteredIds: Set<string> | null = null
    if (matchedTagIds.length > 0) {
      const { data: qtRows } = await supabase
        .from('question_tags')
        .select('question_id, tag_id')
        .in('tag_id', matchedTagIds)

      if (qtRows) {
        const tagsByQ = new Map<string, Set<number>>()
        for (const row of qtRows) {
          const r = row as { question_id: string; tag_id: number }
          if (!tagsByQ.has(r.question_id)) tagsByQ.set(r.question_id, new Set())
          tagsByQ.get(r.question_id)!.add(r.tag_id)
        }
        tagFilteredIds = new Set(
          [...tagsByQ.entries()]
            .filter(([, tagSet]) => matchedTagIds.every(tid => tagSet.has(tid)))
            .map(([qid]) => qid)
        )
      }
    }

    // ── Mode 1a: Tag-exact search (tags matched in prompt) ───────────────────
    // When the teacher names a specific tag, use direct DB lookup — not vector
    // search, which would under-rank tagged questions that aren't top semantic hits.
    if (tagFilteredIds && tagFilteredIds.size > 0) {
      const hardFilters = process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY
        ? await extractHardFilters(cleanPrompt, requestedCount)
        : { count: requestedCount ?? 10, subject: '', difficulties: [] }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let tagQuery: any = supabase
        .from('questions')
        .select('id, subject, domain, skill, difficulty, correct_answer, question_image_url, answer_image_url')
        .in('id', [...tagFilteredIds])

      if (hardFilters.subject) tagQuery = tagQuery.eq('subject', hardFilters.subject)
      if (hardFilters.difficulties.length === 1) tagQuery = tagQuery.eq('difficulty', hardFilters.difficulties[0])
      else if (hardFilters.difficulties.length > 1) tagQuery = tagQuery.in('difficulty', hardFilters.difficulties)

      const { data: tagResults, error: tagError } = await tagQuery.limit(500)

      if (!tagError && tagResults && tagResults.length > 0) {
        const shuffled = [...tagResults].sort(() => Math.random() - 0.5)
        const selected = shuffled.slice(0, hardFilters.count)

        const filterLabels = ['Tag search']
        filterLabels.push(`Tags: ${matchedTags.map(t => t.name).join(', ')}`)
        if (hardFilters.subject) filterLabels.push(`Subject: ${hardFilters.subject === 'math' ? 'Math' : 'English'}`)
        if (hardFilters.difficulties.length > 0) filterLabels.push(`Difficulty: ${hardFilters.difficulties.join(', ')}`)
        filterLabels.push(`Pool: ${tagResults.length} matched`)

        return NextResponse.json({
          questions: selected,
          filterLabels,
          total: tagResults.length,
          usedVector: false,
          usedLLM: true,
        })
      }

      // Tag filter found IDs but DB query returned nothing (e.g., difficulty too strict)
      // Fall through to vector search so teacher still gets something useful
    }

    // ── Mode 1b: Vector search (no exact tags, or tag search returned nothing) ─
    if (process.env.OPENAI_API_KEY) {
      try {
        const hardFilters = await extractHardFilters(cleanPrompt, requestedCount)
        const { matches, error } = await runVectorSearch(cleanPrompt, hardFilters)

        if (error) {
          console.error('Vector search error:', error)
          // Fall through to Mode 2
        } else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const results: any[] = matches ?? []

          if (results.length > 0) {
            const shuffled = [...results].sort(() => Math.random() - 0.5)
            const selected = shuffled.slice(0, hardFilters.count)

            const filterLabels = ['Semantic search']
            if (hardFilters.subject) filterLabels.push(`Subject: ${hardFilters.subject === 'math' ? 'Math' : 'English'}`)
            if (hardFilters.difficulties.length > 0) filterLabels.push(`Difficulty: ${hardFilters.difficulties.join(', ')}`)
            filterLabels.push(`Pool: ${results.length} matched`)

            return NextResponse.json({
              questions: selected,
              filterLabels,
              total: results.length,
              usedVector: true,
              usedLLM: true,
            })
          } else {
            return NextResponse.json({
              questions: [],
              filterLabels: ['Semantic search', 'No matches found — try a different description'],
              total: 0,
              usedVector: true,
              usedLLM: true,
              message: 'No questions matched. Try a different description or check that the tag exists.',
            })
          }
        }
      } catch (err) {
        console.warn('Vector search failed, falling back to filter mode:', err)
        // Fall through to Mode 2
      }
    }

    // ── Mode 2: LLM filter search ─────────────────────────────────────────────
    // (allTags and allSkills already fetched above)

    let filters: ParsedFilters
    let usedLLM = false

    if (process.env.ANTHROPIC_API_KEY) {
      try {
        filters = await parseWithLLM(cleanPrompt, allTags, allSkills, requestedCount)
        usedLLM = true
      } catch (err) {
        console.warn('LLM filter parsing failed, falling back to keyword parser:', err)
        filters = parsePrompt(cleanPrompt, allTags, allSkills)
      }
    } else {
      filters = parsePrompt(cleanPrompt, allTags, allSkills)
    }

    if (typeof requestedCount === 'number' && requestedCount > 0) {
      filters.count = Math.min(Math.max(requestedCount, 1), 30)
    }

    // Tag pre-filter (for Mode 2 — uses LLM-extracted tagIds, separate from vector tag logic above)
    let filterModeTagIds: string[] | null = null
    if (filters.tagIds.length > 0) {
      const { data: qtRows } = await supabase
        .from('question_tags')
        .select('question_id, tag_id')
        .in('tag_id', filters.tagIds)

      if (qtRows) {
        const questionTagMap = new Map<string, Set<number>>()
        for (const row of qtRows) {
          const r = row as { question_id: string; tag_id: number }
          if (!questionTagMap.has(r.question_id)) questionTagMap.set(r.question_id, new Set())
          questionTagMap.get(r.question_id)!.add(r.tag_id)
        }
        filterModeTagIds = []
        for (const [qId, tagSet] of questionTagMap.entries()) {
          if (filters.tagIds.every(tid => tagSet.has(tid))) filterModeTagIds.push(qId)
        }
        if (filterModeTagIds.length === 0) {
          if (!filters.text_search) {
            return NextResponse.json({ questions: [], total: 0, usedLLM, message: 'No questions found with those tags.' })
          }
          filterModeTagIds = null
        }
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query: any = supabase
      .from('questions')
      .select('id, subject, domain, skill, difficulty, correct_answer, question_image_url, answer_image_url')

    if (filters.subject) query = query.eq('subject', filters.subject)
    if (filters.domain) query = query.eq('domain', filters.domain)
    if (filters.skill) query = query.ilike('skill', `%${filters.skill}%`)
    if (filters.difficulties.length === 1) query = query.eq('difficulty', filters.difficulties[0])
    else if (filters.difficulties.length > 1) query = query.in('difficulty', filters.difficulties)
    if (filterModeTagIds) query = query.in('id', filterModeTagIds)
    if (filters.features?.length) query = query.overlaps('question_features', filters.features)
    if (filters.text_search) {
      const tsquery = filters.text_search.trim().split(/\s+/).filter(Boolean).join(' | ')
      query = query.textSearch('question_text', tsquery, { config: 'english', type: 'tsquery' })
    }

    const { data: allMatches, error } = await query.limit(500)
    if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 })

    if (!allMatches || allMatches.length === 0) {
      return NextResponse.json({ questions: [], total: 0, usedLLM, message: 'No questions matched. Try broadening your search.' })
    }

    const shuffled = [...allMatches].sort(() => Math.random() - 0.5)
    const selected = shuffled.slice(0, filters.count)

    const filterLabels: string[] = usedLLM ? ['Powered by AI'] : []
    if (filters.subject) filterLabels.push(`Subject: ${filters.subject === 'math' ? 'Math' : 'English'}`)
    if (filters.domain) filterLabels.push(`Domain: ${filters.domain}`)
    if (filters.skill) filterLabels.push(`Skill: ${filters.skill}`)
    if (filters.difficulties.length > 0) filterLabels.push(`Difficulty: ${filters.difficulties.join(', ')}`)
    if (filters.features?.length) filterLabels.push(`Features: ${filters.features.join(', ')}`)
    if (filters.text_search) filterLabels.push(`Content: "${filters.text_search}"`)
    filterLabels.push(`Pool: ${allMatches.length} matching`)

    return NextResponse.json({ questions: selected, filterLabels, total: allMatches.length, usedLLM })

  } catch (err) {
    console.error('ai-select error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
