'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import TruncatedName from '../public/TruncatedName'
import {
  deriveFirstRoundPairings,
  type FirstRoundPairing,
  type KnockoutPreviewSlot,
} from '@/lib/tournaments/domain/knockout-seed'
import type { Bracket } from '@/lib/tournaments/domain/types'

// Live, read-only first-round pairing preview shown BESIDE the seed order in the Xếp nhánh tab. It
// derives the matches from the SAME engine the full preview / generate action use
// (deriveFirstRoundPairings → buildKnockoutPreview.rounds[0]) — never a second UI-only algorithm — so
// what an organiser sees here is exactly what will be generated. It re-renders on every seed change
// (drag / keyboard / buttons / dropdown) because it reads the current client `seededIds`; it writes
// nothing. `nameOf` resolves a slot competitor id to its display label (a group-rank token label for
// Serie A / Serie B, or a competitor name for a knockout-only event).
export default function FirstRoundPairingPreview({
  seededIds,
  thirdPlaceEnabled,
  nameOf,
  bracket,
  className = '',
  headingId,
}: {
  seededIds: readonly string[]
  thirdPlaceEnabled: boolean
  nameOf: (id: string) => string
  bracket?: Bracket
  className?: string
  headingId?: string
}) {
  const t = useTranslations('admin_group_knockout')
  const tb = useTranslations('admin_knockout_bracket')

  const pairings = useMemo(
    () => deriveFirstRoundPairings(seededIds, thirdPlaceEnabled, bracket),
    [seededIds, thirdPlaceEnabled, bracket],
  )
  // Seed number = 1-based position of a competitor id in the current ordered seed list.
  const seedNumberOf = useMemo(() => {
    const m = new Map(seededIds.map((id, i) => [id, i + 1]))
    return (id: string) => m.get(id) ?? null
  }, [seededIds])

  const reduceMotion = usePrefersReducedMotion()

  // ── Live announcement + transient highlight of changed matches ────────────────────────────────
  const signature = useMemo(() => pairings.map(pairingSignature).join('|'), [pairings])
  const prevSig = useRef<string | null>(null)
  const prevByMatch = useRef<Map<number, string>>(new Map())
  const announceTick = useRef(0)
  const [announce, setAnnounce] = useState('')
  const [changed, setChanged] = useState<ReadonlySet<number>>(new Set())

  useEffect(() => {
    const byMatch = new Map(pairings.map((p) => [p.matchNumber, pairingSignature(p)]))
    // Skip the very first render (mount) — only announce/highlight actual user-driven changes.
    if (prevSig.current !== null && prevSig.current !== signature) {
      // A trailing zero-width space (unspoken) toggles so identical consecutive messages still re-fire.
      setAnnounce(t('pairing_updated') + '​'.repeat(announceTick.current++ % 2))
      if (!reduceMotion) {
        const diff = new Set<number>()
        byMatch.forEach((sig, n) => {
          if (prevByMatch.current.get(n) !== sig) diff.add(n)
        })
        setChanged(diff)
        const timer = setTimeout(() => setChanged(new Set()), 900)
        prevSig.current = signature
        prevByMatch.current = byMatch
        return () => clearTimeout(timer)
      }
    }
    prevSig.current = signature
    prevByMatch.current = byMatch
  }, [signature, pairings, reduceMotion, t])

  const slotLabel = (s: KnockoutPreviewSlot): string => {
    switch (s.kind) {
      case 'competitor': return nameOf(s.competitorId)
      case 'bye': return tb('bye')
      default: return tb('tbd')
    }
  }
  const matchAria = (p: FirstRoundPairing): string =>
    `${tb('match_no', { n: p.matchNumber })}: ${slotLabel(p.slotA)} ${tb('vs')} ${slotLabel(p.slotB)}`

  return (
    <section
      className={`rounded-2xl border border-line bg-cream/50 p-3 sm:p-4 ${className}`}
      aria-labelledby={headingId}
    >
      <h4 id={headingId} className="font-serif font-bold text-[13px] text-ink mb-2.5">
        {t('first_round_title')}
      </h4>

      <span className="sr-only" role="status" aria-live="polite">
        {announce}
      </span>

      {pairings.length === 0 ? (
        <p className="rounded-lg bg-paper border border-line px-3 py-4 text-[12.5px] text-muted text-center">
          {t('first_round_empty')}
        </p>
      ) : (
        <ol className="space-y-2">
          {pairings.map((p) => (
            <li
              key={p.matchNumber}
              aria-label={matchAria(p)}
              className={`rounded-xl border bg-paper px-3 py-2.5 transition-shadow ${
                changed.has(p.matchNumber) ? 'border-teal/50 ring-2 ring-teal/30' : 'border-line'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="text-[11px] font-bold text-teal">{tb('match_no', { n: p.matchNumber })}</span>
                {p.isBye && (
                  <span className="flex-none text-[10px] font-bold text-teal bg-teal-soft rounded-full px-2 py-0.5">
                    {t('bye_advance')}
                  </span>
                )}
              </div>
              <PairingSlot slot={p.slotA} seedNumberOf={seedNumberOf} nameOf={nameOf} byeLabel={tb('bye')} tbdLabel={tb('tbd')} />
              <div className="flex items-center gap-2 my-0.5 pl-1" aria-hidden="true">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">{tb('vs')}</span>
                <span className="flex-1 h-px bg-line" />
              </div>
              <PairingSlot slot={p.slotB} seedNumberOf={seedNumberOf} nameOf={nameOf} byeLabel={tb('bye')} tbdLabel={tb('tbd')} />
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

function pairingSignature(p: FirstRoundPairing): string {
  const s = (x: KnockoutPreviewSlot) => (x.kind === 'competitor' ? x.competitorId : x.kind)
  return `${p.matchNumber}:${s(p.slotA)}:${s(p.slotB)}:${p.isBye ? 1 : 0}`
}

// One side of a match: a seed-number badge + truncated name, or a BYE / undetermined pill.
function PairingSlot({
  slot,
  seedNumberOf,
  nameOf,
  byeLabel,
  tbdLabel,
}: {
  slot: KnockoutPreviewSlot
  seedNumberOf: (id: string) => number | null
  nameOf: (id: string) => string
  byeLabel: string
  tbdLabel: string
}) {
  if (slot.kind === 'competitor') {
    const seed = seedNumberOf(slot.competitorId)
    return (
      <div className="flex items-center gap-2 min-w-0">
        <span className="flex-none w-5 h-5 grid place-items-center rounded-md bg-teal-soft text-[10.5px] font-bold text-teal">
          {seed ?? '–'}
        </span>
        <TruncatedName name={nameOf(slot.competitorId)} className="flex-1 min-w-0 text-[13px] text-ink font-medium" />
      </div>
    )
  }
  const isBye = slot.kind === 'bye'
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="flex-none w-5 h-5 grid place-items-center rounded-md bg-cream text-[10.5px] text-muted" aria-hidden="true">
        {isBye ? '·' : '?'}
      </span>
      <span className="flex-1 min-w-0 text-[12.5px] font-medium text-muted italic">{isBye ? byeLabel : tbdLabel}</span>
    </div>
  )
}

function usePrefersReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduce(mq.matches)
    const on = () => setReduce(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return reduce
}
