import type {
  AuctionEntry, CardId, GameAction, HandState, PlayedCard,
  RandomInt, RulesConfig, Seat, Trump, CallInfo,
} from "./types.js";
import {requireRule} from "./types.js";
import {createDeck, shuffle, deal, parseCard} from "./cards.js";
import {validateRules} from "./rules.js";
import {legalCards, resolveTrick} from "./tricks.js";
import {calculateHandResult} from "./scoring.js";

function nextActive(seat: Seat, playerCount: number, passed: readonly Seat[]): Seat {
  for (let offset = 1; offset <= playerCount; offset++) {
    const candidate = (seat + offset) % playerCount;
    if (!passed.includes(candidate)) return candidate;
  }
  throw new Error("No active bidders");
}
function biddingClosed(players: number, passed: readonly Seat[]): boolean {
  return passed.length === players - 1;
}
function finishBidding(s: HandState): HandState {
  requireRule(s.bidder !== null && s.highestBid !== null, "NO_BID", "Cannot end auction without a bid");
  return {...s, phase: "calling", activeSeat: s.bidder};
}

export function createHand(rules: RulesConfig, dealer: Seat, nextInt: RandomInt, handNumber = 1): HandState {
  validateRules(rules);
  requireRule(Number.isInteger(dealer) && dealer >= 0 && dealer < rules.players, "BAD_DEALER", "Invalid dealer seat");
  requireRule(Number.isInteger(handNumber) && handNumber >= 1, "BAD_HAND", "Invalid hand number");
  const hands = deal(shuffle(createDeck(rules), nextInt), rules.players, dealer);
  const originalHolders: Record<string, number> = {};
  for (let seat = 0; seat < hands.length; seat++) for (const c of hands[seat]!) originalHolders[c] = seat;
  return {
    rules, handNumber, dealer, phase: "bidding", activeSeat: (dealer + 1) % rules.players,
    hands, originalHolders, auction: [], passed: [], highestBid: null, bidder: null,
    call: null, currentTrick: [], trickLeader: null, completedTricks: [],
    capturedBySeat: Array(rules.players).fill(0), result: null,
  };
}

