// src/components/layout/Sidebar.tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import styles from './Sidebar.module.css'

const navItems = [
  {
    section: 'Quản lý',
    items: [
      { href: '/admin/questions', icon: '📚', label: 'Ngân hàng câu hỏi' },
      { href: '/admin/import', icon: '📥', label: 'Import file .tex' },
      { href: '/admin/stats', icon: '📊', label: 'Thống kê' },
      { href: '/admin/users', icon: '👥', label: 'Quản lý người dùng' },
    ],
  },
  {
    section: 'Đề thi',
    items: [
      { href: '/teacher/exams', icon: '📝', label: 'Tạo đề thi' },
      { href: '/teacher/shuffle', icon: '🔀', label: 'Trộn đề' },
      { href: '/teacher/export', icon: '📄', label: 'Xuất file LaTeX / PDF' },
      { href: '/admin/ai-exam', icon: '🤖', label: 'AI chọn câu theo ma trận' },
    ],
  },
]

export default function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className={styles.sidebar}>
      {/* Logo */}
      <div className={styles.logo}>
        <div className={styles.logoIcon}>📐</div>
        <div className={styles.logoText}>
          <span className={styles.logoTitle}>Ngân Hàng Toán</span>
          <span className={styles.logoSub}>THPT • 50.000+ câu</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className={styles.nav}>
        {navItems.map((section) => (
          <div key={section.section}>
            <div className={styles.sectionLabel}>{section.section}</div>
            {section.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`${styles.navItem} ${
                  pathname.startsWith(item.href) ? styles.navItemActive : ''
                }`}
              >
                <span className={styles.navIcon}>{item.icon}</span>
                {item.label}
              </Link>
            ))}
          </div>
        ))}
      </nav>

      {/* User */}
      <div className={styles.userSection}>
        <div className={styles.userAvatar}>A</div>
        <div className={styles.userInfo}>
          <div className={styles.userName}>Admin</div>
          <div className={styles.userRole}>Quản trị viên</div>
        </div>
      </div>
    </aside>
  )
}
