-- supabase/migrations/012_add_variant_index.sql
-- Hỗ trợ đa đề: mỗi bài thi có thể có nhiều variant (đề),
-- học sinh sẽ được ngẫu nhiên gán 1 variant khi vào thi.

-- 1. Thêm cột variant_count vào bảng online_exams
-- (số lượng đề trong bài thi, mặc định 1 = đề đơn)
ALTER TABLE public.online_exams
  ADD COLUMN IF NOT EXISTS variant_count SMALLINT DEFAULT 1;

-- 2. Thêm cột variant_index vào bảng online_exam_submissions
-- (chỉ số đề mà học sinh được gán: 0 = Đề 1, 1 = Đề 2, ...)
ALTER TABLE public.online_exam_submissions
  ADD COLUMN IF NOT EXISTS variant_index SMALLINT DEFAULT 0;
