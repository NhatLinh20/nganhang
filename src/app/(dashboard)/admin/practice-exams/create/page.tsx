// src/app/(dashboard)/admin/practice-exams/create/page.tsx
// Wizard tạo đề thi luyện tập — 4 bước
'use client'

import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import styles from '../practiceExamAdmin.module.css'

interface QuestionConfig {
  order: number
  type: 'multiple_choice' | 'true_false' | 'short_answer' | 'essay'
  correct_answer?: string
  sub_answers?: string[]  // Cho TF: ["Đ","S","Đ","S"]
  score: number
}

const TYPE_LABELS: Record<string, string> = {
  multiple_choice: 'Trắc nghiệm',
  true_false: 'Đúng/Sai',
  short_answer: 'Trả lời ngắn',
  essay: 'Tự luận',
}

const EXAM_TYPES = [
  'Kiểm tra thường xuyên',
  'Giữa kì 1',
  'Giữa kì 2',
  'Cuối kì 1',
  'Cuối kì 2',
  'Thi thử',
]

export default function CreatePracticeExamPage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Wizard step
  const [currentStep, setCurrentStep] = useState(1)

  // Step 1: Thông tin
  const [title, setTitle] = useState('')
  const [grade, setGrade] = useState(12)
  const [examType, setExamType] = useState('Kiểm tra thường xuyên')
  const [durationMinutes, setDurationMinutes] = useState(45)

  // Step 2: Upload PDF
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  // Step 3: Cấu hình câu hỏi
  const [mcCount, setMcCount] = useState(12)
  const [mcScore, setMcScore] = useState(0.25)
  const [tfCount, setTfCount] = useState(4)
  const [tfScore, setTfScore] = useState(1)
  const [saCount, setSaCount] = useState(6)
  const [saScore, setSaScore] = useState(0.5)
  const [essayCount, setEssayCount] = useState(0)
  const [essayScore, setEssayScore] = useState(1)

  // Step 4: Đáp án
  const [questions, setQuestions] = useState<QuestionConfig[]>([])
  
  // Loading
  const [saving, setSaving] = useState(false)
  const [uploadingPdf, setUploadingPdf] = useState(false)

  // ─── Tính toán ──────────────────────────────────
  const totalQuestions = mcCount + tfCount + saCount + essayCount
  const totalScore = mcCount * mcScore + tfCount * tfScore + saCount * saScore + essayCount * essayScore

  // ─── Step 3 → Step 4: Tạo danh sách câu hỏi ───
  const generateQuestionList = () => {
    const list: QuestionConfig[] = []
    let order = 1

    // Trắc nghiệm
    for (let i = 0; i < mcCount; i++) {
      list.push({ order: order++, type: 'multiple_choice', correct_answer: '', score: mcScore })
    }
    // Đúng/Sai
    for (let i = 0; i < tfCount; i++) {
      list.push({ order: order++, type: 'true_false', sub_answers: ['', '', '', ''], score: tfScore })
    }
    // Trả lời ngắn
    for (let i = 0; i < saCount; i++) {
      list.push({ order: order++, type: 'short_answer', correct_answer: '', score: saScore })
    }
    // Tự luận
    for (let i = 0; i < essayCount; i++) {
      list.push({ order: order++, type: 'essay', correct_answer: '', score: essayScore })
    }

    setQuestions(list)
    setCurrentStep(4)
  }

  // ─── Đáp án handlers ───────────────────────────
  const updateMCAnswer = (idx: number, answer: string) => {
    setQuestions(prev => prev.map((q, i) => i === idx ? { ...q, correct_answer: answer } : q))
  }

  const updateTFSubAnswer = (idx: number, subIdx: number, value: string) => {
    setQuestions(prev => prev.map((q, i) => {
      if (i !== idx) return q
      const subs = [...(q.sub_answers || ['', '', '', ''])]
      subs[subIdx] = value
      return { ...q, sub_answers: subs }
    }))
  }

  const updateShortAnswer = (idx: number, answer: string) => {
    setQuestions(prev => prev.map((q, i) => i === idx ? { ...q, correct_answer: answer } : q))
  }

  // ─── Upload PDF ─────────────────────────────────
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file && file.type === 'application/pdf') {
      setPdfFile(file)
    }
  }, [])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file && file.type === 'application/pdf') {
      setPdfFile(file)
    }
  }

  // ─── Save & Publish ────────────────────────────
  const handleSave = async (publish: boolean) => {
    if (!title.trim()) { alert('Vui lòng nhập tên đề thi'); return }
    if (!pdfFile) { alert('Vui lòng upload file PDF'); return }

    // Validate đáp án
    for (const q of questions) {
      if (q.type === 'multiple_choice' && !q.correct_answer) {
        alert(`Câu ${q.order}: Chưa chọn đáp án trắc nghiệm`)
        return
      }
      if (q.type === 'true_false') {
        const subs = q.sub_answers || []
        if (subs.some(s => !s)) {
          alert(`Câu ${q.order}: Chưa chọn đầy đủ đáp án Đúng/Sai`)
          return
        }
      }
      if (q.type === 'short_answer' && !q.correct_answer?.trim()) {
        alert(`Câu ${q.order}: Chưa nhập đáp án trả lời ngắn`)
        return
      }
    }

    setSaving(true)
    try {
      // 1. Tạo record đề thi
      const res = await fetch('/api/practice-exams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          exam_type: examType,
          grade,
          duration_minutes: durationMinutes,
          total_questions: totalQuestions,
          total_score: totalScore,
          questions,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        alert('Lỗi tạo đề: ' + (data.error || 'Unknown'))
        return
      }

      const examId = data.data.id

      // 2. Upload PDF
      setUploadingPdf(true)
      const formData = new FormData()
      formData.append('pdf', pdfFile)
      
      const uploadRes = await fetch(`/api/practice-exams/${examId}/upload-pdf`, {
        method: 'POST',
        body: formData,
      })

      const uploadData = await uploadRes.json()
      if (!uploadRes.ok) {
        alert('Lỗi upload PDF: ' + (uploadData.error || 'Unknown'))
        return
      }

      // 3. Publish nếu cần
      if (publish) {
        await fetch(`/api/practice-exams/${examId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_published: true }),
        })
      }

      alert(publish ? '✅ Đã tạo và xuất bản đề thi!' : '✅ Đã lưu đề thi (bản nháp)')
      router.push('/admin/practice-exams')
    } catch (err) {
      alert('Lỗi: ' + (err instanceof Error ? err.message : 'Unknown'))
    } finally {
      setSaving(false)
      setUploadingPdf(false)
    }
  }

  // ─── Render Steps ──────────────────────────────
  const steps = [
    { num: 1, label: 'Thông tin' },
    { num: 2, label: 'Upload PDF' },
    { num: 3, label: 'Cấu hình câu & điểm' },
    { num: 4, label: 'Xác nhận' },
  ]

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Tạo đề thi luyện tập</h1>
          <p className={styles.pageSubtitle}>Tạo đề từ file PDF — cấu hình loại câu, điểm, đáp án</p>
        </div>
        <button className={styles.btnSecondary} onClick={() => router.push('/admin/practice-exams')}>
          ← Quay lại
        </button>
      </div>

      <div className={styles.wizard}>
        {/* Stepper */}
        <div className={styles.stepper}>
          {steps.map((s, i) => (
            <div key={s.num} style={{ display: 'flex', alignItems: 'center' }}>
              <div className={`${styles.step} ${currentStep === s.num ? styles.stepActive : ''} ${currentStep > s.num ? styles.stepDone : ''}`}>
                <span className={styles.stepNumber}>
                  {currentStep > s.num ? '✓' : s.num}
                </span>
                {s.label}
              </div>
              {i < steps.length - 1 && (
                <div className={`${styles.stepConnector} ${currentStep > s.num ? styles.stepConnectorDone : ''}`} />
              )}
            </div>
          ))}
        </div>

        {/* Step 1: Thông tin */}
        {currentStep === 1 && (
          <div className={styles.stepCard}>
            <h2 className={styles.stepTitle}>Bước 1 — Thông tin đề thi</h2>
            <p className={styles.stepDesc}>Nhập thông tin cơ bản cho đề thi luyện tập</p>
            
            <div className={styles.formGrid}>
              <div className={`${styles.formGroup} ${styles.formGroupFull}`}>
                <label className={styles.formLabel}>Tên đề thi *</label>
                <input
                  type="text"
                  className={styles.formInput}
                  placeholder="VD: KIỂM TRA GIỮA KÌ 1"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Lớp *</label>
                <select className={styles.formSelect} value={grade} onChange={e => setGrade(Number(e.target.value))}>
                  {[6,7,8,9,10,11,12].map(g => (
                    <option key={g} value={g}>Lớp {g}</option>
                  ))}
                </select>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Loại đề thi</label>
                <select className={styles.formSelect} value={examType} onChange={e => setExamType(e.target.value)}>
                  {EXAM_TYPES.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Thời gian (phút)</label>
                <input
                  type="number"
                  className={styles.formInput}
                  min={5}
                  max={180}
                  value={durationMinutes}
                  onChange={e => setDurationMinutes(parseInt(e.target.value) || 45)}
                />
              </div>
            </div>

            <div className={styles.btnRow}>
              <div />
              <button
                className={styles.btnPrimary}
                onClick={() => {
                  if (!title.trim()) { alert('Nhập tên đề thi'); return }
                  setCurrentStep(2)
                }}
              >
                Tiếp theo →
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Upload PDF */}
        {currentStep === 2 && (
          <div className={styles.stepCard}>
            <h2 className={styles.stepTitle}>Bước 2 — Upload file PDF</h2>
            <p className={styles.stepDesc}>Tải lên file đề thi dạng PDF</p>

            <div
              className={`${styles.uploadArea} ${isDragging ? styles.uploadAreaActive : ''}`}
              onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <div className={styles.uploadIcon}>📄</div>
              <div className={styles.uploadText}>
                {isDragging ? 'Thả file PDF ở đây...' : 'Kéo thả hoặc click để chọn file PDF'}
              </div>
              <div className={styles.uploadHint}>Tối đa 50MB • Chỉ chấp nhận file .pdf</div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              style={{ display: 'none' }}
              onChange={handleFileSelect}
            />

            {pdfFile && (
              <div className={styles.uploadedFile}>
                <span>📎</span>
                <span className={styles.uploadedFileName}>{pdfFile.name}</span>
                <span style={{ fontSize: '12px', color: '#6b7280' }}>
                  ({(pdfFile.size / 1024 / 1024).toFixed(2)} MB)
                </span>
                <button className={styles.removeFileBtn} onClick={() => setPdfFile(null)}>
                  ✕ Xóa
                </button>
              </div>
            )}

            <div className={styles.btnRow}>
              <button className={styles.btnSecondary} onClick={() => setCurrentStep(1)}>
                ← Quay lại
              </button>
              <button
                className={styles.btnPrimary}
                onClick={() => {
                  if (!pdfFile) { alert('Vui lòng chọn file PDF'); return }
                  setCurrentStep(3)
                }}
              >
                Tiếp theo →
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Cấu hình câu & điểm */}
        {currentStep === 3 && (
          <div className={styles.stepCard}>
            <h2 className={styles.stepTitle}>Bước 3 — Cấu hình số câu & điểm</h2>
            <p className={styles.stepDesc}>Thiết lập số lượng và điểm cho từng loại câu hỏi</p>

            <table className={styles.configTable}>
              <thead>
                <tr>
                  <th>Loại câu hỏi</th>
                  <th>Số lượng</th>
                  <th>Điểm mỗi câu</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <span className={`${styles.typeBadge} ${styles.typeBadgeMC}`}>Trắc nghiệm (MC)</span>
                    <span style={{ fontSize: '12px', color: '#9ca3af', marginLeft: '8px' }}>chọn A/B/C/D</span>
                  </td>
                  <td>
                    <input type="number" className={styles.configInput} min={0} max={50}
                      value={mcCount} onChange={e => setMcCount(parseInt(e.target.value) || 0)} />
                  </td>
                  <td>
                    <input type="number" className={styles.configInput} min={0} max={10} step={0.05}
                      value={mcScore} onChange={e => setMcScore(parseFloat(e.target.value) || 0)} />
                  </td>
                </tr>
                <tr>
                  <td>
                    <span className={`${styles.typeBadge} ${styles.typeBadgeTF}`}>Đúng/Sai (TF)</span>
                    <span style={{ fontSize: '12px', color: '#9ca3af', marginLeft: '8px' }}>mỗi bài 4 ý a,b,c,d</span>
                  </td>
                  <td>
                    <input type="number" className={styles.configInput} min={0} max={20}
                      value={tfCount} onChange={e => setTfCount(parseInt(e.target.value) || 0)} />
                  </td>
                  <td>
                    <input type="number" className={styles.configInput} min={0} max={10} step={0.05}
                      value={tfScore} onChange={e => setTfScore(parseFloat(e.target.value) || 0)} />
                  </td>
                </tr>
                <tr>
                  <td>
                    <span className={`${styles.typeBadge} ${styles.typeBadgeSA}`}>Trả lời ngắn</span>
                    <span style={{ fontSize: '12px', color: '#9ca3af', marginLeft: '8px' }}>1-4 ký tự</span>
                  </td>
                  <td>
                    <input type="number" className={styles.configInput} min={0} max={20}
                      value={saCount} onChange={e => setSaCount(parseInt(e.target.value) || 0)} />
                  </td>
                  <td>
                    <input type="number" className={styles.configInput} min={0} max={10} step={0.05}
                      value={saScore} onChange={e => setSaScore(parseFloat(e.target.value) || 0)} />
                  </td>
                </tr>
                <tr>
                  <td>
                    <span className={`${styles.typeBadge} ${styles.typeBadgeEssay}`}>Tự luận</span>
                    <span style={{ fontSize: '12px', color: '#9ca3af', marginLeft: '8px' }}>chấm sau</span>
                  </td>
                  <td>
                    <input type="number" className={styles.configInput} min={0} max={10}
                      value={essayCount} onChange={e => setEssayCount(parseInt(e.target.value) || 0)} />
                  </td>
                  <td>
                    <input type="number" className={styles.configInput} min={0} max={10} step={0.05}
                      value={essayScore} onChange={e => setEssayScore(parseFloat(e.target.value) || 0)} />
                  </td>
                </tr>
              </tbody>
            </table>

            <div className={styles.totalRow}>
              <span className={styles.totalLabel}>Tổng:</span>
              <span className={styles.totalValue}>{totalQuestions} câu</span>
              <span className={styles.totalValue}>{totalScore.toFixed(1)} điểm</span>
            </div>

            <div className={styles.btnRow}>
              <button className={styles.btnSecondary} onClick={() => setCurrentStep(2)}>
                ← Quay lại
              </button>
              <button
                className={styles.btnPrimary}
                disabled={totalQuestions === 0}
                onClick={generateQuestionList}
              >
                Tạo danh sách câu →
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Nhập đáp án */}
        {currentStep === 4 && (
          <div className={styles.stepCard}>
            <h2 className={styles.stepTitle}>Bước 4 — Nhập đáp án</h2>
            <p className={styles.stepDesc}>Chọn đáp án đúng cho từng câu hỏi ({questions.length} câu)</p>

            <div className={styles.answerList}>
              {questions.map((q, idx) => (
                <div key={idx} className={styles.answerRow}>
                  <div className={styles.answerOrder}>{q.order}</div>
                  <span className={`${styles.typeBadge} ${
                    q.type === 'multiple_choice' ? styles.typeBadgeMC :
                    q.type === 'true_false' ? styles.typeBadgeTF :
                    q.type === 'short_answer' ? styles.typeBadgeSA :
                    styles.typeBadgeEssay
                  }`}>
                    {TYPE_LABELS[q.type]}
                  </span>

                  {/* MC: Radio A/B/C/D */}
                  {q.type === 'multiple_choice' && (
                    <div className={styles.answerOptions}>
                      {['A', 'B', 'C', 'D'].map(opt => (
                        <div
                          key={opt}
                          className={`${styles.radioOption} ${q.correct_answer === opt ? styles.radioOptionSelected : ''}`}
                          onClick={() => updateMCAnswer(idx, opt)}
                        >
                          {opt}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* TF: 4 ý a,b,c,d */}
                  {q.type === 'true_false' && (
                    <div className={styles.tfSubGroup}>
                      {['a', 'b', 'c', 'd'].map((sub, subIdx) => (
                        <div key={sub} className={styles.tfSubRow}>
                          <span className={styles.tfSubLabel}>{sub})</span>
                          {['Đ', 'S'].map(val => (
                            <div
                              key={val}
                              className={`${styles.tfOption} ${(q.sub_answers?.[subIdx] || '') === val ? styles.tfOptionSelected : ''}`}
                              onClick={() => updateTFSubAnswer(idx, subIdx, val)}
                            >
                              {val}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Short Answer: Input */}
                  {q.type === 'short_answer' && (
                    <input
                      type="text"
                      className={styles.shortInput}
                      placeholder="VD: -3 hoặc 2,5"
                      maxLength={10}
                      value={q.correct_answer || ''}
                      onChange={e => updateShortAnswer(idx, e.target.value)}
                    />
                  )}

                  {/* Essay: Bỏ trống */}
                  {q.type === 'essay' && (
                    <span style={{ fontSize: '13px', color: '#9ca3af', fontStyle: 'italic' }}>
                      Chấm thủ công sau
                    </span>
                  )}

                  <span className={styles.answerScore}>{q.score} đ</span>
                </div>
              ))}
            </div>

            <div className={styles.btnRow}>
              <button className={styles.btnSecondary} onClick={() => setCurrentStep(3)}>
                ← Quay lại
              </button>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  className={styles.btnSecondary}
                  onClick={() => handleSave(false)}
                  disabled={saving}
                >
                  {saving ? '⏳ Đang lưu...' : '💾 Lưu bản nháp'}
                </button>
                <button
                  className={styles.btnSuccess}
                  onClick={() => handleSave(true)}
                  disabled={saving}
                >
                  {saving
                    ? uploadingPdf ? '⏳ Đang upload PDF...' : '⏳ Đang lưu...'
                    : '🚀 Lưu & Xuất bản'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
