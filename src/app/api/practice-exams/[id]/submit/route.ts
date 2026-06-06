// src/app/api/practice-exams/[id]/submit/route.ts
// API: Nộp bài thi luyện tập — chấm điểm tức thì

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

interface QuestionConfig {
  order: number
  type: 'multiple_choice' | 'true_false' | 'short_answer' | 'essay'
  correct_answer?: string | null
  sub_answers?: string[]    // Cho Đ/S: ["Đ","S","Đ","S"]
  score: number
}

interface SubmitBody {
  answers: Record<string, string | Record<string, string>>
  duration_seconds?: number
}

// Normalize short answer: trim, lowercase, bỏ khoảng trắng thừa
function normalizeShortAnswer(answer: string): string {
  return answer.trim().toLowerCase().replace(/\s+/g, '')
}

// Tính điểm Đúng/Sai theo quy tắc:
// 1/4 đúng = 0.1đ, 2/4 = 0.25đ, 3/4 = 0.5đ, 4/4 = 1.0đ
function calculateTFScore(
  studentAnswers: Record<string, string>,
  correctAnswers: string[],
  maxScore: number
): { score: number; correctCount: number; total: number } {
  const total = correctAnswers.length
  let correctCount = 0

  for (let i = 0; i < total; i++) {
    const key = String.fromCharCode(97 + i) // a, b, c, d
    const studentAns = studentAnswers[key]?.trim()?.toUpperCase()
    const correctAns = correctAnswers[i]?.trim()?.toUpperCase()

    if (studentAns && correctAns && studentAns === correctAns) {
      correctCount++
    }
  }

  let scoreRatio = 0
  if (correctCount === 1) scoreRatio = 0.1
  else if (correctCount === 2) scoreRatio = 0.25
  else if (correctCount === 3) scoreRatio = 0.5
  else if (correctCount >= 4) scoreRatio = 1.0

  const score = scoreRatio * maxScore

  return { score, correctCount, total }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: examId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 })
    }

    const body: SubmitBody = await request.json()
    const { answers, duration_seconds } = body

    if (!answers) {
      return NextResponse.json({ error: 'Chưa có đáp án' }, { status: 400 })
    }

    // Lấy đề thi (dùng admin client để lấy đáp án)
    const adminClient = createAdminClient()
    const { data: exam, error: examError } = await adminClient
      .from('practice_exams')
      .select('*')
      .eq('id', examId)
      .single()

    if (examError || !exam) {
      return NextResponse.json({ error: 'Không tìm thấy đề thi' }, { status: 404 })
    }

    // Chấm điểm
    const questions: QuestionConfig[] = exam.questions || []
    let totalScore = 0
    let totalCorrect = 0
    let totalTFCorrect = 0
    const results: Array<{
      order: number
      type: string
      student_answer: unknown
      correct_answer: unknown
      is_correct: boolean
      score_earned: number
      max_score: number
    }> = []

    for (const q of questions) {
      const studentAnswer = answers[String(q.order)]
      let isCorrect = false
      let scoreEarned = 0

      if (q.type === 'multiple_choice') {
        const sa = typeof studentAnswer === 'string' ? studentAnswer.trim().toUpperCase() : ''
        const ca = (q.correct_answer || '').trim().toUpperCase()
        isCorrect = sa === ca && sa !== ''
        if (isCorrect) {
          scoreEarned = q.score
          totalCorrect++
        }
        results.push({
          order: q.order,
          type: q.type,
          student_answer: sa,
          correct_answer: ca,
          is_correct: isCorrect,
          score_earned: scoreEarned,
          max_score: q.score,
        })
      } else if (q.type === 'true_false') {
        const tfAnswers = (typeof studentAnswer === 'object' && studentAnswer !== null)
          ? studentAnswer as Record<string, string>
          : {}
        const correctSubs = q.sub_answers || []
        const tfResult = calculateTFScore(tfAnswers, correctSubs, q.score)
        scoreEarned = tfResult.score
        isCorrect = tfResult.correctCount === tfResult.total
        totalTFCorrect += tfResult.correctCount

        results.push({
          order: q.order,
          type: q.type,
          student_answer: tfAnswers,
          correct_answer: correctSubs,
          is_correct: isCorrect,
          score_earned: scoreEarned,
          max_score: q.score,
        })
      } else if (q.type === 'short_answer') {
        const sa = typeof studentAnswer === 'string' ? normalizeShortAnswer(studentAnswer) : ''
        const ca = normalizeShortAnswer(q.correct_answer || '')
        isCorrect = sa === ca && sa !== ''
        if (isCorrect) {
          scoreEarned = q.score
          totalCorrect++
        }
        results.push({
          order: q.order,
          type: q.type,
          student_answer: typeof studentAnswer === 'string' ? studentAnswer.trim() : '',
          correct_answer: q.correct_answer || '',
          is_correct: isCorrect,
          score_earned: scoreEarned,
          max_score: q.score,
        })
      } else if (q.type === 'essay') {
        // Tự luận: chấm sau, điểm = 0 tạm thời
        results.push({
          order: q.order,
          type: q.type,
          student_answer: typeof studentAnswer === 'string' ? studentAnswer : '',
          correct_answer: null,
          is_correct: false,
          score_earned: 0,
          max_score: q.score,
        })
      }

      totalScore += scoreEarned
    }

    // Làm tròn điểm 2 chữ số
    totalScore = Math.round(totalScore * 100) / 100

    // Lưu kết quả vào practice_sessions
    const { data: session, error: sessionError } = await adminClient
      .from('practice_sessions')
      .insert({
        exam_id: examId,
        student_id: user.id,
        answers,
        score: totalScore,
        total_correct: totalCorrect,
        total_tf_correct: totalTFCorrect,
        duration_seconds: duration_seconds || null,
        submitted_at: new Date().toISOString(),
        status: 'submitted',
      })
      .select()
      .single()

    if (sessionError) {
      console.error('Save session error:', sessionError)
      return NextResponse.json({ error: 'Lỗi lưu kết quả: ' + sessionError.message }, { status: 500 })
    }

    return NextResponse.json({
      session_id: session.id,
      score: totalScore,
      total_score: exam.total_score,
      total_correct: totalCorrect,
      total_tf_correct: totalTFCorrect,
      total_questions: questions.length,
      results,
    })
  } catch (err) {
    console.error('Submit exam error:', err)
    return NextResponse.json(
      { error: `Lỗi server: ${err instanceof Error ? err.message : 'Unknown'}` },
      { status: 500 }
    )
  }
}
