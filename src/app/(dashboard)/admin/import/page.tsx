// src/app/(dashboard)/admin/import/page.tsx
'use client'

import { useState, useRef, useCallback, DragEvent, Fragment } from 'react'
import Header from '@/components/layout/Header'
import { extractAndValidateBlocks, normalizeAllQuestions, parseTexFile, formatImportReport } from '@/lib/latex-parser'
import type { ErrorBlock } from '@/lib/latex-parser'
import type { ParsedQuestion, ImportResult } from '@/types'
import styles from './import.module.css'
import Link from 'next/link'
import JSZip from 'jszip'

interface FileEntry {
  file: File
  id: string
}

const TYPE_LABELS: Record<string, string> = {
  multiple_choice: 'Trắc nghiệm',
  true_false: 'Đúng/Sai',
  short_answer: 'Trả lời ngắn',
  essay: 'Tự luận',
}

const DIFF_LABELS: Record<string, string> = {
  N: 'Nhận biết',
  H: 'Thông hiểu',
  V: 'Vận dụng',
  C: 'Vận dụng cao',
}

type Step = 1 | 2 | 3 | 4

export default function ImportPage() {
  // ─── Step 1: Upload state ───────────────────────────
  const [files, setFiles] = useState<FileEntry[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [extractingZip, setExtractingZip] = useState(false)
  const [inputMode, setInputMode] = useState<'file' | 'code'>('file')
  const [codeInput, setCodeInput] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ─── Step 2: Phân tích state ────────────────────────
  const [parsing, setParsing] = useState(false)
  const [validBlocks, setValidBlocks] = useState<string[]>([])
  const [errorBlocks, setErrorBlocks] = useState<ErrorBlock[]>([])
  const [activeTab, setActiveTab] = useState<'valid' | 'errors'>('valid')
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [editContent, setEditContent] = useState('')
  const [expandedValid, setExpandedValid] = useState<number | null>(null)

  // ─── Step 3: Chuẩn hóa & Parse state ───────────────
  const [normalizing, setNormalizing] = useState(false)
  const [isNormalized, setIsNormalized] = useState(false)
  const [parsedQuestions, setParsedQuestions] = useState<ParsedQuestion[]>([])
  const [expandedParsed, setExpandedParsed] = useState<number | null>(null)

  // ─── Step 4: Import state ──────────────────────────
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ success: boolean; message: string } | null>(null)

  // ─── Derived ─────────────────────────────────────────
  const currentStep: Step = importResult ? 4
    : parsedQuestions.length > 0 ? 3
    : (validBlocks.length > 0 || errorBlocks.length > 0) ? 2
    : 1

  // ═══════════════════════════════════════════════════
  // STEP 1: Upload helpers
  // ═══════════════════════════════════════════════════

  const extractTexFromZip = async (zipFile: File): Promise<File[]> => {
    const zip = await JSZip.loadAsync(zipFile)
    const texFiles: File[] = []

    for (const [relativePath, entry] of Object.entries(zip.files)) {
      if (entry.dir) continue
      if (relativePath.startsWith('__MACOSX')) continue
      if (relativePath.startsWith('.')) continue
      if (!relativePath.toLowerCase().endsWith('.tex')) continue

      const baseName = relativePath.split('/').pop()?.toLowerCase() || ''
      if (['main.tex', 'khaibaochung.tex'].includes(baseName)) continue

      try {
        const content = await entry.async('uint8array')
        const textContent = new TextDecoder('utf-8').decode(content)
        if (!textContent.includes('\\begin{ex}')) continue

        const fileName = relativePath.split('/').pop() || relativePath
        const file = new File([content.buffer as ArrayBuffer], fileName, { type: 'text/x-tex' })
        texFiles.push(file)
      } catch (e) {
        console.warn(`Không thể đọc file ${relativePath} trong ZIP:`, e)
      }
    }
    return texFiles
  }

  const addFiles = async (newFiles: File[]) => {
    const validFiles: File[] = []
    const zipFiles = newFiles.filter(f => f.name.toLowerCase().endsWith('.zip'))
    const texFiles = newFiles.filter(f => f.name.toLowerCase().endsWith('.tex'))

    if (zipFiles.length === 0 && texFiles.length === 0) {
      alert('Chỉ chấp nhận file .tex hoặc .zip')
      return
    }

    if (zipFiles.length > 0) {
      setExtractingZip(true)
      try {
        for (const zipFile of zipFiles) {
          const extracted = await extractTexFromZip(zipFile)
          if (extracted.length === 0) {
            alert(`⚠️ File ${zipFile.name} không chứa file .tex nào có câu hỏi`)
          } else {
            validFiles.push(...extracted)
          }
        }
      } catch (err) {
        alert(`❌ Lỗi giải nén ZIP: ${err instanceof Error ? err.message : 'Unknown'}`)
      } finally {
        setExtractingZip(false)
      }
    }

    validFiles.push(...texFiles)
    if (validFiles.length === 0) return

    setFiles(prev => {
      const existingNames = new Set(prev.map(e => e.file.name))
      const toAdd = validFiles
        .filter(f => !existingNames.has(f.name))
        .map(f => ({ file: f, id: `${f.name}-${f.size}` }))
      return [...prev, ...toAdd]
    })
    resetFromStep2()
  }

  const onDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(false)
    addFiles(Array.from(e.dataTransfer.files))
  }, [])

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id))
    resetFromStep2()
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const resetFromStep2 = () => {
    setValidBlocks([])
    setErrorBlocks([])
    setIsNormalized(false)
    setParsedQuestions([])
    setImportResult(null)
    setEditingIdx(null)
    setExpandedValid(null)
    setExpandedParsed(null)
  }

  // ═══════════════════════════════════════════════════
  // STEP 2: Phân tích (tách block + validate ID)
  // ═══════════════════════════════════════════════════

  const handleAnalyze = async () => {
    setParsing(true)
    resetFromStep2()

    const allValid: string[] = []
    const allErrors: ErrorBlock[] = []

    if (inputMode === 'code' && codeInput.trim()) {
      // Từ textarea nhập code trực tiếp
      const result = extractAndValidateBlocks(codeInput)
      allValid.push(...result.validBlocks)
      allErrors.push(...result.errorBlocks)
    } else {
      // Từ file upload
      for (const { file } of files) {
        const text = await file.text()
        const result = extractAndValidateBlocks(text)
        allValid.push(...result.validBlocks)
        allErrors.push(...result.errorBlocks)
      }
    }

    setValidBlocks(allValid)
    setErrorBlocks(allErrors)
    setActiveTab(allValid.length > 0 ? 'valid' : 'errors')
    setParsing(false)
  }

  // ─── Sửa câu lỗi ─────────────────────────────────
  const startEdit = (idx: number) => {
    setEditingIdx(idx)
    setEditContent(errorBlocks[idx].content)
  }

  const saveEdit = (idx: number) => {
    const trimmed = editContent.trim()
    if (!trimmed) return

    // Re-validate block đã sửa
    const result = extractAndValidateBlocks(trimmed)

    if (result.validBlocks.length > 0) {
      // Hết lỗi → chuyển sang tab "Câu đạt"
      setValidBlocks(prev => [...prev, ...result.validBlocks])
      setErrorBlocks(prev => prev.filter((_, i) => i !== idx))
      setEditingIdx(null)
      setEditContent('')
      // Nếu không còn câu lỗi nào, auto chuyển tab
      if (errorBlocks.length <= 1) {
        setActiveTab('valid')
      }
    } else {
      // Vẫn lỗi → cập nhật lý do lỗi mới
      setErrorBlocks(prev =>
        prev.map((e, i) =>
          i === idx
            ? { content: trimmed, reason: result.errorBlocks[0]?.reason || 'Vẫn không có ID hợp lệ' }
            : e
        )
      )
    }
  }

  const cancelEdit = () => {
    setEditingIdx(null)
    setEditContent('')
  }

  // ═══════════════════════════════════════════════════
  // STEP 3: Chuẩn hóa & Parse chi tiết
  // ═══════════════════════════════════════════════════

  const handleNormalize = () => {
    setNormalizing(true)

    // Chuẩn hóa tất cả câu đạt
    const normalized = normalizeAllQuestions(validBlocks)
    setValidBlocks(normalized)
    setIsNormalized(true)
    setNormalizing(false)
  }

  const handleParse = () => {
    // Parse chi tiết từng block đã chuẩn hóa
    const allQuestions: ParsedQuestion[] = []

    for (const block of validBlocks) {
      const { questions } = parseTexFile(block, { skipDuplicates: false })
      allQuestions.push(...questions)
    }

    setParsedQuestions(allQuestions)
  }

  // ═══════════════════════════════════════════════════
  // STEP 4: Import vào Database
  // ═══════════════════════════════════════════════════

  const handleImport = async () => {
    if (parsedQuestions.length === 0) return
    setImporting(true)

    try {
      // Chia thành batch nhỏ (200 câu/batch) để tránh lỗi Request Entity Too Large
      const BATCH_SIZE = 200
      let totalSuccess = 0
      let totalSkipped = 0

      for (let i = 0; i < parsedQuestions.length; i += BATCH_SIZE) {
        const batch = parsedQuestions.slice(i, i + BATCH_SIZE)
        const batchNum = Math.floor(i / BATCH_SIZE) + 1
        const totalBatches = Math.ceil(parsedQuestions.length / BATCH_SIZE)

        // Cập nhật tiến trình
        setImportResult({
          success: false,
          message: `⏳ Đang import batch ${batchNum}/${totalBatches} (${i + 1}–${Math.min(i + BATCH_SIZE, parsedQuestions.length)} / ${parsedQuestions.length} câu)...`,
        })

        const res = await fetch('/api/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ questions: batch }),
        })

        // Xử lý response không phải JSON (VD: 413 Request Entity Too Large)
        let json
        try {
          json = await res.json()
        } catch {
          const text = await res.text().catch(() => `HTTP ${res.status}`)
          setImportResult({
            success: false,
            message: `❌ Lỗi batch ${batchNum}: Server trả về response không hợp lệ (${text.slice(0, 100)})`,
          })
          setImporting(false)
          return
        }

        if (!res.ok) {
          setImportResult({
            success: false,
            message: `❌ Lỗi batch ${batchNum}: ${json.error || 'Unknown'}`,
          })
          setImporting(false)
          return
        }

        const r = json.data?.result
        totalSuccess += r?.success || 0
        totalSkipped += r?.skipped || 0
      }

      setImportResult({
        success: true,
        message: `✅ Import thành công ${totalSuccess} câu hỏi mới${totalSkipped > 0 ? ` (bỏ qua ${totalSkipped} câu trùng lặp)` : ''}.`,
      })
    } catch (err) {
      setImportResult({
        success: false,
        message: `❌ Lỗi: ${err instanceof Error ? err.message : 'Unknown error'}`,
      })
    }
    setImporting(false)
  }


  const canAnalyze = inputMode === 'code' ? codeInput.trim().length > 0 : files.length > 0

  // ═══════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════
  return (
    <>
      <Header
        title="Import file .tex"
        subtitle="Thêm câu hỏi vào ngân hàng từ file LaTeX, ZIP hoặc nhập code trực tiếp"
        actions={
          <Link href="/admin/questions" className="btn btn-secondary">
            📚 Xem ngân hàng
          </Link>
        }
      />

      <div className={styles.importPage}>

        {/* ═══ STEP INDICATOR ═══ */}
        <div className={styles.stepIndicator}>
          {[
            { num: 1, label: 'Tải file lên', icon: '📁' },
            { num: 2, label: 'Phân tích', icon: '🔍' },
            { num: 3, label: 'Chuẩn hóa & Parse', icon: '✨' },
            { num: 4, label: 'Import', icon: '📥' },
          ].map(({ num, label, icon }) => (
            <div
              key={num}
              className={`${styles.step} ${currentStep >= num ? styles.stepActive : ''} ${currentStep === num ? styles.stepCurrent : ''}`}
            >
              <div className={styles.stepNum}>{icon}</div>
              <div className={styles.stepLabel}>{label}</div>
            </div>
          ))}
        </div>

        {/* ═══ STEP 1: UPLOAD / PASTE CODE ═══ */}
        <div className={styles.card}>
          <div className={styles.cardTitle}>Bước 1: Tải file lên hoặc nhập code</div>

          {/* Input mode tabs */}
          <div className={styles.modeTabs}>
            <button
              className={`${styles.modeTab} ${inputMode === 'file' ? styles.modeTabActive : ''}`}
              onClick={() => setInputMode('file')}
            >
              📁 Tải file
            </button>
            <button
              className={`${styles.modeTab} ${inputMode === 'code' ? styles.modeTabActive : ''}`}
              onClick={() => setInputMode('code')}
            >
              📝 Nhập code
            </button>
          </div>

          {inputMode === 'file' ? (
            <>
              {/* Upload zone */}
              <div
                className={`${styles.uploadZone} ${dragOver ? styles.uploadZoneDragOver : ''}`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                {extractingZip ? (
                  <>
                    <div className={styles.uploadIcon}><span className={styles.spinner} /></div>
                    <div className={styles.uploadTitle}>Đang giải nén file ZIP...</div>
                    <div className={styles.uploadText}>Tìm kiếm các file .tex chứa câu hỏi bên trong</div>
                  </>
                ) : (
                  <>
                    <div className={styles.uploadIcon}>📁</div>
                    <div className={styles.uploadTitle}>Kéo thả file .tex hoặc .zip vào đây</div>
                    <div className={styles.uploadText}>
                      hoặc <span className={styles.uploadBrowse}>click để chọn file</span> — hỗ trợ .tex và .zip
                    </div>
                  </>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".tex,.zip"
                  multiple
                  className={styles.uploadInput}
                  onChange={e => addFiles(Array.from(e.target.files || []))}
                />
              </div>

              {/* File list */}
              {files.length > 0 && (
                <div className={styles.fileList}>
                  {files.map(({ file, id }) => (
                    <div key={id} className={styles.fileItem}>
                      <span className={styles.fileIcon}>📄</span>
                      <div className={styles.fileInfo}>
                        <div className={styles.fileName}>{file.name}</div>
                        <div className={styles.fileSize}>{formatSize(file.size)}</div>
                      </div>
                      <button className={styles.fileRemove} onClick={() => removeFile(id)} title="Xóa">✕</button>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            /* Code input textarea */
            <textarea
              className={styles.codeTextarea}
              placeholder={'Paste đoạn code LaTeX chứa câu hỏi vào đây...\n\n\\begin{ex}%[2D1N3-1]\nCâu hỏi ở đây...\n\\end{ex}'}
              value={codeInput}
              onChange={(e) => { setCodeInput(e.target.value); resetFromStep2() }}
              rows={12}
              spellCheck={false}
            />
          )}

          {/* Analyze button */}
          <div className={styles.parseArea}>
            <button
              className="btn btn-primary btn-lg"
              onClick={handleAnalyze}
              disabled={parsing || !canAnalyze}
            >
              {parsing
                ? <><span className={styles.spinner} /> Đang phân tích...</>
                : `🔍 Phân tích ${inputMode === 'file' ? `${files.length} file` : 'code'}`
              }
            </button>
          </div>
        </div>

        {/* ═══ STEP 2: PHÂN TÍCH & XEM TRƯỚC ═══ */}
        {currentStep >= 2 && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Bước 2: Phân tích & Xem trước</div>

            {/* Stats */}
            <div className={styles.previewStats}>
              <div className={`${styles.stat} ${styles.statSuccess}`}>
                <span className={styles.statValue}>{validBlocks.length}</span>
                <span className={styles.statLabel}>Hợp lệ</span>
              </div>
              <div className={`${styles.stat} ${styles.statError}`}>
                <span className={styles.statValue}>{errorBlocks.length}</span>
                <span className={styles.statLabel}>Lỗi</span>
              </div>
              <div className={`${styles.stat} ${styles.statSkipped}`}>
                <span className={styles.statValue}>{validBlocks.length + errorBlocks.length}</span>
                <span className={styles.statLabel}>Tổng</span>
              </div>
            </div>

            {/* Tabs */}
            <div className={styles.tabBar}>
              <button
                className={`${styles.tab} ${activeTab === 'valid' ? styles.tabActive : ''}`}
                onClick={() => setActiveTab('valid')}
              >
                ✅ Câu đạt ({validBlocks.length})
              </button>
              <button
                className={`${styles.tab} ${activeTab === 'errors' ? styles.tabActive : ''}`}
                onClick={() => setActiveTab('errors')}
              >
                ❌ Câu lỗi ({errorBlocks.length})
              </button>
            </div>

            {/* Tab: Câu đạt */}
            {activeTab === 'valid' && (
              <div className={styles.tabContent}>
                {validBlocks.length === 0 ? (
                  <div className={styles.emptyState}>Không có câu nào hợp lệ</div>
                ) : (
                  <>
                    <div className={styles.blockList}>
                      {validBlocks.map((block, i) => {
                        const firstLine = block.split('\n')[0]
                        const idMatch = firstLine.match(/%\[([^\]]+)\]/)
                        const id = idMatch?.[1] || '—'

                        return (
                          <Fragment key={i}>
                            <div
                              className={`${styles.blockItem} ${expandedValid === i ? styles.blockItemExpanded : ''}`}
                              onClick={() => setExpandedValid(expandedValid === i ? null : i)}
                            >
                              <span className={styles.blockNum}>{i + 1}</span>
                              <span className={styles.blockId}>{id}</span>
                              <span className={styles.blockPreview}>{firstLine.slice(0, 80)}</span>
                              <span className={styles.blockToggle}>{expandedValid === i ? '▲' : '▶'}</span>
                            </div>
                            {expandedValid === i && (
                              <div className={styles.blockExpanded}>
                                <pre className={styles.blockCode}>{block}</pre>
                              </div>
                            )}
                          </Fragment>
                        )
                      })}
                    </div>

                    {/* Nút Chuẩn hóa & Parse */}
                    <div className={styles.stepActions}>
                      {!isNormalized ? (
                        <button
                          className="btn btn-primary btn-lg"
                          onClick={handleNormalize}
                          disabled={normalizing}
                        >
                          {normalizing ? <><span className={styles.spinner} /> Đang chuẩn hóa...</> : '✨ Chuẩn hóa'}
                        </button>
                      ) : parsedQuestions.length === 0 ? (
                        <button className="btn btn-primary btn-lg" onClick={handleParse}>
                          🔄 Parse chi tiết
                        </button>
                      ) : null}
                      {isNormalized && parsedQuestions.length === 0 && (
                        <span className={styles.stepNote}>✅ Đã chuẩn hóa xong. Nhấn Parse chi tiết để phân tích loại câu, đáp án.</span>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Tab: Câu lỗi */}
            {activeTab === 'errors' && (
              <div className={styles.tabContent}>
                {errorBlocks.length === 0 ? (
                  <div className={styles.emptyState}>Không có câu nào bị lỗi 🎉</div>
                ) : (
                  <div className={styles.errorList}>
                    {errorBlocks.map((err, i) => (
                      <div key={i} className={styles.errorCard}>
                        <div className={styles.errorHeader}>
                          <span className={styles.errorBadge}>⛔ Câu {i + 1}</span>
                          <span className={styles.errorReason}>{err.reason}</span>
                        </div>

                        {editingIdx === i ? (
                          <>
                            <textarea
                              className={styles.errorEditor}
                              value={editContent}
                              onChange={e => setEditContent(e.target.value)}
                              rows={8}
                              spellCheck={false}
                            />
                            <div className={styles.errorActions}>
                              <button className="btn btn-sm btn-secondary" onClick={cancelEdit}>Hủy</button>
                              <button className="btn btn-sm btn-primary" onClick={() => saveEdit(i)}>💾 Lưu & Kiểm tra lại</button>
                            </div>
                          </>
                        ) : (
                          <>
                            <pre className={styles.errorCode}>{err.content}</pre>
                            <div className={styles.errorActions}>
                              <button className="btn btn-sm btn-secondary" onClick={() => startEdit(i)}>✏️ Chỉnh sửa</button>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ═══ STEP 3: KẾT QUẢ PARSE CHI TIẾT ═══ */}
        {parsedQuestions.length > 0 && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>Bước 3: Kết quả Parse chi tiết — {parsedQuestions.length} câu hỏi</div>

            <div className={styles.tableWrap}>
              <table className={styles.previewTable}>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Mã ID</th>
                    <th>Lớp</th>
                    <th>Chương</th>
                    <th>Mức độ</th>
                    <th>Loại câu</th>
                    <th>Đáp án</th>
                    <th>Hình</th>
                    <th>Preview</th>
                  </tr>
                </thead>
                <tbody>
                  {parsedQuestions.map((q, i) => (
                    <Fragment key={i}>
                      <tr
                        className={styles.previewRow}
                        onClick={() => setExpandedParsed(expandedParsed === i ? null : i)}
                      >
                        <td>{i + 1}</td>
                        <td><span className={styles.idBadge}>{q.category_code}</span></td>
                        <td>{q.grade}</td>
                        <td>{q.chapter}</td>
                        <td><span className={`badge badge-${q.difficulty}`}>{DIFF_LABELS[q.difficulty]}</span></td>
                        <td>{TYPE_LABELS[q.question_type]}</td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '12px' }}>{q.correct_answer || '—'}</td>
                        <td>{q.has_image ? '🖼' : ''}</td>
                        <td><div className={styles.previewLatex}>{q.latex_content.slice(0, 80)}...</div></td>
                      </tr>
                      {expandedParsed === i && (
                        <tr>
                          <td colSpan={9} style={{ padding: 0, background: '#0f172a' }}>
                            <pre style={{
                              fontFamily: 'var(--font-mono)', fontSize: '12.5px',
                              color: '#e2e8f0', padding: '16px 24px',
                              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                              lineHeight: 1.6, margin: 0, maxHeight: '300px', overflowY: 'auto',
                            }}>
                              {q.latex_content}
                            </pre>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Import button */}
            <div className={styles.stepActions}>
              <button
                className="btn btn-primary btn-lg"
                onClick={handleImport}
                disabled={importing}
              >
                {importing
                  ? <><span className={styles.spinner} /> Đang import...</>
                  : `📥 Import ${parsedQuestions.length} câu hỏi vào ngân hàng`
                }
              </button>
              <span className={styles.stepNote}>Câu trùng nội dung sẽ tự động bỏ qua</span>
            </div>
          </div>
        )}

        {/* ═══ STEP 4: KẾT QUẢ IMPORT ═══ */}
        {importResult && (
          <div className={`${styles.importResult} ${importResult.success ? styles.importResultSuccess : importing ? '' : styles.importResultError}`}>
            <div className={styles.resultIcon}>{importResult.success ? '🎉' : importing ? '⏳' : '❌'}</div>
            <div className={styles.resultTitle}>
              {importResult.success ? 'Import hoàn tất!' : importing ? 'Đang import...' : 'Import thất bại'}
            </div>
            <div className={styles.resultDetail}>{importResult.message}</div>
            {importResult.success && (
              <div style={{ marginTop: 'var(--space-4)' }}>
                <Link href="/admin/questions" className="btn btn-primary">
                  📚 Xem ngân hàng câu hỏi
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}
