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
export async function login(formData: FormData): Promise<{ error?: string; success?: boolean }> {
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const deviceId = formData.get('device_id') as string
  const deviceInfoRaw = formData.get('device_info') as string

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
    .select('role, is_approved, is_active, device_ids, active_sessions, device_info')
    .eq('id', user.id)
    .single()

  if (!profile) {
    const newRole = user.user_metadata?.role || 'teacher'
    const validRole = (newRole === 'teacher' || newRole === 'student') ? newRole : 'teacher'
    const newApproved = validRole === 'admin'
    
    const { data: newProfile } = await supabaseAdmin
      .from('users')
      .insert({
        id: user.id,
        email: user.email,
        full_name: user.user_metadata?.full_name || 'Người dùng',
        role: validRole,
        is_approved: newApproved,
        is_active: true,
      })
      .select('role, is_approved, is_active, device_ids, active_sessions, device_info')
      .single()
      
    if (newProfile) {
      profile = newProfile
    }
  }

  // Teacher hoặc Student chưa approved → từ chối
  if ((profile?.role === 'teacher' || profile?.role === 'student') && !profile?.is_approved) {
    // Đăng xuất trước khi reject
    await supabase.auth.signOut()
    return {
      error: 'Tài khoản chưa được kích hoạt. Vui lòng liên hệ Admin: 0812022648 để được hỗ trợ.',
    }
  }

  // Kiểm tra tài khoản có bị khóa không
  if (profile?.is_active === false) {
    await supabase.auth.signOut()
    return {
      error: 'Tài khoản của bạn đã bị khóa. Vui lòng liên hệ Admin để biết thêm chi tiết.',
    }
  }

  // ★ DEVICE BINDING CHECK ★
  // Admin bypass hoàn toàn — không kiểm tra thiết bị
  if (profile?.role !== 'admin' && deviceId) {
    const deviceIds: string[] = profile?.device_ids || []

    if (!deviceIds.includes(deviceId)) {
      if (deviceIds.length >= 2) {
        // Đã đủ 2 thiết bị -> từ chối đăng nhập
        await supabase.auth.signOut()
        return {
          error: 'Tài khoản đã đạt giới hạn 2 thiết bị đăng nhập.\nVui lòng liên hệ admin để được hỗ trợ 0812022648',
        }
      } else {
        // Gắn kết thiết bị mới
        let deviceInfo = {}
        try {
          if (deviceInfoRaw) deviceInfo = JSON.parse(deviceInfoRaw)
        } catch { /* ignore */ }

        const newDeviceIds = [...deviceIds, deviceId]
        
        let existingInfo = profile?.device_info || []
        if (!Array.isArray(existingInfo)) {
          existingInfo = Object.keys(existingInfo).length > 0 ? [existingInfo] : []
        }
        const newDeviceInfo = [...existingInfo, deviceInfo]

        await supabaseAdmin
          .from('users')
          .update({
            device_ids: newDeviceIds,
            device_bound_at: new Date().toISOString(),
            device_info: newDeviceInfo,
          })
          .eq('id', user.id)
      }
    }
  }

  // Cập nhật active_sessions (ngăn đăng nhập đồng thời trên 3+ thiết bị)
  const sessionId = data.session?.access_token?.slice(-20) || crypto.randomUUID()
  let activeSessions: string[] = profile?.active_sessions || []
  if (!activeSessions.includes(sessionId)) {
    activeSessions.push(sessionId)
    if (activeSessions.length > 2) {
      activeSessions = activeSessions.slice(-2)
    }
    await supabaseAdmin
      .from('users')
      .update({ active_sessions: activeSessions })
      .eq('id', user.id)
  }

  // Ghi log đăng nhập (async, không block)
  const headersList = await headers()
  const ip = headersList.get('x-forwarded-for')?.split(',')[0]?.trim()
    || headersList.get('x-real-ip')
    || '127.0.0.1'
  const userAgent = headersList.get('user-agent') || 'unknown'

  // Fire and forget — không chờ kết quả
  logLoginInternal(user.id, ip, userAgent).catch(() => {})

  return { success: true }
}

// ═══════════════════════════════════════════════════
// ĐĂNG NHẬP bằng Google OAuth
// ═══════════════════════════════════════════════════
export async function loginWithGoogle(): Promise<{ error?: string; url?: string }> {
  const supabase = await createClient()

  // Lấy origin ưu tiên từ biến môi trường (Vercel)
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
  
  let origin = 'http://localhost:3000'
  if (siteUrl) {
    // Đảm bảo không có dấu slash ở cuối
    origin = siteUrl.replace(/\/$/, '')
  } else {
    const headersList = await headers()
    const host = headersList.get('host') || 'localhost:3000'
    const protocol = headersList.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https')
    origin = `${protocol}://${host}`
  }

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
// ĐĂNG KÝ tài khoản mới (cho phép chọn role: teacher hoặc student)
// ═══════════════════════════════════════════════════
export async function register(formData: FormData): Promise<{ error?: string }> {
  const fullName = formData.get('fullName') as string
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const confirmPassword = formData.get('confirmPassword') as string
  const selectedRole = formData.get('role') as string

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

  // Chỉ chấp nhận teacher hoặc student
  const role = (selectedRole === 'student') ? 'student' : 'teacher'

  const supabase = await createClient()

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        role: role,
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

  // Xóa session hiện tại khỏi mảng active_sessions
  const { data: { session } } = await supabase.auth.getSession()
  const { data: { user } } = await supabase.auth.getUser()
  if (user && session) {
    const sessionId = session.access_token?.slice(-20)
    if (sessionId) {
      const supabaseAdmin = createAdminClient()
      const { data: profile } = await supabaseAdmin
        .from('users')
        .select('active_sessions')
        .eq('id', user.id)
        .single()
      
      const currentSessions: string[] = profile?.active_sessions || []
      const newSessions = currentSessions.filter(s => s !== sessionId)
      
      await supabaseAdmin
        .from('users')
        .update({ active_sessions: newSessions })
        .eq('id', user.id)
    }
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
