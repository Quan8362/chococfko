'use client'

import { useState } from 'react'
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

function LineIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="#06C755">
      <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.281.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/>
    </svg>
  )
}

const PROVIDER_LABELS: Record<string, string> = {
  google: 'Google',
  facebook: 'Facebook',
}

interface Props {
  label?: string
}

export default function SocialLoginButtons({ label = 'Hoặc tiếp tục với' }: Props) {
  const supabase = createClient()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState('')

  const signInWithOAuth = async (provider: 'google' | 'facebook') => {
    setError('')
    setLoading(provider)
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    setLoading('')
    if (error) {
      if (error.message.toLowerCase().includes('not enabled') || error.message.toLowerCase().includes('validation')) {
        setError(
          `${PROVIDER_LABELS[provider]} chưa được kích hoạt. Vui lòng dùng đăng nhập bằng email.`
        )
      } else {
        setError(`Lỗi: ${error.message}`)
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
            {label}
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
