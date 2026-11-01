import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  FOUR_PLAYER, SIX_PLAYER, createDeck, cardPoints, totalPoints, seededRandom,
  createHand, applyAction, auditHand, legalCards, resolveTrick, viewForSeat,
  calculateHandResult, createMatch, applyMatchAction, nextHand, GameRuleError,
  shuffle,
} from '../dist/index.js';

const rng = seededRandom(1234);
const err = (fn, code) => assert.throws(fn, e => e instanceof GameRuleError && e.code === code);
function finishAuction(s) {
  s = applyAction(s, {type:'bid', seat:s.activeSeat, amount:s.rules.minimumBid});
  while (s.phase === 'bidding') s = applyAction(s, {type:'pass', seat:s.activeSeat});
  return s;
}
function callPartners(s, samePartner = false) {
  const others = s.hands.map((h, i) => ({h,i})).filter(({i}) => i !== s.bidder);
  const cards = samePartner ? others[0].h.slice(0,s.rules.partnerCallCount)
    : others.slice(0,s.rules.partnerCallCount).map(v => v.h[0]);
  return applyAction(s, {type:'call',seat:s.activeSeat,trump:'H',cards});
}
function playOut(s, chooser = (choices) => choices[0]) {
  while (s.phase === 'playing') {
    const chosen = chooser(legalCards(s.hands[s.activeSeat], s.currentTrick), s);
    s = applyAction(s, {type:'play',seat:s.activeSeat,card:chosen});
    auditHand(s);
  }
  return s;
}

