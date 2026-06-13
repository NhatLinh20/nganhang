// src/lib/omr/bubble-reader.ts
// Đọc trạng thái tô/không tô của bong bóng trên phiếu trả lời
// V2: Luôn dùng perspective mapping từ 4 corner markers

import type {
  BubbleCoord,
  BubbleState,
  StudentAnswers,
  SheetCoordinateMap,
} from './types'
import { getBubbleRadiusRelative } from './coordinate-map'
import { countBlackRatio, perspectiveMap } from './image-preprocessor'

// ═══════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════

const DEFAULT_FILL_THRESHOLD = 0.35

/**
 * Ngưỡng chênh lệch tối thiểu giữa bubble tô đậm nhất và bubble cao thứ 2
 * để xác nhận câu trả lời rõ ràng
 */
const MIN_FILL_GAP = 0.12

// ═══════════════════════════════════
// CORE: Đọc một nhóm bong bóng
// ═══════════════════════════════════

/**
 * Đọc trạng thái một nhóm bong bóng (ví dụ: A/B/C/D cho một câu MC)
 * Luôn dùng perspective mapping từ corners
 */
function readBubbleGroup(
  coords: BubbleCoord[],
  binary: Uint8Array,
  width: number,
  height: number,
  threshold: number,
  corners: { x: number; y: number }[]
): { bubbles: BubbleState[]; selectedLabel: string | null; multipleSelected: boolean } {
  // Bubble radius tính từ khoảng cách marker
  const markerW = Math.sqrt(
    (corners[1].x - corners[0].x) ** 2 + (corners[1].y - corners[0].y) ** 2
  )
  const bubbleRadiusRel = getBubbleRadiusRelative()
  const radiusPx = Math.max(4, Math.round(bubbleRadiusRel * markerW))

  const bubbles: BubbleState[] = []

  for (const coord of coords) {
    // Map tọa độ tương đối → pixel qua perspective transform
    const mapped = perspectiveMap(corners, coord.x, coord.y)
    const px = mapped.x
    const py = mapped.y

    // Kiểm tra bounds
    if (px < 0 || px >= width || py < 0 || py >= height) {
      bubbles.push({
        x: px, y: py, radius: radiusPx,
        fillRatio: 0, isFilled: false, label: coord.label,
      })
      continue
    }

    const fillRatio = countBlackRatio(binary, width, height, px, py, radiusPx)

    bubbles.push({
      x: px,
      y: py,
      radius: radiusPx,
      fillRatio,
      isFilled: fillRatio >= threshold,
      label: coord.label,
    })
  }

  // Xác định bubble được chọn
  const filled = bubbles.filter(b => b.isFilled)

  if (filled.length === 0) {
    // Nếu không có bubble nào vượt ngưỡng, thử chọn cái đậm nhất
    // nếu nó rõ ràng hơn phần còn lại
    const sorted = [...bubbles].sort((a, b) => b.fillRatio - a.fillRatio)
    if (sorted.length >= 2) {
      const gap = sorted[0].fillRatio - sorted[1].fillRatio
      // Nếu bubble đậm nhất vượt 50% ngưỡng VÀ chênh lệch rõ
      if (sorted[0].fillRatio >= threshold * 0.6 && gap >= MIN_FILL_GAP) {
        return { bubbles, selectedLabel: sorted[0].label, multipleSelected: false }
      }
    }
    return { bubbles, selectedLabel: null, multipleSelected: false }
  }

  if (filled.length === 1) {
    return { bubbles, selectedLabel: filled[0].label, multipleSelected: false }
  }

  // Nhiều bubble vượt ngưỡng → chọn đậm nhất
  const sorted = [...filled].sort((a, b) => b.fillRatio - a.fillRatio)
  const gap = sorted[0].fillRatio - sorted[1].fillRatio

  if (gap < MIN_FILL_GAP) {
    return { bubbles, selectedLabel: sorted[0].label, multipleSelected: true }
  }

  return { bubbles, selectedLabel: sorted[0].label, multipleSelected: false }
}

// ═══════════════════════════════════
// ĐỌC MÃ ĐỀ
// ═══════════════════════════════════

