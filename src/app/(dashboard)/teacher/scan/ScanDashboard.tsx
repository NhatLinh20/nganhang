// src/app/(dashboard)/teacher/scan/ScanDashboard.tsx
'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

// ═══════════════════════════════════
// TYPES
// ═══════════════════════════════════

interface ScanExam {
  id: string
  name: string
  mc_count: number
  tf_count: number
  sa_count: number
  answer_keys: Record<string, AnswerKey>
  mc_total_score: number
  tf_total_score: number
  sa_total_score: number
  status: string
  scan_count: number
  created_at: string
}

interface AnswerKey {
  mc: string[]
  tf: string[]
  sa: string[]
}

interface ScanResult {
  id: string
  exam_code: string | null
  student_id_number: string | null
  score: number
  max_score: number
  mc_correct: number
  mc_total: number
  tf_score: number
  tf_max_score: number
  sa_correct: number
  sa_total: number
  details: unknown
  answers: { mc: (string | null)[]; tf: (string | null)[]; sa: (string | null)[] }
  confidence: number
  warnings: string[]
  created_at: string
}

type View = 'list' | 'create' | 'edit' | 'detail' | 'scan' | 'result'

const TF_MAP: Record<number, number> = { 4: 1, 3: 0.5, 2: 0.25, 1: 0.1, 0: 0 }
const r2 = (n: number) => Math.round(n * 100) / 100
const normSA = (s: string) => s.trim().replace(/\s+/g, '').replace(/,/g, '.').replace(/^(-?)0+(\d)/, '$1$2')

// ═══════════════════════════════════
// SWIPEABLE CARD COMPONENT
// ═══════════════════════════════════

