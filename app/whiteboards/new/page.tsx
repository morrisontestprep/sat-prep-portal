import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'

export default async function NewWhiteboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data } = await supabase
    .from('whiteboards')
    .insert({ created_by: user.id })
    .select('id')
    .single()

  if (data?.id) redirect(`/whiteboards/${data.id}`)
  redirect('/whiteboards')
}
