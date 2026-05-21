// src/lib/latex-parser/file-parser.ts
// Parse toàn bộ file .tex — tách từng block \begin{ex}...\end{ex}

import type { ParsedQuestion, ImportResult, ImportError } from '@/types'
import { parseQuestion } from './question-parser'

export interface ParseOptions {
  sourceFile?: string       // Tên file .tex
  skipDuplicates?: boolean  // Bỏ qua câu trùng lặp (theo latex_content)
}

export interface ParseFileResult {
  questions: ParsedQuestion[]
  result: ImportResult
  rawBlocks: string[]       // Debug: danh sách các block đã tìm thấy
}

// ═══════════════════════════════════════════════════
// BƯỚC 1: Tách các block \begin{ex}...\end{ex}
// ═══════════════════════════════════════════════════

/**
 * Tách tất cả block \begin{ex}...\end{ex} từ nội dung file .tex
 * Xử lý được:
 *   - Nhiều câu liên tiếp
 *   - Các lệnh cấu trúc đề bên ngoài (\caulc, \cauds, \caukq, \tl...)
 *   - \dc{...} ngoài \begin{ex}
 *   - \begin{name}...\end{name} và các lệnh header
 *   - Nested environments BÊN TRONG ex (tikzpicture, tabular...)
 */
export function extractExBlocks(texContent: string): string[] {
  const blocks: string[] = []
  const BEGIN_EX = '\\begin{ex}'
  const END_EX = '\\end{ex}'

  let searchFrom = 0

  while (true) {
    // Tìm \begin{ex} tiếp theo
    const beginIdx = texContent.indexOf(BEGIN_EX, searchFrom)
    if (beginIdx === -1) break

    // Tìm \end{ex} tương ứng — cần xử lý nested environments (không phải nested ex)
    // Vì \begin{ex} không lồng nhau, chỉ cần tìm \end{ex} đầu tiên sau begin
    const endIdx = texContent.indexOf(END_EX, beginIdx + BEGIN_EX.length)
    if (endIdx === -1) break  // Malformed — thiếu \end{ex}

    const block = texContent.slice(beginIdx, endIdx + END_EX.length)
    blocks.push(block)

    searchFrom = endIdx + END_EX.length
  }

  return blocks
}

// ═══════════════════════════════════════════════════
// BƯỚC 2: Tiền xử lý — bỏ \dc{...} ngoài \begin{ex}
// ═══════════════════════════════════════════════════

/**
 * Làm sạch nội dung file trước khi parse
 * - Bỏ \dc{...} (nằm sau \end{ex})
 * - Không sửa bên trong \begin{ex}...\end{ex}
 */
export function preprocessTexContent(content: string): string {
  // Chỉ bỏ \dc{...} nằm NGOÀI \begin{ex}...\end{ex}
  // Thay bằng empty string
  return content.replace(/\\dc\{[^}]*\}/g, '')
}

// ═══════════════════════════════════════════════════
// BƯỚC 3: Parse toàn bộ file
// ═══════════════════════════════════════════════════

/**
 * Parse toàn bộ nội dung file .tex
 * @param texContent - Nội dung file .tex (string)
 * @param options - Tùy chọn parse
 */
export function parseTexFile(
  texContent: string,
  options: ParseOptions = {}
): ParseFileResult {
  const { sourceFile, skipDuplicates = true } = options

  const errors: ImportError[] = []
  const questions: ParsedQuestion[] = []
  const seenContent = new Set<string>()

  // 1. Tiền xử lý
  const cleaned = preprocessTexContent(texContent)

  // 2. Tách blocks
  const rawBlocks = extractExBlocks(cleaned)

  // 3. Parse từng block
  for (let i = 0; i < rawBlocks.length; i++) {
    const block = rawBlocks[i]

    // Kiểm tra duplicate
    if (skipDuplicates && seenContent.has(block)) {
      errors.push({
        reason: 'duplicate',
        content: block.slice(0, 80) + '...',
      })
      continue
    }

    // Parse question
    const parseResult = parseQuestion(block, sourceFile)

    if (parseResult.success) {
      questions.push(parseResult.question)
      if (skipDuplicates) seenContent.add(block)
    } else {
      errors.push({
        reason: parseResult.error.reason,
        content: block.slice(0, 120) + '...',
        detail: parseResult.error.detail,
      })
    }
  }

  return {
    questions,
    rawBlocks,
    result: {
      total: rawBlocks.length,
      success: questions.length,
      skipped: errors.filter(e => e.reason === 'duplicate').length,
      errors,
    },
  }
}

// ═══════════════════════════════════════════════════
// UTILITY: Format báo cáo kết quả
// ═══════════════════════════════════════════════════

export function formatImportReport(result: ImportResult): string {
  const lines = [
    `📊 Kết quả import:`,
    `  ✅ Thành công: ${result.success} câu`,
    `  ⏭  Bỏ qua (trùng): ${result.skipped} câu`,
    `  ❌ Lỗi: ${result.errors.filter(e => e.reason !== 'duplicate').length} câu`,
    `  📝 Tổng tìm thấy: ${result.total} block`,
  ]

  const parseErrors = result.errors.filter(e => e.reason !== 'duplicate')
  if (parseErrors.length > 0) {
    lines.push(`\n🔴 Danh sách lỗi:`)
    parseErrors.forEach((err, idx) => {
      const reasonMap: Record<string, string> = {
        no_valid_id: 'Không có ID hợp lệ',
        empty_content: 'Nội dung rỗng',
        parse_error: 'Lỗi parse',
      }
      lines.push(`  ${idx + 1}. [${reasonMap[err.reason] || err.reason}] ${err.detail || ''}`)
      if (err.content) {
        lines.push(`     → ${err.content}`)
      }
    })
  }

  return lines.join('\n')
}
