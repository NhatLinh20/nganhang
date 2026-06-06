-- supabase/migrations/005_courses.sql
-- Tạo hệ thống Khóa học (Courses) cho học sinh lớp 6-12

-- ═══════════════════════════════════════════════════
-- 1. BẢNG courses — Khóa học
-- ═══════════════════════════════════════════════════
CREATE TABLE public.courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,                        -- "Toán 9"
  description TEXT,                           -- Mô tả khóa học
  grade SMALLINT NOT NULL CHECK (grade BETWEEN 6 AND 12),
  category_label TEXT DEFAULT '',             -- "Nền tảng", "Nâng cao"...
  teacher_name TEXT DEFAULT '',               -- Tên giáo viên phụ trách
  thumbnail_url TEXT DEFAULT '',              -- Link ảnh bìa
  is_published BOOLEAN DEFAULT false,         -- Đang mở / Đang khóa
  sort_order INT DEFAULT 0,                   -- Thứ tự hiển thị
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_courses_grade ON public.courses(grade);
CREATE INDEX idx_courses_published ON public.courses(is_published);

-- ═══════════════════════════════════════════════════
-- 2. BẢNG course_chapters — Chương trong khóa học
-- ═══════════════════════════════════════════════════
CREATE TABLE public.course_chapters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  chapter_number SMALLINT NOT NULL,
  chapter_name TEXT NOT NULL,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_cc_course ON public.course_chapters(course_id);

-- ═══════════════════════════════════════════════════
-- 3. BẢNG course_lessons — Bài trong chương
-- ═══════════════════════════════════════════════════
CREATE TABLE public.course_lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id UUID NOT NULL REFERENCES public.course_chapters(id) ON DELETE CASCADE,
  lesson_number SMALLINT NOT NULL,
  lesson_name TEXT NOT NULL,
  video_url TEXT DEFAULT '',                  -- Link YouTube
  duration_minutes INT DEFAULT 0,             -- Thời lượng (phút)
  description TEXT DEFAULT '',                -- Mô tả bài học
  pdf_files JSONB DEFAULT '[]'::jsonb,        -- [{name, url, description}]
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_cl_chapter ON public.course_lessons(chapter_id);

-- ═══════════════════════════════════════════════════
-- 4. ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_chapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_lessons ENABLE ROW LEVEL SECURITY;

-- Courses: Authenticated users đọc (published), Admin full
CREATE POLICY "courses_read_published" ON public.courses FOR SELECT
  USING (is_published = true OR public.get_user_role() = 'admin');

CREATE POLICY "courses_admin_all" ON public.courses FOR ALL
  USING (public.get_user_role() = 'admin');

-- Chapters: Authenticated users đọc, Admin full
CREATE POLICY "chapters_course_read" ON public.course_chapters FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.courses
      WHERE id = course_id AND (is_published = true OR public.get_user_role() = 'admin')
    )
  );

CREATE POLICY "chapters_course_admin" ON public.course_chapters FOR ALL
  USING (public.get_user_role() = 'admin');

-- Lessons: Authenticated users đọc, Admin full
CREATE POLICY "lessons_course_read" ON public.course_lessons FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.course_chapters cc
      JOIN public.courses c ON c.id = cc.course_id
      WHERE cc.id = chapter_id AND (c.is_published = true OR public.get_user_role() = 'admin')
    )
  );

CREATE POLICY "lessons_course_admin" ON public.course_lessons FOR ALL
  USING (public.get_user_role() = 'admin');

-- ═══════════════════════════════════════════════════
-- 5. SEED DATA — 7 khóa học (Toán 6 → Toán 12)
-- ═══════════════════════════════════════════════════

-- ─── TOÁN 6 ───
INSERT INTO public.courses (id, title, description, grade, category_label, sort_order, is_published)
VALUES ('00000000-0000-0000-0000-000000000006', 'Toán lớp 6', 'Khóa học Toán lớp 6 — Số tự nhiên, phân số, hình học cơ bản', 6, 'THCS - Nền tảng', 1, false);

-- Chương I. Tập hợp các số tự nhiên
WITH ch AS (
  INSERT INTO public.course_chapters (id, course_id, chapter_number, chapter_name, sort_order)
  VALUES ('00000006-0001-0000-0000-000000000000', '00000000-0000-0000-0000-000000000006', 1, 'Tập hợp các số tự nhiên', 1) RETURNING id
)
INSERT INTO public.course_lessons (chapter_id, lesson_number, lesson_name, sort_order) VALUES
  ((SELECT id FROM ch), 1, 'Tập hợp', 1),
  ((SELECT id FROM ch), 2, 'Cách ghi số tự nhiên', 2),
  ((SELECT id FROM ch), 3, 'Thứ tự trong tập hợp các số tự nhiên', 3),
  ((SELECT id FROM ch), 4, 'Phép cộng và phép trừ số tự nhiên', 4),
  ((SELECT id FROM ch), 5, 'Phép nhân và phép chia số tự nhiên', 5),
  ((SELECT id FROM ch), 6, 'Luỹ thừa với số mũ tự nhiên', 6),
  ((SELECT id FROM ch), 7, 'Thứ tự thực hiện các phép tính', 7);

