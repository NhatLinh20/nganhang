-- supabase/migrations/004_replace_vip_with_student.sql
-- Bỏ role VIP, thêm role Student

-- ═══════════════════════════════════════════════════
-- 1. Xóa toàn bộ user VIP (theo yêu cầu)
-- ═══════════════════════════════════════════════════
-- Xóa từ auth.users sẽ CASCADE xóa ở public.users
DELETE FROM auth.users WHERE id IN (
  SELECT id FROM public.users WHERE role = 'vip'
);

-- ═══════════════════════════════════════════════════
-- 2. Đổi constraint role: bỏ 'vip', thêm 'student'
-- ═══════════════════════════════════════════════════
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'teacher', 'student'));

-- ═══════════════════════════════════════════════════
-- 3. Cập nhật trigger handle_new_user()
--    Nhận role từ metadata, mặc định 'teacher'
--    Student cũng cần duyệt (is_approved = false)
-- ═══════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  new_role TEXT;
  new_approved BOOLEAN;
BEGIN
  -- Admin cố định bằng email
  IF NEW.email = 'nhatlinh.kg20@gmail.com' THEN
    new_role := 'admin';
    new_approved := true;
  ELSE
    -- Lấy role từ metadata (teacher hoặc student), mặc định teacher
    new_role := COALESCE(NEW.raw_user_meta_data->>'role', 'teacher');
    -- Chỉ chấp nhận teacher hoặc student
    IF new_role NOT IN ('teacher', 'student') THEN
      new_role := 'teacher';
    END IF;
    new_approved := false;
  END IF;

  INSERT INTO public.users (id, email, full_name, role, is_approved)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', 'Người dùng'),
    new_role,
    new_approved
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════
-- 4. Xóa RLS policies VIP
-- ═══════════════════════════════════════════════════
DROP POLICY IF EXISTS "questions_vip_read" ON public.questions;
DROP POLICY IF EXISTS "exams_vip_own" ON public.exams;
DROP POLICY IF EXISTS "exam_questions_vip_own" ON public.exam_questions;
DROP POLICY IF EXISTS "variants_vip_own" ON public.exam_variants;
DROP POLICY IF EXISTS "sessions_vip_own" ON public.exam_sessions;

-- ═══════════════════════════════════════════════════
-- 5. RLS policies cho Student đã có sẵn từ migration 001
--    (questions_student_read, exams_student_read, etc.)
--    Không cần thêm gì mới.
-- ═══════════════════════════════════════════════════
