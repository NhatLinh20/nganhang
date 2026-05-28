// src/app/api/export-zip/route.ts
import { NextRequest, NextResponse } from 'next/server'
import * as fs from 'fs'
import * as path from 'path'
import AdmZip from 'adm-zip'

interface ExamQuestion {
  id: string
  latex_content: string
  question_type: string
  correct_answer?: string
  phan?: number
}

// ─── Answer Extraction ────────────────────────────────────────────────────────

/** Extract answer from correct_answer field or parse from LaTeX as fallback */
function getAnswer(q: ExamQuestion): string {
  if (q.correct_answer && q.correct_answer.trim()) return q.correct_answer.trim()
  return parseAnswerFromLatex(q)
}

function parseAnswerFromLatex(q: ExamQuestion): string {
  const latex = q.latex_content || ''
  switch (q.question_type) {
    case 'multiple_choice': return parseMCAnswer(latex)
    case 'short_answer':    return parseSAAnswer(latex)
    case 'true_false':      return parseTFAnswer(latex)
    default:                return ''
  }
}

function parseMCAnswer(latex: string): string {
  const choiceIdx = latex.indexOf('\\choice')
  if (choiceIdx === -1) return ''
  let pos = choiceIdx + 7
  let optionIdx = 0
  while (pos < latex.length && optionIdx < 4) {
    while (pos < latex.length && /\s/.test(latex[pos])) pos++
    if (latex[pos] !== '{') break
    let depth = 0; let start = pos; let content = ''
    while (pos < latex.length) {
      if (latex[pos] === '{') depth++
      else if (latex[pos] === '}') { depth--; if (depth === 0) { content = latex.slice(start + 1, pos); pos++; break } }
      pos++
    }
    if (content.includes('\\True')) return ['A', 'B', 'C', 'D'][optionIdx] ?? ''
    optionIdx++
  }
  return ''
}

function parseSAAnswer(latex: string): string {
  const m = latex.match(/\\shortans(?:\[[^\]]*\])?\{([^}]+)\}/)
  return m ? m[1].trim() : ''
}

function parseTFAnswer(latex: string): string {
  // Try to find Đ/S patterns in the LaTeX - return empty string as fallback
  // TF answers are typically stored in correct_answer field
  return ''
}

// ─── Minimal XLSX Builder (pure XML, no external lib) ─────────────────────────

function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

type CellValue = string | number | null

function colName(idx: number): string {
  let name = ''
  let n = idx + 1
  while (n > 0) {
    const rem = (n - 1) % 26
    name = String.fromCharCode(65 + rem) + name
    n = Math.floor((n - 1) / 26)
  }
  return name
}

