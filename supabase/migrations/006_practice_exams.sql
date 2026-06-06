-- supabase/migrations/006_practice_exams.sql
-- Tạo bảng cho tính năng Luyện Thi (Practice Exams)

-- ═══════════════════════════════════════════════════
-- 1. BẢNG practice_exams: Đề thi luyện tập (admin tạo bằng upload PDF)
-- ═══════════════════════════════════════════════════
CREATE TABLE public.practice_exams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,                              -- "KIỂM TRA GIỮA KÌ 1"
  exam_type TEXT DEFAULT 'Kiểm tra thường xuyên',   -- Giữa kì, Cuối kì, Thường xuyên, Thi thử
  grade SMALLINT NOT NULL CHECK (grade BETWEEN 6 AND 12),
  duration_minutes INT DEFAULT 45,                  -- Thời gian làm bài (phút)
  total_questions INT NOT NULL DEFAULT 0,           -- Tổng số câu
  total_score DECIMAL(5,2) DEFAULT 10.0,            -- Tổng điểm
  pdf_url TEXT,                                     -- URL file PDF trên Supabase Storage
  pdf_filename TEXT,                                -- Tên file gốc
  -- questions: JSONB chứa cấu hình từng câu hỏi
  -- [
  --   { "order": 1, "type": "multiple_choice", "correct_answer": "A", "score": 0.25 },
  --   { "order": 2, "type": "true_false", "sub_answers": ["Đ","S","Đ","S"], "score": 1.0 },
  --   { "order": 15, "type": "short_answer", "correct_answer": "-3", "score": 0.5 },
  --   { "order": 20, "type": "essay", "correct_answer": null, "score": 1.0 }
  -- ]
  questions JSONB NOT NULL DEFAULT '[]',
  is_published BOOLEAN DEFAULT false,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ═══════════════════════════════════════════════════
-- 2. BẢNG practice_sessions: Lịch sử thi của học sinh
-- ═══════════════════════════════════════════════════
CREATE TABLE public.practice_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID REFERENCES public.practice_exams(id) ON DELETE CASCADE,
  student_id UUID REFERENCES public.users(id),
  -- answers: { "1": "A", "2": {"a":"Đ","b":"S","c":"Đ","d":"S"}, "15": "-3" }
  answers JSONB DEFAULT '{}',
  score DECIMAL(5,2),                    -- Điểm đạt được
  total_correct INT DEFAULT 0,           -- Số câu đúng (MC + Short)
  total_tf_correct INT DEFAULT 0,        -- Số ý Đ/S đúng
  started_at TIMESTAMPTZ DEFAULT now(),
  submitted_at TIMESTAMPTZ,
  duration_seconds INT,                  -- Thời gian thực tế làm bài (giây)
  status TEXT DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'submitted')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ═══════════════════════════════════════════════════
-- 3. ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════
ALTER TABLE public.practice_exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_sessions ENABLE ROW LEVEL SECURITY;

-- practice_exams: Admin full quyền
CREATE POLICY "practice_exams_admin_all" ON public.practice_exams FOR ALL
  USING (public.get_user_role() = 'admin');

-- practice_exams: Student chỉ đọc (published only)
CREATE POLICY "practice_exams_student_read" ON public.practice_exams FOR SELECT
  USING (public.get_user_role() = 'student' AND is_published = true);

-- practice_sessions: Student CRUD bài của mình
CREATE POLICY "practice_sessions_student_own" ON public.practice_sessions FOR ALL
  USING (student_id = auth.uid());

-- practice_sessions: Admin đọc tất cả
CREATE POLICY "practice_sessions_admin_read" ON public.practice_sessions FOR SELECT
  USING (public.get_user_role() = 'admin');

-- ═══════════════════════════════════════════════════
-- 4. INDEXES
-- ═══════════════════════════════════════════════════
CREATE INDEX idx_pe_grade ON public.practice_exams(grade);
CREATE INDEX idx_pe_published ON public.practice_exams(is_published);
CREATE INDEX idx_pe_type ON public.practice_exams(exam_type);
CREATE INDEX idx_pe_created ON public.practice_exams(created_at DESC);

CREATE INDEX idx_ps_student ON public.practice_sessions(student_id);
CREATE INDEX idx_ps_exam ON public.practice_sessions(exam_id);
CREATE INDEX idx_ps_status ON public.practice_sessions(status);
