// src/app/(dashboard)/admin/stats/page.tsx
'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Header from '@/components/layout/Header'

interface Stats {
  total: number
  by_grade: Record<string, number>
  by_type: Record<string, number>
  by_difficulty: Record<string, number>
  by_subject: Record<string, number>
}

const DIFFICULTY_LABELS: Record<string, string> = { N: 'Nhận biết', H: 'Thông hiểu', V: 'Vận dụng', C: 'Vận dụng cao' }
const DIFFICULTY_COLORS: Record<string, string> = { N: '#22c55e', H: '#3b82f6', V: '#f59e0b', C: '#ef4444' }
const TYPE_LABELS: Record<string, string> = { multiple_choice: 'Trắc nghiệm', true_false: 'Đúng/Sai', short_answer: 'Trả lời kết quả', essay: 'Tự luận' }
const SUBJECT_LABELS: Record<string, string> = { D: 'Đại số', H: 'Hình học', C: 'Chuyên đề' }

export default function StatsPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function fetchStats() {
      const { data } = await supabase.from('questions').select('grade, question_type, difficulty, subject_area').eq('is_active', true)
      if (!data) { setLoading(false); return }

      const by_grade: Record<string, number> = {}
      const by_type: Record<string, number> = {}
      const by_difficulty: Record<string, number> = {}
      const by_subject: Record<string, number> = {}

      for (const q of data) {
        by_grade[q.grade] = (by_grade[q.grade] || 0) + 1
        by_type[q.question_type] = (by_type[q.question_type] || 0) + 1
        by_difficulty[q.difficulty] = (by_difficulty[q.difficulty] || 0) + 1
        by_subject[q.subject_area] = (by_subject[q.subject_area] || 0) + 1
      }

      setStats({ total: data.length, by_grade, by_type, by_difficulty, by_subject })
      setLoading(false)
    }
    fetchStats()
  }, [])

  const StatCard = ({ label, value, color }: { label: string; value: number; color?: string }) => (
    <div style={{
      background: 'white',
      borderRadius: 'var(--radius-lg)',
      border: '1px solid var(--color-gray-200)',
      padding: 'var(--space-5)',
    }}>
      <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color: color || 'var(--color-gray-900)' }}>
        {value.toLocaleString()}
      </div>
      <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-gray-500)', marginTop: '4px' }}>{label}</div>
    </div>
  )

  const BarGroup = ({ data, labels, colors }: { data: Record<string, number>; labels: Record<string, string>; colors?: Record<string, string> }) => {
    const max = Math.max(...Object.values(data), 1)
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        {Object.entries(data).sort((a, b) => b[1] - a[1]).map(([key, val]) => (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <span style={{ width: '110px', fontSize: 'var(--text-sm)', color: 'var(--color-gray-700)', flexShrink: 0 }}>
              {labels[key] || key}
            </span>
            <div style={{ flex: 1, background: 'var(--color-gray-100)', borderRadius: '4px', height: '24px' }}>
              <div style={{
                width: `${(val / max) * 100}%`,
                background: colors?.[key] || 'var(--color-primary-500)',
                height: '100%',
                borderRadius: '4px',
                transition: 'width 0.5s ease',
                minWidth: '4px',
              }} />
            </div>
            <span style={{ width: '60px', textAlign: 'right', fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-gray-800)' }}>
              {val.toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <>
      <Header title="Thống kê ngân hàng" subtitle="Tổng quan phân bổ câu hỏi" />
      <div className="page-body">
        {loading ? (
          <div style={{ textAlign: 'center', padding: 'var(--space-16)', color: 'var(--color-gray-400)' }}>
            ⏳ Đang tải...
          </div>
        ) : !stats ? (
          <div style={{ textAlign: 'center', padding: 'var(--space-16)', color: 'var(--color-gray-400)' }}>
            Chưa có dữ liệu
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
            {/* Summary cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-4)' }}>
              <StatCard label="Tổng câu hỏi" value={stats.total} color="var(--color-primary-600)" />
              <StatCard label="Lớp 12" value={stats.by_grade['12'] || 0} />
              <StatCard label="Lớp 11" value={stats.by_grade['11'] || 0} />
              <StatCard label="Lớp 10" value={stats.by_grade['10'] || 0} />
            </div>

            {/* Charts grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-6)' }}>
              <div className="card">
                <div className="card-header">
                  <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 600 }}>Theo mức độ</h3>
                </div>
                <div className="card-body">
                  <BarGroup data={stats.by_difficulty} labels={DIFFICULTY_LABELS} colors={DIFFICULTY_COLORS} />
                </div>
              </div>

              <div className="card">
                <div className="card-header">
                  <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 600 }}>Theo loại câu hỏi</h3>
                </div>
                <div className="card-body">
                  <BarGroup data={stats.by_type} labels={TYPE_LABELS} />
                </div>
              </div>

              <div className="card">
                <div className="card-header">
                  <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 600 }}>Theo phân môn</h3>
                </div>
                <div className="card-body">
                  <BarGroup data={stats.by_subject} labels={SUBJECT_LABELS} />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
