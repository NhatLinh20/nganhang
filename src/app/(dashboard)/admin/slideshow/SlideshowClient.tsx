// src/app/(dashboard)/admin/slideshow/SlideshowClient.tsx
'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import Header from '@/components/layout/Header'
import styles from './slideshow.module.css'
import {
  parseAllSlideQuestions,
  type SlideQuestion,
  type ContentSegment,
} from '@/lib/latex-parser/slideshow-parser'

// ═══════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════

const TYPE_LABELS: Record<string, string> = {
  multiple_choice: 'Trắc nghiệm',
  true_false: 'Đúng/Sai',
  short_answer: 'Trả lời ngắn',
  essay: 'Tự luận',
}
const TYPE_ICONS: Record<string, string> = {
  multiple_choice: '⏺',
  true_false: '☑',
  short_answer: '✍',
  essay: '📝',
}
const TYPE_CSS: Record<string, string> = {
  multiple_choice: 'mc',
  true_false: 'tf',
  short_answer: 'sa',
  essay: 'es',
}

const STORAGE_KEY = 'nht_slideshow_data'
type Theme = 'dark' | 'light' | 'blue'

// ═══════════════════════════════════════════════════
// KaTeX RENDERING
// ═══════════════════════════════════════════════════

const KATEX_MACROS = {
  '\\heva': '\\left\\{\\begin{aligned}#1\\end{aligned}\\right.',
  '\\hoac': '\\left[\\begin{aligned}#1\\end{aligned}\\right.',
  '\\vv': '\\overrightarrow{#1}',
}

function renderKatex(math: string, displayMode: boolean): string {
  try {
    return katex.renderToString(math, { 
      displayMode, 
      throwOnError: false, 
      trust: true, 
      strict: false,
      macros: KATEX_MACROS
    })
  } catch {
    return `<code>${escapeHtml(math)}</code>`
  }
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function processTextSegment(text: string): string {
  let html = escapeHtml(text)
  html = html.replace(/\\textbf\{([^}]+)\}/g, '<strong>$1</strong>')
  html = html.replace(/\\textit\{([^}]+)\}/g, '<em>$1</em>')
  html = html.replace(/\\underline\{([^}]+)\}/g, '<u>$1</u>')
  html = html.replace(/\\text\{([^}]+)\}/g, '$1')
  html = html.replace(/\\qquad/g, '&emsp;&emsp;')
  html = html.replace(/\\quad/g, '&emsp;')
  html = html.replace(/\\\\/g, '<br>')
  html = html.replace(/\n/g, '<br>')
  // Cleanup tab/indent
  html = html.replace(/\t/g, '')
  return html
}

/** Render mixed LaTeX: $...$ → KaTeX inline, $$...$$ → KaTeX display */
function renderLatexContent(text: string): string {
  if (!text) return ''
  let html = ''
  const displayParts = text.split(/(\$\$[\s\S]*?\$\$)/g)
  for (const part of displayParts) {
    if (part.startsWith('$$') && part.endsWith('$$') && part.length > 4) {
      html += renderKatex(part.slice(2, -2).trim(), true)
    } else {
      const inlineParts = part.split(/(\$[^\n$]+?\$)/g)
      for (const iPart of inlineParts) {
        if (iPart.startsWith('$') && iPart.endsWith('$') && iPart.length > 2) {
          html += renderKatex(iPart.slice(1, -1), false)
        } else {
          html += processTextSegment(iPart)
        }
      }
    }
  }
  return html
}

function RenderedLatex({ content, className }: { content: string; className?: string }) {
  return <div className={className} dangerouslySetInnerHTML={{ __html: renderLatexContent(content) }} />
}

// ═══════════════════════════════════════════════════
// SEGMENT RENDERER — text + image blocks
// ═══════════════════════════════════════════════════

