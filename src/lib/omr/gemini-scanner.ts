// src/lib/omr/gemini-scanner.ts
// Đọc phiếu trả lời trắc nghiệm bằng Gemini Vision API
// Thay thế toàn bộ pipeline OMR thuần JS

import { GoogleGenerativeAI, SchemaType, type Schema } from '@google/generative-ai'

// ═══════════════════════════════════
// TYPES
// ═══════════════════════════════════

export interface GeminiScanRequest {
  imageBase64: string
  mimeType: string
  mcCount: number
  tfCount: number
  saCount: number
}

export interface GeminiScanResult {
  examCode: string | null      // 4 chữ số mã đề
  studentId: string | null     // SBD (tối đa 8 chữ số)
  mc: (string | null)[]        // ['A','B',null,...] — length = mcCount
  tf: (string | null)[]        // ['ĐSĐS', null, ...] — length = tfCount
  sa: (string | null)[]        // ['2,5', '-3', null,...] — length = saCount
  confidence: number           // 0-1 do Gemini tự đánh giá
  warnings: string[]           // Cảnh báo từ Gemini
}

// ═══════════════════════════════════
// PROMPT
// ═══════════════════════════════════

function buildPrompt(mcCount: number, tfCount: number, saCount: number): string {
  const parts: string[] = []

  parts.push(`Bạn là hệ thống đọc phiếu trả lời trắc nghiệm chuẩn THPT Việt Nam.`)
  parts.push(``)
  parts.push(`PHIẾU NÀY CÓ CẤU TRÚC:`)

  if (mcCount > 0) {
    parts.push(`- Phần I (Trắc nghiệm MC): ${mcCount} câu, mỗi câu có 4 bong bóng A/B/C/D`)
    parts.push(`  Vị trí: phần giữa-trái phiếu, có tiêu đề "PHẦN I"`)
    parts.push(`  Đọc đáp án: "A", "B", "C", hoặc "D"`)
  }

  if (tfCount > 0) {
    parts.push(`- Phần II (Đúng/Sai): ${tfCount} câu, mỗi câu có 4 ý (a,b,c,d), mỗi ý chọn Đ (Đúng) hoặc S (Sai)`)
    parts.push(`  Vị trí: phần giữa phiếu, có tiêu đề "PHẦN II"`)
    parts.push(`  Đọc đáp án: chuỗi 4 ký tự "ĐSĐS" (ký tự 1=ý a, ký tự 2=ý b, ...)`)
    parts.push(`  Ký tự hợp lệ: chỉ "Đ" hoặc "S" (không dùng D)`)
  }

  if (saCount > 0) {
    parts.push(`- Phần III (Trả lời ngắn): ${saCount} câu, mỗi câu điền số thực`)
    parts.push(`  Vị trí: phần dưới phiếu, có tiêu đề "PHẦN III"`)
    parts.push(`  Mỗi câu có cột: dấu trừ (tùy chọn), dấu phẩy (vị trí thập phân), 4 cột chữ số 0-9`)
    parts.push(`  Đọc đáp án: số thực dạng string, ví dụ: "3", "-2,5", "0,75"`)
    parts.push(`  Dùng dấu phẩy (,) không dùng dấu chấm (.) làm dấu thập phân`)
  }

  parts.push(``)
  parts.push(`GÓC TRÊN PHẢI của phiếu có 2 phần:`)
  parts.push(`- "7. Số báo danh": 8 cột bong bóng 0-9 (đọc từ trái sang phải)`)
  parts.push(`- "8. Mã đề thi": 4 cột bong bóng 0-9`)
  parts.push(``)
  parts.push(`QUY TẮC ĐỌC BUBBLE:`)
  parts.push(`- Bubble được tô = bong bóng có màu đen/xám đậm, khác hẳn bubble trống (chỉ có viền)`)
  parts.push(`- Nếu không có bubble nào được tô rõ ràng → trả về null (KHÔNG đoán mò)`)
  parts.push(`- Nếu tô 2 bubble → chọn cái đậm hơn, ghi warning "Câu X: tô 2 đáp án"`)
  parts.push(`- Nếu ảnh mờ/khó nhìn → trả null và ghi warning`)
  parts.push(``)
  parts.push(`Hãy đọc thật cẩn thận từng bubble. Đây là dữ liệu thi cử quan trọng.`)

  return parts.join('\n')
}

// ═══════════════════════════════════
// RESPONSE SCHEMA (Structured Output)
// ═══════════════════════════════════

