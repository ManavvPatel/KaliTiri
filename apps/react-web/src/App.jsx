import React, {useEffect,useMemo,useRef,useState} from 'react';
import {Client} from '@colyseus/sdk';

const symbols={C:'♣',D:'♦',H:'♥',S:'♠'};
const suitNames={C:'Clubs',D:'Diamonds',H:'Hearts',S:'Spades'};
const ranks={11:'J',12:'Q',13:'K',14:'A'};
const variantRules={four:{min:125,step:5},six:{min:130,step:10}};
const roomFromLink=new URLSearchParams(location.search).get('room')||'';
const seatKey=code=>`kalitiri.seat.${code}`;
const rejoinKey=code=>`kalitiri.sdk.${code}`;
const url=import.meta.env.VITE_COLYSEUS_URL || (import.meta.env.PROD ? location.origin : `${location.protocol}//${location.hostname}:2567`);
async function lookupRoom(code,seatToken='') {
  const response=await fetch('/api/resolve',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({code:code.toUpperCase(),seatToken})});
  const body=await response.json();
  if(!response.ok)throw new Error(body.error||'Could not find this table.');
  return body.roomId;
}
function label(card){if(!card)return '—';const [s,r]=card.split(':');return `${ranks[r]||r}${symbols[s]}`;}
function red(card){return card.startsWith('H:')||card.startsWith('D:');}
function everyCard(variant){return ['S','H','D','C'].flatMap(s=>Array.from({length:variant==='four'?13:12},(_,i)=>`${s}:${i+(variant==='four'?2:3)}`));}
function Card({id,onClick,selected=false,disabled=false,compact=false}){
  return <button type="button" aria-label={label(id)} aria-pressed={selected} className={`playing-card ${red(id)?'red':''} ${compact?'compact':''} ${selected?'selected':''}`} disabled={disabled||!onClick} onClick={onClick}>
    <span className="corner">{label(id)}</span><span className="symbol">{symbols[id.split(':')[0]]}</span><span className="mini">{label(id)}</span>
  </button>;
}
function Logo(){return <a className="wordmark" href="/" aria-label="KaliTiri home"><span>♠</span> KALITIRI</a>}
function ConnectionPill({status}){return <span className={`connection ${status==='Connected'?'ok':'warn'}`}><i/> {status}</span>}
function Home({onCreate,onJoin,busy,invite}){
  const [name,setName]=useState(sessionStorage.getItem('kalitiri.nickname')||'');
  const [variant,setVariant]=useState('four');
  const [code,setCode]=useState(invite);
  function saved(){sessionStorage.setItem('kalitiri.nickname',name);return name;}
  return <>
    <section className="hero"><div className="eyebrow">YOUR NEXT CARD NIGHT</div><h1>A seat at the table,<br/><em>wherever you are.</em></h1><p>The classic game of bids, tricks, trump and unexpected partners. Four or six players, one private room.</p></section>
    <section className="home-grid">
      <form className="panel entry-panel" onSubmit={e=>{e.preventDefault();onCreate(saved(),variant)}}><span className="panel-icon">✦</span><h2>Create a table</h2><p>Host a private game and invite your friends.</p><label htmlFor="name">Your nickname</label><input autoComplete="nickname" id="name" value={name} onChange={e=>setName(e.target.value)} maxLength="20" required placeholder="What should we call you?"/><label htmlFor="variant">Game format</label><select id="variant" value={variant} onChange={e=>setVariant(e.target.value)}><option value="four">4 players · 52 cards</option><option value="six">6 players · 48 cards</option></select><button className="btn primary wide" disabled={busy}>Create private table →</button></form>
      <form className="panel entry-panel" onSubmit={e=>{e.preventDefault();onJoin(saved(),code.trim().toUpperCase())}}><span className="panel-icon">♣</span><h2>Join your friends</h2><p>Enter a table code or open an invitation link.</p><label htmlFor="join-name">Your nickname</label><input id="join-name" value={name} onChange={e=>setName(e.target.value)} maxLength="20" autoComplete="nickname" required placeholder="Your nickname"/><label htmlFor="code">Private room code</label><input id="code" value={code} onChange={e=>setCode(e.target.value)} required placeholder="Paste code from your friend"/><button className="btn outline wide" disabled={busy}>Join table →</button></form>
    </section><div className="how"><span>01 · CREATE A TABLE</span><span>02 · INVITE FRIENDS</span><span>03 · PLAY TOGETHER</span></div>
  </>;
}
function Lobby({data,send,copy}){
  const {players,requiredPlayers,yourSeat,hostSeat}=data;
  return <main className="container"><div className="page-heading"><div><div className="eyebrow">PRIVATE TABLE · {data.variant==='four'?'4':'6'} PLAYERS</div><h1>Gather your players</h1><p>Everyone joins on their own phone. The host starts when the table is full.</p></div><div className="room-tag"><small>ROOM CODE</small><strong>{data.roomId}</strong></div></div>
  <section className="panel lobby-panel"><div className="lobby-head"><h2>Seats filled <span>{players.length} / {requiredPlayers}</span></h2><button className="btn subtle" onClick={copy}>Copy invite link</button></div><div className="seat-grid">{Array.from({length:requiredPlayers},(_,i)=>{
      const p=players.find(x=>x.seat===i);
      return <div key={i} className="seat-item"><div className={`seat-avatar ${p?'filled':''}`}>{p?.name?.charAt(0).toUpperCase()||i+1}</div><div className="seat-meta"><strong>{p?.name||'Waiting for a player'}</strong><small>{i===hostSeat?'Host · ':''}Seat {i+1}{i===yourSeat?' · You':''}</small></div>{p&&<span className={`status-dot ${p.connected?'online':''}`} title={p.connected?'Connected':'Disconnected'}/>}</div>;
    })}</div><div className="share-box"><span>{['localhost','127.0.0.1'].includes(location.hostname)?'You are on localhost. For phone invites open the game using your Mac Wi-Fi IP on port 5173, then share the room code.':'Send this link through WhatsApp or messages'}</span><code>{location.origin}/?room={data.roomId}</code></div>
  {yourSeat===hostSeat?<button className="btn primary wide" disabled={players.length!==requiredPlayers||players.some(p=>!p.connected)} onClick={()=>send({type:'start'})}>Start game →</button>:<p className="wait-note">Waiting for the host to start the game…</p>}</section></main>;
}
function BidPanel({data,send}){
  const v=data.view, rules=variantRules[data.variant], minimum=(v.highestBid??(rules.min-rules.step))+rules.step;
  const [amount,setAmount]=useState(minimum);
  useEffect(()=>setAmount(minimum),[minimum]);
  const turn=v.activeSeat===data.yourSeat;
  const name=s=>data.players.find(p=>p.seat===s)?.name||`Player ${s+1}`;
  return <section className="panel action-panel"><div className="eyebrow">BIDDING</div><h2>{v.highestBid===null?'The auction is opening':`Highest bid: ${v.highestBid}`}</h2><p>{turn?'Your turn to bid or pass.':`Waiting for ${name(v.activeSeat)}…`}</p>
    {turn&&<div className="bid-row"><input aria-label="Your bid" type="number" min={minimum} max="250" step={rules.step} value={amount} onChange={e=>setAmount(Number(e.target.value))}/><button className="btn primary" disabled={!Number.isInteger(amount)||amount<minimum||amount>250||(amount-rules.min)%rules.step!==0} onClick={()=>send({type:'bid',amount})}>Place bid</button><button className="btn outline" disabled={v.highestBid===null} onClick={()=>send({type:'pass'})}>Pass</button></div>}
    <div className="auction-log">{v.auction.slice(-10).map((a,i)=><span key={i}>{name(a.seat)}: {a.type==='pass'?'Pass':a.amount}</span>)}</div>
  </section>;
}
function CallPanel({data,send}){
  const v=data.view, turn=v.activeSeat===data.yourSeat;
  const [trump,setTrump]=useState('S'),[first,setFirst]=useState(''),[second,setSecond]=useState('');
  const opts=useMemo(()=>everyCard(data.variant).filter(c=>!v.hand.includes(c)),[data.variant,v.hand]);
  useEffect(()=>{setFirst(opts[0]||'');setSecond(opts[1]||'');},[v.handNumber]);
  const cards=data.variant==='four'?[first]:[first,second];
  return <section className="panel action-panel"><div className="eyebrow">CONTRACT · {v.highestBid} POINTS</div><h2>Select trump and partner{data.variant==='six'?'s':''}</h2><p>{turn?'Call cards not in your hand. Only the holder will know their role.':'Waiting for the winning bidder…'}</p>
    {turn&&<><label htmlFor="trump">Trump suit</label><select id="trump" value={trump} onChange={e=>setTrump(e.target.value)}>{['S','H','D','C'].map(s=><option value={s} key={s}>{symbols[s]} {suitNames[s]}</option>)}{data.variant==='six'&&<><option value="NT">No Trump</option><option value="DUGGI">Duggi (low card wins)</option></>}</select>
    <label htmlFor="call1">Call partner card</label><select id="call1" value={first} onChange={e=>setFirst(e.target.value)}>{opts.map(c=><option value={c} key={c}>{label(c)}</option>)}</select>
    {data.variant==='six'&&<><label htmlFor="call2">Call second partner card</label><select id="call2" value={second} onChange={e=>setSecond(e.target.value)}>{opts.map(c=><option value={c} key={c}>{label(c)}</option>)}</select></>}
    <button className="btn primary wide call-button" disabled={cards.some(c=>!c)||new Set(cards).size!==cards.length} onClick={()=>send({type:'call',trump,cards})}>Confirm contract →</button></>}
  </section>;
}
function PlayPanel({data,send,selected,setSelected}){
  const v=data.view, turn=v.activeSeat===data.yourSeat, legal=new Set(data.legalCards);
  const activeSelected=legal.has(selected)?selected:null;
  const name=s=>data.players.find(p=>p.seat===s)?.name||`Seat ${s+1}`;
  return <><section className="play-zone"><div className="felt-head"><div><small>TRUMP</small><strong>{suitNames[v.trump]||({'NT':'No Trump','DUGGI':'Duggi'}[v.trump])||'—'}</strong></div><div><small>CONTRACT</small><strong>{v.highestBid} pts</strong></div><div><small>CAPTURED</small><strong>{v.capturedBySeat.reduce((a,b)=>a+b,0)} / 250</strong></div></div>
    <div className="felt-table"><div className="table-ring"><span className="centre-label">TRICK {v.completedTricks.length+1} / {data.variant==='four'?13:8}</span>{v.currentTrick.length?<div className="trick-cards">{v.currentTrick.map(p=><div key={p.seat} className="trick-card"><span>{name(p.seat)}</span><Card compact id={p.card}/></div>)}</div>:<div className="empty-trick">Awaiting the lead card</div>}</div></div><div className={`turn-banner ${turn?'your-turn':''}`}>{turn?'✦ Your turn — select a card':`${name(v.activeSeat)} is playing…`}</div>
  </section><section className="your-hand panel"><div className="hand-head"><div><h2>Your hand</h2><p>{turn?'Only valid cards are selectable.':'Your cards are private.'}</p></div><span className="card-count">{v.hand.length} cards</span></div><div className="hand-cards">{[...v.hand].sort((a,b)=>'SHDC'.indexOf(a[0])-'SHDC'.indexOf(b[0])||Number(a.split(':')[1])-Number(b.split(':')[1])).map(c=><Card id={c} key={c} selected={activeSelected===c} disabled={!turn||!legal.has(c)} onClick={()=>setSelected(c)}/>)}</div><button className="btn primary play-action" disabled={!activeSelected} onClick={()=>{send({type:'play',card:activeSelected});setSelected(null);}}>Play {activeSelected?label(activeSelected):'selected card'} →</button></section></>;
}
function Results({data,send}){
  const v=data.view,r=v.result,name=s=>data.players.find(p=>p.seat===s)?.name||`Player ${s+1}`;
  return <section className="panel action-panel results"><div className="eyebrow">HAND {v.handNumber} COMPLETE</div><h2>{r.succeeded?'Contract made!':'Contract defeated!'}</h2><p>Bid {r.bid} by {name(r.bidder)}. The bidding side collected {r.capturedBiddingTeam} points; defenders collected {r.capturedDefenders}.</p><div className="results-number">+{r.awardedPoints}<span> per player on the winning side</span></div><p>Bidder’s team: {r.biddingTeam.map(name).join(', ')}</p><p>Winning team: <strong>{r.winningTeam==='bidder'?'Bidder and partners':'Defenders'}</strong></p>{data.yourSeat===0?<button className="btn primary wide" onClick={()=>send({type:'nextHand'})}>Deal next hand →</button>:<div className="wait-note">Waiting for host to deal…</div>}</section>;
}
function Table({data,send,copy,selected,setSelected}){
  const v=data.view, turn=v.activeSeat===data.yourSeat;
  const names={bidder:'You won the bid','secret-partner':'You are a secret partner',defender:'You are defending',undetermined:'Bidding in progress'};
  return <main className="container match-page"><div className="page-heading"><div><div className="eyebrow">ROOM {data.roomId} · HAND {v.handNumber}</div><h1>KaliTiri table</h1></div><button className="btn subtle" onClick={copy}>Share invite</button></div><div className="match-layout"><div className="main-table">
    <div className={`players-ribbon players-${data.requiredPlayers}`}>{data.players.map(p=><div className={`player-chip ${p.seat===v.activeSeat?'active':''} ${p.seat===data.yourSeat?'self':''}`} key={p.seat}><span className="player-bubble">{p.name[0].toUpperCase()}</span><span className="chip-info"><strong>{p.name}{p.seat===data.yourSeat?' (you)':''}</strong><small>{p.connected?'Connected':'Offline'} · {v.opponentCardCounts[p.seat]??v.hand.length} cards</small></span></div>)}</div>
    {v.phase==='bidding'&&<BidPanel data={data} send={send}/>}
    {v.phase==='calling'&&<CallPanel data={data} send={send}/>}
    {v.phase==='playing'&&<PlayPanel data={data} send={send} selected={selected} setSelected={setSelected}/>}
    {v.phase==='complete'&&<Results data={data} send={send}/>}
    {(v.phase==='bidding'||v.phase==='calling')&&<div className="your-hand panel"><div className="hand-head"><div><h2>Your hand</h2><p>Examine your cards before making a decision.</p></div></div><div className="hand-cards">{v.hand.map(c=><Card key={c} id={c}/>)}</div></div>}
  </div><aside className="sidebar"><section className="panel score-panel"><h2>Scoreboard</h2>{data.players.map(p=><div className="score-row" key={p.seat}><span>{p.name}</span><strong>{data.scores[p.seat]??0}</strong></div>)}<p className="score-hint">Scores are awarded after every completed hand.</p></section><section className="panel"><h2>At a glance</h2><p className="side-role">{names[v.yourRole]}</p><p className="score-hint">{v.phase==='playing'?(turn?'Your turn to play.':'The table is waiting for the active player.'):'You can check the last bids and your own cards.'}</p>{v.calledCards.length>0&&<p className="score-hint">Called: {v.calledCards.map(label).join(', ')}</p>}</section></aside></div></main>;
}
export function App(){
  const client=useMemo(()=>new Client(url),[]);
  const room=useRef(null);
  const [info,setInfo]=useState(null),[snapshot,setSnapshot]=useState(null),[busy,setBusy]=useState(false),[status,setStatus]=useState('Disconnected'),[error,setError]=useState(''),[selected,setSelected]=useState(null);
  function attach(r,codeHint='') {
    room.current=r;
    const code=codeHint||roomFromLink;
    setInfo({id:code||r.roomId});setBusy(false);setStatus('Connected');setError('');
    r.onMessage('identity',identity=>{
      const stableCode=identity.code;
      // Keep both identities on this device. SDK token works during brief outages;
      // private seat token is the fallback after a server restart.
      localStorage.setItem(seatKey(stableCode),identity.seatToken);
      localStorage.setItem(rejoinKey(stableCode),r.reconnectionToken);
      setInfo({id:stableCode});
      history.replaceState(null,'',`/?room=${encodeURIComponent(stableCode)}`);
    });
    r.onMessage('snapshot',incoming=>{
      const stableCode=incoming.code||codeHint||r.roomId;
      setInfo({id:stableCode});
      history.replaceState(null,'',`/?room=${encodeURIComponent(stableCode)}`);
      setSnapshot({...incoming,roomId:stableCode});
      setSelected(prev=>incoming.legalCards.includes(prev)?prev:null);
    });
    r.onMessage('command-result',response=>{setBusy(false);if(!response.ok){setError(response.message||'Unable to do that.');r.send('sync');}});
    r.onMessage('table-error',response=>setError(response.message));
    r.onDrop(()=>{setStatus('Reconnecting');setBusy(false);});
    r.onReconnect(()=>{
      setStatus('Connected');setBusy(false);
      const stableCode=new URLSearchParams(location.search).get('room');
      if(stableCode)localStorage.setItem(rejoinKey(stableCode),r.reconnectionToken);
      r.send('sync');
    });
    r.onLeave(()=>{
      if(room.current!==r)return;
      setStatus('Disconnected');setError('Connection ended. Use Restore my seat to return.');
      room.current=null;setInfo(null);setSnapshot(null);setBusy(false);
    });
    r.onError((code,message)=>setError(`Connection error: ${message||code}`));
    r.send('sync');
  }
  async function restore(code=roomFromLink) {
    if(!code||room.current)return;
    const stableCode=code.trim().toUpperCase();
    const seatToken=localStorage.getItem(seatKey(stableCode));
    if(!seatToken)return;
    setBusy(true);setStatus('Reconnecting');setError('');
    try {
      const sdkToken=localStorage.getItem(rejoinKey(stableCode));
      if(sdkToken) {
        try {const r=await client.reconnect(sdkToken);attach(r,stableCode);return;}
        catch {localStorage.removeItem(rejoinKey(stableCode));}
      }
      // Colyseus roomId changed after restart. Resolve stable code to a new roomId,
      // then reclaim the existing hand with a private token (never nickname alone).
      const resolvedRoom=await lookupRoom(stableCode,seatToken);
      const r=await client.joinById(resolvedRoom,{seatToken});
      attach(r,stableCode);
    }catch(e){setBusy(false);setStatus('Disconnected');setError(e.message||'Unable to restore your seat.');}
  }
  useEffect(()=>{if(roomFromLink && localStorage.getItem(seatKey(roomFromLink)))restore(roomFromLink);},[client]);
  async function connect(method,name,arg){
    setBusy(true);setError('');setStatus('Connecting');
    try {
      if(method==='join'){
        const code=arg.trim().toUpperCase();
        const seatToken=localStorage.getItem(seatKey(code))||'';
        const actualRoomId=await lookupRoom(code,seatToken);
        const r=await client.joinById(actualRoomId,seatToken?{seatToken}:{name});
        attach(r,code);
      }else{
        const r=await client.create('kalitiri',{name,variant:arg});
        attach(r);
      }
    }catch(e){setError(e.message||'Could not connect to this room.');setStatus('Disconnected');setBusy(false);}
  }
  function send(action){
    if(!room.current||!snapshot||busy)return;
    setBusy(true);setError('');
    room.current.send('command',{commandId:crypto.randomUUID(),expectedVersion:snapshot.version,action});
  }
  async function copy(){
    const localOnly=['localhost','127.0.0.1'].includes(location.hostname);
    const link=`${location.origin}/?room=${encodeURIComponent(info.id)}`;
    if(localOnly){
      try{await navigator.clipboard.writeText(info.id);}catch{}
      setError('Localhost works only on your Mac. Room code: '+info.id+'. To share a phone link, open the game using your Mac Wi-Fi IP on port 5173.');
      return;
    }
    try{await navigator.clipboard.writeText(link);setError('Invitation link copied.');}
    catch{setError(`Share this URL: ${link}`);}
  }
  return <div className="app"><header className="site-header"><Logo/><span className="header-detail">THE GAME NIGHT TABLE</span><ConnectionPill status={status}/></header>
    {error&&<div className="notice" role="status"><span>{error}</span><button aria-label="Dismiss message" onClick={()=>setError('')}>×</button></div>}
    {!snapshot && roomFromLink && localStorage.getItem(seatKey(roomFromLink)) && !busy && <div className="notice" role="status"><span>Your saved seat can be restored even after a server restart.</span><button className="btn outline" onClick={()=>restore(roomFromLink)}>Restore my seat</button></div>}
    {!snapshot?<Home invite={roomFromLink} busy={busy} onCreate={(name,variant)=>connect('create',name,variant)} onJoin={(name,code)=>connect('join',name,code)}/>:snapshot.started?<Table data={snapshot} send={send} copy={copy} selected={selected} setSelected={setSelected}/>:<Lobby data={snapshot} send={send} copy={copy}/>}
    {busy&&<div className="busy" aria-live="polite">Connecting / processing…</div>}
    <footer>© KaliTiri · Private multiplayer preview · Rules are subject to house variations</footer>
  </div>;
}
