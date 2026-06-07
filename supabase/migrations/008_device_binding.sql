-- supabase/migrations/008_device_binding.sql
-- Thêm cơ chế Device Binding: khóa tài khoản vào 1 thiết bị duy nhất

-- ═══════════════════════════════════════════════════
-- 1. Thêm các cột device binding vào bảng users
-- ═══════════════════════════════════════════════════
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS device_id TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS device_bound_at TIMESTAMPTZ;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS device_info JSONB DEFAULT '{}'::jsonb;

-- Index cho device_id (tìm kiếm nhanh)
CREATE INDEX IF NOT EXISTS idx_users_device_id ON public.users(device_id);
