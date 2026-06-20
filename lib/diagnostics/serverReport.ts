// Shared server-side structured diagnostics for result-writing operations
// (game moves, finalization, RPC calls). Logs one greppable JSON line that Vercel
// captures as a runtime log, and returns an incident id the caller can surface so
// a failed write is never silently treated as success.
//
// Security: never pass tokens, emails, chat content, or board contents here.

export type ServerErrorContext = {
  op: string
  roomCode?: string | null
  roomId?: string | null
  status?: string | null
  endReason?: string | null
  channelStatus?: string | null
}

export function genServerIncidentId(prefix = 'SRV'): string {
  const ts = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 8)
  return `${prefix}-${ts}-${rand}`.toUpperCase()
}

export function logServerResultError(ctx: ServerErrorContext, err: unknown, prefix = 'SRV'): string {
  const incidentId = genServerIncidentId(prefix)
  // eslint-disable-next-line no-console
  console.error('[result-error]', JSON.stringify({
    incidentId,
    op: ctx.op,
    roomCode: ctx.roomCode ?? null,
    roomId: ctx.roomId ?? null,
    status: ctx.status ?? null,
    endReason: ctx.endReason ?? null,
    channelStatus: ctx.channelStatus ?? null,
    buildId: process.env.NEXT_PUBLIC_BUILD_ID ?? null,
    name: err instanceof Error ? err.name : 'Error',
    message: err instanceof Error ? err.message : String(err),
    timestamp: new Date().toISOString(),
  }))
  return incidentId
}
