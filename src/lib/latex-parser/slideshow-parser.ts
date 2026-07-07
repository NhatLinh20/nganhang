// src/lib/latex-parser/slideshow-parser.ts
// Parse LaTeX \begin{ex}...\end{ex} blocks thành cấu trúc dữ liệu cho slide trình chiếu
// Hỗ trợ phân tách nội dung thành các đoạn text + hình ảnh TikZ

import { extractExBlocks, preprocessTexContent } from './file-parser'
import { detectQuestionType } from './answer-parser'
import type { QuestionType } from '@/types'

// ═══════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════

/** Một đoạn nội dung: text thuần (có thể chứa $math$) hoặc hình TikZ */
export interface ContentSegment {
  type: 'text' | 'image'
  content: string     // text: nội dung LaTeX | image: raw tikz code
}

export interface SlideChoice {
  label: string       // 'A', 'B', 'C', 'D'
  content: string     // Nội dung phương án (raw LaTeX)
  segments?: ContentSegment[]
  isCorrect: boolean
}

export interface SlideTFStatement {
  label: string       // 'a', 'b', 'c', 'd'
  content: string     // Nội dung mệnh đề
  segments?: ContentSegment[]
  isTrue: boolean
}

export interface SlideQuestion {
  id: string
  rawLatex: string
  questionType: QuestionType
  bodySegments: ContentSegment[]         // Nội dung câu hỏi (text + hình)
  choices?: SlideChoice[]                // Trắc nghiệm 4PA
  tfStatements?: SlideTFStatement[]      // Đúng/Sai
  shortAnswer?: string                   // Trả lời ngắn
  solutionSegments?: ContentSegment[]    // Lời giải (text + hình)
  hasTikz: boolean
}

// ═══════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════

let _idCounter = 0
function generateSlideId(): string {
  return `slide-${Date.now()}-${++_idCounter}`
}

/**
 * Kiểm tra ký tự tại vị trí idx có bị escape bằng \ hay không.
 * Xử lý đúng: \{ → escaped, \\{ → KHÔNG escaped, \\\{ → escaped
 */
function isEscaped(text: string, idx: number): boolean {
  let count = 0
  let i = idx - 1
  while (i >= 0 && text[i] === '\\') { count++; i-- }
  return count % 2 === 1
}

/**
 * Trích xuất nội dung balanced braces bắt đầu tại openIdx.
 * Xử lý đúng \{, \\{, nested braces, v.v.
 */
function extractBalancedContent(text: string, openIdx: number): { content: string; endIdx: number } | null {
  if (openIdx >= text.length || text[openIdx] !== '{') return null
  let depth = 0
  for (let i = openIdx; i < text.length; i++) {
    const ch = text[i]
    if (ch === '{' && !isEscaped(text, i)) {
      depth++
    } else if (ch === '}' && !isEscaped(text, i)) {
      depth--
      if (depth === 0) {
        return { content: text.slice(openIdx + 1, i), endIdx: i }
      }
    }
  }
  return null
}

/**
 * Tách các item {nội dung} liên tiếp từ chuỗi LaTeX (balanced braces)
 */
function extractBracketedItems(text: string): string[] {
  const items: string[] = []
  let i = 0
  while (i < text.length) {
    while (i < text.length && /\s/.test(text[i])) i++
    if (i >= text.length) break
    if (text[i] === '{') {
      const result = extractBalancedContent(text, i)
      if (result) {
        items.push(result.content)
        i = result.endIdx + 1
      } else {
        break // malformed
      }
    } else {
      i++
    }
  }
  return items
}

/**
 * Phân tách nội dung thành các đoạn text + hình ảnh TikZ.
 * Nhận diện cả dạng bọc \begin{center}...\end{center} lẫn standalone.
 */
