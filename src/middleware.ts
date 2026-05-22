// src/middleware.ts
// Bảo vệ routes theo role, refresh session

import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

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
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Lấy session hiện tại
  const { data: { user } } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // Các route công khai (không cần đăng nhập)
  const publicRoutes = ['/', '/login', '/register']
  const isPublicRoute = publicRoutes.some(r => pathname === r || pathname.startsWith('/api/auth'))

  // Chưa đăng nhập → redirect về login
  if (!user && !isPublicRoute) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Đã đăng nhập → không cần vào login/register nữa
  if (user && (pathname === '/login' || pathname === '/register')) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // Kiểm tra role nếu đã đăng nhập
  if (user) {
    // Lấy role từ user metadata (mặc định coi như không có quyền nếu không map)
    const role = (user.user_metadata?.role as string) || ''

    // Nếu vào trang dashboard thì điều hướng dựa trên quyền
    if (pathname === '/dashboard' || pathname === '/') {
      if (role === 'teacher') {
        return NextResponse.redirect(new URL('/admin/ai-exam', request.url))
      }
      if (role === 'admin') {
        return NextResponse.redirect(new URL('/admin/questions', request.url))
      }
    }

    // Xử lý các route admin và teacher
    if (pathname.startsWith('/admin') || pathname.startsWith('/teacher')) {
      if (role === 'teacher') {
        // Giáo viên CHỈ được phép vào /admin/ai-exam
        if (pathname !== '/admin/ai-exam') {
          return NextResponse.redirect(new URL('/admin/ai-exam', request.url))
        }
      } else if (role !== 'admin') {
        // Nếu không phải admin và không phải teacher (vd user thường, bị khóa...)
        return NextResponse.redirect(new URL('/login', request.url))
      }
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
