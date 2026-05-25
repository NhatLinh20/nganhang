// src/app/api/auth/callback/route.ts
// Xử lý OAuth callback (Google login) từ Supabase

import { createServerClient } from '@supabase/ssr'
import { logLoginInternal } from '@/lib/auth-logger'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  // Ưu tiên dùng NEXT_PUBLIC_SITE_URL để tránh x-forwarded-host sai lệch trên Vercel
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
  const origin = siteUrl ? siteUrl.replace(/\/$/, '') : request.nextUrl.origin

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`)
  }

  // 1. Tạo sẵn response thành công (sẽ chỉnh sửa nếu có lỗi)
  let response = NextResponse.redirect(`${origin}${next}`)

  // 2. Tạo inline Supabase client ghi TRỰC TIẾP cookie vào response này
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
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  // Exchange code → session
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    console.error('[OAuth Callback] Exchange code error:', error.message)
    return NextResponse.redirect(`${origin}/login?error=auth_failed`)
  }

  const user = data.user

  // Admin client để thao tác DB không cần RLS
  const supabaseAdmin = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() { return [] },
        setAll() {}
      }
    }
  )

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
    const sessionId = data.session?.access_token?.slice(-20) || crypto.randomUUID()
    await supabaseAdmin.from('users').update({ active_session_id: sessionId }).eq('id', user.id)
    
    // Ghi đè response thành redirect pending (giữ nguyên cookies đã set)
    const pendingResponse = NextResponse.redirect(`${origin}/pending`)
    response.cookies.getAll().forEach(c => pendingResponse.cookies.set(c.name, c.value))
    return pendingResponse
  }

  // Cập nhật active_session_id
  const sessionId = data.session?.access_token?.slice(-20) || crypto.randomUUID()
  await supabaseAdmin
    .from('users')
    .update({ active_session_id: sessionId })
    .eq('id', user.id)

  // Ghi log đăng nhập
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || '127.0.0.1'
  const userAgent = request.headers.get('user-agent') || 'unknown'
  logLoginInternal(user.id, ip, userAgent).catch(() => {})

  return response
}
