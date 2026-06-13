// src/app/(dashboard)/teacher/scan/ScanClient.tsx
// Client component chính cho trang quét phiếu trả lời trắc nghiệm
'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import styles from './scan.module.css'
import type { OMRConfig, OMRResult, AnswerKey, QuestionResult } from '@/lib/omr/types'
import { scanWithDebug, createConfigFromAnswerKey } from '@/lib/omr/omr-engine'
import { loadOpenCV, isOpenCVLoaded } from '@/lib/omr/opencv-loader'

// ═══════════════════════════════════
// TYPES
// ═══════════════════════════════════

interface ScanClientProps {
  userRole: string
  userId: string
}

type Step = 'config' | 'scan' | 'result'

// ═══════════════════════════════════
// COMPONENT
// ═══════════════════════════════════

export default function ScanClient({ userRole, userId }: ScanClientProps) {
  // ── Step state ──
  const [currentStep, setCurrentStep] = useState<Step>('config')

  // ── Config state (Bước 1) ──
  const [mcCount, setMcCount] = useState(40)
  const [tfCount, setTfCount] = useState(0)
  const [saCount, setSaCount] = useState(0)
  const [mcAnswers, setMcAnswers] = useState<string[]>(Array(40).fill(''))
  const [tfAnswers, setTfAnswers] = useState<string[]>([])
  const [saAnswers, setSaAnswers] = useState<string[]>([])
  const [threshold, setThreshold] = useState(0.4)

  // ── Scan state (Bước 2) ──
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Result state (Bước 3) ──
  const [scanResult, setScanResult] = useState<OMRResult | null>(null)
  const [debugImageUrl, setDebugImageUrl] = useState<string | null>(null)
  const [showDebug, setShowDebug] = useState(false)

  // ── OpenCV loading state ──
  const [cvLoading, setCvLoading] = useState(false)
  const [cvProgress, setCvProgress] = useState(0)
  const [cvReady, setCvReady] = useState(false)

  // ── Saving state ──
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  // ═══════════════════════════════════
  // HANDLERS — Bước 1: Config
  // ═══════════════════════════════════

  // Cập nhật số câu MC
  const handleMcCountChange = (val: string) => {
    const n = Math.min(40, Math.max(0, parseInt(val) || 0))
    setMcCount(n)
    setMcAnswers(prev => {
      if (n > prev.length) return [...prev, ...Array(n - prev.length).fill('')]
      return prev.slice(0, n)
    })
  }

  // Cập nhật số câu TF
  const handleTfCountChange = (val: string) => {
    const n = Math.min(8, Math.max(0, parseInt(val) || 0))
    setTfCount(n)
    setTfAnswers(prev => {
      if (n > prev.length) return [...prev, ...Array(n - prev.length).fill('')]
      return prev.slice(0, n)
    })
  }

  // Cập nhật số câu SA
  const handleSaCountChange = (val: string) => {
    const n = Math.min(6, Math.max(0, parseInt(val) || 0))
    setSaCount(n)
    setSaAnswers(prev => {
      if (n > prev.length) return [...prev, ...Array(n - prev.length).fill('')]
      return prev.slice(0, n)
    })
  }

  // Cập nhật đáp án MC
  const handleMcAnswerChange = (index: number, value: string) => {
    const upper = value.toUpperCase()
    if (upper && !['A', 'B', 'C', 'D'].includes(upper)) return
    setMcAnswers(prev => {
      const next = [...prev]
      next[index] = upper
      return next
    })
  }

  // Cập nhật đáp án TF
  const handleTfAnswerChange = (index: number, value: string) => {
    const upper = value.toUpperCase().replace(/[^ĐS]/gi, '')
    // Normalize: Đ and đ → Đ, S and s → S
    const normalized = upper
      .replace(/Đ/gi, 'Đ')
      .replace(/D/g, 'Đ')
      .replace(/S/gi, 'S')
    if (normalized.length > 4) return
    setTfAnswers(prev => {
      const next = [...prev]
      next[index] = normalized.slice(0, 4)
      return next
    })
  }

  // Cập nhật đáp án SA
  const handleSaAnswerChange = (index: number, value: string) => {
    setSaAnswers(prev => {
      const next = [...prev]
      next[index] = value
      return next
    })
  }

  // Kiểm tra đáp án đã đủ chưa
  const isConfigValid = useCallback(() => {
    if (mcCount === 0 && tfCount === 0 && saCount === 0) return false
    // MC phải điền hết
    if (mcCount > 0 && mcAnswers.slice(0, mcCount).some(a => !a)) return false
    // TF phải điền đủ 4 ký tự
    if (tfCount > 0 && tfAnswers.slice(0, tfCount).some(a => a.length !== 4)) return false
    // SA phải điền hết
    if (saCount > 0 && saAnswers.slice(0, saCount).some(a => !a.trim())) return false
    return true
  }, [mcCount, tfCount, saCount, mcAnswers, tfAnswers, saAnswers])

  // ═══════════════════════════════════
  // HANDLERS — Bước 2: Upload/Scan
  // ═══════════════════════════════════

  const handleFileSelect = (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('Vui lòng chọn file ảnh (JPG, PNG)')
      return
    }
    setSelectedFile(file)
    setPreviewUrl(URL.createObjectURL(file))
    setScanResult(null)
    setDebugImageUrl(null)
  }

  const handleDropzoneClick = () => {
    fileInputRef.current?.click()
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFileSelect(file)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }

  const handleDragLeave = () => {
    setDragOver(false)
  }

  // ═══════════════════════════════════
  // SCAN — Xử lý quét phiếu
  // ═══════════════════════════════════

  const handleScan = async () => {
    if (!selectedFile) return
    setIsProcessing(true)
    setSaveMessage(null)

    try {
      // Lazy-load OpenCV.js chỉ khi cần quét
      if (!isOpenCVLoaded()) {
        setCvLoading(true)
        setCvProgress(0)
        await loadOpenCV((pct) => setCvProgress(pct))
        setCvLoading(false)
        setCvReady(true)
      }

      const config = createConfigFromAnswerKey(
        mcAnswers.slice(0, mcCount),
        tfAnswers.slice(0, tfCount),
        saAnswers.slice(0, saCount),
        threshold
      )

      const { result, debugImageUrl: dbgUrl } = await scanWithDebug(selectedFile, config)
      setScanResult(result)
      setDebugImageUrl(dbgUrl)
      setCurrentStep('result')
    } catch (err) {
      console.error('Scan error:', err)
      alert('Lỗi khi quét phiếu: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setIsProcessing(false)
      setCvLoading(false)
    }
  }

  // ═══════════════════════════════════
  // SAVE — Lưu kết quả vào DB
  // ═══════════════════════════════════

  const handleSaveResult = async () => {
    if (!scanResult) return
    setIsSaving(true)
    setSaveMessage(null)

    try {
      const response = await fetch('/api/scan-results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          examCode: scanResult.examCode,
          studentId: scanResult.studentId,
          score: scanResult.score.total,
          maxScore: scanResult.score.maxScore,
          mcCorrect: scanResult.score.mcCorrect,
          mcTotal: scanResult.score.mcTotal,
          tfScore: scanResult.score.tfScore,
          tfMaxScore: scanResult.score.tfMaxScore,
          saCorrect: scanResult.score.saCorrect,
          saTotal: scanResult.score.saTotal,
          details: scanResult.score.details,
          confidence: scanResult.confidence,
          warnings: scanResult.warnings,
          answers: scanResult.answers,
        }),
      })

      if (response.ok) {
        setSaveMessage('✅ Đã lưu kết quả thành công!')
      } else {
        const data = await response.json()
        setSaveMessage(`❌ Lỗi: ${data.error || 'Không thể lưu'}`)
      }
    } catch (err) {
      setSaveMessage('❌ Lỗi kết nối server')
    } finally {
      setIsSaving(false)
    }
  }

  // ═══════════════════════════════════
  // RESET — Quét lại
  // ═══════════════════════════════════

  const handleScanAnother = () => {
    setSelectedFile(null)
    setPreviewUrl(null)
    setScanResult(null)
    setDebugImageUrl(null)
    setSaveMessage(null)
    setCurrentStep('scan')
  }

  const handleStartOver = () => {
    setSelectedFile(null)
    setPreviewUrl(null)
    setScanResult(null)
    setDebugImageUrl(null)
    setSaveMessage(null)
    setCurrentStep('config')
  }

  // Cleanup blob URLs
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  // Kiểm tra xem OpenCV đã được cache chưa (chỉ cập nhật state, KHÔNG load)
  useEffect(() => {
    if (isOpenCVLoaded()) setCvReady(true)
  }, [])

  // ═══════════════════════════════════
  // RENDER
  // ═══════════════════════════════════

  const steps = [
    { key: 'config' as Step, label: 'Nhập đáp án', icon: '📝' },
    { key: 'scan' as Step, label: 'Quét phiếu', icon: '📷' },
    { key: 'result' as Step, label: 'Kết quả', icon: '📊' },
  ]

  const stepOrder: Step[] = ['config', 'scan', 'result']
  const currentIdx = stepOrder.indexOf(currentStep)

  return (
    <div className={styles.scanPage}>
      {/* ── Header ── */}
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>
          📷 Quét phiếu chấm thi
        </h1>
        <p className={styles.pageSubtitle}>
          Quét phiếu trả lời trắc nghiệm và chấm điểm tự động
        </p>
      </div>

      {/* ── Stepper ── */}
      <div className={styles.stepper}>
        {steps.map((step, idx) => (
          <div key={step.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {idx > 0 && (
              <div className={`${styles.stepConnector} ${idx <= currentIdx ? styles.completed : ''}`} />
            )}
            <div
              className={`${styles.step} ${
                step.key === currentStep ? styles.active :
                idx < currentIdx ? styles.completed : ''
              }`}
            >
              <span className={styles.stepNumber}>
                {idx < currentIdx ? '✓' : idx + 1}
              </span>
              <span>{step.icon} {step.label}</span>
            </div>
          </div>
        ))}
      </div>

      {/* ═══════════════════════════════════
          STEP 1: NHẬP ĐÁP ÁN
      ═══════════════════════════════════ */}
      {currentStep === 'config' && (
        <>
          <div className={styles.configPanel}>
            {/* ── Cấu hình số câu ── */}
            <div className={styles.configCard}>
              <div className={styles.configCardTitle}>⚙️ Cấu hình đề thi</div>

              <div className={styles.countInputs}>
                <div className={styles.countGroup}>
                  <label>Trắc nghiệm (MC)</label>
                  <input
                    type="number" min={0} max={40}
                    value={mcCount}
                    onChange={e => handleMcCountChange(e.target.value)}
                  />
                </div>
                <div className={styles.countGroup}>
                  <label>Đúng/Sai (TF)</label>
                  <input
                    type="number" min={0} max={8}
                    value={tfCount}
                    onChange={e => handleTfCountChange(e.target.value)}
                  />
                </div>
                <div className={styles.countGroup}>
                  <label>Trả lời ngắn (SA)</label>
                  <input
                    type="number" min={0} max={6}
                    value={saCount}
                    onChange={e => handleSaCountChange(e.target.value)}
                  />
                </div>
              </div>

              <div className={styles.countGroup} style={{ marginTop: 12 }}>
                <label>Ngưỡng nhận dạng ({Math.round(threshold * 100)}%)</label>
                <input
                  type="range" min={0.2} max={0.7} step={0.05}
                  value={threshold}
                  onChange={e => setThreshold(parseFloat(e.target.value))}
                  style={{ width: '100%', accentColor: '#3b82f6' }}
                />
              </div>

              <div style={{ marginTop: 16, padding: '12px 16px', background: '#f0f9ff', borderRadius: 8, fontSize: 13, color: '#1e40af', lineHeight: 1.6 }}>
                <strong>💡 Hướng dẫn:</strong> Điền đáp án đúng cho từng câu. MC: A/B/C/D. TF: chuỗi 4 ký tự Đ/S (ví dụ: ĐSĐS). SA: giá trị số (ví dụ: -2,5).
              </div>
            </div>

            {/* ── Đáp án ── */}
            <div className={styles.configCard}>
              <div className={styles.configCardTitle}>✏️ Đáp án đúng</div>

              {/* MC Answers */}
              {mcCount > 0 && (
                <>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#1d4ed8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Phần I — Trắc nghiệm ({mcCount} câu)
                  </div>
                  <div className={styles.answerGrid}>
                    {Array.from({ length: mcCount }, (_, i) => (
                      <div key={`mc-${i}`} className={styles.answerCell}>
                        <span className={styles.answerCellLabel}>{i + 1}</span>
                        <input
                          className={`${styles.answerCellInput} ${mcAnswers[i] ? styles.filled : ''}`}
                          type="text"
                          maxLength={1}
                          value={mcAnswers[i] || ''}
                          onChange={e => handleMcAnswerChange(i, e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Tab' || e.key === 'Enter') {
                              e.preventDefault()
                              const next = document.querySelector(`[data-mc-idx="${i + 1}"]`) as HTMLInputElement
                              next?.focus()
                            }
                          }}
                          data-mc-idx={i}
                          placeholder="?"
                        />
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* TF Answers */}
              {tfCount > 0 && (
                <>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#7c3aed', marginBottom: 6, marginTop: 16, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Phần II — Đúng/Sai ({tfCount} câu)
                  </div>
                  <div className={styles.answerGrid} style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))' }}>
                    {Array.from({ length: tfCount }, (_, i) => (
                      <div key={`tf-${i}`} className={styles.answerCell}>
                        <span className={styles.answerCellLabel}>Câu {i + 1}</span>
                        <input
                          className={`${styles.answerCellInput} ${styles.tfAnswerInput} ${tfAnswers[i]?.length === 4 ? styles.filled : ''}`}
                          type="text"
                          maxLength={4}
                          value={tfAnswers[i] || ''}
                          onChange={e => handleTfAnswerChange(i, e.target.value)}
                          placeholder="ĐSĐS"
                        />
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* SA Answers */}
              {saCount > 0 && (
                <>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#d97706', marginBottom: 6, marginTop: 16, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Phần III — Trả lời ngắn ({saCount} câu)
                  </div>
                  <div className={styles.answerGrid} style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))' }}>
                    {Array.from({ length: saCount }, (_, i) => (
                      <div key={`sa-${i}`} className={styles.answerCell}>
                        <span className={styles.answerCellLabel}>Câu {i + 1}</span>
                        <input
                          className={`${styles.answerCellInput} ${saAnswers[i]?.trim() ? styles.filled : ''}`}
                          type="text"
                          maxLength={10}
                          value={saAnswers[i] || ''}
                          onChange={e => handleSaAnswerChange(i, e.target.value)}
                          placeholder="0"
                          style={{ width: 64 }}
                        />
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Action bar */}
          <div className={styles.actionBar}>
            <div />
            <button
              className={`${styles.scanBtn} ${styles.scanBtnPrimary}`}
              disabled={!isConfigValid()}
              onClick={() => setCurrentStep('scan')}
            >
              Tiếp tục — Quét phiếu →
            </button>
          </div>
        </>
      )}

      {/* ═══════════════════════════════════
          STEP 2: UPLOAD / CHỤP ẢNH
      ═══════════════════════════════════ */}
      {currentStep === 'scan' && (
        <div className={styles.uploadArea}>
          {/* Dropzone */}
          {!previewUrl && (
            <div
              className={`${styles.dropzone} ${dragOver ? styles.dragOver : ''}`}
              onClick={handleDropzoneClick}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
            >
              <div className={styles.dropzoneIcon}>📸</div>
              <div className={styles.dropzoneText}>Kéo thả ảnh phiếu trả lời vào đây</div>
              <div className={styles.dropzoneHint}>hoặc click để chọn file (JPG, PNG)</div>
              <input
                ref={fileInputRef}
                className={styles.fileInput}
                type="file"
                accept="image/*"
                onChange={e => {
                  const file = e.target.files?.[0]
                  if (file) handleFileSelect(file)
                }}
              />
            </div>
          )}

          {/* Preview */}
          {previewUrl && (
            <div className={styles.imagePreview}>
              <img src={previewUrl} alt="Phiếu trả lời" />
              <div className={styles.imagePreviewActions}>
                <button
                  className={`${styles.scanBtn} ${styles.scanBtnSecondary}`}
                  onClick={() => {
                    setSelectedFile(null)
                    setPreviewUrl(null)
                  }}
                >
                  🔄 Chọn ảnh khác
                </button>
                <button
                  className={`${styles.scanBtn} ${styles.scanBtnPrimary}`}
                  onClick={handleScan}
                  disabled={isProcessing}
                >
                  {isProcessing ? '⏳ Đang xử lý...' : '🔍 Quét & Chấm điểm'}
                </button>
              </div>
            </div>
          )}

          {/* Action bar */}
          <div className={styles.actionBar}>
            <button
              className={`${styles.scanBtn} ${styles.scanBtnSecondary}`}
              onClick={() => setCurrentStep('config')}
            >
              ← Quay lại chỉnh đáp án
            </button>
            <div />
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════
          STEP 3: KẾT QUẢ
      ═══════════════════════════════════ */}
      {currentStep === 'result' && scanResult && (
        <>
          <div className={styles.resultPanel}>
            {/* ── Score Card (cột trái) ── */}
            <div className={styles.scoreCard}>
              {/* Điểm số lớn */}
              <div className={styles.scoreHeader}>
                <div className={styles.scoreValue}>
                  {scanResult.score.total}
                </div>
                <div className={styles.scoreMax}>
                  / {scanResult.score.maxScore} điểm
                </div>
              </div>

              {/* Mã đề + SBD */}
              <div className={styles.metaInfo}>
                <div className={styles.metaBadge}>
                  <div className={styles.metaBadgeLabel}>Mã đề</div>
                  <div className={styles.metaBadgeValue}>
                    {scanResult.examCode || '—'}
                  </div>
                </div>
                <div className={styles.metaBadge}>
                  <div className={styles.metaBadgeLabel}>Số báo danh</div>
                  <div className={styles.metaBadgeValue}>
                    {scanResult.studentId || '—'}
                  </div>
                </div>
              </div>

              {/* Chi tiết điểm */}
              <div className={styles.scoreDetails}>
                {scanResult.score.mcTotal > 0 && (
                  <div className={styles.scoreRow}>
                    <span className={styles.scoreRowLabel}>Phần I (TN)</span>
                    <span className={`${styles.scoreRowValue} ${styles.correct}`}>
                      {scanResult.score.mcCorrect}/{scanResult.score.mcTotal} câu đúng
                    </span>
                  </div>
                )}
                {scanResult.score.tfMaxScore > 0 && (
                  <div className={styles.scoreRow}>
                    <span className={styles.scoreRowLabel}>Phần II (ĐS)</span>
                    <span className={`${styles.scoreRowValue} ${styles.correct}`}>
                      {scanResult.score.tfScore}/{scanResult.score.tfMaxScore} điểm
                    </span>
                  </div>
                )}
                {scanResult.score.saTotal > 0 && (
                  <div className={styles.scoreRow}>
                    <span className={styles.scoreRowLabel}>Phần III (SA)</span>
                    <span className={`${styles.scoreRowValue} ${styles.correct}`}>
                      {scanResult.score.saCorrect}/{scanResult.score.saTotal} câu đúng
                    </span>
                  </div>
                )}
                <div className={styles.scoreRow}>
                  <span className={styles.scoreRowLabel}>⏱ Thời gian quét</span>
                  <span className={styles.scoreRowValue}>
                    {Math.round(scanResult.processingTimeMs)}ms
                  </span>
                </div>
              </div>

              {/* Confidence */}
              <div className={styles.confidenceMeter}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748b' }}>
                  <span>Độ tin cậy</span>
                  <span>{Math.round(scanResult.confidence * 100)}%</span>
                </div>
                <div className={styles.confidenceBar}>
                  <div
                    className={`${styles.confidenceFill} ${
                      scanResult.confidence >= 0.8 ? styles.high :
                      scanResult.confidence >= 0.5 ? styles.medium : styles.low
                    }`}
                    style={{ width: `${scanResult.confidence * 100}%` }}
                  />
                </div>
              </div>

              {/* Warnings */}
              {scanResult.warnings.length > 0 && (
                <div className={styles.warningsList}>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>⚠️ Cảnh báo ({scanResult.warnings.length})</div>
                  {scanResult.warnings.slice(0, 10).map((w, i) => (
                    <div key={i}>• {w}</div>
                  ))}
                  {scanResult.warnings.length > 10 && (
                    <div style={{ fontStyle: 'italic' }}>...và {scanResult.warnings.length - 10} cảnh báo khác</div>
                  )}
                </div>
              )}

              {/* Save button */}
              <div style={{ padding: '16px 24px' }}>
                <button
                  className={`${styles.scanBtn} ${styles.scanBtnSuccess}`}
                  style={{ width: '100%', justifyContent: 'center' }}
                  onClick={handleSaveResult}
                  disabled={isSaving}
                >
                  {isSaving ? '⏳ Đang lưu...' : '💾 Lưu kết quả'}
                </button>
                {saveMessage && (
                  <div style={{ textAlign: 'center', marginTop: 8, fontSize: 13, fontWeight: 600, color: saveMessage.startsWith('✅') ? '#16a34a' : '#dc2626' }}>
                    {saveMessage}
                  </div>
                )}
              </div>
            </div>

            {/* ── Details Card (cột phải) ── */}
            <div className={styles.detailsCard}>
              <div className={styles.detailsHeader}>
                <span className={styles.detailsTitle}>📋 Chi tiết đáp án</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  {debugImageUrl && (
                    <button
                      className={`${styles.scanBtn} ${styles.scanBtnSecondary}`}
                      style={{ padding: '6px 12px', fontSize: 13 }}
                      onClick={() => setShowDebug(!showDebug)}
                    >
                      {showDebug ? '📋 Xem bảng' : '🔍 Xem debug'}
                    </button>
                  )}
                </div>
              </div>

              {showDebug && debugImageUrl ? (
                <div style={{ padding: 16 }}>
                  <img src={debugImageUrl} alt="Debug overlay" style={{ width: '100%', borderRadius: 8, border: '1px solid #e5e7eb' }} />
                </div>
              ) : (
                <table className={styles.detailsTable}>
                  <thead>
                    <tr>
                      <th style={{ width: 50 }}>Câu</th>
                      <th style={{ width: 80 }}>Phần</th>
                      <th>Thí sinh</th>
                      <th>Đáp án</th>
                      <th style={{ width: 60 }}>Điểm</th>
                      <th style={{ width: 70 }}>Kết quả</th>
                    </tr>
                  </thead>
                  <tbody>
                    {renderDetailRows(scanResult.score.details)}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Action bar */}
          <div className={styles.actionBar}>
            <div className={styles.actionBarLeft}>
              <button
                className={`${styles.scanBtn} ${styles.scanBtnSecondary}`}
                onClick={handleStartOver}
              >
                ⚙️ Đổi đáp án
              </button>
            </div>
            <div className={styles.actionBarRight}>
              <button
                className={`${styles.scanBtn} ${styles.scanBtnPrimary}`}
                onClick={handleScanAnother}
              >
                📷 Quét bài tiếp theo
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── OpenCV download progress (chỉ hiện khi đang tải lúc quét) ── */}
      {cvLoading && (
        <div className={styles.processingOverlay}>
          <div className={styles.processingCard}>
            <div className={styles.processingSpinner} />
            <div className={styles.processingText}>Đang tải OpenCV.js ({cvProgress}%)</div>
            <div style={{ width: '100%', background: '#1e293b', borderRadius: 6, height: 8, margin: '12px 0', overflow: 'hidden' }}>
              <div style={{ background: '#3b82f6', height: '100%', width: `${cvProgress}%`, transition: 'width 0.3s', borderRadius: 6 }} />
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>
              Lần đầu cần tải ~9MB — lần sau dùng cache tức thì
            </div>
          </div>
        </div>
      )}

      {/* ── Processing overlay (sau khi OpenCV đã load) ── */}
      {isProcessing && !cvLoading && (
        <div className={styles.processingOverlay}>
          <div className={styles.processingCard}>
            <div className={styles.processingSpinner} />
            <div className={styles.processingText}>Đang phân tích ảnh...</div>
            <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 8 }}>
              warpPerspective → đọc bubble → chấm điểm
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════
// HELPER: Render detail rows
// ═══════════════════════════════════

function renderDetailRows(details: QuestionResult[]) {
  const mcDetails = details.filter(d => d.type === 'mc')
  const tfDetails = details.filter(d => d.type === 'tf')
  const saDetails = details.filter(d => d.type === 'sa')

  const rows: React.ReactNode[] = []

  // MC section
  if (mcDetails.length > 0) {
    rows.push(
      <tr key="mc-header" className={styles.sectionDivider}>
        <td colSpan={6}>📘 Phần I — Trắc nghiệm ({mcDetails.length} câu)</td>
      </tr>
    )
    for (const d of mcDetails) {
      rows.push(
        <tr key={`mc-${d.index}`} className={d.isCorrect ? styles.correctRow : styles.wrongRow}>
          <td>{d.index + 1}</td>
          <td><span className="badge badge-mc" style={{ fontSize: 11 }}>TN</span></td>
          <td>
            <span className={`${styles.answerBadge} ${d.studentAnswer ? (d.isCorrect ? styles.correct : styles.wrong) : styles.empty}`}>
              {d.studentAnswer || '—'}
            </span>
          </td>
          <td>
            <span className={`${styles.answerBadge} ${styles.correct}`}>{d.correctAnswer}</span>
          </td>
          <td>{d.score}/{d.maxScore}</td>
          <td>{d.isCorrect ? '✅' : '❌'}</td>
        </tr>
      )
    }
  }

  // TF section
  if (tfDetails.length > 0) {
    rows.push(
      <tr key="tf-header" className={styles.sectionDivider}>
        <td colSpan={6}>📗 Phần II — Đúng/Sai ({tfDetails.length} câu)</td>
      </tr>
    )
    for (const d of tfDetails) {
      rows.push(
        <tr key={`tf-${d.index}`} className={d.isCorrect ? styles.correctRow : styles.wrongRow}>
          <td>{d.index + 1}</td>
          <td><span className="badge badge-tf" style={{ fontSize: 11 }}>ĐS</span></td>
          <td style={{ fontFamily: 'monospace', letterSpacing: 2 }}>{d.studentAnswer || '—'}</td>
          <td style={{ fontFamily: 'monospace', letterSpacing: 2 }}>{d.correctAnswer}</td>
          <td>{d.score}/{d.maxScore}</td>
          <td>{d.isCorrect ? '✅' : d.score > 0 ? '⚠️' : '❌'}</td>
        </tr>
      )
    }
  }

  // SA section
  if (saDetails.length > 0) {
    rows.push(
      <tr key="sa-header" className={styles.sectionDivider}>
        <td colSpan={6}>📙 Phần III — Trả lời ngắn ({saDetails.length} câu)</td>
      </tr>
    )
    for (const d of saDetails) {
      rows.push(
        <tr key={`sa-${d.index}`} className={d.isCorrect ? styles.correctRow : styles.wrongRow}>
          <td>{d.index + 1}</td>
          <td><span className="badge badge-short" style={{ fontSize: 11 }}>SA</span></td>
          <td>{d.studentAnswer || '—'}</td>
          <td>{d.correctAnswer}</td>
          <td>{d.score}/{d.maxScore}</td>
          <td>{d.isCorrect ? '✅' : '❌'}</td>
        </tr>
      )
    }
  }

  return rows
}
