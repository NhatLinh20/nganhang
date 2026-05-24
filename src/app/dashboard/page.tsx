// src/app/dashboard/page.tsx
// Trang điều hướng trung gian — đọc role rồi redirect đúng nơi
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/supabase/roles'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Chưa đăng nhập → về login
  if (!user) {
    redirect('/login')
  }

  const profile = await getProfile()
  const role = profile?.role || user.user_metadata?.role as string | undefined
  const isApproved = profile?.is_approved || role === 'admin'

  if (role === 'teacher' && !isApproved) {
    redirect('/pending')
  }

  // Điều hướng theo role
  if (role === 'admin') {
    redirect('/admin/questions')
  } else if (role === 'teacher') {
    redirect('/admin/ai-exam') // Teacher mặc định vào trang AI tạo đề
  } else if (role === 'student') {
    redirect('/student/dashboard')
  }

  // Fallback nếu chưa có role
  redirect('/login')
}
