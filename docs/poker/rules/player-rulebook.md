# Chợ Cóc FKO Poker — Player Rulebook

**Game:** No-Limit Texas Hold'em · Play-money "xu" only.
**Audience:** Players. This is the plain-language rulebook. The precise, testable version lives in [engine-rule-specification](engine-rule-specification.md); where this document is informal, the engine spec governs.

> **Play money only.** "Xu" coins have **zero monetary value**. They cannot be bought, sold, traded, or converted to real money. There is **no real-money gambling** anywhere in Chợ Cóc FKO Poker.

This rulebook is presented to players in **five languages**: Tiếng Việt, English, 日本語, 한국어, 中文. All player-facing strings are i18n keys (no hardcoded text), per the project's zero-hardcode rule.

---

## 1. The goal

Make the **best five-card poker hand**, or get everyone else to fold. You're dealt **2 private cards** ("hole cards") that only you can see. Five **community cards** are dealt face-up in the middle. You make your best five-card hand from any combination of your 2 cards and the 5 community cards — you can use both, one, or neither of your cards.

---

## 2. Table & seats

- Tables seat **2 to 6 players**.
- **Public tables** are open to anyone. **Private tables** require a password to join.
- Each table has a fixed **big blind (BB)** stake. You buy in with coins from your wallet:
  - **Minimum buy-in: 40 big blinds.**
  - **Maximum buy-in: 100 big blinds.**
- Your **stack** is the coins you have at the table. When you leave, your remaining stack returns to your wallet.
- **Spectators** can watch a table but **never** see anyone's private cards.

To sit down you need at least the minimum entry balance in your wallet. Coins are play-money and you receive a starting grant and a daily top-up when you run low (see your wallet).

---

## 3. The blinds & the button

- A **dealer button** marks the nominal dealer. It moves one seat clockwise after each hand.
- The two players left of the button post forced bets called **blinds**: the **small blind** (half the BB) and the **big blind**.
- **Heads-up (2 players):** the player **on the button posts the small blind** and acts first before the flop.

New to the table? You either **wait for the big blind** to reach you naturally (free), or choose **"Post Big Blind Now"** to be dealt in immediately by posting the big blind.

---

## 4. How a hand plays — the four betting rounds

1. **Pre-flop** — everyone has 2 hole cards. Betting starts left of the big blind.
2. **Flop** — 3 community cards are dealt. New betting round.
3. **Turn** — a 4th community card. New betting round.
4. **River** — a 5th community card. Final betting round.

If two or more players remain after the river, there's a **showdown**: hands are revealed and the best hand wins. If everyone folds to one player at any point, that player wins immediately **without showing their cards**.

---

## 5. Your options when it's your turn

| Action | When you can do it | What it means |
| --- | --- | --- |
| **Check** | Only when no one has bet | Pass the action without betting |
| **Bet** | When no one has bet yet this round | Put coins in; minimum bet is one big blind |
| **Call** | When someone has bet | Match the current bet |
| **Raise** | When someone has bet | Increase the bet (minimum raise = the size of the last bet/raise) |
| **Fold** | Any time you face a bet | Give up your cards and the hand |
| **All-in** | Any time | Put your entire stack in |

**No-Limit** means you can bet **any amount up to your entire stack** at any time.

If you don't have enough to make a full call or raise, you can still go **all-in** for what you have. You can only win the portion of the pot you contributed to (see side-pots below).

---

## 6. Hand rankings (strongest to weakest)

1. **Straight flush** — five in a row, same suit (`A-K-Q-J-T` is a royal flush)
2. **Four of a kind** — four cards of the same rank
3. **Full house** — three of a kind + a pair
4. **Flush** — five cards of the same suit
5. **Straight** — five in a row, any suits (`A-2-3-4-5` is the lowest; `T-J-Q-K-A` the highest)
6. **Three of a kind**
7. **Two pair**
8. **One pair**
9. **High card**

Ties are broken by the next-highest cards ("kickers"). **Suits never break a tie** — if two hands are truly identical, they **split the pot**. Note: `A-2-3-4-5` ("the wheel") is a straight, but `Q-K-A-2-3` is **not** — straights don't wrap around the ace.

---

## 7. Pots & split pots

- All the coins bet during a hand form the **pot**. The winner takes it.
- If players go all-in for different amounts, the pot splits into a **main pot** and one or more **side-pots**. You're only eligible for the pots you put coins into.
- If two players tie, the pot is **split evenly**. If it doesn't divide evenly, the leftover odd coin goes to the player closest to the left of the button.
- If you bet and everyone folds, any amount no one matched is **returned to you** (uncalled bet).

---

## 8. The clock

- You get **20 seconds** to act, plus a **15-second time bank** for tough decisions.
- If your time runs out:
  - You're **checked** automatically if checking is free.
  - You're **folded** automatically if you're facing a bet.
- **Three time-outs in a row** and you're automatically **sat out** (dealt out until you come back).

---

## 9. Joining, leaving, sitting out

- **Sit out:** skip hands without leaving your seat. Come back anytime.
- **Top-up:** add coins to your stack — the new amount is active **from the next hand**, not the current one.
- **Leave:** if you ask to leave during a hand, you stay in until that hand is settled, then your stack returns to your wallet.
- **Disconnect:** if you drop, your current hand keeps its clock. Reconnect quickly and you resume your seat. If you time out repeatedly you'll be sat out, and the table's safety system protects the coins in play.
- **Bust:** if your stack hits zero you can rebuy (within the buy-in limits) or stand up.

---

## 10. What this game does NOT have (v1)

To keep things simple and fair, the first release has **no**: rake (the house takes nothing), antes, straddles, tournaments, bots, run-it-twice, all-in insurance, rabbit hunting, bomb pots, or multi-board play.

---

## 11. Orientation

Poker is played in **landscape**. On a phone, please **rotate your device** to landscape — a polished "rotate" screen appears in portrait. The table is designed for desktop, tablet, and mobile landscape.

---

## 12. Fair play

Every card, bet, pot, and winner is decided by the **server**, never your browser. Your private cards are **never** sent to anyone else's device — not opponents, not spectators. The deck is shuffled secretly on the server, and every hand is recorded so results can be verified. Animations are just for show; they never change the real result.

Have fun, and remember — it's only xu. 🎴