-- Chương II. Tính chia hết trong tập hợp các số tự nhiên
WITH ch AS (
  INSERT INTO public.course_chapters (id, course_id, chapter_number, chapter_name, sort_order)
  VALUES ('00000006-0002-0000-0000-000000000000', '00000000-0000-0000-0000-000000000006', 2, 'Tính chia hết trong tập hợp các số tự nhiên', 2) RETURNING id
)
INSERT INTO public.course_lessons (chapter_id, lesson_number, lesson_name, sort_order) VALUES
  ((SELECT id FROM ch), 8, 'Quan hệ chia hết và tính chất', 1),
  ((SELECT id FROM ch), 9, 'Dấu hiệu chia hết', 2),
  ((SELECT id FROM ch), 10, 'Số nguyên tố', 3),
  ((SELECT id FROM ch), 11, 'Ước chung. Ước chung lớn nhất', 4),
  ((SELECT id FROM ch), 12, 'Bội chung. Bội chung nhỏ nhất', 5);

-- Chương III. Số nguyên
WITH ch AS (
  INSERT INTO public.course_chapters (id, course_id, chapter_number, chapter_name, sort_order)
  VALUES ('00000006-0003-0000-0000-000000000000', '00000000-0000-0000-0000-000000000006', 3, 'Số nguyên', 3) RETURNING id
)
INSERT INTO public.course_lessons (chapter_id, lesson_number, lesson_name, sort_order) VALUES
  ((SELECT id FROM ch), 13, 'Tập hợp các số nguyên', 1),
  ((SELECT id FROM ch), 14, 'Phép cộng và phép trừ số nguyên', 2),
  ((SELECT id FROM ch), 15, 'Quy tắc dấu ngoặc', 3),
  ((SELECT id FROM ch), 16, 'Phép nhân số nguyên', 4),
  ((SELECT id FROM ch), 17, 'Phép chia hết. Ước và bội của một số nguyên', 5);

-- Chương IV. Một số hình phẳng trong thực tiễn
WITH ch AS (
  INSERT INTO public.course_chapters (id, course_id, chapter_number, chapter_name, sort_order)
  VALUES ('00000006-0004-0000-0000-000000000000', '00000000-0000-0000-0000-000000000006', 4, 'Một số hình phẳng trong thực tiễn', 4) RETURNING id
)
INSERT INTO public.course_lessons (chapter_id, lesson_number, lesson_name, sort_order) VALUES
  ((SELECT id FROM ch), 18, 'Hình tam giác đều. Hình vuông. Hình lục giác đều', 1),
  ((SELECT id FROM ch), 19, 'Hình chữ nhật. Hình thoi. Hình bình hành. Hình thang cân', 2),
  ((SELECT id FROM ch), 20, 'Chu vi và diện tích của một số tứ giác đã học', 3);

-- Chương V. Tính đối xứng của hình phẳng trong tự nhiên
WITH ch AS (
  INSERT INTO public.course_chapters (id, course_id, chapter_number, chapter_name, sort_order)
  VALUES ('00000006-0005-0000-0000-000000000000', '00000000-0000-0000-0000-000000000006', 5, 'Tính đối xứng của hình phẳng trong tự nhiên', 5) RETURNING id
)
INSERT INTO public.course_lessons (chapter_id, lesson_number, lesson_name, sort_order) VALUES
  ((SELECT id FROM ch), 21, 'Hình có trục đối xứng', 1),
  ((SELECT id FROM ch), 22, 'Hình có tâm đối xứng', 2);

-- Chương VI. Phân số
WITH ch AS (
  INSERT INTO public.course_chapters (id, course_id, chapter_number, chapter_name, sort_order)
  VALUES ('00000006-0006-0000-0000-000000000000', '00000000-0000-0000-0000-000000000006', 6, 'Phân số', 6) RETURNING id
)
INSERT INTO public.course_lessons (chapter_id, lesson_number, lesson_name, sort_order) VALUES
  ((SELECT id FROM ch), 23, 'Mở rộng phân số. Phân số bằng nhau', 1),
  ((SELECT id FROM ch), 24, 'So sánh phân số. Hỗn số dương', 2),
  ((SELECT id FROM ch), 25, 'Phép cộng và phép trừ phân số', 3),
  ((SELECT id FROM ch), 26, 'Phép nhân và phép chia phân số', 4),
  ((SELECT id FROM ch), 27, 'Hai bài toán về phân số', 5);

