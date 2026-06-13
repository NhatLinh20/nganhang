// src/lib/omr/omr-engine.ts
// Pipeline điều phối toàn bộ quá trình quét phiếu và chấm điểm

import type {
  OMRConfig,
  OMRResult,
  ScoreResult,
  QuestionResult,
  StudentAnswers,
  AnswerKey,
  ScoringConfig,
  BubbleState,
} from './types'
import { buildCoordinateMap, getLargeMarkerSizePx } from './coordinate-map'
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
 * 3. Tìm tracking marks (corner markers) → Perspective correction
 * 4. Đọc tất cả bong bóng (mã đề, SBD, MC, TF, SA)
 * 5. So khớp đáp án → Tính điểm
 * 
 * @param file File ảnh từ input hoặc camera
 * @param config Cấu hình (số câu, đáp án, ngưỡng)
 * @returns Kết quả quét + chấm điểm
 */
export async function scanAnswerSheet(
  file: File,
  config: OMRConfig
): Promise<OMRResult> {
  const startTime = performance.now()
  const threshold = config.thresholdLevel ?? 0.4

  // ── Bước 1: Load ảnh ──
  const { imageData, canvas, ctx, width, height } = await loadImageFromFile(file)

  // ── Bước 2: Tiền xử lý ──
  const gray = toGrayscale(imageData)
  const binary = adaptiveThreshold(gray, width, height, 31, 10)

  // ── Bước 3: Tìm corner markers ──
  const markerSize = getLargeMarkerSizePx(width)
  const corners = findCornerMarkers(binary, width, height, markerSize)
  // corners có thể null → sẽ dùng tọa độ trực tiếp (ảnh không bị nghiêng)

  // ── Bước 4: Build coordinate map và đọc bong bóng ──
  const coordMap = buildCoordinateMap(config.mcCount, config.tfCount, config.saCount)
  const readResult = readAllAnswers(coordMap, binary, width, height, threshold, corners)

  // ── Bước 5: Chấm điểm ──
  const score = calculateScore(readResult.answers, config.answerKey, config)

  // ── Tính confidence ──
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
 * Quét phiếu và trả thêm debug canvas (có overlay các vùng nhận dạng)
 */
export async function scanWithDebug(
  file: File,
  config: OMRConfig
): Promise<{ result: OMRResult; debugImageUrl: string }> {
  const startTime = performance.now()
  const threshold = config.thresholdLevel ?? 0.4

  // Load + process
  const { imageData, canvas, ctx, width, height } = await loadImageFromFile(file)
  const gray = toGrayscale(imageData)
  const binary = adaptiveThreshold(gray, width, height, 31, 10)
  const markerSize = getLargeMarkerSizePx(width)
  const corners = findCornerMarkers(binary, width, height, markerSize)
  const coordMap = buildCoordinateMap(config.mcCount, config.tfCount, config.saCount)
  const readResult = readAllAnswers(coordMap, binary, width, height, threshold, corners)
  const score = calculateScore(readResult.answers, config.answerKey, config)
  const confidence = calculateConfidence(readResult.warnings, config)

  // Vẽ debug overlay lên canvas gốc
  drawDebugOverlay(
    ctx,
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

/**
 * Tính điểm dựa trên đáp án thí sinh và đáp án đúng
 */
export function calculateScore(
  studentAnswers: StudentAnswers,
  answerKey: AnswerKey,
  config: OMRConfig
): ScoreResult {
  const scoring = config.scoringConfig ?? getDefaultScoring(config)
  const details: QuestionResult[] = []

  // ── Phần I: MC ──
  let mcCorrect = 0
  for (let i = 0; i < answerKey.mc.length; i++) {
    const studentAns = studentAnswers.mc[i] ?? null
    const correctAns = answerKey.mc[i]
    const isCorrect = studentAns !== null && studentAns.toUpperCase() === correctAns.toUpperCase()
    if (isCorrect) mcCorrect++

    details.push({
      index: i,
      type: 'mc',
      studentAnswer: studentAns,
      correctAnswer: correctAns,
      isCorrect,
      score: isCorrect ? scoring.mcPointPerQ : 0,
      maxScore: scoring.mcPointPerQ,
    })
  }

  // ── Phần II: TF ──
  // Quy tắc chấm TF theo chuẩn mới:
  // - Đúng 4/4 ý → 1 điểm (full)
  // - Đúng 3/4 ý → 0.5 điểm
  // - Đúng 2/4 ý → 0.25 điểm
  // - Đúng 1/4 ý → 0.1 điểm
  // - Đúng 0/4 → 0 điểm
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
      index: i,
      type: 'tf',
      studentAnswer: studentAns,
      correctAnswer: correctAns,
      isCorrect: correctSubs === 4,
      score: qScore,
      maxScore: qMax,
    })
  }

  // ── Phần III: SA ──
  let saCorrect = 0
  for (let i = 0; i < answerKey.sa.length; i++) {
    const studentAns = studentAnswers.sa[i] ?? null
    const correctAns = answerKey.sa[i]
    const isCorrect = studentAns !== null && normalizeSAAnswer(studentAns) === normalizeSAAnswer(correctAns)
    if (isCorrect) saCorrect++

    details.push({
      index: i,
      type: 'sa',
      studentAnswer: studentAns,
      correctAnswer: correctAns,
      isCorrect,
      score: isCorrect ? scoring.saPointPerQ : 0,
      maxScore: scoring.saPointPerQ,
    })
  }

  // ── Tổng hợp ──
  const mcScore = mcCorrect * scoring.mcPointPerQ
  const saScore = saCorrect * scoring.saPointPerQ
  const total = mcScore + tfTotalScore + saScore
  const maxScore = (answerKey.mc.length * scoring.mcPointPerQ) +
    tfMaxScore +
    (answerKey.sa.length * scoring.saPointPerQ)

  // Làm tròn 2 chữ số
  return {
    total: Math.round(total * 100) / 100,
    maxScore: Math.round(maxScore * 100) / 100,
    mcCorrect,
    mcTotal: answerKey.mc.length,
    tfScore: Math.round(tfTotalScore * 100) / 100,
    tfMaxScore: Math.round(tfMaxScore * 100) / 100,
    saCorrect,
    saTotal: answerKey.sa.length,
    details,
  }
}

