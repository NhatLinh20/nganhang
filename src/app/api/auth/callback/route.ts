// src/app/api/auth/callback/route.ts
// Xử lý OAuth callback (Google login) từ Supabase
// Pattern chính thức từ Supabase docs cho Next.js App Router

import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'
  const origin = request.nextUrl.origin

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`)
  }

  // Tạo response trước — cookies sẽ được ghi trực tiếp vào đây
  const redirectUrl = `${origin}${next}`
  const response = NextResponse.redirect(redirectUrl)

  // Tạo Supabase client ghi cookie trực tiếp vào response object
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            // Ghi vào cả request (cho các lần đọc tiếp theo trong cùng request)
            request.cookies.set(name, value)
            // Ghi vào response (để trình duyệt nhận được cookie)
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  // Exchange code lấy session — đây là bước quan trọng nhất
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    console.error('[OAuth Callback] exchangeCodeForSession error:', error.message)
    return NextResponse.redirect(`${origin}/login?error=auth_failed`)
  }

  // Trả về response có chứa session cookies
  // Middleware sẽ tự xử lý logic role/approval khi user truy cập /dashboard
  return response
}
