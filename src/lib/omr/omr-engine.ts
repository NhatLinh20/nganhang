// src/lib/omr/omr-engine.ts
// Pipeline điều phối: OpenCV.js warpPerspective → đọc bubble → chấm điểm
// Giống cách Azota / TNMaker hoạt động

import type {
  OMRConfig, OMRResult, ScoreResult, QuestionResult,
  StudentAnswers, AnswerKey, ScoringConfig,
} from './types'
import { buildCoordinateMap } from './coordinate-map'
import {
  loadImageFromFile,
  detectAndWarp,
  getBinaryFromCanvas,
  drawDebugOverlay,
  type SheetCorners,
} from './image-preprocessor'
import { readAllAnswers } from './bubble-reader'

// ═══════════════════════════════════
// MAIN PIPELINE
// ═══════════════════════════════════

/**
 * Quét và chấm điểm một phiếu trả lời trắc nghiệm
 *
 * Pipeline (giống Azota/TNMaker):
 * 1. Load ảnh → Canvas
 * 2. OpenCV.js: GaussianBlur → AdaptiveThreshold → findContours → approxPolyDP
 * 3. warpPerspective: duỗi phẳng phiếu → 744×1052px cố định
 * 4. Adaptive threshold trên ảnh warped
 * 5. Đọc tất cả bubble theo tọa độ tương đối → pixel chính xác
 * 6. So khớp đáp án → Tính điểm
 */
export async function scanAnswerSheet(
  file: File,
  config: OMRConfig
): Promise<OMRResult> {
  const startTime = performance.now()
  const threshold = config.thresholdLevel ?? 0.32

  // Bước 1: Load ảnh
  const { imageData, width, height } = await loadImageFromFile(file)

  // Bước 2-3: Detect phiếu và warpPerspective (OpenCV.js)
  const { warpedCanvas, corners, success } = await detectAndWarp(imageData, width, height)

  const warnings: string[] = []
  if (!success) {
    warnings.push('⚠️ Không tìm được viền phiếu tự động. Kết quả có thể kém chính xác. Hãy chụp lại với góc phẳng hơn và 4 góc phiếu rõ ràng.')
  }

  // Bước 4: Threshold trên ảnh warped
  const { binary, width: wW, height: wH } = getBinaryFromCanvas(warpedCanvas)

  // Bước 5: Build coordinate map và đọc bubble
  const coordMap = buildCoordinateMap(config.mcCount, config.tfCount, config.saCount)
  const readResult = readAllAnswers(coordMap, binary, wW, wH, threshold)
  warnings.push(...readResult.warnings)

  // Bước 6: Chấm điểm
  const score = calculateScore(readResult.answers, config.answerKey, config)
  const confidence = calculateConfidence(warnings, config, success)
  const processingTimeMs = performance.now() - startTime

  return {
    examCode: readResult.examCode,
    studentId: readResult.studentId,
    answers: readResult.answers,
    score,
    confidence,
    warnings,
    processingTimeMs,
  }
}

/**
 * Quét phiếu + trả debug image
 * Debug image = ảnh warped (đã duỗi phẳng) với overlay bubble markers
 */
export async function scanWithDebug(
  file: File,
  config: OMRConfig
): Promise<{ result: OMRResult; debugImageUrl: string }> {
  const startTime = performance.now()
  const threshold = config.thresholdLevel ?? 0.32

  // Load ảnh gốc
  const { imageData, canvas: origCanvas, ctx: origCtx, width, height } = await loadImageFromFile(file)

  // Detect + warp
  const { warpedCanvas, corners, success } = await detectAndWarp(imageData, width, height)

  const warnings: string[] = []
  if (!success) {
    warnings.push('⚠️ Không tìm được viền phiếu tự động. Kết quả có thể kém chính xác.')
  }

  // Threshold + đọc bubble trên warped image
  const { binary, width: wW, height: wH } = getBinaryFromCanvas(warpedCanvas)
  const coordMap = buildCoordinateMap(config.mcCount, config.tfCount, config.saCount)
  const readResult = readAllAnswers(coordMap, binary, wW, wH, threshold)
  warnings.push(...readResult.warnings)

  // Vẽ debug overlay lên warped canvas
  const warpedCtx = warpedCanvas.getContext('2d')!
  drawDebugOverlay(
    warpedCtx,
    null, // Corners đã được áp dụng vào warp rồi, không cần vẽ lại
    readResult.allDebugBubbles.map(b => ({
      cx: b.x, cy: b.y,
      radius: b.radius,
      isFilled: b.isFilled,
      label: b.label,
    }))
  )

  // Vẽ viền phát hiện lên ảnh gốc (green box như Azota)
  if (success) {
    drawDebugOverlay(origCtx, corners, [])
  }

  // Dùng warped image làm debug output (có bubble overlay)
  const debugImageUrl = warpedCanvas.toDataURL('image/jpeg', 0.9)

  const score = calculateScore(readResult.answers, config.answerKey, config)
  const confidence = calculateConfidence(warnings, config, success)
  const processingTimeMs = performance.now() - startTime

  return {
    result: {
      examCode: readResult.examCode,
      studentId: readResult.studentId,
      answers: readResult.answers,
      score,
      confidence,
      warnings,
      processingTimeMs,
    },
    debugImageUrl,
  }
}

