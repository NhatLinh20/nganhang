'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { isAdmin } from '@/lib/supabase/roles'
import { revalidatePath } from 'next/cache'

export interface UserManagementData {
  id: string
  email: string
  full_name: string
  role: string
  is_approved: boolean
  is_active: boolean
  created_at: string
  updated_at: string
  provider: string
  device_id: string | null
  device_bound_at: string | null
  device_info: Record<string, string> | null
}

export interface LoginLogData {
  id: string
  user_id: string
  ip_address: string
  country: string
  city: string
  user_agent: string
  is_suspicious: boolean
  suspicious_reasons: string[] | null
  created_at: string
  users: {
    full_name: string
    email: string
    avatar_url: string | null
  }
}

// ═══════════════════════════════════════════════════
// 1. LẤY DANH SÁCH NGƯỜI DÙNG (hỗ trợ lọc theo role)
// ═══════════════════════════════════════════════════
export async function getUsers(
  status: 'pending' | 'approved',
  roleFilter?: 'teacher' | 'student' | 'all'
): Promise<{ data?: UserManagementData[], error?: string }> {
  const admin = await isAdmin()
  if (!admin) return { error: 'Không có quyền truy cập.' }

  const supabaseAdmin = createAdminClient()
  
  const query = supabaseAdmin
    .from('users')
    .select('*')
    .order('created_at', { ascending: false })

  if (status === 'pending') {
    query.eq('is_approved', false)
  } else {
    query.eq('is_approved', true)
  }

  // Lọc theo role
  if (roleFilter && roleFilter !== 'all') {
    query.eq('role', roleFilter)
  }

  const { data, error } = await query

  if (error) {
    console.error('getUsers error:', error)
    return { error: 'Lỗi tải danh sách người dùng.' }
  }

  const mappedData = data.map((user: any) => ({
    ...user,
    provider: user.avatar_url?.includes('googleusercontent') ? 'google' : 'email'
  }))

  return { data: mappedData as UserManagementData[] }
}

// ═══════════════════════════════════════════════════
// 2. DUYỆT TÀI KHOẢN
// ═══════════════════════════════════════════════════
export async function approveUser(userId: string): Promise<{ success?: boolean, error?: string }> {
  const admin = await isAdmin()
  if (!admin) return { error: 'Không có quyền truy cập.' }

  const supabaseAdmin = createAdminClient()
  const { error } = await supabaseAdmin
    .from('users')
    .update({ is_approved: true, updated_at: new Date().toISOString() })
    .eq('id', userId)

  if (error) return { error: 'Không thể duyệt tài khoản.' }

  revalidatePath('/admin/users')
  return { success: true }
}

// ═══════════════════════════════════════════════════
// 3. TỪ CHỐI TÀI KHOẢN (XÓA HẲN)
// ═══════════════════════════════════════════════════
export async function rejectUser(userId: string): Promise<{ success?: boolean, error?: string }> {
  const admin = await isAdmin()
  if (!admin) return { error: 'Không có quyền truy cập.' }

  const supabaseAdmin = createAdminClient()
  
  // Xóa khỏi bảng auth.users -> sẽ trigger ON DELETE CASCADE xóa ở public.users
  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId)

  if (error) {
    console.error('rejectUser error:', error)
    return { error: 'Không thể xóa tài khoản.' }
  }

  revalidatePath('/admin/users')
  return { success: true }
}

// ═══════════════════════════════════════════════════
// 4. THU HỒI TÀI KHOẢN
// ═══════════════════════════════════════════════════
export async function revokeUser(userId: string): Promise<{ success?: boolean, error?: string }> {
  const admin = await isAdmin()
  if (!admin) return { error: 'Không có quyền truy cập.' }

  const supabaseAdmin = createAdminClient()
  
  // Bảo vệ không cho thu hồi chính Admin
  const { data: user } = await supabaseAdmin.from('users').select('role').eq('id', userId).single()
  if (user?.role === 'admin') {
    return { error: 'Không thể thu hồi quyền quản trị viên.' }
  }

  const { error } = await supabaseAdmin
    .from('users')
    .update({ is_approved: false, active_sessions: [], updated_at: new Date().toISOString() })
    .eq('id', userId)

  if (error) return { error: 'Không thể thu hồi tài khoản.' }

  revalidatePath('/admin/users')
  return { success: true }
}

