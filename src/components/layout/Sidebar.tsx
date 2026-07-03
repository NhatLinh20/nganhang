// src/components/layout/Sidebar.tsx
'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { logout } from '@/app/actions/auth'
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

      { href: '/admin/users', icon: '👥', label: 'Quản lý người dùng' },
      { href: '/admin/courses', icon: '📚', label: 'Quản lý khóa học' },
      { href: '/admin/practice-exams', icon: '🏋️', label: 'Đề luyện tập' },
    ],
  },
  {
    section: 'Đề thi',
    items: [
      { href: '/teacher/exams', icon: '📝', label: 'Tạo đề thi' },
      { href: '/teacher/shuffle', icon: '🔀', label: 'Trộn đề' },
      { href: '/teacher/scan', icon: '📷', label: 'Quét phiếu chấm thi' },
      { href: '/admin/ai-exam', icon: '🤖', label: 'AI tạo đề' },
      { href: '/admin/ai-chat', icon: '💬', label: 'Trợ lý AI' },
      { href: '/admin/tex-processor', icon: '🔧', label: 'Xử lí TeX' },
      { href: '/admin/lesson-builder', icon: '📖', label: 'Tạo bài học' },
      { href: '/admin/slideshow', icon: '🖥️', label: 'Trình chiếu' },
    ],
  },
  {
    section: 'Học tập',
    items: [
      { href: '/student/courses', icon: '📖', label: 'Khóa học' },
      { href: '/student/practice', icon: '📝', label: 'Luyện thi' },
    ],
  },
]

export default function Sidebar({ userRole, userEmail }: SidebarProps) {
  const pathname = usePathname()
  const [isOpen, setIsOpen] = useState(false)

  // Hide mobile header on exam taking page
  const isExamPage = pathname?.match(/^\/student\/practice\/[a-zA-Z0-9-]+$/)

  // Close sidebar on path change (for mobile)
  useEffect(() => {
    setIsOpen(false)
  }, [pathname])

  // Lọc menu theo role
  const visibleNavItems = navItems.map(section => {
    if (userRole === 'teacher') {
      // Giáo viên thấy Ngân hàng câu hỏi + các trang đề thi
      if (section.section === 'Đề thi') {
        return {
          ...section,
          items: section.items.filter(item =>
            item.href === '/admin/ai-exam' ||
            item.href === '/admin/ai-chat' ||
            item.href === '/admin/tex-processor' ||
            item.href === '/teacher/exams' ||
            item.href === '/teacher/shuffle' ||
            item.href === '/teacher/scan' ||
            item.href === '/admin/lesson-builder' ||
            item.href === '/admin/slideshow'
          )
        }
      }
      if (section.section === 'Quản lý') {
        return {
          ...section,
          items: section.items.filter(item => item.href === '/admin/questions')
        }
      }
      // Giáo viên không thấy section Học tập
      if (section.section === 'Học tập') return null
      return null
    }
    if (userRole === 'student') {
      // Học sinh chỉ thấy section Học tập
      if (section.section === 'Học tập') return section
      return null
    }
    if (userRole === 'admin') {
      // Admin thấy tất cả
      return section
    }
    
    // Các role khác không thấy menu
    return null
  }).filter(Boolean) as typeof navItems

  // Hiển thị tên role
  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'admin': return 'Quản trị viên'
      case 'teacher': return 'Giáo viên'
      case 'student': return 'Học sinh'
      default: return role
    }
  }

  return (
    <>
      {/* Mobile Header (Only visible on small screens) */}
      {!isExamPage && (
        <div className={styles.mobileHeader}>
          <div className={styles.mobileHeaderLogo}>
            <div className={styles.mobileLogoIcon}>📐</div>
            <span className={styles.mobileLogoTitle}>Ngân Hàng Toán</span>
          </div>
          <button 
            className={styles.mobileToggle} 
            onClick={() => setIsOpen(!isOpen)}
            aria-label="Toggle menu"
          >
            {isOpen ? '✕' : '☰'}
          </button>
        </div>
      )}

      {/* Overlay for mobile */}
      {isOpen && (
        <div className={styles.overlay} onClick={() => setIsOpen(false)} />
      )}

      <aside className={`${styles.sidebar} ${isOpen ? styles.open : ''}`}>
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
            {getRoleLabel(userRole)}
          </div>
        </div>
        <form action={logout}>
          <button type="submit" className={styles.logoutBtn} title="Đăng xuất">
            🚪
          </button>
        </form>
      </div>
    </aside>
    </>
  )
}
