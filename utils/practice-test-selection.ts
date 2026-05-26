// ─────────────────────────────────────────────────────────────────────────────
// Practice Test Question Selection
//
// Builds the four module question arrays for a practice test.
// Logic: unseen questions preferred (same three sources as SAT Rush),
// domain/difficulty targets from real SAT data, ordering per module type.
// ─────────────────────────────────────────────────────────────────────────────

import { SupabaseClient } from '@supabase/supabase-js'

// ── Types ─────────────────────────────────────────────────────────────────────

export type QuestionRow = {
  id: string
  subject: string
  domain: string
  skill: string
  difficulty: string | null
  correct_answer: string
  question_image_url: string | null
  answer_image_url: string | null
}

type DifficultyLevel = 'Easy' | 'Medium' | 'Hard' | 'Very Hard'

// ── Difficulty ordering ───────────────────────────────────────────────────────

const DIFFICULTY_ORDER: Record<string, number> = {
  Easy: 0, Medium: 1, Hard: 2, 'Very Hard': 3,
}

function difficultyRank(q: QuestionRow): number {
  return DIFFICULTY_ORDER[q.difficulty ?? 'Medium'] ?? 1
}

// ── Shuffle ───────────────────────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ── Seen question IDs (same sources as SAT Rush) ──────────────────────────────

export async function getSeenQuestionIds(
  supabase: SupabaseClient,
  studentId: string,
): Promise<Set<string>> {
  const assignmentIds = await supabase
    .from('student_assignments')
    .select('id')
    .eq('student_id', studentId)
    .then(r => (r.data ?? []).map((a: { id: string }) => a.id))

  const [wsResult, rushResult, practiceResult, ptResult] = await Promise.all([
    assignmentIds.length > 0
      ? supabase.from('student_answers').select('question_id').in('assignment_id', assignmentIds)
      : Promise.resolve({ data: [] }),
    supabase.from('sat_rush_answers').select('question_id').eq('student_id', studentId),
    supabase.from('practice_answers').select('question_id').eq('student_id', studentId),
    supabase.from('practice_test_answers').select('question_id').eq('student_id', studentId),
  ])

  return new Set<string>([
    ...((wsResult.data ?? []).map((r: { question_id: string }) => r.question_id).filter(Boolean)),
    ...((rushResult.data ?? []).map((r: { question_id: string }) => r.question_id).filter(Boolean)),
    ...((practiceResult.data ?? []).map((r: { question_id: string }) => r.question_id).filter(Boolean)),
    ...((ptResult.data ?? []).map((r: { question_id: string }) => r.question_id).filter(Boolean)),
  ])
}

// ── Pool fetchers ─────────────────────────────────────────────────────────────

async function fetchPool(
  supabase: SupabaseClient,
  subject: string,
  domains: string[],
  difficulties: DifficultyLevel[],
): Promise<QuestionRow[]> {
  const { data } = await supabase
    .from('questions')
    .select('id, subject, domain, skill, difficulty, correct_answer, question_image_url, answer_image_url')
    .eq('subject', subject)
    .in('domain', domains)
    .in('difficulty', difficulties)
    .limit(3000)
  return (data ?? []) as QuestionRow[]
}

// ── Unseen-first picker ───────────────────────────────────────────────────────
// Picks `count` questions from pool, unseen first, shuffled within each tier.

function pickUnseen(
  pool: QuestionRow[],
  seenIds: Set<string>,
  usedIds: Set<string>,
  count: number,
): QuestionRow[] {
  const available = pool.filter(q => !usedIds.has(q.id))
  const unseen = shuffle(available.filter(q => !seenIds.has(q.id)))
  const seen   = shuffle(available.filter(q =>  seenIds.has(q.id)))
  return [...unseen, ...seen].slice(0, count)
}

// ── RW domain block builder ───────────────────────────────────────────────────
//
// Real SAT ordering: C&S → I&I → SEC → EoI (four blocks)
// Within each block: sorted easy→hard
// Block sizes vary per module (5–8 each), target totals 27

type RWModuleVariant = 'm1' | 'hard_m2' | 'easy_m2'

const RW_DIFFICULTY_POOL: Record<RWModuleVariant, DifficultyLevel[]> = {
  m1:      ['Easy', 'Medium', 'Hard'],
  hard_m2: ['Medium', 'Hard', 'Very Hard'],
  easy_m2: ['Easy', 'Medium', 'Hard'],
}