function buildXlsx(sheets: { name: string; data: CellValue[][]; merges?: { r: number; c: number; rc: number; cc: number }[]; freezeCols?: number }[]): Buffer {
  const sharedStrings: string[] = []
  const ssiMap = new Map<string, number>()

  function getSSI(val: string): number {
    if (ssiMap.has(val)) return ssiMap.get(val)!
    const idx = sharedStrings.length
    sharedStrings.push(val)
    ssiMap.set(val, idx)
    return idx
  }

  const sheetsXml: string[] = sheets.map((sheet) => {
    let rowsXml = ''
    sheet.data.forEach((row, ri) => {
      let cellsXml = ''
      row.forEach((val, ci) => {
        if (val === null || val === undefined || val === '') return
        const addr = `${colName(ci)}${ri + 1}`
        if (typeof val === 'number') {
          cellsXml += `<c r="${addr}" t="n"><v>${val}</v></c>`
        } else {
          const idx = getSSI(String(val))
          cellsXml += `<c r="${addr}" t="s"><v>${idx}</v></c>`
        }
      })
      if (cellsXml) rowsXml += `<row r="${ri + 1}">${cellsXml}</row>`
    })

    let mergesXml = ''
    if (sheet.merges && sheet.merges.length > 0) {
      const refs = sheet.merges.map(m => `<mergeCell ref="${colName(m.c)}${m.r + 1}:${colName(m.cc)}${m.rc + 1}"/>`)
      mergesXml = `<mergeCells count="${refs.length}">${refs.join('')}</mergeCells>`
    }

    // Freeze pane for N columns from left
    const freezeXml = (sheet.freezeCols && sheet.freezeCols > 0)
      ? `<sheetViews><sheetView workbookViewId="0"><pane xSplit="${sheet.freezeCols}" ySplit="0" topLeftCell="${colName(sheet.freezeCols)}1" activePane="topRight" state="frozen"/><selection pane="topRight"/></sheetView></sheetViews>`
      : ''

    return `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
${freezeXml}<sheetData>${rowsXml}</sheetData>${mergesXml}
</worksheet>`
  })

  const ssXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${sharedStrings.length}" uniqueCount="${sharedStrings.length}">
${sharedStrings.map(s => `<si><t xml:space="preserve">${esc(s)}</t></si>`).join('')}
</sst>`

  const sheetsRels = sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
  const sheetEntries = sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${sheetEntries}</sheets>
</workbook>`

  const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${sheetsRels}
<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
</Relationships>`

  const contentTypes = [
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`,
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>`,
    `<Default Extension="xml" ContentType="application/xml"/>`,
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>`,
    ...sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`),
    `<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>`,
    `</Types>`
  ].join('')

  const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`

  const zip = new AdmZip()
  zip.addFile('[Content_Types].xml', Buffer.from(contentTypes, 'utf-8'))
  zip.addFile('_rels/.rels', Buffer.from(relsXml, 'utf-8'))
  zip.addFile('xl/workbook.xml', Buffer.from(workbookXml, 'utf-8'))
  zip.addFile('xl/_rels/workbook.xml.rels', Buffer.from(workbookRelsXml, 'utf-8'))
  zip.addFile('xl/sharedStrings.xml', Buffer.from(ssXml, 'utf-8'))
  sheets.forEach((_, i) => {
    zip.addFile(`xl/worksheets/sheet${i + 1}.xml`, Buffer.from(sheetsXml[i], 'utf-8'))
  })
  return zip.toBuffer()
}

// ─── TNMaker Excel ────────────────────────────────────────────────────────────
/**
 * Cấu trúc TNMaker:
 * - Row 1: "Câu/Mã đề" | code1 | code2 | ...
 * - Rows MC: số câu | A/B/C/D per exam
 * - Rows TF: số câu | ĐSĐS per exam
 * - Rows SA: số câu | number per exam
 */
function generateTNMakerExcel(examSets: ExamQuestion[][], examCodes: string[]): Buffer {
  // Collect ordered questions from phan grouping
  // We'll use first exam's structure as canonical order
  const canonical = examSets[0] ?? []
  const mcQs   = canonical.filter(q => q.question_type === 'multiple_choice')
  const tfQs   = canonical.filter(q => q.question_type === 'true_false')
  const saQs   = canonical.filter(q => q.question_type === 'short_answer')

  const dataRows: CellValue[][] = []

  // Header row
  const header: CellValue[] = ['Câu/Mã đề']
  for (const code of examCodes) header.push(code)
  dataRows.push(header)

  let globalQ = 1

  // MC rows
  for (let qi = 0; qi < mcQs.length; qi++, globalQ++) {
    const row: CellValue[] = [globalQ]
    for (const qs of examSets) {
      const q = qs.filter(x => x.question_type === 'multiple_choice')[qi]
      row.push(q ? getAnswer(q) : '')
    }
    dataRows.push(row)
  }

  // TF rows
  for (let qi = 0; qi < tfQs.length; qi++, globalQ++) {
    const row: CellValue[] = [globalQ]
    for (const qs of examSets) {
      const q = qs.filter(x => x.question_type === 'true_false')[qi]
      if (!q) { row.push(''); continue }
      const ans = getAnswer(q) // e.g. "ĐSĐS"
      row.push(ans)
    }
    dataRows.push(row)
  }

  // SA rows
  for (let qi = 0; qi < saQs.length; qi++, globalQ++) {
    const row: CellValue[] = [globalQ]
    for (const qs of examSets) {
      const q = qs.filter(x => x.question_type === 'short_answer')[qi]
      row.push(q ? getAnswer(q) : '')
    }
    dataRows.push(row)
  }

  return buildXlsx([{ name: 'Dữ liệu', data: dataRows }])
}

