// src/components/VipModal.tsx
// Modal popup đẹp hiển thị khi teacher bị chặn bởi giới hạn
'use client'

import { useState } from 'react'
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
          <div className={styles.contactLabel}>📱 Quét mã Zalo để nâng cấp ngay:</div>
          <div className={styles.qrContainer}>
            <img 
              src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=https://zalo.me/${TEACHER_LIMITS.ADMIN_PHONE}&margin=1`} 
              alt="Zalo QR Code" 
              className={styles.qrCode} 
            />
          </div>
          
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
