import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'

// GET /api/sat-rush/skills?subject=math&domain=Algebra
// Returns distinct skills for a given subject/domain combination.
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const subject = searchParams.get('subject')
  const domain = searchParams.get('domain')

  let query = supabase
    .from('questions')
    .select('skill')
    .not('skill', 'is', null)
    .not('skill', 'eq', '')

  if (subject) query = query.eq('subject', subject)
  if (domain)  query = query.eq('domain', domain)

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const skills = [...new Set((data ?? []).map(r => r.skill).filter(Boolean))].sort()
  return NextResponse.json({ skills })
}
