// src/app/(auth)/select-role/page.tsx
// Trang chọn vai trò — hiển thị cho user mới từ Google OAuth
'use client'

import { useState, useTransition } from 'react'
import { selectRole } from '@/app/actions/select-role'
import styles from './select-role.module.css'

export default function SelectRolePage() {
  const [selectedRole, setSelectedRole] = useState<'teacher' | 'student' | ''>('')
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  const handleSubmit = async (formData: FormData) => {
    if (!selectedRole) {
      setError('Vui lòng chọn vai trò của bạn.')
      return
    }
    setError('')
    formData.set('role', selectedRole)
    startTransition(async () => {
      const result = await selectRole(formData)
      if (result?.error) {
        setError(result.error)
      }
    })
  }

  return (
    <div className={styles.page}>
      <div className={styles.bgGrid} />

      <div className={styles.card}>
        <div className={styles.logo}>
          <div className={styles.logoIcon}>
            <span className={styles.logoEmoji}>📐</span>
          </div>
          <h1 className={styles.logoTitle}>Chọn vai trò</h1>
          <p className={styles.logoSub}>Bạn muốn sử dụng Ngân Hàng Toán với tư cách nào?</p>
        </div>

        {error && (
          <div className={styles.errorMsg}>
            <span className={styles.errorIcon}>⚠️</span>
            {error}
          </div>
        )}

        <form action={handleSubmit}>
          <div className={styles.roleCards}>
            {/* Card Giáo viên */}
            <div
              className={`${styles.roleCard} ${selectedRole === 'teacher' ? styles.roleCardSelected : ''}`}
              onClick={() => setSelectedRole('teacher')}
            >
              <div className={styles.roleCheck}>✓</div>
              <div className={styles.roleIcon}>📚</div>
              <div className={styles.roleName}>Giáo viên</div>
              <div className={styles.roleDesc}>
                Quản lý ngân hàng câu hỏi, tạo đề thi, sử dụng AI hỗ trợ
              </div>
            </div>

            {/* Card Học sinh */}
            <div
              className={`${styles.roleCard} ${selectedRole === 'student' ? styles.roleCardSelected : ''}`}
              onClick={() => setSelectedRole('student')}
            >
              <div className={styles.roleCheck}>✓</div>
              <div className={styles.roleIcon}>🎓</div>
              <div className={styles.roleName}>Học sinh</div>
              <div className={styles.roleDesc}>
                Truy cập khóa học, luyện đề, xem kết quả học tập
              </div>
            </div>
          </div>

          <input type="hidden" name="role" value={selectedRole} />

          <button
            type="submit"
            className={`btn btn-primary btn-lg ${styles.submitBtn}`}
            disabled={isPending || !selectedRole}
          >
            {isPending ? (
              <>
                <span className={styles.spinner} />
                Đang xử lý...
              </>
            ) : (
              'Tiếp tục'
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
