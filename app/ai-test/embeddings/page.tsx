import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import EmbeddingsIndexClient from './EmbeddingsIndexClient'

const TEACHER_EMAIL = process.env.TEACHER_EMAIL ?? 'morrisontestprep@gmail.com'

export default async function EmbeddingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email !== TEACHER_EMAIL) redirect('/login')

  const hasApiKey = !!process.env.OPENAI_API_KEY

  const { count } = await supabase
    .from('questions')
    .select('id', { count: 'exact', head: true })
    .is('embedding', null)

  return <EmbeddingsIndexClient totalUnembedded={count ?? 0} hasApiKey={hasApiKey} />
}
