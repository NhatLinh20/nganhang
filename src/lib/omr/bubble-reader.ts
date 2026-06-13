// src/lib/omr/bubble-reader.ts
// Đọc trạng thái tô/không tô của bong bóng trên phiếu trả lời
// Sử dụng countBlackRatio từ image-preprocessor.ts

import type {
  BubbleCoord,
  BubbleState,
  BubbleGroup,
  StudentAnswers,
  SheetCoordinateMap,
} from './types'
import { relativeToPixel, getBubbleRadiusPx } from './coordinate-map'
import { countBlackRatio, perspectiveMap } from './image-preprocessor'

// ═══════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════

/** Ngưỡng mặc định để xác định bong bóng đã tô */
const DEFAULT_FILL_THRESHOLD = 0.4

/**
 * Ngưỡng chênh lệch tối thiểu giữa bong bóng tô đậm nhất 
 * và bong bóng cao thứ 2 để xác nhận một câu trả lời rõ ràng.
 * Nếu chênh lệch < giá trị này → cảnh báo "tô không rõ ràng"
 */
const MIN_FILL_GAP = 0.15

// ═══════════════════════════════════
// CORE: Đọc một nhóm bong bóng
// ═══════════════════════════════════

/**
 * Đọc trạng thái một nhóm bong bóng (ví dụ: A/B/C/D cho một câu MC)
 * @param coords Tọa độ tương đối của các bong bóng
 * @param binary Ảnh binary (0=đen, 255=trắng)
 * @param width Chiều rộng ảnh (px)
 * @param height Chiều cao ảnh (px)
 * @param threshold Ngưỡng fill ratio
 * @param corners Góc phiếu đã phát hiện (dùng cho perspective correction)
 */
function readBubbleGroup(
  coords: BubbleCoord[],
  binary: Uint8Array,
  width: number,
  height: number,
  threshold: number,
  corners: { x: number; y: number }[] | null
): { bubbles: BubbleState[]; selectedLabel: string | null; multipleSelected: boolean } {
  const radius = getBubbleRadiusPx(width)
  const bubbles: BubbleState[] = []

  for (const coord of coords) {
    let px: number, py: number

    if (corners) {
      // Có perspective correction
      const mapped = perspectiveMap(corners, coord.x, coord.y)
      px = mapped.x
      py = mapped.y
    } else {
      // Không có correction → dùng tọa độ trực tiếp
      const pixel = relativeToPixel(coord, width, height)
      px = pixel.px
      py = pixel.py
    }

    const fillRatio = countBlackRatio(binary, width, height, px, py, radius)

    bubbles.push({
      x: px,
      y: py,
      radius,
      fillRatio,
      isFilled: fillRatio >= threshold,
      label: coord.label,
    })
  }

  // Xác định bong bóng được chọn
  const filled = bubbles.filter(b => b.isFilled)

  if (filled.length === 0) {
    return { bubbles, selectedLabel: null, multipleSelected: false }
  }

  if (filled.length === 1) {
    return { bubbles, selectedLabel: filled[0].label, multipleSelected: false }
  }

  // Nhiều bong bóng vượt ngưỡng → chọn cái tô đậm nhất
  // Nhưng nếu chênh lệch nhỏ → cảnh báo
  const sorted = [...filled].sort((a, b) => b.fillRatio - a.fillRatio)
  const gap = sorted[0].fillRatio - sorted[1].fillRatio

  if (gap < MIN_FILL_GAP) {
    // Tô không rõ ràng → vẫn chọn cái đậm nhất nhưng đánh dấu multipleSelected
    return { bubbles, selectedLabel: sorted[0].label, multipleSelected: true }
  }

  // Chênh lệch đủ lớn → chọn cái đậm nhất
  return { bubbles, selectedLabel: sorted[0].label, multipleSelected: false }
}

// ═══════════════════════════════════
// ĐỌC MÃ ĐỀ
// ═══════════════════════════════════

/**
 * Đọc mã đề thi từ 4 cột bong bóng
 * @returns Chuỗi 4 chữ số (ví dụ: "1234") hoặc null nếu không đọc được
 */
export function readExamCode(
  coordMap: SheetCoordinateMap,
  binary: Uint8Array,
  width: number,
  height: number,
  threshold: number = DEFAULT_FILL_THRESHOLD,
  corners: { x: number; y: number }[] | null = null
): { code: string | null; warnings: string[] } {
  const warnings: string[] = []
  let code = ''

  for (let col = 0; col < coordMap.examCodeBubbles.length; col++) {
    const colBubbles = coordMap.examCodeBubbles[col]
    const result = readBubbleGroup(colBubbles, binary, width, height, threshold, corners)

    if (result.selectedLabel === null) {
      warnings.push(`Mã đề: chữ số thứ ${col + 1} không nhận dạng được`)
      return { code: null, warnings }
    }
    if (result.multipleSelected) {
      warnings.push(`Mã đề: chữ số thứ ${col + 1} tô không rõ ràng`)
    }
    code += result.selectedLabel
  }

  return { code, warnings }
}

