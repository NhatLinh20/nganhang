// src/app/(dashboard)/admin/courses/page.tsx
// Trang quản lý khóa học (Admin)
import { redirect } from 'next/navigation'
import { getProfile } from '@/lib/supabase/roles'
import { getCourses } from '@/app/actions/course-queries'
import CoursesManagerClient from './CoursesManagerClient'

export const metadata = {
  title: 'Quản lý khóa học - Ngân Hàng Toán',
}

export default async function AdminCoursesPage() {
  const profile = await getProfile()
  if (!profile || profile.role !== 'admin') {
    redirect('/dashboard')
  }

  const courses = await getCourses(true) // include unpublished

  return <CoursesManagerClient initialCourses={courses} />
}
