import {test} from 'node:test';
import assert from 'node:assert/strict';
import {TableSession, SessionError, actionForSeat, nickname} from '../session.mjs';
import {auditHand} from '../../../packages/game-core/dist/index.js';

const setup=(variant='four')=>{
  const table=new TableSession(variant, () => 0);
  const ids=Array.from({length: variant==='four'?4:6},(_,i)=>`device${i}`);
  ids.forEach((id,i)=>table.join(id,`Player ${i+1}`));
  return {table,ids};
};
let nonce=0;
function send(table,ids,seat,action){
  return table.command(ids[seat],{commandId:`command-${++nonce}`,expectedVersion:table.version,action});
}
function completeHand(table,ids){
  send(table,ids,0,{type:'start'});
  let safety=350;
  while(table.match.hand.phase!=='complete'&&safety-->0){
    const s=table.match.hand;
    if(s.phase==='bidding')send(table,ids,s.activeSeat,s.highestBid===null?{type:'bid',amount:table.rules.minimumBid}:{type:'pass'});
    else if(s.phase==='calling'){
      const options=s.hands.flat().filter(c=>!s.hands[s.activeSeat].includes(c));
      send(table,ids,s.activeSeat,{type:'call',trump:'S',cards:options.slice(0,table.rules.partnerCallCount)});
    }else if(s.phase==='playing'){
      const view=table.snapshot(ids[s.activeSeat]);
      send(table,ids,s.activeSeat,{type:'play',card:view.legalCards[0]});
    }
    auditHand(table.match.hand);
  }
  assert.ok(safety>0,'simulated hand did not finish');
  assert.equal(table.match.hand.phase,'complete');
  assert.equal(table.match.hand.capturedBySeat.reduce((a,b)=>a+b,0),250);
  assert.equal(table.match.history.length,1);
}

test('name validation prevents empty, markup and control chars',()=>{
  assert.equal(nickname('  Alice  Jane  '),'Alice Jane');
  for(const x of ['', '<script>', 'a'.repeat(21), '\u0001'])assert.throws(()=>nickname(x),SessionError);
});
test('clients cannot claim another seat in submitted actions',()=>{
  const {table,ids}=setup();send(table,ids,0,{type:'start'});
  const active=table.match.hand.activeSeat;
  const wrong=(active+1)%4;
  assert.throws(()=>send(table,ids,wrong,{type:'bid',amount:125,seat:active}),e=>e.code==='WRONG_TURN');
  send(table,ids,active,{type:'bid',amount:125,seat:wrong});
  assert.equal(table.match.hand.bidder,active);
});
test('commands reject stale versions and replay duplicate ids only once',()=>{
  const {table,ids}=setup();const version=table.version;
  assert.throws(()=>table.command(ids[0],{commandId:'old-command-1',expectedVersion:version-1,action:{type:'start'}}),e=>e.code==='STALE_STATE');
  const packet={commandId:'same-command-1',expectedVersion:version,action:{type:'start'}};
  assert.equal(table.command(ids[0],packet).ok,true);
  const count=table.version;
  assert.equal(table.command(ids[0],packet).duplicated,true);
  assert.equal(table.version,count);
});
test('seat projection only includes own private cards, no raw match/hands/holders',()=>{
  const {table,ids}=setup();send(table,ids,0,{type:'start'});
  for(let i=0;i<ids.length;i++){
    const data=table.snapshot(ids[i]);
    const json=JSON.stringify(data);
    assert.deepEqual(data.view.hand,table.match.hand.hands[i]);
    assert.equal(data.view.opponentCardCounts[i],null);
    assert.ok(!json.includes('originalHolders'));
    assert.ok(!json.includes('biddingTeam'));
    assert.ok(!json.includes('hands'));
    assert.equal(data.view.hand.length,13);
    for(let j=0;j<ids.length;j++)if(i!==j)assert.ok(data.view.opponentCardCounts[j]===13);
  }
});
test('lobby departures free and compact seats; started game reserves seats',()=>{
  const t=new TableSession('four');t.join('a','Alice');t.join('b','Bob');t.join('c','Chris');
  t.leave('b');assert.equal(t.find('c').seat,1);t.join('d','Daria');assert.equal(t.find('d').seat,2);
  t.join('e','Ella');send(t,['a','c','d','e'],0,{type:'start'});
  t.leave('c');assert.equal(t.find('c').seat,1);assert.equal(t.find('c').connected,false);
  assert.throws(()=>t.join('f','Fred'),e=>e.code==='GAME_STARTED');
  t.connection('c',true);assert.equal(t.find('c').connected,true);
});
test('cannot start until table full, no extra join, nonhost cannot start',()=>{
  const t=new TableSession();t.join('a','Alice');
  assert.throws(()=>t.command('a',{commandId:'start-notfull',expectedVersion:t.version,action:{type:'start'}}),e=>e.code==='NOT_READY');
  const {table,ids}=setup();
  assert.throws(()=>send(table,ids,1,{type:'start'}),e=>e.code==='NOT_HOST');
  assert.throws(()=>table.join('more','Extra'),e=>e.code==='ROOM_FULL');
});
for(const variant of ['four','six']) {
  test(`${variant}: full multi-user bidding to final trick and correct scoring`,()=>{
    const {table,ids}=setup(variant);completeHand(table,ids);
    assert.equal(table.snapshot(ids[0]).view.result.capturedBiddingTeam+table.snapshot(ids[0]).view.result.capturedDefenders,250);
    send(table,ids,0,{type:'nextHand'});
    assert.equal(table.match.hand.phase,'bidding');
    assert.equal(table.match.hand.handNumber,2);
  });
}
test('invalid action shape cannot become seat spoofing or arbitrary mutation',()=>{
  assert.deepEqual(actionForSeat({type:'play',card:'S:3',seat:99},1),{type:'play',seat:1,card:'S:3'});
  for(const input of [{type:'play',card:'S:15'},{type:'call',trump:'BAD',cards:[]},{type:'bid',amount:'250'},{type:'admin'}])
    assert.throws(()=>actionForSeat(input,0),SessionError);
});
