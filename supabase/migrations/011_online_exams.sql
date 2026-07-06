-- supabase/migrations/011_online_exams.sql
-- Tạo bảng cho tính năng Thi Online
-- Dữ liệu câu hỏi (nặng) lưu trên VPS, Supabase chỉ lưu metadata

-- ═══════════════════════════════════════════════════
-- 1. BẢNG online_exams: Metadata đề thi (nhẹ, chỉ cấu hình)
-- ═══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.online_exams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  grade SMALLINT CHECK (grade BETWEEN 6 AND 12),
  duration_minutes INT,                              -- NULL = không giới hạn thời gian
  total_questions INT NOT NULL DEFAULT 0,
  -- scoring_config: Cấu hình điểm từng phần
  -- { "total_score": 10, "mc_score_each": 0.25, "tf_score_each": 0.25, "sa_score_each": 0.5, "essay_score_each": 1 }
  scoring_config JSONB NOT NULL DEFAULT '{}',
  -- correct_answers: Đáp án đúng (nhẹ, chỉ text)
  -- { "0": "B", "1": "ĐSĐS", "2": "-3" }
  correct_answers JSONB NOT NULL DEFAULT '{}',
  is_published BOOLEAN DEFAULT false,
  access_code TEXT UNIQUE,                           -- Mã truy cập, VD: "A3B5K7"
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ═══════════════════════════════════════════════════
-- 2. BẢNG online_exam_submissions: Bài nộp của học sinh
-- ═══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.online_exam_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID REFERENCES public.online_exams(id) ON DELETE CASCADE,
  student_name TEXT NOT NULL,
  student_code TEXT NOT NULL,                        -- Số báo danh
  -- answers: { "0": "A", "1": {"a":"Đ","b":"S"}, "2": "-3", "3": "Bài giải..." }
  answers JSONB DEFAULT '{}',
  score DECIMAL(5,2),
  -- detail_results: Kết quả chi tiết từng câu
  -- [{ "index": 0, "type": "mc", "student": "A", "correct": "B", "is_correct": false, "score": 0 }]
  detail_results JSONB DEFAULT '[]',
  started_at TIMESTAMPTZ DEFAULT now(),
  submitted_at TIMESTAMPTZ,
  time_spent_seconds INT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ═══════════════════════════════════════════════════
-- 3. ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════
ALTER TABLE public.online_exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.online_exam_submissions ENABLE ROW LEVEL SECURITY;

-- online_exams: Chủ sở hữu full quyền
CREATE POLICY "online_exams_owner_all" ON public.online_exams FOR ALL
  USING (created_by = auth.uid());

-- online_exams: Admin đọc tất cả
CREATE POLICY "online_exams_admin_read" ON public.online_exams FOR SELECT
  USING (public.get_user_role() = 'admin');

-- online_exams: Public đọc đề đã xuất bản (học sinh không cần đăng nhập)
CREATE POLICY "online_exams_public_read" ON public.online_exams FOR SELECT
  USING (is_published = true);

-- online_exam_submissions: Public insert (học sinh nộp bài không cần đăng nhập)
CREATE POLICY "online_exam_submissions_public_insert" ON public.online_exam_submissions FOR INSERT
  WITH CHECK (true);

-- online_exam_submissions: Public đọc (để hiển thị kết quả cho học sinh)
CREATE POLICY "online_exam_submissions_public_read" ON public.online_exam_submissions FOR SELECT
  USING (true);

-- ═══════════════════════════════════════════════════
-- 4. INDEXES
-- ═══════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_oe_access_code ON public.online_exams(access_code);
CREATE INDEX IF NOT EXISTS idx_oe_published ON public.online_exams(is_published);
CREATE INDEX IF NOT EXISTS idx_oe_created_by ON public.online_exams(created_by);
CREATE INDEX IF NOT EXISTS idx_oe_created_at ON public.online_exams(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_oes_exam ON public.online_exam_submissions(exam_id);
CREATE INDEX IF NOT EXISTS idx_oes_student_code ON public.online_exam_submissions(student_code);
CREATE INDEX IF NOT EXISTS idx_oes_submitted ON public.online_exam_submissions(submitted_at DESC);
