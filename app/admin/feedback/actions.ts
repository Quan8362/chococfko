'use server'

/*
  Phan hoi gop y tu trang /admin/feedback.
  - Chi admin duoc goi (re-check checkIsAdmin ben trong action — server action co the bi goi doc lap).
  - Gui email cho nguoi gui gop y qua Resend, reply_to = chococfko@gmail.com
    => nguoi gui reply lai se ve thang Gmail cua chu site (khong can inbound mail).
  - Chi khi gui email THANH CONG moi luu phan hoi + chuyen trang thai 'replied'.
*/

import { revalidatePath } from 'next/cache'
import { checkIsAdmin, createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export type ReplyResult =
  | { ok: true }
  | { ok: false; error: 'not_admin' | 'missing_fields' | 'too_long' | 'not_found' | 'no_email' | 'no_api_key' | 'send_failed' | 'db_error' | 'unknown' }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
// Strip control chars but keep tab and newline.
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g

async function sendReplyEmail(payload: {
  toEmail: string
  toName: string
  replyMessage: string
  originalMessage: string
}): Promise<{ sent: boolean; reason?: string }> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn('[admin/feedback] RESEND_API_KEY chưa set — không thể gửi phản hồi.')
    return { sent: false, reason: 'no_api_key' }
  }

  // Gửi từ domain đã verify trên Resend (chococfko.com). KHÔNG dùng onboarding@resend.dev:
  // sender test chỉ gửi được tới chính chủ tài khoản → Resend trả 403 với recipient khác.
  const from = 'Chợ Cóc FKO <noreply@chococfko.com>'
  // reply_to = hộp thư chủ site: người gửi reply lại sẽ về Gmail
  const replyTo = process.env.FEEDBACK_TO_EMAIL || 'chococfko@gmail.com'
  const subject = 'Phản hồi góp ý của bạn · Chợ Cóc FKO'

  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  const text =
    `Chào ${payload.toName},\n\n` +
    `${payload.replyMessage}\n\n` +
    `— Chợ Cóc FKO\n\n` +
    `─────────────\n` +
    `Góp ý ban đầu của bạn:\n${payload.originalMessage}`

  const html =
    `<div style="font-family:system-ui,-apple-system,sans-serif;font-size:14px;line-height:1.7;color:#3a2d22">` +
    `<p>Chào ${esc(payload.toName)},</p>` +
    `<p style="white-space:pre-wrap">${esc(payload.replyMessage)}</p>` +
    `<p style="color:#7a6a5e">— Chợ Cóc FKO</p>` +
    `<hr style="border:none;border-top:1px solid #eee;margin:16px 0"/>` +
    `<p style="font-size:12.5px;color:#9a8a7e;margin-bottom:4px">Góp ý ban đầu của bạn:</p>` +
    `<blockquote style="margin:0;padding:8px 12px;border-left:3px solid #eadfd5;color:#7a6a5e;white-space:pre-wrap">${esc(payload.originalMessage)}</blockquote>` +
    `</div>`

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to: payload.toEmail, reply_to: replyTo, subject, html, text }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error(`[admin/feedback] Resend gửi phản hồi lỗi: HTTP ${res.status} — ${body}`)
      return { sent: false, reason: `http_${res.status}` }
    }
    console.log(`[admin/feedback] Đã gửi phản hồi tới ${payload.toEmail}.`)
    return { sent: true }
  } catch (err) {
    console.error('[admin/feedback] Resend ném lỗi khi gửi phản hồi:', err)
    return { sent: false, reason: 'exception' }
  }
}

export async function replyToFeedback(
  _prev: ReplyResult | null,
  formData: FormData,
): Promise<ReplyResult> {
  if (!(await checkIsAdmin())) {
    return { ok: false, error: 'not_admin' }
  }

  const feedbackId = (formData.get('feedbackId') as string | null)?.trim()
  // Lam sach: bo ky tu dieu khien (giu tab/newline) + gioi han do dai.
  // Body gui qua JSON API cua Resend nen khong co nguy co header injection.
  const replyMessage = (formData.get('reply') as string | null)
    ?.replace(CONTROL_CHARS, '')
    .trim()

  if (!feedbackId || !replyMessage) {
    return { ok: false, error: 'missing_fields' }
  }
  if (replyMessage.length > 5000) {
    return { ok: false, error: 'too_long' }
  }

  const admin = createAdminClient()

  // Lay gop y goc
  const { data: fb, error: fbErr } = await admin
    .from('feedback')
    .select('id, name, email, message')
    .eq('id', feedbackId)
    .single()

  if (fbErr || !fb) {
    console.error('[admin/feedback] Không tìm thấy góp ý:', fbErr?.message)
    return { ok: false, error: 'not_found' }
  }

  const toEmail = (fb.email as string | null)?.trim().toLowerCase()
  if (!toEmail || !EMAIL_RE.test(toEmail)) {
    return { ok: false, error: 'no_email' }
  }

  // Email admin dang dang nhap (de luu "ai da tra loi")
  let adminEmail: string | null = null
  try {
    const supabase = createClient()
    const { data } = await supabase.auth.getUser()
    adminEmail = data.user?.email ?? null
  } catch {
    adminEmail = null
  }

  // 1) GUI EMAIL TRUOC — neu loi thi KHONG luu, KHONG doi trang thai
  const sendRes = await sendReplyEmail({
    toEmail,
    toName: (fb.name as string) || toEmail,
    replyMessage,
    originalMessage: (fb.message as string) || '',
  })
  if (!sendRes.sent) {
    return { ok: false, error: sendRes.reason === 'no_api_key' ? 'no_api_key' : 'send_failed' }
  }

  // 2) LUU phan hoi + chuyen trang thai 'replied'
  try {
    const { error: insErr } = await admin
      .from('feedback_replies')
      .insert({ feedback_id: feedbackId, message: replyMessage, admin_email: adminEmail })
    if (insErr) {
      console.error('[admin/feedback] Lưu phản hồi lỗi (email đã gửi):', insErr.message)
      return { ok: false, error: 'db_error' }
    }

    const { error: updErr } = await admin
      .from('feedback')
      .update({ status: 'replied' })
      .eq('id', feedbackId)
    if (updErr) {
      console.error('[admin/feedback] Cập nhật trạng thái lỗi:', updErr.message)
      // Email da gui + phan hoi da luu — khong coi la loi nghiem trong
    }
  } catch (err) {
    console.error('[admin/feedback] Lưu phản hồi ném lỗi:', err)
    return { ok: false, error: 'db_error' }
  }

  console.log(`[admin/feedback] Phản hồi đã lưu cho góp ý ${feedbackId} bởi ${adminEmail ?? 'admin'}.`)
  revalidatePath('/admin/feedback')
  return { ok: true }
}
