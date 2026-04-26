import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  if (code) {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )

    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      // Auto-create or update profile with name from Google OAuth
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const fullName = user.user_metadata?.full_name
            || user.user_metadata?.name
            || null

          const teacherEmail = process.env.TEACHER_EMAIL || 'morrisontestprep@gmail.com'
          const role = user.email === teacherEmail ? 'teacher' : 'student'

          await supabase.from('profiles').upsert(
            { id: user.id, email: user.email, full_name: fullName, role },
            { onConflict: 'id' }
          )
        }
      } catch (e) {
        console.error('Profile upsert error:', e)
      }
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`)
}