function SwipeableExamCard({ exam, onClick, onDelete }: { exam: ScanExam, onClick: () => void, onDelete: () => void }) {
  const [offset, setOffset] = useState(0)
  const startX = useRef<number | null>(null)
  const isDragging = useRef(false)
  
  const onStart = (x: number) => {
    startX.current = x
    isDragging.current = false
  }
  const onMove = (x: number) => {
    if (startX.current === null) return
    const diff = x - startX.current
    if (Math.abs(diff) > 5) isDragging.current = true
    if (diff < 0) {
      setOffset(Math.max(-80, diff))
    } else {
      setOffset(Math.min(0, offset + diff))
    }
  }
  const onEnd = () => {
    if (startX.current === null) return
    if (offset < -40) {
      setOffset(-80)
    } else {
      setOffset(0)
    }
    startX.current = null
    setTimeout(() => { isDragging.current = false }, 50)
  }

  return (
    <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
      {/* Background delete button */}
      <div style={{
        position: 'absolute', top: 0, bottom: 0, right: 0, width: 80,
        background: '#ef4444', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', fontWeight: 600, fontSize: 14
      }} onClick={(e) => { e.stopPropagation(); onDelete(); }}>
        Xóa
      </div>
      
      {/* Foreground card */}
      <div 
        onTouchStart={e => onStart(e.touches[0].clientX)}
        onTouchMove={e => onMove(e.touches[0].clientX)}
        onTouchEnd={onEnd}
        onMouseDown={e => onStart(e.clientX)}
        onMouseMove={e => onMove(e.clientX)}
        onMouseUp={onEnd}
        onMouseLeave={onEnd}
        onClick={() => { if (!isDragging.current && offset === 0) onClick(); else if (offset === -80 && !isDragging.current) setOffset(0); }}
        style={{
          padding: '16px 20px', background: 'white', 
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          transform: `translateX(${offset}px)`, transition: startX.current !== null ? 'none' : 'transform 0.2s',
          position: 'relative', zIndex: 1, cursor: 'pointer',
          userSelect: 'none'
        }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{exam.name}</div>
          <div style={{ fontSize: 13, color: '#64748b', marginTop: 4, display: 'flex', gap: 12 }}>
            <span>📘 {exam.mc_count} TN</span>
            <span>📗 {exam.tf_count} ĐS</span>
            <span>📙 {exam.sa_count} SA</span>
            <span>🔑 {Object.keys(exam.answer_keys || {}).length} mã đề</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, color: '#94a3b8' }}>{exam.scan_count} phiếu đã quét</span>
          <span style={{ fontSize: 18 }}>→</span>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════

export default function ScanDashboard({ userId }: { userRole: string; userId: string }) {
  const [view, setView] = useState<View>('list')
  const [exams, setExams] = useState<ScanExam[]>([])
  const [selectedExam, setSelectedExam] = useState<ScanExam | null>(null)
  const [scanResults, setScanResults] = useState<ScanResult[]>([])
  const [batchProgress, setBatchProgress] = useState<{ total: number, current: number, success: number, error: number, isRunning: boolean } | null>(null)
  const [loading, setLoading] = useState(true)

  // Create form
  const [formName, setFormName] = useState('')
  const [formMcCount, setFormMcCount] = useState(12)
  const [formTfCount, setFormTfCount] = useState(4)
  const [formSaCount, setFormSaCount] = useState(6)
  const [formMcScore, setFormMcScore] = useState(3)
  const [formTfScore, setFormTfScore] = useState(4)
  const [formSaScore, setFormSaScore] = useState(3)
  const [formAnswerKeys, setFormAnswerKeys] = useState<Record<string, AnswerKey>>({})
  const [formStep, setFormStep] = useState<1 | 2>(1)
  const [formSaving, setFormSaving] = useState(false)
  const [answerTab, setAnswerTab] = useState<'manual' | 'excel' | 'qr'>('manual')
  const [currentCode, setCurrentCode] = useState('001')

  // Scan state
  const [isProcessing, setIsProcessing] = useState(false)
  const [scanRaw, setScanRaw] = useState<Record<string, unknown> | null>(null)
  const [overrideMc, setOverrideMc] = useState<(string | null)[]>([])
  const [overrideTf, setOverrideTf] = useState<(string | null)[]>([])
  const [overrideSa, setOverrideSa] = useState<(string | null)[]>([])
  const [overrideExamCode, setOverrideExamCode] = useState('')
  const [overrideStudentId, setOverrideStudentId] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [showDebug, setShowDebug] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [cameraActive, setCameraActive] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const streamRef = useRef<MediaStream | null>(null)
  const [isFastScan, setIsFastScan] = useState(false)
  // DATA FETCHING
  // ═══════════════════════════════════

  const fetchExams = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/exam-sessions/scan')
      const data = await res.json()
      setExams(data.data || [])
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  useEffect(() => { fetchExams() }, [fetchExams])

  useEffect(() => {
    setIsMobile(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent))
  }, [])

  const fetchExamDetail = async (exam: ScanExam) => {
    setSelectedExam(exam)
    try {
      const res = await fetch(`/api/exam-sessions/scan/${exam.id}`)
      const data = await res.json()
      if (data.exam) setSelectedExam(data.exam)
      setScanResults(data.results || [])
    } catch { /* ignore */ }
    setView('detail')
  }

  // ═══════════════════════════════════
  // CREATE EXAM
  // ═══════════════════════════════════

  const resetCreateForm = () => {
    setFormName(''); setFormMcCount(12); setFormTfCount(4); setFormSaCount(6)
    setFormMcScore(3); setFormTfScore(4); setFormSaScore(3)
    setFormAnswerKeys({}); setFormStep(1); setCurrentCode('001'); setAnswerTab('manual')
  }

  const getCurrentKey = (): AnswerKey => formAnswerKeys[currentCode] || { mc: Array(formMcCount).fill(''), tf: Array(formTfCount).fill(''), sa: Array(formSaCount).fill('') }

  const updateCurrentKey = (key: AnswerKey) => {
    setFormAnswerKeys(prev => ({ ...prev, [currentCode]: key }))
  }

  const handleMcAnswer = (i: number, v: string) => {
    const u = v.toUpperCase()
    if (u && !['A', 'B', 'C', 'D'].includes(u)) return
    const key = getCurrentKey()
    const mc = [...key.mc]; mc[i] = u
    updateCurrentKey({ ...key, mc })
  }

  const handleTfAnswer = (i: number, v: string) => {
    const norm = v.toUpperCase().replace(/D/g, 'Đ').replace(/[^ĐS]/gi, '')
    if (norm.length > 4) return
    const key = getCurrentKey()
    const tf = [...key.tf]; tf[i] = norm.slice(0, 4)
    updateCurrentKey({ ...key, tf })
  }

  const handleSaAnswer = (i: number, v: string) => {
    const key = getCurrentKey()
    const sa = [...key.sa]; sa[i] = v
    updateCurrentKey({ ...key, sa })
  }

  const handleExcelImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const arrayBuffer = await file.arrayBuffer()
      const { read, utils } = await import('xlsx')
      const wb = read(arrayBuffer, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const lines = utils.sheet_to_json<any[]>(ws, { header: 1 })
      
      if (!lines || lines.length < 2) { alert('File không có dữ liệu'); return }
      
      const { parseExcelAnswers } = await import('@/lib/answer-import/excel-parser')
      const result = parseExcelAnswers(lines, formMcCount, formTfCount, formSaCount)
      if (!result.success) { alert(result.error || 'Lỗi parse'); return }

      const newKeys: Record<string, AnswerKey> = { ...formAnswerKeys }
      for (const k of result.keys) {
        newKeys[k.examCode] = { mc: k.mc, tf: k.tf, sa: k.sa }
      }
      setFormAnswerKeys(newKeys)
      if (result.keys.length > 0) setCurrentCode(result.keys[0].examCode)
      alert(`✅ Đã import ${result.keys.length} mã đề (${result.format})`)
    } catch (err) {
      alert('Lỗi đọc file: ' + String(err))
    }
  }

  const handleQrScan = async (data: string) => {
    try {
      const { parseQRData } = await import('@/lib/answer-import/qr-parser')
      const result = parseQRData(data, formMcCount, formTfCount, formSaCount)
      if (!result.success) { alert(result.error || 'Lỗi parse QR'); return }

      const newKeys: Record<string, AnswerKey> = { ...formAnswerKeys }
      for (const k of result.keys) {
        newKeys[k.examCode] = { mc: k.mc, tf: k.tf, sa: k.sa }
      }
      setFormAnswerKeys(newKeys)
      if (result.keys.length > 0) setCurrentCode(result.keys[0].examCode)
      alert(`✅ Đã import ${result.keys.length} mã đề từ QR (${result.format})`)
    } catch (err) {
      alert('Lỗi parse QR: ' + String(err))
    }
  }

  const handleQrImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    // Clear value to allow selecting same file again
    e.target.value = ''
    
    const img = new Image()
    img.src = URL.createObjectURL(file)
    img.onload = async () => {
      const canvas = document.createElement('canvas')
      const MAX_SIZE = 800
      let w = img.width
      let h = img.height
      if (w > h && w > MAX_SIZE) {
        h = Math.floor(h * (MAX_SIZE / w))
        w = MAX_SIZE
      } else if (h > MAX_SIZE) {
        w = Math.floor(w * (MAX_SIZE / h))
        h = MAX_SIZE
      }
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) return
      ctx.drawImage(img, 0, 0, w, h)
      const imageData = ctx.getImageData(0, 0, w, h)
      
      try {
        const jsQR = (await import('jsqr')).default
        const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'dontInvert' })
        if (code) {
          handleQrScan(code.data)
        } else {
          alert('Không tìm thấy mã QR nào trong ảnh! Hãy chụp gần và rõ nét hơn.')
        }
      } catch (err) {
        alert('Lỗi khi quét QR: ' + String(err))
      }
    }
  }

  const handleCreateExam = async () => {
    if (!formName.trim()) { alert('Nhập tên bài thi'); return }
    const codes = Object.keys(formAnswerKeys)
    if (codes.length === 0) { alert('Chưa nhập đáp án cho bất kỳ mã đề nào'); return }

    setFormSaving(true)
    try {
      const res = await fetch('/api/exam-sessions/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName.trim(),
          mc_count: formMcCount,
          tf_count: formTfCount,
          sa_count: formSaCount,
          answer_keys: formAnswerKeys,
          mc_total_score: formMcScore,
          tf_total_score: formTfScore,
          sa_total_score: formSaScore,
        }),
      })
      const data = await res.json()
      if (!res.ok) { alert(data.error || 'Lỗi'); return }
      
      await fetchExams()
      resetCreateForm()
      setView('list')
    } catch (err) {
      alert('Lỗi lưu: ' + String(err))
    } finally {
      setFormSaving(false)
    }
  }

  const handleUpdateExam = async () => {
    if (!selectedExam) return
    if (!formName.trim()) { alert('Nhập tên bài thi'); return }
    const codes = Object.keys(formAnswerKeys)
    if (codes.length === 0) { alert('Chưa nhập đáp án cho bất kỳ mã đề nào'); return }

    setFormSaving(true)
    try {
      const res = await fetch(`/api/exam-sessions/scan/${selectedExam.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName.trim(),
          mc_count: formMcCount,
          tf_count: formTfCount,
          sa_count: formSaCount,
          answer_keys: formAnswerKeys,
          mc_total_score: formMcScore,
          tf_total_score: formTfScore,
          sa_total_score: formSaScore,
        }),
      })
      const data = await res.json()
      if (!res.ok) { alert(data.error || 'Lỗi'); return }
      
      await fetchExams()
      resetCreateForm()
      // Reload selected exam details
      setSelectedExam(data.data)
      setView('detail')
      alert('✅ Đã cập nhật cấu hình bài thi!')
    } catch (err) {
      alert('Lỗi lưu: ' + String(err))
    } finally {
      setFormSaving(false)
    }
  }

  // ═══════════════════════════════════
  // CAMERA
  // ═══════════════════════════════════

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
      })
      streamRef.current = stream
      setCameraActive(true)
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.play().catch(console.error)
        }
      }, 100)
    } catch (err) {
      alert('Không thể mở camera: ' + String(err))
    }
  }

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    setCameraActive(false)
  }

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return
    const video = videoRef.current
    const canvas = canvasRef.current
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0)
    canvas.toBlob(blob => {
      if (blob) processImage(new File([blob], 'scan.jpg', { type: 'image/jpeg' }))
    }, 'image/jpeg', 0.92)
  }

  // ═══════════════════════════════════
  // SCAN PROCESSING
  // ═══════════════════════════════════

  const processImage = async (file: File) => {
    if (!selectedExam) return
    setIsProcessing(true)
    setSaveMsg(null)
    try {
      const form = new FormData()
      form.append('image', file)
      form.append('mcCount', String(selectedExam.mc_count))
      form.append('tfCount', String(selectedExam.tf_count))
      form.append('saCount', String(selectedExam.sa_count))

      const res = await fetch('/api/scan-omr', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Lỗi API')

      const eCode = data.examCode || ''

      if (isFastScan) {
        const keys = selectedExam.answer_keys
        const matchedKey = keys[eCode]
        
        if (!data.studentId) throw new Error('Không nhận diện được SBD! Vui lòng thử lại.')

        let mcCorrect = 0, tfScore = 0, saCorrect = 0
        const mcPerQ = selectedExam.mc_count > 0 ? r2(selectedExam.mc_total_score / selectedExam.mc_count) : 0
        const tfPerQ = selectedExam.tf_count > 0 ? r2(selectedExam.tf_total_score / selectedExam.tf_count) : 0
        const saPerQ = selectedExam.sa_count > 0 ? r2(selectedExam.sa_total_score / selectedExam.sa_count) : 0
        let mcTotal = selectedExam.mc_count
        let saTotal = selectedExam.sa_count

        if (matchedKey) {
          mcTotal = matchedKey.mc.length
          saTotal = matchedKey.sa.length
          for (let i = 0; i < matchedKey.mc.length; i++) {
            if (data.mc[i] && data.mc[i]?.toUpperCase() === matchedKey.mc[i]?.toUpperCase()) mcCorrect++
          }
          for (let i = 0; i < matchedKey.tf.length; i++) {
            const s = data.tf[i] || '', c = matchedKey.tf[i] || ''
            let correctSubs = 0
            if (s.length === 4 && c.length === 4) {
              for (let j = 0; j < 4; j++) if (s[j] === c[j]) correctSubs++
            }
            tfScore += (TF_MAP[correctSubs] ?? 0) * tfPerQ
          }
          for (let i = 0; i < matchedKey.sa.length; i++) {
            if (data.sa[i] && normSA(data.sa[i]) === normSA(matchedKey.sa[i])) saCorrect++
          }
        } else {
          if (!data.warnings) data.warnings = []
          data.warnings.push(`Mã đề [${eCode || 'trống'}] không có trong đáp án`)
        }

        const totalScore = matchedKey ? r2(mcCorrect * mcPerQ + tfScore + saCorrect * saPerQ) : 0
        const maxScore = r2(selectedExam.mc_total_score + selectedExam.tf_total_score + selectedExam.sa_total_score)

        const saveRes = await fetch('/api/scan-results', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId, examCode: eCode, studentId: data.studentId,
            score: totalScore, maxScore: maxScore,
            mcCorrect, mcTotal: mcTotal,
            tfScore: r2(tfScore), tfMaxScore: r2(selectedExam.tf_total_score),
            saCorrect, saTotal: saTotal,
            details: [], confidence: data.confidence, warnings: data.warnings,
            answers: { mc: data.mc, tf: data.tf, sa: data.sa },
            scanExamId: selectedExam.id,
          })
        })
        if (!saveRes.ok) throw new Error('Lỗi khi lưu kết quả')
        
        if (matchedKey) {
          setSaveMsg(`✅ SBD ${data.studentId}: ${totalScore}đ`)
        } else {
          setSaveMsg(`⚠️ SBD ${data.studentId}: Sai mã (0đ)`)
        }
        setTimeout(() => setSaveMsg(null), 2500)
        setIsProcessing(false)
        return
      }

      setScanRaw(data)
      setOverrideMc([...data.mc])
      setOverrideTf([...data.tf])
      setOverrideSa([...data.sa])
      setOverrideExamCode(eCode)
      setOverrideStudentId(data.studentId || '')
      setView('result')
    } catch (err) {
      alert('Lỗi quét: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setIsProcessing(false)
    }
  }

  // ═══════════════════════════════════
  // BATCH PROCESSING (PDF / MULTIPLE)
  // ═══════════════════════════════════

  const processBatch = async (fileList: FileList) => {
    if (!selectedExam) return
    setBatchProgress({ total: 0, current: 0, success: 0, error: 0, isRunning: true })
    
    let allBlobs: { blob: Blob, name: string }[] = []
    
    try {
      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i]
        if (file.type === 'application/pdf') {
          const { extractPdfPagesAsBlobs } = await import('@/lib/pdf-utils')
          const pdfBlobs = await extractPdfPagesAsBlobs(file)
          pdfBlobs.forEach((b, idx) => allBlobs.push({ blob: b, name: `${file.name} - Trang ${idx + 1}` }))
        } else {
          allBlobs.push({ blob: file, name: file.name })
        }
      }
      
      setBatchProgress(prev => prev ? { ...prev, total: allBlobs.length } : null)
      
      for (let i = 0; i < allBlobs.length; i++) {
        setBatchProgress(prev => prev ? { ...prev, current: i + 1 } : null)
        
        try {
          const form = new FormData()
          form.append('image', allBlobs[i].blob)
          form.append('mcCount', String(selectedExam.mc_count))
          form.append('tfCount', String(selectedExam.tf_count))
          form.append('saCount', String(selectedExam.sa_count))

          const res = await fetch('/api/scan-omr', { method: 'POST', body: form })
          const data = await res.json()
          if (!res.ok) throw new Error(data.error || 'Lỗi API')

          const eCode = data.examCode || ''
          const keys = selectedExam.answer_keys
          const matchedKey = keys[eCode]
          
          if (!data.studentId) throw new Error('Không nhận diện được SBD')

          let mcCorrect = 0, tfScore = 0, saCorrect = 0
          const mcPerQ = selectedExam.mc_count > 0 ? r2(selectedExam.mc_total_score / selectedExam.mc_count) : 0
          const tfPerQ = selectedExam.tf_count > 0 ? r2(selectedExam.tf_total_score / selectedExam.tf_count) : 0
          const saPerQ = selectedExam.sa_count > 0 ? r2(selectedExam.sa_total_score / selectedExam.sa_count) : 0
          let mcTotal = selectedExam.mc_count
          let saTotal = selectedExam.sa_count

          if (matchedKey) {
            mcTotal = matchedKey.mc.length
            saTotal = matchedKey.sa.length
            for (let j = 0; j < matchedKey.mc.length; j++) {
              if (data.mc[j] && data.mc[j]?.toUpperCase() === matchedKey.mc[j]?.toUpperCase()) mcCorrect++
            }
            for (let j = 0; j < matchedKey.tf.length; j++) {
              const s = data.tf[j] || '', c = matchedKey.tf[j] || ''
              let correctSubs = 0
              if (s.length === 4 && c.length === 4) {
                for (let k = 0; k < 4; k++) if (s[k] === c[k]) correctSubs++
              }
              tfScore += (TF_MAP[correctSubs] ?? 0) * tfPerQ
            }
            for (let j = 0; j < matchedKey.sa.length; j++) {
              if (data.sa[j] && normSA(data.sa[j]) === normSA(matchedKey.sa[j])) saCorrect++
            }
          } else {
            if (!data.warnings) data.warnings = []
            data.warnings.push(`Mã đề [${eCode || 'trống'}] không có trong đáp án`)
          }

          const totalScore = matchedKey ? r2(mcCorrect * mcPerQ + tfScore + saCorrect * saPerQ) : 0
          const maxScore = r2(selectedExam.mc_total_score + selectedExam.tf_total_score + selectedExam.sa_total_score)

          const saveRes = await fetch('/api/scan-results', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId, examCode: eCode, studentId: data.studentId,
              score: totalScore, maxScore: maxScore,
              mcCorrect, mcTotal: mcTotal,
              tfScore: r2(tfScore), tfMaxScore: r2(selectedExam.tf_total_score),
              saCorrect, saTotal: saTotal,
              details: [], confidence: data.confidence, warnings: data.warnings,
              answers: { mc: data.mc, tf: data.tf, sa: data.sa },
              scanExamId: selectedExam.id,
            })
          })
          if (!saveRes.ok) throw new Error('Lỗi khi lưu kết quả')
          
          setBatchProgress(prev => prev ? { ...prev, success: prev.success + 1 } : null)
        } catch (err) {
          console.error('Batch error on file', allBlobs[i].name, err)
          setBatchProgress(prev => prev ? { ...prev, error: prev.error + 1 } : null)
        }
      }
      
      await fetchExamDetail(selectedExam)
    } catch (err) {
      alert('Lỗi xử lý file PDF/Ảnh: ' + String(err))
    } finally {
      setBatchProgress(prev => prev ? { ...prev, isRunning: false } : null)
    }
  }

  // ═══════════════════════════════════
  // SCORING
  // ═══════════════════════════════════

  const getMatchedKey = (): AnswerKey | null => {
    if (!selectedExam) return null
    const keys = selectedExam.answer_keys
    if (overrideExamCode && keys[overrideExamCode]) return keys[overrideExamCode]
    return null // Strict match: no fallback
  }

  const calculateScore = () => {
    if (!selectedExam) return null
    const maxScore = r2(selectedExam.mc_total_score + selectedExam.tf_total_score + selectedExam.sa_total_score)
    const key = getMatchedKey()
    
    if (!key) {
      return {
        total: 0, maxScore,
        mcCorrect: 0, mcTotal: selectedExam.mc_count,
        tfScore: 0, tfMaxScore: selectedExam.tf_total_score,
        saCorrect: 0, saTotal: selectedExam.sa_count
      }
    }

    const mcPerQ = selectedExam.mc_count > 0 ? r2(selectedExam.mc_total_score / selectedExam.mc_count) : 0
    const tfPerQ = selectedExam.tf_count > 0 ? r2(selectedExam.tf_total_score / selectedExam.tf_count) : 0
    const saPerQ = selectedExam.sa_count > 0 ? r2(selectedExam.sa_total_score / selectedExam.sa_count) : 0

    let mcCorrect = 0, tfScore = 0, saCorrect = 0

    for (let i = 0; i < key.mc.length; i++) {
      if (overrideMc[i] && overrideMc[i]?.toUpperCase() === key.mc[i]?.toUpperCase()) mcCorrect++
    }

    for (let i = 0; i < key.tf.length; i++) {
      const s = overrideTf[i] || '', c = key.tf[i] || ''
      let correctSubs = 0
      if (s.length === 4 && c.length === 4) {
        for (let j = 0; j < 4; j++) if (s[j] === c[j]) correctSubs++
      }
      tfScore += (TF_MAP[correctSubs] ?? 0) * tfPerQ
    }

    for (let i = 0; i < key.sa.length; i++) {
      if (overrideSa[i] && normSA(overrideSa[i]!) === normSA(key.sa[i])) saCorrect++
    }

    const total = r2(mcCorrect * mcPerQ + tfScore + saCorrect * saPerQ)

    return { total, maxScore, mcCorrect, mcTotal: key.mc.length, tfScore: r2(tfScore), tfMaxScore: r2(selectedExam.tf_total_score), saCorrect, saTotal: key.sa.length }
  }

  const score = scanRaw ? calculateScore() : null

  const handleSaveResult = async () => {
    if (!score || !scanRaw || !selectedExam) return
    if (!getMatchedKey()) {
      if (!confirm('Mã đề không hợp lệ nên điểm sẽ là 0! Bạn có chắc chắn muốn lưu kết quả này không?')) {
        return
      }
    }
    setIsSaving(true); setSaveMsg(null)
    try {
      const res = await fetch('/api/scan-results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          examCode: overrideExamCode || null,
          studentId: overrideStudentId || null,
          score: score.total,
          maxScore: score.maxScore,
          mcCorrect: score.mcCorrect,
          mcTotal: score.mcTotal,
          tfScore: score.tfScore,
          tfMaxScore: score.tfMaxScore,
          saCorrect: score.saCorrect,
          saTotal: score.saTotal,
          details: [],
          confidence: (scanRaw as Record<string, unknown>).confidence,
          warnings: (scanRaw as Record<string, unknown>).warnings,
          answers: { mc: overrideMc, tf: overrideTf, sa: overrideSa },
          scanExamId: selectedExam.id,
        }),
      })
      if (res.ok) {
        setSaveMsg('✅ Đã lưu kết quả!')
      } else {
        const d = await res.json()
        setSaveMsg(`❌ ${d.error || 'Lỗi'}`)
      }
    } catch { setSaveMsg('❌ Lỗi kết nối') }
    finally { setIsSaving(false) }
  }

  // ═══════════════════════════════════
  // DELETE EXAM
  // ═══════════════════════════════════

  const handleDeleteExam = async (id: string) => {
    if (!confirm('Xóa bài thi này? Tất cả kết quả quét sẽ bị mất liên kết.')) return
    try {
      await fetch(`/api/exam-sessions/scan/${id}`, { method: 'DELETE' })
      await fetchExams()
      if (selectedExam?.id === id) { setSelectedExam(null); setView('list') }
    } catch { /* ignore */ }
  }

  // ═══════════════════════════════════
  // EXPORT EXCEL
  // ═══════════════════════════════════

  const handleExportExcel = async () => {
    if (!selectedExam || scanResults.length === 0) return
    
    // Group by SBD, take max score
    const sbdMap = new Map<string, ScanResult>()
    for (const r of scanResults) {
      const sbd = r.student_id_number || 'KhongXacDinh'
      const existing = sbdMap.get(sbd)
      if (!existing || r.score > existing.score) {
        sbdMap.set(sbd, r)
      }
    }
    
    // Sort by SBD ascending
    const sortedResults = Array.from(sbdMap.values()).sort((a, b) => {
      const sbdA = a.student_id_number || ''
      const sbdB = b.student_id_number || ''
      const numA = parseInt(sbdA, 10)
      const numB = parseInt(sbdB, 10)
      if (!isNaN(numA) && !isNaN(numB)) {
        if (numA !== numB) return numA - numB
      }
      return sbdA.localeCompare(sbdB)
    })
    
    try {
      const { utils, write } = await import('xlsx')
      const data = sortedResults.map((r, i) => ({
        'STT': i + 1,
        'SBD': r.student_id_number || 'Trống',
        'Mã đề': r.exam_code || 'Trống',
        'Tổng điểm': r.score,
        'Trắc nghiệm': `${r.mc_correct}/${r.mc_total}`,
        'Đúng/Sai': `${r.tf_score}/${r.tf_max_score}`,
        'Trả lời ngắn': `${r.sa_correct}/${r.sa_total}`,
        'Thời gian quét': new Date(r.created_at).toLocaleString('vi-VN')
      }))
      
      const ws = utils.json_to_sheet(data)
      const wb = utils.book_new()
      utils.book_append_sheet(wb, ws, 'KetQua')
      
      const excelBuffer = write(wb, { bookType: 'xlsx', type: 'array' })
      const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Ket_qua_${selectedExam.name.replace(/[^a-z0-9]/gi, '_')}.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      alert('Lỗi xuất Excel: ' + String(err))
    }
  }

  // Cleanup camera on unmount
  useEffect(() => { return () => { stopCamera() } }, [])

  // ═══════════════════════════════════
  // RENDER
  // ═══════════════════════════════════

  const examCodes = selectedExam ? Object.keys(selectedExam.answer_keys) : []

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 16px' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          📷 Quét phiếu chấm thi
        </h1>
        <p style={{ color: '#64748b', margin: '4px 0 0', fontSize: 14 }}>
          Tạo bài thi, nhập đáp án và quét phiếu trả lời bằng camera
        </p>
      </div>

      {/* ═══ LIST VIEW ═══ */}
      {view === 'list' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Danh sách bài thi</h2>
            <button onClick={() => { resetCreateForm(); setView('create') }} style={btnPrimary}>
              ＋ Tạo bài thi mới
            </button>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>⏳ Đang tải...</div>
          ) : exams.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, background: '#f8fafc', borderRadius: 16, border: '2px dashed #e2e8f0' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📝</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: '#334155' }}>Chưa có bài thi nào</div>
              <div style={{ fontSize: 14, color: '#94a3b8', marginBottom: 16 }}>Tạo bài thi mới để bắt đầu quét phiếu chấm thi</div>
              <button onClick={() => { resetCreateForm(); setView('create') }} style={btnPrimary}>
                ＋ Tạo bài thi đầu tiên
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {exams.map(exam => (
                <SwipeableExamCard 
                  key={exam.id} 
                  exam={exam} 
                  onClick={() => fetchExamDetail(exam)} 
                  onDelete={() => handleDeleteExam(exam.id)} 
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══ CREATE / EDIT VIEW ═══ */}
      {(view === 'create' || view === 'edit') && (
        <div>
          <button onClick={() => { resetCreateForm(); setView(view === 'edit' ? 'detail' : 'list') }} style={btnBack}>← Quay lại</button>
          <h2 style={{ fontSize: 24, fontWeight: 800, margin: '16px 0' }}>
            {view === 'edit' ? '✏️ Chỉnh sửa bài thi' : '✨ Tạo bài thi chấm trắc nghiệm'}
          </h2>

          {formStep === 1 ? (
            <div style={{ marginTop: 16 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Bước 1: Tạo bài thi & Nhập đáp án</h2>

              {/* Tên + Cấu hình */}
              <div style={card}>
                <div style={cardTitle}>⚙️ Thông tin cơ bản</div>
                <div style={{ marginBottom: 12 }}>
                  <label style={labelStyle}>Tên bài thi</label>
                  <input value={formName} onChange={e => setFormName(e.target.value)} placeholder="VD: Kiểm tra giữa kỳ Toán 12"
                    style={{ ...inputStyle, width: '100%' }} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                  <div>
                    <label style={labelStyle}>Trắc nghiệm (MC)</label>
                    <input type="number" min={0} max={40} value={formMcCount} onChange={e => setFormMcCount(Math.min(40, Math.max(0, +e.target.value || 0)))} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Đúng/Sai (TF)</label>
                    <input type="number" min={0} max={8} value={formTfCount} onChange={e => setFormTfCount(Math.min(8, Math.max(0, +e.target.value || 0)))} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Trả lời ngắn (SA)</label>
                    <input type="number" min={0} max={6} value={formSaCount} onChange={e => setFormSaCount(Math.min(6, Math.max(0, +e.target.value || 0)))} style={inputStyle} />
                  </div>
                </div>
              </div>

              {/* Nhập đáp án */}
              <div style={{ ...card, marginTop: 16 }}>
                <div style={cardTitle}>✏️ Nhập đáp án</div>

                {/* Mã đề selector */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#64748b' }}>Mã đề:</span>
                  {Object.keys(formAnswerKeys).map(code => (
                    <div key={code} style={{ display: 'flex', alignItems: 'center' }}>
                      <button onClick={() => setCurrentCode(code)} style={{
                        padding: '4px 12px', 
                        borderRadius: code === currentCode ? '6px 0 0 6px' : 6, 
                        border: code === currentCode ? '2px solid #3b82f6' : '1px solid #e2e8f0',
                        borderRight: code === currentCode ? 'none' : '1px solid #e2e8f0',
                        background: code === currentCode ? '#eff6ff' : 'white', 
                        fontWeight: 700, fontSize: 13, cursor: 'pointer',
                        color: code === currentCode ? '#1d4ed8' : '#334155'
                      }}>{code}</button>
                      
                      {code === currentCode && (
                        <div style={{ 
                          display: 'flex', 
                          border: '2px solid #3b82f6', 
                          borderLeft: '1px solid #bfdbfe', 
                          borderRadius: '0 6px 6px 0', 
                          background: '#eff6ff' 
                        }}>
                          <button onClick={() => {
                            const newCode = prompt('Đổi tên mã đề:', code)
                            if (newCode && newCode.trim() && newCode.trim() !== code) {
                               const trimmed = newCode.trim()
                               if (formAnswerKeys[trimmed]) { alert('Mã đề đã tồn tại!'); return }
                               const newKeys = { ...formAnswerKeys }
                               newKeys[trimmed] = newKeys[code]
                               delete newKeys[code]
                               setFormAnswerKeys(newKeys)
                               setCurrentCode(trimmed)
                            }
                          }} style={{ background: 'transparent', border: 'none', padding: '4px 6px', cursor: 'pointer', fontSize: 12, borderRight: '1px solid #bfdbfe' }} title="Đổi tên mã đề">
                            ✏️
                          </button>
                          <button onClick={() => {
                            if (confirm(`Bạn có chắc muốn xóa mã đề ${code}?`)) {
                              const newKeys = { ...formAnswerKeys }
                              delete newKeys[code]
                              setFormAnswerKeys(newKeys)
                              setCurrentCode(Object.keys(newKeys)[0] || '')
                            }
                          }} style={{ background: 'transparent', border: 'none', padding: '4px 8px', cursor: 'pointer', fontSize: 12, color: '#ef4444' }} title="Xóa mã đề">
                            ✖
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                  <button onClick={() => {
                    const code = prompt('Nhập mã đề mới (VD: 001, 1234):')
                    if (code?.trim()) {
                      setFormAnswerKeys(prev => ({ ...prev, [code.trim()]: { mc: Array(formMcCount).fill(''), tf: Array(formTfCount).fill(''), sa: Array(formSaCount).fill('') } }))
                      setCurrentCode(code.trim())
                    }
                  }} style={{ padding: '4px 10px', borderRadius: 6, border: '1px dashed #94a3b8', background: 'transparent', fontSize: 12, cursor: 'pointer', color: '#94a3b8' }}>
                    + Thêm mã đề
                  </button>
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '2px solid #f1f5f9', paddingBottom: 8 }}>
                  {([['manual', '✏️ Thủ công'], ['excel', '📁 Import Excel'], ['qr', '📱 Quét QR']] as const).map(([key, label]) => (
                    <button key={key} onClick={() => setAnswerTab(key)} style={{
                      padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                      background: answerTab === key ? '#3b82f6' : 'transparent', color: answerTab === key ? 'white' : '#64748b',
                    }}>{label}</button>
                  ))}
                </div>

                {answerTab === 'manual' && (
                  <ManualAnswerInput
                    mcCount={formMcCount} tfCount={formTfCount} saCount={formSaCount}
                    answerKey={getCurrentKey()}
                    onMcChange={handleMcAnswer} onTfChange={handleTfAnswer} onSaChange={handleSaAnswer}
                  />
                )}

                {answerTab === 'excel' && (
                  <div style={{ textAlign: 'center', padding: 24, background: '#f8fafc', borderRadius: 12, border: '2px dashed #e2e8f0' }}>
                    <div style={{ fontSize: 36, marginBottom: 8 }}>📁</div>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>Import file đáp án Excel</div>
                    <div style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>Hỗ trợ format: TNMaker, YoungMix, SmartTest, AZOTA</div>
                    <input type="file" accept=".xlsx,.xls,.csv,.tsv,.txt" onChange={handleExcelImport} style={{ display: 'none' }} id="excel-import" />
                    <label htmlFor="excel-import" style={{ ...btnPrimary, display: 'inline-block', cursor: 'pointer' }}>
                      Chọn file
                    </label>
                    <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 8 }}>Lưu ý: File .xlsx cần save as .csv/.tsv trước khi import (hỗ trợ XLSX đang phát triển)</div>
                  </div>
                )}

                {answerTab === 'qr' && (
                  <div style={{ textAlign: 'center', padding: 24, background: '#f8fafc', borderRadius: 12, border: '2px dashed #e2e8f0' }}>
                    <div style={{ fontSize: 36, marginBottom: 8 }}>📷</div>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>Chụp hoặc Upload ảnh QR Code</div>
                    <div style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>
                      Dùng điện thoại chụp ảnh QR Code hoặc upload ảnh có chứa mã QR đáp án.
                    </div>
                    <label style={{ ...btnPrimary, display: 'inline-flex', cursor: 'pointer', margin: '0 auto' }}>
                      <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleQrImageUpload} />
                      📷 Chụp / Chọn ảnh QR
                    </label>
                  </div>
                )}
              </div>

              <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={() => setFormStep(2)} disabled={Object.keys(formAnswerKeys).length === 0}
                  style={{ ...btnPrimary, opacity: Object.keys(formAnswerKeys).length === 0 ? 0.5 : 1 }}>
                  Tiếp tục — Cấu hình điểm →
                </button>
              </div>
            </div>
          ) : (
            /* Step 2: Scoring config */
            <div style={{ marginTop: 16 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Bước 2: Cấu hình thang điểm</h2>
              <div style={card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <div style={cardTitle}>⚙️ Thang điểm</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#3b82f6' }}>
                    Tổng: {r2(formMcScore + formTfScore + formSaScore)} điểm
                  </div>
                </div>

                {formMcCount > 0 && (
                  <div style={scoringRow}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                      <span style={{ fontWeight: 700 }}>📘 Phần I — Trắc nghiệm</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input type="number" step={0.5} min={0} max={10} value={formMcScore} onChange={e => setFormMcScore(+e.target.value || 0)} style={{ ...inputStyle, width: 60, textAlign: 'center' as const }} />
                      <span style={{ fontSize: 13, color: '#64748b' }}>điểm ÷ {formMcCount} câu = <strong>{r2(formMcScore / formMcCount)}đ/câu</strong></span>
                    </div>
                  </div>
                )}

                {formTfCount > 0 && (
                  <div style={scoringRow}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                      <span style={{ fontWeight: 700 }}>📗 Phần II — Đúng/Sai</span>
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input type="number" step={0.5} min={0} max={10} value={formTfScore} onChange={e => setFormTfScore(+e.target.value || 0)} style={{ ...inputStyle, width: 60, textAlign: 'center' as const }} />
                        <span style={{ fontSize: 13, color: '#64748b' }}>điểm ÷ {formTfCount} câu = <strong>{r2(formTfScore / formTfCount)}đ/câu</strong></span>
                      </div>
                      <div style={{ fontSize: 12, color: '#7c3aed', marginTop: 4, background: '#f5f3ff', padding: '4px 8px', borderRadius: 6 }}>
                        Theo Bộ GD: 4/4 = 1.0 | 3/4 = 0.5 | 2/4 = 0.25 | 1/4 = 0.1 | 0/4 = 0
                      </div>
                    </div>
                  </div>
                )}

                {formSaCount > 0 && (
                  <div style={scoringRow}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                      <span style={{ fontWeight: 700 }}>📙 Phần III — Trả lời ngắn</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input type="number" step={0.5} min={0} max={10} value={formSaScore} onChange={e => setFormSaScore(+e.target.value || 0)} style={{ ...inputStyle, width: 60, textAlign: 'center' as const }} />
                      <span style={{ fontSize: 13, color: '#64748b' }}>điểm ÷ {formSaCount} câu = <strong>{r2(formSaScore / formSaCount)}đ/câu</strong></span>
                    </div>
                  </div>
                )}
              </div>

              <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between' }}>
                <button onClick={() => setFormStep(1)} style={btnBack}>← Quay lại nhập đáp án</button>
                {view === 'edit' ? (
                  <button onClick={handleUpdateExam} disabled={formSaving} style={btnPrimary}>
                    {formSaving ? '⏳ Đang lưu...' : '✅ Lưu thay đổi'}
                  </button>
                ) : (
                  <button onClick={handleCreateExam} disabled={formSaving} style={btnPrimary}>
                    {formSaving ? '⏳ Đang tạo...' : '✅ Hoàn tất tạo bài thi'}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ DETAIL VIEW ═══ */}
      {view === 'detail' && selectedExam && (
        <div>
          <button onClick={() => { setView('list'); setSelectedExam(null) }} style={btnBack}>← Quay lại</button>
          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>{selectedExam.name}</h2>
              <div style={{ fontSize: 13, color: '#64748b', marginTop: 4, display: 'flex', gap: 12 }}>
                <span>📘 {selectedExam.mc_count} TN ({selectedExam.mc_total_score}đ)</span>
                <span>📗 {selectedExam.tf_count} ĐS ({selectedExam.tf_total_score}đ)</span>
                <span>📙 {selectedExam.sa_count} SA ({selectedExam.sa_total_score}đ)</span>
                <span>🔑 {examCodes.length} mã đề: {examCodes.join(', ')}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setScanRaw(null); setSaveMsg(null); setView('scan') }} style={btnPrimary}>
                📷 Quét phiếu
              </button>
              <button onClick={() => {
                setFormName(selectedExam.name)
                setFormMcCount(selectedExam.mc_count)
                setFormTfCount(selectedExam.tf_count)
                setFormSaCount(selectedExam.sa_count)
                setFormAnswerKeys(selectedExam.answer_keys)
                setFormMcScore(selectedExam.mc_total_score)
                setFormTfScore(selectedExam.tf_total_score)
                setFormSaScore(selectedExam.sa_total_score)
                setFormStep(1)
                const firstCode = Object.keys(selectedExam.answer_keys)[0]
                setCurrentCode(firstCode || '')
                setView('edit')
              }} style={{ ...btnBack, color: '#0ea5e9', borderColor: '#bae6fd' }}>
                ✏️ Sửa cấu hình
              </button>
              <button onClick={() => handleDeleteExam(selectedExam.id)} style={{ ...btnBack, color: '#dc2626', borderColor: '#fecaca' }}>
                🗑️ Xóa
              </button>
            </div>
          </div>

          {/* Stats */}
          {scanResults.length > 0 && (
            <div style={{ ...card, marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12 }}>
              <StatCard label="Tổng phiếu" value={scanResults.length} />
              <StatCard label="Điểm TB" value={r2(scanResults.reduce((s, r) => s + r.score, 0) / scanResults.length)} />
              <StatCard label="Cao nhất" value={Math.max(...scanResults.map(r => r.score))} color="#16a34a" />
              <StatCard label="Thấp nhất" value={Math.min(...scanResults.map(r => r.score))} color="#dc2626" />
            </div>
          )}

          {/* Results table */}
          <div style={{ ...card, marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ ...cardTitle, marginBottom: 0 }}>📊 Kết quả quét ({scanResults.length} phiếu)</div>
              {scanResults.length > 0 && (
                <button onClick={handleExportExcel} style={{ ...btnPrimary, background: '#10b981', borderColor: '#059669' }}>
                  📥 Xuất Excel
                </button>
              )}
            </div>
            {scanResults.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 32, color: '#94a3b8' }}>
                Chưa có phiếu nào được quét. Nhấn "📷 Quét phiếu" để bắt đầu.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                      <th style={th}>#</th>
                      <th style={th}>SBD</th>
                      <th style={th}>Mã đề</th>
                      <th style={th}>Điểm</th>
                      <th style={th}>MC</th>
                      <th style={th}>TF</th>
                      <th style={th}>SA</th>
                      <th style={th}>Thời gian</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scanResults.map((r, i) => (
                      <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={td}>{i + 1}</td>
                        <td style={td}>{r.student_id_number || '—'}</td>
                        <td style={td}>{r.exam_code || '—'}</td>
                        <td style={{ ...td, fontWeight: 700, color: r.score >= r.max_score * 0.5 ? '#16a34a' : '#dc2626' }}>
                          {r.score}/{r.max_score}
                        </td>
                        <td style={td}>{r.mc_correct}/{r.mc_total}</td>
                        <td style={td}>{r.tf_score}/{r.tf_max_score}</td>
                        <td style={td}>{r.sa_correct}/{r.sa_total}</td>
                        <td style={{ ...td, color: '#94a3b8' }}>{new Date(r.created_at).toLocaleString('vi')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ SCAN VIEW ═══ */}
      {(view === 'scan' || view === 'result') && selectedExam && (
        <div style={{ display: view === 'scan' ? 'block' : 'none' }}>
          <button onClick={() => { stopCamera(); setView('detail') }} style={btnBack}>← Quay lại bài thi</button>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: '16px 0' }}>📷 Quét phiếu — {selectedExam.name}</h2>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16 }}>
            {/* Camera / Upload */}
            <div style={card}>
              <div style={cardTitle}>{isMobile ? '📸 Camera' : '📁 Upload ảnh'}</div>

              {isMobile && !cameraActive && (
                <button onClick={startCamera} style={{ ...btnPrimary, width: '100%', justifyContent: 'center', padding: '16px', marginBottom: 12 }}>
                  📸 Mở Camera
                </button>
              )}

              {/* Fast Scan Toggle */}
              <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8, padding: 12, background: isFastScan ? '#dcfce7' : '#f1f5f9', borderRadius: 8, cursor: 'pointer' }} onClick={() => setIsFastScan(!isFastScan)}>
                <input type="checkbox" checked={isFastScan} readOnly style={{ width: 18, height: 18 }} />
                <div style={{ fontWeight: 600, color: isFastScan ? '#166534' : '#475569', fontSize: 14 }}>⚡ Chế độ Quét liên tục (Tự động lưu)</div>
              </div>

              {cameraActive && (
                <div>
                  <div style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', backgroundColor: '#000' }}>
                    <video ref={videoRef} style={{ width: '100%', display: 'block' }} autoPlay playsInline muted />
                    {/* Overlay guides */}
                    {saveMsg && (
                      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'rgba(22, 163, 74, 0.9)', color: 'white', padding: '16px 24px', borderRadius: 12, fontWeight: 800, fontSize: 24, zIndex: 10, textAlign: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.3)', whiteSpace: 'nowrap' }}>
                        {saveMsg}
                      </div>
                    )}
                    {/* Overlay guides - A4 aspect ratio */}
                    <div style={{
                      position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                      width: '92%', maxWidth: 500, aspectRatio: '1 / 1.414',
                      border: '2px solid rgba(59,130,246,0.8)',
                      display: 'flex', justifyContent: 'space-between', flexDirection: 'column', padding: 16,
                      pointerEvents: 'none',
                      boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)',
                      borderRadius: 12
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <div style={markerGuide}>■</div>
                        <div style={markerGuide}>■</div>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <div style={markerGuide}>■</div>
                        <div style={markerGuide}>■</div>
                      </div>
                    </div>
                  </div>
                  <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                    <button onClick={capturePhoto} disabled={isProcessing} style={{ ...btnPrimary, flex: 1, justifyContent: 'center', padding: '14px' }}>
                      {isProcessing ? '⏳ Đang xử lý...' : '📸 Chụp & Quét'}
                    </button>
                    <button onClick={stopCamera} style={btnBack}>✕</button>
                  </div>
                </div>
              )}

              {/* Desktop: upload */}
              <div style={{ marginTop: 12 }}>
                <div onClick={() => fileInputRef.current?.click()} style={{
                  padding: 24, textAlign: 'center', background: '#f8fafc', borderRadius: 12,
                  border: '2px dashed #e2e8f0', cursor: 'pointer',
                }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>📁</div>
                  <div style={{ fontWeight: 600 }}>Kéo thả hoặc click để chọn ảnh</div>
                  <div style={{ fontSize: 13, color: '#94a3b8' }}>JPG, PNG (tối đa 10MB)</div>
                </div>
                <input ref={fileInputRef} type="file" accept="image/*,application/pdf" multiple capture={isMobile ? 'environment' : undefined} style={{ display: 'none' }}
                  onChange={e => {
                    const files = e.target.files
                    if (!files || files.length === 0) return
                    if (files.length === 1 && files[0].type.startsWith('image/')) {
                      processImage(files[0]) // single image
                    } else {
                      processBatch(files) // multiple images or PDF
                    }
                    e.target.value = ''
                  }} />
              </div>
            </div>

            {/* Info panel */}
            <div style={card}>
              <div style={cardTitle}>📋 Thông tin bài thi</div>
              <div style={{ fontSize: 14, lineHeight: 2 }}>
                <div>📘 Trắc nghiệm: <strong>{selectedExam.mc_count} câu</strong> ({selectedExam.mc_total_score}đ)</div>
                <div>📗 Đúng/Sai: <strong>{selectedExam.tf_count} câu</strong> ({selectedExam.tf_total_score}đ)</div>
                <div>📙 Trả lời ngắn: <strong>{selectedExam.sa_count} câu</strong> ({selectedExam.sa_total_score}đ)</div>
                <div>🔑 Mã đề: <strong>{examCodes.join(', ') || 'Chưa có'}</strong></div>
              </div>
              <div style={{ marginTop: 12, padding: 12, background: '#f0f9ff', borderRadius: 8, fontSize: 13, color: '#1e40af' }}>
                💡 Khi quét, hệ thống sẽ tự động nhận dạng mã đề trên phiếu và match đáp án tương ứng.
              </div>
            </div>
          </div>

          <canvas ref={canvasRef} style={{ display: 'none' }} />
        </div>
      )}

      {/* ═══ RESULT VIEW ═══ */}
      {view === 'result' && selectedExam && scanRaw && score && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 16 }}>
            {/* Score card */}
            <div style={{ ...card, position: 'sticky' as const, top: 16 }}>
              <div style={{ textAlign: 'center', padding: '16px 0' }}>
                <div style={{ fontSize: 48, fontWeight: 900, color: score.total >= score.maxScore * 0.5 ? '#16a34a' : '#dc2626' }}>
                  {score.total}
                </div>
                <div style={{ fontSize: 16, color: '#64748b' }}>/ {score.maxScore} điểm</div>
              </div>

              <div style={{ padding: '0 16px 16px' }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 11, color: '#94a3b8' }}>Mã đề</label>
                    <input value={overrideExamCode} onChange={e => setOverrideExamCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      style={{ ...inputStyle, width: '100%', textAlign: 'center' as const, fontWeight: 700 }} placeholder="—" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 11, color: '#94a3b8' }}>SBD</label>
                    <input value={overrideStudentId} onChange={e => setOverrideStudentId(e.target.value.replace(/\D/g, '').slice(0, 8))}
                      style={{ ...inputStyle, width: '100%', textAlign: 'center' as const, fontWeight: 700 }} placeholder="—" />
                  </div>
                </div>

                {score.mcTotal > 0 ? <div style={scoreDetailRow}><span>📘 TN</span><span>{score.mcCorrect}/{score.mcTotal} đúng</span></div> : null}
                {score.tfMaxScore > 0 ? <div style={scoreDetailRow}><span>📗 ĐS</span><span>{score.tfScore}/{score.tfMaxScore}đ</span></div> : null}
                {score.saTotal > 0 ? <div style={scoreDetailRow}><span>📙 SA</span><span>{score.saCorrect}/{score.saTotal} đúng</span></div> : null}

                {!getMatchedKey() ? (
                  <div style={{ padding: 8, background: '#fef9c3', borderRadius: 6, fontSize: 12, color: '#92400e', marginTop: 8 }}>
                    ⚠️ Không tìm thấy mã đề &quot;{overrideExamCode}&quot; trong đáp án. Hãy chọn mã đề đúng.
                  </div>
                ) : null}

                <button onClick={handleSaveResult} disabled={isSaving} style={{ ...btnPrimary, width: '100%', justifyContent: 'center', marginTop: 12, background: '#16a34a' }}>
                  {isSaving ? '⏳ Đang lưu...' : '💾 Lưu kết quả'}
                </button>
                {saveMsg && <div style={{ textAlign: 'center', marginTop: 8, fontSize: 13, fontWeight: 600, color: saveMsg.startsWith('✅') ? '#16a34a' : '#dc2626' }}>{saveMsg}</div>}

                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button onClick={() => { setScanRaw(null); setSaveMsg(null); setView('scan') }} style={{ ...btnBack, flex: 1, justifyContent: 'center' }}>📷 Quét tiếp</button>
                  <button onClick={() => { setScanRaw(null); fetchExamDetail(selectedExam); }} style={{ ...btnBack, flex: 1, justifyContent: 'center' }}>📊 Xem DS</button>
                </div>
              </div>
            </div>

            {/* Answer details */}
            <div style={card}>
              <div style={cardTitle}>✏️ Kiểm tra & Sửa đáp án</div>
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>Click để sửa nếu AI đọc sai</div>

              {/* MC Override */}
              {selectedExam.mc_count > 0 ? (
                <AnswerOverrideSection
                  title="📘 Phần I — Trắc nghiệm" type="mc"
                  count={selectedExam.mc_count}
                  studentAnswers={overrideMc}
                  correctAnswers={getMatchedKey()?.mc || []}
                  onOverride={(i, v) => { const next = [...overrideMc]; next[i] = ['A','B','C','D'].includes(v.toUpperCase()) ? v.toUpperCase() : null; setOverrideMc(next) }}
                />
              ) : null}

              {/* TF Override */}
              {selectedExam.tf_count > 0 ? (
                <TFOverrideSection
                  count={selectedExam.tf_count}
                  overrideTf={overrideTf}
                  setOverrideTf={setOverrideTf}
                  getMatchedKey={getMatchedKey}
                />
              ) : null}

              {/* SA Override */}
              {selectedExam.sa_count > 0 ? (
                <div style={{ padding: '12px 0', borderTop: '1px solid #f1f5f9' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#d97706', marginBottom: 8, textTransform: 'uppercase' }}>📙 Phần III — Trả lời ngắn</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
                    {[...Array(selectedExam.sa_count)].map((_, i) => {
                      const student = overrideSa[i]
                      const correct = getMatchedKey()?.sa[i] || ''
                      const isOk = student != null && normSA(student) === normSA(correct)
                      return (
                        <div key={i} style={{ padding: '6px 10px', borderRadius: 6, background: student == null ? '#fef9c3' : isOk ? '#f0fdf4' : '#fef2f2', border: `1px solid ${student == null ? '#fde047' : isOk ? '#bbf7d0' : '#fecaca'}` }}>
                          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Câu {i + 1} — đúng: <strong>{correct}</strong></div>
                          <input value={student || ''} onChange={e => { const next = [...overrideSa]; next[i] = e.target.value || null; setOverrideSa(next) }}
                            placeholder="Nhập đáp án..." style={{ width: '100%', fontSize: 14, fontWeight: 700, border: '1px solid #e2e8f0', borderRadius: 4, padding: '3px 6px', background: 'white' }} />
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : null}

              {/* Debug image */}
              {typeof (scanRaw as Record<string, unknown>)?.debug_image_base64 === 'string' ? (
                <div style={{ marginTop: 16, borderTop: '1px solid #f1f5f9', paddingTop: 12 }}>
                  <div onClick={() => setShowDebug(!showDebug)} style={{ cursor: 'pointer', fontWeight: 600, color: '#334155', display: 'flex', justifyContent: 'space-between' }}>
                    <span>🐛 Ảnh Debug</span>
                    <span>{showDebug ? '▲' : '▼'}</span>
                  </div>
                  {showDebug ? (
                    <img src={String((scanRaw as Record<string, unknown>).debug_image_base64)} alt="Debug" style={{ width: '100%', borderRadius: 8, marginTop: 8 }} />
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* Processing overlay */}
      {isProcessing && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: 'white', borderRadius: 16, padding: 32, textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 8, animation: 'spin 1s linear infinite' }}>⏳</div>
            <div style={{ fontWeight: 700 }}>AI đang đọc phiếu...</div>
            <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>Nhận dạng bong bóng, mã đề, số báo danh</div>
          </div>
        </div>
      )}

      {/* Batch Progress Modal */}
      {batchProgress && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', padding: 24, borderRadius: 16, width: '90%', maxWidth: 400, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', textAlign: 'center' }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>🚀 Đang quét hàng loạt...</h3>
            
            {batchProgress.total === 0 ? (
              <div style={{ color: '#64748b', marginBottom: 16 }}>Đang tách trang PDF (vui lòng đợi)...</div>
            ) : (
              <>
                <div style={{ width: '100%', background: '#e2e8f0', borderRadius: 8, height: 8, marginBottom: 16, overflow: 'hidden' }}>
                  <div style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%`, background: '#3b82f6', height: '100%', transition: 'width 0.3s' }} />
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#334155', marginBottom: 16 }}>
                  Đang quét: {batchProgress.current} / {batchProgress.total} trang
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginBottom: 24 }}>
                  <div style={{ background: '#dcfce7', color: '#166534', padding: '8px 16px', borderRadius: 8, fontWeight: 700 }}>
                    ✅ {batchProgress.success} thành công
                  </div>
                  <div style={{ background: '#fee2e2', color: '#991b1b', padding: '8px 16px', borderRadius: 8, fontWeight: 700 }}>
                    ❌ {batchProgress.error} lỗi
                  </div>
                </div>
              </>
            )}

            {!batchProgress.isRunning && (
              <button onClick={() => setBatchProgress(null)} style={{ ...btnPrimary, width: '100%', justifyContent: 'center' }}>
                Đóng
              </button>
            )}
          </div>
        </div>
      )}

    </div>
  )
}

