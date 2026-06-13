// src/lib/omr/image-preprocessor.ts
// Xử lý ảnh phiếu trả lời trắc nghiệm bằng OpenCV.js
// Pipeline: findContours → approxPolyDP → warpPerspective → đọc bubble
// (Giống cách Azota / TNMaker hoạt động)

import { loadOpenCV } from './opencv-loader'

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
      // Giới hạn max 2000px để tránh lag
      const MAX = 2000
      let w = img.width
      let h = img.height
      if (w > MAX || h > MAX) {
        const s = MAX / Math.max(w, h)
        w = Math.round(w * s)
        h = Math.round(h * s)
      }
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!
      ctx.drawImage(img, 0, 0, w, h)
      const imageData = ctx.getImageData(0, 0, w, h)
      URL.revokeObjectURL(img.src)
      resolve({ imageData, canvas, ctx, width: w, height: h })
    }
    img.onerror = () => reject(new Error('Không load được ảnh'))
    img.src = URL.createObjectURL(file)
  })
}

// ═══════════════════════════════════
// PERSPECTIVE TRANSFORM DÙNG OPENCV.JS
// Đây là bước quan trọng nhất — giống Azota
// ═══════════════════════════════════

export interface SheetCorners {
  tl: { x: number; y: number }
  tr: { x: number; y: number }
  bl: { x: number; y: number }
  br: { x: number; y: number }
}

/**
 * Tìm 4 góc phiếu và duỗi phẳng (warpPerspective)
 * Trả về ảnh đã được "flatten" — phiếu luôn là hình chữ nhật thẳng đứng
 * Kích thước đầu ra cố định: 744 × 1052 px (tương tự A4 at 100dpi)
 *
 * Thuật toán:
 * 1. Grayscale + Gaussian blur
 * 2. Adaptive threshold hoặc Canny edge detection
 * 3. findContours → lấy contour lớn nhất (= viền phiếu)
 * 4. approxPolyDP → lấy 4 đỉnh (corner)
 * 5. Sắp xếp TL/TR/BL/BR
 * 6. getPerspectiveTransform + warpPerspective
 */
export async function detectAndWarp(
  imageData: ImageData,
  originalWidth: number,
  originalHeight: number
): Promise<{
  warpedCanvas: HTMLCanvasElement
  corners: SheetCorners
  success: boolean
}> {
  const cv = await loadOpenCV()

  // Kích thước đầu ra (A4 portrait at 100dpi ~= 827x1169, dùng 744x1052)
  const OUT_W = 744
  const OUT_H = 1052

  // Tạo Mat từ ImageData
  const src = cv.matFromImageData(imageData)

  let gray = new cv.Mat()
  let blurred = new cv.Mat()
  let thresh = new cv.Mat()
  let contours = new cv.MatVector()
  let hierarchy = new cv.Mat()

  try {
    // 1. Grayscale
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)

    // 2. Gaussian blur để giảm nhiễu
    const ksize = new cv.Size(5, 5)
    cv.GaussianBlur(gray, blurred, ksize, 0)

    // 3. Adaptive threshold
    cv.adaptiveThreshold(
      blurred, thresh,
      255,
      cv.ADAPTIVE_THRESH_GAUSSIAN_C,
      cv.THRESH_BINARY_INV,
      21, // blockSize
      10  // C
    )

    // 4. Morphological closing để lấp các lỗ nhỏ
    const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3))
    cv.morphologyEx(thresh, thresh, cv.MORPH_CLOSE, kernel)
    kernel.delete()

    // 5. findContours
    cv.findContours(thresh, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE)

    // 6. Tìm contour lớn nhất (= viền tờ phiếu)
    let maxArea = 0
    let bestContourIdx = -1
    for (let i = 0; i < contours.size(); i++) {
      const area = cv.contourArea(contours.get(i))
      if (area > maxArea) {
        maxArea = area
        bestContourIdx = i
      }
    }

    // Kiểm tra area hợp lý: phải > 10% diện tích ảnh
    const minArea = originalWidth * originalHeight * 0.1
    if (bestContourIdx < 0 || maxArea < minArea) {
      // Fallback: không tìm được viền phiếu
      const warpedCanvas = imageToCanvas(imageData, OUT_W, OUT_H)
      return {
        warpedCanvas,
        corners: fallbackCorners(originalWidth, originalHeight),
        success: false,
      }
    }

    // 7. approxPolyDP để xấp xỉ polygon
    const contour = contours.get(bestContourIdx)
    const perimeter = cv.arcLength(contour, true)
    const approx = new cv.Mat()
    cv.approxPolyDP(contour, approx, 0.02 * perimeter, true)

    // Phải có 4 điểm (hình tứ giác)
    if (approx.rows !== 4) {
      approx.delete()
      const warpedCanvas = imageToCanvas(imageData, OUT_W, OUT_H)
      return {
        warpedCanvas,
        corners: fallbackCorners(originalWidth, originalHeight),
        success: false,
      }
    }

    // 8. Lấy 4 điểm và sắp xếp TL/TR/BL/BR
    const points: { x: number; y: number }[] = []
    for (let i = 0; i < 4; i++) {
      points.push({ x: approx.data32S[i * 2], y: approx.data32S[i * 2 + 1] })
    }
    approx.delete()

    const corners = sortCorners(points)

    // 9. getPerspectiveTransform + warpPerspective
    const srcPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
      corners.tl.x, corners.tl.y,
      corners.tr.x, corners.tr.y,
      corners.br.x, corners.br.y,
      corners.bl.x, corners.bl.y,
    ])
    const dstPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
      0, 0,
      OUT_W, 0,
      OUT_W, OUT_H,
      0, OUT_H,
    ])

    const M = cv.getPerspectiveTransform(srcPts, dstPts)
    const warped = new cv.Mat()
    const dsize = new cv.Size(OUT_W, OUT_H)
    cv.warpPerspective(src, warped, M, dsize, cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar())

    srcPts.delete()
    dstPts.delete()
    M.delete()

    // 10. Chuyển warped Mat → Canvas
    const warpedCanvas = document.createElement('canvas')
    warpedCanvas.width = OUT_W
    warpedCanvas.height = OUT_H
    const warpedCtx = warpedCanvas.getContext('2d')!
    const warpedImageData = new ImageData(
      new Uint8ClampedArray(warped.data),
      OUT_W,
      OUT_H
    )

    // Nếu warped là RGBA thì OK, nếu BGR thì cần convert
    // warpPerspective từ RGBA src → RGBA output
    warpedCtx.putImageData(warpedImageData, 0, 0)
    warped.delete()

    return { warpedCanvas, corners, success: true }

  } finally {
    src.delete()
    gray.delete()
    blurred.delete()
    thresh.delete()
    contours.delete()
    hierarchy.delete()
  }
}

