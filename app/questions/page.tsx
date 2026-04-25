import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
import QuestionBrowser from './QuestionBrowser'

const MATH_DOMAINS = [
  'Algebra',
  'Advanced Math',
  'Geometry and Trigonometry',
  'Problem-Solving and Data Analysis',
]

const ENGLISH_DOMAINS = [
  'Craft and Structure',
  'Information and Ideas',
  'Standard English Conventions',
  'Expression of Ideas',
]

export default async function QuestionsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="min-h-screen flex flex-col">
      <Nav userEmail={user.email} />
      <QuestionBrowser mathDomains={MATH_DOMAINS} englishDomains={ENGLISH_DOMAINS} />
    </div>
  )
}
