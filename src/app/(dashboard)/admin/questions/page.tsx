// src/app/(dashboard)/admin/questions/page.tsx
// Trang quản lý ngân hàng câu hỏi — Server Component wrapper

import QuestionsClient from './QuestionsClient'

export const metadata = {
  title: 'Ngân hàng câu hỏi',
}

export default function QuestionsPage() {
  return <QuestionsClient />
}
