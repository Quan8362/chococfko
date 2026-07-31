'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import ConfirmDialog from './ConfirmDialog'
import {
  publishTournament,
  archiveTournament,
  deleteDraftTournament,
} from '@/app/admin/giai-dau/actions'
import type { TournamentMutationError, TournamentStatus } from '@/lib/tournaments/admin/types'

type Dialog = 'archive' | 'delete' | null

const BTN =
  'text-[12.5px] font-semibold px-3 py-[7px] rounded-lg border transition-all whitespace-nowrap disabled:opacity-50'

export default function TournamentStatusActions({
  id,
  status,
  eventCount,
  updatedAt,
  variant = 'list',
  basePath = '/admin/giai-dau',
  caps = { publish: true, archive: true, delete: true },
}: {
  id: string
  status: TournamentStatus
  eventCount: number
  updatedAt: string
  variant?: 'list' | 'detail'
  // Route prefix the workspace is mounted under (legacy admin vs scoped management surface).
  basePath?: string
  // Convenience UI gating — which status actions the viewer may perform. The server re-checks every
  // mutation (tournament.publish / .archive / .delete); hiding a button is never the security gate.
  caps?: { publish?: boolean; archive?: boolean; delete?: boolean }
}) {
  const t = useTranslations('admin_tournaments')
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [dialog, setDialog] = useState<Dialog>(null)
  const [error, setError] = useState<TournamentMutationError | null>(null)

  function run(fn: () => Promise<{ ok: boolean; error?: TournamentMutationError }>, onOk: () => void) {
    setError(null)
    startTransition(async () => {
      const res = await fn()
      if (res.ok) {
        onOk()
        return
      }
      setDialog(null)
      setError(res.error ?? 'unknown')
    })
  }

  function onPublish() {
    if (eventCount < 1) {
      setError('needs_event')
      return
    }
    run(() => publishTournament(id, updatedAt), () => router.refresh())
  }

  function onArchive() {
    run(() => archiveTournament(id, updatedAt), () => {
      setDialog(null)
      router.refresh()
    })
  }

  function onDelete() {
    if (eventCount > 0) {
      setDialog(null)
      setError('has_children')
      return
    }
    run(() => deleteDraftTournament(id, updatedAt), () => {
      // The tournament no longer exists → the detail page would 404. Return to the list.
      router.push(basePath)
      router.refresh()
    })
  }

  const canPublish = status === 'draft' && caps.publish !== false
  const canArchive =
    (status === 'draft' || status === 'published' || status === 'completed') && caps.archive !== false
  const canDelete = status === 'draft' && caps.delete !== false

  return (
    <>
      <div className={variant === 'detail' ? 'flex flex-wrap gap-2' : 'flex flex-wrap gap-2 sm:flex-nowrap'}>
        {canPublish && (
          <button
            type="button"
            disabled={pending}
            onClick={onPublish}
            className={`${BTN} bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-500 hover:text-white hover:border-transparent`}
          >
            {t('action_publish')}
          </button>
        )}
        {canArchive && (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setError(null)
              setDialog('archive')
            }}
            className={`${BTN} bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-500 hover:text-white hover:border-transparent`}
          >
            {t('action_archive')}
          </button>
        )}
        {canDelete && (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setError(null)
              if (eventCount > 0) {
                setError('has_children')
                return
              }
              setDialog('delete')
            }}
            className={`${BTN} bg-red-50 text-red-600 border-red-200 hover:bg-red-500 hover:text-white hover:border-transparent`}
          >
            {t('action_delete')}
          </button>
        )}
      </div>

      {error && <p className="text-[12px] text-rose mt-2 max-w-[280px]">{t(`err_${error}`)}</p>}

      <ConfirmDialog
        open={dialog === 'archive'}
        icon="📦"
        tone="warning"
        title={t('confirm_archive_title')}
        description={t('confirm_archive_desc')}
        confirmLabel={t('action_archive')}
        cancelLabel={t('cancel')}
        pending={pending}
        onConfirm={onArchive}
        onCancel={() => setDialog(null)}
      />
      <ConfirmDialog
        open={dialog === 'delete'}
        icon="🗑️"
        tone="danger"
        title={t('confirm_delete_title')}
        description={t('confirm_delete_desc')}
        confirmLabel={t('action_delete')}
        cancelLabel={t('cancel')}
        pending={pending}
        onConfirm={onDelete}
        onCancel={() => setDialog(null)}
      />
    </>
  )
}
