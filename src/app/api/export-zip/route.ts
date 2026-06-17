// src/app/api/export-zip/route.ts
import { NextRequest, NextResponse } from 'next/server'
import * as fs from 'fs'
import * as path from 'path'
import AdmZip from 'adm-zip'
import QRCode from 'qrcode'

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

// ─── YoungMix Excel ────────────────────────────────────────────────────────────
function generateYoungMixExcel(examSets: ExamQuestion[][], examCodes: string[]): Buffer {
  const dataRows: CellValue[][] = []
  
  // Header row
  const header: CellValue[] = ['Đề\\câu']
  for (let i = 1; i <= 40; i++) header.push(`${i}`)
  for (let i = 1; i <= 8; i++) {
    header.push(`${i}a`)
    header.push(`${i}b`)
    header.push(`${i}c`)
    header.push(`${i}d`)
  }
  for (let i = 1; i <= 6; i++) header.push(`${i}`)
  dataRows.push(header)

  for (let eIdx = 0; eIdx < examSets.length; eIdx++) {
    const row: CellValue[] = [examCodes[eIdx]]
    const qs = examSets[eIdx]
    const mcQs = qs.filter(q => q.question_type === 'multiple_choice')
    const tfQs = qs.filter(q => q.question_type === 'true_false')
    const saQs = qs.filter(q => q.question_type === 'short_answer')

    // 40 MC
    for (let i = 0; i < 40; i++) {
      row.push(i < mcQs.length ? getAnswer(mcQs[i]) : '')
    }

    // 8 TF * 4 = 32
    for (let i = 0; i < 8; i++) {
      const ansStr = i < tfQs.length ? getAnswer(tfQs[i]) : ''
      for (let j = 0; j < 4; j++) {
        row.push(j < ansStr.length ? ansStr.charAt(j) : '')
      }
    }

    // 6 SA
    for (let i = 0; i < 6; i++) {
      row.push(i < saQs.length ? getAnswer(saQs[i]) : '')
    }

    dataRows.push(row)
  }

  return buildXlsx([{ name: 'Dữ liệu', data: dataRows }])
}

