'use client'

import { useState, useEffect, Fragment } from 'react'
import styles from './shuffle.module.css'
import { isLimitedRole, checkExportQuota, logExport, TEACHER_LIMITS } from '@/lib/export-limiter'
import VipModal from '@/components/VipModal'

// ─── Types ──────────────────────────────────────────────────────────────────────

interface ExamQuestion {
  id: string
  category_code: string
  grade: number
  subject_area: string
  chapter: number
  lesson: number
  variant: number
  difficulty: string
  question_type: string
  correct_answer: string | null
  has_image: boolean
  latex_content: string
  phan?: number
  mo_ta?: string
}

interface SourceExam {
  questions: ExamQuestion[]
}

interface ShuffleSourceData {
  sourceExams: SourceExam[]
  headerLabels: string[]
  configTitle: string
  configDuration: number
  filterGrade: number
}

interface ShuffledExam {
  questions: ExamQuestion[]
  code: string
  sourceIndex: number // which source exam it came from
}

// ─── Constants ──────────────────────────────────────────────────────────────────

const DIFFICULTY_LABELS: Record<string, string> = { N: 'Nhận biết', H: 'Thông hiểu', V: 'Vận dụng', C: 'Vận dụng cao' }
const TYPE_LABELS: Record<string, string> = { multiple_choice: 'TN', true_false: 'Đ/S', short_answer: 'Ngắn', essay: 'Tự luận' }
const TYPE_ICONS: Record<string, string> = { multiple_choice: '⏺', true_false: '☑', short_answer: '✍', essay: '📝' }
const PHAN_LABELS: Record<number, string> = {
  1: 'Phần I: Trắc nghiệm nhiều phương án',
  2: 'Phần II: Trắc nghiệm đúng sai',
  3: 'Phần III: Trả lời ngắn',
  4: 'Phần IV: Tự luận',
}

const generateExamCode = (): string => String(Math.floor(1000 + Math.random() * 9000))

const generateUniqueExamCodes = (count: number, existing: string[] = []): string[] => {
  const codes = new Set<string>(existing)
  const newCodes: string[] = []
  while (newCodes.length < count) {
    const code = generateExamCode()
    if (!codes.has(code)) {
      codes.add(code)
      newCodes.push(code)
    }
  }
  return newCodes
}

// ─── Shuffle utility ────────────────────────────────────────────────────────────

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ─── LaTeX answer shuffling ─────────────────────────────────────────────────────

/** Parse \choice{A}{B}{C}{D} and extract the 4 option blocks */
function parseChoiceOptions(latex: string): { before: string; options: string[]; after: string } | null {
  // Find \choice (possibly with optional arg like \choice[2])
  const choiceMatch = latex.match(/([\s\S]*?)(\\choice(?:\[\d+\])?)(\s*)([\s\S]*)/)
  if (!choiceMatch) return null

  const before = choiceMatch[1] + choiceMatch[2]
  let rest = choiceMatch[3] + choiceMatch[4]

  const options: string[] = []
  let pos = 0

  // Skip whitespace
  while (pos < rest.length && /\s/.test(rest[pos])) pos++

  // Extract up to 4 brace-delimited groups
  while (options.length < 4 && pos < rest.length) {
    // Skip whitespace
    while (pos < rest.length && /\s/.test(rest[pos])) pos++
    if (pos >= rest.length || rest[pos] !== '{') break

    let depth = 0
    const start = pos
    while (pos < rest.length) {
      if (rest[pos] === '{') depth++
      else if (rest[pos] === '}') {
        depth--
        if (depth === 0) { pos++; break }
      }
      pos++
    }
    options.push(rest.slice(start, pos))
  }

  if (options.length !== 4) return null

  const after = rest.slice(pos)
  return { before, options, after }
}

/** Shuffle the answer options in a multiple_choice question's latex_content */
function shuffleAnswerOptions(q: ExamQuestion): ExamQuestion {
  if (q.question_type !== 'multiple_choice') return q

  const parsed = parseChoiceOptions(q.latex_content)
  if (!parsed) return q

  // Find which option has \True
  let trueIdx = -1
  parsed.options.forEach((opt, i) => {
    if (opt.includes('\\True')) trueIdx = i
  })

  // Create index array and shuffle
  const indices = [0, 1, 2, 3]
  const shuffledIndices = shuffleArray(indices)

  // Rebuild options in new order
  const newOptions = shuffledIndices.map(i => parsed.options[i])

  // Find where the true answer ended up
  let newTrueIdx = -1
  if (trueIdx >= 0) {
    newTrueIdx = shuffledIndices.indexOf(trueIdx)
  }

  const newLatex = parsed.before + '\n\t\t' + newOptions.join('\n\t\t') + parsed.after
  const newAnswer = newTrueIdx >= 0 ? ['A', 'B', 'C', 'D'][newTrueIdx] : (q.correct_answer ?? '')

  return {
    ...q,
    latex_content: newLatex,
    correct_answer: newAnswer,
  }
}

