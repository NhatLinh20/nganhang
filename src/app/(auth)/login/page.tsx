// src/app/(auth)/login/page.tsx
// Trang đăng nhập hiện đại — hỗ trợ Google OAuth + Email/Password
'use client'

import { useState, useTransition } from 'react'
import { useSearchParams } from 'next/navigation'
import { login, loginWithGoogle } from '@/app/actions/auth'
import Link from 'next/link'
import styles from './login.module.css'

export default function LoginPage() {
  const searchParams = useSearchParams()
  const [error, setError] = useState(
    searchParams.get('reason') === 'session_replaced'
      ? 'Phiên đăng nhập đã bị thay thế bởi thiết bị khác.'
      : searchParams.get('error') === 'auth_failed'
        ? 'Đăng nhập thất bại. Vui lòng thử lại.'
        : ''
  )
  const [isPending, startTransition] = useTransition()
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)

  const handleLogin = async (formData: FormData) => {
    setError('')
    startTransition(async () => {
      const result = await login(formData)
      if (result?.error) {
        setError(result.error)
      }
    })
  }

  const handleGoogleLogin = async () => {
    setIsGoogleLoading(true)
    setError('')
    try {
      const result = await loginWithGoogle()
      if (result?.error) {
        setError(result.error)
        setIsGoogleLoading(false)
      }
    } catch {
      setIsGoogleLoading(false)
    }
  }

  return (
    <div className={styles.page}>
      {/* Background decoration */}
      <div className={styles.bgDecor} />
      <div className={styles.bgGrid} />

      <div className={styles.card}>
        {/* Logo */}
        <div className={styles.logo}>
          <div className={styles.logoIcon}>
            <span className={styles.logoEmoji}>📐</span>
          </div>
          <h1 className={styles.logoTitle}>Ngân Hàng Toán</h1>
          <p className={styles.logoSub}>Hệ thống quản lý câu hỏi THPT</p>
        </div>

        {/* Google OAuth */}
        <button
          id="google-login-btn"
          type="button"
          className={styles.googleBtn}
          onClick={handleGoogleLogin}
          disabled={isGoogleLoading || isPending}
        >
          <svg className={styles.googleIcon} viewBox="0 0 24 24" width="20" height="20">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          {isGoogleLoading ? 'Đang chuyển hướng...' : 'Đăng nhập bằng Google'}
        </button>

        {/* Divider */}
        <div className={styles.divider}>
          <span className={styles.dividerText}>hoặc đăng nhập bằng email</span>
        </div>

        {/* Email/Password Form */}
        <form action={handleLogin} className={styles.form}>
          <div className="form-group">
            <label className="form-label" htmlFor="login-email">Email</label>
            <input
              id="login-email"
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
            <div className={styles.labelRow}>
              <label className="form-label" htmlFor="login-password">Mật khẩu</label>
              <Link href="/forgot-password" className={styles.forgotLink}>
                Quên mật khẩu?
              </Link>
            </div>
            <input
              id="login-password"
              name="password"
              type="password"
              className="form-input"
              placeholder="••••••••"
              required
              autoComplete="current-password"
              disabled={isPending}
            />
          </div>

          {error && (
            <div className={styles.errorMsg} id="login-error">
              <span className={styles.errorIcon}>⚠️</span>
              {error}
            </div>
          )}

          <button
            id="login-submit-btn"
            type="submit"
            className={`btn btn-primary btn-lg ${styles.submitBtn}`}
            disabled={isPending}
          >
            {isPending ? (
              <>
                <span className={styles.spinner} />
                Đang đăng nhập...
              </>
            ) : (
              'Đăng nhập'
            )}
          </button>
        </form>

        {/* Register link */}
        <p className={styles.registerLink}>
          Chưa có tài khoản?{' '}
          <Link href="/register" className={styles.link}>
            Đăng ký ngay
          </Link>
        </p>

        <p className={styles.footer}>
          Ngân Hàng Câu Hỏi Toán THPT · Dành cho Admin & Giáo viên
        </p>
      </div>
    </div>
  )
}
