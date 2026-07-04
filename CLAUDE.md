# CLAUDE.md — Tài liệu Dự án "Ngân Hàng Câu Hỏi Toán THPT"

> **Mục đích:** File này mô tả CHI TIẾT toàn bộ dự án để AI Agent đọc và hiểu rõ kiến trúc, tính năng, cách vận hành của hệ thống. Bất kỳ thay đổi code nào cũng PHẢI tuân thủ các quy ước và cấu trúc mô tả bên dưới.

---

## 1. TỔNG QUAN DỰ ÁN

### 1.1 Mô tả

Đây là một **hệ thống quản lý ngân hàng câu hỏi Toán THPT** (Trung học phổ thông), phục vụ giáo viên và học sinh. Hệ thống cho phép:

- **Giáo viên**: Import câu hỏi LaTeX, tạo đề thi, trộn đề, xuất PDF, quét phiếu chấm thi (OMR), sử dụng AI trợ lý.
- **Học sinh**: Xem khóa học, luyện thi trực tuyến.
- **Admin**: Quản lý toàn bộ hệ thống, người dùng, khóa học, đề luyện tập.

### 1.2 URL Production

- **Website**: `nganhangtoan.vercel.app`
- **Backend TikZ/PDF**: VPS tại `42.96.15.5:3001` (proxy qua Next.js rewrites)
- **Python OMR Service**: `127.0.0.1:8000` (local, chạy trên VPS)

### 1.3 Tech Stack

| Layer               | Công nghệ                                           |
| ------------------- | ----------------------------------------------------- |
| **Framework** | Next.js 16.2.6 (App Router, React 19.2.4)             |
| **Language**  | TypeScript                                            |
| **Styling**   | CSS Modules + CSS Variables (KHÔNG dùng Tailwind)   |
| **Database**  | Supabase (PostgreSQL + Auth + Realtime + Storage)     |
| **AI**        | Google Gemini API (multi-key rotation)                |
| **OMR**       | Python FastAPI + OpenCV (service riêng)              |
| **LaTeX**     | TikZ/LaTeX compilation trên VPS riêng               |
| **PDF**       | pdfjs-dist (client-side rendering)                    |
| **Deploy**    | Vercel (frontend) + VPS (LaTeX compiler + Python OMR) |

### 1.4 Dependencies quan trọng

- `@supabase/ssr` + `@supabase/supabase-js`: Auth + DB client
- `@google/generative-ai`: Gemini AI SDK
- `@fingerprintjs/fingerprintjs`: Device fingerprinting
- `katex`: Render công thức LaTeX trên browser
- `pdfjs-dist`: Parse và render PDF
- `jszip` / `adm-zip`: Đóng gói file ZIP
- `qrcode` / `jsqr`: Tạo/đọc QR code
- `xlsx`: Đọc file Excel (import đáp án)
- `sharp`: Xử lý ảnh server-side

---

## 2. CẤU TRÚC THƯ MỤC