-- Chương VII. Số thập phân
WITH ch AS (
  INSERT INTO public.course_chapters (id, course_id, chapter_number, chapter_name, sort_order)
  VALUES ('00000006-0007-0000-0000-000000000000', '00000000-0000-0000-0000-000000000006', 7, 'Số thập phân', 7) RETURNING id
)
INSERT INTO public.course_lessons (chapter_id, lesson_number, lesson_name, sort_order) VALUES
  ((SELECT id FROM ch), 28, 'Số thập phân', 1),
  ((SELECT id FROM ch), 29, 'Tính toán với số thập phân', 2),
  ((SELECT id FROM ch), 30, 'Làm tròn và ước lượng', 3),
  ((SELECT id FROM ch), 31, 'Một số bài toán về tỉ số và tỉ số phần trăm', 4);

-- Chương VIII. Những hình hình học cơ bản
WITH ch AS (
  INSERT INTO public.course_chapters (id, course_id, chapter_number, chapter_name, sort_order)
  VALUES ('00000006-0008-0000-0000-000000000000', '00000000-0000-0000-0000-000000000006', 8, 'Những hình hình học cơ bản', 8) RETURNING id
)
INSERT INTO public.course_lessons (chapter_id, lesson_number, lesson_name, sort_order) VALUES
  ((SELECT id FROM ch), 32, 'Điểm và đường thẳng', 1),
  ((SELECT id FROM ch), 33, 'Điểm nằm giữa hai điểm. Tia', 2),
  ((SELECT id FROM ch), 34, 'Đoạn thẳng. Độ dài đoạn thẳng', 3),
  ((SELECT id FROM ch), 35, 'Trung điểm của đoạn thẳng', 4),
  ((SELECT id FROM ch), 36, 'Góc', 5),
  ((SELECT id FROM ch), 37, 'Số đo góc', 6);

-- Chương IX. Dữ liệu và xác suất thực nghiệm
WITH ch AS (
  INSERT INTO public.course_chapters (id, course_id, chapter_number, chapter_name, sort_order)
  VALUES ('00000006-0009-0000-0000-000000000000', '00000000-0000-0000-0000-000000000006', 9, 'Dữ liệu và xác suất thực nghiệm', 9) RETURNING id
)
INSERT INTO public.course_lessons (chapter_id, lesson_number, lesson_name, sort_order) VALUES
  ((SELECT id FROM ch), 38, 'Dữ liệu và thu thập dữ liệu', 1),
  ((SELECT id FROM ch), 39, 'Bảng thống kê và biểu đồ tranh', 2),
  ((SELECT id FROM ch), 40, 'Biểu đồ cột', 3),
  ((SELECT id FROM ch), 41, 'Biểu đồ cột kép', 4);

-- ─── TOÁN 7 ───
INSERT INTO public.courses (id, title, description, grade, category_label, sort_order, is_published)
VALUES ('00000000-0000-0000-0000-000000000007', 'Toán lớp 7', 'Khóa học Toán lớp 7 — Số hữu tỉ, số thực, tam giác, thống kê', 7, 'THCS - Nền tảng', 2, false);

WITH ch AS (
  INSERT INTO public.course_chapters (id, course_id, chapter_number, chapter_name, sort_order)
  VALUES ('00000007-0001-0000-0000-000000000000', '00000000-0000-0000-0000-000000000007', 1, 'Số hữu tỉ', 1) RETURNING id
)
INSERT INTO public.course_lessons (chapter_id, lesson_number, lesson_name, sort_order) VALUES
  ((SELECT id FROM ch), 1, 'Tập hợp các số hữu tỉ', 1),
  ((SELECT id FROM ch), 2, 'Cộng, trừ, nhân, chia số hữu tỉ', 2),
  ((SELECT id FROM ch), 3, 'Luỹ thừa với số mũ tự nhiên của một số hữu tỉ', 3),
  ((SELECT id FROM ch), 4, 'Thứ tự thực hiện các phép tính. Quy tắc chuyển vế', 4);

WITH ch AS (
  INSERT INTO public.course_chapters (id, course_id, chapter_number, chapter_name, sort_order)
  VALUES ('00000007-0002-0000-0000-000000000000', '00000000-0000-0000-0000-000000000007', 2, 'Số thực', 2) RETURNING id
)
INSERT INTO public.course_lessons (chapter_id, lesson_number, lesson_name, sort_order) VALUES
  ((SELECT id FROM ch), 5, 'Làm quen với số thập phân vô hạn tuần hoàn', 1),
  ((SELECT id FROM ch), 6, 'Số vô tỉ. Căn bậc hai số học', 2),
  ((SELECT id FROM ch), 7, 'Tập hợp các số thực', 3);

