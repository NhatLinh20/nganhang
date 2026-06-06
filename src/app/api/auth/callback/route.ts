// src/app/api/auth/callback/route.ts
// Xử lý OAuth callback (Google login) từ Supabase
// Dùng HTML response thay vì redirect để đảm bảo cookies được set trên Vercel

import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const code = searchParams.get('code')

  // Xác định origin chính xác trên Vercel
  const forwardedHost = request.headers.get('x-forwarded-host')
  const forwardedProto = request.headers.get('x-forwarded-proto') || 'https'
  const host = request.headers.get('host')

  let origin: string
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    origin = process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '')
  } else if (forwardedHost) {
    origin = `${forwardedProto}://${forwardedHost}`
  } else if (host) {
    const proto = host.includes('localhost') ? 'http' : 'https'
    origin = `${proto}://${host}`
  } else {
    origin = request.nextUrl.origin
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`)
  }

  // Thu thập cookies mà Supabase cần set
  const cookiesToSet: Array<{ name: string; value: string; options: any }> = []

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookies) {
          cookies.forEach((cookie) => {
            // Cập nhật request cookies để các lần đọc tiếp theo nhất quán
            request.cookies.set(cookie.name, cookie.value)
            // Lưu lại để gắn vào response
            cookiesToSet.push(cookie)
          })
        },
      },
    }
  )

  // Exchange code → session
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    console.error('[OAuth Callback] Error:', error.message)
    return NextResponse.redirect(`${origin}/login?error=auth_failed`)
  }

  // Kiểm tra user đã có profile trong bảng users chưa
  let redirectPath = '/dashboard'
  if (data?.user) {
    const { data: profile } = await supabase
      .from('users')
      .select('id, role, is_approved')
      .eq('id', data.user.id)
      .single()

    if (!profile || !data.user.user_metadata?.role) {
      // User mới từ Google OAuth (chưa có role trong metadata) → cần chọn vai trò
      redirectPath = '/select-role'
    } else if ((profile.role === 'teacher' || profile.role === 'student') && !profile.is_approved) {
      // User cũ (đã có role) nhưng chưa được duyệt
      redirectPath = '/pending'
    }
  }

  // QUAN TRỌNG: Trả về HTML 200 thay vì 307 redirect
  // Vercel/Next.js có thể drop Set-Cookie headers trên redirect responses
  // Response 200 + JavaScript redirect đảm bảo cookies luôn được browser lưu
  const redirectUrl = `${origin}${redirectPath}`
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta http-equiv="refresh" content="0;url=${redirectUrl}">
  <title>Đang đăng nhập...</title>
  <style>
    body { display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; font-family: system-ui, sans-serif; background: #f8fafc; color: #334155; }
    .loader { text-align: center; }
    .spinner { width: 40px; height: 40px; border: 4px solid #e2e8f0; border-top-color: #6366f1; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 16px; }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="loader">
    <div class="spinner"></div>
    <p>Đang đăng nhập...</p>
  </div>
  <script>window.location.replace("${redirectUrl}");</script>
</body>
</html>`

  const response = new NextResponse(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })

  // Gắn TẤT CẢ cookies vào response 200 — browser BẮT BUỘC phải xử lý
  for (const { name, value, options } of cookiesToSet) {
    response.cookies.set(name, value, options)
  }

  return response
}