```
d:/nganhang/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── layout.tsx                # Root layout (SessionGuardian)
│   │   ├── page.tsx                  # Redirect → /login
│   │   ├── globals.css               # Global styles
│   │   ├── (auth)/                   # Auth route group (login, register, etc.)
│   │   │   ├── login/
│   │   │   ├── register/
│   │   │   ├── forgot-password/
│   │   │   ├── select-role/          # Chọn role sau Google OAuth
│   │   │   ├── pending/              # Chờ admin duyệt
│   │   │   └── device-check/
│   │   ├── (dashboard)/              # Dashboard route group (cần auth)
│   │   │   ├── layout.tsx            # Sidebar + ServerPrewarmer
│   │   │   ├── admin/                # Trang Admin (11 sub-pages)
│   │   │   │   ├── questions/        # Ngân hàng câu hỏi
│   │   │   │   ├── import/           # Import .tex
│   │   │   │   ├── stats/            # Thống kê
│   │   │   │   ├── users/            # Quản lý người dùng
│   │   │   │   ├── courses/          # Quản lý khóa học
│   │   │   │   ├── practice-exams/   # Đề luyện tập
│   │   │   │   ├── ai-chat/          # Trợ lý AI (chat)
│   │   │   │   ├── ai-exam/          # AI tạo đề thi
│   │   │   │   ├── tex-processor/    # Xử lý TeX
│   │   │   │   ├── lesson-builder/   # Tạo bài học
│   │   │   │   └── slideshow/        # Trình chiếu
│   │   │   ├── teacher/              # Trang Giáo viên
│   │   │   │   ├── exams/            # Tạo đề thi thủ công
│   │   │   │   ├── shuffle/          # Trộn đề
│   │   │   │   ├── scan/             # Quét phiếu chấm thi (OMR)
│   │   │   │   ├── export/           # Xuất file
│   │   │   │   └── ai-create/        # AI tạo câu hỏi
│   │   │   └── student/              # Trang Học sinh
│   │   │       ├── courses/          # Xem khóa học
│   │   │       │   └── [courseId]/    # Chi tiết khóa học
│   │   │       └── practice/         # Luyện thi
│   │   │           └── [examId]/     # Làm bài thi
│   │   ├── actions/                  # Server Actions
│   │   │   ├── auth.ts               # Login, Register, Logout, Reset password
│   │   │   ├── select-role.ts        # Chọn role sau OAuth
│   │   │   ├── course-actions.ts     # CRUD khóa học
│   │   │   ├── course-queries.ts     # Query khóa học
│   │   │   └── user-management.ts    # Quản lý người dùng
│   │   ├── api/                      # API Routes (17 endpoints)
│   │   │   ├── ai/                   # AI endpoints
│   │   │   │   ├── chat/             # AI chat (Gemini)
│   │   │   │   ├── create-exam/      # AI tạo đề thi
│   │   │   │   ├── export-latex/     # AI xuất LaTeX
│   │   │   │   ├── suggest-id/       # AI gợi ý mã câu hỏi
│   │   │   │   └── swap-question/    # AI thay câu hỏi
│   │   │   ├── auth/                 # Auth callback (OAuth)
│   │   │   ├── compile-pdf/          # Compile LaTeX → PDF
│   │   │   ├── exam-sessions/        # Phiên thi
│   │   │   │   ├── route.ts          # CRUD sessions
│   │   │   │   └── [id]/scan/        # Scan OMR cho phiên thi
│   │   │   ├── exams/
│   │   │   │   ├── generate/         # Tạo đề thi từ ngân hàng
│   │   │   │   └── stats/            # Thống kê đề thi
│   │   │   ├── export/               # Xuất file (đã deprecated?)
│   │   │   ├── export-lesson/        # Xuất bài học
│   │   │   ├── export-log/           # Log xuất file (giới hạn)
│   │   │   ├── export-zip/           # Xuất ZIP (LaTeX + PDF)
│   │   │   ├── import/               # Import câu hỏi .tex
│   │   │   ├── lesson-builder/       # Fetch câu hỏi cho bài học
│   │   │   ├── practice-exams/       # CRUD đề luyện tập
│   │   │   ├── questions/            # CRUD câu hỏi
│   │   │   │   ├── route.ts          # GET/POST câu hỏi
│   │   │   │   ├── count/            # Đếm câu hỏi
│   │   │   │   ├── clean-duplicates/ # Xóa trùng
│   │   │   │   └── export-bank/      # Xuất ngân hàng
│   │   │   ├── scan-omr/             # Quét phiếu OMR
│   │   │   │   └── health/           # Health check Python OMR
│   │   │   ├── scan-results/         # Lưu kết quả quét
│   │   │   ├── sessions/             # Sessions management
│   │   │   └── test-normalizer/      # Test normalizer
│   │   └── dashboard/                # Dashboard redirect
│   ├── components/
│   │   ├── SessionGuardian.tsx       # Ngăn đăng nhập đồng thời (Realtime)
│   │   ├── ServerPrewarmer.tsx       # Khởi động server Python ngầm
│   │   ├── LimitModal.tsx            # Modal giới hạn xuất file
│   │   ├── PdfPreviewModal.tsx       # Modal xem PDF
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx           # Sidebar navigation (role-based)
│   │   │   └── Header.tsx            # Header
│   │   └── tikz/
│   │       └── TikZImage.tsx         # Render hình TikZ → SVG
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts             # Supabase browser client
│   │   │   ├── server.ts             # Supabase server client + admin client
│   │   │   └── roles.ts              # Helper phân quyền (getProfile, isAdmin...)
│   │   ├── latex-parser/             # Parser LaTeX → câu hỏi
│   │   │   ├── index.ts              # Re-export all parsers
│   │   │   ├── file-parser.ts        # Parse file .tex
│   │   │   ├── question-parser.ts    # Parse từng câu hỏi
│   │   │   ├── category-parser.ts    # Parse mã phân loại 6 tham số
│   │   │   ├── answer-parser.ts      # Detect loại câu + đáp án
│   │   │   ├── normalizer.ts         # Chuẩn hóa LaTeX
│   │   │   ├── slideshow-parser.ts   # Parse cho trình chiếu
│   │   │   └── tex-import-parser.ts  # Parser import nâng cao
│   │   ├── omr/                      # OMR (Optical Mark Recognition) - client-side
│   │   │   ├── omr-engine.ts         # Pipeline chính
│   │   │   ├── image-preprocessor.ts # Xử lý ảnh (grayscale, warp)
│   │   │   ├── bubble-reader.ts      # Đọc bong bóng
│   │   │   ├── coordinate-map.ts     # Map tọa độ bong bóng
│   │   │   ├── gemini-scanner.ts     # Scan bằng Gemini Vision
│   │   │   ├── opencv-loader.ts      # Load OpenCV.js
│   │   │   └── types.ts              # OMR types
│   │   ├── answer-import/            # Import đáp án
│   │   │   ├── excel-parser.ts       # Parse file Excel
│   │   │   └── qr-parser.ts          # Parse QR code đáp án
│   │   ├── ai-system-instruction.ts  # System prompt cho Gemini AI
│   │   ├── auth-logger.ts            # Ghi log đăng nhập + phát hiện bất thường
│   │   ├── curriculum-labels.ts      # Tên chương/bài/dạng (toàn bộ chương trình Toán 10-12)
│   │   ├── device-fingerprint.ts     # FingerprintJS + localStorage backup
│   │   ├── export-limiter.ts         # Giới hạn xuất file cho teacher
│   │   ├── pdf-utils.ts              # Utility xử lý PDF
│   │   └── tikz-api.ts               # API compile TikZ → SVG/PDF
│   ├── hooks/                        # React hooks (trống)
│   ├── styles/
│   │   ├── variables.css             # CSS custom properties (design tokens)
│   │   └── components/               # Component-level CSS
│   ├── types/
│   │   └── index.ts                  # Toàn bộ TypeScript types
│   └── proxy.ts                      # Proxy config
├── python-omr/                       # Python OMR Service (FastAPI)
│   ├── main.py                       # FastAPI entry point
│   ├── omr_engine.py                 # OpenCV OMR engine (~26KB)
│   ├── parse_pdf.py                  # Parse PDF
│   ├── requirements.txt              # opencv-python, fastapi, uvicorn
│   ├── Dockerfile                    # Docker config
│   └── template.png                  # Template phiếu trắc nghiệm
├── cauhinh_latex/                    # Cấu hình LaTeX
│   ├── ex_test.sty                   # Style package chính (~132KB)
│   ├── khaibaochung.tex              # Khai báo chung LaTeX
│   ├── ma_tran_de_thi_toan.tex       # Ma trận đề thi
│   ├── main.tex                      # Template main
│   └── tkz-tab-vn.sty               # Bảng biến thiên tiếng Việt
├── supabase/
│   ├── migrations/                   # 11 migration files
│   └── seed/                         # Seed data
├── scripts/                          # Utility scripts
│   ├── embed-questions.js            # Embedding câu hỏi (pgvector)
│   ├── clean-comments.js             # Xóa comment LaTeX
│   ├── pgvector-migration.sql        # Migration pgvector
│   └── ...
├── next.config.ts                    # Next.js config (rewrites, allowedOrigins)
├── package.json
└── .env.local                        # Environment variables
```