// ─── AZOTA Excel ──────────────────────────────────────────────────────────────
/**
 * Cấu trúc AZOTA:
 * - Row 1: "Câu hỏi" | merged "Mã đề thi"
 * - Row 2: "" | 001 | 002 | ...
 * - Rows 3+: question number | answer per exam
 */
function generateAZOTAExcel(examSets: ExamQuestion[][], examCodes: string[]): Buffer {
  const canonical = examSets[0] ?? []
  const mcQs = canonical.filter(q => q.question_type === 'multiple_choice')
  const tfQs = canonical.filter(q => q.question_type === 'true_false')
  const saQs = canonical.filter(q => q.question_type === 'short_answer')
  const esQs = canonical.filter(q => q.question_type === 'essay')

  const n = examCodes.length

  const dataRows: CellValue[][] = []

  // Row 1: "Câu hỏi" + "Mã đề thi" (merged across exam columns)
  const row1: CellValue[] = ['Câu hỏi', 'Mã đề thi']
  for (let i = 1; i < n; i++) row1.push(null)
  dataRows.push(row1)

  // Row 2: null (merged with A1 via A1:A2) + exam codes
  const row2: CellValue[] = [null]
  for (const code of examCodes) row2.push(code)
  dataRows.push(row2)

  let globalQ = 1

  // MC rows
  for (let qi = 0; qi < mcQs.length; qi++, globalQ++) {
    const row: CellValue[] = [globalQ]
    for (const qs of examSets) {
      const q = qs.filter(x => x.question_type === 'multiple_choice')[qi]
      row.push(q ? getAnswer(q) : '')
    }
    dataRows.push(row)
  }

  // TF rows
  for (let qi = 0; qi < tfQs.length; qi++, globalQ++) {
    const row: CellValue[] = [globalQ]
    for (const qs of examSets) {
      const q = qs.filter(x => x.question_type === 'true_false')[qi]
      if (!q) { row.push(''); continue }
      // AZOTA hiển thị dạng "ĐĐSe" - giữ nguyên từ correct_answer
      row.push(getAnswer(q))
    }
    dataRows.push(row)
  }

  // SA rows
  for (let qi = 0; qi < saQs.length; qi++, globalQ++) {
    const row: CellValue[] = [globalQ]
    for (const qs of examSets) {
      const q = qs.filter(x => x.question_type === 'short_answer')[qi]
      row.push(q ? getAnswer(q) : '')
    }
    dataRows.push(row)
  }

  // Essay rows
  for (let qi = 0; qi < esQs.length; qi++, globalQ++) {
    const row: CellValue[] = [globalQ]
    for (let ei = 0; ei < n; ei++) row.push('Tự luận')
    dataRows.push(row)
  }

  // Merges:
  // 1. A1:A2 — "Câu hỏi" merge dọc 2 dòng
  // 2. B1:(B+n)1 — "Mã đề thi" merge ngang theo số đề
  const merges: { r: number; c: number; rc: number; cc: number }[] = [
    { r: 0, c: 0, rc: 1, cc: 0 },        // A1:A2 dọc
  ]
  if (n >= 1) {
    merges.push({ r: 0, c: 1, rc: 0, cc: n }) // B1:(n+1)1 ngang
  }

  return buildXlsx([{ name: 'Dữ liệu', data: dataRows, merges }])
}

