'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  )
}

function FacebookIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="#1877F2">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
    </svg>
  )
}

interface Props {
  variant?: 'login' | 'register'
  // Post-login destination (e.g. an invite link). Forwarded to the OAuth callback,
  // which validates it via safeNextPath before redirecting.
  next?: string
}

export default function SocialLoginButtons({ variant = 'login', next }: Props) {
  const t = useTranslations('auth')
  const supabase = createClient()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState('')

  const signInWithOAuth = async (provider: 'google' | 'facebook') => {
    setError('')
    setLoading(provider)
    const callback = next
      ? `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`
      : `${window.location.origin}/auth/callback`
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: callback },
    })
    setLoading('')
    if (error) {
      if (
        error.message.toLowerCase().includes('not enabled') ||
        error.message.toLowerCase().includes('validation')
      ) {
        setError(t('provider_disabled', { provider: provider === 'google' ? 'Google' : 'Facebook' }))
      } else {
        setError(t('auth_error', { message: error.message }))
      }
    }
  }

  return (
    <div className="space-y-3 mt-2">
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-line" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-cream px-3 text-[11.5px] text-muted uppercase tracking-[1.5px]">
            {variant === 'register' ? t('or_register') : t('or_continue')}
          </span>
        </div>
      </div>

      {error && (
        <div className="bg-[#fff4f6] border border-[#f3cdd9] rounded-xl px-4 py-3 text-[13px] text-rose-deep">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2.5">
        <button
          type="button"
          disabled={!!loading}
          onClick={() => signInWithOAuth('google')}
          className="flex items-center justify-center gap-2 py-3 border-[1.5px] border-line rounded-xl hover:bg-paper hover:border-[#4285F4]/40 transition-all text-[13px] font-medium disabled:opacity-60"
          title="Google"
        >
          {loading === 'google' ? <span className="text-[11px]">...</span> : <GoogleIcon />}
          <span className="hidden sm:inline text-[#3c4043]">Google</span>
        </button>

        <button
          type="button"
          disabled={!!loading}
          onClick={() => signInWithOAuth('facebook')}
          className="flex items-center justify-center gap-2 py-3 border-[1.5px] border-line rounded-xl hover:bg-paper hover:border-[#1877F2]/40 transition-all text-[13px] font-medium disabled:opacity-60"
          title="Facebook"
        >
          {loading === 'facebook' ? <span className="text-[11px]">...</span> : <FacebookIcon />}
          <span className="hidden sm:inline text-[#1877F2]">Facebook</span>
        </button>
      </div>
    </div>
  )
}
