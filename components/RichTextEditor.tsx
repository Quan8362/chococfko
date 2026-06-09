'use client'

import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TextAlign from '@tiptap/extension-text-align'
import TiptapImage from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import Underline from '@tiptap/extension-underline'
import { useCallback, useRef, useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'

const DRAFT_KEY = 'ccc-post-draft'

// ── Toolbar button ────────────────────────────────────────────────────────────
function Btn({
  onClick, active, disabled, title, children,
}: {
  onClick: () => void; active?: boolean; disabled?: boolean; title?: string; children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); onClick() }}
      disabled={disabled}
      title={title}
      className={`w-[30px] h-[28px] rounded flex items-center justify-center text-[13px] transition-colors flex-none ${
        active
          ? 'bg-rose text-white'
          : 'text-muted hover:bg-line hover:text-ink disabled:opacity-30 disabled:cursor-not-allowed'
      }`}
    >
      {children}
    </button>
  )
}

function Sep() {
  return <div className="w-px bg-line h-[18px] mx-1 flex-none" />
}

// ── Toolbar ───────────────────────────────────────────────────────────────────
function Toolbar({
  editor, onImageUpload, onInsertCallout,
}: {
  editor: Editor | null
  onImageUpload: () => void
  onInsertCallout: (emoji: string, label: string) => void
}) {
  const t = useTranslations('post_form')
  if (!editor) return null
  const e = editor

  const CALLOUTS = [
    { emoji: '💡', label: t('callout_tip') },
    { emoji: '⚠️', label: t('callout_warning') },
    { emoji: '💰', label: t('callout_cost') },
    { emoji: '🚃', label: t('callout_transit') },
    { emoji: '⭐', label: t('callout_highlight') },
  ] as const

  return (
    <div className="flex flex-wrap items-center gap-x-0.5 gap-y-1 px-2.5 py-2 border-b border-line bg-cream/60">

      {/* Text formatting */}
      <div className="flex items-center gap-0.5 flex-none">
        <Btn onClick={() => e.chain().focus().toggleBold().run()} active={e.isActive('bold')} title={t('editor_bold')}>
          <b className="font-black text-[14px]">B</b>
        </Btn>
        <Btn onClick={() => e.chain().focus().toggleItalic().run()} active={e.isActive('italic')} title={t('editor_italic')}>
          <i className="font-serif text-[14px] not-italic italic">I</i>
        </Btn>
        <Btn onClick={() => e.chain().focus().toggleUnderline().run()} active={e.isActive('underline')} title={t('editor_underline')}>
          <span className="underline font-semibold text-[13px]">U</span>
        </Btn>
        <Btn onClick={() => e.chain().focus().toggleStrike().run()} active={e.isActive('strike')} title={t('editor_strike')}>
          <s className="text-[13px]">S</s>
        </Btn>
      </div>

      <Sep />

      {/* Headings */}
      <div className="flex items-center gap-0.5 flex-none">
        <Btn onClick={() => e.chain().focus().setParagraph().run()} active={e.isActive('paragraph')} title={t('editor_paragraph')}>
          <span className="text-[11px] font-semibold">¶</span>
        </Btn>
        <Btn onClick={() => e.chain().focus().toggleHeading({ level: 2 }).run()} active={e.isActive('heading', { level: 2 })} title={t('editor_h2')}>
          <span className="text-[11.5px] font-bold">H2</span>
        </Btn>
        <Btn onClick={() => e.chain().focus().toggleHeading({ level: 3 }).run()} active={e.isActive('heading', { level: 3 })} title={t('editor_h3')}>
          <span className="text-[11.5px] font-bold">H3</span>
        </Btn>
      </div>

      <Sep />

      {/* Lists */}
      <div className="flex items-center gap-0.5 flex-none">
        <Btn onClick={() => e.chain().focus().toggleBulletList().run()} active={e.isActive('bulletList')} title={t('editor_bullet_list')}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </Btn>
        <Btn onClick={() => e.chain().focus().toggleOrderedList().run()} active={e.isActive('orderedList')} title={t('editor_ordered_list')}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
          </svg>
        </Btn>
        <Btn onClick={() => e.chain().focus().toggleBlockquote().run()} active={e.isActive('blockquote')} title={t('editor_blockquote')}>
          <span className="text-[14px] font-serif italic font-bold leading-none">"</span>
        </Btn>
      </div>

      <Sep />

      {/* Alignment */}
      <div className="flex items-center gap-0.5 flex-none">
        <Btn onClick={() => e.chain().focus().setTextAlign('left').run()} active={e.isActive({ textAlign: 'left' })} title={t('editor_align_left')}>
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M2 4a1 1 0 011-1h14a1 1 0 110 2H3a1 1 0 01-1-1zm0 4a1 1 0 011-1h8a1 1 0 110 2H3a1 1 0 01-1-1zm0 4a1 1 0 011-1h14a1 1 0 110 2H3a1 1 0 01-1-1zm0 4a1 1 0 011-1h8a1 1 0 110 2H3a1 1 0 01-1-1z" clipRule="evenodd" />
          </svg>
        </Btn>
        <Btn onClick={() => e.chain().focus().setTextAlign('center').run()} active={e.isActive({ textAlign: 'center' })} title={t('editor_align_center')}>
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M2 4a1 1 0 011-1h14a1 1 0 110 2H3a1 1 0 01-1-1zm3 4a1 1 0 011-1h8a1 1 0 110 2H6a1 1 0 01-1-1zm-3 4a1 1 0 011-1h14a1 1 0 110 2H3a1 1 0 01-1-1zm3 4a1 1 0 011-1h8a1 1 0 110 2H6a1 1 0 01-1-1z" clipRule="evenodd" />
          </svg>
        </Btn>
        <Btn onClick={() => e.chain().focus().setTextAlign('right').run()} active={e.isActive({ textAlign: 'right' })} title={t('editor_align_right')}>
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M2 4a1 1 0 011-1h14a1 1 0 110 2H3a1 1 0 01-1-1zm6 4a1 1 0 011-1h8a1 1 0 110 2H9a1 1 0 01-1-1zm-6 4a1 1 0 011-1h14a1 1 0 110 2H3a1 1 0 01-1-1zm6 4a1 1 0 011-1h8a1 1 0 110 2H9a1 1 0 01-1-1z" clipRule="evenodd" />
          </svg>
        </Btn>
      </div>

      <Sep />

      {/* Insert */}
      <div className="flex items-center gap-0.5 flex-none">
        <Btn
          onClick={() => {
            const url = prompt(t('editor_link_prompt'))
            if (url) e.chain().focus().setLink({ href: url, target: '_blank' }).run()
          }}
          active={e.isActive('link')}
          title={t('editor_insert_link')}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
        </Btn>
        <Btn onClick={onImageUpload} title={t('editor_insert_image')}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </Btn>
        <Btn onClick={() => e.chain().focus().setHorizontalRule().run()} title={t('editor_horizontal_rule')}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14" />
          </svg>
        </Btn>
      </div>

      <Sep />

      {/* Callout blocks */}
      <div className="flex items-center gap-0.5 flex-none">
        <span className="text-[10px] text-muted/70 font-medium mr-0.5 hidden sm:block">{t('editor_block_label')}</span>
        {CALLOUTS.map((c) => (
          <Btn
            key={c.emoji}
            onClick={() => onInsertCallout(c.emoji, c.label)}
            title={`${t('callout_add_prefix')}${c.label}`}
          >
            <span className="text-[13px] leading-none">{c.emoji}</span>
          </Btn>
        ))}
      </div>

      <Sep />

      {/* Undo / Redo */}
      <div className="flex items-center gap-0.5 flex-none">
        <Btn onClick={() => e.chain().focus().undo().run()} disabled={!e.can().undo()} title={t('editor_undo')}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
          </svg>
        </Btn>
        <Btn onClick={() => e.chain().focus().redo().run()} disabled={!e.can().redo()} title={t('editor_redo')}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10H11a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" />
          </svg>
        </Btn>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
interface Props {
  name: string
  defaultValue?: string
  placeholder?: string
  minHeight?: string
}

export default function RichTextEditor({
  name,
  defaultValue = '',
  placeholder,
  minHeight = '220px',
}: Props) {
  const t = useTranslations('post_form')
  const resolvedPlaceholder = placeholder ?? t('editor_placeholder_default')
  const [html, setHtml] = useState(defaultValue)
  const [uploading, setUploading] = useState(false)
  const [draftSaved, setDraftSaved] = useState(false)
  const [wordCount, setWordCount] = useState(0)
  // Draft found in localStorage but NOT yet loaded — user must confirm
  const [pendingDraft, setPendingDraft] = useState<string | null>(() => {
    if (typeof window === 'undefined' || defaultValue) return null
    const saved = localStorage.getItem(DRAFT_KEY)
    return (saved && saved !== '<p></p>') ? saved : null
  })
  const fileRef = useRef<HTMLInputElement>(null)
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const supabase = createClient()

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TiptapImage.configure({ inline: false, allowBase64: false }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
      }),
    ],
    // Always start empty for new posts; draft is offered via banner below
    content: defaultValue || '<p></p>',
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'focus:outline-none px-4 py-4 text-[15px] leading-[1.78] text-ink tiptap',
        style: `min-height: ${minHeight}`,
      },
    },
    onUpdate: ({ editor }) => {
      const newHtml = editor.getHTML()
      setHtml(newHtml)
      updateWordCount(editor.state.doc.textContent)

      // Auto-save draft (debounced 2s)
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current)
      draftTimerRef.current = setTimeout(() => {
        if (!editor.isEmpty) {
          localStorage.setItem(DRAFT_KEY, newHtml)
          setDraftSaved(true)
          setTimeout(() => setDraftSaved(false), 2000)
        }
      }, 2000)
    },
  })

  const restoreDraft = () => {
    if (!pendingDraft || !editor) return
    editor.commands.setContent(pendingDraft)
    setHtml(pendingDraft)
    updateWordCount(editor.state.doc.textContent)
    setPendingDraft(null)
  }

  const discardDraft = () => {
    localStorage.removeItem(DRAFT_KEY)
    setPendingDraft(null)
  }

  function updateWordCount(text: string) {
    const words = text.trim().split(/\s+/).filter(Boolean)
    setWordCount(words.length)
  }

  const handleImageUpload = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) return
    setUploading(true)
    const ext = file.name.split('.').pop() ?? 'jpg'
    const path = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`
    const { data, error } = await supabase.storage.from('post-images').upload(path, file)
    setUploading(false)
    if (error || !data) return
    const { data: { publicUrl } } = supabase.storage.from('post-images').getPublicUrl(data.path)
    editor?.chain().focus().setImage({ src: publicUrl }).run()
  }, [editor, supabase])

  const insertCallout = useCallback((emoji: string, label: string) => {
    editor?.chain().focus().insertContent(
      `<blockquote><p><strong>${emoji} ${label}:</strong> </p></blockquote>`
    ).run()
  }, [editor])

  // Keep html in sync if defaultValue changes (edit mode)
  useEffect(() => {
    if (defaultValue && editor && editor.getHTML() === '<p></p>') {
      editor.commands.setContent(defaultValue)
      setHtml(defaultValue)
    }
  }, [defaultValue, editor])

  // Cleanup draft timer on unmount
  useEffect(() => {
    return () => {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current)
    }
  }, [])

  const isEmpty = editor?.isEmpty ?? true

  return (
    <div className="border border-line rounded-xl overflow-hidden bg-white focus-within:border-rose focus-within:ring-2 focus-within:ring-rose/15 transition-all">
      <input type="hidden" name={name} value={html} />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) handleImageUpload(f)
          e.target.value = ''
        }}
      />

      {/* Draft restore banner — shown only when a saved draft exists */}
      {pendingDraft && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-amber-50 border-b border-amber-200 text-[13px]">
          <svg className="w-4 h-4 text-amber-600 flex-none" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
          </svg>
          <span className="text-amber-800 flex-1">{t('editor_draft_found')}</span>
          <button
            type="button"
            onClick={restoreDraft}
            className="font-semibold text-amber-700 hover:text-amber-900 underline underline-offset-2 whitespace-nowrap"
          >
            {t('editor_draft_restore')}
          </button>
          <button
            type="button"
            onClick={discardDraft}
            className="text-amber-600 hover:text-amber-800 whitespace-nowrap"
          >
            {t('editor_draft_discard')}
          </button>
        </div>
      )}

      {/* Toolbar */}
      <Toolbar
        editor={editor}
        onImageUpload={() => fileRef.current?.click()}
        onInsertCallout={insertCallout}
      />

      {/* Upload indicator */}
      {uploading && (
        <div className="px-4 py-2 text-[12.5px] text-rose bg-rose/5 border-b border-line flex items-center gap-2">
          <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          {t('editor_uploading')}
        </div>
      )}

      {/* Editor with placeholder */}
      <div className="relative">
        {isEmpty && (
          <div
            className="absolute top-4 left-4 right-4 text-[14.5px] text-muted/60 pointer-events-none select-none leading-[1.78] z-10"
            aria-hidden="true"
          >
            {resolvedPlaceholder}
          </div>
        )}
        <EditorContent editor={editor} />
      </div>

      {/* Footer: word count + draft indicator */}
      <div className="flex items-center justify-between px-4 py-2 border-t border-line/60 bg-cream/40">
        <span className="text-[11.5px] text-muted/70">
          {wordCount > 0 ? t('editor_word_count', { count: wordCount }) : ''}
        </span>
        {draftSaved && (
          <span className="text-[11.5px] text-emerald-600 flex items-center gap-1">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            {t('editor_draft_saved')}
          </span>
        )}
      </div>
    </div>
  )
}
