# Poker bots — user disclosure & fairness policy

Bots are a **testing tool first** and, optionally later, a **clearly labeled practice** feature.
They are never a hidden opponent in a competitive human game.

## Disclosure rules (structural)

Enforced in `lib/games/poker/bot/admin.ts`:

- **Always labeled.** `botIdentity(seat, difficulty)` returns an identity whose `isBot: true`
  marker and `labelI18nKey` are **non-optional** — there is no code path that mints an unlabeled
  bot. `assertBotLabeled` guards a seat occupant before it is published. Bots are **never disguised
  as humans.**
- **Never in a human-only / ranked seat.** `isBotAllowedAtTable` denies `ranked` and `human_only`
  table kinds outright — bots may sit only at `practice` / `casual_bot` tables. It is a
  deny-by-default check, not an allow-list omission.
- **Users can avoid bots.** Bot eligibility is a per-table-kind property; human-only tables carry
  no bots by construction, so a player who wants only humans simply plays those.
- **At least one human seat.** A bot-eligible table exposed to players must seat ≥ 1 human; an
  all-bot **practice sandbox** is a separate, non-wallet path.
- **Labels are i18n keys**, never hardcoded strings (respects the repo zero-hardcode rule). The UI
  localizes `games.poker.bot.label` / `games.poker.bot.name` across all five languages when the
  surface is built.

## Statistics & ranking

`BotTableConfig.affectsStats` defaults **false**: results at bot tables are **excluded** from a
player's public statistics and the human leaderboard, so human rankings reflect human play only.
Flipping it on is an explicit, documented admin decision.

## Admin controls (pure config today; server-wired later)

`admin.ts` provides the pure, validated control surface a future admin screen + server will use:

- Enable/disable bots (`enabled`), independent of and **subordinate to** the master `bot` flag.
- Allowed table kinds, **max bots per table** (capped at 5 so a 6-max table keeps a human seat).
- Allowed difficulties + default (`simulation` is rejected for user-facing play).
- Whether bot tables affect stats / use a separate economy.
- **Bot incident log** (`makeBotIncident`) — records fallback / timeout / illegal-action / crash /
  removal events with a stable machine code and a **card-redacted** detail (`redactCards` strips any
  rank+suit token, so a bot crash can never leak private cards into an audit log).
- Safe removal of a bot is an incident kind (`removed`) — the lifecycle/server layer performs the
  actual seat teardown (preserving pot/coin integrity) when wired.

## Rollout gate

The master `bot` flag in `lib/games/poker/flags.ts` remains **hard-off** (`bot: false` regardless
of env) for this release. This phase ships the **pure simulation + policy + config** layer only;
it enables **nothing**. Turning on any user-facing bot table requires (a) explicit approval,
(b) flipping the flag, and (c) the server/DB wiring for bot seats — none of which is done here.
Bots move **no coins** on their own.
