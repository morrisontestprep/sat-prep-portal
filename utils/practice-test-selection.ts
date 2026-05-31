// ─────────────────────────────────────────────────────────────────────────────
// Practice Test Question Selection
// ─────────────────────────────────────────────────────────────────────────────
//
// Difficulty rules:
//   M1 (RW + Math):  Easy / Medium / Hard — no explicit ratio, random draw
//   Easy M2:         Easy / Medium / Hard — no explicit ratio, random draw
//   Hard M2:         20% Easy / 50% Medium / 30% Hard — enforced by ratio picker
//
// Ordering rules:
//   RW:   random order within each domain block (no difficulty sort)
//   Math: sorted easy → hard globally across all domains
//
// Within every domain block / domain pick, questions are distributed
// evenly across skills (unseen-first within each skill tier).
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

type DifficultyLevel = 'Easy' | 'Medium' | 'Hard'

type DifficultyRatio = { difficulty: DifficultyLevel; fraction: number }[]

// ── Difficulty ratios per module type ─────────────────────────────────────────
const M1_RATIOS: DifficultyRatio = [
  { difficulty: 'Easy',   fraction: 1/3 },
  { difficulty: 'Medium', fraction: 1/3 },
  { difficulty: 'Hard',   fraction: 1/3 },
]

const EASY_M2_RATIOS: DifficultyRatio = [
  { difficulty: 'Easy',   fraction: 0.40 },
  { difficulty: 'Medium', fraction: 0.40 },
  { difficulty: 'Hard',   fraction: 0.20 },
]

const HARD_M2_RATIOS: DifficultyRatio = [
  { difficulty: 'Easy',   fraction: 0.20 },
  { difficulty: 'Medium', fraction: 0.50 },
  { difficulty: 'Hard',   fraction: 0.30 },
]

// ── Difficulty ordering (used only for Math sort) ─────────────────────────────
const DIFFICULTY_ORDER: Record<string, number> = { Easy: 0, Medium: 1, Hard: 2 }
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

// ── Seen question IDs ─────────────────────────────────────────────────────────
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
    supabase.from('practice_test_answers').select('question_id').eq('student_id', studentId).not('selected_answer', 'is', null),
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
): Promise<QuestionRow[]> {
  const { data } = await supabase
    .from('questions')
    .select('id, subject, domain, skill, difficulty, correct_answer, question_image_url, answer_image_url')
    .eq('subject', subject)
    .in('domain', domains)
    .in('difficulty', ['Easy', 'Medium', 'Hard'])
    .limit(3000)
  return (data ?? []) as QuestionRow[]
}

// ── Skill-distributed picker ──────────────────────────────────────────────────
// Picks `count` questions from pool, distributing evenly across skills
// (unseen-first within each skill). Updates usedIds in place.
function pickWithSkillDistribution(
  pool: QuestionRow[],
  seenIds: Set<string>,
  usedIds: Set<string>,
  count: number,
): QuestionRow[] {
  const available = pool.filter(q => !usedIds.has(q.id))

  // Group by skill
  const bySkill = new Map<string, QuestionRow[]>()
  for (const q of available) {
    const s = q.skill ?? 'Unknown'
    if (!bySkill.has(s)) bySkill.set(s, [])
    bySkill.get(s)!.push(q)
  }

  const skills = [...bySkill.keys()]

  if (skills.length <= 1) {
    const unseen = shuffle(available.filter(q => !seenIds.has(q.id)))
    const seen   = shuffle(available.filter(q =>  seenIds.has(q.id)))
    const picked = [...unseen, ...seen].slice(0, count)
    for (const q of picked) usedIds.add(q.id)
    return picked
  }

  const perSkill = Math.floor(count / skills.length)
  const extra    = count % skills.length
  const shuffledSkills = shuffle(skills)
  const picked: QuestionRow[] = []

  for (let i = 0; i < shuffledSkills.length; i++) {
    const pool   = bySkill.get(shuffledSkills[i])!
    const target = perSkill + (i < extra ? 1 : 0)
    const unseen = shuffle(pool.filter(q => !seenIds.has(q.id)))
    const seen   = shuffle(pool.filter(q =>  seenIds.has(q.id)))
    picked.push(...[...unseen, ...seen].slice(0, target))
  }

  // Fill any shortfall
  if (picked.length < count) {
    const pickedIds = new Set(picked.map(q => q.id))
    const rest      = available.filter(q => !pickedIds.has(q.id))
    const unseen    = shuffle(rest.filter(q => !seenIds.has(q.id)))
    const seen      = shuffle(rest.filter(q =>  seenIds.has(q.id)))
    picked.push(...[...unseen, ...seen].slice(0, count - picked.length))
  }

  const result = picked.slice(0, count)
  for (const q of result) usedIds.add(q.id)
  return result
}