// Target question counts per domain block (flexible ±1)
const RW_BLOCK_TARGETS: Record<RWModuleVariant, Record<string, number>> = {
  m1:      { 'Craft and Structure': 7, 'Information and Ideas': 8, 'Standard English Conventions': 6, 'Expression of Ideas': 6 },
  hard_m2: { 'Craft and Structure': 7, 'Information and Ideas': 7, 'Standard English Conventions': 7, 'Expression of Ideas': 6 },
  easy_m2: { 'Craft and Structure': 7, 'Information and Ideas': 7, 'Standard English Conventions': 7, 'Expression of Ideas': 6 },
}

const RW_DOMAIN_ORDER = [
  'Craft and Structure',
  'Information and Ideas',
  'Standard English Conventions',
  'Expression of Ideas',
]

export async function buildRWModule(
  supabase: SupabaseClient,
  variant: RWModuleVariant,
  seenIds: Set<string>,
  usedIds: Set<string>,
): Promise<QuestionRow[]> {
  const diffs    = RW_DIFFICULTY_POOL[variant]
  const targets  = RW_BLOCK_TARGETS[variant]
  const total    = 27

  const pool = await fetchPool(supabase, 'english', RW_DOMAIN_ORDER, diffs)

  const result: QuestionRow[] = []
  let remaining = total

  for (let i = 0; i < RW_DOMAIN_ORDER.length; i++) {
    const domain = RW_DOMAIN_ORDER[i]
    const isLast = i === RW_DOMAIN_ORDER.length - 1
    const target = isLast ? remaining : targets[domain]

    const domainPool = pool.filter(q => q.domain === domain)
    const picked = pickUnseen(domainPool, seenIds, usedIds, target)

    // Sort easy → hard within block
    picked.sort((a, b) => difficultyRank(a) - difficultyRank(b))

    for (const q of picked) usedIds.add(q.id)
    result.push(...picked)
    remaining -= picked.length
    if (remaining <= 0) break
  }

  return result
}

// ── Math module builder ───────────────────────────────────────────────────────
//
// Domains interleaved (not blocked), sorted easy→hard overall.
// Domain targets approximate percentages from real test data.

type MathModuleVariant = 'm1' | 'hard_m2' | 'easy_m2'

const MATH_DIFFICULTY_POOL: Record<MathModuleVariant, DifficultyLevel[]> = {
  m1:      ['Easy', 'Medium', 'Hard'],
  hard_m2: ['Medium', 'Hard', 'Very Hard'],
  easy_m2: ['Easy', 'Medium', 'Hard'],
}

const MATH_DOMAINS = [
  'Algebra',
  'Advanced Math',
  'Problem-Solving and Data Analysis',
  'Geometry and Trigonometry',
]

// Target counts per domain (from real test analysis — ranges, not hard constraints)
// M1: Alg 6-9, AM 5-9, PSDA 3-5, Geo 3-5 → targeting 7,7,4,4 = 22
// M2: same distribution
const MATH_DOMAIN_TARGETS: Record<MathModuleVariant, Record<string, number>> = {
  m1:      { 'Algebra': 7, 'Advanced Math': 7, 'Problem-Solving and Data Analysis': 4, 'Geometry and Trigonometry': 4 },
  hard_m2: { 'Algebra': 7, 'Advanced Math': 7, 'Problem-Solving and Data Analysis': 4, 'Geometry and Trigonometry': 4 },
  easy_m2: { 'Algebra': 7, 'Advanced Math': 7, 'Problem-Solving and Data Analysis': 4, 'Geometry and Trigonometry': 4 },
}

export async function buildMathModule(
  supabase: SupabaseClient,
  variant: MathModuleVariant,
  seenIds: Set<string>,
  usedIds: Set<string>,
): Promise<QuestionRow[]> {
  const diffs   = MATH_DIFFICULTY_POOL[variant]
  const targets = MATH_DOMAIN_TARGETS[variant]
  const total   = 22

  const pool = await fetchPool(supabase, 'math', MATH_DOMAINS, diffs)

  const picked: QuestionRow[] = []

  // Pick per domain first, then fill remainder from any domain
  for (const domain of MATH_DOMAINS) {
    const domainPool = pool.filter(q => q.domain === domain)
    const domainPicked = pickUnseen(domainPool, seenIds, usedIds, targets[domain])
    for (const q of domainPicked) usedIds.add(q.id)
    picked.push(...domainPicked)
  }

  // If short, fill from any remaining domain pool
  if (picked.length < total) {
    const remaining = total - picked.length
    const fallback = pickUnseen(pool, seenIds, usedIds, remaining)
    for (const q of fallback) usedIds.add(q.id)
    picked.push(...fallback)
  }

  // Truncate if somehow over (shouldn't happen, but safe)
  const result = picked.slice(0, total)

  // Sort by difficulty easy → hard (interleaved across domains)
  result.sort((a, b) => difficultyRank(a) - difficultyRank(b))

  return result
}
