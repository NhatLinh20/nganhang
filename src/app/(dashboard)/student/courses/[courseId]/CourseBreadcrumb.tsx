'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import styles from './course-detail.module.css'

interface CourseData {
  id: string
  title: string
}

export default function CourseBreadcrumb({ 
  course, 
  chapters 
}: { 
  course: CourseData
  chapters: any[] 
}) {
  const pathname = usePathname()
  const segments = pathname.split('/')
  const lessonId = segments[segments.length - 1] !== course.id ? segments[segments.length - 1] : null

  let chapterNumber = null
  if (lessonId) {
    const activeChapter = chapters.find(ch => ch.lessons.some((l: any) => l.id === lessonId))
    if (activeChapter) {
      chapterNumber = activeChapter.chapter_number
    }
  }

  return (
    <div className={styles.breadcrumb}>
      <Link href="/student/courses" className={styles.backLink}>← Khóa học</Link>
      <span className={styles.breadcrumbSep}>›</span>
      <Link href={`/student/courses/${course.id}`} className={styles.breadcrumbBadge}>
        {course.title}
      </Link>
      {chapterNumber && (
        <>
          <span className={styles.breadcrumbSep}>›</span>
          <span className={styles.breadcrumbText}>Chương {chapterNumber}</span>
        </>
      )}
    </div>
  )
}