// ═══════════════════════════════════
// ĐỌC SỐ BÁO DANH
// ═══════════════════════════════════

/**
 * Đọc số báo danh từ 8 cột bong bóng
 */
export function readStudentId(
  coordMap: SheetCoordinateMap,
  binary: Uint8Array,
  width: number,
  height: number,
  threshold: number = DEFAULT_FILL_THRESHOLD,
  corners: { x: number; y: number }[] | null = null
): { id: string | null; warnings: string[] } {
  const warnings: string[] = []
  let id = ''

  for (let col = 0; col < coordMap.studentIdBubbles.length; col++) {
    const colBubbles = coordMap.studentIdBubbles[col]
    const result = readBubbleGroup(colBubbles, binary, width, height, threshold, corners)

    if (result.selectedLabel === null) {
      // SBD cho phép bỏ trống (chưa tô hết)
      id += '_'
    } else {
      if (result.multipleSelected) {
        warnings.push(`SBD: chữ số thứ ${col + 1} tô không rõ ràng`)
      }
      id += result.selectedLabel
    }
  }

  // Loại bỏ trailing underscore
  const trimmed = id.replace(/_+$/, '')
  return { id: trimmed || null, warnings }
}

// ═══════════════════════════════════
// ĐỌC PHẦN I: TRẮC NGHIỆM MC
// ═══════════════════════════════════

/**
 * Đọc đáp án Phần I (Trắc nghiệm 4 lựa chọn)
 * @returns Mảng đáp án: ['A', null, 'C', ...] (null = không tô / mờ)
 */
export function readMCAnswers(
  coordMap: SheetCoordinateMap,
  binary: Uint8Array,
  width: number,
  height: number,
  threshold: number = DEFAULT_FILL_THRESHOLD,
  corners: { x: number; y: number }[] | null = null
): { answers: (string | null)[]; warnings: string[]; debugBubbles: BubbleState[] } {
  const answers: (string | null)[] = []
  const warnings: string[] = []
  const debugBubbles: BubbleState[] = []

  for (let q = 0; q < coordMap.mcBubbles.length; q++) {
    const result = readBubbleGroup(
      coordMap.mcBubbles[q], binary, width, height, threshold, corners
    )

    answers.push(result.selectedLabel)
    debugBubbles.push(...result.bubbles)

    if (result.selectedLabel === null) {
      warnings.push(`Câu ${q + 1} (TN): chưa tô hoặc không rõ ràng`)
    } else if (result.multipleSelected) {
      warnings.push(`Câu ${q + 1} (TN): tô nhiều đáp án, chọn "${result.selectedLabel}"`)
    }
  }

  return { answers, warnings, debugBubbles }
}

// ═══════════════════════════════════
// ĐỌC PHẦN II: ĐÚNG/SAI TF
// ═══════════════════════════════════

/**
 * Đọc đáp án Phần II (Đúng/Sai)
 * Mỗi câu có 4 ý (a/b/c/d), mỗi ý chọn Đ hoặc S
 * @returns Mảng đáp án dạng chuỗi: ['ĐSĐS', 'ĐĐSS', ...] (null nếu không đọc được)
 */
export function readTFAnswers(
  coordMap: SheetCoordinateMap,
  binary: Uint8Array,
  width: number,
  height: number,
  threshold: number = DEFAULT_FILL_THRESHOLD,
  corners: { x: number; y: number }[] | null = null
): { answers: (string | null)[]; warnings: string[]; debugBubbles: BubbleState[] } {
  const answers: (string | null)[] = []
  const warnings: string[] = []
  const debugBubbles: BubbleState[] = []

  for (let q = 0; q < coordMap.tfBubbles.length; q++) {
    const subs = coordMap.tfBubbles[q] // 4 ý (a/b/c/d)
    let tfStr = ''
    let hasNull = false

    for (let s = 0; s < subs.length; s++) {
      const result = readBubbleGroup(
        subs[s], binary, width, height, threshold, corners
      )
      debugBubbles.push(...result.bubbles)

      if (result.selectedLabel === null) {
        hasNull = true
        tfStr += '?'
        warnings.push(`Câu ${q + 1} ĐS, ý ${String.fromCharCode(97 + s)}): chưa tô`)
      } else {
        if (result.multipleSelected) {
          warnings.push(`Câu ${q + 1} ĐS, ý ${String.fromCharCode(97 + s)}): tô không rõ`)
        }
        tfStr += result.selectedLabel
      }
    }

    answers.push(hasNull ? null : tfStr)
  }

  return { answers, warnings, debugBubbles }
}

// ═══════════════════════════════════
// ĐỌC PHẦN III: TRẢ LỜI NGẮN SA
// ═══════════════════════════════════

