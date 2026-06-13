// src/lib/omr/omr-engine.ts
// Pipeline: thuần JS, không cần OpenCV.js
// Grayscale → AdaptiveThreshold → findCornerMarkers (per-quadrant)
// → warpPerspective (DLT homography) → readBubbles → score

import type {
  OMRConfig, OMRResult, ScoreResult, QuestionResult, StudentAnswers, AnswerKey, ScoringConfig,
} from './types'
import { buildCoordinateMap } from './coordinate-map'
import {
  loadImageFromFile, detectAndWarpSync, getBinaryFromCanvas,
  drawDebugOverlay, type SheetCorners,
} from './image-preprocessor'
import { readAllAnswers } from './bubble-reader'

// ═══════════════════════════════════
// MAIN PIPELINE
// ═══════════════════════════════════

export async function scanAnswerSheet(file: File, config: OMRConfig): Promise<OMRResult> {
  const startTime = performance.now()
  const threshold = config.thresholdLevel ?? 0.32

  const { imageData, width, height } = await loadImageFromFile(file)
  const { warpedCanvas, corners, success } = detectAndWarpSync(imageData, width, height)

  const warnings: string[] = []
  if (!success) {
    warnings.push('⚠️ Không tìm được viền phiếu tự động — hãy chụp phẳng hơn và đủ 4 góc phiếu trong khung hình.')
  }

  const { binary, width: wW, height: wH } = getBinaryFromCanvas(warpedCanvas)
  const coordMap = buildCoordinateMap(config.mcCount, config.tfCount, config.saCount)
  const readResult = readAllAnswers(coordMap, binary, wW, wH, threshold)
  warnings.push(...readResult.warnings)

  const score = calculateScore(readResult.answers, config.answerKey, config)
  const confidence = calculateConfidence(warnings, config, success)

  return {
    examCode: readResult.examCode,
    studentId: readResult.studentId,
    answers: readResult.answers,
    score,
    confidence,
    warnings,
    processingTimeMs: performance.now() - startTime,
  }
}

export async function scanWithDebug(
  file: File, config: OMRConfig
): Promise<{ result: OMRResult; debugImageUrl: string }> {
  const startTime = performance.now()
  const threshold = config.thresholdLevel ?? 0.32

  const { imageData, ctx: origCtx, width, height } = await loadImageFromFile(file)
  const { warpedCanvas, corners, success } = detectAndWarpSync(imageData, width, height)

  const warnings: string[] = []
  if (!success) {
    warnings.push('⚠️ Không tìm được viền phiếu tự động — hãy chụp phẳng hơn và đủ 4 góc phiếu trong khung hình.')
  }

  const { binary, width: wW, height: wH } = getBinaryFromCanvas(warpedCanvas)
  const coordMap = buildCoordinateMap(config.mcCount, config.tfCount, config.saCount)
  const readResult = readAllAnswers(coordMap, binary, wW, wH, threshold)
  warnings.push(...readResult.warnings)

  // Debug: vẽ overlay lên warped canvas
  const warpedCtx = warpedCanvas.getContext('2d')!
  drawDebugOverlay(warpedCtx, null, readResult.allDebugBubbles.map(b => ({
    cx: b.x, cy: b.y, radius: b.radius, isFilled: b.isFilled, label: b.label,
  })))

  // Vẽ viền phiếu lên ảnh gốc (nếu tìm được)
  if (success && corners) {
    drawDebugOverlay(origCtx, corners, [])
  }

  const debugImageUrl = warpedCanvas.toDataURL('image/jpeg', 0.88)
  const score = calculateScore(readResult.answers, config.answerKey, config)
  const confidence = calculateConfidence(warnings, config, success)

  return {
    result: {
      examCode: readResult.examCode,
      studentId: readResult.studentId,
      answers: readResult.answers,
      score, confidence, warnings,
      processingTimeMs: performance.now() - startTime,
    },
    debugImageUrl,
  }
}

// ═══════════════════════════════════
// CHẤM ĐIỂM
// ═══════════════════════════════════

