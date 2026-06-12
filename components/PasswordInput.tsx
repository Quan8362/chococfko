'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

type Props = {
  name: string
  placeholder?: string
  required?: boolean
  minLength?: number
  autoComplete?: string
  defaultValue?: string
}

// Password field with a show/hide eye toggle. Toggling the input `type` does not
// affect form submission, so this works inside server-action <form>s.
export default function PasswordInput({ name, placeholder, required, minLength, autoComplete, defaultValue }: Props) {
  const t = useTranslations('auth')
  const [show, setShow] = useState(false)

  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        name={name}
        required={required}
        minLength={minLength}
        autoComplete={autoComplete}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="w-full text-[14.5px] px-3.5 py-3 pr-11 border-[1.5px] border-line rounded-xl bg-white focus:outline-none focus:border-rose"
      />
      <button
        type="button"
        onClick={() => setShow(s => !s)}
        aria-label={show ? t('hide_password') : t('show_password')}
        title={show ? t('hide_password') : t('show_password')}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-muted/70 hover:text-rose transition-colors"
        tabIndex={-1}
      >
        {show ? (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.243 4.243L9.88 9.88" />
          </svg>
        ) : (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        )}
      </button>
    </div>
  )
}
