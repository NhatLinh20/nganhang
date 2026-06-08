// src/app/(dashboard)/student/courses/page.tsx
// Trang Danh sách Khóa học cho Học sinh (AI Learning Platform Style)
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

// Hàm hỗ trợ render thumbnail icon giả lập
const getIconForGrade = (grade: number) => {
  return gradeEmojis[grade] || '📚'
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
    <div className={styles.pageWrapper}>
      <div className={styles.container}>
        
        {/* Phần Title Thay vì Hero Banner */}
        <h2 className={styles.sectionTitle} style={{ marginTop: '20px', fontSize: '24px' }}>Khóa học của bạn</h2>
        <p style={{ color: '#64748B', marginBottom: '32px', fontSize: '15px' }}>
          Khám phá và tiếp tục hành trình học tập của bạn.
        </p>

        {courses.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>📚</div>
            <h2 className={styles.emptyTitle}>Chưa có khóa học nào</h2>
            <p className={styles.emptyDesc}>Các khóa học đang được chuẩn bị. Hãy quay lại sau nhé!</p>
          </div>
        ) : (
          <>
            {/* Các khóa học đang học (Giả lập Progress) */}
            {/* <h3 className={styles.sectionTitle}>Đang học</h3>
            <div className={styles.ongoingCard}>
              <div className={styles.ongoingInfo}>
                <h4 className={styles.ongoingTitle}>Toán lớp 12 - Giải Tích</h4>
                <div className={styles.progressContainer}>
                  <div className={styles.progressBar}>
                    <div className={styles.progressFill} style={{ width: '45%' }}></div>
                  </div>
                  <span className={styles.progressText}>45%</span>
                </div>
              </div>
              <button className={styles.continueBtn}>Tiếp tục</button>
            </div> */}

            <h3 className={styles.sectionTitle} style={{ marginTop: '40px' }}>Tất cả khóa học</h3>
            <div className={styles.courseGrid}>
              {courses.map((course) => {
                const isLocked = !course.is_published
                const bgClass = `bgGrade${course.grade}` as keyof typeof styles
                const cardClassName = `${styles.courseCard} ${isLocked ? styles.courseCardLocked : ''}`

                const CardContent = (
                  <>
                    {/* Thumbnail / Icon (Left) */}
                    <div className={`${styles.thumbnailWrapper} ${styles[bgClass] || ''}`}>
                      {course.thumbnail_url ? (
                        <img
                          src={course.thumbnail_url}
                          alt={course.title}
                          className={styles.thumbnailImage}
                        />
                      ) : (
                        <div className={styles.thumbnailPlaceholder}>
                          {getIconForGrade(course.grade)}
                        </div>
                      )}
                      {isLocked && (
                        <div className={styles.lockedBadge}>Đang cập nhật</div>
                      )}
                    </div>

                    {/* Info (Center) */}
                    <div className={styles.cardBody}>
                      <h3 className={styles.courseTitle}>{course.title}</h3>
                      <div className={styles.courseDesc}>
                        <span className={styles.gradeTag}>Lớp {course.grade}</span>
                        {course.category_label && (
                          <span>• {course.category_label}</span>
                        )}
                        <span>• {course.total_lessons || 0} bài học</span>
                      </div>
                    </div>

                    {/* Arrow Icon (Right) */}
                    <div className={styles.arrowIcon}>
                      {isLocked ? '🔒' : '›'}
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
          </>
        )}
      </div>
    </div>
  )
}
