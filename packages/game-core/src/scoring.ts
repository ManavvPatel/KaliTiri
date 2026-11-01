import type {HandResult, RulesConfig, Seat} from "./types.js";
import {requireRule} from "./types.js";

export function calculateHandResult(
  rules: RulesConfig, bidder: Seat, bid: number,
  biddingTeam: readonly Seat[], capturedBySeat: readonly number[],
): HandResult {
  requireRule(capturedBySeat.length === rules.players && capturedBySeat.every(n => Number.isInteger(n) && n >= 0),
    "SCORE_VALUES", "Invalid captured-points array");
  requireRule(capturedBySeat.reduce((a, b) => a + b, 0) === 250, "SCORE_TOTAL", "Captured card points must total 250");
  requireRule(Number.isInteger(bid) && bid >= rules.minimumBid && bid <= rules.maximumBid, "SCORE_BID", "Invalid contract");
  const team = [...new Set(biddingTeam)].sort((a,b) => a-b);
  requireRule(team.includes(bidder) && team.length >= 2 && team.length < rules.players && team.every(s => Number.isInteger(s) && s >= 0 && s < rules.players),
    "SCORE_TEAM", "Invalid bidding team");
  const defenders = Array.from({length: rules.players}, (_, s) => s).filter(s => !team.includes(s));
  const capturedBiddingTeam = team.reduce((sum, s) => sum + capturedBySeat[s]!, 0);
  const capturedDefenders = 250 - capturedBiddingTeam;
  const succeeded = capturedBiddingTeam >= bid;
  const fullSweep = capturedBiddingTeam === 250;
  const winningTeam = succeeded ? "bidder" : "defenders";
  const awardedPoints = succeeded ? (fullSweep ? rules.fullSweepAward : bid)
    : rules.defenderAward === "captured" ? capturedDefenders : bid;
  const winners = succeeded ? team : defenders;
  const scoreDelta = Array.from({length: rules.players}, (_, s) => winners.includes(s) ? awardedPoints : 0);
  return {
    bidder, bid, biddingTeam: team, defenders,
    capturedBiddingTeam, capturedDefenders, succeeded, fullSweep,
    winningTeam, awardedPoints, scoreDelta,
  };
}
