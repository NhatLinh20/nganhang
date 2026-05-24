// src/lib/auth-logger.ts
// Ghi log đăng nhập và phát hiện đăng nhập bất thường (Anomaly Detection)

import { createAdminClient } from './supabase/server'

interface LoginLogData {
  ip_address: string
  country?: string
  city?: string
  isp?: string
  timezone?: string
  user_agent: string
}

interface GeoInfo {
  country: string
  city: string
  isp: string
  timezone: string
}

/**
 * Truy vấn thông tin địa lý từ IP (sử dụng ip-api.com)
 */
async function getGeoFromIP(ip: string): Promise<GeoInfo | null> {
  try {
    // Bỏ qua localhost / private IPs
    if (ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
      return { country: 'Local', city: 'Local', isp: 'Local', timezone: 'Local' }
    }

    const res = await fetch(`http://ip-api.com/json/${ip}?fields=country,city,isp,timezone`, {
      signal: AbortSignal.timeout(5000), // Timeout 5s
    })

    if (!res.ok) return null

    const data = await res.json()
    return {
      country: data.country || 'Unknown',
      city: data.city || 'Unknown',
      isp: data.isp || 'Unknown',
      timezone: data.timezone || 'Unknown',
    }
  } catch {
    return null
  }
}

/**
 * So sánh với lịch sử đăng nhập để phát hiện bất thường
 */
async function detectAnomaly(
  userId: string,
  currentLog: LoginLogData
): Promise<{ isSuspicious: boolean; reasons: string[] }> {
  const supabaseAdmin = createAdminClient()
  const reasons: string[] = []

  // Lấy 10 log gần nhất
  const { data: recentLogs } = await supabaseAdmin
    .from('login_logs')
    .select('ip_address, country, city, user_agent, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(10)

  if (!recentLogs || recentLogs.length < 3) {
    // Chưa đủ lịch sử để so sánh
    return { isSuspicious: false, reasons: [] }
  }

  // 1. IP mới hoàn toàn
  const knownIPs = new Set(recentLogs.map((l: { ip_address: string }) => l.ip_address))
  if (currentLog.ip_address && !knownIPs.has(currentLog.ip_address)) {
    reasons.push('Địa chỉ IP mới hoàn toàn')
  }

  // 2. Quốc gia khác với các quốc gia đã từng đăng nhập
  if (currentLog.country) {
    const knownCountries = new Set(recentLogs.map((l: { country: string }) => l.country).filter(Boolean))
    if (knownCountries.size > 0 && !knownCountries.has(currentLog.country)) {
      reasons.push(`Đăng nhập từ quốc gia mới: ${currentLog.country}`)
    }
  }

  // 3. Nhiều IP khác nhau trong vòng 1 giờ
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const recentOneHour = recentLogs.filter(
    (l: { created_at: string }) => l.created_at > oneHourAgo
  )
  const recentIPs = new Set(recentOneHour.map((l: { ip_address: string }) => l.ip_address))
  if (currentLog.ip_address) recentIPs.add(currentLog.ip_address)
  if (recentIPs.size >= 3) {
    reasons.push(`${recentIPs.size} IP khác nhau trong vòng 1 giờ`)
  }

  // 4. User-agent hoàn toàn lạ
  if (currentLog.user_agent) {
    const knownAgents = new Set(recentLogs.map((l: { user_agent: string }) => l.user_agent).filter(Boolean))
    if (knownAgents.size > 0 && !knownAgents.has(currentLog.user_agent)) {
      reasons.push('Thiết bị / trình duyệt mới')
    }
  }

  return {
    isSuspicious: reasons.length > 0,
    reasons,
  }
}

/**
 * Ghi log đăng nhập — gọi sau khi đăng nhập thành công
 * @param userId - ID người dùng
 * @param ip - Địa chỉ IP client
 * @param userAgent - User-Agent header
 */
export async function logLoginInternal(
  userId: string,
  ip: string,
  userAgent: string
): Promise<void> {
  try {
    const supabaseAdmin = createAdminClient()

    // Lấy thông tin địa lý
    const geo = await getGeoFromIP(ip)

    const logData: LoginLogData = {
      ip_address: ip,
      country: geo?.country,
      city: geo?.city,
      isp: geo?.isp,
      timezone: geo?.timezone,
      user_agent: userAgent,
    }

    // Phát hiện bất thường
    const anomaly = await detectAnomaly(userId, logData)

    // Ghi vào database
    await supabaseAdmin.from('login_logs').insert({
      user_id: userId,
      ip_address: logData.ip_address,
      country: logData.country,
      city: logData.city,
      isp: logData.isp,
      timezone: logData.timezone,
      user_agent: logData.user_agent,
      is_suspicious: anomaly.isSuspicious,
      suspicious_reasons: anomaly.reasons.length > 0 ? anomaly.reasons : null,
    })
  } catch (error) {
    // Không throw lỗi để không ảnh hưởng đến flow đăng nhập
    console.error('[Auth Logger] Lỗi ghi log đăng nhập:', error)
  }
}