// ═══════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════

function ManualAnswerInput({ mcCount, tfCount, saCount, answerKey, onMcChange, onTfChange, onSaChange }: {
  mcCount: number; tfCount: number; saCount: number
  answerKey: AnswerKey
  onMcChange: (i: number, v: string) => void
  onTfChange: (i: number, v: string) => void
  onSaChange: (i: number, v: string) => void
}) {
  return (
    <div>
      {mcCount > 0 && (
        <>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#1d4ed8', marginBottom: 6, textTransform: 'uppercase' }}>
            Phần I — Trắc nghiệm ({mcCount} câu)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(56px, 1fr))', gap: 6, marginBottom: 16 }}>
            {Array.from({ length: mcCount }, (_, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                <span style={{ fontSize: 10, color: '#94a3b8' }}>{i + 1}</span>
                <input type="text" maxLength={1} value={answerKey.mc[i] || ''} onChange={e => onMcChange(i, e.target.value)}
                  placeholder="?" style={{ ...inputStyle, width: 36, height: 36, textAlign: 'center' as const, fontWeight: 700, fontSize: 14, padding: 0, background: answerKey.mc[i] ? '#eff6ff' : 'white' }} />
              </div>
            ))}
          </div>
        </>
      )}
      {tfCount > 0 && (
        <>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#7c3aed', marginBottom: 6, textTransform: 'uppercase' }}>
            Phần II — Đúng/Sai ({tfCount} câu)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))', gap: 6, marginBottom: 16 }}>
            {Array.from({ length: tfCount }, (_, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                <span style={{ fontSize: 10, color: '#94a3b8' }}>Câu {i + 1}</span>
                <input type="text" maxLength={4} value={answerKey.tf[i] || ''} onChange={e => onTfChange(i, e.target.value)}
                  placeholder="ĐSĐS" style={{ ...inputStyle, width: 56, textAlign: 'center' as const, fontWeight: 700, fontSize: 12, background: answerKey.tf[i]?.length === 4 ? '#f5f3ff' : 'white' }} />
              </div>
            ))}
          </div>
        </>
      )}
      {saCount > 0 && (
        <>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#d97706', marginBottom: 6, textTransform: 'uppercase' }}>
            Phần III — Trả lời ngắn ({saCount} câu)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: 6 }}>
            {Array.from({ length: saCount }, (_, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                <span style={{ fontSize: 10, color: '#94a3b8' }}>Câu {i + 1}</span>
                <input type="text" maxLength={10} value={answerKey.sa[i] || ''} onChange={e => onSaChange(i, e.target.value)}
                  placeholder="0" style={{ ...inputStyle, width: 64, textAlign: 'center' as const, fontWeight: 700, background: answerKey.sa[i]?.trim() ? '#fffbeb' : 'white' }} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function AnswerOverrideSection({ title, count, studentAnswers, correctAnswers, onOverride }: {
  title: string; type: string; count: number
  studentAnswers: (string | null)[]
  correctAnswers: string[]
  onOverride: (i: number, v: string) => void
}) {
  return (
    <div style={{ padding: '12px 0', borderTop: '1px solid #f1f5f9' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#1d4ed8', marginBottom: 8, textTransform: 'uppercase' }}>{title}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 4 }}>
        {[...Array(count)].map((_, i) => {
          const student = studentAnswers[i]
          const correct = correctAnswers[i]
          const isOk = student != null && student.toUpperCase() === correct?.toUpperCase()
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderRadius: 6, background: student == null ? '#fef9c3' : isOk ? '#f0fdf4' : '#fef2f2', border: `1px solid ${student == null ? '#fde047' : isOk ? '#bbf7d0' : '#fecaca'}` }}>
              <span style={{ fontSize: 11, color: '#64748b', minWidth: 20 }}>{i + 1}.</span>
              {(['A', 'B', 'C', 'D']).map(opt => (
                <button key={opt} onClick={() => onOverride(i, student === opt ? '' : opt)} style={{
                  width: 26, height: 26, borderRadius: '50%', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700,
                  background: student === opt ? (isOk ? '#16a34a' : '#dc2626') : opt === correct ? '#dbeafe' : '#f1f5f9',
                  color: student === opt ? '#fff' : opt === correct ? '#1d4ed8' : '#64748b',
                  outline: opt === correct ? '2px solid #93c5fd' : 'none',
                }}>{opt}</button>
              ))}
              {!isOk && student != null && <span style={{ fontSize: 10, color: '#dc2626' }}>→{correct}</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

interface AnswerKeyLocal {
  mc: string[]
  tf: string[]
  sa: string[]
}

function TFOverrideSection({ count, overrideTf, setOverrideTf, getMatchedKey }: {
  count: number
  overrideTf: (string | null)[]
  setOverrideTf: (v: (string | null)[]) => void
  getMatchedKey: () => AnswerKeyLocal | null
}) {
  return (
    <div style={{ padding: '12px 0', borderTop: '1px solid #f1f5f9' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#7c3aed', marginBottom: 8, textTransform: 'uppercase' }}>📗 Phần II — Đúng/Sai</div>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' as const }}>
          <span style={{ fontSize: 12, fontWeight: 600, minWidth: 50 }}>Câu {i + 1}:</span>
          {(['a', 'b', 'c', 'd'] as const).map((sub, si) => (
            <div key={sub} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <span style={{ fontSize: 11, color: '#64748b' }}>{sub})</span>
              {(['Đ', 'S'] as const).map(opt => (
                <button key={opt} onClick={() => {
                  const next = [...overrideTf]
                  const chars = (next[i] || '????').split('')
                  while (chars.length < 4) chars.push('?')
                  chars[si] = opt
                  next[i] = chars.join('').replace(/\?/g, '')
                  if ((next[i] as string).length < 4) next[i] = null
                  setOverrideTf(next)
                }} style={{
                  padding: '2px 7px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700,
                  background: (overrideTf[i] || '')[si] === opt
                    ? ((overrideTf[i] || '')[si] === (getMatchedKey()?.tf[i] || '')[si] ? '#16a34a' : '#dc2626')
                    : (getMatchedKey()?.tf[i] || '')[si] === opt ? '#ddd6fe' : '#f1f5f9',
                  color: (overrideTf[i] || '')[si] === opt ? '#fff' : (getMatchedKey()?.tf[i] || '')[si] === opt ? '#7c3aed' : '#64748b',
                }}>{opt}</button>
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: number | string; color?: string }) {
  return (
    <div style={{ textAlign: 'center', padding: 12 }}>
      <div style={{ fontSize: 24, fontWeight: 900, color: color || '#1e293b' }}>{value}</div>
      <div style={{ fontSize: 12, color: '#94a3b8' }}>{label}</div>
    </div>
  )
}

// ═══════════════════════════════════
// STYLES
// ═══════════════════════════════════

const btnPrimary: React.CSSProperties = {
  padding: '10px 20px', borderRadius: 10, border: 'none', background: '#3b82f6', color: 'white',
  fontWeight: 700, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
}

const btnBack: React.CSSProperties = {
  padding: '8px 14px', borderRadius: 8, border: '1px solid #e2e8f0', background: 'white', color: '#334155',
  fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
}

const card: React.CSSProperties = {
  background: 'white', borderRadius: 12, border: '1px solid #e2e8f0', padding: 16,
  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
}

const cardTitle: React.CSSProperties = {
  fontWeight: 700, fontSize: 15, marginBottom: 12, color: '#1e293b',
}

const labelStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4,
}

const inputStyle: React.CSSProperties = {
  padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14,
  outline: 'none',
}

const scoringRow: React.CSSProperties = {
  padding: '12px 0', borderBottom: '1px solid #f1f5f9',
  display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8,
}

const scoreDetailRow: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f8fafc',
  fontSize: 13,
}

const th: React.CSSProperties = {
  padding: '8px 12px', textAlign: 'left' as const, fontWeight: 600, color: '#64748b', fontSize: 12,
}

const td: React.CSSProperties = {
  padding: '8px 12px',
}

const markerGuide: React.CSSProperties = {
  width: 28, height: 28, background: 'rgba(59,130,246,0.3)', borderRadius: 4,
  display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3b82f6', fontWeight: 900, fontSize: 18,
}
