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

  // Step 1: get guide IDs shared with this student
  const { data: shareRows, error: sharesError } = await supabase
    .from('guide_shares')
    .select('guide_id')
    .eq('student_id', user.id)

  if (sharesError) console.error('[extra-materials] shares fetch error:', sharesError.message)

  const guideIds = (shareRows ?? []).map(s => s.guide_id as string)

  // Step 2: fetch the actual guides
  let guides: SharedGuide[] = []
  if (guideIds.length > 0) {
    const { data: guideRows, error: guidesError } = await supabase
      .from('instructional_guides')
      .select('id, title, subject, domain, content, updated_at')
      .in('id', guideIds)
    if (guidesError) console.error('[extra-materials] guides fetch error:', guidesError.message)
    guides = (guideRows ?? []).sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    )
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--background)' }}>
      <Nav userEmail={user.email} />
      {/* TEMP DEBUG — remove after fixing */}
      <pre style={{ background: '#111', color: '#0f0', fontSize: 11, padding: 12, whiteSpace: 'pre-wrap' }}>
        {JSON.stringify({ userId: user.id, shareRows, sharesError, guideIds, guidesCount: guides.length }, null, 2)}
      </pre>
      <main className="flex-1 flex flex-col">
        <ExtraMaterialsClient guides={guides} />
      </main>
    </div>
  )
}
