// src/app/actions/course-queries.ts
// Queries cho trang Khóa học (Student view + Admin)
'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'

// ═══════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════
export interface Course {
  id: string
  title: string
  description: string
  grade: number
  category_label: string
  teacher_name: string
  thumbnail_url: string
  is_published: boolean
  sort_order: number
  created_at: string
  updated_at: string
  // Computed
  total_lessons?: number
  total_chapters?: number
}

export interface CourseChapter {
  id: string
  course_id: string
  chapter_number: number
  chapter_name: string
  sort_order: number
  lessons: CourseLessonSummary[]
}

export interface CourseLessonSummary {
  id: string
  chapter_id: string
  lesson_number: number
  lesson_name: string
  video_url: string
  duration_minutes: number
  description?: string
  pdf_files?: any[]
  sort_order: number
}

export interface CourseLessonDetail {
  id: string
  chapter_id: string
  lesson_number: number
  lesson_name: string
  video_url: string
  duration_minutes: number
  description: string
  pdf_files: { name: string; url: string; description?: string }[]
  sort_order: number
  // Joined
  chapter_name?: string
  chapter_number?: number
  course_id?: string
  course_title?: string
}

// ═══════════════════════════════════════════════════
// getCourses — Danh sách khóa học
// ═══════════════════════════════════════════════════
export async function getCourses(includeUnpublished = false): Promise<Course[]> {
  const supabase = await createClient()

  let query = supabase
    .from('courses')
    .select('*')
    .order('sort_order', { ascending: true })

  if (!includeUnpublished) {
    query = query.eq('is_published', true)
  }

  const { data, error } = await query

  if (error) {
    console.error('[getCourses] Error:', error.message)
    return []
  }

  // Count lessons per course
  const courses: Course[] = []
  for (const course of data || []) {
    const { count: chapterCount } = await supabase
      .from('course_chapters')
      .select('*', { count: 'exact', head: true })
      .eq('course_id', course.id)

    const { data: chapters } = await supabase
      .from('course_chapters')
      .select('id')
      .eq('course_id', course.id)

    let lessonCount = 0
    if (chapters && chapters.length > 0) {
      const chapterIds = chapters.map((c: any) => c.id as string)
      const { count } = await supabase
        .from('course_lessons')
        .select('*', { count: 'exact', head: true })
        .in('chapter_id', chapterIds)
      lessonCount = count || 0
    }

    courses.push({
      ...course,
      total_chapters: chapterCount || 0,
      total_lessons: lessonCount,
    })
  }

  return courses
}

// ═══════════════════════════════════════════════════
// getCourseWithContent — Chi tiết khóa + chương + bài
// ═══════════════════════════════════════════════════
export async function getCourseWithContent(courseId: string): Promise<{
  course: Course | null
  chapters: CourseChapter[]
}> {
  const supabase = await createClient()

  // Fetch course
  const { data: course, error: courseError } = await supabase
    .from('courses')
    .select('*')
    .eq('id', courseId)
    .single()

  if (courseError || !course) {
    return { course: null, chapters: [] }
  }

  // Fetch chapters
  const { data: chaptersRaw } = await supabase
    .from('course_chapters')
    .select('*')
    .eq('course_id', courseId)
    .order('sort_order', { ascending: true })

  const chapters: CourseChapter[] = []
  for (const ch of chaptersRaw || []) {
    const { data: lessons } = await supabase
      .from('course_lessons')
      .select('id, chapter_id, lesson_number, lesson_name, video_url, duration_minutes, description, pdf_files, sort_order')
      .eq('chapter_id', ch.id)
      .order('sort_order', { ascending: true })

    chapters.push({
      ...ch,
      lessons: (lessons || []).map((l: any) => {
        let parsed = l.pdf_files || []
        if (typeof parsed === 'string') {
          try { parsed = JSON.parse(parsed) } catch(e) { parsed = [] }
        }
        if (!Array.isArray(parsed)) parsed = []
        return { ...l, pdf_files: parsed }
      }),
    })
  }

  // Count total lessons
  const totalLessons = chapters.reduce((sum, ch) => sum + ch.lessons.length, 0)

  return {
    course: { ...course, total_chapters: chapters.length, total_lessons: totalLessons },
    chapters,
  }
}

// ═══════════════════════════════════════════════════
// getLessonDetail — Chi tiết 1 bài
// ═══════════════════════════════════════════════════
export async function getLessonDetail(lessonId: string): Promise<CourseLessonDetail | null> {
  const supabase = await createClient()

  const { data: lesson, error } = await supabase
    .from('course_lessons')
    .select('*')
    .eq('id', lessonId)
    .single()

  if (error || !lesson) return null

  // Get chapter info
  const { data: chapter } = await supabase
    .from('course_chapters')
    .select('chapter_name, chapter_number, course_id')
    .eq('id', lesson.chapter_id)
    .single()

  // Get course info
  let courseTitle = ''
  if (chapter?.course_id) {
    const { data: course } = await supabase
      .from('courses')
      .select('title')
      .eq('id', chapter.course_id)
      .single()
    courseTitle = course?.title || ''
  }

  return {
    ...lesson,
    pdf_files: (function() {
      let parsed = lesson.pdf_files || []
      if (typeof parsed === 'string') {
        try { parsed = JSON.parse(parsed) } catch(e) { parsed = [] }
      }
      if (!Array.isArray(parsed)) parsed = []
      return parsed
    })(),
    chapter_name: chapter?.chapter_name || '',
    chapter_number: chapter?.chapter_number || 0,
    course_id: chapter?.course_id || '',
    course_title: courseTitle,
  }
}

// ═══════════════════════════════════════════════════
// getFirstLessonId — Lấy ID bài đầu tiên của khóa học
// ═══════════════════════════════════════════════════
export async function getFirstLessonId(courseId: string): Promise<string | null> {
  const supabase = await createClient()

  // Lấy chương đầu tiên
  const { data: firstChapter } = await supabase
    .from('course_chapters')
    .select('id')
    .eq('course_id', courseId)
    .order('sort_order', { ascending: true })
    .limit(1)
    .single()

  if (!firstChapter) return null

  // Lấy bài đầu tiên trong chương
  const { data: firstLesson } = await supabase
    .from('course_lessons')
    .select('id')
    .eq('chapter_id', firstChapter.id)
    .order('sort_order', { ascending: true })
    .limit(1)
    .single()

  return firstLesson?.id || null
}
