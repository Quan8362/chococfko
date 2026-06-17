// Backfill posts.place_slug for existing community posts (NON-DESTRUCTIVE).
//
// Links an approved community post to a place ONLY on a confident signal:
//   1. post.map_url exactly equals a place.map_url, OR
//   2. a place's full name (>= 4 chars) appears verbatim in the post title/area, OR
//   3. a place's slug token appears verbatim in the post title/area.
// Ambiguous matches (e.g. several places share the word "Hakata") are skipped
// so we never mislink. Only sets place_slug where currently NULL; never edits
// post content. Run the SQL migration (migration_post_place_link.sql) first.
//
// Usage:
//   node scripts/backfill-post-places.mjs          # dry-run (prints plan)
//   node scripts/backfill-post-places.mjs --apply  # writes place_slug
//
// Reads Supabase creds from web/.env.local (NEXT_PUBLIC_SUPABASE_URL +
// SUPABASE_SERVICE_ROLE_KEY).

import { readFileSync } from 'node:fs'

const APPLY = process.argv.includes('--apply')
const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
const get = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim() || ''
const URL_ = get('NEXT_PUBLIC_SUPABASE_URL')
const KEY = get('SUPABASE_SERVICE_ROLE_KEY')
if (!URL_ || !KEY) { console.error('Missing Supabase env'); process.exit(1) }
const H = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' }

const norm = (s) => (s || '').toLowerCase()

const main = async () => {
  const places = await (await fetch(`${URL_}/rest/v1/places?select=slug,name,area,map_url`, { headers: H })).json()
  // approved posts not yet linked
  const posts = await (await fetch(`${URL_}/rest/v1/posts?select=id,title,area,map_url,place_slug,status&status=eq.approved&order=created_at.desc`, { headers: H })).json()
  if (!Array.isArray(posts)) { console.error('Fetch posts failed:', posts); process.exit(1) }

  const plan = []
  for (const post of posts) {
    if (post.place_slug) continue
    const hay = `${norm(post.title)} | ${norm(post.area)}`
    const matches = new Set()
    for (const pl of places) {
      if (pl.map_url && post.map_url && pl.map_url === post.map_url) matches.add(pl.slug)
      const name = norm(pl.name).split('/')[0].trim()
      if (name.length >= 4 && hay.includes(name)) matches.add(pl.slug)
      if (pl.slug.length >= 4 && hay.includes(pl.slug.replace(/-/g, ' '))) matches.add(pl.slug)
    }
    if (matches.size === 1) plan.push({ id: post.id, title: post.title, slug: [...matches][0] })
    else if (matches.size > 1) console.log(`SKIP ambiguous (${matches.size}) for "${post.title}"`)
  }

  console.log(`\nScanned ${posts.length} approved posts. Confident links: ${plan.length}`)
  plan.forEach((p) => console.log(`  "${p.title}"  ->  ${p.slug}`))

  if (!APPLY) { console.log('\nDry-run. Re-run with --apply to write.'); return }

  let ok = 0
  for (const p of plan) {
    const r = await fetch(`${URL_}/rest/v1/posts?id=eq.${p.id}`, {
      method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify({ place_slug: p.slug }),
    })
    if (r.ok) ok++
    else console.error(`  FAIL ${p.id}: ${r.status} ${await r.text()}`)
  }
  console.log(`\nApplied ${ok}/${plan.length}.`)
}

main().catch((e) => { console.error(e); process.exit(1) })
