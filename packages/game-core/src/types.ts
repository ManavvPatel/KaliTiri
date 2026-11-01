/** All state in this module is authoritative and MUST remain server-side. */
export const SUITS = ["C", "D", "H", "S"] as const;
export type Suit = (typeof SUITS)[number];
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;
export type CardId = `${Suit}:${Rank}`;
export type Seat = number;
export type Trump = Suit | "NT" | "DUGGI";
export type Phase = "bidding" | "calling" | "playing" | "complete";

export interface RulesConfig {
  readonly id: string;
  readonly players: 4 | 6;
  readonly minimumBid: number;
  readonly bidStep: number;
  readonly maximumBid: number;
  readonly excludedRanks: readonly Rank[];
  readonly partnerCallCount: 1 | 2;
  readonly firstLead: "bidder" | "left-of-dealer";
  readonly specialTrumps: boolean;
  readonly allowSamePlayerForBothCalls: boolean;
  /** Optional 4-player house variation; default normal rank, not unbeatable. */
  readonly blackThree: "normal" | "highest-card";
  /** On a failed contract, defenders are awarded captured points (default) or bid. */
  readonly defenderAward: "captured" | "contract";
  /** When the bidding side captures every point, award 250 instead of bid. */
  readonly fullSweepAward: number;
}

export interface AuctionEntry {
  readonly seat: Seat;
  readonly type: "bid" | "pass";
  readonly amount?: number;
}
export interface PlayedCard {
  readonly seat: Seat;
  readonly card: CardId;
}
export interface TrickResult {
  readonly leader: Seat;
  readonly plays: readonly PlayedCard[];
  readonly winner: Seat;
  readonly points: number;
}
export interface CallInfo {
  readonly trump: Trump;
  readonly cards: readonly CardId[];
  /** SECRET. Derive once from the initial deal, even after those cards are played. */
  readonly biddingTeam: readonly Seat[];
  readonly revealedPartners: readonly Seat[];
}
export interface HandResult {
  readonly bid: number;
  readonly bidder: Seat;
  readonly biddingTeam: readonly Seat[];
  readonly defenders: readonly Seat[];
  readonly capturedBiddingTeam: number;
  readonly capturedDefenders: number;
  readonly succeeded: boolean;
  readonly fullSweep: boolean;
  readonly winningTeam: "bidder" | "defenders";
  readonly awardedPoints: number;
  /** Cumulative scoreboard increments by seat; not trick/card points. */
  readonly scoreDelta: readonly number[];
}
export interface HandState {
  readonly rules: RulesConfig;
  readonly handNumber: number;
  readonly dealer: Seat;
  readonly phase: Phase;
  readonly activeSeat: Seat;
  /** Includes entire private hands. Never expose this object to clients. */
  readonly hands: readonly (readonly CardId[])[];
  /** Original holder of every card: private, immutable through the hand. */
  readonly originalHolders: Readonly<Record<string, Seat>>;
  readonly auction: readonly AuctionEntry[];
  readonly passed: readonly Seat[];
  readonly highestBid: number | null;
  readonly bidder: Seat | null;
  readonly call: CallInfo | null;
  readonly currentTrick: readonly PlayedCard[];
  readonly trickLeader: Seat | null;
  readonly completedTricks: readonly TrickResult[];
  readonly capturedBySeat: readonly number[];
  readonly result: HandResult | null;
}

export type GameAction =
  | {readonly type: "bid"; readonly seat: Seat; readonly amount: number}
  | {readonly type: "pass"; readonly seat: Seat}
  | {readonly type: "call"; readonly seat: Seat; readonly trump: Trump; readonly cards: readonly CardId[]}
  | {readonly type: "play"; readonly seat: Seat; readonly card: CardId};

export type RandomInt = (exclusiveUpperBound: number) => number;

export interface MatchState {
  readonly rules: RulesConfig;
  readonly hand: HandState;
  readonly scores: readonly number[];
  readonly history: readonly HandResult[];
}

export class GameRuleError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "GameRuleError";
  }
}
export function requireRule(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new GameRuleError(code, message);
}
