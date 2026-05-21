// src/app/(dashboard)/layout.tsx
// Layout chung cho tất cả trang dashboard (Admin, Teacher, Student)

import Sidebar from '@/components/layout/Sidebar'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="page-layout">
      <Sidebar />
      <div className="main-content">
        {children}
      </div>
    </div>
  )
}
