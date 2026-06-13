// src/lib/omr/bubble-reader.ts
// Đọc bong bóng từ ảnh đã WarpPerspective (flat, 744x1052px cố định)
// Vì ảnh đã được duỗi phẳng, tọa độ pixel = tọa độ tương đối × kích thước ảnh
// → CHÍNH XÁC TUYỆT ĐỐI, không phụ thuộc góc chụp

import type {
  BubbleCoord,
  BubbleState,
  StudentAnswers,
  SheetCoordinateMap,
} from './types'
import { countBlackRatio } from './image-preprocessor'

// ═══════════════════════════════════
// WARPED IMAGE CONSTANTS
// ═══════════════════════════════════

/** Kích thước ảnh warped cố định */
export const WARPED_W = 744
export const WARPED_H = 1052

/**
 * Bán kính bubble trên ảnh warped (pixel)
 * TikZ: circle(5pt) = 0.176cm trên 18.38cm width = 0.958%
 * Trên warped width 744px: 0.00958 × 744 ≈ 7px
 */
const BUBBLE_RADIUS_PX = 7

const MIN_FILL_GAP = 0.10
const DEFAULT_THRESHOLD = 0.32

// ═══════════════════════════════════
// MAP TỌA ĐỘ TƯƠNG ĐỐI → PIXEL WARPED
// ═══════════════════════════════════

/**
 * Chuyển tọa độ tương đối (0-1) sang pixel trên ảnh warped
 * Vì ảnh đã được duỗi phẳng, phép biến đổi là tuyến tính đơn giản
 */
function relToWarpedPx(relX: number, relY: number): { x: number; y: number } {
  return {
    x: Math.round(relX * WARPED_W),
    y: Math.round(relY * WARPED_H),
  }
}

// ═══════════════════════════════════
// CORE: ĐỌC MỘT NHÓM BONG BÓNG
// ═══════════════════════════════════

function readBubbleGroup(
  coords: BubbleCoord[],
  binary: Uint8Array,
  width: number,
  height: number,
  threshold: number,
): { bubbles: BubbleState[]; selectedLabel: string | null; multipleSelected: boolean } {
  const bubbles: BubbleState[] = []

  for (const coord of coords) {
    // Tọa độ tương đối → pixel trên ảnh warped
    const { x: px, y: py } = relToWarpedPx(coord.x, coord.y)

    if (px < 0 || px >= width || py < 0 || py >= height) {
      bubbles.push({ x: px, y: py, radius: BUBBLE_RADIUS_PX, fillRatio: 0, isFilled: false, label: coord.label })
      continue
    }

    const fillRatio = countBlackRatio(binary, width, height, px, py, BUBBLE_RADIUS_PX)
    bubbles.push({ x: px, y: py, radius: BUBBLE_RADIUS_PX, fillRatio, isFilled: fillRatio >= threshold, label: coord.label })
  }

  const filled = bubbles.filter(b => b.isFilled)

  // Không có bubble nào vượt ngưỡng → thử chọn cái đậm nhất nếu đủ rõ
  if (filled.length === 0) {
    const sorted = [...bubbles].sort((a, b) => b.fillRatio - a.fillRatio)
    if (sorted.length >= 2) {
      const gap = sorted[0].fillRatio - sorted[1].fillRatio
      if (sorted[0].fillRatio >= threshold * 0.55 && gap >= MIN_FILL_GAP) {
        return { bubbles, selectedLabel: sorted[0].label, multipleSelected: false }
      }
    } else if (sorted.length === 1 && sorted[0].fillRatio >= threshold * 0.55) {
      return { bubbles, selectedLabel: sorted[0].label, multipleSelected: false }
    }
    return { bubbles, selectedLabel: null, multipleSelected: false }
  }

  if (filled.length === 1) {
    return { bubbles, selectedLabel: filled[0].label, multipleSelected: false }
  }

  // Nhiều bubble → chọn đậm nhất, cảnh báo nếu chênh lệch nhỏ
  const sorted = [...filled].sort((a, b) => b.fillRatio - a.fillRatio)
  const gap = sorted[0].fillRatio - sorted[1].fillRatio
  return { bubbles, selectedLabel: sorted[0].label, multipleSelected: gap < MIN_FILL_GAP }
}