// ── Integer allocation (largest-remainder / Hamilton's method) ────────────────
// Distributes `total` items across buckets by `fractions` (should sum to 1).
// Returns integer counts that always sum exactly to `total`, with no systematic
// bias toward any bucket.
function allocateCounts(total: number, fractions: number[]): number[] {
  const exact  = fractions.map(f => total * f)
  const floors = exact.map(Math.floor)
  let rem      = total - floors.reduce((a, b) => a + b, 0)
  const order  = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i)
  for (let k = 0; k < rem; k++) floors[order[k].i]++
  return floors
}

// ── Ratio-based picker ────────────────────────────────────────────────────────
// Picks `count` questions hitting explicit difficulty fractions,
// with skill distribution applied within each difficulty tier.
// NOTE: Uses Math.round per call — fine for large counts (RW domain blocks)
// but accumulates rounding error when called many times with small counts.
// Math modules use allocateCounts + the difficulty-first path instead.
function pickWithRatios(
  pool: QuestionRow[],
  seenIds: Set<string>,
  usedIds: Set<string>,
  count: number,
  ratios: DifficultyRatio,
): QuestionRow[] {
  const picked: QuestionRow[] = []
  let remaining = count

  for (let i = 0; i < ratios.length; i++) {
    const { difficulty, fraction } = ratios[i]
    const isLast = i === ratios.length - 1
    const target = isLast ? remaining : Math.round(count * fraction)

    const diffPool = pool.filter(q => q.difficulty === difficulty)
    const diffPicked = pickWithSkillDistribution(diffPool, seenIds, usedIds, target)
    picked.push(...diffPicked)
    remaining -= diffPicked.length
    if (remaining <= 0) break
  }

  return picked.slice(0, count)
}

// ── RW module builder ─────────────────────────────────────────────────────────
//
// Domain order: C&S → I&I → SEC → EoI
// Within each block: skill-distributed, RANDOM difficulty order (no sort)
// Hard M2: 20% Easy / 50% Medium / 30% Hard enforced per block

type RWModuleVariant = 'm1' | 'hard_m2' | 'easy_m2'

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
  const targets = RW_BLOCK_TARGETS[variant]
  const ratios  = variant === 'm1' ? M1_RATIOS : variant === 'easy_m2' ? EASY_M2_RATIOS : HARD_M2_RATIOS
  const total   = 27

  const pool = await fetchPool(supabase, 'english', RW_DOMAIN_ORDER)

  const result: QuestionRow[] = []
  let remaining = total

  for (let i = 0; i < RW_DOMAIN_ORDER.length; i++) {
    const domain = RW_DOMAIN_ORDER[i]
    const isLast = i === RW_DOMAIN_ORDER.length - 1
    const target = isLast ? remaining : targets[domain]

    const domainPool = pool.filter(q => q.domain === domain)
    const picked = pickWithRatios(domainPool, seenIds, usedIds, target, ratios)

    // RW: NO difficulty sort — random order within each domain block
    result.push(...picked)
    remaining -= picked.length
    if (remaining <= 0) break
  }

  return result
}

// ── Math module builder ───────────────────────────────────────────────────────
//
// Domains interleaved, skill-distributed within each domain.
// Hard M2: 20% Easy / 50% Medium / 30% Hard enforced per domain pick.
// All variants: sorted easy → hard globally at the end.

