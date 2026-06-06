// src/app/(dashboard)/student/practice/[examId]/page.tsx
// Trang làm bài thi — Split view: PDF (70%) + Đáp án (30%)
// Responsive: Desktop split | Mobile tab + bottom nav
'use client'

import { useState, useEffect, useRef, useCallback, use } from 'react'
import { useRouter } from 'next/navigation'
import styles from '../practice.module.css'

interface QuestionConfig {
  order: number
  type: 'multiple_choice' | 'true_false' | 'short_answer' | 'essay'
  score: number
}

interface ExamData {
  id: string
  title: string
  exam_type: string
  grade: number
  duration_minutes: number
  total_questions: number
  total_score: number
  pdf_url: string
  questions: QuestionConfig[]
}

interface SubmitResult {
  order: number
  type: string
  student_answer: unknown
  correct_answer: unknown
  is_correct: boolean
  score_earned: number
  max_score: number
}

interface SubmitResponse {
  score: number
  total_score: number
  total_correct: number
  total_tf_correct: number
  total_questions: number
  results: SubmitResult[]
}

type MobileTab = 'pdf' | 'answers'
type BottomNavTab = 'exam' | 'questions' | 'flagged' | 'submit'

const TYPE_SHORT: Record<string, string> = {
  multiple_choice: 'TRẮC NGHIỆM',
  true_false: 'ĐÚNG/SAI',
  short_answer: 'TRẢ LỜI NGẮN',
  essay: 'TỰ LUẬN',
}

