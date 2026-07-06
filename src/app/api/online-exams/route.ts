// src/app/api/online-exams/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET: Lấy danh sách đề thi online của giáo viên hiện tại
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await supabase
      .from('online_exams')
      .select('id, title, description, grade, duration_minutes, total_questions, is_published, access_code, scoring_config, variant_count, created_at, updated_at')
      .eq('created_by', user.id)
      .order('created_at', { ascending: false })

    if (error) throw error

    // Đếm số bài nộp cho mỗi đề
    const examIds = (data || []).map(e => e.id)
    const counts: Record<string, number> = {}

    if (examIds.length > 0) {
      const { data: submissions } = await supabase
        .from('online_exam_submissions')
        .select('exam_id')
        .in('exam_id', examIds)

      if (submissions) {
        for (const s of submissions) {
          counts[s.exam_id] = (counts[s.exam_id] || 0) + 1
        }
      }
    }

    const examsWithCounts = (data || []).map(e => ({
      ...e,
      submission_count: counts[e.id] || 0
    }))

    return NextResponse.json(examsWithCounts)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

function generateAccessCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}

// POST: Tạo đề thi online mới
// Body: { title, description, grade, duration_minutes, questions_data, image_map, scoring_config, correct_answers }
// Multi-variant: { ..., variants: [{ questions_data, image_map, correct_answers }], variant_count }
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { title, description, grade, duration_minutes, scoring_config } = body

    // Multi-variant mode: variants[] array provided
    const variants = body.variants as Array<{ questions_data: any[]; image_map: Record<string, string>; correct_answers: Record<string, string> }> | undefined
    // Legacy single mode
    const questions_data = body.questions_data
    const image_map = body.image_map
    const correct_answers = body.correct_answers

    const isMultiVariant = variants && variants.length > 0
    const variantCount = isMultiVariant ? variants.length : 1
    const totalQuestions = isMultiVariant ? variants[0].questions_data.length : (questions_data?.length || 0)

    if (!title || (isMultiVariant ? variants[0].questions_data.length === 0 : !questions_data || questions_data.length === 0)) {
      return NextResponse.json({ error: 'Thiếu thông tin bắt buộc' }, { status: 400 })
    }

    const code = generateAccessCode()

    // correct_answers: nếu multi-variant thì lưu dạng mảng, single thì lưu object
    const correctAnswersToSave = isMultiVariant
      ? variants.map(v => v.correct_answers)
      : (correct_answers || {})

    // 1. Tạo record metadata trên Supabase (nhẹ)
    const { data: exam, error } = await supabase
      .from('online_exams')
      .insert({
        title,
        description: description || null,
        grade: grade || null,
        duration_minutes: duration_minutes || null,
        total_questions: totalQuestions,
        scoring_config: scoring_config || {},
        correct_answers: correctAnswersToSave,
        variant_count: variantCount,
        is_published: false,
        access_code: code,
        created_by: user.id,
      })
      .select()
      .single()

    if (error) throw error

    // 2. Lưu nội dung đề thi (nặng) lên VPS
    const vpsUrl = process.env.NEXT_PUBLIC_VPS_URL || process.env.NEXT_PUBLIC_TIKZ_API_URL || 'http://42.96.15.5:3001'
    const vpsPayload = isMultiVariant
      ? {
          examId: exam.id,
          data: {
            variants: variants.map(v => ({
              questions_data: v.questions_data,
              image_map: v.image_map || {}
            }))
          }
        }
      : {
          examId: exam.id,
          data: { questions_data, image_map: image_map || {} }
        }

    const vpsRes = await fetch(`${vpsUrl}/api/exams`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(vpsPayload)
    })

    if (!vpsRes.ok) {
      // Rollback: xóa record Supabase nếu VPS lỗi
      await supabase.from('online_exams').delete().eq('id', exam.id)
      throw new Error('Không thể lưu đề thi lên VPS')
    }

    return NextResponse.json(exam)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
