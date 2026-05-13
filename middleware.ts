import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const TEACHER_EMAIL = 'morrisontestprep@gmail.com'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // Paths that never require auth checks (login page, OAuth, all API routes)
  const isPublic = pathname.startsWith('/login') || pathname.startsWith('/auth') || pathname.startsWith('/api/')
  // The pending-approval page: authenticated students may access it; unauthenticated users go to /login
  const isPendingApproval = pathname === '/pending-approval'

  // Unauthenticated: send to login (except public paths; pending-approval requires login too)
  if (!user && !isPublic) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (user) {
    const isTeacher = user.email === TEACHER_EMAIL

    // ── Approval gate (students only) ──────────────────────────────────────────
    // We skip this for the teacher and for paths that don't need an approval check.
    if (!isTeacher) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('approved')
        .eq('id', user.id)
        .single()

      const isApproved = profile?.approved === true

      if (!isApproved && !isPendingApproval) {
        // Unapproved student trying to access any page → hold on the pending screen
        return NextResponse.redirect(new URL('/pending-approval', request.url))
      }

      if (isApproved && isPendingApproval) {
        // Approved student somehow still on the pending page → send them home
        return NextResponse.redirect(new URL('/my-assignments', request.url))
      }
    }

    // ── Normal routing for authenticated users ─────────────────────────────────

    // Redirect /login to appropriate home
    if (pathname === '/login') {
      return NextResponse.redirect(new URL(isTeacher ? '/dashboard' : '/my-assignments', request.url))
    }

    // Redirect root to appropriate home
    if (pathname === '/') {
      return NextResponse.redirect(new URL(isTeacher ? '/dashboard' : '/my-assignments', request.url))
    }

    // Block students from teacher-only pages
    if (!isTeacher) {
      const teacherOnlyPaths = ['/dashboard', '/questions', '/worksheets', '/students']
      if (teacherOnlyPaths.some(p => pathname.startsWith(p))) {
        return NextResponse.redirect(new URL('/my-assignments', request.url))
      }
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
