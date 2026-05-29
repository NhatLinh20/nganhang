// src/app/(dashboard)/teacher/exams/page.tsx
// Trang tạo đề thi từ ngân hàng câu hỏi — Server Component wrapper

import ExamCreatorClient from './ExamCreatorClient'
import { createClient } from '@/lib/supabase/server'

export const metadata = {
  title: 'Tạo đề thi',
  description: 'Tạo đề thi từ ngân hàng câu hỏi — lọc theo dạng bài, mức độ, loại câu',
}

export default async function ExamsPage() {
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

  return <ExamCreatorClient userRole={role} />
}