test('both presets: card counts, 250 points, non-duplicate cards', () => {
  for (const r of [FOUR_PLAYER,SIX_PLAYER]) {
    const d = createDeck(r);
    assert.equal(d.length, r.players === 4 ? 52 : 48);
    assert.equal(new Set(d).size, d.length);
    assert.equal(totalPoints(d), 250);
    assert.equal(cardPoints('S:3'),30);
    assert.equal(cardPoints('S:14'),10);
    assert.equal(cardPoints('H:5'),5);
    assert.equal(cardPoints('C:7'),0);
    const s = createHand(r, 0, seededRandom(25));
    assert.equal(s.activeSeat,1);
    assert(s.hands.every(h => h.length === d.length/r.players));
    auditHand(s);
  }
});
test('shuffle is deterministic with test RNG; invalid RNG rejected', () => {
  assert.deepEqual(shuffle(createDeck(FOUR_PLAYER),seededRandom(5)),shuffle(createDeck(FOUR_PLAYER),seededRandom(5)));
  err(() => createHand(FOUR_PLAYER,0,() => -1),'BAD_RNG');
  err(() => createHand(FOUR_PLAYER,4,rng),'BAD_DEALER');
});
test('first player must open and bid ladders are variant-specific', () => {
  for (const r of [FOUR_PLAYER,SIX_PLAYER]) {
    let s = createHand(r,0,seededRandom(1));
    err(() => applyAction(s,{type:'pass',seat:1}),'MUST_OPEN');
    err(() => applyAction(s,{type:'bid',seat:1,amount:r.minimumBid+1}),'INVALID_BID');
    err(() => applyAction(s,{type:'bid',seat:2,amount:r.minimumBid}),'WRONG_TURN');
    s = applyAction(s,{type:'bid',seat:1,amount:r.minimumBid});
    err(() => applyAction(s,{type:'bid',seat:2,amount:r.minimumBid}),'BID_TOO_LOW');
    s = applyAction(s,{type:'bid',seat:2,amount:r.minimumBid+r.bidStep});
    while (s.phase==='bidding') s=applyAction(s,{type:'pass',seat:s.activeSeat});
    assert.equal(s.phase,'calling');
    assert.equal(s.bidder,2);
  }
});
test('a maximum bid instantly finishes the auction', () => {
  const s=applyAction(createHand(FOUR_PLAYER,0,seededRandom(2)),{type:'bid',seat:1,amount:250});
  assert.equal(s.phase,'calling');
  assert.equal(s.activeSeat,1);
});
test('calls disallow own or non-deck cards and invalid trump; bidder leads', () => {
  let s=finishAuction(createHand(FOUR_PLAYER,0,seededRandom(2)));
  const bidder=s.bidder;
  err(() => applyAction(s,{type:'call',seat:bidder,trump:'H',cards:[s.hands[bidder][0]]}),'SELF_CALL');
  err(() => applyAction(s,{type:'call',seat:bidder,trump:'NT',cards:[s.hands[(bidder+1)%4][0]]}),'INVALID_TRUMP');
  err(() => applyAction(s,{type:'call',seat:bidder,trump:'H',cards:['S:15']}),'INVALID_CARD');
  err(() => applyAction(s,{type:'call',seat:bidder,trump:'H',cards:[]}),'INVALID_CALL_COUNT');
  s=callPartners(s);
  assert.equal(s.phase,'playing');
  assert.equal(s.activeSeat,bidder);
  assert.equal(s.call.biddingTeam.length,2);
});
test('six-player repeated partner holder allowed by default, option forbids it', () => {
  let s=finishAuction(createHand(SIX_PLAYER,0,seededRandom(3)));
  s=callPartners(s,true);
  assert.equal(s.call.biddingTeam.length,2);
  const rules={...SIX_PLAYER, allowSamePlayerForBothCalls:false};
  const s2=finishAuction(createHand(rules,0,seededRandom(3)));
  err(()=>callPartners(s2,true),'SAME_PARTNER');
});
test('follow-suit compulsory; trump wins; off-suit ace cannot win', () => {
  const r=FOUR_PLAYER;
  const trick=[{seat:0,card:'D:13'},{seat:1,card:'D:3'},{seat:2,card:'H:2'},{seat:3,card:'D:14'}];
  assert.equal(resolveTrick(trick,'H',r).winner,2);
  assert.equal(resolveTrick(trick,'S',r).winner,3);
  assert.deepEqual(legalCards(['D:2','H:14'],[{seat:0,card:'D:10'}]),['D:2']);
  assert.deepEqual(legalCards(['S:2','H:14'],[{seat:0,card:'D:10'}]),['S:2','H:14']);
  let s=callPartners(finishAuction(createHand(r,0,seededRandom(6))));
  const leadSeat=s.activeSeat;
  const led=legalCards(s.hands[leadSeat],[])[0];
  s=applyAction(s,{type:'play',seat:leadSeat,card:led});
  const next=s.activeSeat;
  const matching=s.hands[next].filter(c => c[0]===led[0]);
  if (matching.length) {
    const off=s.hands[next].find(c=>c[0]!==led[0]);
    if(off) err(()=>applyAction(s,{type:'play',seat:next,card:off}),'FOLLOW_SUIT');
  }
  err(()=>applyAction(s,{type:'play',seat:next,card:led}),'CARD_NOT_OWNED');
});
test('normal 3-spades is vulnerable; house variant makes it unbeatable',()=>{
  const cards=[{seat:0,card:'S:3'},{seat:1,card:'S:4'},{seat:2,card:'H:14'},{seat:3,card:'D:14'}];
  assert.equal(resolveTrick(cards,'H',FOUR_PLAYER).winner,2);
  assert.equal(resolveTrick(cards,'H',{...FOUR_PLAYER,blackThree:'highest-card'}).winner,0);
});
test('No Trump and Duggi correctly reverse only the rankings, not points',()=>{
  const cards=[
    {seat:0,card:'S:3'},{seat:1,card:'S:14'},
    {seat:2,card:'H:14'},{seat:3,card:'S:4'},
    {seat:4,card:'S:13'},{seat:5,card:'C:5'},
  ];
  assert.equal(resolveTrick(cards,'NT',SIX_PLAYER).winner,1);
  assert.equal(resolveTrick(cards,'DUGGI',SIX_PLAYER).winner,0);
  assert.equal(resolveTrick(cards,'DUGGI',SIX_PLAYER).points,65);
});
test('scoring keeps captured points separate from match awards', () => {
  const lost=calculateHandResult(FOUR_PLAYER,0,160,[0,2],[80,45,75,50]);
  assert.equal(lost.capturedBiddingTeam,155);
  assert.equal(lost.capturedDefenders,95);
  assert.equal(lost.succeeded,false);
  assert.deepEqual(lost.scoreDelta,[0,95,0,95]);
  const made=calculateHandResult(FOUR_PLAYER,0,160,[0,2],[90,30,70,60]);
  assert.equal(made.succeeded,true);
  assert.deepEqual(made.scoreDelta,[160,0,160,0]);
  const sweep=calculateHandResult(SIX_PLAYER,0,130,[0,2,4],[100,0,50,0,100,0]);
  assert.equal(sweep.fullSweep,true);
  assert.deepEqual(sweep.scoreDelta,[250,0,250,0,250,0]);
  const policy=calculateHandResult({...FOUR_PLAYER,defenderAward:'contract'},0,160,[0,2],[80,45,75,50]);
  assert.deepEqual(policy.scoreDelta,[0,160,0,160]);
});
test('no sensitive hidden hands or secret partners in public projection', () => {
  let s=callPartners(finishAuction(createHand(FOUR_PLAYER,0,seededRandom(3))));
  for (let seat=0;seat<4;seat++) {
    const v=viewForSeat(s,seat);
    assert.equal(v.hand.length,13);
    assert.equal(v.result,null);
    assert.equal(v.publiclyRevealedPartners.length,0);
    assert(!('hands' in v));
    assert(!('originalHolders' in v));
    assert(!('biddingTeam' in v));
    assert.equal(v.opponentCardCounts.filter(x=>x!==null).length,3);
  }
});
test('complete 4 and 6 player hands, deterministic random hand simulation',()=>{
  for (const r of [FOUR_PLAYER,SIX_PLAYER]) {
    for(let seed=1;seed<=40;seed++) {
      let s=callPartners(finishAuction(createHand(r,seed%r.players,seededRandom(seed))));
      const old=s;
      s=playOut(s,(cards,state)=>cards[(seed+state.completedTricks.length)%cards.length]);
      assert.equal(old.phase,'playing'); // pure updates, input unchanged
      assert.equal(s.phase,'complete');
      assert.equal(s.completedTricks.length,r.players===4?13:8);
      assert.equal(s.result.capturedBiddingTeam+s.result.capturedDefenders,250);
      assert.equal(s.call.revealedPartners.length,s.call.biddingTeam.length-1);
      assert.equal(s.hands.flat().length,0);
      err(()=>applyAction(s,{type:'play',seat:s.activeSeat,card:'S:3'}),'HAND_COMPLETE');
    }
  }
});
test('match increments once, rotates dealer and keeps standings',()=>{
  let m=createMatch(FOUR_PLAYER,0,seededRandom(1));
  err(()=>nextHand(m,seededRandom(2)),'INCOMPLETE_HAND');
  m=applyMatchAction(m,{type:'bid',seat:m.hand.activeSeat,amount:125});
  while(m.hand.phase==='bidding')m=applyMatchAction(m,{type:'pass',seat:m.hand.activeSeat});
  const partner=m.hand.hands.findIndex((hand,seat)=>seat!==m.hand.bidder);
  const call=m.hand.hands[partner][0];
  m=applyMatchAction(m,{type:'call',seat:m.hand.activeSeat,trump:'S',cards:[call]});
  while(m.hand.phase==='playing')m=applyMatchAction(m,{type:'play',seat:m.hand.activeSeat,card:legalCards(m.hand.hands[m.hand.activeSeat],m.hand.currentTrick)[0]});
  assert.equal(m.history.length,1);
  assert.deepEqual(m.scores,m.hand.result.scoreDelta);
  const next=nextHand(m,seededRandom(2));
  assert.equal(next.hand.dealer,1);
  assert.equal(next.hand.handNumber,2);
  assert.deepEqual(next.scores,m.scores);
});
test('called partner stays concealed until their actual called card is played', () => {
  let s=callPartners(finishAuction(createHand(FOUR_PLAYER,0,seededRandom(101))));
  const target=s.call.cards[0];
  const holder=s.originalHolders[target];
  assert.equal(s.call.revealedPartners.length,0);
  assert.equal(viewForSeat(s,holder).yourRole,'secret-partner');
  assert.equal(viewForSeat(s,(holder+1)%4).publiclyRevealedPartners.length,0);
  let revealed=false;
  while(s.phase==='playing') {
    const seat=s.activeSeat;
    const legal=legalCards(s.hands[seat],s.currentTrick);
    const chosen=legal.includes(target) ? target : legal[0];
    s=applyAction(s,{type:'play',seat,card:chosen});
    if(chosen===target){
      revealed=true;
      assert(s.call.revealedPartners.includes(holder));
      for(let viewer=0;viewer<4;viewer++)assert(viewForSeat(s,viewer).publiclyRevealedPartners.includes(holder));
    } else if (!revealed) {
      assert.equal(viewForSeat(s,0).publiclyRevealedPartners.length,0);
    }
  }
  assert(revealed);
});
test('first lead house rule and point equality',()=>{
  let s=createHand({...FOUR_PLAYER,firstLead:'left-of-dealer'},2,seededRandom(104));
  s=applyAction(s,{type:'bid',seat:3,amount:125});
  s=applyAction(s,{type:'bid',seat:0,amount:130});
  while(s.phase==='bidding')s=applyAction(s,{type:'pass',seat:s.activeSeat});
  assert.equal(s.bidder,0);
  s=applyAction(s,{type:'call',seat:s.activeSeat,trump:'S',cards:[s.hands[1][0]]});
  assert.equal(s.activeSeat,3);
  const outcome=calculateHandResult(FOUR_PLAYER,0,160,[0,2],[60,40,100,50]);
  assert.equal(outcome.capturedBiddingTeam,160);
  assert.equal(outcome.succeeded,true);
});
test('six-player special NT and DUGGI can be called; disabled mode rejected',()=>{
  for(const trump of ['NT','DUGGI']) {
    let s=finishAuction(createHand(SIX_PLAYER,0,seededRandom(trump==='NT'?211:213)));
    const cards=s.hands.filter((_,seat)=>seat!==s.bidder).slice(0,2).map(h=>h[0]);
    s=applyAction(s,{type:'call',seat:s.bidder,trump,cards});
    assert.equal(s.call.trump,trump);
  }
  let s=finishAuction(createHand({...SIX_PLAYER,specialTrumps:false},0,seededRandom(212)));
  const cards=s.hands.filter((_,seat)=>seat!==s.bidder).slice(0,2).map(h=>h[0]);
  err(()=>applyAction(s,{type:'call',seat:s.bidder,trump:'NT',cards}),'INVALID_TRUMP');
});
