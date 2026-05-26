'use client'
import { useState, useCallback, useRef, useEffect, Fragment } from 'react'
import Header from '@/components/layout/Header'
import styles from './lesson-builder.module.css'
import { CHAPTER_NAMES, LESSON_NAMES, VARIANT_NAMES } from '@/lib/curriculum-labels'
import { CURRICULUM } from '../questions/QuestionsClient'

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

interface LessonBlock {
  id: string
  type: 'chapter' | 'section' | 'theory' | 'exercises' | 'variant'
  grade: number
  subjectArea: string
  chapter: number
  lesson?: number
  variant?: number
  questions?: QuestionItem[]
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

type ModalMode = null | 'addBlock' | 'selectChapter' | 'selectSection' | 'questionPicker'

let _blockIdCounter = 0
function genId() { return `blk_${Date.now()}_${++_blockIdCounter}` }

const BLOCK_ICONS: Record<string, string> = {
  chapter: '📘', section: '📄', theory: '📝', exercises: '📋', variant: '🎯'
}
const BLOCK_LABELS: Record<string, string> = {
  chapter: 'Chương', section: 'Bài', theory: 'Lý thuyết', exercises: 'Bài tập', variant: 'Dạng'
}
const TYPE_LABELS: Record<string, string> = {
  multiple_choice: 'TN', true_false: 'Đ/S', short_answer: 'Ngắn', essay: 'Tự luận'
}

// ── Component ────────────────────────────────────────────────────────────────
export default function LessonBuilderClient({ userRole }: { userRole: string }) {
  const [grade, setGrade] = useState(12)
  const [blocks, setBlocks] = useState<LessonBlock[]>([])
  const [modal, setModal] = useState<ModalMode>(null)
  const [exporting, setExporting] = useState(false)

  // Selector state for chapter/section modals
  const [selSubject, setSelSubject] = useState('D')
  const [selChapter, setSelChapter] = useState<number | ''>('')
  const [selLesson, setSelLesson] = useState<number | ''>('')

  // ── Question Picker state (fullscreen stats table) ─────────────────────────
  const [pickerSubject, setPickerSubject] = useState('D')
  const [pickerChapter, setPickerChapter] = useState<number>(1)
  const [pickerLesson, setPickerLesson] = useState('')
  const [pickerVariant, setPickerVariant] = useState('')
  const [pickerType, setPickerType] = useState('')
  const [statsData, setStatsData] = useState<VariantStatsRow[]>([])
  const [loadingStats, setLoadingStats] = useState(false)
  const [pickerSelections, setPickerSelections] = useState<Record<string, number>>({})
  const [loadingFetch, setLoadingFetch] = useState(false)

  // Toast
  const [toast, setToast] = useState<{ type: 'error' | 'warning' | 'success' | 'info'; title: string; message: string; visible: boolean }>({ type: 'info', title: '', message: '', visible: false })
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = useCallback((type: 'error' | 'warning' | 'success' | 'info', title: string, message: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast({ type, title, message, visible: true })
    toastTimerRef.current = setTimeout(() => setToast(p => ({ ...p, visible: false })), type === 'error' ? 8000 : 4000)
  }, [])

  // ── Derived data for chapter/section selectors ─────────────────────────────
  const chaptersMap = CURRICULUM[grade]?.[selSubject] || {}

  // Find last chapter/section context
  const lastChapter = [...blocks].reverse().find(b => b.type === 'chapter')
  const lastSection = [...blocks].reverse().find(b => b.type === 'section')

  // ── Picker derived data ────────────────────────────────────────────────────
  const pickerChaptersMap = CURRICULUM[grade]?.[pickerSubject] || {}
  const pickerAvailableChapters = Object.keys(pickerChaptersMap).map(Number)
  const pickerAvailableLessons = pickerChapter && pickerChaptersMap[pickerChapter]
    ? Object.keys(pickerChaptersMap[pickerChapter]).map(Number) : []
  const pickerAvailableVariants = pickerChapter && pickerLesson && pickerChaptersMap[pickerChapter]?.[Number(pickerLesson)]
    ? pickerChaptersMap[pickerChapter][Number(pickerLesson)] : []

  // ── Fetch stats when picker opens or filters change ────────────────────────
  const fetchStats = useCallback(async () => {
    if (!pickerChapter) return
    setLoadingStats(true)
    try {
      const res = await fetch(`/api/exams/stats?grade=${grade}&subject_area=${pickerSubject}&chapter=${pickerChapter}`)
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
  }, [grade, pickerSubject, pickerChapter, showToast])

  useEffect(() => {
    if (modal === 'questionPicker') {
      fetchStats()
    }
  }, [modal, fetchStats])

  // ── Picker selection summary ───────────────────────────────────────────────
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

  // ── Picker count change handler ────────────────────────────────────────────
  const handlePickerCountChange = (lesson: number, variant: number, type: string, diff: string, value: string, max: number) => {
    const num = parseInt(value)
    const key = `${grade}|${pickerSubject}|${pickerChapter}|${lesson}|${variant}|${type}|${diff}`
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

  // ── Add questions to lesson ────────────────────────────────────────────────
  const handleAddQuestionsToLesson = async () => {
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
        showToast('warning', 'Không có câu hỏi', 'Không tìm thấy câu hỏi phù hợp.')
        return
      }

      // Group questions by (lesson, variant) → create variant blocks
      const groups: Record<string, QuestionItem[]> = {}
      for (const q of questions) {
        const gKey = `${q.lesson}|${q.variant}`
        if (!groups[gKey]) groups[gKey] = []
        groups[gKey].push(q)
      }

      const newBlocks: LessonBlock[] = []
      for (const [gKey, qs] of Object.entries(groups)) {
        const [les, vari] = gKey.split('|').map(Number)
        newBlocks.push({
          id: genId(), type: 'variant', grade,
          subjectArea: pickerSubject, chapter: pickerChapter,
          lesson: les, variant: vari,
          questions: qs,
        })
      }

      setBlocks(prev => [...prev, ...newBlocks])
      setPickerSelections({})
      setModal(null)

      if (data.warnings && data.warnings.length > 0) {
        showToast('warning', 'Cảnh báo', data.warnings.join('\n'))
      } else {
        showToast('success', 'Đã thêm', `${questions.length} câu hỏi đã được thêm vào bài học.`)
      }
    } catch {
      showToast('error', 'Lỗi kết nối', 'Không thể kết nối đến máy chủ.')
    } finally {
      setLoadingFetch(false)
    }
  }

  // ── Block management ───────────────────────────────────────────────────────
  const addBlock = useCallback((block: LessonBlock) => {
    setBlocks(prev => [...prev, block])
    setModal(null)
  }, [])

  const removeBlock = useCallback((id: string) => {
    setBlocks(prev => prev.filter(b => b.id !== id))
  }, [])

  const moveBlock = useCallback((fromIdx: number, toIdx: number) => {
    setBlocks(prev => {
      const next = [...prev]
      const [item] = next.splice(fromIdx, 1)
      next.splice(toIdx, 0, item)
      return next
    })
  }, [])

  // ── Open modal helpers ─────────────────────────────────────────────────────
  const openChapterSelect = () => {
    setSelSubject(lastChapter?.subjectArea || 'D')
    setSelChapter('')
    setModal('selectChapter')
  }

  const openSectionSelect = () => {
    const sub = lastChapter?.subjectArea || 'D'
    const ch = lastChapter?.chapter || ''
    setSelSubject(sub)
    setSelChapter(ch as number)
    setSelLesson('')
    setModal('selectSection')
  }

  const openQuestionPicker = () => {
    const sub = lastChapter?.subjectArea || 'D'
    const ch = lastChapter?.chapter || 1
    setPickerSubject(sub)
    setPickerChapter(ch)
    setPickerLesson('')
    setPickerVariant('')
    setPickerType('')
    setPickerSelections({})
    setModal('questionPicker')
  }

  // ── Confirm add block ──────────────────────────────────────────────────────
  const confirmChapter = () => {
    if (selChapter === '') return
    addBlock({ id: genId(), type: 'chapter', grade, subjectArea: selSubject, chapter: selChapter as number })
  }

  const confirmSection = () => {
    if (selChapter === '' || selLesson === '') return
    addBlock({ id: genId(), type: 'section', grade, subjectArea: selSubject, chapter: selChapter as number, lesson: selLesson as number })
  }

  const addTheory = () => {
    if (!lastSection) {
      showToast('warning', 'Chưa có bài', 'Hãy thêm một Bài (section) trước khi thêm Lý thuyết.')
      return
    }
    addBlock({
      id: genId(), type: 'theory', grade,
      subjectArea: lastChapter?.subjectArea || 'D',
      chapter: lastChapter?.chapter || 1,
      lesson: lastSection.lesson,
    })
  }

  const addExercises = () => {
    if (!lastSection) {
      showToast('warning', 'Chưa có bài', 'Hãy thêm một Bài (section) trước khi thêm Bài tập.')
      return
    }
    addBlock({
      id: genId(), type: 'exercises', grade,
      subjectArea: lastChapter?.subjectArea || 'D',
      chapter: lastChapter?.chapter || 1,
      lesson: lastSection.lesson,
    })
  }

  // ── Generate LaTeX preview ─────────────────────────────────────────────────
  const generateLatex = useCallback(() => {
    if (blocks.length === 0) return ''
    let tex = '% Bài học được tạo từ Ngân Hàng Toán\n'
    tex += '% ═══════════════════════════════════\n\n'

    for (const block of blocks) {
      switch (block.type) {
        case 'chapter': {
          const name = CHAPTER_NAMES[block.grade]?.[block.subjectArea]?.[block.chapter] || `Chương ${block.chapter}`
          tex += `\\chapter{${name.replace(/^Ch\.\d+\s*/, '')}}\n\n`
          break
        }
        case 'section': {
          const name = LESSON_NAMES[block.grade]?.[block.subjectArea]?.[block.chapter]?.[block.lesson!] || `Bài ${block.lesson}`
          tex += `\\section{${name.replace(/^§\d+\s*/, '')}}\n\n`
          break
        }
        case 'theory': {
          const fileName = `${block.grade}_${block.subjectArea}_${block.chapter}_${block.lesson}`
          tex += `\\subsection{Lý thuyết}\n`
          tex += `\\input{theory/${fileName}}\n\n`
          break
        }
        case 'exercises': {
          tex += `\\subsection{Bài tập rèn luyện}\n\n`
          break
        }
        case 'variant': {
          const varName = block.variant != null
            ? (VARIANT_NAMES[block.grade]?.[block.subjectArea]?.[block.chapter]?.[block.lesson!]?.[block.variant] || `Dạng ${block.variant}`)
            : 'Tổng hợp'
          tex += `\\subsubsection{${varName}}\n`
          if (block.questions && block.questions.length > 0) {
            for (const q of block.questions) {
              const content = q.latex_content.trim()
              tex += `${content}\n\n`
            }
          }
          break
        }
      }
    }
    return tex
  }, [blocks])

  const latexPreview = generateLatex()
  const totalQuestions = blocks.reduce((sum, b) => sum + (b.questions?.length || 0), 0)

  // ── Export ─────────────────────────────────────────────────────────────────
  const handleExport = async () => {
    if (blocks.length === 0) {
      showToast('warning', 'Chưa có nội dung', 'Hãy thêm ít nhất 1 block trước khi xuất.')
      return
    }
    setExporting(true)
    try {
      const res = await fetch('/api/export-lesson', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grade, blocks }),
      })
      if (!res.ok) {
        const json = await res.json()
        showToast('error', 'Xuất thất bại', json.error || 'Lỗi chưa xác định')
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
    } catch {
      showToast('error', 'Lỗi kết nối', 'Không thể kết nối đến máy chủ.')
    } finally {
      setExporting(false)
    }
  }

  // ── Drag & Drop ────────────────────────────────────────────────────────────
  const dragItem = useRef<number | null>(null)
  const dragOver = useRef<number | null>(null)

  const handleDragStart = (idx: number) => { dragItem.current = idx }
  const handleDragEnter = (idx: number) => { dragOver.current = idx }
  const handleDragEnd = () => {
    if (dragItem.current !== null && dragOver.current !== null && dragItem.current !== dragOver.current) {
      moveBlock(dragItem.current, dragOver.current)
    }
    dragItem.current = null
    dragOver.current = null
  }

  // ── Block display name ─────────────────────────────────────────────────────
  const getBlockDisplayName = (b: LessonBlock) => {
    switch (b.type) {
      case 'chapter':
        return CHAPTER_NAMES[b.grade]?.[b.subjectArea]?.[b.chapter] || `Chương ${b.chapter}`
      case 'section':
        return LESSON_NAMES[b.grade]?.[b.subjectArea]?.[b.chapter]?.[b.lesson!] || `Bài ${b.lesson}`
      case 'theory':
        return 'Lý thuyết'
      case 'exercises':
        return 'Bài tập rèn luyện'
      case 'variant': {
        const vName = b.variant != null
          ? (VARIANT_NAMES[b.grade]?.[b.subjectArea]?.[b.chapter]?.[b.lesson!]?.[b.variant] || `Dạng ${b.variant}`)
          : 'Tổng hợp'
        return `${vName} (${b.questions?.length || 0} câu)`
      }
      default: return ''
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className={styles.page}>
      <Header
        title="Tạo Bài Học"
        subtitle="Ghép nối lý thuyết và bài tập thành bài dạy hoàn chỉnh, xuất file .tex"
      />

      <div className={styles.layout}>
        {/* ═══ LEFT PANEL ═══ */}
        <div className={styles.leftPanel}>
          <div className={styles.panelHeader}>
            <div className={styles.gradeRow}>
              <span className={styles.gradeLabel}>📐 Khối lớp:</span>
              <select className={styles.gradeSelect} value={grade} onChange={e => setGrade(Number(e.target.value))}>
                <option value={10}>Lớp 10</option>
                <option value={11}>Lớp 11</option>
                <option value={12}>Lớp 12</option>
              </select>
            </div>
          </div>

          {/* Blocks List */}
          <div className={styles.blocksList}>
            {blocks.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--color-text-muted)', fontSize: '13px', lineHeight: 1.6 }}>
                <div style={{ fontSize: '36px', marginBottom: '12px', opacity: 0.4 }}>📖</div>
                Chưa có nội dung nào.<br />
                Bấm <b>+ Thêm block</b> để bắt đầu.
              </div>
            )}

            {blocks.map((block, idx) => (
              <div
                key={block.id}
                className={`${styles.blockCard} ${styles[`blockCard${block.type.charAt(0).toUpperCase() + block.type.slice(1)}`]}`}
                draggable
                onDragStart={() => handleDragStart(idx)}
                onDragEnter={() => handleDragEnter(idx)}
                onDragEnd={handleDragEnd}
                onDragOver={e => e.preventDefault()}
              >
                <span className={styles.blockIcon}>{BLOCK_ICONS[block.type]}</span>
                <div className={styles.blockInfo}>
                  <div className={styles.blockTitle}>{getBlockDisplayName(block)}</div>
                  {block.type === 'variant' && block.questions && block.questions.length > 0 && (
                    <div className={styles.blockSub}>
                      {block.questions.slice(0, 3).map(q => q.category_code).join(', ')}
                      {block.questions.length > 3 && ` +${block.questions.length - 3}`}
                    </div>
                  )}
                </div>
                <span className={`${styles.blockBadge} ${styles[`badge${block.type.charAt(0).toUpperCase() + block.type.slice(1)}`]}`}>
                  {BLOCK_LABELS[block.type]}
                </span>
                <div className={styles.blockActions}>
                  <button className={styles.blockActionBtn} onClick={() => removeBlock(block.id)} title="Xóa">✕</button>
                </div>
              </div>
            ))}
          </div>

          {/* Add Block + Export */}
          <div className={styles.addBlockArea}>
            {modal === 'addBlock' ? (
              <div className={styles.addMenu}>
                <button className={styles.addMenuItem} onClick={openChapterSelect}>
                  <span className={styles.addMenuIcon}>📘</span> Thêm Chương
                </button>
                <button className={styles.addMenuItem} onClick={openSectionSelect}>
                  <span className={styles.addMenuIcon}>📄</span> Thêm Bài
                </button>
                <button className={styles.addMenuItem} onClick={() => { addTheory(); setModal(null) }}>
                  <span className={styles.addMenuIcon}>📝</span> Thêm Lý thuyết
                </button>
                <button className={styles.addMenuItem} onClick={() => { addExercises(); setModal(null) }}>
                  <span className={styles.addMenuIcon}>📋</span> Thêm Bài tập
                </button>
                <button className={styles.addMenuItem} onClick={openQuestionPicker}>
                  <span className={styles.addMenuIcon}>🎯</span> Thêm Dạng bài + Câu hỏi
                </button>
                <button className={styles.addMenuItem} onClick={() => setModal(null)} style={{ color: 'var(--color-text-muted)' }}>
                  <span className={styles.addMenuIcon}>✕</span> Đóng
                </button>
              </div>
            ) : (
              <button className={styles.addBlockBtn} onClick={() => setModal('addBlock')}>
                ＋ Thêm block
              </button>
            )}
            <button className={styles.exportBtn} onClick={handleExport} disabled={blocks.length === 0 || exporting}>
              {exporting ? '⏳ Đang xuất...' : '📥 Xuất file .tex'}
            </button>
          </div>
        </div>

        {/* ═══ RIGHT PANEL (Preview) ═══ */}
        <div className={styles.rightPanel}>
          {blocks.length === 0 ? (
            <div className={styles.previewEmpty}>
              <div className={styles.previewEmptyIcon}>📄</div>
              <div className={styles.previewEmptyTitle}>Preview LaTeX</div>
              <div className={styles.previewEmptySub}>
                Thêm các block ở panel bên trái để xem trước mã LaTeX được sinh ra.
                Sau khi hoàn tất, bấm "Xuất file .tex" để tải về.
              </div>
            </div>
          ) : (
            <>
              <div className={styles.previewHeader}>
                <span className={styles.previewTitle}>📄 Preview LaTeX</span>
                <span className={styles.previewStats}>
                  {blocks.length} blocks • {totalQuestions} câu hỏi
                </span>
              </div>
              <div className={styles.previewBody}>
                <pre className={styles.previewCode}>{latexPreview}</pre>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ═══ MODAL: Select Chapter ═══ */}
      {modal === 'selectChapter' && (
        <div className={styles.modal} onClick={() => setModal(null)}>
          <div className={styles.modalInner} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <span className={styles.modalTitle}>📘 Thêm Chương</span>
              <button className={styles.modalClose} onClick={() => setModal(null)}>✕</button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.modalRow}>
                <span className={styles.modalLabel}>Phân môn</span>
                <select className={styles.modalSelect} value={selSubject} onChange={e => { setSelSubject(e.target.value); setSelChapter('') }}>
                  <option value="D">Đại số (D)</option>
                  <option value="H">Hình học (H)</option>
                  <option value="C">Chuyên đề (C)</option>
                </select>
              </div>
              <div className={styles.modalRow}>
                <span className={styles.modalLabel}>Chương</span>
                <select className={styles.modalSelect} value={selChapter} onChange={e => setSelChapter(Number(e.target.value))}>
                  <option value="">— Chọn chương —</option>
                  {Object.keys(CURRICULUM[grade]?.[selSubject] || {}).map(ch => (
                    <option key={ch} value={ch}>
                      {CHAPTER_NAMES[grade]?.[selSubject]?.[Number(ch)] || `Chương ${ch}`}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.modalCancelBtn} onClick={() => setModal(null)}>Hủy</button>
              <button className={styles.modalConfirmBtn} onClick={confirmChapter} disabled={selChapter === ''}>Thêm</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL: Select Section ═══ */}
      {modal === 'selectSection' && (
        <div className={styles.modal} onClick={() => setModal(null)}>
          <div className={styles.modalInner} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <span className={styles.modalTitle}>📄 Thêm Bài</span>
              <button className={styles.modalClose} onClick={() => setModal(null)}>✕</button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.modalRow}>
                <span className={styles.modalLabel}>Phân môn</span>
                <select className={styles.modalSelect} value={selSubject} onChange={e => { setSelSubject(e.target.value); setSelChapter(''); setSelLesson('') }}>
                  <option value="D">Đại số (D)</option>
                  <option value="H">Hình học (H)</option>
                  <option value="C">Chuyên đề (C)</option>
                </select>
              </div>
              <div className={styles.modalRow}>
                <span className={styles.modalLabel}>Chương</span>
                <select className={styles.modalSelect} value={selChapter} onChange={e => { setSelChapter(Number(e.target.value)); setSelLesson('') }}>
                  <option value="">— Chọn chương —</option>
                  {Object.keys(CURRICULUM[grade]?.[selSubject] || {}).map(ch => (
                    <option key={ch} value={ch}>
                      {CHAPTER_NAMES[grade]?.[selSubject]?.[Number(ch)] || `Chương ${ch}`}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.modalRow}>
                <span className={styles.modalLabel}>Bài</span>
                <select className={styles.modalSelect} value={selLesson} onChange={e => setSelLesson(Number(e.target.value))}>
                  <option value="">— Chọn bài —</option>
                  {selChapter !== '' && Object.keys(chaptersMap[selChapter as number] || {}).map(les => (
                    <option key={les} value={les}>
                      {LESSON_NAMES[grade]?.[selSubject]?.[selChapter as number]?.[Number(les)] || `Bài ${les}`}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.modalCancelBtn} onClick={() => setModal(null)}>Hủy</button>
              <button className={styles.modalConfirmBtn} onClick={confirmSection} disabled={selChapter === '' || selLesson === ''}>Thêm</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ FULLSCREEN QUESTION PICKER ═══ */}
      {modal === 'questionPicker' && (
        <div className={styles.pickerOverlay}>
          <div className={styles.pickerContainer}>
            {/* Header */}
            <div className={styles.pickerHeader}>
              <span className={styles.pickerTitle}>🎯 Chọn câu hỏi cho bài học</span>
              <button className={styles.pickerCloseBtn} onClick={() => setModal(null)}>✕</button>
            </div>

            {/* Filters */}
            <div className={styles.pickerFilters}>
              <div className={styles.pickerFilterGroup}>
                <span className={styles.pickerFilterLabel}>Phân môn</span>
                <select className={styles.pickerFilterSelect} value={pickerSubject} onChange={e => {
                  setPickerSubject(e.target.value)
                  const newMap = CURRICULUM[grade]?.[e.target.value] || {}
                  const chs = Object.keys(newMap).map(Number)
                  setPickerChapter(chs[0] || 1)
                  setPickerLesson(''); setPickerVariant('')
                }}>
                  <option value="D">Đại số / XS</option>
                  <option value="H">Hình học</option>
                  <option value="C">Chuyên đề</option>
                </select>
              </div>
              <div className={styles.pickerFilterGroup}>
                <span className={styles.pickerFilterLabel}>Chương</span>
                <select className={styles.pickerFilterSelect} value={pickerChapter} onChange={e => {
                  setPickerChapter(Number(e.target.value))
                  setPickerLesson(''); setPickerVariant('')
                }} style={{ minWidth: 220 }}>
                  {pickerAvailableChapters.map(ch => (
                    <option key={ch} value={ch}>
                      {CHAPTER_NAMES[grade]?.[pickerSubject]?.[ch] || `Chương ${ch}`}
                    </option>
                  ))}
                  {pickerAvailableChapters.length === 0 && <option value="">(Không có)</option>}
                </select>
              </div>
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
                              Không tìm thấy dữ liệu phù hợp với bộ lọc.
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

                        const kBase = `${grade}|${pickerSubject}|${pickerChapter}|${row.lesson}|${row.variant}|${row.question_type}`
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
              <button className={styles.pickerCancelBtn} onClick={() => setModal(null)}>Hủy</button>
              <button
                className={styles.pickerSubmitBtn}
                onClick={handleAddQuestionsToLesson}
                disabled={pickerStats.total === 0 || loadingFetch}
              >
                {loadingFetch ? '⏳ Đang tải...' : `📥 Thêm ${pickerStats.total} câu vào bài học`}
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
          backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
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

      <style>{`
        @keyframes toastSlideIn {
          from { transform: translateX(120%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
