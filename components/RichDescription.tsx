import { looksLikeHtml } from '@/lib/sanitize'
import { sanitizeHtml } from '@/lib/sanitizeHtml'

/**
 * Renders a marketplace listing description that may be either:
 *  - legacy plain text (rendered escaped, with line breaks preserved), or
 *  - rich HTML from RichTextEditor (sanitized again here as defence-in-depth and
 *    rendered through the shared `.rich-content` public styling).
 *
 * Server component — safe to import the server-only sanitizer. `sanitizeHtml`
 * also neutralizes any legacy plain-text row that happens to contain tag-like
 * markup (old textarea data was stored unsanitized), so the HTML branch can
 * never emit a raw <script>.
 */
export default function RichDescription({
  content,
  className = '',
}: {
  content: string
  className?: string
}) {
  if (looksLikeHtml(content)) {
    return (
      <div
        className={`rich-content ${className}`}
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(content) }}
      />
    )
  }
  return <p className={`whitespace-pre-wrap break-words ${className}`}>{content}</p>
}
