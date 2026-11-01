import {randomInt} from 'node:crypto';
import {
 FOUR_PLAYER,SIX_PLAYER,createMatch,applyMatchAction,legalCards,auditHand
} from '../../packages/game-core/dist/index.js';
const rules = process.argv.includes('--six') ? SIX_PLAYER : FOUR_PLAYER;
let match = createMatch(rules,0,randomInt); // secure system randomness, unlike seededRandom test helper
const act = a => { match=applyMatchAction(match,a); auditHand(match.hand); };
act({type:'bid',seat:match.hand.activeSeat,amount:rules.minimumBid});
while(match.hand.phase==='bidding')act({type:'pass',seat:match.hand.activeSeat});
const {bidder,hands}=match.hand;
const called = hands.flatMap((cards,seat) => seat===bidder ? [] : [{seat,card:cards[0]}])
  .slice(0,rules.partnerCallCount).map(v=>v.card);
act({type:'call',seat:bidder,trump:'H',cards:called});
while(match.hand.phase==='playing') {
  const s=match.hand; const seat=s.activeSeat;
  const options=legalCards(s.hands[seat],s.currentTrick);
  act({type:'play',seat,card:options[randomInt(options.length)]});
}
console.log(JSON.stringify({
  version:rules.id,hand:match.hand.handNumber,
  contract:match.hand.highestBid,bidder:match.hand.bidder,
  teams:{bidder:match.hand.result.biddingTeam,defenders:match.hand.result.defenders},
  captured:{bidder:match.hand.result.capturedBiddingTeam,defenders:match.hand.result.capturedDefenders},
  result:match.hand.result.winningTeam,
  matchScores:match.scores,
  totalTricks:match.hand.completedTricks.length
},null,2));
