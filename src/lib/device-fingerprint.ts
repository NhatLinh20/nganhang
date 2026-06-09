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
 * Ưu tiên (Đã cập nhật logic mới để đảm bảo tính ổn định):
 * 1. localStorage (Nếu đã có mã lưu từ lần đăng nhập trước, dùng luôn để chống việc đổi mã do update trình duyệt)
 * 2. FingerprintJS visitorId (Dùng để tạo mới nếu localStorage trống)
 * 3. Tạo UUID ngẫu nhiên (Nếu FingerprintJS bị block bởi Ad-blocker)
 */
export async function getDeviceFingerprint(): Promise<string> {
  if (typeof window === 'undefined') {
    return ''
  }

  // 1. Ưu tiên đọc từ localStorage TRƯỚC để đảm bảo tính ổn định.
  // Tránh trường hợp FingerprintJS sinh ra mã mới (do trình duyệt update, đổi setting) làm ghi đè mã cũ.
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) return stored
  } catch {
    // localStorage bị block, bỏ qua
  }

  let deviceId = ''

  // 2. Nếu chưa có, thử dùng FingerprintJS
  try {
    const FingerprintJS = await import('@fingerprintjs/fingerprintjs')
    const fp = await FingerprintJS.load()
    const result = await fp.get()
    
    if (result.visitorId) {
      deviceId = result.visitorId
    }
  } catch (err) {
    console.warn('[DeviceFingerprint] FingerprintJS failed, falling back to UUID:', err)
  }

  // 3. Fallback: Nếu FingerprintJS thất bại hoặc bị block, tạo UUID ngẫu nhiên
  if (!deviceId) {
    deviceId = crypto.randomUUID()
  }

  // 4. Lưu lại vào localStorage cho các lần đăng nhập sau
  try {
    localStorage.setItem(STORAGE_KEY, deviceId)
  } catch {
    // Ignore nếu trình duyệt block
  }

  return deviceId
}
