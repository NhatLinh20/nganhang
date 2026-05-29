// src/app/api/export-log/route.ts
// API kiểm tra quota xuất file + ghi log
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { TEACHER_LIMITS } from '@/lib/export-limiter'

/**
 * GET /api/export-log          — Kiểm tra quota xuất file hôm nay (chung)
 * GET /api/export-log?type=lesson — Kiểm tra quota bài học tháng này
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Lấy role
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    const role = profile?.role || 'teacher'

    // Admin và VIP không bị giới hạn
    if (role === 'admin' || role === 'vip') {
      return NextResponse.json({
        allowed: true,
        count: 0,
        limit: 999,
        remaining: 999,
      })
    }

    const type = request.nextUrl.searchParams.get('type')

    if (type === 'lesson') {
      // Kiểm tra bài học trong tháng này
      const now = new Date()
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

      const { count, error } = await supabase
        .from('export_logs')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('export_type', 'lesson')
        .gte('created_at', startOfMonth)

      if (error) {
        console.error('export-log GET lesson error:', error)
        return NextResponse.json({ allowed: false, count: 0, limit: TEACHER_LIMITS.MAX_LESSONS_PER_MONTH, remaining: 0, error: 'Database error: Bảng export_logs có thể chưa tồn tại. Vui lòng chạy file 003_vip_role_and_export_logs.sql trong Supabase.' })
      }

      const used = count || 0
      const limit = TEACHER_LIMITS.MAX_LESSONS_PER_MONTH
      const remaining = Math.max(0, limit - used)

      return NextResponse.json({
        allowed: remaining > 0,
        count: used,
        limit,
        remaining,
        message: remaining <= 0 ? `Bạn đã hết lượt xuất bài học trong tháng này (${used}/${limit}). Nâng VIP để xuất không giới hạn.` : undefined,
      })
    }

    // Mặc định: kiểm tra xuất file hôm nay (chung tất cả trang)
    const now = new Date()
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()

    const { count, error } = await supabase
      .from('export_logs')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', startOfDay)

    if (error) {
      console.error('export-log GET error:', error)
      return NextResponse.json({ allowed: false, count: 0, limit: TEACHER_LIMITS.MAX_EXPORTS_PER_DAY, remaining: 0, error: 'Database error: Bảng export_logs có thể chưa tồn tại. Vui lòng chạy file 003_vip_role_and_export_logs.sql trong Supabase.' })
    }

    const used = count || 0
    const limit = TEACHER_LIMITS.MAX_EXPORTS_PER_DAY
    const remaining = Math.max(0, limit - used)

    return NextResponse.json({
      allowed: remaining > 0,
      count: used,
      limit,
      remaining,
      message: remaining <= 0 ? `Bạn đã hết lượt xuất file hôm nay (${used}/${limit}). Nâng VIP để xuất không giới hạn. Liên hệ Admin: ${TEACHER_LIMITS.ADMIN_PHONE}` : undefined,
    })

  } catch (err) {
    console.error('export-log GET exception:', err)
    return NextResponse.json({ allowed: true, count: 0, limit: 999, remaining: 999 })
  }
}

/**
 * POST /api/export-log — Ghi log 1 lần xuất file
 * Body: { export_type: string, page_source: string }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { export_type, page_source } = body

    if (!export_type || !page_source) {
      return NextResponse.json({ error: 'Missing export_type or page_source' }, { status: 400 })
    }

    // Ghi log
    const { error } = await supabase
      .from('export_logs')
      .insert({
        user_id: user.id,
        export_type,
        page_source,
      })

    if (error) {
      console.error('export-log POST error:', error)
      return NextResponse.json({ error: 'Không thể ghi log xuất file' }, { status: 500 })
    }

    return NextResponse.json({ success: true })

  } catch (err) {
    console.error('export-log POST exception:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
