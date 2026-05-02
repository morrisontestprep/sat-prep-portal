import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
import GuidesClient from './GuidesClient'
import type { Guide } from '@/components/GuideEditorModal'

const TEACHER_EMAIL = 'morrisontestprep@gmail.com'

export default async function GuidesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  if (user.email !== TEACHER_EMAIL) redirect('/my-assignments')

  const { data: guides } = await supabase
    .from('instructional_guides')
    .select('*')
    .order('updated_at', { ascending: false })

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--background)' }}>
      <Nav userEmail={user.email} />
      <main className="flex-1 flex flex-col">
        <GuidesClient initialGuides={(guides ?? []) as Guide[]} />
      </main>
    </div>
  )
}
