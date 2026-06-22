'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { duplicateSharedPlan } from '../../actions'

export default function DuplicatePlanButton({ token }: { token: string }) {
  const t = useTranslations('trips')
  const router = useRouter()
  const [pending, start] = useTransition()

  const dup = () => start(async () => {
    const r = await duplicateSharedPlan(token)
    if (r.needsAuth) { router.push('/login'); return }
    if (r.ok && r.id) router.push(`/plans/${r.id}`)
  })

  return (
    <div>
      <button type="button" onClick={dup} disabled={pending} className="font-semibold text-[14px] px-5 py-2.5 rounded-full bg-rose text-white disabled:opacity-50">
        {t('duplicate_into_account')}
      </button>
      <p className="text-[12px] text-muted mt-1.5">{t('duplicate_note')}</p>
    </div>
  )
}
