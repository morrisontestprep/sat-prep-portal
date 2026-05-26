// ─────────────────────────────────────────────────────────────────────────────
// Practice Test Question Selection
//
// Builds the four module question arrays for a practice test.
// Logic: unseen questions preferred (same sources as SAT Rush),
// domain/difficulty targets from real SAT data, ordering per module type.
// Within each domain, questions are distributed evenly across skills.
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

// ── Pool fetcher ──────────────────────────────────────────────────────────────

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

// ── Skill-distributed picker ──────────────────────────────────────────────────
//
// Picks `count` questions from pool, distributing evenly across skills
// (unseen-first within each skill). Updates usedIds in place.

function pickWithSkillDistribution(
  domainPool: QuestionRow[],
  seenIds: Set<string>,
  usedIds: Set<string>,
  count: number,
): QuestionRow[] {
  const available = domainPool.filter(q => !usedIds.has(q.id))

  // Group available questions by skill
  const bySkill = new Map<string, QuestionRow[]>()
  for (const q of available) {
    const s = q.skill ?? 'Unknown'
    if (!bySkill.has(s)) bySkill.set(s, [])
    bySkill.get(s)!.push(q)
  }

  const skills = [...bySkill.keys()]

  // If only one skill (or no questions), fall back to simple unseen-first pick
  if (skills.length <= 1) {
    const unseen = shuffle(available.filter(q => !seenIds.has(q.id)))
    const seen   = shuffle(available.filter(q =>  seenIds.has(q.id)))
    const picked = [...unseen, ...seen].slice(0, count)
    for (const q of picked) usedIds.add(q.id)
    return picked
  }

  // Distribute `count` evenly across skills (remainder goes to randomly chosen skills)
  const perSkill  = Math.floor(count / skills.length)
  const extra     = count % skills.length
  const shuffledSkills = shuffle(skills)

  const picked: QuestionRow[] = []

  for (let i = 0; i < shuffledSkills.length; i++) {
    const skill  = shuffledSkills[i]
    const pool   = bySkill.get(skill)!
    const target = perSkill + (i < extra ? 1 : 0)

    const unseen = shuffle(pool.filter(q => !seenIds.has(q.id)))
    const seen   = shuffle(pool.filter(q =>  seenIds.has(q.id)))
    const skillPicked = [...unseen, ...seen].slice(0, target)
    picked.push(...skillPicked)
  }

  // Fill any shortfall (skill pools ran dry) from remaining available questions
  if (picked.length < count) {
    const pickedIds  = new Set(picked.map(q => q.id))
    const remaining  = available.filter(q => !pickedIds.has(q.id))
    const need       = count - picked.length
    const unseen     = shuffle(remaining.filter(q => !seenIds.has(q.id)))
    const seen       = shuffle(remaining.filter(q =>  seenIds.has(q.id)))
    picked.push(...[...unseen, ...seen].slice(0, need))
  }

  const result = picked.slice(0, count)
  for (const q of result) usedIds.add(q.id)
  return result
}

// ── RW module builder ─────────────────────────────────────────────────────────
//
// Real SAT ordering: C&S → I&I → SEC → EoI (four domain blocks)
// Within each block: skill-distributed, then sorted easy→hard
// Block sizes 5–8 each, total 27

type RWModuleVariant = 'm1' | 'hard_m2' | 'easy_m2'

const RW_DIFFICULTY_POOL: Record<RWModuleVariant, DifficultyLevel[]> = {
  m1:      ['Easy', 'Medium', 'Hard'],
  hard_m2: ['Medium', 'Hard', 'Very Hard'],
  easy_m2: ['Easy', 'Medium', 'Hard'],
}

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
  const diffs   = RW_DIFFICULTY_POOL[variant]
  const targets = RW_BLOCK_TARGETS[variant]
  const total   = 27

  const pool = await fetchPool(supabase, 'english', RW_DOMAIN_ORDER, diffs)

  const result: QuestionRow[] = []
  let remaining = total

  for (let i = 0; i < RW_DOMAIN_ORDER.length; i++) {
    const domain = RW_DOMAIN_ORDER[i]
    const isLast = i === RW_DOMAIN_ORDER.length - 1
    const target = isLast ? remaining : targets[domain]

    const domainPool = pool.filter(q => q.domain === domain)

    // Distribute evenly across skills within this domain block
    const picked = pickWithSkillDistribution(domainPool, seenIds, usedIds, target)

    // Sort easy → hard within block (real SAT ordering)
    picked.sort((a, b) => difficultyRank(a) - difficultyRank(b))

    result.push(...picked)
    remaining -= picked.length
    if (remaining <= 0) break
  }

  return result
}

// ── Math module builder ───────────────────────────────────────────────────────
//
// Domains interleaved (not blocked), skill-distributed within each domain,
// then sorted easy→hard globally.

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

  // Pick per domain with skill distribution
  for (const domain of MATH_DOMAINS) {
    const domainPool = pool.filter(q => q.domain === domain)
    const domainPicked = pickWithSkillDistribution(domainPool, seenIds, usedIds, targets[domain])
    picked.push(...domainPicked)
  }

  // Fill shortfall from any remaining domain
  if (picked.length < total) {
    const need     = total - picked.length
    const fallback = pickWithSkillDistribution(pool, seenIds, usedIds, need)
    picked.push(...fallback)
  }

  const result = picked.slice(0, total)

  // Sort by difficulty easy → hard (interleaved across domains)
  result.sort((a, b) => difficultyRank(a) - difficultyRank(b))

  return result
}
