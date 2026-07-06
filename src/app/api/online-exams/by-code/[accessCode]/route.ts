// src/app/api/online-exams/by-code/[accessCode]/route.ts
// Lấy đề thi theo mã truy cập — Dành cho học sinh (public, không cần auth)
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request, { params }: { params: Promise<{ accessCode: string }> }) {
  try {
    const { accessCode } = await params
    const supabase = await createClient()

    // 1. Lấy metadata từ Supabase
    const { data: exam, error } = await supabase
      .from('online_exams')
      .select('id, title, description, grade, duration_minutes, total_questions, scoring_config, access_code, variant_count')
      .eq('access_code', accessCode.toUpperCase())
      .eq('is_published', true)
      .single()

    if (error || !exam) {
      return NextResponse.json({ error: 'Mã đề thi không hợp lệ hoặc đề chưa được xuất bản' }, { status: 404 })
    }

    // 2. Lấy nội dung đề từ VPS (questions + images)
    const vpsUrl = process.env.NEXT_PUBLIC_VPS_URL || process.env.NEXT_PUBLIC_TIKZ_API_URL || 'http://42.96.15.5:3001'
    const vpsRes = await fetch(`${vpsUrl}/api/exams/${exam.id}`)

    if (!vpsRes.ok) {
      return NextResponse.json({ error: 'Không thể tải nội dung đề thi' }, { status: 500 })
    }

    const vpsData = await vpsRes.json()

    // 3. Xác định variant (đề) cho học sinh
    const variantCount = exam.variant_count || 1
    let questionsRaw: any[]
    let imageMapRaw: Record<string, string>
    let variantIndex = 0

    if (vpsData.variants && Array.isArray(vpsData.variants) && vpsData.variants.length > 1) {
      // Multi-variant: chọn ngẫu nhiên
      variantIndex = Math.floor(Math.random() * vpsData.variants.length)
      const variant = vpsData.variants[variantIndex]
      questionsRaw = variant.questions_data || []
      imageMapRaw = variant.image_map || {}
    } else {
      // Single variant (legacy)
      questionsRaw = vpsData.questions_data || []
      imageMapRaw = vpsData.image_map || {}
      variantIndex = 0
    }

    // 4. Lọc bỏ đáp án — KHÔNG gửi correctAnswer, solutionSegments cho học sinh
    const safeQuestions = questionsRaw.map((q: Record<string, unknown>) => {
      const { solutionSegments, ...rest } = q
      // Xóa correctAnswer khỏi choices
      if (rest.choices && Array.isArray(rest.choices)) {
        rest.choices = (rest.choices as Array<Record<string, unknown>>).map(c => {
          const { isCorrect, ...choiceRest } = c
          return choiceRest
        })
      }
      // Xóa isTrue khỏi tfStatements
      if (rest.tfStatements && Array.isArray(rest.tfStatements)) {
        rest.tfStatements = (rest.tfStatements as Array<Record<string, unknown>>).map(s => {
          const { isTrue, ...stmtRest } = s
          return stmtRest
        })
      }
      // Xóa shortAnswer
      const { shortAnswer, ...finalQ } = rest
      return finalQ
    })

    return NextResponse.json({
      id: exam.id,
      title: exam.title,
      description: exam.description,
      grade: exam.grade,
      duration_minutes: exam.duration_minutes,
      total_questions: exam.total_questions,
      scoring_config: exam.scoring_config,
      questions_data: safeQuestions,
      image_map: imageMapRaw,
      variant_index: variantIndex,
      variant_label: variantCount > 1 ? `Đề ${variantIndex + 1}` : null,
      variant_count: variantCount,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
