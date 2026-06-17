// src/components/LimitModal.tsx
// Modal popup hiển thị khi teacher bị chặn bởi giới hạn xuất file
'use client'

import styles from './LimitModal.module.css'

type LimitReason =
  | 'bank_export'      // Click xuất ở trang Ngân hàng
  | 'daily_limit'      // Hết lượt xuất file trong ngày
  | 'question_limit'   // Vượt giới hạn số câu hỏi
  | 'lesson_limit'     // Hết lượt xuất bài học trong tháng
  | 'generic'          // Chung chung

interface LimitModalProps {
  isOpen: boolean
  onClose: () => void
  reason?: LimitReason
  detail?: string // Thông tin thêm (VD: "TN 22/20, Đ/S 5/4")
}

export default function LimitModal({ isOpen, onClose, detail }: LimitModalProps) {
  if (!isOpen) return null

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <button className={styles.closeBtn} onClick={onClose}>✕</button>

        <div className={styles.icon}>⚠️</div>
        <div className={styles.title}>Đã đạt giới hạn</div>

        <div className={styles.reason}>
          Tính năng đã đạt giới hạn, liên hệ admin để được hỗ trợ.
          {detail && <><br />{detail}</>}
        </div>
      </div>
    </div>
  )
}
