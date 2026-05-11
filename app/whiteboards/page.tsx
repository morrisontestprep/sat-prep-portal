import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
import WhiteboardsClient from './WhiteboardsClient'

const TEACHER_EMAIL = 'morrisontestprep@gmail.com'

export default async function WhiteboardsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const isTeacher = user.email === TEACHER_EMAIL

  // Own boards
  const { data: ownBoards } = await supabase
    .from('whiteboards')
    .select('id, name, created_at, updated_at')
    .eq('created_by', user.id)
    .order('updated_at', { ascending: false })

  // Boards shared with this user
  const { data: sharedRaw } = await supabase
    .from('whiteboard_shares')
    .select('id, access_level, whiteboards(id, name, updated_at)')
    .eq('shared_with', user.id)
    .is('revoked_at', null)

  const sharedBoards = (sharedRaw ?? []).map((s: any) => ({
    shareId:     s.id,
    accessLevel: s.access_level,
    ...s.whiteboards,
  }))

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--background)' }}>
      <Nav userEmail={user.email} />
      <main className="flex-1 p-4 sm:p-6 max-w-4xl mx-auto w-full">
        <div className="mb-6">
          <h1 className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>Whiteboards</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {isTeacher ? 'Your boards' : 'Boards shared with you + your private boards'}
          </p>
        </div>
        <WhiteboardsClient
          ownBoards={(ownBoards ?? []) as any}
          sharedBoards={sharedBoards}
          isTeacher={isTeacher}
        />
      </main>
    </div>
  )
}
