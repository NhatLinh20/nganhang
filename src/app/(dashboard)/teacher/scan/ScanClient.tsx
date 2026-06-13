// src/app/(dashboard)/teacher/scan/ScanClient.tsx
// Client component chính cho trang quét phiếu trả lời trắc nghiệm
// Dùng Gemini Vision API để đọc phiếu — chính xác, không cần xử lý ảnh
'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import styles from './scan.module.css'
import type { OMRResult, QuestionResult } from '@/lib/omr/types'

// ═══════════════════════════════════
// TYPES
// ═══════════════════════════════════

interface ScanClientProps {
  userRole: string
  userId: string
}

type Step = 'config' | 'scan' | 'result'

interface GeminiRawResult {
  examCode: string | null
  studentId: string | null
  mc: (string | null)[]
  tf: (string | null)[]
  sa: (string | null)[]
  confidence: number
  warnings: string[]
  processingTimeMs: number
}

interface AnswerKey {
  mc: string[]
  tf: string[]
  sa: string[]
}

// ═══════════════════════════════════
// SCORING (giống omr-engine nhưng client-side để tính lại sau override)
// ═══════════════════════════════════

const TF_MAP: Record<number, number> = { 4: 1, 3: 0.5, 2: 0.25, 1: 0.1, 0: 0 }
const r2 = (n: number) => Math.round(n * 100) / 100
const normSA = (s: string) => s.trim().replace(/\s+/g, '').replace(/,/g, '.').replace(/^(-?)0+(\d)/, '$1$2')

function calculateScore(
  mc: (string | null)[],
  tf: (string | null)[],
  sa: (string | null)[],
  key: AnswerKey,
  mcPerQ: number,
  tfPerQ: number,
  saPerQ: number
) {
  let mcCorrect = 0, tfScore = 0, saCorrect = 0
  const details: QuestionResult[] = []

  for (let i = 0; i < key.mc.length; i++) {
    const ok = mc[i] !== null && mc[i]?.toUpperCase() === key.mc[i]?.toUpperCase()
    if (ok) mcCorrect++
    details.push({ index: i, type: 'mc', studentAnswer: mc[i], correctAnswer: key.mc[i], isCorrect: !!ok, score: ok ? mcPerQ : 0, maxScore: mcPerQ })
  }

  for (let i = 0; i < key.tf.length; i++) {
    const s = tf[i], c = key.tf[i]
    let correctSubs = 0
    if (s && s.length === 4 && c?.length === 4) {
      for (let j = 0; j < 4; j++) if (s[j] === c[j]) correctSubs++
    }
    const qScore = TF_MAP[correctSubs] ?? 0
    tfScore += qScore
    details.push({ index: i, type: 'tf', studentAnswer: s, correctAnswer: c, isCorrect: correctSubs === 4, score: qScore, maxScore: tfPerQ })
  }

  for (let i = 0; i < key.sa.length; i++) {
    const ok = sa[i] !== null && sa[i] !== undefined && normSA(sa[i]!) === normSA(key.sa[i])
    if (ok) saCorrect++
    details.push({ index: i, type: 'sa', studentAnswer: sa[i], correctAnswer: key.sa[i], isCorrect: !!ok, score: ok ? saPerQ : 0, maxScore: saPerQ })
  }

  const maxScore = key.mc.length * mcPerQ + key.tf.length * tfPerQ + key.sa.length * saPerQ
  const total = mcCorrect * mcPerQ + tfScore + saCorrect * saPerQ

  return {
    total: r2(total), maxScore: r2(maxScore),
    mcCorrect, mcTotal: key.mc.length,
    tfScore: r2(tfScore), tfMaxScore: r2(key.tf.length * tfPerQ),
    saCorrect, saTotal: key.sa.length,
    details,
  }
}

// ═══════════════════════════════════
// COMPONENT
// ═══════════════════════════════════

