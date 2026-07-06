// src/app/(dashboard)/admin/online-exams/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import OnlineExamClient from './OnlineExamClient'

export default async function OnlineExamsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  return <OnlineExamClient />
}
