// src/app/(dashboard)/admin/questions/page.tsx
// Trang quản lý ngân hàng câu hỏi — Server Component wrapper

import QuestionsClient from './QuestionsClient'
import { createClient } from '@/lib/supabase/server'

export const metadata = {
  title: 'Ngân hàng câu hỏi',
}

export default async function QuestionsPage() {
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

  return <QuestionsClient userRole={role} />
}
