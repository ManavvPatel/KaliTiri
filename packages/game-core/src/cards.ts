import {SUITS, requireRule} from "./types.js";
import type {CardId, Rank, RulesConfig, Seat, Suit, RandomInt} from "./types.js";

export function card(suit: Suit, rank: Rank): CardId { return `${suit}:${rank}`; }
export function parseCard(id: CardId): {suit: Suit; rank: Rank} {
  const [suit, str] = id.split(":");
  const rank = Number(str);
  requireRule(SUITS.includes(suit as Suit) && Number.isInteger(rank) && rank >= 2 && rank <= 14,
    "INVALID_CARD", `Invalid card: ${id}`);
  return {suit: suit as Suit, rank: rank as Rank};
}
export function createDeck(rules: RulesConfig): CardId[] {
  const deck: CardId[] = [];
  for (const suit of SUITS) {
    for (let rank = 2; rank <= 14; rank++) {
      if (!rules.excludedRanks.includes(rank as Rank)) deck.push(card(suit, rank as Rank));
    }
  }
  return deck;
}
/** Fisher-Yates with an injected secure-uniform nextInt for production. */
export function shuffle(deck: readonly CardId[], nextInt: RandomInt): CardId[] {
  const result = [...deck];
  for (let i = result.length - 1; i > 0; i--) {
    const j = nextInt(i + 1);
    requireRule(Number.isInteger(j) && j >= 0 && j <= i, "BAD_RNG", "Random source returned invalid integer");
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}
/** Shuffled cards dealt clockwise starting left of dealer. */
export function deal(deck: readonly CardId[], players: number, dealer: Seat): CardId[][] {
  requireRule(deck.length % players === 0, "BAD_DEAL", "Cards do not divide evenly");
  const hands: CardId[][] = Array.from({length: players}, () => []);
  for (let i = 0; i < deck.length; i++) hands[(dealer + 1 + i) % players]!.push(deck[i]!);
  return hands;
}
export function cardPoints(id: CardId): number {
  const {suit, rank} = parseCard(id);
  if (suit === "S" && rank === 3) return 30;
  if (rank >= 10) return 10;
  if (rank === 5) return 5;
  return 0;
}
export function totalPoints(ids: readonly CardId[]): number { return ids.reduce((total, c) => total + cardPoints(c), 0); }
/** Intentionally predictable: demos/tests ONLY, never use for live deals. */
export function seededRandom(seed: number): RandomInt {
  let s = (seed >>> 0) || 0x9e3779b9;
  return (exclusive) => {
    requireRule(Number.isInteger(exclusive) && exclusive > 0, "BAD_RNG", "Bad RNG range");
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return Math.floor((s >>> 0) / 4294967296 * exclusive);
  };
}
