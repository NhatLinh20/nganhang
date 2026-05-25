'use client'

import { useState, useEffect, useCallback, Fragment } from 'react'
import { useRouter } from 'next/navigation'
import styles from './examCreator.module.css'
import tableStyles from '../../admin/questions/questions.module.css'
import { CHAPTER_NAMES, LESSON_NAMES, VARIANT_NAMES } from '@/lib/curriculum-labels'
import { CURRICULUM } from '../../admin/questions/QuestionsClient'

// Re-use types from AI exam
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

interface Selection {
  grade: number
  subject_area: string
  chapter: number
  lesson: number
  variant: number
  difficulty: string
  question_type: string
  count: number
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

interface ExamExamEntry {
  questions: ExamQuestion[]
  stats: { requested: number; found: number }
}

const DIFFICULTY_LABELS: Record<string, string> = { N: 'Nhận biết', H: 'Thông hiểu', V: 'Vận dụng', C: 'Vận dụng cao' }
const TYPE_LABELS: Record<string, string> = { multiple_choice: 'TN', true_false: 'Đ/S', short_answer: 'Ngắn', essay: 'Tự luận' }
const SUBJECT_LABELS: Record<string, string> = { D: 'Đại số', H: 'Hình học', C: 'Chuyên đề' }
const TYPE_ICONS: Record<string, string> = { multiple_choice: '⏺', true_false: '☑', short_answer: '✍', essay: '📝' }

const generateExamCode = (): string => String(Math.floor(1000 + Math.random() * 9000))

const generateUniqueExamCodes = (count: number): string[] => {
  const codes = new Set<string>()
  while (codes.size < count) {
    codes.add(generateExamCode())
  }
  return Array.from(codes)
}

export default function ExamCreatorClient({ userRole }: { userRole: string }) {
  const router = useRouter()
  // ─── MAIN LAYOUT STATE ──────────────────────────────────────────────────────
  const [mainTab, setMainTab] = useState<'config' | 'result'>('config')

  // ─── LEFT PANEL (CONFIG) STATES ─────────────────────────────────────────────
  const [filterGrade, setFilterGrade] = useState<number>(12)
  const [filterSubject, setFilterSubject] = useState<string>('D')
  const [filterChapter, setFilterChapter] = useState<number>(1)
  const [filterLesson, setFilterLesson] = useState<string>('')
  const [filterVariant, setFilterVariant] = useState<string>('')
  const [filterType, setFilterType] = useState<string>('')
  
  const [statsData, setStatsData] = useState<VariantStatsRow[]>([])
  const [loadingStats, setLoadingStats] = useState(false)
  
  // selections[lesson|variant|type|diff] = count
  const [selections, setSelections] = useState<Record<string, number>>({})
  
  const [configTitle, setConfigTitle] = useState('Đề kiểm tra')
  const [configDuration, setConfigDuration] = useState(90)
  const [configNumExams, setConfigNumExams] = useState(1)
  
  // ─── RIGHT PANEL (RESULT) STATES ────────────────────────────────────────────
  const [loadingGenerate, setLoadingGenerate] = useState(false)
  const [hasGenerated, setHasGenerated] = useState(false)
  const [activeExamIndex, setActiveExamIndex] = useState(0)
  
  const [questions, setQuestions] = useState<ExamQuestion[]>([])
  const [allExamsQuestions, setAllExamsQuestions] = useState<ExamQuestion[][]>([])
  const [examStats, setExamStats] = useState({ requested: 0, found: 0 })
  const [warnings, setWarnings] = useState<string[]>([])
  
  const [expandedId, setExpandedId] = useState<string | null>(null)
  
  // Swap
  const [swappingId, setSwappingId] = useState<string | null>(null)
  const [swappedOutIds, setSwappedOutIds] = useState<string[]>([])
  const [customSwapQuestion, setCustomSwapQuestion] = useState<ExamQuestion | null>(null)
  const [customAddPhan, setCustomAddPhan] = useState<number | null>(null)
  
  // Custom Swap Modal Filters
  const [customGrade, setCustomGrade] = useState<number>(12)
  const [customSubject, setCustomSubject] = useState<string>('D')
  const [customChapter, setCustomChapter] = useState<string>('')
  const [customLesson, setCustomLesson] = useState<string>('')
  const [customType, setCustomType] = useState<string>('multiple_choice')
  const [customDifficulty, setCustomDifficulty] = useState<string>('H')
  const [customVariant, setCustomVariant] = useState<string>('')

  // Export
  const [showExportModal, setShowExportModal] = useState(false)
  const [examCodes, setExamCodes] = useState<string[]>([''])
  const [headerLabels, setHeaderLabels] = useState<string[]>([
    'SỞ GDĐT ...',
    'TRƯỜNG THPT ...',
    'Đề chính thức',
    '(Đề thi gồm có 0\\zpageref{\\made-lastpage} trang)',
    'ĐỀ KIỂM TRA',
    'Môn: TOÁN',
    'Thời gian làm bài: 90 phút',
    '(Không kể thời gian phát đề)'
  ])
  const [headerStyles, setHeaderStyles] = useState<{ bold: boolean; italic: boolean; underline: boolean; color: string }[]>(
    Array.from({ length: 8 }, () => ({ bold: false, italic: false, underline: false, color: '' }))
  )
  const LATEX_COLORS = ['', 'red', 'blue', 'green', 'purple', 'orange', 'brown', 'cyan', 'magenta']
  const [selectedLine, setSelectedLine] = useState<number | null>(null)
  const [excelOption, setExcelOption] = useState<string>('none')
  const [includeAnswerTable, setIncludeAnswerTable] = useState<boolean>(true)

  // ─── EFFECTS ────────────────────────────────────────────────────────────────
  const [isLoaded, setIsLoaded] = useState(false)
  
  useEffect(() => {
    try {
      const saved = localStorage.getItem('manual-exam-state')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed.mainTab) setMainTab(parsed.mainTab)
        if (parsed.filterGrade) setFilterGrade(parsed.filterGrade)
        if (parsed.filterSubject) setFilterSubject(parsed.filterSubject)
        if (parsed.filterChapter !== undefined) setFilterChapter(parsed.filterChapter)
        if (parsed.filterLesson) setFilterLesson(parsed.filterLesson)
        if (parsed.filterVariant) setFilterVariant(parsed.filterVariant)
        if (parsed.filterType) setFilterType(parsed.filterType)
        if (parsed.selections) setSelections(parsed.selections)
        if (parsed.configTitle !== undefined) setConfigTitle(parsed.configTitle)
        if (parsed.configDuration) setConfigDuration(parsed.configDuration)
        if (parsed.configNumExams) setConfigNumExams(parsed.configNumExams)
        if (parsed.hasGenerated) setHasGenerated(parsed.hasGenerated)
        if (parsed.activeExamIndex !== undefined) setActiveExamIndex(parsed.activeExamIndex)
        if (parsed.questions) setQuestions(parsed.questions)
        if (parsed.allExamsQuestions) setAllExamsQuestions(parsed.allExamsQuestions)
        if (parsed.examStats) setExamStats(parsed.examStats)
        if (parsed.warnings) setWarnings(parsed.warnings)
        if (parsed.swappedOutIds) setSwappedOutIds(parsed.swappedOutIds)
        if (parsed.examCodes) setExamCodes(parsed.examCodes)
        if (parsed.headerLabels) setHeaderLabels(parsed.headerLabels)
        if (parsed.excelOption) setExcelOption(parsed.excelOption)
      }
    } catch (e) {
      console.error('Failed to load manual exam state', e)
    }
    setIsLoaded(true)
  }, [])

  useEffect(() => {
    if (!isLoaded) return
    const stateToSave = {
      mainTab, filterGrade, filterSubject, filterChapter, filterLesson, filterVariant, filterType,
      selections, configTitle, configDuration, configNumExams,
      hasGenerated, activeExamIndex, questions, allExamsQuestions,
      examStats, warnings, swappedOutIds, examCodes, headerLabels, excelOption
    }
    try {
      localStorage.setItem('manual-exam-state', JSON.stringify(stateToSave))
    } catch (e) {
      console.error('Failed to save manual exam state', e)
    }
  }, [
    isLoaded, mainTab, filterGrade, filterSubject, filterChapter, filterLesson, filterVariant, filterType,
    selections, configTitle, configDuration, configNumExams,
    hasGenerated, activeExamIndex, questions, allExamsQuestions,
    examStats, warnings, swappedOutIds, examCodes, headerLabels, excelOption
  ])

  const fetchStats = useCallback(async () => {
    if (!filterGrade || !filterSubject || filterChapter === undefined) return
    setLoadingStats(true)
    try {
      const res = await fetch(`/api/exams/stats?grade=${filterGrade}&subject_area=${filterSubject}&chapter=${filterChapter}`)
      const json = await res.json()
      if (json.error) {
        alert('Lỗi lấy thống kê: ' + json.error)
      } else {
        setStatsData(json.data || [])
      }
    } catch (err) {
      alert('Lỗi kết nối: ' + (err instanceof Error ? err.message : 'Unknown'))
    } finally {
      setLoadingStats(false)
    }
  }, [filterGrade, filterSubject, filterChapter])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  useEffect(() => {
    if (allExamsQuestions.length > 0 && questions.length > 0) {
      setAllExamsQuestions(prev => {
        if (prev[activeExamIndex] === questions) return prev
        const next = [...prev]
        next[activeExamIndex] = questions
        return next
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questions])

  // ─── HANDLERS - CONFIG ────────────────────────────────────────────────────
  
  const handleCountChange = (lesson: number, variant: number, type: string, diff: string, value: string, max: number) => {
    const num = parseInt(value)
    const key = `${filterGrade}|${filterSubject}|${filterChapter}|${lesson}|${variant}|${type}|${diff}`
    
    setSelections(prev => {
      const next = { ...prev }
      if (isNaN(num) || num <= 0) {
        delete next[key]
      } else {
        next[key] = Math.min(num, max)
      }
      return next
    })
  }

  const handleClearSelections = () => {
    if (confirm('Bạn có chắc muốn xoá tất cả các ô đã chọn?')) {
      setSelections({})
    }
  }

  const handleReset = () => {
    if (window.confirm('Bạn có chắc chắn muốn làm mới trang? Toàn bộ dữ liệu đang làm việc sẽ bị xóa.')) {
      localStorage.removeItem('manual-exam-state')
      setMainTab('config')
      setFilterGrade(12)
      setFilterSubject('D')
      setFilterChapter(1)
      setFilterLesson('')
      setFilterVariant('')
      setFilterType('')
      setSelections({})
      setConfigTitle('Đề kiểm tra')
      setConfigDuration(90)
      setConfigNumExams(1)
      setHasGenerated(false)
      setActiveExamIndex(0)
      setQuestions([])
      setAllExamsQuestions([])
      setExamStats({ requested: 0, found: 0 })
      setWarnings([])
      setSwappedOutIds([])
      setExamCodes([''])
      setHeaderLabels([
        'SỞ GDĐT ...',
        'TRƯỜNG THPT ...',
        'Đề chính thức',
        '(Đề thi gồm có 0\\zpageref{\\made-lastpage} trang)',
        'ĐỀ KIỂM TRA',
        'Môn: TOÁN',
        'Thời gian làm bài: 90 phút',
        '(Không kể thời gian phát đề)'
      ])
      setHeaderStyles(Array.from({ length: 8 }, () => ({ bold: false, italic: false, underline: false, color: '' })))
      setExcelOption('none')
    }
  }

  const handleGenerate = async () => {
    const selectionArray: Selection[] = []
    
    Object.entries(selections).forEach(([key, count]) => {
      if (count > 0) {
        const parts = key.split('|')
        if (parts.length === 7) {
          const [g, s, c, l, v, t, d] = parts
          selectionArray.push({
            grade: parseInt(g),
            subject_area: s,
            chapter: parseInt(c),
            lesson: parseInt(l),
            variant: parseInt(v),
            question_type: t,
            difficulty: d,
            count
          })
        }
      }
    })

    if (selectionArray.length === 0) {
      alert('Vui lòng chọn ít nhất 1 câu hỏi!')
      return
    }

    setLoadingGenerate(true)
    setHasGenerated(true)
    setMainTab('result') // Tự động nhảy sang tab kết quả
    setWarnings([])

    try {
      const res = await fetch('/api/exams/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: configTitle,
          grade: filterGrade,
          duration_minutes: configDuration,
          num_exams: configNumExams,
          selections: selectionArray
        })
      })

      const data = await res.json()
      if (!res.ok) {
        alert('Lỗi tạo đề: ' + (data.error || 'Unknown error'))
        setHasGenerated(false)
        setMainTab('config')
        return
      }

      setExamStats(data.stats)
      if (data.warnings) setWarnings(data.warnings)

      if (data.exams && data.exams.length > 0) {
        const allQs = data.exams.map((e: ExamExamEntry) => e.questions as ExamQuestion[])
        setAllExamsQuestions(allQs)
        setQuestions(allQs[0])
        setActiveExamIndex(0)
        
        const codes = generateUniqueExamCodes(allQs.length)
        setExamCodes(codes)
      } else {
        setAllExamsQuestions([])
        setQuestions([])
      }
    } catch (err) {
      alert('Lỗi kết nối: ' + (err instanceof Error ? err.message : 'Unknown'))
      setHasGenerated(false)
      setMainTab('config')
    } finally {
      setLoadingGenerate(false)
    }
  }

  const getSelectedStats = () => {
    const stats = {
      types: { multiple_choice: 0, true_false: 0, short_answer: 0, essay: 0 },
      diffs: { N: 0, H: 0, V: 0, C: 0 },
      total: 0
    }
    
    Object.entries(selections).forEach(([key, count]) => {
      const parts = key.split('|')
      if (parts.length === 7) {
        const [, , , , , t, d] = parts
        stats.types[t as keyof typeof stats.types] += count
        stats.diffs[d as keyof typeof stats.diffs] += count
        stats.total += count
      }
    })
    return stats
  }
  const selStats = getSelectedStats()

  // ─── HANDLERS - RESULT ──────────────────────────────────────────────────────

  const handleRemoveQuestion = (id: string) => {
    setQuestions(prev => prev.filter(q => q.id !== id))
  }

  const handleSwapQuestion = async (question: ExamQuestion) => {
    if (swappingId) return
    setSwappingId(question.id)

    try {
      const res = await fetch('/api/ai/swap-question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grade: question.grade,
          subject_area: question.subject_area,
          chapter: question.chapter,
          lesson: question.lesson,
          variant: question.variant,
          difficulty: question.difficulty,
          question_type: question.question_type,
          excludeIds: [...questions.map(q => q.id), ...swappedOutIds],
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        alert('\u26a0\ufe0f ' + (data.error || 'Kh\u00f4ng th\u1ec3 thay th\u1ebf c\u00e2u h\u1ecfi.'))
        return
      }

      setQuestions(prev =>
        prev.map(q =>
          q.id === question.id
            ? { ...data.question, phan: question.phan, mo_ta: question.mo_ta }
            : q
        )
      )
      setSwappedOutIds(prev => [...prev, question.id])
    } catch (err) {
      alert('L\u1ed7i k\u1ebft n\u1ed1i: ' + (err instanceof Error ? err.message : 'Unknown'))
    } finally {
      setSwappingId(null)
    }
  }

  const handleCustomAddQuestion = async () => {
    if (customAddPhan === null) return
    const phan = customAddPhan
    setCustomAddPhan(null)
    
    if (swappingId) return
    setSwappingId('adding_new')

    try {
      const res = await fetch('/api/ai/swap-question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grade: customGrade,
          subject_area: customSubject,
          chapter: customChapter ? parseInt(customChapter) : null,
          lesson: customLesson ? parseInt(customLesson) : null,
          variant: customVariant ? parseInt(customVariant) : null,
          difficulty: customDifficulty,
          question_type: customType,
          excludeIds: [...questions.map(q => q.id), ...swappedOutIds],
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        alert('⚠️ ' + (data.error || 'Không tìm thấy câu hỏi phù hợp.'))
        return
      }

      setQuestions(prev => [
        ...prev,
        {
          ...data.question,
          phan: phan,
          mo_ta: `Thêm mới (${customGrade} - Bài ${customLesson || '?'})`
        }
      ])
    } catch (err) {
      alert('Lỗi kết nối: ' + (err instanceof Error ? err.message : 'Unknown'))
    } finally {
      setSwappingId(null)
    }
  }

  const handleCustomSwapQuestion = async () => {
    if (!customSwapQuestion) return
    const targetQ = customSwapQuestion
    setCustomSwapQuestion(null)
    
    if (swappingId) return
    setSwappingId(targetQ.id)

    try {
      const res = await fetch('/api/ai/swap-question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grade: customGrade,
          subject_area: customSubject,
          chapter: customChapter ? parseInt(customChapter) : null,
          lesson: customLesson ? parseInt(customLesson) : null,
          variant: customVariant ? parseInt(customVariant) : null,
          difficulty: customDifficulty,
          question_type: customType,
          excludeIds: [...questions.map(q => q.id), ...swappedOutIds],
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        alert('⚠️ ' + (data.error || 'Không tìm thấy câu hỏi phù hợp.'))
        return
      }

      setQuestions(prev =>
        prev.map(q =>
          q.id === targetQ.id
            ? { ...data.question, phan: targetQ.phan, mo_ta: `Đổi tùy chỉnh` }
            : q
        )
      )
      setSwappedOutIds(prev => [...prev, targetQ.id])
    } catch (err) {
      alert('Lỗi: ' + (err instanceof Error ? err.message : 'Unknown'))
    } finally {
      setSwappingId(null)
    }
  }


  const handleExportTex = async () => {
    if (questions.length === 0) return;
    
    const currentAllExams = [...allExamsQuestions];
    if (currentAllExams.length > 0) currentAllExams[activeExamIndex] = questions;
    
    // --- GIỚI HẠN GIÁO VIÊN: TỐI ĐA 30 CÂU/ĐỀ VÀ TỪNG PHẦN ---
    if (userRole !== 'admin') {
      const examsToCheck = currentAllExams.length > 0 ? currentAllExams : [questions];
      
      for (let i = 0; i < examsToCheck.length; i++) {
        const qs = examsToCheck[i];
        
        // Giới hạn tổng
        if (qs.length > 30) {
          alert('Tài khoản giáo viên chỉ được phép xuất tối đa 30 câu/đề. Vui lòng giảm số lượng câu hỏi và thử lại.');
          return;
        }

        // Giới hạn từng phần
        const mcCount = qs.filter(q => q.question_type === 'multiple_choice').length;
        const tfCount = qs.filter(q => q.question_type === 'true_false').length;
        const saCount = qs.filter(q => q.question_type === 'short_answer').length;
        const esCount = qs.filter(q => q.question_type === 'essay').length;

        if (mcCount > 25 || tfCount > 4 || saCount > 6 || esCount > 6) {
          alert(`Tài khoản giáo viên bị giới hạn số câu ở đề số ${i+1}:\n- Trắc nghiệm: tối đa 25 câu (đang có ${mcCount})\n- Đúng/Sai: tối đa 4 câu (đang có ${tfCount})\n- Trả lời ngắn: tối đa 6 câu (đang có ${saCount})\n- Tự luận: tối đa 6 câu (đang có ${esCount})\n\nVui lòng giảm bớt câu hỏi để tiếp tục.`);
          return;
        }
      }
    }

    try {
      const payload: any = {
        title: configTitle || 'De_Thi',
        headerLabels,
        headerStyles,
        examCodes: currentAllExams.length > 1 ? examCodes : undefined,
        duration: configDuration || 90,
        grade: filterGrade || 12,
        excelOption,
        includeAnswerTable,
      };

      if (currentAllExams.length > 1) {
        payload.exams = currentAllExams.map(qs => ({
          questions: qs.map(q => ({
            id: q.id,
            latex_content: q.latex_content,
            question_type: q.question_type,
            correct_answer: q.correct_answer ?? '',
            phan: q.phan,
          })),
        }));
      } else {
        payload.questions = questions.map(q => ({
          id: q.id,
          latex_content: q.latex_content,
          question_type: q.question_type,
          correct_answer: q.correct_answer ?? '',
          phan: q.phan,
        }));
      }

      const res = await fetch('/api/export-zip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const json = await res.json();
        alert('❌ Xuất ZIP thất bại: ' + (json.error || 'Lỗi'));
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      const sanitizedTitle = configTitle.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
      link.download = `${sanitizedTitle || 'exam_package'}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('Lỗi kết nối: ' + (err instanceof Error ? err.message : 'Unknown'));
    }
  };

  const groupedQuestions = questions.reduce((acc, q) => {
    const key = q.phan ?? 0
    if (!acc[key]) acc[key] = []
    acc[key].push(q)
    return acc
  }, {} as Record<number, ExamQuestion[]>)

  const chsMap = CURRICULUM[filterGrade]?.[filterSubject] || {}
  const availableChapters = Object.keys(chsMap).map(Number)
  const availableLessons = filterChapter && chsMap[filterChapter] 
    ? Object.keys(chsMap[filterChapter]).map(Number) 
    : []
  const availableVariants = filterChapter && filterLesson && chsMap[filterChapter]?.[Number(filterLesson)]
    ? chsMap[filterChapter][Number(filterLesson)]
    : []
  
  const customChsMap = CURRICULUM[customGrade]?.[customSubject] || {}
  const availableCustomChapters = Object.keys(customChsMap).map(Number)
  const availableCustomLessons = customChapter !== '' && customChsMap[Number(customChapter)] 
    ? Object.keys(customChsMap[Number(customChapter)]).map(Number) 
    : []
  const availableCustomVariants = customGrade && customSubject && customChapter !== '' && customLesson !== ''
    ? (CURRICULUM[customGrade]?.[customSubject]?.[Number(customChapter)]?.[Number(customLesson)] || [])
    : []

  return (
    <div className={styles.page}>
      
      {/* ─── MAIN TABS ─── */}
      <div className={styles.mainTabs}>
        <div style={{ display: 'flex' }}>
          <button 
            onClick={() => setMainTab('config')} 
            className={`${styles.mainTab} ${mainTab === 'config' ? styles.mainTabActive : ''}`}
          >
            <span className={styles.tabIcon}>⚙️</span> 1. Thiết lập & Chọn câu
          </button>
          <button 
            onClick={() => setMainTab('result')} 
            disabled={!hasGenerated} 
            className={`${styles.mainTab} ${mainTab === 'result' ? styles.mainTabActive : ''}`}
          >
            <span className={styles.tabIcon}>📝</span> 2. Kết quả tạo đề
          </button>
          
          <button
            onClick={handleReset}
            style={{
              marginLeft: '12px',
              padding: '6px 10px',
              background: '#fef2f2',
              border: '1px solid #fca5a5',
              borderRadius: '6px',
              color: '#dc2626',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              alignSelf: 'center',
              whiteSpace: 'nowrap'
            }}
            title="Làm mới trang (Xóa toàn bộ dữ liệu đang làm việc)"
          >
            🧹 Làm mới
          </button>
        </div>

        {/* ─── TOP ACTION BAR ─── */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '16px', padding: '8px 0' }}>
          <div className={styles.configInputs}>
            <div className={styles.configInputGroup} style={{ width: 250 }}>
              <input 
                type="text" 
                placeholder="Tên đề thi (VD: Đề kiểm tra 15p)"
                value={configTitle}
                onChange={e => setConfigTitle(e.target.value)}
                className={styles.configInput}
                style={{ padding: '8px 12px' }}
              />
            </div>
            <div className={styles.configInputGroup} style={{ width: 100, position: 'relative' }}>
              <input 
                type="number" 
                min={1} max={userRole !== 'admin' ? 4 : 20}
                value={configNumExams}
                onChange={e => {
                  let val = parseInt(e.target.value) || 1;
                  if (userRole !== 'admin' && val > 4) val = 4;
                  setConfigNumExams(val);
                }}
                className={styles.configInput}
                style={{ padding: '8px 12px', paddingRight: '28px' }}
                title="Số lượng đề"
              />
              <span style={{ position: 'absolute', right: '10px', top: '9px', fontSize: '13px', color: '#94a3b8', pointerEvents: 'none' }}>đề</span>
            </div>
            <div className={styles.configInputGroup} style={{ width: 110, position: 'relative' }}>
              <input 
                type="number"
                min={1}
                value={configDuration}
                onChange={e => setConfigDuration(parseInt(e.target.value) || 90)}
                className={styles.configInput}
                style={{ padding: '8px 12px', paddingRight: '40px' }}
                title="Thời gian làm bài"
              />
              <span style={{ position: 'absolute', right: '10px', top: '9px', fontSize: '13px', color: '#94a3b8', pointerEvents: 'none' }}>phút</span>
            </div>
          </div>

          <button 
            className={styles.generateBtn}
            onClick={handleGenerate}
            disabled={loadingGenerate || selStats.total === 0}
            style={{ padding: '8px 16px', fontSize: '13px', height: '100%', whiteSpace: 'nowrap' }}
          >
            {loadingGenerate ? '⏳ ĐANG TẠO...' : `✨ TẠO ${configNumExams} ĐỀ`}
          </button>
        </div>
      </div>

      <div className={styles.viewContainer}>
        {/* ══════════════════════════════════════════════════════════════════════
            CONFIG VIEW (Full Width)
            ══════════════════════════════════════════════════════════════════════ */}
        {mainTab === 'config' && (
          <div className={styles.configView}>
            
            {/* Top Bar: Filters */}
            <div className={styles.configTopBar}>
              <div className={styles.filterRow}>
                <div className={styles.filterGroup}>
                  <label className={styles.filterLabel}>Lớp</label>
                  <select className={styles.filterSelect} value={filterGrade} onChange={e => {
                    setFilterGrade(Number(e.target.value))
                    setFilterChapter(1)
                  }}>
                    <option value={10}>Lớp 10</option>
                    <option value={11}>Lớp 11</option>
                    <option value={12}>Lớp 12</option>
                  </select>
                </div>
                
                <div className={styles.filterGroup}>
                  <label className={styles.filterLabel}>Phân môn</label>
                  <select className={styles.filterSelect} value={filterSubject} onChange={e => {
                    setFilterSubject(e.target.value)
                    setFilterChapter(1)
                  }}>
                    <option value="D">Đại số / XS</option>
                    <option value="H">Hình học</option>
                  </select>
                </div>
                
                <div className={styles.filterGroup}>
                  <label className={styles.filterLabel}>Chương</label>
                  <select className={styles.filterSelect} value={filterChapter} onChange={e => {
                    setFilterChapter(Number(e.target.value))
                    setFilterLesson('')
                    setFilterVariant('')
                  }}>
                    {availableChapters.map(ch => (
                      <option key={ch} value={ch}>{CHAPTER_NAMES[filterGrade]?.[filterSubject]?.[ch] || `Chương ${ch}`}</option>
                    ))}
                    {availableChapters.length === 0 && <option value="">(Không có dữ liệu)</option>}
                  </select>
                </div>

                <div className={styles.filterGroup}>
                  <label className={styles.filterLabel}>Bài</label>
                  <select className={styles.filterSelect} value={filterLesson} onChange={e => {
                    setFilterLesson(e.target.value)
                    setFilterVariant('')
                  }}>
                    <option value="">Tất cả</option>
                    {availableLessons.map(l => (
                      <option key={l} value={l}>Bài {l}</option>
                    ))}
                  </select>
                </div>
                
                <div className={styles.filterGroup}>
                  <label className={styles.filterLabel}>Dạng</label>
                  <select className={styles.filterSelect} value={filterVariant} onChange={e => setFilterVariant(e.target.value)}>
                    <option value="">Tất cả</option>
                    {availableVariants.map(v => (
                      <option key={v} value={v}>Dạng {v}</option>
                    ))}
                  </select>
                </div>

                <div className={styles.filterGroup}>
                  <label className={styles.filterLabel}>Loại câu</label>
                  <select className={styles.filterSelect} value={filterType} onChange={e => setFilterType(e.target.value)}>
                    <option value="">Tất cả</option>
                    <option value="multiple_choice">Trắc nghiệm</option>
                    <option value="true_false">Đúng/Sai</option>
                    <option value="short_answer">Trả lời ngắn</option>
                    <option value="essay">Tự luận</option>
                  </select>
                </div>
              </div>

              {/* Summary Row */}
              <div className={styles.summaryRow}>
                <span className={styles.summaryLabel}>Đã chọn: {selStats.total} câu</span>
                
                <div className={styles.summaryBadges}>
                  <span className={`${styles.summaryBadge} ${styles.mc} ${selStats.types.multiple_choice ? '' : styles.zero}`}>TN: {selStats.types.multiple_choice}</span>
                  <span className={`${styles.summaryBadge} ${styles.tf} ${selStats.types.true_false ? '' : styles.zero}`}>Đ/S: {selStats.types.true_false}</span>
                  <span className={`${styles.summaryBadge} ${styles.sa} ${selStats.types.short_answer ? '' : styles.zero}`}>Ngắn: {selStats.types.short_answer}</span>
                  <span className={`${styles.summaryBadge} ${styles.es} ${selStats.types.essay ? '' : styles.zero}`}>TL: {selStats.types.essay}</span>
                </div>
                
                <div style={{ width: '1px', height: '16px', background: 'var(--color-border)' }} />
                
                <div className={styles.summaryBadges}>
                  <span className={`${styles.summaryBadge} ${styles.nb} ${selStats.diffs.N ? '' : styles.zero}`}>NB: {selStats.diffs.N}</span>
                  <span className={`${styles.summaryBadge} ${styles.th} ${selStats.diffs.H ? '' : styles.zero}`}>TH: {selStats.diffs.H}</span>
                  <span className={`${styles.summaryBadge} ${styles.vd} ${selStats.diffs.V ? '' : styles.zero}`}>VD: {selStats.diffs.V}</span>
                  <span className={`${styles.summaryBadge} ${styles.vdc} ${selStats.diffs.C ? '' : styles.zero}`}>VDC: {selStats.diffs.C}</span>
                </div>

                {selStats.total > 0 && (
                  <button className={styles.clearSelBtn} onClick={handleClearSelections}>✕ Xóa tất cả</button>
                )}
              </div>
            </div>

            {/* Stats Table */}
            <div className={styles.statsSection}>
              {loadingStats ? (
                <div className={styles.statsLoading}>
                  <div className={styles.statsSpinner} />
                  Đang tải dữ liệu ngân hàng...
                </div>
              ) : statsData.length === 0 ? (
                <div className={styles.statsEmpty}>
                  <div className={styles.statsEmptyIcon}>📭</div>
                  Không có câu hỏi nào trong chương này
                </div>
              ) : (
                <table className={styles.statsTable}>
                  <thead>
                    <tr>
                      <th style={{ minWidth: 300 }}>Bài / Dạng</th>
                      <th style={{ width: 100 }}>Loại</th>
                      <th className={styles.centered} title="Nhận biết">NB</th>
                      <th className={styles.centered} title="Thông hiểu">TH</th>
                      <th className={styles.centered} title="Vận dụng">VD</th>
                      <th className={styles.centered} title="Vận dụng cao">VDC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const filteredStatsData = statsData.filter(row => {
                        if (filterLesson && row.lesson !== Number(filterLesson)) return false
                        if (filterVariant && row.variant !== Number(filterVariant)) return false
                        if (filterType && row.question_type !== filterType) return false
                        return true
                      })

                      if (filteredStatsData.length === 0) {
                        return (
                          <tr>
                            <td colSpan={6} className={styles.statsEmpty} style={{ padding: '40px 20px' }}>
                              Không tìm thấy dữ liệu phù hợp với bộ lọc hiện tại.
                            </td>
                          </tr>
                        )
                      }

                      return filteredStatsData.map((row, idx) => {
                        const isNewLesson = idx === 0 || row.lesson !== filteredStatsData[idx-1].lesson;
                      
                      const countN = row.counts.N || 0
                      const countH = row.counts.H || 0
                      const countV = row.counts.V || 0
                      const countC = row.counts.C || 0
                      
                      const kBase = `${filterGrade}|${filterSubject}|${filterChapter}|${row.lesson}|${row.variant}|${row.question_type}`
                      const selN = selections[`${kBase}|N`] || 0
                      const selH = selections[`${kBase}|H`] || 0
                      const selV = selections[`${kBase}|V`] || 0
                      const selC = selections[`${kBase}|C`] || 0
                      const hasSel = selN > 0 || selH > 0 || selV > 0 || selC > 0

                      return (
                        <Fragment key={`${row.lesson}-${row.variant}-${row.question_type}`}>
                          {isNewLesson && (
                            <tr>
                              <td colSpan={6} className={styles.lessonGroupHeader}>
                                <span className={styles.lessonGroupHeaderText}>
                                  {row.lesson_name}
                                </span>
                              </td>
                            </tr>
                          )}
                          <tr className={`${styles.statsRow} ${hasSel ? styles.hasSelection : ''}`}>
                            <td className={styles.statsCell}>
                              <div style={{ lineHeight: 1.5 }}>
                                <span className={styles.variantName}>
                                  <span style={{ fontWeight: 700, color: '#0369a1', marginRight: '6px' }}>Dạng {row.variant}:</span>
                                  {row.variant_name}
                                </span>
                              </div>
                            </td>
                            <td className={styles.statsCell}>
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
                              <td key={lvl.key} className={`${styles.statsCell} ${styles.countCell}`}>
                                <div className={styles.countCellInner}>
                                  <input 
                                    type="number" 
                                    min={0} 
                                    max={lvl.max}
                                    value={lvl.sel || ''}
                                    placeholder="0"
                                    disabled={lvl.max === 0}
                                    className={`${styles.countInput} ${lvl.sel > 0 ? styles.hasValue : ''}`}
                                    onChange={e => handleCountChange(row.lesson, row.variant, row.question_type, lvl.key, e.target.value, lvl.max)}
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
                    })})()}
                  </tbody>
                </table>
              )}
            </div>



          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            RESULT VIEW (Full Width)
            ══════════════════════════════════════════════════════════════════════ */}
        {mainTab === 'result' && (
          <div className={styles.resultView}>
            
            <div className={styles.resultToolbar}>
              <div>
                <div className={styles.resultTitle}>
                  {configTitle || 'Kết quả tạo đề'}
                </div>
                <div className={styles.resultStats} style={{ marginTop: 8 }}>
                  <div className={styles.statBadge}>
                    Yêu cầu: <span className={styles.count}>{examStats.requested} câu</span>
                  </div>
                  <div className={styles.statBadge}>
                    Đã bốc: <span className={examStats.found < examStats.requested ? styles.countWarn : styles.count}>{questions.length} câu</span>
                  </div>
                  <div className={styles.statBadge}>
                    ⏱ {configDuration} phút
                  </div>
                </div>
              </div>
              
              <div className={styles.resultActions}>
                <button className="btn btn-secondary" onClick={() => setMainTab('config')} style={{ marginRight: 8 }}>
                  ⚙️ Chỉnh sửa cấu trúc
                </button>
                <button
                  className="btn"
                  onClick={() => {
                    const numExams = allExamsQuestions.length || 1
                    if (examCodes.length !== numExams || examCodes.some(c => !c)) {
                      const newCodes = generateUniqueExamCodes(numExams)
                      const merged = newCodes.map((nc, i) => (examCodes[i] && examCodes[i].length === 4) ? examCodes[i] : nc)
                      setExamCodes(merged)
                    }
                    setShowExportModal(true)
                  }}
                  disabled={questions.length === 0}
                  style={{ background: '#10b981', color: 'white', border: 'none', fontWeight: 600, padding: '8px 16px' }}
                >
                  📥 Xuất LaTeX
                </button>

                <button
                  className={styles.mainTab}
                  onClick={() => {
                    const currentAllExams = [...allExamsQuestions]
                    if (currentAllExams.length > 0) currentAllExams[activeExamIndex] = questions
                    const sourceExams = currentAllExams.length > 0
                      ? currentAllExams.map(qs => ({ questions: qs }))
                      : [{ questions }]
                    localStorage.setItem('shuffle-source-exams', JSON.stringify({
                      sourceExams,
                      headerLabels,
                      configTitle,
                      configDuration,
                      filterGrade,
                    }))
                    localStorage.removeItem('shuffle-page-state')
                    router.push('/teacher/shuffle')
                  }}
                  disabled={questions.length === 0}
                  style={{ background: '#6366f1', color: 'white', border: 'none', fontWeight: 600, padding: '8px 16px', borderRadius: 6, cursor: questions.length > 0 ? 'pointer' : 'not-allowed', opacity: questions.length > 0 ? 1 : 0.5 }}
                >
                  🔀 Chuyển sang Trộn đề
                </button>

              </div>
            </div>

            {warnings.length > 0 && (
              <div className={styles.warningBanner}>
                <strong>⚠️ Cảnh báo:</strong> Ngân hàng không đủ câu hỏi cho một số cấu trúc đã chọn, có thể dẫn đến trùng lặp giữa các mã đề.
              </div>
            )}

            {allExamsQuestions.length > 1 && (
              <div className={styles.examTabs}>
                {allExamsQuestions.map((qs, idx) => (
                  <button
                    key={idx}
                    className={`${styles.examTab} ${activeExamIndex === idx ? styles.examTabActive : ''}`}
                    onClick={() => {
                      setAllExamsQuestions(prev => {
                        const next = [...prev]
                        next[activeExamIndex] = questions
                        return next
                      })
                      setActiveExamIndex(idx)
                      setQuestions(allExamsQuestions[idx])
                      setExpandedId(null)
                    }}
                  >
                    📋 Đề {idx + 1}
                    <span className={`${styles.examTabBadge} ${activeExamIndex === idx ? styles.examTabBadgeActive : styles.examTabBadgeInactive}`}>
                      {qs.length} câu
                    </span>
                  </button>
                ))}
              </div>
            )}

            {questions.length > 0 && (
              <div className={styles.statsBar}>
                <div className={styles.statsBarGroup}>
                  <span className={styles.statsBarLabel}>Cấu trúc</span>
                  <span className={`${tableStyles.typeTag} ${tableStyles.mc}`}>TN: {questions.filter(q => q.question_type === 'multiple_choice').length}</span>
                  <span className={`${tableStyles.typeTag} ${tableStyles.tf}`}>Đ/S: {questions.filter(q => q.question_type === 'true_false').length}</span>
                  <span className={`${tableStyles.typeTag} ${tableStyles.short}`}>Ngắn: {questions.filter(q => q.question_type === 'short_answer').length}</span>
                  <span className={`${tableStyles.typeTag} ${tableStyles.essay}`}>TL: {questions.filter(q => q.question_type === 'essay').length}</span>
                </div>
                
                <div className={styles.statsBarDivider} />
                
                <div className={styles.statsBarGroup}>
                  <span className={styles.statsBarLabel}>Mức độ</span>
                  {['N', 'H', 'V', 'C'].map(diff => {
                    const count = questions.filter(q => q.difficulty === diff).length;
                    if (count === 0) return null;
                    return (
                      <span key={diff} className={`badge badge-${diff}`} style={{ padding: '4px 10px', fontSize: '13px' }}>
                        {DIFFICULTY_LABELS[diff]}: {count}
                      </span>
                    )
                  })}
                </div>
              </div>
            )}

            <div className={styles.questionTableArea}>
              <table className={styles.aiExamTable}>
                <thead>
                  <tr>
                    <th style={{ width: 50 }}>#</th>
                    <th>Phần</th>
                    <th>Mã ID</th>
                    <th>Lớp</th>
                    <th>Môn</th>
                    <th>Ch.</th>
                    <th>Bài</th>
                    <th>Mức độ</th>
                    <th>Loại</th>
                    <th>Đáp án</th>
                    <th style={{ width: 50 }}>🖼</th>
                    <th style={{ width: 120 }}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(groupedQuestions).sort(([a], [b]) => Number(a) - Number(b)).flatMap(([phan, phanQs], index) => {
                    const partNum = Number(phan)
                    const romanNumerals = ['I', 'II', 'III', 'IV']
                    const displayRoman = romanNumerals[index] || 'I'
                    const titleType = 
                      partNum === 1 ? 'TRẮC NGHIỆM 4 ĐÁP ÁN' :
                      partNum === 2 ? 'CÂU HỎI ĐÚNG/SAI' :
                      partNum === 3 ? 'TRẢ LỜI NGẮN' : 'TỰ LUẬN'
                    const partTitle = `PHẦN ${displayRoman}: ${titleType}`

                    return [
                      <tr key={`header-${phan}`} style={{ background: '#f8fafc' }}>
                        <td colSpan={12} style={{ padding: '12px 24px', borderTop: '2px solid #e2e8f0', borderBottom: '2px solid #e2e8f0' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontWeight: 700, fontSize: '14px', color: '#334155' }}>
                              📁 {partTitle} ({phanQs.length} câu)
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setCustomAddPhan(partNum)
                                setCustomType(partNum === 1 ? 'multiple_choice' : partNum === 2 ? 'true_false' : partNum === 3 ? 'short_answer' : 'essay')
                              }}
                              title="Thêm câu hỏi mới vào phần này"
                              style={{ padding: '4px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', background: 'white', color: '#0284c7', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}
                            >+ Thêm câu mới</button>
                          </div>
                        </td>
                      </tr>,
                      ...phanQs.map((q, idx) => (
                        <Fragment key={q.id}>
                          <tr 
                            style={{ cursor: 'pointer', background: expandedId === q.id ? '#f0f9ff' : 'white' }}
                            onClick={() => setExpandedId(expandedId === q.id ? null : q.id)}
                          >
                            <td style={{ fontWeight: 500, color: '#64748b' }}>{idx + 1}</td>
                            <td><span style={{ background: '#f1f5f9', padding: '2px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 600, color: '#475569' }}>P{phan}</span></td>
                            <td><span className={tableStyles.categoryCode} style={{ fontSize: '13px' }}>{q.category_code}</span></td>
                            <td>{q.grade}</td>
                            <td>{SUBJECT_LABELS[q.subject_area] || q.subject_area}</td>
                            <td>{q.chapter}</td>
                            <td>{q.lesson}</td>
                            <td><span className={`badge badge-${q.difficulty}`}>{DIFFICULTY_LABELS[q.difficulty]}</span></td>
                            <td>
                              <span className={`${tableStyles.typeTag} badge-${q.question_type === 'multiple_choice' ? 'mc' : q.question_type === 'true_false' ? 'tf' : q.question_type === 'short_answer' ? 'short' : 'essay'}`}>
                                {TYPE_ICONS[q.question_type]} {TYPE_LABELS[q.question_type]}
                              </span>
                            </td>
                            <td><span className={tableStyles.answerCell} style={{ maxWidth: 150 }}>{q.correct_answer || '—'}</span></td>
                            <td>{q.has_image ? '🖼️' : ''}</td>
                            <td>
                              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                <button
                                  title="Thay câu khác cùng dạng"
                                  onClick={(e) => { e.stopPropagation(); handleSwapQuestion(q) }}
                                  disabled={swappingId !== null}
                                  style={{ width: 28, height: 28, borderRadius: '6px', border: '1px solid #bae6fd', background: '#e0f2fe', color: '#0369a1', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                >{swappingId === q.id ? '⏳' : '🔄'}</button>
                                <button
                                  title="Hoán đổi tùy chỉnh"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setCustomSwapQuestion(q)
                                    setCustomGrade(q.grade || 12)
                                    setCustomSubject(q.subject_area || 'D')
                                    setCustomChapter(String(q.chapter || '1'))
                                    setCustomLesson(String(q.lesson || '1'))
                                    setCustomVariant(String(q.variant || ''))
                                    setCustomType(q.question_type || 'multiple_choice')
                                    setCustomDifficulty(q.difficulty || 'H')
                                  }}
                                  disabled={swappingId !== null}
                                  style={{ width: 28, height: 28, borderRadius: '6px', border: '1px solid #fef08a', background: '#fef9c3', color: '#854d0e', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                >🎲</button>
                                <button
                                  title="Xóa"
                                  onClick={(e) => { e.stopPropagation(); handleRemoveQuestion(q.id) }}
                                  style={{ width: 28, height: 28, borderRadius: '6px', border: '1px solid #fecaca', background: '#fee2e2', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                >✕</button>
                              </div>
                            </td>
                          </tr>
                          {expandedId === q.id && (
                            <tr>
                              <td colSpan={12} style={{ padding: 0 }}>
                                <div style={{ padding: '20px 24px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)' }}>
                                  <div style={{ fontWeight: 600, fontSize: '14px', color: '#334155', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span>Nội dung LaTeX</span>
                                    <span style={{ color: '#cbd5e1' }}>|</span>
                                    <span className={tableStyles.categoryCode}>{q.category_code}</span>
                                    {q.mo_ta && <span style={{ fontWeight: 400, color: '#64748b', fontSize: '13px' }}>— {q.mo_ta}</span>}
                                  </div>
                                  <pre 
                                    style={{ 
                                      margin: 0, padding: '16px', background: 'white', border: '1px solid #cbd5e1', 
                                      borderRadius: '8px', fontSize: '14px', whiteSpace: 'pre-wrap', fontFamily: 'monospace', 
                                      lineHeight: 1.6, color: '#1e293b',
                                      WebkitUserSelect: userRole !== 'admin' ? 'none' : undefined,
                                      MozUserSelect: userRole !== 'admin' ? 'none' : undefined,
                                      msUserSelect: userRole !== 'admin' ? 'none' : undefined,
                                      userSelect: userRole !== 'admin' ? 'none' : undefined
                                    }}
                                    onCopy={(e) => {
                                      if (userRole !== 'admin') {
                                        e.preventDefault()
                                        alert('Tính năng copy mã nguồn chỉ dành cho quản trị viên.')
                                      }
                                    }}
                                    onContextMenu={(e) => {
                                      if (userRole !== 'admin') {
                                        e.preventDefault()
                                      }
                                    }}
                                    onKeyDown={(e) => {
                                      if (userRole !== 'admin' && (e.ctrlKey || e.metaKey) && e.key === 'c') {
                                        e.preventDefault()
                                      }
                                    }}
                                  >
                                    {q.latex_content}
                                  </pre>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      ))
                    ]
                  })}
                </tbody>
              </table>
            </div>

          </div>
        )}

      </div>

      {/* ─── MODALS ───────────────────────────────────────────────────────────── */}


      {/* Export LaTeX Modal */}
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
                  opacity: selectedLine === null || selectedLine === 3 ? 0.5 : 1, transition: 'all 0.15s',
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
                  height: 30, padding: '0 8px', borderRadius: 6, border: '1.5px solid #cbd5e1', fontSize: 12,
                  cursor: selectedLine === null || selectedLine === 3 ? 'not-allowed' : 'pointer',
                  background: selectedLine !== null && selectedLine !== 3 && headerStyles[selectedLine]?.color ? headerStyles[selectedLine].color : 'white',
                  color: selectedLine !== null && selectedLine !== 3 && headerStyles[selectedLine]?.color ? 'white' : '#64748b',
                  opacity: selectedLine === null || selectedLine === 3 ? 0.5 : 1, transition: 'all 0.15s',
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
                <div style={{ flex: '0 0 45%', textAlign: 'center', padding: '4px 8px' }}>
                  {[0, 1, 2, 3].map(i => {
                    const s = headerStyles[i]; const isSelected = selectedLine === i; const isLocked = i === 3
                    return (
                      <div key={i} onClick={e => { e.stopPropagation(); if (!isLocked) setSelectedLine(i) }}
                        style={{ padding: '3px 6px', borderRadius: 4, marginBottom: 2, cursor: isLocked ? 'default' : 'text',
                          outline: isSelected ? '2px solid #3b82f6' : 'none', outlineOffset: 1,
                          background: isSelected ? '#eff6ff' : 'transparent', transition: 'all 0.15s',
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
                              style={{ width: '100%', textAlign: 'center', border: 'none', outline: 'none', background: 'transparent', fontSize: 'inherit', fontWeight: 'inherit', fontStyle: 'inherit', textDecoration: 'inherit', color: 'inherit', padding: 0 }} />
                          ) : (headerLabels[i] || '...')
                        )}
                      </div>
                    )
                  })}
                </div>
                <div style={{ flex: '0 0 55%', textAlign: 'center', padding: '4px 8px' }}>
                  {[4, 5, 6, 7].map(i => {
                    const s = headerStyles[i]; const isSelected = selectedLine === i
                    return (
                      <div key={i} onClick={e => { e.stopPropagation(); setSelectedLine(i) }}
                        style={{ padding: '3px 6px', borderRadius: 4, marginBottom: 2, cursor: 'text',
                          outline: isSelected ? '2px solid #3b82f6' : 'none', outlineOffset: 1,
                          background: isSelected ? '#eff6ff' : 'transparent', transition: 'all 0.15s',
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
                            style={{ width: '100%', textAlign: 'center', border: 'none', outline: 'none', background: 'transparent', fontSize: 'inherit', fontWeight: 'inherit', fontStyle: 'inherit', textDecoration: 'inherit', color: 'inherit', padding: 0 }} />
                        ) : (headerLabels[i] || '...')}
                      </div>
                    )
                  })}
                </div>
              </div>
              <div style={{ borderTop: '2px double #94a3b8', marginTop: '6px', paddingTop: '6px', display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748b' }}>
                <span style={{ fontStyle: 'italic' }}>Họ và tên thí sinh: .........................</span>
                <span style={{ fontStyle: 'italic' }}>Số báo danh: ....................</span>
                <span style={{ fontWeight: 700, border: '1px solid #333', padding: '1px 6px', fontSize: '12px', color: '#2563eb' }}>{examCodes[0] || '1234'}</span>
              </div>
              <div style={{ textAlign: 'center', fontSize: 10, color: '#94a3b8', marginTop: 6 }}>💡 Click vào dòng để chỉnh sửa • Dùng toolbar phía trên để định dạng</div>
            </div>

            <div style={{ background: '#f0fdf4', padding: 16, borderRadius: 10, marginBottom: 16, border: '1px solid #bbf7d0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#166534', letterSpacing: '0.05em' }}>MÃ ĐỀ THI ({examCodes.length} đề)</div>
                <button
                  type="button"
                  onClick={() => {
                    const newCodes = generateUniqueExamCodes(examCodes.length)
                    setExamCodes(newCodes)
                  }}
                  style={{
                    padding: '4px 12px', borderRadius: '6px', border: '1px solid #86efac',
                    background: 'white', color: '#166534', cursor: 'pointer', fontSize: '12px', fontWeight: 600,
                    transition: 'all 0.2s',
                  }}
                  onMouseOver={e => { e.currentTarget.style.background = '#166534'; e.currentTarget.style.color = 'white' }}
                  onMouseOut={e => { e.currentTarget.style.background = 'white'; e.currentTarget.style.color = '#166534' }}
                >
                  🎲 Tạo mã ngẫu nhiên
                </button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                {examCodes.map((code, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {examCodes.length > 1 && <span style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>Đề {idx+1}:</span>}
                    <input type="text" value={code} maxLength={4} onChange={e => {
                      const val = e.target.value.replace(/\D/g, '').slice(0, 4)
                      const n = [...examCodes]; n[idx] = val; setExamCodes(n)
                    }} style={{ width: 64, padding: '8px 4px', textAlign: 'center', fontWeight: 700, fontSize: 16, borderRadius: 8, border: '2px solid #86efac', outline: 'none', color: '#166534', letterSpacing: 2 }} />
                  </div>
                ))}
              </div>
            </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginTop: 'auto', paddingTop: '16px' }}>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <button onClick={() => setShowExportModal(false)} className="btn btn-secondary" style={{ padding: '10px 20px', fontSize: 15 }}>Hủy bỏ</button>
                    <button onClick={() => { setShowExportModal(false); handleExportTex() }} className="btn btn-primary" style={{ background: '#10b981', border: 'none', padding: '10px 24px', fontSize: 15, fontWeight: 700, boxShadow: '0 4px 6px rgba(16,185,129,0.3)' }}>📥 Xuất file .tex</button>
                  </div>
                </div>
              </div>

              {/* ── RIGHT COLUMN (Options) ── */}
              <div style={{ flex: '0 0 280px', background: '#f8fafc', borderRadius: '12px', padding: '16px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tùy chọn xuất</h4>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>Bảng đáp án Excel:</label>
                  <select 
                    value={excelOption} 
                    onChange={e => setExcelOption(e.target.value)}
                    style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', outline: 'none', background: 'white' }}
                  >
                    <option value="none">Không xuất bảng đáp án</option>
                    <option value="all">Xuất tất cả các loại bảng</option>
                    <option value="azota">Xuất bảng Azota</option>
                    <option value="tnmaker">Xuất bảng TNMaker</option>
                    <option value="olm">Xuất bảng OLM</option>
                  </select>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: '#334155', background: 'white', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                    <input type="checkbox" checked={includeAnswerTable} onChange={e => setIncludeAnswerTable(e.target.checked)} style={{ width: 16, height: 16, accentColor: '#10b981', cursor: 'pointer' }} />
                    <span style={{ flex: 1 }}>Thêm Bảng đáp án cuối đề <i>(indapan)</i></span>
                  </label>
                </div>

                {/* Placeholders for future options */}
                <div style={{ flex: 1, border: '2px dashed #cbd5e1', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.5, minHeight: '100px' }}>
                  <span style={{ fontSize: '12px', color: '#64748b', fontStyle: 'italic' }}>Không gian chờ cập nhật...</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Custom Swap / Add Modal */}
      {(customSwapQuestion || customAddPhan !== null) && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.65)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'white', borderRadius: 16, width: '100%', maxWidth: 480, padding: 28, boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 20, color: '#0f172a' }}>{customSwapQuestion ? '🎲 Hoán đổi tùy chỉnh' : '➕ Thêm câu mới'}</h3>
              <button onClick={() => { setCustomSwapQuestion(null); setCustomAddPhan(null) }} style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8' }}>✕</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 6, display: 'block' }}>Chương</label>
                <select value={customChapter} onChange={e => setCustomChapter(e.target.value)} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14, outline: 'none' }}>
                  {availableCustomChapters.map(ch => <option key={ch} value={ch}>Chương {ch}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 6, display: 'block' }}>Bài</label>
                <select value={customLesson} onChange={e => setCustomLesson(e.target.value)} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14, outline: 'none' }}>
                  {availableCustomLessons.map(l => <option key={l} value={l}>Bài {l}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 6, display: 'block' }}>Dạng</label>
                <select value={customVariant} onChange={e => setCustomVariant(e.target.value)} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14, outline: 'none' }}>
                  <option value="">(Tất cả phân dạng)</option>
                  {availableCustomVariants.map(v => <option key={v} value={v}>Dạng {v}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 6, display: 'block' }}>Mức độ</label>
                <select value={customDifficulty} onChange={e => setCustomDifficulty(e.target.value)} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14, outline: 'none' }}>
                  <option value="N">Nhận biết</option>
                  <option value="H">Thông hiểu</option>
                  <option value="V">Vận dụng</option>
                  <option value="C">Vận dụng cao</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button onClick={() => { setCustomSwapQuestion(null); setCustomAddPhan(null) }} className="btn btn-secondary" style={{ padding: '10px 20px', fontSize: 14 }}>Hủy bỏ</button>
              <button onClick={customSwapQuestion ? handleCustomSwapQuestion : handleCustomAddQuestion} className="btn btn-primary" style={{ padding: '10px 20px', fontSize: 14, fontWeight: 600 }}>Lấy câu ngẫu nhiên 🎲</button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
