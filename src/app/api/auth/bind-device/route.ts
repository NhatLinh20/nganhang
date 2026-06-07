// src/app/api/auth/bind-device/route.ts
// API endpoint xử lý device binding sau Google OAuth login

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Chưa đăng nhập.' }, { status: 401 })
    }

    const body = await request.json()
    const { device_id, device_info } = body

    if (!device_id) {
      return NextResponse.json({ error: 'Thiếu device_id.' }, { status: 400 })
    }

    const supabaseAdmin = createAdminClient()

    // Lấy profile hiện tại
    const { data: profile } = await supabaseAdmin
      .from('users')
      .select('role, is_approved, device_id')
      .eq('id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'Không tìm thấy tài khoản.' }, { status: 404 })
    }

    // Admin bypass hoàn toàn
    if (profile.role === 'admin') {
      return NextResponse.json({ success: true, message: 'Admin bypass.' })
    }

    // Chưa approved → từ chối
    if (!profile.is_approved) {
      return NextResponse.json({ error: 'Tài khoản chưa được kích hoạt.' }, { status: 403 })
    }

    const existingDeviceId = profile.device_id

    // Đã có device_id và KHÔNG khớp → từ chối
    if (existingDeviceId && existingDeviceId !== device_id) {
      // Đăng xuất user
      await supabase.auth.signOut()
      return NextResponse.json({
        error: 'Tài khoản đã được liên kết với một thiết bị khác. Vui lòng liên hệ Admin để được hỗ trợ.',
        code: 'DEVICE_MISMATCH'
      }, { status: 403 })
    }

    // Chưa có device_id → gắn kết lần đầu
    if (!existingDeviceId) {
      await supabaseAdmin
        .from('users')
        .update({
          device_id,
          device_bound_at: new Date().toISOString(),
          device_info: device_info || {},
        })
        .eq('id', user.id)
    }

    // Cập nhật active_session_id
    const session = await supabase.auth.getSession()
    const sessionId = session.data.session?.access_token?.slice(-20) || crypto.randomUUID()
    await supabaseAdmin
      .from('users')
      .update({ active_session_id: sessionId })
      .eq('id', user.id)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[bind-device] Error:', err)
    return NextResponse.json({ error: 'Lỗi hệ thống.' }, { status: 500 })
  }
}
