// src/lib/latex-parser/word-parser.ts
// Parse LaTeX \\begin{ex}...\\end{ex} thành WordQuestion[] — cấu trúc chi tiết cho xuất Word
// Tái sử dụng hàm tiện ích từ slideshow-parser.ts và file-parser.ts

import * as crypto from 'crypto'
import { extractExBlocks, preprocessTexContent } from './file-parser'
import { detectQuestionType } from './answer-parser'
import type { QuestionType } from '@/types'

// ─────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────

/**
 * Một đoạn nội dung đã phân tích chi tiết — mỗi phần là 1 loại riêng biệt
 * để word-latex-builder có thể render đúng ngữ cảnh
 */
export type WordSegment =
  | { type: 'text'; content: string }
  | { type: 'math-inline'; latex: string }
  | { type: 'math-display'; latex: string }
  | { type: 'tikz'; code: string; key: string }      // TikZ/tabular — key duy nhất cho imageMap
  | { type: 'bold'; children: WordSegment[] }
  | { type: 'italic'; children: WordSegment[] }
  | { type: 'underline'; children: WordSegment[] }
  | { type: 'linebreak' }
  | { type: 'center'; children: WordSegment[] }
  | { type: 'list'; ordered: boolean; items: WordSegment[][] }

export interface WordChoice {
  label: string              // 'A', 'B', 'C', 'D'
  segments: WordSegment[]
  isCorrect: boolean
}

export interface WordTFStatement {
  label: string              // 'a', 'b', 'c', 'd'
  segments: WordSegment[]
  isTrue: boolean
}

export interface WordQuestion {
  id: string
  questionType: QuestionType
  bodySegments: WordSegment[]
  choices?: WordChoice[]
  tfStatements?: WordTFStatement[]
  shortAnswer?: string
  solutionSegments?: WordSegment[]
  tikzKeys: string[]           // Tất cả key TikZ xuất hiện (để caller thu thập compile)
  rawLatex: string
}

// ─────────────────────────────────────────────────────────────────
// UTILITIES (tái sử dụng từ slideshow-parser)
// ─────────────────────────────────────────────────────────────────

function isEscaped(text: string, idx: number): boolean {
  let count = 0
  let i = idx - 1
  while (i >= 0 && text[i] === '\\') { count++; i-- }
  return count % 2 === 1
}

function extractBalancedContent(text: string, openIdx: number): { content: string; endIdx: number } | null {
  if (openIdx >= text.length || text[openIdx] !== '{') return null
  let depth = 0
  for (let i = openIdx; i < text.length; i++) {
    const ch = text[i]
    if (ch === '{' && !isEscaped(text, i)) depth++
    else if (ch === '}' && !isEscaped(text, i)) {
      depth--
      if (depth === 0) return { content: text.slice(openIdx + 1, i), endIdx: i }
    }
  }
  return null
}

function extractBracketedItems(text: string): string[] {
  const items: string[] = []
  let i = 0
  while (i < text.length) {
    while (i < text.length && /\s/.test(text[i])) i++
    if (i >= text.length) break
    if (text[i] === '{') {
      const result = extractBalancedContent(text, i)
      if (result) { items.push(result.content); i = result.endIdx + 1 }
      else break
    } else { i++ }
  }
  return items
}

export function preprocessWordTexContent(text: string): string {
  let cleaned = text

  // 1. Loại bỏ các comment LaTeX % ...
  cleaned = cleaned.replace(/(^|[^\\])%.*$/gm, '$1')

  // 1.1 Sửa lỗi cú pháp dư thừa \limits (ví dụ: \limits\limits) làm hỏng pandoc math parser
  cleaned = cleaned.replace(/(?:\\limits){2,}/g, '\\limits')

  // 1.5 Loại bỏ \centerline bao quanh tikzpicture (Pandoc không parse được môi trường bên trong \centerline)
  cleaned = cleaned.replace(/\\centerline\s*\{\s*(\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\})\s*\}/g, '$1')

  // 1.8 Unwrap immini -> text then centered image
  cleaned = unwrapImmini(cleaned)

  return cleaned
}

