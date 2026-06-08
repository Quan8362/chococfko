import Link from 'next/link'
import { redirect } from 'next/navigation'
import { checkIsAdmin, createAdminClient } from '@/lib/supabase/admin'
import type { QuizQuestion } from '@/app/tieng-nhat/quiz-actions'
import QuizClient from './QuizClient'

export const metadata = { title: 'Admin · Quiz · Chợ Cóc FKO' }
export const dynamic = 'force-dynamic'

export type AdminQuiz = QuizQuestion & { is_published: boolean }

export default async function QuizAdminPage() {
  if (!(await checkIsAdmin())) redirect('/')

  const admin = createAdminClient()
  const { data } = await admin
    .from('jp_quiz_questions')
    .select('id,jlpt_level,category,question,question_reading,question_vi,question_en,options,correct_answer,explanation_vi,explanation_en,difficulty,is_published')
    .order('jlpt_level', { ascending: true })
    .limit(500)

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-10">
      <nav className="flex items-center gap-1.5 text-[12.5px] text-muted mb-8">
        <Link href="/admin" className="hover:text-rose transition-colors">Admin</Link>
        <span>/</span>
        <Link href="/admin/tieng-nhat" className="hover:text-rose transition-colors">Tiếng Nhật</Link>
        <span>/</span>
        <span className="text-ink">Quiz</span>
      </nav>

      <div className="mb-8">
        <h1 className="font-serif font-bold text-[24px] text-ink">🎯 Quản lý Quiz</h1>
        <p className="text-[13px] text-muted mt-1">Thêm, sửa và quản lý câu hỏi trong bảng jp_quiz_questions</p>
      </div>

      <QuizClient initialQuizzes={(data as AdminQuiz[]) ?? []} />
    </div>
  )
}
