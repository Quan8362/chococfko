'use client'

import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TiptapImage from '@tiptap/extension-image'
import TiptapLink from '@tiptap/extension-link'
import Underline from '@tiptap/extension-underline'
import { useCallback, useRef, useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { compressImage } from '@/lib/imageCompress'
import EmojiPicker from './EmojiPicker'
import GifPicker from './GifPicker'

const DRAFT_KEY = 'confession-draft'
const MAX_BYTES = 5 * 1024 * 1024

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
      className={`w-[28px] h-[26px] rounded flex items-center justify-center text-[13px] transition-colors flex-none ${
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
  return <div className="w-px bg-line h-[18px] mx-0.5 flex-none" />
}

// ── Toolbar ───────────────────────────────────────────────────────────────────
function Toolbar({
  editor, onImageUpload, uploading,
}: {
  editor: Editor | null
  onImageUpload: () => void
  uploading: boolean
}) {
  const t = useTranslations('confessions')
  const te = (k: string) => t(`editor.${k}` as Parameters<typeof t>[0])
  const [showEmoji, setShowEmoji] = useState(false)
  const [showGif, setShowGif] = useState(false)
  if (!editor) return null
  const e = editor

  return (
    <div className="flex flex-wrap items-center gap-x-0.5 gap-y-1 px-2.5 py-2 border-b border-line bg-cream/50 rounded-t-2xl">

        {/* Text formatting */}
        <div className="flex items-center gap-0.5 flex-none">
          <Btn onClick={() => e.chain().focus().toggleBold().run()} active={e.isActive('bold')} title={te('bold')}>
            <b className="font-black text-[13.5px]">B</b>
          </Btn>
          <Btn onClick={() => e.chain().focus().toggleItalic().run()} active={e.isActive('italic')} title={te('italic')}>
            <i className="font-serif text-[14px] italic">I</i>
          </Btn>
          <Btn onClick={() => e.chain().focus().toggleUnderline().run()} active={e.isActive('underline')} title={te('underline')}>
            <span className="underline font-semibold text-[12px]">U</span>
          </Btn>
        </div>

        <Sep />

        {/* Headings */}
        <div className="flex items-center gap-0.5 flex-none">
          <Btn onClick={() => e.chain().focus().toggleHeading({ level: 2 }).run()} active={e.isActive('heading', { level: 2 })} title={te('h2')}>
            <span className="text-[11px] font-bold">H2</span>
          </Btn>
          <Btn onClick={() => e.chain().focus().toggleHeading({ level: 3 }).run()} active={e.isActive('heading', { level: 3 })} title={te('h3')}>
            <span className="text-[11px] font-bold">H3</span>
          </Btn>
        </div>

        <Sep />

        {/* Lists + quote */}
        <div className="flex items-center gap-0.5 flex-none">
          <Btn onClick={() => e.chain().focus().toggleBulletList().run()} active={e.isActive('bulletList')} title={te('bulletList')}>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </Btn>
          <Btn onClick={() => e.chain().focus().toggleOrderedList().run()} active={e.isActive('orderedList')} title={te('orderedList')}>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
            </svg>
          </Btn>
          <Btn onClick={() => e.chain().focus().toggleBlockquote().run()} active={e.isActive('blockquote')} title={te('quote')}>
            <span className="font-serif italic font-bold text-[15px] leading-none">"</span>
          </Btn>
        </div>

        <Sep />

        {/* Link + Image */}
        <div className="flex items-center gap-0.5 flex-none">
          <Btn
            onClick={() => {
              const url = prompt(te('insertLink'))
              if (url) e.chain().focus().setLink({ href: url, target: '_blank' }).run()
            }}
            active={e.isActive('link')}
            title={te('link')}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
          </Btn>
          <Btn onClick={onImageUpload} disabled={uploading} title={te('image')}>
            {uploading ? (
              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            )}
          </Btn>
          {/* GIF button */}
          <div className="relative flex-none">
            <Btn
              onClick={() => { setShowGif(!showGif); setShowEmoji(false) }}
              active={showGif}
              title={t('insert_gif')}
            >
              <span className="text-[9.5px] font-extrabold tracking-tight">GIF</span>
            </Btn>
            {showGif && (
              <GifPicker
                onSelect={(url) => e.chain().focus().setImage({ src: url, alt: 'gif' }).run()}
                onClose={() => setShowGif(false)}
              />
            )}
          </div>
        </div>

        <Sep />

        {/* Emoji */}
        <div className="relative flex-none">
          <Btn onClick={() => { setShowEmoji(!showEmoji); setShowGif(false) }} active={showEmoji} title={te('emoji')}>
            <span className="text-[14px]">😊</span>
          </Btn>
          {showEmoji && (
            <EmojiPicker
              onSelect={(emoji) => {
                e.chain().focus().insertContent(emoji).run()
              }}
              onClose={() => setShowEmoji(false)}
            />
          )}
        </div>

        <Sep />

        {/* Undo / Redo */}
        <div className="flex items-center gap-0.5 flex-none">
          <Btn onClick={() => e.chain().focus().undo().run()} disabled={!e.can().undo()} title={te('undo')}>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
            </svg>
          </Btn>
          <Btn onClick={() => e.chain().focus().redo().run()} disabled={!e.can().redo()} title={te('redo')}>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10H11a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" />
            </svg>
          </Btn>
        </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
interface Props {
  name: string
  placeholder?: string
  minHeight?: string
}

export default function ConfessionEditor({ name, placeholder, minHeight = '200px' }: Props) {
  const t = useTranslations('confessions')
  const te = (k: string) => t(`editor.${k}` as Parameters<typeof t>[0])

  const [html, setHtml] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [charCount, setCharCount] = useState(0)
  const [draftSaved, setDraftSaved] = useState(false)
  const [showDraftBanner, setShowDraftBanner] = useState(false)
  const [pendingDraftHtml, setPendingDraftHtml] = useState<string | null>(null)

  const fileRef = useRef<HTMLInputElement>(null)
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const supabase = createClient()

  // Check for saved draft on mount
  useEffect(() => {
    const saved = localStorage.getItem(DRAFT_KEY)
    if (saved && saved !== '<p></p>') {
      setPendingDraftHtml(saved)
      setShowDraftBanner(true)
    }
  }, [])

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TiptapImage.configure({ inline: false, allowBase64: false }),
      TiptapLink.configure({
        openOnClick: false,
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
      }),
    ],
    content: '<p></p>',
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'focus:outline-none px-5 py-4 text-[15.5px] leading-[1.82] text-ink tiptap',
        style: `min-height: ${minHeight}`,
      },
    },
    onUpdate: ({ editor }) => {
      const newHtml = editor.getHTML()
      setHtml(newHtml)
      setCharCount(editor.state.doc.textContent.length)

      if (draftTimer.current) clearTimeout(draftTimer.current)
      draftTimer.current = setTimeout(() => {
        if (!editor.isEmpty) {
          localStorage.setItem(DRAFT_KEY, newHtml)
          setDraftSaved(true)
          setTimeout(() => setDraftSaved(false), 2000)
        }
      }, 2000)
    },
  })

  const restoreDraft = () => {
    if (!pendingDraftHtml || !editor) return
    editor.commands.setContent(pendingDraftHtml)
    setHtml(pendingDraftHtml)
    setCharCount(editor.state.doc.textContent.length)
    setShowDraftBanner(false)
  }

  const discardDraft = () => {
    localStorage.removeItem(DRAFT_KEY)
    setShowDraftBanner(false)
  }

  const handleImageUpload = useCallback(async (file: File) => {
    setUploadError(null)
    const allowed = ['image/jpeg', 'image/png', 'image/webp']
    if (!allowed.includes(file.type)) {
      setUploadError(te('invalidFormat'))
      return
    }
    if (file.size > MAX_BYTES) {
      setUploadError(te('fileTooLarge'))
      return
    }
    setUploading(true)
    const compressed = await compressImage(file)
    const ext = compressed.name.split('.').pop() ?? 'jpg'
    const path = `confessions/${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`
    const { data, error } = await supabase.storage.from('post-images').upload(path, compressed, { cacheControl: '31536000', contentType: compressed.type })
    setUploading(false)
    if (error || !data) {
      setUploadError(te('uploadError'))
      return
    }
    const { data: { publicUrl } } = supabase.storage.from('post-images').getPublicUrl(data.path)
    editor?.chain().focus().setImage({ src: publicUrl }).run()
  }, [editor, supabase, te])

  useEffect(() => {
    return () => {
      if (draftTimer.current) clearTimeout(draftTimer.current)
    }
  }, [])

  const isEmpty = editor?.isEmpty ?? true

  return (
    <div className="border border-line rounded-2xl bg-white focus-within:border-rose/60 focus-within:ring-2 focus-within:ring-rose/10 transition-all">
      <input type="hidden" name={name} value={html} />
      <input
        ref={fileRef}
        type="file"
        accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) handleImageUpload(f)
          e.target.value = ''
        }}
      />

      {/* Draft restore banner */}
      {showDraftBanner && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-amber-50 border-b border-amber-200 text-[13px]">
          <svg className="w-4 h-4 text-amber-600 flex-none" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
          </svg>
          <span className="text-amber-800 flex-1 text-[12.5px]">{te('hasDraft')}</span>
          <button type="button" onClick={restoreDraft} className="font-semibold text-amber-700 hover:text-amber-900 underline underline-offset-2 whitespace-nowrap text-[12.5px]">
            {te('restoreDraft')}
          </button>
          <button type="button" onClick={discardDraft} className="text-amber-500 hover:text-amber-700 whitespace-nowrap text-[12.5px]">
            {te('discardDraft')}
          </button>
        </div>
      )}

      {/* Toolbar */}
      <Toolbar editor={editor} onImageUpload={() => fileRef.current?.click()} uploading={uploading} />

      {/* Upload feedback */}
      {uploading && (
        <div className="px-4 py-2 text-[12px] text-rose bg-rose/5 border-b border-line flex items-center gap-2">
          <svg className="w-3.5 h-3.5 animate-spin flex-none" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
          {te('uploading')}
        </div>
      )}
      {uploadError && !uploading && (
        <div className="px-4 py-2 text-[12px] text-red-600 bg-red-50 border-b border-red-100 flex items-center gap-2">
          <svg className="w-3.5 h-3.5 flex-none" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/>
          </svg>
          {uploadError}
        </div>
      )}

      {/* Editor area with placeholder */}
      <div className="relative">
        {isEmpty && placeholder && (
          <div
            className="absolute top-4 left-5 right-5 text-[14.5px] text-muted/50 pointer-events-none select-none leading-[1.82] z-10"
            aria-hidden="true"
          >
            {placeholder}
          </div>
        )}
        <EditorContent editor={editor} />
      </div>

      {/* Footer: char count + draft status */}
      <div className="flex items-center justify-between px-4 py-2 border-t border-line/50 bg-cream/30">
        <span className={`text-[11.5px] ${charCount > 2700 ? 'text-amber-600 font-semibold' : 'text-muted/60'}`}>
          {charCount > 0 ? `${charCount} ${te('charCount')}` : ''}
        </span>
        {draftSaved && (
          <span className="text-[11.5px] text-emerald-600 flex items-center gap-1">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
            </svg>
            {te('draftSaved')}
          </span>
        )}
      </div>
    </div>
  )
}