// ═══════════════════════════════════
// GRAYSCALE + THRESHOLD TRÊN WARPED IMAGE
// ═══════════════════════════════════

/**
 * Đọc dữ liệu binary từ warped canvas (ảnh đã duỗi phẳng)
 */
export function getBinaryFromCanvas(
  canvas: HTMLCanvasElement,
  blockSize: number = 25,
  C: number = 8
): { binary: Uint8Array; gray: Uint8Array; width: number; height: number } {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  const { width, height } = canvas
  const imageData = ctx.getImageData(0, 0, width, height)
  const { data } = imageData

  const gray = new Uint8Array(width * height)
  for (let i = 0; i < width * height; i++) {
    gray[i] = Math.round(0.299 * data[i*4] + 0.587 * data[i*4+1] + 0.114 * data[i*4+2])
  }

  // Integral image cho adaptive threshold nhanh
  const integral = new Float64Array((width + 1) * (height + 1))
  for (let y = 0; y < height; y++) {
    let rowSum = 0
    for (let x = 0; x < width; x++) {
      rowSum += gray[y * width + x]
      integral[(y + 1) * (width + 1) + (x + 1)] =
        integral[y * (width + 1) + (x + 1)] + rowSum
    }
  }

  const binary = new Uint8Array(width * height)
  const half = Math.floor(blockSize / 2)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const x1 = Math.max(0, x - half)
      const y1 = Math.max(0, y - half)
      const x2 = Math.min(width - 1, x + half)
      const y2 = Math.min(height - 1, y + half)
      const count = (x2 - x1 + 1) * (y2 - y1 + 1)
      const sum =
        integral[(y2+1)*(width+1)+(x2+1)] -
        integral[y1*(width+1)+(x2+1)] -
        integral[(y2+1)*(width+1)+x1] +
        integral[y1*(width+1)+x1]
      const mean = sum / count
      binary[y * width + x] = gray[y * width + x] < mean - C ? 0 : 255
    }
  }

  return { binary, gray, width, height }
}

// ═══════════════════════════════════
// ĐẾM PIXEL ĐEN TRONG VÙNG TRÒN
// ═══════════════════════════════════