---

## 3. HỆ THỐNG XÁC THỰC & PHÂN QUYỀN

### 3.1 Roles (Vai trò)

Hệ thống có **3 vai trò**:

| Role        | Mô tả          | Quyền hạn                                                                          |
| ----------- | ---------------- | ------------------------------------------------------------------------------------ |
| `admin`   | Quản trị viên | Toàn quyền, KHÔNG bị giới hạn thiết bị/xuất file                            |
| `teacher` | Giáo viên      | Xem ngân hàng, tạo đề, trộn đề, scan OMR, AI chat, bị giới hạn xuất file |
| `student` | Học sinh        | Xem khóa học, luyện thi                                                           |

### 3.2 Luồng đăng ký & đăng nhập

```
Đăng ký (Email/Password hoặc Google OAuth)
    ↓
Chọn Role (teacher / student) → trang /select-role
    ↓
Chờ Admin duyệt → trang /pending
    ↓
Admin duyệt (is_approved = true)
    ↓
Đăng nhập → Device binding check → Session management → Dashboard
```

### 3.3 Device Binding (Gắn kết thiết bị)

- Mỗi user (trừ admin) được phép đăng nhập tối đa **2 thiết bị**.
- Sử dụng `@fingerprintjs/fingerprintjs` + localStorage backup.
- Khi đăng nhập từ thiết bị mới:
  - Nếu < 2 thiết bị → tự động gắn kết.
  - Nếu = 2 thiết bị → từ chối đăng nhập, yêu cầu liên hệ admin.
- Admin có thể **reset thiết bị** cho user (xóa `device_ids`, `device_info`).

### 3.4 Session Management (Quản lý phiên đăng nhập)

- Mỗi user chỉ được tối đa **2 session hoạt động** cùng lúc.
- `SessionGuardian` component sử dụng **Supabase Realtime** để theo dõi:
  - Khi `active_sessions` thay đổi và session hiện tại không còn → hiển thị cảnh báo + tự động đăng xuất sau 10 giây.

### 3.5 Login Anomaly Detection (Phát hiện bất thường)

File `auth-logger.ts` tự động:

1. Tra cứu IP → thông tin địa lý (ip-api.com).
2. So sánh với 10 log gần nhất → phát hiện:
   - IP mới hoàn toàn.
   - Quốc gia mới.
   - 3+ IP khác nhau trong 1 giờ.
   - User-agent lạ.
3. Ghi `is_suspicious = true` + `suspicious_reasons` vào `login_logs`.

### 3.6 Supabase Clients

| Client                  | File                       | Dùng khi                                   |
| ----------------------- | -------------------------- | ------------------------------------------- |
| `createClient()`      | `lib/supabase/server.ts` | Server Components, Server Actions (có RLS) |
| `createAdminClient()` | `lib/supabase/server.ts` | Bypass RLS (Service Role Key)               |
| `createClient()`      | `lib/supabase/client.ts` | Client Components (browser)                 |

---

## 4. CƠ SỞ DỮ LIỆU (Supabase PostgreSQL)

### 4.1 Bảng chính

#### `users` — Người dùng

```sql
id UUID PK → auth.users(id) ON DELETE CASCADE
email TEXT UNIQUE
full_name TEXT
role TEXT ('admin'|'teacher'|'student')
avatar_url TEXT
is_active BOOLEAN (default true)
is_approved BOOLEAN (default false) -- Cần admin duyệt
device_id TEXT (deprecated, dùng device_ids)
device_ids TEXT[] -- Mảng tối đa 2 device fingerprint
active_sessions TEXT[] -- Mảng session IDs đang hoạt động
device_bound_at TIMESTAMPTZ
device_info JSONB -- [{browser, os, screen, platform}]
created_at, updated_at TIMESTAMPTZ
```

#### `questions` — Ngân hàng câu hỏi (~50.000+ câu)

```sql
id UUID PK
latex_content TEXT -- Raw LaTeX nguyên bản \begin{ex}...\end{ex}
category_code TEXT -- Mã phân loại 6 tham số, VD: '2D1N3-1'
grade SMALLINT (10|11|12)
subject_area CHAR(1) ('D'=Đại số | 'H'=Hình học | 'C'=Chuyên đề)
chapter SMALLINT
difficulty CHAR(1) ('N'=Nhận biết | 'H'=Thông hiểu | 'V'=Vận dụng | 'C'=Vận dụng cao)
lesson SMALLINT
variant SMALLINT -- Dạng bài
question_type TEXT ('multiple_choice'|'true_false'|'short_answer'|'essay')
has_image BOOLEAN
image_type TEXT ('none'|'center'|'immini')
correct_answer TEXT -- MC:'A/B/C/D' | TF:'ĐSĐS' | Short:'-3' | Essay:null
source_file, source_project, source_exam, source_teacher TEXT
tags TEXT[]
usage_count INT
is_active BOOLEAN
created_by UUID → users(id)
```

