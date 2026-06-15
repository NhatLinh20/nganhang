// src/lib/latex-parser/tex-import-parser.ts
// Light parser cho tính năng import file .tex vào trang Trộn đề
// KHÔNG yêu cầu category code — chỉ cần trích xuất câu hỏi và detect loại

import { extractExBlocks, preprocessTexContent } from './file-parser'
import { detectQuestionType, detectCorrectAnswer } from './answer-parser'
import type { QuestionType } from '@/types'

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface ImportedExamQuestion {
  id: string
  latex_content: string
  question_type: QuestionType
  correct_answer: string | null
  phan: number                    // 1=TN, 2=ĐS, 3=Ngắn, 4=TL
  mo_ta: string
  // Metadata mặc định (để tương thích với ExamQuestion interface)
  category_code: string
  grade: number
  subject_area: string
  chapter: number
  lesson: number
  variant: number
  difficulty: string
  has_image: boolean
}

export interface ImportedFileInfo {
  fileName: string
  questions: ImportedExamQuestion[]
  stats: {
    mc: number   // multiple_choice
    tf: number   // true_false
    sa: number   // short_answer
    es: number   // essay
    total: number
  }
  errors: ImportParseError[]
}

export interface ImportParseError {
  blockIndex: number
  preview: string  // first 100 chars of the block
  reason: string
}

// ─── Constants ──────────────────────────────────────────────────────────────────

const PHAN_MAP: Record<QuestionType, number> = {
  multiple_choice: 1,
  true_false: 2,
  short_answer: 3,
  essay: 4,
}

// ─── Main Parser ────────────────────────────────────────────────────────────────

/**
 * Parse nội dung file .tex thành danh sách câu hỏi cho trang Trộn đề.
 * Không yêu cầu category code.
 * 
 * @param texContent - Nội dung file .tex (string)
 * @param fileName - Tên file gốc (VD: "de1.tex")
 * @param fileIndex - Index của file (dùng để tạo ID unique)
 */
export function parseTexForImport(
  texContent: string,
  fileName: string,
  fileIndex: number = 0
): ImportedFileInfo {
  const questions: ImportedExamQuestion[] = []
  const errors: ImportParseError[] = []

  // 1. Tiền xử lý: bỏ \dc{...} ngoài \begin{ex}
  const cleaned = preprocessTexContent(texContent)

  // 2. Tách các block \begin{ex}...\end{ex}
  const blocks = extractExBlocks(cleaned)

  // 3. Parse từng block
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i].trim()

    if (!block || !block.includes('\\begin{ex}')) {
      errors.push({
        blockIndex: i,
        preview: block.slice(0, 100),
        reason: 'Block rỗng hoặc không có \\begin{ex}',
      })
      continue
    }

    try {
      // Detect loại câu hỏi
      const question_type = detectQuestionType(block)

      // Detect đáp án
      const correct_answer = detectCorrectAnswer(block, question_type)

      // Gán phan tự động
      const phan = PHAN_MAP[question_type]

      // Detect hình ảnh
      const has_image = /\\includegraphics|\\begin\{tikzpicture\}/.test(block)

      // Thử trích xuất category code nếu có (optional)
      const categoryMatch = block.match(/%\[([^\]]+)\]/)
      const category_code = categoryMatch ? categoryMatch[1] : ''

      // Tạo câu hỏi
      const question: ImportedExamQuestion = {
        id: `import-${fileIndex}-${i}`,
        latex_content: block,
        question_type,
        correct_answer,
        phan,
        mo_ta: `${fileName} — Câu ${i + 1}`,
        category_code,
        grade: 12,
        subject_area: 'D',
        chapter: 0,
        lesson: 0,
        variant: 0,
        difficulty: 'H',
        has_image,
      }

      questions.push(question)
    } catch (err) {
      errors.push({
        blockIndex: i,
        preview: block.slice(0, 100),
        reason: err instanceof Error ? err.message : String(err),
      })
    }
  }

  // 4. Tính stats
  const stats = {
    mc: questions.filter(q => q.question_type === 'multiple_choice').length,
    tf: questions.filter(q => q.question_type === 'true_false').length,
    sa: questions.filter(q => q.question_type === 'short_answer').length,
    es: questions.filter(q => q.question_type === 'essay').length,
    total: questions.length,
  }

  return { fileName, questions, stats, errors }
}

// ─── ZIP handling helper ────────────────────────────────────────────────────────

/**
 * Xử lý nhiều file .tex (hoặc .zip chứa .tex) từ FileList.
 * Trả về danh sách ImportedFileInfo cho từng file .tex.
 */
export async function processImportFiles(
  files: File[]
): Promise<{ imported: ImportedFileInfo[]; globalErrors: string[] }> {
  const imported: ImportedFileInfo[] = []
  const globalErrors: string[] = []
  let fileIndex = 0

  for (const file of files) {
    if (file.name.endsWith('.zip')) {
      // Giải nén ZIP
      try {
        const JSZip = (await import('jszip')).default
        const arrayBuffer = await file.arrayBuffer()
        const zip = await JSZip.loadAsync(arrayBuffer)

        const texFiles: { name: string; content: string }[] = []

        for (const [path, entry] of Object.entries(zip.files)) {
          if (!entry.dir && path.endsWith('.tex')) {
            const content = await entry.async('string')
            // Lấy tên file (bỏ thư mục)
            const name = path.split('/').pop() || path
            texFiles.push({ name, content })
          }
        }

        if (texFiles.length === 0) {
          globalErrors.push(`File ZIP "${file.name}" không chứa file .tex nào.`)
          continue
        }

        // Sắp xếp theo tên file
        texFiles.sort((a, b) => a.name.localeCompare(b.name))

        for (const texFile of texFiles) {
          const result = parseTexForImport(texFile.content, texFile.name, fileIndex++)
          if (result.stats.total > 0) {
            imported.push(result)
          } else {
            globalErrors.push(`File "${texFile.name}" trong ZIP không có câu hỏi (\\begin{ex}...\\end{ex}).`)
          }
        }
      } catch (err) {
        globalErrors.push(`Lỗi giải nén "${file.name}": ${err instanceof Error ? err.message : String(err)}`)
      }
    } else if (file.name.endsWith('.tex')) {
      try {
        const content = await file.text()
        const result = parseTexForImport(content, file.name, fileIndex++)
        if (result.stats.total > 0) {
          imported.push(result)
        } else {
          globalErrors.push(`File "${file.name}" không có câu hỏi (\\begin{ex}...\\end{ex}).`)
        }
      } catch (err) {
        globalErrors.push(`Lỗi đọc file "${file.name}": ${err instanceof Error ? err.message : String(err)}`)
      }
    } else {
      globalErrors.push(`File "${file.name}" không được hỗ trợ. Chỉ chấp nhận .tex hoặc .zip.`)
    }
  }

  return { imported, globalErrors }
}