// ═══════════════════════════════════
// ĐỌC MÃ ĐỀ
// ═══════════════════════════════════

export function readExamCode(
  coordMap: SheetCoordinateMap,
  binary: Uint8Array,
  width: number,
  height: number,
  threshold: number = DEFAULT_THRESHOLD
): { code: string | null; warnings: string[] } {
  const warnings: string[] = []
  let code = ''

  for (let col = 0; col < coordMap.examCodeBubbles.length; col++) {
    const result = readBubbleGroup(coordMap.examCodeBubbles[col], binary, width, height, threshold)
    if (result.selectedLabel === null) {
      warnings.push(`Mã đề: cột ${col + 1} không nhận dạng được`)
      return { code: null, warnings }
    }
    if (result.multipleSelected) warnings.push(`Mã đề: cột ${col + 1} tô không rõ`)
    code += result.selectedLabel
  }

  return { code, warnings }
}

// ═══════════════════════════════════
// ĐỌC SỐ BÁO DANH
// ═══════════════════════════════════

export function readStudentId(
  coordMap: SheetCoordinateMap,
  binary: Uint8Array,
  width: number,
  height: number,
  threshold: number = DEFAULT_THRESHOLD
): { id: string | null; warnings: string[] } {
  const warnings: string[] = []
  let id = ''

  for (let col = 0; col < coordMap.studentIdBubbles.length; col++) {
    const result = readBubbleGroup(coordMap.studentIdBubbles[col], binary, width, height, threshold)
    if (result.selectedLabel === null) {
      id += '_'
    } else {
      if (result.multipleSelected) warnings.push(`SBD: cột ${col + 1} tô không rõ`)
      id += result.selectedLabel
    }
  }

  return { id: id.replace(/_+$/, '') || null, warnings }
}

// ═══════════════════════════════════
// ĐỌC PHẦN I: MC
// ═══════════════════════════════════

export function readMCAnswers(
  coordMap: SheetCoordinateMap,
  binary: Uint8Array,
  width: number,
  height: number,
  threshold: number = DEFAULT_THRESHOLD
): { answers: (string | null)[]; warnings: string[]; debugBubbles: BubbleState[] } {
  const answers: (string | null)[] = []
  const warnings: string[] = []
  const debugBubbles: BubbleState[] = []

  for (let q = 0; q < coordMap.mcBubbles.length; q++) {
    const result = readBubbleGroup(coordMap.mcBubbles[q], binary, width, height, threshold)
    answers.push(result.selectedLabel)
    debugBubbles.push(...result.bubbles)
    if (result.selectedLabel === null) warnings.push(`Câu ${q+1} (TN): chưa tô hoặc không rõ`)
    else if (result.multipleSelected) warnings.push(`Câu ${q+1} (TN): tô nhiều đáp án, chọn "${result.selectedLabel}"`)
  }

  return { answers, warnings, debugBubbles }
}

// ═══════════════════════════════════
// ĐỌC PHẦN II: TF
// ═══════════════════════════════════

export function readTFAnswers(
  coordMap: SheetCoordinateMap,
  binary: Uint8Array,
  width: number,
  height: number,
  threshold: number = DEFAULT_THRESHOLD
): { answers: (string | null)[]; warnings: string[]; debugBubbles: BubbleState[] } {
  const answers: (string | null)[] = []
  const warnings: string[] = []
  const debugBubbles: BubbleState[] = []

  for (let q = 0; q < coordMap.tfBubbles.length; q++) {
    const subs = coordMap.tfBubbles[q]
    let tfStr = ''
    let hasNull = false

    for (let s = 0; s < subs.length; s++) {
      const result = readBubbleGroup(subs[s], binary, width, height, threshold)
      debugBubbles.push(...result.bubbles)

      if (result.selectedLabel === null) {
        hasNull = true
        tfStr += '?'
        warnings.push(`Câu ${q+1} ĐS ý ${String.fromCharCode(97+s)}: chưa tô`)
      } else {
        if (result.multipleSelected) warnings.push(`Câu ${q+1} ĐS ý ${String.fromCharCode(97+s)}: tô không rõ`)
        tfStr += result.selectedLabel
      }
    }
    answers.push(hasNull ? null : tfStr)
  }

  return { answers, warnings, debugBubbles }
}

