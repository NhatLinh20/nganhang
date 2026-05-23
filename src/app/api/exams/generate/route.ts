// src/app/api/exams/generate/route.ts
// API tạo N đề thi từ các selections (cùng category_code, khác UUID)

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { LESSON_NAMES, VARIANT_NAMES } from '@/lib/curriculum-labels'

interface Selection {
  grade: number
  subject_area: string
  chapter: number
  lesson: number
  variant: number
  difficulty: string
  question_type: string
  count: number
}

interface GenerateRequest {
  title: string
  grade: number
  duration_minutes?: number
  num_exams: number
  selections: Selection[]
}

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function getPhan(question_type: string): number {
  if (question_type === 'multiple_choice') return 1
  if (question_type === 'true_false') return 2
  if (question_type === 'short_answer') return 3
  return 4
}

export async function POST(request: NextRequest) {
  try {
    const body: GenerateRequest = await request.json()
    const { title, grade, duration_minutes = 90, num_exams = 1, selections } = body

    if (!selections || selections.length === 0) {
      return NextResponse.json(
        { error: 'Chưa chọn câu hỏi nào.' },
        { status: 400 }
      )
    }

    const supabase = createAdminClient()

    // Với mỗi selection, lấy pool câu hỏi từ DB
    const warnings: string[] = []
    const totalRequested = selections.reduce((sum, s) => sum + s.count, 0)

    // Lấy câu hỏi theo từng selection
    type QuestionRow = {
      id: string
      category_code: string
      grade: number
      subject_area: string
      chapter: number
      lesson: number
      variant: number
      difficulty: string
      question_type: string
      correct_answer: string | null
      has_image: boolean
      latex_content: string
      phan?: number
      mo_ta?: string
      selectionIndex?: number
    }

    const selectionPools: QuestionRow[][] = []

    for (let si = 0; si < selections.length; si++) {
      const sel = selections[si]
      const { data, error } = await supabase
        .from('questions')
        .select('id, category_code, grade, subject_area, chapter, lesson, variant, difficulty, question_type, correct_answer, has_image, latex_content')
        .eq('grade', sel.grade)
        .eq('subject_area', sel.subject_area)
        .eq('chapter', sel.chapter)
        .eq('lesson', sel.lesson)
        .eq('variant', sel.variant)
        .eq('difficulty', sel.difficulty)
        .eq('question_type', sel.question_type)

      if (error) {
        console.error(`Selection ${si} query error:`, error)
        selectionPools.push([])
        continue
      }

      const pool = (data || []) as QuestionRow[]
      const needed = sel.count * num_exams
      if (pool.length < needed) {
        warnings.push(
          `Pool câu [Bài ${sel.lesson}, Dạng ${sel.variant}, ${sel.difficulty}, ${sel.question_type}]: cần ${needed} câu nhưng chỉ có ${pool.length}. Có thể bị trùng giữa các đề.`
        )
      }
      selectionPools.push(pool)
    }

    // Xáo trộn toàn bộ pool một lần duy nhất trước khi chia cho các đề
    for (let si = 0; si < selectionPools.length; si++) {
      selectionPools[si] = shuffleArray(selectionPools[si])
    }

    // Tạo N đề
    const allExams: { questions: QuestionRow[]; stats: { requested: number; found: number } }[] = []

    for (let examIdx = 0; examIdx < num_exams; examIdx++) {
      const examQuestions: QuestionRow[] = []
      let examFound = 0

      for (let si = 0; si < selections.length; si++) {
        const sel = selections[si]
        const pool = selectionPools[si]
        if (pool.length === 0) continue

        // Tính toán index bắt đầu để lấy câu hỏi cho đề này (tuần tự qua các đề để tránh trùng)
        const startIndex = (examIdx * sel.count) % pool.length
        
        const picked = []
        for (let i = 0; i < sel.count; i++) {
          const idx = (startIndex + i) % pool.length
          picked.push(pool[idx])
        }

        const phan = getPhan(sel.question_type)
        const lessonName = LESSON_NAMES[sel.grade]?.[sel.subject_area]?.[sel.chapter]?.[sel.lesson] || `Bài ${sel.lesson}`
        const variantName =
          (VARIANT_NAMES as Record<string, Record<string, Record<string, Record<string, Record<string, string>>>>>)
            [String(sel.grade)]?.[sel.subject_area]?.[String(sel.chapter)]?.[String(sel.lesson)]?.[String(sel.variant)] ||
          `Dạng ${sel.variant}`

        for (const q of picked) {
          examQuestions.push({
            ...q,
            phan,
            mo_ta: `${lessonName} — ${variantName}`,
            selectionIndex: si,
          })
          examFound++
        }
      }

      // Sắp xếp câu theo phan rồi theo lesson/variant
      examQuestions.sort((a, b) => {
        if ((a.phan || 1) !== (b.phan || 1)) return (a.phan || 1) - (b.phan || 1)
        if (a.lesson !== b.lesson) return a.lesson - b.lesson
        return a.variant - b.variant
      })

      allExams.push({
        questions: examQuestions,
        stats: { requested: totalRequested, found: examFound },
      })
    }

    // Tạo matrix từ selections (mô tả cấu trúc đề)
    const matrix = selections.map((sel, idx) => {
      const lessonName = LESSON_NAMES[sel.grade]?.[sel.subject_area]?.[sel.chapter]?.[sel.lesson] || `Bài ${sel.lesson}`
      const variantName =
        (VARIANT_NAMES as Record<string, Record<string, Record<string, Record<string, Record<string, string>>>>>)
          [String(sel.grade)]?.[sel.subject_area]?.[String(sel.chapter)]?.[String(sel.lesson)]?.[String(sel.variant)] ||
        `Dạng ${sel.variant}`

      return {
        phan: getPhan(sel.question_type),
        mo_ta: `${lessonName} — ${variantName}`,
        grade: sel.grade,
        subject_area: sel.subject_area,
        chapter: sel.chapter,
        lesson: sel.lesson,
        variant: sel.variant,
        difficulty: sel.difficulty,
        question_type: sel.question_type,
        so_luong: sel.count,
        selectionIndex: idx,
      }
    })

    const totalFound = allExams[0]?.stats.found || 0

    return NextResponse.json({
      exam_info: {
        title: title || 'Đề thi mới',
        grade,
        duration: duration_minutes,
      },
      matrix,
      questions: allExams[0]?.questions || [],
      stats: { requested: totalRequested, found: totalFound },
      exam_count: num_exams,
      exams: allExams,
      warnings: warnings.length > 0 ? warnings : undefined,
    })

  } catch (err) {
    console.error('Generate exam error:', err)
    return NextResponse.json(
      { error: `Lỗi server: ${err instanceof Error ? err.message : 'Unknown'}` },
      { status: 500 }
    )
  }
}
