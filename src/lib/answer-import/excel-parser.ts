// src/lib/answer-import/excel-parser.ts
// Parse Excel answer key files from TNMaker, AZOTA, YoungMix, SmartTest, OLM formats
// Works client-side with raw 2D array data (after XLSX parsing)

export interface ParsedAnswerKey {
  examCode: string
  mc: string[]
  tf: string[]
  sa: string[]
}

export interface ExcelParseResult {
  success: boolean
  keys: ParsedAnswerKey[]
  format: string
  error?: string
}

type Row = (string | number | null)[]

/**
 * Auto-detect format and parse Excel data.
 * @param rows - 2D array of cell values (header + data rows)
 * @param mcCount - expected MC question count
 * @param tfCount - expected TF question count  
 * @param saCount - expected SA question count
 */
export function parseExcelAnswers(rows: Row[], mcCount: number, tfCount: number, saCount: number): ExcelParseResult {
  if (!rows || rows.length < 2) {
    return { success: false, keys: [], format: 'unknown', error: 'File không có dữ liệu' }
  }

  const firstCellRow0 = String(rows[0]?.[0] || '').trim().toLowerCase()
  const secondCellRow0 = String(rows[0]?.[1] || '').trim().toLowerCase()

  // 1. OLM format: Row 2 col 0 is "Điểm"
  const firstCellRow2 = rows.length > 2 ? String(rows[2]?.[0] || '').trim().toLowerCase() : ''
  if (firstCellRow2 === 'điểm' || String(rows[0]?.[1] || '').includes('phần i')) {
    return parseOLMFormat(rows, mcCount, tfCount, saCount)
  }

  // 2. AZOTA format: Row 0 is "Câu hỏi", "Mã đề thi"
  if (firstCellRow0 === 'câu hỏi' && secondCellRow0.includes('mã đề')) {
    return parseAZOTAFormat(rows, mcCount, tfCount, saCount)
  }

  // 3. YoungMix format: "Đề\câu"
  if (firstCellRow0 === 'đề\\câu' || firstCellRow0 === 'đề/câu') {
    return parseYoungMixFormat(rows, mcCount, tfCount, saCount)
  }

  // 4. TNMaker / SmartTest format
  if (firstCellRow0.includes('câu') && firstCellRow0.includes('mã đề')) {
    return parseVerticalFormat(rows, mcCount, tfCount, saCount)
  }

  // Fallback: try vertical format
  return parseVerticalFormat(rows, mcCount, tfCount, saCount)
}

/**
 * Vertical format (TNMaker / SmartTest):
 * Row 0: ["Câu/Mã đề", "1234", "5678", ...]
 * Row 1: [1, "A", "B", ...]  — MC answers
 * ...
 * Row N: [N, "ĐSĐS", ...]   — TF answers
 * ...
 * Row M: [M, "3", ...]       — SA answers
 */
function parseVerticalFormat(rows: Row[], mcCount: number, tfCount: number, saCount: number): ExcelParseResult {
  const header = rows[0]
  const examCodes = header.slice(1).map(c => String(c || '').trim()).filter(Boolean)
  const keys: ParsedAnswerKey[] = examCodes.map(code => ({
    examCode: code, mc: [], tf: [], sa: []
  }))

  const dataRows = rows.slice(1)
  let qIdx = 0

  for (const row of dataRows) {
    const answers = row.slice(1)
    if (qIdx < mcCount) {
      for (let e = 0; e < keys.length; e++) {
        keys[e].mc.push(String(answers[e] || '').trim().toUpperCase())
      }
    } else if (qIdx < mcCount + tfCount) {
      for (let e = 0; e < keys.length; e++) {
        keys[e].tf.push(String(answers[e] || '').trim())
      }
    } else if (qIdx < mcCount + tfCount + saCount) {
      for (let e = 0; e < keys.length; e++) {
        keys[e].sa.push(String(answers[e] || '').trim())
      }
    }
    qIdx++
  }

  return { success: true, keys, format: 'TNMaker/SmartTest' }
}

