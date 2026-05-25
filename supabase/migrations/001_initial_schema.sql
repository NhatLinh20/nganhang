-- supabase/migrations/001_initial_schema.sql
-- Schema đầy đủ cho dự án Ngân Hàng Câu Hỏi Toán

-- ═══════════════════════════════════════════════════
-- 1. BẢNG users (mở rộng từ auth.users của Supabase)
-- ═══════════════════════════════════════════════════
CREATE TABLE public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'teacher' CHECK (role IN ('admin', 'teacher')),
  avatar_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Trigger: tự động tạo user record khi đăng ký
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'Người dùng'),
    COALESCE(NEW.raw_user_meta_data->>'role', 'student')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ═══════════════════════════════════════════════════
-- 2. BẢNG chapters (danh mục chương)
-- ═══════════════════════════════════════════════════
CREATE TABLE public.chapters (
  id SERIAL PRIMARY KEY,
  grade SMALLINT NOT NULL CHECK (grade IN (10, 11, 12)),
  subject_area CHAR(1) NOT NULL CHECK (subject_area IN ('D', 'H', 'C')),
  chapter_number SMALLINT NOT NULL,
  chapter_name TEXT NOT NULL,
  UNIQUE(grade, subject_area, chapter_number)
);

-- ═══════════════════════════════════════════════════
-- 3. BẢNG lessons (danh mục bài)
-- ═══════════════════════════════════════════════════
CREATE TABLE public.lessons (
  id SERIAL PRIMARY KEY,
  grade SMALLINT NOT NULL,
  subject_area CHAR(1) NOT NULL,
  chapter_number SMALLINT NOT NULL,
  lesson_number SMALLINT NOT NULL,
  lesson_name TEXT NOT NULL,
  UNIQUE(grade, subject_area, chapter_number, lesson_number),
  FOREIGN KEY (grade, subject_area, chapter_number)
    REFERENCES public.chapters(grade, subject_area, chapter_number)
);

-- ═══════════════════════════════════════════════════
-- 4. BẢNG variant_types (danh mục dạng bài)
-- ═══════════════════════════════════════════════════
CREATE TABLE public.variant_types (
  id SERIAL PRIMARY KEY,
  grade SMALLINT NOT NULL,
  subject_area CHAR(1) NOT NULL,
  chapter_number SMALLINT NOT NULL,
  lesson_number SMALLINT NOT NULL,
  variant_number SMALLINT NOT NULL,
  variant_name TEXT NOT NULL,
  UNIQUE(grade, subject_area, chapter_number, lesson_number, variant_number)
);

-- ═══════════════════════════════════════════════════
-- 5. BẢNG questions (ngân hàng câu hỏi)
-- ═══════════════════════════════════════════════════
CREATE TABLE public.questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Nội dung raw LaTeX (nguyên bản, không tách)
  latex_content TEXT NOT NULL,

  -- Mã phân loại 6 tham số (KHÔNG UNIQUE - nhiều câu cùng mã)
  category_code TEXT NOT NULL,           -- '2D1N3-1'
  grade SMALLINT NOT NULL CHECK (grade IN (10, 11, 12)),
  subject_area CHAR(1) NOT NULL CHECK (subject_area IN ('D', 'H', 'C')),
  chapter SMALLINT NOT NULL,
  difficulty CHAR(1) NOT NULL CHECK (difficulty IN ('N', 'H', 'V', 'C')),
  lesson SMALLINT NOT NULL,
  variant SMALLINT NOT NULL,

  -- Loại câu hỏi
  question_type TEXT NOT NULL
    CHECK (question_type IN ('multiple_choice', 'true_false', 'short_answer', 'essay')),
  has_image BOOLEAN DEFAULT false,
  image_type TEXT DEFAULT 'none'
    CHECK (image_type IN ('none', 'center', 'immini')),

  -- Đáp án (MC: 'A/B/C/D' | TF: 'ĐSĐS' | Short: giá trị | Essay: NULL)
  correct_answer TEXT,

  -- Nguồn gốc
  source_file TEXT,
  source_project TEXT,
  source_exam TEXT,
  source_teacher TEXT,

  -- Quản lý
  tags TEXT[],
  usage_count INT DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes tối ưu cho filter/search
