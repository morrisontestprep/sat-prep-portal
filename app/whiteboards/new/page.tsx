import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'

export default async function NewWhiteboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data, error } = await supabase
    .from('whiteboards')
    .insert({ created_by: user.id })
    .select('id')
    .single()

  if (data?.id) redirect(`/whiteboards/${data.id}`)

  // Surface the error so we can debug
  return (
    <div style={{ padding: 40, fontFamily: 'monospace' }}>
      <h2>Failed to create whiteboard</h2>
      <pre style={{ background: '#fee', padding: 16, borderRadius: 8 }}>
        {error ? JSON.stringify(error, null, 2) : 'No data returned and no error — check RLS policies.'}
      </pre>
      <a href="/whiteboards" style={{ color: 'blue', textDecoration: 'underline' }}>← Back to Whiteboards</a>
    </div>
  )
}
