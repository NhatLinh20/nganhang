-- supabase/migrations/007_high_school_math.sql
-- Thêm chương bài cho khóa học Toán 10, 11, 12

-- ─── TOÁN 10 ───
WITH ch AS (
  INSERT INTO public.course_chapters (id, course_id, chapter_number, chapter_name, sort_order)
  VALUES ('00000010-0001-0000-0000-000000000000', '00000000-0000-0000-0000-000000000010', 1, 'Mệnh đề và tập hợp', 1) RETURNING id
)
INSERT INTO public.course_lessons (chapter_id, lesson_number, lesson_name, sort_order) VALUES
  ((SELECT id FROM ch), 1, 'Mệnh đề', 1),
  ((SELECT id FROM ch), 2, 'Tập hợp và các phép toán trên tập hợp', 2),
  ((SELECT id FROM ch), 3, 'Bài tập cuối chương I', 3);

WITH ch AS (
  INSERT INTO public.course_chapters (id, course_id, chapter_number, chapter_name, sort_order)
  VALUES ('00000010-0002-0000-0000-000000000000', '00000000-0000-0000-0000-000000000010', 2, 'Bất phương trình và hệ bất phương trình bậc nhất hai ẩn', 2) RETURNING id
)
INSERT INTO public.course_lessons (chapter_id, lesson_number, lesson_name, sort_order) VALUES
  ((SELECT id FROM ch), 4, 'Bất phương trình bậc nhất hai ẩn', 1),
  ((SELECT id FROM ch), 5, 'Hệ bất phương trình bậc nhất hai ẩn', 2),
  ((SELECT id FROM ch), 6, 'Bài tập cuối chương II', 3);

WITH ch AS (
  INSERT INTO public.course_chapters (id, course_id, chapter_number, chapter_name, sort_order)
  VALUES ('00000010-0003-0000-0000-000000000000', '00000000-0000-0000-0000-000000000010', 3, 'Hệ thức lượng trong tam giác', 3) RETURNING id
)
INSERT INTO public.course_lessons (chapter_id, lesson_number, lesson_name, sort_order) VALUES
  ((SELECT id FROM ch), 7, 'Giá trị lượng giác của một góc từ 0° đến 180°', 1),
  ((SELECT id FROM ch), 8, 'Hệ thức lượng trong tam giác', 2),
  ((SELECT id FROM ch), 9, 'Bài tập cuối chương III', 3);

WITH ch AS (
  INSERT INTO public.course_chapters (id, course_id, chapter_number, chapter_name, sort_order)
  VALUES ('00000010-0004-0000-0000-000000000000', '00000000-0000-0000-0000-000000000010', 4, 'Vectơ', 4) RETURNING id
)
INSERT INTO public.course_lessons (chapter_id, lesson_number, lesson_name, sort_order) VALUES
  ((SELECT id FROM ch), 10, 'Các khái niệm mở đầu', 1),
  ((SELECT id FROM ch), 11, 'Tổng và hiệu của hai vectơ', 2),
  ((SELECT id FROM ch), 12, 'Tích của một vectơ với một số', 3),
  ((SELECT id FROM ch), 13, 'Vectơ trong mặt phẳng toạ độ', 4),
  ((SELECT id FROM ch), 14, 'Tích vô hướng của hai vectơ', 5),
  ((SELECT id FROM ch), 15, 'Bài tập cuối chương IV', 6);

WITH ch AS (
  INSERT INTO public.course_chapters (id, course_id, chapter_number, chapter_name, sort_order)
  VALUES ('00000010-0005-0000-0000-000000000000', '00000000-0000-0000-0000-000000000010', 5, 'Các số đặc trưng của mẫu số liệu không ghép nhóm', 5) RETURNING id
)
INSERT INTO public.course_lessons (chapter_id, lesson_number, lesson_name, sort_order) VALUES
  ((SELECT id FROM ch), 16, 'Số gần đúng và sai số', 1),
  ((SELECT id FROM ch), 17, 'Các số đặc trưng đo xu thế trung tâm', 2),
  ((SELECT id FROM ch), 18, 'Các số đặc trưng đo độ phân tán', 3),
  ((SELECT id FROM ch), 19, 'Bài tập cuối chương V', 4);

