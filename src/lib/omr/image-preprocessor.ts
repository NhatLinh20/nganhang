// src/lib/omr/image-preprocessor.ts
// Tiền xử lý ảnh phiếu trả lời trắc nghiệm bằng Canvas API thuần
// Không dùng OpenCV.js — chạy nhẹ trên mọi trình duyệt

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
      // Giới hạn kích thước tối đa để tránh lag
      const MAX_DIM = 2400
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
 * Chuyển ImageData sang grayscale (in-place)
 * Trả về Uint8Array chỉ chứa giá trị gray (1 byte/pixel)
 */
export function toGrayscale(imageData: ImageData): Uint8Array {
  const { data, width, height } = imageData
  const gray = new Uint8Array(width * height)

  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4]
    const g = data[i * 4 + 1]
    const b = data[i * 4 + 2]
    // Luminance formula (perceptual weighting)
    gray[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b)
  }

  return gray
}

/**
 * Adaptive threshold (Phương pháp mean)
 * Mỗi pixel được so sánh với giá trị trung bình của vùng lân cận
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

  // Tính integral image để tính mean nhanh
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

      // Lấy tổng vùng từ integral image
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
 * Đếm tỷ lệ pixel đen trong một vùng tròn
 * @param binary Ảnh binary (0=đen, 255=trắng)
 * @param cx Tâm X (pixel)
 * @param cy Tâm Y (pixel)
 * @param radius Bán kính (pixel)
 * @returns Tỷ lệ pixel đen (0-1)
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
        if (binary[y * width + x] === 0) {
          blackPixels++
        }
      }
    }
  }

  return totalPixels > 0 ? blackPixels / totalPixels : 0
}

/**
 * Tìm 4 góc của phiếu dựa trên 4 tracking marks ở các góc
 * Trả về mảng 4 điểm [topLeft, topRight, bottomLeft, bottomRight]
 * Nếu không tìm được → trả null (sẽ dùng tọa độ mặc định)
 */
export function findCornerMarkers(
  binary: Uint8Array,
  width: number,
  height: number,
  expectedMarkerSize: number
): { x: number; y: number }[] | null {
  // Chia ảnh thành 4 vùng góc, tìm cluster pixel đen lớn nhất mỗi góc
  const halfW = Math.floor(width / 2)
  const halfH = Math.floor(height / 2)

  const corners = [
    { region: { x1: 0, y1: 0, x2: halfW, y2: halfH }, label: 'TL' },                 // Top-left
    { region: { x1: halfW, y1: 0, x2: width, y2: halfH }, label: 'TR' },              // Top-right
    { region: { x1: 0, y1: halfH, x2: halfW, y2: height }, label: 'BL' },             // Bottom-left
    { region: { x1: halfW, y1: halfH, x2: width, y2: height }, label: 'BR' },         // Bottom-right
  ]

  const foundCorners: { x: number; y: number }[] = []

  for (const corner of corners) {
    const { x1, y1, x2, y2 } = corner.region
    let bestX = -1, bestY = -1, bestScore = 0

    // Tìm vùng đen đậm nhất có kích thước ~expectedMarkerSize
    const step = Math.max(2, Math.floor(expectedMarkerSize / 4))
    for (let cy = y1 + expectedMarkerSize; cy < y2 - expectedMarkerSize; cy += step) {
      for (let cx = x1 + expectedMarkerSize; cx < x2 - expectedMarkerSize; cx += step) {
        // Đếm pixel đen trong vùng vuông
        let black = 0
        let total = 0
        const halfSize = Math.floor(expectedMarkerSize / 2)
        for (let dy = -halfSize; dy <= halfSize; dy++) {
          for (let dx = -halfSize; dx <= halfSize; dx++) {
            const px = cx + dx
            const py = cy + dy
            if (px >= 0 && px < width && py >= 0 && py < height) {
              total++
              if (binary[py * width + px] === 0) black++
            }
          }
        }
        const score = total > 0 ? black / total : 0
        if (score > bestScore && score > 0.5) {
          bestScore = score
          bestX = cx
          bestY = cy
        }
      }
    }

    if (bestX < 0) return null  // Không tìm thấy marker ở góc này
    foundCorners.push({ x: bestX, y: bestY })
  }

  return foundCorners
}

/**
 * Áp dụng perspective transform đơn giản
 * Map tọa độ từ hệ tọa độ "đã nắn thẳng" sang tọa độ trên ảnh gốc
 * 
 * Sử dụng bilinear interpolation dựa trên 4 góc đã phát hiện
 */
export function perspectiveMap(
  srcCorners: { x: number; y: number }[],
  relX: number,  // 0-1
  relY: number,  // 0-1
): { x: number; y: number } {
  // srcCorners: [TL, TR, BL, BR]
  const [tl, tr, bl, br] = srcCorners

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

/**
 * Vẽ debug overlay lên canvas: đánh dấu các vùng đã nhận dạng
 */
export function drawDebugOverlay(
  ctx: CanvasRenderingContext2D,
  bubbles: { cx: number; cy: number; radius: number; isFilled: boolean; label: string }[]
) {
  for (const b of bubbles) {
    ctx.beginPath()
    ctx.arc(b.cx, b.cy, b.radius, 0, Math.PI * 2)
    ctx.lineWidth = 2
    if (b.isFilled) {
      ctx.strokeStyle = '#10b981'  // Green for filled
      ctx.fillStyle = 'rgba(16, 185, 129, 0.2)'
      ctx.fill()
    } else {
      ctx.strokeStyle = 'rgba(100, 116, 139, 0.4)' // Gray for empty
    }
    ctx.stroke()
  }
}
