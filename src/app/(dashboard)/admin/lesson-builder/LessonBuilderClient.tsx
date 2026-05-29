'use client'
import { useState, useCallback, useRef, useEffect, Fragment } from 'react'
import Header from '@/components/layout/Header'
import styles from './lesson-builder.module.css'
import { CHAPTER_NAMES, LESSON_NAMES, VARIANT_NAMES } from '@/lib/curriculum-labels'
import { CURRICULUM } from '../questions/QuestionsClient'
import { isLimitedRole, TEACHER_LIMITS, checkLessonQuestionLimits, checkExportQuota, logExport } from '@/lib/export-limiter'
import VipModal from '@/components/VipModal'

// ── Types ────────────────────────────────────────────────────────────────────
interface QuestionItem {
  id: string
  category_code: string
  grade: number
  subject_area: string
  chapter: number
  lesson: number
  variant: number
  difficulty: string
  question_type: string
  latex_content: string
}

interface VariantStatsRow {
  lesson: number
  lesson_name: string
  variant: number
  variant_name: string
  question_type: string
  counts: Record<string, number>
  total: number
}

const TYPE_LABELS: Record<string, string> = {
  multiple_choice: 'TN', true_false: 'Đ/S', short_answer: 'Ngắn', essay: 'Tự luận'
}
const SUBJECT_LABELS: Record<string, string> = { D: 'Đại số / XS / TK', H: 'Hình học', C: 'Chuyên đề' }
const SUBJECT_ICONS: Record<string, string> = { D: '📐', H: '📏', C: '📎' }

