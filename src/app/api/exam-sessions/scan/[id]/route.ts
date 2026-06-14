// src/app/api/exam-sessions/scan/[id]/route.ts
// GET, PUT, DELETE for a single scan exam session

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// ── GET: Chi tiết 1 bài thi + scan results ──
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: exam, error: examError } = await supabase
      .from('scan_exams')
      .select('*')
      .eq('id', id)
      .eq('teacher_id', user.id)
      .single()

    if (examError || !exam) {
      return NextResponse.json({ error: 'Không tìm thấy bài thi' }, { status: 404 })
    }

    // Get scan results for this exam
    const { data: results } = await supabase
      .from('scan_results')
      .select('*')
      .eq('scan_exam_id', id)
      .order('created_at', { ascending: false })

    return NextResponse.json({ exam, results: results || [] })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// ── PUT: Cập nhật bài thi ──
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

    // Only allow certain fields
    const allowed = ['name', 'mc_count', 'tf_count', 'sa_count', 'answer_keys', 'mc_total_score', 'tf_total_score', 'sa_total_score', 'status']
    for (const key of allowed) {
      if (key in body) updates[key] = body[key]
    }

    const { data, error } = await supabase
      .from('scan_exams')
      .update(updates)
      .eq('id', id)
      .eq('teacher_id', user.id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// ── DELETE: Xóa bài thi ──
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { error } = await supabase
      .from('scan_exams')
      .delete()
      .eq('id', id)
      .eq('teacher_id', user.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