WITH ch AS (
  INSERT INTO public.course_chapters (id, course_id, chapter_number, chapter_name, sort_order)
  VALUES ('00000010-0006-0000-0000-000000000000', '00000000-0000-0000-0000-000000000010', 6, 'Hàm số, đồ thị và ứng dụng', 6) RETURNING id
)
INSERT INTO public.course_lessons (chapter_id, lesson_number, lesson_name, sort_order) VALUES
  ((SELECT id FROM ch), 20, 'Hàm số', 1),
  ((SELECT id FROM ch), 21, 'Hàm số bậc hai', 2),
  ((SELECT id FROM ch), 22, 'Dấu của tam thức bậc hai', 3),
  ((SELECT id FROM ch), 23, 'Phương trình quy về phương trình bậc hai', 4),
  ((SELECT id FROM ch), 24, 'Bài tập cuối chương VI', 5);

WITH ch AS (
  INSERT INTO public.course_chapters (id, course_id, chapter_number, chapter_name, sort_order)
  VALUES ('00000010-0007-0000-0000-000000000000', '00000000-0000-0000-0000-000000000010', 7, 'Phương pháp toạ độ trong mặt phẳng', 7) RETURNING id
)
INSERT INTO public.course_lessons (chapter_id, lesson_number, lesson_name, sort_order) VALUES
  ((SELECT id FROM ch), 25, 'Phương trình đường thẳng', 1),
  ((SELECT id FROM ch), 26, 'Vị trí tương đối giữa hai đường thẳng. Góc và khoảng cách', 2),
  ((SELECT id FROM ch), 27, 'Đường tròn trong mặt phẳng toạ độ', 3),
  ((SELECT id FROM ch), 28, 'Ba đường conic', 4),
  ((SELECT id FROM ch), 29, 'Bài tập cuối chương VII', 5);

WITH ch AS (
  INSERT INTO public.course_chapters (id, course_id, chapter_number, chapter_name, sort_order)
  VALUES ('00000010-0008-0000-0000-000000000000', '00000000-0000-0000-0000-000000000010', 8, 'Đại số tổ hợp', 8) RETURNING id
)
INSERT INTO public.course_lessons (chapter_id, lesson_number, lesson_name, sort_order) VALUES
  ((SELECT id FROM ch), 30, 'Quy tắc đếm', 1),
  ((SELECT id FROM ch), 31, 'Hoán vị, chỉnh hợp và tổ hợp', 2),
  ((SELECT id FROM ch), 32, 'Nhị thức Newton', 3),
  ((SELECT id FROM ch), 33, 'Bài tập cuối chương VIII', 4);

WITH ch AS (
  INSERT INTO public.course_chapters (id, course_id, chapter_number, chapter_name, sort_order)
  VALUES ('00000010-0009-0000-0000-000000000000', '00000000-0000-0000-0000-000000000010', 9, 'Tính xác suất theo định nghĩa cổ điển', 9) RETURNING id
)
INSERT INTO public.course_lessons (chapter_id, lesson_number, lesson_name, sort_order) VALUES
  ((SELECT id FROM ch), 34, 'Biến cố và định nghĩa cổ điển của xác suất', 1),
  ((SELECT id FROM ch), 35, 'Thực hành tính xác suất theo định nghĩa cổ điển', 2),
  ((SELECT id FROM ch), 36, 'Bài tập cuối chương IX', 3);

-- ─── TOÁN 11 ───
WITH ch AS (
  INSERT INTO public.course_chapters (id, course_id, chapter_number, chapter_name, sort_order)
  VALUES ('00000011-0001-0000-0000-000000000000', '00000000-0000-0000-0000-000000000011', 1, 'Hàm số lượng giác và phương trình lượng giác', 1) RETURNING id
)
INSERT INTO public.course_lessons (chapter_id, lesson_number, lesson_name, sort_order) VALUES
  ((SELECT id FROM ch), 1, 'Giá trị lượng giác của góc lượng giác', 1),
  ((SELECT id FROM ch), 2, 'Công thức lượng giác', 2),
  ((SELECT id FROM ch), 3, 'Hàm số lượng giác', 3),
  ((SELECT id FROM ch), 4, 'Phương trình lượng giác cơ bản', 4),
  ((SELECT id FROM ch), 5, 'Bài tập cuối chương I', 5);

