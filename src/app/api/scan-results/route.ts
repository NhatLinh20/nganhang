// src/app/api/scan-results/route.ts
// API endpoint để lưu và đọc kết quả quét phiếu trả lời trắc nghiệm

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// ── POST: Lưu kết quả quét ──
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      examCode,
      studentId,
      score,
      maxScore,
      mcCorrect,
      mcTotal,
      tfScore,
      tfMaxScore,
      saCorrect,
      saTotal,
      details,
      confidence,
      warnings,
      answers,
    } = body

    // Insert vào bảng scan_results
    const { data, error } = await supabase
      .from('scan_results')
      .insert({
        teacher_id: user.id,
        exam_code: examCode || null,
        student_id_number: studentId || null,
        score: score,
        max_score: maxScore,
        mc_correct: mcCorrect,
        mc_total: mcTotal,
        tf_score: tfScore,
        tf_max_score: tfMaxScore,
        sa_correct: saCorrect,
        sa_total: saTotal,
        details: details,
        confidence: confidence,
        warnings: warnings,
        answers: answers,
      })
      .select()
      .single()

    if (error) {
      console.error('Supabase insert error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (err) {
    console.error('API error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ── GET: Lấy danh sách kết quả quét ──
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = new URL(request.url)
    const examCode = url.searchParams.get('examCode')
    const limit = parseInt(url.searchParams.get('limit') || '50')

    let query = supabase
      .from('scan_results')
      .select('*')
      .eq('teacher_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (examCode) {
      query = query.eq('exam_code', examCode)
    }

    const { data, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (err) {
    console.error('API error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
