import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
import NotesClient from './NotesClient'

export type NoteComment = {
  id: string
  author_id: string
  author_name: string
  content: string
  quoted_text: string | null
  created_at: string
}

export default async function NotesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Fetch this student's note from teacher
  const { data: note } = await supabase
    .from('student_notes')
    .select('content, updated_at')
    .eq('student_id', user.id)
    .maybeSingle()

  // Fetch comments
  const { data: comments } = await supabase
    .from('student_note_comments')
    .select('*')
    .eq('student_id', user.id)
    .order('created_at', { ascending: true })

  // Fetch student's own profile for their display name
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, email')
    .eq('id', user.id)
    .maybeSingle()

  const studentName = profile?.full_name || profile?.email || 'Student'

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--background)' }}>
      <Nav userEmail={user.email} />
      <main className="flex-1 flex flex-col max-w-4xl mx-auto w-full p-6">
        <NotesClient
          studentId={user.id}
          studentName={studentName}
          initialContent={note?.content ?? ''}
          initialComments={(comments ?? []) as NoteComment[]}
        />
      </main>
    </div>
  )
}