function buildResponseSchema(mcCount: number, tfCount: number, saCount: number) {
  const properties: Record<string, any> = {
    examCode: {
      type: SchemaType.STRING,
      description: 'Mã đề thi 4 chữ số, hoặc null nếu không đọc được',
      nullable: true,
    },
    studentId: {
      type: SchemaType.STRING,
      description: 'Số báo danh tối đa 8 chữ số, hoặc null',
      nullable: true,
    },
    confidence: {
      type: SchemaType.NUMBER,
      description: 'Độ tin cậy tổng thể 0.0-1.0',
    },
    warnings: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
      description: 'Danh sách cảnh báo (tô không rõ, tô 2 đáp án, v.v.)',
    },
  }

  if (mcCount > 0) {
    properties.mc = {
      type: SchemaType.ARRAY,
      description: `Đáp án ${mcCount} câu MC. Mỗi phần tử là "A"/"B"/"C"/"D" hoặc null`,
      items: { type: SchemaType.STRING, nullable: true },
    }
  }

  if (tfCount > 0) {
    properties.tf = {
      type: SchemaType.ARRAY,
      description: `Đáp án ${tfCount} câu TF. Mỗi phần tử là chuỗi 4 ký tự Đ/S hoặc null`,
      items: { type: SchemaType.STRING, nullable: true },
    }
  }

  if (saCount > 0) {
    properties.sa = {
      type: SchemaType.ARRAY,
      description: `Đáp án ${saCount} câu SA. Mỗi phần tử là số thực dạng string hoặc null`,
      items: { type: SchemaType.STRING, nullable: true },
    }
  }

  return {
    type: SchemaType.OBJECT as const,
    properties,
    required: ['examCode', 'studentId', 'confidence', 'warnings',
      ...(mcCount > 0 ? ['mc'] : []),
      ...(tfCount > 0 ? ['tf'] : []),
      ...(saCount > 0 ? ['sa'] : []),
    ],
  } as Schema
}

// ═══════════════════════════════════
// MAIN SCANNER
// ═══════════════════════════════════

export async function scanWithGemini(req: GeminiScanRequest): Promise<GeminiScanResult> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY không được cấu hình')

  const genAI = new GoogleGenerativeAI(apiKey)

    const model = genAI.getGenerativeModel({
      model: 'gemini-3.5-flash',
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: buildResponseSchema(req.mcCount, req.tfCount, req.saCount),
        temperature: 0.1, // Thấp để giảm hallucination
      },
    })

  const prompt = buildPrompt(req.mcCount, req.tfCount, req.saCount)

  const result = await model.generateContent([
    { text: prompt },
    {
      inlineData: {
        mimeType: req.mimeType as any,
        data: req.imageBase64,
      },
    },
  ])

  const responseText = result.response.text()
  const parsed = JSON.parse(responseText)

  // Normalize & validate
  return normalizeGeminiResponse(parsed, req.mcCount, req.tfCount, req.saCount)
}

// ═══════════════════════════════════
// NORMALIZE RESPONSE
// ═══════════════════════════════════

function normalizeGeminiResponse(
  raw: any,
  mcCount: number,
  tfCount: number,
  saCount: number
): GeminiScanResult {
  const warnings: string[] = [...(raw.warnings ?? [])]

  // Normalize MC answers
  const mc: (string | null)[] = Array(mcCount).fill(null)
  if (Array.isArray(raw.mc)) {
    for (let i = 0; i < mcCount; i++) {
      const v = raw.mc[i]
      if (v && ['A', 'B', 'C', 'D'].includes(String(v).toUpperCase())) {
        mc[i] = String(v).toUpperCase()
      } else if (v) {
        mc[i] = null
        warnings.push(`Câu ${i + 1} MC: giá trị không hợp lệ "${v}"`)
      }
    }
  }

  // Normalize TF answers
  const tf: (string | null)[] = Array(tfCount).fill(null)
  if (Array.isArray(raw.tf)) {
    for (let i = 0; i < tfCount; i++) {
      const v = raw.tf[i]
      if (v && typeof v === 'string') {
        // Chuẩn hóa: D→Đ, d→Đ, s→S
        const normalized = v.toUpperCase()
          .replace(/D/g, 'Đ')
          .replace(/[^ĐS]/gi, '')
        if (normalized.length === 4) {
          tf[i] = normalized
        } else {
          tf[i] = null
          warnings.push(`Câu ${i + 1} TF: không đủ 4 ký tự`)
        }
      }
    }
  }

  // Normalize SA answers
  const sa: (string | null)[] = Array(saCount).fill(null)
  if (Array.isArray(raw.sa)) {
    for (let i = 0; i < saCount; i++) {
      const v = raw.sa[i]
      if (v && typeof v === 'string' && v.trim()) {
        // Chuẩn hóa số: chấm → phẩy
        sa[i] = v.trim().replace(/\./g, ',')
      }
    }
  }

  // Normalize student ID: chỉ lấy chữ số
  const rawSid = raw.studentId ? String(raw.studentId).replace(/\D/g, '') : null
  const studentId = rawSid && rawSid.length > 0 ? rawSid : null

  // Normalize exam code: chỉ lấy chữ số, max 4
  const rawCode = raw.examCode ? String(raw.examCode).replace(/\D/g, '') : null
  const examCode = rawCode && rawCode.length > 0 ? rawCode.slice(-4).padStart(rawCode.length, '0') : null

  return {
    examCode,
    studentId,
    mc,
    tf,
    sa,
    confidence: typeof raw.confidence === 'number' ? Math.min(1, Math.max(0, raw.confidence)) : 0.5,
    warnings,
  }
}
