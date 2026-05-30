// src/app/api/import/route.ts
// API endpoint để import câu hỏi đã parse vào database

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { parseTexFile, formatImportReport } from '@/lib/latex-parser/file-parser'
import type { ParsedQuestion, ApiResponse, ImportResult } from '@/types'

export const maxDuration = 60  // 60 giây cho file lớn

export async function POST(request: NextRequest) {
  try {
    const supabase = createAdminClient()

    // Đọc JSON body: { questions: ParsedQuestion[] }
    const body = await request.json()
    const questions: ParsedQuestion[] = body.questions

    if (!questions || !Array.isArray(questions) || questions.length === 0) {
      return NextResponse.json(
        { error: 'Không có câu hỏi nào để import' } satisfies ApiResponse<never>,
        { status: 400 }
      )
    }

    // Chuẩn hóa line endings
    questions.forEach(q => {
      if (q.latex_content) {
        q.latex_content = q.latex_content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
      }
    })

    const result: ImportResult = {
      total: questions.length,
      success: questions.length,
      skipped: 0,
      errors: [],
    }

    // Kiểm tra duplicate trong database (theo latex_content)
    const latexContents = questions.map(q => q.latex_content)
    const { data: existingQuestions } = await supabase
      .from('questions')
      .select('latex_content')
      .in('latex_content', latexContents)

    const existingSet = new Set(existingQuestions?.map((q: { latex_content: string }) => q.latex_content) || [])
    const newQuestions = questions.filter(q => !existingSet.has(q.latex_content))
    const dbDuplicates = questions.length - newQuestions.length

    if (dbDuplicates > 0) {
      result.skipped += dbDuplicates
      result.success -= dbDuplicates
    }

    // Insert vào database theo batch (500 câu mỗi lần)
    const BATCH_SIZE = 500
    let insertedCount = 0

    for (let i = 0; i < newQuestions.length; i += BATCH_SIZE) {
      const batch = newQuestions.slice(i, i + BATCH_SIZE)
      const { error: insertError } = await supabase
        .from('questions')
        .insert(batch)

      if (insertError) {
        console.error('Insert error:', insertError)
        return NextResponse.json(
          { error: `Lỗi insert database: ${insertError.message}` } satisfies ApiResponse<never>,
          { status: 500 }
        )
      }
      insertedCount += batch.length
    }

    result.success = insertedCount

    return NextResponse.json({
      data: { result, questions: newQuestions },
      message: formatImportReport(result),
    } satisfies ApiResponse<{ result: ImportResult; questions: ParsedQuestion[] }>)

  } catch (err) {
    console.error('Import error:', err)
    return NextResponse.json(
      { error: `Lỗi server: ${err instanceof Error ? err.message : 'Unknown error'}` } satisfies ApiResponse<never>,
      { status: 500 }
    )
  }
}

// ═══════════════════════════════════════════════════
// TEST ENDPOINT: Parse preview (không lưu DB)
// ═══════════════════════════════════════════════════
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { tex_content, source_file } = body

    if (!tex_content) {
      return NextResponse.json(
        { error: 'Thiếu tex_content' } satisfies ApiResponse<never>,
        { status: 400 }
      )
    }

    const { questions, result, rawBlocks } = parseTexFile(tex_content, {
      sourceFile: source_file,
      skipDuplicates: false,
    })

    // Chuẩn hóa line endings
    questions.forEach(q => {
      if (q.latex_content) {
        q.latex_content = q.latex_content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
      }
    })

    return NextResponse.json({
      data: {
        result,
        questions,
        rawBlocks: rawBlocks.length,
        report: formatImportReport(result),
      },
    })

  } catch (err) {
    return NextResponse.json(
      { error: `Parse error: ${err instanceof Error ? err.message : 'Unknown error'}` } satisfies ApiResponse<never>,
      { status: 500 }
    )
  }
}
