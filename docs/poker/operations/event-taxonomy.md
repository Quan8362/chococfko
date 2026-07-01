# Poker Event Taxonomy (versioned)

Source of truth: [`lib/games/poker/telemetry.ts`](../../../lib/games/poker/telemetry.ts).
Schema version: **`TELEMETRY_SCHEMA_VERSION`** (currently `1`). Bump when the catalog or record
shape changes in a way consumers must notice.

43 events across 7 domains. Every event has a default severity and either maps to a durable
`poker_ops_events` kind (**persisted**) or is **log-only** (captured in Vercel runtime logs and
counted from the authoritative game tables).

## Domains & events

### `table`
| Event | Default severity | Persisted as |
|---|---|---|
| `table_created` | info | log-only |
| `table_joined` | info | log-only |
| `table_left` | info | log-only |
| `table_closing` | info | log-only |
| `table_closed` | info | log-only |
| `table_paused` | info | log-only |
| `table_resumed` | info | log-only |

### `seat`
| Event | Default severity | Persisted as |
|---|---|---|
| `seat_reserved` | info | log-only |
| `seat_occupied` | info | log-only |
| `seat_released` | info | log-only |
| `player_sit_out` | info | log-only |
| `player_returned` | info | log-only |
| `player_disconnected` | warn | log-only |
| `player_reconnected` | info | log-only |

### `hand`
| Event | Default severity | Persisted as |
|---|---|---|
| `hand_started` | info | log-only |
| `blind_posted` | info | log-only |
| `street_started` | info | log-only |
| `hand_completed` | info | log-only |
| `hand_cancelled` | warn | log-only |
| `hand_frozen` | error | `frozen_hand` |

### `action`
| Event | Default severity | Persisted as |
|---|---|---|
| `action_requested` | info | log-only |
| `action_accepted` | info | log-only |
| `action_rejected` | warn | `failed_action` |
| `action_duplicate` | info | `duplicate_action` |
| `action_stale` | warn | `stale_state` |
| `timeout_applied` | warn | `failed_action` |

### `realtime`
| Event | Default severity | Persisted as |
|---|---|---|
| `realtime_connected` | info | log-only |
| `realtime_disconnected` | warn | `realtime_subscription_error` |
| `sequence_gap` | warn | `sequence_gap` |
| `snapshot_requested` | info | log-only |
| `snapshot_recovered` | info | log-only |
| `reconnect_failed` | error | `reconnect_failure` |

### `coin`
| Event | Default severity | Persisted as |
|---|---|---|
| `buy_in_completed` | info | log-only |
| `top_up_pending` | warn | log-only |
| `top_up_activated` | info | log-only |
| `pot_settled` | info | log-only |
| `refund_applied` | info | log-only |
| `cash_out_completed` | info | log-only |
| `coin_invariant_failed` | **critical** | `coin_conservation_failure` |

### `security`
| Event | Default severity | Persisted as |
|---|---|---|
| `private_data_access_denied` | **critical** | log-only |
| `rls_sensitive_denial` | warn | log-only (existing `rls_denial` kind available) |
| `unauthorized_admin_command` | error | log-only |
| `invalid_private_table_access` | error | log-only |

> The durable `poker_ops_events` CHECK constraint also knows `settlement_failure`,
> `transaction_retry`, `long_running_hand`, `abandoned_table`, and `rls_denial`, which are emitted
> directly by the server/reaper paths (not 1:1 with a taxonomy event). `opsKindForEvent()` returns
> `null` for log-only events so the emitter never attempts an out-of-taxonomy insert.

## Record shape

`buildTelemetryRecord(...)` produces:

```jsonc
{
  "schema": 1,
  "ts": "2026-07-01T00:00:00.000Z",
  "domain": "action",
  "event": "action_rejected",
  "severity": "warn",
  "code": "PKR_ACTION_ILLEGAL",        // stable error code, not free text
  "correlation": { "tableId": "…", "handId": "…", "stateVersion": 5, "actionSeq": 9,
                   "buildVersion": "…", "region": "…" },
  "detail": { "reason": "not_your_turn" },  // already redacted
  "persisted": true
}
```

## Stable error codes

Prefer these over free-text messages (full list in `POKER_ERROR_CODES`):

`PKR_ACTION_STALE`, `PKR_ACTION_DUPLICATE`, `PKR_ACTION_ILLEGAL`, `PKR_ACTION_NOT_TURN`,
`PKR_ACTION_TIMEOUT`, `PKR_SEQUENCE_GAP`, `PKR_RECONNECT_FAILED`, `PKR_SNAPSHOT_FAILED`,
`PKR_HAND_FROZEN`, `PKR_SETTLEMENT_FAILED`, `PKR_COIN_NOT_CONSERVED`, `PKR_POT_MISMATCH`,
`PKR_NEGATIVE_BALANCE`, `PKR_DUPLICATE_SETTLEMENT`, `PKR_RLS_DENIED`, `PKR_UNAUTHORIZED_ADMIN`,
`PKR_PRIVATE_LEAK_GUARD`, `PKR_UNKNOWN`.

## Emitting

```ts
import { emitPokerTelemetry } from '@/lib/games/poker/telemetryServer'

await emitPokerTelemetry(
  { event: 'action_rejected', code: 'PKR_ACTION_ILLEGAL',
    correlation: { tableId, handId, stateVersion, actionSeq }, detail: { reason } },
  recordOpsRow,   // optional: persists a durable ops row when the event maps to an ops kind
)
```

The existing `recordOpsEvent` in `app/games/poker/actions.ts` already emits a `[poker-telemetry]`
line for every durable ops event, so failure signals are correlated in Vercel logs today.
