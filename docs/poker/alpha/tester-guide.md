# Poker Alpha — Tester Guide

Welcome, and thank you for helping test Chợ Cóc FKO Poker. This is a **pre-release Alpha**:
expect rough edges. Everything uses **play-money "xu"** — there is no real money and nothing
you can win or lose has cash value.

You will see an amber **ALPHA · Test build · Play-money** badge on every poker screen. If you
don't see it, you may be looking at the wrong environment — tell the Alpha lead.

---

## 1. Getting in

1. Sign in with the **Google account** you gave the Alpha lead (that exact email must be on
   the tester allowlist — nothing else grants access).
2. Open the poker section from the games hub. If you get a "not found" page, your account is
   not on the allowlist yet — contact the Alpha lead.
3. You'll land on the poker lobby. Create a table or join an open one.

Do **not** share the Alpha link or your access with anyone. The allowlist is per-person.

---

## 2. What we need from you

Play real hands, on the devices and networks you normally use, and **report anything that
looks wrong** — even small things. We especially want:

- Anything about **pots / side pots / who won / how much** that looks incorrect.
- Any moment your **stack changes in a way you don't understand**.
- Any time the table **freezes, desyncs, or shows different things** than another player.
- Anything that happens around **disconnect / reconnect / switching networks**.
- **Landscape** layout problems on phones (controls overlapping, cut off, hard to tap).
- Anything **confusing** — if you weren't sure what "raise to" meant, that's a finding.

Follow the scripts in [test-scenarios.md](./test-scenarios.md) when you can, but off-script
findings are just as valuable.

---

## 3. How to report a problem (in-game)

There is a **🐞 Report a problem** button on:

- the **poker table** (bottom-right, always visible — including on the reconnect/offline screen),
- the **poker lobby** (bottom-right),
- the **hand history** page (top-right).

Tap it, then:

1. **What happened** — describe the problem (required).
2. **Expected result** — what you thought should happen.
3. **Actual result** — what actually happened.
4. **Severity** — your best guess (see [issue-severity-guide.md](./issue-severity-guide.md)).
5. **Screenshot** — optional; paste an image link if you have one hosted somewhere.
6. **Contact me** — tick this if we may message you for follow-up.

The report **automatically attaches** safe technical context so we can investigate: table ID,
hand ID, your seat, the street, state version, build version, browser, OS, viewport size,
orientation, locale, connection state, reconnect count, and any error code on screen.

**We never attach** your hole cards, other players' cards, the deck order, or any login
credentials. You do not need to include those, and you should not paste them into the text.

---

## 4. Writing a good report

A great report lets us reproduce the problem without you present:

- **One problem per report.** File separate reports for separate issues.
- **Say what you did**, step by step, right before it happened.
- **Quote the numbers** you saw: "pot said 1,200 but I was paid 900".
- If it's about a specific hand, file the report **from that table/hand** so the hand ID is
  attached automatically.
- For layout bugs, note your **device + orientation** ("iPhone 13, landscape").

---

## 5. Tips

- Play in **landscape** on phones — the table is designed for it (you'll see a rotate hint in
  portrait).
- If you get disconnected, **wait a few seconds** — the table tries to reconnect and resync
  automatically. If your stack or the hand looks wrong after reconnecting, report it.
- Running low on xu? Use **top-up / rebuy** at the table (still play-money).
- If the whole lobby says joining is paused, we're **winding down** a session — running tables
  will finish normally.

---

## 6. What happens to your report

It's saved immediately and shows up on the internal Alpha dashboard, bucketed by severity,
device, browser, and game phase. The Alpha lead triages it. If you ticked "contact me" we may
reach out for more detail.

Thank you — every report makes the launch better.
