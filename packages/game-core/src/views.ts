import type {HandState, CardId, Seat} from "./types.js";
import {requireRule} from "./types.js";

/** Explicitly construct a whitelist projection. Never JSON.stringify(authoritative HandState). */
export function viewForSeat(s: HandState, viewer: Seat) {
  requireRule(Number.isInteger(viewer) && viewer >= 0 && viewer < s.rules.players, "INVALID_SEAT", "Bad viewer seat");
  const partnerOfBidder = s.call !== null && s.call.cards.some(c => s.originalHolders[c] === viewer);
  return {
    handNumber: s.handNumber,
    phase: s.phase,
    seat: viewer,
    activeSeat: s.activeSeat,
    dealer: s.dealer,
    hand: [...s.hands[viewer]!],
    opponentCardCounts: s.hands.map((h, seat) => seat === viewer ? null : h.length),
    auction: s.auction.map(a => ({...a})),
    highestBid: s.highestBid,
    bidder: s.bidder,
    trump: s.call?.trump ?? null,
    calledCards: [...(s.call?.cards ?? [])],
    publiclyRevealedPartners: [...(s.call?.revealedPartners ?? [])],
    yourRole: s.bidder === viewer ? "bidder" : partnerOfBidder ? "secret-partner" : s.call ? "defender" : "undetermined",
    trickLeader: s.trickLeader,
    currentTrick: s.currentTrick.map(p => ({...p})),
    completedTricks: s.completedTricks.map(t => ({...t, plays: t.plays.map(p => ({...p}))})),
    capturedBySeat: [...s.capturedBySeat],
    result: s.result ? {...s.result, biddingTeam: [...s.result.biddingTeam], defenders: [...s.result.defenders], scoreDelta: [...s.result.scoreDelta]} : null,
  };
}
/** Useful for legal-move highlights. Never exposes opponent hands. */
export function viewerLegalCards(s: HandState, seat: Seat): CardId[] {
  if (s.phase !== "playing" || s.activeSeat !== seat || !s.hands[seat]) return [];
  const lead = s.currentTrick[0]?.card.split(":")[0];
  const matching = lead ? s.hands[seat].filter(c => c.split(":")[0] === lead) : [];
  return matching.length ? matching : [...s.hands[seat]];
}
