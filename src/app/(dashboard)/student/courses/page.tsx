// src/app/(dashboard)/student/courses/page.tsx
// Trang Danh sách Khóa học cho Học sinh
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getProfile } from '@/lib/supabase/roles'
import { getCourses } from '@/app/actions/course-queries'
import styles from './courses.module.css'

export const metadata = {
  title: 'Khóa học - Ngân Hàng Toán',
  description: 'Khám phá các khóa học Toán từ lớp 6 đến lớp 12',
}

const gradeEmojis: Record<number, string> = {
  6: '🔢', 7: '📐', 8: '📏', 9: '📊', 10: '📈', 11: '🧮', 12: '🎯',
}

export default async function CoursesPage() {
  const profile = await getProfile()

  // Chỉ Student và Admin được vào
  if (profile && profile.role !== 'student' && profile.role !== 'admin') {
    redirect('/dashboard')
  }

  const isAdmin = profile?.role === 'admin'
  const courses = await getCourses(isAdmin) // Admin thấy cả unpublished

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Khám phá Khóa học của bạn</h1>
        <p className={styles.subtitle}>
          Chinh phục kiến thức môn Toán từ lớp 6 đến lớp 12 với lộ trình học tập thông minh
          và các bài giảng trực quan được thiết kế dành riêng cho bạn.
        </p>
      </header>

      {courses.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>📚</div>
          <h2 className={styles.emptyTitle}>Chưa có khóa học nào</h2>
          <p className={styles.emptyDesc}>Các khóa học đang được chuẩn bị. Hãy quay lại sau nhé!</p>
        </div>
      ) : (
        <div className={styles.courseGrid}>
          {courses.map((course) => {
            const isLocked = !course.is_published
            const gradeClass = `grade${course.grade}` as keyof typeof styles
            const cardClassName = `${styles.courseCard} ${isLocked ? styles.courseCardLocked : ''} ${styles[gradeClass] || ''}`

            const CardContent = (
              <>
                {/* Thumbnail */}
                <div className={styles.thumbnailWrapper}>
                  {course.thumbnail_url ? (
                    <img
                      src={course.thumbnail_url}
                      alt={course.title}
                      className={styles.thumbnailImage}
                    />
                  ) : (
                    <div className={styles.thumbnailPlaceholder}>
                      {gradeEmojis[course.grade] || '📚'}
                    </div>
                  )}
                  <div className={styles.gradeIcon}>{course.grade}</div>
                  {isLocked && (
                    <div className={styles.lockedBadge}>🔒 Đang cập nhật</div>
                  )}
                </div>

                {/* Body */}
                <div className={styles.cardBody}>
                  {course.category_label && (
                    <div className={styles.categoryLabel}>{course.category_label}</div>
                  )}
                  <h3 className={styles.courseTitle}>{course.title}</h3>

                  {course.description && (
                    <p className={styles.courseDesc}>{course.description}</p>
                  )}

                  <div className={styles.courseMeta}>
                    <span className={styles.metaItem}>
                      📖 {course.total_chapters || 0} chương
                    </span>
                    <span className={styles.metaItem}>
                      📝 {course.total_lessons || 0} bài
                    </span>
                  </div>

                  {isLocked ? (
                    <div className={`${styles.actionBtn} ${styles.actionBtnLocked}`}>
                      🔒 Đang cập nhật
                    </div>
                  ) : (
                    <div className={styles.actionBtn}>
                      Bắt đầu học →
                    </div>
                  )}
                </div>
              </>
            )

            if (isLocked) {
              return (
                <div key={course.id} className={cardClassName}>
                  {CardContent}
                </div>
              )
            }

            return (
              <Link href={`/student/courses/${course.id}`} key={course.id} className={cardClassName} style={{ textDecoration: 'none' }}>
                {CardContent}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
