import { Node, mergeAttributes } from '@tiptap/core'
import Image from '@tiptap/extension-image'

// ── Icon section heading ──────────────────────────────────────────────────────
// A styled one-line heading (icon badge + editable bold label) the editor can
// insert from the icon menu, e.g. "📍 Địa điểm" / "🌙 Không khí về đêm". The icon
// is a non-editable attribute (round-trips via data-icon); the label is normal
// editable inline text inside <strong> so the writer can rename it.
export const IconHeading = Node.create({
  name: 'iconHeading',
  group: 'block',
  content: 'inline*',
  defining: true,

  addAttributes() {
    return {
      icon: {
        default: '📍',
        parseHTML: (el) => (el as HTMLElement).getAttribute('data-icon') || '',
        renderHTML: (attrs) => ({ 'data-icon': attrs.icon }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div.article-icon-heading', contentElement: 'strong' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { class: 'article-icon-heading' }),
      ['span', { class: 'article-icon', contenteditable: 'false' }, node.attrs.icon ?? ''],
      ['strong', { class: 'article-heading-text' }, 0],
    ]
  },
})

// ── Callout block ─────────────────────────────────────────────────────────────
// A coloured box (💡 Tip / ⚠️ Warning / 💰 Cost / 🚃 Access / ⭐ Highlight) with a
// non-editable header (icon + localized title, stored on the node so it survives
// save → reload and renders identically on the public page via plain HTML) and an
// editable body. Older posts that used a plain <blockquote> callout are untouched.
export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,
  isolating: true,

  addAttributes() {
    return {
      variant: {
        default: 'tip',
        parseHTML: (el) => (el as HTMLElement).getAttribute('data-variant') || 'tip',
        renderHTML: (attrs) => ({ 'data-variant': attrs.variant }),
      },
      icon: {
        default: '💡',
        parseHTML: (el) => (el as HTMLElement).getAttribute('data-icon') || '',
        renderHTML: (attrs) => ({ 'data-icon': attrs.icon }),
      },
      title: {
        default: '',
        parseHTML: (el) => (el as HTMLElement).getAttribute('data-title') || '',
        renderHTML: (attrs) => ({ 'data-title': attrs.title }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-callout]', contentElement: '.callout-body' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    const head = `${node.attrs.icon ?? ''} ${node.attrs.title ?? ''}`.trim()
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-callout': '',
        class: `callout callout-${node.attrs.variant}`,
      }),
      ['div', { class: 'callout-head', contenteditable: 'false' }, head],
      ['div', { class: 'callout-body' }, 0],
    ]
  },
})

// ── Image with optional caption ───────────────────────────────────────────────
// Extends the standard Image node with a `caption` attribute. When present the
// image is rendered as <figure><img><figcaption>…</figcaption></figure>; without
// a caption it stays a bare <img>, so existing images keep working unchanged.
export const ImageWithCaption = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      caption: {
        default: null,
        // Caption is rendered as <figcaption> text, not an attribute, so emit
        // nothing here — renderHTML below builds the <figure> from node.attrs.
        renderHTML: () => ({}),
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'figure.editor-figure',
        getAttrs: (el) => {
          const figure = el as HTMLElement
          const img = figure.querySelector('img')
          if (!img) return false
          return {
            src: img.getAttribute('src'),
            alt: img.getAttribute('alt'),
            title: img.getAttribute('title'),
            caption: figure.querySelector('figcaption')?.textContent || null,
          }
        },
      },
      ...(this.parent?.() ?? []),
    ]
  },

  renderHTML({ node, HTMLAttributes }) {
    const imgAttrs = mergeAttributes(this.options.HTMLAttributes, HTMLAttributes)
    const caption = node.attrs.caption as string | null
    if (caption) {
      return ['figure', { class: 'editor-figure' }, ['img', imgAttrs], ['figcaption', {}, caption]]
    }
    return ['img', imgAttrs]
  },
})
