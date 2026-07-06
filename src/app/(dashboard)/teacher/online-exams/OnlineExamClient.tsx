// src/app/(dashboard)/admin/online-exams/OnlineExamClient.tsx
'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { RenderedLatex } from '@/components/RenderedLatex'
import Header from '@/components/layout/Header'
import styles from './online-exam.module.css'
import {
  parseAllSlideQuestions,
  extractRawExBlocks,
  type SlideQuestion,
  type ContentSegment,
} from '@/lib/latex-parser/slideshow-parser'
import { compileTikz } from '@/lib/tikz-api'

// ═══════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════

interface OnlineExam {
  id: string
  title: string
  description?: string
  grade?: number
  duration_minutes?: number
  total_questions: number
  is_published: boolean
  access_code: string
  scoring_config: Record<string, number>
  submission_count: number
  variant_count?: number
  created_at: string
}

interface Submission {
  id: string
  student_name: string
  student_code: string
  score: number
  time_spent_seconds: number
  submitted_at: string
  variant_index?: number
  detail_results: Array<{
    index: number
    type: string
    is_correct: boolean
    score_earned: number
    student_answer?: unknown
    correct_answer?: unknown
    tf_correct_count?: number
    tf_total?: number
  }>
}

const TYPE_LABELS: Record<string, string> = {
  multiple_choice: 'Trắc nghiệm',
  true_false: 'Đúng/Sai',
  short_answer: 'Trả lời ngắn',
  essay: 'Tự luận',
}

const TYPE_ICONS: Record<string, string> = {
  multiple_choice: '⚪',
  true_false: '☑️',
  short_answer: '✍️',
  essay: '📝',
}

const TYPE_CSS: Record<string, string> = {
  multiple_choice: 'mc',
  true_false: 'tf',
  short_answer: 'sa',
  essay: 'es',
}

// ═══════════════════════════════════════════════════
// SEGMENT RENDERER
// ═══════════════════════════════════════════════════
function RenderedSegments({ segments, questionId, part, imageMap }: {
  segments: ContentSegment[]; questionId: string; part: string; imageMap: Record<string, string>
}) {
  return (
    <>
      {segments.map((seg, idx) => {
        const imgKey = `${questionId}:${part}:${idx}`
        if (seg.type === 'image') {
          const svg = imageMap[imgKey]
          if (svg) {
            if (svg.startsWith('data:')) return <img key={imgKey} src={svg} alt="Hình" style={{ maxWidth: '100%' }} />
            return <div key={imgKey} style={{ display: 'flex', justifyContent: 'center' }} dangerouslySetInnerHTML={{ __html: svg }} />
          }
          return <div key={imgKey} style={{ color: '#94a3b8', fontStyle: 'italic' }}>⏳ Đang biên dịch hình...</div>
        }
        return <RenderedLatex key={imgKey} content={seg.content} />
      })}
    </>
  )
}

// ═══════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════

