// src/lib/omr/image-preprocessor.ts
// Xử lý ảnh phiếu trả lời — thuần Canvas API + toán học thuần JS
// Perspective transform tự implement (không cần OpenCV.js)

// ═══════════════════════════════════
// LOAD ẢNH
// ═══════════════════════════════════

export async function loadImageFromFile(file: File): Promise<{
  imageData: ImageData
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  width: number
  height: number
}> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const MAX = 1600
      let w = img.width, h = img.height
      if (w > MAX || h > MAX) {
        const s = MAX / Math.max(w, h)
        w = Math.round(w * s); h = Math.round(h * s)
      }
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!
      ctx.drawImage(img, 0, 0, w, h)
      const imageData = ctx.getImageData(0, 0, w, h)
      resolve({ imageData, canvas, ctx, width: w, height: h })
    }
    img.onerror = () => reject(new Error('Không load được ảnh'))
    img.src = URL.createObjectURL(file)
  })
}

// ═══════════════════════════════════
// GRAYSCALE + THRESHOLD
// ═══════════════════════════════════

export function toGrayscale(imageData: ImageData): Uint8Array {
  const { data, width, height } = imageData
  const gray = new Uint8Array(width * height)
  for (let i = 0; i < width * height; i++) {
    gray[i] = Math.round(0.299 * data[i*4] + 0.587 * data[i*4+1] + 0.114 * data[i*4+2])
  }
  return gray
}

export function adaptiveThreshold(
  gray: Uint8Array, width: number, height: number,
  blockSize = 25, C = 8
): Uint8Array {
  const result = new Uint8Array(width * height)
  const integral = new Float64Array((width + 1) * (height + 1))
  for (let y = 0; y < height; y++) {
    let rowSum = 0
    for (let x = 0; x < width; x++) {
      rowSum += gray[y * width + x]
      integral[(y+1)*(width+1)+(x+1)] = integral[y*(width+1)+(x+1)] + rowSum
    }
  }
  const half = Math.floor(blockSize / 2)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const x1=Math.max(0,x-half), y1=Math.max(0,y-half)
      const x2=Math.min(width-1,x+half), y2=Math.min(height-1,y+half)
      const count = (x2-x1+1)*(y2-y1+1)
      const sum = integral[(y2+1)*(width+1)+(x2+1)] - integral[y1*(width+1)+(x2+1)]
               - integral[(y2+1)*(width+1)+x1] + integral[y1*(width+1)+x1]
      result[y*width+x] = gray[y*width+x] < sum/count - C ? 0 : 255
    }
  }
  return result
}

// ═══════════════════════════════════
// ĐẾM PIXEL ĐEN TRONG VÙNG TRÒN
// ═══════════════════════════════════

export function countBlackRatio(
  binary: Uint8Array, width: number, height: number,
  cx: number, cy: number, radius: number
): number {
  let total = 0, black = 0
  const r2 = radius * radius
  for (let y = Math.max(0,Math.floor(cy-radius)); y <= Math.min(height-1,Math.ceil(cy+radius)); y++) {
    for (let x = Math.max(0,Math.floor(cx-radius)); x <= Math.min(width-1,Math.ceil(cx+radius)); x++) {
      if ((x-cx)**2+(y-cy)**2 <= r2) {
        total++
        if (binary[y*width+x]===0) black++
      }
    }
  }
  return total > 0 ? black/total : 0
}

// ═══════════════════════════════════
// CORNER DETECTION
// Tìm 4 ô vuông đen ở 4 góc phiếu
// Chiến lược: chia ảnh thành 4 phần, tìm vùng đen nhất trong mỗi phần
// ═══════════════════════════════════

export interface SheetCorners {
  tl: { x: number; y: number }
  tr: { x: number; y: number }
  bl: { x: number; y: number }
  br: { x: number; y: number }
}

function blackRatioRect(
  binary: Uint8Array, width: number, height: number,
  cx: number, cy: number, halfSize: number
): number {
  let total = 0, black = 0
  const sy = Math.max(0, Math.floor(cy-halfSize)), ey = Math.min(height-1, Math.ceil(cy+halfSize))
  const sx = Math.max(0, Math.floor(cx-halfSize)), ex = Math.min(width-1, Math.ceil(cx+halfSize))
  for (let y = sy; y <= ey; y++)
    for (let x = sx; x <= ex; x++) { total++; if (binary[y*width+x]===0) black++ }
  return total > 0 ? black/total : 0
}

