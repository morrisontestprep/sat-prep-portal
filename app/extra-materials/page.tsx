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

  // Get guide IDs shared with this student
  const { data: shares } = await supabase
    .from('guide_shares')
    .select('guide_id')
    .eq('student_id', user.id)

  const guideIds = (shares ?? []).map((s: { guide_id: string }) => s.guide_id)

  let guides: SharedGuide[] = []
  if (guideIds.length > 0) {
    const { data } = await supabase
      .from('instructional_guides')
      .select('id, title, subject, domain, content, updated_at')
      .in('id', guideIds)
      .order('updated_at', { ascending: false })
    guides = (data ?? []) as SharedGuide[]
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--background)' }}>
      <Nav userEmail={user.email} />
      <main className="flex-1 flex flex-col">
        <ExtraMaterialsClient guides={guides} />
      </main>
    </div>
  )
}
