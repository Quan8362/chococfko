import { getCurrentUserAccess } from '@/lib/access-server'
import { canAccessScope, validateRequestedScope } from '@/lib/access'
import WriteConfessionForm from './WriteConfessionForm'

export const dynamic = 'force-dynamic'
export const metadata = { robots: { index: false, follow: false } }

export default async function WriteConfessionPage({
  searchParams,
}: {
  searchParams: { scope?: string }
}) {
  const access = await getCurrentUserAccess()
  const canPostInternal = canAccessScope(access, 'fko_internal')
  const initialScope = validateRequestedScope(searchParams.scope, access)

  return <WriteConfessionForm canPostInternal={canPostInternal} initialScope={initialScope} />
}
