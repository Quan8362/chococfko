'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Jp60Game } from '../../Jp60Game'
import type { Jp60Settings } from '../../actions'
import type { ChallengeInfo } from '../../social-actions'

export function ChallengeClient({
  info,
  settings,
  signedIn,
}: {
  info: ChallengeInfo
  settings: Jp60Settings
  signedIn: boolean
}) {
  const t = useTranslations('games.jp60')
  const [playing, setPlaying] = useState(false)

  if (playing) {
    return <Jp60Game settings={settings} signedIn={signedIn} dailyDone={{}} challengeCode={info.code} autoStart={{ level: info.level }} />
  }

  const winner = computeWinner(info)

  return (
    <div className="max-w-[520px] mx-auto px-5 py-10">
      <div className="text-center mb-6">
        <span className="inline-block text-[10.5px] font-bold tracking-[2.5px] uppercase text-rose bg-rose/10 border border-rose/20 px-3 py-1.5 rounded-full mb-3">{t('challenge_title')}</span>
        <h1 className="font-serif font-bold text-[26px] text-ink">{t('title')}</h1>
        <p className="text-[14px] text-muted mt-2">{t('challenge_creator', { name: info.creatorName })} · {info.level === 'MIXED' ? t('level_mixed') : info.level}</p>
      </div>

      {info.expired ? (
        <p className="text-center text-rose py-6">{t('challenge_expired_msg')}</p>
      ) : (
        <>
          {info.participants.length > 0 && (
            <div className="bg-paper border border-line rounded-2xl p-4 mb-5 space-y-2">
              {info.participants.map((pp, i) => (
                <div key={i} className="flex items-center justify-between">
                  <span className="text-[14px] text-ink">{pp.name}{pp.isCreator ? ` (${t('challenge_creator', { name: '' }).replace(/[:：]?\s*$/, '').trim() || ''})` : ''}</span>
                  <span className="font-bold text-rose tabular-nums">{pp.score} <span className="text-muted font-normal text-[12px]">({pp.accuracy}%)</span></span>
                </div>
              ))}
              {winner && <p className="text-center text-[14px] font-bold text-gold pt-1">{winner === 'tie' ? t('challenge_tie') : t('challenge_winner', { name: winner })}</p>}
            </div>
          )}

          {signedIn ? (
            <button onClick={() => setPlaying(true)} className="w-full py-3.5 rounded-xl bg-rose text-white font-bold text-[16px]">{t('challenge_play')}</button>
          ) : (
            <div className="text-center bg-rose/5 border border-rose/20 rounded-2xl p-4">
              <p className="text-[13px] text-ink mb-3">{t('result_guest_note')}</p>
              <Link href="/login" className="inline-block px-5 py-2 rounded-lg bg-rose text-white font-semibold">{t('result_sign_in')}</Link>
            </div>
          )}
        </>
      )}

      <div className="text-center mt-5">
        <Link href="/games/japanese-60" className="text-[13px] text-muted hover:underline">{t('back_to_games')}</Link>
      </div>
    </div>
  )
}

function computeWinner(info: ChallengeInfo): string | 'tie' | null {
  if (info.participants.length < 2) return null
  const sorted = [...info.participants].sort((a, b) => b.score - a.score)
  if (sorted[0].score === sorted[1].score) return 'tie'
  return sorted[0].name
}
