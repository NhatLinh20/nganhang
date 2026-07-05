// src/app/(dashboard)/admin/slideshow/SlideshowClient.tsx
'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { RenderedLatex } from '@/components/RenderedLatex'
import Header from '@/components/layout/Header'
import styles from './slideshow.module.css'
import {
  parseAllSlideQuestions,
  parseSlideQuestion,
  extractRawExBlocks,
  type SlideQuestion,
  type ContentSegment,
} from '@/lib/latex-parser/slideshow-parser'
import { compileTikz } from '@/lib/tikz-api'
import { createClient } from '@/lib/supabase/client'

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
type Theme = 'minimal' | 'blue' | 'light'


// SEGMENT RENDERER
// ═══════════════════════════════════════════════════

function RenderedSegments({
  segments, questionId, part, imageMap, onUploadClick, isCompiling
}: {
  segments: ContentSegment[]
  questionId: string
  part: string
  imageMap: Record<string, string>
  onUploadClick?: (key: string) => void
  isCompiling?: boolean
}) {
  return (
    <>
      {segments.map((seg, idx) => {
        const imgKey = `${questionId}:${part}:${idx}`
        if (seg.type === 'image') {
          const svg = imageMap[imgKey]
          if (svg) {
            // Check if it's a data URL (manually uploaded image) or raw SVG
            if (svg.startsWith('data:')) {
              return (
                <img key={imgKey} src={svg} alt="Hình" className={styles.tikzImageSmall}
                  onClick={() => onUploadClick?.(imgKey)}
                  style={{ cursor: onUploadClick ? 'pointer' : 'default' }} />
              )
            }
            return (
              <div key={imgKey} className={styles.tikzImageSmall}
                style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: onUploadClick ? 'pointer' : 'default' }}
                onClick={() => onUploadClick?.(imgKey)}
                dangerouslySetInnerHTML={{ __html: svg }} />
            )
          }
          // If still compiling, show a loading placeholder
          if (isCompiling) {
            return (
              <div key={imgKey} className={styles.tikzPlaceholderSmall}
                style={{ border: '1px dashed #3b82f6', color: '#3b82f6', padding: '12px', textAlign: 'center', borderRadius: 8 }}>
                <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⏳</span> Đang biên dịch...
              </div>
            )
          }
          // Compilation failed or not yet compiled — clickable fallback for manual upload
          return (
            <div key={imgKey} className={styles.tikzPlaceholderSmall}
              onClick={() => onUploadClick?.(imgKey)}
              style={{ border: '1px dashed #ef4444', color: '#ef4444', padding: '12px', textAlign: 'center', borderRadius: 8, cursor: onUploadClick ? 'pointer' : 'default' }}>
              ⚠️ {onUploadClick ? 'Biên dịch lỗi. Bấm để upload hình thủ công' : 'Hình ảnh TikZ (Lỗi biên dịch)'}
            </div>
          )
        }
        return <RenderedLatex key={imgKey} content={seg.content} className={styles.previewText} />
      })}
    </>
  )
}

// ═══════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════

