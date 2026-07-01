'use client'

import { useTranslations } from 'next-intl'
import ReasonAction from '../_components/ReasonAction'
import {
  pauseTable, resumeTable, markTableClosing, closeTable, forceSitOut, freezeHand,
} from '../actions'

interface SeatLite { seatIndex: number; label: string; status: string }

// Safe table-level operational commands. Every command is reason-gated and audited server-side.
export default function TableCommands({
  tableId, status, paused, currentHandId, currentPhase, seats,
}: {
  tableId: string
  status: string
  paused: boolean
  currentHandId: string | null
  currentPhase: string | null
  seats: SeatLite[]
}) {
  const t = useTranslations('admin_poker')
  const handLive = currentHandId != null && currentPhase != null && !['COMPLETED', 'CANCELLED'].includes(currentPhase)

  return (
    <section className="rounded-xl border border-line bg-paper p-4">
      <h2 className="font-serif font-bold text-[16px] text-ink mb-3">{t('safe_commands')}</h2>
      <div className="flex flex-wrap gap-2 items-start">
        {!paused
          ? <ReasonAction action={pauseTable.bind(null, tableId)} label={t('cmd_pause')} />
          : <ReasonAction action={resumeTable.bind(null, tableId)} label={t('cmd_resume')} />}
        {status === 'open' && <ReasonAction action={markTableClosing.bind(null, tableId)} label={t('cmd_mark_closing')} />}
        {status !== 'closed' && <ReasonAction action={closeTable.bind(null, tableId)} label={t('cmd_close')} danger />}
        {handLive && currentHandId &&
          <ReasonAction action={freezeHand.bind(null, tableId, currentHandId)} label={t('cmd_freeze_hand')} danger />}
      </div>

      {seats.length > 0 && (
        <div className="mt-4">
          <h3 className="text-[12px] font-semibold text-ink mb-2">{t('cmd_force_sit_out')}</h3>
          <div className="flex flex-wrap gap-2">
            {seats.map((s) => (
              <ReasonAction
                key={s.seatIndex}
                small
                action={(reason) => forceSitOut(tableId, s.seatIndex, reason)}
                label={`#${s.seatIndex} ${s.label}`}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
