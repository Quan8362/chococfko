'use client'

import { useEffect, useRef, useState } from 'react'

interface TimerProps {
  totalSeconds: number
  onExpire?: () => void
  className?: string
}

export default function Timer({ totalSeconds, onExpire, className }: TimerProps) {
  const [remaining, setRemaining] = useState(totalSeconds)
  const onExpireRef = useRef(onExpire)
  onExpireRef.current = onExpire

  useEffect(() => {
    if (remaining <= 0) {
      onExpireRef.current?.()
      return
    }
    const id = setInterval(() => setRemaining(r => r - 1), 1000)
    return () => clearInterval(id)
  }, [remaining])

  const minutes = Math.floor(remaining / 60)
  const seconds = remaining % 60
  const pct = totalSeconds > 0 ? (remaining / totalSeconds) * 100 : 0
  const isLow = remaining <= 60 && remaining > 0

  return (
    <div className={`flex items-center gap-2 ${className ?? ''}`}>
      <div
        className={`w-2.5 h-2.5 rounded-full shrink-0 ${
          remaining <= 0 ? 'bg-muted' : isLow ? 'bg-red-500 animate-pulse' : 'bg-teal'
        }`}
      />
      <span
        className={`font-mono font-bold text-[15px] tabular-nums ${
          isLow ? 'text-red-600' : 'text-ink'
        }`}
      >
        {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
      </span>
      <div className="w-14 h-1.5 rounded-full bg-line overflow-hidden hidden sm:block">
        <div
          className={`h-full rounded-full transition-all duration-1000 ${
            isLow ? 'bg-red-500' : 'bg-teal'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