export function readExamCode(
  coordMap: SheetCoordinateMap,
  binary: Uint8Array,
  width: number,
  height: number,
  threshold: number,
  corners: { x: number; y: number }[]
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

export function readStudentId(
  coordMap: SheetCoordinateMap,
  binary: Uint8Array,
  width: number,
  height: number,
  threshold: number,
  corners: { x: number; y: number }[]
): { id: string | null; warnings: string[] } {
  const warnings: string[] = []
  let id = ''

  for (let col = 0; col < coordMap.studentIdBubbles.length; col++) {
    const colBubbles = coordMap.studentIdBubbles[col]
    const result = readBubbleGroup(colBubbles, binary, width, height, threshold, corners)

    if (result.selectedLabel === null) {
      id += '_'
    } else {
      if (result.multipleSelected) {
        warnings.push(`SBD: chữ số thứ ${col + 1} tô không rõ ràng`)
      }
      id += result.selectedLabel
    }
  }

  const trimmed = id.replace(/_+$/, '')
  return { id: trimmed || null, warnings }
}

// ═══════════════════════════════════
// ĐỌC PHẦN I: TRẮC NGHIỆM MC
// ═══════════════════════════════════

export function readMCAnswers(
  coordMap: SheetCoordinateMap,
  binary: Uint8Array,
  width: number,
  height: number,
  threshold: number,
  corners: { x: number; y: number }[]
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

export function readTFAnswers(
  coordMap: SheetCoordinateMap,
  binary: Uint8Array,
  width: number,
  height: number,
  threshold: number,
  corners: { x: number; y: number }[]
): { answers: (string | null)[]; warnings: string[]; debugBubbles: BubbleState[] } {
  const answers: (string | null)[] = []
  const warnings: string[] = []
  const debugBubbles: BubbleState[] = []

  for (let q = 0; q < coordMap.tfBubbles.length; q++) {
    const subs = coordMap.tfBubbles[q]
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

export function readSAAnswers(
  coordMap: SheetCoordinateMap,
  binary: Uint8Array,
  width: number,
  height: number,
  threshold: number,
  corners: { x: number; y: number }[]
): { answers: (string | null)[]; warnings: string[]; debugBubbles: BubbleState[] } {
  const answers: (string | null)[] = []
  const warnings: string[] = []
  const debugBubbles: BubbleState[] = []

  for (let q = 0; q < coordMap.saBubbles.length; q++) {
    const sa = coordMap.saBubbles[q]

    const minusResult = readBubbleGroup([sa.minusSign], binary, width, height, threshold, corners)
    const isNegative = minusResult.selectedLabel !== null
    debugBubbles.push(...minusResult.bubbles)

    const commaResult1 = readBubbleGroup([sa.commas[0]], binary, width, height, threshold, corners)
    const commaResult2 = readBubbleGroup([sa.commas[1]], binary, width, height, threshold, corners)
    const commaAfterCol1 = commaResult1.selectedLabel !== null
    const commaAfterCol2 = commaResult2.selectedLabel !== null
    debugBubbles.push(...commaResult1.bubbles, ...commaResult2.bubbles)

    const digits: (string | null)[] = []
    for (let p = 0; p < sa.digits.length; p++) {
      const result = readBubbleGroup(sa.digits[p], binary, width, height, threshold, corners)
      digits.push(result.selectedLabel)
      debugBubbles.push(...result.bubbles)

      if (result.multipleSelected) {
        warnings.push(`Câu ${q + 1} (SA), cột ${p + 1}: tô không rõ`)
      }
    }

    let numStr = ''
    if (isNegative) numStr += '-'

    for (let p = 0; p < digits.length; p++) {
      if (digits[p] !== null) numStr += digits[p]
      if (p === 0 && commaAfterCol1) numStr += ','
      if (p === 1 && commaAfterCol2) numStr += ','
    }

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

export function readAllAnswers(
  coordMap: SheetCoordinateMap,
  binary: Uint8Array,
  width: number,
  height: number,
  threshold: number,
  corners: { x: number; y: number }[]
): {
  examCode: string | null
  studentId: string | null
  answers: StudentAnswers
  warnings: string[]
  allDebugBubbles: BubbleState[]
} {
  const allWarnings: string[] = []
  const allDebugBubbles: BubbleState[] = []

  const examCodeResult = readExamCode(coordMap, binary, width, height, threshold, corners)
  allWarnings.push(...examCodeResult.warnings)

  const studentIdResult = readStudentId(coordMap, binary, width, height, threshold, corners)
  allWarnings.push(...studentIdResult.warnings)

  const mcResult = readMCAnswers(coordMap, binary, width, height, threshold, corners)
  allWarnings.push(...mcResult.warnings)
  allDebugBubbles.push(...mcResult.debugBubbles)

  const tfResult = readTFAnswers(coordMap, binary, width, height, threshold, corners)
  allWarnings.push(...tfResult.warnings)
  allDebugBubbles.push(...tfResult.debugBubbles)

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
