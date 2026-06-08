// src/app/(dashboard)/admin/tex-processor/page.tsx
'use client'

import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import Header from '@/components/layout/Header'
import styles from './tex-processor.module.css'
import {
  normalizeQuestion,
  formatLatexIndentation,
  normalizeLineEndings,
  stripInvisibleChars,
  trimTrailingWhitespace,
  removeNonIdComments,
  ensureNewlineAfterBeginTag,
  formatDecimalsWithComma,
  replaceFracWithDfrac,
  replaceIntWithDisplaystyleInt,
  removeSpacesAroundOperators,
  replaceMiddleWithMid,
  replaceLimWithLimits,
  replaceBarWithOverline,
  removeTrailingDotInChoice,
  wrapBareNumbersInChoice,
  wrapBareMathInChoice,
} from '@/lib/latex-parser/normalizer'

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
  {
    label: 'Định dạng',
    tools: [
      {
        id: 'format-indent',
        icon: '📐',
        label: 'Thụt lề tự động',
        action: formatLatexIndentation,
      },
      {
        id: 'trim-whitespace',
        icon: '🧹',
        label: 'Xóa khoảng trắng thừa',
        action: trimTrailingWhitespace,
      },
      {
        id: 'normalize-line-endings',
        icon: '↵',
        label: 'Chuẩn hóa xuống dòng',
        action: normalizeLineEndings,
      },
      {
        id: 'strip-invisible',
        icon: '👻',
        label: 'Xóa ký tự vô hình',
        description: 'Unicode zero-width, BOM...',
        action: stripInvisibleChars,
      },
    ],
  },
  {
    label: 'Thay thế lệnh',
    tools: [
      {
        id: 'frac-to-dfrac',
        icon: '÷',
        label: '\\frac → \\dfrac',
        action: replaceFracWithDfrac,
      },
      {
        id: 'int-displaystyle',
        icon: '∫',
        label: '\\int → \\displaystyle\\int',
        action: replaceIntWithDisplaystyleInt,
      },
      {
        id: 'bar-to-overline',
        icon: '‾',
        label: '\\bar → \\overline',
        action: replaceBarWithOverline,
      },
      {
        id: 'middle-to-mid',
        icon: '|',
        label: '\\middle| → \\mid',
        action: replaceMiddleWithMid,
      },
      {
        id: 'lim-limits',
        icon: 'lim',
        label: '\\lim → \\lim\\limits',
        action: replaceLimWithLimits,
      },
    ],
  },
  {
    label: 'Xử lý nội dung',
    tools: [
      {
        id: 'format-decimals',
        icon: '🔢',
        label: 'Chuẩn hóa số thập phân',
        description: '0,5 → 0{,}5',
        action: formatDecimalsWithComma,
      },
      {
        id: 'remove-operators-spaces',
        icon: '✂️',
        label: 'Xóa cách quanh +, -, =',
        action: removeSpacesAroundOperators,
      },
      {
        id: 'remove-trailing-dot',
        icon: '.',
        label: 'Bỏ dấu chấm cuối đáp án',
        action: removeTrailingDotInChoice,
      },
      {
        id: 'wrap-bare-numbers',
        icon: '#',
        label: 'Bọc số trần trong $...$',
        action: wrapBareNumbersInChoice,
      },
      {
        id: 'wrap-bare-math',
        icon: 'Σ',
        label: 'Bọc lệnh toán thiếu $',
        action: wrapBareMathInChoice,
      },
      {
        id: 'remove-non-id-comments',
        icon: '🗑️',
        label: 'Xóa comment thừa',
        description: 'Giữ lại %[ID] hợp lệ',
        action: removeNonIdComments,
      },
      {
        id: 'ensure-newline',
        icon: '⏎',
        label: 'Xuống dòng sau \\begin{ex}',
        action: ensureNewlineAfterBeginTag,
      },
    ],
  },
  {
    label: 'Sắp tới',
    tools: [
      {
        id: 'latex-preview',
        icon: '👁️',
        label: 'Preview LaTeX',
        action: (c) => c,
        disabled: true,
        badge: 'Soon',
      },
      {
        id: 'convert-encoding',
        icon: '🔤',
        label: 'Chuyển encoding',
        action: (c) => c,
        disabled: true,
        badge: 'Soon',
      },
      {
        id: 'external-api',
        icon: '🌐',
        label: 'API chuẩn hóa ngoài',
        action: (c) => c,
        disabled: true,
        badge: 'Soon',
      },
    ],
  },
]

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

  // ═══ Computed values ═══
  const lines = editorContent.split('\n')
  const lineCount = lines.length
  const charCount = editorContent.length

  return (
    <div className={styles.page}>
      <Header
        title="Xử lí TeX"
        subtitle="Chuẩn hóa, định dạng và xử lý code LaTeX"
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
              <div key={si}>
                {si > 0 && <div className={styles.toolSeparator} />}
                <div className={styles.toolSection}>
                  <div className={styles.toolSectionLabel}>{section.label}</div>
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
              </div>
            ))}
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
    </div>
  )
}