// ═══════════════════════════════════
// HELPERS
// ═══════════════════════════════════

/** Tính scoring config mặc định dựa trên số câu */
function getDefaultScoring(config: OMRConfig): ScoringConfig {
  const totalQuestions = config.mcCount + config.tfCount + config.saCount
  if (totalQuestions === 0) {
    return { totalScore: 10, mcPointPerQ: 0, tfPointPerQ: 0, saPointPerQ: 0 }
  }

  // Điểm mặc định theo chuẩn thi THPT
  // MC: 0.25đ/câu, TF: 1đ/câu max, SA: 0.5đ/câu
  // Nếu tổng > 10 → normalize về 10
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

/** Chuẩn hóa đáp án SA để so sánh (bỏ khoảng trắng, thay {,} → dấu phẩy, v.v.) */
function normalizeSAAnswer(ans: string): string {
  return ans
    .trim()
    .replace(/\s+/g, '')         // Bỏ khoảng trắng
    .replace(/\{,\}/g, ',')      // {,} → ,
    .replace(/\\,/g, '')         // \, → bỏ (dấu cách nghìn LaTeX)
    .replace(/,/g, '.')          // Dấu phẩy thập phân → dấu chấm
    .replace(/^(-?)0+(\d)/, '$1$2') // Leading zeros
}

/** Tính độ tin cậy dựa trên số warning */
function calculateConfidence(warnings: string[], config: OMRConfig): number {
  const totalItems = config.mcCount + config.tfCount * 4 + config.saCount + 4 + 8 // bubbles + mã đề + SBD
  if (totalItems === 0) return 1

  // Mỗi warning giảm confidence
  const warningPenalty = warnings.length * (1 / totalItems)
  return Math.max(0, Math.min(1, 1 - warningPenalty))
}

/**
 * Tạo OMRConfig từ đáp án đã có sẵn (dùng khi giáo viên nhập đáp án tay)
 */
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
