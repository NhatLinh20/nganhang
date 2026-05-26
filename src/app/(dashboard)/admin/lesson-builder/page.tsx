// src/app/(dashboard)/admin/lesson-builder/page.tsx
import LessonBuilderClient from './LessonBuilderClient'
import { createClient } from '@/lib/supabase/server'

export const metadata = {
  title: 'Tạo bài học',
}

export default async function LessonBuilderPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const role = (user?.user_metadata?.role as string) || ''

  return <LessonBuilderClient userRole={role} />
}
