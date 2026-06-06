// src/app/(dashboard)/admin/courses/create/CourseFormClient.tsx
// Form tạo/sửa khóa học — 2 cột: sidebar thông tin + content chương/bài
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createCourse, updateCourse, saveCourseContent } from '@/app/actions/course-actions'
import type { CourseChapter } from '@/app/actions/course-queries'
import styles from '../courses-manager.module.css'

interface PdfFile {
  name: string
  url: string
  description?: string
}

interface LessonForm {
  id?: string
  lesson_number: number
  lesson_name: string
  video_url: string
  duration_minutes: number
  description: string
  pdf_files: PdfFile[]
  sort_order: number
}

interface ChapterForm {
  id?: string
  chapter_number: number
  chapter_name: string
  sort_order: number
  lessons: LessonForm[]
}

interface CourseForm {
  title: string
  description: string
  grade: number
  category_label: string
  teacher_name: string
  thumbnail_url: string
}

interface Props {
  mode: 'create' | 'edit'
  courseId?: string
  initialData?: CourseForm
  initialChapters?: ChapterForm[]
}

export default function CourseFormClient({ mode, courseId, initialData, initialChapters }: Props) {
  const router = useRouter()

  const [courseData, setCourseData] = useState<CourseForm>(initialData || {
    title: '',
    description: '',
    grade: 10,
    category_label: '',
    teacher_name: '',
    thumbnail_url: '',
  })

  const [chapters, setChapters] = useState<ChapterForm[]>(initialChapters || [])
  const [activeChapterIdx, setActiveChapterIdx] = useState(0)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  
  // To track original state after saving or on initial load
  const [savedDataStr, setSavedDataStr] = useState(() => JSON.stringify({
    courseData: initialData || { title: '', description: '', grade: 10, category_label: '', teacher_name: '', thumbnail_url: '' },
    chapters: initialChapters || []
  }))

  const isDirty = JSON.stringify({ courseData, chapters }) !== savedDataStr

  // ─── Course Data Handlers ───
  const updateField = (field: keyof CourseForm, value: any) => {
    setCourseData(prev => ({ ...prev, [field]: value }))
  }

  // ─── Chapter Handlers ───
  const addChapter = () => {
    const nextNum = chapters.length + 1
    setChapters(prev => [...prev, {
      chapter_number: nextNum,
      chapter_name: `Chương ${nextNum}`,
      sort_order: nextNum,
      lessons: [],
    }])
    setActiveChapterIdx(chapters.length)
  }

  const deleteChapter = (idx: number) => {
    if (!window.confirm('Xóa chương này và tất cả bài bên trong?')) return
    setChapters(prev => prev.filter((_, i) => i !== idx))
    if (activeChapterIdx >= idx && activeChapterIdx > 0) {
      setActiveChapterIdx(activeChapterIdx - 1)
    }
  }

  const updateChapterName = (idx: number, name: string) => {
    setChapters(prev => prev.map((ch, i) => i === idx ? { ...ch, chapter_name: name } : ch))
  }

  // ─── Lesson Handlers ───
  const addLesson = () => {
    if (chapters.length === 0) return
    const ch = chapters[activeChapterIdx]
    const nextNum = ch.lessons.length + 1
    setChapters(prev => prev.map((c, i) => i === activeChapterIdx ? {
      ...c,
      lessons: [...c.lessons, {
        lesson_number: nextNum,
        lesson_name: '',
        video_url: '',
        duration_minutes: 0,
        description: '',
        pdf_files: [],
        sort_order: nextNum,
      }],
    } : c))
  }

  const deleteLesson = (lessonIdx: number) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa bài học này?')) return
    setChapters(prev => prev.map((c, i) => i === activeChapterIdx ? {
      ...c,
      lessons: c.lessons.filter((_, li) => li !== lessonIdx),
    } : c))
  }

  const updateLesson = (lessonIdx: number, field: keyof LessonForm, value: any) => {
    setChapters(prev => prev.map((c, i) => i === activeChapterIdx ? {
      ...c,
      lessons: c.lessons.map((l, li) => li === lessonIdx ? { ...l, [field]: value } : l),
    } : c))
  }

  // ─── PDF Handlers ───
  const addPdf = (lessonIdx: number) => {
    const lesson = chapters[activeChapterIdx]?.lessons[lessonIdx]
    if (!lesson) return
    updateLesson(lessonIdx, 'pdf_files', [...lesson.pdf_files, { name: '', url: '' }])
  }

  const removePdf = (lessonIdx: number, pdfIdx: number) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa file PDF này?')) return
    const lesson = chapters[activeChapterIdx]?.lessons[lessonIdx]
    if (!lesson) return
    updateLesson(lessonIdx, 'pdf_files', lesson.pdf_files.filter((_, i) => i !== pdfIdx))
  }

  const updatePdf = (lessonIdx: number, pdfIdx: number, field: keyof PdfFile, value: string) => {
    const lesson = chapters[activeChapterIdx]?.lessons[lessonIdx]
    if (!lesson) return
    updateLesson(lessonIdx, 'pdf_files', lesson.pdf_files.map((p, i) =>
      i === pdfIdx ? { ...p, [field]: value } : p
    ))
  }

  // ─── Save ───
  const handleSave = async () => {
    if (!courseData.title.trim()) {
      setToast({ type: 'error', message: 'Vui lòng nhập tên khóa học.' })
      setTimeout(() => setToast(null), 3000)
      return
    }

    setSaving(true)
    try {
      let targetCourseId = courseId

      if (mode === 'create') {
        const result = await createCourse(courseData)
        if (result.error) {
          setToast({ type: 'error', message: result.error })
          setTimeout(() => setToast(null), 3000)
          setSaving(false)
          return
        }
        targetCourseId = result.courseId
      } else {
        const result = await updateCourse(courseId!, courseData)
        if (result.error) {
          setToast({ type: 'error', message: result.error })
          setTimeout(() => setToast(null), 3000)
          setSaving(false)
          return
        }
      }

      // Save chapters + lessons
      if (targetCourseId && chapters.length > 0) {
        const result = await saveCourseContent(targetCourseId, chapters)
        if (result.error) {
          setToast({ type: 'error', message: result.error })
          setTimeout(() => setToast(null), 3000)
          setSaving(false)
          return
        }
      }

      // Update saved data snapshot to current state
      setSavedDataStr(JSON.stringify({ courseData, chapters }))

      setToast({ type: 'success', message: mode === 'create' ? 'Tạo khóa học thành công!' : 'Cập nhật thành công!' })
      
      if (mode === 'create') {
        setTimeout(() => {
          router.push(`/admin/courses/${targetCourseId}/edit`)
        }, 1000)
      } else {
        setTimeout(() => setToast(null), 3000)
      }
    } catch {
      setToast({ type: 'error', message: 'Đã xảy ra lỗi.' })
      setTimeout(() => setToast(null), 3000)
    } finally {
      setSaving(false)
    }
  }

  const activeChapter = chapters[activeChapterIdx]

  return (
    <div className={styles.formContainer} style={{ padding: 'var(--space-6)' }}>
      {/* Header */}
      <div className={styles.formHeader}>
        <div>
          <Link href="/admin/courses" className={styles.formBackBtn}>← Quay lại</Link>
          <h1 className={styles.formTitle}>
            {mode === 'create' ? 'Tạo khóa học mới' : 'Sửa khóa học'}
          </h1>
        </div>
        <button
          className={styles.formSaveBtn}
          onClick={handleSave}
          disabled={saving || !isDirty}
          style={{ opacity: (!isDirty && !saving) ? 0.5 : 1, cursor: (!isDirty && !saving) ? 'not-allowed' : 'pointer' }}
        >
          {saving ? '⏳ Đang lưu...' : (isDirty ? '💾 Lưu khóa học' : '✅ Đã lưu')}
        </button>
      </div>

      {/* Form Layout */}
      <div className={styles.formLayout}>
        {/* ─── Sidebar: Thông tin chung ─── */}
        <div className={styles.formSidebar}>
          <h3 className={styles.formSidebarTitle}>Thông tin chung</h3>

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Tên khóa học</label>
            <input
              className={styles.formInput}
              placeholder="VD: Toán 10 – Chương 1..."
              value={courseData.title}
              onChange={e => updateField('title', e.target.value)}
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Mô tả khóa học</label>
            <textarea
              className={`${styles.formInput} ${styles.formTextarea}`}
              placeholder="Mô tả chi tiết về khóa học..."
              value={courseData.description}
              onChange={e => updateField('description', e.target.value)}
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Khối lớp</label>
            <select
              className={`${styles.formInput} ${styles.formSelect}`}
              value={courseData.grade}
              onChange={e => updateField('grade', parseInt(e.target.value))}
            >
              {[6,7,8,9,10,11,12].map(g => (
                <option key={g} value={g}>Lớp {g}</option>
              ))}
            </select>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Phân loại</label>
            <input
              className={styles.formInput}
              placeholder="VD: Đại số & Thống kê"
              value={courseData.category_label}
              onChange={e => updateField('category_label', e.target.value)}
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Giáo viên</label>
            <input
              className={styles.formInput}
              placeholder="VD: Thầy Nguyễn Văn A"
              value={courseData.teacher_name}
              onChange={e => updateField('teacher_name', e.target.value)}
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Link ảnh bìa</label>
            <input
              className={styles.formInput}
              placeholder="URL ảnh thumbnail..."
              value={courseData.thumbnail_url}
              onChange={e => updateField('thumbnail_url', e.target.value)}
            />
          </div>
        </div>

        {/* ─── Content: Chương + Bài ─── */}
        <div className={styles.formContent}>
          {/* Chapter Selector */}
          <div className={styles.chapterSelector}>
            {chapters.map((ch, idx) => (
              <button
                key={idx}
                className={`${styles.chapterTab} ${idx === activeChapterIdx ? styles.chapterTabActive : ''}`}
                onClick={() => setActiveChapterIdx(idx)}
              >
                Chương {ch.chapter_number}
              </button>
            ))}
            <button className={styles.addChapterBtn} onClick={addChapter}>
              + Thêm chương
            </button>
            {activeChapter && (
              <button
                className={styles.deleteChapterBtn}
                onClick={() => deleteChapter(activeChapterIdx)}
              >
                🗑️ Xóa chương
              </button>
            )}
          </div>

          {/* Chapter Name */}
          {activeChapter && (
            <>
              <div className={styles.chapterNameRow}>
                <span className={styles.chapterNameLabel}>Tên chương:</span>
                <input
                  className={styles.chapterNameInput}
                  placeholder="Nhập tên chương..."
                  value={activeChapter.chapter_name}
                  onChange={e => updateChapterName(activeChapterIdx, e.target.value)}
                />
              </div>

              {/* Lessons Table */}
              <table className={styles.lessonsTable}>
                <thead>
                  <tr>
                    <th style={{ width: 40 }}>#</th>
                    <th>Tên bài</th>
                    <th style={{ width: 180 }}>Video URL</th>
                    <th style={{ width: 200 }}>File PDF</th>
                    <th style={{ width: 60 }}>Phút</th>
                    <th style={{ width: 40 }}>Xóa</th>
                  </tr>
                </thead>
                <tbody>
                  {activeChapter.lessons.map((lesson, li) => (
                    <tr key={li}>
                      <td style={{ textAlign: 'center', color: 'var(--color-gray-400)', fontSize: 13 }}>
                        {li + 1}
                      </td>
                      <td>
                        <input
                          className={styles.lessonInput}
                          placeholder="Tên bài học..."
                          value={lesson.lesson_name}
                          onChange={e => updateLesson(li, 'lesson_name', e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          className={styles.lessonInput}
                          placeholder="Link YouTube..."
                          value={lesson.video_url}
                          onChange={e => updateLesson(li, 'video_url', e.target.value)}
                        />
                      </td>
                      <td>
                        <div className={styles.pdfFormList}>
                          {lesson.pdf_files.map((pdf, pi) => (
                            <div key={pi} className={styles.pdfFormRow}>
                              <input
                                className={styles.pdfFormInput}
                                placeholder="Tên file"
                                value={pdf.name}
                                onChange={e => updatePdf(li, pi, 'name', e.target.value)}
                              />
                              <input
                                className={styles.pdfFormInput}
                                placeholder="Link Drive..."
                                value={pdf.url}
                                onChange={e => updatePdf(li, pi, 'url', e.target.value)}
                              />
                              <button
                                className={styles.removePdfBtn}
                                onClick={() => removePdf(li, pi)}
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                          <button className={styles.addPdfBtn} onClick={() => addPdf(li)}>
                            + Thêm file PDF
                          </button>
                        </div>
                      </td>
                      <td>
                        <input
                          className={`${styles.lessonInput} ${styles.lessonInputSmall}`}
                          type="number"
                          min={0}
                          value={lesson.duration_minutes || ''}
                          onChange={e => updateLesson(li, 'duration_minutes', parseInt(e.target.value) || 0)}
                        />
                      </td>
                      <td>
                        <button
                          className={styles.deleteLessonBtn}
                          onClick={() => deleteLesson(li)}
                        >
                          🗑️
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <button
                className={styles.addLessonBtn}
                onClick={addLesson}
                style={{ width: 'calc(100% - 24px)' }}
              >
                + Thêm bài học
              </button>
            </>
          )}

          {chapters.length === 0 && (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>📖</div>
              <p className={styles.emptyText}>Nhấn "Thêm chương" để bắt đầu tạo nội dung</p>
            </div>
          )}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`${styles.toast} ${toast.type === 'success' ? styles.toastSuccess : styles.toastError}`}>
          {toast.message}
        </div>
      )}
    </div>
  )
}
