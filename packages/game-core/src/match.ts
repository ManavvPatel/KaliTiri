import type {GameAction, MatchState, RandomInt, RulesConfig} from "./types.js";
import {requireRule} from "./types.js";
import {createHand, applyAction} from "./engine.js";

export function createMatch(rules: RulesConfig, firstDealer: number, rng: RandomInt): MatchState {
  return {rules, hand: createHand(rules, firstDealer, rng), scores: Array(rules.players).fill(0), history: []};
}
export function applyMatchAction(match: MatchState, action: GameAction): MatchState {
  const hand = applyAction(match.hand, action);
  if (hand.phase === "complete") {
    const result = hand.result!;
    return {
      ...match, hand, scores: match.scores.map((n, seat) => n + result.scoreDelta[seat]!),
      history: [...match.history, result],
    };
  }
  return {...match, hand};
}
export function nextHand(match: MatchState, rng: RandomInt): MatchState {
  requireRule(match.hand.phase === "complete", "INCOMPLETE_HAND", "Finish the current hand before starting another");
  return {
    ...match,
    hand: createHand(match.rules, (match.hand.dealer + 1) % match.rules.players, rng, match.hand.handNumber + 1),
  };
}
