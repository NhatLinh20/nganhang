// src/app/(dashboard)/teacher/shuffle/page.tsx
// Trang trộn đề thi — Server Component wrapper

import ShuffleClient from './ShuffleClient'
import { createClient } from '@/lib/supabase/server'

export const metadata = {
  title: 'Trộn đề thi',
  description: 'Trộn thứ tự câu hỏi và đáp án để tạo nhiều mã đề từ đề gốc',
}

export default async function ShufflePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const role = (user?.user_metadata?.role as string) || ''

  return <ShuffleClient userRole={role} />
}
