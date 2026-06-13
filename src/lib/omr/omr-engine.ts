// src/lib/omr/omr-engine.ts
// Pipeline điều phối toàn bộ quá trình quét phiếu và chấm điểm
// V2: Corner detection bắt buộc, error rõ ràng khi không tìm thấy markers

import type {
  OMRConfig,
  OMRResult,
  ScoreResult,
  QuestionResult,
  StudentAnswers,
  AnswerKey,
  ScoringConfig,
} from './types'
import { buildCoordinateMap } from './coordinate-map'
import {
  loadImageFromFile,
  toGrayscale,
  adaptiveThreshold,
  findCornerMarkers,
  drawDebugOverlay,
} from './image-preprocessor'
import { readAllAnswers } from './bubble-reader'

// ═══════════════════════════════════
// MAIN PIPELINE
// ═══════════════════════════════════

/**
 * Quét và chấm điểm một phiếu trả lời trắc nghiệm
 *
 * Pipeline:
 * 1. Load ảnh → Canvas
 * 2. Grayscale → Adaptive threshold → Binary
 * 3. Tìm 4 marker góc → Nếu không tìm được → throw error
 * 4. Perspective mapping: map tọa độ tương đối → pixel qua bilinear interpolation
 * 5. Đọc tất cả bong bóng (mã đề, SBD, MC, TF, SA)
 * 6. So khớp đáp án → Tính điểm
 */
export async function scanAnswerSheet(
  file: File,
  config: OMRConfig
): Promise<OMRResult> {
  const startTime = performance.now()
  const threshold = config.thresholdLevel ?? 0.35

  // Bước 1: Load ảnh
  const { imageData, width, height } = await loadImageFromFile(file)

  // Bước 2: Tiền xử lý
  const gray = toGrayscale(imageData)
  const binary = adaptiveThreshold(gray, width, height, 31, 10)

  // Bước 3: Tìm 4 marker góc (BẮT BUỘC)
  const corners = findCornerMarkers(binary, width, height)
  if (!corners) {
    throw new Error(
      'Không tìm được 4 ô vuông định vị trên phiếu. ' +
      'Hãy đảm bảo: (1) ảnh rõ nét, (2) phiếu nằm trọn trong khung hình, ' +
      '(3) 4 ô vuông đen ở góc phiếu phải nhìn thấy rõ.'
    )
  }

  // Bước 4-5: Build coordinate map và đọc bong bóng
  const coordMap = buildCoordinateMap(config.mcCount, config.tfCount, config.saCount)
  const readResult = readAllAnswers(coordMap, binary, width, height, threshold, corners)

  // Bước 6: Chấm điểm
  const score = calculateScore(readResult.answers, config.answerKey, config)
  const confidence = calculateConfidence(readResult.warnings, config)
  const processingTimeMs = performance.now() - startTime

  return {
    examCode: readResult.examCode,
    studentId: readResult.studentId,
    answers: readResult.answers,
    score,
    confidence,
    warnings: readResult.warnings,
    processingTimeMs,
  }
}

/**
 * Quét phiếu và trả thêm debug canvas (overlay markers + bubbles)
 */
export async function scanWithDebug(
  file: File,
  config: OMRConfig
): Promise<{ result: OMRResult; debugImageUrl: string }> {
  const startTime = performance.now()
  const threshold = config.thresholdLevel ?? 0.35

  const { imageData, canvas, ctx, width, height } = await loadImageFromFile(file)
  const gray = toGrayscale(imageData)
  const binary = adaptiveThreshold(gray, width, height, 31, 10)

  const corners = findCornerMarkers(binary, width, height)
  if (!corners) {
    // Vẫn trả debug image nhưng không có overlay hữu ích
    throw new Error(
      'Không tìm được 4 ô vuông định vị trên phiếu. ' +
      'Hãy đảm bảo: (1) ảnh rõ nét, (2) phiếu nằm trọn trong khung hình, ' +
      '(3) 4 ô vuông đen ở góc phiếu phải nhìn thấy rõ.'
    )
  }

  const coordMap = buildCoordinateMap(config.mcCount, config.tfCount, config.saCount)
  const readResult = readAllAnswers(coordMap, binary, width, height, threshold, corners)
  const score = calculateScore(readResult.answers, config.answerKey, config)
  const confidence = calculateConfidence(readResult.warnings, config)

  // Vẽ debug overlay
  drawDebugOverlay(
    ctx,
    corners,
    readResult.allDebugBubbles.map(b => ({
      cx: b.x,
      cy: b.y,
      radius: b.radius,
      isFilled: b.isFilled,
      label: b.label,
    }))
  )

  const debugImageUrl = canvas.toDataURL('image/png')
  const processingTimeMs = performance.now() - startTime

  return {
    result: {
      examCode: readResult.examCode,
      studentId: readResult.studentId,
      answers: readResult.answers,
      score,
      confidence,
      warnings: readResult.warnings,
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

  // Phần II: TF (quy tắc THPT mới)
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
  const totalQuestions = config.mcCount + config.tfCount + config.saCount
  if (totalQuestions === 0) {
    return { totalScore: 10, mcPointPerQ: 0, tfPointPerQ: 0, saPointPerQ: 0 }
  }

  const rawTotal = config.mcCount * 0.25 + config.tfCount * 1 + config.saCount * 0.5
  if (rawTotal <= 0) {
    return { totalScore: 10, mcPointPerQ: 0, tfPointPerQ: 0, saPointPerQ: 0 }
  }

  const scale = 10 / rawTotal
  return {
    totalScore: 10,
    mcPointPerQ: Math.round(0.25 * scale * 1000) / 1000,
    tfPointPerQ: Math.round(1 * scale * 1000) / 1000,
    saPointPerQ: Math.round(0.5 * scale * 1000) / 1000,
  }
}

function normalizeSAAnswer(ans: string): string {
  return ans
    .trim()
    .replace(/\s+/g, '')
    .replace(/\{,\}/g, ',')
    .replace(/\\,/g, '')
    .replace(/,/g, '.')
    .replace(/^(-?)0+(\d)/, '$1$2')
}

function calculateConfidence(warnings: string[], config: OMRConfig): number {
  const totalItems = config.mcCount + config.tfCount * 4 + config.saCount + 4 + 8
  if (totalItems === 0) return 1
  const warningPenalty = warnings.length * (1 / totalItems)
  return Math.max(0, Math.min(1, 1 - warningPenalty))
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
