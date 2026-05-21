// src/app/layout.tsx
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'Ngân Hàng Câu Hỏi Toán',
    template: '%s | Ngân Hàng Toán',
  },
  description: 'Hệ thống quản lý ngân hàng câu hỏi toán THPT — tạo đề thi, trộn đề, luyện thi online',
  keywords: ['ngân hàng câu hỏi', 'toán THPT', 'tạo đề thi', 'luyện thi'],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  )
}
