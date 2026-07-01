// ── Poker telemetry — SERVER emitter (thin, side-effecting glue over the pure builder) ───────
//
// This is the ONE place that turns a pure TelemetryRecord (telemetry.ts) into observable output:
//   1. a single structured JSON log line on the server console — Vercel captures it as a runtime
//      log, greppable by `[poker-telemetry]`, correlatable by request/table/hand id and build id;
//   2. (optionally) a durable poker_ops_events row via the caller-supplied recorder, but ONLY for
//      events that map onto the ops_events taxonomy (isPersistedEvent) — lifecycle/usage events are
//      log-only, so no DB schema change is required.
//
// It NEVER throws (a monitoring write must never break gameplay) and NEVER logs secrets/cards/PII —
// the record it receives is already redacted by buildTelemetryRecord. Not marked 'use server': it
// is a plain server-only helper imported by server actions / route handlers.

import {
  buildTelemetryRecord,
  formatTelemetryLine,
  opsKindForEvent,
  type TelemetryInput,
  type TelemetryRecord,
} from './telemetry.ts'

/** A recorder that persists a durable ops_events row. Matches the existing recordOpsEvent shape. */
export type OpsEventRecorder = (
  kind: string,
  severity: string | null,
  tableId: string | null,
  handId: string | null,
  detail: Record<string, unknown>,
) => Promise<void>

const BUILD_VERSION = process.env.NEXT_PUBLIC_BUILD_ID ?? process.env.VERCEL_GIT_COMMIT_SHA ?? null
const REGION = process.env.VERCEL_REGION ?? null

/**
 * Build + emit a telemetry record. Logs a structured line always; persists an ops_events row when
 * the event maps to the ops taxonomy AND a recorder is supplied. Returns the record for callers
 * that want to react (e.g. open an incident on a critical event).
 */
export async function emitPokerTelemetry(
  input: TelemetryInput,
  persist?: OpsEventRecorder,
): Promise<TelemetryRecord> {
  // Enrich correlation with server-side build/region unless the caller already set them.
  const rec = buildTelemetryRecord({
    ...input,
    correlation: {
      buildVersion: BUILD_VERSION,
      region: REGION,
      ...(input.correlation ?? {}),
    },
  })

  try {
    // eslint-disable-next-line no-console
    if (rec.severity === 'critical' || rec.severity === 'error') console.error(formatTelemetryLine(rec))
    else console.log(formatTelemetryLine(rec))
  } catch { /* logging is best-effort */ }

  if (persist) {
    const kind = opsKindForEvent(rec.event)
    if (kind) {
      try {
        await persist(kind, rec.severity === 'debug' ? 'info' : rec.severity, rec.correlation.tableId as string ?? null, rec.correlation.handId as string ?? null, { ...rec.detail, code: rec.code ?? undefined, event: rec.event })
      } catch { /* persistence is best-effort */ }
    }
  }

  return rec
}
