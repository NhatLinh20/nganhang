// src/lib/answer-import/qr-parser.ts
// Parse QR code data from TNMaker, YoungMix, SmartTest formats

export interface ParsedAnswerKey {
  examCode: string
  mc: string[]
  tf: string[]
  sa: string[]
}

export interface QRParseResult {
  success: boolean
  keys: ParsedAnswerKey[]
  format: string
  error?: string
}

/**
 * Parse QR code JSON string into answer keys.
 * Supports 3 formats:
 * - TNMaker (type=0): {"success":true,"type":0,"1234":"ABCD..."}
 * - YoungMix (type=1): [["1234","A","B",...], ...]
 * - SmartTest (type=3): same as YoungMix
 */
export function parseQRData(jsonString: string, mcCount: number, tfCount: number, saCount: number): QRParseResult {
  try {
    const data = JSON.parse(jsonString)

    // TNMaker format: {"success":true,"type":0,"1234":"ABCDAB..."}
    if (data && typeof data === 'object' && !Array.isArray(data) && data.type === 0) {
      return parseTNMakerQR(data, mcCount, tfCount, saCount)
    }

    // YoungMix / SmartTest format: 2D array [["code","A","B",...], ...]
    if (Array.isArray(data) && data.length > 0 && Array.isArray(data[0])) {
      return parseArrayQR(data, mcCount, tfCount, saCount)
    }

    // Single exam TNMaker without type field: {"1234":"ABCD..."}
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      const keys = Object.keys(data).filter(k => k !== 'success' && k !== 'type')
      if (keys.length > 0 && keys.every(k => /^\d{1,4}$/.test(k))) {
        return parseTNMakerQR({ ...data, type: 0 }, mcCount, tfCount, saCount)
      }
    }

    return { success: false, keys: [], format: 'unknown', error: 'Không nhận dạng được format QR code' }
  } catch {
    return { success: false, keys: [], format: 'unknown', error: 'QR code không chứa dữ liệu JSON hợp lệ' }
  }
}

function parseTNMakerQR(data: Record<string, unknown>, mcCount: number, tfCount: number, saCount: number): QRParseResult {
  const keys: ParsedAnswerKey[] = []
  const examCodes = Object.keys(data).filter(k => k !== 'success' && k !== 'type')

  for (const code of examCodes) {
    const answerStr = String(data[code] || '')
    const parts = answerStr.split('#')
    const mcTfStr = parts[0]

    const mc: string[] = []
    for (let i = 0; i < Math.min(mcTfStr.length, mcCount); i++) {
      mc.push(mcTfStr[i].toUpperCase())
    }

    const tf: string[] = []
    let tfPointer = mcCount
    for (let i = 0; i < tfCount; i++) {
      if (tfPointer + 4 <= mcTfStr.length) {
        tf.push(mcTfStr.substring(tfPointer, tfPointer + 4))
      }
      tfPointer += 4
    }

    const sa: string[] = []
    for (let i = 1; i < parts.length && sa.length < saCount; i++) {
      sa.push(parts[i])
    }

    keys.push({ examCode: code, mc, tf, sa })
  }

  return { success: true, keys, format: 'TNMaker' }
}

function parseArrayQR(data: (string | number)[][], mcCount: number, tfCount: number, saCount: number): QRParseResult {
  const keys: ParsedAnswerKey[] = []

  for (const row of data) {
    if (row.length < 2) continue
    const examCode = String(row[0])
    const answers = row.slice(1).map(v => String(v))

    const mc = answers.slice(0, mcCount)
    // TF: next tfCount*4 items (each TF question has 4 sub-answers a,b,c,d)
    const tfItems = answers.slice(mcCount, mcCount + tfCount * 4)
    const tf: string[] = []
    for (let i = 0; i < tfCount; i++) {
      const sub = tfItems.slice(i * 4, i * 4 + 4).join('')
      tf.push(sub)
    }
    const sa = answers.slice(mcCount + tfCount * 4, mcCount + tfCount * 4 + saCount)

    keys.push({ examCode, mc, tf, sa })
  }

  return { success: true, keys, format: 'YoungMix/SmartTest' }
}
