'use client'

import { useState } from 'react'
import { trackEvent } from '@/lib/analytics'
import { createJp60Challenge } from './social-actions'

export function ChallengeButton({ sessionId, label, copyLabel }: { sessionId: string; label: string; copyLabel: string }) {
  const [code, setCode] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  const create = async () => {
    setBusy(true)
    const res = await createJp60Challenge(sessionId)
    setBusy(false)
    if (res.ok && res.code) {
      setCode(res.code)
      trackEvent('jp60_challenge_created', {})
    }
  }

  const copy = async () => {
    if (!code) return
    const url = `${window.location.origin}/games/japanese-60/c/${code}`
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* noop */ }
  }

  if (code) {
    return (
      <button onClick={copy} className="py-3 rounded-xl border border-rose text-rose font-semibold">
        {copied ? '✓' : copyLabel}
      </button>
    )
  }
  return (
    <button onClick={create} disabled={busy} className="py-3 rounded-xl border border-line text-ink font-semibold disabled:opacity-50">
      {label}
    </button>
  )
}
