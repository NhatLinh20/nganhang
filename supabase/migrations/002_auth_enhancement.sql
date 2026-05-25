-- supabase/migrations/002_auth_enhancement.sql
-- Mở rộng hệ thống Auth: is_approved, active_session_id, login_logs

-- ═══════════════════════════════════════════════════
-- 1. Thêm cột is_approved vào bảng users
-- ═══════════════════════════════════════════════════
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_approved BOOLEAN DEFAULT false;

-- Admin mặc định được approved
UPDATE public.users SET is_approved = true WHERE role = 'admin';

-- ═══════════════════════════════════════════════════
-- 2. Thêm cột active_session_id (ngăn đăng nhập đồng thời)
-- ═══════════════════════════════════════════════════
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS active_session_id TEXT;

-- ═══════════════════════════════════════════════════
-- 3. Cập nhật trigger handle_new_user
--    Mặc định role = 'teacher', is_approved = false
-- ═══════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  new_role TEXT;
  new_approved BOOLEAN;
BEGIN
  -- Cố định email admin, còn lại mặc định là teacher
  IF NEW.email = 'nhatlinh.kg20@gmail.com' THEN
    new_role := 'admin';
    new_approved := true;
  ELSE
    new_role := 'teacher';
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
-- 4. Bảng login_logs — ghi lịch sử đăng nhập
-- ═══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.login_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  ip_address TEXT,
  country TEXT,
  city TEXT,
  isp TEXT,
  timezone TEXT,
  user_agent TEXT,
  is_suspicious BOOLEAN DEFAULT false,
  suspicious_reasons TEXT[],
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes cho login_logs
CREATE INDEX IF NOT EXISTS idx_ll_user ON public.login_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_ll_created ON public.login_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ll_suspicious ON public.login_logs(is_suspicious) WHERE is_suspicious = true;

-- ═══════════════════════════════════════════════════
-- 5. RLS cho login_logs
-- ═══════════════════════════════════════════════════
ALTER TABLE public.login_logs ENABLE ROW LEVEL SECURITY;

-- Giáo viên: chỉ xem log của chính mình
CREATE POLICY "login_logs_self_read" ON public.login_logs FOR SELECT
  USING (user_id = auth.uid());

-- Admin: xem tất cả
CREATE POLICY "login_logs_admin_all" ON public.login_logs FOR ALL
  USING (public.get_user_role() = 'admin');

-- Insert: cho phép service role ghi log (thông qua server-side)
CREATE POLICY "login_logs_insert" ON public.login_logs FOR INSERT
  WITH CHECK (true);

-- ═══════════════════════════════════════════════════
-- 6. RLS cho users: cho phép user tự cập nhật active_session_id
-- ═══════════════════════════════════════════════════
CREATE POLICY "users_self_update_session" ON public.users FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- ═══════════════════════════════════════════════════
-- 7. Enable Realtime cho bảng users (phục vụ SessionGuardian)
-- ═══════════════════════════════════════════════════
ALTER PUBLICATION supabase_realtime ADD TABLE public.users;
