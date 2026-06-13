// src/app/(dashboard)/teacher/scan/page.tsx
// Trang quét phiếu trả lời trắc nghiệm — Server Component wrapper

import ScanClient from './ScanClient'
import { createClient } from '@/lib/supabase/server'

export const metadata = {
  title: 'Quét phiếu chấm thi',
  description: 'Quét phiếu trả lời trắc nghiệm và chấm điểm tự động',
}

export default async function ScanPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let role = ''
  if (user) {
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()
    role = profile?.role || (user.user_metadata?.role as string) || ''
  }

  return <ScanClient userRole={role} userId={user?.id || ''} />
}
