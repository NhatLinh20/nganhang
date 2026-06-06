// src/app/actions/select-role.ts
// Server Action: Cập nhật role cho user mới (sau Google OAuth)
'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function selectRole(formData: FormData): Promise<{ error?: string }> {
  const selectedRole = formData.get('role') as string

  // Chỉ chấp nhận teacher hoặc student
  if (selectedRole !== 'teacher' && selectedRole !== 'student') {
    return { error: 'Vai trò không hợp lệ.' }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Chưa đăng nhập.' }
  }

  const supabaseAdmin = createAdminClient()

  // Kiểm tra user đã có profile chưa
  const { data: existingProfile } = await supabaseAdmin
    .from('users')
    .select('id, role, is_approved')
    .eq('id', user.id)
    .single()

  if (existingProfile) {
    // Đã có profile → cập nhật role nhưng giữ nguyên trạng thái duyệt nếu đã được duyệt (trừ khi chuyển học sinh -> giáo viên)
    let newApproved = existingProfile.is_approved
    if (existingProfile.role === 'student' && selectedRole === 'teacher') {
      newApproved = false // Nâng cấp role lên giáo viên cần duyệt lại
    }

    await supabaseAdmin
      .from('users')
      .update({ role: selectedRole, is_approved: newApproved, updated_at: new Date().toISOString() })
      .eq('id', user.id)
  } else {
    // Chưa có profile → tạo mới
    await supabaseAdmin
      .from('users')
      .insert({
        id: user.id,
        email: user.email || '',
        full_name: user.user_metadata?.full_name || user.user_metadata?.name || 'Người dùng',
        role: selectedRole,
        is_approved: false,
      })
  }

  // Cập nhật metadata
  await supabaseAdmin.auth.admin.updateUserById(user.id, {
    user_metadata: { ...user.user_metadata, role: selectedRole },
  })

  redirect('/pending')
}
