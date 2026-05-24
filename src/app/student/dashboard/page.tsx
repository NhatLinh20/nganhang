// src/app/student/dashboard/page.tsx
import { logout } from '@/app/actions/auth'

export default function StudentDashboardPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '2rem', textAlign: 'center', fontFamily: 'sans-serif' }}>
      <h1>Bảng Điều Khiển Học Sinh</h1>
      <p style={{ marginTop: '1rem', marginBottom: '2rem', color: '#666' }}>Tính năng dành cho học sinh đang được phát triển. Vui lòng quay lại sau!</p>
      
      <form action={logout}>
        <button type="submit" style={{ padding: '10px 20px', background: '#dc2626', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>
          Đăng xuất
        </button>
      </form>
    </div>
  )
}