// ═══════════════════════════════════
// ĐỌC PHẦN III: SA
// ═══════════════════════════════════

export function readSAAnswers(
  coordMap: SheetCoordinateMap,
  binary: Uint8Array,
  width: number,
  height: number,
  threshold: number = DEFAULT_THRESHOLD
): { answers: (string | null)[]; warnings: string[]; debugBubbles: BubbleState[] } {
  const answers: (string | null)[] = []
  const warnings: string[] = []
  const debugBubbles: BubbleState[] = []

  for (let q = 0; q < coordMap.saBubbles.length; q++) {
    const sa = coordMap.saBubbles[q]

    const minusResult = readBubbleGroup([sa.minusSign], binary, width, height, threshold)
    const isNegative = minusResult.selectedLabel !== null
    debugBubbles.push(...minusResult.bubbles)

    const comma1 = readBubbleGroup([sa.commas[0]], binary, width, height, threshold)
    const comma2 = readBubbleGroup([sa.commas[1]], binary, width, height, threshold)
    debugBubbles.push(...comma1.bubbles, ...comma2.bubbles)

    const digits: (string | null)[] = []
    for (let p = 0; p < sa.digits.length; p++) {
      const result = readBubbleGroup(sa.digits[p], binary, width, height, threshold)
      digits.push(result.selectedLabel)
      debugBubbles.push(...result.bubbles)
      if (result.multipleSelected) warnings.push(`Câu ${q+1} SA cột ${p+1}: tô không rõ`)
    }

    let numStr = isNegative ? '-' : ''
    for (let p = 0; p < digits.length; p++) {
      if (digits[p] !== null) numStr += digits[p]
      if (p === 0 && comma1.selectedLabel) numStr += ','
      if (p === 1 && comma2.selectedLabel) numStr += ','
    }

    if (numStr.length > 1) {
      numStr = numStr.replace(/^(-?)0+(\d)/, '$1$2')
    }

    answers.push(numStr || null)
  }

  return { answers, warnings, debugBubbles }
}

// ═══════════════════════════════════
// ĐỌC TOÀN BỘ
// ═══════════════════════════════════

export function readAllAnswers(
  coordMap: SheetCoordinateMap,
  binary: Uint8Array,
  width: number,
  height: number,
  threshold: number = DEFAULT_THRESHOLD,
  _corners?: any  // ignored — dùng warped image thay
): {
  examCode: string | null
  studentId: string | null
  answers: StudentAnswers
  warnings: string[]
  allDebugBubbles: BubbleState[]
} {
  const allWarnings: string[] = []
  const allDebugBubbles: BubbleState[] = []

  const examCodeResult = readExamCode(coordMap, binary, width, height, threshold)
  allWarnings.push(...examCodeResult.warnings)

  const studentIdResult = readStudentId(coordMap, binary, width, height, threshold)
  allWarnings.push(...studentIdResult.warnings)

  const mcResult = readMCAnswers(coordMap, binary, width, height, threshold)
  allWarnings.push(...mcResult.warnings)
  allDebugBubbles.push(...mcResult.debugBubbles)

  const tfResult = readTFAnswers(coordMap, binary, width, height, threshold)
  allWarnings.push(...tfResult.warnings)
  allDebugBubbles.push(...tfResult.debugBubbles)

  const saResult = readSAAnswers(coordMap, binary, width, height, threshold)
  allWarnings.push(...saResult.warnings)
  allDebugBubbles.push(...saResult.debugBubbles)

  return {
    examCode: examCodeResult.code,
    studentId: studentIdResult.id,
    answers: { mc: mcResult.answers, tf: tfResult.answers, sa: saResult.answers },
    warnings: allWarnings,
    allDebugBubbles,
  }
}
