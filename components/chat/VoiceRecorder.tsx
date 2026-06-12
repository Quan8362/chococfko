'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'

const MAX_SECONDS = 180

function pickMime(): string {
  const cands = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']
  if (typeof MediaRecorder !== 'undefined') {
    for (const m of cands) { try { if (MediaRecorder.isTypeSupported(m)) return m } catch { /* */ } }
  }
  return 'audio/webm'
}

// Mic button that records a voice clip and hands the resulting Blob + duration to
// `onSend` (which uploads + sends). Self-contained: shows an inline recording bar
// while active. Used in both DM and group composers.
export default function VoiceRecorder({
  onSend, disabled,
}: {
  onSend: (blob: Blob, mime: string, durationSec: number) => Promise<void>
  disabled?: boolean
}) {
  const t = useTranslations('community_chat')
  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const recRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const mimeRef = useRef('audio/webm')
  const cancelRef = useRef(false)
  const elapsedRef = useRef(0)

  function cleanup() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    streamRef.current?.getTracks().forEach(tr => tr.stop())
    streamRef.current = null
    recRef.current = null
    chunksRef.current = []
  }

  useEffect(() => () => cleanup(), [])

  async function start() {
    if (disabled || busy) return
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mime = pickMime()
      mimeRef.current = mime
      const rec = new MediaRecorder(stream, { mimeType: mime })
      chunksRef.current = []
      cancelRef.current = false
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      rec.onstop = async () => {
        const duration = elapsedRef.current
        const blob = new Blob(chunksRef.current, { type: mimeRef.current })
        cleanup()
        setRecording(false)
        setElapsed(0)
        if (cancelRef.current || blob.size === 0 || duration < 1) return
        setBusy(true)
        try { await onSend(blob, mimeRef.current, duration) }
        catch { setError(t('voice_error')) }
        finally { setBusy(false) }
      }
      recRef.current = rec
      rec.start()
      setRecording(true)
      setElapsed(0)
      elapsedRef.current = 0
      timerRef.current = setInterval(() => {
        elapsedRef.current += 1
        setElapsed(elapsedRef.current)
        if (elapsedRef.current >= MAX_SECONDS) stop()
      }, 1000)
    } catch {
      setError(t('voice_permission_denied'))
      setTimeout(() => setError(null), 4000)
    }
  }

  function stop() {
    cancelRef.current = false
    try { recRef.current?.stop() } catch { cleanup(); setRecording(false) }
  }
  function cancel() {
    cancelRef.current = true
    try { recRef.current?.stop() } catch { cleanup(); setRecording(false); setElapsed(0) }
  }

  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0')
  const ss = String(elapsed % 60).padStart(2, '0')

  if (recording) {
    return (
      <div className="flex items-center gap-2 px-2">
        <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse flex-none" />
        <span className="text-[13px] font-semibold text-ink tabular-nums">{mm}:{ss}</span>
        <button type="button" onClick={cancel} title={t('cancel')} className="w-8 h-8 grid place-items-center rounded-full text-muted hover:bg-line hover:text-red-500 transition-colors">✕</button>
        <button type="button" onClick={stop} title={t('send')} className="w-9 h-9 grid place-items-center rounded-full bg-rose text-white hover:bg-rose-deep transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12l5 5L20 7" /></svg>
        </button>
      </div>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={start}
        disabled={disabled || busy}
        title={t('voice_record')}
        aria-label={t('voice_record')}
        className="w-9 h-9 grid place-items-center rounded-full text-muted hover:bg-line hover:text-rose transition-colors disabled:opacity-50"
      >
        {busy ? (
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
        ) : (
          <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" /></svg>
        )}
      </button>
      {error && <span className="text-[11px] text-red-500 px-1">{error}</span>}
    </>
  )
}
