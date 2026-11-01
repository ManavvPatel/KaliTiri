import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync, readFileSync, readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DiskTableStore,CODE_PATTERN} from '../store.mjs';
import {DurableTable} from '../durable-table.mjs';
import {auditHand} from '../../../packages/game-core/dist/index.js';

function setup(variant='four') {
  const path=mkdtempSync(join(tmpdir(),'kalitiri-durable-'));
  const store=new DiskTableStore(path);
  const table=new DurableTable({store,variant,rng:()=>0});
  const players=Array.from({length:table.rules.players},(_,i)=>table.attach(`socket-${i}`,{name:`Player ${i+1}`}));
  let commandNo=0;
  const send=(seat,action)=>table.command(`socket-${seat}`,{
    commandId:`command-${++commandNo}`,expectedVersion:table.table.version,action,
  });
  const cleanup=()=>rmSync(path,{recursive:true,force:true});
  return {table,store,players,send,cleanup};
}

test('new games persist atomically with random stable table codes and hashed tokens',()=>{
  const {table,store,players,cleanup}=setup();
  try {
    assert.match(table.code,CODE_PATTERN);
    const snapshot=store.load(table.code);
    assert.equal(snapshot.table.players.length,4);
    assert.equal(snapshot.credentials.length,4);
    assert.ok(!JSON.stringify(snapshot).includes(players[0].seatToken));
    assert.ok(!readdirSync(store.directory).some(f=>f.endsWith('.tmp')));
  }finally{cleanup();}
});

test('recover a four-player hand after restart without reshuffling, seat swaps, or card leaks',()=>{
  const {table,store,players,send,cleanup}=setup();
  try {
    send(0,{type:'start'});
    let hand=table.table.match.hand;
    send(hand.activeSeat,{type:'bid',amount:125});
    hand=table.table.match.hand;
    for(let i=0;i<3;i++)send(table.table.match.hand.activeSeat,{type:'pass'});
    hand=table.table.match.hand;
    assert.equal(hand.phase,'calling');
    send(hand.activeSeat,{type:'call',trump:'H',cards:hand.hands.flat().filter(c=>!hand.hands[hand.activeSeat].includes(c)).slice(0,1)});
    const active=table.table.match.hand.activeSeat;
    send(active,{type:'play',card:table.snapshot(`socket-${active}`).legalCards[0]});
    const before=JSON.stringify(table.table.match), code=table.code;
    const previousVersion=table.table.version;
    const restored=new DurableTable({store,code,rng:()=>0});
    assert.equal(restored.table.version,previousVersion+1);
    assert.equal(JSON.stringify(restored.table.match),before);
    assert.ok(restored.table.players.every(p=>!p.connected));
    assert.equal(restored.mayEnter({name:'attacker'}),false);
    assert.equal(restored.mayEnter({seatToken:'bad-token'}),false);
    assert.equal(restored.tokenSeat(players[1].seatToken),players[1].seatId);
    assert.throws(()=>restored.attach('rogue',{name:'Attacker'}),e=>e.code==='ROOM_CLOSED');
    const resumed=restored.attach('new-socket',{seatToken:players[1].seatToken});
    assert.equal(resumed.seatId,players[1].seatId);
    assert.deepEqual(restored.snapshot('new-socket').view.hand,restored.table.match.hand.hands[1]);
    assert.ok(!JSON.stringify(restored.snapshot('new-socket')).includes(players[0].seatToken));
    assert.equal(restored.table.players[1].connected,true);
    assert.throws(()=>restored.attach('same-seat',{seatToken:players[1].seatToken}),e=>e.code==='SEAT_IN_USE');
  }finally{cleanup();}
});

test('lobby seats also survive restarts, and existing seats remain claimable',()=>{
  const path=mkdtempSync(join(tmpdir(),'kalitiri-lobby-'));
  try{
    const store=new DiskTableStore(path);
    const first=new DurableTable({store,variant:'four'});
    const alice=first.attach('s1',{name:'Alice'}), code=first.code;
    const restored=new DurableTable({store,code});
    assert.equal(restored.table.players[0].name,'Alice');
    const same=restored.attach('new',{seatToken:alice.seatToken});
    assert.equal(same.seatId,alice.seatId);
    const bob=restored.attach('s2',{name:'Bob'});
    assert.equal(restored.table.players.length,2);
    restored.detach('new');
    const anotherRestart=new DurableTable({store,code});
    assert.equal(anotherRestart.tokenSeat(bob.seatToken),bob.seatId);
    assert.equal(anotherRestart.table.players.length,2);
  }finally{rmSync(path,{recursive:true,force:true});}
});

for(const variant of ['four','six'])test(`${variant} full game state and command deduplication survive persistence`,()=>{
  const {table,store,players,send,cleanup}=setup(variant);
  try {
    send(0,{type:'start'});
    let safety=400;
    while(table.table.match.hand.phase!=='complete'&&safety-->0){
      const h=table.table.match.hand, seat=h.activeSeat;
      if(h.phase==='bidding') send(seat,h.highestBid===null?{type:'bid',amount:table.rules.minimumBid}:{type:'pass'});
      else if(h.phase==='calling') send(seat,{type:'call',trump:'S',cards:h.hands.flat().filter(c=>!h.hands[seat].includes(c)).slice(0,table.rules.partnerCallCount)});
      else if(h.phase==='playing')send(seat,{type:'play',card:table.snapshot(`socket-${seat}`).legalCards[0]});
      auditHand(table.table.match.hand);
    }
    assert.ok(safety>0);
    assert.equal(table.table.match.hand.capturedBySeat.reduce((a,b)=>a+b,0),250);
    const restored=new DurableTable({store,code:table.code});
    assert.equal(restored.table.match.hand.phase,'complete');
    assert.deepEqual(restored.table.match.scores,table.table.match.scores);
    const resume=restored.attach('reclaimed',{seatToken:players[0].seatToken});
    assert.equal(resume.seatId,players[0].seatId);
    const packet={commandId:'dedupe-a1',expectedVersion:restored.table.version,action:{type:'nextHand'}};
    const result=restored.command('reclaimed',packet);
    assert.equal(result.ok,true);
    assert.equal(restored.command('reclaimed',packet).duplicated,true);
    const restoredAgain=new DurableTable({store,code:table.code});
    restoredAgain.attach('reclaimed-again',{seatToken:players[0].seatToken});
    assert.equal(restoredAgain.command('reclaimed-again',packet).duplicated,true);
    assert.equal(restoredAgain.table.match.hand.handNumber,2);
  }finally{cleanup();}
});

test('storage failures do not acknowledge a move or change the active state',()=>{
  const {table,store,players,cleanup}=setup();
  try {
    const before=JSON.stringify(table.table.exportState());
    store.save=()=>{throw new Error('disk full');};
    assert.throws(()=>table.command('socket-0',{commandId:'start-when-full',expectedVersion:table.table.version,action:{type:'start'}}),e=>e.code==='PERSIST_FAILED');
    assert.equal(JSON.stringify(table.table.exportState()),before);
  }finally{cleanup();}
});

test('invalid codes and corrupted durable files fail closed',()=>{
  const {table,store,cleanup}=setup();
  try {
    assert.throws(()=>store.load('../etc/passwd'));
    const file=store.filename(table.code);
    const raw=JSON.parse(readFileSync(file));
    raw.table.match={};raw.table.wasStarted=true;
    store.save(raw);
    assert.throws(()=>new DurableTable({store,code:table.code}));
  }finally{cleanup();}
});
