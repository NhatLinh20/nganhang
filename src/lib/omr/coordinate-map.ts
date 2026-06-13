// src/lib/omr/coordinate-map.ts
// Bản đồ tọa độ TƯƠNG ĐỐI theo 4 marker góc phiếu (KHÔNG phải A4)
// Tọa độ được tính từ mã TikZ trong buildAnswerSheetTex (export-zip/route.ts)
//
// HỆ QUY CHIẾU:
//   Gốc = marker góc TRÊN-TRÁI (1.3, -1.28)
//   Trục X: từ marker TL → TR  (1.3 → 19.68) = 18.38cm
//   Trục Y: từ marker TL → BL  (1.28 → 28.42) = 27.14cm
//   Tất cả tọa độ đều nằm trong [0, 1] × [0, 1] so với rectangle marker

import type { SheetCoordinateMap, BubbleCoord, RelativePoint } from './types'

// ═══════════════════════════════════
// REFERENCE MARKERS — 4 góc phiếu
// ═══════════════════════════════════

/** Marker góc trên-trái trong TikZ (cm) */
const REF_TL_X = 1.3
const REF_TL_Y = 1.28   // absolute value of -1.28

/** Marker góc trên-phải trong TikZ */
const REF_TR_X = 19.68
const REF_TR_Y = 1.28

/** Marker góc dưới-trái */
const REF_BL_X = 1.3
const REF_BL_Y = 28.42

/** Marker góc dưới-phải */
const REF_BR_X = 19.68
const REF_BR_Y = 28.42

/** Chiều rộng và cao vùng marker (cm) */
const REF_WIDTH = REF_BR_X - REF_TL_X    // 18.38 cm
const REF_HEIGHT = REF_BL_Y - REF_TL_Y   // 27.14 cm

// ═══════════════════════════════════
// COORDINATE CONVERSION
// ═══════════════════════════════════

/**
 * Chuyển tọa độ TikZ (cm) sang tọa độ tương đối (0-1)
 * THEO RECTANGLE 4 MARKER GÓC (không phải A4)
 *
 * Nghĩa là (0,0) = marker trên-trái, (1,1) = marker dưới-phải
 * Các phần tử nằm ngoài marker (ví dụ chữ tiêu đề phía trên) sẽ có y < 0
 */
function tikzToRelative(xCm: number, yCm: number): RelativePoint {
  const absY = Math.abs(yCm)
  return {
    x: (xCm - REF_TL_X) / REF_WIDTH,
    y: (absY - REF_TL_Y) / REF_HEIGHT,
  }
}

function tikzBubble(xCm: number, yCm: number, label: string): BubbleCoord {
  return {
    ...tikzToRelative(xCm, yCm),
    label,
  }
}

// ═══════════════════════════════════
// BUILD COORDINATE MAP
// ═══════════════════════════════════

/**
 * Xây dựng bản đồ tọa độ tương đối cho phiếu trả lời
 * Tất cả tọa độ đều tương đối theo 4 marker góc (0-1)
 */