export default function ScanClient({ userRole, userId }: ScanClientProps) {
  // ── Step state ──
  const [currentStep, setCurrentStep] = useState<Step>('config')

  // ── Config state (Bước 1) ──
  const [mcCount, setMcCount] = useState(12)
  const [tfCount, setTfCount] = useState(4)
  const [saCount, setSaCount] = useState(6)
  const [mcAnswers, setMcAnswers] = useState<string[]>(Array(12).fill(''))
  const [tfAnswers, setTfAnswers] = useState<string[]>(Array(4).fill(''))
  const [saAnswers, setSaAnswers] = useState<string[]>(Array(6).fill(''))

  // ── Scan state (Bước 2) ──
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Result state (Bước 3) ──
  const [geminiRaw, setGeminiRaw] = useState<GeminiRawResult | null>(null)
  // Override state: giáo viên có thể sửa đáp án trước khi lưu
  const [overrideMc, setOverrideMc] = useState<(string | null)[]>([])
  const [overrideTf, setOverrideTf] = useState<(string | null)[]>([])
  const [overrideSa, setOverrideSa] = useState<(string | null)[]>([])
  const [overrideExamCode, setOverrideExamCode] = useState<string>('')
  const [overrideStudentId, setOverrideStudentId] = useState<string>('')

  // ── Saving state ──
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  // ── Computed: điểm sau khi áp override ──
  const answerKey: AnswerKey = {
    mc: mcAnswers.slice(0, mcCount),
    tf: tfAnswers.slice(0, tfCount),
    sa: saAnswers.slice(0, saCount),
  }

  // Tính điểm per câu
  const rawTotal = mcCount * 0.25 + tfCount * 1 + saCount * 0.5
  const scale = rawTotal > 0 ? 10 / rawTotal : 0
  const mcPerQ = r2(0.25 * scale)
  const tfPerQ = r2(1.0 * scale)
  const saPerQ = r2(0.5 * scale)

  const score = geminiRaw
    ? calculateScore(overrideMc, overrideTf, overrideSa, answerKey, mcPerQ, tfPerQ, saPerQ)
    : null

  // ═══════════════════════════════════
  // HANDLERS — Bước 1: Config
  // ═══════════════════════════════════

  const handleMcCountChange = (val: string) => {
    const n = Math.min(40, Math.max(0, parseInt(val) || 0))
    setMcCount(n)
    setMcAnswers(prev => n > prev.length ? [...prev, ...Array(n - prev.length).fill('')] : prev.slice(0, n))
  }
  const handleTfCountChange = (val: string) => {
    const n = Math.min(8, Math.max(0, parseInt(val) || 0))
    setTfCount(n)
    setTfAnswers(prev => n > prev.length ? [...prev, ...Array(n - prev.length).fill('')] : prev.slice(0, n))
  }
  const handleSaCountChange = (val: string) => {
    const n = Math.min(6, Math.max(0, parseInt(val) || 0))
    setSaCount(n)
    setSaAnswers(prev => n > prev.length ? [...prev, ...Array(n - prev.length).fill('')] : prev.slice(0, n))
  }

  const handleMcAnswerChange = (i: number, v: string) => {
    const u = v.toUpperCase()
    if (u && !['A', 'B', 'C', 'D'].includes(u)) return
    setMcAnswers(prev => { const next = [...prev]; next[i] = u; return next })
  }
  const handleTfAnswerChange = (i: number, v: string) => {
    const norm = v.toUpperCase().replace(/D/g, 'Đ').replace(/[^ĐS]/gi, '')
    if (norm.length > 4) return
    setTfAnswers(prev => { const next = [...prev]; next[i] = norm.slice(0, 4); return next })
  }
  const handleSaAnswerChange = (i: number, v: string) => {
    setSaAnswers(prev => { const next = [...prev]; next[i] = v; return next })
  }

  const isConfigValid = useCallback(() => {
    if (mcCount === 0 && tfCount === 0 && saCount === 0) return false
    if (mcCount > 0 && mcAnswers.slice(0, mcCount).some(a => !a)) return false
    if (tfCount > 0 && tfAnswers.slice(0, tfCount).some(a => a.length !== 4)) return false
    if (saCount > 0 && saAnswers.slice(0, saCount).some(a => !a.trim())) return false
    return true
  }, [mcCount, tfCount, saCount, mcAnswers, tfAnswers, saAnswers])

  // ═══════════════════════════════════
  // HANDLERS — Bước 2: Upload
  // ═══════════════════════════════════

  const handleFileSelect = (file: File) => {
    if (!file.type.startsWith('image/')) { alert('Vui lòng chọn file ảnh (JPG, PNG)'); return }
    setSelectedFile(file)
    setPreviewUrl(URL.createObjectURL(file))
    setGeminiRaw(null)
    setSaveMessage(null)
  }

  const handleScan = async () => {
    if (!selectedFile) return
    setIsProcessing(true)
    setSaveMessage(null)

    try {
      const form = new FormData()
      form.append('image', selectedFile)
      form.append('mcCount', String(mcCount))
      form.append('tfCount', String(tfCount))
      form.append('saCount', String(saCount))

      const res = await fetch('/api/scan-omr', { method: 'POST', body: form })
      const data = await res.json()

      if (!res.ok) throw new Error(data.error || 'Lỗi API')

      setGeminiRaw(data)
      // Khởi tạo override từ kết quả Gemini
      setOverrideMc([...data.mc])
      setOverrideTf([...data.tf])
      setOverrideSa([...data.sa])
      setOverrideExamCode(data.examCode || '')
      setOverrideStudentId(data.studentId || '')
      setCurrentStep('result')
    } catch (err) {
      alert('Lỗi khi quét phiếu: ' + (err instanceof Error ? err.message : 'Unknown'))
    } finally {
      setIsProcessing(false)
    }
  }

  // ═══════════════════════════════════
  // HANDLERS — Override đáp án
  // ═══════════════════════════════════

  const handleOverrideMc = (i: number, val: string) => {
    const u = val.toUpperCase()
    setOverrideMc(prev => { const next = [...prev]; next[i] = ['A','B','C','D'].includes(u) ? u : null; return next })
  }

  const handleOverrideTf = (i: number, subIdx: number, val: 'Đ' | 'S') => {
    setOverrideTf(prev => {
      const next = [...prev]
      const current = (next[i] || '????').split('')
      while (current.length < 4) current.push('?')
      current[subIdx] = val
      next[i] = current.join('').replace(/\?/g, '') // chỉ giữ Đ/S
      if (next[i].length < 4) next[i] = null as any
      return next
    })
  }

  const handleOverrideSa = (i: number, val: string) => {
    setOverrideSa(prev => { const next = [...prev]; next[i] = val || null; return next })
  }

  // ═══════════════════════════════════
  // SAVE
  // ═══════════════════════════════════

  const handleSaveResult = async () => {
    if (!score || !geminiRaw) return
    setIsSaving(true)
    setSaveMessage(null)
    try {
      const res = await fetch('/api/scan-results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          examCode: overrideExamCode || null,
          studentId: overrideStudentId || null,
          score: score.total,
          maxScore: score.maxScore,
          mcCorrect: score.mcCorrect,
          mcTotal: score.mcTotal,
          tfScore: score.tfScore,
          tfMaxScore: score.tfMaxScore,
          saCorrect: score.saCorrect,
          saTotal: score.saTotal,
          details: score.details,
          confidence: geminiRaw.confidence,
          warnings: geminiRaw.warnings,
          answers: { mc: overrideMc, tf: overrideTf, sa: overrideSa },
        }),
      })
      if (res.ok) setSaveMessage('✅ Đã lưu kết quả!')
      else { const d = await res.json(); setSaveMessage(`❌ ${d.error || 'Lỗi'}`) }
    } catch { setSaveMessage('❌ Lỗi kết nối') }
    finally { setIsSaving(false) }
  }

  const handleScanAnother = () => {
    setSelectedFile(null); setPreviewUrl(null); setGeminiRaw(null); setSaveMessage(null)
    setCurrentStep('scan')
  }
  const handleStartOver = () => {
    setSelectedFile(null); setPreviewUrl(null); setGeminiRaw(null); setSaveMessage(null)
    setCurrentStep('config')
  }

  useEffect(() => { return () => { if (previewUrl) URL.revokeObjectURL(previewUrl) } }, [previewUrl])

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
      {/* Header */}
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>📷 Quét phiếu chấm thi</h1>
        <p className={styles.pageSubtitle}>Quét phiếu trả lời trắc nghiệm và chấm điểm tự động bằng AI</p>
      </div>

      {/* Stepper */}
      <div className={styles.stepper}>
        {steps.map((step, idx) => (
          <div key={step.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {idx > 0 && <div className={`${styles.stepConnector} ${idx <= currentIdx ? styles.completed : ''}`} />}
            <div className={`${styles.step} ${step.key === currentStep ? styles.active : idx < currentIdx ? styles.completed : ''}`}>
              <span className={styles.stepNumber}>{idx < currentIdx ? '✓' : idx + 1}</span>
              <span>{step.icon} {step.label}</span>
            </div>
          </div>
        ))}
      </div>

      {/* ═══ STEP 1: NHẬP ĐÁP ÁN ═══ */}
      {currentStep === 'config' && (
        <>
          <div className={styles.configPanel}>
            <div className={styles.configCard}>
              <div className={styles.configCardTitle}>⚙️ Cấu hình đề thi</div>
              <div className={styles.countInputs}>
                <div className={styles.countGroup}>
                  <label>Trắc nghiệm (MC)</label>
                  <input type="number" min={0} max={40} value={mcCount} onChange={e => handleMcCountChange(e.target.value)} />
                </div>
                <div className={styles.countGroup}>
                  <label>Đúng/Sai (TF)</label>
                  <input type="number" min={0} max={8} value={tfCount} onChange={e => handleTfCountChange(e.target.value)} />
                </div>
                <div className={styles.countGroup}>
                  <label>Trả lời ngắn (SA)</label>
                  <input type="number" min={0} max={6} value={saCount} onChange={e => handleSaCountChange(e.target.value)} />
                </div>
              </div>
              <div style={{ marginTop: 12, padding: '10px 14px', background: '#f0f9ff', borderRadius: 8, fontSize: 13, color: '#1e40af', lineHeight: 1.6 }}>
                <strong>🤖 Công nghệ:</strong> Gemini Vision AI đọc phiếu — chính xác với ảnh chụp điện thoại thông thường. Không cần ảnh thẳng hoàn toàn.
              </div>
            </div>

            <div className={styles.configCard}>
              <div className={styles.configCardTitle}>✏️ Đáp án đúng</div>

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
                          type="text" maxLength={1} value={mcAnswers[i] || ''}
                          onChange={e => handleMcAnswerChange(i, e.target.value)}
                          data-mc-idx={i} placeholder="?"
                        />
                      </div>
                    ))}
                  </div>
                </>
              )}

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
                          type="text" maxLength={4} value={tfAnswers[i] || ''}
                          onChange={e => handleTfAnswerChange(i, e.target.value)} placeholder="ĐSĐS"
                        />
                      </div>
                    ))}
                  </div>
                </>
              )}

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
                          type="text" maxLength={10} value={saAnswers[i] || ''}
                          onChange={e => handleSaAnswerChange(i, e.target.value)} placeholder="0" style={{ width: 64 }}
                        />
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          <div className={styles.actionBar}>
            <div />
            <button className={`${styles.scanBtn} ${styles.scanBtnPrimary}`} disabled={!isConfigValid()} onClick={() => setCurrentStep('scan')}>
              Tiếp tục — Quét phiếu →
            </button>
          </div>
        </>
      )}

      {/* ═══ STEP 2: UPLOAD / CHỤP ẢNH ═══ */}
      {currentStep === 'scan' && (
        <div className={styles.uploadArea}>
          {!previewUrl && (
            <div
              className={`${styles.dropzone} ${dragOver ? styles.dragOver : ''}`}
              onClick={() => fileInputRef.current?.click()}
              onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFileSelect(f) }}
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
            >
              <div className={styles.dropzoneIcon}>📸</div>
              <div className={styles.dropzoneText}>Kéo thả ảnh phiếu trả lời vào đây</div>
              <div className={styles.dropzoneHint}>hoặc click để chọn file (JPG, PNG)</div>
              <div style={{ marginTop: 12, fontSize: 12, color: '#64748b', background: '#f1f5f9', borderRadius: 6, padding: '6px 12px' }}>
                📱 Chụp thẳng, đủ 4 góc phiếu trong khung hình
              </div>
              <input ref={fileInputRef} className={styles.fileInput} type="file" accept="image/*"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f) }} />
            </div>
          )}

          {previewUrl && (
            <div className={styles.imagePreview}>
              <img src={previewUrl} alt="Phiếu trả lời" />
              <div className={styles.imagePreviewActions}>
                <button className={`${styles.scanBtn} ${styles.scanBtnSecondary}`}
                  onClick={() => { setSelectedFile(null); setPreviewUrl(null) }}>
                  🔄 Chọn ảnh khác
                </button>
                <button className={`${styles.scanBtn} ${styles.scanBtnPrimary}`}
                  onClick={handleScan} disabled={isProcessing}>
                  {isProcessing ? '⏳ AI đang đọc phiếu...' : '🤖 Quét bằng AI'}
                </button>
              </div>
            </div>
          )}

          <div className={styles.actionBar}>
            <button className={`${styles.scanBtn} ${styles.scanBtnSecondary}`} onClick={() => setCurrentStep('config')}>
              ← Quay lại chỉnh đáp án
            </button>
            <div />
          </div>
        </div>
      )}

      {/* ═══ STEP 3: KẾT QUẢ + OVERRIDE ═══ */}
      {currentStep === 'result' && geminiRaw && score && (
        <>
          <div className={styles.resultPanel}>
            {/* Score Card (cột trái) */}
            <div className={styles.scoreCard}>
              <div className={styles.scoreHeader}>
                <div className={styles.scoreValue}>{score.total}</div>
                <div className={styles.scoreMax}>/ {score.maxScore} điểm</div>
              </div>

              {/* Mã đề + SBD có thể sửa */}
              <div className={styles.metaInfo}>
                <div className={styles.metaBadge}>
                  <div className={styles.metaBadgeLabel}>Mã đề</div>
                  <input
                    style={{ fontWeight: 700, fontSize: 16, textAlign: 'center', border: '1px solid #e2e8f0', borderRadius: 6, padding: '2px 8px', width: 70, background: '#f8fafc' }}
                    value={overrideExamCode}
                    onChange={e => setOverrideExamCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="—"
                    maxLength={4}
                  />
                </div>
                <div className={styles.metaBadge}>
                  <div className={styles.metaBadgeLabel}>Số báo danh</div>
                  <input
                    style={{ fontWeight: 700, fontSize: 14, textAlign: 'center', border: '1px solid #e2e8f0', borderRadius: 6, padding: '2px 8px', width: 90, background: '#f8fafc' }}
                    value={overrideStudentId}
                    onChange={e => setOverrideStudentId(e.target.value.replace(/\D/g, '').slice(0, 8))}
                    placeholder="—"
                    maxLength={8}
                  />
                </div>
              </div>

              <div className={styles.scoreDetails}>
                {score.mcTotal > 0 && (
                  <div className={styles.scoreRow}>
                    <span className={styles.scoreRowLabel}>Phần I (TN)</span>
                    <span className={`${styles.scoreRowValue} ${styles.correct}`}>{score.mcCorrect}/{score.mcTotal} câu đúng</span>
                  </div>
                )}
                {score.tfMaxScore > 0 && (
                  <div className={styles.scoreRow}>
                    <span className={styles.scoreRowLabel}>Phần II (ĐS)</span>
                    <span className={`${styles.scoreRowValue} ${styles.correct}`}>{score.tfScore}/{score.tfMaxScore} điểm</span>
                  </div>
                )}
                {score.saTotal > 0 && (
                  <div className={styles.scoreRow}>
                    <span className={styles.scoreRowLabel}>Phần III (SA)</span>
                    <span className={`${styles.scoreRowValue} ${styles.correct}`}>{score.saCorrect}/{score.saTotal} câu đúng</span>
                  </div>
                )}
                <div className={styles.scoreRow}>
                  <span className={styles.scoreRowLabel}>⏱ Thời gian</span>
                  <span className={styles.scoreRowValue}>{Math.round(geminiRaw.processingTimeMs)}ms</span>
                </div>
              </div>

              <div className={styles.confidenceMeter}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748b' }}>
                  <span>🤖 Độ tin cậy AI</span>
                  <span>{Math.round(geminiRaw.confidence * 100)}%</span>
                </div>
                <div className={styles.confidenceBar}>
                  <div className={`${styles.confidenceFill} ${geminiRaw.confidence >= 0.8 ? styles.high : geminiRaw.confidence >= 0.5 ? styles.medium : styles.low}`}
                    style={{ width: `${geminiRaw.confidence * 100}%` }} />
                </div>
              </div>

              {geminiRaw.warnings.length > 0 && (
                <div className={styles.warningsList}>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>⚠️ Cảnh báo AI ({geminiRaw.warnings.length})</div>
                  {geminiRaw.warnings.slice(0, 8).map((w, i) => <div key={i}>• {w}</div>)}
                  {geminiRaw.warnings.length > 8 && <div style={{ fontStyle: 'italic' }}>...và {geminiRaw.warnings.length - 8} cảnh báo khác</div>}
                </div>
              )}

              <div style={{ padding: '16px 24px' }}>
                <button className={`${styles.scanBtn} ${styles.scanBtnSuccess}`} style={{ width: '100%', justifyContent: 'center' }}
                  onClick={handleSaveResult} disabled={isSaving}>
                  {isSaving ? '⏳ Đang lưu...' : '💾 Lưu kết quả'}
                </button>
                {saveMessage && (
                  <div style={{ textAlign: 'center', marginTop: 8, fontSize: 13, fontWeight: 600, color: saveMessage.startsWith('✅') ? '#16a34a' : '#dc2626' }}>
                    {saveMessage}
                  </div>
                )}
              </div>
            </div>

            {/* Details + Override Card (cột phải) */}
            <div className={styles.detailsCard}>
              <div className={styles.detailsHeader}>
                <span className={styles.detailsTitle}>✏️ Kiểm tra & Sửa đáp án</span>
                <span style={{ fontSize: 12, color: '#64748b' }}>Click để sửa nếu AI đọc sai</span>
              </div>

              {/* Override MC */}
              {mcCount > 0 && (
                <div style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#1d4ed8', marginBottom: 8, textTransform: 'uppercase' }}>
                    📘 Phần I — Trắc nghiệm
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 4 }}>
                    {Array.from({ length: mcCount }, (_, i) => {
                      const studentAns = overrideMc[i]
                      const correctAns = answerKey.mc[i]
                      const isOk = studentAns === correctAns
                      return (
                        <div key={i} style={{
                          display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px',
                          borderRadius: 6, background: studentAns === null ? '#fef9c3' : isOk ? '#f0fdf4' : '#fef2f2',
                          border: `1px solid ${studentAns === null ? '#fde047' : isOk ? '#bbf7d0' : '#fecaca'}`
                        }}>
                          <span style={{ fontSize: 11, color: '#64748b', minWidth: 20 }}>{i + 1}.</span>
                          {(['A', 'B', 'C', 'D'] as const).map(opt => (
                            <button key={opt}
                              onClick={() => handleOverrideMc(i, studentAns === opt ? '' : opt)}
                              style={{
                                width: 26, height: 26, borderRadius: '50%', border: 'none', cursor: 'pointer',
                                fontSize: 11, fontWeight: 700,
                                background: studentAns === opt ? (isOk ? '#16a34a' : '#dc2626') : opt === correctAns ? '#dbeafe' : '#f1f5f9',
                                color: studentAns === opt ? '#fff' : opt === correctAns ? '#1d4ed8' : '#64748b',
                                outline: opt === correctAns ? '2px solid #93c5fd' : 'none',
                              }}>
                              {opt}
                            </button>
                          ))}
                          {!isOk && studentAns !== null && <span style={{ fontSize: 10, color: '#dc2626' }}>→{correctAns}</span>}
                          {studentAns === null && <span style={{ fontSize: 10, color: '#d97706' }}>?</span>}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Override TF */}
              {tfCount > 0 && (
                <div style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#7c3aed', marginBottom: 8, textTransform: 'uppercase' }}>
                    📗 Phần II — Đúng/Sai
                  </div>
                  {Array.from({ length: tfCount }, (_, i) => {
                    const studentTf = overrideTf[i] || ''
                    const correctTf = answerKey.tf[i] || ''
                    return (
                      <div key={i} style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 12, fontWeight: 600, minWidth: 50 }}>Câu {i + 1}:</span>
                        {(['a', 'b', 'c', 'd'] as const).map((sub, si) => {
                          const studentVal = studentTf[si]
                          const correctVal = correctTf[si]
                          return (
                            <div key={sub} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                              <span style={{ fontSize: 11, color: '#64748b' }}>{sub})</span>
                              {(['Đ', 'S'] as const).map(opt => (
                                <button key={opt}
                                  onClick={() => handleOverrideTf(i, si, opt)}
                                  style={{
                                    padding: '2px 7px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700,
                                    background: studentVal === opt ? (opt === correctVal ? '#16a34a' : '#dc2626') : opt === correctVal ? '#ddd6fe' : '#f1f5f9',
                                    color: studentVal === opt ? '#fff' : opt === correctVal ? '#7c3aed' : '#64748b',
                                  }}>
                                  {opt}
                                </button>
                              ))}
                            </div>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Override SA */}
              {saCount > 0 && (
                <div style={{ padding: '12px 16px' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#d97706', marginBottom: 8, textTransform: 'uppercase' }}>
                    📙 Phần III — Trả lời ngắn
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
                    {Array.from({ length: saCount }, (_, i) => {
                      const studentAns = overrideSa[i]
                      const correctAns = answerKey.sa[i]
                      const isOk = studentAns !== null && normSA(studentAns!) === normSA(correctAns)
                      return (
                        <div key={i} style={{
                          padding: '6px 10px', borderRadius: 6,
                          background: studentAns === null ? '#fef9c3' : isOk ? '#f0fdf4' : '#fef2f2',
                          border: `1px solid ${studentAns === null ? '#fde047' : isOk ? '#bbf7d0' : '#fecaca'}`
                        }}>
                          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Câu {i + 1} — đúng: <strong>{correctAns}</strong></div>
                          <input
                            value={studentAns || ''}
                            onChange={e => handleOverrideSa(i, e.target.value)}
                            placeholder="Nhập đáp án..."
                            style={{ width: '100%', fontSize: 14, fontWeight: 700, border: '1px solid #e2e8f0', borderRadius: 4, padding: '3px 6px', background: 'white' }}
                          />
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className={styles.actionBar}>
            <div className={styles.actionBarLeft}>
              <button className={`${styles.scanBtn} ${styles.scanBtnSecondary}`} onClick={handleStartOver}>⚙️ Đổi đáp án</button>
            </div>
            <div className={styles.actionBarRight}>
              <button className={`${styles.scanBtn} ${styles.scanBtnPrimary}`} onClick={handleScanAnother}>📷 Quét bài tiếp theo</button>
            </div>
          </div>
        </>
      )}

      {/* Processing overlay */}
      {isProcessing && (
        <div className={styles.processingOverlay}>
          <div className={styles.processingCard}>
            <div className={styles.processingSpinner} />
            <div className={styles.processingText}>🤖 Gemini AI đang đọc phiếu...</div>
            <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 8 }}>
              Nhận dạng bong bóng, mã đề, số báo danh
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
