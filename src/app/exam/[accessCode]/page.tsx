// src/app/exam/[accessCode]/page.tsx
// Trang làm bài thi online — Public (không cần đăng nhập)
'use client'

import { useState, useEffect, useRef, useCallback, use } from 'react'
import { RenderedLatex } from '@/components/RenderedLatex'
import styles from './exam-take.module.css'
import type { ContentSegment } from '@/lib/latex-parser/slideshow-parser'
import 'katex/dist/katex.min.css'

// ═══════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════

interface ExamQuestion {
  id: string
  questionType: 'multiple_choice' | 'true_false' | 'short_answer' | 'essay'
  bodySegments: ContentSegment[]
  choices?: Array<{ label: string; content: string; segments?: ContentSegment[] }>
  tfStatements?: Array<{ label: string; content: string; segments?: ContentSegment[] }>
}

interface ExamData {
  id: string
  title: string
  description?: string
  grade?: number
  duration_minutes?: number
  total_questions: number
  scoring_config: Record<string, number>
  questions_data: ExamQuestion[]
  image_map: Record<string, string>
  variant_index?: number
  variant_label?: string | null
  variant_count?: number
}

interface DetailResult {
  index: number
  type: string
  student_answer: unknown
  correct_answer: unknown
  is_correct: boolean
  score_earned: number
  max_score: number
  tf_correct_count?: number
  tf_total?: number
}

const TYPE_LABELS: Record<string, string> = {
  multiple_choice: 'Trắc nghiệm',
  true_false: 'Đúng/Sai',
  short_answer: 'Trả lời ngắn',
  essay: 'Tự luận',
}

// ═══════════════════════════════════════════════════
// SEGMENT RENDERER (tái sử dụng từ Trình chiếu)
// ═══════════════════════════════════════════════════

function RenderedSegments({ segments, questionId, part, imageMap }: {
  segments: ContentSegment[]
  questionId: string
  part: string
  imageMap: Record<string, string>
}) {
  return (
    <>
      {segments.map((seg, idx) => {
        const imgKey = `${questionId}:${part}:${idx}`
        if (seg.type === 'image') {
          const svg = imageMap[imgKey]
          if (svg) {
            if (svg.startsWith('data:')) {
              return <img key={imgKey} src={svg} alt="Hình" style={{ maxWidth: '100%', height: 'auto' }} />
            }
            return (
              <div key={imgKey} style={{ display: 'flex', justifyContent: 'center' }}
                dangerouslySetInnerHTML={{ __html: svg }} />
            )
          }
          return <div key={imgKey} style={{ color: '#94a3b8', fontStyle: 'italic', padding: '8px' }}>🖼️ Hình ảnh</div>
        }
        return <RenderedLatex key={imgKey} content={seg.content} />
      })}
    </>
  )
}

// ═══════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════

