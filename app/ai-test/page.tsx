import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
import AiTestClient from './AiTestClient'

export default async function AiTestPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const hasApiKey = !!process.env.ANTHROPIC_API_KEY

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--background)' }}>
      <Nav userEmail={user.email} />
      <AiTestClient hasApiKey={hasApiKey} />
    </div>
  )
}