#### `exams` — Đề thi

```sql
id UUID PK
title TEXT
exam_type TEXT ('kiểm tra 15p'|'giữa kỳ'|'cuối kỳ'|'thi thử')
grade SMALLINT
duration_minutes INT (default 90)
total_questions INT
matrix JSONB -- {nhan_biet, thong_hieu, van_dung, van_dung_cao}
sections JSONB -- Cấu trúc các phần
created_by UUID → users(id)
is_published BOOLEAN
```

#### `exam_questions` — Câu hỏi trong đề

```sql
id UUID PK
exam_id UUID → exams(id) ON DELETE CASCADE
question_id UUID → questions(id)
section_type TEXT ('multiple_choice'|'true_false'|'short_answer'|'essay')
question_order INT
UNIQUE(exam_id, question_id)
```

#### `exam_variants` — Mã đề (trộn đề)

```sql
id UUID PK
exam_id UUID → exams(id) ON DELETE CASCADE
variant_code TEXT ('001','002'...)
question_mapping JSONB -- {new_pos: original_pos}
latex_output TEXT -- File .tex hoàn chỉnh
pdf_url TEXT
UNIQUE(exam_id, variant_code)
```

#### `exam_sessions` — Phiên thi

```sql
id UUID PK
exam_id UUID → exams(id)
variant_id UUID → exam_variants(id)
student_id UUID → users(id)
teacher_id UUID → users(id)
status TEXT ('pending'|'in_progress'|'submitted'|'graded')
answers JSONB -- {question_id: answer}
score DECIMAL(5,2)
total_correct INT
total_questions INT
start_time, end_time, submitted_at TIMESTAMPTZ
```

#### `courses` — Khóa học

```sql
id UUID PK
title TEXT
description TEXT
grade SMALLINT (6-12)
category_label TEXT -- "Nền tảng", "Nâng cao"
teacher_name TEXT
thumbnail_url TEXT
is_published BOOLEAN
sort_order INT
created_by UUID → users(id)
```

#### `course_chapters` → `course_lessons` (1:N)

```sql
-- course_chapters: chapter_number, chapter_name, sort_order
-- course_lessons: lesson_number, lesson_name, video_url, duration_minutes,
--                 description, pdf_files JSONB [{name, url, description}]
```

#### `practice_exams` — Đề luyện tập

```sql
id UUID PK
title TEXT
exam_type TEXT
grade SMALLINT
duration_minutes INT
total_questions INT
total_score DECIMAL(5,2) (default 10)
pdf_url TEXT -- URL file PDF trên Supabase Storage
questions JSONB -- [{order, type, correct_answer, score, sub_answers}]
is_published BOOLEAN
created_by UUID → users(id)
```

#### `practice_sessions` — Lịch sử luyện thi

```sql
id UUID PK
exam_id UUID → practice_exams(id) ON DELETE CASCADE
student_id UUID → users(id)
answers JSONB
score DECIMAL(5,2)
total_correct, total_tf_correct INT
duration_seconds INT
status TEXT ('in_progress'|'submitted')
```

#### `scan_results` — Kết quả quét phiếu OMR

```sql
id UUID PK
teacher_id UUID → auth.users(id) ON DELETE CASCADE
exam_code TEXT
student_id_number TEXT
student_name TEXT
score, max_score NUMERIC(5,2)
mc_correct, mc_total INT
tf_score, tf_max_score NUMERIC(5,2)
sa_correct, sa_total INT
details JSONB, answers JSONB
confidence NUMERIC(3,2)
warnings JSONB
```

#### `login_logs` — Lịch sử đăng nhập

```sql
user_id UUID
ip_address TEXT
country, city, isp, timezone TEXT
user_agent TEXT
is_suspicious BOOLEAN
suspicious_reasons TEXT[]
```

#### `export_logs` — Log xuất file (giới hạn)

```sql
user_id UUID
export_type TEXT
page_source TEXT
created_at TIMESTAMPTZ
```

#### Bảng phân loại (Danh mục)

- `chapters` (grade, subject_area, chapter_number, chapter_name)
- `lessons` (grade, subject_area, chapter_number, lesson_number, lesson_name)
- `variant_types` (grade, subject_area, chapter_number, lesson_number, variant_number, variant_name)

### 4.2 Row Level Security (RLS)

- **Tất cả bảng đều bật RLS**.
- Helper function `get_user_role()` → trả về role hiện tại.
- Quy tắc:
  - `admin` → full quyền (hoặc dùng `createAdminClient()` bypass RLS).
  - `teacher` → đọc câu hỏi active, CRUD đề thi của mình.
  - `student` → đọc published, CRUD session/practice của mình.

---

## 5. TÍNH NĂNG CHI TIẾT

### 5.1 Ngân hàng câu hỏi (`/admin/questions`)

- **Duyệt & tìm kiếm** 50.000+ câu hỏi theo filter: khối, lĩnh vực, chương, bài, dạng, độ khó, loại câu.
- **Xem câu hỏi** với KaTeX render LaTeX real-time.
- **Chỉnh sửa** nội dung LaTeX, mã phân loại.
- **Xóa / kích hoạt** câu hỏi.
- **Xóa trùng** (clean-duplicates API).
- **Xuất ngân hàng** (export-bank API).
- Component chính: `QuestionsClient.tsx` (41KB).

### 5.2 Import câu hỏi (`/admin/import`)

