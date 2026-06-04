'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TiptapLink from '@tiptap/extension-link'
import TiptapImage from '@tiptap/extension-image'
import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import EmojiPicker from './EmojiPicker'
import GifPicker from './GifPicker'

interface Props {
  name: string
  placeholder?: string
  resetKey?: number
}

function Btn({
  onClick, active, title, children,
}: {
  onClick: () => void; active?: boolean; title?: string; children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); onClick() }}
      title={title}
      className={`w-[26px] h-[24px] rounded flex items-center justify-center text-[12.5px] transition-colors flex-none ${
        active ? 'bg-rose text-white' : 'text-muted hover:bg-line hover:text-ink'
      }`}
    >
      {children}
    </button>
  )
}

export default function CommentRichEditor({ name, placeholder, resetKey = 0 }: Props) {
  const t = useTranslations('confessions')
  const te = (k: string) => t(`editor.${k}` as Parameters<typeof t>[0])
  const [html, setHtml] = useState('')
  const [showEmoji, setShowEmoji] = useState(false)
  const [showGif, setShowGif] = useState(false)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false, horizontalRule: false, codeBlock: false }),
      TiptapLink.configure({
        openOnClick: false,
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
      }),
      TiptapImage.configure({ inline: false, allowBase64: false }),
    ],
    content: '<p></p>',
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'focus:outline-none px-3.5 py-2.5 text-[14px] leading-[1.72] text-ink tiptap min-h-[80px]',
      },
    },
    onUpdate: ({ editor }) => {
      setHtml(editor.getHTML())
    },
  })

  // Reset editor when resetKey changes (after successful submission)
  useEffect(() => {
    if (editor && resetKey > 0) {
      editor.commands.clearContent()
      setHtml('')
      setShowGif(false)
    }
  }, [resetKey, editor])

  const isEmpty = editor?.isEmpty ?? true

  return (
    <div className="border border-line rounded-xl bg-white focus-within:border-rose/50 focus-within:ring-2 focus-within:ring-rose/10 transition-all">
      <input type="hidden" name={name} value={html} />

      {/* Compact toolbar */}
      <div className="border-b border-line/60 bg-cream/40 rounded-t-xl">
        <div className="flex items-center gap-0.5 px-2.5 py-1.5">
          <Btn
            onClick={() => editor?.chain().focus().toggleBold().run()}
            active={editor?.isActive('bold')}
            title={te('bold')}
          >
            <b className="font-black text-[13px]">B</b>
          </Btn>
          <Btn
            onClick={() => editor?.chain().focus().toggleItalic().run()}
            active={editor?.isActive('italic')}
            title={te('italic')}
          >
            <i className="italic text-[13.5px] font-serif">I</i>
          </Btn>
          <Btn
            onClick={() => {
              const url = prompt(te('insertLink'))
              if (url) editor?.chain().focus().setLink({ href: url, target: '_blank' }).run()
            }}
            active={editor?.isActive('link')}
            title={te('link')}
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
          </Btn>

          {/* GIF button */}
          <div className="relative flex-none">
            <Btn
              onClick={() => { setShowGif(!showGif); setShowEmoji(false) }}
              active={showGif}
              title="Chèn GIF"
            >
              <span className="text-[9px] font-extrabold tracking-tight">GIF</span>
            </Btn>
            {showGif && (
              <GifPicker
                onSelect={(url) => editor?.chain().focus().setImage({ src: url, alt: 'gif' }).run()}
                onClose={() => setShowGif(false)}
              />
            )}
          </div>

          {/* Emoji */}
          <div className="relative ml-0.5">
            <Btn onClick={() => { setShowEmoji(!showEmoji); setShowGif(false) }} active={showEmoji} title={te('emoji')}>
              <span className="text-[13px]">😊</span>
            </Btn>
            {showEmoji && (
              <EmojiPicker
                onSelect={(emoji) => {
                  editor?.chain().focus().insertContent(emoji).run()
                }}
                onClose={() => setShowEmoji(false)}
              />
            )}
          </div>
        </div>
      </div>

      {/* Editor area */}
      <div className="relative">
        {isEmpty && placeholder && (
          <div
            className="absolute top-[10px] left-[14px] right-[14px] text-[14px] text-muted/50 pointer-events-none select-none leading-[1.72] z-10"
            aria-hidden="true"
          >
            {placeholder}
          </div>
        )}
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}
