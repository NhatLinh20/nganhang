// src/app/(dashboard)/admin/questions/QuestionsClient.tsx
'use client'

import { useState, useEffect, useCallback, useRef, Fragment } from 'react'
import { createClient } from '@/lib/supabase/client'
import Header from '@/components/layout/Header'
import type { Question, QuestionFilter, Difficulty, SubjectArea, QuestionType } from '@/types'
import { parseQuestion } from '@/lib/latex-parser'
import styles from './questions.module.css'
import Link from 'next/link'
import { CHAPTER_NAMES, LESSON_NAMES, VARIANT_NAMES } from '@/lib/curriculum-labels'

// Labels
const GRADE_LABELS: Record<number, string> = { 10: 'Lớp 10', 11: 'Lớp 11', 12: 'Lớp 12' }
const SUBJECT_LABELS: Record<string, string> = { D: 'Đại số', H: 'Hình học', C: 'Chuyên đề' }
const DIFFICULTY_LABELS: Record<string, string> = { N: 'Nhận biết', H: 'Thông hiểu', V: 'Vận dụng', C: 'Vận dụng cao' }
const TYPE_LABELS: Record<string, string> = {
  multiple_choice: 'Trắc nghiệm',
  true_false: 'Đúng/Sai',
  short_answer: 'Trả lời kết quả',
  essay: 'Tự luận',
}
const TYPE_ICONS: Record<string, string> = {
  multiple_choice: '🔘',
  true_false: '✅',
  short_answer: '✏️',
  essay: '📝',
}

// Map Chương trình 2018 (Chỉ hiện đúng chương/bài/dạng của từng môn/lớp)
export const CURRICULUM: Record<number, Record<string, Record<number, Record<number, number[]>>>> = {
  10: {
    D: {
      0: { 1: [1,2], 2: [1,2] },
      1: { 1: [1,2], 2: [1,2], 3: [1,2] },
      2: { 1: [1,2,3], 2: [1,2] },
      3: { 1: [1,2,3], 2: [1,2,3] },
      6: { 1: [1,2,3], 2: [1,2,3], 3: [1,2,3], 4: [1,2,3] },
      7: { 1: [1,2,3], 2: [1,2,3], 3: [1,2,3] },
      8: { 1: [1,2,3], 2: [1,2,3,4], 3: [1,2] }
    },
    H: {
      4: { 1: [1,2,3], 2: [1,2,3], 3: [1,2,3] },
      5: { 1: [1,2,3,4,5,6], 2: [1,2,3,4,5,6], 3: [1,2,3,4,5,6,7,8,9], 4: [1,2,3,4,5,6,7] },
      9: { 1: [1,2,3,4,5,6], 2: [1,2,3,4,5,6,7], 3: [1,2,3,4,5,6,7,8,9], 4: [1,2,3,4,5,6,7], 5: [0,1,2,3,4,5,6,7,8,9] }
    },
    C: {
      1: { 1: [1,2,3] },
      2: { 1: [1,2] }
    }
  },
  11: {
    D: {
      1: { 1: [1,2,3,4,5,6], 2: [1,2,3,4,5], 3: [1,2,3,4,5,6,7], 4: [1,2,3,4,5,6,7,8], 5: [1,2,3,4,5,6], 6: [1,2,3,4,5,6,7,8] },
      2: { 1: [1,2,3,4,5,6], 2: [1,2,3,4,5,6,7], 3: [1,2,3,4,5,6,7,8] },
      3: { 1: [1,2,3,4,5,6], 2: [1,2,3,4,5,6,7,8], 3: [1,2,3,4,5,6] },
      5: { 1: [1,2,3,4], 2: [1,2,3] },
      6: { 1: [1,2,3,4], 2: [1,2,3,4,5], 3: [1,2,3,4,5], 4: [1,2,3,4,5,6], 5: [1,2,3,4,5] },
      7: { 1: [1,2,3,4,5], 2: [1,2,3,4,5,6,7,8], 3: [1,2,3] },
      9: { 1: [1,2,3,4], 2: [1,2,3,4,5] }
    },
    H: {
      4: { 1: [1,2,3,4,5,6,7], 2: [1,2,3,4,5,6,7,8], 3: [1,2,3,4,5,6,7,8], 4: [1,2,3,4,5,6,7], 5: [1,2,3,4], 6: [1,2,3,4,5] },
      8: { 1: [1,2,3,4], 2: [1,2,3,4,5,6], 3: [1,2,3], 4: [1,2,3,4,5,6,7], 5: [1,2,3,4,5,6], 6: [1,2,3,4,5,6,7], 7: [1,2,3,4,5,6,7,8,9] }
    },
    C: {
      1: { 1: [1,2,3], 2: [1,2,3], 3: [1,2,3,4], 4: [1,2,3,4], 5: [1,2,3,4], 6: [1,2,3,4], 7: [1,2] },
      2: { 1: [1,2,3], 2: [1,2,3], 3: [1,2] },
      3: { 1: [1,2,3,4], 2: [1,2,3] }
    }
  },
  12: {
    D: {
      1: { 1: [1,2,3,4,5], 2: [1,2,3,4,5,6,7], 3: [1,2,3,4,5,6], 4: [1,2,3,4], 5: [1,2,3,4,5,6,7,8] },
      3: { 1: [1,2,3,4], 2: [1,2,3] },
      4: { 1: [1,2,3,4,5,6], 2: [1,2,3,4,5,6], 3: [1,2,3,4,5] },
      6: { 1: [1,2,3,4], 2: [1,2,3,4] }
    },
    H: {
      2: { 1: [1,2,3,4], 2: [1,2,3,4,5,6] },
      5: { 1: [1,2,3,4,5,6,7], 2: [1,2,3,4,5,6,7,8], 3: [1,2,3,4] }
    }
  }
}

