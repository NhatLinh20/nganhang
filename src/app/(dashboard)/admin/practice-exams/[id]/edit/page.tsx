// src/app/(dashboard)/admin/practice-exams/[id]/edit/page.tsx
// Chỉnh sửa đề thi luyện tập — Admin
'use client'

import { useState, useEffect, useRef, use } from 'react'
import { useRouter } from 'next/navigation'
import styles from '../../practiceExamAdmin.module.css'

interface QuestionConfig {
  order: number
  type: 'multiple_choice' | 'true_false' | 'short_answer' | 'essay'
  correct_answer?: string
  sub_answers?: string[]
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

export default function EditPracticeExamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Form state
  const [title, setTitle] = useState('')
  const [grade, setGrade] = useState(12)
  const [examType, setExamType] = useState('Kiểm tra thường xuyên')
  const [durationMinutes, setDurationMinutes] = useState(45)
  const [totalScore, setTotalScore] = useState(10)
  const [isPublished, setIsPublished] = useState(false)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [pdfFilename, setPdfFilename] = useState<string | null>(null)
  const [questions, setQuestions] = useState<QuestionConfig[]>([])
  
  // Loading states
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingPdf, setUploadingPdf] = useState(false)

  // Fetch exam data
  useEffect(() => {
    async function fetchExam() {
      try {
        const res = await fetch(`/api/practice-exams/${id}`)
        const data = await res.json()
        if (data.data) {
          const exam = data.data
          setTitle(exam.title)
          setGrade(exam.grade)
          setExamType(exam.exam_type)
          setDurationMinutes(exam.duration_minutes)
          setTotalScore(exam.total_score)
          setIsPublished(exam.is_published)
          setPdfUrl(exam.pdf_url)
          setPdfFilename(exam.pdf_filename)
          setQuestions(exam.questions || [])
        }
      } catch (err) {
        console.error('Fetch exam error:', err)
        alert('Không thể tải đề thi')
      } finally {
        setLoading(false)
      }
    }
    fetchExam()
  }, [id])

  // Handlers
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

  const handleUploadNewPdf = async (file: File) => {
    if (!file.type.includes('pdf')) { alert('Chỉ chấp nhận file PDF'); return }
    setUploadingPdf(true)
    try {
      const formData = new FormData()
      formData.append('pdf', file)
      const res = await fetch(`/api/practice-exams/${id}/upload-pdf`, {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (res.ok) {
        setPdfUrl(data.pdf_url)
        setPdfFilename(file.name)
      } else {
        alert('Lỗi upload: ' + (data.error || 'Unknown'))
      }
    } catch (err) {
      alert('Lỗi: ' + (err instanceof Error ? err.message : 'Unknown'))
    } finally {
      setUploadingPdf(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/practice-exams/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          exam_type: examType,
          grade,
          duration_minutes: durationMinutes,
          total_questions: questions.length,
          total_score: totalScore,
          questions,
          is_published: isPublished,
        }),
      })
      
      if (res.ok) {
        alert('✅ Đã lưu thay đổi!')
        router.push('/admin/practice-exams')
      } else {
        const data = await res.json()
        alert('Lỗi: ' + (data.error || 'Unknown'))
      }
    } catch (err) {
      alert('Lỗi: ' + (err instanceof Error ? err.message : 'Unknown'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.loading}>
          <span className={styles.spinner} /> Đang tải đề thi...
        </div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>✏️ Chỉnh sửa đề thi</h1>
          <p className={styles.pageSubtitle}>{title}</p>
        </div>
        <button className={styles.btnSecondary} onClick={() => router.push('/admin/practice-exams')}>
          ← Quay lại
        </button>
      </div>

      <div className={styles.wizard}>
        {/* Thông tin cơ bản */}
        <div className={styles.stepCard} style={{ marginBottom: '24px' }}>
          <h2 className={styles.stepTitle}>Thông tin đề thi</h2>
          <div className={styles.formGrid}>
            <div className={`${styles.formGroup} ${styles.formGroupFull}`}>
              <label className={styles.formLabel}>Tên đề thi</label>
              <input type="text" className={styles.formInput} value={title} onChange={e => setTitle(e.target.value)} />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Lớp</label>
              <select className={styles.formSelect} value={grade} onChange={e => setGrade(Number(e.target.value))}>
                {[6,7,8,9,10,11,12].map(g => <option key={g} value={g}>Lớp {g}</option>)}
              </select>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Loại đề</label>
              <select className={styles.formSelect} value={examType} onChange={e => setExamType(e.target.value)}>
                {EXAM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Thời gian (phút)</label>
              <input type="number" className={styles.formInput} value={durationMinutes} onChange={e => setDurationMinutes(parseInt(e.target.value) || 45)} />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Tổng điểm</label>
              <input type="number" className={styles.formInput} step={0.5} value={totalScore} onChange={e => setTotalScore(parseFloat(e.target.value) || 10)} />
            </div>
          </div>
        </div>

        {/* PDF */}
        <div className={styles.stepCard} style={{ marginBottom: '24px' }}>
          <h2 className={styles.stepTitle}>File PDF</h2>
          {pdfUrl && (
            <div className={styles.uploadedFile}>
              <span>📎</span>
              <span className={styles.uploadedFileName}>{pdfFilename || 'PDF đã upload'}</span>
              <button className={styles.btnSecondary} style={{ padding: '4px 12px', fontSize: '12px' }} onClick={() => window.open(pdfUrl, '_blank')}>
                Xem PDF
              </button>
            </div>
          )}
          <div style={{ marginTop: '12px' }}>
            <input ref={fileInputRef} type="file" accept=".pdf" style={{ display: 'none' }} onChange={e => {
              const file = e.target.files?.[0]
              if (file) handleUploadNewPdf(file)
            }} />
            <button className={styles.btnSecondary} onClick={() => fileInputRef.current?.click()} disabled={uploadingPdf}>
              {uploadingPdf ? '⏳ Đang upload...' : '📤 Thay đổi PDF'}
            </button>
          </div>
        </div>

        {/* Đáp án */}
        <div className={styles.stepCard}>
          <h2 className={styles.stepTitle}>Đáp án ({questions.length} câu)</h2>

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

                {q.type === 'short_answer' && (
                  <input
                    type="text"
                    className={styles.shortInput}
                    placeholder="VD: -3"
                    maxLength={10}
                    value={q.correct_answer || ''}
                    onChange={e => updateShortAnswer(idx, e.target.value)}
                  />
                )}

                {q.type === 'essay' && (
                  <span style={{ fontSize: '13px', color: '#9ca3af', fontStyle: 'italic' }}>Chấm thủ công</span>
                )}

                <span className={styles.answerScore}>{q.score} đ</span>
              </div>
            ))}
          </div>

          <div className={styles.btnRow}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', cursor: 'pointer' }}>
              <input type="checkbox" checked={isPublished} onChange={e => setIsPublished(e.target.checked)} />
              Xuất bản (hiển thị cho học sinh)
            </label>
            <button className={styles.btnSuccess} onClick={handleSave} disabled={saving}>
              {saving ? '⏳ Đang lưu...' : '💾 Lưu thay đổi'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
