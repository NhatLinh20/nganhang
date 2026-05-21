// src/app/dashboard/page.tsx
// Trang điều hướng trung gian — đọc role rồi redirect đúng nơi
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Chưa đăng nhập → về login
  if (!user) {
    redirect('/login')
  }

  const role = user.user_metadata?.role as string | undefined

  // Điều hướng theo role
  if (role === 'admin') {
    redirect('/admin/questions')
  } else if (role === 'teacher') {
    redirect('/teacher/dashboard')
  } else if (role === 'student') {
    redirect('/student/dashboard')
  }

  // Fallback nếu chưa có role
  redirect('/login')
}
