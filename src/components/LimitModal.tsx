// src/components/LimitModal.tsx
// Modal popup hiển thị khi teacher bị chặn bởi giới hạn xuất file
'use client'

import { useState } from 'react'
import styles from './LimitModal.module.css'
import { TEACHER_LIMITS } from '@/lib/export-limiter'

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

const REASON_MESSAGES: Record<LimitReason, string> = {
  bank_export: '🔒 Tính năng xuất ngân hàng câu hỏi bị giới hạn. Liên hệ Admin để được hỗ trợ.',
  daily_limit: `⏰ Bạn đã hết lượt xuất file hôm nay (${TEACHER_LIMITS.MAX_EXPORTS_PER_DAY}/${TEACHER_LIMITS.MAX_EXPORTS_PER_DAY}). Liên hệ Admin để được mở giới hạn.`,
  question_limit: '📊 Bạn đã vượt quá giới hạn số câu hỏi cho tài khoản giáo viên.',
  lesson_limit: `📖 Bạn đã hết lượt xuất bài học trong tháng này (${TEACHER_LIMITS.MAX_LESSONS_PER_MONTH}/${TEACHER_LIMITS.MAX_LESSONS_PER_MONTH}). Liên hệ Admin để được mở giới hạn.`,
  generic: '🔒 Tính năng này bị giới hạn. Liên hệ Admin để được hỗ trợ.',
}

export default function LimitModal({ isOpen, onClose, reason = 'generic', detail }: LimitModalProps) {
  const [copied, setCopied] = useState(false)

  if (!isOpen) return null

  const handleCopy = () => {
    navigator.clipboard.writeText(TEACHER_LIMITS.ADMIN_PHONE)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <button className={styles.closeBtn} onClick={onClose}>✕</button>

        <div className={styles.icon}>⚠️</div>
        <div className={styles.title}>Đã đạt giới hạn</div>

        <div className={styles.reason}>
          {REASON_MESSAGES[reason]}
          {detail && <><br />{detail}</>}
        </div>

        <div className={styles.divider} />

        <div className={styles.contactSection}>
          <div className={styles.contactLabel}>📱 Liên hệ Admin để được hỗ trợ:</div>
          
          <div className={styles.phoneRow}>
            <span className={styles.phoneNumber}>{TEACHER_LIMITS.ADMIN_PHONE}</span>
            <button className={styles.copyBtn} onClick={handleCopy} title="Copy số điện thoại">
              {copied ? '✅ Đã chép' : '📋 Copy'}
            </button>
          </div>
        </div>

        <div className={styles.actions}>
          <a href={`https://zalo.me/${TEACHER_LIMITS.ADMIN_PHONE}`} target="_blank" rel="noopener noreferrer" className={styles.zaloBtn}>
            💬 Chat Zalo
          </a>
          <a href={`tel:${TEACHER_LIMITS.ADMIN_PHONE}`} className={styles.callBtn}>
            📞 Gọi ngay
          </a>
        </div>
      </div>
    </div>
  )
}
