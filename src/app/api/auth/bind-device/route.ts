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

    // Lấy profile hiện tại (bao gồm các mảng mới)
    const { data: profile } = await supabaseAdmin
      .from('users')
      .select('role, is_approved, is_active, device_ids, active_sessions, device_info')
      .eq('id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'Không tìm thấy tài khoản.' }, { status: 404 })
    }

    // Kiểm tra tài khoản có bị khóa không
    if (profile.is_active === false) {
      await supabase.auth.signOut()
      return NextResponse.json({ error: 'Tài khoản của bạn đã bị khóa.' }, { status: 403 })
    }

    // Admin bypass hoàn toàn
    if (profile.role === 'admin') {
      return NextResponse.json({ success: true, message: 'Admin bypass.' })
    }

    // Chưa approved → từ chối
    if (!profile.is_approved) {
      return NextResponse.json({ error: 'Tài khoản chưa được kích hoạt.' }, { status: 403 })
    }

    const deviceIds: string[] = profile.device_ids || []

    // Nếu thiết bị chưa có trong danh sách
    if (!deviceIds.includes(device_id)) {
      if (deviceIds.length >= 2) {
        // Đã đủ 2 thiết bị -> từ chối
        await supabase.auth.signOut()
        return NextResponse.json({
          error: 'Tài khoản đã đạt giới hạn 2 thiết bị đăng nhập.\nVui lòng liên hệ admin để được hỗ trợ 0812022648',
          code: 'DEVICE_LIMIT_REACHED'
        }, { status: 403 })
      } else {
        // Thêm thiết bị mới vào danh sách
        const newDeviceIds = [...deviceIds, device_id]
        
        let existingInfo = profile.device_info || []
        if (!Array.isArray(existingInfo)) {
          existingInfo = Object.keys(existingInfo).length > 0 ? [existingInfo] : []
        }
        const newDeviceInfo = [...existingInfo, device_info || {}]

        await supabaseAdmin
          .from('users')
          .update({
            device_ids: newDeviceIds,
            device_bound_at: new Date().toISOString(),
            device_info: newDeviceInfo
          })
          .eq('id', user.id)
      }
    }

    // Cập nhật active_sessions (thêm session mới, giữ tối đa 2 sessions cuối)
    const session = await supabase.auth.getSession()
    const sessionId = session.data.session?.access_token?.slice(-20) || crypto.randomUUID()
    
    let activeSessions: string[] = profile.active_sessions || []
    if (!activeSessions.includes(sessionId)) {
      activeSessions.push(sessionId)
      // Nếu có quá 2 session đang active, xóa cái cũ nhất
      if (activeSessions.length > 2) {
        activeSessions = activeSessions.slice(-2)
      }
      await supabaseAdmin
        .from('users')
        .update({ active_sessions: activeSessions })
        .eq('id', user.id)
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[bind-device] Error:', err)
    return NextResponse.json({ error: 'Lỗi hệ thống.' }, { status: 500 })
  }
}
