'use server'

/*
  Bảng `feedback` được tạo bởi web/supabase/migration_feedback.sql.
  Chạy file đó 1 lần trong Supabase Dashboard > SQL Editor trước khi dùng.

  Luồng:
  1. Lưu DB TRƯỚC (service-role client, bypass RLS) — đây là nguồn sự thật.
  2. Gửi email thông báo qua Resend SAU, best-effort. Email lỗi KHÔNG làm mất góp ý.
  3. Chỉ trả ok:true khi lưu DB thành công.
*/

import { headers } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export type FeedbackType = 'general' | 'feature' | 'bug'

export type FeedbackResult =
  | { ok: true }
  | { ok: false; error: 'missing_fields' | 'too_long' | 'invalid_email' | 'rate_limited' | 'db_error' | 'unknown' }

const VALID_TYPES: FeedbackType[] = ['general', 'feature', 'bug']

// Nhãn tiếng Việt cho tiêu đề email (gửi cho chủ site — không phải text UI nên không cần i18n)
const TYPE_LABELS: Record<FeedbackType, string> = {
  general: 'Góp ý chung',
  feature: 'Gợi ý tính năng',
  bug: 'Báo lỗi',
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// ── Rate limit đơn giản theo IP (in-memory, best-effort chống spam) ───────────
const RATE_LIMIT_MAX = 3            // tối đa 3 lần
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000  // trong 5 phút
const rateBuckets = new Map<string, number[]>()

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const hits = (rateBuckets.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS)
  if (hits.length >= RATE_LIMIT_MAX) {
    rateBuckets.set(ip, hits)
    return true
  }
  hits.push(now)
  rateBuckets.set(ip, hits)
  return false
}

async function sendFeedbackEmail(payload: {
  name: string
  email: string
  message: string
  type: FeedbackType
  userId: string | null
}): Promise<{ sent: boolean; reason?: string }> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn('[feedback] RESEND_API_KEY chưa được set — bỏ qua gửi email (góp ý vẫn đã lưu DB).')
    return { sent: false, reason: 'no_api_key' }
  }

  const to = process.env.FEEDBACK_TO_EMAIL || 'chococfko@gmail.com'
  // Gửi từ domain đã verify trên Resend (chococfko.com). KHÔNG dùng onboarding@resend.dev:
  // sender test chỉ gửi được tới chính chủ tài khoản → Resend trả 403 với recipient khác.
  const from = 'Chợ Cóc FKO <noreply@chococfko.com>'
  const typeLabel = TYPE_LABELS[payload.type]
  const subject = `[${typeLabel}] Góp ý từ chococfko.com`

  const text =
    `Loại: ${typeLabel}\n` +
    `Tên: ${payload.name}\n` +
    `Email: ${payload.email}\n` +
    `User ID: ${payload.userId ?? '(khách / chưa đăng nhập)'}\n` +
    `Thời gian: ${new Date().toISOString()}\n\n` +
    `Nội dung:\n${payload.message}`

  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const html =
    `<div style="font-family:system-ui,sans-serif;font-size:14px;line-height:1.6;color:#3a2d22">` +
    `<p><b>Loại:</b> ${esc(typeLabel)}</p>` +
    `<p><b>Tên:</b> ${esc(payload.name)}</p>` +
    `<p><b>Email:</b> ${esc(payload.email)}</p>` +
    `<p><b>User ID:</b> ${esc(payload.userId ?? '(khách / chưa đăng nhập)')}</p>` +
    `<hr style="border:none;border-top:1px solid #eee;margin:12px 0"/>` +
    `<p style="white-space:pre-wrap">${esc(payload.message)}</p>` +
    `</div>`

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to, reply_to: payload.email, subject, html, text }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error(`[feedback] Resend gửi lỗi: HTTP ${res.status} — ${body}`)
      return { sent: false, reason: `http_${res.status}` }
    }
    console.log(`[feedback] Email thông báo đã gửi tới ${to} (loại: ${payload.type}).`)
    return { sent: true }
  } catch (err) {
    console.error('[feedback] Resend ném lỗi:', err)
    return { sent: false, reason: 'exception' }
  }
}

export async function submitFeedback(
  _prev: FeedbackResult | null,
  formData: FormData,
): Promise<FeedbackResult> {
  // Honeypot — bot thường điền mọi field. Field này ẩn khỏi người dùng thật.
  const honeypot = (formData.get('company') as string | null)?.trim()
  if (honeypot) {
    console.warn('[feedback] Honeypot dính — bỏ qua submit (giả như thành công).')
    return { ok: true }
  }

  const name    = (formData.get('name')    as string | null)?.trim()
  const email   = (formData.get('email')   as string | null)?.trim().toLowerCase()
  const message = (formData.get('message') as string | null)?.trim()
  const rawType = (formData.get('type')    as string | null)?.trim()
  const type: FeedbackType = VALID_TYPES.includes(rawType as FeedbackType)
    ? (rawType as FeedbackType)
    : 'general'

  if (!name || !email || !message) {
    return { ok: false, error: 'missing_fields' }
  }
  if (!EMAIL_RE.test(email)) {
    return { ok: false, error: 'invalid_email' }
  }
  if (name.length > 120 || email.length > 254 || message.length > 2000) {
    return { ok: false, error: 'too_long' }
  }

  // Rate limit theo IP
  const ip =
    headers().get('x-forwarded-for')?.split(',')[0]?.trim() ||
    headers().get('x-real-ip') ||
    'unknown'
  if (isRateLimited(ip)) {
    console.warn(`[feedback] Rate limit chặn IP ${ip}.`)
    return { ok: false, error: 'rate_limited' }
  }

  // Lấy user id nếu đã đăng nhập (best-effort)
  let userId: string | null = null
  try {
    const supabase = createClient()
    const { data } = await supabase.auth.getUser()
    userId = data.user?.id ?? null
  } catch {
    userId = null
  }

  // 1) LƯU DB TRƯỚC — nguồn sự thật
  try {
    const admin = createAdminClient()
    const { error } = await admin
      .from('feedback')
      .insert({ name, email, message, type, user_id: userId })

    if (error) {
      console.error('[feedback] Lưu DB lỗi:', error.message)
      return { ok: false, error: 'db_error' }
    }
  } catch (err) {
    console.error('[feedback] Lưu DB ném lỗi:', err)
    return { ok: false, error: 'db_error' }
  }

  console.log(`[feedback] Đã lưu góp ý (loại: ${type}, user: ${userId ?? 'khách'}).`)

  // 2) GỬI EMAIL SAU — best-effort, lỗi không làm mất góp ý
  await sendFeedbackEmail({ name, email, message, type, userId })

  return { ok: true }
}
