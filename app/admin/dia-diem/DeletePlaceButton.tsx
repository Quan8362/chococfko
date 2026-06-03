'use client'

import { useTranslations } from 'next-intl'
import { useTransition } from 'react'
import { deletePlace } from './actions'

export default function DeletePlaceButton({ slug }: { slug: string }) {
  const t = useTranslations('admin')
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    if (!window.confirm(t('delete_place_confirm'))) return
    startTransition(async () => {
      try {
        await deletePlace(slug)
      } catch {
        alert(t('delete_place_error'))
      }
    })
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      className="text-[12px] font-semibold px-3.5 py-1.5 rounded-lg bg-red-50 text-red-600 border border-red-200 hover:bg-red-500 hover:text-white hover:border-red-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
    >
      {isPending ? '…' : t('action_delete')}
    </button>
  )
}
