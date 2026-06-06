// src/app/(dashboard)/student/courses/[courseId]/[lessonId]/page.tsx
// Trang xem bài học — Video (70%) + Sidebar chương/bài (30%)
'use client'

import { useEffect, useState, use } from 'react'
import Link from 'next/link'
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

export default function LessonPage({ params }: { params: Promise<{ courseId: string; lessonId: string }> }) {
  const { courseId, lessonId } = use(params)

  const [course, setCourse] = useState<CourseData | null>(null)
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [lesson, setLesson] = useState<LessonDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(new Set())
  const [isTheaterMode, setIsTheaterMode] = useState(false)

  // Fetch course data ONLY when courseId changes
  useEffect(() => {
    let isMounted = true
    async function fetchCourse() {
      const data = await getCourseWithContent(courseId)
      if (isMounted) {
        setCourse(data.course)
        setChapters(data.chapters)
      }
    }
    fetchCourse()
    return () => { isMounted = false }
  }, [courseId])

  // Fetch lesson data when lessonId changes
  useEffect(() => {
    let isMounted = true
    async function fetchLesson() {
      setLoading(true)
      try {
        const data = await getLessonDetail(lessonId)
        if (isMounted) {
          setLesson(data)
        }
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }
    fetchLesson()
    return () => { isMounted = false }
  }, [lessonId])

  // Expand chapter when lesson is loaded
  useEffect(() => {
    if (lesson?.chapter_id) {
      setExpandedChapters(prev => {
        const next = new Set(prev)
        next.add(lesson.chapter_id)
        return next
      })
    }
  }, [lesson?.chapter_id])

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

  if (!course || !chapters) {
    return (
      <div className={styles.container}>
        <div className="skeleton" style={{ height: 400, borderRadius: 16 }}></div>
      </div>
    )
  }

  if (loading || !lesson) {
    return (
      <div className={styles.container}>
        <div className={styles.breadcrumb}>
          <div className="skeleton" style={{ width: 200, height: 24, borderRadius: 12 }}></div>
        </div>
        <div className={`${styles.mainLayout} ${isTheaterMode ? styles.theaterMode : ''}`}>
          <div className="skeleton" style={{ height: 500, borderRadius: 16 }}></div>
          <div className={styles.sidebar}>
            {/* Show cached sidebar during loading! */}
            <div className={styles.sidebarHeader}>
              <span className={styles.sidebarTitle}>Nội dung khóa học</span>
            </div>
            <div className="skeleton" style={{ height: 400, borderRadius: 16 }}></div>
          </div>
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
      <div className={`${styles.mainLayout} ${isTheaterMode ? styles.theaterMode : ''}`}>
        {/* ─── Left: Video + Content ─── */}
        <div className={styles.videoSection}>
          <div className={styles.lessonHeader}>
            <h1 className={styles.lessonTitle}>{lesson.lesson_name}</h1>
            <button 
              className={styles.theaterToggleBtn}
              onClick={() => setIsTheaterMode(!isTheaterMode)}
            >
              {isTheaterMode ? 'Mặc định' : 'Góc rộng'}
            </button>
          </div>

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
      </div>
    </div>
  )
}