WITH ch AS (
  INSERT INTO public.course_chapters (id, course_id, chapter_number, chapter_name, sort_order)
  VALUES ('00000007-0003-0000-0000-000000000000', '00000000-0000-0000-0000-000000000007', 3, 'Góc và đường thẳng song song', 3) RETURNING id
)
INSERT INTO public.course_lessons (chapter_id, lesson_number, lesson_name, sort_order) VALUES
  ((SELECT id FROM ch), 8, 'Góc ở vị trí đặc biệt. Tia phân giác của một góc', 1),
  ((SELECT id FROM ch), 9, 'Hai đường thẳng song song và dấu hiệu nhận biết', 2),
  ((SELECT id FROM ch), 10, 'Tiên đề Euclid. Tính chất của hai đường thẳng song song', 3),
  ((SELECT id FROM ch), 11, 'Định lí và chứng minh định lí', 4);

WITH ch AS (
  INSERT INTO public.course_chapters (id, course_id, chapter_number, chapter_name, sort_order)
  VALUES ('00000007-0004-0000-0000-000000000000', '00000000-0000-0000-0000-000000000007', 4, 'Tam giác bằng nhau', 4) RETURNING id
)
INSERT INTO public.course_lessons (chapter_id, lesson_number, lesson_name, sort_order) VALUES
  ((SELECT id FROM ch), 12, 'Tổng các góc trong một tam giác', 1),
  ((SELECT id FROM ch), 13, 'Hai tam giác bằng nhau. Trường hợp bằng nhau thứ nhất của tam giác', 2),
  ((SELECT id FROM ch), 14, 'Trường hợp bằng nhau thứ hai và thứ ba của tam giác', 3),
  ((SELECT id FROM ch), 15, 'Các trường hợp bằng nhau của tam giác vuông', 4),
  ((SELECT id FROM ch), 16, 'Tam giác cân. Đường trung trực của đoạn thẳng', 5);

WITH ch AS (
  INSERT INTO public.course_chapters (id, course_id, chapter_number, chapter_name, sort_order)
  VALUES ('00000007-0005-0000-0000-000000000000', '00000000-0000-0000-0000-000000000007', 5, 'Thu thập và biểu diễn dữ liệu', 5) RETURNING id
)
INSERT INTO public.course_lessons (chapter_id, lesson_number, lesson_name, sort_order) VALUES
  ((SELECT id FROM ch), 17, 'Thu thập và phân loại dữ liệu', 1),
  ((SELECT id FROM ch), 18, 'Biểu đồ hình quạt tròn', 2),
  ((SELECT id FROM ch), 19, 'Biểu đồ đoạn thẳng', 3);

WITH ch AS (
  INSERT INTO public.course_chapters (id, course_id, chapter_number, chapter_name, sort_order)
  VALUES ('00000007-0006-0000-0000-000000000000', '00000000-0000-0000-0000-000000000007', 6, 'Tỉ lệ thức và đại lượng tỉ lệ', 6) RETURNING id
)
INSERT INTO public.course_lessons (chapter_id, lesson_number, lesson_name, sort_order) VALUES
  ((SELECT id FROM ch), 20, 'Tỉ lệ thức', 1),
  ((SELECT id FROM ch), 21, 'Tính chất của dãy tỉ số bằng nhau', 2),
  ((SELECT id FROM ch), 22, 'Đại lượng tỉ lệ thuận', 3),
  ((SELECT id FROM ch), 23, 'Đại lượng tỉ lệ nghịch', 4);

WITH ch AS (
  INSERT INTO public.course_chapters (id, course_id, chapter_number, chapter_name, sort_order)
  VALUES ('00000007-0007-0000-0000-000000000000', '00000000-0000-0000-0000-000000000007', 7, 'Biểu thức đại số và đa thức một biến', 7) RETURNING id
)
INSERT INTO public.course_lessons (chapter_id, lesson_number, lesson_name, sort_order) VALUES
  ((SELECT id FROM ch), 24, 'Biểu thức đại số', 1),
  ((SELECT id FROM ch), 25, 'Đa thức một biến', 2),
  ((SELECT id FROM ch), 26, 'Phép cộng và phép trừ đa thức một biến', 3),
  ((SELECT id FROM ch), 27, 'Phép nhân đa thức một biến', 4),
  ((SELECT id FROM ch), 28, 'Phép chia đa thức một biến', 5);

WITH ch AS (
  INSERT INTO public.course_chapters (id, course_id, chapter_number, chapter_name, sort_order)
  VALUES ('00000007-0008-0000-0000-000000000000', '00000000-0000-0000-0000-000000000007', 8, 'Làm quen với biến cố và xác suất của biến cố', 8) RETURNING id
)
INSERT INTO public.course_lessons (chapter_id, lesson_number, lesson_name, sort_order) VALUES
  ((SELECT id FROM ch), 29, 'Làm quen với biến cố', 1),
  ((SELECT id FROM ch), 30, 'Làm quen với xác suất của biến cố', 2);