// ═══════════════════════════════════
// CHẤM ĐIỂM
// ═══════════════════════════════════

export function calculateScore(
  studentAnswers: StudentAnswers,
  answerKey: AnswerKey,
  config: OMRConfig
): ScoreResult {
  const scoring = config.scoringConfig ?? getDefaultScoring(config)
  const details: QuestionResult[] = []

  // Phần I: MC
  let mcCorrect = 0
  for (let i = 0; i < answerKey.mc.length; i++) {
    const studentAns = studentAnswers.mc[i] ?? null
    const correctAns = answerKey.mc[i]
    const isCorrect = studentAns !== null && studentAns.toUpperCase() === correctAns.toUpperCase()
    if (isCorrect) mcCorrect++
    details.push({
      index: i, type: 'mc',
      studentAnswer: studentAns, correctAnswer: correctAns,
      isCorrect,
      score: isCorrect ? scoring.mcPointPerQ : 0,
      maxScore: scoring.mcPointPerQ,
    })
  }

  // Phần II: TF — quy tắc THPT mới
  const TF_SCORE_MAP: Record<number, number> = { 4: 1, 3: 0.5, 2: 0.25, 1: 0.1, 0: 0 }
  let tfTotalScore = 0
  let tfMaxScore = 0

  for (let i = 0; i < answerKey.tf.length; i++) {
    const studentAns = studentAnswers.tf[i] ?? null
    const correctAns = answerKey.tf[i]
    let correctSubs = 0

    if (studentAns && studentAns.length === 4 && correctAns.length === 4) {
      for (let s = 0; s < 4; s++) {
        if (studentAns[s] === correctAns[s]) correctSubs++
      }
    }

    const qScore = TF_SCORE_MAP[correctSubs] ?? 0
    const qMax = scoring.tfPointPerQ
    tfTotalScore += qScore
    tfMaxScore += qMax

    details.push({
      index: i, type: 'tf',
      studentAnswer: studentAns, correctAnswer: correctAns,
      isCorrect: correctSubs === 4,
      score: qScore, maxScore: qMax,
    })
  }

  // Phần III: SA
  let saCorrect = 0
  for (let i = 0; i < answerKey.sa.length; i++) {
    const studentAns = studentAnswers.sa[i] ?? null
    const correctAns = answerKey.sa[i]
    const isCorrect = studentAns !== null && normalizeSAAnswer(studentAns) === normalizeSAAnswer(correctAns)
    if (isCorrect) saCorrect++
    details.push({
      index: i, type: 'sa',
      studentAnswer: studentAns, correctAnswer: correctAns,
      isCorrect,
      score: isCorrect ? scoring.saPointPerQ : 0,
      maxScore: scoring.saPointPerQ,
    })
  }

  const mcScore = mcCorrect * scoring.mcPointPerQ
  const saScore = saCorrect * scoring.saPointPerQ
  const total = mcScore + tfTotalScore + saScore
  const maxScore = (answerKey.mc.length * scoring.mcPointPerQ) + tfMaxScore + (answerKey.sa.length * scoring.saPointPerQ)

  return {
    total: Math.round(total * 100) / 100,
    maxScore: Math.round(maxScore * 100) / 100,
    mcCorrect, mcTotal: answerKey.mc.length,
    tfScore: Math.round(tfTotalScore * 100) / 100,
    tfMaxScore: Math.round(tfMaxScore * 100) / 100,
    saCorrect, saTotal: answerKey.sa.length,
    details,
  }
}

// ═══════════════════════════════════
// HELPERS
// ═══════════════════════════════════

function getDefaultScoring(config: OMRConfig): ScoringConfig {
  const rawTotal = config.mcCount * 0.25 + config.tfCount * 1 + config.saCount * 0.5
  if (rawTotal <= 0) return { totalScore: 10, mcPointPerQ: 0, tfPointPerQ: 0, saPointPerQ: 0 }
  const scale = 10 / rawTotal
  return {
    totalScore: 10,
    mcPointPerQ: Math.round(0.25 * scale * 1000) / 1000,
    tfPointPerQ: Math.round(1.0 * scale * 1000) / 1000,
    saPointPerQ: Math.round(0.5 * scale * 1000) / 1000,
  }
}

function normalizeSAAnswer(ans: string): string {
  return ans.trim().replace(/\s+/g, '').replace(/,/g, '.').replace(/^(-?)0+(\d)/, '$1$2')
}

function calculateConfidence(warnings: string[], config: OMRConfig, warpSuccess: boolean): number {
  let base = warpSuccess ? 1.0 : 0.5
  const totalItems = config.mcCount + config.tfCount * 4 + config.saCount + 4 + 8
  if (totalItems > 0) {
    const warningPenalty = warnings.length * (0.7 / totalItems)
    base = Math.max(0, base - warningPenalty)
  }
  return Math.min(1, Math.round(base * 100) / 100)
}

export function createConfigFromAnswerKey(
  mc: string[],
  tf: string[],
  sa: string[],
  threshold?: number
): OMRConfig {
  return {
    mcCount: mc.length,
    tfCount: tf.length,
    saCount: sa.length,
    answerKey: { mc, tf, sa },
    thresholdLevel: threshold,
  }
}
