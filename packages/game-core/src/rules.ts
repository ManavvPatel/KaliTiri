import type {RulesConfig} from "./types.js";
import {requireRule} from "./types.js";

export const FOUR_PLAYER: Readonly<RulesConfig> = Object.freeze({
  id: "kalitiri-4-v0.1",
  players: 4, minimumBid: 125, bidStep: 5, maximumBid: 250,
  excludedRanks: [], partnerCallCount: 1,
  firstLead: "bidder", specialTrumps: false,
  allowSamePlayerForBothCalls: true,
  blackThree: "normal", defenderAward: "captured", fullSweepAward: 250,
});
export const SIX_PLAYER: Readonly<RulesConfig> = Object.freeze({
  id: "kaliteeri-6-v0.1",
  players: 6, minimumBid: 130, bidStep: 10, maximumBid: 250,
  excludedRanks: [2 as const], partnerCallCount: 2,
  firstLead: "bidder", specialTrumps: true,
  allowSamePlayerForBothCalls: true,
  blackThree: "normal", defenderAward: "captured", fullSweepAward: 250,
});
export function validateRules(r: RulesConfig): void {
  requireRule(r.players === 4 || r.players === 6, "RULES_PLAYERS", "Only 4 or 6 players supported");
  requireRule(r.partnerCallCount === (r.players === 4 ? 1 : 2), "RULES_PARTNERS", "Partner call count must match table size");
  requireRule(r.minimumBid > 0 && r.bidStep > 0 && r.maximumBid <= 250 && r.minimumBid <= r.maximumBid, "RULES_BID", "Invalid bid range");
  requireRule((r.maximumBid - r.minimumBid) % r.bidStep === 0, "RULES_BID", "Maximum bid must be on the bidding ladder");
  requireRule(r.players * (r.players === 4 ? 13 : 8) === 52 - r.excludedRanks.length * 4, "RULES_DECK", "Deck cannot be distributed evenly");
  requireRule(r.players === 4 ? r.excludedRanks.length === 0 : r.excludedRanks.length === 1 && r.excludedRanks[0] === 2,
    "RULES_DECK", "Use a standard deck for four, or remove twos for six");
  requireRule(Number.isInteger(r.fullSweepAward) && r.fullSweepAward >= 0, "RULES_SWEEP", "Invalid full sweep award");
}