/** Pure state transition: no I/O or RNG. Invalid actions throw GameRuleError. */
export function applyAction(state: HandState, action: GameAction): HandState {
  requireRule(state.phase !== "complete", "HAND_COMPLETE", "Hand already complete");
  requireRule(Number.isInteger(action.seat) && action.seat >= 0 && action.seat < state.rules.players,
    "INVALID_SEAT", "Invalid player seat");
  requireRule(action.seat === state.activeSeat, "WRONG_TURN", "It is not this player's turn");
  switch (action.type) {
    case "bid": return makeBid(state, action.seat, action.amount);
    case "pass": return passBid(state, action.seat);
    case "call": return makeCall(state, action.seat, action.trump, action.cards);
    case "play": return playCard(state, action.seat, action.card);
  }
}
function makeBid(s: HandState, seat: Seat, amount: number): HandState {
  requireRule(s.phase === "bidding", "WRONG_PHASE", "Cannot bid during this phase");
  requireRule(!s.passed.includes(seat), "ALREADY_PASSED", "Passing permanently removes you from bidding");
  const {minimumBid, bidStep, maximumBid, players} = s.rules;
  requireRule(Number.isInteger(amount) && amount >= minimumBid && amount <= maximumBid && (amount - minimumBid) % bidStep === 0,
    "INVALID_BID", "Bid must be on the preset bidding ladder");
  requireRule(s.highestBid === null || amount > s.highestBid,
    "BID_TOO_LOW", "Bid must exceed the current high bid");
  const entry: AuctionEntry = {seat, type: "bid", amount};
  const updated: HandState = {
    ...s, auction: [...s.auction, entry], highestBid: amount, bidder: seat,
    activeSeat: nextActive(seat, players, s.passed),
  };
  return (amount === maximumBid || biddingClosed(players, s.passed)) ? finishBidding(updated) : updated;
}
function passBid(s: HandState, seat: Seat): HandState {
  requireRule(s.phase === "bidding", "WRONG_PHASE", "Cannot pass outside bidding");
  requireRule(s.highestBid !== null, "MUST_OPEN", "Opening player must place the first bid");
  requireRule(!s.passed.includes(seat), "ALREADY_PASSED", "This seat has already passed");
  const passed = [...s.passed, seat];
  const entry: AuctionEntry = {seat, type: "pass"};
  const updated: HandState = {
    ...s, passed, auction: [...s.auction, entry],
    activeSeat: nextActive(seat, s.rules.players, passed),
  };
  return biddingClosed(s.rules.players, passed) ? finishBidding(updated) : updated;
}
function makeCall(s: HandState, seat: Seat, trump: Trump, called: readonly CardId[]): HandState {
  requireRule(s.phase === "calling" && s.bidder === seat, "WRONG_PHASE", "Only the winning bidder may call");
  requireRule((trump === "NT" || trump === "DUGGI") ? s.rules.specialTrumps : ["C","D","H","S"].includes(trump),
    "INVALID_TRUMP", "Trump choice is not allowed for this preset");
  requireRule(called.length === s.rules.partnerCallCount && new Set(called).size === called.length,
    "INVALID_CALL_COUNT", "Call the required number of distinct cards");
  for (const c of called) {
    parseCard(c);
    requireRule(s.originalHolders[c] !== undefined, "NOT_IN_DECK", "Called card not in deck");
    requireRule(s.originalHolders[c] !== seat, "SELF_CALL", "Bidder cannot call a card from own hand");
  }
  const partnerSeats = [...new Set(called.map(c => s.originalHolders[c]!))];
  requireRule(s.rules.allowSamePlayerForBothCalls || partnerSeats.length === called.length,
    "SAME_PARTNER", "Two called cards must belong to different players");
  const biddingTeam = [seat, ...partnerSeats].sort((a,b) => a-b);
  const call: CallInfo = {trump, cards: [...called], biddingTeam, revealedPartners: []};
  const leader = s.rules.firstLead === "bidder" ? seat : (s.dealer + 1) % s.rules.players;
  return {...s, phase: "playing", activeSeat: leader, trickLeader: leader, call};
}
function playCard(s: HandState, seat: Seat, played: CardId): HandState {
  requireRule(s.phase === "playing" && s.call !== null, "WRONG_PHASE", "Cannot play cards in this phase");
  const ownHand = s.hands[seat]!;
  requireRule(ownHand.includes(played), "CARD_NOT_OWNED", "Cannot play a card not held by player");
  requireRule(legalCards(ownHand, s.currentTrick).includes(played), "FOLLOW_SUIT", "You must follow the led suit");
  const hands = s.hands.map((h, i) => i === seat ? h.filter(c => c !== played) : [...h]);
  const plays: PlayedCard[] = [...s.currentTrick, {seat, card: played}];
  const revealedPartners = s.call.cards.includes(played) && seat !== s.bidder
    ? [...new Set([...s.call.revealedPartners, seat])].sort((a,b) => a-b)
    : [...s.call.revealedPartners];
  const call: CallInfo = {...s.call, revealedPartners};
  if (plays.length < s.rules.players) {
    return {...s, hands, currentTrick: plays, activeSeat: (seat + 1) % s.rules.players, call};
  }
  const {winner, points} = resolveTrick(plays, s.call.trump, s.rules);
  const trick = {leader: s.trickLeader!, plays, winner, points};
  const completedTricks = [...s.completedTricks, trick];
  const capturedBySeat = s.capturedBySeat.map((value, i) => i === winner ? value + points : value);
  const completed = completedTricks.length === createDeck(s.rules).length / s.rules.players;
  if (completed) {
    const result = calculateHandResult(s.rules, s.bidder!, s.highestBid!, call.biddingTeam, capturedBySeat);
    return {
      ...s, hands, call, completedTricks, capturedBySeat, currentTrick: [],
      trickLeader: null, phase: "complete", activeSeat: winner, result,
    };
  }
  return {
    ...s, hands, call, completedTricks, capturedBySeat,
    currentTrick: [], activeSeat: winner, trickLeader: winner,
  };
}

/** Verify authoritative state conservation; intended for tests and debug/observability. */
export function auditHand(s: HandState): void {
  validateRules(s.rules);
  const activeCards = s.hands.flat();
  const trickCards = s.currentTrick.map(p => p.card);
  const wonCards = s.completedTricks.flatMap(t => t.plays.map(p => p.card));
  const all = [...activeCards, ...trickCards, ...wonCards];
  const deck = createDeck(s.rules);
  requireRule(all.length === deck.length && new Set(all).size === deck.length &&
    all.every(c => deck.includes(c)), "AUDIT_CARDS", "Cards missing, duplicated or invalid");
  requireRule(s.hands.length === s.rules.players && s.capturedBySeat.length === s.rules.players, "AUDIT_SEATS", "Bad seat state");
  requireRule(s.completedTricks.every(t => t.plays.length === s.rules.players), "AUDIT_TRICKS", "Malformed completed trick");
  const totals = Array(s.rules.players).fill(0) as number[];
  for (const trick of s.completedTricks) totals[trick.winner]! += trick.points;
  requireRule(totals.every((value, seat) => value === s.capturedBySeat[seat]), "AUDIT_POINTS", "Captured points mismatch");
  requireRule(s.phase !== "complete" || (activeCards.length === 0 && s.currentTrick.length === 0 && s.result !== null && totals.reduce((a,b)=>a+b,0) === 250),
    "AUDIT_COMPLETE", "Completed hand is inconsistent");
}
