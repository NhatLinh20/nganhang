import { getLessonDetail } from '@/app/actions/course-queries'
import styles from '../course-detail.module.css'

export default async function LessonPage({ params }: { params: Promise<{ courseId: string; lessonId: string }> }) {
  const { lessonId } = await params
  const lesson = await getLessonDetail(lessonId)

  if (!lesson) {
    return <div>Bài học không tồn tại.</div>
  }

  const embedUrl = lesson.video_url ? getYouTubeEmbedUrl(lesson.video_url) : null

  return (
    <>
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
            {lesson.pdf_files.map((pdf: any, idx: number) => (
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
    </>
  )
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