export function calculateScore(
  studentAnswers: StudentAnswers, answerKey: AnswerKey, config: OMRConfig
): ScoreResult {
  const scoring = config.scoringConfig ?? getDefaultScoring(config)
  const details: QuestionResult[] = []

  // MC
  let mcCorrect = 0
  for (let i = 0; i < answerKey.mc.length; i++) {
    const s = studentAnswers.mc[i] ?? null
    const c = answerKey.mc[i]
    const ok = s !== null && s.toUpperCase() === c.toUpperCase()
    if (ok) mcCorrect++
    details.push({ index: i, type: 'mc', studentAnswer: s, correctAnswer: c, isCorrect: ok, score: ok ? scoring.mcPointPerQ : 0, maxScore: scoring.mcPointPerQ })
  }

  // TF — quy tắc THPT mới: 4/4=1đ, 3/4=0.5đ, 2/4=0.25đ, 1/4=0.1đ, 0=0
  const TF_MAP: Record<number, number> = { 4: 1, 3: 0.5, 2: 0.25, 1: 0.1, 0: 0 }
  let tfTotalScore = 0, tfMaxScore = 0
  for (let i = 0; i < answerKey.tf.length; i++) {
    const s = studentAnswers.tf[i] ?? null
    const c = answerKey.tf[i]
    let correctSubs = 0
    if (s && s.length === 4 && c.length === 4) {
      for (let j = 0; j < 4; j++) if (s[j] === c[j]) correctSubs++
    }
    const qScore = TF_MAP[correctSubs] ?? 0
    tfTotalScore += qScore; tfMaxScore += scoring.tfPointPerQ
    details.push({ index: i, type: 'tf', studentAnswer: s, correctAnswer: c, isCorrect: correctSubs === 4, score: qScore, maxScore: scoring.tfPointPerQ })
  }

  // SA
  let saCorrect = 0
  for (let i = 0; i < answerKey.sa.length; i++) {
    const s = studentAnswers.sa[i] ?? null
    const c = answerKey.sa[i]
    const ok = s !== null && normSA(s) === normSA(c)
    if (ok) saCorrect++
    details.push({ index: i, type: 'sa', studentAnswer: s, correctAnswer: c, isCorrect: ok, score: ok ? scoring.saPointPerQ : 0, maxScore: scoring.saPointPerQ })
  }

  const mcScore = mcCorrect * scoring.mcPointPerQ
  const saScore = saCorrect * scoring.saPointPerQ
  const total = mcScore + tfTotalScore + saScore
  const maxScore = (answerKey.mc.length * scoring.mcPointPerQ) + tfMaxScore + (answerKey.sa.length * scoring.saPointPerQ)

  return {
    total: r2(total), maxScore: r2(maxScore),
    mcCorrect, mcTotal: answerKey.mc.length,
    tfScore: r2(tfTotalScore), tfMaxScore: r2(tfMaxScore),
    saCorrect, saTotal: answerKey.sa.length,
    details,
  }
}

// ═══════════════════════════════════
// HELPERS
// ═══════════════════════════════════

const r2 = (n: number) => Math.round(n * 100) / 100
const normSA = (s: string) => s.trim().replace(/\s+/g,'').replace(/,/g,'.').replace(/^(-?)0+(\d)/,'$1$2')

function getDefaultScoring(c: OMRConfig): ScoringConfig {
  const raw = c.mcCount*0.25 + c.tfCount*1 + c.saCount*0.5
  if (raw <= 0) return { totalScore: 10, mcPointPerQ: 0, tfPointPerQ: 0, saPointPerQ: 0 }
  const s = 10 / raw
  return { totalScore: 10, mcPointPerQ: r2(0.25*s), tfPointPerQ: r2(1.0*s), saPointPerQ: r2(0.5*s) }
}

function calculateConfidence(warnings: string[], config: OMRConfig, warpOk: boolean): number {
  let base = warpOk ? 1.0 : 0.5
  const total = config.mcCount + config.tfCount*4 + config.saCount + 12
  base = Math.max(0, base - warnings.length * (0.7 / Math.max(total, 1)))
  return Math.min(1, r2(base))
}

export function createConfigFromAnswerKey(
  mc: string[], tf: string[], sa: string[], threshold?: number
): OMRConfig {
  return { mcCount: mc.length, tfCount: tf.length, saCount: sa.length, answerKey: { mc, tf, sa }, thresholdLevel: threshold }
}