const PAGE_SIZE = 30

export default function QuestionsClient({ userRole }: { userRole: string }) {
  const isAdmin = userRole === 'admin'
  const supabase = createClient()
  const [questions, setQuestions] = useState<Question[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [filter, setFilter] = useState<QuestionFilter>({})
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')

  // State for duplicate cleanup
  const [scanningDups, setScanningDups] = useState(false)
  const [dupCount, setDupCount] = useState<number | null>(null)
  const [showDupModal, setShowDupModal] = useState(false)
  const [deletingDups, setDeletingDups] = useState(false)



  // Debounce search input — chờ gõ xong 300ms mới query
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(timer)
  }, [search])

  // Reset về trang 1 khi tìm kiếm thay đổi
  const prevSearchRef = useRef(debouncedSearch)
  useEffect(() => {
    if (prevSearchRef.current !== debouncedSearch) {
      prevSearchRef.current = debouncedSearch
      setPage(1)
    }
  }, [debouncedSearch])

  // Fetch questions from Supabase (with stale-response guard)
  const fetchIdRef = useRef(0)
  const fetchQuestions = useCallback(async () => {
    setLoading(true)
    const currentFetchId = ++fetchIdRef.current

    const hasFilters = !!(
      filter.grade || filter.subject_area || filter.chapter !== undefined || 
      filter.lesson !== undefined || filter.variant !== undefined || 
      filter.difficulty || filter.question_type || filter.has_image !== undefined || 
      filter.category_code || debouncedSearch
    )

    const applyFilters = (q: any) => {
      let f = q
      if (filter.grade) f = f.eq('grade', filter.grade)
      if (filter.subject_area) f = f.eq('subject_area', filter.subject_area)
      if (filter.chapter !== undefined) f = f.eq('chapter', filter.chapter)
      if (filter.lesson !== undefined) f = f.eq('lesson', filter.lesson)
      if (filter.variant !== undefined) f = f.eq('variant', filter.variant)
      if (filter.difficulty) f = f.eq('difficulty', filter.difficulty)
      if (filter.question_type) f = f.eq('question_type', filter.question_type)
      if (filter.has_image !== undefined) f = f.eq('has_image', filter.has_image)
      if (filter.category_code) f = f.eq('category_code', filter.category_code)
      if (debouncedSearch) f = f.ilike('category_code', `${debouncedSearch}%`)
      return f
    }

    const from = (page - 1) * PAGE_SIZE
    
    // Nếu load toàn bộ 37k câu (không có filter), sắp xếp theo created_at sẽ phải quét toàn bộ bảng gây timeout.
    // Giải pháp: bỏ sắp xếp (hoặc dùng id) khi không có filter.
    let dataQuery = applyFilters(supabase.from('questions').select('*'))
    if (hasFilters) {
      dataQuery = dataQuery.order('created_at', { ascending: false })
    }
    
    dataQuery = dataQuery.range(from, from + PAGE_SIZE - 1)

    // Khi không có filter, đếm 37k câu cũng gây timeout, nên dùng estimated. Có filter thì đếm exact.
    let countQuery = applyFilters(supabase.from('questions').select('*', { count: hasFilters ? 'exact' : 'estimated', head: true }))

    const [dataRes, countRes] = await Promise.all([dataQuery, countQuery])

    // Bỏ qua kết quả cũ nếu đã có request mới hơn
    if (currentFetchId !== fetchIdRef.current) return

    if (dataRes.error) console.error('Fetch data error:', dataRes.error)
    if (countRes.error) console.error('Fetch count error:', countRes.error)
    
    setQuestions((dataRes.data as Question[]) || [])
    setTotal(countRes.count || 0)
    setLoading(false)
  }, [filter, page, debouncedSearch])

  useEffect(() => {
    fetchQuestions()
  }, [fetchQuestions])

  // Filter handlers
  const toggleFilter = (key: keyof QuestionFilter, value: unknown) => {
    setFilter(prev => ({
      ...prev,
      [key]: prev[key] === value ? undefined : value,
    }))
    setPage(1)
  }

  const resetFilters = () => {
    setFilter({})
    setSearch('')
    setPage(1)
  }

  // Delete Single
  const handleDelete = async (id: string) => {
    if (!confirm('Bạn có chắc muốn xóa câu hỏi này?')) return
    const { error } = await supabase.from('questions').delete().eq('id', id)
    if (error) {
      alert('Lỗi xóa: ' + error.message)
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
      fetchQuestions()
    }
  }

  // Bulk Selection
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      const newSelected = new Set(selectedIds)
      questions.forEach(q => newSelected.add(q.id))
      setSelectedIds(newSelected)
    } else {
      const newSelected = new Set(selectedIds)
      questions.forEach(q => newSelected.delete(q.id))
      setSelectedIds(newSelected)
    }
  }

  const handleSelectOne = (id: string, checked: boolean) => {
    const newSelected = new Set(selectedIds)
    if (checked) newSelected.add(id)
    else newSelected.delete(id)
    setSelectedIds(newSelected)
  }

  // Bulk Delete
  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return
    if (!confirm(`Bạn có chắc muốn xóa ${selectedIds.size} câu hỏi đã chọn?`)) return

    const idsToDelete = Array.from(selectedIds)
    const { error } = await supabase.from('questions').delete().in('id', idsToDelete)
    
    if (error) {
      alert('Lỗi xóa: ' + error.message)
    } else {
      setSelectedIds(new Set())
      fetchQuestions()
    }
  }

  // Quét câu hỏi trùng lặp
  const handleScanDuplicates = async () => {
    setScanningDups(true)
    try {
      const res = await fetch('/api/questions/clean-duplicates')
      const json = await res.json()
      if (json.error) {
        alert('Lỗi quét trùng lặp: ' + json.error)
      } else {
        const count = json.data.duplicateCount
        setDupCount(count)
        if (count === 0) {
          alert('✨ Tuyệt vời! Không phát hiện câu hỏi trùng lặp nào trong ngân hàng.')
        } else {
          setShowDupModal(true)
        }
      }
    } catch (err) {
      alert('Lỗi kết nối: ' + (err instanceof Error ? err.message : 'Lỗi không xác định'))
    } finally {
      setScanningDups(false)
    }
  }

  // Xóa câu hỏi trùng lặp
  const handleDeleteDuplicates = async () => {
    setDeletingDups(true)
    try {
      const res = await fetch('/api/questions/clean-duplicates', {
        method: 'POST'
      })
      const json = await res.json()
      if (json.error) {
        alert('Lỗi xóa trùng lặp: ' + json.error)
      } else {
        alert(`🎉 ${json.message || 'Đã dọn dẹp xong!'}`)
        setShowDupModal(false)
        fetchQuestions()
      }
    } catch (err) {
      alert('Lỗi kết nối: ' + (err instanceof Error ? err.message : 'Lỗi không xác định'))
    } finally {
      setDeletingDups(false)
    }
  }



  // Edit Inline
  const startEdit = (q: Question, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingId(q.id)
    setEditContent(q.latex_content)
  }

  const cancelEdit = (e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingId(null)
    setEditContent('')
  }

  const saveEdit = async (q: Question, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!editContent.trim()) return

    const result = parseQuestion(editContent, q.source_file)
    if (!result.success) {
      alert('Lỗi parse LaTeX: ' + result.error.detail)
      return
    }

    const { error } = await supabase
      .from('questions')
      .update({
        ...result.question,
        updated_at: new Date().toISOString()
      })
      .eq('id', q.id)

    if (error) {
      alert('Lỗi cập nhật: ' + error.message)
    } else {
      setEditingId(null)
      fetchQuestions()
      alert('Đã cập nhật thành công!')
    }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const activeFilterCount = Object.values(filter).filter(v => v !== undefined).length

  let availableChapters = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
  let availableLessons = [1, 2, 3, 4, 5, 6, 7, 8, 9]

  if (filter.grade && filter.subject_area) {
    const chaptersMap = CURRICULUM[filter.grade]?.[filter.subject_area]
    if (chaptersMap) {
      availableChapters = Object.keys(chaptersMap).map(Number)
      if (filter.chapter !== undefined && chaptersMap[filter.chapter]) {
        availableLessons = Object.keys(chaptersMap[filter.chapter]).map(Number)
      }
    }
  }

  return (
    <>
      <Header
        title="Ngân hàng câu hỏi"
        subtitle={`${total.toLocaleString()} câu hỏi`}
        actions={
          <Link href="/admin/import" className="btn btn-primary">
            📥 Import file .tex
          </Link>
        }
      />

      <div className={styles.pageWrapper}>
        {/* ═══ FILTER SIDEBAR ═══ */}
        <aside className={styles.filterSidebar}>
          {/* Lớp */}
          <div className={styles.filterGroup}>
            <div className={styles.filterLabel}>① LỚP</div>
            <select
              className={styles.filterSelect}
              value={filter.grade || ''}
              onChange={e => {
                const val = e.target.value ? Number(e.target.value) : undefined
                setFilter(prev => ({ ...prev, grade: val as any, chapter: undefined, lesson: undefined, variant: undefined }))
                setPage(1)
              }}
            >
              <option value="">— Tất cả lớp —</option>
              <option value="10">Lớp 10</option>
              <option value="11">Lớp 11</option>
              <option value="12">Lớp 12</option>
            </select>
          </div>

          {/* Phân môn */}
          <div className={styles.filterGroup}>
            <div className={styles.filterLabel}>② MÔN HỌC</div>
            <select
              className={styles.filterSelect}
              value={filter.subject_area || ''}
              onChange={e => {
                const val = e.target.value || undefined
                setFilter(prev => ({ ...prev, subject_area: val as any, chapter: undefined, lesson: undefined, variant: undefined }))
                setPage(1)
              }}
            >
              <option value="">— Tất cả phân môn —</option>
              <option value="D">D — Đại số / XS / TK</option>
              <option value="H">H — Hình học</option>
              <option value="C">C — Chuyên đề</option>
            </select>
          </div>

          {/* Chương */}
          <div className={styles.filterGroup}>
            <div className={styles.filterLabel}>③ CHƯƠNG</div>
            <select
              className={styles.filterSelect}
              value={filter.chapter === undefined ? '' : filter.chapter}
              onChange={e => {
                const val = e.target.value ? Number(e.target.value) : undefined
                setFilter(prev => ({ ...prev, chapter: val, lesson: undefined, variant: undefined }))
                setPage(1)
              }}
            >
              <option value="">— Tất cả chương —</option>
              {availableChapters.map(ch => {
                const label = (filter.grade && filter.subject_area)
                  ? CHAPTER_NAMES[filter.grade]?.[filter.subject_area]?.[ch]
                  : undefined
                return <option key={ch} value={ch}>{label ?? `Chương ${ch === 0 ? 10 : ch}`}</option>
              })}
            </select>
          </div>

          {/* Bài */}
          <div className={styles.filterGroup}>
            <div className={styles.filterLabel}>④ BÀI HỌC</div>
            <select
              className={styles.filterSelect}
              value={filter.lesson === undefined ? '' : filter.lesson}
              onChange={e => {
                const val = e.target.value ? Number(e.target.value) : undefined
                setFilter(prev => ({ ...prev, lesson: val, variant: undefined }))
                setPage(1)
              }}
            >
              <option value="">— Tất cả bài —</option>
              {availableLessons.map(l => {
                const label = (filter.grade && filter.subject_area && filter.chapter !== undefined)
                  ? LESSON_NAMES[filter.grade]?.[filter.subject_area]?.[filter.chapter]?.[l]
                  : undefined
                return <option key={l} value={l}>{label ?? `Bài ${l}`}</option>
              })}
            </select>
          </div>

          {/* Dạng bài */}
          <div className={styles.filterGroup}>
            <div className={styles.filterLabel}>⑤ DẠNG BÀI</div>
            <select
              className={styles.filterSelect}
              value={filter.variant === undefined ? '' : filter.variant}
              onChange={e => {
                const val = e.target.value ? Number(e.target.value) : undefined
                setFilter(prev => ({ ...prev, variant: val }))
                setPage(1)
              }}
            >
              <option value="">— Tất cả dạng —</option>
              {(() => {
                if (filter.grade && filter.subject_area && filter.chapter !== undefined && filter.lesson !== undefined) {
                  const variants = CURRICULUM[filter.grade]?.[filter.subject_area]?.[filter.chapter]?.[filter.lesson] || []
                  return variants.map(v => {
                    const label = filter.grade ? (VARIANT_NAMES as any)[filter.grade]?.[filter.subject_area as any]?.[filter.chapter as any]?.[filter.lesson as any]?.[v] : undefined
                    return (
                      <option key={v} value={v}>
                        {label ? `Dạng ${v}. ${label}` : `Dạng ${v}`}
                      </option>
                    )
                  })
                }
                return null
              })()}
            </select>
          </div>

          {/* Mức độ */}
          <div className={styles.filterGroup}>
            <div className={styles.filterLabel}>⑥ MỨC ĐỘ</div>
            <select
              className={styles.filterSelect}
              value={filter.difficulty || ''}
              onChange={e => {
                const val = e.target.value || undefined
                setFilter(prev => ({ ...prev, difficulty: val as any }))
                setPage(1)
              }}
            >
              <option value="">— Tất cả mức độ —</option>
              <option value="N">Nhận biết</option>
              <option value="H">Thông hiểu</option>
              <option value="V">Vận dụng</option>
              <option value="C">Vận dụng cao</option>
            </select>
          </div>

          {/* Loại câu hỏi */}
          <div className={styles.filterGroup}>
            <div className={styles.filterLabel}>⑦ LOẠI CÂU HỎI</div>
            <select
              className={styles.filterSelect}
              value={filter.question_type || ''}
              onChange={e => {
                const val = e.target.value || undefined
                setFilter(prev => ({ ...prev, question_type: val as any }))
                setPage(1)
              }}
            >
              <option value="">— Tất cả loại —</option>
              <option value="multiple_choice">Trắc nghiệm</option>
              <option value="true_false">Đúng/Sai</option>
              <option value="short_answer">Trả lời ngắn</option>
              <option value="essay">Tự luận</option>
            </select>
          </div>

          {/* Hình ảnh */}
          <div className={styles.filterGroup}>
            <div className={styles.filterLabel}>⑧ HÌNH ẢNH</div>
            <select
              className={styles.filterSelect}
              value={filter.has_image === undefined ? '' : filter.has_image ? '1' : '0'}
              onChange={e => {
                const val = e.target.value === '' ? undefined : e.target.value === '1'
                setFilter(prev => ({ ...prev, has_image: val }))
                setPage(1)
              }}
            >
              <option value="">— Có/Không có hình —</option>
              <option value="1">🖼 Có hình</option>
              <option value="0">Không có hình</option>
            </select>
          </div>

          <button className={styles.filterResetOutline} onClick={resetFilters}>
            ↺ XOÁ BỘ LỌC
          </button>

          <div className={styles.filterCount}>
            Hiển thị {questions.length}/{total.toLocaleString()} câu
          </div>
        </aside>

        {/* ═══ TABLE AREA ═══ */}
        <div className={styles.tableArea}>
          {/* Toolbar */}
          <div className={styles.tableToolbar}>
            <div className={styles.toolbarLeft}>
              {selectedIds.size > 0 && (
                <button className={`btn btn-sm ${styles.bulkDeleteBtn}`} onClick={handleBulkDelete}>
                  🗑 Xóa {selectedIds.size} câu đã chọn
                </button>
              )}
              {isAdmin && (
                <>
                  <button
                    className="btn btn-sm"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      whiteSpace: 'nowrap',
                      background: 'var(--color-gray-100)',
                      border: '1px solid var(--color-gray-200)',
                      color: 'var(--color-gray-700)',
                      cursor: 'pointer',
                      padding: '6px 12px',
                      borderRadius: '6px',
                      fontWeight: 500,
                      fontSize: '13px',
                    }}
                    onClick={handleScanDuplicates}
                    disabled={scanningDups}
                  >
                    {scanningDups ? '⏳ Đang quét...' : '✨ Quét trùng lặp'}
                  </button>
                </>
              )}
              <div className={styles.searchBox}>
                <span className={styles.searchIcon}>🔍</span>
                <input
                  type="text"
                  className={styles.searchInput}
                  placeholder="Tìm theo mã ID (VD: 2D1N3-1)..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
            </div>
            <div className={styles.toolbarRight}>
              <span className={styles.resultInfo}>
                Trang {page}/{totalPages || 1}
              </span>
            </div>
          </div>

          {/* Table */}
          <div className={styles.tableContainer}>
            {loading ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>⏳</div>
                <div className={styles.emptyTitle}>Đang tải...</div>
              </div>
            ) : questions.length === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>📭</div>
                <div className={styles.emptyTitle}>Chưa có câu hỏi nào</div>
                <div className={styles.emptyText}>
                  Import file .tex để thêm câu hỏi vào ngân hàng
                </div>
                <Link href="/admin/import" className="btn btn-primary">
                  📥 Import ngay
                </Link>
              </div>
            ) : (
              <>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      {isAdmin && (
                        <th style={{ width: 40, textAlign: 'center' }}>
                          <input 
                            type="checkbox" 
                            checked={questions.length > 0 && questions.every(q => selectedIds.has(q.id))}
                            onChange={handleSelectAll}
                          />
                        </th>
                      )}
                      <th style={{ width: 40 }}>#</th>
                      <th>Mã ID</th>
                      <th>Lớp</th>
                      <th>Phân môn</th>
                      <th>Chương</th>
                      <th>Bài</th>
                      <th>Dạng</th>
                      <th>Mức độ</th>
                      <th>Loại câu</th>
                      <th>Đáp án</th>
                      <th style={{ width: 40 }}>🖼</th>
                      {isAdmin && <th style={{ width: 80 }}>Thao tác</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {questions.map((q, idx) => (
                      <Fragment key={q.id || idx}>
                        <tr
                          className={`${styles.tableRow} ${expandedId === q.id ? styles.tableRowExpanded : ''}`}
                          onClick={() => setExpandedId(expandedId === q.id ? null : q.id)}
                        >
                          {isAdmin && (
                            <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                              <input 
                                type="checkbox" 
                                checked={selectedIds.has(q.id)}
                                onChange={(e) => handleSelectOne(q.id, e.target.checked)}
                              />
                            </td>
                          )}
                          <td>{(page - 1) * PAGE_SIZE + idx + 1}</td>
                          <td><span className={styles.categoryCode}>{q.category_code}</span></td>
                          <td>{q.grade}</td>
                          <td>{SUBJECT_LABELS[q.subject_area] || q.subject_area}</td>
                          <td>{q.chapter === 0 ? 10 : q.chapter}</td>
                          <td>{q.lesson}</td>
                          <td>{q.variant}</td>
                          <td><span className={`badge badge-${q.difficulty}`}>{DIFFICULTY_LABELS[q.difficulty]}</span></td>
                          <td>
                            <span className={`${styles.typeTag} badge-${q.question_type === 'multiple_choice' ? 'mc' : q.question_type === 'true_false' ? 'tf' : q.question_type === 'short_answer' ? 'short' : 'essay'}`}>
                              {TYPE_ICONS[q.question_type]} {TYPE_LABELS[q.question_type]}
                            </span>
                          </td>
                          <td><span className={styles.answerCell}>{q.correct_answer || '—'}</span></td>
                          <td><span className={styles.imageIcon}>{q.has_image ? '🖼' : ''}</span></td>
                          {isAdmin && (
                            <td>
                              <div className={styles.actions}>
                                <button
                                  className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                                  title="Xóa"
                                  onClick={(e) => { e.stopPropagation(); handleDelete(q.id) }}
                                >
                                  🗑
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                        {/* Expanded row - LaTeX preview */}
                        {expandedId === q.id && (
                          <tr key={`${q.id}-expanded`} className={styles.expandedRow}>
                            <td colSpan={isAdmin ? 13 : 11}>
                              <div className={styles.expandedContent}>
                                <div className={styles.expandedHeader}>
                                  <span className={styles.expandedTitle}>
                                    Raw LaTeX — {q.category_code} • {TYPE_LABELS[q.question_type]} • Đáp án: {q.correct_answer || 'N/A'}
                                  </span>
                                  <div className={styles.expandedActions}>
                                    {isAdmin ? (
                                      editingId === q.id ? (
                                        <>
                                          <button className="btn btn-sm btn-secondary" onClick={cancelEdit}>
                                            Hủy
                                          </button>
                                          <button className="btn btn-sm btn-primary" onClick={(e) => saveEdit(q, e)}>
                                            💾 Lưu lại
                                          </button>
                                        </>
                                      ) : (
                                        <>
                                          <button
                                            className="btn btn-sm btn-secondary"
                                            onClick={(e) => startEdit(q, e)}
                                          >
                                            ✏️ Sửa
                                          </button>

                                        </>
                                      )
                                    ) : null}
                                      {isAdmin && (
                                        <button
                                          className="btn btn-sm btn-secondary"
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            navigator.clipboard.writeText(q.latex_content)
                                            alert('Đã copy!')
                                          }}
                                        >
                                          📋 Copy
                                        </button>
                                      )}
                                  </div>
                                </div>
                                {editingId === q.id ? (
                                  <textarea
                                    className={styles.latexEditor}
                                    value={editContent}
                                    onChange={(e) => setEditContent(e.target.value)}
                                    spellCheck={false}
                                  />
                                ) : (
                                  <pre 
                                    className={styles.latexCode}
                                    style={{ 
                                      WebkitUserSelect: isAdmin ? undefined : 'none',
                                      MozUserSelect: isAdmin ? undefined : 'none',
                                      msUserSelect: isAdmin ? undefined : 'none',
                                      userSelect: isAdmin ? undefined : 'none' 
                                    }}
                                    onCopy={(e) => {
                                      if (!isAdmin) {
                                        e.preventDefault()
                                        alert('Tính năng copy mã nguồn chỉ dành cho quản trị viên.')
                                      }
                                    }}
                                    onContextMenu={(e) => {
                                      if (!isAdmin) {
                                        e.preventDefault()
                                      }
                                    }}
                                    onKeyDown={(e) => {
                                      if (!isAdmin && (e.ctrlKey || e.metaKey) && e.key === 'c') {
                                        e.preventDefault()
                                      }
                                    }}
                                  >
                                    {q.latex_content}
                                  </pre>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className={styles.pagination}>
                    <span className={styles.pageInfo}>
                      {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} / {total.toLocaleString()} câu
                    </span>
                    <div className={styles.pageButtons}>
                      <button className={styles.pageBtn} disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                        ← Trước
                      </button>
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        let pageNum: number
                        if (totalPages <= 5) pageNum = i + 1
                        else if (page <= 3) pageNum = i + 1
                        else if (page >= totalPages - 2) pageNum = totalPages - 4 + i
                        else pageNum = page - 2 + i
                        return (
                          <button
                            key={pageNum}
                            className={`${styles.pageBtn} ${page === pageNum ? styles.pageBtnActive : ''}`}
                            onClick={() => setPage(pageNum)}
                          >
                            {pageNum}
                          </button>
                        )
                      })}
                      <button className={styles.pageBtn} disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                        Sau →
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* MODAL DỌN DẸP TRÙNG LẶP */}
      {showDupModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          backgroundColor: 'rgba(15, 23, 42, 0.75)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 9999,
        }}>
          <div style={{
            backgroundColor: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '12px',
            padding: '24px',
            width: '90%',
            maxWidth: '500px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
            color: '#f8fafc',
          }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '18px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
              🔍 Phát hiện câu trùng lặp!
            </h3>
            <p style={{ margin: '0 0 20px 0', fontSize: '14px', color: '#cbd5e1', lineHeight: 1.6 }}>
              Hệ thống quét toàn bộ ngân hàng câu hỏi và tìm thấy <strong style={{ color: '#ef4444', fontSize: '16px' }}>{dupCount}</strong> câu trùng lặp nội dung hoàn toàn.
              <br/><br/>
              Bạn có muốn dọn dẹp và xóa bỏ các câu trùng này không? Hệ thống sẽ <strong>giữ lại phiên bản cũ nhất</strong> (phiên bản gốc) và xóa các câu trùng lặp sau đó.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button 
                className="btn btn-secondary" 
                onClick={() => setShowDupModal(false)}
                disabled={deletingDups}
                style={{
                  background: '#334155',
                  border: '1px solid #475569',
                  color: '#f8fafc',
                  cursor: 'pointer',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  fontWeight: 500,
                }}
              >
                Hủy bỏ
              </button>
              <button 
                className="btn" 
                style={{ 
                  backgroundColor: '#ef4444', 
                  borderColor: '#ef4444', 
                  color: '#ffffff',
                  cursor: 'pointer',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  fontWeight: 500,
                }}
                onClick={handleDeleteDuplicates}
                disabled={deletingDups}
              >
                {deletingDups ? '⏳ Đang xóa...' : '🗑 Đồng ý xóa'}
              </button>
            </div>
          </div>
        </div>
      )}


    </>
  )
}