- Upload file `.tex` → parse với LaTeX parser.
- **Luồng parse**:
  1. `file-parser.ts` → tách các block `\begin{ex}...\end{ex}`.
  2. `question-parser.ts` → parse từng câu hỏi.
  3. `category-parser.ts` → parse mã phân loại 6 tham số từ comment `%<ID:2D1N3-1>`.
  4. `answer-parser.ts` → detect loại câu (`\choice` → MC, `\choiceTF` → TF, `\shortans` → SA, else → Essay) và đáp án (`\True`).
  5. `normalizer.ts` → chuẩn hóa LaTeX (fix spacing, encoding).
- **Preview** trước khi import (PUT `/api/import`).
- **Import** vào DB (POST `/api/import`) — batch 500 câu/lần, skip duplicate.

### 5.3 Hệ thống mã phân loại câu hỏi (Category Code)

Mỗi câu hỏi có mã 6 tham số: `{grade}{area}{chapter}{difficulty}{lesson}-{variant}`

Ví dụ: `2D1N3-1` = Lớp 12 + Đại số + Chương 1 + Nhận biết + Bài 3 + Dạng 1

| Tham số     | Vị trí      | Giá trị                                             |
| ------------ | ------------- | ----------------------------------------------------- |
| Grade        | Ký tự 1     | 0=10, 1=11, 2=12                                      |
| Subject Area | Ký tự 2     | D=Đại số, H=Hình học, C=Chuyên đề             |
| Chapter      | Ký tự 3     | 0-9                                                   |
| Difficulty   | Ký tự 4     | N=Nhận biết, H=Thông hiểu, V=Vận dụng, C=VD cao |
| Lesson       | Ký tự 5     | 1-9                                                   |
| Variant      | Sau dấu`-` | 0-9 (dạng bài)                                      |

File `curriculum-labels.ts` (44KB) chứa tên đầy đủ cho tất cả chương/bài/dạng.

### 5.4 Tạo đề thi (`/teacher/exams`)

- Giáo viên chọn câu hỏi từ ngân hàng theo filter.
- Cấu hình: tiêu đề, khối, thời gian, số đề.
- Chọn số lượng câu theo từng dạng/bài/độ khó.
- Hệ thống tự động random câu hỏi từ ngân hàng.
- Xuất ra file `.tex` + `.pdf` (compile trên VPS).
- Component: `ExamCreatorClient.tsx` (91KB — file lớn nhất).

### 5.5 Trộn đề (`/teacher/shuffle`)

- Nhập đề gốc (LaTeX) → trộn thứ tự câu hỏi + đáp án.
- Tạo nhiều mã đề (001, 002, ...).
- Mapping câu hỏi gốc → câu trộn.
- Xuất ZIP chứa nhiều file .tex + bảng đáp án.
- Component: `ShuffleClient.tsx` (87KB).

### 5.6 Quét phiếu chấm thi — OMR (`/teacher/scan`)

Hệ thống có **2 engine OMR**:

#### 5.6.1 Client-side OMR (thuần JS, KHÔNG cần server)

- Pipeline: `loadImage → detectAndWarp → getBinary → buildCoordinateMap → readAllAnswers → calculateScore`
- Tự động detect 4 góc phiếu → warp perspective.
- Đọc bong bóng MC (A/B/C/D), TF (Đ/S), SA (số).
- Chấm điểm theo quy tắc THPT mới (TF: 4/4=1đ, 3/4=0.5đ, 2/4=0.25đ).

#### 5.6.2 Python OMR Service (OpenCV, chính xác hơn)

- FastAPI service chạy trên `http://127.0.0.1:8000/scan`.
- Sử dụng template matching + OpenCV contour detection.
- API route `/api/scan-omr` proxy request tới Python service.
- File `omr_engine.py` (26KB) — engine chính.

#### 5.6.3 Gemini Vision Scanner

- Backup scanner sử dụng Gemini Vision API.
- Gửi ảnh phiếu → Gemini đọc đáp án → trả JSON.

Components: `ScanClient.tsx` (35KB) + `ScanDashboard.tsx` (82KB).

### 5.7 AI Features

#### 5.7.1 Trợ lý AI Chat (`/admin/ai-chat`)

- Chat với Gemini AI, hỗ trợ:
  - Gõ lại câu hỏi từ ảnh/PDF thành LaTeX.
  - Giải toán, giải thích.
  - Vẽ hình TikZ, bảng biến thiên.
- System instruction chi tiết (169 dòng) trong `ai-system-instruction.ts`.
- Render LaTeX real-time bằng KaTeX.
- Component: `page.tsx` (57KB).

#### 5.7.2 AI Tạo đề thi (`/admin/ai-exam`)

- Yêu cầu Gemini tạo đề thi theo yêu cầu.
- Hỗ trợ upload ảnh/PDF để AI đọc và chuyển sang LaTeX.
- Component: `page.tsx` (129KB — file client lớn nhất).

#### 5.7.3 AI Suggest ID (`/api/ai/suggest-id`)

- Gợi ý mã phân loại cho câu hỏi dựa trên nội dung LaTeX.

#### 5.7.4 AI Swap Question (`/api/ai/swap-question`)

- Thay thế câu hỏi trong đề bằng câu tương tự.

#### 5.7.5 Gemini Multi-Key Rotation

- Env var `GEMINI_API_KEYS` chứa 12+ API keys phân tách bằng dấu phẩy.
- Hệ thống tự động xoay vòng key khi gặp lỗi rate limit.

### 5.8 Tạo bài học (`/admin/lesson-builder`)

- Chọn câu hỏi từ ngân hàng → tạo bài học PDF.
- Giới hạn: 60 câu/bài, 20 bài/tháng (teacher).
- Component: `LessonBuilderClient.tsx` (39KB).

### 5.9 Trình chiếu (`/admin/slideshow`)

