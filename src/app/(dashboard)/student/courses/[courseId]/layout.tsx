import { getCourseWithContent } from '@/app/actions/course-queries'
import CourseSidebar from './CourseSidebar'
import CourseBreadcrumb from './CourseBreadcrumb'
import styles from './course-detail.module.css'
import { getProfile } from '@/lib/supabase/roles'
import { redirect } from 'next/navigation'

export default async function CourseLayout({
  children,
  params
}: {
  children: React.ReactNode
  params: Promise<{ courseId: string }>
}) {
  const { courseId } = await params
  
  const profile = await getProfile()
  if (profile && profile.role !== 'student' && profile.role !== 'admin') {
    redirect('/dashboard')
  }

  const { course, chapters } = await getCourseWithContent(courseId)

  // Nếu không có course, có thể để page xử lý báo lỗi Not Found
  if (!course) {
    return <>{children}</>
  }

  return (
    <div className={styles.container}>
      <CourseBreadcrumb course={course} chapters={chapters || []} />

      <div className={styles.mainLayout}>
        <div className={styles.videoSection}>
          {children}
        </div>
        
        {chapters && chapters.length > 0 ? (
           <CourseSidebar chapters={chapters} courseId={courseId} />
        ) : null}
      </div>
    </div>
  )
}
