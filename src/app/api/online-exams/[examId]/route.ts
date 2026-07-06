// src/app/api/online-exams/[examId]/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET: Chi tiết đề thi + danh sách bài nộp
export async function GET(request: Request, { params }: { params: Promise<{ examId: string }> }) {
  try {
    const { examId } = await params
    const supabase = await createClient()

    const { data: exam, error } = await supabase
      .from('online_exams')
      .select('*')
      .eq('id', examId)
      .single()

    if (error || !exam) return NextResponse.json({ error: 'Không tìm thấy đề thi' }, { status: 404 })

    // Lấy danh sách bài nộp
    const { data: submissions } = await supabase
      .from('online_exam_submissions')
      .select('*')
      .eq('exam_id', examId)
      .order('submitted_at', { ascending: false })

    return NextResponse.json({ exam, submissions: submissions || [] })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// PUT: Cập nhật đề thi (publish/unpublish, sửa thông tin)
export async function PUT(request: Request, { params }: { params: Promise<{ examId: string }> }) {
  try {
    const { examId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { title, description, grade, duration_minutes, is_published, scoring_config, questions_data, image_map, correct_answers, variants, variant_count } = body

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (title !== undefined) updateData.title = title
    if (description !== undefined) updateData.description = description
    if (grade !== undefined) updateData.grade = grade
    if (duration_minutes !== undefined) updateData.duration_minutes = duration_minutes
    if (is_published !== undefined) updateData.is_published = is_published
    if (scoring_config !== undefined) updateData.scoring_config = scoring_config
    if (variant_count !== undefined) updateData.variant_count = variant_count

    // Handle both single and multi-variant
    const isMultiVariant = variants && Array.isArray(variants) && variants.length > 0
    if (isMultiVariant) {
      updateData.total_questions = variants[0].questions_data.length
      updateData.correct_answers = variants.map((v: any) => v.correct_answers)
      updateData.variant_count = variants.length
    } else if (questions_data !== undefined) {
      updateData.total_questions = questions_data.length
    }
    if (correct_answers !== undefined && !isMultiVariant) updateData.correct_answers = correct_answers

    const { data, error } = await supabase
      .from('online_exams')
      .update(updateData)
      .eq('id', examId)
      .eq('created_by', user.id)
      .select()
      .single()

    if (error) throw error

    // Nếu có sửa nội dung đề (questions_data or variants)
    if (questions_data || isMultiVariant) {
      // 1. Lưu JSON lên VPS
      const vpsUrl = process.env.NEXT_PUBLIC_VPS_URL || process.env.NEXT_PUBLIC_TIKZ_API_URL || 'http://42.96.15.5:3001'
      const vpsPayload = isMultiVariant
        ? {
            examId,
            data: {
              variants: variants.map((v: any) => ({
                questions_data: v.questions_data,
                image_map: v.image_map || {}
              }))
            }
          }
        : {
            examId,
            data: { questions_data, image_map: image_map || {} }
          }

      const vpsRes = await fetch(`${vpsUrl}/api/exams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vpsPayload)
      })
      
      if (!vpsRes.ok) {
        console.error('Failed to update exam on VPS')
      }

      // 2. Chấm lại tất cả bài nộp (Rescoring) — variant-aware
      const { data: submissions } = await supabase
        .from('online_exam_submissions')
        .select('id, answers, variant_index')
        .eq('exam_id', examId)

      if (submissions && submissions.length > 0) {
        const config = (scoring_config || data.scoring_config) as Record<string, number>
        
        // Build correct answers map per variant
        const getCorrectAnswers = (vi: number): Record<string, string> => {
          if (isMultiVariant) {
            return variants[Math.min(vi, variants.length - 1)]?.correct_answers || {}
          }
          const ca = correct_answers || data.correct_answers
          if (Array.isArray(ca)) return ca[Math.min(vi, ca.length - 1)] || {}
          return ca || {}
        }

        const getQuestionsData = (vi: number): any[] => {
          if (isMultiVariant) {
            return variants[Math.min(vi, variants.length - 1)]?.questions_data || []
          }
          return questions_data || []
        }

        for (const sub of submissions) {
          const vi = (sub as any).variant_index ?? 0
          const subCorrectAnswers = getCorrectAnswers(vi)
          const subQuestionsData = getQuestionsData(vi)
          const studentAnswers = sub.answers as Record<string, any>
          const detailResults: any[] = []
          let totalScore = 0

          for (let i = 0; i < subQuestionsData.length; i++) {
            const q = subQuestionsData[i]
            const qType = q.questionType as string
            const studentAns = studentAnswers?.[String(i)]
            const correctAns = subCorrectAnswers[String(i)]

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
              let scoreRatio = 0
              if (tfCorrectCount === 1) scoreRatio = 0.1
              else if (tfCorrectCount === 2) scoreRatio = 0.25
              else if (tfCorrectCount === 3) scoreRatio = 0.5
              else if (tfCorrectCount >= 4) scoreRatio = 1.0

              isCorrect = tfCorrectCount === tfTotal && tfTotal > 0
              scoreEarned = scoreRatio * scorePerQ
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

          // Cập nhật lại điểm số
          await supabase
            .from('online_exam_submissions')
            .update({
              score: Math.round(totalScore * 100) / 100,
              detail_results: detailResults
            })
            .eq('id', sub.id)
        }
      }
    }

    return NextResponse.json(data)
  } catch (error: any) {
    console.error('Update exam error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// DELETE: Xóa đề thi (cả trên Supabase và VPS)
export async function DELETE(request: Request, { params }: { params: Promise<{ examId: string }> }) {
  try {
    const { examId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Xóa trên Supabase (cascade sẽ xóa submissions)
    const { error } = await supabase
      .from('online_exams')
      .delete()
      .eq('id', examId)
      .eq('created_by', user.id)

    if (error) throw error

    // Xóa file trên VPS
    const vpsUrl = process.env.NEXT_PUBLIC_VPS_URL || process.env.NEXT_PUBLIC_TIKZ_API_URL || 'http://42.96.15.5:3001'
    await fetch(`${vpsUrl}/api/exams/${examId}`, { method: 'DELETE' }).catch(() => {})

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
