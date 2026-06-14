'use client'

import { useEffect } from 'react'

export default function ServerPrewarmer() {
  useEffect(() => {
    // Kỹ thuật "Pre-warming" (Ping to Wake)
    // Gửi 1 request siêu nhẹ tới server AI để đánh thức nó khỏi chế độ ngủ
    // giúp lần quét ảnh đầu tiên diễn ra cực nhanh (< 1 giây)
    const wakeUpServer = async () => {
      try {
        await fetch('/api/scan-omr/health', {
          method: 'GET',
          cache: 'no-store' // Đảm bảo luôn gửi request thật
        })
        console.log('[OMR] Server pre-warmed successfully')
      } catch (err) {
        console.log('[OMR] Server pre-warm request sent')
      }
    }

    // Đánh thức ngay lập tức khi vừa vào Dashboard
    wakeUpServer()

    // Giữ cho server luôn thức (Keep-alive)
    // Cứ mỗi 10 phút gọi lại 1 lần (Render ngủ sau 15 phút)
    const interval = setInterval(wakeUpServer, 10 * 60 * 1000)

    return () => clearInterval(interval)
  }, [])

  return null // Component này chạy ngầm, không hiển thị gì cả
}