WITH ch AS (
  INSERT INTO public.course_chapters (id, course_id, chapter_number, chapter_name, sort_order)
  VALUES ('00000011-0002-0000-0000-000000000000', '00000000-0000-0000-0000-000000000011', 2, 'Dãy số. Cấp số cộng và cấp số nhân', 2) RETURNING id
)
INSERT INTO public.course_lessons (chapter_id, lesson_number, lesson_name, sort_order) VALUES
  ((SELECT id FROM ch), 6, 'Dãy số', 1),
  ((SELECT id FROM ch), 7, 'Cấp số cộng', 2),
  ((SELECT id FROM ch), 8, 'Cấp số nhân', 3),
  ((SELECT id FROM ch), 9, 'Bài tập cuối chương II', 4);

WITH ch AS (
  INSERT INTO public.course_chapters (id, course_id, chapter_number, chapter_name, sort_order)
  VALUES ('00000011-0003-0000-0000-000000000000', '00000000-0000-0000-0000-000000000011', 3, 'Các số đặc trưng đo xu thế trung tâm của mẫu số liệu ghép nhóm', 3) RETURNING id
)
INSERT INTO public.course_lessons (chapter_id, lesson_number, lesson_name, sort_order) VALUES
  ((SELECT id FROM ch), 10, 'Mẫu số liệu ghép nhóm', 1),
  ((SELECT id FROM ch), 11, 'Các số đặc trưng đo xu thế trung tâm', 2),
  ((SELECT id FROM ch), 12, 'Bài tập cuối chương III', 3);

WITH ch AS (
  INSERT INTO public.course_chapters (id, course_id, chapter_number, chapter_name, sort_order)
  VALUES ('00000011-0004-0000-0000-000000000000', '00000000-0000-0000-0000-000000000011', 4, 'Quan hệ song song trong không gian', 4) RETURNING id
)
INSERT INTO public.course_lessons (chapter_id, lesson_number, lesson_name, sort_order) VALUES
  ((SELECT id FROM ch), 13, 'Đường thẳng và mặt phẳng trong không gian', 1),
  ((SELECT id FROM ch), 14, 'Hai đường thẳng song song', 2),
  ((SELECT id FROM ch), 15, 'Đường thẳng và mặt phẳng song song', 3),
  ((SELECT id FROM ch), 16, 'Hai mặt phẳng song song', 4),
  ((SELECT id FROM ch), 17, 'Phép chiếu song song', 5),
  ((SELECT id FROM ch), 18, 'Bài tập cuối chương IV', 6);

WITH ch AS (
  INSERT INTO public.course_chapters (id, course_id, chapter_number, chapter_name, sort_order)
  VALUES ('00000011-0005-0000-0000-000000000000', '00000000-0000-0000-0000-000000000011', 5, 'Giới hạn. Hàm số liên tục', 5) RETURNING id
)
INSERT INTO public.course_lessons (chapter_id, lesson_number, lesson_name, sort_order) VALUES
  ((SELECT id FROM ch), 19, 'Giới hạn của dãy số', 1),
  ((SELECT id FROM ch), 20, 'Giới hạn của hàm số', 2),
  ((SELECT id FROM ch), 21, 'Hàm số liên tục', 3),
  ((SELECT id FROM ch), 22, 'Bài tập cuối chương V', 4);

WITH ch AS (
  INSERT INTO public.course_chapters (id, course_id, chapter_number, chapter_name, sort_order)
  VALUES ('00000011-0006-0000-0000-000000000000', '00000000-0000-0000-0000-000000000011', 6, 'Hàm số mũ và hàm số lôgarit', 6) RETURNING id
)
INSERT INTO public.course_lessons (chapter_id, lesson_number, lesson_name, sort_order) VALUES
  ((SELECT id FROM ch), 23, 'Luỹ thừa với số mũ thực', 1),
  ((SELECT id FROM ch), 24, 'Lôgarit', 2),
  ((SELECT id FROM ch), 25, 'Hàm số mũ và hàm số lôgarit', 3),
  ((SELECT id FROM ch), 26, 'Phương trình, bất phương trình mũ và lôgarit', 4),
  ((SELECT id FROM ch), 27, 'Bài tập cuối chương VI', 5);

