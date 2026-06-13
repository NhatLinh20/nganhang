// src/lib/omr/image-preprocessor.ts
// Tiền xử lý ảnh phiếu trả lời trắc nghiệm — Canvas API thuần
// V3: Corner detection sử dụng aspect ratio matching

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
 */
export function adaptiveThreshold(
  gray: Uint8Array,
  width: number,
  height: number,
  blockSize: number = 31,
  C: number = 10
): Uint8Array {
  const result = new Uint8Array(width * height)

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
      result[y * width + x] = gray[y * width + x] < mean - C ? 0 : 255
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

// ═══════════════════════════════════
// CORNER MARKER DETECTION V3
// Thuật toán: Tìm tất cả ô vuông đen → brute-force tìm
// 4 điểm tạo thành hình chữ nhật có tỷ lệ đúng (0.677)
// ═══════════════════════════════════

interface MarkerCandidate {
  x: number
  y: number
  score: number
  size: number
}

/**
 * Đếm tỷ lệ pixel đen trong vùng vuông
 */
function blackRatioRect(
  binary: Uint8Array,
  width: number,
  height: number,
  cx: number,
  cy: number,
  halfSize: number
): number {
  let total = 0
  let black = 0
  const sy = Math.max(0, Math.floor(cy - halfSize))
  const ey = Math.min(height - 1, Math.ceil(cy + halfSize))
  const sx = Math.max(0, Math.floor(cx - halfSize))
  const ex = Math.min(width - 1, Math.ceil(cx + halfSize))

  for (let y = sy; y <= ey; y++) {
    for (let x = sx; x <= ex; x++) {
      total++
      if (binary[y * width + x] === 0) black++
    }
  }
  return total > 0 ? black / total : 0
}

/**
 * Quét toàn bộ ảnh tìm các vùng vuông đen đặc (marker candidates)
 */
function scanForCandidates(
  binary: Uint8Array,
  width: number,
  height: number,
  minSize: number,
  maxSize: number
): MarkerCandidate[] {
  const candidates: MarkerCandidate[] = []
  const step = Math.max(3, Math.floor(minSize / 3))

  for (let cy = maxSize; cy < height - maxSize; cy += step) {
    for (let cx = maxSize; cx < width - maxSize; cx += step) {
      // Quick check: vùng nhỏ ở tâm phải đen
      const quickHalf = Math.floor(minSize / 2)
      const quickRatio = blackRatioRect(binary, width, height, cx, cy, quickHalf)
      if (quickRatio < 0.6) continue

      // Tìm kích thước marker tốt nhất
      let bestSize = minSize
      let bestInnerRatio = 0
      let bestOuterContrast = 0

      for (let size = minSize; size <= maxSize; size += 2) {
        const half = Math.floor(size / 2)
        const innerRatio = blackRatioRect(binary, width, height, cx, cy, half)

        if (innerRatio < 0.65) continue

        // Kiểm tra viền ngoài: phải SÁNG hơn bên trong
        // Lấy ring bên ngoài marker
        const outerHalf = half + Math.max(4, Math.floor(half * 0.6))
        const outerArea = (outerHalf * 2 + 1) ** 2
        const innerArea = (half * 2 + 1) ** 2
        const outerTotal = blackRatioRect(binary, width, height, cx, cy, outerHalf) * outerArea
        const innerTotal = innerRatio * innerArea
        const ringArea = outerArea - innerArea
        const ringBlackRatio = ringArea > 0 ? (outerTotal - innerTotal) / ringArea : 1

        // Vòng ngoài phải trắng hơn nhiều so với bên trong
        const contrast = innerRatio - ringBlackRatio
        if (contrast < 0.25) continue // Phải có contrast rõ ràng

        if (contrast > bestOuterContrast) {
          bestOuterContrast = contrast
          bestInnerRatio = innerRatio
          bestSize = size
        }
      }

      if (bestOuterContrast >= 0.25 && bestInnerRatio >= 0.65) {
        candidates.push({
          x: cx,
          y: cy,
          score: bestInnerRatio * 0.4 + bestOuterContrast * 0.6,
          size: bestSize,
        })
      }
    }
  }

  return candidates
}

/** Non-maximum suppression */
function nonMaxSuppression(candidates: MarkerCandidate[], minDist: number): MarkerCandidate[] {
  const sorted = [...candidates].sort((a, b) => b.score - a.score)
  const kept: MarkerCandidate[] = []
  const suppressed = new Set<number>()

  for (let i = 0; i < sorted.length; i++) {
    if (suppressed.has(i)) continue
    kept.push(sorted[i])
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

/** Khoảng cách Euclid giữa 2 điểm */
function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)
}

/**
 * TÌM 4 MARKER GÓC — V3
 *
 * Chiến lược:
 * 1. Tìm tất cả candidate ô vuông đen (có contrast rõ với xung quanh)
 * 2. Loại bỏ candidate ở sát mép ảnh (shadow artifacts)
 * 3. Brute-force: thử tất cả tổ hợp C(n,4) candidates
 * 4. Chọn 4 điểm tạo hình chữ nhật có aspect ratio gần 0.677 nhất
 *    (tỷ lệ marker rectangle trên phiếu = 18.38cm / 27.14cm)
 */
export function findCornerMarkers(
  binary: Uint8Array,
  width: number,
  height: number
): { x: number; y: number }[] | null {
  const minMarkerSize = Math.max(8, Math.floor(width * 0.012))
  const maxMarkerSize = Math.floor(width * 0.06)

  // 1. Tìm tất cả candidates
  const rawCandidates = scanForCandidates(binary, width, height, minMarkerSize, maxMarkerSize)
  const merged = nonMaxSuppression(rawCandidates, minMarkerSize * 2)

  if (merged.length < 4) return null

  // 2. Loại bỏ candidates ở sát mép ảnh (< 2% kích thước)
  const marginX = Math.floor(width * 0.02)
  const marginY = Math.floor(height * 0.02)
  const filtered = merged.filter(c =>
    c.x > marginX && c.x < width - marginX &&
    c.y > marginY && c.y < height - marginY
  )

  if (filtered.length < 4) return null

  // 3. Lấy top 12 candidates (theo score) để brute-force
  const top = [...filtered].sort((a, b) => b.score - a.score).slice(0, 12)

  // Tỷ lệ mong đợi: marker rectangle = 18.38cm rộng / 27.14cm cao
  const EXPECTED_RATIO = 18.38 / 27.14  // ≈ 0.677

  let bestQuad: MarkerCandidate[] | null = null
  let bestError = Infinity

  // 4. Brute-force tất cả tổ hợp C(n,4)
  const n = top.length
  for (let i = 0; i < n - 3; i++) {
    for (let j = i + 1; j < n - 2; j++) {
      for (let k = j + 1; k < n - 1; k++) {
        for (let l = k + 1; l < n; l++) {
          const quad = assignCorners(top[i], top[j], top[k], top[l])
          if (!quad) continue

          const [tl, tr, bl, br] = quad

          // Tính aspect ratio
          const topW = dist(tl, tr)
          const botW = dist(bl, br)
          const leftH = dist(tl, bl)
          const rightH = dist(tr, br)

          const avgW = (topW + botW) / 2
          const avgH = (leftH + rightH) / 2

          // Kích thước tối thiểu: quad phải đủ lớn (> 25% ảnh)
          if (avgW < width * 0.25 || avgH < height * 0.25) continue

          const ratio = avgW / avgH
          const ratioError = Math.abs(ratio - EXPECTED_RATIO)

          // Kiểm tra song song: cạnh đối phải gần bằng nhau
          const widthSkew = Math.abs(topW - botW) / Math.max(topW, botW)
          const heightSkew = Math.abs(leftH - rightH) / Math.max(leftH, rightH)
          if (widthSkew > 0.3 || heightSkew > 0.3) continue

          // Tổng hợp error: aspect ratio + skew + bonus cho score cao
          const avgScore = (top[i].score + top[j].score + top[k].score + top[l].score) / 4
          const totalError = ratioError * 2 + widthSkew + heightSkew - avgScore * 0.1

          if (totalError < bestError) {
            bestError = totalError
            bestQuad = quad
          }
        }
      }
    }
  }

  // Aspect ratio error > 0.2 = quá sai, reject
  if (!bestQuad || bestError > 0.8) return null

  return bestQuad.map(c => ({ x: c.x, y: c.y }))
}

/**
 * Gán 4 điểm vào TL, TR, BL, BR
 * Sắp xếp theo Y (trên/dưới) rồi theo X (trái/phải)
 */
function assignCorners(
  a: MarkerCandidate,
  b: MarkerCandidate,
  c: MarkerCandidate,
  d: MarkerCandidate
): MarkerCandidate[] | null {
  const points = [a, b, c, d]

  // Sort theo Y
  points.sort((p1, p2) => p1.y - p2.y)

  // 2 điểm trên, 2 điểm dưới
  const topTwo = [points[0], points[1]].sort((p1, p2) => p1.x - p2.x)
  const botTwo = [points[2], points[3]].sort((p1, p2) => p1.x - p2.x)

  const tl = topTwo[0]
  const tr = topTwo[1]
  const bl = botTwo[0]
  const br = botTwo[1]

  // Validate cơ bản
  if (tl.x >= tr.x || bl.x >= br.x) return null
  if (tl.y >= bl.y || tr.y >= br.y) return null

  return [tl, tr, bl, br]
}

// ═══════════════════════════════════
// PERSPECTIVE MAPPING
// ═══════════════════════════════════

/**
 * Map tọa độ tương đối (0-1) sang pixel qua bilinear interpolation
 *
 * @param corners 4 góc [TL, TR, BL, BR] trong pixel
 * @param relX 0 = marker trái, 1 = marker phải
 * @param relY 0 = marker trên, 1 = marker dưới
 */
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

  return {
    x: Math.round(topX + (botX - topX) * relY),
    y: Math.round(topY + (botY - topY) * relY),
  }
}

