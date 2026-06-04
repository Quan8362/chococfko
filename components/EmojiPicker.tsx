'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'

const GROUPS = [
  {
    key: 'emotions',
    icon: '😊',
    emojis: [
      '😊', '😂', '🥲', '😭', '😅', '😆', '😍', '🥰',
      '😳', '😔', '😞', '😤', '😡', '🤯', '😴', '😇',
      '🤔', '🙃', '🥺', '😬', '🫠', '🥹', '😮', '😏',
      '😌', '🤗', '😑', '😪',
    ],
  },
  {
    key: 'reactions',
    icon: '❤️',
    emojis: [
      '❤️', '💔', '💕', '💖', '💯', '🔥', '✨', '👍',
      '👎', '👏', '🙏', '🤝', '👀', '💪', '🎉', '🫡',
    ],
  },
  {
    key: 'workStudy',
    icon: '💼',
    emojis: [
      '💻', '🧑‍💻', '📝', '📚', '📌', '⏰', '💼', '🏢',
      '☕', '😵‍💫', '📊', '🗂️', '✏️', '🖊️',
    ],
  },
  {
    key: 'fukuokaLife',
    icon: '🌸',
    emojis: [
      '🌸', '🍜', '🍣', '🍱', '☕', '🧋', '🏖️', '🏕️',
      '⛩️', '🚃', '🚌', '🚲', '🏠', '🏙️',
    ],
  },
  {
    key: 'confessionMood',
    icon: '🤫',
    emojis: [
      '🤫', '💭', '🫣', '🕊️', '🌙', '⭐', '🧸', '🫧',
      '🌿', '🌫️', '💫', '🪐',
    ],
  },
] as const

type GroupKey = (typeof GROUPS)[number]['key']

interface Props {
  onSelect: (emoji: string) => void
  onClose: () => void
}

export default function EmojiPicker({ onSelect, onClose }: Props) {
  const t = useTranslations('confessions')
  const te = (k: string) => t(`editor.${k}` as Parameters<typeof t>[0])
  const ref = useRef<HTMLDivElement>(null)
  const [activeGroup, setActiveGroup] = useState<GroupKey>('emotions')

  const currentGroup = GROUPS.find((g) => g.key === activeGroup) ?? GROUPS[0]

  // Close on outside click
  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [onClose])

  return (
    <div
      ref={ref}
      className="absolute left-0 top-full mt-1 z-[200] bg-white border border-line rounded-2xl shadow-[0_8px_32px_-8px_rgba(36,26,23,0.22)] overflow-hidden"
      style={{ width: 252 }}
    >
      {/* Group tabs */}
      <div className="flex items-center border-b border-line/60 bg-cream/40 px-1.5 py-1.5 gap-0.5">
        {GROUPS.map((group) => (
          <button
            key={group.key}
            type="button"
            onMouseDown={(e) => { e.preventDefault(); setActiveGroup(group.key as GroupKey) }}
            title={te(group.key)}
            className={`flex-1 h-7 rounded-lg flex items-center justify-center text-[15px] transition-colors ${
              activeGroup === group.key
                ? 'bg-rose/15 ring-1 ring-rose/30'
                : 'hover:bg-line/80'
            }`}
          >
            {group.icon}
          </button>
        ))}
      </div>

      {/* Group label */}
      <div className="px-3 pt-2 pb-1">
        <span className="text-[10.5px] font-semibold text-muted/70 uppercase tracking-wide">
          {te(activeGroup)}
        </span>
      </div>

      {/* Emoji grid */}
      <div className="px-2 pb-2.5 grid grid-cols-8 gap-0.5">
        {currentGroup.emojis.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onMouseDown={(e) => {
              e.preventDefault()
              onSelect(emoji)
              onClose()
            }}
            className="w-7 h-7 text-[16px] flex items-center justify-center rounded-lg hover:bg-rose/10 transition-colors"
            title={emoji}
            aria-label={emoji}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  )
}