// ─── OLM Excel ────────────────────────────────────────────────────────────────
/**
 * Cấu trúc OLM — layout CỐ ĐỊNH khớp chính xác bảng mẫu:
 * - Col A (0): Label/Mã đề — FROZEN
 * - Phần I  B→AO  (cols 1-40):  40 slots MC, điểm 0.25/câu
 * - Phần II AP→BU (cols 41-72): 32 slots TF (8 câu × 4 sub a/b/c/d), điểm 0.1/0.25/0.5/1
 * - Phần III BV→CA (cols 73-78): 6 slots SA, điểm 0.5/câu
 * Các slot chưa có câu hỏi → ô trống (không điền gì)
 */
function generateOLMExcel(examSets: ExamQuestion[][], examCodes: string[]): Buffer {
  const canonical = examSets[0] ?? []
  const mcQs = canonical.filter(q => q.question_type === 'multiple_choice')
  const tfQs = canonical.filter(q => q.question_type === 'true_false')
  const saQs = canonical.filter(q => q.question_type === 'short_answer')

  const nMC = Math.min(mcQs.length, 40)
  const nTF = Math.min(tfQs.length, 8)
  const nSA = Math.min(saQs.length, 6)

  // ── FIXED column positions (0-indexed) ────────────────────────────────────
  const TOTAL_COLS = 79    // A(0) + 40 MC + 32 TF + 6 SA = 79 columns

  const MC_START  = 1      // B  (col index 1)
  const MC_END    = 40     // AO (col index 40) — 40 slots
  const TF_START  = 41     // AP (col index 41)
  const TF_END    = 72     // BU (col index 72) — 32 slots = 8 questions × 4
  const SA_START  = 73     // BV (col index 73)
  const SA_END    = 78     // CA (col index 78) — 6 slots

  const TF_Q_MAX  = 8      // max 8 TF questions
  const SA_Q_MAX  = 6      // max 6 SA questions

  // ── Row 0: Section headers (always present, merged across full section) ───
  const row0: CellValue[] = Array(TOTAL_COLS).fill(null) as CellValue[]
  row0[MC_START] = 'Phần I: Mỗi câu 0.25đ'
  row0[TF_START] = 'Phần II: Mỗi câu tối đa 1đ: đúng 1 ý 0.1đ, đúng 2 ý: 0.25đ, đúng 3 ý: 0.5đ, đúng 4 ý: 1đ'
  row0[SA_START] = 'Phần III: Toán 0.5đ, các môn khác: 0.25đ'

  // ── Row 1: Question identifiers (always fill all 40+32+6 slots) ──────────
  const row1: CellValue[] = Array(TOTAL_COLS).fill(null) as CellValue[]
  // MC: 1, 2, 3, ..., 40 (show all 40 numbers)
  for (let i = 0; i < 40; i++) row1[MC_START + i] = i + 1
  // TF: 1a, 1b, 1c, 1d, 2a, ..., 8d (show all 32 sub-question labels)
  for (let qi = 0; qi < TF_Q_MAX; qi++) {
    const base = TF_START + qi * 4
    ;['a', 'b', 'c', 'd'].forEach((sub, si) => { row1[base + si] = `${qi + 1}${sub}` })
  }
  // SA: Câu 1, Câu 2, ..., Câu 6 (show all 6 labels)
  for (let i = 0; i < SA_Q_MAX; i++) row1[SA_START + i] = `Câu ${i + 1}`

  // ── Row 2: Scores (only fill slots that have actual questions) ────────────
  const row2: CellValue[] = Array(TOTAL_COLS).fill(null) as CellValue[]
  row2[0] = 'Điểm'
  for (let i = 0; i < nMC; i++) row2[MC_START + i] = 0.25
  for (let qi = 0; qi < nTF; qi++) {
    const base = TF_START + qi * 4
    ;[0.1, 0.25, 0.5, 1].forEach((score, si) => { row2[base + si] = score })
  }
  for (let i = 0; i < nSA; i++) row2[SA_START + i] = 0.5

  // ── Answer rows: one row per exam ────────────────────────────────────────
  const answerRows: CellValue[][] = examSets.map((qs, ei) => {
    const row: CellValue[] = Array(TOTAL_COLS).fill(null) as CellValue[]
    row[0] = examCodes[ei] ?? `Đề ${ei + 1}`

    const mcList = qs.filter(q => q.question_type === 'multiple_choice').slice(0, 40)
    const tfList = qs.filter(q => q.question_type === 'true_false').slice(0, 8)
    const saList = qs.filter(q => q.question_type === 'short_answer').slice(0, 6)

    // MC: A/B/C/D in their fixed slots
    mcList.forEach((q, i) => { row[MC_START + i] = getAnswer(q) })

    // TF: split "ĐSĐS" into 4 individual cells per question
    tfList.forEach((q, qi) => {
      const base = TF_START + qi * 4
      const ans = getAnswer(q)
      for (let si = 0; si < 4; si++) {
        row[base + si] = ans.length > si ? ans[si] : ''
      }
    })

    // SA: numeric value in their fixed slots
    saList.forEach((q, i) => { row[SA_START + i] = getAnswer(q) })

    return row
  })

  const allRows = [row0, row1, row2, ...answerRows]

  // ── Merges: section headers always span their full fixed ranges ──────────
  const merges = [
    { r: 0, c: MC_START, rc: 0, cc: MC_END },   // B1:AO1
    { r: 0, c: TF_START, rc: 0, cc: TF_END },   // AP1:BU1
    { r: 0, c: SA_START, rc: 0, cc: SA_END },   // BV1:CA1
  ]

  // Freeze column A (1 column from left)
  return buildXlsx([{ name: 'Toán', data: allRows, merges, freezeCols: 1 }])
}


