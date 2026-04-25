import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import Nav from '@/components/Nav'
import WorksheetsList from './WorksheetsList'

export default async function WorksheetsPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: worksheets } = await supabase
    .from('worksheets')
    .select(`
      id,
      title,
      created_at,
      updated_at,
      worksheet_items(count),
      student_assignments(count)
    `)
    .order('updated_at', { ascending: false })

  // Flatten counts for the client component
  const flat = (worksheets ?? []).map(ws => ({
    id: ws.id,
    title: ws.title,
    created_at: ws.created_at,
    updated_at: ws.updated_at,
    item_count: (ws.worksheet_items as unknown as { count: number }[])?.[0]?.count ?? 0,
    assign_count: (ws.student_assignments as unknown as { count: number }[])?.[0]?.count ?? 0,
  }))

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--background)' }}>
      <Nav userEmail={user.email} />
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>Worksheets</h1>
              <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
                {flat.length} saved worksheet{flat.length !== 1 ? 's' : ''}
              </p>
            </div>
            <Link
              href="/questions"
              className="px-4 py-2 rounded-xl text-sm font-medium text-white flex items-center gap-2"
              style={{ background: 'var(--accent)' }}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Worksheet
            </Link>
          </div>

          <WorksheetsList worksheets={flat} />
        </div>
      </div>
    </div>
  )
}