CREATE INDEX idx_q_category ON public.questions(category_code);
CREATE INDEX idx_q_grade ON public.questions(grade);
CREATE INDEX idx_q_subject ON public.questions(subject_area);
CREATE INDEX idx_q_chapter ON public.questions(chapter);
CREATE INDEX idx_q_difficulty ON public.questions(difficulty);
CREATE INDEX idx_q_type ON public.questions(question_type);
CREATE INDEX idx_q_active ON public.questions(is_active);
CREATE INDEX idx_q_grade_subject_chapter ON public.questions(grade, subject_area, chapter);
CREATE INDEX idx_q_grade_difficulty ON public.questions(grade, difficulty);
CREATE INDEX idx_q_full_filter ON public.questions(grade, subject_area, chapter, difficulty, lesson, variant);
CREATE INDEX idx_q_source_file ON public.questions(source_file);

-- ═══════════════════════════════════════════════════
-- 6. BẢNG exams (đề thi)
-- ═══════════════════════════════════════════════════
CREATE TABLE public.exams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  exam_type TEXT,                        -- 'kiểm tra 15p', 'giữa kỳ', 'cuối kỳ', 'thi thử'
  grade SMALLINT NOT NULL CHECK (grade IN (10, 11, 12)),
  duration_minutes INT DEFAULT 90,
  total_questions INT NOT NULL DEFAULT 0,
  matrix JSONB,                          -- {"nhan_biet": 30, "thong_hieu": 40, ...}
  sections JSONB,                        -- Cấu trúc các phần của đề
  created_by UUID REFERENCES public.users(id),
  is_published BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ═══════════════════════════════════════════════════
-- 7. BẢNG exam_questions (câu hỏi trong đề)
-- ═══════════════════════════════════════════════════
CREATE TABLE public.exam_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID REFERENCES public.exams(id) ON DELETE CASCADE,
  question_id UUID REFERENCES public.questions(id),
  section_type TEXT NOT NULL             -- 'multiple_choice', 'true_false', 'short_answer', 'essay'
    CHECK (section_type IN ('multiple_choice', 'true_false', 'short_answer', 'essay')),
  question_order INT NOT NULL,           -- Thứ tự trong đề gốc
  UNIQUE(exam_id, question_id)
);

CREATE INDEX idx_eq_exam ON public.exam_questions(exam_id);
CREATE INDEX idx_eq_question ON public.exam_questions(question_id);

-- ═══════════════════════════════════════════════════
-- 8. BẢNG exam_variants (mã đề - trộn đề)
-- ═══════════════════════════════════════════════════
CREATE TABLE public.exam_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID REFERENCES public.exams(id) ON DELETE CASCADE,
  variant_code TEXT NOT NULL,            -- '001', '002'...
  question_mapping JSONB NOT NULL,       -- {new_pos: original_pos, ...}
  latex_output TEXT,                     -- File .tex hoàn chỉnh
  pdf_url TEXT,                          -- URL file PDF trên Storage
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(exam_id, variant_code)
);

CREATE INDEX idx_ev_exam ON public.exam_variants(exam_id);

-- ═══════════════════════════════════════════════════
-- 9. BẢNG exam_sessions (phiên thi học sinh)
-- ═══════════════════════════════════════════════════
CREATE TABLE public.exam_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID REFERENCES public.exams(id),
  variant_id UUID REFERENCES public.exam_variants(id),
  student_id UUID REFERENCES public.users(id),
  teacher_id UUID REFERENCES public.users(id),
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  status TEXT DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'submitted', 'graded')),
  answers JSONB,                         -- {question_id: answer}
  score DECIMAL(5,2),
  total_correct INT,
  total_questions INT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_es_student ON public.exam_sessions(student_id);
CREATE INDEX idx_es_exam ON public.exam_sessions(exam_id);
CREATE INDEX idx_es_teacher ON public.exam_sessions(teacher_id);

