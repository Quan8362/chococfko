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
// Color values are safe to keep when they are plain hex or rgb()/rgba() (no
// url()/expression()/etc.), or the keywords transparent / inherit. The UI only
// emits palette values; this just guarantees nothing dangerous slips through.
const SAFE_COLOR = /^(#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})|rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)|rgba\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*(?:0|1|0?\.\d+)\s*\)|transparent|inherit)$/

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
      // Image caption + tables + callout boxes produced by RichTextEditor.
      'figure', 'figcaption',
      'table', 'thead', 'tbody', 'tr', 'th', 'td', 'colgroup', 'col',
    ],
    allowedAttributes: {
      a: ['href', 'target', 'rel'],
      img: ['src', 'alt', 'title', 'width', 'height'],
      // text-align / color / background-color are set via inline style by TipTap.
      p: ['style'], h1: ['style'], h2: ['style'], h3: ['style'], h4: ['style'],
      // class on span enables the icon-heading badge (.article-icon).
      span: ['style', 'class'],
      mark: ['style', 'data-color'],
      li: ['style'],
      // Callout block: <div data-callout> wrapper + head/body, plus the variant
      // metadata it round-trips on. class is style-only (cannot execute).
      div: ['class', 'data-callout', 'data-variant', 'data-icon', 'data-title', 'contenteditable', 'style'],
      figure: ['class'],
      // Table cells may carry colspan/rowspan and a width style.
      table: ['style'], colgroup: ['style'], col: ['style', 'span'],
      th: ['colspan', 'rowspan', 'style'], td: ['colspan', 'rowspan', 'style'],
    },
    // Only http(s)/mailto links; images only over http(s) (or relative, e.g.
    // /api/avatar). Anything else (javascript:, data:, vbscript:) is dropped.
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: { img: ['http', 'https'] },
    allowProtocolRelative: false,
    // Restrict inline styles to a safe set: text-align, plus colors limited to
    // hex / rgb(a) / transparent / inherit (no url(), expression(), etc.) and a
    // numeric width for table sizing. Any other property/value is dropped.
    allowedStyles: {
      '*': {
        'text-align': [/^(left|right|center|justify)$/],
        'color': [SAFE_COLOR],
        'background-color': [SAFE_COLOR],
        'width': [/^\d{1,4}(px|%)?$/],
        'min-width': [/^\d{1,4}(px|%)?$/],
      },
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