WITH ch AS (
  INSERT INTO public.course_chapters (id, course_id, chapter_number, chapter_name, sort_order)
  VALUES ('00000007-0009-0000-0000-000000000000', '00000000-0000-0000-0000-000000000007', 9, 'Quan hệ giữa các yếu tố trong một tam giác', 9) RETURNING id
)
INSERT INTO public.course_lessons (chapter_id, lesson_number, lesson_name, sort_order) VALUES
  ((SELECT id FROM ch), 31, 'Quan hệ giữa góc và cạnh đối diện trong một tam giác', 1),
  ((SELECT id FROM ch), 32, 'Quan hệ giữa đường vuông góc và đường xiên', 2),
  ((SELECT id FROM ch), 33, 'Quan hệ giữa ba cạnh của một tam giác', 3),
  ((SELECT id FROM ch), 34, 'Sự đồng quy của ba trung tuyến, ba đường phân giác trong một tam giác', 4),
  ((SELECT id FROM ch), 35, 'Sự đồng quy của ba đường trung trực, ba đường cao trong một tam giác', 5);

WITH ch AS (
  INSERT INTO public.course_chapters (id, course_id, chapter_number, chapter_name, sort_order)
  VALUES ('00000007-0010-0000-0000-000000000000', '00000000-0000-0000-0000-000000000007', 10, 'Một số hình khối trong thực tiễn', 10) RETURNING id
)
INSERT INTO public.course_lessons (chapter_id, lesson_number, lesson_name, sort_order) VALUES
  ((SELECT id FROM ch), 36, 'Hình hộp chữ nhật và hình lập phương', 1),
  ((SELECT id FROM ch), 37, 'Hình lăng trụ đứng tam giác và hình lăng trụ đứng tứ giác', 2);

-- ─── TOÁN 8 ───
INSERT INTO public.courses (id, title, description, grade, category_label, sort_order, is_published)
VALUES ('00000000-0000-0000-0000-000000000008', 'Toán lớp 8', 'Khóa học Toán lớp 8 — Đa thức, hằng đẳng thức, phương trình, tam giác đồng dạng', 8, 'THCS - Phát triển', 3, false);

WITH ch AS (
  INSERT INTO public.course_chapters (id, course_id, chapter_number, chapter_name, sort_order)
  VALUES ('00000008-0001-0000-0000-000000000000', '00000000-0000-0000-0000-000000000008', 1, 'Đa thức', 1) RETURNING id
)
INSERT INTO public.course_lessons (chapter_id, lesson_number, lesson_name, sort_order) VALUES
  ((SELECT id FROM ch), 1, 'Đơn thức', 1),
  ((SELECT id FROM ch), 2, 'Đa thức', 2),
  ((SELECT id FROM ch), 3, 'Phép cộng và phép trừ đa thức', 3),
  ((SELECT id FROM ch), 4, 'Phép nhân đa thức', 4),
  ((SELECT id FROM ch), 5, 'Phép chia đa thức cho đơn thức', 5);

WITH ch AS (
  INSERT INTO public.course_chapters (id, course_id, chapter_number, chapter_name, sort_order)
  VALUES ('00000008-0002-0000-0000-000000000000', '00000000-0000-0000-0000-000000000008', 2, 'Hằng đẳng thức đáng nhớ và ứng dụng', 2) RETURNING id
)
INSERT INTO public.course_lessons (chapter_id, lesson_number, lesson_name, sort_order) VALUES
  ((SELECT id FROM ch), 6, 'Hiệu hai bình phương. Bình phương của một tổng hay một hiệu', 1),
  ((SELECT id FROM ch), 7, 'Lập phương của một tổng hay một hiệu', 2),
  ((SELECT id FROM ch), 8, 'Tổng và hiệu hai lập phương', 3),
  ((SELECT id FROM ch), 9, 'Phân tích đa thức thành nhân tử', 4);

WITH ch AS (
  INSERT INTO public.course_chapters (id, course_id, chapter_number, chapter_name, sort_order)
  VALUES ('00000008-0003-0000-0000-000000000000', '00000000-0000-0000-0000-000000000008', 3, 'Tứ giác', 3) RETURNING id
)
INSERT INTO public.course_lessons (chapter_id, lesson_number, lesson_name, sort_order) VALUES
  ((SELECT id FROM ch), 10, 'Tứ giác', 1),
  ((SELECT id FROM ch), 11, 'Hình thang cân', 2),
  ((SELECT id FROM ch), 12, 'Hình bình hành', 3),
  ((SELECT id FROM ch), 13, 'Hình chữ nhật', 4),
  ((SELECT id FROM ch), 14, 'Hình thoi và hình vuông', 5);

WITH ch AS (
  INSERT INTO public.course_chapters (id, course_id, chapter_number, chapter_name, sort_order)
  VALUES ('00000008-0004-0000-0000-000000000000', '00000000-0000-0000-0000-000000000008', 4, 'Định lí Thales', 4) RETURNING id
)
INSERT INTO public.course_lessons (chapter_id, lesson_number, lesson_name, sort_order) VALUES
  ((SELECT id FROM ch), 15, 'Định lí Thalès trong tam giác', 1),
  ((SELECT id FROM ch), 16, 'Đường trung bình của tam giác', 2),
  ((SELECT id FROM ch), 17, 'Tính chất đường phân giác của tam giác', 3);

