'use client'

import { useMemo, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import ReasonAction from '../../_components/ReasonAction'
import { freezeHand, refundHand, revealHoleCards } from '../../actions'
import type { ReplayStep } from '@/lib/games/poker/admin'

interface ActionRow {
  actionSeq: number; seatIndex: number; userId: string | null; street: string; type: string; amount: number | null; createdAt: string
}

export default function HandInspector({
  tableId, handId, terminal, refundable, steps, actions, reveal,
}: {
  tableId: string
  handId: string
  terminal: boolean
  refundable: boolean
  steps: readonly ReplayStep[]
  actions: ActionRow[]
  reveal: unknown
}) {
  const t = useTranslations('admin_poker')
  const [idx, setIdx] = useState(steps.length - 1)
  const step = steps[Math.min(idx, steps.length - 1)] ?? steps[0]

  const [hole, setHole] = useState<{ seatIndex: number; userId: string; cards: string[] }[] | null>(null)
  const [revealReason, setRevealReason] = useState('')
  const [revealErr, setRevealErr] = useState<string | null>(null)
  const [revealing, startReveal] = useTransition()

  const seatIds = useMemo(() => Object.keys(step?.committedTotal ?? {}).map(Number).sort((a, b) => a - b), [step])

  function doReveal() {
    setRevealErr(null)
    if (revealReason.trim().length === 0) { setRevealErr(t('err_reason_required')); return }
    startReveal(async () => {
      const res = await revealHoleCards(handId, revealReason.trim())
      if (!res.ok) { setRevealErr(res.error); return }
      setHole(res.hole)
    })
  }

  return (
    <div className="space-y-6">
      {/* Commands */}
      <section className="rounded-xl border border-line bg-paper p-4">
        <h2 className="font-serif font-bold text-[16px] text-ink mb-3">{t('safe_commands')}</h2>
        <div className="flex flex-wrap gap-2 items-start">
          {refundable && <ReasonAction action={freezeHand.bind(null, tableId, handId)} label={t('cmd_freeze_hand')} danger />}
          {refundable && <ReasonAction action={(reason) => refundHand(tableId, handId, reason)} label={t('cmd_refund')} danger />}
        </div>
      </section>

      {/* Step-by-step replay */}
      <section className="rounded-xl border border-line bg-paper p-4">
        <h2 className="font-serif font-bold text-[16px] text-ink mb-3">{t('replay')}</h2>
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <button type="button" onClick={() => setIdx(0)} className="rounded border border-line px-2 py-1 text-[12px]">⏮</button>
          <button type="button" onClick={() => setIdx((i) => Math.max(0, i - 1))} className="rounded border border-line px-2 py-1 text-[12px]">◀</button>
          <input type="range" min={0} max={steps.length - 1} value={Math.min(idx, steps.length - 1)}
            onChange={(e) => setIdx(Number(e.target.value))} className="flex-1 min-w-[120px]" />
          <button type="button" onClick={() => setIdx((i) => Math.min(steps.length - 1, i + 1))} className="rounded border border-line px-2 py-1 text-[12px]">▶</button>
          <button type="button" onClick={() => setIdx(steps.length - 1)} className="rounded border border-line px-2 py-1 text-[12px]">⏭</button>
          <span className="text-[12px] text-muted tabular-nums">{Math.min(idx, steps.length - 1)}/{steps.length - 1}</span>
        </div>

        <div className="text-[12px] text-ink mb-2">
          {step.seatIndex == null
            ? t('replay_initial')
            : t('replay_action', { seat: step.seatIndex, type: step.type ?? '', street: step.street ?? '' })}
          {' · '}{t('col_pot')}: <b className="tabular-nums">{step.potTotal.toLocaleString()}</b>
          {' · '}{t('current_bet')}: <b className="tabular-nums">{step.currentBet.toLocaleString()}</b>
        </div>

        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-[12px] min-w-[480px]">
            <thead className="bg-cream text-ink"><tr className="text-left">
              <th className="px-2 py-1 font-bold">{t('seat')}</th>
              <th className="px-2 py-1 font-bold">{t('committed_street')}</th>
              <th className="px-2 py-1 font-bold">{t('committed_total')}</th>
              <th className="px-2 py-1 font-bold">{t('col_status')}</th>
            </tr></thead>
            <tbody>
              {seatIds.map((si) => (
                <tr key={si} className="border-t border-line">
                  <td className="px-2 py-1 tabular-nums">{si}</td>
                  <td className="px-2 py-1 tabular-nums">{(step.committedThisStreet[si] ?? 0).toLocaleString()}</td>
                  <td className="px-2 py-1 tabular-nums">{((step.committedTotal[si] ?? 0) + (step.committedThisStreet[si] ?? 0)).toLocaleString()}</td>
                  <td className="px-2 py-1">{step.foldedSeats.includes(si) ? <span className="text-muted">{t('folded')}</span> : <span className="text-green-700">{t('active')}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Full action log */}
      <section>
        <h2 className="font-serif font-bold text-[16px] text-ink mb-2">{t('action_log')}</h2>
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-[12px] min-w-[620px]">
            <thead className="bg-cream text-ink"><tr className="text-left">
              <th className="px-2 py-1 font-bold">{t('col_seq')}</th>
              <th className="px-2 py-1 font-bold">{t('col_street')}</th>
              <th className="px-2 py-1 font-bold">{t('seat')}</th>
              <th className="px-2 py-1 font-bold">{t('action')}</th>
              <th className="px-2 py-1 font-bold">{t('amount')}</th>
            </tr></thead>
            <tbody>
              {actions.map((a) => (
                <tr key={a.actionSeq} className="border-t border-line">
                  <td className="px-2 py-1 tabular-nums">{a.actionSeq}</td>
                  <td className="px-2 py-1">{a.street}</td>
                  <td className="px-2 py-1 tabular-nums">{a.seatIndex}</td>
                  <td className="px-2 py-1">{a.type}</td>
                  <td className="px-2 py-1 tabular-nums">{a.amount != null ? a.amount.toLocaleString() : '—'}</td>
                </tr>
              ))}
              {actions.length === 0 && <tr><td colSpan={5} className="px-2 py-3 text-center text-muted">{t('none')}</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {/* Showdown reveal (public) + audited terminal-hand hole-card reveal */}
      <section className="rounded-xl border border-line bg-paper p-4 text-[12px]">
        <h2 className="font-serif font-bold text-[16px] text-ink mb-2">{t('cards')}</h2>
        {reveal != null && (
          <div className="mb-3">
            <div className="text-muted mb-1">{t('public_showdown')}</div>
            <pre className="text-[11px] whitespace-pre-wrap font-mono">{JSON.stringify(reveal)}</pre>
          </div>
        )}
        {!terminal ? (
          <p className="text-muted">{t('reveal_live_blocked')}</p>
        ) : hole ? (
          <div className="space-y-1">
            <div className="text-amber-700 font-semibold">{t('reveal_audited_notice')}</div>
            {hole.map((hc) => (
              <div key={hc.seatIndex} className="font-mono">{t('seat')} {hc.seatIndex} ({hc.userId.slice(0, 8)}): {hc.cards.join(' ')}</div>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-muted">{t('reveal_explain')}</p>
            <textarea value={revealReason} onChange={(e) => setRevealReason(e.target.value)} rows={2}
              placeholder={t('reveal_reason_placeholder')}
              className="w-full rounded-md border border-line bg-cream px-2 py-1 text-[12px]" />
            {revealErr && <div className="text-[11px] text-red-600">{t('err_prefix')}: {revealErr}</div>}
            <button type="button" disabled={revealing} onClick={doReveal}
              className="rounded-md bg-amber-600 px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50">
              {revealing ? t('working') : t('reveal_button')}
            </button>
          </div>
        )}
      </section>
    </div>
  )
}
