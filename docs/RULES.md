# KaliTiri rules specification — 0.1.0

Status key: **VERIFIED** = source expressly describes it; **DECISION** = our implementation default where sources are silent/conflicting; **OPTIONAL** = configuration / house-rule; **OPEN** = not standardized or deliberately deferred.

## Sources and interpretation

1. [KaliTiri official-style four-player overview](https://www.kalitiri.com/) — 52-card 4-player game, bids start at 125 and rise by 5, highest bidder names PowerHouse (trump) and a partner card, bidder leads, partner disclosed on playing card. The example is contract 160, bid-team captured 155, defenders captured 95, defenders win.
2. [Kali Teeri six-player rules](https://www.kaliteeri.com/rules/kali-teeri) and [FAQ](https://www.kaliteeri.com/faq) — six players; all 2s removed; 48 cards; 8 each; 130 +10 bidding ladder; bidder calls two partner cards; normal 3♠ low; optional No Trump and Duggi; 250 points; bid and full-sweep awards described.
3. [KaliTeeri Android listing](https://play.google.com/store/apps/details?id=com.kaliteeri.app) — scoring example: +bid on success, -bid on failure in an app description. [iOS app listing](https://apps.apple.com/ca/app/kaliteeri-card-game/id6771663607) also reports later revision in which defending teams earn their points and scores do not become negative. These differ; they are **not** the same source as #1.
4. [Alternative four-player guide](https://lovecardgames.com/blog/how-to-play-kaali-teeri) — explicitly describes an unbeatable 3♠ and different starting bid; conflicts with #2's ordinary low 3♠. We support the unbeatable version only as a house option, not silently.

## 1. Table and deck

| Parameter | Four-player preset | Six-player preset | Status |
|---|---:|---:|---|
| Players | 4 | 6 | VERIFIED |
| Deck | 52, no jokers | 48, remove all four twos | VERIFIED |
| Cards per seat | 13 | 8 | VERIFIED |
| Tricks per hand | 13 | 8 | VERIFIED |
| Partner card calls | 1 | 2 | VERIFIED |
| Expected team split | 2 vs 2 | usually 3 vs 3 | VERIFIED / qualified |

One dealer rotates clockwise at end of each hand (**DECISION**). Dealing starts with seat left of dealer, then proceeds clockwise until all cards dealt (**DECISION**; ordinary clockwise convention). Seat IDs are numeric `0 .. players-1` and clockwise order is increasing modulo player count.

### Cards and card points

- `S:3` (3♠) = 30.
- 10/J/Q/K/A in any suit = 10 each (20 cards, 200 total).
- Each 5 = 5 (four cards, 20 total).
- Everything else = 0.
- There are exactly **250 points** in either deck. (**VERIFIED**)

A card's **point value** is different from its **power in a trick**. By default 3♠ has ordinary rank 3. In the six-player deck it is the lowest spade; in the four-player deck the 2♠ is even lower. (**VERIFIED** for normal six-player ranking; **DECISION** for default four-player ranking.)

## 2. Auction

- Four-player ladder: 125, 130, 135, ... 250 (**VERIFIED** from source #1).
- Six-player ladder: 130, 140, 150, ... 250 (**VERIFIED** from source #2).
- Auction begins with seat left of dealer (**DECISION**).
- First seat must open with a valid bid rather than pass (**VERIFIED** six-player FAQ, **DECISION** four-player).
- A bid must exceed prior high bid and lie on the preset ladder; bids may jump multiple steps (**DECISION**).
- Any later player may pass, permanently leaving that auction (**VERIFIED** six-player; **DECISION** four-player).
- Once everyone except the current top bidder has passed, that player wins auction. A 250 bid ends auction immediately (**DECISION**).
- The winner is `bidder`, and `bid` is the contract target, expressed in *card points*, not tricks.

## 3. Trump and calling partners

- Bidder announces trump suit C/D/H/S (**VERIFIED**).
- Six-player preset additionally supports `NT` (No Trump) and `DUGGI` (**VERIFIED**). Four-player defaults to standard suit trump only; `specialTrumps:true` enables them as an **OPTIONAL** house setting.
- Bidder names exactly one (four-player) or two (six-player) specific, distinct cards (**VERIFIED**).
- Bidder may not call cards they hold (**VERIFIED** six-player, **DECISION** four-player).
- Whoever *originally held* any named card joins bidder's team (**VERIFIED**); identity remains hidden until that card is actually played. The public call itself (card ID) is shown to all.
- **OPEN / configurable:** two called cards may be held by one player. Default allows this, yielding a 2-v-4 alliance in six-player mode. To mandate 3-v-3, set `allowSamePlayerForBothCalls:false`; the server can verify while keeping holders hidden. Do not pretend two distinct named cards always imply two distinct partners.
- **DECISION:** bidder leads the first trick. Four-player source #1 confirms; six-player rules are silent about initial leader. `firstLead:'left-of-dealer'` is configurable.

## 4. Trick play

- Starting from leader, each seat plays exactly one card clockwise (**DECISION** on clockwise direction).
- Must follow the suit of the first card if holding that suit (**VERIFIED**).
- Otherwise any card may be played; playing trump is not mandatory (**VERIFIED**).
- With suit trump: highest trump in the trick wins; otherwise highest card of lead suit wins (**VERIFIED**).
- `NT`: highest card in led suit wins, irrespective of non-leading suits (**VERIFIED**).
- `DUGGI`: no trump; **lowest numeric rank in the led suit wins** (3 high through Ace low for six-player preset); point values remain unchanged (**VERIFIED**).
- By default normal rank is Ace=14 ... 2=2. **OPTIONAL:** `blackThree:'highest-card'` makes 3♠ unbeatable anywhere it is played, matching one four-player regional guide but **not** the six-player FAQ.
- Trick winner captures all cards' point values and leads next trick. Every trick is retained as public audit data.
- A called partner is publicly revealed **at the moment their named card is played**, not when the hand ends (**VERIFIED**).
- **OPEN:** Four-player site's phrase about playing a partner card "when it's the highest in the hand" is ambiguous; the engine does **not** force a called card to be played on that basis. That would require a more precise rule.

## 5. End-of-hand outcome vs cumulative scoreboard

After 13 or eight complete tricks, compute card points captured by each winning seat; card points are never removed twice.

```
biddingSideCaptured = sum(points captured by bidder and called-card holders)
defenderCaptured = 250 - biddingSideCaptured
bidSucceeded = biddingSideCaptured >= bid
```

If made, bidding side wins; otherwise defenders win. **VERIFIED.**

The code intentionally separates:

- `capturedBySeat`: points in tricks won by that exact seat, public as trick results accumulate.
- `HandResult.capturedBiddingTeam` / `capturedDefenders`: final team card-point totals (partnership may be hidden during hand).
- `HandResult.scoreDelta`: standings **awards** per seat, *not* card-point totals.

### Provisional award policy (**DECISION**, configurable)

| Scenario | Winner | Match-score award *per winning player* |
|---|---|---|
| Bid made without taking all 250 | Bidder's team | Contract bid (e.g. 160) |
| Bid made; all 250 points captured | Bidder's team | 250 (`fullSweepAward`) |
| Bid missed | Defenders | Actual defender card points |
| All scenarios | Losing team | 0 |

On failed bids, set `defenderAward:'contract'` to award the bid value rather than their captured points. No negative award is applied by this preset. We must **confirm this policy with players** before ranked play; six-player app materials also describe a negative-bid scoring variant and later nonnegative revisions. We do not infer one system to be universal.

**Canonical example** (four-player source #1): bid 160; bidding team captures 155; defenders capture 95. Bid fails; defenders win, and our provisional policy awards each defender +95 while bidding team gets 0. Captured 155 still appears in hand recap.

**Important:** Winner means *which side beat the contract*, not necessarily the side that gathered more of the 250 points. Defenders may win even with 95 captured points.

## 6. Match lifecycle

`createMatch()` starts hand one; `applyMatchAction()` aggregates exactly one award at hand completion; `nextHand()` rotates dealer and starts a new shuffled hand with the **same seat IDs**, preserving scores and history. **DECISION.**

**OPEN:** how a multi-hand match ends (first to X points, fixed number of hands, host stops, dealer rotation target). No artificial match-ending condition was hard-coded. A game server can choose the policy after confirming players' preference.

## 7. Edge cases and authoritative behavior

- Bid below first legal value, wrong ladder step, tied bid, pass before opening, or acting out of turn: reject with `GameRuleError`.
- A passed player cannot re-enter auction (their seat is skipped).
- Attempt to call an own card, a removed two in six-player deck, duplicate called card, or too few called cards: reject.
- Attempt to play a nonexistent card, someone else's card, card out of turn, or off-suit while holding lead suit: reject.
- Exact bid equality counts as **success**.
- Cards discarded off-suit can contribute points but do not win without trump.
- Two partner call cards held by one non-bidder create one distinct ally by default; same-holder restriction is supported as a toggle.
- A partner who revealed via the first called card is not counted twice if a second called card is theirs.
- All 250 card points can be captured even without winning every trick; full sweep uses points, not trick count.
- At hand completion, no card remains in any hand or active trick, and captured points total exactly 250.
- `nextHand` is unavailable until hand completion. A completed hand cannot accept more actions.
- Server-specific duplicate network messages, reconnects, game timeouts, abandoned matches and seat authentication are **next milestone**, not rules-engine responsibilities.