WITH ch AS (
  INSERT INTO public.course_chapters (id, course_id, chapter_number, chapter_name, sort_order)
  VALUES ('00000011-0007-0000-0000-000000000000', '00000000-0000-0000-0000-000000000011', 7, 'Quan hệ vuông góc trong không gian', 7) RETURNING id
)
INSERT INTO public.course_lessons (chapter_id, lesson_number, lesson_name, sort_order) VALUES
  ((SELECT id FROM ch), 28, 'Hai đường thẳng vuông góc', 1),
  ((SELECT id FROM ch), 29, 'Đường thẳng vuông góc với mặt phẳng', 2),
  ((SELECT id FROM ch), 30, 'Phép chiếu vuông góc. Góc giữa đường thẳng và mặt phẳng', 3),
  ((SELECT id FROM ch), 31, 'Hai mặt phẳng vuông góc', 4),
  ((SELECT id FROM ch), 32, 'Khoảng cách', 5),
  ((SELECT id FROM ch), 33, 'Thể tích', 6),
  ((SELECT id FROM ch), 34, 'Bài tập cuối chương VII', 7);

WITH ch AS (
  INSERT INTO public.course_chapters (id, course_id, chapter_number, chapter_name, sort_order)
  VALUES ('00000011-0008-0000-0000-000000000000', '00000000-0000-0000-0000-000000000011', 8, 'Các quy tắc tính xác suất', 8) RETURNING id
)
INSERT INTO public.course_lessons (chapter_id, lesson_number, lesson_name, sort_order) VALUES
  ((SELECT id FROM ch), 35, 'Biến cố hợp, biến cố giao, biến cố độc lập', 1),
  ((SELECT id FROM ch), 36, 'Công thức cộng xác suất', 2),
  ((SELECT id FROM ch), 37, 'Công thức nhân xác suất cho hai biến cố độc lập', 3),
  ((SELECT id FROM ch), 38, 'Bài tập cuối chương VIII', 4);

WITH ch AS (
  INSERT INTO public.course_chapters (id, course_id, chapter_number, chapter_name, sort_order)
  VALUES ('00000011-0009-0000-0000-000000000000', '00000000-0000-0000-0000-000000000011', 9, 'Đạo hàm', 9) RETURNING id
)
INSERT INTO public.course_lessons (chapter_id, lesson_number, lesson_name, sort_order) VALUES
  ((SELECT id FROM ch), 39, 'Định nghĩa và ý nghĩa của đạo hàm', 1),
  ((SELECT id FROM ch), 40, 'Các quy tắc tính đạo hàm', 2),
  ((SELECT id FROM ch), 41, 'Đạo hàm cấp hai', 3),
  ((SELECT id FROM ch), 42, 'Bài tập cuối chương IX', 4);

-- ─── TOÁN 12 ───
WITH ch AS (
  INSERT INTO public.course_chapters (id, course_id, chapter_number, chapter_name, sort_order)
  VALUES ('00000012-0001-0000-0000-000000000000', '00000000-0000-0000-0000-000000000012', 1, 'Ứng dụng đạo hàm để khảo sát và vẽ đồ thị hàm số', 1) RETURNING id
)
INSERT INTO public.course_lessons (chapter_id, lesson_number, lesson_name, sort_order) VALUES
  ((SELECT id FROM ch), 1, 'Tính đơn điệu và cực trị của hàm số', 1),
  ((SELECT id FROM ch), 2, 'Giá trị lớn nhất và giá trị nhỏ nhất của hàm số', 2),
  ((SELECT id FROM ch), 3, 'Đường tiệm cận của đồ thị hàm số', 3),
  ((SELECT id FROM ch), 4, 'Khảo sát sự biến thiên và vẽ đồ thị của hàm số', 4),
  ((SELECT id FROM ch), 5, 'Ứng dụng đạo hàm để giải quyết một số vấn đề liên quan đến thực tiễn', 5),
  ((SELECT id FROM ch), 6, 'Bài tập cuối chương I', 6);

