import test from 'node:test'
import assert from 'node:assert/strict'
import { jsonLdString, breadcrumbJsonLd } from './seo.ts'

// Prompt 14 security regression: jsonLdString() output is embedded verbatim into a
// <script type="application/ld+json"> tag via dangerouslySetInnerHTML on the public tournament pages.
// An admin-authored value (tournament name / location) must never be able to break out of that tag.

const LS = String.fromCharCode(0x2028)
const PS = String.fromCharCode(0x2029)

test('jsonLdString escapes < > & so a value cannot close the <script> tag', () => {
  const out = jsonLdString({ name: 'Cup </script><img src=x onerror=alert(1)>' })
  assert.ok(!out.includes('<'), 'raw < must not appear in JSON-LD output')
  assert.ok(!out.includes('>'), 'raw > must not appear in JSON-LD output')
  assert.ok(!out.includes('&'), 'raw & must not appear in JSON-LD output')
  assert.ok(!/<\/script/i.test(out), 'a </script sequence must not survive in the output')
  assert.ok(out.includes('\\u003c') && out.includes('\\u003e'), 'dangerous chars are re-encoded as \\uXXXX')
})

test('jsonLdString escapes the U+2028/U+2029 line separators', () => {
  const out = jsonLdString({ name: `a${LS}b${PS}c` })
  assert.ok(!out.includes(LS) && !out.includes(PS), 'raw line separators must be escaped')
  assert.ok(out.includes('\\u2028') && out.includes('\\u2029'), 'line separators re-encoded as \\uXXXX')
})

test('jsonLdString stays lossless — the escaped output parses back to the original', () => {
  const value = { name: `Giai <A> & "B" ${LS}${PS} C`, nested: { x: '</script>' } }
  const parsed = JSON.parse(jsonLdString(value))
  assert.deepEqual(parsed, value)
})

test('jsonLdString escaping does not corrupt a normal breadcrumb node', () => {
  const parsed = JSON.parse(jsonLdString(breadcrumbJsonLd([{ name: 'Home', path: '/' }])))
  assert.equal(parsed['@type'], 'BreadcrumbList')
  assert.equal(parsed.itemListElement[0].name, 'Home')
})
