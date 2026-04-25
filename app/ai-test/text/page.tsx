import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import TextIndexClient from './TextIndexClient'

const TEACHER_EMAIL = process.env.TEACHER_EMAIL ?? 'morrisontestprep@gmail.com'

export default async function TextIndexTestPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email !== TEACHER_EMAIL) redirect('/login')

  const hasApiKey = !!process.env.ANTHROPIC_API_KEY

  return <TextIndexClient hasApiKey={hasApiKey} />
}