export function segmentContent(text: string): ContentSegment[] {
  if (!text || !text.trim()) return []

  const segments: ContentSegment[] = []
  // Regex: khớp tikzpicture hoặc tabular, và có thể lấy luôn các lệnh \definecolor, \colorlet nằm ngay trước đó.
  const mediaRegex = /(?:(?:\\(?:definecolor|colorlet)\s*\{[^\}]+\}\s*\{[^\}]+\}(?:\s*\{[^\}]+\})?\s*)*)(?:\\begin\{center\}\s*)?\\begin\{(tikzpicture|tabular)\}[\s\S]*?\\end\{\1\}\s*(?:\\end\{center\})?/g

  let lastIdx = 0
  let match: RegExpExecArray | null
  while ((match = mediaRegex.exec(text)) !== null) {
    const beforeText = text.slice(lastIdx, match.index).trim()
    if (beforeText) segments.push({ type: 'text', content: beforeText })
    const imageContent = match[0].replace(/\\begin\{center\}/g, '').replace(/\\end\{center\}/g, '').trim()
    segments.push({ type: 'image', content: imageContent })
    lastIdx = match.index + match[0].length
  }

  const afterText = text.slice(lastIdx).trim()
  if (afterText) segments.push({ type: 'text', content: afterText })

  // Nếu không tìm thấy segment nào, trả về toàn bộ text
  if (segments.length === 0) {
    return [{ type: 'text', content: text.trim() }]
  }
  return segments
}

/**
 * Chuyển đổi \immini[tùy chọn]{nội dung text}{hình ảnh tikz}
 * thành "hình ảnh \n nội dung text" để parser hiện tại có thể phân tách.
 */
function unwrapImmini(text: string): string {
  let result = text
  let i = 0
  while ((i = result.indexOf('\\immini', i)) !== -1) {
    let curr = i + 7 // length of \immini
    // Bỏ qua khoảng trắng
    while (curr < result.length && /\s/.test(result[curr])) curr++
    // Bỏ qua tham số tùy chọn [...]
    if (curr < result.length && result[curr] === '[') {
      const endBracket = result.indexOf(']', curr)
      if (endBracket !== -1) {
        curr = endBracket + 1
      }
    }
    while (curr < result.length && /\s/.test(result[curr])) curr++
    
    // Ngoặc nhọn thứ nhất: {text}
    if (curr < result.length && result[curr] === '{') {
      const arg1 = extractBalancedContent(result, curr)
      if (arg1) {
        curr = arg1.endIdx + 1
        while (curr < result.length && /\s/.test(result[curr])) curr++
        
        // Ngoặc nhọn thứ hai: {image}
        if (curr < result.length && result[curr] === '{') {
          const arg2 = extractBalancedContent(result, curr)
          if (arg2) {
            const before = result.slice(0, i)
            const after = result.slice(arg2.endIdx + 1)
            // Đặt hình ảnh lên trước nội dung chữ
            result = before + arg2.content + '\n' + arg1.content + after
            // Tiếp tục quét từ vị trí mới
            i = before.length + arg2.content.length + 1 + arg1.content.length
            continue
          }
        }
      }
    }
    // Nếu không parse thành công (không đúng định dạng), bỏ qua \immini này
    i += 7
  }
  return result
}

// ═══════════════════════════════════════════════════
// MAIN PARSER
// ═══════════════════════════════════════════════════

/**
 * Parse 1 block \begin{ex}...\end{ex} thành SlideQuestion
 */
