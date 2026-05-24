// src/components/SessionGuardian.tsx
// Ngăn đăng nhập đồng thời trên nhiều thiết bị
// Sử dụng Supabase Realtime để theo dõi thay đổi active_session_id
'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

interface SessionGuardianProps {
  userId: string
  sessionId: string
}

export default function SessionGuardian({ userId, sessionId }: SessionGuardianProps) {
  const [showWarning, setShowWarning] = useState(false)
  const [countdown, setCountdown] = useState(10)

  const handleForceLogout = useCallback(async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/login?reason=session_replaced'
  }, [])

  useEffect(() => {
    if (!userId || !sessionId) return

    const supabase = createClient()

    // Subscribe thay đổi trên bảng users (dòng của user hiện tại)
    const channel = supabase
      .channel(`session-guard-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'users',
          filter: `id=eq.${userId}`,
        },
        (payload) => {
          const newSessionId = payload.new?.active_session_id
          // Nếu active_session_id thay đổi → thiết bị khác đã login
          if (newSessionId && newSessionId !== sessionId) {
            setShowWarning(true)
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId, sessionId])

  // Countdown auto-logout
  useEffect(() => {
    if (!showWarning) return

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          handleForceLogout()
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [showWarning, handleForceLogout])

  if (!showWarning) return null

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div style={iconStyle}>⚠️</div>
        <h2 style={titleStyle}>Phiên đăng nhập bị thay thế</h2>
        <p style={messageStyle}>
          Tài khoản của bạn vừa được đăng nhập trên một thiết bị khác.
          Phiên làm việc hiện tại sẽ bị đăng xuất.
        </p>
        <p style={countdownStyle}>
          Tự động đăng xuất sau <strong>{countdown}</strong> giây
        </p>
        <button onClick={handleForceLogout} style={buttonStyle}>
          Đăng xuất ngay
        </button>
      </div>
    </div>
  )
}

// Inline styles (không dùng CSS module vì component này hiển thị ở mọi trang)
const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.7)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 99999,
  backdropFilter: 'blur(4px)',
}

const modalStyle: React.CSSProperties = {
  background: 'white',
  borderRadius: '16px',
  padding: '40px',
  maxWidth: '420px',
  width: '90%',
  textAlign: 'center',
  boxShadow: '0 25px 50px rgba(0, 0, 0, 0.3)',
  animation: 'fadeIn 0.3s ease',
}

const iconStyle: React.CSSProperties = {
  fontSize: '48px',
  marginBottom: '16px',
}

const titleStyle: React.CSSProperties = {
  fontSize: '20px',
  fontWeight: 700,
  color: '#dc2626',
  marginBottom: '12px',
}

const messageStyle: React.CSSProperties = {
  fontSize: '14px',
  color: '#4b5563',
  lineHeight: 1.6,
  marginBottom: '16px',
}

const countdownStyle: React.CSSProperties = {
  fontSize: '14px',
  color: '#9ca3af',
  marginBottom: '20px',
}

const buttonStyle: React.CSSProperties = {
  padding: '10px 24px',
  borderRadius: '8px',
  border: 'none',
  background: '#dc2626',
  color: 'white',
  fontWeight: 600,
  fontSize: '14px',
  cursor: 'pointer',
}
