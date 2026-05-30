// src/lib/latex-parser/normalizer.ts
// Module chuẩn hóa câu hỏi LaTeX (chạy trên trình duyệt)
// Pipeline pattern: mảng NORMALIZE_RULES chứa các function chuẩn hóa

// ── Types ────────────────────────────────────────────────────────────────────
type NormalizeRule = (content: string) => string

// ── Regex nhận diện ID 6 tham số ─────────────────────────────────────────────
// Khớp: 1D5H2-3, 2D3H1-3, 0D8V2-5, v.v.
const ID_REGEX = /^\d+[a-zA-Z]\d+[a-zA-Z]\d+-\d+$/

// ── Rule 1: Xóa %[...] không phải ID trên dòng \begin{ex} ──────────────────
// Logic chuyển từ scripts/clean-comments.js sang TypeScript
function removeNonIdComments(content: string): string {
  const lines = content.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.includes('\\begin{ex}') || line.includes('\\begin{bt}')) {
      const originalLine = line
      let nonIdFound = false

      const newLine = line.replace(/%\[([^\]]*)\]/g, (match, innerText) => {
        const text = innerText.trim()
        if (ID_REGEX.test(text)) {
          return match // Giữ nguyên ID hợp lệ
        } else {
          nonIdFound = true
          return '' // Xóa cụm không phải ID
        }
      })

      if (nonIdFound && newLine !== originalLine) {
        // Dọn dẹp khoảng trắng thừa cuối dòng
        lines[i] = newLine.replace(/ +(?=%)/g, '').trimEnd()
      }
    }
  }

  return lines.join('\n')
}

// ── Rule 2: Chuẩn hóa line endings ──────────────────────────────────────────
function normalizeLineEndings(content: string): string {
  return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

// ── Rule 3: Xóa khoảng trắng thừa cuối mỗi dòng ───────────────────────────
function trimTrailingWhitespace(content: string): string {
  return content
    .split('\n')
    .map(line => line.trimEnd())
    .join('\n')
}

// ── Pipeline ─────────────────────────────────────────────────────────────────
const NORMALIZE_RULES: NormalizeRule[] = [
  removeNonIdComments,
  normalizeLineEndings,
  trimTrailingWhitespace,
]

/**
 * Chuẩn hóa một block câu hỏi LaTeX
 * Chạy qua tất cả các rule trong pipeline
 */
export function normalizeQuestion(block: string): string {
  return NORMALIZE_RULES.reduce((content, rule) => rule(content), block)
}

/**
 * Chuẩn hóa tất cả các block câu hỏi
 */
export function normalizeAllQuestions(blocks: string[]): string[] {
  return blocks.map(normalizeQuestion)
}
