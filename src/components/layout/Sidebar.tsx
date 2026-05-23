// src/components/layout/Sidebar.tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import styles from './Sidebar.module.css'

interface SidebarProps {
  userRole: string
  userEmail: string
}

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
      { href: '/admin/ai-exam', icon: '🤖', label: 'AI tạo đề' },
    ],
  },
]

export default function Sidebar({ userRole, userEmail }: SidebarProps) {
  const pathname = usePathname()

  // Lọc menu theo role
  const visibleNavItems = navItems.map(section => {
    if (userRole === 'teacher') {
      // Giáo viên thấy mục AI trong Đề thi, và Ngân hàng câu hỏi trong Quản lý
      if (section.section === 'Đề thi') {
        return {
          ...section,
          items: section.items.filter(item => item.href === '/admin/ai-exam' || item.href === '/teacher/exams')
        }
      }
      if (section.section === 'Quản lý') {
        return {
          ...section,
          items: section.items.filter(item => item.href === '/admin/questions')
        }
      }
      return null
    }
    // Admin thấy tất cả
    return section
  }).filter(Boolean) as typeof navItems

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
        {visibleNavItems.map((section) => (
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
        <div className={styles.userAvatar}>
          {userEmail ? userEmail.charAt(0).toUpperCase() : 'U'}
        </div>
        <div className={styles.userInfo}>
          <div className={styles.userName}>
            {userEmail ? userEmail.split('@')[0] : 'User'}
          </div>
          <div className={styles.userRole}>
            {userRole === 'admin' ? 'Quản trị viên' : userRole === 'teacher' ? 'Giáo viên' : 'Học sinh'}
          </div>
        </div>
      </div>
    </aside>
  )
}
