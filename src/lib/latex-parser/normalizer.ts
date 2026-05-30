// src/lib/latex-parser/normalizer.ts
// Module chuẩn hóa câu hỏi LaTeX (chạy trên trình duyệt)
// Pipeline pattern: mảng NORMALIZE_RULES chứa các function chuẩn hóa

// ── Types ────────────────────────────────────────────────────────────────────
type NormalizeRule = (content: string) => string

// ── Regex nhận diện ID 6 tham số ─────────────────────────────────────────────
// Khớp: 1D5H2-3, 2D3H1-3, 0D8V2-5, v.v.
// Mở rộng regex để chắc chắn không bỏ sót ID hợp lệ có dấu cách
const ID_REGEX = /^\s*\d+[a-zA-Z]\d+[a-zA-Z]\d+-\d+\s*$/

// ── Rule 1: Xóa %[...] không phải ID trên dòng \begin{ex} ──────────────────
function removeNonIdComments(content: string): string {
  const lines = content.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.includes('\\begin{ex}') || line.includes('\\begin{bt}')) {
      
      // Tìm dòng có dạng \begin{ex} tiếp theo là các comments %[...]
      // Chúng ta sẽ lặp và xóa các %[...] không hợp lệ
      
      const newLine = line.replace(/%\[([^\]]*)\]/g, (match, innerText) => {
        // Kiểm tra xem innerText có khớp với ID không
        if (ID_REGEX.test(innerText)) {
          return match // Trả về nguyên bản nếu là ID
        }
        return '' // Xóa bỏ hoàn toàn nếu không phải ID (như %[Dự án Tex...])
      })

      // Cập nhật lại dòng, dọn dẹp khoảng trắng dư thừa
      // Ví dụ: "\begin{ex}  %[ID]" -> "\begin{ex}%[ID]"
      lines[i] = newLine.replace(/\s+(?=%\[)/g, '').trimRight()
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
    .map(line => line.trimRight())
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
