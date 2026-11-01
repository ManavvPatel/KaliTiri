import type {CardId, PlayedCard, Seat, Trump, RulesConfig} from "./types.js";
import {requireRule} from "./types.js";
import {parseCard, totalPoints} from "./cards.js";

export function legalCards(hand: readonly CardId[], plays: readonly PlayedCard[]): CardId[] {
  if (plays.length === 0) return [...hand];
  const lead = parseCard(plays[0]!.card).suit;
  const followers = hand.filter(c => parseCard(c).suit === lead);
  return followers.length ? followers : [...hand];
}

export function resolveTrick(plays: readonly PlayedCard[], trump: Trump, rules: RulesConfig): {
  winner: Seat; points: number;
} {
  requireRule(plays.length === rules.players, "TRICK_SIZE", "Incomplete trick");
  const seats = new Set(plays.map(p => p.seat));
  requireRule(seats.size === rules.players, "TRICK_DUPLICATE", "Duplicate seat in trick");
  const leadSuit = parseCard(plays[0]!.card).suit;
  if (rules.blackThree === "highest-card") {
    const black = plays.find(p => p.card === "S:3");
    if (black) return {winner: black.seat, points: totalPoints(plays.map(p => p.card))};
  }
  const score = (id: CardId): number => {
    const {suit, rank} = parseCard(id);
    const relevant = trump === "NT" || trump === "DUGGI"
      ? suit === leadSuit : suit === trump || suit === leadSuit;
    if (!relevant) return -1;
    const power = trump === "DUGGI" ? 15 - rank : rank;
    if (trump !== "NT" && trump !== "DUGGI" && suit === trump) return 100 + power;
    return power;
  };
  let winner = plays[0]!;
  for (const play of plays.slice(1)) if (score(play.card) > score(winner.card)) winner = play;
  return {winner: winner.seat, points: totalPoints(plays.map(p => p.card))};
}
