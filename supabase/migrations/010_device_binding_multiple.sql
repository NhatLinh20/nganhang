-- supabase/migrations/010_device_binding_multiple.sql
-- Thêm cột device_ids và active_sessions kiểu mảng cho phép khóa 2 thiết bị

-- Thêm cột mảng (array)
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS device_ids TEXT[] DEFAULT '{}';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS active_sessions TEXT[] DEFAULT '{}';

-- Migration dữ liệu cũ (nếu có)
UPDATE public.users SET device_ids = ARRAY[device_id] WHERE device_id IS NOT NULL AND device_ids = '{}';
UPDATE public.users SET active_sessions = ARRAY[active_session_id] WHERE active_session_id IS NOT NULL AND active_sessions = '{}';

-- (Tùy chọn) Xóa cột cũ nếu không dùng tới nữa
-- Chúng ta sẽ giữ lại cột cũ một thời gian để tránh lỗi nếu có query chưa cập nhật
