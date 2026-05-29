-- supabase/migrations/003_vip_role_and_export_logs.sql
-- Thêm role VIP + Bảng export_logs theo dõi số lần xuất file

-- ═══════════════════════════════════════════════════
-- 1. Mở rộng role constraint: thêm 'vip'
-- ═══════════════════════════════════════════════════
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'teacher', 'vip'));

-- ═══════════════════════════════════════════════════
-- 2. RLS cho VIP (quyền giống teacher)
-- ═══════════════════════════════════════════════════

-- QUESTIONS: VIP chỉ đọc câu hỏi active (giống teacher)
CREATE POLICY "questions_vip_read" ON public.questions FOR SELECT
  USING (public.get_user_role() = 'vip' AND is_active = true);

-- EXAMS: VIP toàn quyền với đề do mình tạo
CREATE POLICY "exams_vip_own" ON public.exams FOR ALL
  USING (public.get_user_role() = 'vip' AND created_by = auth.uid());

-- EXAM_QUESTIONS: VIP toàn quyền với câu hỏi trong đề mình tạo
CREATE POLICY "exam_questions_vip_own" ON public.exam_questions FOR ALL
  USING (
    public.get_user_role() = 'vip' AND
    EXISTS (SELECT 1 FROM public.exams WHERE id = exam_id AND created_by = auth.uid())
  );

-- EXAM_VARIANTS: VIP toàn quyền với mã đề mình tạo
CREATE POLICY "variants_vip_own" ON public.exam_variants FOR ALL
  USING (
    public.get_user_role() = 'vip' AND
    EXISTS (SELECT 1 FROM public.exams WHERE id = exam_id AND created_by = auth.uid())
  );

-- EXAM_SESSIONS: VIP xem kết quả đề mình quản lý
CREATE POLICY "sessions_vip_own" ON public.exam_sessions FOR SELECT
  USING (
    public.get_user_role() = 'vip' AND teacher_id = auth.uid()
  );

-- ═══════════════════════════════════════════════════
-- 3. Bảng export_logs — theo dõi số lần xuất file
-- ═══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.export_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  export_type TEXT NOT NULL,   -- 'ai_exam', 'manual_exam', 'shuffle', 'lesson', 'bank'
  page_source TEXT NOT NULL,   -- '/admin/ai-exam', '/teacher/exams', etc.
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_el_user_date ON public.export_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_el_type ON public.export_logs(export_type);

ALTER TABLE public.export_logs ENABLE ROW LEVEL SECURITY;

-- Insert: cho phép authenticated user ghi log của chính mình
CREATE POLICY "export_logs_insert" ON public.export_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Read: user xem log mình, admin xem tất cả
CREATE POLICY "export_logs_self_read" ON public.export_logs FOR SELECT
  USING (user_id = auth.uid() OR public.get_user_role() = 'admin');