WITH ch AS (
  INSERT INTO public.course_chapters (id, course_id, chapter_number, chapter_name, sort_order)
  VALUES ('00000012-0002-0000-0000-000000000000', '00000000-0000-0000-0000-000000000012', 2, 'Vectơ và hệ trục toạ độ trong không gian', 2) RETURNING id
)
INSERT INTO public.course_lessons (chapter_id, lesson_number, lesson_name, sort_order) VALUES
  ((SELECT id FROM ch), 7, 'Vectơ trong không gian', 1),
  ((SELECT id FROM ch), 8, 'Hệ trục toạ độ trong không gian', 2),
  ((SELECT id FROM ch), 9, 'Biểu thức toạ độ của các phép toán vectơ', 3),
  ((SELECT id FROM ch), 10, 'Bài tập cuối chương II', 4);

WITH ch AS (
  INSERT INTO public.course_chapters (id, course_id, chapter_number, chapter_name, sort_order)
  VALUES ('00000012-0003-0000-0000-000000000000', '00000000-0000-0000-0000-000000000012', 3, 'Các số đặc trưng đo độ phân tán của mẫu số liệu ghép nhóm', 3) RETURNING id
)
INSERT INTO public.course_lessons (chapter_id, lesson_number, lesson_name, sort_order) VALUES
  ((SELECT id FROM ch), 11, 'Khoảng biến thiên và khoảng tứ phân vị', 1),
  ((SELECT id FROM ch), 12, 'Phương sai và độ lệch chuẩn', 2),
  ((SELECT id FROM ch), 13, 'Bài tập cuối chương III', 3);

WITH ch AS (
  INSERT INTO public.course_chapters (id, course_id, chapter_number, chapter_name, sort_order)
  VALUES ('00000012-0004-0000-0000-000000000000', '00000000-0000-0000-0000-000000000012', 4, 'Nguyên hàm và tích phân', 4) RETURNING id
)
INSERT INTO public.course_lessons (chapter_id, lesson_number, lesson_name, sort_order) VALUES
  ((SELECT id FROM ch), 14, 'Nguyên hàm', 1),
  ((SELECT id FROM ch), 15, 'Tích phân', 2),
  ((SELECT id FROM ch), 16, 'Ứng dụng hình học của tích phân', 3),
  ((SELECT id FROM ch), 17, 'Bài tập cuối chương IV', 4);

WITH ch AS (
  INSERT INTO public.course_chapters (id, course_id, chapter_number, chapter_name, sort_order)
  VALUES ('00000012-0005-0000-0000-000000000000', '00000000-0000-0000-0000-000000000012', 5, 'Phương pháp toạ độ trong không gian', 5) RETURNING id
)
INSERT INTO public.course_lessons (chapter_id, lesson_number, lesson_name, sort_order) VALUES
  ((SELECT id FROM ch), 18, 'Phương trình mặt phẳng', 1),
  ((SELECT id FROM ch), 19, 'Phương trình đường thẳng trong không gian', 2),
  ((SELECT id FROM ch), 20, 'Công thức tính góc trong không gian', 3),
  ((SELECT id FROM ch), 21, 'Phương trình mặt cầu', 4),
  ((SELECT id FROM ch), 22, 'Bài tập cuối chương V', 5);

WITH ch AS (
  INSERT INTO public.course_chapters (id, course_id, chapter_number, chapter_name, sort_order)
  VALUES ('00000012-0006-0000-0000-000000000000', '00000000-0000-0000-0000-000000000012', 6, 'Xác suất có điều kiện', 6) RETURNING id
)
INSERT INTO public.course_lessons (chapter_id, lesson_number, lesson_name, sort_order) VALUES
  ((SELECT id FROM ch), 23, 'Xác suất có điều kiện', 1),
  ((SELECT id FROM ch), 24, 'Công thức xác suất toàn phần và công thức Bayes', 2),
  ((SELECT id FROM ch), 25, 'Bài tập cuối chương VI', 3);
