// src/app/api/online-exams/[examId]/submit/route.ts
// Học sinh nộp bài → Chấm tự động → Lưu kết quả
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request, { params }: { params: Promise<{ examId: string }> }) {
  try {
    const { examId } = await params
    const body = await request.json()
    const { student_name, student_code, answers, started_at, time_spent_seconds, variant_index: rawVariantIndex } = body

    if (!student_name || !student_code) {
      return NextResponse.json({ error: 'Thiếu họ tên hoặc số báo danh' }, { status: 400 })
    }

    const variantIndex = rawVariantIndex ?? 0

    const supabase = await createClient()

    // 1. Lấy đề thi (metadata + đáp án)
    const { data: exam, error: examErr } = await supabase
      .from('online_exams')
      .select('id, total_questions, scoring_config, correct_answers, variant_count')
      .eq('id', examId)
      .eq('is_published', true)
      .single()

    if (examErr || !exam) {
      return NextResponse.json({ error: 'Đề thi không tồn tại hoặc chưa xuất bản' }, { status: 404 })
    }

    // 2. Lấy nội dung đề từ VPS (để biết loại câu hỏi)
    const vpsUrl = process.env.NEXT_PUBLIC_VPS_URL || process.env.NEXT_PUBLIC_TIKZ_API_URL || 'http://42.96.15.5:3001'
    const vpsRes = await fetch(`${vpsUrl}/api/exams/${examId}`)
    if (!vpsRes.ok) throw new Error('Không thể tải đề thi từ VPS')
    const vpsData = await vpsRes.json()

    // Xác định questions_data và correct_answers cho variant này
    let questionsData: any[]
    let correctAnswers: Record<string, string>

    if (vpsData.variants && Array.isArray(vpsData.variants) && vpsData.variants.length > 1) {
      // Multi-variant mode
      const vi = Math.min(variantIndex, vpsData.variants.length - 1)
      questionsData = vpsData.variants[vi]?.questions_data || []
      // correct_answers là mảng (mỗi phần tử cho 1 variant)
      const correctArr = exam.correct_answers as Record<string, string>[] | Record<string, string>
      correctAnswers = Array.isArray(correctArr) ? (correctArr[vi] || {}) : (correctArr || {})
    } else {
      // Single variant (legacy)
      questionsData = vpsData.questions_data || []
      const correctArr = exam.correct_answers
      correctAnswers = (Array.isArray(correctArr) ? correctArr[0] : correctArr) as Record<string, string> || {}
    }

    const config = exam.scoring_config as Record<string, number>

    // 3. Chấm bài
    const detailResults: Array<{
      index: number
      type: string
      student_answer: unknown
      correct_answer: unknown
      is_correct: boolean
      score_earned: number
      max_score: number
      tf_correct_count?: number
      tf_total?: number
    }> = []

    let totalScore = 0

    for (let i = 0; i < questionsData.length; i++) {
      const q = questionsData[i]
      const qType = q.questionType as string
      const studentAns = answers?.[String(i)]
      const correctAns = correctAnswers[String(i)]

      let scorePerQ = 0
      if (qType === 'multiple_choice') scorePerQ = config.mc_score_each || 0
      else if (qType === 'true_false') scorePerQ = config.tf_score_each || 0
      else if (qType === 'short_answer') scorePerQ = config.sa_score_each || 0
      else if (qType === 'essay') scorePerQ = config.essay_score_each || 0

      let isCorrect = false
      let scoreEarned = 0

      if (qType === 'multiple_choice') {
        isCorrect = studentAns === correctAns
        scoreEarned = isCorrect ? scorePerQ : 0
      } else if (qType === 'true_false') {
        // TF: so sánh từng mệnh đề (a, b, c, d)
        const correctTF = correctAns || ''
        const studentTF = studentAns || {}
        let tfCorrectCount = 0
        let tfTotal = 0
        const labels = ['a', 'b', 'c', 'd']
        for (let j = 0; j < correctTF.length; j++) {
          tfTotal++
          const correctVal = correctTF[j] === 'Đ' ? 'Đ' : 'S'
          const studentVal = typeof studentTF === 'object' ? (studentTF as Record<string, string>)[labels[j]] : ''
          if (studentVal === correctVal) tfCorrectCount++
        }
        // Tính điểm: theo tỷ lệ của Bộ GD (1 đúng: 0.1, 2 đúng: 0.25, 3 đúng: 0.5, 4 đúng: 1.0)
        let scoreRatio = 0
        if (tfCorrectCount === 1) scoreRatio = 0.1
        else if (tfCorrectCount === 2) scoreRatio = 0.25
        else if (tfCorrectCount === 3) scoreRatio = 0.5
        else if (tfCorrectCount >= 4) scoreRatio = 1.0

        isCorrect = tfCorrectCount === tfTotal && tfTotal > 0
        scoreEarned = scoreRatio * scorePerQ

        detailResults.push({
          index: i, type: qType,
          student_answer: studentAns || null, correct_answer: correctAns || null,
          is_correct: isCorrect, score_earned: scoreEarned, max_score: scorePerQ,
          tf_correct_count: tfCorrectCount, tf_total: tfTotal,
        })
        totalScore += scoreEarned
        continue
      } else if (qType === 'short_answer') {
        const sNorm = String(studentAns || '').trim().replace(/\s+/g, '').toLowerCase()
        const cNorm = String(correctAns || '').trim().replace(/\s+/g, '').toLowerCase()
        isCorrect = sNorm === cNorm && sNorm !== ''
        scoreEarned = isCorrect ? scorePerQ : 0
      } else if (qType === 'essay') {
        isCorrect = false
        scoreEarned = 0
      }

      totalScore += scoreEarned

      detailResults.push({
        index: i, type: qType,
        student_answer: studentAns || null, correct_answer: correctAns || null,
        is_correct: isCorrect, score_earned: scoreEarned, max_score: scorePerQ,
      })
    }

    // 4. Lưu kết quả
    const { data: submission, error: subErr } = await supabase
      .from('online_exam_submissions')
      .insert({
        exam_id: examId,
        student_name,
        student_code,
        answers: answers || {},
        score: Math.round(totalScore * 100) / 100,
        detail_results: detailResults,
        started_at: started_at || new Date().toISOString(),
        submitted_at: new Date().toISOString(),
        time_spent_seconds: time_spent_seconds || 0,
        variant_index: variantIndex,
      })
      .select()
      .single()

    if (subErr) throw subErr

    return NextResponse.json({
      submission_id: submission.id,
      score: submission.score,
      total_score: config.total_score || 10,
      detail_results: detailResults
    })
  } catch (error: any) {
    console.error('Submit exam error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
