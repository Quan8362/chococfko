'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import ConfirmDialog from './ConfirmDialog'
import BracketView from './BracketView'
import TruncatedName from '../public/TruncatedName'
import {
  buildReadonlyBranchView,
  evaluateBracketResetGate,
  type ReadonlyBranchView,
  type ReadonlyPairingSlot,
} from '@/lib/tournaments/domain/group-knockout-readonly'
import { resetGroupKnockoutBrackets } from '@/app/admin/giai-dau/[id]/noi-dung/actions'
import type {
  BranchSeedState,
  BranchWorkspace,
  GroupKnockoutSeedSetup,
  GroupKnockoutWorkspace,
  GroupRankTokenView,
  KnockoutMutationError,
} from '@/lib/tournaments/admin/types'

// Read-only view of an ALREADY-GENERATED group_knockout bracket, shown in the "Xếp nhánh" tab once the
// official brackets exist (seeds frozen). Instead of hiding everything behind a locked notice, it keeps
// the whole configuration visible — seed order, first-round pairings, capacity, real team count and
// BYEs, per Serie — sourced from DB truth: the persisted seed slots (order + qualification tokens) and
// the OFFICIAL first-round matches (never a recompute of the current seed order). Every seed-editing
// control is gone; the only action is a guarded reset (server re-checks results + permission).
export default function GeneratedBracketReadonlyPanel({
  tournamentId,
  eventId,
  setup,
  workspace,
  canManage,
}: {
  tournamentId: string
  eventId: string
  setup: GroupKnockoutSeedSetup
  workspace: GroupKnockoutWorkspace
  canManage: boolean
}) {
  const t = useTranslations('admin_group_knockout')
  const tk = useTranslations('admin_knockout_seeding')
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<KnockoutMutationError | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const [fullBracket, setFullBracket] = useState<'championship' | 'consolation' | null>(null)

  const version = setup.event.version

  // Label helpers shared by every branch: token → "Nhất bảng A", competitor id → display name.
  const tokenMap = useMemo(() => {
    const m = new Map<string, GroupRankTokenView>()
    for (const tk2 of setup.championship.tokens) m.set(tk2.tokenId, tk2)
    if (setup.consolation) for (const tk2 of setup.consolation.tokens) m.set(tk2.tokenId, tk2)
    return m
  }, [setup])
  const nameOf = useMemo(() => {
    const m = new Map(setup.competitors.map((c) => [c.id, c.shortName || c.name]))
    return (id: string | null) => (id ? m.get(id) ?? id : null)
  }, [setup.competitors])
  const rankName = (rank: number) => (rank <= 3 ? t(`rank_${rank}`) : t('rank_n', { n: rank }))
  const tokenLabel = (tokenId: string) => {
    const tv = tokenMap.get(tokenId)
    return tv ? `${rankName(tv.rank)} ${tv.groupName}` : tokenId
  }

  const gate = evaluateBracketResetGate({ hasResults: workspace.hasResults, canManage })

  const doReset = () =>
    startTransition(async () => {
      setError(null)
      const res = await resetGroupKnockoutBrackets(tournamentId, eventId, version, true)
      if (res.ok) {
        setConfirmReset(false)
        router.refresh()
      } else {
        setError(res.error ?? 'unknown')
        setConfirmReset(false)
      }
    })

  const branches: { key: 'championship' | 'consolation'; title: string; seed: BranchSeedState; ws: BranchWorkspace }[] = [
    { key: 'championship', title: t('branch_championship'), seed: setup.championship, ws: workspace.championship },
  ]
  if (setup.consolation && workspace.consolation) {
    branches.push({ key: 'consolation', title: t('branch_consolation'), seed: setup.consolation, ws: workspace.consolation })
  }

  const openBranch = branches.find((b) => b.key === fullBracket)

  return (
    <div>
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 mb-3" role="alert">
          <p className="text-[13px] text-red-600">{tk(`err_${error}`)}</p>
        </div>
      )}

      {/* Locked-state helper — explains WHY seeds are frozen, without replacing the content below it. */}
      <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 mb-4 flex items-start gap-2">
        <span aria-hidden className="text-[14px] leading-5">🔒</span>
        <p className="text-[12.5px] text-amber-800 leading-relaxed">{t('readonly_locked_help')}</p>
      </div>

      <div className="space-y-5">
        {branches.map((b) => (
          <BranchReadonly
            key={b.key}
            title={b.title}
            view={buildReadonlyBranchView({
              seed: { seededIds: b.seed.seededIds, tokens: b.seed.tokens.map((x) => ({ tokenId: x.tokenId, competitorId: x.competitorId })) },
              firstRoundMatches: (b.ws.rounds[0]?.matches ?? []).map((m) => ({
                matchNumber: m.matchNumber,
                competitorAId: m.competitorAId,
                competitorBId: m.competitorBId,
                status: m.status,
              })),
            })}
            tokenLabel={tokenLabel}
            nameOf={nameOf}
            onViewFull={() => setFullBracket(b.key)}
          />
        ))}
      </div>

      {/* Event-level reset — the ONLY mutating control. Always explains itself; never a bare button. */}
      <div className="bg-cream border border-line rounded-2xl p-4 sm:p-5 mt-5">
        <h3 className="font-serif font-bold text-[14px] text-ink mb-1">{t('reset_heading')}</h3>
        {gate.allowed ? (
          <>
            <p className="text-[12.5px] text-muted mb-3 leading-relaxed">{t('reset_hint')}</p>
            <button
              type="button"
              disabled={pending}
              onClick={() => setConfirmReset(true)}
              className="font-semibold text-[13px] px-5 py-2.5 rounded-full border border-red-200 bg-red-50 text-red-600 hover:bg-red-500 hover:text-white hover:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('reset_cta')}
            </button>
          </>
        ) : (
          <p className="text-[12.5px] text-muted leading-relaxed" role="status">
            {gate.reason === 'has_results' ? t('reset_blocked_results') : t('reset_blocked_forbidden')}
          </p>
        )}
      </div>

      <ConfirmDialog
        open={confirmReset}
        icon="♻️"
        tone="warning"
        title={t('confirm_reset_title')}
        description={t('confirm_reset_desc')}
        confirmLabel={t('reset_cta')}
        cancelLabel={tk('cancel')}
        pending={pending}
        onConfirm={doReset}
        onCancel={() => setConfirmReset(false)}
      />

      {openBranch && (
        <FullBracketModal
          title={openBranch.title}
          branch={openBranch.ws}
          competitors={workspace.competitors}
          onClose={() => setFullBracket(null)}
        />
      )}
    </div>
  )
}

