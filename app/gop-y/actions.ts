'use server'

/*
  Supabase SQL — chạy 1 lần trong Dashboard > SQL Editor:

  create table if not exists feedback (
    id          uuid primary key default gen_random_uuid(),
    name        text not null,
    email       text not null,
    message     text not null,
    created_at  timestamptz not null default now()
  );

  -- Cho phép insert mà không cần đăng nhập (public form)
  alter table feedback enable row level security;
  create policy "Anyone can insert feedback"
    on feedback for insert to anon, authenticated
    with check (true);

  -- Chỉ admin mới đọc được
  create policy "Admins can read feedback"
    on feedback for select to authenticated
    using (auth.email() = any(string_to_array(current_setting('app.admin_emails', true), ',')));
*/

import { createClient } from '@/lib/supabase/server'

export type FeedbackResult =
  | { ok: true }
  | { ok: false; error: string }

export async function submitFeedback(
  _prev: FeedbackResult | null,
  formData: FormData,
): Promise<FeedbackResult> {
  const name    = (formData.get('name')    as string | null)?.trim()
  const email   = (formData.get('email')   as string | null)?.trim().toLowerCase()
  const message = (formData.get('message') as string | null)?.trim()

  if (!name || !email || !message) {
    return { ok: false, error: 'missing_fields' }
  }
  if (name.length > 120 || email.length > 254 || message.length > 5000) {
    return { ok: false, error: 'too_long' }
  }

  try {
    const supabase = createClient()
    const { error } = await supabase
      .from('feedback')
      .insert({ name, email, message })

    if (error) {
      console.error('[feedback] Supabase error:', error.message)
      return { ok: false, error: 'db_error' }
    }

    return { ok: true }
  } catch (err) {
    console.error('[feedback] Unexpected error:', err)
    return { ok: false, error: 'unknown' }
  }
}
