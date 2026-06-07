'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import styles from './course-detail.module.css'

interface LessonSummary {
  id: string
  chapter_id: string
  lesson_number: number
  lesson_name: string
  video_url: string
  duration_minutes: number
  sort_order: number
}

interface Chapter {
  id: string
  course_id: string
  chapter_number: number
  chapter_name: string
  sort_order: number
  lessons: LessonSummary[]
}

export default function CourseSidebar({ 
  chapters, 
  courseId 
}: { 
  chapters: Chapter[]
  courseId: string 
}) {
  const pathname = usePathname()
  // Lấy lessonId hiện tại từ URL (ví dụ: /student/courses/[courseId]/[lessonId])
  const segments = pathname.split('/')
  const lessonId = segments[segments.length - 1] !== courseId ? segments[segments.length - 1] : null

  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(new Set())

  // Tự động mở chương chứa bài học hiện tại khi load
  useEffect(() => {
    if (!lessonId) return
    const activeChapter = chapters.find(ch => ch.lessons.some(l => l.id === lessonId))
    if (activeChapter) {
      setExpandedChapters(prev => {
        const next = new Set(prev)
        next.add(activeChapter.id)
        return next
      })
    }
  }, [lessonId, chapters])

  const toggleChapter = (chapterId: string) => {
    setExpandedChapters(prev => {
      const next = new Set(prev)
      if (next.has(chapterId)) {
        next.delete(chapterId)
      } else {
        next.add(chapterId)
      }
      return next
    })
  }

  const totalLessons = chapters.reduce((sum, ch) => sum + ch.lessons.length, 0)

  return (
    <div className={styles.sidebar}>
      <div className={styles.sidebarHeader}>
        <span className={styles.sidebarTitle}>Nội dung khóa học</span>
        <span className={styles.sidebarBadge}>{totalLessons} bài</span>
      </div>

      {chapters.map((ch) => {
        const isExpanded = expandedChapters.has(ch.id)
        const hasActiveLesson = ch.lessons.some(l => l.id === lessonId)

        return (
          <div
            key={ch.id}
            className={`${styles.chapterItem} ${hasActiveLesson ? styles.chapterActive : ''}`}
          >
            <button
              className={styles.chapterHeader}
              onClick={() => toggleChapter(ch.id)}
            >
              <div style={{ flex: 1 }}>
                <div className={styles.chapterLabel}>Chương {ch.chapter_number}</div>
                <div className={styles.chapterName}>{ch.chapter_name}</div>
              </div>
              <span className={`${styles.chapterToggle} ${isExpanded ? styles.chapterToggleOpen : ''}`}>
                ▼
              </span>
            </button>

            {isExpanded && (
              <div className={styles.lessonList}>
                {ch.lessons.map((l) => {
                  const isActive = l.id === lessonId
                  return (
                    <div key={l.id}>
                      {isActive ? (
                        <div className={`${styles.lessonItem} ${styles.lessonItemActive}`}>
                          <div className={styles.lessonIcon}>▶</div>
                          <span className={styles.lessonName}>{l.lesson_name}</span>
                          {l.duration_minutes > 0 && (
                            <span className={styles.lessonDuration}>{l.duration_minutes} phút</span>
                          )}
                        </div>
                      ) : (
                        <Link
                          href={`/student/courses/${courseId}/${l.id}`}
                          className={styles.lessonItem}
                          prefetch={true}
                        >
                          <div className={styles.lessonIcon}>○</div>
                          <span className={styles.lessonName}>{l.lesson_name}</span>
                          {l.duration_minutes > 0 && (
                            <span className={styles.lessonDuration}>{l.duration_minutes} phút</span>
                          )}
                        </Link>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
