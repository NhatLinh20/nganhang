// src/proxy.ts
// Bảo vệ routes theo role, kiểm tra is_approved, refresh session

import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
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
  const publicRoutes = ['/', '/login', '/register', '/forgot-password']
  const isPublicRoute = publicRoutes.some(r => pathname === r || pathname.startsWith('/api/auth'))

  // Chưa đăng nhập → redirect về login
  if (!user && !isPublicRoute) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Đã đăng nhập
  if (user) {
    // Không cần vào login/register/forgot-password nữa
    if (pathname === '/login' || pathname === '/register' || pathname === '/forgot-password') {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }

    // Truy vấn bảng users lấy role và is_approved
    const { data: profile } = await supabase
      .from('users')
      .select('role, is_approved')
      .eq('id', user.id)
      .single()
      
    // Tránh lỗi khi mới đăng ký chưa kịp tạo profile
    const role = profile?.role || user.user_metadata?.role || ''
    const isApproved = profile?.is_approved || role === 'admin' // Admin auto approve

    // Cho phép trang select-role (chọn vai trò sau Google OAuth)
    if (pathname === '/select-role') {
      // Nếu user đã chủ động chọn role (có trong metadata) hoặc là admin → không cần chọn nữa
      if (user.user_metadata?.role || profile?.role === 'admin') {
        return NextResponse.redirect(new URL('/dashboard', request.url))
      }
      return supabaseResponse
    }

    // Cho phép trang device-check (xác minh thiết bị sau OAuth)
    if (pathname === '/device-check') {
      return supabaseResponse
    }

    // Kiểm tra teacher/student chưa approved
    if ((role === 'teacher' || role === 'student') && !isApproved) {
      if (pathname !== '/pending' && !pathname.startsWith('/api/auth')) {
        return NextResponse.redirect(new URL('/pending', request.url))
      }
      return supabaseResponse
    }

    // Nếu đã approved mà đang ở /pending → về dashboard
    if (pathname === '/pending' && isApproved) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }

    // Nếu vào trang dashboard thì điều hướng dựa trên quyền
    if (pathname === '/dashboard' || pathname === '/') {
      if (role === 'teacher') {
        return NextResponse.redirect(new URL('/admin/ai-exam', request.url))
      }
      if (role === 'student') {
        return NextResponse.redirect(new URL('/student/courses', request.url))
      }
      if (role === 'admin') {
        return NextResponse.redirect(new URL('/admin/questions', request.url))
      }
    }

    // Xử lý các route admin và teacher
    if (pathname.startsWith('/admin') || pathname.startsWith('/teacher')) {
      if (role === 'teacher') {
        // Giáo viên được phép vào /teacher/*, /admin/ai-exam, /admin/questions, /admin/lesson-builder, /admin/ai-chat
        if (!pathname.startsWith('/teacher') && pathname !== '/admin/ai-exam' && pathname !== '/admin/questions' && pathname !== '/admin/lesson-builder' && pathname !== '/admin/ai-chat') {
          return NextResponse.redirect(new URL('/admin/questions', request.url))
        }
      } else if (role === 'student') {
        // Student KHÔNG được vào admin hay teacher
        return NextResponse.redirect(new URL('/student/courses', request.url))
      } else if (role !== 'admin') {
        // Nếu không phải admin
        return NextResponse.redirect(new URL('/login', request.url))
      }
    }

    // Xử lý route student
    if (pathname.startsWith('/student')) {
      if (role === 'teacher') {
        // Teacher không vào khu vực student
        return NextResponse.redirect(new URL('/admin/ai-exam', request.url))
      }
      // Admin và student đều được vào
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
