// src/lib/latex-parser/question-parser.ts
// Parse một block \begin{ex}...\end{ex} thành ParsedQuestion

import type { ParsedQuestion } from '@/types'
import { extractComments, findValidCategoryCode, detectImageType } from './category-parser'
import { detectQuestionType, detectCorrectAnswer, extractSourceMeta } from './answer-parser'

export interface QuestionParseError {
  reason: 'no_valid_id' | 'empty_content' | 'parse_error'
  detail?: string
}

export type QuestionParseResult =
  | { success: true; question: ParsedQuestion }
  | { success: false; error: QuestionParseError }

/**
 * Parse một block \begin{ex}...\end{ex} thành ParsedQuestion
 * @param latexBlock - Toàn bộ code từ \begin{ex} đến \end{ex} (bao gồm cả 2 tag)
 * @param sourceFile - Tên file .tex gốc (optional)
 */
export function parseQuestion(
  latexBlock: string,
  sourceFile?: string
): QuestionParseResult {
  // 1. Kiểm tra content không rỗng
  const trimmed = latexBlock.trim()
  if (!trimmed || !trimmed.includes('\\begin{ex}')) {
    return { success: false, error: { reason: 'empty_content' } }
  }

  try {
    // 2. Tìm category code hợp lệ từ comment %[...]
    const comments = extractComments(trimmed)
    const categoryInfo = findValidCategoryCode(comments)

    if (!categoryInfo) {
      return {
        success: false,
        error: {
          reason: 'no_valid_id',
          detail: `Không tìm thấy ID 6 tham số. Comments tìm thấy: [${comments.join(', ')}]`,
        },
      }
    }

    // 3. Detect loại câu hỏi
    const question_type = detectQuestionType(trimmed)

    // 4. Detect đáp án
    const correct_answer = detectCorrectAnswer(trimmed, question_type)

    // 5. Detect hình ảnh
    const { has_image, image_type } = detectImageType(trimmed)

    // 6. Trích xuất nguồn gốc
    const sourceMeta = extractSourceMeta(trimmed)

    // 7. Tổng hợp
    const parsed: ParsedQuestion = {
      latex_content: trimmed,
      ...categoryInfo,
      question_type,
      has_image,
      image_type,
      correct_answer,
      source_file: sourceFile,
      is_active: true,
      ...sourceMeta,
    }

    return { success: true, question: parsed }

  } catch (err) {
    return {
      success: false,
      error: {
        reason: 'parse_error',
        detail: err instanceof Error ? err.message : String(err),
      },
    }
  }
}
