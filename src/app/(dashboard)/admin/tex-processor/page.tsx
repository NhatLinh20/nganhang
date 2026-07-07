// src/app/(dashboard)/admin/tex-processor/page.tsx
'use client'

import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import Header from '@/components/layout/Header'
import styles from './tex-processor.module.css'
import {
  normalizeQuestion,
} from '@/lib/latex-parser/normalizer'
import { extractAndValidateBlocks } from '@/lib/latex-parser'
import { extractExBlocks } from '@/lib/latex-parser/file-parser'
import { detectQuestionType, detectMCAnswer, detectTFAnswer, detectShortAnswer } from '@/lib/latex-parser/answer-parser'
import type { ErrorBlock } from '@/lib/latex-parser'
import { extractComments, findValidCategoryCode } from '@/lib/latex-parser/category-parser'
import { CHAPTER_NAMES, LESSON_NAMES, VARIANT_NAMES } from '@/lib/curriculum-labels'
import { compilePdfZip } from '@/lib/tikz-api'
import PdfPreviewModal from '@/components/PdfPreviewModal'

// ═══ Tool definitions ═══
interface TexTool {
  id: string
  icon: string
  label: string
  description?: string
  action: (content: string) => string
  disabled?: boolean
  badge?: string
}

interface ToolSection {
  label: string
  tools: TexTool[]
}

const TOOL_SECTIONS: ToolSection[] = [
  {
    label: 'Chuẩn hóa',
    tools: [
      {
        id: 'normalize-all',
        icon: '🔧',
        label: 'Chuẩn hóa tất cả',
        description: 'Chạy toàn bộ pipeline chuẩn hóa',
        action: normalizeQuestion,
      },
    ],
  },
]

const HEADER_PLACEHOLDERS = [
  'SỞ GDĐT HÀ NỘI',
  'TRƯỜNG THPT CHU VĂN AN',
  'Đề chính thức',
  '(Đề thi gồm có 0\\\\zpageref{\\\\made-lastpage} trang)',
  'ĐỀ KIỂM TRA GIỮA HỌC KÌ I NĂM 2026-2027',
  'Môn: TOÁN 12',
  'Thời gian: 90 phút',
  'không kể thời gian phát đề'
]

const LATEX_COLORS = ['', 'red', 'blue', 'green', 'purple', 'orange', 'brown', 'cyan', 'magenta']

const generateExamCode = (): string => String(Math.floor(1000 + Math.random() * 9000))

// ═══ LaTeX Syntax Highlighter ═══
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function highlightLatex(code: string): string {
  if (!code) return '\n'

  let result = ''
  let i = 0
  const len = code.length

  while (i < len) {
    const ch = code[i]

    // Escaped backslash \\
    if (ch === '\\' && i + 1 < len && code[i + 1] === '\\') {
      result += '<span style="color:#4ec9b0">\\\\</span>'
      i += 2
      continue
    }

    // Escaped percent \%
    if (ch === '\\' && i + 1 < len && code[i + 1] === '%') {
      result += escapeHtml('\\%')
      i += 2
      continue
    }

    // Comment: % to end of line
    if (ch === '%') {
      let end = code.indexOf('\n', i)
      if (end === -1) end = len
      result += `<span style="color:#6a9955;font-style:italic">${escapeHtml(code.slice(i, end))}</span>`
      i = end
      continue
    }

    // Display math $$...$$
    if (ch === '$' && i + 1 < len && code[i + 1] === '$') {
      let j = i + 2
      while (j < len - 1) {
        if (code[j] === '$' && code[j + 1] === '$') { j += 2; break }
        j++
      }
      if (j >= len && !(code[len - 1] === '$' && code[len - 2] === '$')) j = len
      result += `<span style="color:#ce9178">${escapeHtml(code.slice(i, j))}</span>`
      i = j
      continue
    }

    // Inline math $...$
    if (ch === '$') {
      let j = i + 1
      while (j < len && code[j] !== '$' && code[j] !== '\n') j++
      if (j < len && code[j] === '$') j++ // include closing $
      result += `<span style="color:#ce9178">${escapeHtml(code.slice(i, j))}</span>`
      i = j
      continue
    }

    // LaTeX commands starting with \
    if (ch === '\\') {
      // \begin{...} or \end{...}
      const rest = code.slice(i)
      const envMatch = rest.match(/^\\(begin|end)\{([^}]*)\}/)
      if (envMatch) {
        result += `<span style="color:#4ec9b0">\\${escapeHtml(envMatch[1])}</span><span style="color:#808080">{</span><span style="color:#dcdcaa">${escapeHtml(envMatch[2])}</span><span style="color:#808080">}</span>`
        i += envMatch[0].length
        continue
      }

      // Regular command \word
      const cmdMatch = rest.match(/^\\[a-zA-Z@]+/)
      if (cmdMatch) {
        result += `<span style="color:#4ec9b0">${escapeHtml(cmdMatch[0])}</span>`
        i += cmdMatch[0].length
        continue
      }

      // Escaped special char like \{ \} \$ etc
      if (i + 1 < len) {
        result += `<span style="color:#4ec9b0">${escapeHtml(code.slice(i, i + 2))}</span>`
        i += 2
      } else {
        result += escapeHtml('\\')
        i++
      }
      continue
    }

    // Braces
    if (ch === '{' || ch === '}') {
      result += `<span style="color:#808080">${ch}</span>`
      i++
      continue
    }

    // Regular text - batch until next special char
    let j = i + 1
    while (j < len && !'$%\\{}'.includes(code[j])) j++
    result += escapeHtml(code.slice(i, j))
    i = j
  }

  return result
}

// ═══ History management ═══
const MAX_HISTORY = 50