-- ═══════════════════════════════════════════════════
-- 10. ROW LEVEL SECURITY (RLS)
-- ═══════════════════════════════════════════════════
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.variant_types ENABLE ROW LEVEL SECURITY;

-- Helper function: lấy role của user hiện tại
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT AS $$
  SELECT role FROM public.users WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER;

-- USERS: xem thông tin mình, admin xem tất cả
CREATE POLICY "users_self_read" ON public.users FOR SELECT
  USING (id = auth.uid() OR public.get_user_role() = 'admin');

CREATE POLICY "users_admin_all" ON public.users FOR ALL
  USING (public.get_user_role() = 'admin');

-- CHAPTERS / LESSONS / VARIANT_TYPES: mọi người đọc được
CREATE POLICY "chapters_read_all" ON public.chapters FOR SELECT USING (true);
CREATE POLICY "lessons_read_all" ON public.lessons FOR SELECT USING (true);
CREATE POLICY "variant_types_read_all" ON public.variant_types FOR SELECT USING (true);

-- Admin ghi chapters/lessons/variants
CREATE POLICY "chapters_admin_write" ON public.chapters FOR ALL
  USING (public.get_user_role() = 'admin');
CREATE POLICY "lessons_admin_write" ON public.lessons FOR ALL
  USING (public.get_user_role() = 'admin');
CREATE POLICY "variant_types_admin_write" ON public.variant_types FOR ALL
  USING (public.get_user_role() = 'admin');

-- QUESTIONS: Admin full, Teacher & Student read (only active)
CREATE POLICY "questions_admin_all" ON public.questions FOR ALL
  USING (public.get_user_role() = 'admin');

CREATE POLICY "questions_teacher_read" ON public.questions FOR SELECT
  USING (public.get_user_role() = 'teacher' AND is_active = true);

CREATE POLICY "questions_student_read" ON public.questions FOR SELECT
  USING (public.get_user_role() = 'student' AND is_active = true);

-- EXAMS: Admin & Teacher tạo, Student đọc (published only)
CREATE POLICY "exams_admin_all" ON public.exams FOR ALL
  USING (public.get_user_role() = 'admin');

CREATE POLICY "exams_teacher_own" ON public.exams FOR ALL
  USING (public.get_user_role() = 'teacher' AND created_by = auth.uid());

CREATE POLICY "exams_student_read" ON public.exams FOR SELECT
  USING (public.get_user_role() = 'student' AND is_published = true);

-- EXAM_QUESTIONS: theo quyền exam
CREATE POLICY "exam_questions_admin" ON public.exam_questions FOR ALL
  USING (public.get_user_role() = 'admin');

CREATE POLICY "exam_questions_teacher_own" ON public.exam_questions FOR ALL
  USING (
    public.get_user_role() = 'teacher' AND
    EXISTS (SELECT 1 FROM public.exams WHERE id = exam_id AND created_by = auth.uid())
  );

CREATE POLICY "exam_questions_student_read" ON public.exam_questions FOR SELECT
  USING (public.get_user_role() = 'student');

-- EXAM_VARIANTS: Admin & Teacher (own), Student read
CREATE POLICY "variants_admin_all" ON public.exam_variants FOR ALL
  USING (public.get_user_role() = 'admin');

CREATE POLICY "variants_teacher_own" ON public.exam_variants FOR ALL
  USING (
    public.get_user_role() = 'teacher' AND
    EXISTS (SELECT 1 FROM public.exams WHERE id = exam_id AND created_by = auth.uid())
  );

CREATE POLICY "variants_student_read" ON public.exam_variants FOR SELECT
  USING (public.get_user_role() = 'student');

-- EXAM_SESSIONS: Student chỉ thấy của mình, Teacher thấy của đề mình
CREATE POLICY "sessions_student_own" ON public.exam_sessions FOR ALL
  USING (student_id = auth.uid());

CREATE POLICY "sessions_teacher_own" ON public.exam_sessions FOR SELECT
  USING (
    public.get_user_role() IN ('teacher', 'admin') AND
    (teacher_id = auth.uid() OR public.get_user_role() = 'admin')
  );