- Hỗ trợ 3 giai đoạn: Input (nhập code/import), Review (kiểm tra & sửa lỗi), và Present (trình chiếu toàn màn hình).
- Parse LaTeX → slides trình chiếu. Tự động trích xuất các block TikZ để batch-compile SVG.
- Hỗ trợ fallback: nếu VPS lỗi TikZ, cho phép upload/paste hình ảnh thủ công.
- Tích hợp Text-To-Speech (TTS) đọc câu hỏi & lời giải qua `/api/tts` (cache audio trong bảng `question_audio`).
- Các tính năng Present: Điều khiển bằng bàn phím (mũi tên, phím Space), hiện/ẩn đáp án (A), hiện lời giải (S), zoom (+/-), tự động autoplay audio.
- Render KaTeX + TikZ trực tiếp trên browser. Hỗ trợ giao diện sáng (light), tối (blue), tối giản (minimal).
- Component: `SlideshowClient.tsx` (43KB).

### 5.10 Xử lý TeX (`/admin/tex-processor`)

- Chuẩn hóa, clean, format LaTeX code.
- Detect và fix lỗi phổ biến.
- Component: `page.tsx` (47KB).

### 5.11 Khóa học (`/admin/courses` + `/student/courses`)

- **Admin**: CRUD khóa học, chương, bài học.
- Mỗi bài học có: video URL (YouTube), tài liệu PDF, mô tả.
- **Student**: Xem khóa học published, xem video, download tài liệu.

### 5.12 Luyện thi (`/admin/practice-exams` + `/student/practice`)

- **Admin**: Tạo đề luyện tập (upload PDF + cấu hình đáp án JSON).
- **Student**: Làm bài thi online (chọn đáp án MC, TF, nhập SA).
- Chấm điểm tự động, lưu lịch sử, thống kê.

### 5.13 Quản lý người dùng (`/admin/users`)

- Danh sách user pending (chờ duyệt) / approved.
- Filter theo role (teacher/student).
- Actions: Duyệt, Từ chối (xóa), Thu hồi, Khóa/Mở khóa, Reset thiết bị.
- Xem lịch sử đăng nhập + đánh dấu suspicious.
- Thống kê: tổng user, pending, approved, suspicious, phân theo role.

### 5.14 Xuất file ZIP (`/api/export-zip`)

- Tạo file ZIP chứa:
  - `main.tex` (đề thi LaTeX)
  - `ex_test.sty` (style package)
  - `khaibaochung.tex` (khai báo chung)
  - Các file hỗ trợ khác
- Có thể compile trực tiếp trên VPS → trả PDF.
- Route handler: `route.ts` (46KB).

### 5.15 Giới hạn xuất file (Export Limiter)

Chỉ áp dụng cho role `teacher` (admin không bị giới hạn):

| Giới hạn         | Giá trị      |
| ------------------ | -------------- |
| Đề thi / lượt  | 12 (admin: 20) |
| Câu / đề        | 60             |
| MC / đề          | 30             |
| TF / đề          | 10             |
| SA / đề          | 10             |
| Essay / đề       | 10             |
| Bài học / tháng | 20             |
| Xuất file / ngày | 20             |

### 5.16 TikZ Rendering

- Component `TikZImage.tsx` compile TikZ code → SVG.
- Gọi API VPS `42.96.15.5:3001/compile` (proxy qua `/api/tikz`).
- Hỗ trợ: đồ thị, hình hình học, bảng biến thiên.

### 5.17 Xuất file Word & Bảng Đáp Án (`/api/export-word`)

- **Pipeline xuất Word**: `Parse LaTeX` → `Expand Macros` (xóa lệnh lạ) → `Batch Compile TikZ (SVG)` → Gói thành ZIP.
- Gửi ZIP tới Pandoc VPS (`/convert-to-docx`) → trả về file `.docx`.
- **Hậu xử lý DOCX**: Canh giữa text, tối ưu bảng biểu (ẩn viền, full-width 10 cột grid), tự động thêm Header/Footer (trang số, mã đề).
- **Tích hợp xuất đáp án App chấm thi**: Sinh file Excel theo chuẩn TNMaker, Azota, YoungMix, SmartTest, OLM.
- **Tạo mã QR đáp án**: Hỗ trợ xuất ảnh QR Code chứa đáp án trắc nghiệm/điền khuyết.
- Sinh phiếu trả lời trắc nghiệm (PDF) tổng hợp các mã đề.
- Tất cả đóng gói thành 1 file ZIP duy nhất gửi về client.

---

## 6. LUỒNG DỮ LIỆU CHI TIẾT

### 6.1 Import câu hỏi

```
Upload .tex → file-parser.ts (tách blocks)
    → question-parser.ts (parse từng câu)
    → category-parser.ts (parse mã ID từ comment)
    → answer-parser.ts (detect type + answer)
    → normalizer.ts (chuẩn hóa)
    → Preview (PUT /api/import)
    → User xác nhận
    → Insert DB (POST /api/import, batch 500)
    → Skip duplicates (check latex_content)
```

### 6.2 Tạo đề thi

```
Giáo viên chọn filter (khối, chương, bài, dạng, độ khó)
    → Chọn số lượng câu mỗi loại
    → POST /api/exams/generate
    → Server random câu từ DB theo filter
    → Tạo LaTeX output (template + câu hỏi)
    → Tạo N mã đề (shuffle)
    → Xuất ZIP (LaTeX files)
    → [Optional] Compile → PDF trên VPS
```

### 6.3 Quét phiếu OMR

