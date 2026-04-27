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
  const isPublic = pathname.startsWith('/login') || pathname.startsWith('/auth') || pathname.startsWith('/api/')

  if (!user && !isPublic) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Route authenticated users appropriately
  if (user) {
    const isTeacher = user.email === TEACHER_EMAIL

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
