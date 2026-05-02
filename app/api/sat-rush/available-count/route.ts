import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'

// POST /api/sat-rush/available-count
// Body (JSON): { subjects, domains, skills, difficulties }
// Returns count of questions the student hasn't answered yet that match the filters.
// Filtering is done at the DB level to avoid Supabase's 1000-row default limit.
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { subjects, domains, skills, difficulties } = await request.json()

  // ── 1. Get seen question IDs (bounded — students won't have seen thousands) ─
  const [wsResult, rushResult] = await Promise.all([
    supabase
      .from('student_answers')
      .select('question_id')
      .in('assignment_id',
        (await supabase
          .from('student_assignments')
          .select('id')
          .eq('student_id', user.id)
          .then(r => (r.data ?? []).map(a => a.id)))
      ),
    supabase
      .from('sat_rush_answers')
      .select('question_id')
      .eq('student_id', user.id),
  ])

  const seenIds = [
    ...((wsResult.data ?? []).map(r => r.question_id).filter(Boolean)),
    ...((rushResult.data ?? []).map(r => r.question_id).filter(Boolean)),
  ]
  const uniqueSeenIds = [...new Set(seenIds)]

  // ── 2. Count matching questions at DB level (head:true = count only, no rows) ─
  let query = supabase
    .from('questions')
    .select('*', { count: 'exact', head: true })

  if (subjects    && subjects.length    > 0) query = query.in('subject', subjects)
  if (domains     && domains.length     > 0) query = query.in('domain', domains)
  if (skills      && skills.length      > 0) query = query.in('skill', skills)
  if (difficulties && difficulties.length > 0) {
    const hasUnrated = difficulties.includes('Unrated')
    const realDiffs  = difficulties.filter((d: string) => d !== 'Unrated')
    if (hasUnrated && realDiffs.length > 0) {
      query = query.or(`difficulty.in.(${realDiffs.join(',')}),difficulty.is.null`)
    } else if (hasUnrated) {
      query = query.or('difficulty.is.null,difficulty.eq.')
    } else {
      query = query.in('difficulty', realDiffs)
    }
  }

  // Total matching questions (no seen filter yet)
  const { count: total, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // ── 3. Count how many of the seen IDs fall within this filter set ─────────
  let seenInFilterCount = 0
  if (uniqueSeenIds.length > 0) {
    let seenQuery = supabase
      .from('questions')
      .select('*', { count: 'exact', head: true })
      .in('id', uniqueSeenIds)

    if (subjects    && subjects.length    > 0) seenQuery = seenQuery.in('subject', subjects)
    if (domains     && domains.length     > 0) seenQuery = seenQuery.in('domain', domains)
    if (skills      && skills.length      > 0) seenQuery = seenQuery.in('skill', skills)
    if (difficulties && difficulties.length > 0) {
      const hasUnrated = difficulties.includes('Unrated')
      const realDiffs  = difficulties.filter((d: string) => d !== 'Unrated')
      if (hasUnrated && realDiffs.length > 0) {
        seenQuery = seenQuery.or(`difficulty.in.(${realDiffs.join(',')}),difficulty.is.null`)
      } else if (hasUnrated) {
        seenQuery = seenQuery.or('difficulty.is.null,difficulty.eq.')
      } else {
        seenQuery = seenQuery.in('difficulty', realDiffs)
      }
    }

    const { count: seenCount } = await seenQuery
    seenInFilterCount = seenCount ?? 0
  }

  const unseen = (total ?? 0) - seenInFilterCount
  return NextResponse.json({ count: Math.max(0, unseen), total: total ?? 0 })
}
