import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
import SatRushClient from './SatRushClient'

export default async function SatRushPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // SAT Rush is for students only
  const TEACHER_EMAIL = process.env.TEACHER_EMAIL ?? 'morrisontestprep@gmail.com'
  if (user.email === TEACHER_EMAIL) redirect('/dashboard')

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--background)' }}>
      <Nav userEmail={user.email} />
      <SatRushClient />
    </div>
  )
}
