// src/app/(auth)/forgot-password/page.tsx
'use client'

import { useState, useTransition } from 'react'
import { resetPassword } from '@/app/actions/auth'
import Link from 'next/link'
import styles from './forgot.module.css'

export default function ForgotPasswordPage() {
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [isPending, startTransition] = useTransition()

  const handleReset = async (formData: FormData) => {
    setError('')
    startTransition(async () => {
      const result = await resetPassword(formData)
      if (result?.error) {
        setError(result.error)
      } else if (result?.success) {
        setSuccess(true)
      }
    })
  }

  return (
    <div className={styles.page}>
      <div className={styles.bgGrid} />

      <div className={styles.card}>
        <div className={styles.logo}>
          <div className={styles.iconWrapper}>
            🔒
          </div>
          <h1 className={styles.logoTitle}>Khôi phục mật khẩu</h1>
          {!success && (
            <p className={styles.logoSub}>
              Nhập email của bạn và chúng tôi sẽ gửi liên kết để đặt lại mật khẩu.
            </p>
          )}
        </div>

        {success ? (
          <div className={styles.successMsg}>
            <div className={styles.successIcon}>📧</div>
            <div className={styles.successText}>
              Đã gửi liên kết khôi phục mật khẩu. Vui lòng kiểm tra hộp thư đến (hoặc thư rác) của bạn.
            </div>
            <Link href="/login" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
              Quay lại đăng nhập
            </Link>
          </div>
        ) : (
          <form action={handleReset} className={styles.form}>
            <div className="form-group">
              <label className="form-label" htmlFor="email">Email đã đăng ký</label>
              <input
                id="email"
                name="email"
                type="email"
                className="form-input"
                placeholder="nguyen@example.com"
                required
                disabled={isPending}
              />
            </div>

            {error && (
              <div className={styles.errorMsg}>
                ⚠️ {error}
              </div>
            )}

            <button
              type="submit"
              className={`btn btn-primary btn-lg ${styles.submitBtn}`}
              disabled={isPending}
            >
              {isPending ? (
                <>
                  <span className={styles.spinner} />
                  Đang gửi...
                </>
              ) : (
                'Gửi liên kết khôi phục'
              )}
            </button>
          </form>
        )}

        {!success && (
          <Link href="/login" className={styles.backLink}>
            ← Quay lại đăng nhập
          </Link>
        )}
      </div>
    </div>
  )
}
