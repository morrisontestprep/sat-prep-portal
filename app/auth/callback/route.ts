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

          // Upsert the profile. On conflict (returning user) this is a no-op for
          // signup_notified — the column is not included so its value is preserved.
          await supabase.from('profiles').upsert(
            { id: user.id, email: user.email, full_name: fullName, role },
            { onConflict: 'id' }
          )

          // Check the signup_notified flag. It starts as FALSE on any freshly
          // created (or re-created after deletion) profile row. Once we send the
          // notification we flip it to TRUE so it never fires again for that row.
          const { data: profileRow } = await supabase
            .from('profiles')
            .select('signup_notified')
            .eq('id', user.id)
            .single()

          const needsNotification = role === 'student' && profileRow?.signup_notified === false

          console.log('[auth/callback] signup_notified:', profileRow?.signup_notified, 'needsNotification:', needsNotification)

          if (needsNotification) {
            // Mark as notified first so a retry can't double-fire
            await supabase
              .from('profiles')
              .update({ signup_notified: true })
              .eq('id', user.id)

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
