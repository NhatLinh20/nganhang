// src/app/(dashboard)/admin/slideshow/page.tsx
import { createClient } from '@/lib/supabase/server'
import SlideshowClient from './SlideshowClient'

export default async function SlideshowPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let role = 'teacher'
  if (user) {
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()
    if (profile) role = profile.role
  }

  return <SlideshowClient userRole={role} />
}
