// src/app/(dashboard)/student/courses/[courseId]/[lessonId]/page.tsx
// Trang xem bài học — Video (70%) + Sidebar chương/bài (30%)
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { getCourseWithContent, getLessonDetail } from '@/app/actions/course-queries'
import styles from '../course-detail.module.css'

interface PdfFile {
  name: string
  url: string
  description?: string
}

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

interface LessonDetail {
  id: string
  chapter_id: string
  lesson_number: number
  lesson_name: string
  video_url: string
  duration_minutes: number
  description: string
  pdf_files: PdfFile[]
  chapter_name?: string
  chapter_number?: number
  course_id?: string
  course_title?: string
}

interface CourseData {
  id: string
  title: string
  total_lessons?: number
}

// Chuyển YouTube URL → embed URL
function getYouTubeEmbedUrl(url: string): string | null {
  if (!url) return null
  let videoId = ''

  // youtube.com/watch?v=...
  const watchMatch = url.match(/[?&]v=([^&#]+)/)
  if (watchMatch) videoId = watchMatch[1]

  // youtu.be/...
  const shortMatch = url.match(/youtu\.be\/([^?&#]+)/)
  if (shortMatch) videoId = shortMatch[1]

  // youtube.com/embed/...
  const embedMatch = url.match(/youtube\.com\/embed\/([^?&#]+)/)
  if (embedMatch) videoId = embedMatch[1]

  if (!videoId) return null
  return `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1`
}

export default function LessonPage() {
  const params = useParams()
  const courseId = params.courseId as string
  const lessonId = params.lessonId as string

  const [course, setCourse] = useState<CourseData | null>(null)
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [lesson, setLesson] = useState<LessonDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(new Set())

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      try {
        // Fetch course + chapters
        const [courseData, lessonData] = await Promise.all([
          getCourseWithContent(courseId),
          getLessonDetail(lessonId),
        ])

        setCourse(courseData.course)
        setChapters(courseData.chapters)
        setLesson(lessonData)

        // Auto-expand the chapter containing this lesson
        if (lessonData?.chapter_id) {
          setExpandedChapters(new Set([lessonData.chapter_id]))
        }
      } catch (err) {
        console.error('Error fetching lesson data:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [courseId, lessonId])

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
  const embedUrl = lesson?.video_url ? getYouTubeEmbedUrl(lesson.video_url) : null

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.notFound}>
          <div className={styles.notFoundIcon}>⏳</div>
          <h2 className={styles.notFoundTitle}>Đang tải bài học...</h2>
        </div>
      </div>
    )
  }

  if (!lesson || !course) {
    return (
      <div className={styles.container}>
        <div className={styles.notFound}>
          <div className={styles.notFoundIcon}>😕</div>
          <h2 className={styles.notFoundTitle}>Không tìm thấy bài học</h2>
          <p className={styles.notFoundDesc}>Bài học này không tồn tại hoặc đã bị xóa.</p>
          <Link href="/student/courses" className={styles.notFoundBtn}>
            ← Quay lại danh sách
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      {/* Breadcrumb */}
      <div className={styles.breadcrumb}>
        <Link href="/student/courses" className={styles.backLink}>← Khóa học</Link>
        <span className={styles.breadcrumbSep}>›</span>
        <Link href={`/student/courses/${courseId}`} className={styles.breadcrumbBadge}>
          {course.title}
        </Link>
        {lesson.chapter_name && (
          <>
            <span className={styles.breadcrumbSep}>›</span>
            <span className={styles.breadcrumbText}>Chương {lesson.chapter_number}</span>
          </>
        )}
      </div>

      {/* Main Layout */}
      <div className={styles.mainLayout}>
        {/* ─── Left: Video + Content ─── */}
        <div className={styles.videoSection}>
          <h1 className={styles.lessonTitle}>{lesson.lesson_name}</h1>

          {/* Video */}
          <div className={styles.videoWrapper}>
            {embedUrl ? (
              <iframe
                className={styles.videoIframe}
                src={embedUrl}
                title={lesson.lesson_name}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            ) : (
              <div className={styles.videoPlaceholder}>
                <div className={styles.videoPlaceholderIcon}>🎬</div>
                <div className={styles.videoPlaceholderText}>
                  {lesson.video_url ? 'Link video không hợp lệ' : 'Chưa có video cho bài này'}
                </div>
              </div>
            )}
          </div>

          {/* Description */}
          {lesson.description && (
            <div className={styles.lessonDescription}>{lesson.description}</div>
          )}

          {/* PDF Files */}
          {lesson.pdf_files && lesson.pdf_files.length > 0 && (
            <div className={styles.pdfSection}>
              <h2 className={styles.pdfHeader}>
                <span className={styles.pdfHeaderIcon}>📄</span>
                Tài liệu PDF
              </h2>
              <div className={styles.pdfList}>
                {lesson.pdf_files.map((pdf, idx) => (
                  <a
                    key={idx}
                    href={pdf.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.pdfItem}
                  >
                    <div className={styles.pdfIcon}>📕</div>
                    <div className={styles.pdfInfo}>
                      <div className={styles.pdfName}>{pdf.name}</div>
                      {pdf.description && (
                        <div className={styles.pdfDesc}>{pdf.description}</div>
                      )}
                    </div>
                    <div className={styles.pdfDownload}>⬇</div>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ─── Right: Sidebar ─── */}
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
                        <Link
                          key={l.id}
                          href={`/student/courses/${courseId}/${l.id}`}
                          className={`${styles.lessonItem} ${isActive ? styles.lessonItemActive : ''}`}
                        >
                          <span className={styles.lessonIcon}>
                            {isActive ? '▶' : '○'}
                          </span>
                          <span className={styles.lessonName}>
                            Bài {l.lesson_number}: {l.lesson_name}
                          </span>
                          {l.duration_minutes > 0 && (
                            <span className={styles.lessonDuration}>
                              {l.duration_minutes}p
                            </span>
                          )}
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