export function parseSlideQuestion(latexBlock: string): SlideQuestion {
  const raw = latexBlock.trim()
  const id = generateSlideId()
  const questionType = detectQuestionType(raw)
  const hasTikz = /\\begin\{(tikzpicture|tabular)\}/.test(raw)

  // 1. Bỏ \begin{ex}...%[...] ở đầu và \end{ex} ở cuối, và unwrap \immini
  let inner = raw
    .replace(/^\\begin\{ex\}[^\n]*\n?/, '')  // Bỏ dòng \begin{ex}%[...]
    .replace(/\\end\{ex\}\s*$/, '')            // Bỏ \end{ex} cuối
    .trim()
  
  inner = unwrapImmini(inner)

  // 2. Tách \loigiai{...} (nếu có) — dùng balanced brace parser
  let solutionRaw: string | undefined
  const loigiaiIdx = inner.indexOf('\\loigiai')
  if (loigiaiIdx !== -1) {
    // Tìm dấu { đầu tiên sau \loigiai
    let braceStart = -1
    for (let i = loigiaiIdx + 8; i < inner.length; i++) {
      if (/\s/.test(inner[i])) continue
      if (inner[i] === '{') { braceStart = i; break }
      break // Ký tự khác → không phải \loigiai{
    }
    if (braceStart !== -1) {
      const result = extractBalancedContent(inner, braceStart)
      if (result) {
        solutionRaw = result.content.trim()
        
        // Convert \begin{itemchoice} \itemch ... \end{itemchoice} to \textbf{a.} , \textbf{b.} ...
        // to prevent segmentContent from breaking HTML lists when TikZ images are inside.
        solutionRaw = solutionRaw.replace(/\\begin\{itemchoice\}([\s\S]*?)\\end\{itemchoice\}/g, (match, innerText) => {
          let index = 0
          const labels = ['a.', 'b.', 'c.', 'd.', 'e.', 'f.', 'g.', 'h.']
          return innerText.replace(/\\itemch\b/g, () => {
            const label = labels[index] || '*'
            index++
            return `\n\n\\textbf{${label}} `
          }).trim()
        })

        inner = inner.slice(0, loigiaiIdx).trim()
      }
    }
  }

  // 3. Parse theo loại câu hỏi
  let questionBodyRaw = ''
  let choices: SlideChoice[] | undefined
  let tfStatements: SlideTFStatement[] | undefined
  let shortAnswer: string | undefined

  if (questionType === 'multiple_choice') {
    const choiceMatch = inner.match(/\\choice(?!\s*TF)(?:\[\d+\])?\s*/)
    if (choiceMatch && choiceMatch.index !== undefined) {
      questionBodyRaw = inner.slice(0, choiceMatch.index).trim()
      const choiceBlock = inner.slice(choiceMatch.index + choiceMatch[0].length)
      const items = extractBracketedItems(choiceBlock)
      const labels = ['A', 'B', 'C', 'D']
      choices = items.slice(0, 4).map((item, idx) => {
        const isCorrect = /\\True/.test(item)
        const content = item.replace(/\\True\s*/, '').trim()
        const segments = segmentContent(content)
        return { label: labels[idx], content, segments, isCorrect }
      })
    } else {
      questionBodyRaw = inner
    }

  } else if (questionType === 'true_false') {
    const tfMatch = inner.match(/\\choiceTF\s*/)
    if (tfMatch && tfMatch.index !== undefined) {
      questionBodyRaw = inner.slice(0, tfMatch.index).trim()
      const tfBlock = inner.slice(tfMatch.index + tfMatch[0].length)
      const items = extractBracketedItems(tfBlock)
      const labels = ['a', 'b', 'c', 'd']
      tfStatements = items.slice(0, 4).map((item, idx) => {
        const isTrue = /\\True/.test(item)
        const content = item.replace(/\\True\s*/, '').trim()
        const segments = segmentContent(content)
        return { label: labels[idx], content, segments, isTrue }
      })
    } else {
      questionBodyRaw = inner
    }

  } else if (questionType === 'short_answer') {
    const saMatch = inner.match(/\\shortans\s*(?:\[[^\]]*\])?\s*/)
    if (saMatch && saMatch.index !== undefined) {
      questionBodyRaw = inner.slice(0, saMatch.index).trim()
      const braceStart = inner.indexOf('{', saMatch.index + saMatch[0].length)
      if (braceStart !== -1) {
        const result = extractBalancedContent(inner, braceStart)
        if (result) {
          shortAnswer = result.content
            .replace(/\{,\}/g, ',')
            .replace(/\{;\}/g, ';')
            .replace(/\\,/g, '')
            .replace(/^\$+/, '')   // strip $ đầu
            .replace(/\$+$/, '')   // strip $ cuối
            .trim()
        }
      }
    } else {
      questionBodyRaw = inner
    }

  } else {
    // essay
    questionBodyRaw = inner
  }

  // 4. Phân tách nội dung thành segments (text + hình TikZ)
  const bodySegments = segmentContent(questionBodyRaw)
  const solutionSegments = solutionRaw ? segmentContent(solutionRaw) : undefined

  return {
    id,
    rawLatex: raw,
    questionType,
    bodySegments,
    choices,
    tfStatements,
    shortAnswer,
    solutionSegments,
    hasTikz,
  }
}

/**
 * Tách tất cả blocks từ raw text rồi parse từng cái
 */
export function parseAllSlideQuestions(rawText: string): SlideQuestion[] {
  const cleaned = preprocessTexContent(rawText)
  const blocks = extractExBlocks(cleaned)
  return blocks.map(block => parseSlideQuestion(block))
}

/**
 * Chỉ trích xuất các raw block \begin{ex}...\end{ex} dạng text thuần
 */
export function extractRawExBlocks(rawText: string): string[] {
  const cleaned = preprocessTexContent(rawText)
  return extractExBlocks(cleaned)
}
