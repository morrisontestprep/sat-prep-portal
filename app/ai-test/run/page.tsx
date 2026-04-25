import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
import RunIndexClient from './RunIndexClient'

export default async function RunIndexPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Count unrated questions
  const { count } = await supabase
    .from('questions')
    .select('id', { count: 'exact', head: true })
    .or('difficulty.is.null,difficulty.eq.')

  const hasApiKey = !!process.env.ANTHROPIC_API_KEY

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--background)' }}>
      <Nav userEmail={user.email} />
      <RunIndexClient totalUnrated={count ?? 0} hasApiKey={hasApiKey} />
    </div>
  )
}
