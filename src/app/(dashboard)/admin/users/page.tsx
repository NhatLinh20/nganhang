// src/app/(dashboard)/admin/users/page.tsx
import { redirect } from 'next/navigation'
import { isAdmin } from '@/lib/supabase/roles'
import UsersClient from './UsersClient'

export const metadata = {
  title: 'Quản lý người dùng',
}

export default async function UsersPage() {
  const admin = await isAdmin()
  
  if (!admin) {
    redirect('/dashboard') // Không phải admin -> đuổi về dashboard
  }

  return <UsersClient />
}
