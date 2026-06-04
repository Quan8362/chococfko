'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'

type Message = {
  id: string
  side: string | null
  player_name: string
  message: string
  created_at: string
}

const QUICK = [
  '😂','🤡','💀','🔥','👀','😭','🫡','💪','🤌','😎',
  '💩','🎯','⚡','👑','🤬','🤮','🫠','🧠','🎪','🥹',
  '🤩','😤','🫵','💅','🫣','👻','🤑','🥶','🙃','😈',
]

const IS_BIG_EMOJI = new Set(QUICK)
function isSingleBigEmoji(msg: string) {
  return IS_BIG_EMOJI.has(msg.trim()) && Array.from(msg.trim()).length === 1
}

export default function ChineseChessChat({
  roomId,
  userId,
  myRole,
  myName,
}: {
  roomId: string
  userId: string | null
  myRole: 'red' | 'black' | 'spectator'
  myName: string
}) {
  const t = useTranslations('games.chinese_chess')
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const lastSentAt = useRef<number>(0)

  const canSend = userId !== null && myRole !== 'spectator'

  // Load initial messages
  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('chinese_chess_chat_messages')
      .select('id,side,player_name,message,created_at')
      .eq('room_id', roomId)
      .order('created_at', { ascending: true })
      .limit(60)
      .then(({ data }) => { if (data) setMessages(data as Message[]) })
  }, [roomId])

  // Realtime subscription — isolated channel, no overlap with caro
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`chinese-chess-chat-${roomId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chinese_chess_chat_messages',
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => setMessages((prev) => [...prev, payload.new as Message]),
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [roomId])

  // Auto-scroll to latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = async (text: string) => {
    const msg = text.trim()
    if (!msg || !canSend || sending) return
    // Spam protection: max 1 message per 2 seconds (client-side gate)
    const now = Date.now()
    if (now - lastSentAt.current < 2000) return
    lastSentAt.current = now

    setSending(true)
    const supabase = createClient()
    await supabase.from('chinese_chess_chat_messages').insert({
      room_id: roomId,
      user_id: userId,
      side: myRole,
      player_name: myName,
      message: msg.slice(0, 300),
    })
    setSending(false)
    setInput('')
    inputRef.current?.focus()
  }

  const sideDotCls = (side: string | null) =>
    side === 'red' ? 'bg-red-500' : side === 'black' ? 'bg-zinc-700' : 'bg-muted/40'

  const sideNameCls = (side: string | null) =>
    side === 'red' ? 'text-red-600' : side === 'black' ? 'text-zinc-600' : 'text-muted/60'

  const placeholder = !userId
    ? t('chat_login')
    : myRole === 'spectator'
    ? t('chat_spectator')
    : t('chat_placeholder')

  return (
    <div className="flex flex-col bg-paper border border-line rounded-2xl overflow-hidden" style={{ height: '100%' }}>

      {/* Header */}
      <div className="px-3.5 py-2.5 border-b border-line bg-gradient-to-r from-cream/80 to-red-500/5 flex items-center gap-2 flex-none">
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
          const isMe = myRole !== 'spectator' && msg.side === myRole
          const big = isSingleBigEmoji(msg.message)
          return (
            <div key={msg.id} className={`flex items-end gap-1.5 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
              {/* Side colour dot */}
              <span className={`w-2 h-2 rounded-full flex-none mb-1 ${sideDotCls(msg.side)}`} />

              <div className={`flex flex-col gap-0.5 max-w-[82%] ${isMe ? 'items-end' : 'items-start'}`}>
                {!isMe && (
                  <span className={`text-[10.5px] px-1 font-semibold ${sideNameCls(msg.side)}`}>
                    {msg.player_name}
                  </span>
                )}
                {big ? (
                  <span
                    className="text-[36px] leading-none animate-bounce inline-block"
                    title={msg.player_name}
                  >
                    {msg.message}
                  </span>
                ) : (
                  <div className={`px-3 py-1.5 text-[13px] leading-snug rounded-2xl break-words
                    ${isMe
                      ? 'bg-red-600 text-white rounded-br-none'
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
              disabled={!canSend || sending}
              title={emoji}
              className={`w-8 h-8 text-[18px] flex items-center justify-center rounded-lg transition-all
                hover:bg-red-500/10 hover:scale-125 active:scale-100 disabled:opacity-40
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
          placeholder={placeholder}
          disabled={!canSend || sending}
          maxLength={300}
          className="flex-1 min-w-0 text-[13px] px-3 py-2 rounded-xl border border-line bg-white focus:outline-none focus:border-red-400/50 focus:ring-1 focus:ring-red-400/10 placeholder:text-muted/40 disabled:opacity-50 text-ink"
        />
        <button
          onClick={() => send(input)}
          disabled={!input.trim() || !canSend || sending}
          className="flex-none w-9 h-9 rounded-xl bg-red-600 text-white flex items-center justify-center hover:bg-red-700 transition-all disabled:opacity-40"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </button>
      </div>
    </div>
  )
}
