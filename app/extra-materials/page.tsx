import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
import ExtraMaterialsClient from './ExtraMaterialsClient'

export type SharedGuide = {
  id: string
  title: string
  subject: string | null
  domain: string | null
  content: string
  updated_at: string
}

export default async function ExtraMaterialsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Fetch shared guides in one joined query
  const { data: shares, error: sharesError } = await supabase
    .from('guide_shares')
    .select(`
      instructional_guides (
        id, title, subject, domain, content, updated_at
      )
    `)
    .eq('student_id', user.id)

  if (sharesError) console.error('[extra-materials] fetch error:', sharesError.message)

  const guides: SharedGuide[] = (shares ?? [])
    .map((s: { instructional_guides: unknown }) => s.instructional_guides)
    .filter(Boolean)
    .sort((a: SharedGuide, b: SharedGuide) =>
      new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    ) as SharedGuide[]

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--background)' }}>
      <Nav userEmail={user.email} />
      <main className="flex-1 flex flex-col">
        <ExtraMaterialsClient guides={guides} />
      </main>
    </div>
  )
}
