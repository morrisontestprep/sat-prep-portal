import { createClient } from '@/utils/supabase/server'
import { redirect, notFound } from 'next/navigation'
import WhiteboardEditor from './WhiteboardEditor'

const TEACHER_EMAIL = 'morrisontestprep@gmail.com'

export default async function WhiteboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const isTeacher = user.email === TEACHER_EMAIL

  // Fetch the whiteboard (RLS ensures user can only see boards they own or are shared with)
  const { data: board, error } = await supabase
    .from('whiteboards')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !board) notFound()

  const isOwner = board.created_by === user.id

  // Determine edit access
  let canEdit = isOwner
  if (!isOwner) {
    const { data: share } = await supabase
      .from('whiteboard_shares')
      .select('access_level')
      .eq('whiteboard_id', id)
      .eq('shared_with', user.id)
      .is('revoked_at', null)
      .maybeSingle()
    canEdit = share?.access_level === 'edit'
  }

  // Current shares (for share modal)
  const { data: shares } = await supabase
    .from('whiteboard_shares')
    .select('id, shared_with, access_level, profiles(full_name, email)')
    .eq('whiteboard_id', id)
    .is('revoked_at', null)

  // Student list (for teacher share modal)
  let students: { id: string; full_name: string | null; email: string | null }[] = []
  if (isTeacher) {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .eq('role', 'student')
      .order('full_name')
    students = data ?? []
  }

  return (
    <WhiteboardEditor
      boardId={id}
      initialName={board.name}
      initialJson={board.canvas_json}
      isOwner={isOwner}
      canEdit={canEdit}
      isTeacher={isTeacher}
      students={students}
      initialShares={(shares ?? []) as any}
    />
  )
}