// ═══════════════════════════════════
// DEBUG OVERLAY
// ═══════════════════════════════════

export function drawDebugOverlay(
  ctx: CanvasRenderingContext2D,
  corners: { x: number; y: number }[] | null,
  bubbles: { cx: number; cy: number; radius: number; isFilled: boolean; label: string }[]
) {
  // Vẽ quadrilateral từ corners
  if (corners) {
    // Đường viền quad
    ctx.strokeStyle = '#f59e0b'
    ctx.lineWidth = 3
    ctx.setLineDash([8, 4])
    ctx.beginPath()
    ctx.moveTo(corners[0].x, corners[0].y)
    ctx.lineTo(corners[1].x, corners[1].y)
    ctx.lineTo(corners[3].x, corners[3].y)
    ctx.lineTo(corners[2].x, corners[2].y)
    ctx.closePath()
    ctx.stroke()
    ctx.setLineDash([])

    // Marker points + labels
    const labels = ['TL', 'TR', 'BL', 'BR']
    for (let i = 0; i < corners.length; i++) {
      const c = corners[i]
      // Circle
      ctx.beginPath()
      ctx.arc(c.x, c.y, 10, 0, Math.PI * 2)
      ctx.fillStyle = '#f59e0b'
      ctx.fill()
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 2
      ctx.stroke()
      // Label
      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 10px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(labels[i], c.x, c.y)
    }
  }

  // Vẽ bubbles
  for (const b of bubbles) {
    ctx.beginPath()
    ctx.arc(b.cx, b.cy, b.radius, 0, Math.PI * 2)
    ctx.lineWidth = 1.5
    if (b.isFilled) {
      ctx.strokeStyle = '#10b981'
      ctx.fillStyle = 'rgba(16, 185, 129, 0.3)'
      ctx.fill()
    } else {
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)'
    }
    ctx.stroke()
  }
}
