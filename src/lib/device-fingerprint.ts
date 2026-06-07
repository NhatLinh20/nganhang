// src/lib/device-fingerprint.ts
// Module tạo và quản lý Device Fingerprint
// Kết hợp FingerprintJS + localStorage backup để tăng độ tin cậy

const STORAGE_KEY = 'nganhang_device_id'

export interface DeviceInfo {
  browser: string
  os: string
  screen: string
  platform: string
}

/**
 * Lấy thông tin thiết bị cơ bản (hiển thị cho Admin)
 */
export function getDeviceInfo(): DeviceInfo {
  if (typeof window === 'undefined') {
    return { browser: 'unknown', os: 'unknown', screen: 'unknown', platform: 'unknown' }
  }

  const ua = navigator.userAgent

  // Detect browser
  let browser = 'Unknown'
  if (ua.includes('Firefox/')) browser = 'Firefox'
  else if (ua.includes('Edg/')) browser = 'Edge'
  else if (ua.includes('Chrome/')) browser = 'Chrome'
  else if (ua.includes('Safari/') && !ua.includes('Chrome')) browser = 'Safari'
  else if (ua.includes('Opera') || ua.includes('OPR/')) browser = 'Opera'

  // Detect OS
  let os = 'Unknown'
  if (ua.includes('Windows')) os = 'Windows'
  else if (ua.includes('Mac OS')) os = 'macOS'
  else if (ua.includes('Android')) os = 'Android'
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS'
  else if (ua.includes('Linux')) os = 'Linux'

  // Screen
  const screen = `${window.screen.width}×${window.screen.height}`

  // Platform
  const platform = navigator.platform || 'unknown'

  return { browser, os, screen, platform }
}

/**
 * Lấy device fingerprint — kết hợp FingerprintJS + localStorage backup
 * 
 * Ưu tiên:
 * 1. FingerprintJS visitorId (ổn định nhất)
 * 2. localStorage backup (phòng FingerprintJS lỗi)
 * 3. Tạo UUID mới nếu cả 2 đều không có
 */
export async function getDeviceFingerprint(): Promise<string> {
  if (typeof window === 'undefined') {
    return ''
  }

  // Thử dùng FingerprintJS trước
  try {
    const FingerprintJS = await import('@fingerprintjs/fingerprintjs')
    const fp = await FingerprintJS.load()
    const result = await fp.get()
    const fingerprintId = result.visitorId

    if (fingerprintId) {
      // Lưu backup vào localStorage
      try {
        localStorage.setItem(STORAGE_KEY, fingerprintId)
      } catch {
        // localStorage có thể bị block trong incognito
      }
      return fingerprintId
    }
  } catch (err) {
    console.warn('[DeviceFingerprint] FingerprintJS failed, falling back:', err)
  }

  // Fallback: dùng localStorage
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) return stored
  } catch {
    // localStorage bị block
  }

  // Cuối cùng: tạo UUID mới
  const newId = crypto.randomUUID()
  try {
    localStorage.setItem(STORAGE_KEY, newId)
  } catch {
    // Ignore
  }
  return newId
}