/**
 * Tìm vị trí ô vuông đen tốt nhất trong một vùng (quadrant)
 */
function findBestMarkerInRegion(
  binary: Uint8Array,
  width: number, height: number,
  xStart: number, xEnd: number,
  yStart: number, yEnd: number,
  markerHalf: number
): { x: number; y: number; score: number } | null {
  let best = { x: 0, y: 0, score: -1 }
  const step = Math.max(2, Math.floor(markerHalf / 3))

  for (let cy = yStart; cy <= yEnd; cy += step) {
    for (let cx = xStart; cx <= xEnd; cx += step) {
      // Inner: phải đen
      const inner = blackRatioRect(binary, width, height, cx, cy, markerHalf)
      if (inner < 0.6) continue

      // Outer ring: phải TRẮNG (contrast)
      const outerH = markerHalf + Math.max(3, Math.floor(markerHalf * 0.6))
      const outerTotalPixels = (outerH*2+1)**2
      const innerPixels = (markerHalf*2+1)**2
      const outerBlack = blackRatioRect(binary, width, height, cx, cy, outerH) * outerTotalPixels
      const innerBlack = inner * innerPixels
      const ringPixels = outerTotalPixels - innerPixels
      const ringBlack = ringPixels > 0 ? (outerBlack - innerBlack) / ringPixels : 1
      const contrast = inner - ringBlack
      if (contrast < 0.2) continue

      const score = inner * 0.5 + contrast * 0.5
      if (score > best.score) best = { x: cx, y: cy, score }
    }
  }
  return best.score > 0 ? best : null
}

/**
 * Detect 4 corner markers chia ảnh thành 4 phần
 * Tỷ lệ search trong mỗi phần: 0-45% mỗi chiều (overlap nhẹ)
 */
export function findCornerMarkers(
  binary: Uint8Array, width: number, height: number
): SheetCorners | null {
  const markerHalf = Math.max(8, Math.floor(Math.min(width, height) * 0.018))
  const margin = Math.floor(Math.min(width, height) * 0.03)

  // Giới hạn search trong 45% đầu mỗi chiều
  const midX = Math.floor(width * 0.45)
  const midY = Math.floor(height * 0.45)

  const tl = findBestMarkerInRegion(binary, width, height,
    margin, midX, margin, midY, markerHalf)
  const tr = findBestMarkerInRegion(binary, width, height,
    width - midX, width - margin, margin, midY, markerHalf)
  const bl = findBestMarkerInRegion(binary, width, height,
    margin, midX, height - midY, height - margin, markerHalf)
  const br = findBestMarkerInRegion(binary, width, height,
    width - midX, width - margin, height - midY, height - margin, markerHalf)

  if (!tl || !tr || !bl || !br) return null
  if (tl.score < 0.3 || tr.score < 0.3 || bl.score < 0.3 || br.score < 0.3) return null

  // Validate: tỷ lệ w/h gần với phiếu A4 (18.38/27.14 ≈ 0.677), cho phép 0.4-1.1
  const avgW = ((tr.x - tl.x) + (br.x - bl.x)) / 2
  const avgH = ((bl.y - tl.y) + (br.y - tr.y)) / 2
  if (avgW < width * 0.3 || avgH < height * 0.3) return null
  const ratio = avgW / avgH
  if (ratio < 0.35 || ratio > 1.2) return null

  return {
    tl: { x: tl.x, y: tl.y },
    tr: { x: tr.x, y: tr.y },
    bl: { x: bl.x, y: bl.y },
    br: { x: br.x, y: br.y },
  }
}

// ═══════════════════════════════════
// PERSPECTIVE TRANSFORM — THUẦN JS
// Không cần OpenCV! Implement homography 3x3
// ═══════════════════════════════════

/**
 * Tính ma trận homography 3×3 từ 4 điểm nguồn → 4 điểm đích
 * Dùng thuật toán DLT (Direct Linear Transform)
 */