function RenderedSegments({
  segments, questionId, part, imageMap, onUploadClick, small,
}: {
  segments: ContentSegment[]
  questionId: string
  part: 'body' | 'sol'
  imageMap: Record<string, string>
  onUploadClick?: (key: string) => void
  small?: boolean
}) {
  return (
    <>
      {segments.map((seg, idx) => {
        const imgKey = `${questionId}:${part}:${idx}`
        if (seg.type === 'image') {
          const img = imageMap[imgKey]
          if (img) {
            return (
              <img
                key={imgKey}
                src={img}
                alt="Hình minh họa"
                className={small ? styles.tikzImageSmall : styles.tikzImage}
                onClick={() => onUploadClick?.(imgKey)}
                style={{ cursor: onUploadClick ? 'pointer' : 'default' }}
              />
            )
          }
          return (
            <div
              key={imgKey}
              className={small ? styles.tikzPlaceholderSmall : styles.tikzPlaceholder}
              onClick={() => onUploadClick?.(imgKey)}
              style={{ cursor: onUploadClick ? 'pointer' : 'default' }}
            >
              🖼️ {onUploadClick ? 'Bấm để upload hình' : 'Hình ảnh TikZ — Chưa có ảnh'}
            </div>
          )
        }
        return <RenderedLatex key={imgKey} content={seg.content} className={small ? styles.previewText : undefined} />
      })}
    </>
  )
}

// ═══════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════

