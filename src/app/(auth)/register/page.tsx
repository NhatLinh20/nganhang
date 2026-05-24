// src/app/(auth)/register/page.tsx
'use client'

import { useState, useTransition } from 'react'
import { register } from '@/app/actions/auth'
import Link from 'next/link'
import styles from './register.module.css'

export default function RegisterPage() {
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  const handleRegister = async (formData: FormData) => {
    setError('')
    startTransition(async () => {
      const result = await register(formData)
      if (result?.error) {
        setError(result.error)
      }
    })
  }

  return (
    <div className={styles.page}>
      <div className={styles.bgDecor} />
      <div className={styles.bgGrid} />

      <div className={styles.card}>
        <div className={styles.logo}>
          <div className={styles.logoIcon}>
            <span className={styles.logoEmoji}>📐</span>
          </div>
          <h1 className={styles.logoTitle}>Đăng ký Giáo viên</h1>
          <p className={styles.logoSub}>Tham gia Ngân Hàng Toán THPT</p>
        </div>

        <form action={handleRegister} className={styles.form}>
          <div className="form-group">
            <label className="form-label" htmlFor="fullName">Họ và tên</label>
            <input
              id="fullName"
              name="fullName"
              type="text"
              className="form-input"
              placeholder="Nguyễn Văn A"
              required
              disabled={isPending}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="email">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              className="form-input"
              placeholder="nguyen@example.com"
              required
              autoComplete="email"
              disabled={isPending}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="password">Mật khẩu</label>
            <input
              id="password"
              name="password"
              type="password"
              className="form-input"
              placeholder="Ít nhất 6 ký tự"
              required
              minLength={6}
              disabled={isPending}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="confirmPassword">Xác nhận mật khẩu</label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              className="form-input"
              placeholder="Nhập lại mật khẩu"
              required
              minLength={6}
              disabled={isPending}
            />
          </div>

          {error && (
            <div className={styles.errorMsg}>
              <span className={styles.errorIcon}>⚠️</span>
              {error}
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
                Đang đăng ký...
              </>
            ) : (
              'Đăng ký tài khoản'
            )}
          </button>
        </form>

        <p className={styles.loginLink}>
          Đã có tài khoản?{' '}
          <Link href="/login" className={styles.link}>
            Đăng nhập
          </Link>
        </p>
      </div>
    </div>
  )
}