type MathModuleVariant = 'm1' | 'hard_m2' | 'easy_m2'

const MATH_DOMAIN_TARGETS: Record<MathModuleVariant, Record<string, number>> = {
  m1:      { 'Algebra': 7, 'Advanced Math': 7, 'Problem-Solving and Data Analysis': 4, 'Geometry and Trigonometry': 4 },
  hard_m2: { 'Algebra': 7, 'Advanced Math': 7, 'Problem-Solving and Data Analysis': 4, 'Geometry and Trigonometry': 4 },
  easy_m2: { 'Algebra': 7, 'Advanced Math': 7, 'Problem-Solving and Data Analysis': 4, 'Geometry and Trigonometry': 4 },
}

const MATH_DOMAINS = [
  'Algebra',
  'Advanced Math',
  'Problem-Solving and Data Analysis',
  'Geometry and Trigonometry',
]

export async function buildMathModule(
  supabase: SupabaseClient,
  variant: MathModuleVariant,
  seenIds: Set<string>,
  usedIds: Set<string>,
): Promise<QuestionRow[]> {
  const targets = MATH_DOMAIN_TARGETS[variant]
  const ratios  = variant === 'm1' ? M1_RATIOS : variant === 'easy_m2' ? EASY_M2_RATIOS : HARD_M2_RATIOS
  const total   = 22

  const pool = await fetchPool(supabase, 'math', MATH_DOMAINS)

  // ① Compute module-level difficulty counts using largest-remainder allocation.
  //    This avoids the per-domain rounding bug where applying Math.round to
  //    small domain counts (7 or 4) systematically over-fills the last bucket.
  //    e.g. M1 was producing 6/6/10 instead of 7/7/8, Easy M2 gave 10/10/2
  //    instead of 9/9/4, Hard M2 gave 4/12/6 instead of 4/11/7.
  const diffCounts = allocateCounts(total, ratios.map(r => r.fraction))
  // diffCounts[i] = questions to pick at ratios[i].difficulty

  const domainFractions = MATH_DOMAINS.map(d => targets[d] / total)

  const picked: QuestionRow[] = []

  // ② For each difficulty tier, pick the globally-correct count and distribute
  //    across domains proportionally (also using largest-remainder so domain
  //    counts always sum to the difficulty target).
  for (let ri = 0; ri < ratios.length; ri++) {
    const { difficulty } = ratios[ri]
    const diffTarget = diffCounts[ri]
    if (diffTarget <= 0) continue

    const diffPool = pool.filter(q => q.difficulty === difficulty)

    // Distribute this difficulty's allocation across domains
    const domainCounts = allocateCounts(diffTarget, domainFractions)

    const diffPicked: QuestionRow[] = []
    for (let di = 0; di < MATH_DOMAINS.length; di++) {
      const domainTarget = domainCounts[di]
      if (domainTarget <= 0) continue
      const domainDiffPool = diffPool.filter(q => q.domain === MATH_DOMAINS[di])
      diffPicked.push(...pickWithSkillDistribution(domainDiffPool, seenIds, usedIds, domainTarget))
    }

    // Fill shortfall within this difficulty tier from any domain
    if (diffPicked.length < diffTarget) {
      const pickedIds = new Set(diffPicked.map(q => q.id))
      const rest = diffPool.filter(q => !pickedIds.has(q.id))
      diffPicked.push(...pickWithSkillDistribution(rest, seenIds, usedIds, diffTarget - diffPicked.length))
    }

    picked.push(...diffPicked.slice(0, diffTarget))
  }

  // ③ Fill any overall shortfall (e.g. pool too thin in some difficulty)
  if (picked.length < total) {
    const fallback = pickWithRatios(pool, seenIds, usedIds, total - picked.length, ratios)
    picked.push(...fallback)
  }

  // Math: sort easy → hard globally
  return picked.slice(0, total).sort((a, b) => difficultyRank(a) - difficultyRank(b))
}
