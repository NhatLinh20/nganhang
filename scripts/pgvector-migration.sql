-- ============================================================
-- PGVECTOR MIGRATION cho Ngân hàng Toán
-- Chạy file này trong: Supabase Studio > SQL Editor
-- ============================================================

-- Bước 1: Bật extension pgvector (có sẵn trong Supabase, không mất phí)
CREATE EXTENSION IF NOT EXISTS vector;

-- Bước 2: Thêm cột embedding vào bảng questions
-- gemini-embedding-001 sinh ra vector 3072 chiều
ALTER TABLE questions 
ADD COLUMN IF NOT EXISTS embedding vector(3072);

-- Bước 3: Tạo IVFFlat index (hỗ trợ mọi số chiều, phù hợp với 3072)
-- HNSW chỉ hỗ trợ tối đa 2000 chiều, IVFFlat không có giới hạn này
-- lists = 100: phù hợp cho 10k-50k records
CREATE INDEX IF NOT EXISTS questions_embedding_ivfflat_idx 
ON questions USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Bước 4: Tạo RPC function match_questions
-- Hàm này được gọi từ backend để tìm câu hỏi theo vector similarity
-- Kết hợp cả semantic search + hard filter (grade, difficulty, type...)
CREATE OR REPLACE FUNCTION match_questions(
  query_embedding  vector(3072),
  match_count      int     DEFAULT 10,
  filter_grade     int     DEFAULT NULL,
  filter_subject   text    DEFAULT NULL,
  filter_chapter   int     DEFAULT NULL,
  filter_lesson    int     DEFAULT NULL,
  filter_difficulty text   DEFAULT NULL,
  filter_type      text    DEFAULT NULL
)
RETURNS TABLE (
  id              uuid,
  category_code   text,
  grade           int,
  subject_area    text,
  chapter         int,
  lesson          int,
  variant         int,
  difficulty      text,
  question_type   text,
  correct_answer  text,
  has_image       bool,
  latex_content   text,
  similarity      float
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    q.id,
    q.category_code,
    q.grade,
    q.subject_area,
    q.chapter,
    q.lesson,
    q.variant,
    q.difficulty,
    q.question_type,
    q.correct_answer,
    q.has_image,
    q.latex_content,
    1 - (q.embedding <=> query_embedding) AS similarity
  FROM questions q
  WHERE
    q.embedding IS NOT NULL
    AND (filter_grade    IS NULL OR q.grade         = filter_grade)
    AND (filter_subject  IS NULL OR q.subject_area  = filter_subject)
    AND (filter_chapter  IS NULL OR q.chapter       = filter_chapter)
    AND (filter_lesson   IS NULL OR q.lesson        = filter_lesson)
    AND (filter_difficulty IS NULL OR q.difficulty  = filter_difficulty)
    AND (filter_type     IS NULL OR q.question_type = filter_type)
  ORDER BY q.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Bước 5: Tạo hàm kiểm tra tiến độ embedding
CREATE OR REPLACE FUNCTION embedding_progress()
RETURNS TABLE (
  total_questions    bigint,
  embedded_questions bigint,
  pending_questions  bigint,
  progress_pct       numeric
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)                                    AS total_questions,
    COUNT(*) FILTER (WHERE embedding IS NOT NULL) AS embedded_questions,
    COUNT(*) FILTER (WHERE embedding IS NULL)     AS pending_questions,
    ROUND(
      100.0 * COUNT(*) FILTER (WHERE embedding IS NOT NULL) / NULLIF(COUNT(*), 0),
      2
    )                                           AS progress_pct
  FROM questions;
END;
$$;

-- Kiểm tra kết quả:
-- SELECT * FROM embedding_progress();
