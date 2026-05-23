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
  const role = (user?.user_metadata?.role as string) || ''

  return <ExamCreatorClient userRole={role} />
}