WITH ch AS (
  INSERT INTO public.course_chapters (id, course_id, chapter_number, chapter_name, sort_order)
  VALUES ('00000008-0005-0000-0000-000000000000', '00000000-0000-0000-0000-000000000008', 5, 'Dữ liệu và biểu đồ', 5) RETURNING id
)
INSERT INTO public.course_lessons (chapter_id, lesson_number, lesson_name, sort_order) VALUES
  ((SELECT id FROM ch), 18, 'Thu thập và phân loại dữ liệu', 1),
  ((SELECT id FROM ch), 19, 'Biểu diễn dữ liệu bằng bảng, biểu đồ', 2),
  ((SELECT id FROM ch), 20, 'Phân tích số liệu thống kê dựa vào biểu đồ', 3);

WITH ch AS (
  INSERT INTO public.course_chapters (id, course_id, chapter_number, chapter_name, sort_order)
  VALUES ('00000008-0006-0000-0000-000000000000', '00000000-0000-0000-0000-000000000008', 6, 'Phân thức đại số', 6) RETURNING id
)
INSERT INTO public.course_lessons (chapter_id, lesson_number, lesson_name, sort_order) VALUES
  ((SELECT id FROM ch), 21, 'Phân thức đại số', 1),
  ((SELECT id FROM ch), 22, 'Tính chất cơ bản của phân thức đại số', 2),
  ((SELECT id FROM ch), 23, 'Phép cộng và phép trừ phân thức đại số', 3),
  ((SELECT id FROM ch), 24, 'Phép nhân và phép chia phân thức đại số', 4);

WITH ch AS (
  INSERT INTO public.course_chapters (id, course_id, chapter_number, chapter_name, sort_order)
  VALUES ('00000008-0007-0000-0000-000000000000', '00000000-0000-0000-0000-000000000008', 7, 'Phương trình bậc nhất và hàm số bậc nhất', 7) RETURNING id
)
INSERT INTO public.course_lessons (chapter_id, lesson_number, lesson_name, sort_order) VALUES
  ((SELECT id FROM ch), 25, 'Phương trình bậc nhất một ẩn', 1),
  ((SELECT id FROM ch), 26, 'Giải bài toán bằng cách lập phương trình', 2),
  ((SELECT id FROM ch), 27, 'Khái niệm hàm số và đồ thị của hàm số', 3),
  ((SELECT id FROM ch), 28, 'Hàm số bậc nhất và đồ thị của hàm số bậc nhất', 4),
  ((SELECT id FROM ch), 29, 'Hệ số góc của đường thẳng', 5);

WITH ch AS (
  INSERT INTO public.course_chapters (id, course_id, chapter_number, chapter_name, sort_order)
  VALUES ('00000008-0008-0000-0000-000000000000', '00000000-0000-0000-0000-000000000008', 8, 'Mở đầu về tính xác suất của biến cố', 8) RETURNING id
)
INSERT INTO public.course_lessons (chapter_id, lesson_number, lesson_name, sort_order) VALUES
  ((SELECT id FROM ch), 30, 'Kết quả có thể và kết quả thuận lợi', 1),
  ((SELECT id FROM ch), 31, 'Cách tính xác suất của biến cố bằng tỉ số', 2),
  ((SELECT id FROM ch), 32, 'Mối liên hệ giữa xác suất thực nghiệm với xác suất và ứng dụng', 3);

WITH ch AS (
  INSERT INTO public.course_chapters (id, course_id, chapter_number, chapter_name, sort_order)
  VALUES ('00000008-0009-0000-0000-000000000000', '00000000-0000-0000-0000-000000000008', 9, 'Tam giác đồng dạng', 9) RETURNING id
)
INSERT INTO public.course_lessons (chapter_id, lesson_number, lesson_name, sort_order) VALUES
  ((SELECT id FROM ch), 33, 'Hai tam giác đồng dạng', 1),
  ((SELECT id FROM ch), 34, 'Ba trường hợp đồng dạng của hai tam giác', 2),
  ((SELECT id FROM ch), 35, 'Định lí Pythagore và ứng dụng', 3),
  ((SELECT id FROM ch), 36, 'Các trường hợp đồng dạng của hai tam giác vuông', 4),
  ((SELECT id FROM ch), 37, 'Hình đồng dạng', 5);

WITH ch AS (
  INSERT INTO public.course_chapters (id, course_id, chapter_number, chapter_name, sort_order)
  VALUES ('00000008-0010-0000-0000-000000000000', '00000000-0000-0000-0000-000000000008', 10, 'Một số hình khối trong thực tiễn', 10) RETURNING id
)
INSERT INTO public.course_lessons (chapter_id, lesson_number, lesson_name, sort_order) VALUES
  ((SELECT id FROM ch), 38, 'Hình chóp tam giác đều', 1),
  ((SELECT id FROM ch), 39, 'Hình chóp tứ giác đều', 2);

