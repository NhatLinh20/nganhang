// src/lib/word-latex-builder.ts
// Build file LaTeX chuẩn (clean) từ WordQuestion[] — file này pandoc convert thành .docx
// Output: 2 phiên bản per mã đề: đề thuần và đề + lời giải

import { expandMacros } from './latex-parser/latex-math-expander'
import type { WordQuestion, WordSegment } from './latex-parser/word-parser'

// ─────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────

export interface ExamHeader {
  /** 8 nhãn header giống export-zip: [Sở, Trường, 'Đề chính thức', '(Đề thi gồm...)', Tiêu đề, Môn, Thời gian, Ghi chú] */
  labels: string[]
  styles?: { bold?: boolean; italic?: boolean; underline?: boolean }[]
  examCode: string
  duration: number
  grade: number
}

export interface BuildLatexOptions {
  header: ExamHeader
  questions: WordQuestion[]
  /** Map từ tikz key → đường dẫn tương đối trong ZIP (VD: 'images/tikz_abc.png') */
  imagePaths: Map<string, string>
  includeSolution?: boolean
  includeAnswerTable?: boolean
}

// ─────────────────────────────────────────────────────────────────
// SEGMENT → LaTeX RENDERER
// ─────────────────────────────────────────────────────────────────

function renderSegments(segments: WordSegment[], imagePaths: Map<string, string>): string {
  return segments.map(seg => renderSegment(seg, imagePaths)).join('')
}