export default function ExamTakePage({ params }: { params: Promise<{ accessCode: string }> }) {
  const { accessCode } = use(params)

  // ─── Phases ───
  const [phase, setPhase] = useState<'loading' | 'entry' | 'exam' | 'submitting' | 'result' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = useState('')

  // ─── Exam Data ───
  const [exam, setExam] = useState<ExamData | null>(null)

  // ─── Student Info ───
  const [studentName, setStudentName] = useState('')
  const [studentCode, setStudentCode] = useState('')

  // ─── Answers ───
  const [answers, setAnswers] = useState<Record<string, string | Record<string, string>>>({})

  // ─── Timer ───
  const [timeLeft, setTimeLeft] = useState(0) // seconds
  const [startedAt, setStartedAt] = useState<string>('')
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  // ─── Variant ───
  const [variantIndex, setVariantIndex] = useState(0)

  // ─── UI ───
  const [activeQ, setActiveQ] = useState(0)
  const questionRefs = useRef<Record<number, HTMLDivElement | null>>({})

  // ─── Result ───
  const [resultData, setResultData] = useState<{ score: number; total_score: number; detail_results: DetailResult[] } | null>(null)

  // ═══════════════════════════════════════════════════
  // LOAD EXAM
  // ═══════════════════════════════════════════════════
  useEffect(() => {
    const loadExam = async () => {
      try {
        const res = await fetch(`/api/online-exams/by-code/${accessCode}`)
        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error || 'Không tìm thấy đề thi')
        }
        const data = await res.json()
        setExam(data)
        setVariantIndex(data.variant_index ?? 0)
        setPhase('entry')
      } catch (err: any) {
        setErrorMsg(err.message)
        setPhase('error')
      }
    }
    loadExam()
  }, [accessCode])

  // ═══════════════════════════════════════════════════
  // TIMER
  // ═══════════════════════════════════════════════════
  useEffect(() => {
    if (phase !== 'exam' || !exam?.duration_minutes) return

    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          // Hết giờ → tự động nộp bài
          clearInterval(timerRef.current!)
          handleSubmit()
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [phase, exam])

  // ═══════════════════════════════════════════════════
  // START EXAM
  // ═══════════════════════════════════════════════════
  const handleStart = () => {
    if (!studentName.trim() || !studentCode.trim()) return
    setStartedAt(new Date().toISOString())
    if (exam?.duration_minutes) {
      setTimeLeft(exam.duration_minutes * 60)
    }
    setPhase('exam')
  }

  // ═══════════════════════════════════════════════════
  // ANSWER HANDLERS
  // ═══════════════════════════════════════════════════
  const setMCAnswer = (qIdx: number, choice: string) => {
    setAnswers(prev => ({ ...prev, [String(qIdx)]: choice }))
  }

  const setTFAnswer = (qIdx: number, stmtLabel: string, value: string) => {
    setAnswers(prev => {
      const current = (prev[String(qIdx)] as Record<string, string>) || {}
      return { ...prev, [String(qIdx)]: { ...current, [stmtLabel]: value } }
    })
  }

  const setSAAnswer = (qIdx: number, value: string) => {
    setAnswers(prev => ({ ...prev, [String(qIdx)]: value }))
  }

  const setEssayAnswer = (qIdx: number, value: string) => {
    setAnswers(prev => ({ ...prev, [String(qIdx)]: value }))
  }

  // ═══════════════════════════════════════════════════
  // SUBMIT
  // ═══════════════════════════════════════════════════
  const handleSubmit = useCallback(async () => {
    if (!exam) return
    if (phase === 'submitting') return
    setPhase('submitting')

    try {
      const timeSpent = exam.duration_minutes
        ? (exam.duration_minutes * 60) - timeLeft
        : Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)

      const res = await fetch(`/api/online-exams/${exam.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_name: studentName.trim(),
          student_code: studentCode.trim(),
          answers,
          started_at: startedAt,
          time_spent_seconds: timeSpent,
          variant_index: variantIndex,
        })
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Lỗi nộp bài')
      }

      const data = await res.json()
      setResultData(data)
      setPhase('result')

      if (timerRef.current) clearInterval(timerRef.current)
    } catch (err: any) {
      alert('Lỗi nộp bài: ' + err.message)
      setPhase('exam')
    }
  }, [exam, answers, studentName, studentCode, startedAt, timeLeft, phase])

  // ═══════════════════════════════════════════════════
  // SCROLL TO QUESTION
  // ═══════════════════════════════════════════════════
  const scrollToQ = (idx: number) => {
    setActiveQ(idx)
    questionRefs.current[idx]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // ═══════════════════════════════════════════════════
  // FORMAT TIME
  // ═══════════════════════════════════════════════════
  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  // ═══════════════════════════════════════════════════
  // RENDER: LOADING
  // ═══════════════════════════════════════════════════
  if (phase === 'loading') {
    return <div className={styles.loadingScreen}>⏳ Đang tải đề thi...</div>
  }

  if (phase === 'error') {
    return <div className={styles.errorScreen}>❌ {errorMsg}</div>
  }

  if (!exam) return null

  // ═══════════════════════════════════════════════════
  // RENDER: ENTRY (Nhập thông tin)
  // ═══════════════════════════════════════════════════
  if (phase === 'entry') {
    return (
      <div className={styles.entryScreen}>
        <div className={styles.entryCard}>
          <h1 className={styles.entryTitle}>📝 Thi Online</h1>
          <p className={styles.entryExamName}>{exam.title}</p>
          {exam.variant_label && (
            <div style={{ textAlign: 'center', marginBottom: '0.5rem' }}>
              <span style={{ background: '#8b5cf6', color: '#fff', padding: '4px 12px', borderRadius: '12px', fontSize: '0.85rem', fontWeight: 600 }}>
                {exam.variant_label}
              </span>
            </div>
          )}
          <div className={styles.entryMeta}>
            {exam.total_questions} câu hỏi
            {exam.duration_minutes ? ` • ${exam.duration_minutes} phút` : ' • Không giới hạn thời gian'}
            {exam.grade ? ` • Lớp ${exam.grade}` : ''}
          </div>
          {exam.description && <p style={{ color: '#64748b', fontSize: '0.85rem', textAlign: 'center', marginBottom: '1.2rem' }}>{exam.description}</p>}

          <div className={styles.entryField}>
            <label>Họ và tên *</label>
            <input value={studentName} onChange={e => setStudentName(e.target.value)} placeholder="Nguyễn Văn A" autoFocus />
          </div>
          <div className={styles.entryField}>
            <label>Số báo danh *</label>
            <input value={studentCode} onChange={e => setStudentCode(e.target.value)} placeholder="001" />
          </div>

          <button className={styles.entryBtn} onClick={handleStart} disabled={!studentName.trim() || !studentCode.trim()}>
            🚀 Bắt đầu làm bài
          </button>
        </div>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════
  // RENDER: RESULT
  // ═══════════════════════════════════════════════════
  if (phase === 'result' && resultData) {
    const totalQuestions = resultData.detail_results.length
    const correctNormal = resultData.detail_results.filter(r => (r.type === 'multiple_choice' || r.type === 'short_answer') && r.is_correct).length
    const correctTF = resultData.detail_results.filter(r => r.type === 'true_false').reduce((acc, r) => acc + (r.tf_correct_count || 0), 0)

    const formatChoice = (ans: any, type: string) => {
      if (!ans) return '—'
      if (type === 'true_false' && typeof ans === 'object') {
        const labels = ['a', 'b', 'c', 'd']
        return labels.map(l => ans[l] || '—').join(', ')
      }
      return ans
    }
    
    const formatTFCorrect = (ans: any) => {
      if (!ans) return '—'
      const labels = ['a', 'b', 'c', 'd']
      // For correct_answer of True/False, it's a string like "ĐSĐS"
      if (typeof ans === 'string') {
        return ans.split('').join(', ')
      }
      return ans
    }

    return (
      <div className={styles.resultScreen}>
        <div className={styles.resultCard}>
          <div className={styles.resultHeader}>
            <div className={styles.scoreBigText}>{resultData.score}/{resultData.total_score}</div>
            <div className={styles.scoreSubText}>điểm</div>

            <div className={styles.statsRow}>
              <div className={styles.statItem}>
                <span className={styles.statNum}>{correctNormal}</span>
                <span className={styles.statLabel}>Câu đúng (TN+Ngắn)</span>
              </div>
              <div className={styles.statItem}>
                <span className={styles.statNum}>{correctTF}</span>
                <span className={styles.statLabel}>Ý Đ/S đúng</span>
              </div>
              <div className={styles.statItem}>
                <span className={styles.statNum}>{totalQuestions}</span>
                <span className={styles.statLabel}>Tổng câu</span>
              </div>
            </div>
          </div>

          <div className={styles.resultDetails}>
            {resultData.detail_results.map((r, i) => {
              const isEssay = r.type === 'essay'
              let userStr = formatChoice(r.student_answer, r.type)
              let correctStr = r.type === 'true_false' ? formatTFCorrect(r.correct_answer) : formatChoice(r.correct_answer, r.type)
              
              if (r.type === 'short_answer') {
                userStr = `Trả lời: ${userStr || '—'}`
                correctStr = `Đáp án: ${correctStr}`
              } else {
                userStr = `Chọn: ${userStr || '—'}`
                correctStr = `Đáp án: ${correctStr}`
              }

              if (r.type === 'true_false' && r.tf_total) {
                correctStr += ` (${r.tf_correct_count || 0}/${r.tf_total} đúng)`
              }

              const badgeClass = isEssay ? styles.badgePending : (r.score_earned > 0 ? styles.badgeCorrect : styles.badgeWrong)

              return (
                <div key={i} className={styles.resultRow}>
                  <div className={`${styles.resultBadge} ${badgeClass}`}>{i + 1}</div>
                  <div className={styles.resultContent}>
                    {isEssay ? (
                      <span style={{ color: '#d97706' }}>Câu tự luận chờ chấm điểm</span>
                    ) : (
                      <>{userStr} | {correctStr}</>
                    )}
                  </div>
                  <div className={`${styles.resultScore} ${r.score_earned > 0 ? styles.scoreCorrect : (isEssay ? '' : styles.scoreWrong)}`}>
                    {isEssay ? '0đ' : `${r.score_earned > 0 ? '+' : ''}${r.score_earned}đ`}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════
  // RENDER: EXAM (Làm bài)
  // ═══════════════════════════════════════════════════
  const config = exam.scoring_config
  const isSubmitting = phase === 'submitting'

  return (
    <div className={styles.examScreen}>
      {/* Top Bar */}
      <div className={styles.examTopBar}>
        <span className={styles.examTitle}>
          {exam.title}
          {exam.variant_label && (
            <span style={{ marginLeft: '8px', background: '#8b5cf6', color: '#fff', padding: '2px 10px', borderRadius: '10px', fontSize: '0.75rem', fontWeight: 600, verticalAlign: 'middle' }}>
              {exam.variant_label}
            </span>
          )}
        </span>

        {exam.duration_minutes ? (
          <div className={`${styles.timerBadge} ${timeLeft < 300 ? styles.timerWarning : ''}`}>
            ⏱️ {formatTime(timeLeft)}
          </div>
        ) : (
          <div className={styles.timerBadge}>⏱️ Không giới hạn</div>
        )}

        <button
          className={styles.submitBtn}
          onClick={() => {
            if (confirm('Bạn có chắc chắn muốn nộp bài?')) handleSubmit()
          }}
          disabled={isSubmitting}
        >
          {isSubmitting ? '⏳ Đang nộp...' : '📤 Nộp bài'}
        </button>
      </div>

      {/* Body: Questions */}
      <div className={styles.examBody}>
        <div className={styles.questionArea}>
          {exam.questions_data.map((q, idx) => {
            const qType = q.questionType
            let scorePerQ = 0
            if (qType === 'multiple_choice') scorePerQ = config.mc_score_each || 0
            else if (qType === 'true_false') scorePerQ = config.tf_score_each || 0
            else if (qType === 'short_answer') scorePerQ = config.sa_score_each || 0
            else if (qType === 'essay') scorePerQ = config.essay_score_each || 0

            return (
              <div key={q.id} ref={el => { questionRefs.current[idx] = el }} className={styles.questionCard}>
                <div className={styles.questionHeader}>
                  <span className={styles.questionNum}>Câu {idx + 1}</span>
                  <span className={styles.questionTypeBadge}>{TYPE_LABELS[qType]}</span>
                  <span className={styles.questionScore}>{scorePerQ} đ</span>
                </div>

                <div className={styles.questionBody}>
                  <RenderedSegments segments={q.bodySegments} questionId={q.id} part="body" imageMap={exam.image_map} />
                </div>

                {/* MC */}
                {qType === 'multiple_choice' && q.choices && (
                  <div className={styles.mcChoices}>
                    {q.choices.map(c => (
                      <div
                        key={c.label}
                        className={`${styles.mcChoice} ${answers[String(idx)] === c.label ? styles.mcChoiceSelected : ''}`}
                        onClick={() => setMCAnswer(idx, c.label)}
                      >
                        <div className={styles.mcLabel}>{c.label}</div>
                        <div className={styles.mcText}>
                          <RenderedSegments segments={c.segments || [{ type: 'text', content: c.content }]} questionId={q.id} part={`choice-${c.label}`} imageMap={exam.image_map} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* TF */}
                {qType === 'true_false' && q.tfStatements && (
                  <div className={styles.tfStatements}>
                    {q.tfStatements.map(s => {
                      const currentTF = (answers[String(idx)] as Record<string, string>) || {}
                      return (
                        <div key={s.label} className={styles.tfStatement}>
                          <span className={styles.tfStmtLabel}>{s.label})</span>
                          <div className={styles.tfStmtContent}>
                            <RenderedSegments segments={s.segments || [{ type: 'text', content: s.content }]} questionId={q.id} part={`tf-${s.label}`} imageMap={exam.image_map} />
                          </div>
                          <div className={styles.tfBtns}>
                            <button className={`${styles.tfBtn} ${currentTF[s.label] === 'Đ' ? styles.tfBtnSelected : ''}`} onClick={() => setTFAnswer(idx, s.label, 'Đ')}>Đ</button>
                            <button className={`${styles.tfBtn} ${currentTF[s.label] === 'S' ? styles.tfBtnSelected : ''}`} onClick={() => setTFAnswer(idx, s.label, 'S')}>S</button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Short Answer */}
                {qType === 'short_answer' && (
                  <input
                    className={styles.saInput}
                    type="text"
                    placeholder="Nhập đáp số..."
                    value={(answers[String(idx)] as string) || ''}
                    onChange={e => setSAAnswer(idx, e.target.value)}
                  />
                )}

                {/* Essay */}
                {qType === 'essay' && (
                  <textarea
                    className={styles.essayTextarea}
                    placeholder="Nhập bài giải..."
                    value={(answers[String(idx)] as string) || ''}
                    onChange={e => setEssayAnswer(idx, e.target.value)}
                  />
                )}
              </div>
            )
          })}
        </div>

        {/* Right Nav (PC) / Bottom Nav (Mobile) */}
        <div className={styles.questionNav}>
          <h3 className={styles.navTitle}>Danh sách câu hỏi</h3>
          <div className={styles.navGrid}>
            {exam.questions_data.map((_, idx) => {
              const hasAns = answers[String(idx)] !== undefined && answers[String(idx)] !== ''
              return (
                <button
                  key={idx}
                  className={`${styles.navDot} ${hasAns ? styles.navDotAnswered : ''} ${activeQ === idx ? styles.navDotActive : ''}`}
                  onClick={() => scrollToQ(idx)}
                >
                  {idx + 1}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
