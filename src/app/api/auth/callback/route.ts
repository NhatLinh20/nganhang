// src/app/api/auth/callback/route.ts
// Xử lý OAuth callback (Google login) từ Supabase

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/server'
import { logLoginInternal } from '@/lib/auth-logger'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`)
  }

  const supabase = await createClient()

  // Exchange code → session
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    console.error('[OAuth Callback] Exchange code error:', error.message)
    return NextResponse.redirect(`${origin}/login?error=auth_failed`)
  }

  const user = data.user

  // Kiểm tra is_approved cho teacher (và auto-sync nếu thiếu profile do lỗi trigger)
  const supabaseAdmin = createAdminClient()
  let { data: profile } = await supabaseAdmin
    .from('users')
    .select('role, is_approved')
    .eq('id', user.id)
    .single()

  if (!profile) {
    // Tự động tạo profile nếu chưa có (ví dụ: đăng nhập Google trước khi có trigger)
    const newRole = user.user_metadata?.role || 'teacher'
    const newApproved = newRole === 'admin'
    
    const { data: newProfile } = await supabaseAdmin
      .from('users')
      .insert({
        id: user.id,
        email: user.email,
        full_name: user.user_metadata?.full_name || user.user_metadata?.name || 'Người dùng',
        role: newRole,
        is_approved: newApproved,
      })
      .select('role, is_approved')
      .single()
      
    if (newProfile) {
      profile = newProfile
    }
  }

  if (profile?.role === 'teacher' && !profile?.is_approved) {
    // Teacher chưa được duyệt → đẩy về pending
    return NextResponse.redirect(`${origin}/pending`)
  }

  // Cập nhật active_session_id
  const sessionId = data.session?.access_token?.slice(-20) || crypto.randomUUID()
  await supabaseAdmin
    .from('users')
    .update({ active_session_id: sessionId })
    .eq('id', user.id)

  // Ghi log đăng nhập
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || '127.0.0.1'
  const userAgent = request.headers.get('user-agent') || 'unknown'
  logLoginInternal(user.id, ip, userAgent).catch(() => {})

  const response = NextResponse.redirect(`${origin}${next}`)
  
  // Đảm bảo cookies được gắn vào response (Next.js 15 Route Handler fix)
  const { cookies } = await import('next/headers')
  const cookieStore = await cookies()
  const allCookies = cookieStore.getAll()
  for (const cookie of allCookies) {
    response.cookies.set(cookie.name, cookie.value)
  }

  return response
}