```
Giáo viên upload ảnh phiếu
    → [Client-side hoặc Python service]
    → Detect 4 corners → Perspective warp
    → Binary threshold
    → Read bubbles (MC, TF, SA)
    → Match with answer key
    → Calculate score
    → Save to scan_results
```

### 6.4 AI Chat

```
User gửi tin nhắn (text/image/PDF)
    → POST /api/ai/chat
    → Gemini API (with system instruction)
    → Response (LaTeX format)
    → Client render KaTeX + TikZ
```

---

## 7. CẤU TRÚC LaTeX

### 7.1 Loại câu hỏi

Tất cả câu hỏi nằm trong block `\begin{ex}...\end{ex}`:

```latex
% Trắc nghiệm 4 đáp án
\begin{ex}
Nội dung câu hỏi...
\choice
{Đáp án A}
{Đáp án B}
{\True Đáp án C đúng}
{Đáp án D}
\loigiai{Lời giải chi tiết}
\end{ex}

% Đúng/Sai (4 ý)
\begin{ex}
Nội dung...
\choiceTF
{\True Phát biểu a đúng}
{Phát biểu b sai}
{\True Phát biểu c đúng}
{Phát biểu d sai}
\loigiai{...}
\end{ex}

% Trả lời ngắn
\begin{ex}
Nội dung...
\shortans{đáp_án}
\loigiai{...}
\end{ex}

% Tự luận
\begin{ex}
Nội dung...
\loigiai{...}
\end{ex}
```

### 7.2 Mã phân loại (trong comment)

```latex
%<ID:2D1N3-1>
\begin{ex}
...
\end{ex}
```

### 7.3 LaTeX packages sử dụng

- `ex_test.sty` (132KB): Package chính, định nghĩa `\choice`, `\choiceTF`, `\shortans`, `\loigiai`, `\True`, environments.
- `tkz-tab-vn.sty`: Bảng biến thiên tiếng Việt (`\tkzTabInit`, `\tkzTabLine`, `\tkzTabVar`).
- `tkz-euclide`: Vẽ hình hình học.

---

## 8. API ROUTES

### 8.1 Server Actions (`src/app/actions/`)

| File                   | Functions                                                                                                                                |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `auth.ts`            | `login`, `loginWithGoogle`, `register`, `logout`, `resetPassword`                                                              |
| `select-role.ts`     | `selectRole` (sau Google OAuth)                                                                                                        |
| `course-actions.ts`  | `createCourse`, `updateCourse`, `deleteCourse`, `toggleCoursePublished`, `saveCourseContent`                                   |
| `course-queries.ts`  | `getCourses`, `getCourseWithContent`, `getLessonDetail`, `getFirstLessonId`                                                      |
| `user-management.ts` | `getUsers`, `approveUser`, `rejectUser`, `revokeUser`, `toggleUserActive`, `getLoginLogs`, `getUserStats`, `resetDevice` |

### 8.2 API Routes (`src/app/api/`)

| Route                                   | Method         | Mô tả                          |
| --------------------------------------- | -------------- | -------------------------------- |
| `/api/ai/chat`                        | POST           | Chat với Gemini AI              |
| `/api/ai/create-exam`                 | POST           | AI tạo đề thi                 |
| `/api/ai/export-latex`                | POST           | AI xuất LaTeX                   |
| `/api/ai/suggest-id`                  | POST           | AI gợi ý mã phân loại       |
| `/api/ai/swap-question`               | POST           | AI thay câu hỏi                |
| `/api/auth/callback`                  | GET            | OAuth callback                   |
| `/api/compile-pdf`                    | POST           | Compile LaTeX → PDF             |
| `/api/exam-sessions`                  | GET/POST       | CRUD phiên thi                  |
| `/api/exam-sessions/[id]/scan`        | POST           | Scan OMR cho phiên thi          |
| `/api/exams/generate`                 | POST           | Tạo đề từ ngân hàng        |
| `/api/exams/stats`                    | GET            | Thống kê đề thi              |
| `/api/export-lesson`                  | POST           | Xuất bài học                  |
| `/api/export-log`                     | GET/POST       | Kiểm tra & ghi log xuất file   |
| `/api/export-word`                    | POST           | Xuất Word, Excel, PDF Đáp án |
| `/api/export-zip`                     | POST           | Xuất ZIP (LaTeX + PDF)          |
| `/api/import`                         | POST/PUT       | Import câu hỏi / Preview parse |
| `/api/lesson-builder/fetch-questions` | GET            | Lấy câu hỏi cho bài học     |
| `/api/practice-exams`                 | GET/POST       | CRUD đề luyện tập            |
| `/api/practice-exams/[id]`            | GET/PUT/DELETE | Chi tiết đề luyện tập       |
| `/api/questions`                      | GET/POST       | CRUD câu hỏi                   |
| `/api/questions/count`                | GET            | Đếm câu hỏi                  |
| `/api/questions/clean-duplicates`     | POST           | Xóa câu trùng                 |
| `/api/questions/export-bank`          | GET            | Xuất ngân hàng                |
| `/api/scan-omr`                       | POST           | Quét phiếu OMR (proxy Python)  |
| `/api/scan-omr/health`                | GET            | Health check Python service      |
| `/api/scan-results`                   | GET/POST       | CRUD kết quả quét             |
| `/api/sessions`                       | GET/POST       | Sessions management              |
| `/api/tts`                            | POST           | Text-To-Speech proxy tới VPS    |

---

## 9. ENVIRONMENT VARIABLES

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://emidsfdgujxlnwrqizvo.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...         # KHÔNG public, chỉ server-side

# Google Gemini AI
GEMINI_API_KEY=AIzaSy...                 # Key chính
GEMINI_API_KEYS="key1,key2,key3,..."     # Multi-key rotation (12+ keys)

