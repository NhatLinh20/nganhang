// src/app/api/exams/stats/route.ts
// API thống kê câu hỏi theo bộ lọc, nhóm theo lesson/variant/question_type/difficulty

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { LESSON_NAMES, VARIANT_NAMES } from '@/lib/curriculum-labels'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const grade = searchParams.get('grade')
    const subject_area = searchParams.get('subject_area')
    const chapter = searchParams.get('chapter')

    if (!grade || !subject_area || !chapter) {
      return NextResponse.json(
        { error: 'Thiếu tham số bắt buộc: grade, subject_area, chapter' },
        { status: 400 }
      )
    }

    const gradeNum = parseInt(grade)
    const chapterNum = parseInt(chapter)

    const supabase = createAdminClient()

    const allData: any[] = []
    let page = 0
    const PAGE_SIZE = 1000

    while (true) {
      let query = supabase
        .from('questions')
        .select('lesson, variant, question_type, difficulty')
        .eq('grade', gradeNum)
        .eq('subject_area', subject_area)
        .eq('chapter', chapterNum)
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

      const lesson = searchParams.get('lesson')
      const question_type = searchParams.get('question_type')
      if (lesson) query = query.eq('lesson', parseInt(lesson))
      if (question_type) query = query.eq('question_type', question_type)

      const { data, error } = await query

      if (error) {
        console.error('Stats query error:', error)
        return NextResponse.json(
          { error: `Lỗi truy vấn: ${error.message}` },
          { status: 500 }
        )
      }

      if (!data || data.length === 0) break
      allData.push(...data)
      if (data.length < PAGE_SIZE) break
      page++
    }

    // Group by (lesson, variant, question_type) rồi đếm theo difficulty
    type CountsMap = Record<string, Record<string, number>>
    const grouped: Record<string, CountsMap> = {}

    for (const row of allData) {
      const key = `${row.lesson}|${row.variant}|${row.question_type}`
      if (!grouped[key]) {
        grouped[key] = { N: {}, H: {}, V: {}, C: {} } as unknown as CountsMap
        grouped[key] = { N: 0, H: 0, V: 0, C: 0 } as unknown as CountsMap
      }
      const diffKey = row.difficulty as string
      const current = (grouped[key] as unknown as Record<string, number>)[diffKey] || 0
      ;(grouped[key] as unknown as Record<string, number>)[diffKey] = current + 1
    }

    // Chuyển sang mảng kết quả có kèm tên bài/dạng
    const result = Object.entries(grouped).map(([key, countsRaw]) => {
      const [lessonStr, variantStr, qType] = key.split('|')
      const lessonNum = parseInt(lessonStr)
      const variantNum = parseInt(variantStr)
      const counts = countsRaw as unknown as Record<string, number>

      const lessonName =
        LESSON_NAMES[gradeNum]?.[subject_area]?.[chapterNum]?.[lessonNum] ||
        `§${lessonNum}`

      const variantName =
        (VARIANT_NAMES as Record<string, Record<string, Record<string, Record<string, Record<string, string>>>>>)
          [String(gradeNum)]?.[subject_area]?.[String(chapterNum)]?.[String(lessonNum)]?.[String(variantNum)] ||
        `Dạng ${variantNum}`

      const total = (counts['N'] || 0) + (counts['H'] || 0) + (counts['V'] || 0) + (counts['C'] || 0)

      return {
        lesson: lessonNum,
        variant: variantNum,
        question_type: qType,
        lesson_name: lessonName,
        variant_name: variantName,
        counts: {
          N: counts['N'] || 0,
          H: counts['H'] || 0,
          V: counts['V'] || 0,
          C: counts['C'] || 0,
        },
        total,
      }
    })

    // Sắp xếp theo lesson → variant → question_type
    result.sort((a, b) => {
      if (a.lesson !== b.lesson) return a.lesson - b.lesson
      if (a.variant !== b.variant) return a.variant - b.variant
      return a.question_type.localeCompare(b.question_type)
    })

    return NextResponse.json({ data: result })
  } catch (err) {
    console.error('Stats error:', err)
    return NextResponse.json(
      { error: `Lỗi server: ${err instanceof Error ? err.message : 'Unknown'}` },
      { status: 500 }
    )
  }
}
