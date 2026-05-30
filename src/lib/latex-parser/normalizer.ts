// src/lib/latex-parser/normalizer.ts
// Module chuẩn hóa câu hỏi LaTeX (chạy trên trình duyệt)

type NormalizeRule = (content: string) => string

// Regex chuẩn: bắt đầu bằng số, 1 chữ, số, 1 chữ, số, gạch ngang, số.
const ID_REGEX = /^\s*\d+[a-zA-Z]\d+[a-zA-Z]\d+-\d+\s*$/

function removeNonIdComments(content: string): string {
  // Thay thế trực tiếp trên chuỗi bằng cách tìm \begin{ex} hoặc \begin{bt} 
  // và xử lý nội dung trên cùng 1 dòng đó (đến dấu xuống dòng đầu tiên hoặc hết chuỗi)
  
  return content.replace(/(\\begin\{(?:ex|bt)\}[^\r\n]*)/g, (firstLine) => {
    
    // Tìm tất cả các cụm %[...] trên dòng đầu tiên này
    let newFirstLine = firstLine.replace(/%\[([^\]]*)\]/g, (match, innerText) => {
      if (ID_REGEX.test(innerText)) {
        return match // Giữ lại nếu là ID
      }
      return '' // Xóa bỏ hoàn toàn nếu không phải ID
    })

    // Dọn dẹp khoảng trắng dư thừa trước %[
    // Vd: "\begin{ex}  %[1D2H3-1]" -> "\begin{ex}%[1D2H3-1]"
    newFirstLine = newFirstLine.replace(/\s+(?=%\[)/g, '')
    
    // Bỏ khoảng trắng thừa ở cuối dòng (nếu comment bị xóa ở cuối)
    return newFirstLine.trimRight()
  })
}

function normalizeLineEndings(content: string): string {
  return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

function trimTrailingWhitespace(content: string): string {
  return content
    .split('\n')
    .map(line => line.trimRight())
    .join('\n')
}

const NORMALIZE_RULES: NormalizeRule[] = [
  removeNonIdComments,
  normalizeLineEndings,
  trimTrailingWhitespace,
]

export function normalizeQuestion(block: string): string {
  return NORMALIZE_RULES.reduce((content, rule) => rule(content), block)
}

export function normalizeAllQuestions(blocks: string[]): string[] {
  return blocks.map(normalizeQuestion)
}