# Python OMR Service
PYTHON_OMR_URL=http://127.0.0.1:8000/scan

# Optional
NEXT_PUBLIC_SITE_URL=https://nganhangtoan.vercel.app
NEXT_PUBLIC_TIKZ_API_URL=/api/tikz       # Proxy qua Next.js rewrites
```

---

## 10. QUY ƯỚC CODE

### 10.1 Naming

- **Files**: kebab-case (`export-limiter.ts`, `auth-logger.ts`)
- **Components**: PascalCase (`SessionGuardian.tsx`, `ScanClient.tsx`)
- **CSS Modules**: `*.module.css`, import as `styles`
- **Types**: PascalCase, export từ `types/index.ts`
- **Server Actions**: camelCase functions, file suffix `.ts`

### 10.2 Architecture Patterns

- **Server Components** by default (Next.js App Router).
- **Client Components** chỉ khi cần interactivity → `'use client'` directive.
- **Server Actions** cho mutations (`'use server'`).
- **API Routes** cho endpoints phức tạp hoặc cần stream.
- **CSS Modules** cho styling (KHÔNG Tailwind).
- **CSS Variables** trong `styles/variables.css` cho design tokens.

### 10.3 Auth Pattern

```typescript
// Server Component / Server Action
const supabase = await createClient()
const { data: { user } } = await supabase.auth.getUser()
// Kiểm tra role
const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()

// Bypass RLS khi cần
const supabaseAdmin = createAdminClient()
```

### 10.4 Error Handling

- Server Actions trả về `{ error?: string; success?: boolean }`.
- API Routes trả về `{ data?, error?, message? }` (type `ApiResponse<T>`).
- Pagination: `{ data: T[], total, page, limit }` (type `PaginatedResponse<T>`).

### 10.5 Ngôn ngữ

- **Giao diện**: Tiếng Việt hoàn toàn.
- **Code comments**: Tiếng Việt.
- **Variable names**: Tiếng Anh.
- **Error messages**: Tiếng Việt (hiển thị cho user).

---

## 11. DEPLOYMENT

### 11.1 Vercel (Frontend)

- Auto-deploy từ Git.
- `next.config.ts` cấu hình:
  - `serverExternalPackages: ['adm-zip']`
  - `allowedDevOrigins` cho dev tunnels (Cloudflare, localtunnel, Serveo)
  - `rewrites`: `/api/tikz/*` → VPS `42.96.15.5:3001`

### 11.2 VPS (Backend Services)

- **LaTeX Compiler**: Node.js server tại port 3001.
  - Compile TikZ → SVG.
  - Compile ZIP (LaTeX files) → PDF.
- **Python OMR**: FastAPI tại port 8000.
  - OpenCV-based answer sheet scanner.

### 11.3 Supabase

- Auth (Email + Google OAuth)
- PostgreSQL Database
- Realtime (Session Guardian)
- Storage (PDF files, images)

---

## 12. CÁC FILE QUAN TRỌNG (theo kích thước)

| File                        | Size  | Mô tả                             |
| --------------------------- | ----- | ----------------------------------- |
| `ai-exam/page.tsx`        | 129KB | AI tạo đề thi (phức tạp nhất) |
| `ExamCreatorClient.tsx`   | 91KB  | Tạo đề thi thủ công            |
| `ShuffleClient.tsx`       | 87KB  | Trộn đề                          |
| `ScanDashboard.tsx`       | 82KB  | Dashboard quét phiếu              |
| `ai-chat/page.tsx`        | 57KB  | Trợ lý AI                         |
| `tex-processor/page.tsx`  | 47KB  | Xử lý TeX                         |
| `export-zip/route.ts`     | 46KB  | API xuất ZIP                       |
| `curriculum-labels.ts`    | 44KB  | Danh mục chương/bài/dạng       |
| `QuestionsClient.tsx`     | 41KB  | Ngân hàng câu hỏi               |
| `LessonBuilderClient.tsx` | 39KB  | Tạo bài học                      |
| `SlideshowClient.tsx`     | 39KB  | Trình chiếu                       |
| `ScanClient.tsx`          | 35KB  | Client quét phiếu                 |
| `import/page.tsx`         | 29KB  | Import .tex                         |
| `omr_engine.py`           | 26KB  | Python OMR engine                   |

---

## 13. LƯU Ý QUAN TRỌNG CHO AI AGENT

1. **KHÔNG sửa đổi file `ex_test.sty`** — đây là LaTeX package core, rất phức tạp (132KB).
2. **Luôn kiểm tra role** trước khi thực hiện mutations (admin/teacher/student).
3. **Supabase Admin Client** chỉ dùng khi CẦN bypass RLS — đa số trường hợp dùng `createClient()`.
4. **CSS Modules** — KHÔNG sử dụng Tailwind, inline styles chỉ cho trường hợp đặc biệt (như SessionGuardian).
5. **LaTeX content** luôn chuẩn hóa line endings (`\r\n` → `\n`).
6. **Category code** phải tuân theo format chính xác: `{grade}{area}{chapter}{difficulty}{lesson}-{variant}`.
7. **Gemini API keys** được rotate — nếu gặp lỗi rate limit, hệ thống tự chuyển key.
8. **Device binding** — tối đa 2 thiết bị, admin bypass.
9. **Export limiter** — teacher bị giới hạn, admin không bị.
10. **Next.js 16** — phiên bản mới, đọc docs trong `node_modules/next/dist/docs/` trước khi code.
11. **Tất cả giao diện bằng tiếng Việt** — error messages, labels, placeholders.
12. **File `.env.local` chứa secrets** — KHÔNG commit, KHÔNG expose ra client (trừ `NEXT_PUBLIC_*`).
