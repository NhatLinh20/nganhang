'use client'
import { useState, useCallback, useRef } from 'react'
import Header from '@/components/layout/Header'
import styles from './lesson-builder.module.css'
import { CHAPTER_NAMES, LESSON_NAMES, VARIANT_NAMES } from '@/lib/curriculum-labels'
import { CURRICULUM } from '../questions/QuestionsClient'

// ── Types ────────────────────────────────────────────────────────────────────
interface QuestionItem {
  id: string
  category_code: string
  latex_content: string
  difficulty: string
  question_type: string
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

type ModalMode = null | 'addBlock' | 'selectChapter' | 'selectSection' | 'selectVariant' | 'pickQuestions'

let _blockIdCounter = 0
function genId() { return `blk_${Date.now()}_${++_blockIdCounter}` }

const BLOCK_ICONS: Record<string, string> = {
  chapter: '📘', section: '📄', theory: '📝', exercises: '📋', variant: '🎯'
}
const BLOCK_LABELS: Record<string, string> = {
  chapter: 'Chương', section: 'Bài', theory: 'Lý thuyết', exercises: 'Bài tập', variant: 'Dạng'
}

// ── Component ────────────────────────────────────────────────────────────────
export default function LessonBuilderClient({ userRole }: { userRole: string }) {
  const [grade, setGrade] = useState(12)
  const [blocks, setBlocks] = useState<LessonBlock[]>([])
  const [modal, setModal] = useState<ModalMode>(null)
  const [exporting, setExporting] = useState(false)

  // Selector state
  const [selSubject, setSelSubject] = useState('D')
  const [selChapter, setSelChapter] = useState<number | ''>('')
  const [selLesson, setSelLesson] = useState<number | ''>('')
  const [selVariant, setSelVariant] = useState<number | ''>('')
  const [selDifficulty, setSelDifficulty] = useState('')
  const [selCount, setSelCount] = useState(5)
  const [selQuestions, setSelQuestions] = useState<QuestionItem[]>([])
  const [loadingQuestions, setLoadingQuestions] = useState(false)

  // Toast
  const [toast, setToast] = useState<{ type: 'error' | 'warning' | 'success' | 'info'; title: string; message: string; visible: boolean }>({ type: 'info', title: '', message: '', visible: false })
  const toastTimerRef = useRef<NodeJS.Timeout | null>(null)

  const showToast = useCallback((type: 'error' | 'warning' | 'success' | 'info', title: string, message: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast({ type, title, message, visible: true })
    toastTimerRef.current = setTimeout(() => setToast(p => ({ ...p, visible: false })), type === 'error' ? 8000 : 4000)
  }, [])

  // ── Derived data ───────────────────────────────────────────────────────────
  const chaptersMap = CURRICULUM[grade]?.[selSubject] || {}
  const lessonsMap = selChapter !== '' ? (chaptersMap[selChapter] || {}) : {}
  const variantsList = selChapter !== '' && selLesson !== '' ? (lessonsMap[selLesson as number] || []) : []

  // Find last chapter/section context for auto-fill
  const lastChapter = [...blocks].reverse().find(b => b.type === 'chapter')
  const lastSection = [...blocks].reverse().find(b => b.type === 'section')

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

  const openVariantSelect = () => {
    const sub = lastChapter?.subjectArea || 'D'
    const ch = lastChapter?.chapter || ''
    const les = lastSection?.lesson || ''
    setSelSubject(sub)
    setSelChapter(ch as number)
    setSelLesson(les as number)
    setSelVariant('')
    setSelDifficulty('')
    setSelCount(5)
    setSelQuestions([])
    setModal('selectVariant')
  }

  // ── Confirm add block ──────────────────────────────────────────────────────
  const confirmChapter = () => {
    if (selChapter === '') return
    addBlock({
      id: genId(), type: 'chapter', grade, subjectArea: selSubject, chapter: selChapter as number,
    })
  }

  const confirmSection = () => {
    if (selChapter === '' || selLesson === '') return
    addBlock({
      id: genId(), type: 'section', grade, subjectArea: selSubject, chapter: selChapter as number, lesson: selLesson as number,
    })
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

  // ── Fetch questions for variant ────────────────────────────────────────────
  const fetchQuestions = async () => {
    if (selChapter === '' || selLesson === '') return
    setLoadingQuestions(true)
    try {
      const params = new URLSearchParams({
        grade: String(grade),
        subject_area: selSubject,
        chapter: String(selChapter),
        lesson: String(selLesson),
        limit: String(selCount),
      })
      if (selVariant !== '') params.set('variant', String(selVariant))
      if (selDifficulty) params.set('difficulty', selDifficulty)

      const res = await fetch(`/api/questions?${params}`)
      const data = await res.json()
      if (!res.ok) {
        showToast('error', 'Lỗi', data.error || 'Không thể tải câu hỏi')
        return
      }
      setSelQuestions(data.data || [])
      if ((data.data || []).length === 0) {
        showToast('info', 'Không có câu hỏi', 'Không tìm thấy câu hỏi phù hợp với bộ lọc.')
      }
    } catch {
      showToast('error', 'Lỗi kết nối', 'Không thể kết nối đến máy chủ.')
    } finally {
      setLoadingQuestions(false)
    }
  }

  const confirmVariant = () => {
    if (selQuestions.length === 0) {
      showToast('warning', 'Chưa có câu hỏi', 'Hãy lấy câu hỏi trước khi thêm dạng bài.')
      return
    }
    addBlock({
      id: genId(), type: 'variant', grade, subjectArea: selSubject,
      chapter: selChapter as number, lesson: selLesson as number,
      variant: selVariant as number || undefined,
      questions: [...selQuestions],
    })
    setSelQuestions([])
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
            tex += `\\begin{enumerate}\n`
            for (const q of block.questions) {
              // Clean up LaTeX: remove \begin{ex}/\end{ex} wrappers if present
              let content = q.latex_content.trim()
              content = content.replace(/^\\begin\{ex\}[\s\S]*?(?=\\(?:choice|begin|textbf|text|$|[A-Z]))/, '')
              content = content.replace(/\\end\{ex\}[\s\S]*$/, '')
              content = content.trim()
              tex += `\\item ${content}\n\n`
            }
            tex += `\\end{enumerate}\n\n`
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
                <button className={styles.addMenuItem} onClick={openVariantSelect}>
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

      {/* ═══ MODAL: Select Variant + Questions ═══ */}
      {modal === 'selectVariant' && (
        <div className={styles.modal} onClick={() => setModal(null)}>
          <div className={styles.modalInner} onClick={e => e.stopPropagation()} style={{ maxWidth: '720px' }}>
            <div className={styles.modalHeader}>
              <span className={styles.modalTitle}>🎯 Thêm Dạng bài + Câu hỏi</span>
              <button className={styles.modalClose} onClick={() => setModal(null)}>✕</button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.modalRow}>
                <span className={styles.modalLabel}>Phân môn</span>
                <select className={styles.modalSelect} value={selSubject} onChange={e => { setSelSubject(e.target.value); setSelChapter(''); setSelLesson(''); setSelVariant('') }}>
                  <option value="D">Đại số (D)</option>
                  <option value="H">Hình học (H)</option>
                  <option value="C">Chuyên đề (C)</option>
                </select>
              </div>
              <div className={styles.modalRow}>
                <span className={styles.modalLabel}>Chương</span>
                <select className={styles.modalSelect} value={selChapter} onChange={e => { setSelChapter(Number(e.target.value)); setSelLesson(''); setSelVariant('') }}>
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
                <select className={styles.modalSelect} value={selLesson} onChange={e => { setSelLesson(Number(e.target.value)); setSelVariant('') }}>
                  <option value="">— Chọn bài —</option>
                  {selChapter !== '' && Object.keys(chaptersMap[selChapter as number] || {}).map(les => (
                    <option key={les} value={les}>
                      {LESSON_NAMES[grade]?.[selSubject]?.[selChapter as number]?.[Number(les)] || `Bài ${les}`}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.modalRow}>
                <span className={styles.modalLabel}>Dạng</span>
                <select className={styles.modalSelect} value={selVariant} onChange={e => setSelVariant(e.target.value ? Number(e.target.value) : '')}>
                  <option value="">— Tất cả dạng —</option>
                  {variantsList.map((v: number) => (
                    <option key={v} value={v}>
                      {VARIANT_NAMES[grade]?.[selSubject]?.[selChapter as number]?.[selLesson as number]?.[v] || `Dạng ${v}`}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.modalRow}>
                <span className={styles.modalLabel}>Mức độ</span>
                <select className={styles.modalSelect} value={selDifficulty} onChange={e => setSelDifficulty(e.target.value)}>
                  <option value="">— Tất cả —</option>
                  <option value="N">Nhận biết</option>
                  <option value="H">Thông hiểu</option>
                  <option value="V">Vận dụng</option>
                  <option value="C">VD cao</option>
                </select>
              </div>
              <div className={styles.modalRow}>
                <span className={styles.modalLabel}>Số lượng</span>
                <input
                  type="number" min={1} max={50}
                  className={styles.modalInput}
                  value={selCount}
                  onChange={e => setSelCount(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
                />
                <button
                  className={styles.modalConfirmBtn}
                  onClick={fetchQuestions}
                  disabled={selChapter === '' || selLesson === '' || loadingQuestions}
                  style={{ whiteSpace: 'nowrap' }}
                >
                  {loadingQuestions ? '⏳' : '🎲'} Lấy ngẫu nhiên
                </button>
              </div>

              {/* Question results */}
              {selQuestions.length > 0 && (
                <div className={styles.questionList}>
                  {selQuestions.map(q => (
                    <div key={q.id} className={styles.questionItem}>
                      <span className={styles.questionItemCode}>{q.category_code}</span>
                      <span className={styles.questionItemPreview}>
                        {q.latex_content.replace(/\\[a-zA-Z]+\{?/g, '').replace(/[{}\\]/g, '').slice(0, 60)}...
                      </span>
                      <button className={styles.questionItemRemove} onClick={() => setSelQuestions(p => p.filter(x => x.id !== q.id))}>✕</button>
                    </div>
                  ))}
                </div>
              )}

              {loadingQuestions && (
                <div className={styles.loadingSpinner}>⏳ Đang tải câu hỏi...</div>
              )}
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.modalCancelBtn} onClick={() => setModal(null)}>Hủy</button>
              <button className={styles.modalConfirmBtn} onClick={confirmVariant} disabled={selQuestions.length === 0}>
                Thêm {selQuestions.length} câu
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