-- ─── TOÁN 9 ───
INSERT INTO public.courses (id, title, description, grade, category_label, sort_order, is_published)
VALUES ('00000000-0000-0000-0000-000000000009', 'Toán lớp 9', 'Khóa học Toán lớp 9 — Hệ phương trình, căn bậc hai, đường tròn, luyện thi vào 10', 9, 'THCS - Luyện thi', 4, false);

WITH ch AS (
  INSERT INTO public.course_chapters (id, course_id, chapter_number, chapter_name, sort_order)
  VALUES ('00000009-0001-0000-0000-000000000000', '00000000-0000-0000-0000-000000000009', 1, 'Phương trình và hệ hai phương trình bậc nhất hai ẩn', 1) RETURNING id
)
INSERT INTO public.course_lessons (chapter_id, lesson_number, lesson_name, sort_order) VALUES
  ((SELECT id FROM ch), 1, 'Khái niệm phương trình và hệ hai phương trình bậc nhất hai ẩn', 1),
  ((SELECT id FROM ch), 2, 'Giải hệ hai phương trình bậc nhất hai ẩn', 2),
  ((SELECT id FROM ch), 3, 'Giải bài toán bằng cách lập hệ phương trình', 3);

WITH ch AS (
  INSERT INTO public.course_chapters (id, course_id, chapter_number, chapter_name, sort_order)
  VALUES ('00000009-0002-0000-0000-000000000000', '00000000-0000-0000-0000-000000000009', 2, 'Phương trình và bất phương trình bậc nhất một ẩn', 2) RETURNING id
)
INSERT INTO public.course_lessons (chapter_id, lesson_number, lesson_name, sort_order) VALUES
  ((SELECT id FROM ch), 4, 'Phương trình quy về phương trình bậc nhất một ẩn', 1),
  ((SELECT id FROM ch), 5, 'Bất đẳng thức và tính chất', 2),
  ((SELECT id FROM ch), 6, 'Bất phương trình bậc nhất một ẩn', 3);

WITH ch AS (
  INSERT INTO public.course_chapters (id, course_id, chapter_number, chapter_name, sort_order)
  VALUES ('00000009-0003-0000-0000-000000000000', '00000000-0000-0000-0000-000000000009', 3, 'Căn bậc hai và căn bậc ba', 3) RETURNING id
)
INSERT INTO public.course_lessons (chapter_id, lesson_number, lesson_name, sort_order) VALUES
  ((SELECT id FROM ch), 7, 'Căn bậc hai và căn thức bậc hai', 1),
  ((SELECT id FROM ch), 8, 'Khai căn bậc hai với phép nhân và phép chia', 2),
  ((SELECT id FROM ch), 9, 'Biến đổi đơn giản và rút gọn biểu thức chứa căn thức bậc hai', 3),
  ((SELECT id FROM ch), 10, 'Căn bậc ba và căn thức bậc ba', 4);

WITH ch AS (
  INSERT INTO public.course_chapters (id, course_id, chapter_number, chapter_name, sort_order)
  VALUES ('00000009-0004-0000-0000-000000000000', '00000000-0000-0000-0000-000000000009', 4, 'Hệ thức lượng trong tam giác vuông', 4) RETURNING id
)
INSERT INTO public.course_lessons (chapter_id, lesson_number, lesson_name, sort_order) VALUES
  ((SELECT id FROM ch), 11, 'Tỉ số lượng giác của góc nhọn', 1),
  ((SELECT id FROM ch), 12, 'Một số hệ thức giữa cạnh, góc trong tam giác vuông và ứng dụng', 2);

WITH ch AS (
  INSERT INTO public.course_chapters (id, course_id, chapter_number, chapter_name, sort_order)
  VALUES ('00000009-0005-0000-0000-000000000000', '00000000-0000-0000-0000-000000000009', 5, 'Đường tròn', 5) RETURNING id
)
INSERT INTO public.course_lessons (chapter_id, lesson_number, lesson_name, sort_order) VALUES
  ((SELECT id FROM ch), 13, 'Mở đầu về đường tròn', 1),
  ((SELECT id FROM ch), 14, 'Cung và dây của một đường tròn', 2),
  ((SELECT id FROM ch), 15, 'Độ dài của cung tròn. Diện tích hình quạt tròn và hình vành khuyên', 3),
  ((SELECT id FROM ch), 16, 'Vị trí tương đối của đường thẳng và đường tròn', 4),
  ((SELECT id FROM ch), 17, 'Vị trí tương đối của hai đường tròn', 5);

