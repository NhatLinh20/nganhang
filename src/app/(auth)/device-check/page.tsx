// src/app/(auth)/device-check/page.tsx
// Trang trung gian xác minh thiết bị sau Google OAuth login
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getDeviceFingerprint, getDeviceInfo } from '@/lib/device-fingerprint'

export default function DeviceCheckPage() {
  const router = useRouter()
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    async function checkDevice() {
      try {
        const deviceId = await getDeviceFingerprint()
        const deviceInfo = getDeviceInfo()

        const res = await fetch('/api/auth/bind-device', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ device_id: deviceId, device_info: deviceInfo }),
        })

        const data = await res.json()

        if (res.ok && data.success) {
          // Thành công → về dashboard
          router.replace('/dashboard')
        } else {
          // Thiết bị không khớp
          setError(data.error || 'Thiết bị không được phép.')
          setChecking(false)
        }
      } catch (err) {
        console.error('[DeviceCheck] Error:', err)
        setError('Đã xảy ra lỗi khi xác minh thiết bị.')
        setChecking(false)
      }
    }

    checkDevice()
  }, [router])

  if (checking) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <div style={spinnerStyle} />
          <h2 style={titleStyle}>Đang kết nối...</h2>
          <p style={subtitleStyle}>Vui lòng đợi trong giây lát</p>
        </div>
      </div>
    )
  }

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <div style={{ fontSize: '56px', marginBottom: '16px' }}>🚫</div>
        <h2 style={{ ...titleStyle, color: '#dc2626' }}>Thiết bị không được phép</h2>
        <p style={subtitleStyle}>{error}</p>
        <button
          onClick={() => { window.location.href = '/login' }}
          style={buttonStyle}
        >
          Quay về đăng nhập
        </button>
      </div>
    </div>
  )
}

const containerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '100vh',
  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  fontFamily: 'system-ui, -apple-system, sans-serif',
}

const cardStyle: React.CSSProperties = {
  background: 'white',
  borderRadius: '20px',
  padding: '48px 40px',
  maxWidth: '420px',
  width: '90%',
  textAlign: 'center',
  boxShadow: '0 25px 60px rgba(0, 0, 0, 0.3)',
}

const spinnerStyle: React.CSSProperties = {
  width: '48px',
  height: '48px',
  border: '4px solid #e2e8f0',
  borderTopColor: '#6366f1',
  borderRadius: '50%',
  animation: 'spin 0.8s linear infinite',
  margin: '0 auto 20px',
}

const titleStyle: React.CSSProperties = {
  fontSize: '20px',
  fontWeight: 700,
  color: '#1e293b',
  marginBottom: '8px',
}

const subtitleStyle: React.CSSProperties = {
  fontSize: '14px',
  color: '#64748b',
  lineHeight: 1.6,
  marginBottom: '24px',
}

const buttonStyle: React.CSSProperties = {
  padding: '12px 28px',
  borderRadius: '10px',
  border: 'none',
  background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
  color: 'white',
  fontWeight: 600,
  fontSize: '14px',
  cursor: 'pointer',
  transition: 'transform 0.2s',
}