export default function ExamViewPage({ params }: { params: Promise<{ examId: string }> }) {
  const { examId } = use(params)
  const router = useRouter()

  // Exam data
  const [exam, setExam] = useState<ExamData | null>(null)
  const [loading, setLoading] = useState(true)

  // Student answers: { "1": "A", "2": {"a":"Đ","b":"S",...}, "15": "-3" }
  const [answers, setAnswers] = useState<Record<string, string | Record<string, string>>>({})
  
  // Flagged questions
  const [flagged, setFlagged] = useState<Set<number>>(new Set())

  // Timer
  const [timeLeft, setTimeLeft] = useState(0) // seconds
  const [startedAt] = useState(Date.now())
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  // UI state
  const [activeQuestion, setActiveQuestion] = useState(1)
  const [mobileTab, setMobileTab] = useState<MobileTab>('pdf')
  const [bottomNav, setBottomNav] = useState<BottomNavTab>('exam')
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitResult, setSubmitResult] = useState<SubmitResponse | null>(null)
  const [showResult, setShowResult] = useState(false)

  const questionRefs = useRef<Record<number, HTMLDivElement | null>>({})

  // Fetch exam
  useEffect(() => {
    async function fetchExam() {
      try {
        const res = await fetch(`/api/practice-exams/${examId}`)
        const data = await res.json()
        if (data.data) {
          setExam(data.data)
          setTimeLeft(data.data.duration_minutes * 60)
        } else {
          alert('Không tìm thấy đề thi')
          router.push('/student/practice')
        }
      } catch (err) {
        console.error('Fetch exam error:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchExam()
  }, [examId, router])

  // Timer countdown
  useEffect(() => {
    if (!exam || submitted) return

    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          // Auto submit when time runs out
          clearInterval(timerRef.current!)
          handleSubmit(true)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exam, submitted])

  // Format time mm:ss
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  // Timer color
  const getTimerClass = () => {
    if (timeLeft <= 60) return styles.timerDanger
    if (timeLeft <= 300) return styles.timerWarning
    return styles.timerNormal
  }

  // Answer handlers
  const setMCAnswer = (order: number, answer: string) => {
    if (submitted) return
    setAnswers(prev => ({ ...prev, [String(order)]: answer }))
  }

  const setTFAnswer = (order: number, sub: string, value: string) => {
    if (submitted) return
    setAnswers(prev => {
      const current = (prev[String(order)] as Record<string, string>) || {}
      return { ...prev, [String(order)]: { ...current, [sub]: value } }
    })
  }

  const setSAAnswer = (order: number, value: string) => {
    if (submitted) return
    setAnswers(prev => ({ ...prev, [String(order)]: value }))
  }

  const toggleFlag = (order: number) => {
    setFlagged(prev => {
      const next = new Set(prev)
      if (next.has(order)) next.delete(order)
      else next.add(order)
      return next
    })
  }

  // Check if question is answered
  const isAnswered = (q: QuestionConfig) => {
    const ans = answers[String(q.order)]
    if (!ans) return false
    if (q.type === 'multiple_choice') return typeof ans === 'string' && ans !== ''
    if (q.type === 'true_false') {
      const obj = ans as Record<string, string>
      return Object.keys(obj).length === 4 && Object.values(obj).every(v => v)
    }
    if (q.type === 'short_answer') return typeof ans === 'string' && ans.trim() !== ''
    return false
  }

  // Navigate to question
  const scrollToQuestion = (order: number) => {
    setActiveQuestion(order)
    questionRefs.current[order]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    // On mobile, switch to answers tab
    setMobileTab('answers')
    setBottomNav('questions')
  }

  // Submit
  const handleSubmit = useCallback(async (autoSubmit = false) => {
    if (submitted || submitting) return

    if (!autoSubmit) {
      const answeredCount = exam?.questions.filter(q => isAnswered(q)).length || 0
      const totalCount = exam?.questions.length || 0
      if (!confirm(`Bạn đã trả lời ${answeredCount}/${totalCount} câu.\nBạn có chắc muốn nộp bài?`)) return
    }

    setSubmitting(true)
    if (timerRef.current) clearInterval(timerRef.current)

    try {
      const durationSeconds = Math.floor((Date.now() - startedAt) / 1000)
      const res = await fetch(`/api/practice-exams/${examId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers, duration_seconds: durationSeconds }),
      })

      const data = await res.json()
      if (res.ok) {
        setSubmitResult(data)
        setSubmitted(true)
        setShowResult(true)
      } else {
        alert('Lỗi nộp bài: ' + (data.error || 'Unknown'))
      }
    } catch (err) {
      alert('Lỗi: ' + (err instanceof Error ? err.message : 'Unknown'))
    } finally {
      setSubmitting(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitted, submitting, exam, answers, examId, startedAt])

  // Get result for a question (after submit)
  const getResult = (order: number): SubmitResult | undefined => {
    return submitResult?.results.find(r => r.order === order)
  }

  // Bottom nav handler for mobile
  const handleBottomNav = (tab: BottomNavTab) => {
    setBottomNav(tab)
    if (tab === 'exam') setMobileTab('pdf')
    else if (tab === 'questions') setMobileTab('answers')
    else if (tab === 'flagged') setMobileTab('answers')
    else if (tab === 'submit') {
      handleSubmit(false)
    }
  }

  if (loading || !exam) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div className={styles.loading}>
          <span className={styles.spinner} /> Đang tải đề thi...
        </div>
      </div>
    )
  }

  const questions = exam.questions || []
  const answeredCount = questions.filter(q => isAnswered(q)).length

  return (
    <div className={styles.examPage}>
      {/* Header */}
      <div className={styles.examHeader}>
        <div className={styles.examHeaderTitle}>{exam.title}</div>
        <div className={styles.examHeaderRight}>
          <div className={`${styles.timerBadge} ${getTimerClass()}`}>
            ⏱ {formatTime(timeLeft)}
          </div>
          {!submitted && (
            <button
              className={styles.submitHeaderBtn}
              onClick={() => handleSubmit(false)}
              disabled={submitting}
            >
              {submitting ? '⏳...' : '✓ Nộp bài'}
            </button>
          )}
          {submitted && (
            <button
              className={styles.submitHeaderBtn}
              style={{ background: '#16a34a' }}
              onClick={() => setShowResult(true)}
            >
              📊 Xem kết quả
            </button>
          )}
        </div>
      </div>

      {/* Mobile Tab Bar */}
      <div className={styles.mobileTabBar}>
        <button
          className={`${styles.mobileTab} ${mobileTab === 'pdf' ? styles.mobileTabActive : ''}`}
          onClick={() => { setMobileTab('pdf'); setBottomNav('exam') }}
        >
          Đề thi
        </button>
        <button
          className={`${styles.mobileTab} ${mobileTab === 'answers' ? styles.mobileTabActive : ''}`}
          onClick={() => { setMobileTab('answers'); setBottomNav('questions') }}
        >
          Đáp án
        </button>
      </div>

      {/* Main Body */}
      <div className={styles.examBody}>
        {/* PDF Panel */}
        <div className={`${styles.pdfPanel} ${mobileTab === 'pdf' ? styles.pdfPanelVisible : ''}`}>
          {exam.pdf_url ? (
            <iframe
              className={styles.pdfIframe}
              src={`https://docs.google.com/gview?url=${encodeURIComponent(exam.pdf_url)}&embedded=true`}
              title="Đề thi PDF"
            />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#9ca3af' }}>
              Không có file PDF
            </div>
          )}
        </div>

        {/* Answer Panel */}
        <div className={`${styles.answerPanel} ${mobileTab === 'answers' ? styles.answerPanelVisible : ''}`}>
          <div className={styles.answerPanelHeader}>
            <div className={styles.answerPanelTitle}>
              {exam.title}
              {submitted && (
                <span style={{ fontSize: '14px', color: '#16a34a', marginLeft: '8px' }}>
                  ✅ Đã nộp
                </span>
              )}
            </div>

            {/* Question Navigator */}
            <div className={styles.questionNav}>
              {questions.map(q => (
                <div
                  key={q.order}
                  className={`${styles.navDot} 
                    ${isAnswered(q) ? styles.navDotAnswered : ''} 
                    ${activeQuestion === q.order ? styles.navDotActive : ''} 
                    ${flagged.has(q.order) ? styles.navDotFlagged : ''}`}
                  onClick={() => scrollToQuestion(q.order)}
                  title={`Câu ${q.order}`}
                >
                  {q.order}
                </div>
              ))}
            </div>
          </div>

          {/* Answer List */}
          <div className={styles.answerList}>
            {questions.map(q => {
              const result = submitted ? getResult(q.order) : undefined

              return (
                <div
                  key={q.order}
                  className={styles.questionBlock}
                  ref={el => { questionRefs.current[q.order] = el }}
                  id={`q-${q.order}`}
                >
                  <div className={styles.questionLabel}>
                    <span className={styles.questionNum}>Câu {q.order}</span>
                    <span className={`${styles.questionTypeBadge} ${
                      q.type === 'multiple_choice' ? styles.questionTypeMC :
                      q.type === 'true_false' ? styles.questionTypeTF :
                      q.type === 'short_answer' ? styles.questionTypeSA :
                      styles.questionTypeEssay
                    }`}>
                      {TYPE_SHORT[q.type]}
                    </span>
                    {!submitted && (
                      <button
                        onClick={() => toggleFlag(q.order)}
                        style={{
                          marginLeft: 'auto',
                          fontSize: '16px',
                          cursor: 'pointer',
                          background: 'none',
                          border: 'none',
                          padding: '2px',
                        }}
                        title={flagged.has(q.order) ? 'Bỏ đánh dấu' : 'Đánh dấu câu này'}
                      >
                        {flagged.has(q.order) ? '🚩' : '⚑'}
                      </button>
                    )}
                    {result && (
                      <span style={{
                        marginLeft: 'auto',
                        fontSize: '12px',
                        fontWeight: 700,
                        color: result.score_earned > 0 ? '#16a34a' : '#dc2626'
                      }}>
                        {result.score_earned > 0 ? `+${result.score_earned}đ` : '0đ'}
                      </span>
                    )}
                  </div>

                  {/* MC Options */}
                  {q.type === 'multiple_choice' && (
                    <div className={styles.mcOptions}>
                      {['A', 'B', 'C', 'D'].map(opt => {
                        const studentAns = answers[String(q.order)] as string || ''
                        let cls = styles.mcOption
                        if (!submitted) {
                          if (studentAns === opt) cls += ` ${styles.mcOptionSelected}`
                        } else if (result) {
                          const correct = result.correct_answer as string
                          if (studentAns === opt && result.is_correct) cls += ` ${styles.mcOptionCorrect}`
                          else if (studentAns === opt && !result.is_correct) cls += ` ${styles.mcOptionWrong}`
                          else if (opt === correct) cls += ` ${styles.mcOptionMissed}`
                        }
                        return (
                          <div
                            key={opt}
                            className={cls}
                            onClick={() => setMCAnswer(q.order, opt)}
                          >
                            {opt}
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* TF Options */}
                  {q.type === 'true_false' && (
                    <div className={styles.tfOptions}>
                      {['a', 'b', 'c', 'd'].map((sub, subIdx) => {
                        const studentTF = (answers[String(q.order)] as Record<string, string>) || {}
                        const studentVal = studentTF[sub] || ''
                        const correctArr = result ? (result.correct_answer as string[]) : []
                        const correctVal = correctArr[subIdx] || ''

                        return (
                          <div key={sub} className={styles.tfRow}>
                            <span className={styles.tfLabel}>{sub})</span>
                            {['Đ', 'S'].map(val => {
                              let cls = styles.tfBtn
                              if (!submitted) {
                                if (studentVal === val) cls += ` ${styles.tfBtnSelected}`
                              } else {
                                if (studentVal === val && studentVal === correctVal) cls += ` ${styles.tfBtnCorrect}`
                                else if (studentVal === val && studentVal !== correctVal) cls += ` ${styles.tfBtnWrong}`
                                else if (val === correctVal && studentVal !== correctVal) cls += ` ${styles.tfBtnCorrect}`
                              }
                              return (
                                <div
                                  key={val}
                                  className={cls}
                                  onClick={() => setTFAnswer(q.order, sub, val)}
                                >
                                  {val}
                                </div>
                              )
                            })}
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Short Answer */}
                  {q.type === 'short_answer' && (
                    <div>
                      <input
                        type="text"
                        className={`${styles.saInput} ${
                          submitted && result
                            ? result.is_correct ? styles.saInputCorrect : styles.saInputWrong
                            : ''
                        }`}
                        placeholder="Nhập đáp án..."
                        maxLength={10}
                        value={(answers[String(q.order)] as string) || ''}
                        onChange={e => setSAAnswer(q.order, e.target.value)}
                        disabled={submitted}
                      />
                      {submitted && result && !result.is_correct && (
                        <div style={{ fontSize: '12px', color: '#16a34a', marginTop: '4px' }}>
                          Đáp án: {result.correct_answer as string}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Essay */}
                  {q.type === 'essay' && (
                    <div style={{ fontSize: '13px', color: '#9ca3af', fontStyle: 'italic' }}>
                      Phần tự luận — chấm sau
                    </div>
                  )}
                </div>
              )
            })}

            {/* Submit button at bottom of answer list */}
            {!submitted && (
              <button
                className={styles.submitBtn}
                onClick={() => handleSubmit(false)}
                disabled={submitting}
              >
                {submitting ? '⏳ Đang nộp bài...' : `✓ Nộp bài (${answeredCount}/${questions.length} câu)`}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Bottom Nav */}
      <div className={styles.bottomNav}>
        <button
          className={`${styles.bottomNavItem} ${bottomNav === 'exam' ? styles.bottomNavItemActive : ''}`}
          onClick={() => handleBottomNav('exam')}
        >
          <span className={styles.bottomNavIcon}>📖</span>
          Đề thi
        </button>
        <button
          className={`${styles.bottomNavItem} ${bottomNav === 'questions' ? styles.bottomNavItemActive : ''}`}
          onClick={() => handleBottomNav('questions')}
        >
          <span className={styles.bottomNavIcon}>≡</span>
          Câu hỏi
        </button>
        <button
          className={`${styles.bottomNavItem} ${bottomNav === 'flagged' ? styles.bottomNavItemActive : ''}`}
          onClick={() => handleBottomNav('flagged')}
        >
          <span className={styles.bottomNavIcon}>🚩</span>
          Đánh dấu
        </button>
        <button
          className={`${styles.bottomNavItem}`}
          onClick={() => handleBottomNav('submit')}
        >
          <span className={styles.bottomNavIcon}>▶</span>
          {submitted ? 'Kết quả' : 'Nộp bài'}
        </button>
      </div>

      {/* Result Modal */}
      {showResult && submitResult && (
        <div className={styles.modalOverlay} onClick={() => setShowResult(false)}>
          <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.scoreBig}>
                {submitResult.score}/{submitResult.total_score}
              </div>
              <div className={styles.scoreLabel}>điểm</div>
              <div className={styles.statRow}>
                <div className={styles.statItem}>
                  <div className={styles.statValue}>{submitResult.total_correct}</div>
                  <div className={styles.statLabel}>Câu đúng (TN+Ngắn)</div>
                </div>
                <div className={styles.statItem}>
                  <div className={styles.statValue}>{submitResult.total_tf_correct}</div>
                  <div className={styles.statLabel}>Ý Đ/S đúng</div>
                </div>
                <div className={styles.statItem}>
                  <div className={styles.statValue}>{submitResult.total_questions}</div>
                  <div className={styles.statLabel}>Tổng câu</div>
                </div>
              </div>
            </div>

            <div className={styles.modalBody}>
              {submitResult.results.map(r => (
                <div key={r.order} className={styles.resultRow}>
                  <div className={`${styles.resultOrder} ${r.score_earned > 0 ? styles.resultCorrect : styles.resultWrong}`}>
                    {r.order}
                  </div>
                  <div className={styles.resultDetail}>
                    {r.type === 'multiple_choice' && (
                      <>Chọn: {(r.student_answer as string) || '—'} | Đáp án: {r.correct_answer as string}</>
                    )}
                    {r.type === 'true_false' && (
                      <>Đ/S: {r.score_earned > 0 ? `+${r.score_earned}đ` : '0đ'}</>
                    )}
                    {r.type === 'short_answer' && (
                      <>Trả lời: {(r.student_answer as string) || '—'} | Đáp án: {r.correct_answer as string}</>
                    )}
                    {r.type === 'essay' && 'Tự luận — chấm sau'}
                  </div>
                  <div className={styles.resultScore} style={{ color: r.score_earned > 0 ? '#16a34a' : '#dc2626' }}>
                    {r.score_earned > 0 ? `+${r.score_earned}` : '0'}đ
                  </div>
                </div>
              ))}
            </div>

            <div className={styles.modalFooter}>
              <button
                className={`${styles.modalBtn} ${styles.modalBtnSecondary}`}
                onClick={() => setShowResult(false)}
              >
                Xem lại bài
              </button>
              <button
                className={`${styles.modalBtn} ${styles.modalBtnPrimary}`}
                onClick={() => router.push('/student/practice')}
              >
                Quay về danh sách
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
