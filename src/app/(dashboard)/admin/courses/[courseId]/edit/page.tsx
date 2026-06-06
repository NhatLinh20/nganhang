// src/app/(dashboard)/admin/courses/[courseId]/edit/page.tsx
// Trang sửa khóa học — prefill dữ liệu từ DB
import { redirect } from 'next/navigation'
import { getProfile } from '@/lib/supabase/roles'
import { getCourseWithContent } from '@/app/actions/course-queries'
import CourseFormClient from '../../create/CourseFormClient'

export async function generateMetadata({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params
  const { course } = await getCourseWithContent(courseId)
  return {
    title: course ? `Sửa ${course.title} - Ngân Hàng Toán` : 'Sửa khóa học - Ngân Hàng Toán',
  }
}

export default async function EditCoursePage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params
  const profile = await getProfile()
  if (!profile || profile.role !== 'admin') {
    redirect('/dashboard')
  }

  const { course, chapters } = await getCourseWithContent(courseId)
  if (!course) {
    redirect('/admin/courses')
  }

  // Transform data for form
  const initialData = {
    title: course.title,
    description: course.description || '',
    grade: course.grade,
    category_label: course.category_label || '',
    teacher_name: course.teacher_name || '',
    thumbnail_url: course.thumbnail_url || '',
  }

  const initialChapters = chapters.map(ch => ({
    id: ch.id,
    chapter_number: ch.chapter_number,
    chapter_name: ch.chapter_name,
    sort_order: ch.sort_order,
    lessons: ch.lessons.map(l => ({
      id: l.id,
      lesson_number: l.lesson_number,
      lesson_name: l.lesson_name,
      video_url: l.video_url || '',
      duration_minutes: l.duration_minutes || 0,
      description: l.description || '',
      pdf_files: (l.pdf_files || []) as { name: string; url: string; description?: string }[],
      sort_order: l.sort_order,
    })),
  }))

  return (
    <CourseFormClient
      mode="edit"
      courseId={courseId}
      initialData={initialData}
      initialChapters={initialChapters}
    />
  )
}