export default function SlideshowClient({ userRole }: { userRole: string }) {
  // ─── Phase ─────────────────────────────────────
  const [phase, setPhase] = useState<'editor' | 'present'>('editor')

  // ─── Editor State ──────────────────────────────
  const [editorContent, setEditorContent] = useState('')
  const [questions, setQuestions] = useState<SlideQuestion[]>([])
  const [theme, setTheme] = useState<Theme>('dark')
  const [savedMsg, setSavedMsg] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ─── Image Map: key = "qId:body:idx" or "qId:sol:idx" → Data URL ───
  const [imageMap, setImageMap] = useState<Record<string, string>>({})
  const [uploadKey, setUploadKey] = useState<string | null>(null) // currently uploading
  const [tempImage, setTempImage] = useState<string | null>(null)
  const uploadFileRef = useRef<HTMLInputElement>(null)

  // ─── Solution Expand ───────────────────────────
  const [expandedSolutions, setExpandedSolutions] = useState<Set<string>>(new Set())

  // ─── Present State ─────────────────────────────
  const [currentSlide, setCurrentSlide] = useState(0)
  const [showAnswer, setShowAnswer] = useState(false)
  const [showSolution, setShowSolution] = useState(false)
  const [slideKey, setSlideKey] = useState(0)
  const [slideDirection, setSlideDirection] = useState<'next' | 'prev'>('next')

  // ═══════════════════════════════════════════════
  // LOAD / SAVE localStorage
  // ═══════════════════════════════════════════════
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const data = JSON.parse(raw)
        if (data.editorContent) setEditorContent(data.editorContent)
        if (data.questions?.length) setQuestions(data.questions)
        if (data.theme) setTheme(data.theme)
        if (data.imageMap) setImageMap(data.imageMap)
      }
    } catch { /* ignore */ }
  }, [])

  const saveToStorage = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ editorContent, questions, theme, imageMap }))
      setSavedMsg('✓ Đã lưu')
      setTimeout(() => setSavedMsg(''), 2000)
    } catch { /* ignore */ }
  }, [editorContent, questions, theme, imageMap])

  // ═══════════════════════════════════════════════
  // KEYBOARD SHORTCUTS (PRESENT MODE)
  // ═══════════════════════════════════════════════
  useEffect(() => {
    if (phase !== 'present') return
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      switch (e.key) {
        case 'ArrowRight': case ' ': e.preventDefault(); goNext(); break
        case 'ArrowLeft': e.preventDefault(); goPrev(); break
        case 'a': case 'A': setShowAnswer(p => !p); break
        case 's': case 'S': setShowSolution(p => !p); break
        case 'Escape': exitPresent(); break
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  })

  // ═══════════════════════════════════════════════
  // HANDLERS
  // ═══════════════════════════════════════════════

  const handleParse = () => {
    if (!editorContent.trim()) return
    const parsed = parseAllSlideQuestions(editorContent)
    setQuestions(parsed)
  }

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      if (text) setEditorContent(prev => prev ? prev + '\n\n' + text : text)
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const handleDeleteQuestion = (idx: number) => {
    setQuestions(prev => prev.filter((_, i) => i !== idx))
  }

  // ─── Image Upload ──────────────────────────────
  const openImageUpload = (key: string) => {
    setUploadKey(key)
    setTempImage(imageMap[key] || null)
  }

  const handleImagePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (file) readImageFile(file)
        break
      }
    }
  }

  const handleImageFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) readImageFile(file)
  }

  const readImageFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = (ev) => setTempImage(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  const confirmImageUpload = () => {
    if (uploadKey && tempImage) {
      setImageMap(prev => ({ ...prev, [uploadKey]: tempImage }))
    }
    setUploadKey(null)
    setTempImage(null)
  }

  // ─── Solution toggle in preview ────────────────
  const toggleSolution = (qId: string) => {
    setExpandedSolutions(prev => {
      const next = new Set(prev)
      next.has(qId) ? next.delete(qId) : next.add(qId)
      return next
    })
  }

  // ─── Present Navigation ────────────────────────
  const goNext = useCallback(() => {
    if (currentSlide < questions.length - 1) {
      setSlideDirection('next')
      setCurrentSlide(p => p + 1)
      setSlideKey(p => p + 1)
      setShowAnswer(false)
      setShowSolution(false)
    }
  }, [currentSlide, questions.length])

  const goPrev = useCallback(() => {
    if (currentSlide > 0) {
      setSlideDirection('prev')
      setCurrentSlide(p => p - 1)
      setSlideKey(p => p + 1)
      setShowAnswer(false)
      setShowSolution(false)
    }
  }, [currentSlide])

  const startPresent = () => {
    if (questions.length === 0) return
    setCurrentSlide(0)
    setShowAnswer(false)
    setShowSolution(false)
    setSlideKey(0)
    setSlideDirection('next')
    setPhase('present')
    try { document.documentElement.requestFullscreen?.() } catch { /* ok */ }
  }

  const exitPresent = () => {
    setPhase('editor')
    try { document.exitFullscreen?.() } catch { /* ok */ }
  }

  // ═══════════════════════════════════════════════
  // RENDER: EDITOR PHASE
  // ═══════════════════════════════════════════════

  const renderEditor = () => (
    <>
      <Header title="🖥️ Trình chiếu câu hỏi" />
      <div className={styles.editorLayout}>
        {/* ─── LEFT: Code Editor ─── */}
        <div className={styles.leftPanel}>
          <div className={styles.editorHeader}>
            <h3>📝 Nhập code LaTeX</h3>
            <button className={styles.importBtn} onClick={() => fileInputRef.current?.click()}>📁 Import .tex</button>
            <input ref={fileInputRef} type="file" accept=".tex,.txt" style={{ display: 'none' }} onChange={handleImportFile} />
            <button className={styles.importBtn} onClick={saveToStorage}>💾 Lưu</button>
            {savedMsg && <span style={{ fontSize: '0.78rem', color: '#69f0ae' }}>{savedMsg}</span>}
          </div>
          <textarea
            className={styles.codeTextarea}
            value={editorContent}
            onChange={e => setEditorContent(e.target.value)}
            placeholder={`Paste code LaTeX chứa câu hỏi vào đây...\n\n\\begin{ex}%[...]\n\tCâu hỏi...\n\t\\choice\n\t{A}{\\True B}{C}{D}\n\t\\loigiai{...}\n\\end{ex}\n\nHoặc bấm "Import .tex" để tải file từ máy.`}
            spellCheck={false}
          />
          <button className={styles.parseBtn} onClick={handleParse} disabled={!editorContent.trim()}>
            ⚡ Parse câu hỏi
          </button>
        </div>

        {/* ─── RIGHT: Preview danh sách câu hỏi ─── */}
        <div className={styles.rightPanel}>
          <div className={styles.rightHeader}>
            <h3>📋 Preview câu hỏi</h3>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              {questions.length > 0 && (
                <span className={styles.questionCount}>{questions.length} câu</span>
              )}
            </div>
          </div>

          <div className={styles.questionList}>
            {questions.length === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>📭</div>
                <div>Chưa có câu hỏi nào</div>
                <div style={{ fontSize: '0.78rem' }}>Paste code LaTeX bên trái rồi bấm &quot;Parse&quot;</div>
              </div>
            ) : (
              questions.map((q, idx) => (
                <div key={q.id} className={styles.previewCard}>
                  {/* Header */}
                  <div className={styles.previewHeader}>
                    <span className={styles.cardNum}>{idx + 1}</span>
                    <span className={`${styles.typeBadge} ${styles[TYPE_CSS[q.questionType]]}`}>
                      {TYPE_ICONS[q.questionType]} {TYPE_LABELS[q.questionType]}
                    </span>
                    {q.hasTikz && <span className={styles.tikzBadge}>🖼️ TikZ</span>}
                    <button className={styles.cardDelete} onClick={() => handleDeleteQuestion(idx)} title="Xóa câu">✕</button>
                  </div>

                  {/* Body segments: text + hình */}
                  <div className={styles.previewBody}>
                    <RenderedSegments
                      segments={q.bodySegments}
                      questionId={q.id}
                      part="body"
                      imageMap={imageMap}
                      onUploadClick={openImageUpload}
                      small
                    />
                  </div>

                  {/* Choices / TF / ShortAnswer */}
                  {q.questionType === 'multiple_choice' && q.choices && (
                    <div className={styles.previewChoices}>
                      {q.choices.map(c => (
                        <div key={c.label} className={`${styles.previewChoice} ${c.isCorrect ? styles.previewCorrect : ''}`}>
                          <strong>{c.label}.</strong> <RenderedLatex content={c.content} className={styles.previewChoiceText} />
                        </div>
                      ))}
                    </div>
                  )}

                  {q.questionType === 'true_false' && q.tfStatements && (
                    <div className={styles.previewChoices}>
                      {q.tfStatements.map(s => (
                        <div key={s.label} className={`${styles.previewChoice} ${s.isTrue ? styles.previewCorrect : ''}`}>
                          <strong>{s.label})</strong> <RenderedLatex content={s.content} className={styles.previewChoiceText} />
                          <span className={styles.previewTFMark}>{s.isTrue ? 'Đ' : 'S'}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {q.questionType === 'short_answer' && q.shortAnswer && (
                    <div className={styles.previewShortAns}>
                      Đáp số: <RenderedLatex content={`$${q.shortAnswer}$`} className={styles.previewShortAnsValue} />
                    </div>
                  )}

                  {/* Solution toggle */}
                  {q.solutionSegments && q.solutionSegments.length > 0 && (
                    <div className={styles.previewSolutionWrap}>
                      <button className={styles.previewSolutionToggle} onClick={() => toggleSolution(q.id)}>
                        {expandedSolutions.has(q.id) ? '▾' : '▸'} Lời giải
                      </button>
                      {expandedSolutions.has(q.id) && (
                        <div className={styles.previewSolutionBody}>
                          <RenderedSegments
                            segments={q.solutionSegments}
                            questionId={q.id}
                            part="sol"
                            imageMap={imageMap}
                            onUploadClick={openImageUpload}
                            small
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Config + Start */}
          <div className={styles.configSection}>
            <div className={styles.configRow}>
              <span className={styles.configLabel}>Theme:</span>
              <div className={styles.themeSelector}>
                {(['dark', 'light', 'blue'] as Theme[]).map(t => (
                  <button
                    key={t}
                    className={`${styles.themeBtn} ${styles[('theme' + t.charAt(0).toUpperCase() + t.slice(1)) as keyof typeof styles]} ${theme === t ? styles.active : ''}`}
                    onClick={() => setTheme(t)}
                    title={t === 'dark' ? 'Tối' : t === 'light' ? 'Sáng' : 'Xanh'}
                  />
                ))}
              </div>
            </div>
            <button className={styles.startBtn} onClick={startPresent} disabled={questions.length === 0}>
              🚀 Bắt đầu trình chiếu
            </button>
          </div>
        </div>
      </div>

      {/* ─── Image Upload Modal ─── */}
      {uploadKey !== null && (
        <div className={styles.imageUploadOverlay} onClick={() => { setUploadKey(null); setTempImage(null) }}>
          <div className={styles.imageUploadModal} onClick={e => e.stopPropagation()} onPaste={handleImagePaste}>
            <h3>🖼️ Upload hình ảnh</h3>
            <div className={styles.dropZone} onClick={() => uploadFileRef.current?.click()}>
              {tempImage
                ? <img src={tempImage} alt="Preview" className={styles.imagePreview} />
                : <><div className={styles.dropZoneIcon}>📋</div><div>Paste hình (Ctrl+V) hoặc bấm để chọn file</div></>}
            </div>
            <input ref={uploadFileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageFileSelect} />
            <div className={styles.modalActions}>
              <button className={styles.modalBtn} onClick={() => { setUploadKey(null); setTempImage(null) }}>Hủy</button>
              <button className={styles.modalBtnPrimary} onClick={confirmImageUpload} disabled={!tempImage}>✓ Xác nhận</button>
            </div>
          </div>
        </div>
      )}
    </>
  )

  // ═══════════════════════════════════════════════
  // RENDER: PRESENT PHASE
  // ═══════════════════════════════════════════════

  const renderPresent = () => {
    const q = questions[currentSlide]
    if (!q) return null

    const themeClass = theme === 'dark' ? styles.themeDark : theme === 'light' ? styles.themeLight : styles.themeBlue
    const animClass = slideDirection === 'next' ? styles.slideAnimateRight : styles.slideAnimateLeft
    const progress = ((currentSlide + 1) / questions.length) * 100

    return (
      <div className={`${styles.presentOverlay} ${themeClass}`}>
        {/* Top Bar */}
        <div className={styles.topBar}>
          <div className={styles.topLeft}>
            <span className={styles.slideCounter}>Câu {currentSlide + 1}/{questions.length}</span>
            <span className={`${styles.slideTypeBadge} ${styles[TYPE_CSS[q.questionType]]}`}>
              {TYPE_ICONS[q.questionType]} {TYPE_LABELS[q.questionType]}
            </span>
          </div>
          <button className={styles.exitBtn} onClick={exitPresent}>✕ Thoát</button>
        </div>

        {/* Progress */}
        <div className={styles.progressBar}>
          <div className={styles.progressFill} style={{ width: `${progress}%` }} />
        </div>

        {/* Slide Content */}
        <div className={`${styles.slideContent} ${animClass}`} key={slideKey}>
          <div className={styles.slideInner}>
            {/* Body segments */}
            <div className={styles.questionBodyArea}>
              <RenderedSegments segments={q.bodySegments} questionId={q.id} part="body" imageMap={imageMap} />
            </div>

            {/* MC Choices */}
            {q.questionType === 'multiple_choice' && q.choices && (
              <div className={styles.choicesGrid}>
                {q.choices.map(c => (
                  <div key={c.label} className={`${styles.choiceCard} ${showAnswer ? (c.isCorrect ? styles.correct : styles.incorrect) : ''}`}>
                    <div className={styles.choiceLabel}>{c.label}</div>
                    <RenderedLatex content={c.content} className={styles.choiceText} />
                  </div>
                ))}
              </div>
            )}

            {/* TF */}
            {q.questionType === 'true_false' && q.tfStatements && (
              <div className={styles.tfList}>
                {q.tfStatements.map(s => (
                  <div key={s.label} className={styles.tfItem}>
                    <div className={styles.tfLabel}>{s.label})</div>
                    <RenderedLatex content={s.content} className={styles.tfContent} />
                    {showAnswer && (
                      <span className={`${styles.tfAnswer} ${s.isTrue ? styles.tfTrue : styles.tfFalse}`}>
                        {s.isTrue ? 'Đ' : 'S'}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Short Answer */}
            {q.questionType === 'short_answer' && (
              <div className={styles.shortAnswerBox}>
                <span className={styles.saLabel}>Đáp số:</span>
                {showAnswer && q.shortAnswer
                  ? <RenderedLatex content={`$${q.shortAnswer}$`} className={styles.saAnswer} />
                  : <div className={styles.saPlaceholder} />}
              </div>
            )}

            {/* Solution */}
            {showSolution && q.solutionSegments && q.solutionSegments.length > 0 && (
              <div className={styles.solutionBox}>
                <div className={styles.solutionHeader}>📖 Lời giải</div>
                <div className={styles.solutionBody}>
                  <RenderedSegments segments={q.solutionSegments} questionId={q.id} part="sol" imageMap={imageMap} />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Bottom Bar */}
        <div className={styles.bottomBar}>
          <button className={styles.navBtn} onClick={goPrev} disabled={currentSlide === 0}>
            ◀ Trước <span className={styles.shortcutHint}>←</span>
          </button>
          <button className={`${styles.answerBtn} ${showAnswer ? styles.active : ''}`} onClick={() => setShowAnswer(p => !p)}>
            {showAnswer ? '🟢' : '🔘'} Đáp án <span className={styles.shortcutHint}>A</span>
          </button>
          {q.solutionSegments && q.solutionSegments.length > 0 && (
            <button className={`${styles.solutionBtn} ${showSolution ? styles.active : ''}`} onClick={() => setShowSolution(p => !p)}>
              {showSolution ? '📖' : '📕'} Lời giải <span className={styles.shortcutHint}>S</span>
            </button>
          )}
          <button className={styles.navBtn} onClick={goNext} disabled={currentSlide === questions.length - 1}>
            Sau ▶ <span className={styles.shortcutHint}>→</span>
          </button>
        </div>
      </div>
    )
  }

  // ═══════════════════════════════════════════════
  if (phase === 'present') return renderPresent()
  return renderEditor()
}