export function countBlackRatio(
  binary: Uint8Array,
  width: number,
  height: number,
  cx: number,
  cy: number,
  radius: number
): number {
  let total = 0
  let black = 0
  const r2 = radius * radius
  const sy = Math.max(0, Math.floor(cy - radius))
  const ey = Math.min(height - 1, Math.ceil(cy + radius))
  const sx = Math.max(0, Math.floor(cx - radius))
  const ex = Math.min(width - 1, Math.ceil(cx + radius))

  for (let y = sy; y <= ey; y++) {
    for (let x = sx; x <= ex; x++) {
      if ((x-cx)**2 + (y-cy)**2 <= r2) {
        total++
        if (binary[y * width + x] === 0) black++
      }
    }
  }
  return total > 0 ? black / total : 0
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
    // Vẽ viền phiếu (từ corners trên ảnh GỐC)
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

    // Điểm góc với label
    const pts = [
      { ...corners.tl, label: 'TL' },
      { ...corners.tr, label: 'TR' },
      { ...corners.bl, label: 'BL' },
      { ...corners.br, label: 'BR' },
    ]
    for (const p of pts) {
      ctx.beginPath()
      ctx.arc(p.x, p.y, 10, 0, Math.PI * 2)
      ctx.fillStyle = '#22c55e'
      ctx.fill()
      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 9px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(p.label, p.x, p.y)
    }
  }

  // Bubbles (trên ảnh warped — không cần vẽ lên ảnh gốc)
  for (const b of bubbles) {
    ctx.beginPath()
    ctx.arc(b.cx, b.cy, b.radius, 0, Math.PI * 2)
    ctx.lineWidth = 2
    if (b.isFilled) {
      ctx.strokeStyle = '#10b981'
      ctx.fillStyle = 'rgba(16,185,129,0.3)'
      ctx.fill()
    } else {
      ctx.strokeStyle = 'rgba(148,163,184,0.3)'
    }
    ctx.stroke()
  }
}

// ═══════════════════════════════════
// HELPERS
// ═══════════════════════════════════

/** Sắp xếp 4 điểm thành TL, TR, BL, BR */
function sortCorners(pts: { x: number; y: number }[]): SheetCorners {
  // Sort theo y
  const sorted = [...pts].sort((a, b) => a.y - b.y)
  const topTwo = sorted.slice(0, 2).sort((a, b) => a.x - b.x)
  const botTwo = sorted.slice(2, 4).sort((a, b) => a.x - b.x)
  return {
    tl: topTwo[0],
    tr: topTwo[1],
    bl: botTwo[0],
    br: botTwo[1],
  }
}

/** Fallback corners = toàn bộ ảnh */
function fallbackCorners(w: number, h: number): SheetCorners {
  const m = Math.min(w, h) * 0.02
  return {
    tl: { x: m, y: m },
    tr: { x: w - m, y: m },
    bl: { x: m, y: h - m },
    br: { x: w - m, y: h - m },
  }
}

/** Chuyển ImageData thành canvas với kích thước mới */
function imageToCanvas(imageData: ImageData, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!
  const tmp = document.createElement('canvas')
  tmp.width = imageData.width
  tmp.height = imageData.height
  tmp.getContext('2d')!.putImageData(imageData, 0, 0)
  ctx.drawImage(tmp, 0, 0, w, h)
  return c
}

// ═══════════════════════════════════
// LEGACY (cho backward compat)
// ═══════════════════════════════════

/** @deprecated Dùng getBinaryFromCanvas thay thế */
export function toGrayscale(imageData: ImageData): Uint8Array {
  const { data, width, height } = imageData
  const gray = new Uint8Array(width * height)
  for (let i = 0; i < width * height; i++) {
    gray[i] = Math.round(0.299*data[i*4] + 0.587*data[i*4+1] + 0.114*data[i*4+2])
  }
  return gray
}

/** @deprecated */
export function adaptiveThreshold(
  gray: Uint8Array, width: number, height: number,
  blockSize = 31, C = 10
): Uint8Array {
  const integral = new Float64Array((width+1)*(height+1))
  for (let y = 0; y < height; y++) {
    let rowSum = 0
    for (let x = 0; x < width; x++) {
      rowSum += gray[y*width+x]
      integral[(y+1)*(width+1)+(x+1)] = integral[y*(width+1)+(x+1)] + rowSum
    }
  }
  const result = new Uint8Array(width*height)
  const half = Math.floor(blockSize/2)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const x1=Math.max(0,x-half),y1=Math.max(0,y-half)
      const x2=Math.min(width-1,x+half),y2=Math.min(height-1,y+half)
      const count=(x2-x1+1)*(y2-y1+1)
      const sum = integral[(y2+1)*(width+1)+(x2+1)] - integral[y1*(width+1)+(x2+1)]
                - integral[(y2+1)*(width+1)+x1] + integral[y1*(width+1)+x1]
      result[y*width+x] = gray[y*width+x] < sum/count - C ? 0 : 255
    }
  }
  return result
}

/** @deprecated */
export function findCornerMarkers(): null {
  return null
}

/** @deprecated */
export function perspectiveMap(
  corners: { x: number; y: number }[],
  relX: number,
  relY: number
): { x: number; y: number } {
  const [tl, tr, bl, br] = corners
  const topX = tl.x + (tr.x - tl.x) * relX
  const topY = tl.y + (tr.y - tl.y) * relX
  const botX = bl.x + (br.x - bl.x) * relX
  const botY = bl.y + (br.y - bl.y) * relX
  return { x: Math.round(topX + (botX - topX) * relY), y: Math.round(topY + (botY - topY) * relY) }
}
