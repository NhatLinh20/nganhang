// src/app/actions/auth.ts
// Server Actions xử lý toàn bộ logic xác thực (Authentication)
'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/server'
import { logLoginInternal } from '@/lib/auth-logger'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'

// ═══════════════════════════════════════════════════
// ĐĂNG NHẬP bằng Email & Mật khẩu
// ═══════════════════════════════════════════════════
export async function login(formData: FormData): Promise<{ error?: string }> {
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  if (!email || !password) {
    return { error: 'Vui lòng nhập email và mật khẩu.' }
  }

  const supabase = await createClient()

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    return { error: 'Email hoặc mật khẩu không đúng.' }
  }

  const user = data.user

  // Kiểm tra is_approved từ bảng users (và auto-sync nếu thiếu)
  const supabaseAdmin = createAdminClient()
  let { data: profile } = await supabaseAdmin
    .from('users')
    .select('role, is_approved')
    .eq('id', user.id)
    .single()

  if (!profile) {
    const newRole = user.user_metadata?.role || 'teacher'
    const newApproved = newRole === 'admin'
    
    const { data: newProfile } = await supabaseAdmin
      .from('users')
      .insert({
        id: user.id,
        email: user.email,
        full_name: user.user_metadata?.full_name || 'Người dùng',
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
    // Đăng xuất trước khi reject
    await supabase.auth.signOut()
    return {
      error: 'Tài khoản chưa được kích hoạt. Vui lòng liên hệ Zalo: 0812878792 để được hỗ trợ.',
    }
  }

  // Cập nhật active_session_id (ngăn đăng nhập đồng thời)
  const sessionId = data.session?.access_token?.slice(-20) || crypto.randomUUID()
  await supabaseAdmin
    .from('users')
    .update({ active_session_id: sessionId })
    .eq('id', user.id)

  // Ghi log đăng nhập (async, không block)
  const headersList = await headers()
  const ip = headersList.get('x-forwarded-for')?.split(',')[0]?.trim()
    || headersList.get('x-real-ip')
    || '127.0.0.1'
  const userAgent = headersList.get('user-agent') || 'unknown'

  // Fire and forget — không chờ kết quả
  logLoginInternal(user.id, ip, userAgent).catch(() => {})

  redirect('/dashboard')
}

// ═══════════════════════════════════════════════════
// ĐĂNG NHẬP bằng Google OAuth
// ═══════════════════════════════════════════════════
export async function loginWithGoogle(): Promise<{ error?: string; url?: string }> {
  const supabase = await createClient()

  // Lấy origin (host) linh hoạt để hỗ trợ cả localhost và vercel
  const headersList = await headers()
  const host = headersList.get('host') || 'localhost:3000'
  const protocol = headersList.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https')
  const origin = `${protocol}://${host}`

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${origin}/api/auth/callback`,
    },
  })

  if (error) {
    return { error: 'Không thể đăng nhập bằng Google. Vui lòng thử lại.' }
  }

  if (data.url) {
    redirect(data.url)
  }

  return { error: 'Đã xảy ra lỗi không xác định.' }
}

// ═══════════════════════════════════════════════════
// ĐĂNG KÝ tài khoản mới (mặc định role = teacher)
// ═══════════════════════════════════════════════════
export async function register(formData: FormData): Promise<{ error?: string }> {
  const fullName = formData.get('fullName') as string
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const confirmPassword = formData.get('confirmPassword') as string

  // Validation
  if (!fullName || !email || !password) {
    return { error: 'Vui lòng điền đầy đủ thông tin.' }
  }

  if (fullName.length < 2) {
    return { error: 'Họ tên phải có ít nhất 2 ký tự.' }
  }

  if (password.length < 6) {
    return { error: 'Mật khẩu phải có ít nhất 6 ký tự.' }
  }

  if (password !== confirmPassword) {
    return { error: 'Mật khẩu xác nhận không khớp.' }
  }

  const supabase = await createClient()

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        role: 'teacher', // Mặc định là giáo viên
      },
    },
  })

  if (error) {
    if (error.message.includes('already registered')) {
      return { error: 'Email này đã được đăng ký.' }
    }
    return { error: 'Đăng ký thất bại. Vui lòng thử lại.' }
  }

  redirect('/pending')
}

// ═══════════════════════════════════════════════════
// ĐĂNG XUẤT
// ═══════════════════════════════════════════════════
export async function logout(): Promise<void> {
  const supabase = await createClient()

  // Xóa active_session_id
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    const supabaseAdmin = createAdminClient()
    await supabaseAdmin
      .from('users')
      .update({ active_session_id: null })
      .eq('id', user.id)
  }

  await supabase.auth.signOut()
  redirect('/login')
}

// ═══════════════════════════════════════════════════
// QUÊN MẬT KHẨU — gửi email reset
// ═══════════════════════════════════════════════════
export async function resetPassword(formData: FormData): Promise<{ error?: string; success?: boolean }> {
  const email = formData.get('email') as string

  if (!email) {
    return { error: 'Vui lòng nhập email.' }
  }

  const supabase = await createClient()

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/login`,
  })

  if (error) {
    return { error: 'Không thể gửi email reset. Vui lòng thử lại.' }
  }

  return { success: true }
}
