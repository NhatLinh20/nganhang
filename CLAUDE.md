# CLAUDE.md — Ngân Hàng Toán

## Tech Stack
Next.js 16 (App Router) + React 19 + TypeScript 5 + Supabase (Auth/Postgres/Storage/Realtime) + Gemini AI + Python OMR microservice. CSS Modules, không dùng Tailwind.

## Lệnh phổ biến

```bash
npm run dev     # Khởi động dev server (port 3000)
npm run build   # Build production
npm run lint    # ESLint check
```

## Quy tắc bắt buộc

1. **RLS bắt buộc cho mọi bảng mới.** Không tạo bảng không có Row Level Security.

2. **Đáp án đúng (`\True`) KHÔNG được lộ ra client.** Mọi query câu hỏi kèm đáp án phải dùng `createAdminClient()` (service role, server-side only). Tuyệt đối không dùng anon key để lấy `correct_answer` và trả về client.

3. **Admin client chỉ dùng server-side.** `createAdminClient()` (bypass RLS bằng service_role key) chỉ được dùng trong API routes và Server Actions. Không bao giờ dùng trong Client Components.

4. **Teacher bị giới hạn xuất file.** Mọi tính năng xuất file của teacher phải gọi `checkExportQuota()` (từ `src/lib/export-limiter.ts`) trước và `logExport()` sau khi thành công. Admin không bị giới hạn.

5. **Cấu trúc LaTeX câu hỏi là chuẩn DA-VN-MT.** Mỗi câu hỏi nằm trong `\begin{ex}...\end{ex}`. Đáp án đúng dùng `\True`. Không tự ý thay đổi cú pháp LaTeX — xem `ai-system-instruction.ts` để biết chi tiết.

## Xem chi tiết kiến trúc và tính năng tại [docs/PROJECT_CONTEXT.md](docs/PROJECT_CONTEXT.md)
