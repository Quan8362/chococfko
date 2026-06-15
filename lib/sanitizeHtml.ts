import 'server-only'
import sanitizeHtmlLib from 'sanitize-html'

/**
 * Server-side HTML sanitizer.
 *
 * Uses the `sanitize-html` parser (htmlparser2) with a strict allowlist instead
 * of regex blacklisting — regex sanitizers are reliably bypassable
 * (e.g. `<img/src=x/onerror=alert(1)>` or entity-encoded `javascript&#58;` URLs).
 * The allowlist matches exactly what the TipTap editors can produce
 * (RichTextEditor / CommentRichEditor / ConfessionEditor): basic formatting,
 * headings, lists, blockquote, links, images, horizontal rule and text-align.
 *
 * Lives in its own `server-only` module so the Node-only `sanitize-html`
 * dependency can never be pulled into a client bundle. Called in server actions
 * before storing rich text — it must be the only line of defense, since the
 * action is reachable directly (the client editor can be bypassed).
 */
export function sanitizeHtml(dirty: string): string {
  if (!dirty) return ''
  return sanitizeHtmlLib(dirty, {
    allowedTags: [
      'p', 'br', 'span', 'div',
      'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del', 'mark', 'sub', 'sup',
      'h1', 'h2', 'h3', 'h4',
      'ul', 'ol', 'li',
      'blockquote', 'pre', 'code', 'hr',
      'a', 'img',
    ],
    allowedAttributes: {
      a: ['href', 'target', 'rel'],
      img: ['src', 'alt', 'title', 'width', 'height'],
      // text-align is set via inline style by TipTap
      p: ['style'], h1: ['style'], h2: ['style'], h3: ['style'], h4: ['style'],
    },
    // Only http(s)/mailto links; images only over http(s) (or relative, e.g.
    // /api/avatar). Anything else (javascript:, data:, vbscript:) is dropped.
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: { img: ['http', 'https'] },
    allowProtocolRelative: false,
    // Restrict inline styles to text-align with a fixed value set.
    allowedStyles: {
      '*': { 'text-align': [/^(left|right|center|justify)$/] },
    },
    // Force safe link attributes regardless of what the input claimed.
    transformTags: {
      a: sanitizeHtmlLib.simpleTransform('a', {
        rel: 'noopener noreferrer nofollow',
        target: '_blank',
      }),
    },
    disallowedTagsMode: 'discard',
  })
}