// ─── SmartTest Excel ──────────────────────────────────────────────────────────
function generateSmartTestExcel(examSets: ExamQuestion[][], examCodes: string[]): Buffer {
  const canonical = examSets[0] ?? []
  const mcQs   = canonical.filter(q => q.question_type === 'multiple_choice')
  const tfQs   = canonical.filter(q => q.question_type === 'true_false')
  const saQs   = canonical.filter(q => q.question_type === 'short_answer')

  const dataRows: CellValue[][] = []

  // Header row
  const header: CellValue[] = ['Câu\\Mã đề']
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
      const ans = getAnswer(q) 
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


// ─── Answer Sheet (Phiếu trả lời trắc nghiệm) TikZ Builder ───────────────────

function buildAnswerSheetTex(examCode: string, mcCount: number, tfCount: number, saCount: number): string {
  // Convert exam code "1234" → "1,2,3,4" for TikZ \made
  const madeDigits = examCode.split('').join(',')
  // Clamp to limits of the template
  const TN = Math.min(mcCount, 40)
  const DS = Math.min(tfCount, 8)
  const TLN = Math.min(saCount, 6)

  // If nothing to show, return empty
  if (TN === 0 && DS === 0 && TLN === 0) return ''

  let tex = '\n% ─── PHIẾU TRẢ LỜI TRẮC NGHIỆM ───\n'
  tex += '\\newpage\\thispagestyle{empty}\n'
  tex += '\\begin{tikzpicture}[remember picture,overlay,font={\\fontfamily{ptm}\\fontsize{10pt}{0pt}\\selectfont},line width=1pt]%Phieu tra loi\n'

  // === Tuỳ chọn phiếu ===
  tex += '\t%Tùy chọn cho phiếu\n'
  tex += `\t\\def\\mauphieu{black}\n`
  tex += `\t\\def\\madephieu{${madeDigits}}%mã đề (dùng riêng cho phiếu, không ghi đè \\made)\n`
  tex += `\t\\def\\TN{${TN}}%Số câu TN\n`
  tex += `\t\\def\\DS{${DS}}%Số câu ĐS\n`
  tex += `\t\\def\\TLN{${TLN}}%Số câu TLN\n`
  tex += '\t\\def\\hiennhan{1} %1: hiện nhãn, 0: tắt nhãn\n'
  tex += '\t\\def\\labeltext#1{\\ifnum\\hiennhan=1 #1 \\fi}\n'

  // === Khai báo điểm ===
  tex += '\t%Khai báo điểm\n'
  tex += '\t\\path (current page.north west) coordinate (A);\n'

  // === Nền phiếu ===
  tex += '\t%Nền phiếu\n'
  tex += '\t\\fill[\\mauphieu!10] ($(A)+(1.75,-9.85)$) rectangle ($(A)+(19.25,-28)$);\n'

  // === Ô vuông định vị lớn ===
  tex += '\t%Định vị phiếu (các ô vuông lớn)\n'
  tex += '\t\\foreach \\x/\\y/\\c in {1.3/-1.28,13.74/-1.28,19.68/-1.28,%\n'
  tex += '\t\t1.3/-9.32,13.65/-9.32,19.68/-9.32,%\n'
  tex += '\t\t1.3/-28.42,19.68/-28.42,}{%\n'
  tex += '\t\t\\node [fill=\\mauphieu,minimum size=0.54cm,inner sep=0pt] at ($(A)+(\\x,\\y)$) {};\n'
  tex += '\t}\n'

  // === Ô vuông định vị nhỏ ===
  tex += '\t%Định vị phiếu (các ô vuông nhỏ)\n'
  tex += '\t\\foreach \\x/\\y in {17.47/-5.9, 17.47/-8.79,\n'
  tex += '\t\t6.17/-10.64, 10.49/-10.64, 14.81/-10.64,\n'
  tex += '\t\t6.17/-15.79, 10.49/-15.79, 14.81/-15.79,\n'
  tex += '\t\t6.17/-16.52, 10.49/-16.52, 14.81/-16.52,\n'
  tex += '\t\t6.17/-19.55, 10.49/-19.55, 14.81/-19.55,\n'
  tex += '\t\t4.94/-19.94, 7.71/-19.94, 13.25/-19.94, 16.02/-19.94,\n'
  tex += '\t\t4.94/-27.73, 7.71/-27.73, 10.48/-27.73, 13.25/-27.73, 16.02/-27.73}{\n'
  tex += '\t\t\\node [fill=\\mauphieu,minimum size=0.27cm,inner sep=0pt] at ($(A)+(\\x,\\y)$){};\n'
  tex += '\t}\n'

  // === Phần thông tin ===
  tex += '\t%Phần thông tin\n'
  tex += '\t\\node at ($(A)+(8,-1.5)$)[font={\\bfseries\\fontfamily{ptm}\\fontsize{15pt}{0pt}\\selectfont},\\mauphieu]{PHIẾU TRẢ LỜI TRẮC NGHIỆM};\n'
  tex += '\t\\node[\\mauphieu] at ($(A)+(9.6,-2.3)$){Kỳ thi \\makebox[6.3cm]{\\dotfill}};\n'
  tex += '\t\\node[\\mauphieu] at ($(A)+(1.5,-3)$)[anchor=west]{Bài thi \\makebox[7.1cm]{\\dotfill} Ngày thi:\\makebox[0.5cm]{\\dotfill}/\\makebox[0.5cm]{\\dotfill}/20\\makebox[0.5cm]{\\dotfill}};\n'

  // === Ô Điểm + Cán bộ coi thi ===
  tex += '\t\\draw [\\mauphieu,line width=1pt] ($(A)+(1.7,-3.35)$) rectangle ($(A)+(5.7,-8.8)$)\n'
  tex += '\t($(A)+(1.7,-4)$)--($(A)+(5.7,-4)$) node [midway,above] {Điểm}\n'
  tex += '\t($(A)+(1.7,-5.5)$)--($(A)+(5.7,-5.5)$) node [midway,shift={(0,-0.4)},text width=3.5cm,align=center,font={\\fontsize{10pt}{-5pt}\\selectfont} ] {Họ tên, chữ ký của cán bộ coi thi 1}\n'
  tex += '\t($(A)+(1.7,-7.2)$)--($(A)+(5.7,-7.2)$)node [midway,shift={(0,-0.4)},text width=3.5cm,align=center,font={\\fontsize{10pt}{-5pt}\\selectfont} ] {Họ tên, chữ ký của cán bộ coi thi 2}\n'
  tex += '\t;\n'

  // === Thông tin thí sinh ===
  tex += '\t\\draw [\\mauphieu,line width=1pt] ($(A)+(5.95,-3.35)$) rectangle ($(A)+(13.15,-8.8)$);\n'
  tex += '\t\\foreach \\text [count=\\i] in {\n'
  tex += '\t\t{Hội đồng thi: \\dotfill},\n'
  tex += '\t\t{Điểm thi: \\dotfill},\n'
  tex += '\t\t{Phòng thi số: \\dotfill},\n'
  tex += '\t\t{Họ và tên thí sinh: \\dotfill},\n'
  tex += '\t\t{Ngày sinh: \\makebox[0.5cm]{\\dotfill}/\\makebox[0.5cm]{\\dotfill}/\\makebox[2cm]{\\dotfill} (Nam/Nữ).},\n'
  tex += '\t\t{Chữ ký của thí sinh: \\dotfill}\n'
  tex += '\t} {\n'
  tex += '\t\t\\node at ($(A)+(5.95, {-3.9 - (\\i-1)*0.9})$) [anchor=west, text width=7cm,\\mauphieu] {\\i. \\text};\n'
  tex += '\t}\n'

  // === Ô số báo danh (header) ===
  tex += '\t\\foreach \\i in {0, 1, ..., 7} {\n'
  tex += '\t\t\\draw [\\mauphieu, line width=1pt]\n'
  tex += '\t\t($(A) + ({13.97 + \\i*0.4}, -2.3)$) rectangle ($(A) + ({14.37 + \\i*0.4}, -2.89)$);\n'
  tex += '\t}\n'
  tex += '\t\\node at ($(A) + (15.57, -2.3)$) [above,\\mauphieu] {7. Số báo danh};\n'

  // === Ô mã đề thi (header) ===
  tex += '\t\\foreach \\i in {0, 1, ..., 3} {\n'
  tex += '\t\t\\draw [\\mauphieu, line width=1pt]\n'
  tex += '\t\t($(A) + ({17.77 + \\i*0.4}, -2.3)$) rectangle ($(A) + ({18.17 + \\i*0.4}, -2.89)$);\n'
  tex += '\t}\n'
  tex += '\t\\node at ($(A) + (18.57, -2.3)$) [above,\\mauphieu] {8. Mã đề thi};\n'

  // === Số báo danh (grid) ===
  tex += '\t%Số báo danh\n'
  tex += '\t\\draw [\\mauphieu]($(A)+(13.94,-3)$) rectangle ($(A)+(17.23,-8.8)$);\n'
  tex += '\t\\foreach \\j in {0, 1, ..., 9} {\n'
  tex += '\t\t\\draw [\\mauphieu]($(A)+(13.66, {-3.3 - \\j*0.575})$) circle (5pt)\n'
  tex += '\t\tnode [font={\\fontsize{8pt}{9.6pt}\\selectfont}] {\\j};\n'
  tex += '\t\t\\foreach \\i in {0, 1, ..., 7} {\n'
  tex += '\t\t\t\\draw [\\mauphieu]($(A) + ({14.16 + \\i*0.405}, {-3.3 - \\j*0.575})$) circle (5pt)node[font=\\fontsize{7pt}{0pt}\\selectfont,\\mauphieu!80]{\\labeltext{\\j}} ;\n'
  tex += '\t\t}\n'
  tex += '\t}\n'

  // === Mã đề (grid + tô sẵn) ===
  tex += '\t%Mã đề\n'
  tex += '\t\\draw [\\mauphieu]($(A)+(17.75,-3)$) rectangle ($(A)+(19.43,-8.8)$);\n'
  tex += '\t\\foreach \\j in {0, 1, ..., 9} {\n'
  tex += '\t\t\\draw [\\mauphieu]($(A)+(19.74, {-3.3 - \\j*0.575})$) circle (5pt)\n'
  tex += '\t\tnode [font={\\fontsize{8pt}{9.6pt}\\selectfont}] {\\j};\n'
  tex += '\t\t\\foreach \\i in {0, 1, ..., 3} {\n'
  tex += '\t\t\t\\draw [\\mauphieu]($(A) + ({17.975 + \\i*0.405}, {-3.3 - \\j*0.575})$) circle (5pt);\n'
  tex += '\t\t\t\\path ($(A) + ({17.975 + \\i*0.405}, {-3.3 - \\j*0.575})$) coordinate (A\\i\\j)\n'
  tex += '\t\t\tnode[font=\\fontsize{7pt}{0pt}\\selectfont,\\mauphieu!80]{\\labeltext{\\j}};\n'
  tex += '\t\t}\n'
  tex += '\t}\n'

  // === Phần I: Trắc nghiệm ===
  tex += '\t%Phần phiếu tô trắc nghiệm\n'
  tex += '\t\\foreach \\k in {0,1,2,3}{\n'
  tex += '\t\t\\pgfmathtruncatemacro{\\cotbatdau}{\\k*10+1}\n'
  tex += '\t\t\\ifnum\\cotbatdau>\\TN\\else\n'
  tex += '\t\t\\node at ($(A)+(2.175,-10.2)$)[anchor=west,font={\\bfseries\\small},\\mauphieu,inner sep=0pt] {PHẦN I};\n'
  tex += '\t\t\\draw[\\mauphieu,fill=white]($(A)+({2.175+\\k*4.315},-10.6)$)rectangle($(A)+({5.85+\\k*4.315},-15.8)$);\n'
  tex += '\t\t\\fi}\n'
  tex += '\t\\foreach \\k in {0,1,2,3}{\n'
  tex += '\t\t\\foreach \\rinc in {1,2,...,10}{\n'
  tex += '\t\t\t\\pgfmathtruncatemacro{\\r}{\\k*10+\\rinc}\n'
  tex += '\t\t\t\\ifnum\\r>\\TN\\else\n'
  tex += '\t\t\t\\foreach \\c [count=\\i from 0] in {A,B,C,D}{\n'
  tex += '\t\t\t\t\\coordinate (HienTai) at ($(A)+({2.935+\\k*4.315+\\i*0.865},{-11.35-(\\rinc-1)*0.445})$);\n'
  tex += '\t\t\t\t\\path [draw=\\mauphieu](HienTai)circle(5pt)coordinate(TN\\r\\c);\n'
  tex += '\t\t\t\t\\node at (TN\\r\\c)[font=\\tiny,\\mauphieu!50]{\\labeltext{\\c}};\n'
  tex += '\t\t\t\t\\ifnum\\rinc=1\\node at ($(HienTai)+(0,0.45)$)[\\mauphieu,font=\\tiny\\bfseries\\selectfont]{\\c};\\fi\n'
  tex += '\t\t\t}\n'
  tex += '\t\t\t\\node at (TN\\r A)[shift={(-0.45,0)},\\mauphieu,font=\\bfseries\\footnotesize] {\\r};\n'
  tex += '\t\t\t\\fi}}\n'

  // === Phần II: Đúng/Sai ===
  tex += '\t%Phần phiếu tô đúng sai\n'
  tex += '\t\\foreach \\k in {0,1,2,3}{\n'
  tex += '\t\t\\foreach \\q [count=\\qi from 0] in {1,2}{\n'
  tex += '\t\t\t\\pgfmathtruncatemacro{\\r}{2*\\k+\\q}\n'
  tex += '\t\t\t\\ifnum\\r>\\DS\\else\n'
  tex += '\t\t\t\\node at ($(A)+(2.175,-16.125)$)[anchor=west,font={\\bfseries\\small},\\mauphieu,inner sep=0pt] {PHẦN II};\n'
  tex += '\t\t\t\\ifnum\\qi=0\n'
  tex += '\t\t\t\\draw[\\mauphieu,fill=white]($(A)+({2.175+\\k*4.32},-16.5)$)rectangle($(A)+({4.2325+\\k*4.32},-19.55)$);\n'
  tex += '\t\t\t\\else\n'
  tex += '\t\t\t\\draw[\\mauphieu,fill=white]($(A)+({4.2325+\\k*4.32},-16.5)$)rectangle($(A)+({5.85+\\k*4.32},-19.55)$);\n'
  tex += '\t\t\t\\fi\n'
  tex += '\t\t\t\\node at ($(A)+({3.3675+\\k*4.32+\\qi*1.73},-16.85)$) [font=\\footnotesize\\bfseries,\\mauphieu] {Câu \\r};\n'
  tex += '\t\t\t\\foreach \\y [count=\\yi from 0] in {a,b,c,d}{\n'
  tex += '\t\t\t\t\\foreach \\t/\\dx in {D/0,S/0.865}{\n'
  tex += '\t\t\t\t\t\\path[draw=\\mauphieu]($(A)+({2.935+\\k*4.32+\\qi*1.73+\\dx},{-17.8-\\yi*0.445})$)circle(5pt)coordinate(DS\\r\\y\\t)\n'
  tex += '\t\t\t\t\tnode [font=\\fontsize{7pt}{0pt}\\selectfont,\\mauphieu!80]{\\labeltext{\\t}};\n'
  tex += '\t\t\t\t\t\\ifnum\\yi=0\\node at (DS\\r\\y\\t)[font=\\bfseries\\footnotesize,shift={(0,0.45)},\\mauphieu]{\\if\\t D Đúng\\else Sai\\fi};\\fi\n'
  tex += '\t\t\t\t\t\\if\\t D\\ifnum\\qi=0\\node at (DS\\r\\y\\t)[font=\\bfseries\\footnotesize,shift={(-0.4,0)},\\mauphieu]{\\y)};\\fi\\fi\n'
  tex += '\t\t\t}}\\fi}}\n'

  // === Phần III: Trả lời ngắn ===
  tex += '\t%Phần TLN\n'
  tex += '\t\\ifdefined\\TLN\\else\\def\\TLN{6}\\fi\n'
  tex += '\t\\ifnum\\TLN>0\n'
  tex += '\t\\foreach \\r in {1,...,\\TLN}{\n'
  tex += '\t\t\\node at ($(A)+(2.175,-19.9)$)[anchor=west,font={\\bfseries\\small},\\mauphieu,inner sep=0pt] {PHẦN III};\n'
  tex += '\t\t\\draw[\\mauphieu,fill=white]($(A)+({2.18+(\\r-1)*2.77},-20.355)$)rectangle($(A)+({4.95+(\\r-1)*2.77},-27.3)$);\n'
  tex += '\t\t\\node at ($(A)+({3+(\\r-1)*2.765},-20.95)$)[font=\\footnotesize\\bfseries,\\mauphieu]{Câu \\r};\n'
  tex += '\t\t\\foreach \\val [count=\\i from 0] in {-, {,}, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9}{\n'
  tex += '\t\t\t\\node at ($(A)+({2.4+(\\r-1)*2.765},{-21.77-\\i*0.46})$)[font=\\footnotesize\\bfseries,\\mauphieu]{\\val};}\n'
  tex += '\t\t\\path[draw=\\mauphieu]($(A)+({2.79+(\\r-1)*2.765},-21.77)$)circle(5pt)coordinate(SA\\r1T)node[font=\\fontsize{7pt}{0pt}\\selectfont,\\mauphieu!80]{\\labeltext{$-$}};\n'
  tex += '\t\t\\foreach \\p [count=\\pi from 0] in {2,3}{\n'
  tex += '\t\t\t\\path[draw=\\mauphieu]($(A)+({3.38+(\\r-1)*2.765+\\pi*0.59},-22.23)$)circle(5pt)coordinate(SA\\r\\p P)node[font=\\fontsize{7pt}{0pt}\\selectfont,\\mauphieu!80]{\\labeltext{,}};}\n'
  tex += '\t\t\\foreach \\p in {1,2,3,4}{\n'
  tex += '\t\t\t\\foreach \\j in {0,1,...,9}{\n'
  tex += '\t\t\t\t\\path[draw=\\mauphieu]($(A)+({2.79+(\\r-1)*2.77+(\\p-1)*0.59},{-22.69-\\j*0.46})$)circle(5pt)coordinate(SA\\r\\p\\j)node[font=\\fontsize{7pt}{0pt}\\selectfont,\\mauphieu!80]{\\labeltext{\\j}};}}}\n'
  tex += '\t\\fi\n'

  tex += '\\end{tikzpicture}\n'

  return tex
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
  includeAnswerTable: boolean = true,
  includeAnswerSheet: boolean = false
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
    const count = partQuestions.length
    if (partNum === 1) {
      partHeader = `\\def\\socaulc{${count}}\n\\caulc\n`
      fileSuffix = 'Phan-I'
    } else if (partNum === 2) {
      partHeader = `\\def\\socauds{${count}}\n\\cauds\n`
      fileSuffix = 'Phan-II'
    } else if (partNum === 3) {
      partHeader = `\\def\\socaukq{${count}}\n\\caukq\n`
      fileSuffix = 'Phan-III'
    } else if (partNum === 4) {
      partHeader = `\\def\\socautl{${count}}\n\\cautl\n`
      fileSuffix = 'Phan-IV'
    } else {
      partHeader = `\\def\\socaulc{${count}}\n\\caulc\n`
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
  tex += `\\zlabel{\\made-lastpage}\n`
  if (includeAnswerTable) {
    tex += `\\begin{indapan}\n\t{ans/ans\\currfilebase}\n\\end{indapan}\n`
  } else {
    tex += `%\\begin{indapan}\n%\t{ans/ans\\currfilebase}\n%\\end{indapan}\n`
  }
  // Insert answer sheet (phiếu trả lời) if requested
  if (includeAnswerSheet && examCode) {
    const mcCount = questions.filter(q => q.question_type === 'multiple_choice').length
    const tfCount = questions.filter(q => q.question_type === 'true_false').length
    const saCount = questions.filter(q => q.question_type === 'short_answer').length
    const sheetTex = buildAnswerSheetTex(examCode, mcCount, tfCount, saCount)
    if (sheetTex) tex += sheetTex
  }

  return tex
}

// ─── Main API Handler ─────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { title, duration, grade, questions, exams, headerLabels, headerStyles, examCodes, excelOptions, includeAnswerTable, includeAnswerSheet, qrCodeOptions } = body as {
      title?: string
      duration?: number
      grade?: number
      questions?: ExamQuestion[]
      exams?: { questions: ExamQuestion[] }[]
      headerLabels?: string[]
      headerStyles?: { bold?: boolean; italic?: boolean; underline?: boolean; color?: string }[]
      examCodes?: string[]
      excelOptions?: string[]
      includeAnswerTable?: boolean
      includeAnswerSheet?: boolean
      qrCodeOptions?: string[]
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

    // Create empty ans/ and data/ folders
    zip.addFile('ans/', Buffer.alloc(0))
    zip.addFile('data/', Buffer.alloc(0))

    if (examSets.length === 1) {
      // ── Single exam ──
      const maTranTex = buildMaTranTex(examSets[0], displayTitle, displayGrade, undefined, validHeaderLabels, codes[0], validHeaderStyles, includeAnswerTable !== false, includeAnswerSheet === true)
      zip.addFile('data/ma_tran_de_thi_toan.tex', Buffer.from(maTranTex, 'utf-8'))

      const mainPath = path.join(configDir, 'main.tex')
      if (fs.existsSync(mainPath)) {
        zip.addFile('main.tex', fs.readFileSync(mainPath))
      }
    } else {
      // ── Multiple exams ──
      for (let i = 0; i < examSets.length; i++) {
        const examLabel = `Đề ${i + 1}`
        const maTranTex = buildMaTranTex(examSets[i], displayTitle, displayGrade, examLabel, validHeaderLabels, codes[i], validHeaderStyles, includeAnswerTable !== false, includeAnswerSheet === true)
        zip.addFile(`data/ma_tran_de_thi_toan${i + 1}.tex`, Buffer.from(maTranTex, 'utf-8'))
      }

      let mainTex = '\\documentclass[12pt,a4paper,twoside]{book}\n'
      mainTex += '\\input{khaibaochung}\n'
      mainTex += '%\\HeaderLoaiHai %Bật/tắt header đề thi/header bài dạy\n'
      mainTex += '%\\exitdapso %ẩn đs\n'
      mainTex += '\\anloigiai %ẩn lời giải\n'
      mainTex += '%\\tatdongcham %tắt dòng chấm\n'
      mainTex += '\\begin{document}\n\\tableofcontents\\thispagestyle{empty}\n'
      for (let i = 0; i < examSets.length; i++) {
        mainTex += `\\newpage\\input{data/ma_tran_de_thi_toan${i + 1}}\n`
      }
      mainTex += '\\end{document}\n'

      zip.addFile('main.tex', Buffer.from(mainTex, 'utf-8'))
    }

    // ── Generate QR Codes for Apps (TNMaker, Smart Test, etc) ──
    const qrTypes = qrCodeOptions || []
    if (qrTypes.length > 0) {
      try {
        // Helper: build answers list for one exam
        function buildExamAnswers(qs: ExamQuestion[]): string[] {
          const mcQs = qs.filter(q => q.question_type === 'multiple_choice')
          const tfQs = qs.filter(q => q.question_type === 'true_false')
          const saQs = qs.filter(q => q.question_type === 'short_answer')
          const answers: string[] = []
          for (const q of mcQs) {
            const ans = q.correct_answer?.trim() || parseMCAnswer(q.latex_content) || 'A'
            answers.push(ans.charAt(0).toUpperCase())
          }
          for (const q of tfQs) {
            const ans = getAnswer(q)
            if (ans.length === 4) {
              for (const ch of ans) answers.push(ch)
            } else {
              answers.push(ans)
            }
          }
          for (const q of saQs) {
            answers.push(getAnswer(q))
          }
          return answers
        }

        const typeNames: Record<string, string> = { '0': 'tnmaker', '1': 'youngmix', '3': 'smarttest' }

        for (const qrType of qrTypes) {
          const typeNum = parseInt(qrType, 10)
          const typeName = typeNames[qrType] || `type${qrType}`
          const jsons: string[] = []

          if (typeNum === 0) {
            // TNMaker format: {"success":true,"type":0,"code1":"ABCD",...}
            for (let i = 0; i < examSets.length; i += 9) {
              const chunk = examSets.slice(i, i + 9)
              const codeChunk = codes.slice(i, i + 9)
              const obj: any = { success: true, type: 0 }
              for (let j = 0; j < chunk.length; j++) {
                const mcQs = chunk[j].filter(q => q.question_type === 'multiple_choice')
                const tfQs = chunk[j].filter(q => q.question_type === 'true_false')
                const saQs = chunk[j].filter(q => q.question_type === 'short_answer')
                let answerStr = ''
                for (const q of mcQs) {
                  const ans = q.correct_answer?.trim() || parseMCAnswer(q.latex_content) || 'A'
                  answerStr += ans.charAt(0).toUpperCase()
                }
                for (const q of tfQs) {
                  const ans = getAnswer(q)
                  if (ans.length === 4) answerStr += ans
                  else answerStr += ans.padEnd(4, 'S')
                }
                if (saQs.length > 0) {
                  answerStr += '#' + saQs.map(q => getAnswer(q)).join('#')
                }
                obj[codeChunk[j]] = answerStr
              }
              jsons.push(JSON.stringify(obj))
            }
          } else {
            // Young Mix (1) / Smart Test (3) format: 2D array
            const allRows: (string | number)[][] = []
            for (let i = 0; i < examSets.length; i++) {
              const row: (string | number)[] = [codes[i]]
              const answers = buildExamAnswers(examSets[i])
              row.push(...answers)
              allRows.push(row)
            }
            const MAX_CELLS = 492
            let currentChunk: (string | number)[][] = []
            let currentCells = 0
            for (const row of allRows) {
              const cellCount = row.length
              if (currentCells + cellCount > MAX_CELLS && currentChunk.length > 0) {
                jsons.push(JSON.stringify(currentChunk))
                currentChunk = []
                currentCells = 0
              }
              currentChunk.push(row)
              currentCells += cellCount
            }
            if (currentChunk.length > 0) {
              jsons.push(JSON.stringify(currentChunk))
            }
          }

          // Generate PNG for each chunk of this type
          for (let i = 0; i < jsons.length; i++) {
            const suffix = jsons.length > 1 ? `_${i + 1}` : ''
            const filename = `qrcode_${typeName}${suffix}.png`
            const pngBuffer = await QRCode.toBuffer(jsons[i], { errorCorrectionLevel: 'L', width: 500, margin: 1 })
            zip.addFile(`DAP-AN/${filename}`, pngBuffer)
          }
        }
      } catch (qrErr) {
        console.error('QR Code generation error:', qrErr)
      }
    }

    // ── Generate answer Excel files ──
    try {
      const opts = excelOptions || []
      const isAll = opts.includes('all') || opts.length === 5

      if (isAll || opts.includes('tnmaker')) {
        const tnmakerBuf = generateTNMakerExcel(examSets, codes)
        zip.addFile('DAP-AN/bang_dap_an_tnmaker.xlsx', tnmakerBuf)
      }

      if (isAll || opts.includes('azota')) {
        const azotaBuf = generateAZOTAExcel(examSets, codes)
        zip.addFile('DAP-AN/bang_dap_an_azota.xlsx', azotaBuf)
      }

      if (isAll || opts.includes('youngmix')) {
        const ymBuf = generateYoungMixExcel(examSets, codes)
        zip.addFile('DAP-AN/bang_dap_an_youngmix.xlsx', ymBuf)
      }

      if (isAll || opts.includes('smarttest')) {
        const stBuf = generateSmartTestExcel(examSets, codes)
        zip.addFile('DAP-AN/bang_dap_an_smarttest.xlsx', stBuf)
      }

      if (isAll || opts.includes('olm')) {
        const olmBuf = generateOLMExcel(examSets, codes)
        zip.addFile('DAP-AN/bang_dap_an_olm.xlsx', olmBuf)
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
