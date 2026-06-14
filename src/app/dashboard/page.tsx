// src/app/dashboard/page.tsx
// Trang điều hướng trung gian — đọc role rồi redirect đúng nơi
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/supabase/roles'
import { headers } from 'next/headers'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Chưa đăng nhập → về login
  if (!user) {
    console.log("Dashboard: No user found, redirecting to login. Cookie issue?")
    redirect('/login?error=session_expired')
  }

  const profile = await getProfile()
  const role = profile?.role || user.user_metadata?.role as string | undefined
  const isApproved = profile?.is_approved || role === 'admin'

  if ((role === 'teacher' || role === 'student') && !isApproved) {
    redirect('/pending')
  }

  // Detect mobile device
  const headersList = await headers()
  const userAgent = headersList.get('user-agent') || ''
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent)

  // Điều hướng theo role
  if (role === 'admin') {
    redirect('/admin/questions')
  } else if (role === 'teacher') {
    if (isMobile) {
      redirect('/teacher/scan') // Mobile: vào trang quét phiếu
    } else {
      redirect('/admin/ai-exam') // Desktop: vào trang AI tạo đề
    }
  } else if (role === 'student') {
    redirect('/student/courses') // Student mặc định vào trang Khóa học
  }

  // Fallback nếu chưa có role (có thể do lỗi đồng bộ database)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '2rem', textAlign: 'center', fontFamily: 'sans-serif' }}>
      <div style={{ fontSize: '48px', marginBottom: '1rem' }}>⚠️</div>
      <h1 style={{ marginBottom: '1rem', color: '#dc2626' }}>Lỗi đồng bộ tài khoản</h1>
      <p style={{ maxWidth: '400px', lineHeight: '1.6', marginBottom: '2rem', color: '#4b5563' }}>
        Tài khoản của bạn chưa được đồng bộ vào hệ thống. Nguyên nhân thường do bạn đã đăng ký email này bằng phương thức Mật khẩu trước đó, 
        nên không thể dùng Google để tạo tài khoản mới đè lên.
        <br /><br />
        Vui lòng quay lại và <strong>đăng nhập bằng Email/Mật khẩu</strong>, hoặc liên hệ Admin để xóa tài khoản cũ.
      </p>
      <form action={async () => {
        'use server'
        const supabase = await createClient()
        await supabase.auth.signOut()
        redirect('/login')
      }}>
        <button type="submit" style={{ padding: '10px 24px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>
          Quay lại trang Đăng nhập
        </button>
      </form>
    </div>
  )
}
