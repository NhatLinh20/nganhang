// src/lib/omr/image-preprocessor.ts
// Tiền xử lý ảnh phiếu trả lời trắc nghiệm bằng Canvas API thuần
// V2: Cải thiện corner detection và perspective mapping

/**
 * Load ảnh từ File thành ImageData trên canvas
 */
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
      // Giới hạn kích thước tối đa để tránh lag nhưng đủ chi tiết
      const MAX_DIM = 2000
      let w = img.width
      let h = img.height
      if (w > MAX_DIM || h > MAX_DIM) {
        const scale = MAX_DIM / Math.max(w, h)
        w = Math.round(w * scale)
        h = Math.round(h * scale)
      }

      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) return reject(new Error('Cannot get 2D context'))

      ctx.drawImage(img, 0, 0, w, h)
      const imageData = ctx.getImageData(0, 0, w, h)
      resolve({ imageData, canvas, ctx, width: w, height: h })
    }
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = URL.createObjectURL(file)
  })
}

/**
 * Chuyển ImageData sang grayscale
 */
export function toGrayscale(imageData: ImageData): Uint8Array {
  const { data, width, height } = imageData
  const gray = new Uint8Array(width * height)
  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4]
    const g = data[i * 4 + 1]
    const b = data[i * 4 + 2]
    gray[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b)
  }
  return gray
}

/**
 * Adaptive threshold (Mean method)
 * @returns Uint8Array: 0 = đen (tô), 255 = trắng (không tô)
 */
export function adaptiveThreshold(
  gray: Uint8Array,
  width: number,
  height: number,
  blockSize: number = 31,
  C: number = 10
): Uint8Array {
  const result = new Uint8Array(width * height)

  // Integral image cho tính mean nhanh
  const integral = new Float64Array((width + 1) * (height + 1))
  for (let y = 0; y < height; y++) {
    let rowSum = 0
    for (let x = 0; x < width; x++) {
      rowSum += gray[y * width + x]
      integral[(y + 1) * (width + 1) + (x + 1)] =
        integral[y * (width + 1) + (x + 1)] + rowSum
    }
  }

  const half = Math.floor(blockSize / 2)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const x1 = Math.max(0, x - half)
      const y1 = Math.max(0, y - half)
      const x2 = Math.min(width - 1, x + half)
      const y2 = Math.min(height - 1, y + half)
      const count = (x2 - x1 + 1) * (y2 - y1 + 1)

      const sum =
        integral[(y2 + 1) * (width + 1) + (x2 + 1)] -
        integral[y1 * (width + 1) + (x2 + 1)] -
        integral[(y2 + 1) * (width + 1) + x1] +
        integral[y1 * (width + 1) + x1]

      const mean = sum / count
      const idx = y * width + x
      result[idx] = gray[idx] < mean - C ? 0 : 255
    }
  }

  return result
}

/**
 * Đếm tỷ lệ pixel đen trong vùng tròn
 */
export function countBlackRatio(
  binary: Uint8Array,
  width: number,
  height: number,
  cx: number,
  cy: number,
  radius: number
): number {
  let totalPixels = 0
  let blackPixels = 0
  const r2 = radius * radius

  const startY = Math.max(0, Math.floor(cy - radius))
  const endY = Math.min(height - 1, Math.ceil(cy + radius))
  const startX = Math.max(0, Math.floor(cx - radius))
  const endX = Math.min(width - 1, Math.ceil(cx + radius))

  for (let y = startY; y <= endY; y++) {
    for (let x = startX; x <= endX; x++) {
      const dx = x - cx
      const dy = y - cy
      if (dx * dx + dy * dy <= r2) {
        totalPixels++
        if (binary[y * width + x] === 0) blackPixels++
      }
    }
  }
  return totalPixels > 0 ? blackPixels / totalPixels : 0
}

/**
 * Đếm tỷ lệ pixel đen trong vùng vuông
 */
function countBlackRatioRect(
  binary: Uint8Array,
  width: number,
  height: number,
  cx: number,
  cy: number,
  halfSize: number
): number {
  let total = 0
  let black = 0
  const startY = Math.max(0, Math.floor(cy - halfSize))
  const endY = Math.min(height - 1, Math.ceil(cy + halfSize))
  const startX = Math.max(0, Math.floor(cx - halfSize))
  const endX = Math.min(width - 1, Math.ceil(cx + halfSize))

  for (let y = startY; y <= endY; y++) {
    for (let x = startX; x <= endX; x++) {
      total++
      if (binary[y * width + x] === 0) black++
    }
  }
  return total > 0 ? black / total : 0
}

// ═══════════════════════════════════
// CORNER MARKER DETECTION V2
// ═══════════════════════════════════