/**
 * Đọc đáp án Phần III (Trả lời ngắn)
 * Mỗi câu có: 1 dấu trừ, 2 vị trí dấu phẩy, 4 cột chữ số (0-9)
 * @returns Mảng đáp án dạng chuỗi: ['3', '-2,5', ...] (null nếu không đọc được)
 */
export function readSAAnswers(
  coordMap: SheetCoordinateMap,
  binary: Uint8Array,
  width: number,
  height: number,
  threshold: number = DEFAULT_FILL_THRESHOLD,
  corners: { x: number; y: number }[] | null = null
): { answers: (string | null)[]; warnings: string[]; debugBubbles: BubbleState[] } {
  const answers: (string | null)[] = []
  const warnings: string[] = []
  const debugBubbles: BubbleState[] = []

  for (let q = 0; q < coordMap.saBubbles.length; q++) {
    const sa = coordMap.saBubbles[q]

    // Đọc dấu trừ
    const minusResult = readBubbleGroup(
      [sa.minusSign], binary, width, height, threshold, corners
    )
    const isNegative = minusResult.selectedLabel !== null
    debugBubbles.push(...minusResult.bubbles)

    // Đọc dấu phẩy (2 vị trí giữa cột 1-2 và 2-3)
    const commaResult1 = readBubbleGroup(
      [sa.commas[0]], binary, width, height, threshold, corners
    )
    const commaResult2 = readBubbleGroup(
      [sa.commas[1]], binary, width, height, threshold, corners
    )
    const commaAfterCol1 = commaResult1.selectedLabel !== null
    const commaAfterCol2 = commaResult2.selectedLabel !== null
    debugBubbles.push(...commaResult1.bubbles, ...commaResult2.bubbles)

    // Đọc 4 cột chữ số
    const digits: (string | null)[] = []
    for (let p = 0; p < sa.digits.length; p++) {
      const result = readBubbleGroup(
        sa.digits[p], binary, width, height, threshold, corners
      )
      digits.push(result.selectedLabel)
      debugBubbles.push(...result.bubbles)

      if (result.multipleSelected) {
        warnings.push(`Câu ${q + 1} (SA), cột ${p + 1}: tô không rõ`)
      }
    }

    // Ghép thành chuỗi số
    let numStr = ''
    if (isNegative) numStr += '-'

    for (let p = 0; p < digits.length; p++) {
      if (digits[p] !== null) numStr += digits[p]
      // Chèn dấu phẩy sau cột phù hợp
      if (p === 0 && commaAfterCol1) numStr += ','
      if (p === 1 && commaAfterCol2) numStr += ','
    }

    // Loại bỏ leading zeros (trừ "0" và "0,...")
    if (numStr && numStr !== '0' && !numStr.startsWith('0,') && !numStr.startsWith('-0,')) {
      numStr = numStr.replace(/^(-?)0+/, '$1')
    }

    answers.push(numStr || null)
  }

  return { answers, warnings, debugBubbles }
}

// ═══════════════════════════════════
// ĐỌC TOÀN BỘ PHIẾU
// ═══════════════════════════════════

/**
 * Đọc toàn bộ phiếu trả lời — gom kết quả từ tất cả các phần
 */
export function readAllAnswers(
  coordMap: SheetCoordinateMap,
  binary: Uint8Array,
  width: number,
  height: number,
  threshold: number = DEFAULT_FILL_THRESHOLD,
  corners: { x: number; y: number }[] | null = null
): {
  examCode: string | null
  studentId: string | null
  answers: StudentAnswers
  warnings: string[]
  allDebugBubbles: BubbleState[]
} {
  const allWarnings: string[] = []
  const allDebugBubbles: BubbleState[] = []

  // Mã đề
  const examCodeResult = readExamCode(coordMap, binary, width, height, threshold, corners)
  allWarnings.push(...examCodeResult.warnings)

  // SBD
  const studentIdResult = readStudentId(coordMap, binary, width, height, threshold, corners)
  allWarnings.push(...studentIdResult.warnings)

  // Phần I: MC
  const mcResult = readMCAnswers(coordMap, binary, width, height, threshold, corners)
  allWarnings.push(...mcResult.warnings)
  allDebugBubbles.push(...mcResult.debugBubbles)

  // Phần II: TF
  const tfResult = readTFAnswers(coordMap, binary, width, height, threshold, corners)
  allWarnings.push(...tfResult.warnings)
  allDebugBubbles.push(...tfResult.debugBubbles)

  // Phần III: SA
  const saResult = readSAAnswers(coordMap, binary, width, height, threshold, corners)
  allWarnings.push(...saResult.warnings)
  allDebugBubbles.push(...saResult.debugBubbles)

  return {
    examCode: examCodeResult.code,
    studentId: studentIdResult.id,
    answers: {
      mc: mcResult.answers,
      tf: tfResult.answers,
      sa: saResult.answers,
    },
    warnings: allWarnings,
    allDebugBubbles,
  }
}
