// src/app/(dashboard)/admin/practice-exams/page.tsx
// Trang danh sách đề thi luyện tập — Admin
'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import styles from './practiceExamAdmin.module.css'

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

export default function PracticeExamsListPage() {
  const router = useRouter()
  const [exams, setExams] = useState<PracticeExam[]>([])
  const [loading, setLoading] = useState(true)

  const fetchExams = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/practice-exams')
      const data = await res.json()
      setExams(data.data || [])
    } catch (err) {
      console.error('Fetch exams error:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchExams() }, [fetchExams])

  const handleTogglePublish = async (exam: PracticeExam) => {
    try {
      const res = await fetch(`/api/practice-exams/${exam.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_published: !exam.is_published }),
      })
      if (res.ok) {
        setExams(prev => prev.map(e =>
          e.id === exam.id ? { ...e, is_published: !e.is_published } : e
        ))
      }
    } catch (err) {
      console.error('Toggle publish error:', err)
    }
  }

  const handleDelete = async (exam: PracticeExam) => {
    if (!confirm(`Bạn có chắc muốn xóa đề "${exam.title}"?`)) return
    try {
      const res = await fetch(`/api/practice-exams/${exam.id}`, { method: 'DELETE' })
      if (res.ok) {
        setExams(prev => prev.filter(e => e.id !== exam.id))
      } else {
        const data = await res.json()
        alert('Lỗi xóa: ' + (data.error || 'Unknown'))
      }
    } catch (err) {
      console.error('Delete error:', err)
    }
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('vi-VN', {
      day: '2-digit', month: '2-digit', year: 'numeric'
    })
  }

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>🏋️ Đề thi luyện tập</h1>
          <p className={styles.pageSubtitle}>Quản lý đề thi luyện tập cho học sinh — upload PDF, cấu hình đáp án</p>
        </div>
        <button className={styles.btnPrimary} onClick={() => router.push('/admin/practice-exams/create')}>
          + Tạo đề mới
        </button>
      </div>

      {loading ? (
        <div className={styles.loading}>
          <span className={styles.spinner} /> Đang tải...
        </div>
      ) : exams.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>📝</div>
          <div className={styles.emptyText}>Chưa có đề thi nào</div>
          <div className={styles.emptyHint}>Nhấn &quot;Tạo đề mới&quot; để bắt đầu</div>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className={styles.examTable}>
            <thead>
              <tr>
                <th>Tên đề thi</th>
                <th>Lớp</th>
                <th>Loại</th>
                <th>Số câu</th>
                <th>Điểm</th>
                <th>Thời gian</th>
                <th>Trạng thái</th>
                <th>Ngày tạo</th>
                <th>Hành động</th>
              </tr>
            </thead>
            <tbody>
              {exams.map(exam => (
                <tr key={exam.id}>
                  <td style={{ fontWeight: 600, maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {exam.title}
                  </td>
                  <td>
                    <span className={styles.gradeBadge}>Lớp {exam.grade}</span>
                  </td>
                  <td style={{ fontSize: '13px' }}>{exam.exam_type}</td>
                  <td>{exam.total_questions}</td>
                  <td>{exam.total_score}</td>
                  <td>{exam.duration_minutes} phút</td>
                  <td>
                    <span className={`${styles.statusBadge} ${exam.is_published ? styles.statusPublished : styles.statusDraft}`}>
                      {exam.is_published ? '✅ Đã xuất bản' : '📝 Bản nháp'}
                    </span>
                  </td>
                  <td style={{ fontSize: '13px', color: '#9ca3af' }}>{formatDate(exam.created_at)}</td>
                  <td>
                    <div className={styles.actions}>
                      <button
                        className={styles.actionBtn}
                        title={exam.is_published ? 'Ẩn đề' : 'Xuất bản'}
                        onClick={() => handleTogglePublish(exam)}
                      >
                        {exam.is_published ? '🔒' : '🚀'}
                      </button>
                      <button
                        className={styles.actionBtn}
                        title="Chỉnh sửa"
                        onClick={() => router.push(`/admin/practice-exams/${exam.id}/edit`)}
                      >
                        ✏️
                      </button>
                      {exam.pdf_url && (
                        <button
                          className={styles.actionBtn}
                          title="Xem PDF"
                          onClick={() => window.open(exam.pdf_url!, '_blank')}
                        >
                          📄
                        </button>
                      )}
                      <button
                        className={styles.actionBtn}
                        title="Xóa"
                        onClick={() => handleDelete(exam)}
                        style={{ color: '#dc2626' }}
                      >
                        🗑️
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