function computeHomography(
  src: [number, number][],
  dst: [number, number][]
): Float64Array {
  // Build 8×8 matrix A và vector b
  const A: number[][] = []
  const b: number[] = []

  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i]
    const [u, v] = dst[i]
    A.push([x, y, 1, 0, 0, 0, -u*x, -u*y])
    b.push(u)
    A.push([0, 0, 0, x, y, 1, -v*x, -v*y])
    b.push(v)
  }

  // Gaussian elimination
  const h = gaussianElimination(A, b)
  // h = [h00, h01, h02, h10, h11, h12, h20, h21], h22 = 1
  return new Float64Array([h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1])
}

/** Giải hệ Ax = b bằng Gaussian elimination */
function gaussianElimination(A: number[][], b: number[]): number[] {
  const n = b.length
  // Augmented matrix
  const M = A.map((row, i) => [...row, b[i]])

  for (let col = 0; col < n; col++) {
    // Pivot
    let maxRow = col
    for (let row = col + 1; row < n; row++)
      if (Math.abs(M[row][col]) > Math.abs(M[maxRow][col])) maxRow = row;
    [M[col], M[maxRow]] = [M[maxRow], M[col]]

    const pivot = M[col][col]
    if (Math.abs(pivot) < 1e-10) continue

    for (let row = col + 1; row < n; row++) {
      const factor = M[row][col] / pivot
      for (let j = col; j <= n; j++) M[row][j] -= factor * M[col][j]
    }
  }

  // Back substitution
  const x = new Array(n).fill(0)
  for (let i = n - 1; i >= 0; i--) {
    x[i] = M[i][n] / M[i][i]
    for (let j = i + 1; j < n; j++) x[i] -= M[i][j] * x[j] / M[i][i]
  }
  return x
}

/**
 * Áp dụng perspective warp lên ImageData
 * Dùng inverse mapping + bilinear interpolation
 *
 * @param srcImageData ảnh gốc
 * @param corners 4 góc phiếu trên ảnh gốc (TL, TR, BL, BR)
 * @param outW chiều rộng đầu ra (744px)
 * @param outH chiều cao đầu ra (1052px)
 */
export function warpPerspective(
  srcImageData: ImageData,
  corners: SheetCorners,
  outW: number,
  outH: number
): HTMLCanvasElement {
  const { data: srcData, width: srcW, height: srcH } = srcImageData

  // Ma trận H: từ pixel output → pixel input (inverse mapping)
  const srcPts: [number, number][] = [
    [corners.tl.x, corners.tl.y],
    [corners.tr.x, corners.tr.y],
    [corners.bl.x, corners.bl.y],
    [corners.br.x, corners.br.y],
  ]
  const dstPts: [number, number][] = [
    [0, 0],
    [outW - 1, 0],
    [0, outH - 1],
    [outW - 1, outH - 1],
  ]

  // H: dst → src (inverse)
  const H = computeHomography(dstPts, srcPts)
  const [h00,h01,h02,h10,h11,h12,h20,h21,h22] = H

  // Tạo canvas output
  const canvas = document.createElement('canvas')
  canvas.width = outW; canvas.height = outH
  const ctx = canvas.getContext('2d')!
  const outData = ctx.createImageData(outW, outH)
  const dst = outData.data

  for (let dy = 0; dy < outH; dy++) {
    for (let dx = 0; dx < outW; dx++) {
      // Inverse project: (dx, dy) → (sx, sy)
      const w = h20 * dx + h21 * dy + h22
      const sx = (h00 * dx + h01 * dy + h02) / w
      const sy = (h10 * dx + h11 * dy + h12) / w

      // Bilinear interpolation
      const x0 = Math.floor(sx), y0 = Math.floor(sy)
      const x1 = x0 + 1, y1 = y0 + 1
      const fx = sx - x0, fy = sy - y0

      if (x0 < 0 || y0 < 0 || x1 >= srcW || y1 >= srcH) {
        const di = (dy * outW + dx) * 4
        dst[di] = 255; dst[di+1] = 255; dst[di+2] = 255; dst[di+3] = 255
        continue
      }

      const i00 = (y0 * srcW + x0) * 4
      const i10 = (y0 * srcW + x1) * 4
      const i01 = (y1 * srcW + x0) * 4
      const i11 = (y1 * srcW + x1) * 4
      const di = (dy * outW + dx) * 4

      for (let c = 0; c < 3; c++) {
        const top = srcData[i00+c] * (1-fx) + srcData[i10+c] * fx
        const bot = srcData[i01+c] * (1-fx) + srcData[i11+c] * fx
        dst[di+c] = Math.round(top * (1-fy) + bot * fy)
      }
      dst[di+3] = 255
    }
  }

  ctx.putImageData(outData, 0, 0)
  return canvas
}

