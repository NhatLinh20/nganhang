// src/app/(dashboard)/layout.tsx
// Layout chung cho tất cả trang dashboard (Admin, Teacher, Student)

import Sidebar from '@/components/layout/Sidebar'
import { createClient } from '@/lib/supabase/server'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  const role = (user?.user_metadata?.role as string) || ''
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