// ── One Serie's read-only card: lock badge, stats, and the seed-order / first-round two-up ─────────
function BranchReadonly({
  title,
  view,
  tokenLabel,
  nameOf,
  onViewFull,
}: {
  title: string
  view: ReadonlyBranchView
  tokenLabel: (id: string) => string
  nameOf: (id: string | null) => string | null
  onViewFull: () => void
}) {
  const t = useTranslations('admin_group_knockout')
  const tk = useTranslations('admin_knockout_seeding')
  const tb = useTranslations('admin_knockout_bracket')

  // competitor id → seed number, so the pairing side can show the same seed badge as the order list.
  const seedOf = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of view.seedRows) if (r.competitorId) m.set(r.competitorId, r.seed)
    return (id: string) => m.get(id) ?? null
  }, [view.seedRows])

  return (
    <section className="rounded-2xl border border-line bg-paper/40 p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
        <div>
          <h3 className="font-serif font-bold text-[15px] text-ink">{title}</h3>
          <span className="inline-flex items-center gap-1 mt-0.5 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
            <span aria-hidden>🔒</span>
            <span>{t('readonly_generated_badge')}</span>
          </span>
        </div>
        <button
          type="button"
          onClick={onViewFull}
          title={t('full_bracket_hint')}
          className="flex-none font-semibold text-[12.5px] px-3 py-2 rounded-full border border-teal/25 bg-teal-soft text-teal hover:bg-teal hover:text-white transition-all"
        >
          {t('full_bracket_cta')}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-lg bg-cream border border-line px-3 py-2 mb-3">
        <Stat label={tk('bracket_size')} value={view.bracketSize} />
        <Stat label={tk('competitor_count')} value={view.competitorCount} />
        <Stat label={tk('bye_count')} value={view.byes} />
      </div>

      {!view.hasData ? (
        <p className="rounded-lg bg-cream border border-line px-3 py-6 text-[12.5px] text-muted text-center">
          {t('no_bracket_data')}
        </p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-4">
          {/* Seed order (persisted slot order → real team, token as secondary metadata). */}
          <div>
            <h4 className="font-serif font-bold text-[13px] text-ink mb-2">{t('seed_order_title')}</h4>
            <ol className="space-y-1.5">
              {view.seedRows.map((r) => {
                const name = nameOf(r.competitorId)
                const primary = name ?? tokenLabel(r.tokenId)
                const secondary = name ? tokenLabel(r.tokenId) : t('token_unresolved')
                return (
                  <li key={r.tokenId} className="flex items-center gap-2 rounded-xl border border-line bg-cream px-2.5 py-1.5">
                    <span className="flex-none w-6 h-6 grid place-items-center rounded-md bg-teal-soft text-[11px] font-bold text-teal">{r.seed}</span>
                    <span className="flex-1 min-w-0">
                      <TruncatedName name={primary} className="block text-[13px] text-ink font-medium" />
                      <span className="block text-[11px] text-muted truncate">{secondary}</span>
                    </span>
                  </li>
                )
              })}
            </ol>
          </div>

          {/* First-round pairings — straight from the OFFICIAL matches (real teams, frozen BYEs). */}
          <div>
            <h4 className="font-serif font-bold text-[13px] text-ink mb-2">{t('first_round_title')}</h4>
            <ol className="space-y-2">
              {view.pairings.map((p) => (
                <li
                  key={p.matchNumber}
                  aria-label={`${tb('match_no', { n: p.matchNumber })}: ${slotAria(p.slotA, nameOf, tb)} ${tb('vs')} ${slotAria(p.slotB, nameOf, tb)}`}
                  className="rounded-xl border border-line bg-paper px-3 py-2.5"
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="text-[11px] font-bold text-teal">{tb('match_no', { n: p.matchNumber })}</span>
                    {p.isBye && (
                      <span className="flex-none text-[10px] font-bold text-teal bg-teal-soft rounded-full px-2 py-0.5">{t('bye_advance')}</span>
                    )}
                  </div>
                  <PairingSlot slot={p.slotA} seedOf={seedOf} nameOf={nameOf} byeLabel={tb('bye')} tbdLabel={tb('tbd')} />
                  <div className="flex items-center gap-2 my-0.5 pl-1" aria-hidden>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">{tb('vs')}</span>
                    <span className="flex-1 h-px bg-line" />
                  </div>
                  <PairingSlot slot={p.slotB} seedOf={seedOf} nameOf={nameOf} byeLabel={tb('bye')} tbdLabel={tb('tbd')} />
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </section>
  )
}

function slotAria(
  slot: ReadonlyPairingSlot,
  nameOf: (id: string | null) => string | null,
  tb: (k: string) => string,
): string {
  if (slot.kind === 'competitor') return nameOf(slot.competitorId) ?? ''
  return slot.kind === 'bye' ? tb('bye') : tb('tbd')
}

function PairingSlot({
  slot,
  seedOf,
  nameOf,
  byeLabel,
  tbdLabel,
}: {
  slot: ReadonlyPairingSlot
  seedOf: (id: string) => number | null
  nameOf: (id: string | null) => string | null
  byeLabel: string
  tbdLabel: string
}) {
  if (slot.kind === 'competitor') {
    const seed = seedOf(slot.competitorId)
    return (
      <div className="flex items-center gap-2 min-w-0">
        <span className="flex-none w-5 h-5 grid place-items-center rounded-md bg-teal-soft text-[10.5px] font-bold text-teal">{seed ?? '–'}</span>
        <TruncatedName name={nameOf(slot.competitorId) ?? ''} className="flex-1 min-w-0 text-[13px] text-ink font-medium" />
      </div>
    )
  }
  const isBye = slot.kind === 'bye'
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="flex-none w-5 h-5 grid place-items-center rounded-md bg-cream text-[10.5px] text-muted" aria-hidden>
        {isBye ? '·' : '?'}
      </span>
      <span className="flex-1 min-w-0 text-[12.5px] font-medium text-muted italic">{isBye ? byeLabel : tbdLabel}</span>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <span className="text-[12.5px] text-muted">
      {label}: <span className="font-bold text-ink">{value}</span>
    </span>
  )
}

// Full official bracket (all rounds, real teams, BYEs) in a modal — never opens an editor / regenerates.
function FullBracketModal({
  title,
  branch,
  competitors,
  onClose,
}: {
  title: string
  branch: BranchWorkspace
  competitors: GroupKnockoutWorkspace['competitors']
  onClose: () => void
}) {
  const t = useTranslations('admin_group_knockout')
  const tk = useTranslations('admin_knockout_seeding')
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/40 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`${t('full_bracket_cta')} — ${title}`}
      onClick={onClose}
    >
      <div className="w-full max-w-[720px] max-h-[88vh] overflow-y-auto bg-paper border border-line rounded-2xl shadow-xl p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-4">
          <h3 className="font-serif font-bold text-[17px] text-ink">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={tk('cancel')}
            className="flex-none w-8 h-8 grid place-items-center rounded-lg text-muted hover:text-ink hover:bg-cream transition-colors"
          >
            ✕
          </button>
        </div>
        <BracketView rounds={branch.rounds} thirdPlaceMatch={branch.thirdPlaceMatch} competitors={competitors} />
        <div className="flex justify-end mt-5">
          <button
            type="button"
            onClick={onClose}
            className="font-semibold text-[13px] px-5 py-2 rounded-full border border-line bg-cream text-[#5c4d44] hover:bg-line/60 transition-colors"
          >
            {tk('close')}
          </button>
        </div>
      </div>
    </div>
  )
}
