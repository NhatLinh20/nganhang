// src/app/(dashboard)/admin/lesson-builder/page.tsx
import LessonBuilderClient from './LessonBuilderClient'
import { createClient } from '@/lib/supabase/server'

export const metadata = {
  title: 'Tạo bài học',
}

export default async function LessonBuilderPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  // Lấy role từ bảng users (chính xác nhất)
  let role = ''
  if (user) {
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()
    role = profile?.role || (user.user_metadata?.role as string) || ''
  }

  return <LessonBuilderClient userRole={role} />
}