function unwrapImmini(text: string): string {
  let result = text
  let i = 0
  while ((i = result.indexOf('\\immini', i)) !== -1) {
    let curr = i + 7
    while (curr < result.length && /\s/.test(result[curr])) curr++
    if (curr < result.length && result[curr] === '[') {
      const endBracket = result.indexOf(']', curr)
      if (endBracket !== -1) curr = endBracket + 1
    }
    while (curr < result.length && /\s/.test(result[curr])) curr++
    if (curr < result.length && result[curr] === '{') {
      const arg1 = extractBalancedContent(result, curr)
      if (arg1) {
        curr = arg1.endIdx + 1
        while (curr < result.length && /\s/.test(result[curr])) curr++
        if (curr < result.length && result[curr] === '{') {
          const arg2 = extractBalancedContent(result, curr)
          if (arg2) {
            const before = result.slice(0, i)
            const after = result.slice(arg2.endIdx + 1)
            
            // Put text (arg1) first, then image (arg2) centered
            // If arg1 contains \choice, place the image BEFORE \choice
            const choiceMatch = arg1.content.match(/\\choice(?:TF)?(?:\[\d+\])?\s*\{/)
            if (choiceMatch && choiceMatch.index !== undefined) {
              const textBeforeChoice = arg1.content.slice(0, choiceMatch.index)
              const choicePart = arg1.content.slice(choiceMatch.index)
              result = before + textBeforeChoice + '\n\n\\begin{center}\n' + arg2.content + '\n\\end{center}\n\n' + choicePart + after
              i = before.length + textBeforeChoice.length + 18 + arg2.content.length + 16 // advance past replaced content
            } else {
              result = before + arg1.content + '\n\n\\begin{center}\n' + arg2.content + '\n\\end{center}\n\n' + after
              i = before.length + arg1.content.length + 18 + arg2.content.length + 16 // advance past replaced content
            }
            continue
          }
        }
      }
    }
    i += 7
  }
  return result
}

// ─────────────────────────────────────────────────────────────────
// TIKZ KEY GENERATOR
// ─────────────────────────────────────────────────────────────────

function makeTikzKey(code: string): string {
  return 'tikz_' + crypto.createHash('sha256').update(code.trim()).digest('hex').slice(0, 12)
}

// ─────────────────────────────────────────────────────────────────
// SEGMENT PARSER — CHI TIẾT CHO WORD
// ─────────────────────────────────────────────────────────────────

/**
 * Parse nội dung LaTeX thành mảng WordSegment chi tiết.
 * Khác với slideshow-parser: tách riêng math-inline, math-display, formatting, TikZ.
 */
export function segmentContentDetailed(text: string, tikzKeys: string[]): WordSegment[] {
  if (!text || !text.trim()) return []

  // ─── 1. Extract TikZ/tabular → placeholder ───
  const tikzBlocks: string[] = []
  
  // Xử lý an toàn: Ưu tiên bóc tách nếu center bọc sát tikz/tabular (không có chữ khác xen vào)
  let processed = text.replace(
    /\\begin\{center\}\s*(\\begin\{(tikzpicture|tabular)\}[\s\S]*?\\end\{\2\})\s*\\end\{center\}/g,
    (_, inner) => {
      const idx = tikzBlocks.length
      tikzBlocks.push(inner.trim())
      return `__TIKZ_${idx}__`
    }
  )
  
  // Sau đó bóc tách các tikz/tabular còn lại (nếu nó đứng độc lập hoặc trong center chứa chữ)
  processed = processed.replace(
    /\\begin\{(tikzpicture|tabular)\}[\s\S]*?\\end\{\1\}/g,
    (match) => {
      const idx = tikzBlocks.length
      tikzBlocks.push(match.trim())
      return `__TIKZ_${idx}__`
    }
  )

  // ─── 2. Extract math display $$...$$ và \[...\] và align* ───
  const mathDisplayBlocks: string[] = []
  // align*, align, gather*, gather, eqnarray*
  processed = processed.replace(
    /\\begin\{(align\*?|gather\*?|eqnarray\*?|multline\*?|alignat\*?)\}[\s\S]*?\\end\{\1\}/g,
    (match) => {
      const idx = mathDisplayBlocks.length
      mathDisplayBlocks.push(match)
      return `__DMATH_${idx}__`
    }
  )
  // \[...\]
  processed = processed.replace(/\\\[([\s\S]*?)\\\]/g, (_, inner) => {
    const idx = mathDisplayBlocks.length
    mathDisplayBlocks.push(`\\[${inner}\\]`)
    return `__DMATH_${idx}__`
  })
  // $$...$$
  processed = processed.replace(/\$\$([\s\S]*?)\$\$/g, (_, inner) => {
    const idx = mathDisplayBlocks.length
    mathDisplayBlocks.push(`$$${inner}$$`)
    return `__DMATH_${idx}__`
  })

  // ─── 3. Extract math inline $...$ ───
  const mathInlineBlocks: string[] = []
  processed = processed.replace(/\$([^$]+?)\$/g, (_, inner) => {
    const idx = mathInlineBlocks.length
    mathInlineBlocks.push(inner)
    return `__IMATH_${idx}__`
  })

  // ─── 4. Parse formatting (textbf/textit/underline) + rest ───
  // Xây dựng segment array từ processed text, xử lý formatting và placeholders
  const segments = parseFormattedText(processed, tikzBlocks, mathDisplayBlocks, mathInlineBlocks, tikzKeys)

  return segments
}

/**
 * Bước cuối: phân tích formatted text đã có placeholders → WordSegment[]
 */
function parseFormattedText(
  text: string,
  tikzBlocks: string[],
  mathDisplayBlocks: string[],
  mathInlineBlocks: string[],
  tikzKeys: string[]
): WordSegment[] {
  const result: WordSegment[] = []
  let i = 0

  while (i < text.length) {
    // Kiểm tra placeholder
    const tikzMatch = text.slice(i).match(/^__TIKZ_(\d+)__/)
    if (tikzMatch) {
      const idx = parseInt(tikzMatch[1])
      const code = tikzBlocks[idx] || ''
      const key = makeTikzKey(code)
      if (!tikzKeys.includes(key)) tikzKeys.push(key)
      result.push({ type: 'tikz', code, key })
      i += tikzMatch[0].length
      continue
    }

    const dmathMatch = text.slice(i).match(/^__DMATH_(\d+)__/)
    if (dmathMatch) {
      const idx = parseInt(dmathMatch[1])
      const latex = mathDisplayBlocks[idx] || ''
      // Normalize: $$...$$ → strip $$, \[...\] → strip \[ \]
      const inner = latex
        .replace(/^\$\$([\s\S]*)\$\$$/, '$1')
        .replace(/^\\\[([\s\S]*)\\\]$/, '$1')
        .trim()
      result.push({ type: 'math-display', latex: inner })
      i += dmathMatch[0].length
      continue
    }

    const imathMatch = text.slice(i).match(/^__IMATH_(\d+)__/)
    if (imathMatch) {
      const idx = parseInt(imathMatch[1])
      result.push({ type: 'math-inline', latex: mathInlineBlocks[idx] || '' })
      i += imathMatch[0].length
      continue
    }

    // \text{...} (chỉ còn lại bên ngoài math mode)
    if (text.startsWith('\\text', i) && text[i + 5] === '{') {
      const braceStart = i + 5
      const inner = extractBalancedContent(text, braceStart)
      if (inner) {
        const children = parseFormattedText(inner.content, tikzBlocks, mathDisplayBlocks, mathInlineBlocks, tikzKeys)
        result.push(...children)
        i = inner.endIdx + 1
        continue
      }
    }

    // Kiểm tra \textbf{...}
    if (text.startsWith('\\textbf', i)) {
      const braceStart = text.indexOf('{', i + 7)
      if (braceStart !== -1 && braceStart === i + 7) {
        const inner = extractBalancedContent(text, braceStart)
        if (inner) {
          const children = parseFormattedText(inner.content, tikzBlocks, mathDisplayBlocks, mathInlineBlocks, tikzKeys)
          result.push({ type: 'bold', children })
          i = inner.endIdx + 1
          continue
        }
      }
    }

    // \textit{...}
    if (text.startsWith('\\textit', i)) {
      const braceStart = text.indexOf('{', i + 7)
      if (braceStart !== -1 && braceStart === i + 7) {
        const inner = extractBalancedContent(text, braceStart)
        if (inner) {
          const children = parseFormattedText(inner.content, tikzBlocks, mathDisplayBlocks, mathInlineBlocks, tikzKeys)
          result.push({ type: 'italic', children })
          i = inner.endIdx + 1
          continue
        }
      }
    }

    // \underline{...}
    if (text.startsWith('\\underline', i)) {
      const braceStart = text.indexOf('{', i + 10)
      if (braceStart !== -1 && braceStart === i + 10) {
        const inner = extractBalancedContent(text, braceStart)
        if (inner) {
          const children = parseFormattedText(inner.content, tikzBlocks, mathDisplayBlocks, mathInlineBlocks, tikzKeys)
          result.push({ type: 'underline', children })
          i = inner.endIdx + 1
          continue
        }
      }
    }

    // \begin{center}...\end{center}
    if (text.startsWith('\\begin{center}', i)) {
      const end = text.indexOf('\\end{center}', i)
      if (end !== -1) {
        const inner = text.slice(i + 14, end)
        const children = parseFormattedText(inner, tikzBlocks, mathDisplayBlocks, mathInlineBlocks, tikzKeys)
        result.push({ type: 'center', children })
        i = end + 12
        continue
      }
    }

    // \begin{itemize}...\end{itemize}
    if (text.startsWith('\\begin{itemize}', i)) {
      const end = text.indexOf('\\end{itemize}', i)
      if (end !== -1) {
        const inner = text.slice(i + 15, end)
        const items = inner.split('\\item').slice(1).map(item => {
          return parseFormattedText(item.trim(), tikzBlocks, mathDisplayBlocks, mathInlineBlocks, tikzKeys)
        })
        result.push({ type: 'list', ordered: false, items })
        i = end + 13
        continue
      }
    }

    // \begin{enumerate}...\end{enumerate}
    if (text.startsWith('\\begin{enumerate}', i)) {
      const end = text.indexOf('\\end{enumerate}', i)
      if (end !== -1) {
        const optEnd = text[i + 17] === '[' ? text.indexOf(']', i + 17) + 1 : i + 17
        const inner = text.slice(optEnd, end)
        const items = inner.split('\\item').slice(1).map(item => {
          return parseFormattedText(item.trim(), tikzBlocks, mathDisplayBlocks, mathInlineBlocks, tikzKeys)
        })
        result.push({ type: 'list', ordered: true, items })
        i = end + 15
        continue
      }
    }

    // \\ line break
    if (text[i] === '\\' && text[i + 1] === '\\') {
      result.push({ type: 'linebreak' })
      i += 2
      // Bỏ khoảng trắng sau \\
      while (i < text.length && text[i] !== '\n' && /[^\S\n]/.test(text[i])) i++
      continue
    }

    // Gom text thuần (đến khi gặp placeholder hoặc command đặc biệt)
    let j = i
    while (j < text.length) {
      if (text[j] === '\\') break
      if (text[j] === '_' && text.slice(j).match(/^__(TIKZ|DMATH|IMATH)_\d+__/)) break
      j++
    }
    if (j > i) {
      const textContent = text.slice(i, j)
      if (textContent) {
        // Merge vào text segment trước nếu có
        const last = result[result.length - 1]
        if (last && last.type === 'text') {
          last.content += textContent
        } else {
          result.push({ type: 'text', content: textContent })
        }
      }
      i = j
    } else {
      // Ký tự \ không khớp command nào — add raw
      const last = result[result.length - 1]
      if (last && last.type === 'text') {
        last.content += text[i]
      } else {
        result.push({ type: 'text', content: text[i] })
      }
      i++
    }
  }

  // Dọn dẹp text segments: trim nếu chỉ whitespace
  return result.filter(seg => {
    if (seg.type === 'text' && !seg.content.trim()) return false
    return true
  })
}

// ─────────────────────────────────────────────────────────────────
// MAIN PARSER
// ─────────────────────────────────────────────────────────────────

let _idCounter = 0
function generateId(): string {
  return `wq-${Date.now()}-${++_idCounter}`
}

/**
 * Parse 1 block \\begin{ex}...\\end{ex} thành WordQuestion
 */
export function parseWordQuestion(latexBlock: string): WordQuestion {
  const raw = latexBlock.trim()
  const id = generateId()
  const questionType = detectQuestionType(raw)
  const tikzKeys: string[] = []

  // 1. Bỏ \\begin{ex}%[...] ở đầu và \\end{ex} ở cuối, unwrap \\immini
  let inner = raw
    .replace(/^\\begin\{ex\}[^\n]*\n?/, '')
    .replace(/\\end\{ex\}\s*$/, '')
    .trim()
  inner = unwrapImmini(inner)

  // 2. Tách \\loigiai{...}
  let solutionRaw: string | undefined
  const loigiaiIdx = inner.indexOf('\\loigiai')
  if (loigiaiIdx !== -1) {
    let braceStart = -1
    for (let i = loigiaiIdx + 8; i < inner.length; i++) {
      if (/\s/.test(inner[i])) continue
      if (inner[i] === '{') { braceStart = i; break }
      break
    }
    if (braceStart !== -1) {
      const result = extractBalancedContent(inner, braceStart)
      if (result) {
        solutionRaw = result.content.trim()
        
        // Convert \begin{itemchoice} \itemch ... \end{itemchoice} to a), b)...
        solutionRaw = solutionRaw.replace(/\\begin\{itemchoice\}([\s\S]*?)\\end\{itemchoice\}/g, (match, innerText) => {
          let index = 0
          const labels = ['a)', 'b)', 'c)', 'd)', 'e)', 'f)', 'g)', 'h)']
          return innerText.replace(/\\itemch\b/g, () => {
            const label = labels[index] || '*'
            index++
            return `\n${label} `
          }).trim()
        })

        inner = inner.slice(0, loigiaiIdx).trim()
      }
    }
  }

  // 3. Parse theo loại câu hỏi
  let questionBodyRaw = ''
  let choices: WordChoice[] | undefined
  let tfStatements: WordTFStatement[] | undefined
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
        const choiceTikzKeys: string[] = []
        const segments = segmentContentDetailed(content, choiceTikzKeys)
        choiceTikzKeys.forEach(k => { if (!tikzKeys.includes(k)) tikzKeys.push(k) })
        return { label: labels[idx], segments, isCorrect }
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
        const stmtTikzKeys: string[] = []
        const segments = segmentContentDetailed(content, stmtTikzKeys)
        stmtTikzKeys.forEach(k => { if (!tikzKeys.includes(k)) tikzKeys.push(k) })
        return { label: labels[idx], segments, isTrue }
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
            .replace(/\{,\}/g, ',').replace(/\{;\}/g, ';').replace(/\\,/g, '')
            .replace(/^\$+/, '').replace(/\$+$/, '').trim()
        }
      }
    } else {
      questionBodyRaw = inner
    }

  } else {
    questionBodyRaw = inner
  }

  // 4. Segment body + solution
  const bodyTikzKeys: string[] = []
  const bodySegments = segmentContentDetailed(questionBodyRaw, bodyTikzKeys)
  bodyTikzKeys.forEach(k => { if (!tikzKeys.includes(k)) tikzKeys.push(k) })

  let solutionSegments: WordSegment[] | undefined
  if (solutionRaw) {
    const solTikzKeys: string[] = []
    solutionSegments = segmentContentDetailed(solutionRaw, solTikzKeys)
    solTikzKeys.forEach(k => { if (!tikzKeys.includes(k)) tikzKeys.push(k) })
  }

  return {
    id,
    questionType,
    bodySegments,
    choices,
    tfStatements,
    shortAnswer,
    solutionSegments,
    tikzKeys,
    rawLatex: raw,
  }
}

/**
 * Parse toàn bộ text LaTeX thành mảng WordQuestion[]
 */
export function parseAllWordQuestions(rawText: string): WordQuestion[] {
  const cleaned = preprocessWordTexContent(rawText)
  const blocks = extractExBlocks(cleaned)
  return blocks.map(block => parseWordQuestion(block))
}