export default function OnlineExamClient() {
  const router = useRouter()

  // ─── Phase ───
  const [phase, setPhase] = useState<'list' | 'create' | 'detail'>('list')
  const [createStep, setCreateStep] = useState(1) // 1-4

  // ─── List ───
  const [exams, setExams] = useState<OnlineExam[]>([])
  const [loadingList, setLoadingList] = useState(true)

  // ─── Edit Mode ───
  const [editingExamId, setEditingExamId] = useState<string | null>(null)

  // ─── Create: Step 1 (Input) ───
  const [editorContent, setEditorContent] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ─── Multi-tab (from Tạo đề thi) ───
  const [examTabs, setExamTabs] = useState<{ label: string; code: string }[]>([])
  const [activeTabIndex, setActiveTabIndex] = useState(0)
  const [allTabQuestions, setAllTabQuestions] = useState<SlideQuestion[][]>([])
  const [allTabRawBlocks, setAllTabRawBlocks] = useState<string[][]>([])
  // Note: allTabImageMaps removed — we use a single combined imageMap for all tabs

  // ─── Create: Step 2 (Parse) ───
  const [questions, setQuestions] = useState<SlideQuestion[]>([])
  const [rawBlocks, setRawBlocks] = useState<string[]>([])
  const [expandedSolutions, setExpandedSolutions] = useState<Set<string>>(new Set())
  const [imageMap, setImageMap] = useState<Record<string, string>>({})
  const [isCompiling, setIsCompiling] = useState(false)

  // ─── Create: Step 3 (Config) ───
  const [examTitle, setExamTitle] = useState('')
  const [examDesc, setExamDesc] = useState('')
  const [examGrade, setExamGrade] = useState<number | ''>('')
  const [examDuration, setExamDuration] = useState<number | ''>('')
  const [mcScore, setMcScore] = useState(0.25)
  const [tfScore, setTfScore] = useState(1)
  const [saScore, setSaScore] = useState(0.5)
  const [essayScore, setEssayScore] = useState(1)

  // ─── Create: Step 4 (Publish) ───
  const [publishedExam, setPublishedExam] = useState<OnlineExam | null>(null)
  const [publishing, setPublishing] = useState(false)

  // ─── Detail ───
  const [selectedExam, setSelectedExam] = useState<OnlineExam | null>(null)
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null)

  // ═══════════════════════════════════════════════════
  // ON MOUNT: load saved content from sessionStorage
  // ═══════════════════════════════════════════════════
  useEffect(() => {
    try {
      // Multi-tab mode (from Tạo đề thi with multiple exams)
      const multiRaw = sessionStorage.getItem('online_exam_multi')
      if (multiRaw) {
        sessionStorage.removeItem('online_exam_multi')
        const parsed = JSON.parse(multiRaw)
        if (parsed.exams && Array.isArray(parsed.exams) && parsed.exams.length > 0) {
          const tabs = parsed.exams as { label: string; code: string }[]
          setExamTabs(tabs)
          setActiveTabIndex(0)
          setEditorContent(tabs[0].code)
          setPhase('create')
          setCreateStep(1)
          return
        }
      }

      // Single mode (legacy)
      const fromOtherPage = sessionStorage.getItem('online_exam_code')
      if (fromOtherPage) {
        setEditorContent(fromOtherPage)
        sessionStorage.removeItem('online_exam_code')
        setPhase('create')
        setCreateStep(1)
      }
    } catch { /* ignore */ }
  }, [])

  // ═══════════════════════════════════════════════════
  // LOAD EXAM LIST
  // ═══════════════════════════════════════════════════
  const loadExams = useCallback(async () => {
    setLoadingList(true)
    try {
      const res = await fetch('/api/online-exams')
      if (res.ok) {
        const data = await res.json()
        setExams(data)
      }
    } catch { /* ignore */ }
    setLoadingList(false)
  }, [])

  useEffect(() => { loadExams() }, [loadExams])

  // ═══════════════════════════════════════════════════
  // PARSE QUESTIONS (Step 1 → 2)
  // ═══════════════════════════════════════════════════

  const parseSingleTab = async (code: string) => {
    const blocks = extractRawExBlocks(code)
    const parsed = parseAllSlideQuestions(code)
    const tikzJobs: { key: string; code: string }[] = []
    for (const q of parsed) {
      const collect = (segs: ContentSegment[], part: string) => {
        segs.forEach((seg, idx) => {
          if (seg.type === 'image') tikzJobs.push({ key: `${q.id}:${part}:${idx}`, code: seg.content })
        })
      }
      collect(q.bodySegments, 'body')
      if (q.choices) q.choices.forEach(c => { if (c.segments) collect(c.segments, `choice-${c.label}`) })
      if (q.tfStatements) q.tfStatements.forEach(s => { if (s.segments) collect(s.segments, `tf-${s.label}`) })
      if (q.solutionSegments) collect(q.solutionSegments, 'sol')
    }
    const imgMap: Record<string, string> = {}
    // Compile one at a time — VPS dùng chung thư mục tạm, không thể chạy song song
    for (const job of tikzJobs) {
      try { imgMap[job.key] = await compileTikz(job.code) } catch (e) { /* skip */ }
    }
    return { parsed, blocks, imgMap }
  }

  const handleParse = async () => {
    if (!editorContent.trim()) return

    if (examTabs.length > 1) {
      // Multi-tab mode: save current tab content then parse all tabs
      setIsCompiling(true)
      const updatedTabs = [...examTabs]
      updatedTabs[activeTabIndex] = { ...updatedTabs[activeTabIndex], code: editorContent }
      setExamTabs(updatedTabs)

      const allQs: SlideQuestion[][] = []
      const allRB: string[][] = []
      // Combined imageMap for ALL tabs — keys are questionId-based so no conflict
      const combinedImgMap: Record<string, string> = {}

      try {
        for (let t = 0; t < updatedTabs.length; t++) {
          try {
            const { parsed, blocks, imgMap } = await parseSingleTab(updatedTabs[t].code)
            allQs.push(parsed)
            allRB.push(blocks)
            // Merge this tab's images into the combined map
            Object.assign(combinedImgMap, imgMap)
          } catch (tabErr) {
            console.warn(`Parse tab ${t} failed, using empty result:`, tabErr)
            allQs.push([])
            allRB.push([])
          }
        }
      } finally {
        setAllTabQuestions(allQs)
        setAllTabRawBlocks(allRB)
        // Use single combined imageMap for all tabs — never needs to be swapped on tab change
        setImageMap(combinedImgMap)
        // Show the first tab's questions
        setActiveTabIndex(0)
        setQuestions(allQs[0] || [])
        setRawBlocks(allRB[0] || [])
        setIsCompiling(false)
        setCreateStep(2)
      }
    } else {
      // Single-tab mode (legacy)
      const blocks = extractRawExBlocks(editorContent)
      const parsed = parseAllSlideQuestions(editorContent)
      setRawBlocks(blocks)
      setQuestions(parsed)

      // Move to Step 2 immediately — TikZ compiles in the background
      setCreateStep(2)

      const tikzJobs: { key: string; code: string }[] = []
      for (const q of parsed) {
        const collect = (segs: ContentSegment[], part: string) => {
          segs.forEach((seg, idx) => {
            if (seg.type === 'image') tikzJobs.push({ key: `${q.id}:${part}:${idx}`, code: seg.content })
          })
        }
        collect(q.bodySegments, 'body')
        if (q.choices) q.choices.forEach(c => { if (c.segments) collect(c.segments, `choice-${c.label}`) })
        if (q.tfStatements) q.tfStatements.forEach(s => { if (s.segments) collect(s.segments, `tf-${s.label}`) })
        if (q.solutionSegments) collect(q.solutionSegments, 'sol')
      }

      if (tikzJobs.length > 0) {
        setIsCompiling(true)
        try {
          // Compile one at a time — VPS dùng chung thư mục tạm, không thể chạy song song
          for (const job of tikzJobs) {
            try {
              const svg = await compileTikz(job.code)
              setImageMap(prev => ({ ...prev, [job.key]: svg }))
            } catch (e) { /* skip */ }
          }
        } finally {
          setIsCompiling(false)
        }
      }
    }
  }

  // ═══════════════════════════════════════════════════
  // TAB SWITCHING
  // ═══════════════════════════════════════════════════
  const switchTab = (newIndex: number) => {
    if (newIndex === activeTabIndex) return

    if (createStep === 1) {
      // Save current editor content to current tab
      const updatedTabs = [...examTabs]
      updatedTabs[activeTabIndex] = { ...updatedTabs[activeTabIndex], code: editorContent }
      setExamTabs(updatedTabs)
      // Load new tab's content
      setEditorContent(updatedTabs[newIndex].code)
    } else if (createStep === 2) {
      // Save current questions/rawBlocks back to the arrays
      const newAllQ = [...allTabQuestions]
      const newAllR = [...allTabRawBlocks]
      newAllQ[activeTabIndex] = questions
      newAllR[activeTabIndex] = rawBlocks
      setAllTabQuestions(newAllQ)
      setAllTabRawBlocks(newAllR)
      // Load new tab's questions & rawBlocks
      // NOTE: imageMap is a single combined map for all tabs — no need to swap it
      setQuestions(newAllQ[newIndex] || [])
      setRawBlocks(newAllR[newIndex] || [])
    }

    setActiveTabIndex(newIndex)
  }

  const handleEditRawBlock = (idx: number, newCode: string) => {
    setRawBlocks(prev => {
      const next = [...prev]
      next[idx] = newCode
      return next
    })
    try {
      const reparsedArr = parseAllSlideQuestions(newCode)
      if (reparsedArr.length > 0) {
        const reparsed = reparsedArr[0]
        const qId = questions[idx].id
        setQuestions(prev => {
          const next = [...prev]
          next[idx] = { ...next[idx], ...reparsed, id: qId }
          return next
        })
        
        const tikzJobs: { key: string; code: string }[] = []
        const collectSegs = (segs: ContentSegment[], part: string) => {
          segs.forEach((seg, i) => { if (seg.type === 'image') tikzJobs.push({ key: `${qId}:${part}:${i}`, code: seg.content }) })
        }
        collectSegs(reparsed.bodySegments, 'body')
        if (reparsed.choices) reparsed.choices.forEach(c => { if (c.segments) collectSegs(c.segments, `choice-${c.label}`) })
        if (reparsed.tfStatements) reparsed.tfStatements.forEach(s => { if (s.segments) collectSegs(s.segments, `tf-${s.label}`) })
        if (reparsed.solutionSegments) collectSegs(reparsed.solutionSegments, 'sol')
        
        for (const job of tikzJobs) {
          if (!imageMap[job.key]) {
            compileTikz(job.code).then(svg => setImageMap(prev => ({ ...prev, [job.key]: svg }))).catch(() => {})
          }
        }
      }
    } catch { /* ignore */ }
  }

  const toggleSolution = (id: string) => {
    setExpandedSolutions(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  // ═══════════════════════════════════════════════════
  // IMPORT FILE
  // ═══════════════════════════════════════════════════
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

  // ═══════════════════════════════════════════════════
  // BUILD CORRECT ANSWERS MAP (for 1 tab of questions)
  // ═══════════════════════════════════════════════════
  const buildCorrectAnswers = (): Record<string, string> => {
    const map: Record<string, string> = {}
    questions.forEach((q, idx) => {
      if (q.questionType === 'multiple_choice' && q.choices) {
        const correct = q.choices.find(c => c.isCorrect)
        if (correct) map[String(idx)] = correct.label
      } else if (q.questionType === 'true_false' && q.tfStatements) {
        map[String(idx)] = q.tfStatements.map(s => s.isTrue ? 'Đ' : 'S').join('')
      } else if (q.questionType === 'short_answer' && q.shortAnswer) {
        map[String(idx)] = q.shortAnswer
      }
    })
    return map
  }

  const buildCorrectAnswersForQuestions = (qs: SlideQuestion[]): Record<string, string> => {
    const map: Record<string, string> = {}
    qs.forEach((q, idx) => {
      if (q.questionType === 'multiple_choice' && q.choices) {
        const correct = q.choices.find(c => c.isCorrect)
        if (correct) map[String(idx)] = correct.label
      } else if (q.questionType === 'true_false' && q.tfStatements) {
        map[String(idx)] = q.tfStatements.map(s => s.isTrue ? 'Đ' : 'S').join('')
      } else if (q.questionType === 'short_answer' && q.shortAnswer) {
        map[String(idx)] = q.shortAnswer
      }
    })
    return map
  }

  // ═══════════════════════════════════════════════════
  // PUBLISH (Step 4)
  // ═══════════════════════════════════════════════════
  const handlePublish = async () => {
    if (!examTitle.trim()) { alert('Vui lòng nhập tên đề thi'); return }
    setPublishing(true)

    try {
      const scoringConfig = {
        total_score: calculateTotal(),
        mc_score_each: mcScore,
        tf_score_each: tfScore,
        sa_score_each: saScore,
        essay_score_each: essayScore,
      }

      const isMultiVariant = examTabs.length > 1 && allTabQuestions.length > 1

      let payload: Record<string, any>

      if (isMultiVariant) {
        // ── Multi-variant: 1 publish cho tất cả đề ──
        // Sync current tab's edited questions back into allTabQuestions
        const finalAllQs = [...allTabQuestions]
        finalAllQs[activeTabIndex] = questions

        const variants = finalAllQs.map((qs, tabIdx) => {
          // Filter imageMap keys for this tab's questions
          const tabImgMap: Record<string, string> = {}
          for (const key of Object.keys(imageMap)) {
            const qId = key.split(':')[0]
            if (qs.some(q => q.id === qId)) tabImgMap[key] = imageMap[key]
          }
          return {
            questions_data: qs,
            image_map: tabImgMap,
            correct_answers: buildCorrectAnswersForQuestions(qs),
          }
        })

        payload = {
          title: examTitle.trim(),
          description: examDesc.trim() || null,
          grade: examGrade || null,
          duration_minutes: examDuration || null,
          scoring_config: scoringConfig,
          variants,
        }
      } else {
        // ── Single variant (legacy) ──
        payload = {
          title: examTitle.trim(),
          description: examDesc.trim() || null,
          grade: examGrade || null,
          duration_minutes: examDuration || null,
          questions_data: questions,
          image_map: imageMap,
          scoring_config: scoringConfig,
          correct_answers: buildCorrectAnswers(),
        }
      }

      let exam: any

      if (editingExamId) {
        // Edit mode
        const res = await fetch(`/api/online-exams/${editingExamId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error || 'Lỗi cập nhật đề thi')
        }
        exam = await res.json()
      } else {
        // Create mode
        const res = await fetch('/api/online-exams', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error || 'Lỗi tạo đề thi')
        }
        exam = await res.json()

        // Xuất bản ngay
        await fetch(`/api/online-exams/${exam.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_published: true })
        })
      }

      setPublishedExam({ ...exam, is_published: true })
      setCreateStep(4)
      setEditingExamId(null)
    } catch (err: any) {
      alert('Lỗi: ' + err.message)
    }
    setPublishing(false)
  }

  // ═══════════════════════════════════════════════════
  // LOAD EXAM DETAIL
  // ═══════════════════════════════════════════════════
  const openDetail = async (exam: OnlineExam) => {
    setSelectedExam(exam)
    setLoadingDetail(true)
    setPhase('detail')

    try {
      const res = await fetch(`/api/online-exams/${exam.id}`)
      if (res.ok) {
        const data = await res.json()
        setSubmissions(data.submissions || [])
        setSelectedExam(data.exam)
      }
    } catch { /* ignore */ }
    setLoadingDetail(false)
  }

  // ═══════════════════════════════════════════════════
  // TOGGLE PUBLISH
  // ═══════════════════════════════════════════════════
  const togglePublish = async () => {
    if (!selectedExam) return
    const newVal = !selectedExam.is_published
    await fetch(`/api/online-exams/${selectedExam.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_published: newVal })
    })
    setSelectedExam(prev => prev ? { ...prev, is_published: newVal } : null)
    loadExams()
  }

  // ═══════════════════════════════════════════════════
  // DELETE EXAM
  // ═══════════════════════════════════════════════════
  const handleDeleteExam = async () => {
    if (!selectedExam) return
    if (!confirm(`Bạn có chắc chắn muốn xóa đề thi "${selectedExam.title}"? Tất cả bài nộp cũng sẽ bị xóa.`)) return

    await fetch(`/api/online-exams/${selectedExam.id}`, { method: 'DELETE' })
    setPhase('list')
    loadExams()
  }

  const handleEditExam = async () => {
    if (!selectedExam) return
    try {
      // 1. Fetch data from Next.js Proxy API (avoids Mixed Content on Vercel)
      const vpsRes = await fetch(`/api/online-exams/${selectedExam.id}/data`)
      if (!vpsRes.ok) throw new Error('Không thể tải dữ liệu đề thi từ máy chủ')
      const vpsData = await vpsRes.json()

      const fetchedQuestions: SlideQuestion[] = vpsData.questions_data || []
      const fetchedImageMap: Record<string, string> = vpsData.image_map || {}

      // 2. Reconstruct editor content
      const reconstructedContent = fetchedQuestions.map(q => q.rawLatex || '').join('\n\n')

      // 3. Set states
      setEditingExamId(selectedExam.id)
      setExamTitle(selectedExam.title)
      setExamDesc(selectedExam.description || '')
      setExamGrade(selectedExam.grade || '')
      setExamDuration(selectedExam.duration_minutes || '')
      
      const config = selectedExam.scoring_config || {}
      setMcScore(config.mc_score_each || 0.25)
      setTfScore(config.tf_score_each || 1)
      setSaScore(config.sa_score_each || 0.5)
      setEssayScore(config.essay_score_each || 1)

      setQuestions(fetchedQuestions)
      setRawBlocks(fetchedQuestions.map(q => q.rawLatex || ''))
      setImageMap(fetchedImageMap)
      setEditorContent(reconstructedContent)

      // 4. Navigate to Create Phase Step 1 (or Step 2)
      // Step 2 is more convenient as they can immediately see the result, but Step 1 allows importing. Let's go to Step 2.
      setPhase('create')
      setCreateStep(2)
      setPublishedExam(null)
    } catch (err: any) {
      alert(err.message || 'Có lỗi xảy ra khi tải dữ liệu đề thi')
    }
  }

  // ═══════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════
  const countByType = (type: string) => questions.filter(q => q.questionType === type).length
  const calculateTotal = () => {
    return Math.round((
      countByType('multiple_choice') * mcScore +
      countByType('true_false') * tfScore +
      countByType('short_answer') * saScore +
      countByType('essay') * essayScore
    ) * 100) / 100
  }

  const formatDate = (d: string) => {
    try { return new Date(d).toLocaleString('vi-VN') } catch { return d }
  }

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return `${m}p${s > 0 ? String(s).padStart(2, '0') + 's' : ''}`
  }

  const getExamLink = (code: string) => {
    if (typeof window !== 'undefined') return `${window.location.origin}/exam/${code}`
    return `/exam/${code}`
  }

  // ═══════════════════════════════════════════════════
  // RENDER: DANH SÁCH
  // ═══════════════════════════════════════════════════

  const renderList = () => (
    <>
      <Header 
        title="📋 Thi Online" 
        actions={
          <button className={styles.createBtn} onClick={() => { setPhase('create'); setCreateStep(1); setQuestions([]); setEditorContent(''); setPublishedExam(null) }}>
            ➕ Tạo đề thi mới
          </button>
        }
      />
      <div className={styles.listPhase}>

        {loadingList ? (
          <div className={styles.emptyState}>⏳ Đang tải...</div>
        ) : exams.length === 0 ? (
          <div className={styles.emptyState}>
            <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>📋</div>
            Chưa có đề thi nào. Bấm &quot;Tạo đề thi mới&quot; để bắt đầu!
          </div>
        ) : (
          <div className={styles.examTableWrapper}>
            <table className={styles.examTable}>
              <thead>
                <tr>
                  <th>Tên đề thi</th>
                  <th>Trạng thái</th>
                  <th>Cấu trúc</th>
                  <th>Thống kê</th>
                  <th>Ngày tạo</th>
                </tr>
              </thead>
              <tbody>
                {exams.map(exam => (
                  <tr key={exam.id} className={styles.examTableRow} onClick={() => openDetail(exam)}>
                    <td>
                      <div className={styles.examCardTitle} style={{ margin: 0 }}>{exam.title}</div>
                    </td>
                    <td>
                      <span className={`${styles.metaBadge} ${exam.is_published ? styles.metaPublished : styles.metaDraft}`}>
                        {exam.is_published ? '✅ Đã xuất bản' : '📝 Bản nháp'}
                      </span>
                    </td>
                    <td>
                      <div className={styles.examCardMeta} style={{ margin: 0 }}>
                        <span className={styles.metaBadge}>{exam.total_questions} câu</span>
                        {exam.grade && <span className={styles.metaBadge}>Lớp {exam.grade}</span>}
                      </div>
                    </td>
                    <td>
                      <div className={styles.examCardStats} style={{ margin: 0 }}>
                        <span>👥 {exam.submission_count} bài nộp</span>
                        <span>🔑 {exam.access_code}</span>
                      </div>
                    </td>
                    <td>
                      <div className={styles.examCardDate} style={{ margin: 0 }}>{formatDate(exam.created_at)}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )

  // ═══════════════════════════════════════════════════
  // RENDER: TẠO ĐỀ THI
  // ═══════════════════════════════════════════════════

  const renderCreate = () => (
    <>
      <Header title="📋 Tạo đề thi online" />
      <div className={styles.createPhase}>
        {/* Back button */}
        <button
          onClick={() => { setPhase('list'); loadExams() }}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            background: 'none', border: 'none', color: '#64748b',
            fontSize: '0.9rem', cursor: 'pointer', padding: '4px 0',
            marginBottom: '0.75rem', fontWeight: 500,
          }}
        >
          ← Quay lại danh sách
        </button>

        {/* Step Bar */}
        <div className={styles.stepBar}>
          {['1. Nhập code', '2. Xem câu hỏi', '3. Cấu hình', '4. Xuất bản'].map((label, i) => (
            <div key={i} className={`${styles.stepItem} ${createStep === i + 1 ? styles.stepItemActive : createStep > i + 1 ? styles.stepItemDone : ''}`}>
              {label}
            </div>
          ))}
        </div>

        {/* Step 1: Input */}
        {createStep === 1 && (
          <div className={styles.stepContent}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
              <div>
                <h3 style={{ margin: '0 0 0.2rem', color: '#1e293b' }}>📝 Nhập code LaTeX</h3>
                <p style={{ color: '#64748b', fontSize: '0.85rem', margin: 0 }}>
                  Paste code LaTeX chứa các câu hỏi <code>\begin{'{ex}'}</code>...<code>\end{'{ex}'}</code> vào đây, hoặc import từ file .tex
                </p>
              </div>
              <button
                onClick={() => {
                  // Save current content to current tab first
                  const newLabel = `Đề ${examTabs.length > 0 ? examTabs.length + 1 : 2}`
                  if (examTabs.length === 0) {
                    // Convert from single-mode to multi-tab
                    const tab1: { label: string; code: string } = { label: 'Đề 1', code: editorContent }
                    const tab2: { label: string; code: string } = { label: 'Đề 2', code: '' }
                    setExamTabs([tab1, tab2])
                    setActiveTabIndex(1)
                    setEditorContent('')
                  } else {
                    // Already multi-tab — save current then add new
                    const updated = [...examTabs]
                    updated[activeTabIndex] = { ...updated[activeTabIndex], code: editorContent }
                    const newTab: { label: string; code: string } = { label: newLabel, code: '' }
                    setExamTabs([...updated, newTab])
                    setActiveTabIndex(updated.length)
                    setEditorContent('')
                  }
                }}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '5px',
                  background: '#8b5cf6', color: '#fff', border: 'none',
                  borderRadius: '8px', padding: '7px 14px', fontSize: '0.85rem',
                  fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                }}
              >
                ➕ Thêm đề
              </button>
            </div>

            {/* Tab bar — shown when multi-tab */}
            {examTabs.length > 1 && (
              <div className={styles.tabBar}>
                {examTabs.map((tab, idx) => (
                  <div key={idx} style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                    <button
                      className={`${styles.tabBtn} ${idx === activeTabIndex ? styles.tabBtnActive : ''}`}
                      onClick={() => switchTab(idx)}
                    >
                      {tab.label}
                    </button>
                    {examTabs.length > 1 && (
                      <button
                        title={`Xóa ${tab.label}`}
                        onClick={() => {
                          // Save current content
                          const updated = [...examTabs]
                          updated[activeTabIndex] = { ...updated[activeTabIndex], code: editorContent }
                          const newTabs = updated.filter((_, i) => i !== idx)
                          // Re-label tabs
                          const relabeled = newTabs.map((t, i) => ({ ...t, label: `Đề ${i + 1}` }))
                          const newActive = Math.min(activeTabIndex, relabeled.length - 1)
                          setExamTabs(relabeled)
                          setActiveTabIndex(newActive)
                          setEditorContent(relabeled[newActive]?.code || '')
                          // If only 1 left, revert to single mode
                          if (relabeled.length === 1) {
                            setExamTabs([])
                            setEditorContent(relabeled[0].code || '')
                          }
                        }}
                        style={{
                          background: 'none', border: 'none', color: '#ef4444',
                          cursor: 'pointer', fontSize: '0.9rem', padding: '2px 4px',
                          lineHeight: 1, borderRadius: '4px',
                        }}
                      >×</button>
                    )}
                  </div>
                ))}
              </div>
            )}

            <textarea
              className={styles.inputTextarea}
              value={editorContent}
              onChange={e => setEditorContent(e.target.value)}
              placeholder={`Paste code LaTeX câu hỏi vào đây...\n\n\\begin{ex}\n\tCâu hỏi...\n\t\\choice\n\t{A}{\\True B}{C}{D}\n\t\\loigiai{...}\n\\end{ex}`}
              spellCheck={false}
            />
            <div className={styles.inputActions}>
              <button className={styles.importBtn} onClick={() => fileInputRef.current?.click()}>📁 Import file .tex</button>
              <input ref={fileInputRef} type="file" accept=".tex,.txt" style={{ display: 'none' }} onChange={handleImportFile} />
              <button className={styles.parseBtn} onClick={handleParse} disabled={!editorContent.trim()}>
                {examTabs.length > 1 ? `⚡ Parse tất cả ${examTabs.length} đề` : '⚡ Parse câu hỏi'}
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Review parsed questions */}
        {createStep === 2 && (
          <div className={styles.stepContent}>
            <h3 style={{ margin: '0 0 0.8rem', color: '#1e293b' }}>
              📋 {questions.length} câu hỏi đã parse
              {isCompiling && <span style={{ color: '#3b82f6', fontWeight: 400, fontSize: '0.85rem' }}> — ⏳ Đang biên dịch hình...</span>}
            </h3>

            {/* Tab bar for multi-exam mode in Step 2 */}
            {examTabs.length > 1 && allTabQuestions.length > 1 && (
              <div className={styles.tabBar}>
                {examTabs.map((tab, idx) => (
                  <button
                    key={idx}
                    className={`${styles.tabBtn} ${idx === activeTabIndex ? styles.tabBtnActive : ''}`}
                    onClick={() => switchTab(idx)}
                  >
                    {tab.label} ({allTabQuestions[idx]?.length || 0} câu)
                  </button>
                ))}
              </div>
            )}

            <div className={styles.reviewList}>
              {questions.map((q, idx) => (
                <div key={q.id} className={styles.reviewRow}>
                  {/* Left: Raw LaTeX */}
                  <div className={styles.rawColumn}>
                    <div className={styles.rawHeader}>
                      <span className={styles.rawNum}>Câu {idx + 1}</span>
                      <button className={styles.rawDelete} onClick={() => setQuestions(prev => prev.filter((_, i) => i !== idx))} title="Xóa câu">✕</button>
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

                    <div className={styles.previewBody}>
                      <RenderedSegments segments={q.bodySegments} questionId={q.id} part="body" imageMap={imageMap} />
                    </div>

                    {q.questionType === 'multiple_choice' && q.choices && (
                      <div className={styles.previewChoices}>
                        {q.choices.map(c => (
                          <div key={c.label} className={`${styles.previewChoice} ${c.isCorrect ? styles.previewCorrect : ''}`}>
                            <strong>{c.label}.</strong>
                            <div className={styles.previewChoiceText}>
                              <RenderedSegments segments={c.segments || [{type: 'text', content: c.content}]} questionId={q.id} part={`choice-${c.label}`} imageMap={imageMap} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {q.questionType === 'true_false' && q.tfStatements && (
                      <div className={styles.previewChoices}>
                        {q.tfStatements.map(s => (
                          <div key={s.label} className={`${styles.previewChoice} ${s.isTrue ? styles.previewCorrect : ''}`}>
                            <strong>{s.label})</strong>
                            <div className={styles.previewChoiceText}>
                              <RenderedSegments segments={s.segments || [{type: 'text', content: s.content}]} questionId={q.id} part={`tf-${s.label}`} imageMap={imageMap} />
                            </div>
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

                    {q.solutionSegments && q.solutionSegments.length > 0 && (
                      <div className={styles.previewSolutionWrap}>
                        <button className={styles.previewSolutionToggle} onClick={() => toggleSolution(q.id)}>
                          {expandedSolutions.has(q.id) ? '▾' : '▸'} Lời giải
                        </button>
                        {expandedSolutions.has(q.id) && (
                          <div className={styles.previewSolutionBody}>
                            <RenderedSegments segments={q.solutionSegments} questionId={q.id} part="sol" imageMap={imageMap} />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className={styles.navActions}>
              <button className={styles.backBtn} onClick={() => setCreateStep(1)}>← Quay lại</button>
              <button className={styles.nextBtn} onClick={() => setCreateStep(3)} disabled={questions.length === 0}>Tiếp theo →</button>
            </div>
          </div>
        )}

        {/* Step 3: Config */}
        {createStep === 3 && (
          <div className={styles.stepContent}>
            <h3 style={{ margin: '0 0 1rem', color: '#1e293b' }}>⚙️ Cấu hình đề thi</h3>

            <div className={styles.configSection}>
              <label className={styles.configLabel}>Tên đề thi *</label>
              <input className={styles.configInput} value={examTitle} onChange={e => setExamTitle(e.target.value)} placeholder="VD: Kiểm tra giữa kỳ - Toán 12" />
            </div>

            <div className={styles.configSection}>
              <label className={styles.configLabel}>Mô tả (tùy chọn)</label>
              <input className={styles.configInput} value={examDesc} onChange={e => setExamDesc(e.target.value)} placeholder="VD: Đề kiểm tra 45 phút, chương 1-3" />
            </div>

            <div className={styles.configRow}>
              <div className={styles.configSection}>
                <label className={styles.configLabel}>Lớp</label>
                <select className={styles.configInput} value={examGrade} onChange={e => setExamGrade(e.target.value ? Number(e.target.value) : '')}>
                  <option value="">-- Chọn --</option>
                  <option value={10}>Lớp 10</option>
                  <option value={11}>Lớp 11</option>
                  <option value={12}>Lớp 12</option>
                </select>
              </div>
              <div className={styles.configSection}>
                <label className={styles.configLabel}>Thời gian (phút)</label>
                <input className={styles.configInput} type="number" value={examDuration} onChange={e => setExamDuration(e.target.value ? Number(e.target.value) : '')} placeholder="VD: 45 (bỏ trống = không giới hạn)" />
              </div>
            </div>

            {/* Scoring */}
            <div className={styles.configSection}>
              <label className={styles.configLabel}>Phân bổ điểm</label>
              <table className={styles.scoringTable}>
                <thead>
                  <tr>
                    <th>Loại câu</th>
                    <th>Số câu</th>
                    <th>Điểm / câu</th>
                    <th>Tổng</th>
                  </tr>
                </thead>
                <tbody>
                  {countByType('multiple_choice') > 0 && (
                    <tr>
                      <td>⏺ Trắc nghiệm</td>
                      <td>{countByType('multiple_choice')}</td>
                      <td><input className={styles.scoringInput} type="number" step="0.01" value={mcScore} onChange={e => setMcScore(Number(e.target.value))} /></td>
                      <td>{Math.round(countByType('multiple_choice') * mcScore * 100) / 100}</td>
                    </tr>
                  )}
                  {countByType('true_false') > 0 && (
                    <tr>
                      <td>☑ Đúng/Sai</td>
                      <td>{countByType('true_false')}</td>
                      <td><input className={styles.scoringInput} type="number" step="0.01" value={tfScore} onChange={e => setTfScore(Number(e.target.value))} /></td>
                      <td>{Math.round(countByType('true_false') * tfScore * 100) / 100}</td>
                    </tr>
                  )}
                  {countByType('short_answer') > 0 && (
                    <tr>
                      <td>✍ Trả lời ngắn</td>
                      <td>{countByType('short_answer')}</td>
                      <td><input className={styles.scoringInput} type="number" step="0.01" value={saScore} onChange={e => setSaScore(Number(e.target.value))} /></td>
                      <td>{Math.round(countByType('short_answer') * saScore * 100) / 100}</td>
                    </tr>
                  )}
                  {countByType('essay') > 0 && (
                    <tr>
                      <td>📝 Tự luận</td>
                      <td>{countByType('essay')}</td>
                      <td><input className={styles.scoringInput} type="number" step="0.01" value={essayScore} onChange={e => setEssayScore(Number(e.target.value))} /></td>
                      <td>{Math.round(countByType('essay') * essayScore * 100) / 100}</td>
                    </tr>
                  )}
                  <tr className={styles.totalScoreRow}>
                    <td colSpan={3}>TỔNG ĐIỂM</td>
                    <td>{calculateTotal()}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className={styles.navActions}>
              <button className={styles.backBtn} onClick={() => setCreateStep(2)}>← Quay lại</button>
              <button className={styles.publishBtn} onClick={handlePublish} disabled={publishing}>
                {publishing ? '⏳ Đang xuất bản...' : '🚀 Xuất bản đề thi'}
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Published */}
        {createStep === 4 && publishedExam && (
          <div className={styles.stepContent}>
            <div className={styles.publishSuccess}>
              <div className={styles.publishIcon}>🎉</div>
              <h2 className={styles.publishTitle}>Đề thi đã được xuất bản!</h2>
              <p style={{ color: '#64748b', marginBottom: '0.5rem' }}>{publishedExam.title}</p>

              <div style={{ marginBottom: '0.5rem', color: '#64748b', fontSize: '0.85rem' }}>Mã truy cập:</div>
              <div className={styles.accessCodeBox}>
                <span className={styles.accessCodeText}>{publishedExam.access_code}</span>
                <button className={styles.copyBtn} onClick={() => { navigator.clipboard.writeText(publishedExam.access_code); alert('Đã copy!') }}>📋 Copy</button>
              </div>

              <div style={{ marginTop: '0.5rem', color: '#64748b', fontSize: '0.85rem' }}>Link gửi cho học sinh:</div>
              <div className={styles.linkBox}>
                {getExamLink(publishedExam.access_code)}
              </div>
              <button className={styles.copyBtn} style={{ marginBottom: '1rem' }} onClick={() => { navigator.clipboard.writeText(getExamLink(publishedExam.access_code)); alert('Đã copy link!') }}>📋 Copy link</button>

              {/* Multi-variant info */}
              {(publishedExam.variant_count ?? 1) > 1 && (
                <div style={{ marginTop: '1.5rem', padding: '1rem', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #86efac' }}>
                  <p style={{ color: '#15803d', fontWeight: 600, marginBottom: '0.25rem' }}>
                    ✅ Đề thi có {publishedExam.variant_count} mã đề
                  </p>
                  <p style={{ color: '#166534', fontSize: '0.85rem', margin: 0 }}>
                    Học sinh vào cùng 1 link sẽ được ngẫu nhiên làm {publishedExam.variant_count === 2 ? 'Đề 1 hoặc Đề 2' : `một trong ${publishedExam.variant_count} đề`}.
                    Giáo viên có thể xem học sinh làm đề nào trong trang thống kê.
                  </p>
                </div>
              )}

              <div style={{ marginTop: '1.5rem' }}>
                <button className={styles.nextBtn} onClick={() => { setPhase('list'); loadExams() }}>← Về danh sách đề thi</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )

  // ═══════════════════════════════════════════════════
  // RENDER: CHI TIẾT ĐỀ THI
  // ═══════════════════════════════════════════════════

  const renderDetail = () => {
    if (!selectedExam) return null
    const avgScore = submissions.length > 0
      ? Math.round((submissions.reduce((s, sub) => s + (sub.score || 0), 0) / submissions.length) * 100) / 100
      : 0

    const formatChoice = (ans: any, type: string) => {
      if (!ans) return '—'
      if (type === 'true_false' && typeof ans === 'object') {
        const labels = ['a', 'b', 'c', 'd']
        return labels.map(l => ans[l] || '—').join(', ')
      }
      return ans
    }
    
    const formatTFCorrect = (ans: any) => {
      if (!ans) return '—'
      const labels = ['a', 'b', 'c', 'd']
      // For correct_answer of True/False, it's a string like "ĐSĐS"
      if (typeof ans === 'string') {
        return ans.split('').join(', ')
      }
      return ans
    }

    return (
      <>
        <Header title="📋 Chi tiết đề thi" />
        <div className={styles.detailPhase}>
          <div className={styles.detailHeader}>
            <button className={styles.backBtn} onClick={() => { setPhase('list'); loadExams() }}>← Quay lại</button>
            <div className={styles.detailActions}>
              <button
                className={`${styles.detailToggle} ${selectedExam.is_published ? styles.detailToggleActive : ''}`}
                onClick={togglePublish}
              >
                {selectedExam.is_published ? '✅ Đang mở' : '⏸ Đã đóng'}
              </button>
              <button className={styles.importBtn} style={{ padding: '0.4rem 0.8rem', marginLeft: '0.5rem' }} onClick={handleEditExam}>
                ✏️ Sửa đề thi
              </button>
              <button className={styles.deleteBtn} onClick={handleDeleteExam}>🗑️ Xóa</button>
            </div>
          </div>

          <h2 className={styles.detailTitle}>{selectedExam.title}</h2>

          <div style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: '1rem' }}>
            🔑 Mã: <strong>{selectedExam.access_code}</strong>
            &nbsp;&nbsp;|&nbsp;&nbsp;
            📋 {selectedExam.total_questions} câu
            {selectedExam.duration_minutes && <>&nbsp;&nbsp;|&nbsp;&nbsp;⏱️ {selectedExam.duration_minutes} phút</>}
            &nbsp;&nbsp;|&nbsp;&nbsp;
            🔗 <a href={getExamLink(selectedExam.access_code)} target="_blank" rel="noopener noreferrer" style={{ color: '#3b82f6' }}>
              Mở link thi
            </a>
          </div>

          {/* Stats */}
          <div className={styles.statsGrid}>
            <div className={styles.statCard}>
              <div className={styles.statNum}>{submissions.length}</div>
              <div className={styles.statLabel}>Bài nộp</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statNum}>{avgScore}</div>
              <div className={styles.statLabel}>Điểm TB</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statNum}>
                {submissions.length > 0 ? Math.max(...submissions.map(s => s.score || 0)) : 0}
              </div>
              <div className={styles.statLabel}>Điểm cao nhất</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statNum}>
                {submissions.length > 0 ? Math.min(...submissions.map(s => s.score || 0)) : 0}
              </div>
              <div className={styles.statLabel}>Điểm thấp nhất</div>
            </div>
          </div>

          {/* Submissions Table */}
          {loadingDetail ? (
            <div className={styles.emptyState}>⏳ Đang tải...</div>
          ) : submissions.length === 0 ? (
            <div className={styles.emptyState}>Chưa có học sinh nào nộp bài</div>
          ) : (
            <table className={styles.submissionTable}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Họ tên</th>
                  <th>SBD</th>
            {(selectedExam.variant_count ?? 1) > 1 && <th>Mã đề</th>}
                  <th>Điểm</th>
                  <th>Thời gian</th>
                  <th>Nộp lúc</th>
                </tr>
              </thead>
              <tbody>
                {submissions.map((sub, idx) => (
                  <tr key={sub.id} style={{ cursor: 'pointer' }} onClick={() => setSelectedSubmission(sub)} className={styles.submissionRowHover}>
                    <td>{idx + 1}</td>
                    <td style={{ fontWeight: 600 }}>{sub.student_name}</td>
                    <td>{sub.student_code}</td>
                    {(selectedExam.variant_count ?? 1) > 1 && (
                      <td>
                        <span style={{ background: '#8b5cf6', color: '#fff', padding: '2px 8px', borderRadius: '10px', fontSize: '0.78rem', fontWeight: 600 }}>
                          Đề {(sub.variant_index ?? 0) + 1}
                        </span>
                      </td>
                    )}
                    <td style={{ fontWeight: 700, color: sub.score !== null && sub.score >= (avgScore || 5) ? '#10b981' : '#ef4444' }}>
                      {sub.score !== null ? sub.score : '-'}
                    </td>
                    <td>{sub.time_spent_seconds ? formatDuration(sub.time_spent_seconds) : '—'}</td>
                    <td>{sub.submitted_at ? formatDate(sub.submitted_at) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Result Modal */}
          {selectedSubmission && (
            <div className={styles.modalOverlay} onClick={() => setSelectedSubmission(null)}>
              <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
                <button className={styles.closeModalBtn} onClick={() => setSelectedSubmission(null)}>×</button>
                <h3 style={{ textAlign: 'center', marginBottom: '0.5rem' }}>Chi tiết kết quả</h3>
                <p style={{ textAlign: 'center', color: '#64748b', marginBottom: '1.5rem', fontWeight: 600 }}>
                  {selectedSubmission.student_name} ({selectedSubmission.student_code})
                </p>
                
                <div className={styles.resultHeader}>
                  <div className={styles.scoreBigText}>{selectedSubmission.score}/{selectedExam.scoring_config?.total_score || 10}</div>
                  <div className={styles.scoreSubText}>điểm</div>
                </div>

                <div className={styles.resultDetails}>
                  {(selectedSubmission.detail_results || []).map((r, i) => {
                    const isEssay = r.type === 'essay'
                    let userStr = formatChoice(r.student_answer, r.type)
                    let correctStr = r.type === 'true_false' ? formatTFCorrect(r.correct_answer) : formatChoice(r.correct_answer, r.type)
                    
                    if (r.type === 'short_answer') {
                      userStr = `Trả lời: ${userStr || '—'}`
                      correctStr = `Đáp án: ${correctStr}`
                    } else {
                      userStr = `Chọn: ${userStr || '—'}`
                      correctStr = `Đáp án: ${correctStr}`
                    }

                    if (r.type === 'true_false' && r.tf_total) {
                      correctStr += ` (${r.tf_correct_count || 0}/${r.tf_total} đúng)`
                    }

                    const badgeClass = isEssay ? styles.badgePending : (r.score_earned > 0 ? styles.badgeCorrect : styles.badgeWrong)

                    return (
                      <div key={i} className={styles.resultRow}>
                        <div className={`${styles.resultBadge} ${badgeClass}`}>{i + 1}</div>
                        <div className={styles.resultContent}>
                          {isEssay ? (
                            <span style={{ color: '#d97706' }}>Câu tự luận chờ chấm điểm</span>
                          ) : (
                            <>{userStr} | {correctStr}</>
                          )}
                        </div>
                        <div className={`${styles.resultScore} ${r.score_earned > 0 ? styles.scoreCorrect : (isEssay ? '' : styles.scoreWrong)}`}>
                          {isEssay ? '0đ' : `${r.score_earned > 0 ? '+' : ''}${r.score_earned}đ`}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </>
    )
  }

  // ═══════════════════════════════════════════════════
  if (phase === 'detail') return renderDetail()
  if (phase === 'create') return renderCreate()
  return renderList()
}
