// src/lib/latex-parser/category-parser.ts
// Parser mã phân loại 6 tham số từ comment %[...]

import type { Difficulty, SubjectArea, ImageType, QuestionType } from '@/types'

// ═══════════════════════════════════════════════════
// REGEX PATTERN cho ID 6 tham số
// Format: [Lớp][Phân môn][Chương][Mức độ][Bài]-[Dạng]
// Ví dụ: 2D1N3-1, 1H8V2-4, 0D8V2-5
//   - Lớp: 0=THCS chung, 1=lớp 11, 2=lớp 12
//   - Phân môn: D=Đại số, H=Hình học, C=Chuyên đề
//   - Chương: 0-9
//   - Mức độ: N=Nhận biết, H=Thông hiểu, V=Vận dụng, C=VD cao
//   - Bài: 0-9
//   - Dạng: 0-9
// ═══════════════════════════════════════════════════
const CATEGORY_CODE_REGEX = /^([012])([DHC])(\d)([NHVC])(\d)-(\d)$/

export interface CategoryInfo {
  category_code: string
  grade: 10 | 11 | 12
  subject_area: SubjectArea
  chapter: number
  difficulty: Difficulty
  lesson: number
  variant: number
}

/**
 * Parse mã phân loại 6 tham số từ string
 * @param code - VD: '2D1N3-1'
 * @returns CategoryInfo hoặc null nếu không hợp lệ
 */
export function parseCategoryCode(code: string): CategoryInfo | null {
  const trimmed = code.trim()
  const match = trimmed.match(CATEGORY_CODE_REGEX)
  
  if (!match) return null

  const [, gradeCode, subjectArea, chapterStr, difficulty, lessonStr, variantStr] = match

  // Map grade code → actual grade
  const gradeMap: Record<string, 10 | 11 | 12> = {
    '0': 10,   // lớp 10 hoặc THCS chung (dùng 10 làm mặc định)
    '1': 11,
    '2': 12,
  }

  return {
    category_code: trimmed,
    grade: gradeMap[gradeCode],
    subject_area: subjectArea as SubjectArea,
    chapter: parseInt(chapterStr),
    difficulty: difficulty as Difficulty,
    lesson: parseInt(lessonStr),
    variant: parseInt(variantStr),
  }
}

/**
 * Trích xuất tất cả comment %[...] từ block \begin{ex}...\end{ex}
 * Trả về mảng các string trong dấu %[...]
 */
export function extractComments(latexBlock: string): string[] {
  const results: string[] = []
  // Regex: %[nội dung] — có thể có khoảng trắng xung quanh
  const regex = /%\[([^\]]+)\]/g
  let match
  while ((match = regex.exec(latexBlock)) !== null) {
    results.push(match[1].trim())
  }
  return results
}

/**
 * Tìm category_code hợp lệ trong danh sách comments
 * Trả về CategoryInfo đầu tiên tìm thấy, hoặc null
 */
export function findValidCategoryCode(comments: string[]): CategoryInfo | null {
  for (const comment of comments) {
    const info = parseCategoryCode(comment)
    if (info) return info
  }
  return null
}

/**
 * Detect loại hình ảnh trong block LaTeX
 */
export function detectImageType(latexBlock: string): { has_image: boolean; image_type: ImageType } {
  // \immini[...]{...}{...} — hình nằm cạnh đề
  if (/\\immini/.test(latexBlock)) {
    return { has_image: true, image_type: 'immini' }
  }
  // \begin{center}...\begin{tikzpicture} hoặc \includegraphics trong center
  if (/\\begin\{center\}[\s\S]*?(\\begin\{tikzpicture\}|\\includegraphics)/m.test(latexBlock)) {
    return { has_image: true, image_type: 'center' }
  }
  return { has_image: false, image_type: 'none' }
}
