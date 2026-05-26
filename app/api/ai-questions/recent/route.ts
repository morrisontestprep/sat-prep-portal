import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

const TEACHER_EMAIL = process.env.TEACHER_EMAIL ?? 'morrisontestprep@gmail.com'

// GET /api/ai-questions/recent?ids=id1,id2,...
// Returns the full question rows for the given IDs — used after generation
// to hydrate new questions into the client without a full page reload.
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email !== TEACHER_EMAIL) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const ids = (searchParams.get('ids') ?? '').split(',').filter(Boolean)
  if (ids.length === 0) return NextResponse.json({ questions: [] })

  const { data, error } = await supabase
    .from('ai_generated_questions')
    .select('*')
    .in('id', ids)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ questions: data ?? [] })
}
