import 'server-only'

// ── Poker SEV-1 active notifier (server guard) ──────────────────────────────────────────────────
//
// The server-only entry point for SEV-1 alerting. It re-exports the delivery logic from
// incidentNotifierCore.ts and adds the `server-only` guard so a Client Component that accidentally
// imports it fails the build instead of shipping the Resend call / recipient env to the browser.
// (The RESEND_API_KEY / ADMIN_EMAILS env are non-NEXT_PUBLIC and never inlined client-side anyway;
// this is defense-in-depth, matching the notifications/send.ts convention.)
//
// ALL server callers (server actions, route handlers) import from HERE. Unit tests import the core.

export {
  emitSev1,
  sendSev1HealthCheck,
  sev1AlertRecipients,
  buildSev1EmailText,
  buildSev1EmailSubject,
  type EmitSev1Input,
  type EmitSev1Result,
} from './incidentNotifierCore.ts'
