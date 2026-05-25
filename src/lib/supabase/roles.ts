// src/lib/supabase/roles.ts
// Helper functions cho phân quyền — truy vấn bảng users trong DB

import { createClient } from './server'

export interface UserProfile {
  id: string
  email: string
  full_name: string
  role: 'admin' | 'teacher'
  is_approved: boolean
  is_active: boolean
  avatar_url: string | null
  active_session_id: string | null
  created_at: string
  updated_at: string
}

/**
 * Lấy profile đầy đủ từ bảng users (bao gồm role, is_approved)
 * Dùng cho Server Components, API Routes, Server Actions
 */
export async function getProfile(): Promise<UserProfile | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return null

  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single()

  if (error || !data) return null

  return data as UserProfile
}

/**
 * Kiểm tra user hiện tại có phải teacher không
 */
export async function isTeacher(): Promise<boolean> {
  const profile = await getProfile()
  return profile?.role === 'teacher'
}

/**
 * Kiểm tra user hiện tại có phải admin không
 */
export async function isAdmin(): Promise<boolean> {
  const profile = await getProfile()
  return profile?.role === 'admin'
}

/**
 * Kiểm tra tài khoản đã được admin phê duyệt chưa
 */
export async function isApproved(): Promise<boolean> {
  const profile = await getProfile()
  if (!profile) return false
  // Admin luôn được coi là approved
  if (profile.role === 'admin') return true
  return profile.is_approved === true
}

/**
 * Lấy role từ bảng users (không dùng user_metadata)
 */
export async function getUserRole(): Promise<string | null> {
  const profile = await getProfile()
  return profile?.role || null
}
