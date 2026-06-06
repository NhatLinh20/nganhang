// src/app/(dashboard)/admin/courses/CoursesManagerClient.tsx
// Client component — Bảng quản lý khóa học
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { deleteCourse, toggleCoursePublished } from '@/app/actions/course-actions'
import type { Course } from '@/app/actions/course-queries'
import styles from './courses-manager.module.css'

interface Props {
  initialCourses: Course[]
}

export default function CoursesManagerClient({ initialCourses }: Props) {
  const router = useRouter()
  const [courses, setCourses] = useState(initialCourses)
  const [deleteTarget, setDeleteTarget] = useState<Course | null>(null)
  const [deleting, setDeleting] = useState(false)

  const handleToggle = async (courseId: string) => {
    const result = await toggleCoursePublished(courseId)
    if (!result.error) {
      setCourses(prev =>
        prev.map(c => c.id === courseId ? { ...c, is_published: !c.is_published } : c)
      )
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    const result = await deleteCourse(deleteTarget.id)
    if (!result.error) {
      setCourses(prev => prev.filter(c => c.id !== deleteTarget.id))
    }
    setDeleteTarget(null)
    setDeleting(false)
  }

  return (
    <div style={{ padding: 'var(--space-8)' }}>
      {/* Header */}
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Quản lý khóa học</h1>
          <p className={styles.pageSubtitle}>Thêm, sửa, xóa và quản lý các khóa học trên hệ thống.</p>
        </div>
        <Link href="/admin/courses/create" className={styles.createBtn}>
          + Tạo khóa mới
        </Link>
      </div>

      {/* Table */}
      {courses.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>📚</div>
          <p className={styles.emptyText}>Chưa có khóa học nào. Hãy tạo khóa học đầu tiên!</p>
        </div>
      ) : (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Khóa học</th>
                <th>Phân loại</th>
                <th>Số bài</th>
                <th>Trạng thái</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {courses.map((course) => (
                <tr key={course.id}>
                  <td>
                    <div className={styles.courseNameCell}>
                      <span className={styles.courseName}>{course.title}</span>
                      <span className={styles.courseSubtext}>
                        {course.teacher_name || 'Chưa có giáo viên'}
                      </span>
                    </div>
                  </td>
                  <td>
                    <span className={styles.gradeBadge}>
                      Lớp {course.grade}
                    </span>
                  </td>
                  <td>{course.total_lessons || 0}</td>
                  <td>
                    {course.is_published ? (
                      <span className={styles.statusPublished}>● Đang mở</span>
                    ) : (
                      <span className={styles.statusDraft}>● Đang khóa</span>
                    )}
                  </td>
                  <td>
                    <div className={styles.actionGroup}>
                      <button
                        className={styles.toggleBtn}
                        onClick={() => handleToggle(course.id)}
                        title={course.is_published ? 'Khóa' : 'Mở'}
                      >
                        {course.is_published ? '🔒 Khóa' : '🔓 Mở'}
                      </button>
                      <Link
                        href={`/admin/courses/${course.id}/edit`}
                        className={styles.actionBtn}
                        title="Sửa"
                      >
                        ✏️
                      </Link>
                      <button
                        className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                        onClick={() => setDeleteTarget(course)}
                        title="Xóa"
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

      {/* Delete Modal */}
      {deleteTarget && (
        <div className={styles.modalOverlay} onClick={() => setDeleteTarget(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalIcon}>⚠️</div>
            <h3 className={styles.modalTitle}>Xóa khóa học?</h3>
            <p className={styles.modalDesc}>
              Bạn có chắc muốn xóa <strong>{deleteTarget.title}</strong>?
              Tất cả chương và bài học trong khóa này sẽ bị xóa vĩnh viễn.
            </p>
            <div className={styles.modalActions}>
              <button
                className={styles.modalCancelBtn}
                onClick={() => setDeleteTarget(null)}
              >
                Hủy
              </button>
              <button
                className={styles.modalDeleteBtn}
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? 'Đang xóa...' : 'Xóa'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