interface MarkerCandidate {
  x: number
  y: number
  score: number
  size: number
}

/**
 * Tìm 4 marker góc (TL, TR, BL, BR) trên phiếu trả lời
 *
 * Chiến lược:
 * 1. Quét toàn bộ ảnh tìm các vùng vuông đen đặc (marker candidates)
 * 2. Lọc theo kích thước phù hợp
 * 3. Chọn 4 candidates ở 4 góc cực trị (min/max x/y)
 *
 * @returns 4 điểm [TL, TR, BL, BR] hoặc null
 */
export function findCornerMarkers(
  binary: Uint8Array,
  width: number,
  height: number
): { x: number; y: number }[] | null {
  // Kích thước marker dự kiến: ~1.5% đến 4% chiều rộng ảnh
  // TikZ marker = 0.54cm, A4 width = 21cm → ~2.6% → trên ảnh 2000px ~= 50px
  const minMarkerSize = Math.floor(width * 0.012)
  const maxMarkerSize = Math.floor(width * 0.05)

  const candidates: MarkerCandidate[] = []

  // Quét toàn bộ ảnh với lưới thưa trước
  const coarseStep = Math.max(4, Math.floor(minMarkerSize / 2))

  for (let cy = maxMarkerSize; cy < height - maxMarkerSize; cy += coarseStep) {
    for (let cx = maxMarkerSize; cx < width - maxMarkerSize; cx += coarseStep) {
      // Kiểm tra nhanh: vùng nhỏ tại tâm có đen không?
      const quickRatio = countBlackRatioRect(binary, width, height, cx, cy, Math.floor(minMarkerSize / 2))
      if (quickRatio < 0.65) continue

      // Tìm kích thước tốt nhất
      let bestSize = minMarkerSize
      let bestScore = 0

      for (let size = minMarkerSize; size <= maxMarkerSize; size += 2) {
        const half = Math.floor(size / 2)
        const ratio = countBlackRatioRect(binary, width, height, cx, cy, half)

        // Marker phải đen > 75%
        if (ratio < 0.7) continue

        // Kiểm tra xung quanh marker phải trắng (để phân biệt với text)
        const outerHalf = half + Math.floor(half * 0.5)
        const outerRatio = countBlackRatioRect(binary, width, height, cx, cy, outerHalf)
        const borderWhiteness = 1 - (outerRatio * outerHalf * outerHalf * 4 - ratio * half * half * 4) /
          (outerHalf * outerHalf * 4 - half * half * 4)

        // Score cao = đen bên trong, trắng xung quanh, kích thước lớn
        const score = ratio * 0.5 + borderWhiteness * 0.3 + (size / maxMarkerSize) * 0.2
        if (score > bestScore) {
          bestScore = score
          bestSize = size
        }
      }

      if (bestScore > 0.6) {
        candidates.push({ x: cx, y: cy, score: bestScore, size: bestSize })
      }
    }
  }

  if (candidates.length < 4) return null

  // Merge candidates gần nhau (non-maximum suppression)
  const merged = nonMaxSuppression(candidates, minMarkerSize * 2)

  if (merged.length < 4) return null

  // Tìm 4 góc cực trị
  // TL: nhỏ nhất x+y, TR: lớn nhất x - nhỏ nhất y
  // BL: nhỏ nhất x + lớn nhất y, BR: lớn nhất x+y
  const tl = findExtreme(merged, (a, b) => (a.x + a.y) < (b.x + b.y))
  const br = findExtreme(merged, (a, b) => (a.x + a.y) > (b.x + b.y))
  const tr = findExtreme(merged, (a, b) => (a.x - a.y) > (b.x - b.y))
  const bl = findExtreme(merged, (a, b) => (a.y - a.x) > (b.y - b.x))

  // Validate: 4 góc phải tạo thành hình tứ giác hợp lý
  if (!validateQuad(tl, tr, bl, br, width, height)) return null

  return [
    { x: tl.x, y: tl.y },
    { x: tr.x, y: tr.y },
    { x: bl.x, y: bl.y },
    { x: br.x, y: br.y },
  ]
}

/** Chọn phần tử cực trị theo comparator */
function findExtreme(
  candidates: MarkerCandidate[],
  isBetter: (a: MarkerCandidate, b: MarkerCandidate) => boolean
): MarkerCandidate {
  let best = candidates[0]
  for (let i = 1; i < candidates.length; i++) {
    if (isBetter(candidates[i], best)) best = candidates[i]
  }
  return best
}

