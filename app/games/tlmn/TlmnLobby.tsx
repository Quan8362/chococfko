'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { useTranslations } from 'next-intl'
import { createRoom, createPracticeRoom, joinRoomByCode, type ActionResult } from './actions'
import { ensureWallet, getWallet, claimDailyCoins, type WalletState } from './wallet'
import {
  ENTRY_MIN_BALANCE, DAILY_GRANT, SIGNUP_GRANT, formatCoins, formatCountdown,
} from '@/lib/game/economy'
import { TlmnBot, TlmnPeople, TlmnCoin, TlmnGift, TlmnPlay, TlmnEmptyWallet } from './icons'

function CreateBtn() {
  const { pending } = useFormStatus()
  const t = useTranslations('games.tlmn')
  return (
    <button
      type="submit"
      disabled={pending}
          data-testid="tlmn-create-room"
      className="tl-btn-primary w-full inline-flex items-center justify-center gap-2 text-[15px] px-6 py-3.5"
    >
      {pending ? (
        <>
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          {t('creating')}
        </>
      ) : t('mode_b_btn')}
    </button>
  )
}

function JoinBtn() {
  const { pending } = useFormStatus()
  const t = useTranslations('games.tlmn')
  return (
    <button
      type="submit"
      disabled={pending}
      className="tl-btn-secondary flex-none text-[14px] px-5 py-3 disabled:opacity-60"
    >
      {pending ? '…' : t('join_btn')}
    </button>
  )
}

