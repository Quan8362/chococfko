'use server'

// ── Poker CLOSED BETA server actions — terms acknowledgement ────────────────────
//
// A beta cohort member must accept the beta terms (play-money, data may reset, expect
// bugs) once per terms version before they may sit/create/join. The DB
// (poker_beta_acknowledgements) is the source of truth; the access layer
// (getBetaTermsAck / checkPokerCapability) reads it to gate coin-committing actions.
//
// Degrade-safe: if the migration is not yet applied the insert fails with a
// missing-relation error and we return a coded result the UI translates. No coins move.

import { headers } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getPokerAccess } from './access'
import { BETA_TERMS_VERSION } from '@/lib/games/poker/beta'

export type AckBetaTermsResult =
  | { ok: true; version: number }
  | { ok: false; error: 'not_authenticated' | 'not_beta' | 'unavailable' | 'db_error' }

// Record the current viewer's acceptance of the current terms version. Idempotent:
// the table's UNIQUE(user_id, terms_version) makes a repeat acknowledgement a no-op
// (we upsert with ignoreDuplicates), so a double-click never creates duplicate rows.
export async function acknowledgePokerBetaTerms(localeHint?: string): Promise<AckBetaTermsResult> {
  const acc = await getPokerAccess()
  // Only meaningful while the closed-beta stage is the active gate and the viewer is a
  // cohort member (admins bypass the terms gate entirely). Fail closed otherwise.
  if (!acc.isBeta || !acc.isBetaMember) return { ok: false, error: 'not_beta' }

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'not_authenticated' }

  const locale =
    (typeof localeHint === 'string' && localeHint.trim().slice(0, 12)) ||
    headers().get('x-locale') ||
    null

  try {
    const admin = createAdminClient()
    const { error } = await admin
      .from('poker_beta_acknowledgements')
      .upsert(
        {
          user_id: user.id,
          terms_version: BETA_TERMS_VERSION,
          cohort: acc.betaCohort,
          acknowledged_locale: locale,
        },
        { onConflict: 'user_id,terms_version', ignoreDuplicates: true },
      )
    if (error) {
      if ((error as { code?: string }).code === '42P01') {
        console.warn('[poker-beta] poker_beta_acknowledgements missing — apply migration_poker_beta.sql')
        return { ok: false, error: 'unavailable' }
      }
      console.error('[poker-beta] ack insert failed:', error.message)
      return { ok: false, error: 'db_error' }
    }
    return { ok: true, version: BETA_TERMS_VERSION }
  } catch (err) {
    console.error('[poker-beta] ack threw:', err)
    return { ok: false, error: 'db_error' }
  }
}