export default function TexProcessorPage() {
  // ═══ State ═══
  const [editorContent, setEditorContent] = useState('')
  const [history, setHistory] = useState<string[]>([''])
  const [historyIndex, setHistoryIndex] = useState(0)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' } | null>(null)
  const [flashEditor, setFlashEditor] = useState(false)
  const [lastAction, setLastAction] = useState<string | null>(null)

  // ═══ Validation state ═══
  const [validBlocks, setValidBlocks] = useState<string[]>([])
  const [errorBlocks, setErrorBlocks] = useState<ErrorBlock[]>([])
  const [totalBlocks, setTotalBlocks] = useState(0)
  const [hasValidated, setHasValidated] = useState(false)
  const [expandedBlock, setExpandedBlock] = useState<number | null>(null)
  const [validationTab, setValidationTab] = useState<'valid' | 'errors'>('valid')

  // ═══ ID Modal State ═══
  const [isIdModalOpen, setIsIdModalOpen] = useState(false)
  const [isAutoAssigning, setIsAutoAssigning] = useState(false)
  const [selectedGrade, setSelectedGrade] = useState<number>(12)
  const [selectedSubject, setSelectedSubject] = useState<string>('D')
  const [selectedChapter, setSelectedChapter] = useState<number>(1)
  const [selectedDiff, setSelectedDiff] = useState<string>('N')
  const [selectedLesson, setSelectedLesson] = useState<number>(1)
  const [selectedVariant, setSelectedVariant] = useState<number>(1)

  // ═══ Export Modal State ═══
  const [showExportModal, setShowExportModal] = useState(false)
  const [headerLabels, setHeaderLabels] = useState<string[]>(['', '', '', '', '', '', '', ''])
  const [headerStyles, setHeaderStyles] = useState<{ bold: boolean; italic: boolean; underline: boolean; color: string }[]>(
    Array.from({ length: 8 }, () => ({ bold: false, italic: false, underline: false, color: '' }))
  )
  const [selectedExportLine, setSelectedExportLine] = useState<number | null>(null)
  const [examCodes, setExamCodes] = useState<string[]>([generateExamCode()])
  const [excelOptions, setExcelOptions] = useState<string[]>([])
  const [showExcelDropdown, setShowExcelDropdown] = useState(false)
  const [includeAnswerTable, setIncludeAnswerTable] = useState(true)
  const [includeAnswerSheet, setIncludeAnswerSheet] = useState(false)
  const [qrCodeOptions, setQrCodeOptions] = useState<string[]>([])
  const [showQrDropdown, setShowQrDropdown] = useState(false)
  const [isExportingWord, setIsExportingWord] = useState(false)
  const [isCompilingPdf, setIsCompilingPdf] = useState(false)
  const [showPdfPreview, setShowPdfPreview] = useState(false)
  const [pdfPreviewBlob, setPdfPreviewBlob] = useState<Blob | null>(null)

  // ═══ Refs ═══
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const lineNumbersRef = useRef<HTMLDivElement>(null)
  const highlightRef = useRef<HTMLPreElement>(null)
  const toastTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ═══ Load from localStorage ═══
  useEffect(() => {
    try {
      const saved = localStorage.getItem('tex-processor-content')
      if (saved) {
        setEditorContent(saved)
        setHistory([saved])
      }
    } catch { /* ignore */ }
  }, [])

  // ═══ Save to localStorage ═══
  useEffect(() => {
    try {
      localStorage.setItem('tex-processor-content', editorContent)
    } catch { /* ignore */ }
  }, [editorContent])

  // ═══ Syntax highlight (memoized) ═══
  const highlightedHtml = useMemo(() => highlightLatex(editorContent), [editorContent])

  // ═══ Sync scroll between textarea, line numbers, and highlight ═══
  const handleScroll = useCallback(() => {
    if (textareaRef.current) {
      if (lineNumbersRef.current) {
        lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop
      }
      if (highlightRef.current) {
        highlightRef.current.scrollTop = textareaRef.current.scrollTop
        highlightRef.current.scrollLeft = textareaRef.current.scrollLeft
      }
    }
  }, [])

  // ═══ Toast notification ═══
  const showToast = useCallback((message: string, type: 'success' | 'info' = 'success') => {
    if (toastTimeout.current) clearTimeout(toastTimeout.current)
    setToast({ message, type })
    toastTimeout.current = setTimeout(() => setToast(null), 2500)
  }, [])

  // ═══ Push to history ═══
  const pushHistory = useCallback((newContent: string) => {
    setHistory(prev => {
      const sliced = prev.slice(0, historyIndex + 1)
      const updated = [...sliced, newContent]
      if (updated.length > MAX_HISTORY) updated.shift()
      return updated
    })
    setHistoryIndex(prev => Math.min(prev + 1, MAX_HISTORY - 1))
  }, [historyIndex])

  // ═══ Undo / Redo ═══
  const canUndo = historyIndex > 0
  const canRedo = historyIndex < history.length - 1

  const handleUndo = useCallback(() => {
    if (!canUndo) return
    const newIndex = historyIndex - 1
    setHistoryIndex(newIndex)
    setEditorContent(history[newIndex])
    showToast('↩️ Undo', 'info')
  }, [canUndo, historyIndex, history, showToast])

  const handleRedo = useCallback(() => {
    if (!canRedo) return
    const newIndex = historyIndex + 1
    setHistoryIndex(newIndex)
    setEditorContent(history[newIndex])
    showToast('↪️ Redo', 'info')
  }, [canRedo, historyIndex, history, showToast])

  // ═══ Apply tool ═══
  const handleApplyTool = useCallback((tool: TexTool) => {
    if (tool.disabled || !editorContent.trim()) return

    const result = tool.action(editorContent)

    if (result === editorContent) {
      showToast(`ℹ️ Không có thay đổi`, 'info')
      return
    }

    pushHistory(result)
    setEditorContent(result)
    setLastAction(tool.label)
    // Reset validation khi nội dung thay đổi qua tool
    setHasValidated(false)
    setFlashEditor(true)
    setTimeout(() => setFlashEditor(false), 500)
    showToast(`✅ ${tool.label}`, 'success')
  }, [editorContent, pushHistory, showToast])

  // ═══ Editor change (user typing) ═══
  const handleEditorChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setEditorContent(value)
    // Debounced push to history for typing
    // We only push explicit actions, not every keystroke
  }, [])

  // ═══ Handle Tab key ═══
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault()
      const textarea = textareaRef.current
      if (!textarea) return
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const value = editorContent
      const newValue = value.substring(0, start) + '\t' + value.substring(end)
      setEditorContent(newValue)
      // Restore cursor
      requestAnimationFrame(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 1
      })
    }
    // Ctrl+Z / Ctrl+Y
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'z') {
        e.preventDefault()
        handleUndo()
      } else if (e.key === 'y') {
        e.preventDefault()
        handleRedo()
      }
    }
  }, [editorContent, handleUndo, handleRedo])

  // ═══ Save current state to history when user stops typing ═══
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (typingTimeout.current) clearTimeout(typingTimeout.current)
    typingTimeout.current = setTimeout(() => {
      if (editorContent !== history[historyIndex]) {
        pushHistory(editorContent)
      }
    }, 1000)
    return () => {
      if (typingTimeout.current) clearTimeout(typingTimeout.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorContent])

  // ═══ Copy / Clear / Paste ═══
  const handleCopy = useCallback(async () => {
    if (!editorContent) return
    try {
      await navigator.clipboard.writeText(editorContent)
      showToast('📋 Đã copy vào clipboard', 'success')
    } catch {
      showToast('❌ Không thể copy', 'info')
    }
  }, [editorContent, showToast])

  const handleClear = useCallback(() => {
    if (!editorContent.trim()) return
    pushHistory('')
    setEditorContent('')
    showToast('🗑️ Đã xóa nội dung', 'info')
  }, [editorContent, pushHistory, showToast])

  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text) {
        const textarea = textareaRef.current
        if (textarea) {
          const start = textarea.selectionStart
          const end = textarea.selectionEnd
          const newValue = editorContent.substring(0, start) + text + editorContent.substring(end)
          pushHistory(newValue)
          setEditorContent(newValue)
          showToast('📥 Đã paste từ clipboard', 'success')
        } else {
          pushHistory(text)
          setEditorContent(text)
          showToast('📥 Đã paste từ clipboard', 'success')
        }
      }
    } catch {
      showToast('❌ Không thể paste', 'info')
    }
  }, [editorContent, pushHistory, showToast])

  // ═══ Validation handler ═══
  const handleValidate = useCallback(() => {
    if (!editorContent.trim()) return
    const result = extractAndValidateBlocks(editorContent)
    setValidBlocks(result.validBlocks)
    setErrorBlocks(result.errorBlocks)
    setTotalBlocks(result.totalBlocks)
    setHasValidated(true)
    setExpandedBlock(null)
    setValidationTab(result.errorBlocks.length > 0 ? 'errors' : 'valid')

    // Dọn dẹp editor: chỉ giữ lại các block \begin{ex}...\end{ex} theo thứ tự
    const allBlocks = [...result.validBlocks, ...result.errorBlocks.map(e => e.content)]
    // Re-order by original position in editorContent
    allBlocks.sort((a, b) => editorContent.indexOf(a) - editorContent.indexOf(b))
    const cleaned = allBlocks.join('\n\n')
    if (cleaned !== editorContent) {
      pushHistory(cleaned)
      setEditorContent(cleaned)
    }

    showToast(
      result.errorBlocks.length === 0
        ? `✅ ${result.validBlocks.length} câu hợp lệ`
        : `⚠️ ${result.validBlocks.length} đạt, ${result.errorBlocks.length} lỗi`,
      result.errorBlocks.length === 0 ? 'success' : 'info'
    )
  }, [editorContent, pushHistory, showToast])

  // ═══ Assemble Exam handler ═══
  const handleAssembleExam = useCallback(() => {
    if (!editorContent.trim()) return

    // 1. Tách tất cả block \begin{ex}...\end{ex}
    const blocks = extractExBlocks(editorContent)
    if (blocks.length === 0) {
      showToast('⚠️ Không tìm thấy block \\begin{ex}...\\end{ex}', 'info')
      return
    }

    // 2. Phân loại theo question type
    const grouped: Record<string, string[]> = {
      multiple_choice: [],
      true_false: [],
      short_answer: [],
      essay: [],
    }

    for (const block of blocks) {
      const type = detectQuestionType(block)
      if (grouped[type]) {
        grouped[type].push(block.trim())
      } else {
        grouped.essay.push(block.trim())
      }
    }

    // 3. Ghép thành content.tex hoàn chỉnh
    let tex = ''

    // Header \begin{name}
    tex += `\\begin{name}\n`
    tex += `\t{SỞ GDĐT AN GIANG}\n`
    tex += `\t{TRƯỜNG THPT VÕ VĂN KIỆT}\n`
    tex += `\t{Đề chính thức}\n`
    tex += `\t{\\textit{(Đề thi gồm có \\zpageref{\\made-lastpage} trang)}}\n`
    tex += `\t{ĐỀ KIỂM TRA CUỐI KÌ I NĂM 2025-2026}\n`
    tex += `\t{Môn: TOÁN 12}\n`
    tex += `\t{Thời gian làm bài: 90 phút}\n`
    tex += `\t{(Không kể thời gian phát đề)}\n`
    tex += `\\end{name}\n\n`

    // Open ansbook
    tex += `\\Opensolutionfile{ansbook}[ans/ansb\\currfilebase]\n\n`

    // Các phần đề
    const parts = [
      { type: 'multiple_choice', cmd: '\\caulc', suffix: 'Phan-I' },
      { type: 'true_false', cmd: '\\cauds', suffix: 'Phan-II' },
      { type: 'short_answer', cmd: '\\caukq', suffix: 'Phan-III' },
      { type: 'essay', cmd: '\\cautl', suffix: 'Phan-IV' },
    ]

    for (const part of parts) {
      const questions = grouped[part.type]
      if (questions.length === 0) continue

      const count = questions.length
      const defCmd = part.cmd.replace('\\cau', '\\socau')
      tex += `\\def${defCmd}{${count}}\n`
      tex += `${part.cmd}\n`
      tex += `\\Opensolutionfile{ans}[ans/ans\\currfilebase-${part.suffix}]\n\n`
      tex += questions.join('\n\n')
      tex += `\n\n\\Closesolutionfile{ans}\n\n`
    }

    // Close ansbook
    tex += `\\Closesolutionfile{ansbook}\n\n`

    // Label trang cuối
    tex += `\\zlabel{\\made-lastpage}\n\n`

    // Footer HẾT
    tex += `\\begin{center}\n`
    tex += `\t\\textbf{--------------- HẾT ---------------}\n`
    tex += `\\end{center}\n\n`

    // Bảng đáp án
    tex += `\\begin{indapan}\n`
    tex += `\t{ans/ans\\currfilebase}\n`
    tex += `\\end{indapan}\n`

    // 4. Cập nhật editor
    pushHistory(tex)
    setEditorContent(tex)
    setHasValidated(false)
    setFlashEditor(true)
    setTimeout(() => setFlashEditor(false), 500)

    // Thống kê
    const counts = parts
      .filter(p => grouped[p.type].length > 0)
      .map(p => {
        const labels: Record<string, string> = {
          multiple_choice: 'TN',
          true_false: 'ĐS',
          short_answer: 'TL ngắn',
          essay: 'Tự luận',
        }
        return `${grouped[p.type].length} ${labels[p.type]}`
      })
    showToast(`📄 Đã ghép đề: ${counts.join(', ')}`, 'success')
  }, [editorContent, pushHistory, showToast])

  // ═══ Sort and Structure Exam handler ═══
  const handleSortAndStructureExam = useCallback(() => {
    if (!editorContent.trim()) return

    const blocks = extractExBlocks(editorContent)
    if (blocks.length === 0) {
      showToast('⚠️ Không tìm thấy block \\begin{ex}...\\end{ex}', 'info')
      return
    }

    const wantAnswerTable = window.confirm('Bạn có muốn tự động chèn bảng đáp án ở cuối không?')

    // Parse blocks
    interface ParsedBlock {
      original: string
      grade: number
      subject: string
      chapter: number
      lesson: number
      variant: number
      type: string
      difficulty: string
    }

    const parsedBlocks: ParsedBlock[] = []
    const uncategorizedBlocks: string[] = []

    for (const block of blocks) {
      const comments = extractComments(block)
      const cat = findValidCategoryCode(comments)
      if (cat) {
        parsedBlocks.push({
          original: block.trim(),
          grade: cat.grade,
          subject: cat.subject_area,
          chapter: cat.chapter,
          lesson: cat.lesson,
          variant: cat.variant,
          type: detectQuestionType(block),
          difficulty: cat.difficulty
        })
      } else {
        uncategorizedBlocks.push(block.trim())
      }
    }

    if (parsedBlocks.length === 0) {
      showToast('⚠️ Không có câu hỏi nào chứa ID phân loại hợp lệ', 'info')
      return
    }

    // Sort blocks
    const SUBJECT_ORDER: Record<string, number> = { D: 0, H: 1, C: 2 }
    const TYPE_ORDER: Record<string, number> = { multiple_choice: 0, true_false: 1, short_answer: 2, essay: 3 }
    const DIFF_ORDER: Record<string, number> = { N: 0, H: 1, V: 2, C: 3 }

    parsedBlocks.sort((a, b) => {
      // Priority: Grade -> Subject -> Chapter -> Lesson -> Variant -> Type -> Difficulty
      if (a.grade !== b.grade) return a.grade - b.grade
      if (SUBJECT_ORDER[a.subject] !== SUBJECT_ORDER[b.subject]) return (SUBJECT_ORDER[a.subject] ?? 9) - (SUBJECT_ORDER[b.subject] ?? 9)
      if (a.chapter !== b.chapter) return a.chapter - b.chapter
      if (a.lesson !== b.lesson) return a.lesson - b.lesson
      if (a.variant !== b.variant) return a.variant - b.variant
      if (TYPE_ORDER[a.type] !== TYPE_ORDER[b.type]) return (TYPE_ORDER[a.type] ?? 9) - (TYPE_ORDER[b.type] ?? 9)
      if (DIFF_ORDER[a.difficulty] !== DIFF_ORDER[b.difficulty]) return (DIFF_ORDER[a.difficulty] ?? 9) - (DIFF_ORDER[b.difficulty] ?? 9)
      return 0
    })

    // Helpers
    const getChapterName = (g: number, s: string, c: number) => {
      const raw = (CHAPTER_NAMES as any)[g]?.[s]?.[c]
      if (!raw) return `Chương ${c}`
      return raw.replace(/^Ch\.\d+\s*/, '').replace(/^CĐ\d+\s*/, '')
    }
    const getLessonName = (g: number, s: string, c: number, l: number) => {
      const raw = (LESSON_NAMES as any)[g]?.[s]?.[c]?.[l]
      if (!raw) return `Bài ${l}`
      return raw.replace(/^§\d+\s*/, '')
    }
    const getVariantName = (g: number, s: string, c: number, l: number, v: number) => {
      return (VARIANT_NAMES as any)?.[String(g)]?.[s]?.[String(c)]?.[String(l)]?.[String(v)] || `Dạng ${v}`
    }

    const SUBJECT_LABELS: Record<string, string> = { D: 'ĐẠI SỐ', H: 'HÌNH HỌC', C: 'CHUYÊN ĐỀ' }
    const TYPE_COMMANDS: Record<string, string> = {
      multiple_choice: '\\caulc',
      true_false: '\\cauds',
      short_answer: '\\caukq',
      essay: '\\cautl',
    }
    const DIFF_LABELS: Record<string, string> = { N: 'Nhận biết', H: 'Thông hiểu', V: 'Vận dụng', C: 'Vận dụng cao' }

    let tex = '\\Opensolutionfile{ansbook}[ans/ansb\\currfilebase]\n'
    tex += '\\Opensolutionfile{ans}[ans/ans\\currfilebase]\n\n'

    let currentGrade = -1
    let currentSubject = ''
    let currentChapter = -1
    let currentLesson = -1
    let currentVariant = -1
    let currentType = ''
    let currentDiff = ''

    for (const b of parsedBlocks) {
      if (b.grade !== currentGrade) {
        currentGrade = b.grade
        currentSubject = '' // Reset subject when grade changes
        tex += `\n%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%\n`
        tex += `%%%  LỚP ${b.grade}\n`
        tex += `%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%\n`
        tex += `\\part{LỚP ${b.grade}}\n\n`
      }

      if (b.subject !== currentSubject) {
        currentSubject = b.subject
        currentChapter = -1
        tex += `\n%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%\n`
        tex += `%%%  ${SUBJECT_LABELS[b.subject] || b.subject}\n`
        tex += `%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%\n\n`
      }

      if (b.chapter !== currentChapter) {
        currentChapter = b.chapter
        currentLesson = -1
        tex += `%%%%%-------Chương ${b.chapter}--------%%%%%%%\n`
        tex += `\\chapter{${getChapterName(b.grade, b.subject, b.chapter)}}\n\n`
      }

      if (b.lesson !== currentLesson) {
        currentLesson = b.lesson
        currentVariant = -1
        tex += `\\section{${getLessonName(b.grade, b.subject, b.chapter, b.lesson)}}\n`
        tex += `\\subsection{Các dạng toán}\n\n`
      }

      if (b.variant !== currentVariant) {
        currentVariant = b.variant
        currentType = '' // Reset type and diff when variant changes
        tex += `\\subsubsection{${getVariantName(b.grade, b.subject, b.chapter, b.lesson, b.variant)}}\n\n`
      }

      if (b.type !== currentType) {
        currentType = b.type
        currentDiff = '' // Reset diff when type changes
        
        let typeCount = 0
        for (const q of parsedBlocks) {
          if (q.grade === b.grade && q.subject === b.subject && q.chapter === b.chapter && q.lesson === b.lesson && q.variant === b.variant && q.type === b.type) {
            typeCount++
          }
        }

        const cmd = TYPE_COMMANDS[b.type] || ''
        tex += `%%%---${b.type}---\n`
        if (cmd) {
          const defCmd = cmd.replace('\\cau', '\\socau')
          tex += `\\def${defCmd}{${typeCount}}\n`
          tex += `${cmd}\n`
        }
        tex += '\n'
      }

      if (b.difficulty !== currentDiff) {
        currentDiff = b.difficulty
        tex += `\\begin{center}\n\\textbf{${DIFF_LABELS[b.difficulty] || b.difficulty}}\n\\end{center}\n\n`
      }

      tex += `${b.original}\n\n`
    }

    if (uncategorizedBlocks.length > 0) {
      tex += `%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%\n`
      tex += `%%% CÂU HỎI CHƯA PHÂN LOẠI\n`
      tex += `%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%\n`
      tex += `\\begin{center}\n\\textbf{Chưa phân loại}\n\\end{center}\n\n`
      tex += uncategorizedBlocks.join('\n\n')
      tex += `\n\n`
    }

    tex += `\\Closesolutionfile{ans}\n`
    tex += `\\Closesolutionfile{ansbook}\n`

    if (wantAnswerTable) {
      tex += `\n\\begin{indapan}\n\t{ans/ans\\currfilebase}\n\\end{indapan}\n`
    }

    pushHistory(tex)
    setEditorContent(tex)
    setHasValidated(false)
    setFlashEditor(true)
    setTimeout(() => setFlashEditor(false), 500)
    
    showToast(`✅ Đã sắp xếp ${parsedBlocks.length} câu (bỏ qua ${uncategorizedBlocks.length} câu)`, 'success')
  }, [editorContent, pushHistory, showToast])

  // ═══ Assign ID logic ═══
  const getGeneratedId = () => {
    let chCode = selectedChapter.toString()
    if (selectedGrade === 10 && selectedChapter === 10) chCode = '0'
    return `${selectedGrade % 10}${selectedSubject}${chCode}${selectedDiff}${selectedLesson}-${selectedVariant}`
  }

  const handleAssignId = () => {
    const generatedId = getGeneratedId()
    const idString = `%[${generatedId}]`
    
    if (textareaRef.current) {
      const start = textareaRef.current.selectionStart
      const end = textareaRef.current.selectionEnd
      
      const before = editorContent.substring(0, start)
      const after = editorContent.substring(end)
      
      const newValue = before + idString + after
      pushHistory(newValue)
      setEditorContent(newValue)
      
      // Update cursor position
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + idString.length
          textareaRef.current.focus()
        }
      }, 0)
    } else {
      const newValue = editorContent + idString
      pushHistory(newValue)
      setEditorContent(newValue)
    }
    
    setIsIdModalOpen(false)
    showToast(`✅ Đã chèn ID: ${generatedId}`, 'success')
  }

  const handleAutoAssignId = async () => {
    if (!editorContent.trim() || isAutoAssigning) return

    // Tách từng block \begin{ex}...\end{ex}
    const blocks = editorContent.match(/\\begin\{ex\}[\s\S]*?\\end\{ex\}/g)
    if (!blocks || blocks.length === 0) {
      showToast('⚠️ Không tìm thấy block \\begin{ex}...\\end{ex}', 'info')
      return
    }

    setIsAutoAssigning(true)
    let updatedContent = editorContent
    let assignedCount = 0

    try {
      // Gọi song song tất cả API suggest-id (nhanh gấp N lần so với tuần tự)
      const results = await Promise.allSettled(
        blocks.map(block =>
          fetch('/api/ai/suggest-id', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              latex_content: block
            }),
          }).then(async res => {
            if (!res.ok) throw new Error('API error')
            return res.json()
          })
        )
      )

      // Áp dụng kết quả theo thứ tự
      results.forEach((result, i) => {
        if (result.status !== 'fulfilled') return
        const data = result.value
        if (!data.best_id || data.similarity < 0.6) return

        const block = blocks[i]
        const newId = `%[${data.best_id}]`

        if (block.includes('%[')) {
          const newBlock = block.replace(/%\[[^\]]+\]/, newId)
          updatedContent = updatedContent.replace(block, newBlock)
        } else {
          const newBlock = block.replace('\\begin{ex}', `\\begin{ex}${newId}`)
          updatedContent = updatedContent.replace(block, newBlock)
        }
        assignedCount++
      })

      if (updatedContent !== editorContent) {
        pushHistory(updatedContent)
        setEditorContent(updatedContent)
        setFlashEditor(true)
        setTimeout(() => setFlashEditor(false), 500)
      }
      showToast(`✅ Đã gán ID cho ${assignedCount}/${blocks.length} câu hỏi`, 'success')
    } catch (err) {
      console.error('Auto assign ID error:', err)
      showToast('❌ Lỗi khi gán ID tự động', 'info')
    } finally {
      setIsAutoAssigning(false)
    }
  }

  // ═══ Export: Build questions from editor content ═══
  const buildQuestionsFromEditor = useCallback(() => {
    const blocks = extractExBlocks(editorContent)
    if (blocks.length === 0) return []

    return blocks.map((block, i) => {
      const type = detectQuestionType(block)
      let correct_answer: string | null = null
      if (type === 'multiple_choice') correct_answer = detectMCAnswer(block)
      else if (type === 'true_false') correct_answer = detectTFAnswer(block)
      else if (type === 'short_answer') correct_answer = detectShortAnswer(block)

      return {
        id: `tex-${i + 1}`,
        latex_content: block.trim(),
        question_type: type,
        correct_answer: correct_answer ?? '',
        phan: type === 'multiple_choice' ? 1 : type === 'true_false' ? 2 : type === 'short_answer' ? 3 : 4,
      }
    })
  }, [editorContent])

  // ═══ Export Tex ═══
  const handleExportTex = async () => {
    const questions = buildQuestionsFromEditor()
    if (questions.length === 0) {
      showToast('⚠️ Không tìm thấy câu hỏi \\begin{ex}...\\end{ex}', 'info')
      return
    }
    try {
      const payload = {
        title: headerLabels[4]?.trim() || 'De_Thi',
        headerLabels: headerLabels.map((lbl, i) => lbl?.trim() ? lbl : HEADER_PLACEHOLDERS[i]),
        headerStyles,
        examCodes,
        duration: 90,
        grade: 12,
        excelOptions,
        includeAnswerTable,
        includeAnswerSheet,
        qrCodeOptions,
        questions,
      }
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
      link.download = 'exam_package.zip'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      showToast('✅ Đã xuất file .tex thành công', 'success')
    } catch (err) {
      alert('Lỗi kết nối: ' + (err instanceof Error ? err.message : 'Unknown'))
    }
  }

  // ═══ Export Word ═══
  const handleExportWord = async () => {
    const questions = buildQuestionsFromEditor()
    if (questions.length === 0) {
      showToast('⚠️ Không tìm thấy câu hỏi \\begin{ex}...\\end{ex}', 'info')
      return
    }
    setIsExportingWord(true)
    try {
      const payload = {
        title: headerLabels[4]?.trim() || 'De_Thi',
        headerLabels: headerLabels.map((lbl, i) => lbl?.trim() ? lbl : HEADER_PLACEHOLDERS[i]),
        headerStyles,
        examCodes,
        duration: 90,
        grade: 12,
        excelOptions,
        includeAnswerTable,
        includeAnswerSheet,
        qrCodeOptions,
        questions,
      }
      const res = await fetch('/api/export-word', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({ error: 'Lỗi không xác định' }))
        alert('❌ Xuất Word thất bại: ' + (json.error || 'Lỗi'))
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'exam_word.zip'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      showToast('✅ Đã xuất file Word thành công', 'success')
    } catch (err) {
      alert('Lỗi kết nối: ' + (err instanceof Error ? err.message : 'Unknown'))
    } finally {
      setIsExportingWord(false)
    }
  }

  // ═══ Compile PDF ═══
  const handleCompilePdf = async () => {
    const questions = buildQuestionsFromEditor()
    if (questions.length === 0) {
      showToast('⚠️ Không tìm thấy câu hỏi \\begin{ex}...\\end{ex}', 'info')
      return
    }
    setIsCompilingPdf(true)
    try {
      const payload = {
        title: headerLabels[4]?.trim() || 'De_Thi',
        headerLabels: headerLabels.map((lbl, i) => lbl?.trim() ? lbl : HEADER_PLACEHOLDERS[i]),
        headerStyles,
        examCodes,
        duration: 90,
        grade: 12,
        excelOptions,
        includeAnswerTable,
        includeAnswerSheet,
        qrCodeOptions,
        questions,
      }
      const res = await fetch('/api/export-zip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const json = await res.json()
        alert('❌ Tạo dữ liệu LaTeX thất bại: ' + (json.error || 'Lỗi'))
        setIsCompilingPdf(false)
        return
      }
      const zipBlob = await res.blob()
      const pdfBlob = await compilePdfZip(zipBlob)
      setPdfPreviewBlob(pdfBlob)
      setShowPdfPreview(true)
      showToast('✅ Biên dịch PDF thành công', 'success')
    } catch (err) {
      alert('Lỗi biên dịch PDF: ' + (err instanceof Error ? err.message : 'Unknown'))
    } finally {
      setIsCompilingPdf(false)
    }
  }

  const handleCopyToClipboard = async () => {
    if (!editorContent) return
    try {
      await navigator.clipboard.writeText(editorContent)
      showToast('📋 Đã copy nội dung code', 'success')
    } catch (e) {
      console.error(e)
      showToast('❌ Lỗi khi copy', 'info')
    }
  }

  // ═══ Computed values ═══
  const lines = editorContent.split('\n')
  const lineCount = lines.length
  const charCount = editorContent.length

  return (
    <div className={styles.page}>
      <Header
        title="Xử lí TeX"
        subtitle="Chuẩn hóa, định dạng và xử lý code LaTeX"
        actions={
          <div style={{ display: 'flex', gap: '8px' }}>
            <button 
              className="btn" 
              onClick={() => setShowExportModal(true)} 
              disabled={!editorContent.trim()}
              title="Xuất file .tex, Word hoặc biên dịch PDF"
              style={{ background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)', color: 'white', border: 'none', fontWeight: 600 }}
            >
              📥 Xuất file
            </button>
            <button 
              className="btn btn-primary" 
              onClick={handleCopyToClipboard} 
              disabled={!editorContent.trim()}
            >
              📋 Copy Code
            </button>
          </div>
        }
      />

      <div className={styles.layout}>
        {/* ═══ LEFT: TOOL PANEL ═══ */}
        <aside className={styles.toolPanel}>
          <div className={styles.toolPanelHeader}>
            <div className={styles.toolPanelTitle}>
              <span>🛠️</span>
              <span>Công cụ xử lý</span>
            </div>
            <div className={styles.toolPanelSubtitle}>
              Click để áp dụng trực tiếp lên code
            </div>
          </div>

          <div className={styles.toolSections}>
            {TOOL_SECTIONS.map((section, si) => (
              <div key={si} className={styles.toolSection}>
                {section.tools.map((tool) => (
                  <button
                    key={tool.id}
                    className={`${styles.toolBtn} ${
                      tool.id === 'normalize-all' ? styles.toolBtnPrimary : ''
                    } ${tool.disabled ? styles.toolBtnDisabled : ''}`}
                    onClick={() => handleApplyTool(tool)}
                    disabled={tool.disabled || !editorContent.trim()}
                    title={tool.description || tool.label}
                  >
                    <span className={styles.toolBtnIcon}>{tool.icon}</span>
                    <span className={styles.toolBtnText}>{tool.label}</span>
                    {tool.badge && (
                      <span className={styles.toolBtnBadge}>{tool.badge}</span>
                    )}
                  </button>
                ))}
              </div>
            ))}

            {/* ═══ KIỂM TRA SECTION ═══ */}
            <div className={styles.toolSection}>
              <button
                className={`${styles.toolBtn} ${styles.toolBtnValidate}`}
                onClick={handleValidate}
                disabled={!editorContent.trim()}
                title="Tách block \begin{ex}...\end{ex} và kiểm tra ID phân loại"
              >
                <span className={styles.toolBtnIcon}>🔍</span>
                <span className={styles.toolBtnText}>Phân tích cấu trúc</span>
              </button>
            </div>

            {/* ═══ GHÉP ĐỀ THI SECTION ═══ */}
            <div className={styles.toolSection}>
              <button
                className={`${styles.toolBtn} ${styles.toolBtnAssemble}`}
                onClick={handleAssembleExam}
                disabled={!editorContent.trim()}
                title="Ghép các câu hỏi thành file content.tex hoàn chỉnh (TN → ĐS → TL ngắn → Tự luận)"
              >
                <span className={styles.toolBtnIcon}>📄</span>
                <span className={styles.toolBtnText}>Ghép đề thi</span>
              </button>
              <button
                className={`${styles.toolBtn} ${styles.toolBtnAssemble}`}
                onClick={handleSortAndStructureExam}
                disabled={!editorContent.trim()}
                title="Sắp xếp câu hỏi theo cấu trúc chương, bài, dạng toán..."
              >
                <span className={styles.toolBtnIcon}>📚</span>
                <span className={styles.toolBtnText}>Sắp xếp cấu trúc</span>
              </button>
            </div>

            {/* ═══ ID SECTION ═══ */}
            <div className={styles.toolSection}>
              <button
                className={`${styles.toolBtn} ${styles.toolBtnAssignManual}`}
                onClick={() => setIsIdModalOpen(true)}
              >
                <span className={styles.toolBtnIcon}>🏷</span>
                <span className={styles.toolBtnText}>Gán ID thủ công</span>
              </button>
              <button
                className={`${styles.toolBtn} ${styles.toolBtnAssignAuto} ${isAutoAssigning ? styles.toolBtnDisabled : ''}`}
                onClick={handleAutoAssignId}
                disabled={!editorContent.trim() || isAutoAssigning}
                title="Tự động gán ID dựa trên ngân hàng câu hỏi"
              >
                <span className={styles.toolBtnIcon}>🤖</span>
                <span className={styles.toolBtnText}>{isAutoAssigning ? 'Đang gán...' : 'Gán ID tự động'}</span>
              </button>
            </div>


            {/* ═══ VALIDATION RESULTS ═══ */}
            {hasValidated && (
              <div className={styles.validationResults}>
                {/* Stats summary */}
                <div className={styles.validationStats}>
                  <div className={`${styles.validationStat} ${styles.validationStatSuccess}`}>
                    <span className={styles.validationStatValue}>{validBlocks.length}</span>
                    <span className={styles.validationStatLabel}>Đạt</span>
                  </div>
                  <div className={`${styles.validationStat} ${styles.validationStatError}`}>
                    <span className={styles.validationStatValue}>{errorBlocks.length}</span>
                    <span className={styles.validationStatLabel}>Lỗi</span>
                  </div>
                  <div className={`${styles.validationStat} ${styles.validationStatTotal}`}>
                    <span className={styles.validationStatValue}>{totalBlocks}</span>
                    <span className={styles.validationStatLabel}>Tổng</span>
                  </div>
                </div>

                {/* Tab switcher */}
                {totalBlocks > 0 && (
                  <>
                    <div className={styles.validationTabs}>
                      <button
                        className={`${styles.validationTab} ${validationTab === 'valid' ? styles.validationTabActive : ''}`}
                        onClick={() => { setValidationTab('valid'); setExpandedBlock(null) }}
                      >
                        ✅ Đạt ({validBlocks.length})
                      </button>
                      <button
                        className={`${styles.validationTab} ${validationTab === 'errors' ? styles.validationTabActive : ''}`}
                        onClick={() => { setValidationTab('errors'); setExpandedBlock(null) }}
                      >
                        ❌ Lỗi ({errorBlocks.length})
                      </button>
                    </div>

                    {/* Block list */}
                    <div className={styles.validationList}>
                      {validationTab === 'valid' ? (
                        validBlocks.length === 0 ? (
                          <div className={styles.validationEmpty}>Không có câu nào hợp lệ</div>
                        ) : (
                          validBlocks.map((block, i) => {
                            const firstLine = block.split('\n')[0]
                            const idMatch = firstLine.match(/%\[([^\]]+)\]/)
                            const id = idMatch?.[1] || '—'
                            return (
                              <div key={i}>
                                <div
                                  className={`${styles.validationItem} ${styles.validationItemValid}`}
                                  onClick={() => setExpandedBlock(expandedBlock === i ? null : i)}
                                >
                                  <span className={styles.validationItemNum}>{i + 1}</span>
                                  <span className={styles.validationItemId}>{id}</span>
                                  <span className={styles.validationItemToggle}>
                                    {expandedBlock === i ? '▲' : '▶'}
                                  </span>
                                </div>
                                {expandedBlock === i && (
                                  <pre className={styles.validationCode}>{block}</pre>
                                )}
                              </div>
                            )
                          })
                        )
                      ) : (
                        errorBlocks.length === 0 ? (
                          <div className={styles.validationEmpty}>Không có lỗi 🎉</div>
                        ) : (
                          errorBlocks.map((err, i) => {
                            const idx = validBlocks.length + i
                            return (
                              <div key={i}>
                                <div
                                  className={`${styles.validationItem} ${styles.validationItemError}`}
                                  onClick={() => setExpandedBlock(expandedBlock === idx ? null : idx)}
                                >
                                  <span className={styles.validationItemNum}>{i + 1}</span>
                                  <span className={styles.validationItemReason}>{err.reason}</span>
                                  <span className={styles.validationItemToggle}>
                                    {expandedBlock === idx ? '▲' : '▶'}
                                  </span>
                                </div>
                                {expandedBlock === idx && (
                                  <pre className={styles.validationCode}>{err.content}</pre>
                                )}
                              </div>
                            )
                          })
                        )
                      )}
                    </div>
                  </>
                )}

                {totalBlocks === 0 && (
                  <div className={styles.validationEmpty}>
                    Không tìm thấy block \begin{'{'}ex{'}'}...\end{'{'}ex{'}'}
                  </div>
                )}
              </div>
            )}
          </div>
        </aside>

        {/* ═══ RIGHT: EDITOR PANEL ═══ */}
        <div className={styles.editorPanel}>
          {/* Toolbar */}
          <div className={styles.editorToolbar}>
            <div className={styles.editorToolbarLeft}>
              <button
                className={styles.toolbarBtn}
                onClick={handleUndo}
                disabled={!canUndo}
                title="Undo (Ctrl+Z)"
              >
                ↩️ Undo
              </button>
              <button
                className={styles.toolbarBtn}
                onClick={handleRedo}
                disabled={!canRedo}
                title="Redo (Ctrl+Y)"
              >
                ↪️ Redo
              </button>
              <div className={styles.toolbarSep} />
              <button
                className={styles.toolbarBtn}
                onClick={handlePaste}
                title="Paste từ clipboard"
              >
                📥 Paste
              </button>
              <button
                className={styles.toolbarBtn}
                onClick={handleCopy}
                disabled={!editorContent}
                title="Copy tất cả"
              >
                📋 Copy
              </button>
              <div className={styles.toolbarSep} />
              <button
                className={styles.toolbarBtn}
                onClick={handleClear}
                disabled={!editorContent.trim()}
                title="Xóa tất cả"
              >
                🗑️ Xóa
              </button>
            </div>
            <div className={styles.editorToolbarRight}>
              {lastAction && (
                <span className={styles.toolbarBtn} style={{ cursor: 'default', opacity: 0.7 }}>
                  Vừa áp dụng: {lastAction}
                </span>
              )}
            </div>
          </div>

          {/* Editor */}
          <div className={styles.editorWrapper}>
            {/* Empty state overlay */}
            {!editorContent && (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>📝</div>
                <div className={styles.emptyTitle}>Paste code TeX vào đây</div>
                <div className={styles.emptyHint}>
                  Click vào vùng tối, dán code LaTeX hoặc bắt đầu gõ.
                  <br />
                  Sau đó sử dụng các công cụ bên trái để xử lý.
                </div>
              </div>
            )}

            {/* Line numbers */}
            <div className={styles.lineNumbers} ref={lineNumbersRef}>
              {lines.map((_, i) => (
                <span key={i} className={styles.lineNumber}>{i + 1}</span>
              ))}
            </div>

            {/* Editor container with highlight overlay */}
            <div className={styles.editorContainer}>
              {/* Syntax highlight layer (behind textarea) */}
              <pre
                ref={highlightRef}
                className={styles.highlightLayer}
                aria-hidden="true"
              >
                <code dangerouslySetInnerHTML={{ __html: highlightedHtml + '\n' }} />
              </pre>

              {/* Textarea (transparent text, on top) */}
              <textarea
                ref={textareaRef}
                className={`${styles.editorTextarea} ${flashEditor ? styles.editorFlash : ''}`}
                value={editorContent}
                onChange={handleEditorChange}
                onKeyDown={handleKeyDown}
                onScroll={handleScroll}
                placeholder=""
                spellCheck={false}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
              />
            </div>
          </div>

          {/* Status bar */}
          <div className={styles.statusBar}>
            <div className={styles.statusBarLeft}>
              <span className={styles.statusItem}>
                <span className={`${styles.statusDot} ${editorContent ? '' : styles.statusDotIdle}`} />
                {editorContent ? 'Sẵn sàng' : 'Chờ nhập liệu'}
              </span>
              <span className={styles.statusItem}>
                Dòng: {lineCount}
              </span>
              <span className={styles.statusItem}>
                Ký tự: {charCount.toLocaleString()}
              </span>
            </div>
            <div className={styles.statusBarRight}>
              <span className={styles.statusItem}>
                LaTeX • UTF-8
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ TOAST ═══ */}
      {toast && (
        <div className={`${styles.toast} ${toast.type === 'success' ? styles.toastSuccess : styles.toastInfo}`}>
          {toast.message}
        </div>
      )}

      {/* ═══ GÁN ID MODAL ═══ */}
      {isIdModalOpen && (
        <div className={styles.modalOverlay} onClick={() => setIsIdModalOpen(false)}>
          <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitle}>🏷 Chọn ID Câu Hỏi</div>
              <button className={styles.modalClose} onClick={() => setIsIdModalOpen(false)}>✕</button>
            </div>
            
            <div className={styles.modalBody}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className={styles.formGroup}>
                  <label>Lớp</label>
                  <select className={styles.formSelect} value={selectedGrade} onChange={e => setSelectedGrade(Number(e.target.value))}>
                    <option value={10}>Lớp 10</option>
                    <option value={11}>Lớp 11</option>
                    <option value={12}>Lớp 12</option>
                  </select>
                </div>
                <div className={styles.formGroup}>
                  <label>Nhóm môn</label>
                  <select className={styles.formSelect} value={selectedSubject} onChange={e => {
                    setSelectedSubject(e.target.value)
                    setSelectedChapter(Number(Object.keys(CHAPTER_NAMES[selectedGrade as 10|11|12][e.target.value] || {})[0] || 1))
                  }}>
                    {Object.keys(CHAPTER_NAMES[selectedGrade as 10|11|12] || {}).map(sub => (
                      <option key={sub} value={sub}>{sub === 'D' ? 'Đại số/Giải tích' : sub === 'H' ? 'Hình học' : 'Chuyên đề'}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className={styles.formGroup}>
                <label>Chương</label>
                <select className={styles.formSelect} value={selectedChapter} onChange={e => {
                  setSelectedChapter(Number(e.target.value))
                  setSelectedLesson(1)
                }}>
                  {Object.entries(CHAPTER_NAMES[selectedGrade as 10|11|12]?.[selectedSubject] || {}).map(([cId, name]) => (
                    <option key={cId} value={Number(cId)}>{name}</option>
                  ))}
                </select>
              </div>

              <div className={styles.formGroup}>
                <label>Bài học</label>
                <select className={styles.formSelect} value={selectedLesson} onChange={e => {
                  setSelectedLesson(Number(e.target.value))
                  setSelectedVariant(1)
                }}>
                  {Object.entries(LESSON_NAMES[selectedGrade as 10|11|12]?.[selectedSubject]?.[selectedChapter] || {}).map(([lId, name]) => (
                    <option key={lId} value={Number(lId)}>{name}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className={styles.formGroup}>
                  <label>Dạng bài (Variant)</label>
                  <select className={styles.formSelect} value={selectedVariant} onChange={e => setSelectedVariant(Number(e.target.value))}>
                    {Object.entries(VARIANT_NAMES[selectedGrade as 10|11|12]?.[selectedSubject]?.[selectedChapter]?.[selectedLesson] || {}).map(([vId, name]) => (
                      <option key={vId} value={Number(vId)}>Dạng {vId}: {name}</option>
                    ))}
                  </select>
                </div>
                <div className={styles.formGroup}>
                  <label>Mức độ</label>
                  <select className={styles.formSelect} value={selectedDiff} onChange={e => setSelectedDiff(e.target.value)}>
                    <option value="N">Nhận biết (N)</option>
                    <option value="H">Thông hiểu (H)</option>
                    <option value="V">Vận dụng (V)</option>
                    <option value="C">Vận dụng cao (C)</option>
                  </select>
                </div>
              </div>

              <div className={styles.idPreviewBox}>
                ID Sẽ Gán: {getGeneratedId()}
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button className={`${styles.toolBtn}`} onClick={() => setIsIdModalOpen(false)}>Hủy</button>
              <button className={`${styles.toolBtn} ${styles.toolBtnPrimary}`} onClick={handleAssignId}>Chèn ID</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ EXPORT MODAL ═══ */}
      {showExportModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.65)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'white', borderRadius: 16, width: '100%', maxWidth: 1120, padding: 24, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#0f172a' }}>📝 Xuất file từ TeX Editor</h3>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>Cấu hình tiêu đề, mã đề rồi chọn định dạng xuất</p>
              </div>
              <button onClick={() => setShowExportModal(false)} style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8' }}>✕</button>
            </div>

            <div style={{ display: 'flex', gap: 24 }}>
              {/* ── LEFT COLUMN ── */}
              <div style={{ flex: '1 1 65%', display: 'flex', flexDirection: 'column' }}>
                {/* Formatting Toolbar */}
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 12, padding: '8px 12px', background: '#f1f5f9', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                  <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600, marginRight: 4 }}>Định dạng:</span>
                  {(['bold', 'italic', 'underline'] as const).map(prop => (
                    <button key={prop} type="button" disabled={selectedExportLine === null || selectedExportLine === 3} onClick={() => {
                      if (selectedExportLine === null || selectedExportLine === 3) return
                      const ns = [...headerStyles]; ns[selectedExportLine] = { ...ns[selectedExportLine], [prop]: !ns[selectedExportLine][prop] }; setHeaderStyles(ns)
                    }} style={{
                      width: 30, height: 30, borderRadius: 6, border: `1.5px solid ${selectedExportLine !== null && selectedExportLine !== 3 && headerStyles[selectedExportLine]?.[prop] ? '#3b82f6' : '#cbd5e1'}`,
                      background: selectedExportLine !== null && selectedExportLine !== 3 && headerStyles[selectedExportLine]?.[prop] ? '#dbeafe' : 'white',
                      cursor: selectedExportLine === null || selectedExportLine === 3 ? 'not-allowed' : 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: prop === 'bold' ? 700 : 400, fontStyle: prop === 'italic' ? 'italic' : 'normal',
                      textDecoration: prop === 'underline' ? 'underline' : 'none',
                      color: selectedExportLine !== null && selectedExportLine !== 3 && headerStyles[selectedExportLine]?.[prop] ? '#1d4ed8' : '#94a3b8',
                      opacity: selectedExportLine === null || selectedExportLine === 3 ? 0.5 : 1, transition: 'all 0.15s',
                    }}>
                      {prop === 'bold' ? 'B' : prop === 'italic' ? 'I' : 'U'}
                    </button>
                  ))}
                  <select value={selectedExportLine !== null && selectedExportLine !== 3 ? headerStyles[selectedExportLine]?.color || '' : ''}
                    disabled={selectedExportLine === null || selectedExportLine === 3}
                    onChange={e => {
                      if (selectedExportLine === null || selectedExportLine === 3) return
                      const ns = [...headerStyles]; ns[selectedExportLine] = { ...ns[selectedExportLine], color: e.target.value }; setHeaderStyles(ns)
                    }} style={{
                      height: 30, padding: '0 8px', borderRadius: 6, border: '1.5px solid #cbd5e1', fontSize: 12,
                      cursor: selectedExportLine === null || selectedExportLine === 3 ? 'not-allowed' : 'pointer',
                      background: selectedExportLine !== null && selectedExportLine !== 3 && headerStyles[selectedExportLine]?.color ? headerStyles[selectedExportLine].color : 'white',
                      color: selectedExportLine !== null && selectedExportLine !== 3 && headerStyles[selectedExportLine]?.color ? 'white' : '#64748b',
                      opacity: selectedExportLine === null || selectedExportLine === 3 ? 0.5 : 1, transition: 'all 0.15s',
                    }}>
                    <option value="">🎨 Màu</option>
                    {LATEX_COLORS.filter(c => c).map(c => <option key={c} value={c} style={{ background: c, color: 'white' }}>{c}</option>)}
                  </select>
                </div>

                {/* WYSIWYG Preview */}
                <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, padding: '16px', marginBottom: 16 }} onClick={e => { if (e.target === e.currentTarget) setSelectedExportLine(null) }}>
                  <div style={{ display: 'flex', gap: 0 }}>
                    <div style={{ flex: '0 0 45%', textAlign: 'center', padding: '4px 8px' }}>
                      {[0, 1, 2, 3].map(i => {
                        const s = headerStyles[i]; const isSelected = selectedExportLine === i; const isLocked = i === 3
                        return (
                          <div key={i} onClick={e => { e.stopPropagation(); if (!isLocked) setSelectedExportLine(i) }}
                            style={{ padding: '3px 6px', borderRadius: 4, marginBottom: 2, cursor: isLocked ? 'default' : 'text',
                              outline: isSelected ? '2px solid #3b82f6' : 'none', outlineOffset: 1,
                              background: isSelected ? '#eff6ff' : 'transparent', transition: 'all 0.15s',
                              fontSize: i === 0 ? '13px' : '12px',
                              fontWeight: s.bold ? 700 : 400, fontStyle: isLocked ? 'italic' : (s.italic ? 'italic' : 'normal'),
                              textDecoration: s.underline ? 'underline' : 'none', color: isLocked ? '#9ca3af' : (s.color || 'inherit'),
                            }}
                          >
                            {isLocked ? '(Đề thi gồm có X trang) 🔒' : (
                              isSelected ? (
                                <input type="text" value={headerLabels[i]} autoFocus placeholder={HEADER_PLACEHOLDERS[i]}
                                  onChange={e => { const n = [...headerLabels]; n[i] = e.target.value; setHeaderLabels(n) }}
                                  onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') setSelectedExportLine(null) }}
                                  style={{ width: '100%', textAlign: 'center', border: 'none', outline: 'none', background: 'transparent', fontSize: 'inherit', fontWeight: 'inherit', fontStyle: 'inherit', textDecoration: 'inherit', color: 'inherit', padding: 0 }} />
                              ) : (headerLabels[i] || <span style={{ opacity: 0.5 }}>{HEADER_PLACEHOLDERS[i]}</span>)
                            )}
                          </div>
                        )
                      })}
                    </div>
                    <div style={{ flex: '0 0 55%', textAlign: 'center', padding: '4px 8px' }}>
                      {[4, 5, 6, 7].map(i => {
                        const s = headerStyles[i]; const isSelected = selectedExportLine === i
                        return (
                          <div key={i} onClick={e => { e.stopPropagation(); setSelectedExportLine(i) }}
                            style={{ padding: '3px 6px', borderRadius: 4, marginBottom: 2, cursor: 'text',
                              outline: isSelected ? '2px solid #3b82f6' : 'none', outlineOffset: 1,
                              background: isSelected ? '#eff6ff' : 'transparent', transition: 'all 0.15s',
                              fontSize: i === 4 ? '13px' : '12px',
                              fontWeight: s.bold ? 700 : 400, fontStyle: s.italic ? 'italic' : 'normal',
                              textDecoration: s.underline ? 'underline' : 'none', color: s.color || 'inherit',
                            }}
                          >
                            {isSelected ? (
                              <input type="text" value={headerLabels[i]} autoFocus placeholder={HEADER_PLACEHOLDERS[i]}
                                onChange={e => { const n = [...headerLabels]; n[i] = e.target.value; setHeaderLabels(n) }}
                                onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') setSelectedExportLine(null) }}
                                style={{ width: '100%', textAlign: 'center', border: 'none', outline: 'none', background: 'transparent', fontSize: 'inherit', fontWeight: 'inherit', fontStyle: 'inherit', textDecoration: 'inherit', color: 'inherit', padding: 0 }} />
                            ) : (headerLabels[i] || <span style={{ opacity: 0.5 }}>{HEADER_PLACEHOLDERS[i]}</span>)}
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

                {/* Exam Codes */}
                <div style={{ background: '#f0fdf4', padding: 16, borderRadius: 10, marginBottom: 16, border: '1px solid #bbf7d0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#166534', letterSpacing: '0.05em' }}>MÃ ĐỀ THI</div>
                    <button type="button" onClick={() => setExamCodes([generateExamCode()])}
                      style={{ padding: '4px 12px', borderRadius: '6px', border: '1px solid #86efac', background: 'white', color: '#166534', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}>
                      🎲 Tạo mã ngẫu nhiên
                    </button>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                    <input type="text" value={examCodes[0] || ''} maxLength={4} onChange={e => {
                      const val = e.target.value.replace(/\D/g, '').slice(0, 4)
                      setExamCodes([val])
                    }} style={{ width: 64, padding: '8px 4px', textAlign: 'center', fontWeight: 700, fontSize: 16, borderRadius: 8, border: '2px solid #86efac', outline: 'none', color: '#166534', letterSpacing: 2 }} />
                  </div>
                </div>

                {/* Export Buttons */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginTop: 'auto', paddingTop: '16px' }}>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <button onClick={() => setShowExportModal(false)} className="btn btn-secondary" style={{ padding: '10px 20px', fontSize: 15 }}>Hủy bỏ</button>
                    <button onClick={handleExportTex} className="btn btn-primary" style={{ background: '#10b981', border: 'none', padding: '10px 24px', fontSize: 15, fontWeight: 700, boxShadow: '0 4px 6px rgba(16,185,129,0.3)' }}>📥 Xuất file .tex</button>
                    <button onClick={handleExportWord} disabled={isExportingWord} className="btn btn-primary"
                      style={{ background: '#2563eb', border: 'none', padding: '10px 24px', fontSize: 15, fontWeight: 700, boxShadow: '0 4px 6px rgba(37,99,235,0.3)', cursor: isExportingWord ? 'wait' : 'pointer', opacity: isExportingWord ? 0.7 : 1 }}>
                      {isExportingWord ? '⏳ Đang xuất Word...' : '📝 Xuất file Word'}
                    </button>
                    <button onClick={handleCompilePdf} disabled={isCompilingPdf} className="btn btn-primary"
                      style={{ background: '#6366f1', border: 'none', padding: '10px 24px', fontSize: 15, fontWeight: 700, boxShadow: '0 4px 6px rgba(99,102,241,0.3)', cursor: isCompilingPdf ? 'wait' : 'pointer', opacity: isCompilingPdf ? 0.7 : 1 }}>
                      {isCompilingPdf ? '⏳ Đang biên dịch...' : '📄 Biên dịch PDF'}
                    </button>
                  </div>
                </div>
              </div>

              {/* ── RIGHT COLUMN (Options) ── */}
              <div style={{ flex: '0 0 280px', background: '#f8fafc', borderRadius: '12px', padding: '16px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tùy chọn xuất</h4>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>Bảng đáp án Excel:</label>
                  <div style={{ position: 'relative' }}>
                    <div onClick={() => setShowExcelDropdown(!showExcelDropdown)}
                      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', background: 'white', cursor: 'pointer' }}>
                      <span>
                        {excelOptions.includes('all') || excelOptions.length === 5 ? 'Xuất tất cả các loại bảng'
                          : excelOptions.length > 0 ? `Đã chọn ${excelOptions.length} bảng`
                          : 'Không xuất bảng đáp án'}
                      </span>
                      <span style={{ transform: showExcelDropdown ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▼</span>
                    </div>
                    {showExcelDropdown && (
                      <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '4px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', zIndex: 10, padding: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {[
                          { id: 'azota', label: 'Bảng Azota' },
                          { id: 'tnmaker', label: 'Bảng TNMaker' },
                          { id: 'youngmix', label: 'Bảng Young Mix (Chấm thi QM)' },
                          { id: 'smarttest', label: 'Bảng Smart Test' },
                          { id: 'olm', label: 'Bảng OLM' },
                        ].map(opt => (
                          <label key={opt.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: '#334155', padding: '4px' }}>
                            <input type="checkbox" checked={excelOptions.includes('all') || excelOptions.includes(opt.id)}
                              onChange={e => {
                                if (excelOptions.includes('all') || excelOptions.length === 5) {
                                  setExcelOptions(['azota', 'tnmaker', 'youngmix', 'smarttest', 'olm'].filter(x => x !== opt.id))
                                } else {
                                  if (e.target.checked) setExcelOptions([...excelOptions, opt.id])
                                  else setExcelOptions(excelOptions.filter(x => x !== opt.id))
                                }
                              }}
                              style={{ width: 14, height: 14, accentColor: '#10b981', cursor: 'pointer' }} />
                            <span>{opt.label}</span>
                          </label>
                        ))}
                        <div style={{ height: '1px', background: '#e2e8f0', margin: '4px 0' }}></div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: '#334155', padding: '4px', fontWeight: 600 }}>
                          <input type="checkbox" checked={excelOptions.includes('all') || excelOptions.length === 5}
                            onChange={e => { if (e.target.checked) setExcelOptions(['all']); else setExcelOptions([]) }}
                            style={{ width: 14, height: 14, accentColor: '#10b981', cursor: 'pointer' }} />
                          <span>Tất cả</span>
                        </label>
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: '#334155', background: 'white', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                    <input type="checkbox" checked={includeAnswerTable} onChange={e => setIncludeAnswerTable(e.target.checked)} style={{ width: 16, height: 16, accentColor: '#10b981', cursor: 'pointer' }} />
                    <span style={{ flex: 1 }}>Đáp án cuối đề</span>
                  </label>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: '#334155', background: 'white', padding: '10px 12px', borderRadius: '8px', border: includeAnswerSheet ? '1.5px solid #10b981' : '1px solid #cbd5e1', transition: 'all 0.2s' }}>
                    <input type="checkbox" checked={includeAnswerSheet} onChange={e => setIncludeAnswerSheet(e.target.checked)} style={{ width: 16, height: 16, accentColor: '#10b981', cursor: 'pointer' }} />
                    <span style={{ flex: 1 }}>Phiếu trả lời trắc nghiệm</span>
                  </label>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>📱 Tạo QR Code đáp án:</label>
                  <div style={{ position: 'relative' }}>
                    <div onClick={() => setShowQrDropdown(!showQrDropdown)}
                      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', background: 'white', cursor: 'pointer' }}>
                      <span>
                        {qrCodeOptions.length === 2 ? 'Xuất tất cả QR Code'
                          : qrCodeOptions.length > 0 ? `Đã chọn ${qrCodeOptions.length} loại`
                          : 'Không xuất QR Code'}
                      </span>
                      <span style={{ transform: showQrDropdown ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▼</span>
                    </div>
                    {showQrDropdown && (
                      <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '4px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', zIndex: 10, padding: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {[
                          { id: '0', label: 'QR TNMaker' },
                          { id: '1', label: 'QR Young Mix (Chấm thi QM)' },
                        ].map(opt => (
                          <label key={opt.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: '#334155', padding: '4px' }}>
                            <input type="checkbox" checked={qrCodeOptions.includes(opt.id)}
                              onChange={e => {
                                if (e.target.checked) setQrCodeOptions([...qrCodeOptions, opt.id])
                                else setQrCodeOptions(qrCodeOptions.filter(x => x !== opt.id))
                              }}
                              style={{ width: 14, height: 14, accentColor: '#10b981', cursor: 'pointer' }} />
                            <span>{opt.label}</span>
                          </label>
                        ))}
                        <div style={{ height: '1px', background: '#e2e8f0', margin: '4px 0' }}></div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: '#334155', padding: '4px', fontWeight: 600 }}>
                          <input type="checkbox" checked={qrCodeOptions.length === 2}
                            onChange={e => { if (e.target.checked) setQrCodeOptions(['0', '1']); else setQrCodeOptions([]) }}
                            style={{ width: 14, height: 14, accentColor: '#10b981', cursor: 'pointer' }} />
                          <span>Tất cả</span>
                        </label>
                      </div>
                    )}
                  </div>
                </div>

                {/* Placeholder */}
                <div style={{ flex: 1, border: '2px dashed #cbd5e1', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.5, minHeight: '100px' }}>
                  <span style={{ fontSize: '12px', color: '#64748b', fontStyle: 'italic' }}>Không gian chờ cập nhật...</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <PdfPreviewModal
        isOpen={showPdfPreview}
        pdfBlob={pdfPreviewBlob}
        onClose={() => { setShowPdfPreview(false); setPdfPreviewBlob(null) }}
        fileName="exam.pdf"
        isLoading={isCompilingPdf && !pdfPreviewBlob}
      />
    </div>
  )
}
