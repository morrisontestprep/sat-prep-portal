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
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const fullName = user.user_metadata?.full_name
            || user.user_metadata?.name
            || null

          const teacherEmail = process.env.TEACHER_EMAIL || 'morrisontestprep@gmail.com'
          const role = user.email === teacherEmail ? 'teacher' : 'student'

          // Upsert the profile.
          // - Teachers: always marked approved.
          // - Students: do NOT include `approved` so that:
          //     • New rows keep the column DEFAULT (false) → pending approval
          //     • Returning approved students keep their existing approved = true
          await supabase.from('profiles').upsert(
            {
              id: user.id,
              email: user.email,
              full_name: fullName,
              role,
              ...(role === 'teacher' ? { approved: true } : {}),
            },
            { onConflict: 'id' }
          )

          // Read the profile to get signup_notified and approved
          const { data: profileRow } = await supabase
            .from('profiles')
            .select('signup_notified, approved')
            .eq('id', user.id)
            .single()

          const isApproved = profileRow?.approved === true

          // Send a one-time notification to the teacher when a new student signs up
          const needsNotification = role === 'student' && profileRow?.signup_notified === false

          console.log('[auth/callback] role:', role, 'signup_notified:', profileRow?.signup_notified, 'approved:', isApproved)

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
                  studentId: user.id,
                }),
              })
              console.log('[auth/callback] Notify response status:', notifyRes.status)
            } catch (e) {
              console.error('[auth/callback] Signup notification error:', e)
            }
          }

          // Students who are not yet approved wait on the pending page
          if (role === 'student' && !isApproved) {
            return NextResponse.redirect(`${origin}/pending-approval`)
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