// ── Component ────────────────────────────────────────────────────────────────
export default function LessonBuilderClient({ userRole }: { userRole: string }) {
  const [grade, setGrade] = useState(12)
  const [phase, setPhase] = useState<'select' | 'build'>('select')

  // Phase 1: Selection
  const [selectedLessons, setSelectedLessons] = useState<Set<string>>(new Set())
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(new Set())

  // Phase 2: Build — questions per lesson key "D|1|1"
  const [lessonQuestions, setLessonQuestions] = useState<Record<string, QuestionItem[]>>({})

  // Question picker
  const [pickerOpen, setPickerOpen] = useState(false)
  const [activePickerKey, setActivePickerKey] = useState<string | null>(null) // "D|1|1"
  const [pickerLesson, setPickerLesson] = useState('')
  const [pickerVariant, setPickerVariant] = useState('')
  const [pickerType, setPickerType] = useState('')
  const [statsData, setStatsData] = useState<VariantStatsRow[]>([])
  const [loadingStats, setLoadingStats] = useState(false)
  const [pickerSelections, setPickerSelections] = useState<Record<string, number>>({})
  const [loadingFetch, setLoadingFetch] = useState(false)

  const [exporting, setExporting] = useState(false)

  // VIP Modal
  const [showVipModal, setShowVipModal] = useState(false)
  const [vipReason, setVipReason] = useState<'daily_limit' | 'question_limit' | 'lesson_limit' | 'generic'>('generic')
  const [vipDetail, setVipDetail] = useState('')

  // Toast
  const [toast, setToast] = useState<{ type: 'error' | 'warning' | 'success' | 'info'; title: string; message: string; visible: boolean }>({ type: 'info', title: '', message: '', visible: false })
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = useCallback((type: 'error' | 'warning' | 'success' | 'info', title: string, message: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast({ type, title, message, visible: true })
    toastTimerRef.current = setTimeout(() => setToast(p => ({ ...p, visible: false })), type === 'error' ? 8000 : 4000)
  }, [])

  // ── LocalStorage persistence ───────────────────────────────────────────────
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    try {
      const saved = localStorage.getItem('lesson-builder-v2')
      if (saved) {
        const p = JSON.parse(saved)
        if (p.grade) setGrade(p.grade)
        if (p.phase) setPhase(p.phase)
        if (p.selectedLessons) setSelectedLessons(new Set(p.selectedLessons))
        if (p.expandedChapters) setExpandedChapters(new Set(p.expandedChapters))
        if (p.lessonQuestions) setLessonQuestions(p.lessonQuestions)
      }
    } catch (e) { console.error('Failed to load state', e) }
    setIsLoaded(true)
  }, [])

  useEffect(() => {
    if (!isLoaded) return
    try {
      localStorage.setItem('lesson-builder-v2', JSON.stringify({
        grade, phase,
        selectedLessons: Array.from(selectedLessons),
        expandedChapters: Array.from(expandedChapters),
        lessonQuestions,
      }))
    } catch (e) { console.error('Failed to save state', e) }
  }, [isLoaded, grade, phase, selectedLessons, expandedChapters, lessonQuestions])

  const handleReset = () => {
    if (!window.confirm('Bạn có chắc chắn muốn làm mới? Toàn bộ cấu hình sẽ bị xóa.')) return
    localStorage.removeItem('lesson-builder-v2')
    setGrade(12)
    setPhase('select')
    setSelectedLessons(new Set())
    setExpandedChapters(new Set())
    setLessonQuestions({})
    showToast('info', 'Đã làm mới', 'Trang đã được reset.')
  }

  // ── Checkbox tree helpers ──────────────────────────────────────────────────
  const toggleChapterExpand = (key: string) => {
    setExpandedChapters(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const toggleLessonSelect = (key: string) => {
    setSelectedLessons(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  // ── Build phase: structured data from selections ───────────────────────────
  const buildStructure = useCallback(() => {
    // Parse selected keys and group by subject → chapter → lessons
    const map: Record<string, Record<number, number[]>> = {}
    for (const key of selectedLessons) {
      const [sub, chStr, lesStr] = key.split('|')
      const ch = parseInt(chStr)
      const les = parseInt(lesStr)
      if (!map[sub]) map[sub] = {}
      if (!map[sub][ch]) map[sub][ch] = []
      map[sub][ch].push(les)
    }

    // Sort
    const subjectOrder = ['D', 'H', 'C']
    const result: { subject: string; chapter: number; lessons: number[] }[] = []
    for (const sub of subjectOrder) {
      if (!map[sub]) continue
      const chapters = Object.keys(map[sub]).map(Number).sort((a, b) => a - b)
      for (const ch of chapters) {
        result.push({ subject: sub, chapter: ch, lessons: map[sub][ch].sort((a, b) => a - b) })
      }
    }
    return result
  }, [selectedLessons])

  const structure = buildStructure()

  const handleStartBuild = async () => {
    if (selectedLessons.size === 0) {
      showToast('warning', 'Chưa chọn bài', 'Hãy chọn ít nhất 1 bài trước khi tạo.')
      return
    }

    // Giáo viên được tự do chọn và xây dựng bài học, giới hạn chỉ áp dụng khi xuất file
    setPhase('build')
  }

  // ── Question picker ────────────────────────────────────────────────────────
  const openPicker = (key: string) => {
    setActivePickerKey(key)
    setPickerLesson('')
    setPickerVariant('')
    setPickerType('')
    setPickerSelections({})
    setPickerOpen(true)
  }

  // Parse active key
  const activeSubject = activePickerKey?.split('|')[0] || 'D'
  const activeChapter = parseInt(activePickerKey?.split('|')[1] || '1')

  // Picker available lessons/variants from CURRICULUM
  const pickerChaptersMap = CURRICULUM[grade]?.[activeSubject] || {}
  const pickerAvailableLessons = activeChapter && pickerChaptersMap[activeChapter]
    ? Object.keys(pickerChaptersMap[activeChapter]).map(Number) : []
  const pickerAvailableVariants = activeChapter && pickerLesson && pickerChaptersMap[activeChapter]?.[Number(pickerLesson)]
    ? pickerChaptersMap[activeChapter][Number(pickerLesson)] : []

  // Fetch stats when picker opens
  const fetchStats = useCallback(async () => {
    if (!activeChapter) return
    setLoadingStats(true)
    try {
      const res = await fetch(`/api/exams/stats?grade=${grade}&subject_area=${activeSubject}&chapter=${activeChapter}`)
      const json = await res.json()
      if (json.error) {
        showToast('error', 'Lỗi', json.error)
      } else {
        setStatsData(json.data || [])
      }
    } catch {
      showToast('error', 'Lỗi kết nối', 'Không thể tải dữ liệu thống kê.')
    } finally {
      setLoadingStats(false)
    }
  }, [grade, activeSubject, activeChapter, showToast])

  useEffect(() => {
    if (pickerOpen && activePickerKey) {
      fetchStats()
    }
  }, [pickerOpen, activePickerKey, fetchStats])

  // Picker stats summary
  const getPickerStats = useCallback(() => {
    const stats = {
      types: { multiple_choice: 0, true_false: 0, short_answer: 0, essay: 0 } as Record<string, number>,
      diffs: { N: 0, H: 0, V: 0, C: 0 } as Record<string, number>,
      total: 0,
    }
    Object.entries(pickerSelections).forEach(([key, count]) => {
      const parts = key.split('|')
      if (parts.length === 7 && count > 0) {
        const [, , , , , t, d] = parts
        stats.types[t] = (stats.types[t] || 0) + count
        stats.diffs[d] = (stats.diffs[d] || 0) + count
        stats.total += count
      }
    })
    return stats
  }, [pickerSelections])

  const pickerStats = getPickerStats()

  const handlePickerCountChange = (lesson: number, variant: number, type: string, diff: string, value: string, max: number) => {
    const num = parseInt(value)
    const key = `${grade}|${activeSubject}|${activeChapter}|${lesson}|${variant}|${type}|${diff}`
    setPickerSelections(prev => {
      const next = { ...prev }
      if (isNaN(num) || num <= 0) {
        delete next[key]
      } else {
        next[key] = Math.min(num, max)
      }
      return next
    })
  }

  // Add questions from picker to the lesson
  const handleAddQuestions = async () => {
    if (!activePickerKey) return
    const selectionArray: { grade: number; subject_area: string; chapter: number; lesson: number; variant: number; difficulty: string; question_type: string; count: number }[] = []

    Object.entries(pickerSelections).forEach(([key, count]) => {
      if (count > 0) {
        const parts = key.split('|')
        if (parts.length === 7) {
          const [g, s, c, l, v, t, d] = parts
          selectionArray.push({
            grade: parseInt(g), subject_area: s, chapter: parseInt(c),
            lesson: parseInt(l), variant: parseInt(v),
            question_type: t, difficulty: d, count,
          })
        }
      }
    })

    if (selectionArray.length === 0) {
      showToast('warning', 'Chưa chọn', 'Hãy nhập số lượng câu cần lấy trước.')
      return
    }

    // --- GIỚI HẠN GIÁO VIÊN KHI THÊM CÂU HỎI VÀO BÀI HỌC ---
    if (isLimitedRole(userRole)) {
      const currentQuestions = Object.values(lessonQuestions).flat()
      const currentTotal = currentQuestions.length
      
      let newTotal = 0
      let newMc = 0
      let newTf = 0
      let newSa = 0
      let newEs = 0
      
      selectionArray.forEach(sel => {
        newTotal += sel.count
        if (sel.question_type === 'multiple_choice') newMc += sel.count
        else if (sel.question_type === 'true_false') newTf += sel.count
        else if (sel.question_type === 'short_answer') newSa += sel.count
        else if (sel.question_type === 'essay') newEs += sel.count
      })

      const projectedTotal = currentTotal + newTotal
      if (projectedTotal > TEACHER_LIMITS.MAX_QUESTIONS_PER_LESSON) {
        setVipReason('question_limit')
        setVipDetail(`Tổng số câu hỏi sẽ vượt quá giới hạn bài học (${projectedTotal}/${TEACHER_LIMITS.MAX_QUESTIONS_PER_LESSON} câu).`)
        setShowVipModal(true)
        return
      }

      const mcCount = currentQuestions.filter(q => q.question_type === 'multiple_choice').length + newMc
      const tfCount = currentQuestions.filter(q => q.question_type === 'true_false').length + newTf
      const saCount = currentQuestions.filter(q => q.question_type === 'short_answer').length + newSa
      const esCount = currentQuestions.filter(q => q.question_type === 'essay').length + newEs

      if (mcCount > TEACHER_LIMITS.MAX_MC_LESSON || tfCount > TEACHER_LIMITS.MAX_TF_LESSON || saCount > TEACHER_LIMITS.MAX_SA_LESSON || esCount > TEACHER_LIMITS.MAX_ES_LESSON) {
        setVipReason('question_limit')
        setVipDetail(`Dự kiến vượt giới hạn bài học: TN ${mcCount}/${TEACHER_LIMITS.MAX_MC_LESSON}, Đ/S ${tfCount}/${TEACHER_LIMITS.MAX_TF_LESSON}, Ngắn ${saCount}/${TEACHER_LIMITS.MAX_SA_LESSON}, TL ${esCount}/${TEACHER_LIMITS.MAX_ES_LESSON}.`)
        setShowVipModal(true)
        return
      }
    }

    setLoadingFetch(true)
    try {
      const res = await fetch('/api/lesson-builder/fetch-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selections: selectionArray }),
      })
      const data = await res.json()
      if (!res.ok) {
        showToast('error', 'Lỗi', data.error || 'Không thể lấy câu hỏi')
        return
      }

      const questions: QuestionItem[] = data.questions || []
      if (questions.length === 0) {
        showToast('warning', 'Không có', 'Không tìm thấy câu hỏi phù hợp.')
        return
      }

      // Store questions for this lesson key
      setLessonQuestions(prev => ({
        ...prev,
        [activePickerKey]: [...(prev[activePickerKey] || []), ...questions],
      }))

      setPickerSelections({})
      setPickerOpen(false)

      if (data.warnings && data.warnings.length > 0) {
        showToast('warning', 'Cảnh báo', data.warnings.join('\n'))
      } else {
        showToast('success', 'Đã thêm', `${questions.length} câu hỏi đã được thêm.`)
      }
    } catch {
      showToast('error', 'Lỗi kết nối', 'Không thể kết nối đến máy chủ.')
    } finally {
      setLoadingFetch(false)
    }
  }

  const removeQuestions = (key: string) => {
    setLessonQuestions(prev => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  // ── Export ─────────────────────────────────────────────────────────────────
  const totalQuestions = Object.values(lessonQuestions).reduce((sum, qs) => sum + qs.length, 0)

  const handleExport = async () => {
    if (structure.length === 0) {
      showToast('warning', 'Chưa có nội dung', 'Hãy chọn bài và tạo bài học trước.')
      return
    }

    // --- GIỚI HẠN GIÁO VIÊN KHI XUẤT FILE ---
    if (isLimitedRole(userRole)) {
      // Kiểm tra số lượng bài học
      if (selectedLessons.size > 1) {
        setVipReason('lesson_limit')
        setVipDetail(`Giáo viên chỉ được xuất tối đa 1 bài/lần. Bạn đã chọn ${selectedLessons.size} bài. Nâng VIP để không giới hạn.`)
        setShowVipModal(true)
        return
      }

      // Kiểm tra giới hạn số câu hỏi
      const allQs = Object.values(lessonQuestions).flat()
      const limitError = checkLessonQuestionLimits(allQs)
      if (limitError) {
        setVipReason('question_limit')
        setVipDetail(limitError)
        setShowVipModal(true)
        return
      }

      // Kiểm tra quota bài học / tháng
      const lessonQuota = await checkExportQuota('lesson')
      if (!lessonQuota.allowed) {
        setVipReason('lesson_limit')
        setVipDetail('')
        setShowVipModal(true)
        return
      }

      // Kiểm tra quota xuất file chung / ngày
      const dailyQuota = await checkExportQuota()
      if (!dailyQuota.allowed) {
        setVipReason('daily_limit')
        setVipDetail('')
        setShowVipModal(true)
        return
      }
    }

    setExporting(true)
    try {
      // Build lessons array for API
      const lessons = structure.flatMap(ch =>
        ch.lessons.map(les => ({
          subject: ch.subject,
          chapter: ch.chapter,
          lesson: les,
          questions: lessonQuestions[`${ch.subject}|${ch.chapter}|${les}`] || [],
        }))
      )

      const res = await fetch('/api/export-lesson', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grade, lessons }),
      })
      if (!res.ok) {
        const json = await res.json()
        showToast('error', 'Xuất thất bại', json.error || 'Lỗi')
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'lesson_package.zip'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      showToast('success', 'Xuất thành công', 'File ZIP đã được tải xuống.')

      // Ghi log xuất file
      if (isLimitedRole(userRole)) {
        await logExport('lesson', '/admin/lesson-builder')
      }
    } catch {
      showToast('error', 'Lỗi kết nối', 'Không thể kết nối đến máy chủ.')
    } finally {
      setExporting(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className={styles.page}>
      <Header
        title="Tạo Bài Học"
        subtitle="Chọn chương bài, ghép lý thuyết và bài tập, xuất file .tex"
        actions={
          <>
            {(selectedLessons.size > 0 || phase === 'build') && (
              <button className={styles.resetBtn} onClick={handleReset}>🧹 Làm mới</button>
            )}
            {phase === 'build' && (
              <button className={styles.exportBtn} onClick={handleExport} disabled={exporting}>
                {exporting ? '⏳ Đang xuất...' : '📥 Xuất file .tex'}
              </button>
            )}
          </>
        }
      />

      <div className={styles.container}>
        {/* Top bar */}
        <div className={styles.topBar}>
          <span className={styles.gradeLabel}>📐 Khối lớp:</span>
          <select className={styles.gradeSelect} value={grade} onChange={e => { setGrade(Number(e.target.value)); setSelectedLessons(new Set()); setExpandedChapters(new Set()) }}>
            <option value={10}>Lớp 10</option>
            <option value={11}>Lớp 11</option>
            <option value={12}>Lớp 12</option>
          </select>
        </div>

        {/* ═══ PHASE: SELECT ═══ */}
        {phase === 'select' && (
          <>
            <div className={styles.treeSection}>
              <div className={styles.treeSectionHeader}>
                📖 Chọn chương bài để tạo bài học
              </div>
              <div className={styles.treeSectionBody}>
                {['D', 'H', 'C'].map(sub => {
                  const chaptersMap = CURRICULUM[grade]?.[sub]
                  if (!chaptersMap || Object.keys(chaptersMap).length === 0) return null
                  const chapters = Object.keys(chaptersMap).map(Number).sort((a, b) => a - b)

                  return (
                    <div key={sub} className={styles.subjectGroup}>
                      <div className={styles.subjectHeader}>
                        <span className={styles.subjectIcon}>{SUBJECT_ICONS[sub]}</span>
                        {SUBJECT_LABELS[sub]}
                      </div>
                      {chapters.map(ch => {
                        const chKey = `${sub}|${ch}`
                        const isExpanded = expandedChapters.has(chKey)
                        const lessonsMap = chaptersMap[ch] || {}
                        const lessonNums = Object.keys(lessonsMap).map(Number).sort((a, b) => a - b)
                        const chName = CHAPTER_NAMES[grade]?.[sub]?.[ch] || `Chương ${ch}`

                        // Count selected lessons in this chapter
                        const selectedInChapter = lessonNums.filter(l => selectedLessons.has(`${sub}|${ch}|${l}`)).length

                        return (
                          <Fragment key={chKey}>
                            <div className={styles.chapterRow} onClick={() => toggleChapterExpand(chKey)}>
                              <span className={`${styles.chapterExpand} ${isExpanded ? styles.chapterExpandOpen : ''}`}>▶</span>
                              <span className={styles.chapterName}>{chName}</span>
                              {selectedInChapter > 0 && (
                                <span className={styles.chapterCount}>✓ {selectedInChapter}/{lessonNums.length}</span>
                              )}
                            </div>
                            {isExpanded && lessonNums.map(les => {
                              const lesKey = `${sub}|${ch}|${les}`
                              const lesName = LESSON_NAMES[grade]?.[sub]?.[ch]?.[les] || `Bài ${les}`
                              return (
                                <div key={lesKey} className={styles.lessonRow}>
                                  <input
                                    type="checkbox"
                                    className={styles.lessonCheckbox}
                                    checked={selectedLessons.has(lesKey)}
                                    onChange={() => toggleLessonSelect(lesKey)}
                                  />
                                  <span className={styles.lessonName}>{lesName}</span>
                                </div>
                              )
                            })}
                          </Fragment>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            </div>

            <div className={styles.selectActions}>
              <span className={styles.selectedCount}>Đã chọn: {selectedLessons.size} bài</span>
              <button className={styles.buildBtn} onClick={handleStartBuild} disabled={selectedLessons.size === 0}>
                📝 Tạo bài học
              </button>
            </div>
          </>
        )}

        {/* ═══ PHASE: BUILD ═══ */}
        {phase === 'build' && (
          <>
            <div className={styles.buildHeader}>
              <button className={styles.backBtn} onClick={() => setPhase('select')}>
                ← Quay lại chọn bài
              </button>
              <span className={styles.buildTitle}>Nội dung bài học</span>
              <span className={styles.buildStats}>
                {selectedLessons.size} bài • {totalQuestions} câu hỏi
              </span>
            </div>

            {structure.map(ch => {
              const chName = CHAPTER_NAMES[grade]?.[ch.subject]?.[ch.chapter]
                ?.replace(/^Ch\.\d+\s*/, '').replace(/^CĐ\d+\s*/, '')
                || `Chương ${ch.chapter}`

              return (
                <div key={`${ch.subject}|${ch.chapter}`} className={styles.buildChapter}>
                  <div className={styles.buildChapterHeader}>
                    📘 Chương {ch.chapter}. {chName}
                  </div>
                  {ch.lessons.map(les => {
                    const lesKey = `${ch.subject}|${ch.chapter}|${les}`
                    const lesName = LESSON_NAMES[grade]?.[ch.subject]?.[ch.chapter]?.[les]
                      ?.replace(/^§\d+\s*/, '')
                      || `Bài ${les}`
                    const questions = lessonQuestions[lesKey] || []
                    const theoryFile = `${grade}_${ch.subject}_${ch.chapter}_${les}`

                    return (
                      <div key={lesKey} className={styles.buildLesson}>
                        <div className={styles.buildLessonHeader}>
                          📄 Bài {les}. {lesName}
                        </div>
                        <div className={styles.buildTheory}>
                          📝 Lý thuyết
                          <span className={styles.theoryBadge}>✅ tự động</span>
                          <span style={{ fontSize: '11px', color: '#94a3b8' }}>({theoryFile}.tex)</span>
                        </div>
                        <div className={styles.buildExercise}>
                          📋 Bài tập
                          {questions.length > 0 ? (
                            <>
                              <span className={styles.questionCountBadge}>Đã lấy {questions.length} câu</span>
                              <button className={styles.addQuestionsBtn} onClick={() => openPicker(lesKey)}>
                                + Thêm
                              </button>
                              <button className={styles.removeQuestionsBtn} onClick={() => removeQuestions(lesKey)} title="Xóa câu hỏi">
                                ✕
                              </button>
                            </>
                          ) : (
                            <button className={styles.addQuestionsBtn} onClick={() => openPicker(lesKey)}>
                              + Thêm câu hỏi
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })}


          </>
        )}
      </div>

      {/* ═══ FULLSCREEN QUESTION PICKER ═══ */}
      {pickerOpen && activePickerKey && (
        <div className={styles.pickerOverlay}>
          <div className={styles.pickerContainer}>
            {/* Header */}
            <div className={styles.pickerHeader}>
              <span className={styles.pickerTitle}>
                🎯 Chọn câu hỏi — {CHAPTER_NAMES[grade]?.[activeSubject]?.[activeChapter] || `Ch.${activeChapter}`}
              </span>
              <button className={styles.pickerCloseBtn} onClick={() => setPickerOpen(false)}>✕</button>
            </div>

            {/* Filters */}
            <div className={styles.pickerFilters}>
              <div className={styles.pickerFilterGroup}>
                <span className={styles.pickerFilterLabel}>Bài</span>
                <select className={styles.pickerFilterSelect} value={pickerLesson} onChange={e => { setPickerLesson(e.target.value); setPickerVariant('') }}>
                  <option value="">Tất cả</option>
                  {pickerAvailableLessons.map(l => (
                    <option key={l} value={l}>Bài {l}</option>
                  ))}
                </select>
              </div>
              <div className={styles.pickerFilterGroup}>
                <span className={styles.pickerFilterLabel}>Dạng</span>
                <select className={styles.pickerFilterSelect} value={pickerVariant} onChange={e => setPickerVariant(e.target.value)}>
                  <option value="">Tất cả</option>
                  {pickerAvailableVariants.map((v: number) => (
                    <option key={v} value={v}>Dạng {v}</option>
                  ))}
                </select>
              </div>
              <div className={styles.pickerFilterGroup}>
                <span className={styles.pickerFilterLabel}>Loại câu</span>
                <select className={styles.pickerFilterSelect} value={pickerType} onChange={e => setPickerType(e.target.value)}>
                  <option value="">Tất cả</option>
                  <option value="multiple_choice">Trắc nghiệm</option>
                  <option value="true_false">Đúng/Sai</option>
                  <option value="short_answer">Trả lời ngắn</option>
                  <option value="essay">Tự luận</option>
                </select>
              </div>
            </div>

            {/* Summary */}
            <div className={styles.pickerSummary}>
              <span className={styles.pickerSummaryLabel}>Đã chọn: {pickerStats.total} câu</span>
              <div className={styles.pickerSummaryBadges}>
                <span className={`${styles.pickerBadge} ${styles.mc} ${pickerStats.types.multiple_choice ? '' : styles.zero}`}>TN: {pickerStats.types.multiple_choice}</span>
                <span className={`${styles.pickerBadge} ${styles.tf} ${pickerStats.types.true_false ? '' : styles.zero}`}>Đ/S: {pickerStats.types.true_false}</span>
                <span className={`${styles.pickerBadge} ${styles.sa} ${pickerStats.types.short_answer ? '' : styles.zero}`}>Ngắn: {pickerStats.types.short_answer}</span>
                <span className={`${styles.pickerBadge} ${styles.es} ${pickerStats.types.essay ? '' : styles.zero}`}>TL: {pickerStats.types.essay}</span>
              </div>
              <div className={styles.pickerSummarySep} />
              <div className={styles.pickerSummaryBadges}>
                <span className={`${styles.pickerBadge} ${styles.nb} ${pickerStats.diffs.N ? '' : styles.zero}`}>NB: {pickerStats.diffs.N}</span>
                <span className={`${styles.pickerBadge} ${styles.th} ${pickerStats.diffs.H ? '' : styles.zero}`}>TH: {pickerStats.diffs.H}</span>
                <span className={`${styles.pickerBadge} ${styles.vd} ${pickerStats.diffs.V ? '' : styles.zero}`}>VD: {pickerStats.diffs.V}</span>
                <span className={`${styles.pickerBadge} ${styles.vdc} ${pickerStats.diffs.C ? '' : styles.zero}`}>VDC: {pickerStats.diffs.C}</span>
              </div>
              {pickerStats.total > 0 && (
                <button className={styles.pickerClearBtn} onClick={() => setPickerSelections({})}>✕ Xóa tất cả</button>
              )}
            </div>

            {/* Stats Table */}
            <div className={styles.pickerBody}>
              {loadingStats ? (
                <div className={styles.pickerLoading}>⏳ Đang tải dữ liệu ngân hàng...</div>
              ) : statsData.length === 0 ? (
                <div className={styles.pickerEmpty}>
                  <div className={styles.pickerEmptyIcon}>📭</div>
                  Không có câu hỏi nào trong chương này
                </div>
              ) : (
                <table className={styles.pickerTable}>
                  <thead>
                    <tr>
                      <th style={{ minWidth: 300 }}>Bài / Dạng</th>
                      <th style={{ width: 80 }}>Loại</th>
                      <th className={styles.centered} title="Nhận biết">NB</th>
                      <th className={styles.centered} title="Thông hiểu">TH</th>
                      <th className={styles.centered} title="Vận dụng">VD</th>
                      <th className={styles.centered} title="Vận dụng cao">VDC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const filtered = statsData.filter(row => {
                        if (pickerLesson && row.lesson !== Number(pickerLesson)) return false
                        if (pickerVariant && row.variant !== Number(pickerVariant)) return false
                        if (pickerType && row.question_type !== pickerType) return false
                        return true
                      })

                      if (filtered.length === 0) {
                        return (
                          <tr>
                            <td colSpan={6} style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                              Không tìm thấy dữ liệu phù hợp.
                            </td>
                          </tr>
                        )
                      }

                      return filtered.map((row, idx) => {
                        const isNewLesson = idx === 0 || row.lesson !== filtered[idx - 1].lesson
                        const countN = row.counts.N || 0
                        const countH = row.counts.H || 0
                        const countV = row.counts.V || 0
                        const countC = row.counts.C || 0

                        const kBase = `${grade}|${activeSubject}|${activeChapter}|${row.lesson}|${row.variant}|${row.question_type}`
                        const selN = pickerSelections[`${kBase}|N`] || 0
                        const selH = pickerSelections[`${kBase}|H`] || 0
                        const selV = pickerSelections[`${kBase}|V`] || 0
                        const selC = pickerSelections[`${kBase}|C`] || 0
                        const hasSel = selN > 0 || selH > 0 || selV > 0 || selC > 0

                        return (
                          <Fragment key={`${row.lesson}-${row.variant}-${row.question_type}`}>
                            {isNewLesson && (
                              <tr>
                                <td colSpan={6} className={styles.lessonGroupHeader}>
                                  <span className={styles.lessonGroupHeaderText}>{row.lesson_name}</span>
                                </td>
                              </tr>
                            )}
                            <tr className={`${styles.pickerRow} ${hasSel ? styles.hasSelection : ''}`}>
                              <td className={styles.pickerCell}>
                                <span className={styles.variantName}>
                                  <span style={{ fontWeight: 700, color: '#0369a1', marginRight: '6px' }}>Dạng {row.variant}:</span>
                                  {row.variant_name}
                                </span>
                              </td>
                              <td className={styles.pickerCell}>
                                <span className={`${styles.typeBadge} ${
                                  row.question_type === 'multiple_choice' ? styles.mc :
                                  row.question_type === 'true_false' ? styles.tf :
                                  row.question_type === 'short_answer' ? styles.sa : styles.es
                                }`}>
                                  {TYPE_LABELS[row.question_type]}
                                </span>
                              </td>
                              {[
                                { key: 'N', max: countN, sel: selN },
                                { key: 'H', max: countH, sel: selH },
                                { key: 'V', max: countV, sel: selV },
                                { key: 'C', max: countC, sel: selC },
                              ].map(lvl => (
                                <td key={lvl.key} className={`${styles.pickerCell} ${styles.countCell}`}>
                                  <div className={styles.countCellInner}>
                                    <input
                                      type="number" min={0} max={lvl.max}
                                      value={lvl.sel || ''}
                                      placeholder="0"
                                      disabled={lvl.max === 0}
                                      className={`${styles.countInput} ${lvl.sel > 0 ? styles.hasValue : ''}`}
                                      onChange={e => handlePickerCountChange(row.lesson, row.variant, row.question_type, lvl.key, e.target.value, lvl.max)}
                                    />
                                    <span className={`${styles.countAvailable} ${lvl.max === 0 ? styles.zero : ''}`}>
                                      / {lvl.max}
                                    </span>
                                  </div>
                                </td>
                              ))}
                            </tr>
                          </Fragment>
                        )
                      })
                    })()}
                  </tbody>
                </table>
              )}
            </div>

            {/* Footer */}
            <div className={styles.pickerFooter}>
              <button className={styles.pickerCancelBtn} onClick={() => setPickerOpen(false)}>Hủy</button>
              <button
                className={styles.pickerSubmitBtn}
                onClick={handleAddQuestions}
                disabled={pickerStats.total === 0 || loadingFetch}
              >
                {loadingFetch ? '⏳ Đang tải...' : `📥 Thêm ${pickerStats.total} câu`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ TOAST ═══ */}
      {toast.visible && (
        <div style={{
          position: 'fixed', top: '24px', right: '24px', zIndex: 99999,
          minWidth: '320px', maxWidth: '460px', borderRadius: '16px', padding: '16px 20px',
          display: 'flex', gap: '12px', alignItems: 'flex-start',
          boxShadow: `0 8px 32px ${toast.type === 'error' ? 'rgba(220,38,38,0.25)' : toast.type === 'warning' ? 'rgba(217,119,6,0.25)' : toast.type === 'success' ? 'rgba(22,163,74,0.25)' : 'rgba(37,99,235,0.25)'}`,
          background: toast.type === 'error' ? 'linear-gradient(135deg,rgba(254,242,242,0.97),rgba(254,226,226,0.97))'
            : toast.type === 'warning' ? 'linear-gradient(135deg,rgba(255,251,235,0.97),rgba(254,243,199,0.97))'
            : toast.type === 'success' ? 'linear-gradient(135deg,rgba(240,253,244,0.97),rgba(220,252,231,0.97))'
            : 'linear-gradient(135deg,rgba(239,246,255,0.97),rgba(219,234,254,0.97))',
          animation: 'toastSlideIn 0.35s cubic-bezier(0.16,1,0.3,1)',
        }}>
          <div style={{ fontSize: '20px', flexShrink: 0 }}>
            {toast.type === 'error' ? '❌' : toast.type === 'warning' ? '⚠️' : toast.type === 'success' ? '✅' : 'ℹ️'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '2px', color: toast.type === 'error' ? '#991b1b' : toast.type === 'warning' ? '#92400e' : toast.type === 'success' ? '#166534' : '#1e40af' }}>
              {toast.title}
            </div>
            <div style={{ fontSize: '13px', lineHeight: '1.5', color: toast.type === 'error' ? '#b91c1c' : toast.type === 'warning' ? '#a16207' : toast.type === 'success' ? '#15803d' : '#2563eb', opacity: 0.9 }}>
              {toast.message}
            </div>
          </div>
          <button onClick={() => setToast(p => ({ ...p, visible: false }))} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', opacity: 0.4, color: 'inherit', flexShrink: 0 }}>✕</button>
        </div>
      )}

      <VipModal isOpen={showVipModal} onClose={() => setShowVipModal(false)} reason={vipReason} detail={vipDetail} />

      <style>{`
        @keyframes toastSlideIn {
          from { transform: translateX(120%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
