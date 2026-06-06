// src/app/(dashboard)/student/courses/[courseId]/page.tsx
// Trang chi tiết khóa học — redirect đến bài đầu tiên
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getProfile } from '@/lib/supabase/roles'
import { getCourseWithContent, getFirstLessonId } from '@/app/actions/course-queries'
import styles from './course-detail.module.css'

export async function generateMetadata({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params
  const { course } = await getCourseWithContent(courseId)
  return {
    title: course ? `${course.title} - Ngân Hàng Toán` : 'Khóa học - Ngân Hàng Toán',
  }
}

export default async function CourseDetailPage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params
  const profile = await getProfile()

  if (profile && profile.role !== 'student' && profile.role !== 'admin') {
    redirect('/dashboard')
  }

  // Lấy bài đầu tiên và redirect
  const firstLessonId = await getFirstLessonId(courseId)

  if (firstLessonId) {
    redirect(`/student/courses/${courseId}/${firstLessonId}`)
  }

  // Nếu không có bài nào → hiển thị empty state
  const { course } = await getCourseWithContent(courseId)

  if (!course) {
    return (
      <div className={styles.container}>
        <div className={styles.notFound}>
          <div className={styles.notFoundIcon}>😕</div>
          <h2 className={styles.notFoundTitle}>Không tìm thấy khóa học</h2>
          <p className={styles.notFoundDesc}>Khóa học này không tồn tại hoặc đã bị xóa.</p>
          <Link href="/student/courses" className={styles.notFoundBtn}>
            ← Quay lại danh sách
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <div className={styles.notFound}>
        <div className={styles.notFoundIcon}>📖</div>
        <h2 className={styles.notFoundTitle}>{course.title}</h2>
        <p className={styles.notFoundDesc}>Khóa học này chưa có bài học nào. Vui lòng quay lại sau.</p>
        <Link href="/student/courses" className={styles.notFoundBtn}>
          ← Quay lại danh sách
        </Link>
      </div>
    </div>
  )
}
