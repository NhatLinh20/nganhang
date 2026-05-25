// src/app/pending/page.tsx
'use client'

import { logout } from '@/app/actions/auth'
import Link from 'next/link'

export default function PendingPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '2rem', textAlign: 'center', fontFamily: 'sans-serif' }}>
      <div style={{ fontSize: '48px', marginBottom: '1rem' }}>⏳</div>
      <h1 style={{ marginBottom: '1rem', color: '#f59e0b' }}>Tài khoản đang chờ duyệt</h1>
      <p style={{ maxWidth: '400px', lineHeight: '1.6', marginBottom: '2rem', color: '#4b5563' }}>
        Tài khoản Giáo viên của bạn đã được đăng ký thành công và đang chờ Quản trị viên phê duyệt. 
        Vui lòng liên hệ Admin qua Zalo: <strong>0812878792</strong> để được kích hoạt nhanh nhất.
      </p>
      
      <div style={{ display: 'flex', gap: '1rem' }}>
        <form action={logout}>
          <button type="submit" style={{ padding: '10px 24px', background: '#e5e7eb', color: '#374151', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>
            Đăng xuất
          </button>
        </form>
        <Link href="/" style={{ padding: '10px 24px', background: '#3b82f6', color: 'white', textDecoration: 'none', borderRadius: '8px', fontWeight: 600 }}>
          Trang chủ
        </Link>
      </div>
    </div>
  )
}
