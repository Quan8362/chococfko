#!/usr/bin/env node
/**
 * refresh-storage-cache.ts
 *
 * One-off maintenance: rewrite the `cache-control` metadata on EXISTING
 * Storage objects to 1 year. New uploads already set cacheControl 31536000,
 * but files uploaded earlier still carry the old `max-age=3600`, which forces
 * browsers/CDN to re-fetch hourly → inflates Cached Egress.
 *
 * Supabase JS has no metadata-only update, so each file is downloaded then
 * re-uploaded with upsert + the new cacheControl. File names are unique
 * (timestamp-random), so a long cache is safe.
 *
 * Dry-run (list what would change, no writes):
 *   npx tsx scripts/refresh-storage-cache.ts --dry-run
 *
 * Commit (default buckets: post-images, avatars):
 *   npx tsx scripts/refresh-storage-cache.ts --commit
 *
 * Pick buckets explicitly:
 *   npx tsx scripts/refresh-storage-cache.ts --commit --buckets post-images,avatars,community-chat-images
 *
 * Run from the web/ directory.
 */

import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const ONE_YEAR = '31536000'

// ─── ENV LOADER (reads .env.local without dotenv) ────────────────
function loadEnvLocal(): void {
  const envPath = resolve(process.cwd(), '.env.local')
  if (!existsSync(envPath)) return
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (!m) continue
    const key = m[1].trim()
    const val = m[2].trim().replace(/^['"]|['"]$/g, '')
    if (!process.env[key]) process.env[key] = val
  }
}

// ─── CLI ARGS ────────────────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2)
  const commit = args.includes('--commit')
  const dryRun = !commit || args.includes('--dry-run')
  const bi = args.indexOf('--buckets')
  const buckets =
    bi >= 0 && args[bi + 1]
      ? args[bi + 1].split(',').map((b) => b.trim()).filter(Boolean)
      : ['post-images', 'avatars']
  return { dryRun, buckets }
}

// ─── RECURSIVE LISTING ───────────────────────────────────────────
interface StorageObj { name: string; id: string | null }

async function listAll(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  store: any,
  bucket: string,
  prefix = '',
): Promise<string[]> {
  const out: string[] = []
  const pageSize = 100
  let offset = 0
  for (;;) {
    const { data, error } = await store
      .from(bucket)
      .list(prefix, { limit: pageSize, offset, sortBy: { column: 'name', order: 'asc' } })
    if (error) throw new Error(`list ${bucket}/${prefix}: ${error.message}`)
    const objs = (data ?? []) as StorageObj[]
    for (const o of objs) {
      const path = prefix ? `${prefix}/${o.name}` : o.name
      // A "folder" has id === null in Supabase Storage listings.
      if (o.id === null) {
        out.push(...(await listAll(store, bucket, path)))
      } else {
        out.push(path)
      }
    }
    if (objs.length < pageSize) break
    offset += pageSize
  }
  return out
}

const MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  webp: 'image/webp', gif: 'image/gif', avif: 'image/avif',
}

async function main() {
  loadEnvLocal()
  const { dryRun, buckets } = parseArgs()

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('❌ Thiếu env var: NEXT_PUBLIC_SUPABASE_URL và/hoặc SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } })
  const store = supabase.storage

  console.log(`\n${dryRun ? '🔍 DRY-RUN' : '🚀 COMMIT'} — cacheControl → ${ONE_YEAR}s (1 năm)`)
  console.log(`Buckets: ${buckets.join(', ')}\n`)

  let total = 0
  let updated = 0
  let failed = 0

  for (const bucket of buckets) {
    let paths: string[]
    try {
      paths = await listAll(store, bucket)
    } catch (e) {
      console.error(`⚠️  Bỏ qua bucket "${bucket}": ${(e as Error).message}`)
      continue
    }
    console.log(`📦 ${bucket}: ${paths.length} file`)
    total += paths.length
    if (dryRun) continue

    for (const path of paths) {
      const { data: blob, error: dlErr } = await store.from(bucket).download(path)
      if (dlErr || !blob) {
        console.error(`   ✗ download ${path}: ${dlErr?.message ?? 'no body'}`)
        failed++
        continue
      }
      const ext = path.split('.').pop()?.toLowerCase() ?? ''
      const contentType = MIME[ext] ?? ((blob as Blob).type || 'application/octet-stream')
      const { error: upErr } = await store
        .from(bucket)
        .update(path, blob, { cacheControl: ONE_YEAR, contentType, upsert: true })
      if (upErr) {
        console.error(`   ✗ update ${path}: ${upErr.message}`)
        failed++
      } else {
        updated++
        if (updated % 25 === 0) console.log(`   …${updated} đã cập nhật`)
      }
    }
  }

  console.log(`\n──────────────`)
  if (dryRun) {
    console.log(`Tổng ${total} file sẽ được cập nhật. Chạy lại với --commit để áp dụng.`)
  } else {
    console.log(`✅ Cập nhật: ${updated} | ❌ Lỗi: ${failed} | Tổng: ${total}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