// ── MODE A — Practice vs Bots (always available, even at 0 coins) ──────────────────
function PracticeCard() {
  const t = useTranslations('games.tlmn')
  const [botCount, setBotCount] = useState(3)
  const [showConfig, setShowConfig] = useState(false)
  const [isPending, startTransition] = useTransition()

  const play = () => {
    startTransition(async () => { await createPracticeRoom(botCount) })
  }

  return (
    <div className="tl-panel tl-panel--accent p-6 flex flex-col gap-4 overflow-hidden">
      <div className="flex items-start gap-3.5">
        <span className="flex-none w-14 h-14 rounded-2xl bg-[var(--tl-red)] text-white flex items-center justify-center shadow-[0_6px_16px_-9px_rgba(138,26,48,0.5)]" aria-hidden>
          <TlmnBot className="w-8 h-8" />
        </span>
        <div className="min-w-0">
          <h2 className="font-serif font-bold text-[20px] text-[var(--tl-text)] mb-0.5">{t('mode_a_heading')}</h2>
          <p className="text-[13.5px] text-[var(--tl-text-soft)] leading-relaxed">{t('mode_a_subtitle')}</p>
        </div>
      </div>

      <button
        onClick={play}
        disabled={isPending}
        className="tl-btn-primary w-full inline-flex items-center justify-center gap-2 text-[15.5px] px-6 py-3.5"
      >
        {isPending ? (
          <>
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            {t('mode_a_starting')}
          </>
        ) : <><TlmnPlay className="w-4 h-4" /> {t('mode_a_btn')}</>}
      </button>

      <div className="flex flex-col gap-2.5">
        <button
          type="button"
          onClick={() => setShowConfig(v => !v)}
          className="self-start text-[12px] font-semibold text-[var(--tl-text-soft)] hover:text-[var(--tl-red)] transition-colors inline-flex items-center gap-1"
        >
          <svg className={`w-3 h-3 transition-transform ${showConfig ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          {t('mode_a_config')}
        </button>
        {showConfig && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[12.5px] font-medium text-[var(--tl-text-soft)]">{t('mode_a_bot_count')}:</span>
            {[1, 2, 3].map(n => (
              <button
                key={n}
                type="button"
                onClick={() => setBotCount(n)}
                className={`w-9 h-9 rounded-xl text-[14px] font-bold transition-all border ${
                  botCount === n
                    ? 'bg-[var(--tl-red)] text-white border-[var(--tl-red)] shadow-[0_4px_12px_-4px_rgba(124,18,38,0.5)]'
                    : 'bg-white/70 text-[var(--tl-text)] border-[var(--tl-cream-line)] hover:border-[var(--tl-gold)]'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const INIT: ActionResult = null

export default function TlmnLobby() {
  const t = useTranslations('games.tlmn')
  const [joinState, joinAction] = useFormState(joinRoomByCode, INIT)

  // ── Wallet (Run 7 — persistent virtual-coin "xu" economy, PLAY-MONEY only) ─────
  const [wallet, setWallet] = useState<WalletState | null>(null)
  const [welcome, setWelcome] = useState(false)
  const [claimToast, setClaimToast] = useState(false)
  const [claiming, startClaim] = useTransition()
  const [claimErr, setClaimErr] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())

  const refreshWallet = useCallback(async () => {
    const w = await getWallet()
    if (w) setWallet(w)
  }, [])

  // On mount: ensure the wallet exists (one-time signup grant) then load its state.
  useEffect(() => {
    let alive = true
    ;(async () => {
      const { isNew } = await ensureWallet()
      if (!alive) return
      if (isNew) setWelcome(true)
      await refreshWallet()
    })()
    return () => { alive = false }
  }, [refreshWallet])

  // Tick the countdown clock once a second (display only — eligibility is server-checked).
  const broke = wallet != null && wallet.balance < ENTRY_MIN_BALANCE
  useEffect(() => {
    if (!broke) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [broke])

  // When the cooldown elapses on screen, re-fetch so can_claim_daily flips server-side.
  const nextClaimMs = wallet?.nextClaimAt ? new Date(wallet.nextClaimAt).getTime() : null
  const cooldownDone = nextClaimMs != null && now >= nextClaimMs
  const prevDone = useRef(false)
  useEffect(() => {
    if (cooldownDone && !prevDone.current) { prevDone.current = true; refreshWallet() }
    if (!cooldownDone) prevDone.current = false
  }, [cooldownDone, refreshWallet])

  const handleClaim = () => {
    setClaimErr(null)
    startClaim(async () => {
      const res = await claimDailyCoins()
      if ('error' in res) { setClaimErr(res.error); return }
      setWallet(w => w ? { ...w, balance: res.balance, canClaimDaily: false, nextClaimAt: res.nextClaimAt } : w)
      setClaimToast(true)
      setTimeout(() => setClaimToast(false), 4000)
      refreshWallet()
    })
  }

  const errorKey = joinState?.error === 'no_code' ? 'error_no_code'
    : joinState?.error === 'not_found' ? 'error_not_found'
    : joinState?.error === 'full' ? 'error_full'
    : joinState?.error === 'in_progress' ? 'error_in_progress'
    : joinState?.error === 'insufficient_coins' ? 'error_insufficient_coins'
    : null

  // can_claim_daily already encodes "broke + cooldown elapsed" (server-computed). The
  // client clock only drives the countdown display; the server re-checks on claim.
  const claimable = !!wallet?.canClaimDaily

  return (
    <>
      {/* Celebratory toasts — welcome grant + daily claim. */}
      {welcome && (
        <div className="fixed inset-x-0 top-4 z-50 flex justify-center px-4 pointer-events-none">
          <div className="pointer-events-auto bg-gradient-to-r from-[#e3b23c] to-[#ad1f37] text-white rounded-2xl px-5 py-3 shadow-2xl flex items-center gap-3 max-w-[460px] ring-1 ring-[#f6d989]/40">
            <TlmnGift className="w-6 h-6 flex-none text-[#fff5e4]" aria-hidden />
            <p className="text-[13.5px] font-semibold leading-snug flex-1">
              {t('coin_welcome_toast', { amount: formatCoins(SIGNUP_GRANT) })}
            </p>
            <button onClick={() => setWelcome(false)} className="text-white/80 hover:text-white text-[18px] leading-none flex-none" aria-label="×">×</button>
          </div>
        </div>
      )}
      {claimToast && (
        <div className="fixed inset-x-0 top-4 z-50 flex justify-center px-4 pointer-events-none">
          <div className="pointer-events-auto bg-gradient-to-r from-[#e3b23c] to-[#b07d1c] text-[#4a2c05] rounded-2xl px-5 py-3 shadow-2xl flex items-center gap-3 max-w-[460px] ring-1 ring-[#f6d989]/60">
            <TlmnCoin className="w-6 h-6 flex-none" aria-hidden />
            <p className="text-[13.5px] font-semibold leading-snug">
              {t('coin_daily_toast', { amount: formatCoins(DAILY_GRANT) })}
            </p>
          </div>
        </div>
      )}

      {/* Balance header — the REAL persisted "xu" balance (survives re-login). */}
      <div className="tl-panel-dark mb-5 px-5 py-3.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex-none w-11 h-11 rounded-full bg-[var(--tl-gold)]/15 text-[var(--tl-gold-bright)] flex items-center justify-center ring-1 ring-[var(--tl-gold)]/40">
            <TlmnCoin className="w-7 h-7" aria-hidden />
          </span>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[2px] text-[#fdeedd]/85 mb-1">{t('coin_balance_label')}</p>
            <p className="font-black text-[22px] text-[var(--tl-gold-bright)] leading-none tabular-nums">
              {wallet ? formatCoins(wallet.balance) : '…'}
            </p>
          </div>
        </div>
        <p className="text-[10.5px] text-[#fdeedd]/40 leading-snug text-right max-w-[180px]">{t('coin_play_money')}</p>
      </div>

      <div className="flex flex-col gap-5">
        {/* ── MODE A — Practice vs Bots (ALWAYS available, including when broke) ── */}
        <PracticeCard />

        {/* ── MODE B — Multiplayer with real people ── */}
        {broke ? (
          /* "Hết xu" panel — hosting/joining a real-stakes room is blocked until the
             daily refill is claimed. Practice (above) stays available regardless. */
          <div className="tl-panel tl-panel--accent p-6 flex flex-col items-center text-center gap-3">
            <span className="w-16 h-16 rounded-2xl bg-[var(--tl-red)]/8 text-[var(--tl-red)] flex items-center justify-center" aria-hidden>
              <TlmnEmptyWallet className="w-9 h-9" />
            </span>
            <h2 className="font-serif font-bold text-[20px] text-[var(--tl-red)]">{t('coin_broke_title')}</h2>
            <p className="text-[13.5px] text-[var(--tl-text-soft)] leading-relaxed max-w-[420px]">
              {t('coin_broke_desc', { min: formatCoins(ENTRY_MIN_BALANCE) })}
            </p>
            {claimable ? (
              <button
                onClick={handleClaim}
                disabled={claiming}
                className="tl-btn-gold mt-1 inline-flex items-center justify-center gap-2 text-[15px] px-7 py-3.5 disabled:opacity-60"
              >
                <TlmnCoin className="w-5 h-5" aria-hidden />
                {claiming ? t('creating') : t('coin_claim_btn')}
              </button>
            ) : (
              <div className="mt-1 inline-flex flex-col items-center gap-1">
                <p className="text-[12px] text-[var(--tl-text-soft)]">{t('coin_next_claim_label')}</p>
                <p className="font-mono font-black text-[26px] text-[var(--tl-text)] tabular-nums tracking-wide">
                  {nextClaimMs ? formatCountdown(nextClaimMs - now) : '—'}
                </p>
              </div>
            )}
            {claimErr && (
              <p className="text-[12px] text-red-600">
                {t(`coin_claim_err_${claimErr}` as Parameters<typeof t>[0])}
              </p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="tl-panel p-6 flex flex-col gap-4 overflow-hidden">
              <div className="flex items-start gap-3.5">
                <span className="flex-none w-14 h-14 rounded-2xl bg-[var(--tl-gold)]/15 text-[var(--tl-gold-deep)] ring-1 ring-[var(--tl-gold)]/30 flex items-center justify-center" aria-hidden>
                  <TlmnPeople className="w-8 h-8" />
                </span>
                <div className="min-w-0">
                  <h2 className="font-serif font-bold text-[20px] text-[var(--tl-text)] mb-0.5">{t('mode_b_heading')}</h2>
                  <p className="text-[13.5px] text-[var(--tl-text-soft)] leading-relaxed">{t('mode_b_subtitle')}</p>
                </div>
              </div>
              <form action={createRoom} className="mt-auto">
                <CreateBtn />
              </form>
            </div>

            <div className="tl-panel p-6 flex flex-col gap-4">
              <div>
                <h2 className="font-serif font-bold text-[20px] text-[var(--tl-text)] mb-1">{t('join_heading')}</h2>
                <p className="text-[13.5px] text-[var(--tl-text-soft)] leading-relaxed">{t('join_desc')}</p>
              </div>
              <form action={joinAction} className="flex gap-2 mt-auto">
                <input
                  type="text"
                  name="invite_code"
                  placeholder={t('join_placeholder')}
                  maxLength={5}
                  autoComplete="off"
                  className="flex-1 text-[14px] px-3.5 py-3 border border-[var(--tl-border)] rounded-xl bg-[var(--tl-surface)] focus:outline-none focus:border-[var(--tl-red)] focus:ring-2 focus:ring-[var(--tl-red)]/15 uppercase placeholder:normal-case placeholder:text-[var(--tl-text-soft)]/50 font-mono tracking-widest text-[var(--tl-text)] transition-all"
                />
                <JoinBtn />
              </form>
              {errorKey && (
                <p className="text-[12.5px] text-red-600 flex items-center gap-1.5 -mt-1">
                  <svg className="w-3.5 h-3.5 flex-none" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  {t(errorKey as Parameters<typeof t>[0])}
                </p>
              )}
              {joinState?.error && !errorKey && (
                <p className="text-[12.5px] text-red-600 -mt-1">{joinState.error}</p>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
