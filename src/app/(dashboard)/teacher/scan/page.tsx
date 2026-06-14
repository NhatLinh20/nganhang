// src/app/(dashboard)/teacher/scan/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ScanDashboard from './ScanDashboard'

export const metadata = {
  title: 'Quét phiếu chấm thi — Kho Toán',
  description: 'Tạo bài thi, nhập đáp án và quét phiếu trả lời trắc nghiệm bằng camera',
}

export default async function ScanPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()

  return <ScanDashboard userRole={profile?.role || 'teacher'} userId={user.id} />
}
