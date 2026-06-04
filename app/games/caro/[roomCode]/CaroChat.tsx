'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'

type Message = {
  id: string
  symbol: string | null
  player_name: string
  message: string
  created_at: string
}

const QUICK = [
  '😂','🤡','💀','🔥','👀','😭','🫡','💪','🤌','😎',
  '💩','🎯','⚡','👑','🤬','🤮','🫠','🧠','🎪','🥹',
  '🤩','😤','🫵','💅','🫣','👻','🤑','🥶','🙃','😈',
]

// Emojis that get special large+bounce treatment
const IS_BIG_EMOJI = new Set(QUICK)
function isSingleBigEmoji(msg: string) {
  return IS_BIG_EMOJI.has(msg.trim()) && Array.from(msg.trim()).length === 1
}

// Rotating CSS animations for quick-emoji buttons
const ANIM_CLASSES = [
  'hover:animate-bounce',
  'hover:animate-spin',
  'hover:animate-ping',
  'hover:animate-pulse',
]

export default function CaroChat({
  roomId,
  userId,
  mySymbol,
  myName,
}: {
  roomId: string
  userId: string | null
  mySymbol: 'X' | 'O' | null
  myName: string
}) {
  const t = useTranslations('games.caro')
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Load initial messages
  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('caro_chat')
      .select('id,symbol,player_name,message,created_at')
      .eq('room_id', roomId)
      .order('created_at', { ascending: true })
      .limit(60)
      .then(({ data }) => { if (data) setMessages(data as Message[]) })
  }, [roomId])

  // Realtime subscription
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`caro-chat:${roomId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'caro_chat', filter: `room_id=eq.${roomId}` },
        (payload) => setMessages((prev) => [...prev, payload.new as Message]),
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [roomId])

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = async (text: string) => {
    const msg = text.trim()
    if (!msg || !userId || sending) return
    setSending(true)
    const supabase = createClient()
    await supabase.from('caro_chat').insert({
      room_id: roomId,
      user_id: userId,
      symbol: mySymbol ?? 'spectator',
      player_name: myName,
      message: msg.slice(0, 200),
    })
    setSending(false)
    setInput('')
    inputRef.current?.focus()
  }

  const symbolColor = (sym: string | null) =>
    sym === 'X' ? 'text-blue-600' : sym === 'O' ? 'text-rose' : 'text-muted/60'

  const symbolGlyph = (sym: string | null) =>
    sym === 'X' ? '✕' : sym === 'O' ? '○' : '👁'

  return (
    <div className="flex flex-col bg-paper border border-line rounded-2xl overflow-hidden" style={{ height: '100%' }}>

      {/* Header */}
      <div className="px-3.5 py-2.5 border-b border-line bg-gradient-to-r from-cream/80 to-rose/5 flex items-center gap-2 flex-none">
        <span className="text-[16px]">💬</span>
        <span className="font-bold text-[14px] text-ink">{t('chat_header')}</span>
        <span className="text-[11px] text-muted/50 hidden sm:block">{t('chat_tagline')}</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-2.5 space-y-2 min-h-0 scroll-smooth">
        {messages.length === 0 && (
          <p className="text-center text-[12px] text-muted/40 py-6 select-none whitespace-pre-line">
            {t('chat_empty')}
          </p>
        )}
        {messages.map((msg) => {
          const isMe = msg.symbol === mySymbol
          const big = isSingleBigEmoji(msg.message)
          return (
            <div key={msg.id} className={`flex items-end gap-1.5 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
              {/* Symbol badge */}
              <span className={`text-[11px] font-black flex-none mb-0.5 ${symbolColor(msg.symbol)}`}>
                {symbolGlyph(msg.symbol)}
              </span>

              <div className={`flex flex-col gap-0.5 max-w-[82%] ${isMe ? 'items-end' : 'items-start'}`}>
                {!isMe && (
                  <span className="text-[10.5px] text-muted/50 px-1">{msg.player_name}</span>
                )}
                {big ? (
                  /* Big bouncing emoji */
                  <span
                    className="text-[36px] leading-none animate-bounce inline-block"
                    title={msg.player_name}
                  >
                    {msg.message}
                  </span>
                ) : (
                  <div className={`px-3 py-1.5 text-[13px] leading-snug rounded-2xl break-words
                    ${isMe
                      ? 'bg-rose text-white rounded-br-none'
                      : 'bg-cream border border-line text-ink rounded-bl-none'
                    }`}
                  >
                    {msg.message}
                  </div>
                )}
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Quick emoji bar */}
      <div className="flex-none px-2 py-1.5 border-t border-line/60 bg-cream/30 overflow-x-auto scrollbar-none">
        <div className="flex gap-0.5 w-max">
          {QUICK.map((emoji, i) => (
            <button
              key={emoji}
              onClick={() => send(emoji)}
              disabled={!userId || sending}
              title={emoji}
              className={`w-8 h-8 text-[18px] flex items-center justify-center rounded-lg transition-all
                hover:bg-rose/10 hover:scale-125 active:scale-100 disabled:opacity-40
                ${i % 6 === 0 ? 'hover:rotate-12' : i % 6 === 1 ? 'hover:-rotate-12' : ''}
              `}
              style={{ transitionDuration: '120ms' }}
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>

      {/* Text input */}
      <div className="flex-none px-2.5 py-2 border-t border-line flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) }
          }}
          placeholder={userId ? t('chat_placeholder') : t('chat_login')}
          disabled={!userId || sending}
          maxLength={200}
          className="flex-1 min-w-0 text-[13px] px-3 py-2 rounded-xl border border-line bg-white focus:outline-none focus:border-rose/50 focus:ring-1 focus:ring-rose/10 placeholder:text-muted/40 disabled:opacity-50 text-ink"
        />
        <button
          onClick={() => send(input)}
          disabled={!input.trim() || !userId || sending}
          className="flex-none w-9 h-9 rounded-xl bg-rose text-white flex items-center justify-center hover:bg-rose-deep transition-all disabled:opacity-40"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </button>
      </div>
    </div>
  )
}