WITH ch AS (
  INSERT INTO public.course_chapters (id, course_id, chapter_number, chapter_name, sort_order)
  VALUES ('00000009-0006-0000-0000-000000000000', '00000000-0000-0000-0000-000000000009', 6, 'Hàm số y = ax² (a ≠ 0). Phương trình bậc hai một ẩn', 6) RETURNING id
)
INSERT INTO public.course_lessons (chapter_id, lesson_number, lesson_name, sort_order) VALUES
  ((SELECT id FROM ch), 18, 'Hàm số y = ax² (a ≠ 0)', 1),
  ((SELECT id FROM ch), 19, 'Phương trình bậc hai một ẩn', 2),
  ((SELECT id FROM ch), 20, 'Định lí Viète và ứng dụng', 3),
  ((SELECT id FROM ch), 21, 'Giải bài toán bằng cách lập phương trình', 4);

WITH ch AS (
  INSERT INTO public.course_chapters (id, course_id, chapter_number, chapter_name, sort_order)
  VALUES ('00000009-0007-0000-0000-000000000000', '00000000-0000-0000-0000-000000000009', 7, 'Tần số và tần số tương đối', 7) RETURNING id
)
INSERT INTO public.course_lessons (chapter_id, lesson_number, lesson_name, sort_order) VALUES
  ((SELECT id FROM ch), 22, 'Bảng tần số và biểu đồ tần số', 1),
  ((SELECT id FROM ch), 23, 'Bảng tần số tương đối và biểu đồ tần số tương đối', 2),
  ((SELECT id FROM ch), 24, 'Bảng tần số, tần số tương đối ghép nhóm và biểu đồ', 3);

WITH ch AS (
  INSERT INTO public.course_chapters (id, course_id, chapter_number, chapter_name, sort_order)
  VALUES ('00000009-0008-0000-0000-000000000000', '00000000-0000-0000-0000-000000000009', 8, 'Xác suất của biến cố trong một số mô hình xác suất đơn giản', 8) RETURNING id
)
INSERT INTO public.course_lessons (chapter_id, lesson_number, lesson_name, sort_order) VALUES
  ((SELECT id FROM ch), 25, 'Phép thử ngẫu nhiên và không gian mẫu', 1),
  ((SELECT id FROM ch), 26, 'Xác suất của biến cố liên quan tới phép thử', 2);

WITH ch AS (
  INSERT INTO public.course_chapters (id, course_id, chapter_number, chapter_name, sort_order)
  VALUES ('00000009-0009-0000-0000-000000000000', '00000000-0000-0000-0000-000000000009', 9, 'Đường tròn ngoại tiếp và đường tròn nội tiếp', 9) RETURNING id
)
INSERT INTO public.course_lessons (chapter_id, lesson_number, lesson_name, sort_order) VALUES
  ((SELECT id FROM ch), 27, 'Góc nội tiếp', 1),
  ((SELECT id FROM ch), 28, 'Đường tròn ngoại tiếp và đường tròn nội tiếp của một tam giác', 2),
  ((SELECT id FROM ch), 29, 'Tứ giác nội tiếp', 3),
  ((SELECT id FROM ch), 30, 'Đa giác đều', 4);

WITH ch AS (
  INSERT INTO public.course_chapters (id, course_id, chapter_number, chapter_name, sort_order)
  VALUES ('00000009-0010-0000-0000-000000000000', '00000000-0000-0000-0000-000000000009', 10, 'Một số hình khối trong thực tiễn', 10) RETURNING id
)
INSERT INTO public.course_lessons (chapter_id, lesson_number, lesson_name, sort_order) VALUES
  ((SELECT id FROM ch), 31, 'Hình trụ và hình nón', 1),
  ((SELECT id FROM ch), 32, 'Hình cầu', 2);

-- ─── TOÁN 10 ───
INSERT INTO public.courses (id, title, description, grade, category_label, sort_order, is_published)
VALUES ('00000000-0000-0000-0000-000000000010', 'Toán lớp 10', 'Khóa học Toán lớp 10 — Mệnh đề, tập hợp, hàm số, vector', 10, 'THPT - Nền tảng', 5, false);

-- ─── TOÁN 11 ───
INSERT INTO public.courses (id, title, description, grade, category_label, sort_order, is_published)
VALUES ('00000000-0000-0000-0000-000000000011', 'Toán lớp 11', 'Khóa học Toán lớp 11 — Lượng giác, tổ hợp, xác suất, dãy số', 11, 'THPT - Nâng cao', 6, false);

-- ─── TOÁN 12 ───
INSERT INTO public.courses (id, title, description, grade, category_label, sort_order, is_published)
VALUES ('00000000-0000-0000-0000-000000000012', 'Toán lớp 12', 'Khóa học Toán lớp 12 — Hàm số, tích phân, hình không gian, số phức', 12, 'THPT - Luyện thi', 7, false);

-- Lưu ý: Chương/bài cho Toán 10, 11, 12 sẽ được Admin thêm qua trang Quản lý khóa học
-- vì cấu trúc THPT đã có sẵn trong bảng chapters/lessons hiện tại
