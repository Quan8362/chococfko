'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { useTranslations } from 'next-intl'
import { createRoom, joinRoom, type ActionResult } from './actions'

function CreateBtn() {
  const { pending } = useFormStatus()
  const t = useTranslations('games.chinese_chess')
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full inline-flex items-center justify-center gap-2 font-semibold text-[15px] px-6 py-3.5 rounded-2xl bg-rose text-white hover:bg-rose-deep transition-all disabled:opacity-60 shadow-[0_4px_18px_-4px_rgba(194,24,91,0.45)]"
    >
      {pending ? (
        <>
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          {t('creating')}
        </>
      ) : t('create_btn')}
    </button>
  )
}

function JoinBtn() {
  const { pending } = useFormStatus()
  const t = useTranslations('games.chinese_chess')
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex-none font-semibold text-[14px] px-5 py-3 rounded-xl bg-ink text-white hover:bg-ink/85 transition-all disabled:opacity-60"
    >
      {pending ? '…' : t('join_btn')}
    </button>
  )
}

const INIT: ActionResult = null

export default function ChineseChessLobby() {
  const t = useTranslations('games.chinese_chess')
  const [joinState, joinAction] = useFormState(joinRoom, INIT)

  const errorKey = joinState?.error === 'no_code' ? 'error_no_code'
    : joinState?.error === 'not_found' ? 'error_not_found'
    : joinState?.error === 'full' ? 'error_full'
    : null

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
      {/* Create Room */}
      <div className="bg-paper border border-line rounded-2xl p-6 flex flex-col gap-4">
        <div>
          <h2 className="font-serif font-bold text-[20px] text-ink mb-1">{t('create_heading')}</h2>
          <p className="text-[13.5px] text-muted leading-relaxed">{t('create_desc')}</p>
        </div>
        <form action={createRoom}>
          <CreateBtn />
        </form>
      </div>

      {/* Join Room */}
      <div className="bg-paper border border-line rounded-2xl p-6 flex flex-col gap-4">
        <div>
          <h2 className="font-serif font-bold text-[20px] text-ink mb-1">{t('join_heading')}</h2>
          <p className="text-[13.5px] text-muted leading-relaxed">{t('join_desc')}</p>
        </div>
        <form action={joinAction} className="flex gap-2">
          <input
            type="text"
            name="room_code"
            placeholder={t('join_placeholder')}
            maxLength={5}
            autoComplete="off"
            className="flex-1 text-[14px] px-3.5 py-3 border border-line rounded-xl bg-white focus:outline-none focus:border-rose/60 focus:ring-2 focus:ring-rose/10 uppercase placeholder:normal-case placeholder:text-muted/40 font-mono tracking-widest text-ink transition-all"
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
  )
}