export default function SlideshowClient({ userRole }: { userRole: string }) {
  // ─── Phase: input → review → present ───
  const [phase, setPhase] = useState<'input' | 'review' | 'present'>('input')

  // ─── Input State ───
  const [editorContent, setEditorContent] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ─── Review State ───
  const [rawBlocks, setRawBlocks] = useState<string[]>([])
  const [questions, setQuestions] = useState<SlideQuestion[]>([])
  const [theme, setTheme] = useState<Theme>('minimal')
  const [imageMap, setImageMap] = useState<Record<string, string>>({})
  const [expandedSolutions, setExpandedSolutions] = useState<Set<string>>(new Set())

  // ─── Batch Compile Progress ───
  const [isCompiling, setIsCompiling] = useState(false)
  const [compileProgress, setCompileProgress] = useState({ done: 0, total: 0 })

  // ─── Image Upload (fallback) ───
  const [uploadKey, setUploadKey] = useState<string | null>(null)
  const [tempImage, setTempImage] = useState<string | null>(null)
  const uploadFileRef = useRef<HTMLInputElement>(null)

  // ─── Present State ───
  const [currentSlide, setCurrentSlide] = useState(0)
  const [showAnswer, setShowAnswer] = useState(false)
  const [showSolution, setShowSolution] = useState(false)
  const [slideKey, setSlideKey] = useState(0)
  const [slideDirection, setSlideDirection] = useState<'next' | 'prev'>('next')
  const [zoomLevel, setZoomLevel] = useState(100)

  // ─── Audio State ───
  const [playingPart, setPlayingPart] = useState<string | null>(null)
  const [isAudioLoading, setIsAudioLoading] = useState(false)
  const [autoPlay, setAutoPlay] = useState(false)
  const [playbackRate, setPlaybackRate] = useState<number>(1)
  const [showQuestionList, setShowQuestionList] = useState(false)
  const [audioProgress, setAudioProgress] = useState(0)
  const [audioDuration, setAudioDuration] = useState(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate
    }
  }, [playbackRate])

  // ═══════════════════════════════════════════════
  // ON MOUNT: check sessionStorage for code from other pages
  // ═══════════════════════════════════════════════
  useEffect(() => {
    try {
      const fromOtherPage = sessionStorage.getItem('slideshow_code')
      if (fromOtherPage) {
        setEditorContent(fromOtherPage)
        sessionStorage.removeItem('slideshow_code')
        return
      }
      // Fallback: load saved state
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const data = JSON.parse(raw)
        if (data.editorContent) setEditorContent(data.editorContent)
        if (data.theme) setTheme(data.theme)
        if (data.imageMap) setImageMap(data.imageMap)
      }
    } catch { /* ignore */ }
  }, [])

  // ═══════════════════════════════════════════════
  // SAVE
  // ═══════════════════════════════════════════════
  const saveToStorage = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ editorContent, theme, imageMap }))
    } catch { /* ignore */ }
  }, [editorContent, theme, imageMap])

  // ═══════════════════════════════════════════════
  // KEYBOARD (PRESENT)
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
        case '+': case '=': setZoomLevel(p => Math.min(p + 10, 250)); break
        case '-': case '_': setZoomLevel(p => Math.max(p - 10, 50)); break
        case 'Escape': exitPresent(); break
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  })

  // ═══════════════════════════════════════════════
  // AUDIO HELPERS
  // ═══════════════════════════════════════════════

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
    setPlayingPart(null)
    setIsAudioLoading(false)
    setAudioProgress(0)
  }, [])

  const getQuestionText = (q: SlideQuestion) => {
    let text = q.bodySegments.map(s => s.content).join('')
    if (q.questionType === 'multiple_choice' && q.choices) {
      text += '\n' + q.choices.map(c => c.label + '. ' + (c.segments ? c.segments.map(s => s.content).join('') : c.content)).join('\n')
    }
    if (q.questionType === 'true_false' && q.tfStatements) {
      text += '\n' + q.tfStatements.map(s => s.label + ') ' + (s.segments ? s.segments.map(s => s.content).join('') : s.content)).join('\n')
    }
    if (q.questionType === 'short_answer' && q.shortAnswer) {
      text += '\nĐáp số: ' + q.shortAnswer
    }
    return text
  }

  const getSolutionText = (q: SlideQuestion) => {
    if (!q.solutionSegments) return ''
    return q.solutionSegments.map(s => s.content).join('')
  }

  // Generate SHA-256 hash for content_hash
  const hashText = async (text: string) => {
    const encoder = new TextEncoder()
    const data = encoder.encode(text)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  }

  const setupAudioEvents = (audio: HTMLAudioElement) => {
    audio.ontimeupdate = () => setAudioProgress(audio.currentTime)
    audio.onloadedmetadata = () => setAudioDuration(audio.duration)
    audio.onended = () => {
      setPlayingPart(null)
      setAudioProgress(0)
    }
  }

  const playAudio = async (q: SlideQuestion, part: 'question' | 'solution' | 'both') => {
    if (playingPart === part) {
      stopAudio()
      return
    }
    stopAudio()
    
    const text = part === 'question' ? getQuestionText(q) : part === 'solution' ? getSolutionText(q) : getQuestionText(q) + '\n\n Lời giải: \n\n' + getSolutionText(q)
    if (!text.trim()) return

    setPlayingPart(part)
    setIsAudioLoading(true)

    try {
      const contentHash = await hashText(text)
      const supabase = createClient()
      
      // 1. Check DB cache
      const { data: cached, error: cacheErr } = await supabase
        .from('question_audio')
        .select('audio_url')
        .eq('content_hash', contentHash)
        .eq('voice', 'Kore')
        .maybeSingle()

      if (cached?.audio_url) {
        // Play from cache using proxy to avoid mixed content
        const audio = new Audio(`/api/proxy-audio?url=${encodeURIComponent(cached.audio_url)}`)
        audio.playbackRate = playbackRate
        setupAudioEvents(audio)
        audioRef.current = audio
        await audio.play()
        setIsAudioLoading(false)
        return
      }

      // 2. Call our local proxy API instead of VPS directly to avoid mixed content (HTTPS to HTTP)
      const res = await fetch(`/api/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice: 'Kore' })
      })

      if (!res.ok) throw new Error('TTS API failed')
      const data = await res.json()

      const vpsUrl = process.env.NEXT_PUBLIC_VPS_URL || process.env.NEXT_PUBLIC_TIKZ_API_URL || 'http://42.96.15.5:3001'
      const finalAudioUrl = `${vpsUrl}${data.audio_url}`

      // Insert to Supabase for future use
      const { error: insertError } = await supabase.from('question_audio').insert({
        content_hash: contentHash,
        voice: 'Kore',
        audio_url: finalAudioUrl
      })
      if (insertError) {
        console.warn('Could not cache audio URL:', insertError.message)
      }

      // Play new audio via proxy
      const audio = new Audio(`/api/proxy-audio?url=${encodeURIComponent(finalAudioUrl)}`)
      audio.playbackRate = playbackRate
      setupAudioEvents(audio)
      audioRef.current = audio
      await audio.play()

    } catch (err) {
      console.error('Audio play error:', err)
      setPlayingPart(null)
      alert('Lỗi tạo audio: ' + (err as Error).message)
    } finally {
      setIsAudioLoading(false)
    }
  }

  const prefetchAudio = async (q: SlideQuestion, part: 'question' | 'solution' | 'both') => {
    try {
      const text = part === 'question' ? getQuestionText(q) : part === 'solution' ? getSolutionText(q) : getQuestionText(q) + '\n\n Lời giải: \n\n' + getSolutionText(q)
      if (!text.trim()) return

      const contentHash = await hashText(text)
      const supabase = createClient()
      
      const { data: cached } = await supabase
        .from('question_audio')
        .select('audio_url')
        .eq('content_hash', contentHash)
        .eq('voice', 'Kore')
        .maybeSingle()

      if (cached?.audio_url) return

      const res = await fetch(`/api/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice: 'Kore' })
      })

      if (!res.ok) return
      const data = await res.json()
      const vpsUrl = process.env.NEXT_PUBLIC_VPS_URL || process.env.NEXT_PUBLIC_TIKZ_API_URL || 'http://42.96.15.5:3001'
      const finalAudioUrl = `${vpsUrl}${data.audio_url}`

      await supabase.from('question_audio').insert({
        content_hash: contentHash,
        voice: 'Kore',
        audio_url: finalAudioUrl
      })
    } catch (e) {
      console.warn('Prefetch failed:', e)
    }
  }

  // Handle slide change to pause audio and trigger auto-play
  useEffect(() => {
    if (phase !== 'present') return
    stopAudio()
    const q = questions[currentSlide]
    if (q && autoPlay) {
      // Add slight delay so it doesn't immediately play before render
      const timer = setTimeout(() => {
        playAudio(q, 'both')
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [currentSlide, phase, autoPlay])

  // Prefetch audio for the first question when entering review phase
  useEffect(() => {
    if (phase === 'review' && questions.length > 0) {
      prefetchAudio(questions[0], 'both')
    }
  }, [phase, questions])

  // Prefetch audio for the NEXT question automatically whenever we are on a slide
  useEffect(() => {
    if (phase === 'present' && currentSlide + 1 < questions.length) {
      prefetchAudio(questions[currentSlide + 1], 'both')
    }
  }, [currentSlide, phase, questions])

  // ═══════════════════════════════════════════════
  // HANDLERS
  // ═══════════════════════════════════════════════

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = Number(e.target.value)
    if (audioRef.current) {
      audioRef.current.currentTime = time
      setAudioProgress(time)
    }
  }

  const handleParse = async () => {
    if (!editorContent.trim()) return
    const blocks = extractRawExBlocks(editorContent)
    const parsed = parseAllSlideQuestions(editorContent)
    setRawBlocks(blocks)
    setQuestions(parsed)

    // Collect all TikZ image segments for batch compilation
    const tikzJobs: { key: string; code: string }[] = []
    for (const q of parsed) {
      const collectFromSegments = (segs: ContentSegment[], part: string) => {
        segs.forEach((seg, idx) => {
          if (seg.type === 'image') {
            tikzJobs.push({ key: `${q.id}:${part}:${idx}`, code: seg.content })
          }
        })
      }
      collectFromSegments(q.bodySegments, 'body')
      if (q.choices) q.choices.forEach(c => {
        if (c.segments) collectFromSegments(c.segments, `choice-${c.label}`)
      })
      if (q.tfStatements) q.tfStatements.forEach(s => {
        if (s.segments) collectFromSegments(s.segments, `tf-${s.label}`)
      })
      if (q.solutionSegments) collectFromSegments(q.solutionSegments, 'sol')
    }

    if (tikzJobs.length === 0) {
      setPhase('review')
      saveToStorage()
      return
    }

    // Batch compile with concurrency limit
    setIsCompiling(true)
    setCompileProgress({ done: 0, total: tikzJobs.length })
    setPhase('review')

    const newImageMap: Record<string, string> = {}
    const CONCURRENCY = 2 // Giảm xuống 2 để tránh quá tải VPS
    let doneCount = 0

    const runJob = async (job: { key: string; code: string }) => {
      try {
        const svg = await compileTikz(job.code)
        newImageMap[job.key] = svg
      } catch (err) {
        console.warn(`TikZ compile failed for ${job.key}:`, err)
      }
      doneCount++
      setCompileProgress({ done: doneCount, total: tikzJobs.length })
    }

    // Process in batches of CONCURRENCY
    for (let i = 0; i < tikzJobs.length; i += CONCURRENCY) {
      const batch = tikzJobs.slice(i, i + CONCURRENCY)
      await Promise.all(batch.map(runJob))
      // Update imageMap progressively so images appear as they compile
      setImageMap(prev => ({ ...prev, ...newImageMap }))
    }

    setImageMap(prev => ({ ...prev, ...newImageMap }))
    setIsCompiling(false)
    saveToStorage()
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
    setRawBlocks(prev => prev.filter((_, i) => i !== idx))
  }

  const handleEditRawBlock = (idx: number, newCode: string) => {
    // Cập nhật rawBlocks
    setRawBlocks(prev => { const next = [...prev]; next[idx] = newCode; return next })
    // Re-parse câu hỏi đơn lẻ
    try {
      const reparsed = parseSlideQuestion(newCode)
      setQuestions(prev => {
        const next = [...prev]
        next[idx] = { ...reparsed, id: prev[idx].id } // Giữ nguyên id để không bị re-mount
        return next
      })
      // Re-compile TikZ nếu có hình mới
      if (reparsed.hasTikz) {
        const tikzJobs: { key: string; code: string }[] = []
        const qId = questions[idx]?.id || reparsed.id
        const collectSegs = (segs: ContentSegment[], part: string) => {
          segs.forEach((seg, i) => {
            if (seg.type === 'image') tikzJobs.push({ key: `${qId}:${part}:${i}`, code: seg.content })
          })
        }
        collectSegs(reparsed.bodySegments, 'body')
        if (reparsed.choices) reparsed.choices.forEach(c => {
          if (c.segments) collectSegs(c.segments, `choice-${c.label}`)
        })
        if (reparsed.tfStatements) reparsed.tfStatements.forEach(s => {
          if (s.segments) collectSegs(s.segments, `tf-${s.label}`)
        })
        if (reparsed.solutionSegments) reparsed.solutionSegments.forEach(s => {
             if (s.type === 'image') tikzJobs.push({ key: `${qId}:sol:${s.content}`, code: s.content })
        })
        // Compile từng hình (không block UI)
        for (const job of tikzJobs) {
          if (!imageMap[job.key]) {
            compileTikz(job.code).then(svg => {
              setImageMap(prev => ({ ...prev, [job.key]: svg }))
            }).catch(() => {})
          }
        }
      }
    } catch { /* parse lỗi thì giữ nguyên, chờ user sửa tiếp */ }
  }

  const toggleSolution = (id: string) => {
    setExpandedSolutions(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  // ─── Image Upload (fallback for failed TikZ) ───
  const openImageUpload = (key: string) => { setUploadKey(key); setTempImage(imageMap[key] || null) }
  const handleImagePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) { const file = item.getAsFile(); if (file) readImageFile(file); break }
    }
  }
  const handleImageFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (file) readImageFile(file) }
  const readImageFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = (ev) => setTempImage(ev.target?.result as string)
    reader.readAsDataURL(file)
  }
  const confirmImageUpload = () => {
    if (uploadKey && tempImage) setImageMap(prev => ({ ...prev, [uploadKey]: tempImage }))
    setUploadKey(null); setTempImage(null)
  }

  // ─── Present Nav ───
  const goNext = useCallback(() => {
    if (currentSlide < questions.length - 1) {
      setSlideDirection('next'); setCurrentSlide(p => p + 1); setSlideKey(p => p + 1)
      setShowAnswer(false); setShowSolution(false)
    }
  }, [currentSlide, questions.length])

  const goPrev = useCallback(() => {
    if (currentSlide > 0) {
      setSlideDirection('prev'); setCurrentSlide(p => p - 1); setSlideKey(p => p + 1)
      setShowAnswer(false); setShowSolution(false)
    }
  }, [currentSlide])

  const startPresent = () => {
    if (questions.length === 0) return
    setCurrentSlide(0); setShowAnswer(false); setShowSolution(false)
    setSlideKey(0); setSlideDirection('next'); setPhase('present')
    try { document.documentElement.requestFullscreen?.() } catch { /* ok */ }
  }

  const exitPresent = () => { 
    setPhase('review'); 
    try { 
      if (document.fullscreenElement) document.exitFullscreen?.() 
    } catch { /* ok */ } 
  }

  // ═══════════════════════════════════════════════
  // RENDER: BƯỚC 1 — NHẬP CODE
  // ═══════════════════════════════════════════════

  const renderInput = () => (
    <>
      <Header title="🖥️ Trình chiếu câu hỏi" />
      <div className={styles.inputPhase}>
        <div className={styles.inputCard}>
          <div className={styles.inputHeader}>
            <h2 className={styles.inputTitle}>📝 Nhập dữ liệu Trình chiếu</h2>
            
            <div className={styles.instructionBox}>
              <h3 className={styles.instructionTitle}>
                💡 Hướng dẫn cách đưa câu hỏi vào Trình chiếu:
              </h3>
              <ul className={styles.instructionList}>
                <li>
                  <strong>Cách 1 (Tự động):</strong> Bấm nút <strong>"🖥️ Trình chiếu"</strong> trực tiếp từ các trang <strong>Tạo đề thi</strong>, <strong>Trộn đề</strong>, hoặc <strong>AI tạo đề</strong> để hệ thống tự động chuyển toàn bộ câu hỏi sang đây.
                </li>
                <li>
                  <strong>Cách 2 (Thủ công):</strong> Copy code LaTeX của câu hỏi và dán trực tiếp vào ô bên dưới.
                </li>
                <li>
                  <strong>Cách 3 (Từ file):</strong> Bấm nút <strong>"📁 Import file .tex"</strong> ở bên dưới để tải lên file chứa code câu hỏi.
                </li>
              </ul>
            </div>
          </div>

          <textarea
            className={styles.inputTextarea}
            value={editorContent}
            onChange={e => setEditorContent(e.target.value)}
            placeholder={`Paste code LaTeX câu hỏi vào đây...\n\n\\begin{ex}\n\tCâu hỏi...\n\t\\choice\n\t{A}{\\True B}{C}{D}\n\t\\loigiai{...}\n\\end{ex}`}
            spellCheck={false}
          />

          <div className={styles.inputActions}>
            <button className={styles.importFileBtn} onClick={() => fileInputRef.current?.click()}>
              📁 Import file .tex
            </button>
            <input ref={fileInputRef} type="file" accept=".tex,.txt" style={{ display: 'none' }} onChange={handleImportFile} />

            <button className={styles.parseMainBtn} onClick={handleParse} disabled={!editorContent.trim()}>
              ⚡ Parse câu hỏi
            </button>
          </div>
        </div>
      </div>
    </>
  )

  // ═══════════════════════════════════════════════
  // RENDER: BƯỚC 2 — XEM & CẤU HÌNH
  // ═══════════════════════════════════════════════

  const renderReview = () => (
    <>
      <Header title="🖥️ Trình chiếu câu hỏi" />
      {/* ─── Review toolbar ─── */}
      <div className={styles.reviewToolbar}>
        <button className={styles.backBtn} onClick={() => setPhase('input')}>← Quay lại</button>
        <span className={styles.reviewCount}>📋 {questions.length} câu hỏi</span>
        <div className={styles.reviewRight}>
          <div className={styles.themeSelector}>
            {(['minimal', 'blue', 'light'] as Theme[]).map(t => (
              <button key={t}
                className={`${styles.themeBtn} ${styles[('theme' + t.charAt(0).toUpperCase() + t.slice(1)) as keyof typeof styles]} ${theme === t ? styles.active : ''}`}
                onClick={() => setTheme(t)}
                title={{minimal: 'Minimal (Khuyến nghị)', blue: 'Xanh đen', light: 'Trắng'}[t]} />
            ))}
          </div>
          <button className={styles.startBtn} onClick={startPresent} disabled={questions.length === 0 || isCompiling}>
            🚀 Bắt đầu trình chiếu
          </button>
        </div>
      </div>

      {/* ─── Compile Progress Overlay ─── */}
      {isCompiling && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
          background: 'linear-gradient(135deg, #1e293b, #334155)',
          padding: '12px 24px', display: 'flex', alignItems: 'center', gap: 16,
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)', color: 'white',
        }}>
          <div style={{ width: 24, height: 24, border: '3px solid rgba(255,255,255,0.2)', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          <span style={{ fontWeight: 600, fontSize: 14 }}>
            ⏳ Đang load câu hỏi... ({compileProgress.total > 0 ? Math.round((compileProgress.done / compileProgress.total) * 100) : 0}%)
          </span>
          <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.1)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${compileProgress.total > 0 ? (compileProgress.done / compileProgress.total) * 100 : 0}%`, background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)', borderRadius: 3, transition: 'width 0.3s ease' }} />
          </div>
        </div>
      )}

      {/* ─── Question pairs: raw (left) + preview (right) ─── */}
      <div className={styles.reviewList}>
        {questions.map((q, idx) => (
          <div key={q.id} className={styles.reviewRow}>
            {/* Left: Raw LaTeX */}
            <div className={styles.rawColumn}>
              <div className={styles.rawHeader}>
                <span className={styles.rawNum}>Câu {idx + 1}</span>
                <button className={styles.rawDelete} onClick={() => handleDeleteQuestion(idx)} title="Xóa câu">✕</button>
              </div>
              <textarea
                className={styles.rawCode}
                value={rawBlocks[idx] ?? q.rawLatex}
                onChange={e => handleEditRawBlock(idx, e.target.value)}
                spellCheck={false}
              />
            </div>

            {/* Right: Preview */}
            <div className={styles.previewColumn}>
              <div className={styles.previewHeader}>
                <span className={`${styles.typeBadge} ${styles[TYPE_CSS[q.questionType]]}`}>
                  {TYPE_ICONS[q.questionType]} {TYPE_LABELS[q.questionType]}
                </span>
                {q.hasTikz && <span className={styles.tikzBadge}>🖼️ TikZ</span>}
              </div>

              {/* Body */}
              <div className={styles.previewBody}>
                <RenderedSegments segments={q.bodySegments} questionId={q.id} part="body"
                  imageMap={imageMap} onUploadClick={openImageUpload} isCompiling={isCompiling} />
              </div>

              {/* MC Choices */}
              {q.questionType === 'multiple_choice' && q.choices && (
                <div className={styles.previewChoices}>
                  {q.choices.map(c => (
                    <div key={c.label} className={`${styles.previewChoice} ${c.isCorrect ? styles.previewCorrect : ''}`}>
                      <strong>{c.label}.</strong>
                      <div className={styles.previewChoiceText}>
                        <RenderedSegments segments={c.segments || [{type: 'text', content: c.content}]} questionId={q.id} part={`choice-${c.label}`} imageMap={imageMap} onUploadClick={openImageUpload} isCompiling={isCompiling} />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* TF */}
              {q.questionType === 'true_false' && q.tfStatements && (
                <div className={styles.previewChoices}>
                  {q.tfStatements.map(s => (
                    <div key={s.label} className={`${styles.previewChoice} ${s.isTrue ? styles.previewCorrect : ''}`}>
                      <strong>{s.label})</strong>
                      <div className={styles.previewChoiceText}>
                        <RenderedSegments segments={s.segments || [{type: 'text', content: s.content}]} questionId={q.id} part={`tf-${s.label}`} imageMap={imageMap} onUploadClick={openImageUpload} isCompiling={isCompiling} />
                      </div>
                      <span className={styles.previewTFMark}>{s.isTrue ? 'Đ' : 'S'}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Short Answer */}
              {q.questionType === 'short_answer' && q.shortAnswer && (
                <div className={styles.previewShortAns}>
                  Đáp số: <RenderedLatex content={`$${q.shortAnswer}$`} className={styles.previewShortAnsValue} />
                </div>
              )}

              {/* Solution */}
              {q.solutionSegments && q.solutionSegments.length > 0 && (
                <div className={styles.previewSolutionWrap}>
                  <button className={styles.previewSolutionToggle} onClick={() => toggleSolution(q.id)}>
                    {expandedSolutions.has(q.id) ? '▾' : '▸'} Lời giải
                  </button>
                  {expandedSolutions.has(q.id) && (
                    <div className={styles.previewSolutionBody}>
                      <RenderedSegments segments={q.solutionSegments} questionId={q.id} part="sol"
                        imageMap={imageMap} onUploadClick={openImageUpload} isCompiling={isCompiling} />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ─── Fixed bottom action bar ─── */}
      <div className={styles.reviewBottomBar}>
        <button className={styles.backBtn} onClick={() => setPhase('input')}>← Quay lại nhập code</button>
        <span className={styles.reviewCount}>📋 {questions.length} câu hỏi</span>
        <div className={styles.reviewRight}>
          <span style={{ fontSize: '0.8rem', color: '#666' }}>Theme:</span>
          <div className={styles.themeSelector}>
            {(['minimal', 'blue', 'light'] as Theme[]).map(t => (
              <button key={t}
                className={`${styles.themeBtn} ${styles[('theme' + t.charAt(0).toUpperCase() + t.slice(1)) as keyof typeof styles]} ${theme === t ? styles.active : ''}`}
                onClick={() => setTheme(t)}
                title={{minimal: 'Minimal (Khuyến nghị)', blue: 'Xanh đen', light: 'Trắng'}[t]} />
            ))}
          </div>
          <button className={styles.startBtn} onClick={startPresent} disabled={questions.length === 0 || isCompiling}>
            🚀 Bắt đầu trình chiếu
          </button>
        </div>
      </div>

      {/* ─── Image Upload Modal (fallback) ─── */}
      {uploadKey !== null && (
        <div className={styles.imageUploadOverlay} onClick={() => { setUploadKey(null); setTempImage(null) }}>
          <div className={styles.imageUploadModal} onClick={e => e.stopPropagation()} onPaste={handleImagePaste}>
            <h3>🖼️ Upload hình ảnh (thay thế TikZ lỗi)</h3>
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
  // RENDER: TRÌNH CHIẾU
  // ═══════════════════════════════════════════════

  const renderPresent = () => {
    const q = questions[currentSlide]
    if (!q) return null
    const themeClass = styles[('theme' + theme.charAt(0).toUpperCase() + theme.slice(1)) as keyof typeof styles]
    const animClass = slideDirection === 'next' ? styles.slideAnimateRight : styles.slideAnimateLeft
    const progress = ((currentSlide + 1) / questions.length) * 100

    const overlay = (
      <div className={`${styles.presentOverlay} ${themeClass}`}>
        <div className={styles.topBar}>
          <div className={styles.topLeft} style={{ position: 'relative' }}>
            <button 
              className={styles.slideCounter} 
              style={{ cursor: 'pointer', border: 'none', outline: 'none' }}
              onClick={() => setShowQuestionList(!showQuestionList)}
              title="Mở danh sách câu hỏi"
            >
              Câu {currentSlide + 1}/{questions.length} ▾
            </button>
            <span className={`${styles.slideTypeBadge} ${styles[TYPE_CSS[q.questionType]]}`}>
              {TYPE_ICONS[q.questionType]} {TYPE_LABELS[q.questionType]}
            </span>
            {showQuestionList && (
              <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: '0.5rem', background: '#fff', color: '#000', border: '1px solid #ccc', borderRadius: '4px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', zIndex: 100, maxHeight: '300px', overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '4px', padding: '8px', minWidth: '200px' }}>
                {questions.map((qItem, idx) => (
                  <button 
                    key={qItem.id} 
                    onClick={() => { 
                      setSlideDirection(idx > currentSlide ? 'next' : 'prev');
                      setCurrentSlide(idx); 
                      setShowQuestionList(false); 
                      setSlideKey(p => p + 1); 
                      setShowAnswer(false); 
                      setShowSolution(false); 
                      stopAudio(); 
                    }} 
                    style={{ padding: '6px', border: '1px solid #eee', borderRadius: '4px', background: currentSlide === idx ? '#3b82f6' : '#f9fafb', color: currentSlide === idx ? '#fff' : '#111827', cursor: 'pointer', fontSize: '13px', fontWeight: currentSlide === idx ? 'bold' : 'normal' }}
                  >
                    Câu {idx + 1}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className={styles.topRight} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button 
              className={`${styles.audioBtn} ${playingPart === 'both' ? styles.audioActive : ''}`} 
              onClick={() => playAudio(q, 'both')}
              disabled={isAudioLoading && playingPart !== 'both'}
              title="Đọc đề + lời giải"
              style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
              {isAudioLoading && playingPart === 'both' ? '⏳' : (playingPart === 'both' ? '⏸' : '🔊')} Đọc đề + LG
            </button>
            {audioDuration > 0 && playingPart === 'both' && (
              <input
                type="range"
                min={0}
                max={audioDuration || 1}
                step={0.1}
                value={audioProgress}
                onChange={handleSeek}
                style={{ width: '80px', cursor: 'pointer', accentColor: '#10b981' }}
                title="Tua âm thanh"
              />
            )}
            <select 
              value={playbackRate} 
              onChange={e => setPlaybackRate(Number(e.target.value))}
              className={styles.autoPlayToggle}
              style={{ background: 'transparent', border: '1px solid currentColor', borderRadius: '4px', padding: '2px 4px', fontSize: '13px', marginLeft: '0.5rem' }}
              title="Tốc độ đọc">
              <option value={0.75} style={{color: '#000'}}>0.75x</option>
              <option value={1} style={{color: '#000'}}>1x</option>
              <option value={1.25} style={{color: '#000'}}>1.25x</option>
              <option value={1.5} style={{color: '#000'}}>1.5x</option>
              <option value={2} style={{color: '#000'}}>2x</option>
            </select>
            <label className={styles.autoPlayToggle} style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontSize: '13px', marginLeft: '0.5rem', marginRight: '0.5rem' }}>
              <input type="checkbox" checked={autoPlay} onChange={e => setAutoPlay(e.target.checked)} /> Auto-play
            </label>
            <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.3)' }} />
            <button className={styles.exitBtn} onClick={() => setZoomLevel(p => Math.max(p - 10, 50))} title="Thu nhỏ (-)">A-</button>
            <button className={styles.exitBtn} onClick={() => setZoomLevel(p => Math.min(p + 10, 250))} title="Phóng to (+)">A+</button>
            <button className={styles.exitBtn} onClick={exitPresent} style={{ marginLeft: '0.5rem' }}>✕ Thoát</button>
          </div>
        </div>

        <div className={styles.progressBar}>
          <div className={styles.progressFill} style={{ width: `${progress}%` }} />
        </div>

        <div className={`${styles.slideContent} ${animClass}`} key={slideKey} style={{ fontSize: `${zoomLevel}%` }}>
          <div className={styles.slideInner}>
            <div className={styles.questionBodyArea}>
              <RenderedSegments segments={q.bodySegments} questionId={q.id} part="body" imageMap={imageMap} />
            </div>

            {q.questionType === 'multiple_choice' && q.choices && (
              <div className={styles.choicesGrid}>
                {q.choices.map(c => (
                  <div key={c.label} className={`${styles.choiceCard} ${showAnswer ? (c.isCorrect ? styles.correct : styles.incorrect) : ''}`}>
                    <div className={styles.choiceLabel}>{c.label}</div>
                    <div className={styles.choiceText}>
                      <RenderedSegments segments={c.segments || [{type: 'text', content: c.content}]} questionId={q.id} part={`choice-${c.label}`} imageMap={imageMap} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {q.questionType === 'true_false' && q.tfStatements && (
              <div className={styles.tfList}>
                {q.tfStatements.map(s => (
                  <div key={s.label} className={styles.tfItem}>
                    <div className={styles.tfLabel}>{s.label})</div>
                    <div className={styles.tfContent}>
                      <RenderedSegments segments={s.segments || [{type: 'text', content: s.content}]} questionId={q.id} part={`tf-${s.label}`} imageMap={imageMap} />
                    </div>
                    {showAnswer && <span className={`${styles.tfAnswer} ${s.isTrue ? styles.tfTrue : styles.tfFalse}`}>{s.isTrue ? 'Đ' : 'S'}</span>}
                  </div>
                ))}
              </div>
            )}

            {q.questionType === 'short_answer' && (
              <div className={styles.shortAnswerBox}>
                <span className={styles.saLabel}>Đáp số:</span>
                {showAnswer && q.shortAnswer
                  ? <RenderedLatex content={`$${q.shortAnswer}$`} className={styles.saAnswer} />
                  : <div className={styles.saPlaceholder} />}
              </div>
            )}

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

    if (typeof document !== 'undefined') {
      return createPortal(overlay, document.body)
    }
    return overlay
  }

  // ═══════════════════════════════════════════════
  if (phase === 'present') return renderPresent()
  if (phase === 'review') return renderReview()
  return renderInput()
}
