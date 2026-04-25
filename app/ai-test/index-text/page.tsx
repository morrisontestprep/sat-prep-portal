import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import RunTextIndexClient from './RunTextIndexClient'

const TEACHER_EMAIL = process.env.TEACHER_EMAIL ?? 'morrisontestprep@gmail.com'

export default async function IndexTextPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email !== TEACHER_EMAIL) redirect('/login')

  const hasApiKey = !!process.env.ANTHROPIC_API_KEY

  // Count questions that haven't been indexed yet
  const { count } = await supabase
    .from('questions')
    .select('id', { count: 'exact', head: true })
    .or('question_text.is.null,question_text.eq.')

  return (
    <RunTextIndexClient
      totalUnindexed={count ?? 0}
      hasApiKey={hasApiKey}
    />
  )
}