export function buildCoordinateMap(
  mcCount: number,
  tfCount: number,
  saCount: number
): SheetCoordinateMap {
  const TN = Math.min(mcCount, 40)
  const DS = Math.min(tfCount, 8)
  const TLN = Math.min(saCount, 6)

  // ── Tracking marks (ô vuông lớn) ──
  const cornerMarkers: RelativePoint[] = [
    tikzToRelative(1.3, -1.28),     // TL
    tikzToRelative(13.74, -1.28),
    tikzToRelative(19.68, -1.28),   // TR
    tikzToRelative(1.3, -9.32),
    tikzToRelative(13.65, -9.32),
    tikzToRelative(19.68, -9.32),
    tikzToRelative(1.3, -28.42),    // BL
    tikzToRelative(19.68, -28.42),  // BR
  ]

  // ── Tracking marks (ô vuông nhỏ) ──
  const smallMarkerCoords = [
    [17.47, -5.9], [17.47, -8.79],
    [6.17, -10.64], [10.49, -10.64], [14.81, -10.64],
    [6.17, -15.79], [10.49, -15.79], [14.81, -15.79],
    [6.17, -16.52], [10.49, -16.52], [14.81, -16.52],
    [6.17, -19.55], [10.49, -19.55], [14.81, -19.55],
    [4.94, -19.94], [7.71, -19.94], [13.25, -19.94], [16.02, -19.94],
    [4.94, -27.73], [7.71, -27.73], [10.48, -27.73], [13.25, -27.73], [16.02, -27.73],
  ]
  const smallMarkers: RelativePoint[] = smallMarkerCoords.map(
    ([x, y]) => tikzToRelative(x, y)
  )

  // ── Mã đề thi: 4 cột × 10 hàng ──
  const examCodeBubbles: BubbleCoord[][] = []
  for (let col = 0; col < 4; col++) {
    const column: BubbleCoord[] = []
    for (let row = 0; row < 10; row++) {
      const xCm = 17.975 + col * 0.405
      const yCm = -(3.3 + row * 0.575)
      column.push(tikzBubble(xCm, yCm, String(row)))
    }
    examCodeBubbles.push(column)
  }

  // ── Số báo danh: 8 cột × 10 hàng ──
  const studentIdBubbles: BubbleCoord[][] = []
  for (let col = 0; col < 8; col++) {
    const column: BubbleCoord[] = []
    for (let row = 0; row < 10; row++) {
      const xCm = 14.16 + col * 0.405
      const yCm = -(3.3 + row * 0.575)
      column.push(tikzBubble(xCm, yCm, String(row)))
    }
    studentIdBubbles.push(column)
  }

  // ── Phần I: Trắc nghiệm MC ──
  const mcBubbles: BubbleCoord[][] = []
  const MC_LABELS = ['A', 'B', 'C', 'D']
  for (let q = 0; q < TN; q++) {
    const k = Math.floor(q / 10)
    const rinc = (q % 10) + 1
    const options: BubbleCoord[] = []
    for (let i = 0; i < 4; i++) {
      const xCm = 2.935 + k * 4.315 + i * 0.865
      const yCm = -(11.35 + (rinc - 1) * 0.445)
      options.push(tikzBubble(xCm, yCm, MC_LABELS[i]))
    }
    mcBubbles.push(options)
  }

  // ── Phần II: Đúng/Sai TF ──
  const tfBubbles: BubbleCoord[][][] = []
  const TF_LABELS = ['Đ', 'S']
  for (let q = 0; q < DS; q++) {
    const k = Math.floor(q / 2)
    const qi = q % 2
    const subs: BubbleCoord[][] = []
    for (let yi = 0; yi < 4; yi++) {
      const options: BubbleCoord[] = []
      const dxValues = [0, 0.865]
      for (let ti = 0; ti < 2; ti++) {
        const xCm = 2.935 + k * 4.32 + qi * 1.73 + dxValues[ti]
        const yCm = -(17.8 + yi * 0.445)
        options.push(tikzBubble(xCm, yCm, TF_LABELS[ti]))
      }
      subs.push(options)
    }
    tfBubbles.push(subs)
  }

  // ── Phần III: Trả lời ngắn SA ──
  const saBubbles: SheetCoordinateMap['saBubbles'] = []
  for (let q = 0; q < TLN; q++) {
    const r = q + 1
    const minusSign = tikzBubble(2.79 + (r - 1) * 2.765, -21.77, '-')
    const commas: BubbleCoord[] = []
    for (let pi = 0; pi < 2; pi++) {
      commas.push(tikzBubble(3.38 + (r - 1) * 2.765 + pi * 0.59, -22.23, ','))
    }
    const digits: BubbleCoord[][] = []
    for (let p = 1; p <= 4; p++) {
      const column: BubbleCoord[] = []
      for (let j = 0; j < 10; j++) {
        column.push(tikzBubble(2.79 + (r - 1) * 2.77 + (p - 1) * 0.59, -(22.69 + j * 0.46), String(j)))
      }
      digits.push(column)
    }
    saBubbles.push({ minusSign, commas, digits })
  }

  return {
    cornerMarkers,
    smallMarkers,
    examCodeBubbles,
    studentIdBubbles,
    mcBubbles,
    tfBubbles,
    saBubbles,
  }
}

/**
 * Tính bán kính bong bóng (pixel) dựa trên khoảng cách marker
 * TikZ: circle(5pt) = ~0.176cm
 * Tính tương đối theo chiều rộng vùng marker (REF_WIDTH = 18.38cm)
 */
export function getBubbleRadiusRelative(): number {
  return 0.176 / REF_WIDTH  // ~0.00958
}

/**
 * Tính kích thước ô vuông lớn (tương đối theo marker width)
 * TikZ: minimum size=0.54cm
 */
export function getLargeMarkerSizeRelative(): number {
  return 0.54 / REF_WIDTH  // ~0.0294
}
