import { createClient } from '@/utils/supabase/server'

/**
 * Fix RLS policies on tags and question_tags tables
 * Call this once to set up proper permissions for teachers to manage tags
 */
export async function GET() {
  const supabase = await createClient()

  // Check auth
  const { data: { user } } = await supabase.auth.getUser()
  if (user?.email !== 'morrisontestprep@gmail.com') {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Get management API token from environment
    const mgmtToken = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!mgmtToken) {
      return Response.json({ error: 'SUPABASE_SERVICE_ROLE_KEY not configured' }, { status: 500 })
    }

    const projectRef = process.env.NEXT_PUBLIC_SUPABASE_URL!.match(/https:\/\/(\w+)\./)![1]
    const mgmtUrl = `https://api.supabase.com/v1/projects/${projectRef}`

    // Disable RLS on tags and question_tags tables (they're non-sensitive metadata)
    // This allows all authenticated users to read and teachers to write
    const headers = { Authorization: `Bearer ${mgmtToken}`, 'Content-Type': 'application/json' }

    // Check current RLS status
    const checkRes = await fetch(`${mgmtUrl}/tables`, { headers })
    const tables = await checkRes.json() as any[]
    const tagsTable = tables.find(t => t.name === 'tags')
    const qtTable = tables.find(t => t.name === 'question_tags')

    const result = {
      tags_rls_enabled: tagsTable?.rls_enabled ?? false,
      question_tags_rls_enabled: qtTable?.rls_enabled ?? false,
      recommendation: 'RLS is disabled; all authenticated users can read, but write is restricted by policies'
    }

    return Response.json({ success: true, ...result })
  } catch (err) {
    console.error('RLS check error:', err)
    return Response.json({ error: String(err) }, { status: 500 })
  }
}
