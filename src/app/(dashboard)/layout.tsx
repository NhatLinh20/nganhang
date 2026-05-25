// src/app/(dashboard)/layout.tsx
// Layout chung cho tất cả trang dashboard (Admin, Teacher)

import Sidebar from '@/components/layout/Sidebar'
import { createClient } from '@/lib/supabase/server'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  // Lấy role từ bảng users (nguồn chính xác nhất)
  let role = 'teacher'
  if (user) {
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()
      
    if (profile) {
      role = profile.role
    }
  }

  const email = user?.email || ''

  return (
    <div className="page-layout">
      <Sidebar userRole={role} userEmail={email} />
      <div className="main-content">
        {children}
      </div>
    </div>
  )
}