/**
 * YoungMix format:
 * Row 0: ["Đề\câu", "1", "2", ..., "1a", "1b", ..., "1", "2", ...]
 * Row 1: ["1234", "A", "B", ..., "Đ", "S", ..., "3", "-2", ...]
 * Note: Fixed offset for MC (40 slots) and TF (32 slots)
 */
function parseYoungMixFormat(rows: Row[], mcCount: number, tfCount: number, saCount: number): ExcelParseResult {
  const keys: ParsedAnswerKey[] = []

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    if (!row || !row[0]) continue
    const examCode = String(row[0]).trim()
    const answers = row.slice(1).map(c => String(c || '').trim())

    // YoungMix always outputs 40 MC, 32 TF, 6 SA
    const mc = answers.slice(0, mcCount).map(a => a.toUpperCase())

    const tfItems = answers.slice(40, 40 + tfCount * 4)
    const tf: string[] = []
    for (let i = 0; i < tfCount; i++) {
      const sub = tfItems.slice(i * 4, i * 4 + 4).join('')
      tf.push(sub)
    }

    const sa = answers.slice(72, 72 + saCount)

    keys.push({ examCode, mc, tf, sa })
  }

  return { success: true, keys, format: 'YoungMix' }
}

/**
 * AZOTA format — vertical layout
 * Row 0: ["Câu hỏi", "Mã đề thi", ...]
 * Row 1: [null, "101", "102", ...]
 * Row 2: [1, "A", "B", ...]
 */
function parseAZOTAFormat(rows: Row[], mcCount: number, tfCount: number, saCount: number): ExcelParseResult {
  if (rows.length < 3) return { success: false, keys: [], format: 'AZOTA', error: 'Không đủ dữ liệu' }

  const examCodesRow = rows[1]
  const examCodes = examCodesRow.slice(1).map(c => String(c || '').trim()).filter(Boolean)
  const keys: ParsedAnswerKey[] = examCodes.map(code => ({
    examCode: code, mc: [], tf: [], sa: []
  }))

  const dataRows = rows.slice(2)
  let qIdx = 0

  for (const row of dataRows) {
    const answers = row.slice(1)
    if (qIdx < mcCount) {
      for (let e = 0; e < keys.length; e++) {
        keys[e].mc.push(String(answers[e] || '').trim().toUpperCase())
      }
    } else if (qIdx < mcCount + tfCount) {
      for (let e = 0; e < keys.length; e++) {
        keys[e].tf.push(String(answers[e] || '').trim())
      }
    } else if (qIdx < mcCount + tfCount + saCount) {
      for (let e = 0; e < keys.length; e++) {
        keys[e].sa.push(String(answers[e] || '').trim())
      }
    }
    qIdx++
  }

  return { success: true, keys, format: 'AZOTA' }
}

/**
 * OLM format — horizontal layout with fixed slots
 * Col A(0): Mã đề. Col B-AO(1-40): MC. Col AP-BU(41-72): TF. Col BV-CA(73-78): SA.
 */
function parseOLMFormat(rows: Row[], mcCount: number, tfCount: number, saCount: number): ExcelParseResult {
  const keys: ParsedAnswerKey[] = []

  let dataStartIdx = 3
  if (rows.length <= dataStartIdx) return { success: false, keys: [], format: 'OLM', error: 'Không đủ dữ liệu' }

  for (let r = dataStartIdx; r < rows.length; r++) {
    const row = rows[r]
    if (!row || !row[0]) continue
    const examCode = String(row[0]).trim()
    const answers = row.map(c => String(c || '').trim())

    const mc: string[] = []
    for(let i = 0; i < mcCount; i++) {
        mc.push((answers[1 + i] || '').toUpperCase())
    }

    const tf: string[] = []
    for(let i = 0; i < tfCount; i++) {
        const sub = [
            answers[41 + i*4] || '',
            answers[41 + i*4 + 1] || '',
            answers[41 + i*4 + 2] || '',
            answers[41 + i*4 + 3] || ''
        ].join('')
        tf.push(sub)
    }

    const sa: string[] = []
    for(let i = 0; i < saCount; i++) {
        sa.push(answers[73 + i] || '')
    }

    keys.push({ examCode, mc, tf, sa })
  }

  return { success: true, keys, format: 'OLM' }
}