// ═══════════════════════════════════
// DETECT + WARP (một bước)
// ═══════════════════════════════════

export const WARPED_W = 744
export const WARPED_H = 1052

export function detectAndWarpSync(
  imageData: ImageData,
  width: number,
  height: number
): { warpedCanvas: HTMLCanvasElement; corners: SheetCorners | null; success: boolean } {
  const gray = toGrayscale(imageData)
  const binary = adaptiveThreshold(gray, width, height, 25, 8)
  const corners = findCornerMarkers(binary, width, height)

  if (!corners) {
    // Fallback: dùng toàn bộ ảnh
    const margin = Math.floor(Math.min(width, height) * 0.03)
    const fallback: SheetCorners = {
      tl: { x: margin, y: margin },
      tr: { x: width - margin, y: margin },
      bl: { x: margin, y: height - margin },
      br: { x: width - margin, y: height - margin },
    }
    const warpedCanvas = warpPerspective(imageData, fallback, WARPED_W, WARPED_H)
    return { warpedCanvas, corners: null, success: false }
  }

  const warpedCanvas = warpPerspective(imageData, corners, WARPED_W, WARPED_H)
  return { warpedCanvas, corners, success: true }
}

/** Lấy binary từ warped canvas */
export function getBinaryFromCanvas(canvas: HTMLCanvasElement): {
  binary: Uint8Array; gray: Uint8Array; width: number; height: number
} {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  const { width, height } = canvas
  const imageData = ctx.getImageData(0, 0, width, height)
  const gray = toGrayscale(imageData)
  const binary = adaptiveThreshold(gray, width, height, 25, 8)
  return { binary, gray, width, height }
}

// ═══════════════════════════════════
// PERSPECTIVE MAP (dùng trong legacy code)
// ═══════════════════════════════════

export function perspectiveMap(
  corners: { x: number; y: number }[],
  relX: number, relY: number
): { x: number; y: number } {
  const [tl, tr, bl, br] = corners
  const topX = tl.x + (tr.x - tl.x) * relX
  const topY = tl.y + (tr.y - tl.y) * relX
  const botX = bl.x + (br.x - bl.x) * relX
  const botY = bl.y + (br.y - bl.y) * relX
  return { x: Math.round(topX + (botX - topX) * relY), y: Math.round(topY + (botY - topY) * relY) }
}

// ═══════════════════════════════════
// DEBUG OVERLAY
// ═══════════════════════════════════

export function drawDebugOverlay(
  ctx: CanvasRenderingContext2D,
  corners: SheetCorners | null,
  bubbles: { cx: number; cy: number; radius: number; isFilled: boolean; label: string }[]
) {
  if (corners) {
    ctx.strokeStyle = '#22c55e'
    ctx.lineWidth = 3
    ctx.setLineDash([8, 4])
    ctx.beginPath()
    ctx.moveTo(corners.tl.x, corners.tl.y)
    ctx.lineTo(corners.tr.x, corners.tr.y)
    ctx.lineTo(corners.br.x, corners.br.y)
    ctx.lineTo(corners.bl.x, corners.bl.y)
    ctx.closePath()
    ctx.stroke()
    ctx.setLineDash([])

    const pts = [
      { ...corners.tl, label: 'TL' }, { ...corners.tr, label: 'TR' },
      { ...corners.bl, label: 'BL' }, { ...corners.br, label: 'BR' },
    ]
    for (const p of pts) {
      ctx.beginPath(); ctx.arc(p.x, p.y, 10, 0, Math.PI*2)
      ctx.fillStyle = '#22c55e'; ctx.fill()
      ctx.fillStyle = '#fff'
      ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(p.label, p.x, p.y)
    }
  }
  for (const b of bubbles) {
    ctx.beginPath(); ctx.arc(b.cx, b.cy, b.radius, 0, Math.PI*2)
    ctx.lineWidth = 2
    if (b.isFilled) {
      ctx.strokeStyle = '#10b981'; ctx.fillStyle = 'rgba(16,185,129,0.3)'; ctx.fill()
    } else {
      ctx.strokeStyle = 'rgba(148,163,184,0.25)'
    }
    ctx.stroke()
  }
}