// ─── Main Component ─────────────────────────────────────────────────────────────

export default function ShuffleClient({ userRole }: { userRole: string }) {

  // VIP Modal state
  const [showVipModal, setShowVipModal] = useState(false)
  const [vipReason, setVipReason] = useState<'daily_limit' | 'question_limit' | 'generic'>('generic')
  const [vipDetail, setVipDetail] = useState('')

  // Source data
  const [sourceData, setSourceData] = useState<ShuffleSourceData | null>(null)
  const [hasSource, setHasSource] = useState(false)

  // Config per source exam: codes for each source
  const [sourceConfigs, setSourceConfigs] = useState<{ codes: string[] }[]>([])

  // Options
  const [shuffleQuestions, setShuffleQuestions] = useState(true)
  const [shuffleAnswers, setShuffleAnswers] = useState(true)

  // Result
  const [shuffledExams, setShuffledExams] = useState<ShuffledExam[]>([])
  const [activeTab, setActiveTab] = useState(0)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [hasShuffled, setHasShuffled] = useState(false)

  // Export
  const [showExportModal, setShowExportModal] = useState(false)
  const [headerLabels, setHeaderLabels] = useState<string[]>([
    'SỞ GDĐT ...', 'TRƯỜNG THPT ...', 'Đề chính thức', '(Đề thi gồm có 0\\zpageref{\\made-lastpage} trang)',
    'ĐỀ KIỂM TRA', 'Môn: TOÁN', 'Thời gian làm bài: 90 phút', '(Không kể thời gian phát đề)'
  ])
  const [headerStyles, setHeaderStyles] = useState<{ bold: boolean; italic: boolean; underline: boolean; color: string }[]>(
    Array.from({ length: 8 }, () => ({ bold: false, italic: false, underline: false, color: '' }))
  )
  const LATEX_COLORS = ['', 'red', 'blue', 'green', 'purple', 'orange', 'brown', 'cyan', 'magenta']
  const [selectedLine, setSelectedLine] = useState<number | null>(null)
  const [excelOption, setExcelOption] = useState<string>('none')
  const [includeAnswerTable, setIncludeAnswerTable] = useState<boolean>(true)

  // ─── Load source data from localStorage ─────────────────────────────────────
  useEffect(() => {
    try {
      const raw = localStorage.getItem('shuffle-source-exams')
      if (raw) {
        const data: ShuffleSourceData = JSON.parse(raw)
        if (data.sourceExams && data.sourceExams.length > 0) {
          setSourceData(data)
          setHasSource(true)

          // Initialize configs: 1 code per source exam
          const configs = data.sourceExams.map(() => ({
            codes: [generateExamCode()],
          }))
          setSourceConfigs(configs)

          // Use header labels from source if available
          if (data.headerLabels) setHeaderLabels(data.headerLabels)
        }
      }

      // Also try loading saved shuffle state
      const savedState = localStorage.getItem('shuffle-page-state')
      if (savedState) {
        const parsed = JSON.parse(savedState)
        if (parsed.sourceConfigs) setSourceConfigs(parsed.sourceConfigs)
        if (parsed.shuffleQuestions !== undefined) setShuffleQuestions(parsed.shuffleQuestions)
        if (parsed.shuffleAnswers !== undefined) setShuffleAnswers(parsed.shuffleAnswers)
        if (parsed.shuffledExams) setShuffledExams(parsed.shuffledExams)
        if (parsed.hasShuffled) setHasShuffled(parsed.hasShuffled)
        if (parsed.headerLabels) setHeaderLabels(parsed.headerLabels)
        if (parsed.excelOption) setExcelOption(parsed.excelOption)
      }
    } catch (e) {
      console.error('Failed to load shuffle source data', e)
    }
  }, [])

  // Save state
  useEffect(() => {
    if (!hasSource) return
    try {
      localStorage.setItem('shuffle-page-state', JSON.stringify({
        sourceConfigs, shuffleQuestions, shuffleAnswers,
        shuffledExams, hasShuffled, headerLabels, excelOption
      }))
    } catch (e) {
      console.error('Failed to save shuffle state', e)
    }
  }, [sourceConfigs, shuffleQuestions, shuffleAnswers, shuffledExams, hasShuffled, headerLabels, excelOption, hasSource])

  // ─── Handlers ───────────────────────────────────────────────────────────────

  const handleReset = () => {
    if (window.confirm('Bạn có chắc chắn muốn làm mới trang? Toàn bộ dữ liệu trộn đề sẽ bị xóa.')) {
      localStorage.removeItem('shuffle-page-state')
      localStorage.removeItem('shuffle-source-exams')
      setSourceData(null)
      setHasSource(false)
      setSourceConfigs([])
      setShuffledExams([])
      setHasShuffled(false)
      setActiveTab(0)
      setExpandedId(null)
      setShuffleQuestions(true)
      setShuffleAnswers(true)
      setExcelOption('none')
      setHeaderLabels([
        'SỞ GDĐT ...', 'TRƯỜNG THPT ...', 'Đề chính thức', '(Đề thi gồm có 0\\zpageref{\\made-lastpage} trang)',
        'ĐỀ KIỂM TRA', 'Môn: TOÁN', 'Thời gian làm bài: 90 phút', '(Không kể thời gian phát đề)'
      ])
      setHeaderStyles(Array.from({ length: 8 }, () => ({ bold: false, italic: false, underline: false, color: '' })))
    }
  }

  const handleAddCode = (sourceIdx: number) => {
    // Giáo viên chỉ bị giới hạn số đề gốc (2), số mã đề con không giới hạn
    setSourceConfigs(prev => {
      const next = [...prev]
      const allCodes = next.flatMap(c => c.codes)
      const newCode = generateUniqueExamCodes(1, allCodes)[0]
      next[sourceIdx] = { ...next[sourceIdx], codes: [...next[sourceIdx].codes, newCode] }
      return next
    })
  }

  const handleRemoveCode = (sourceIdx: number, codeIdx: number) => {
    setSourceConfigs(prev => {
      const next = [...prev]
      const codes = [...next[sourceIdx].codes]
      if (codes.length <= 1) return prev
      codes.splice(codeIdx, 1)
      next[sourceIdx] = { ...next[sourceIdx], codes }
      return next
    })
  }

  const handleCodeChange = (sourceIdx: number, codeIdx: number, value: string) => {
    const val = value.replace(/\D/g, '').slice(0, 4)
    setSourceConfigs(prev => {
      const next = [...prev]
      const codes = [...next[sourceIdx].codes]
      codes[codeIdx] = val
      next[sourceIdx] = { ...next[sourceIdx], codes }
      return next
    })
  }

  const handleRandomizeCodes = (sourceIdx: number) => {
    setSourceConfigs(prev => {
      const next = [...prev]
      const otherCodes = next.flatMap((c, i) => i === sourceIdx ? [] : c.codes)
      const newCodes = generateUniqueExamCodes(next[sourceIdx].codes.length, otherCodes)
      next[sourceIdx] = { ...next[sourceIdx], codes: newCodes }
      return next
    })
  }

  // ─── SHUFFLE LOGIC ──────────────────────────────────────────────────────────

  const handleShuffle = () => {
    if (!sourceData) return

    // Build per-source shuffled exams first
    const perSource: ShuffledExam[][] = []

    for (let si = 0; si < sourceData.sourceExams.length; si++) {
      const sourceQ = sourceData.sourceExams[si].questions
      const codes = sourceConfigs[si]?.codes || ['0000']
      const sourceExams: ShuffledExam[] = []

      for (const code of codes) {
        // 1. Clone questions
        let questions = sourceQ.map(q => ({ ...q }))

        // 2. Group by phan, shuffle within each group if enabled
        if (shuffleQuestions) {
          const grouped: Record<number, ExamQuestion[]> = {}
          questions.forEach(q => {
            const key = q.phan ?? 0
            if (!grouped[key]) grouped[key] = []
            grouped[key].push(q)
          })

          // Shuffle each group
          const keys = Object.keys(grouped).map(Number).sort((a, b) => a - b)
          questions = []
          for (const key of keys) {
            questions.push(...shuffleArray(grouped[key]))
          }
        }

        // 3. Shuffle answer options if enabled
        if (shuffleAnswers) {
          questions = questions.map(q => shuffleAnswerOptions(q))
        }

        sourceExams.push({
          questions,
          code,
          sourceIndex: si,
        })
      }

      perSource.push(sourceExams)
    }

    // Interleave: round-robin across sources
    // gốc1[0], gốc2[0], gốc3[0], gốc1[1], gốc2[1], gốc3[1], ...
    const maxCodes = Math.max(...perSource.map(s => s.length))
    const allShuffled: ShuffledExam[] = []

    for (let round = 0; round < maxCodes; round++) {
      for (let si = 0; si < perSource.length; si++) {
        if (round < perSource[si].length) {
          allShuffled.push(perSource[si][round])
        }
      }
    }

    setShuffledExams(allShuffled)
    setHasShuffled(true)
    setActiveTab(0)
    setExpandedId(null)
  }

  // ─── EXPORT ─────────────────────────────────────────────────────────────────

  const handleExportTex = async () => {
    if (shuffledExams.length === 0) return

    // Kiểm tra quota và số lượng đề GỐC (chỉ teacher)
    if (isLimitedRole(userRole)) {
      const numSourceExams = sourceData?.sourceExams?.length || shuffledExams.length
      if (numSourceExams > TEACHER_LIMITS.MAX_EXAMS_PER_BATCH) {
        setVipReason('question_limit')
        setVipDetail(`Số lượng đề gốc: ${numSourceExams}/${TEACHER_LIMITS.MAX_EXAMS_PER_BATCH} đề.`)
        setShowVipModal(true)
        return
      }

      const quota = await checkExportQuota()
      if (!quota.allowed) {
        setVipReason('daily_limit')
        setVipDetail('')
        setShowVipModal(true)
        return
      }
    }

    try {
      const payload: Record<string, unknown> = {
        title: sourceData?.configTitle || 'Đề thi trộn',
        headerLabels,
        headerStyles,
        examCodes: shuffledExams.map(e => e.code),
        duration: sourceData?.configDuration || 90,
        grade: sourceData?.filterGrade || 12,
        excelOption,
        includeAnswerTable,
      }

      payload.exams = shuffledExams.map(e => ({
        questions: e.questions.map(q => ({
          id: q.id,
          latex_content: q.latex_content,
          question_type: q.question_type,
          correct_answer: q.correct_answer ?? '',
          phan: q.phan,
        })),
      }))

      const res = await fetch('/api/export-zip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const json = await res.json()
        alert('❌ Xuất ZIP thất bại: ' + (json.error || 'Lỗi'))
        return
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url

      const title = sourceData?.configTitle || 'de_thi_tron'
      const sanitizedTitle = title
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[đĐ]/g, 'd')
        .replace(/[^a-zA-Z0-9]/g, '_')
        .toLowerCase()

      link.download = `${sanitizedTitle || 'exam_package'}.zip`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      // Ghi log xuất file
      if (isLimitedRole(userRole)) {
        await logExport('shuffle', '/teacher/shuffle')
      }
    } catch (err) {
      alert('Lỗi kết nối: ' + (err instanceof Error ? err.message : 'Unknown'))
    }
  }

  // ─── Current active exam data ───────────────────────────────────────────────

  const currentExam = shuffledExams[activeTab]
  const currentQuestions = currentExam?.questions || []

  const groupedQuestions = currentQuestions.reduce((acc, q) => {
    const key = q.phan ?? 0
    if (!acc[key]) acc[key] = []
    acc[key].push(q)
    return acc
  }, {} as Record<number, ExamQuestion[]>)

  const totalCodes = sourceConfigs.reduce((sum, c) => sum + c.codes.length, 0)

  // Check for duplicate codes
  const allCodes = sourceConfigs.flatMap(c => c.codes)
  const hasDuplicateCodes = new Set(allCodes).size !== allCodes.length

  // ─── RENDER ─────────────────────────────────────────────────────────────────

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.headerBar}>
        <div className={styles.headerLeft}>
          <div>
            <div className={styles.headerTitle}>🔀 Trộn Đề Thi</div>
            <div className={styles.headerSubtitle}>Trộn thứ tự câu hỏi và đáp án để tạo nhiều mã đề</div>
          </div>
        </div>
        <button onClick={handleReset} className={styles.resetBtn} title="Làm mới trang">
          🧹 Làm mới
        </button>
      </div>

      <div className={styles.layout}>
        {/* ═══ LEFT PANEL ═══ */}
        <div className={styles.leftPanel}>
          {!hasSource ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>📦</div>
              <div className={styles.emptyText}>Chưa có đề gốc</div>
              <div className={styles.emptySubtext}>
                Hãy vào trang &quot;Tạo đề thi&quot; hoặc &quot;AI tạo đề&quot; rồi bấm nút &quot;🔀 Chuyển sang Trộn đề&quot;
              </div>
            </div>
          ) : (
            <>
              {/* Source info */}
              <div className={styles.section}>
                <div className={styles.sectionTitle}>📦 Đề gốc đã nhận</div>
                <div style={{ fontSize: 13, color: '#475569', marginBottom: 8 }}>
                  {sourceData!.sourceExams.length} đề gốc • Tổng cộng trộn ra <strong>{totalCodes} mã đề</strong>
                </div>

                {sourceData!.sourceExams.map((exam, si) => (
                  <div key={si} className={styles.sourceCard}>
                    <div className={styles.sourceCardHeader}>
                      <div className={styles.sourceCardTitle}>Đề gốc {si + 1}</div>
                      <div className={styles.sourceCardBadge}>{exam.questions.length} câu</div>
                    </div>

                    {/* Exam codes for this source */}
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 }}>
                      Trộn ra {sourceConfigs[si]?.codes.length || 0} mã đề:
                    </div>
                    <div className={styles.codeInputRow}>
                      {sourceConfigs[si]?.codes.map((code, ci) => (
                        <div key={ci} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 2 }}>
                          <input
                            type="text"
                            className={styles.codeInput}
                            value={code}
                            maxLength={4}
                            onChange={e => handleCodeChange(si, ci, e.target.value)}
                          />
                          {sourceConfigs[si].codes.length > 1 && (
                            <button className={styles.removeCodeBtn} onClick={() => handleRemoveCode(si, ci)} title="Xóa mã đề">✕</button>
                          )}
                        </div>
                      ))}
                      <button className={styles.addCodeBtn} onClick={() => handleAddCode(si)} title="Thêm mã đề">+</button>
                      <button className={styles.randomBtn} onClick={() => handleRandomizeCodes(si)} title="Tạo mã ngẫu nhiên">🎲</button>
                    </div>
                  </div>
                ))}

                {hasDuplicateCodes && (
                  <div style={{ fontSize: 12, color: '#dc2626', fontWeight: 500, marginTop: 8 }}>
                    ⚠️ Có mã đề bị trùng! Vui lòng chỉnh sửa.
                  </div>
                )}
              </div>

              {/* Shuffle options */}
              <div className={styles.section}>
                <div className={styles.sectionTitle}>⚙️ Tùy chọn trộn</div>
                <div className={styles.optionRow}>
                  <input
                    type="checkbox"
                    id="opt-questions"
                    className={styles.optionCheckbox}
                    checked={shuffleQuestions}
                    onChange={e => setShuffleQuestions(e.target.checked)}
                  />
                  <label htmlFor="opt-questions" className={styles.optionLabel}>
                    Trộn thứ tự câu hỏi (trong từng phần)
                  </label>
                </div>
                <div className={styles.optionRow}>
                  <input
                    type="checkbox"
                    id="opt-answers"
                    className={styles.optionCheckbox}
                    checked={shuffleAnswers}
                    onChange={e => setShuffleAnswers(e.target.checked)}
                  />
                  <label htmlFor="opt-answers" className={styles.optionLabel}>
                    Trộn đáp án A/B/C/D (câu trắc nghiệm)
                  </label>
                </div>
              </div>

              {/* Shuffle button */}
              <div className={styles.section}>
                <button
                  className={styles.shuffleBtn}
                  onClick={handleShuffle}
                  disabled={hasDuplicateCodes || totalCodes === 0}
                >
                  🔀 Bắt đầu trộn đề ({totalCodes} mã đề)
                </button>
              </div>
            </>
          )}
        </div>

        {/* ═══ RIGHT PANEL ═══ */}
        <div className={styles.rightPanel}>
          {!hasShuffled ? (
            <div className={styles.emptyState} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div className={styles.emptyIcon}>🔀</div>
              <div className={styles.emptyText}>
                {hasSource ? 'Sẵn sàng trộn đề' : 'Chưa có đề gốc'}
              </div>
              <div className={styles.emptySubtext}>
                {hasSource
                  ? 'Cấu hình số mã đề ở bên trái rồi bấm "Bắt đầu trộn đề"'
                  : 'Hãy tạo đề trước rồi chuyển sang trang này'}
              </div>
            </div>
          ) : (
            <>
              {/* Tab bar */}
              <div className={styles.tabBar}>
                {shuffledExams.map((exam, idx) => (
                  <button
                    key={idx}
                    className={`${styles.tab} ${activeTab === idx ? styles.tabActive : ''}`}
                    onClick={() => { setActiveTab(idx); setExpandedId(null) }}
                  >
                    Mã {exam.code}
                    <span className={styles.tabOriginLabel}>Gốc {exam.sourceIndex + 1}</span>
                  </button>
                ))}
              </div>

              {/* Questions list */}
              <div className={styles.questionsArea}>
                {currentExam && (
                  <div style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>
                    <strong>Mã đề {currentExam.code}</strong> • Từ đề gốc {currentExam.sourceIndex + 1} • {currentQuestions.length} câu
                  </div>
                )}

                {Object.keys(groupedQuestions).map(Number).sort((a, b) => a - b).map(phanKey => {
                  const phanQuestions = groupedQuestions[phanKey]
                  let globalIdx = 0
                  // Count questions before this phan
                  for (const k of Object.keys(groupedQuestions).map(Number).sort((a, b) => a - b)) {
                    if (k < phanKey) globalIdx += groupedQuestions[k].length
                  }

                  return (
                    <Fragment key={phanKey}>
                      <div className={styles.phanHeader}>
                        <span className={styles.phanTitle}>{PHAN_LABELS[phanKey] || `Phần ${phanKey}`}</span>
                        <span className={styles.phanCount}>({phanQuestions.length} câu)</span>
                      </div>
                      {phanQuestions.map((q, qi) => {
                        const num = globalIdx + qi + 1
                        const isExpanded = expandedId === `${activeTab}-${q.id}-${qi}`
                        const expandKey = `${activeTab}-${q.id}-${qi}`

                        return (
                          <div
                            key={expandKey}
                            className={styles.questionRow}
                            onClick={() => setExpandedId(isExpanded ? null : expandKey)}
                          >
                            <div className={styles.questionNum}>{num}</div>
                            <div className={styles.questionInfo}>
                              <div className={styles.questionMeta}>
                                {TYPE_ICONS[q.question_type]} {TYPE_LABELS[q.question_type] || q.question_type}
                                {' • '}
                                {DIFFICULTY_LABELS[q.difficulty] || q.difficulty}
                                {q.correct_answer && <span style={{ marginLeft: 8, color: '#16a34a', fontWeight: 600 }}>ĐA: {q.correct_answer}</span>}
                              </div>
                              <div className={styles.questionDesc}>{q.mo_ta || q.category_code}</div>
                              {isExpanded && (
                                <div className={styles.questionExpanded}>
                                  <pre
                                    style={{
                                      margin: 0, padding: '12px', background: 'white',
                                      border: '1px solid #cbd5e1', borderRadius: '6px',
                                      fontSize: '12px', whiteSpace: 'pre-wrap', fontFamily: 'monospace',
                                      color: '#334155', maxHeight: '300px', overflowY: 'auto',
                                    }}
                                  >
                                    {q.latex_content}
                                  </pre>
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </Fragment>
                  )
                })}
              </div>

              {/* Footer with export */}
              <div className={styles.footerBar}>
                <div style={{ display: 'flex', gap: 12, marginLeft: 'auto' }}>
                  <button
                    onClick={() => setShowExportModal(true)}
                    className={styles.exportBtn}
                  >
                    📥 Xuất file .tex
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ═══ EXPORT MODAL ═══ */}
      {showExportModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.65)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'white', borderRadius: 16, width: '100%', maxWidth: 1120, padding: 24, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#0f172a' }}>📝 Xuất file LaTeX</h3>
              </div>
              <button onClick={() => setShowExportModal(false)} style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8' }}>✕</button>
            </div>

            <div style={{ display: 'flex', gap: 24 }}>
              {/* ── LEFT COLUMN (Main Content) ── */}
              <div style={{ flex: '1 1 65%', display: 'flex', flexDirection: 'column' }}>
                {/* ── Shared Formatting Toolbar ── */}
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 12, padding: '8px 12px', background: '#f1f5f9', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                  <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600, marginRight: 4 }}>Định dạng:</span>
              {(['bold', 'italic', 'underline'] as const).map(prop => (
                <button key={prop} type="button" disabled={selectedLine === null || selectedLine === 3} onClick={() => {
                  if (selectedLine === null || selectedLine === 3) return
                  const ns = [...headerStyles]; ns[selectedLine] = { ...ns[selectedLine], [prop]: !ns[selectedLine][prop] }; setHeaderStyles(ns)
                }} style={{
                  width: 30, height: 30, borderRadius: 6, border: `1.5px solid ${selectedLine !== null && selectedLine !== 3 && headerStyles[selectedLine]?.[prop] ? '#3b82f6' : '#cbd5e1'}`,
                  background: selectedLine !== null && selectedLine !== 3 && headerStyles[selectedLine]?.[prop] ? '#dbeafe' : 'white',
                  cursor: selectedLine === null || selectedLine === 3 ? 'not-allowed' : 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: prop === 'bold' ? 700 : 400, fontStyle: prop === 'italic' ? 'italic' : 'normal',
                  textDecoration: prop === 'underline' ? 'underline' : 'none',
                  color: selectedLine !== null && selectedLine !== 3 && headerStyles[selectedLine]?.[prop] ? '#1d4ed8' : '#94a3b8',
                  opacity: selectedLine === null || selectedLine === 3 ? 0.5 : 1,
                  transition: 'all 0.15s',
                }}>
                  {prop === 'bold' ? 'B' : prop === 'italic' ? 'I' : 'U'}
                </button>
              ))}
              <select value={selectedLine !== null && selectedLine !== 3 ? headerStyles[selectedLine]?.color || '' : ''}
                disabled={selectedLine === null || selectedLine === 3}
                onChange={e => {
                  if (selectedLine === null || selectedLine === 3) return
                  const ns = [...headerStyles]; ns[selectedLine] = { ...ns[selectedLine], color: e.target.value }; setHeaderStyles(ns)
                }} style={{
                  height: 30, padding: '0 8px', borderRadius: 6, border: '1.5px solid #cbd5e1', fontSize: 12, cursor: selectedLine === null || selectedLine === 3 ? 'not-allowed' : 'pointer',
                  background: selectedLine !== null && selectedLine !== 3 && headerStyles[selectedLine]?.color ? headerStyles[selectedLine].color : 'white',
                  color: selectedLine !== null && selectedLine !== 3 && headerStyles[selectedLine]?.color ? 'white' : '#64748b',
                  opacity: selectedLine === null || selectedLine === 3 ? 0.5 : 1,
                  transition: 'all 0.15s',
                }}>
                <option value="">🎨 Màu</option>
                {LATEX_COLORS.filter(c => c).map(c => <option key={c} value={c} style={{ background: c, color: 'white' }}>{c}</option>)}
              </select>
              {selectedLine !== null && selectedLine !== 3 && (
                <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 'auto', fontStyle: 'italic' }}>Đang sửa dòng {selectedLine + 1}</span>
              )}
            </div>

            {/* ── WYSIWYG Editable Preview ── */}
            <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, padding: '16px', marginBottom: 16 }} onClick={e => { if (e.target === e.currentTarget) setSelectedLine(null) }}>
              <div style={{ display: 'flex', gap: 0 }}>
                {/* Left column */}
                <div style={{ flex: '0 0 45%', textAlign: 'center', padding: '4px 8px' }}>
                  {[0, 1, 2, 3].map(i => {
                    const s = headerStyles[i]
                    const isSelected = selectedLine === i
                    const isLocked = i === 3
                    return (
                      <div key={i}
                        onClick={e => { e.stopPropagation(); if (!isLocked) setSelectedLine(i) }}
                        style={{
                          padding: '3px 6px', borderRadius: 4, marginBottom: 2, cursor: isLocked ? 'default' : 'text',
                          outline: isSelected ? '2px solid #3b82f6' : 'none', outlineOffset: 1,
                          background: isSelected ? '#eff6ff' : 'transparent',
                          transition: 'all 0.15s',
                          fontSize: i === 0 ? '13px' : '12px',
                          fontWeight: s.bold ? 700 : 400, fontStyle: isLocked ? 'italic' : (s.italic ? 'italic' : 'normal'),
                          textDecoration: s.underline ? 'underline' : 'none', color: isLocked ? '#9ca3af' : (s.color || 'inherit'),
                        }}
                        onMouseEnter={e => { if (!isLocked && !isSelected) (e.currentTarget as HTMLElement).style.background = '#f8fafc' }}
                        onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                      >
                        {isLocked ? '(Đề thi gồm có X trang) 🔒' : (
                          isSelected ? (
                            <input type="text" value={headerLabels[i]} autoFocus
                              onChange={e => { const n = [...headerLabels]; n[i] = e.target.value; setHeaderLabels(n) }}
                              onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') setSelectedLine(null) }}
                              style={{ width: '100%', textAlign: 'center', border: 'none', outline: 'none', background: 'transparent', fontSize: 'inherit', fontWeight: 'inherit', fontStyle: 'inherit', textDecoration: 'inherit', color: 'inherit', padding: 0 }}
                            />
                          ) : (headerLabels[i] || '...')
                        )}
                      </div>
                    )
                  })}
                </div>
                {/* Right column */}
                <div style={{ flex: '0 0 55%', textAlign: 'center', padding: '4px 8px' }}>
                  {[4, 5, 6, 7].map(i => {
                    const s = headerStyles[i]
                    const isSelected = selectedLine === i
                    return (
                      <div key={i}
                        onClick={e => { e.stopPropagation(); setSelectedLine(i) }}
                        style={{
                          padding: '3px 6px', borderRadius: 4, marginBottom: 2, cursor: 'text',
                          outline: isSelected ? '2px solid #3b82f6' : 'none', outlineOffset: 1,
                          background: isSelected ? '#eff6ff' : 'transparent',
                          transition: 'all 0.15s',
                          fontSize: i === 4 ? '13px' : '12px',
                          fontWeight: s.bold ? 700 : 400, fontStyle: s.italic ? 'italic' : 'normal',
                          textDecoration: s.underline ? 'underline' : 'none', color: s.color || 'inherit',
                        }}
                        onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = '#f8fafc' }}
                        onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                      >
                        {isSelected ? (
                          <input type="text" value={headerLabels[i]} autoFocus
                            onChange={e => { const n = [...headerLabels]; n[i] = e.target.value; setHeaderLabels(n) }}
                            onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') setSelectedLine(null) }}
                            style={{ width: '100%', textAlign: 'center', border: 'none', outline: 'none', background: 'transparent', fontSize: 'inherit', fontWeight: 'inherit', fontStyle: 'inherit', textDecoration: 'inherit', color: 'inherit', padding: 0 }}
                          />
                        ) : (headerLabels[i] || '...')}
                      </div>
                    )
                  })}
                </div>
              </div>
              <div style={{ borderTop: '2px double #94a3b8', marginTop: '6px', paddingTop: '6px', display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748b' }}>
                <span style={{ fontStyle: 'italic' }}>Họ và tên thí sinh: .........................</span>
                <span style={{ fontStyle: 'italic' }}>Số báo danh: ....................</span>
                <span style={{ fontWeight: 700, border: '1px solid #333', padding: '1px 6px', fontSize: '12px', color: '#2563eb' }}>{shuffledExams[0]?.code || '1234'}</span>
              </div>
              <div style={{ textAlign: 'center', fontSize: 10, color: '#94a3b8', marginTop: 6 }}>💡 Click vào dòng để chỉnh sửa • Dùng toolbar phía trên để định dạng</div>
            </div>

            {/* All codes display */}
            <div style={{ background: '#f0fdf4', padding: 16, borderRadius: 10, marginBottom: 16, border: '1px solid #bbf7d0' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#166534', letterSpacing: '0.05em', marginBottom: 8 }}>
                MÃ ĐỀ THI ({shuffledExams.length} mã đề)
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                {shuffledExams.map((exam, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 11, color: '#64748b' }}>Gốc {exam.sourceIndex + 1}:</span>
                    <span style={{
                      padding: '4px 10px', background: 'white', border: '2px solid #86efac',
                      borderRadius: 6, fontWeight: 700, fontSize: 14, color: '#166534',
                      fontFamily: 'monospace', letterSpacing: 2
                    }}>{exam.code}</span>
                  </div>
                ))}
              </div>
            </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginTop: 'auto', paddingTop: 16 }}>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <button onClick={() => setShowExportModal(false)} style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#f8fafc', color: '#475569', cursor: 'pointer', fontSize: 14, fontWeight: 500 }}>Hủy bỏ</button>
                    <button onClick={() => { setShowExportModal(false); handleExportTex() }} style={{ padding: '10px 24px', borderRadius: 8, border: 'none', background: '#10b981', color: 'white', cursor: 'pointer', fontSize: 14, fontWeight: 700, boxShadow: '0 4px 6px rgba(16,185,129,0.3)' }}>📥 Xuất file .tex</button>
                  </div>
                </div>
              </div>

              {/* ── RIGHT COLUMN (Options) ── */}
              <div style={{ flex: '0 0 280px', background: '#f8fafc', borderRadius: '12px', padding: '16px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tùy chọn xuất</h4>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>Bảng đáp án Excel:</label>
                  <select 
                    value={excelOption} 
                    onChange={e => setExcelOption(e.target.value)}
                    style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, outline: 'none', background: 'white' }}
                  >
                    <option value="none">Không xuất bảng đáp án</option>
                    <option value="all">Xuất tất cả các loại bảng</option>
                    <option value="azota">Xuất bảng Azota</option>
                    <option value="tnmaker">Xuất bảng TNMaker</option>
                    <option value="olm">Xuất bảng OLM</option>
                  </select>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: '#334155', background: 'white', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1' }}>
                    <input type="checkbox" checked={includeAnswerTable} onChange={e => setIncludeAnswerTable(e.target.checked)} style={{ width: 16, height: 16, accentColor: '#10b981', cursor: 'pointer' }} />
                    <span style={{ flex: 1 }}>Thêm Bảng đáp án cuối đề <i>(indapan)</i></span>
                  </label>
                </div>

                {/* Placeholders for future options */}
                <div style={{ flex: 1, border: '2px dashed #cbd5e1', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.5, minHeight: 100 }}>
                  <span style={{ fontSize: 12, color: '#64748b', fontStyle: 'italic' }}>Không gian chờ cập nhật...</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      <VipModal isOpen={showVipModal} onClose={() => setShowVipModal(false)} reason={vipReason} detail={vipDetail} />
    </div>
  )
}