// ─── LaTeX Content Builder ────────────────────────────────────────────────────

function buildMaTranTex(
  questions: ExamQuestion[],
  title: string,
  grade: number,
  examLabel?: string,
  headerLabels?: string[],
  examCode?: string,
  headerStyles?: { bold?: boolean; italic?: boolean; underline?: boolean; color?: string }[],
  includeAnswerTable: boolean = true
): string {
  const grouped: Record<number, ExamQuestion[]> = {}
  for (const q of questions) {
    const phan = q.phan ?? 1
    if (!grouped[phan]) grouped[phan] = []
    grouped[phan].push(q)
  }

  let tex = ''

  const labels = headerLabels && headerLabels.length === 8
    ? headerLabels
    : [
        'SỞ GDĐT ...',
        'TRƯỜNG THPT ...',
        'Đề chính thức',
        `(Đề thi gồm có \\zpageref{\\made-lastpage} trang)`,
        title || 'ĐỀ KIỂM TRA',
        `Môn: TOÁN ${grade}`,
        `Thời gian làm bài: 90 phút`,
        `(Không kể thời gian phát đề)`
      ]

  tex += `% Đề thi Toán lớp ${grade}\n`
  if (examCode) {
    tex += `\\def\\made{${examCode}}\n`
  }
  tex += `\\begin{name}\n`
  for (let li = 0; li < labels.length; li++) {
    let labelText = labels[li]
    // If the label is empty/blank, output {\,} and skip styling
    if (li !== 3 && labelText.trim() === '') {
      tex += `\t{\\,}\n`
      continue
    }
    // Apply formatting from headerStyles (skip index 3 — fixed zpageref)
    if (li !== 3 && headerStyles && headerStyles[li]) {
      const s = headerStyles[li]
      if (s.underline) labelText = `\\underline{${labelText}}`
      if (s.italic) labelText = `\\textit{${labelText}}`
      if (s.bold) labelText = `\\textbf{${labelText}}`
      if (s.color) labelText = `\\textcolor{${s.color}}{${labelText}}`
    } else if (li === 3) {
      labelText = `\\textit{(Đề thi gồm có 0\\zpageref{\\made-lastpage} trang)}`
    }
    tex += `\t{${labelText}}\n`
  }
  tex += `\\end{name}\n\n`

  tex += `\\Opensolutionfile{ansbook}[ans/ansb\\currfilebase]\n\n`

  const sortedParts = Object.keys(grouped).map(Number).sort((a, b) => a - b)
  for (const partNum of sortedParts) {
    const partQuestions = grouped[partNum]
    if (partQuestions.length === 0) continue

    let partHeader = ''
    let fileSuffix = ''
    if (partNum === 1) {
      partHeader = '\\caulc\n'
      fileSuffix = 'Phan-I'
    } else if (partNum === 2) {
      partHeader = '\\cauds\n'
      fileSuffix = 'Phan-II'
    } else if (partNum === 3) {
      partHeader = '\\caukq\n'
      fileSuffix = 'Phan-III'
    } else if (partNum === 4) {
      partHeader = '\\cautl\n'
      fileSuffix = 'Phan-IV'
    } else {
      partHeader = `\\caulc\n`
      fileSuffix = `Phan-${partNum}`
    }

    if (partNum === 3 || (partNum === 4 && !sortedParts.includes(3))) {
      tex += `\\Opensolutionfile{ansbook}[ans/ansb\\currfilebase]\n`
    }

    tex += partHeader
    tex += `\\Opensolutionfile{ans}[ans/ans\\currfilebase-${fileSuffix}]\n\n`
    tex += partQuestions.map(q => q.latex_content.trim()).join('\n\n')
    tex += `\n\\Closesolutionfile{ans}\n\n`
  }

  tex += `\\Closesolutionfile{ansbook}\n`
  tex += `\\begin{center}\n\t\\textbf{--------------- HẾT ---------------}\n\\end{center}\n`
  if (includeAnswerTable) {
    tex += `\\begin{indapan}\n\t{ans/ans\\currfilebase}\n\\end{indapan}\n`
  } else {
    tex += `%\\begin{indapan}\n%\t{ans/ans\\currfilebase}\n%\\end{indapan}\n`
  }
  tex += `\\zlabel{\\made-lastpage}\n`

  return tex
}

