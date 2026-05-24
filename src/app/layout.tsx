// src/app/layout.tsx
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import SessionGuardian from '@/components/SessionGuardian'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'Ngân Hàng Câu Hỏi Toán',
    template: '%s | Ngân Hàng Toán',
  },
  description: 'Hệ thống quản lý ngân hàng câu hỏi toán THPT — tạo đề thi, trộn đề, luyện thi online',
  keywords: ['ngân hàng câu hỏi', 'toán THPT', 'tạo đề thi', 'luyện thi'],
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  
  const userId = session?.user?.id
  const activeSessionId = session?.access_token?.slice(-20)

  return (
    <html lang="vi">
      <body>
        {userId && activeSessionId && (
          <SessionGuardian userId={userId} sessionId={activeSessionId} />
        )}
        {children}
      </body>
    </html>
  )
}