/** Non-maximum suppression: merge candidates gần nhau */
function nonMaxSuppression(candidates: MarkerCandidate[], minDist: number): MarkerCandidate[] {
  // Sort theo score giảm dần
  const sorted = [...candidates].sort((a, b) => b.score - a.score)
  const kept: MarkerCandidate[] = []
  const suppressed = new Set<number>()

  for (let i = 0; i < sorted.length; i++) {
    if (suppressed.has(i)) continue
    kept.push(sorted[i])

    // Suppress các candidates gần hơn minDist
    for (let j = i + 1; j < sorted.length; j++) {
      const dx = sorted[i].x - sorted[j].x
      const dy = sorted[i].y - sorted[j].y
      if (Math.sqrt(dx * dx + dy * dy) < minDist) {
        suppressed.add(j)
      }
    }
  }

  return kept
}

/** Validate 4 góc tạo thành tứ giác hợp lý */
function validateQuad(
  tl: MarkerCandidate,
  tr: MarkerCandidate,
  bl: MarkerCandidate,
  br: MarkerCandidate,
  imgW: number,
  imgH: number
): boolean {
  // TL phải nằm trên-trái hơn BR
  if (tl.x >= br.x || tl.y >= br.y) return false
  // TR phải nằm phải hơn TL
  if (tr.x <= tl.x) return false
  // BL phải nằm dưới hơn TL
  if (bl.y <= tl.y) return false

  // Chiều rộng tối thiểu 20% ảnh
  const quadW = Math.max(tr.x - tl.x, br.x - bl.x)
  if (quadW < imgW * 0.2) return false

  // Chiều cao tối thiểu 20% ảnh
  const quadH = Math.max(bl.y - tl.y, br.y - tr.y)
  if (quadH < imgH * 0.2) return false

  // Tỷ lệ w/h hợp lý cho phiếu A4 (18.38/27.14 ≈ 0.677)
  // Cho phép sai lệch lớn do ảnh nghiêng
  const ratio = quadW / quadH
  if (ratio < 0.3 || ratio > 1.5) return false

  return true
}

// ═══════════════════════════════════
// PERSPECTIVE MAPPING
// ═══════════════════════════════════

/**
 * Map tọa độ tương đối (0-1, so với marker rectangle) sang pixel trên ảnh
 * Sử dụng bilinear interpolation từ 4 marker góc đã phát hiện
 *
 * @param corners 4 góc [TL, TR, BL, BR] trong pixel
 * @param relX Tọa độ X tương đối (0 = marker trái, 1 = marker phải)
 * @param relY Tọa độ Y tương đối (0 = marker trên, 1 = marker dưới)
 */
export function perspectiveMap(
  corners: { x: number; y: number }[],
  relX: number,
  relY: number
): { x: number; y: number } {
  const [tl, tr, bl, br] = corners

  // Bilinear interpolation
  const topX = tl.x + (tr.x - tl.x) * relX
  const topY = tl.y + (tr.y - tl.y) * relX
  const botX = bl.x + (br.x - bl.x) * relX
  const botY = bl.y + (br.y - bl.y) * relX

  return {
    x: Math.round(topX + (botX - topX) * relY),
    y: Math.round(topY + (botY - topY) * relY),
  }
}

// ═══════════════════════════════════
// DEBUG OVERLAY
// ═══════════════════════════════════

/**
 * Vẽ debug overlay lên canvas: đánh dấu markers và bubbles
 */
export function drawDebugOverlay(
  ctx: CanvasRenderingContext2D,
  corners: { x: number; y: number }[] | null,
  bubbles: { cx: number; cy: number; radius: number; isFilled: boolean; label: string }[]
) {
  // Vẽ corners nếu có
  if (corners) {
    ctx.strokeStyle = '#f59e0b'
    ctx.lineWidth = 3

    // Vẽ quadrilateral
    ctx.beginPath()
    ctx.moveTo(corners[0].x, corners[0].y)
    ctx.lineTo(corners[1].x, corners[1].y)
    ctx.lineTo(corners[3].x, corners[3].y)
    ctx.lineTo(corners[2].x, corners[2].y)
    ctx.closePath()
    ctx.stroke()

    // Vẽ marker points
    for (const c of corners) {
      ctx.beginPath()
      ctx.arc(c.x, c.y, 8, 0, Math.PI * 2)
      ctx.fillStyle = '#f59e0b'
      ctx.fill()
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 2
      ctx.stroke()
    }
  }

  // Vẽ bubbles
  for (const b of bubbles) {
    ctx.beginPath()
    ctx.arc(b.cx, b.cy, b.radius, 0, Math.PI * 2)
    ctx.lineWidth = 2
    if (b.isFilled) {
      ctx.strokeStyle = '#10b981'
      ctx.fillStyle = 'rgba(16, 185, 129, 0.25)'
      ctx.fill()
    } else {
      ctx.strokeStyle = 'rgba(100, 116, 139, 0.3)'
    }
    ctx.stroke()
  }
}