// ─── Main API Handler ─────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { title, duration, grade, questions, exams, headerLabels, headerStyles, examCodes, excelOption, includeAnswerTable } = body as {
      title?: string
      duration?: number
      grade?: number
      questions?: ExamQuestion[]
      exams?: { questions: ExamQuestion[] }[]
      headerLabels?: string[]
      headerStyles?: { bold?: boolean; italic?: boolean; underline?: boolean; color?: string }[]
      examCodes?: string[]
      excelOption?: string
      includeAnswerTable?: boolean
    }

    const displayTitle = title || 'ĐỀ THI TRẮC NGHIỆM'
    const displayGrade = grade || 12
    const validHeaderLabels = headerLabels && Array.isArray(headerLabels) && headerLabels.length === 8
      ? headerLabels
      : undefined
    const validHeaderStyles = headerStyles && Array.isArray(headerStyles) && headerStyles.length === 8
      ? headerStyles
      : undefined
    const validExamCodes = examCodes && Array.isArray(examCodes) ? examCodes : []

    // Determine whether single or multi-exam export
    const examSets: ExamQuestion[][] = []
    if (exams && Array.isArray(exams) && exams.length > 1) {
      for (const e of exams) {
        if (e.questions && Array.isArray(e.questions)) {
          examSets.push(e.questions)
        }
      }
    } else if (questions && Array.isArray(questions)) {
      examSets.push(questions)
    }

    if (examSets.length === 0) {
      return NextResponse.json({ error: 'Missing or invalid questions list' }, { status: 400 })
    }

    // Pad exam codes if needed
    const codes = examSets.map((_, i) => validExamCodes[i] ?? `${i + 1}`)

    // Create the ZIP archive
    const zip = new AdmZip()
    const configDir = path.join(/*turbopackIgnore: true*/ process.cwd(), 'public', 'latex-config')

    // Add shared config/sty files
    const sharedFiles = [
      'khaibaochung.tex',
      'ex_test.sty',
      'ex_tkz-euclide.sty',
      'tkz-linknodes.sty',
      'tkz-tab-vn.sty',
    ]

    for (const filename of sharedFiles) {
      const filePath = path.join(configDir, filename)
      if (fs.existsSync(filePath)) {
        zip.addFile(filename, fs.readFileSync(filePath))
      } else {
        console.warn(`Warning: file not found: ${filePath}`)
      }
    }

    // Create empty ans/ folder
    zip.addFile('ans/', Buffer.alloc(0))

    if (examSets.length === 1) {
      // ── Single exam ──
      const maTranTex = buildMaTranTex(examSets[0], displayTitle, displayGrade, undefined, validHeaderLabels, codes[0], validHeaderStyles, includeAnswerTable !== false)
      zip.addFile('ma_tran_de_thi_toan.tex', Buffer.from(maTranTex, 'utf-8'))

      const mainPath = path.join(configDir, 'main.tex')
      if (fs.existsSync(mainPath)) {
        zip.addFile('main.tex', fs.readFileSync(mainPath))
      }
    } else {
      // ── Multiple exams ──
      for (let i = 0; i < examSets.length; i++) {
        const examLabel = `Đề ${i + 1}`
        const maTranTex = buildMaTranTex(examSets[i], displayTitle, displayGrade, examLabel, validHeaderLabels, codes[i], validHeaderStyles, includeAnswerTable !== false)
        zip.addFile(`ma_tran_de_thi_toan${i + 1}.tex`, Buffer.from(maTranTex, 'utf-8'))
      }

      let mainTex = '\\documentclass[12pt,a4paper,twoside]{book}\n'
      mainTex += '\\input{khaibaochung}\n'
      mainTex += '%\\HeaderLoaiHai %Bật/tắt header đề thi/header bài dạy\n'
      mainTex += '%\\exitdapso %ẩn đs\n'
      mainTex += '\\anloigiai %ẩn lời giải\n'
      mainTex += '%\\tatdongcham %tắt dòng chấm\n'
      mainTex += '\\begin{document}\n'
      for (let i = 0; i < examSets.length; i++) {
        mainTex += `\\newpage\\input{ma_tran_de_thi_toan${i + 1}}\n`
      }
      mainTex += '\\end{document}\n'

      zip.addFile('main.tex', Buffer.from(mainTex, 'utf-8'))
    }

    // ── Generate answer Excel files ──
    try {
      const opt = excelOption || 'none'

      if (opt === 'all' || opt === 'tnmaker') {
        const tnmakerBuf = generateTNMakerExcel(examSets, codes)
        zip.addFile('bang_dap_an_tnmaker.xlsx', tnmakerBuf)
      }

      if (opt === 'all' || opt === 'azota') {
        const azotaBuf = generateAZOTAExcel(examSets, codes)
        zip.addFile('bang_dap_an_azota.xlsx', azotaBuf)
      }

      if (opt === 'all' || opt === 'olm') {
        const olmBuf = generateOLMExcel(examSets, codes)
        zip.addFile('bang_dap_an_olm.xlsx', olmBuf)
      }
    } catch (xlsxErr) {
      console.error('Excel generation error (non-fatal):', xlsxErr)
      // Non-fatal: still return ZIP without Excel files
    }

    const zipBuffer = zip.toBuffer()

    return new NextResponse(zipBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="exam_package.zip"',
        'Cache-Control': 'no-store',
      },
    })

  } catch (err) {
    console.error('Export ZIP error:', err)
    return NextResponse.json(
      { error: `Lỗi server: ${err instanceof Error ? err.message : 'Unknown error'}` },
      { status: 500 }
    )
  }
}
