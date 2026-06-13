// src/lib/omr/coordinate-map.ts
// Bản đồ tọa độ tương đối (0-1) của phiếu trả lời trắc nghiệm
// Tọa độ được tính từ mã TikZ trong buildAnswerSheetTex (export-zip/route.ts)
// Hệ tọa độ TikZ: gốc (A) = current page.north west, đơn vị cm
// Giấy A4: 21cm × 29.7cm

import type { SheetCoordinateMap, BubbleCoord, RelativePoint } from './types'

// ═══════════════════════════════════
// CONSTANTS — Kích thước A4 (cm)
// ═══════════════════════════════════
const A4_WIDTH = 21.0   // cm
const A4_HEIGHT = 29.7  // cm

/**
 * Chuyển tọa độ TikZ (cm, gốc góc trên-trái, Y âm đi xuống)
 * sang tọa độ tương đối (0-1)
 */
function tikzToRelative(xCm: number, yCm: number): RelativePoint {
  return {
    x: xCm / A4_WIDTH,
    y: Math.abs(yCm) / A4_HEIGHT,  // yCm luôn âm trong TikZ
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
 * @param mcCount Số câu MC (1-40)
 * @param tfCount Số câu TF (0-8)
 * @param saCount Số câu SA (0-6)
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
  // Từ TikZ: (1.3,-1.28), (13.74,-1.28), (19.68,-1.28),
  //          (1.3,-9.32), (13.65,-9.32), (19.68,-9.32),
  //          (1.3,-28.42), (19.68,-28.42)
  const cornerMarkers: RelativePoint[] = [
    tikzToRelative(1.3, -1.28),
    tikzToRelative(13.74, -1.28),
    tikzToRelative(19.68, -1.28),
    tikzToRelative(1.3, -9.32),
    tikzToRelative(13.65, -9.32),
    tikzToRelative(19.68, -9.32),
    tikzToRelative(1.3, -28.42),
    tikzToRelative(19.68, -28.42),
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
  // TikZ: center at (17.975 + i*0.405, -3.3 - j*0.575) với i=0..3, j=0..9
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
  // TikZ: center at (14.16 + i*0.405, -3.3 - j*0.575) với i=0..7, j=0..9
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
  // TikZ: center at (2.935 + k*4.315 + i*0.865, -11.35 - (rinc-1)*0.445)
  // k=0..3 (cột), rinc=1..10 (hàng trong cột), i=0..3 (A/B/C/D)
  // Câu r = k*10 + rinc
  const mcBubbles: BubbleCoord[][] = []
  const MC_LABELS = ['A', 'B', 'C', 'D']
  for (let q = 0; q < TN; q++) {
    const k = Math.floor(q / 10)      // cột (0-3)
    const rinc = (q % 10) + 1         // hàng trong cột (1-10)
    const options: BubbleCoord[] = []
    for (let i = 0; i < 4; i++) {
      const xCm = 2.935 + k * 4.315 + i * 0.865
      const yCm = -(11.35 + (rinc - 1) * 0.445)
      options.push(tikzBubble(xCm, yCm, MC_LABELS[i]))
    }
    mcBubbles.push(options)
  }

  // ── Phần II: Đúng/Sai TF ──
  // TikZ: center at (2.935 + k*4.32 + qi*1.73 + dx, -17.8 - yi*0.445)
  // k=0..3 (khối), qi=0,1 (câu trong khối), yi=0..3 (a/b/c/d), dx: D=0, S=0.865
  // Câu r = 2*k + q (q=1,2)
  const tfBubbles: BubbleCoord[][][] = []
  const TF_LABELS = ['Đ', 'S']
  for (let q = 0; q < DS; q++) {
    const k = Math.floor(q / 2)        // khối (0-3)
    const qi = q % 2                    // vị trí trong khối (0 or 1)
    const subs: BubbleCoord[][] = []
    for (let yi = 0; yi < 4; yi++) {    // a, b, c, d
      const options: BubbleCoord[] = []
      // Đ (dx=0), S (dx=0.865)
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
  // Dấu trừ: (2.79 + (r-1)*2.765, -21.77) — chỉ 1 bong bóng
  // Dấu phẩy: (3.38 + (r-1)*2.765 + pi*0.59, -22.23) — pi=0,1
  // Chữ số: (2.79 + (r-1)*2.77 + (p-1)*0.59, -22.69 - j*0.46) — p=1..4, j=0..9
  const saBubbles: SheetCoordinateMap['saBubbles'] = []
  for (let q = 0; q < TLN; q++) {
    const r = q + 1  // 1-indexed

    // Dấu trừ
    const minusSign = tikzBubble(
      2.79 + (r - 1) * 2.765,
      -21.77,
      '-'
    )

    // 2 vị trí dấu phẩy
    const commas: BubbleCoord[] = []
    for (let pi = 0; pi < 2; pi++) {
      commas.push(tikzBubble(
        3.38 + (r - 1) * 2.765 + pi * 0.59,
        -22.23,
        ','
      ))
    }

    // 4 cột chữ số, mỗi cột 10 hàng (0-9)
    const digits: BubbleCoord[][] = []
    for (let p = 1; p <= 4; p++) {
      const column: BubbleCoord[] = []
      for (let j = 0; j < 10; j++) {
        column.push(tikzBubble(
          2.79 + (r - 1) * 2.77 + (p - 1) * 0.59,
          -(22.69 + j * 0.46),
          String(j)
        ))
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
 * Chuyển tọa độ tương đối (0-1) → pixel trên ảnh
 */
export function relativeToPixel(
  rel: RelativePoint,
  imgWidth: number,
  imgHeight: number
): { px: number; py: number } {
  return {
    px: Math.round(rel.x * imgWidth),
    py: Math.round(rel.y * imgHeight),
  }
}

/**
 * Tính bán kính bong bóng (pixel) dựa trên kích thước ảnh
 * TikZ: circle(5pt) = ~0.176cm
 */
export function getBubbleRadiusPx(imgWidth: number): number {
  const bubbleRadiusCm = 0.176
  const radiusRelative = bubbleRadiusCm / A4_WIDTH
  return Math.round(radiusRelative * imgWidth)
}

/**
 * Tính kích thước ô vuông lớn (pixel)
 * TikZ: minimum size=0.54cm
 */
export function getLargeMarkerSizePx(imgWidth: number): number {
  const markerSizeCm = 0.54
  const sizeRelative = markerSizeCm / A4_WIDTH
  return Math.round(sizeRelative * imgWidth)
}

/**
 * Tính kích thước ô vuông nhỏ (pixel)
 * TikZ: minimum size=0.27cm
 */
export function getSmallMarkerSizePx(imgWidth: number): number {
  const markerSizeCm = 0.27
  const sizeRelative = markerSizeCm / A4_WIDTH
  return Math.round(sizeRelative * imgWidth)
}
