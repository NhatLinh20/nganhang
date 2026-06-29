'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import styles from './PdfPreviewModal.module.css'
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'

// Initialize worker (same pattern as pdf-utils.ts)
if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/legacy/build/pdf.worker.min.mjs`
}

interface PdfPreviewModalProps {
  pdfBlob: Blob | null
  isOpen: boolean
  onClose: () => void
  fileName?: string
  isLoading?: boolean
}

export default function PdfPreviewModal({ pdfBlob, isOpen, onClose, fileName = 'document.pdf', isLoading = false }: PdfPreviewModalProps) {
  const [numPages, setNumPages] = useState(0)
  const [scale, setScale] = useState(1.2)
  const [pageInputVal, setPageInputVal] = useState('1')
  const [renderedPages, setRenderedPages] = useState<HTMLCanvasElement[]>([])
  const viewportRef = useRef<HTMLDivElement>(null)
  const pdfDocRef = useRef<any>(null)

  // Load PDF document when blob changes
  useEffect(() => {
    if (!pdfBlob || !isOpen) return
    let cancelled = false

    const loadPdf = async () => {
      try {
        const arrayBuffer = await pdfBlob.arrayBuffer()
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
        if (cancelled) return
        pdfDocRef.current = pdf
        setNumPages(pdf.numPages)
        setPageInputVal('1')
      } catch (err) {
        console.error('Failed to load PDF:', err)
      }
    }

    loadPdf()
    return () => { cancelled = true }
  }, [pdfBlob, isOpen])

  // Render all pages when pdf or scale changes
  useEffect(() => {
    if (!pdfDocRef.current || numPages === 0) return
    let cancelled = false

    const renderAllPages = async () => {
      const pdf = pdfDocRef.current
      const canvases: HTMLCanvasElement[] = []

      for (let i = 1; i <= numPages; i++) {
        if (cancelled) return
        const page = await pdf.getPage(i)
        const viewport = page.getViewport({ scale })
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        if (!ctx) continue

        // Use device pixel ratio for sharp rendering
        const dpr = window.devicePixelRatio || 1
        canvas.width = viewport.width * dpr
        canvas.height = viewport.height * dpr
        canvas.style.width = `${viewport.width}px`
        canvas.style.height = `${viewport.height}px`
        ctx.scale(dpr, dpr)

        await page.render({ canvasContext: ctx, viewport }).promise
        canvases.push(canvas)
      }

      if (!cancelled) {
        setRenderedPages(canvases)
      }
    }

    renderAllPages()
    return () => { cancelled = true }
  }, [numPages, scale])

  // Handle Escape key
  useEffect(() => {
    if (!isOpen) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isOpen, onClose])

  // Cleanup on close
  useEffect(() => {
    if (!isOpen) {
      setRenderedPages([])
      setNumPages(0)
      pdfDocRef.current = null
    }
  }, [isOpen])

  const handleDownload = useCallback(() => {
    if (!pdfBlob) return
    const url = URL.createObjectURL(pdfBlob)
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }, [pdfBlob, fileName])

  const handlePrint = useCallback(() => {
    if (!pdfBlob) return
    const url = URL.createObjectURL(pdfBlob)
    const printWindow = window.open(url)
    if (printWindow) {
      printWindow.addEventListener('load', () => {
        printWindow.print()
      })
    }
  }, [pdfBlob])

  const handleZoomIn = () => setScale(s => Math.min(s + 0.2, 3.0))
  const handleZoomOut = () => setScale(s => Math.max(s - 0.2, 0.4))

  const scrollToPage = (pageNum: number) => {
    const container = viewportRef.current
    if (!container) return
    const wrappers = container.querySelectorAll(`.${styles.pageWrapper}`)
    const target = wrappers[pageNum - 1]
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  const handlePageInput = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const num = parseInt(pageInputVal)
      if (num >= 1 && num <= numPages) {
        scrollToPage(num)
      }
    }
  }

  if (!isOpen) return null

  return (
    <div className={styles.overlay}>
      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          📄 {fileName}
        </div>

        <div className={styles.toolbarCenter}>
          {numPages > 0 && (
            <>
              <button className={styles.navBtn} onClick={() => { const p = Math.max(1, parseInt(pageInputVal) - 1); setPageInputVal(String(p)); scrollToPage(p) }} disabled={parseInt(pageInputVal) <= 1}>◀</button>
              <input
                className={styles.pageInput}
                value={pageInputVal}
                onChange={e => setPageInputVal(e.target.value)}
                onKeyDown={handlePageInput}
                type="text"
              />
              <span>/ {numPages}</span>
              <button className={styles.navBtn} onClick={() => { const p = Math.min(numPages, parseInt(pageInputVal) + 1); setPageInputVal(String(p)); scrollToPage(p) }} disabled={parseInt(pageInputVal) >= numPages}>▶</button>

              <span style={{ margin: '0 8px', borderLeft: '1px solid rgba(255,255,255,0.2)', height: 20 }} />

              <button className={styles.zoomBtn} onClick={handleZoomOut}>−</button>
              <span className={styles.zoomLabel}>{Math.round(scale * 100)}%</span>
              <button className={styles.zoomBtn} onClick={handleZoomIn}>+</button>
            </>
          )}
        </div>

        <div className={styles.toolbarRight}>
          {pdfBlob && (
            <>
              <button className={styles.downloadBtn} onClick={handleDownload}>
                📥 <span>Tải PDF</span>
              </button>
              <button className={styles.printBtn} onClick={handlePrint}>
                🖨️ <span>In</span>
              </button>
            </>
          )}
          <button className={styles.closeBtn} onClick={onClose} title="Đóng (Esc)">✕</button>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className={styles.loading}>
          <div className={styles.spinner} />
          <span className={styles.loadingText}>⏳ Đang biên dịch PDF...</span>
        </div>
      ) : renderedPages.length > 0 ? (
        <div className={styles.viewport} ref={viewportRef}>
          {renderedPages.map((canvas, i) => (
            <div key={i} className={styles.pageWrapper}>
              <canvas
                className={styles.pageCanvas}
                ref={el => {
                  if (el && el !== canvas) {
                    // Replace the placeholder canvas with the rendered one
                    el.width = canvas.width
                    el.height = canvas.height
                    el.style.width = canvas.style.width
                    el.style.height = canvas.style.height
                    const ctx = el.getContext('2d')
                    if (ctx) ctx.drawImage(canvas, 0, 0)
                  }
                }}
              />
            </div>
          ))}
        </div>
      ) : pdfBlob ? (
        <div className={styles.loading}>
          <div className={styles.spinner} />
          <span className={styles.loadingText}>Đang tải trang PDF...</span>
        </div>
      ) : (
        <div className={styles.empty}>Không có dữ liệu PDF</div>
      )}
    </div>
  )
}
