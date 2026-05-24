// src/app/(auth)/pending/page.tsx
'use client'

import { logout } from '@/app/actions/auth'
import styles from './pending.module.css'

export default function PendingPage() {
  return (
    <div className={styles.page}>
      <div className={styles.bgGrid} />

      <div className={styles.card}>
        <div className={styles.iconWrapper}>
          ⏳
        </div>
        
        <h1 className={styles.title}>Tài khoản đang chờ duyệt</h1>
        
        <p className={styles.desc}>
          Cảm ơn bạn đã đăng ký tham gia Ngân Hàng Toán. Tài khoản của bạn hiện đang ở trạng thái chờ Quản trị viên phê duyệt để đảm bảo an toàn hệ thống.
        </p>

        <div className={styles.contactBox}>
          <div className={styles.contactLabel}>Liên hệ hỗ trợ duyệt nhanh</div>
          <div className={styles.zaloNumber}>
            <span style={{ color: '#0068ff' }}>Zalo:</span> 0812878792
          </div>
        </div>

        <form action={logout}>
          <button type="submit" className={`btn btn-secondary btn-lg ${styles.logoutBtn}`}>
            Đăng xuất
          </button>
        </form>
      </div>
    </div>
  )
}
