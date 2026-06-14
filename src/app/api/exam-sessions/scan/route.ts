// src/app/api/exam-sessions/scan/route.ts
// CRUD API for scan exam sessions (bài thi dùng để quét phiếu)

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// ── GET: Danh sách bài thi quét của giáo viên ──
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await supabase
      .from('scan_exams')
      .select('*, scan_results(count)')
      .eq('teacher_id', user.id)
      .order('created_at', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Transform: add scan_count
    const exams = (data || []).map((e: Record<string, unknown>) => ({
      ...e,
      scan_count: Array.isArray(e.scan_results) ? (e.scan_results[0] as Record<string, number>)?.count || 0 : 0,
      scan_results: undefined,
    }))

    return NextResponse.json({ data: exams })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// ── POST: Tạo bài thi mới ──
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const {
      name,
      mc_count = 12,
      tf_count = 4,
      sa_count = 6,
      answer_keys = {},
      mc_total_score = 3,
      tf_total_score = 4,
      sa_total_score = 3,
    } = body

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Tên bài thi không được để trống' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('scan_exams')
      .insert({
        teacher_id: user.id,
        name: name.trim(),
        mc_count,
        tf_count,
        sa_count,
        answer_keys,
        mc_total_score,
        tf_total_score,
        sa_total_score,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
