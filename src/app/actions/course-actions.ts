// src/app/actions/course-actions.ts
// Server Actions cho Admin CRUD khóa học
'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// ═══════════════════════════════════════════════════
// createCourse — Tạo khóa học mới
// ═══════════════════════════════════════════════════
export async function createCourse(formData: {
  title: string
  description: string
  grade: number
  category_label: string
  teacher_name: string
  thumbnail_url: string
}): Promise<{ error?: string; courseId?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Chưa đăng nhập.' }

  const admin = createAdminClient()

  // Kiểm tra role
  const { data: profile } = await admin.from('users').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { error: 'Không có quyền.' }

  const { data, error } = await admin
    .from('courses')
    .insert({
      title: formData.title,
      description: formData.description || '',
      grade: formData.grade,
      category_label: formData.category_label || '',
      teacher_name: formData.teacher_name || '',
      thumbnail_url: formData.thumbnail_url || '',
      is_published: false,
      sort_order: formData.grade,
      created_by: user.id,
    })
    .select('id')
    .single()

  if (error) {
    console.error('[createCourse]', error.message)
    return { error: 'Không thể tạo khóa học.' }
  }

  revalidatePath('/admin/courses')
  return { courseId: data.id }
}

// ═══════════════════════════════════════════════════
// updateCourse — Cập nhật thông tin khóa học
// ═══════════════════════════════════════════════════
export async function updateCourse(courseId: string, formData: {
  title: string
  description: string
  grade: number
  category_label: string
  teacher_name: string
  thumbnail_url: string
}): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Chưa đăng nhập.' }

  const admin = createAdminClient()
  const { data: profile } = await admin.from('users').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { error: 'Không có quyền.' }

  const { error } = await admin
    .from('courses')
    .update({
      title: formData.title,
      description: formData.description || '',
      grade: formData.grade,
      category_label: formData.category_label || '',
      teacher_name: formData.teacher_name || '',
      thumbnail_url: formData.thumbnail_url || '',
      sort_order: formData.grade,
      updated_at: new Date().toISOString(),
    })
    .eq('id', courseId)

  if (error) {
    console.error('[updateCourse]', error.message)
    return { error: 'Không thể cập nhật khóa học.' }
  }

  revalidatePath('/admin/courses')
  revalidatePath(`/student/courses`)
  return {}
}

// ═══════════════════════════════════════════════════
// deleteCourse — Xóa khóa học (cascade chapters + lessons)
// ═══════════════════════════════════════════════════
export async function deleteCourse(courseId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Chưa đăng nhập.' }

  const admin = createAdminClient()
  const { data: profile } = await admin.from('users').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { error: 'Không có quyền.' }

  const { error } = await admin.from('courses').delete().eq('id', courseId)

  if (error) {
    console.error('[deleteCourse]', error.message)
    return { error: 'Không thể xóa khóa học.' }
  }

  revalidatePath('/admin/courses')
  revalidatePath('/student/courses')
  return {}
}

// ═══════════════════════════════════════════════════
// toggleCoursePublished — Bật/tắt published
// ═══════════════════════════════════════════════════
export async function toggleCoursePublished(courseId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Chưa đăng nhập.' }

  const admin = createAdminClient()
  const { data: profile } = await admin.from('users').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { error: 'Không có quyền.' }

  // Get current state
  const { data: course } = await admin.from('courses').select('is_published').eq('id', courseId).single()
  if (!course) return { error: 'Không tìm thấy khóa học.' }

  const { error } = await admin
    .from('courses')
    .update({ is_published: !course.is_published, updated_at: new Date().toISOString() })
    .eq('id', courseId)

  if (error) return { error: 'Không thể cập nhật trạng thái.' }

  revalidatePath('/admin/courses')
  revalidatePath('/student/courses')
  return {}
}

// ═══════════════════════════════════════════════════
// saveCourseContent — Lưu toàn bộ chương + bài
// ═══════════════════════════════════════════════════
interface ChapterInput {
  id?: string // existing chapter ID, undefined = new
  chapter_number: number
  chapter_name: string
  sort_order: number
  lessons: LessonInput[]
}

interface LessonInput {
  id?: string
  lesson_number: number
  lesson_name: string
  video_url: string
  duration_minutes: number
  description: string
  pdf_files: { name: string; url: string; description?: string }[]
  sort_order: number
}

export async function saveCourseContent(
  courseId: string,
  chapters: ChapterInput[]
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Chưa đăng nhập.' }

  const admin = createAdminClient()
  const { data: profile } = await admin.from('users').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { error: 'Không có quyền.' }

  try {
    // Get existing chapter IDs to detect deletions
    const { data: existingChapters } = await admin
      .from('course_chapters')
      .select('id')
      .eq('course_id', courseId)

    const existingChapterIds = new Set<string>((existingChapters || []).map((c: any) => c.id as string))
    const keepChapterIds = new Set<string>(chapters.filter(c => c.id).map(c => c.id as string))

    // Delete removed chapters (cascade deletes lessons)
    for (const id of existingChapterIds) {
      if (!keepChapterIds.has(id)) {
        await admin.from('course_chapters').delete().eq('id', id)
      }
    }

    // Upsert chapters and lessons
    for (const ch of chapters) {
      let chapterId = ch.id

      if (chapterId && existingChapterIds.has(chapterId)) {
        // Update existing chapter
        await admin
          .from('course_chapters')
          .update({
            chapter_number: ch.chapter_number,
            chapter_name: ch.chapter_name,
            sort_order: ch.sort_order,
          })
          .eq('id', chapterId)
      } else {
        // Insert new chapter
        const { data: newCh, error: chErr } = await admin
          .from('course_chapters')
          .insert({
            course_id: courseId,
            chapter_number: ch.chapter_number,
            chapter_name: ch.chapter_name,
            sort_order: ch.sort_order,
          })
          .select('id')
          .single()

        if (chErr || !newCh) {
          console.error('[saveCourseContent] Chapter insert error:', chErr?.message)
          continue
        }
        chapterId = newCh.id
      }

      // Handle lessons for this chapter
      const { data: existingLessons } = await admin
        .from('course_lessons')
        .select('id')
        .eq('chapter_id', chapterId)

      const existingLessonIds = new Set<string>((existingLessons || []).map((l: any) => l.id as string))
      const keepLessonIds = new Set<string>(ch.lessons.filter(l => l.id).map(l => l.id as string))

      // Delete removed lessons
      for (const id of existingLessonIds) {
        if (!keepLessonIds.has(id)) {
          await admin.from('course_lessons').delete().eq('id', id)
        }
      }

      // Upsert lessons
      for (const lesson of ch.lessons) {
        const lessonData = {
          chapter_id: chapterId,
          lesson_number: lesson.lesson_number,
          lesson_name: lesson.lesson_name,
          video_url: lesson.video_url || '',
          duration_minutes: lesson.duration_minutes || 0,
          description: lesson.description || '',
          pdf_files: lesson.pdf_files || [],
          sort_order: lesson.sort_order,
        }

        if (lesson.id && existingLessonIds.has(lesson.id)) {
          await admin.from('course_lessons').update(lessonData).eq('id', lesson.id)
        } else {
          await admin.from('course_lessons').insert(lessonData)
        }
      }
    }

    // Update course timestamp
    await admin
      .from('courses')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', courseId)

    revalidatePath('/admin/courses')
    revalidatePath(`/student/courses/${courseId}`)
    return {}
  } catch (err: any) {
    console.error('[saveCourseContent]', err.message)
    return { error: 'Lỗi khi lưu nội dung khóa học.' }
  }
}
