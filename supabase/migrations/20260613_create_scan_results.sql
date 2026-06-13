-- Supabase migration: Tạo bảng scan_results để lưu kết quả quét phiếu trắc nghiệm
-- Chạy trong Supabase SQL Editor

CREATE TABLE IF NOT EXISTS scan_results (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  teacher_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Thông tin phiếu
  exam_code TEXT,                    -- Mã đề (nhận dạng tự động, 4 chữ số)
  student_id_number TEXT,            -- Số báo danh (nhận dạng tự động)
  student_name TEXT,                 -- Họ tên thí sinh (nhập tay sau)
  
  -- Điểm số
  score NUMERIC(5,2) NOT NULL DEFAULT 0,        -- Tổng điểm
  max_score NUMERIC(5,2) NOT NULL DEFAULT 10,   -- Điểm tối đa
  
  -- Chi tiết từng phần
  mc_correct INTEGER DEFAULT 0,      -- Số câu MC đúng
  mc_total INTEGER DEFAULT 0,        -- Tổng số câu MC
  tf_score NUMERIC(5,2) DEFAULT 0,   -- Điểm TF
  tf_max_score NUMERIC(5,2) DEFAULT 0,
  sa_correct INTEGER DEFAULT 0,      -- Số câu SA đúng
  sa_total INTEGER DEFAULT 0,
  
  -- Dữ liệu chi tiết (JSON)
  details JSONB,                     -- Chi tiết từng câu hỏi
  answers JSONB,                     -- Câu trả lời của thí sinh
  
  -- Metadata
  confidence NUMERIC(3,2) DEFAULT 1, -- Độ tin cậy (0-1)
  warnings JSONB,                    -- Cảnh báo khi quét
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_scan_results_teacher ON scan_results(teacher_id);
CREATE INDEX IF NOT EXISTS idx_scan_results_exam_code ON scan_results(exam_code);
CREATE INDEX IF NOT EXISTS idx_scan_results_created ON scan_results(created_at DESC);

-- RLS (Row Level Security)
ALTER TABLE scan_results ENABLE ROW LEVEL SECURITY;

-- Giáo viên chỉ thấy kết quả của mình
CREATE POLICY "Teachers can view own scan results"
  ON scan_results FOR SELECT
  USING (auth.uid() = teacher_id);

CREATE POLICY "Teachers can insert own scan results"
  ON scan_results FOR INSERT
  WITH CHECK (auth.uid() = teacher_id);

CREATE POLICY "Teachers can update own scan results"
  ON scan_results FOR UPDATE
  USING (auth.uid() = teacher_id);

CREATE POLICY "Teachers can delete own scan results"
  ON scan_results FOR DELETE
  USING (auth.uid() = teacher_id);

-- Admin thấy tất cả
CREATE POLICY "Admins can view all scan results"
  ON scan_results FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
    )
  );