function renderSegment(seg: WordSegment, imagePaths: Map<string, string>): string {
  switch (seg.type) {
    case 'text':
      return expandMacros(seg.content)

    case 'math-inline':
      return `$${expandMacros(seg.latex).trim()}$`

    case 'math-display': {
      const latex = expandMacros(seg.latex).trim()
      // align, gather, multline là các môi trường có sẵn mode toán
      if (/^\\begin\{(align|gather|multline)/.test(latex)) {
        return `\n${latex}\n`
      }
      return `\n$$${latex}$$\n`
    }

    case 'tikz': {
      const imgPath = imagePaths.get(seg.key)
      if (imgPath) {
        return `\n\\begin{center}\n\\includegraphics[width=0.6\\textwidth]{${imgPath}}\n\\end{center}\n`
      }
      // Hình không compile được → placeholder comment
      return `\n% [Hình TikZ không compile được: ${seg.key}]\n`
    }

    case 'bold':
      return `\\textbf{${renderSegments(seg.children, imagePaths)}}`

    case 'italic':
      return `\\textit{${renderSegments(seg.children, imagePaths)}}`

    case 'underline':
      return `\\underline{${renderSegments(seg.children, imagePaths)}}`

    case 'linebreak':
      return '\\\\\n'

    case 'center':
      return `\n\\begin{center}\n${renderSegments(seg.children, imagePaths)}\n\\end{center}\n`

    case 'list': {
      const env = seg.ordered ? 'enumerate' : 'itemize'
      const items = seg.items.map(item => `  \\item ${renderSegments(item, imagePaths)}`).join('\n')
      return `\n\\begin{${env}}\n${items}\n\\end{${env}}\n`
    }

    default:
      return ''
  }
}

// ─────────────────────────────────────────────────────────────────
// HEADER BUILDER
// ─────────────────────────────────────────────────────────────────

function buildHeader(header: ExamHeader): string {
  const { labels, styles, examCode, duration, grade } = header
  const l = labels.length >= 8 ? labels : [
    'SỞ GDĐT ...',
    'TRƯỜNG THPT ...',
    'Đề chính thức',
    '',
    'ĐỀ KIỂM TRA',
    `MÔN TOÁN ${grade}`,
    `THỜI GIAN: ${duration} PHÚT`,
    '(Không kể thời gian phát đề)',
  ]

  function applyStyle(text: string, idx: number): string {
    if (!styles || !styles[idx]) return text
    const s = styles[idx]
    let t = text
    if (s.underline) t = `\\underline{${t}}`
    if (s.italic) t = `\\textit{${t}}`
    if (s.bold) t = `\\textbf{${t}}`
    return t
  }

  return [
    '\\begin{center}',
    '\\begin{tabular}{p{0.4\\textwidth}p{0.6\\textwidth}}',
    `\\textbf{${applyStyle(l[0], 0)}} & ${applyStyle(l[4], 4)} \\tabularnewline`,
    `\\textbf{${applyStyle(l[1], 1)}} & \\textbf{${applyStyle(l[5], 5)}} \\tabularnewline`,
    `\\textbf{${applyStyle(l[2], 2)}} & \\textit{${applyStyle(l[6], 6)}, ${l[7].toLowerCase()}} \\tabularnewline`,
    `\\textit{${l[3] || '(Đề thi gồm có .... trang)'}} & \\tabularnewline`,
    `Họ và tên: ...................................................................................... \\newline Số báo danh: .................................................................................. & \\textbf{Mã đề: ${examCode}} \\tabularnewline`,
    '\\end{tabular}',
    '\\end{center}',
    '\\vspace{0.5cm}',
  ].join('\n')
}

function appendDotIfMissing(text: string): string {
  const t = text.trimEnd()
  if (!t) return text
  if (t.endsWith('.') || t.endsWith('?') || t.endsWith('!') || t.endsWith(';')) return text
  if (t.endsWith('\\end{center}') || t.endsWith('\\end{itemize}') || t.endsWith('\\end{enumerate}')) return text
  return t + '.'
}

// ─────────────────────────────────────────────────────────────────
// QUESTION RENDERER
// ─────────────────────────────────────────────────────────────────

function renderQuestion(q: WordQuestion, num: number, imagePaths: Map<string, string>): string {
  const lines: string[] = []

  // Body
  const bodyText = renderSegments(q.bodySegments, imagePaths)
  lines.push(`\\noindent\\textcolor{blue}{\\textbf{Câu ${num}.}} ${bodyText}`)
  lines.push('')

  if (q.questionType === 'multiple_choice' && q.choices) {
    const choiceTexts = q.choices.map(c => {
      const text = renderSegments(c.segments, imagePaths)
      return `\\textbf{${c.label}.}~${appendDotIfMissing(text)}`
    })
    
    const c0 = choiceTexts[0] || ''
    const c1 = choiceTexts[1] || ''
    const c2 = choiceTexts[2] || ''
    const c3 = choiceTexts[3] || ''
    
    const rawLengths = q.choices.map(c => c.segments.reduce((acc, seg) => {
      const str = ((seg as unknown as {content?: string}).content || (seg as unknown as {latex?: string}).latex || '') as string
      let len = str.length
      // Các lệnh toán học render ra Word sẽ to hơn chiều dài chuỗi text
      if (str.includes('\\frac')) len += 15
      if (str.includes('\\int')) len += 10
      if (str.includes('\\sum')) len += 10
      if (str.includes('\\lim')) len += 10
      if (str.includes('^') || str.includes('_')) len += 3
      return acc + len
    }, 0))
    const maxLen = Math.max(...rawLengths, 0)
    
    // Câu 2 (ngắn) -> 4 cột. Câu 4 (dài) -> 1 cột
    if (maxLen <= 30) {
      // 4 cột (tương đương tab 0, 4.25, 8.5, 12.75 trên trang 17cm)
      lines.push('\\noindent\\begin{tabular}{p{0.25\\linewidth} p{0.25\\linewidth} p{0.25\\linewidth} p{0.25\\linewidth}}')
      lines.push(`${c0} & ${c1} & ${c2} & ${c3} \\\\`)
      lines.push('\\end{tabular}')
    } else if (maxLen <= 60) {
      // 2 cột (tương đương tab 0, 8.5)
      lines.push('\\noindent\\begin{tabular}{p{0.5\\linewidth} p{0.5\\linewidth}}')
      lines.push(`${c0} & ${c1} \\\\`)
      lines.push(`${c2} & ${c3} \\\\`)
      lines.push('\\end{tabular}')
    } else {
      // 1 cột
      lines.push('\\noindent\\begin{tabular}{p{\\linewidth}}')
      lines.push(`${c0} \\\\`)
      lines.push(`${c1} \\\\`)
      lines.push(`${c2} \\\\`)
      lines.push(`${c3} \\\\`)
      lines.push('\\end{tabular}')
    }
    lines.push('')
  }

  if (q.questionType === 'true_false' && q.tfStatements) {
    for (const s of q.tfStatements) {
      const text = renderSegments(s.segments, imagePaths)
      lines.push(`\\noindent ${s.label})~${appendDotIfMissing(text)}`)
      lines.push('') // Bắt buộc xuống dòng thành paragraph mới trong Word
    }
  }



  return lines.join('\n')
}

function renderSolutionQuestion(q: WordQuestion, num: number, imagePaths: Map<string, string>): string {
  const lines: string[] = []
  lines.push(`\\noindent\\textcolor{blue}{\\textbf{Câu ${num}.}}`)
  lines.push('')

  // Đáp án đúng
  if (q.questionType === 'multiple_choice' && q.choices) {
    const correct = q.choices.find(c => c.isCorrect)
    if (correct) lines.push(`\\noindent \\textbf{Đáp án ${correct.label}.}`)
    lines.push('')
  }
  if (q.questionType === 'true_false' && q.tfStatements) {
    const ans = q.tfStatements.map(s => s.isTrue ? 'Đ' : 'S').join('')
    lines.push(`\\noindent \\textbf{Đáp án: ${ans}}`)
    lines.push('')
  }
  if (q.questionType === 'short_answer' && q.shortAnswer) {
    lines.push(`\\noindent \\textbf{Đáp số: ${q.shortAnswer}}`)
    lines.push('')
  }

  // Lời giải
  if (q.solutionSegments && q.solutionSegments.length > 0) {
    const solText = renderSegments(q.solutionSegments, imagePaths)
    
    lines.push(`\\noindent\\textbf{Lời giải.}`)
    lines.push('')
    lines.push(solText.trim())
  }

  lines.push('')



  lines.push('\\medskip')
  return lines.join('\n')
}

// ─────────────────────────────────────────────────────────────────
// PREAMBLE + DOCUMENT STRUCTURE
// ─────────────────────────────────────────────────────────────────

const PREAMBLE = `\\documentclass[12pt,a4paper]{article}
\\usepackage[utf8]{inputenc}
\\usepackage{amsmath,amssymb}
\\usepackage{graphicx}
\\usepackage[left=1.5cm,right=1cm,top=1.3cm,bottom=1.3cm]{geometry}
\\usepackage{lastpage}
% Font Times New Roman (cần XeLaTeX + fontspec — uncomment nếu VPS hỗ trợ):
% \\usepackage{fontspec}
% \\setmainfont{Times New Roman}
`

// ─────────────────────────────────────────────────────────────────
// SECTION HEADERS (PHẦN I, II, III)
// ─────────────────────────────────────────────────────────────────

function buildSectionHeaders(questions: WordQuestion[]): { part: number; label: string; intro: string }[] {
  const mcCount = questions.filter(q => q.questionType === 'multiple_choice').length
  const tfCount = questions.filter(q => q.questionType === 'true_false').length
  const saCount = questions.filter(q => q.questionType === 'short_answer').length
  const esCount = questions.filter(q => q.questionType === 'essay').length

  const parts: { part: number; label: string; intro: string }[] = []
  if (mcCount > 0) {
    parts.push({ part: 1, label: 'PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn.', intro: `Thí sinh trả lời từ câu 1 đến câu ${mcCount}. Mỗi câu thí sinh chỉ chọn một phương án.` })
  }
  if (tfCount > 0) {
    parts.push({ part: 2, label: 'PHẦN II. Câu trắc nghiệm đúng sai.', intro: `Thí sinh trả lời từ câu 1 đến câu ${tfCount}. Trong mỗi ý, thí sinh chọn đúng (Đ) hoặc sai (S).` })
  }
  if (saCount > 0) {
    parts.push({ part: 3, label: 'PHẦN III. Câu trả lời ngắn.', intro: `Thí sinh trả lời từ câu 1 đến câu ${saCount}.` })
  }
  if (esCount > 0) {
    parts.push({ part: 4, label: 'PHẦN IV. Câu tự luận.', intro: `Thí sinh trả lời từ câu 1 đến câu ${esCount}.` })
  }
  return parts
}

// ─────────────────────────────────────────────────────────────────
// MAIN BUILD FUNCTION
// ─────────────────────────────────────────────────────────────────


function buildAnswerTable(questions: WordQuestion[]): string {
  const mcQs = questions.filter(q => q.questionType === 'multiple_choice')
  const tfQs = questions.filter(q => q.questionType === 'true_false')
  const saQs = questions.filter(q => q.questionType === 'short_answer')
  
  if (mcQs.length === 0 && tfQs.length === 0 && saQs.length === 0) return ''

  const lines: string[] = []
  lines.push('\\vspace{1cm}')
  lines.push('\\begin{center}')
  lines.push('\\Large BẢNG ĐÁP ÁN')
  lines.push('\\end{center}')
  lines.push('')

  if (mcQs.length > 0) {
    lines.push('\\noindent PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn')
    lines.push('')
    const mcAns: string[] = []
    for (let i = 0; i < mcQs.length; i++) {
       const q = mcQs[i]
       const correctChoice = q.choices?.find(ch => ch.isCorrect)?.label || ''
       mcAns.push(`${i + 1}${correctChoice}`)
    }
    lines.push('\\noindent ' + mcAns.join(', '))
    lines.push('')
  }

  if (tfQs.length > 0) {
    lines.push('\\noindent PHẦN II. Câu trắc nghiệm đúng sai')
    lines.push('')
    for (let i = 0; i < tfQs.length; i++) {
       const q = tfQs[i]
       const ans = q.tfStatements?.map(s => s.isTrue ? 'Đ' : 'S').join('') || ''
       lines.push(`\\noindent Câu ${i + 1}. ${ans}`)
       lines.push('')
    }
  }

  if (saQs.length > 0) {
    lines.push('\\noindent PHẦN III. Câu trả lời ngắn')
    lines.push('')
    for (let i = 0; i < saQs.length; i++) {
       const q = saQs[i]
       const ans = q.shortAnswer || ''
       lines.push(`\\noindent Câu ${i + 1}. ${ans}`)
       lines.push('')
    }
  }

  return lines.join('\n')
}

function fixPandocCenterline(tex: string): string {
  // Pandoc sẽ crash (exit 64) nếu có block \begin{center} nằm trong \centerline{}
  return tex.replace(/\\centerline\{\s*\\begin\{center\}([\s\S]*?)\\end\{center\}\s*\}/g, '\\begin{center}$1\\end{center}')
}

/**
 * Build file LaTeX chuẩn (đề thuần, không lời giải).
 * Pandoc sẽ convert file này thành .docx.
 */
export function buildExamLatex(options: BuildLatexOptions): string {
  const { header, questions, imagePaths } = options

  const sections = buildSectionHeaders(questions)
  const lines: string[] = [PREAMBLE, '\\begin{document}', '']

  // Header đề thi
  lines.push(buildHeader(header))
  lines.push('')

  // Câu hỏi theo phần
  const partOrder: ('multiple_choice' | 'true_false' | 'short_answer' | 'essay')[] = [
    'multiple_choice', 'true_false', 'short_answer', 'essay'
  ]

  for (const type of partOrder) {
    const partQs = questions.filter(q => q.questionType === type)
    if (partQs.length === 0) continue

    let qNum = 0

    const sectionInfo = sections.find(s => {
      if (type === 'multiple_choice') return s.part === 1
      if (type === 'true_false') return s.part === 2
      if (type === 'short_answer') return s.part === 3
      return s.part === 4
    })

    if (sectionInfo) {
      lines.push(`\\noindent\\textbf{${sectionInfo.label}}`)
      lines.push(sectionInfo.intro)
      lines.push('')
      lines.push('\\medskip')
      lines.push('')
    }

    for (const q of partQs) {
      qNum++
      lines.push(renderQuestion(q, qNum, imagePaths))
    }
  }

  // HẾT
  lines.push('')
  lines.push('\\textbf{------------ HẾT ------------}')
  if (options.includeAnswerTable) {
    lines.push(buildAnswerTable(questions))
  }
  lines.push('\\label{lastpage}')

  lines.push('')
  lines.push('\\end{document}')
  
  return fixPandocCenterline(lines.join('\n'))
}

/**
 * Build file LaTeX lời giải (_loigiai version).
 * Chỉ xuất nội dung lời giải, không xuất lại toàn bộ đề thi để tiết kiệm giấy.
 * Có tiêu đề cho từng phần.
 */
export function buildExamWithSolutionLatex(options: BuildLatexOptions): string {
  const { header, questions, imagePaths } = options

  const sections = buildSectionHeaders(questions)
  const lines: string[] = [PREAMBLE, '\\begin{document}', '']

  // Header đề thi
  lines.push(buildHeader(header))
  lines.push('')

  lines.push('\\begin{center}')
  lines.push('{\\Large\\textbf{ĐÁP ÁN VÀ LỜI GIẢI}}')
  lines.push('\\end{center}')
  lines.push('')

  const partOrder: ('multiple_choice' | 'true_false' | 'short_answer' | 'essay')[] = [
    'multiple_choice', 'true_false', 'short_answer', 'essay'
  ]

  for (const type of partOrder) {
    const partQs = questions.filter(q => q.questionType === type)
    if (partQs.length === 0) continue

    const sectionInfo = sections.find(s => {
      if (type === 'multiple_choice') return s.part === 1
      if (type === 'true_false') return s.part === 2
      if (type === 'short_answer') return s.part === 3
      return s.part === 4
    })

    if (sectionInfo) {
      lines.push(`\\noindent\\textbf{${sectionInfo.label}}`)
      lines.push('')
      lines.push('\\medskip')
      lines.push('')
    }

    let qNum = 0
    for (const q of partQs) {
      qNum++
      lines.push(renderSolutionQuestion(q, qNum, imagePaths))
    }
  }

  lines.push('')
  if (options.includeAnswerTable) {
    lines.push(buildAnswerTable(questions))
  }
  lines.push('\\end{document}')

  return fixPandocCenterline(lines.join('\n'))
}
