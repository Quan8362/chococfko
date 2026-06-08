/**
 * Server-side HTML sanitizer.
 * Strips known XSS vectors while keeping safe formatting tags.
 * Used in server actions before storing rich text to the database.
 */

export function sanitizeHtml(dirty: string): string {
  if (!dirty) return ''
  return dirty
    // Remove entire dangerous block elements
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object[\s\S]*?<\/object>/gi, '')
    .replace(/<embed[^>]*\/?>/gi, '')
    .replace(/<form[\s\S]*?<\/form>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<svg[\s\S]*?<\/svg>/gi, '')
    .replace(/<math[\s\S]*?<\/math>/gi, '')
    // Strip event handlers (onclick=, onload=, etc.)
    .replace(/\s+on\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\s+on\w+\s*=\s*'[^']*'/gi, '')
    .replace(/\s+on\w+\s*=\s*\S+/gi, '')
    // Replace dangerous URL schemes
    .replace(/href\s*=\s*"[^"]*(?:javascript|vbscript|data):[^"]*"/gi, 'href="#"')
    .replace(/href\s*=\s*'[^']*(?:javascript|vbscript|data):[^']*'/gi, "href='#'")
    .replace(/src\s*=\s*"[^"]*(?:javascript|data):[^"]*"/gi, 'src=""')
    .replace(/src\s*=\s*'[^']*(?:javascript|data):[^']*'/gi, "src=''")
}

/**
 * Remove accidental language-code prefixes (e.g. "vn", "GB") from vocabulary
 * meaning text that may have been baked in during dictionary imports.
 * Also safe to call on clean data — has no effect if no prefix is present.
 */
export function cleanMeaningText(value?: string | null): string {
  if (!value) return ''
  return value
    .trim()
    .replace(/^(vn|vi|en|gb|jp|ja)\s*[:：\-–—]?\s*/i, '')
    .trim()
}

/**
 * Strip all HTML tags and decode basic entities to get plain text.
 * Used to measure content length without counting HTML markup.
 */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}
