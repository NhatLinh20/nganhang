// src/app/(dashboard)/student/practice/page.tsx
// Trang danh sách đề thi luyện tập — Student
'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import styles from './practice.module.css'

interface PracticeExam {
  id: string
  title: string
  exam_type: string
  grade: number
  duration_minutes: number
  total_questions: number
  total_score: number
  pdf_url: string | null
  is_published: boolean
  created_at: string
}

const GRADES = [6, 7, 8, 9, 10, 11, 12]

export default function PracticeListPage() {
  const router = useRouter()
  const [exams, setExams] = useState<PracticeExam[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedGrade, setSelectedGrade] = useState<number | null>(null)
  const [selectedType, setSelectedType] = useState('all')

  useEffect(() => {
    async function fetchExams() {
      try {
        const res = await fetch('/api/practice-exams?published_only=true')
        const data = await res.json()
        setExams(data.data || [])
      } catch (err) {
        console.error('Fetch exams error:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchExams()
  }, [])

  const filteredExams = useMemo(() => {
    return exams.filter(e => {
      if (selectedGrade && e.grade !== selectedGrade) return false
      if (selectedType !== 'all' && e.exam_type !== selectedType) return false
      if (search && !e.title.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [exams, selectedGrade, selectedType, search])

  const examTypes = useMemo(() => {
    const types = new Set(exams.map(e => e.exam_type))
    return Array.from(types)
  }, [exams])

  if (loading) {
    return (
      <div className={styles.listPage}>
        <div className={styles.loading}>
          <span className={styles.spinner} /> Đang tải đề thi...
        </div>
      </div>
    )
  }

  return (
    <div className={styles.listPage}>
      <div className={styles.listHeader}>
        <h1 className={styles.listTitle}>📝 Luyện thi</h1>
      </div>

      {/* Filter Bar */}
      <div className={styles.filterBar}>
        <input
          type="text"
          className={styles.searchInput}
          placeholder="Tìm đề thi..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        
        <select
          className={styles.filterSelect}
          value={selectedType}
          onChange={e => setSelectedType(e.target.value)}
        >
          <option value="all">Tất cả loại đề thi</option>
          {examTypes.map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>

        <div className={styles.gradeFilter}>
          {GRADES.map(g => (
            <button
              key={g}
              className={`${styles.gradeBtn} ${selectedGrade === g ? styles.gradeBtnActive : ''}`}
              onClick={() => setSelectedGrade(selectedGrade === g ? null : g)}
            >
              Lớp {g}
            </button>
          ))}
        </div>
      </div>

      {/* Exam Count */}
      <div className={styles.examCount}>
        {filteredExams.length} đề thi
      </div>

      {/* Exam Cards */}
      {filteredExams.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>📝</div>
          <p>Không tìm thấy đề thi nào</p>
        </div>
      ) : (
        filteredExams.map(exam => (
          <div key={exam.id} className={styles.examCard}>
            <div className={styles.examCardInfo}>
              <div className={styles.examCardBadges}>
                <span className={styles.badgeGrade}>LỚP {exam.grade}</span>
                <span className={styles.badgeType}>{exam.exam_type}</span>
                {exam.pdf_url && <span className={styles.badgePdf}>📄 PDF</span>}
              </div>
              <div className={styles.examCardTitle}>{exam.title}</div>
            </div>
            
            <div className={styles.examCardMeta}>
              <span className={styles.metaItem}>📋 {exam.total_questions} CÂU</span>
              <span className={styles.metaItem}>⏱ {exam.duration_minutes} PHÚT</span>
            </div>

            <button
              className={styles.startBtn}
              onClick={() => router.push(`/student/practice/${exam.id}`)}
            >
              Bắt đầu &gt;
            </button>
          </div>
        ))
      )}
    </div>
  )
}
