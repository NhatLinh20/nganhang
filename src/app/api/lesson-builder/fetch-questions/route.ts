// src/app/api/lesson-builder/fetch-questions/route.ts
// API lấy câu hỏi ngẫu nhiên cho Lesson Builder

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

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

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { selections } = body as { selections: Selection[] }

    if (!selections || selections.length === 0) {
      return NextResponse.json({ error: 'Chưa chọn câu hỏi nào.' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const warnings: string[] = []
    const allQuestions: any[] = []
    let totalRequested = 0
    let totalFound = 0

    for (const sel of selections) {
      totalRequested += sel.count

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
        console.error('Fetch error:', error)
        continue
      }

      const pool = shuffleArray(data || [])
      const picked = pool.slice(0, sel.count)

      if (pool.length < sel.count) {
        warnings.push(`Bài ${sel.lesson}, Dạng ${sel.variant}, ${sel.difficulty}: cần ${sel.count} nhưng chỉ có ${pool.length}`)
      }

      allQuestions.push(...picked)
      totalFound += picked.length
    }

    // Sort by lesson → variant → question_type
    allQuestions.sort((a, b) => {
      if (a.lesson !== b.lesson) return a.lesson - b.lesson
      if (a.variant !== b.variant) return a.variant - b.variant
      return (a.question_type || '').localeCompare(b.question_type || '')
    })

    return NextResponse.json({
      questions: allQuestions,
      stats: { requested: totalRequested, found: totalFound },
      warnings: warnings.length > 0 ? warnings : undefined,
    })
  } catch (err) {
    console.error('Lesson builder fetch error:', err)
    return NextResponse.json(
      { error: `Lỗi server: ${err instanceof Error ? err.message : 'Unknown'}` },
      { status: 500 }
    )
  }
}
