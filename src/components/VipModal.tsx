// src/components/VipModal.tsx
// Modal popup đẹp hiển thị khi teacher bị chặn bởi giới hạn
'use client'

import styles from './VipModal.module.css'
import { TEACHER_LIMITS } from '@/lib/export-limiter'

type VipReason =
  | 'bank_export'      // Click xuất ở trang Ngân hàng
  | 'daily_limit'      // Hết lượt xuất file trong ngày
  | 'question_limit'   // Vượt giới hạn số câu hỏi
  | 'lesson_limit'     // Hết lượt xuất bài học trong tháng
  | 'generic'          // Chung chung

interface VipModalProps {
  isOpen: boolean
  onClose: () => void
  reason?: VipReason
  detail?: string // Thông tin thêm (VD: "TN 22/20, Đ/S 5/4")
}

const REASON_MESSAGES: Record<VipReason, string> = {
  bank_export: '🔒 Tính năng xuất ngân hàng câu hỏi chỉ dành cho tài khoản VIP.',
  daily_limit: `⏰ Bạn đã hết lượt xuất file hôm nay (${TEACHER_LIMITS.MAX_EXPORTS_PER_DAY}/${TEACHER_LIMITS.MAX_EXPORTS_PER_DAY}). Nâng VIP để xuất không giới hạn.`,
  question_limit: '📊 Bạn đã vượt quá giới hạn số câu hỏi cho tài khoản giáo viên.',
  lesson_limit: `📖 Bạn đã hết lượt xuất bài học trong tháng này (${TEACHER_LIMITS.MAX_LESSONS_PER_MONTH}/${TEACHER_LIMITS.MAX_LESSONS_PER_MONTH}). Nâng VIP để xuất không giới hạn.`,
  generic: '🔒 Tính năng này yêu cầu nâng cấp tài khoản VIP.',
}

export default function VipModal({ isOpen, onClose, reason = 'generic', detail }: VipModalProps) {
  if (!isOpen) return null

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <button className={styles.closeBtn} onClick={onClose}>✕</button>

        <div className={styles.crown}>👑</div>
        <div className={styles.title}>Nâng cấp tài khoản VIP</div>

        <div className={styles.reason}>
          {REASON_MESSAGES[reason]}
          {detail && <><br />{detail}</>}
        </div>

        <ul className={styles.benefits}>
          <li className={styles.benefitItem}>
            <span className={styles.benefitIcon}>✅</span>
            Xuất file không giới hạn số lần
          </li>
          <li className={styles.benefitItem}>
            <span className={styles.benefitIcon}>✅</span>
            Tạo đề không giới hạn số câu hỏi
          </li>
          <li className={styles.benefitItem}>
            <span className={styles.benefitIcon}>✅</span>
            Tạo bài học không giới hạn
          </li>
          <li className={styles.benefitItem}>
            <span className={styles.benefitIcon}>✅</span>
            Xuất ngân hàng câu hỏi dạng file .tex
          </li>
        </ul>

        <div className={styles.divider} />

        <div className={styles.contactSection}>
          <div className={styles.contactLabel}>📞 Liên hệ Admin để nâng cấp:</div>
          <div className={styles.phoneNumber}>{TEACHER_LIMITS.ADMIN_PHONE}</div>
        </div>

        <div className={styles.actions}>
          <a href={`tel:${TEACHER_LIMITS.ADMIN_PHONE}`} className={styles.callBtn}>
            📞 Gọi ngay
          </a>
          <button className={styles.closeAction} onClick={onClose}>
            Đóng
          </button>
        </div>
      </div>
    </div>
  )
}
