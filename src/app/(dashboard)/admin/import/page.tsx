// src/app/(dashboard)/admin/import/page.tsx
'use client'

import { useState, useRef, useCallback, DragEvent } from 'react'
import Header from '@/components/layout/Header'
import { parseTexFile, formatImportReport } from '@/lib/latex-parser/file-parser'
import type { ParsedQuestion, ImportResult } from '@/types'
import styles from './import.module.css'
import Link from 'next/link'
import JSZip from 'jszip'

interface FileEntry {
  file: File
  id: string
}

interface PreviewData {
  questions: ParsedQuestion[]
  errors: ImportResult['errors']
  result: ImportResult
}

const TYPE_LABELS: Record<string, string> = {
  multiple_choice: 'Trắc nghiệm',
  true_false: 'Đúng/Sai',
  short_answer: 'Trả lời kết quả',
  essay: 'Tự luận',
}

const DIFF_LABELS: Record<string, string> = {
  N: 'Nhận biết',
  H: 'Thông hiểu',
  V: 'Vận dụng',
  C: 'Vận dụng cao',
}

export default function ImportPage() {
  const [files, setFiles] = useState<FileEntry[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [importResult, setImportResult] = useState<{ success: boolean; message: string } | null>(null)
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)
  const [extractingZip, setExtractingZip] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ─── Extract .tex files from a ZIP ──────────────────
  const extractTexFromZip = async (zipFile: File): Promise<File[]> => {
    const zip = await JSZip.loadAsync(zipFile)
    const texFiles: File[] = []

    for (const [relativePath, entry] of Object.entries(zip.files)) {
      // Bỏ qua thư mục, file ẩn (__MACOSX), và file không phải .tex
      if (entry.dir) continue
      if (relativePath.startsWith('__MACOSX')) continue
      if (relativePath.startsWith('.')) continue
      if (!relativePath.toLowerCase().endsWith('.tex')) continue

      // Bỏ qua các file config (main.tex, khaibaochung.tex, etc.)
      const baseName = relativePath.split('/').pop()?.toLowerCase() || ''
      if (['main.tex', 'khaibaochung.tex'].includes(baseName)) continue

      try {
        const content = await entry.async('uint8array')
        // Thử đọc nội dung text để kiểm tra có chứa câu hỏi không
        const textContent = new TextDecoder('utf-8').decode(content)
        if (!textContent.includes('\\begin{ex}')) continue // Bỏ qua file không chứa câu hỏi

        const fileName = relativePath.split('/').pop() || relativePath
        const file = new File([content.buffer as ArrayBuffer], fileName, { type: 'text/x-tex' })
        texFiles.push(file)
      } catch (e) {
        console.warn(`Không thể đọc file ${relativePath} trong ZIP:`, e)
      }
    }

    return texFiles
  }

  // ─── File handling ───────────────────────────────────
  const addFiles = async (newFiles: File[]) => {
    const validFiles: File[] = []
    const zipFiles = newFiles.filter(f => f.name.toLowerCase().endsWith('.zip'))
    const texFiles = newFiles.filter(f => f.name.toLowerCase().endsWith('.tex'))

    if (zipFiles.length === 0 && texFiles.length === 0) {
      alert('Chỉ chấp nhận file .tex hoặc .zip')
      return
    }

    // Trích xuất .tex từ các file .zip
    if (zipFiles.length > 0) {
      setExtractingZip(true)
      try {
        for (const zipFile of zipFiles) {
          const extracted = await extractTexFromZip(zipFile)
          if (extracted.length === 0) {
            alert(`⚠️ File ${zipFile.name} không chứa file .tex nào có câu hỏi (\\begin{ex}...\\end{ex})`)
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
    setPreview(null)
    setImportResult(null)
  }

  const onDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(false)
    addFiles(Array.from(e.dataTransfer.files))
  }, [])

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id))
    setPreview(null)
    setImportResult(null)
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  // ─── Parse preview ───────────────────────────────────
  const handleParse = async () => {
    if (files.length === 0) return
    setParsing(true)
    setPreview(null)

    const allQuestions: ParsedQuestion[] = []
    const allErrors: ImportResult['errors'] = []
    let totalBlocks = 0

    for (const { file } of files) {
      const text = await file.text()
      const { questions, result } = parseTexFile(text, {
        sourceFile: file.name,
        skipDuplicates: false,
      })
      allQuestions.push(...questions)
      allErrors.push(...result.errors)
      totalBlocks += result.total
    }

    setPreview({
      questions: allQuestions,
      errors: allErrors,
      result: {
        total: totalBlocks,
        success: allQuestions.length,
        skipped: 0,
        errors: allErrors,
      },
    })
    setParsing(false)
  }

  // ─── Import to DB ─────────────────────────────────────
  const handleImport = async () => {
    if (!preview || preview.questions.length === 0) return
    setImporting(true)

    try {
      // Gửi từng file lên API
      let totalSuccess = 0
      let totalSkipped = 0

      for (const { file } of files) {
        const formData = new FormData()
        formData.append('file', file)
        formData.append('source_file', file.name)

        const res = await fetch('/api/import', {
          method: 'POST',
          body: formData,
        })
        const json = await res.json()
        if (json.data?.result) {
          totalSuccess += json.data.result.success
          totalSkipped += json.data.result.skipped
        }
      }

      setImportResult({
        success: true,
        message: `✅ Import thành công ${totalSuccess} câu hỏi mới${totalSkipped > 0 ? ` (bỏ qua ${totalSkipped} câu trùng lặp)` : ''}.`,
      })
      setFiles([])
      setPreview(null)
    } catch (err) {
      setImportResult({
        success: false,
        message: `❌ Lỗi: ${err instanceof Error ? err.message : 'Unknown error'}`,
      })
    }
    setImporting(false)
  }

  return (
    <>
      <Header
        title="Import file .tex"
        subtitle="Thêm câu hỏi vào ngân hàng từ file LaTeX hoặc ZIP"
        actions={
          <Link href="/admin/questions" className="btn btn-secondary">
            📚 Xem ngân hàng
          </Link>
        }
      />

      <div className={styles.importPage}>

        {/* ─── UPLOAD ZONE ─── */}
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
                hoặc <span className={styles.uploadBrowse}>click để chọn file</span> — hỗ trợ .tex và .zip (tự động trích xuất câu hỏi từ ZIP)
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

        {/* ─── FILE LIST ─── */}
        {files.length > 0 && (
          <div className={styles.fileList}>
            {files.map(({ file, id }) => (
              <div key={id} className={styles.fileItem}>
                <span className={styles.fileIcon}>{file.name.toLowerCase().endsWith('.zip') ? '📦' : '📄'}</span>
                <div className={styles.fileInfo}>
                  <div className={styles.fileName}>{file.name}</div>
                  <div className={styles.fileSize}>{formatSize(file.size)}</div>
                </div>
                <button
                  className={styles.fileRemove}
                  onClick={() => removeFile(id)}
                  title="Xóa khỏi danh sách"
                >
                  ✕
                </button>
              </div>
            ))}

            <div className={styles.parseArea}>
              <button
                className="btn btn-primary btn-lg"
                onClick={handleParse}
                disabled={parsing}
              >
                {parsing
                  ? <><span className={styles.spinner} /> Đang phân tích...</>
                  : `🔍 Phân tích ${files.length} file`
                }
              </button>
              {preview && (
                <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-gray-500)' }}>
                  Tìm thấy {preview.result.total} block câu hỏi
                </span>
              )}
            </div>
          </div>
        )}

        {/* ─── PREVIEW ─── */}
        {preview && (
          <div className={styles.previewSection}>
            <div className={styles.previewHeader}>
              <div className={styles.previewTitle}>
                Kết quả phân tích
              </div>
              <div className={styles.previewStats}>
                <div className={`${styles.stat} ${styles.statSuccess}`}>
                  <span className={styles.statValue}>{preview.result.success}</span>
                  <span className={styles.statLabel}>Hợp lệ</span>
                </div>
                <div className={`${styles.stat} ${styles.statError}`}>
                  <span className={styles.statValue}>
                    {preview.errors.filter(e => e.reason !== 'duplicate').length}
                  </span>
                  <span className={styles.statLabel}>Lỗi</span>
                </div>
                <div className={`${styles.stat} ${styles.statSkipped}`}>
                  <span className={styles.statValue}>{preview.result.total}</span>
                  <span className={styles.statLabel}>Tổng block</span>
                </div>
              </div>
            </div>

            {/* Preview table */}
            {preview.questions.length > 0 && (
              <>
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
                      <th>File nguồn</th>
                      <th>Preview LaTeX</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.questions.map((q, i) => (
                      <>
                        <tr
                          key={i}
                          className={styles.previewRow}
                          onClick={() => setExpandedIdx(expandedIdx === i ? null : i)}
                        >
                          <td>{i + 1}</td>
                          <td>
                            <span style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: '12px',
                              fontWeight: 600,
                              color: 'var(--color-primary-700)',
                              background: 'var(--color-primary-50)',
                              padding: '2px 8px',
                              borderRadius: '4px',
                            }}>
                              {q.category_code}
                            </span>
                          </td>
                          <td>{q.grade}</td>
                          <td>{q.chapter}</td>
                          <td>
                            <span className={`badge badge-${q.difficulty}`}>
                              {DIFF_LABELS[q.difficulty]}
                            </span>
                          </td>
                          <td>{TYPE_LABELS[q.question_type]}</td>
                          <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '12px' }}>
                            {q.correct_answer || '—'}
                          </td>
                          <td>{q.has_image ? '🖼' : ''}</td>
                          <td style={{ fontSize: '12px', color: 'var(--color-gray-500)' }}>
                            {q.source_file}
                          </td>
                          <td>
                            <div className={styles.previewLatex}>
                              {q.latex_content.slice(0, 80)}...
                            </div>
                          </td>
                        </tr>
                        {expandedIdx === i && (
                          <tr key={`exp-${i}`}>
                            <td colSpan={10} style={{ padding: 0, background: '#0f172a' }}>
                              <pre style={{
                                fontFamily: 'var(--font-mono)',
                                fontSize: '12.5px',
                                color: '#e2e8f0',
                                padding: '16px 24px',
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                                lineHeight: 1.6,
                                margin: 0,
                                maxHeight: '300px',
                                overflowY: 'auto',
                              }}>
                                {q.latex_content}
                              </pre>
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>

                {/* Import button */}
                <div style={{ marginTop: 'var(--space-6)', display: 'flex', gap: 'var(--space-4)', alignItems: 'center' }}>
                  <button
                    className="btn btn-primary btn-lg"
                    onClick={handleImport}
                    disabled={importing}
                  >
                    {importing
                      ? <><span className={styles.spinner} /> Đang import...</>
                      : `📥 Import ${preview.questions.length} câu hỏi vào ngân hàng`
                    }
                  </button>
                  <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-gray-500)' }}>
                    Câu trùng nội dung sẽ tự động bỏ qua
                  </span>
                </div>
              </>
            )}

            {/* Errors */}
            {preview.errors.filter(e => e.reason !== 'duplicate').length > 0 && (
              <div className={styles.errorList} style={{ marginTop: 'var(--space-6)' }}>
                <div style={{
                  fontWeight: 600,
                  fontSize: 'var(--text-sm)',
                  marginBottom: 'var(--space-3)',
                  color: 'var(--color-error-600)'
                }}>
                  ❌ Câu hỏi bị từ chối ({preview.errors.filter(e => e.reason !== 'duplicate').length} câu)
                </div>
                {preview.errors
                  .filter(e => e.reason !== 'duplicate')
                  .map((err, i) => (
                    <div key={i} className={styles.errorItem}>
                      <div className={styles.errorReason}>
                        {err.reason === 'no_valid_id' && '⛔ Không có ID 6 tham số hợp lệ'}
                        {err.reason === 'empty_content' && '⛔ Nội dung rỗng'}
                        {err.reason === 'parse_error' && '⛔ Lỗi phân tích'}
                      </div>
                      {err.detail && <div className={styles.errorDetail}>{err.detail}</div>}
                      {err.content && (
                        <div className={styles.errorDetail} style={{ marginTop: '4px', opacity: 0.7 }}>
                          {err.content}
                        </div>
                      )}
                    </div>
                  ))
                }
              </div>
            )}
          </div>
        )}

        {/* ─── IMPORT RESULT ─── */}
        {importResult && (
          <div className={`${styles.importResult} ${importResult.success ? styles.importResultSuccess : styles.importResultError}`}>
            <div className={styles.resultIcon}>{importResult.success ? '🎉' : '❌'}</div>
            <div className={styles.resultTitle}>
              {importResult.success ? 'Import hoàn tất!' : 'Import thất bại'}
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
