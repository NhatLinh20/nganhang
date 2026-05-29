'use client'

import { useState, useEffect } from 'react'
import styles from './users.module.css'
import { 
  getUsers, 
  approveUser, 
  rejectUser, 
  revokeUser, 
  toggleUserActive, 
  getLoginLogs, 
  getUserStats,
  upgradeToVip,
  downgradeFromVip,
  UserManagementData,
  LoginLogData
} from '@/app/actions/user-management'

type TabType = 'pending' | 'approved' | 'logs'

export default function UsersClient() {
  const [activeTab, setActiveTab] = useState<TabType>('pending')
  const [search, setSearch] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  
  // Data states
  const [pendingUsers, setPendingUsers] = useState<UserManagementData[]>([])
  const [approvedUsers, setApprovedUsers] = useState<UserManagementData[]>([])
  const [logs, setLogs] = useState<LoginLogData[]>([])
  const [stats, setStats] = useState({ total: 0, pending: 0, approved: 0, suspicious: 0 })
  const [logFilter, setLogFilter] = useState<'all' | 'suspicious'>('all')

  const fetchData = async () => {
    setIsLoading(true)
    try {
      const [pendingRes, approvedRes, logsRes, statsRes] = await Promise.all([
        getUsers('pending'),
        getUsers('approved'),
        getLoginLogs(logFilter),
        getUserStats()
      ])

      if (pendingRes.data) setPendingUsers(pendingRes.data)
      if (approvedRes.data) setApprovedUsers(approvedRes.data)
      if (logsRes.data) setLogs(logsRes.data)
      if (statsRes.stats) setStats(statsRes.stats)
    } catch (err) {
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  // Refetch when tab or logFilter changes
  useEffect(() => {
    fetchData()
  }, [logFilter])

  // Handlers
  const handleApprove = async (id: string) => {
    if (!confirm('Duyệt tài khoản này?')) return
    await approveUser(id)
    fetchData()
  }

  const handleReject = async (id: string) => {
    if (!confirm('Bạn có chắc muốn từ chối và XÓA HẲN tài khoản này?')) return
    await rejectUser(id)
    fetchData()
  }

  const handleRevoke = async (id: string) => {
    if (!confirm('Thu hồi quyền đăng nhập của tài khoản này? (Họ sẽ quay về trạng thái chờ duyệt)')) return
    await revokeUser(id)
    fetchData()
  }

  const handleToggleActive = async (id: string, currentActive: boolean) => {
    const action = currentActive ? 'Khóa' : 'Mở khóa'
    if (!confirm(`Bạn có chắc muốn ${action} tài khoản này?`)) return
    await toggleUserActive(id, !currentActive)
    fetchData()
  }

  const handleUpgradeVip = async (id: string) => {
    if (!confirm('Nâng cấp tài khoản này lên VIP? Họ sẽ không bị giới hạn xuất file và số câu hỏi.')) return
    const res = await upgradeToVip(id)
    if (res.error) alert('Lỗi: ' + res.error)
    fetchData()
  }

  const handleDowngradeVip = async (id: string) => {
    if (!confirm('Hạ tài khoản VIP này về Giáo viên? Họ sẽ bị giới hạn trở lại.')) return
    const res = await downgradeFromVip(id)
    if (res.error) alert('Lỗi: ' + res.error)
    fetchData()
  }

  // Format date
  const formatDate = (isoString: string) => {
    const d = new Date(isoString)
    return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  const formatDateTime = (isoString: string) => {
    const d = new Date(isoString)
    return d.toLocaleString('vi-VN', { 
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      day: '2-digit', month: '2-digit', year: 'numeric' 
    })
  }

  // Filtered Data based on Search
  const searchLower = search.toLowerCase()
  const filteredPending = pendingUsers.filter(u => 
    u.full_name.toLowerCase().includes(searchLower) || u.email.toLowerCase().includes(searchLower)
  )
  const filteredApproved = approvedUsers.filter(u => 
    u.full_name.toLowerCase().includes(searchLower) || u.email.toLowerCase().includes(searchLower)
  )
  const filteredLogs = logs.filter(l => 
    l.users?.full_name?.toLowerCase().includes(searchLower) || l.users?.email?.toLowerCase().includes(searchLower) || l.ip_address.includes(searchLower)
  )

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Quản lý người dùng</h1>
        <div className={styles.stats}>
          <div className={styles.statItem}>Tổng: <span className={styles.statValue}>{stats.total}</span></div>
          <div className={styles.statItem}>Chờ duyệt: <span className={styles.statValue}>{stats.pending}</span></div>
          <div className={styles.statItem}>Đã duyệt: <span className={styles.statValue}>{stats.approved}</span></div>
          <div className={styles.statItem}>Đáng ngờ: <span className={styles.statValue} style={{color: 'var(--color-error-600)'}}>{stats.suspicious}</span></div>
        </div>
      </header>

      <div className={styles.toolbar}>
        <div className={styles.tabs}>
          <button 
            className={`${styles.tab} ${activeTab === 'pending' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('pending')}
          >
            ⏳ Chờ duyệt 
            {stats.pending > 0 && <span className={styles.tabBadge}>{stats.pending}</span>}
          </button>
          <button 
            className={`${styles.tab} ${activeTab === 'approved' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('approved')}
          >
            ✅ Đã duyệt
          </button>
          <button 
            className={`${styles.tab} ${activeTab === 'logs' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('logs')}
          >
            📋 Lịch sử đăng nhập
          </button>
        </div>

        <div className={styles.searchBox}>
          <span>🔍</span>
          <input 
            type="text" 
            placeholder="Tìm tên, email..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {activeTab === 'logs' && (
        <div style={{ marginBottom: '1rem', display: 'flex', gap: '1rem' }}>
          <label style={{ fontSize: '14px', cursor: 'pointer' }}>
            <input type="radio" name="logFilter" checked={logFilter === 'all'} onChange={() => setLogFilter('all')} /> Tất cả
          </label>
          <label style={{ fontSize: '14px', cursor: 'pointer', color: 'var(--color-error-600)', fontWeight: 'bold' }}>
            <input type="radio" name="logFilter" checked={logFilter === 'suspicious'} onChange={() => setLogFilter('suspicious')} /> Chỉ đáng ngờ
          </label>
        </div>
      )}

      <div className={styles.tableWrapper}>
        {isLoading ? (
          <div className={styles.emptyState}>⏳ Đang tải dữ liệu...</div>
        ) : (
          <table className={styles.table}>
            {/* TAB: CHỜ DUYỆT */}
            {activeTab === 'pending' && (
              <>
                <thead>
                  <tr>
                    <th>Người dùng</th>
                    <th>Email</th>
                    <th>Phương thức</th>
                    <th>Ngày đăng ký</th>
                    <th>Hành động</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPending.length === 0 ? (
                    <tr><td colSpan={5} className={styles.emptyState}>✨ Không có tài khoản nào chờ duyệt</td></tr>
                  ) : filteredPending.map(u => (
                    <tr key={u.id}>
                      <td>
                        <div className={styles.userInfo}>
                          <div className={styles.avatar}>{u.full_name.charAt(0).toUpperCase()}</div>
                          <div className={styles.userName}>{u.full_name}</div>
                        </div>
                      </td>
                      <td>{u.email}</td>
                      <td><span className="badge badge-H">{u.provider === 'google' ? 'Google' : 'Email'}</span></td>
                      <td>{formatDate(u.created_at)}</td>
                      <td>
                        <div className={styles.actions}>
                          <button className={`${styles.actionBtn} ${styles.btnApprove}`} onClick={() => handleApprove(u.id)}>✅ Duyệt</button>
                          <button className={`${styles.actionBtn} ${styles.btnReject}`} onClick={() => handleReject(u.id)}>❌ Từ chối</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </>
            )}

            {/* TAB: ĐÃ DUYỆT */}
            {activeTab === 'approved' && (
              <>
                <thead>
                  <tr>
                    <th>Người dùng</th>
                    <th>Email</th>
                    <th>Vai trò</th>
                    <th>Trạng thái</th>
                    <th>Ngày duyệt</th>
                    <th>Hành động</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredApproved.length === 0 ? (
                    <tr><td colSpan={6} className={styles.emptyState}>Chưa có người dùng nào</td></tr>
                  ) : filteredApproved.map(u => (
                    <tr key={u.id}>
                      <td>
                        <div className={styles.userInfo}>
                          <div className={styles.avatar}>{u.full_name.charAt(0).toUpperCase()}</div>
                          <div className={styles.userName}>{u.full_name}</div>
                        </div>
                      </td>
                      <td>{u.email}</td>
                      <td>
                        <span className={u.role === 'admin' ? 'badge badge-V' : u.role === 'vip' ? 'badge badge-C' : 'badge badge-N'}>
                          {u.role === 'admin' ? 'Admin' : u.role === 'vip' ? 'VIP 👑' : 'Giáo viên'}
                        </span>
                      </td>
                      <td>
                        <span className={`${styles.dot} ${u.is_active ? styles.dotActive : styles.dotInactive}`}></span>
                        {u.is_active ? 'Đang hoạt động' : 'Bị khóa'}
                      </td>
                      <td>{formatDate(u.updated_at)}</td>
                      <td>
                        {u.role !== 'admin' && (
                          <div className={styles.actions}>
                            {u.role === 'teacher' && (
                              <button className={`${styles.actionBtn} ${styles.btnVip}`} onClick={() => handleUpgradeVip(u.id)}>
                                ⭐ Nâng VIP
                              </button>
                            )}
                            {u.role === 'vip' && (
                              <button className={`${styles.actionBtn} ${styles.btnWarning}`} onClick={() => handleDowngradeVip(u.id)}>
                                ↩ Hạ VIP
                              </button>
                            )}
                            <button 
                              className={`${styles.actionBtn} ${u.is_active ? styles.btnWarning : styles.btnApprove}`}
                              onClick={() => handleToggleActive(u.id, u.is_active)}
                            >
                              {u.is_active ? '🔒 Khóa' : '🔓 Mở khóa'}
                            </button>
                            <button className={`${styles.actionBtn} ${styles.btnReject}`} onClick={() => handleRevoke(u.id)}>
                              ❌ Thu hồi
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </>
            )}

            {/* TAB: LOGS */}
            {activeTab === 'logs' && (
              <>
                <thead>
                  <tr>
                    <th>Người dùng</th>
                    <th>Địa chỉ IP / Vị trí</th>
                    <th>Trạng thái</th>
                    <th>Thiết bị</th>
                    <th>Thời gian</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.length === 0 ? (
                    <tr><td colSpan={5} className={styles.emptyState}>Không có dữ liệu đăng nhập</td></tr>
                  ) : filteredLogs.map(l => (
                    <tr key={l.id} className={l.is_suspicious ? styles.suspiciousRow : ''}>
                      <td>
                        <div className={styles.userInfo}>
                          <div className={styles.avatar}>{l.users?.full_name?.charAt(0).toUpperCase() || '?'}</div>
                          <div>
                            <div className={styles.userName}>{l.users?.full_name || 'Unknown'}</div>
                            <div className={styles.userEmail}>{l.users?.email}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', display: 'inline-block', fontSize: '12px' }}>{l.ip_address}</div>
                        <div style={{ fontSize: '12px', color: 'var(--color-gray-500)', marginTop: '4px' }}>🌍 {l.city}, {l.country}</div>
                      </td>
                      <td>
                        {l.is_suspicious ? (
                          <div>
                            <span className="badge badge-C">⚠️ Đáng ngờ</span>
                            {l.suspicious_reasons && l.suspicious_reasons.map((r, i) => (
                              <div key={i} className={styles.suspiciousReasons}>• {r}</div>
                            ))}
                          </div>
                        ) : (
                          <span className="badge badge-N">✅ Bình thường</span>
                        )}
                      </td>
                      <td style={{ fontSize: '12px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={l.user_agent}>
                        💻 {l.user_agent.split(' ')[0]} {/* Lấy chữ đầu tiên của user-agent cho gọn */}
                      </td>
                      <td style={{ fontSize: '13px' }}>{formatDateTime(l.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </>
            )}
          </table>
        )}
      </div>
    </div>
  )
}
