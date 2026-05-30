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

export const VALID_CHAPTERS: Record<string, Record<string, string[]>> = {
  '0': {
    'D': ['0', '1', '2', '3', '6', '7', '8'],
    'H': ['4', '5', '9'],
    'C': ['1', '2'],
  },
  '1': {
    'D': ['1', '2', '3', '5', '6', '7', '9'],
    'H': ['4', '8'],
    'C': ['1', '2', '3'],
  },
  '2': {
    'D': ['1', '3', '4', '6'],
    'H': ['2', '5'],
    'C': [],
  },
}

export function validateCategoryCode(code: string): { valid: boolean; error?: string } {
  const trimmed = code.trim()
  const match = trimmed.match(CATEGORY_CODE_REGEX)
  
  if (!match) {
    return { valid: false, error: 'Không đúng định dạng ID 6 tham số' }
  }

  const [, gradeCode, subjectArea, chapterStr] = match
  const validForGrade = VALID_CHAPTERS[gradeCode]
  if (!validForGrade) return { valid: false, error: 'Lớp không hợp lệ' }
  
  const validChapters = validForGrade[subjectArea]
  if (!validChapters) return { valid: false, error: 'Phân môn không hợp lệ' }
  
  if (!validChapters.includes(chapterStr)) {
    const subjectName = subjectArea === 'D' ? 'Đại số' : subjectArea === 'H' ? 'Hình học' : 'Chuyên đề'
    const gradeName = gradeCode === '0' ? '10' : gradeCode === '1' ? '11' : '12'
    return { 
      valid: false, 
      error: `Chương ${chapterStr} không thuộc môn ${subjectName} lớp ${gradeName}` 
    }
  }
  
  return { valid: true }
}

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
  const validation = validateCategoryCode(trimmed)
  
  if (!validation.valid) return null

  const match = trimmed.match(CATEGORY_CODE_REGEX)!
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
