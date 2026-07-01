// src/lib/tikz-server.ts
// Server-side TikZ batch compiler: dedup by content hash, concurrency control, timing
// Khác với tikz-api.ts (dùng cho client/browser), file này chạy trên Node.js server

import * as crypto from 'crypto'

// ─────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────

export interface TikzImageData {
  /** Raw SVG string */
  svg: string
}

export interface TikzCompileResult {
  /** Map từ tikzCode → SVG string */
  imageMap: Map<string, TikzImageData>
  stats: {
    total: number     // Tổng số TikZ code được yêu cầu (có thể trùng)
    unique: number    // Số unique code thực sự compile
    durationMs: number
  }
}

// ─────────────────────────────────────────────────────────────────
// UTILS
// ─────────────────────────────────────────────────────────────────

function hashTikz(code: string): string {
  return crypto.createHash('sha256').update(code.trim()).digest('hex').slice(0, 16)
}

function getVpsUrl(): string {
  return process.env.NEXT_PUBLIC_TIKZ_API_URL || process.env.TIKZ_API_URL || ''
}

// ─────────────────────────────────────────────────────────────────
// COMPILE SINGLE TIKZ → SVG
// ─────────────────────────────────────────────────────────────────

async function compileSingleTikz(tikzCode: string): Promise<string> {
  const apiUrl = getVpsUrl()
  if (!apiUrl) throw new Error('TIKZ_API_URL không được cấu hình')

  const response = await fetch(`${apiUrl}/compile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tikzCode }),
  })

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}))
    throw new Error(errData.details || errData.error || `VPS lỗi ${response.status}`)
  }

  return await response.text()
}

// ─────────────────────────────────────────────────────────────────
// BATCH COMPILE WITH DEDUP + CONCURRENCY
// ─────────────────────────────────────────────────────────────────

/**
 * Batch compile nhiều TikZ codes thành SVG.
 * - Tự động dedup: mỗi unique code chỉ compile 1 lần (so sánh theo nội dung, trim)
 * - Concurrency control: tối đa `concurrency` request song song (default = 3)
 * - Trả về Map<tikzCode, { svg }> — key là code gốc (trước trim)
 *
 * @param tikzCodes - Danh sách TikZ codes (có thể trùng)
 * @param concurrency - Số request song song tối đa
 */
export async function batchCompileTikz(
  tikzCodes: string[],
  concurrency = 3
): Promise<TikzCompileResult> {
  const startTime = Date.now()

  // 1. Dedup: gom các code trùng nhau (trim để nhận diện)
  //    hashMap: hash → tikzCode (normalized) — giữ 1 bản đại diện
  //    codeToHash: tikzCode nguyên bản → hash (để tra ngược)
  const hashToCode = new Map<string, string>()      // hash → code đại diện
  const codeToHash = new Map<string, string>()       // code nguyên bản → hash

  for (const code of tikzCodes) {
    const hash = hashTikz(code)
    codeToHash.set(code, hash)
    if (!hashToCode.has(hash)) {
      hashToCode.set(hash, code.trim())
    }
  }

  const uniqueCodes = Array.from(hashToCode.entries()) // [hash, code][]
  const compiledMap = new Map<string, string>()         // hash → svg

  // 2. Compile theo batch (concurrency)
  for (let i = 0; i < uniqueCodes.length; i += concurrency) {
    const batch = uniqueCodes.slice(i, i + concurrency)
    await Promise.all(
      batch.map(async ([hash, code]) => {
        try {
          const svg = await compileSingleTikz(code)
          compiledMap.set(hash, svg)
        } catch (err) {
          console.warn(`[tikz-server] Compile failed for hash=${hash}:`, err)
          // Lỗi compile → không có entry trong compiledMap (caller tự xử lý)
        }
      })
    )
  }

  // 3. Build kết quả: Map<originalCode, { svg }>
  const imageMap = new Map<string, TikzImageData>()
  for (const code of tikzCodes) {
    const hash = codeToHash.get(code)
    if (hash && compiledMap.has(hash)) {
      imageMap.set(code, { svg: compiledMap.get(hash)! })
    }
  }

  const durationMs = Date.now() - startTime
  console.log(
    `[tikz-server] Compiled ${compiledMap.size}/${uniqueCodes.length} unique TikZ in ${durationMs}ms` +
    ` (${tikzCodes.length} total requested, ${tikzCodes.length - uniqueCodes.length} deduped)`
  )

  return {
    imageMap,
    stats: {
      total: tikzCodes.length,
      unique: uniqueCodes.length,
      durationMs,
    },
  }
}
