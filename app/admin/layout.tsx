import { redirect } from 'next/navigation'
import { checkIsAdmin } from '@/lib/supabase/admin'

// Defense-in-depth: gate the entire /admin/* tree in one place. Individual admin
// pages/actions still run their own checkIsAdmin()/requireAdmin() guards, but this
// ensures a newly added admin page can't accidentally ship without protection.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (!(await checkIsAdmin())) redirect('/')
  return <>{children}</>
}
