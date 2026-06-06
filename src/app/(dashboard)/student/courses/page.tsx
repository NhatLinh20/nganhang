// src/app/(dashboard)/student/courses/page.tsx
// Trang Khóa học cho Học sinh — placeholder
import { redirect } from 'next/navigation'
import { getProfile } from '@/lib/supabase/roles'
import styles from './courses.module.css'

export const metadata = {
  title: 'Khóa học - Ngân Hàng Toán',
}

export default async function CoursesPage() {
  const profile = await getProfile()
  
  // Chỉ Student và Admin được vào
  if (profile && profile.role !== 'student' && profile.role !== 'admin') {
    redirect('/dashboard')
  }

  const previewCourses = [
    { icon: '📐', title: 'Hình học không gian', desc: 'Lớp 12 - Đại cương, mặt phẳng, đường thẳng' },
    { icon: '📊', title: 'Tổ hợp & Xác suất', desc: 'Lớp 11 - Hoán vị, chỉnh hợp, tổ hợp' },
    { icon: '📈', title: 'Hàm số & Đồ thị', desc: 'Lớp 12 - Khảo sát, cực trị, tiệm cận' },
    { icon: '🔢', title: 'Nguyên hàm & Tích phân', desc: 'Lớp 12 - Tính tích phân, ứng dụng' },
    { icon: '📏', title: 'Lượng giác', desc: 'Lớp 11 - Hàm lượng giác, phương trình' },
    { icon: '🧮', title: 'Số phức', desc: 'Lớp 12 - Phép toán, dạng đại số, lượng giác' },
  ]

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <span className={styles.headerIcon}>🚧</span>
        <span className={styles.comingSoonBadge}>
          ✨ Sắp ra mắt
        </span>
        <h1 className={styles.title}>Khóa học Toán THPT</h1>
        <p className={styles.subtitle}>
          Tính năng Khóa học đang được phát triển. Bạn sẽ sớm có thể truy cập các bài học, 
          luyện đề thi và theo dõi kết quả học tập tại đây.
        </p>
      </header>

      <div className={styles.previewGrid}>
        {previewCourses.map((course, idx) => (
          <div key={idx} className={styles.previewCard}>
            <div className={styles.cardIcon}>{course.icon}</div>
            <div className={styles.cardTitle}>{course.title}</div>
            <div className={styles.cardDesc}>{course.desc}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
