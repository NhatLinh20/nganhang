// src/app/exam/layout.tsx
// Layout công khai cho trang thi online — Không có Sidebar, không cần đăng nhập
import '../globals.css'

export const metadata = {
  title: 'Thi Online | Ngân Hàng Toán',
}

export default function ExamLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