// ═══════════════════════════════════════════════════
// 5. KHÓA / MỞ KHÓA TÀI KHOẢN
// ═══════════════════════════════════════════════════
export async function toggleUserActive(userId: string, isActive: boolean): Promise<{ success?: boolean, error?: string }> {
  const admin = await isAdmin()
  if (!admin) return { error: 'Không có quyền truy cập.' }

  const supabaseAdmin = createAdminClient()
  
  const { data: user } = await supabaseAdmin.from('users').select('role').eq('id', userId).single()
  if (user?.role === 'admin' && !isActive) {
    return { error: 'Không thể khóa quản trị viên.' }
  }

  const { error } = await supabaseAdmin
    .from('users')
    .update({ is_active: isActive, active_sessions: !isActive ? [] : undefined, updated_at: new Date().toISOString() })
    .eq('id', userId)

  if (error) return { error: 'Lỗi cập nhật trạng thái hoạt động.' }

  revalidatePath('/admin/users')
  return { success: true }
}

// ═══════════════════════════════════════════════════
// 6. LẤY LỊCH SỬ ĐĂNG NHẬP
// ═══════════════════════════════════════════════════
export async function getLoginLogs(filter: 'all' | 'suspicious' = 'all'): Promise<{ data?: LoginLogData[], error?: string }> {
  const admin = await isAdmin()
  if (!admin) return { error: 'Không có quyền truy cập.' }

  const supabaseAdmin = createAdminClient()
  
  const query = supabaseAdmin
    .from('login_logs')
    .select(`
      *,
      users:user_id ( full_name, email, avatar_url )
    `)
    .order('created_at', { ascending: false })
    .limit(100)

  if (filter === 'suspicious') {
    query.eq('is_suspicious', true)
  }

  const { data, error } = await query

  if (error) {
    console.error('getLoginLogs error:', error)
    return { error: 'Lỗi tải lịch sử đăng nhập.' }
  }

  return { data: data as LoginLogData[] }
}

// ═══════════════════════════════════════════════════
// 7. LẤY THỐNG KÊ TỔNG QUAN (phân theo role)
// ═══════════════════════════════════════════════════
export async function getUserStats(): Promise<{ 
  stats?: { 
    total: number
    pending: number
    approved: number
    suspicious: number
    pendingTeachers: number
    pendingStudents: number
    approvedTeachers: number
    approvedStudents: number
  }, 
  error?: string 
}> {
  const admin = await isAdmin()
  if (!admin) return { error: 'Không có quyền truy cập.' }

  const supabaseAdmin = createAdminClient()
  
  const { count: pendingCount } = await supabaseAdmin.from('users').select('*', { count: 'exact', head: true }).eq('is_approved', false)
  const { count: approvedCount } = await supabaseAdmin.from('users').select('*', { count: 'exact', head: true }).eq('is_approved', true)
  const { count: suspiciousCount } = await supabaseAdmin.from('login_logs').select('*', { count: 'exact', head: true }).eq('is_suspicious', true)
  
  // Đếm riêng theo role
  const { count: pendingTeachers } = await supabaseAdmin.from('users').select('*', { count: 'exact', head: true }).eq('is_approved', false).eq('role', 'teacher')
  const { count: pendingStudents } = await supabaseAdmin.from('users').select('*', { count: 'exact', head: true }).eq('is_approved', false).eq('role', 'student')
  const { count: approvedTeachers } = await supabaseAdmin.from('users').select('*', { count: 'exact', head: true }).eq('is_approved', true).eq('role', 'teacher')
  const { count: approvedStudents } = await supabaseAdmin.from('users').select('*', { count: 'exact', head: true }).eq('is_approved', true).eq('role', 'student')

  return {
    stats: {
      total: (pendingCount || 0) + (approvedCount || 0),
      pending: pendingCount || 0,
      approved: approvedCount || 0,
      suspicious: suspiciousCount || 0,
      pendingTeachers: pendingTeachers || 0,
      pendingStudents: pendingStudents || 0,
      approvedTeachers: approvedTeachers || 0,
      approvedStudents: approvedStudents || 0,
    }
  }
}

// ═══════════════════════════════════════════════════
// 8. RESET THIẾT BỊ (xóa liên kết device binding)
// ═══════════════════════════════════════════════════
export async function resetDevice(userId: string): Promise<{ success?: boolean, error?: string }> {
  const admin = await isAdmin()
  if (!admin) return { error: 'Không có quyền truy cập.' }

  const supabaseAdmin = createAdminClient()
  
  // Bảo vệ không cho reset device của admin
  const { data: user } = await supabaseAdmin.from('users').select('role').eq('id', userId).single()
  if (user?.role === 'admin') {
    return { error: 'Không cần reset thiết bị cho quản trị viên.' }
  }

  const { error } = await supabaseAdmin
    .from('users')
    .update({ 
      device_id: null, 
      device_ids: [],
      active_sessions: [],
      device_bound_at: null, 
      device_info: {},
      updated_at: new Date().toISOString() 
    })
    .eq('id', userId)

  if (error) {
    console.error('resetDevice error:', error)
    return { error: 'Không thể reset thiết bị.' }
  }

  revalidatePath('/admin/users')
  return { success: true }
}
