// src/app/(dashboard)/admin/courses/create/page.tsx
// Trang tạo khóa học mới
import { redirect } from 'next/navigation'
import { getProfile } from '@/lib/supabase/roles'
import CourseFormClient from './CourseFormClient'

export const metadata = {
  title: 'Tạo khóa học mới - Ngân Hàng Toán',
}

export default async function CreateCoursePage() {
  const profile = await getProfile()
  if (!profile || profile.role !== 'admin') {
    redirect('/dashboard')
  }

  return <CourseFormClient mode="create" />
}
