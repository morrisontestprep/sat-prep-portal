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

          // Detect first-ever sign-in by comparing created_at vs last_sign_in_at.
          // A DB trigger may auto-create the profile row, so we can't rely on
          // the profiles table to detect new users. Instead we use Supabase auth
          // timestamps: on a first login they are identical (or within seconds).
          const createdAt = new Date(user.created_at).getTime()
          const lastSignIn = new Date(user.last_sign_in_at ?? user.created_at).getTime()
          const isFirstLogin = Math.abs(lastSignIn - createdAt) < 60_000 // within 60 s

          console.log('[auth/callback] createdAt:', user.created_at, 'lastSignIn:', user.last_sign_in_at, 'isFirstLogin:', isFirstLogin, 'role:', role)

          // Notify teacher of new student signup (only on first sign-in)
          if (isFirstLogin && role === 'student') {
            console.log('[auth/callback] Firing signup notification for', user.email)
            try {
              const notifyRes = await fetch(`${origin}/api/notify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  type: 'signup',
                  studentName: fullName ?? '',
                  studentEmail: user.email ?? '',
                }),
              })
              console.log('[auth/callback] Notify response status:', notifyRes.status)
            } catch (e) {
              console.error('[auth/callback] Signup notification error:', e)
            }
          } else {
            console.log('[auth/callback] Skipping signup notification — isFirstLogin:', isFirstLogin, 'role:', role)
          }
        }
      } catch (e) {
        console.error('Profile upsert error:', e)
      }
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`)
}
