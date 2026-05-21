-- ============================================================
-- PGVECTOR FINAL FIX: 768 chiều (tương thích với cả HNSW và IVFFlat)
-- Chạy file này trong: Supabase Studio > SQL Editor
-- ============================================================

-- Xóa index cũ (nếu có)
DROP INDEX IF EXISTS questions_embedding_hnsw_idx;
DROP INDEX IF EXISTS questions_embedding_ivfflat_idx;

-- Đổi cột sang 768 chiều (yêu cầu model xuất 768 dims qua outputDimensionality)
ALTER TABLE questions DROP COLUMN IF EXISTS embedding;
ALTER TABLE questions ADD COLUMN embedding vector(768);

-- Tạo HNSW index (tốc độ tìm kiếm nhanh nhất, hỗ trợ ≤2000 chiều)
CREATE INDEX questions_embedding_hnsw_idx 
ON questions USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Cập nhật lại function match_questions với vector(768)
CREATE OR REPLACE FUNCTION match_questions(
  query_embedding  vector(768),
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
    q.grade::int,
    q.subject_area::text,
    q.chapter::int,
    q.lesson::int,
    q.variant::int,
    q.difficulty::text,
    q.question_type::text,
    q.correct_answer::text,
    q.has_image,
    q.latex_content,
    (1 - (q.embedding <=> query_embedding))::float AS similarity
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

-- Kiểm tra kết quả
SELECT * FROM embedding_progress();
