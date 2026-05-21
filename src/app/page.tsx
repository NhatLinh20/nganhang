// src/app/page.tsx
import { redirect } from 'next/navigation'

export default function HomePage() {
  // Trang chủ chuyển thẳng về login
  redirect('/login')
}
