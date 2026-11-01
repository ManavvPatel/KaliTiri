/** Private seat credentials + safe persisted game controller. */
import {createHash,randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import {TableSession, SessionError, nickname} from './session.mjs';
import {DiskTableStore} from './store.mjs';

const fingerprint = token => createHash('sha256').update(token).digest('hex');
const secureEquals = (a,b) => typeof a === 'string' && typeof b === 'string' &&
  /^[0-9a-f]{64}$/.test(a) && /^[0-9a-f]{64}$/.test(b) && timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));
const makeToken = () => randomBytes(32).toString('base64url');
const validToken = token => typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token);

export class DurableTable {
  constructor({store=new DiskTableStore(),code=null,variant='four',rng}={}) {
    this.store=store;
    this.code=code || store.generateUniqueCode();
    this.bindings=new Map(); // live socket sessionId => persistent seatId
    const saved=code?store.load(code):null;
    if(code && !saved) throw new SessionError('TABLE_NOT_FOUND','This table no longer exists.');
    if(saved) {
      this.variant=saved.variant;
      this.table=TableSession.fromState(saved.table,rng);
      this.credentials=saved.credentials;
      if (this.credentials.length!==this.table.players.length ||
          this.credentials.some((c,i)=>c.seatId!==this.table.players[i].sessionId || !/^[0-9a-f]{64}$/.test(c.tokenHash))) {
        throw new SessionError('BAD_SAVE','Invalid saved credentials.');
      }
      this.persist(); // record offline presence and increment version after restart
    } else {
      this.variant=variant;
      this.table=new TableSession(variant,rng);
      this.credentials=[];
      this.persist();
    }
  }
  record() {return {schemaVersion:1,code:this.code,variant:this.variant,credentials:this.credentials.map(c=>({...c})),table:this.table.exportState()};}
  persist() {this.store.save(this.record());}
  transaction(op) {
    const before=this.record();
    const result=op();
    try {this.persist();}
    catch(err) {
      this.table=TableSession.fromState(before.table,this.table.rng);
      // Preserve the exact pre-operation version and connected status for in-process rollback.
      this.table.version=before.table.version;
      this.table.players=before.table.players;
      this.credentials=before.credentials;
      throw new SessionError('PERSIST_FAILED','Could not safely save game progress. Please try again.');
    }
    return result;
  }
  tokenSeat(token) {
    if(!validToken(token)) return null;
    const digest=fingerprint(token);
    return this.credentials.find(c=>secureEquals(c.tokenHash,digest))?.seatId ?? null;
  }
  mayEnter({name,seatToken}={}) {
    if(this.tokenSeat(seatToken)) return true;
    if(this.table.wasStarted || this.table.players.length >= this.table.rules.players) return false;
    try {nickname(name);return true;}catch{return false;}
  }
  // Credentials are only issued to the socket that proved seat ownership.
  attach(socketId,{name,seatToken}={}) {
    if (this.bindings.has(socketId)) throw new SessionError('DUPLICATE_SOCKET','Socket already connected.');
    const existing=this.tokenSeat(seatToken);
    if (existing) {
      const previous=[...this.bindings].find(([,seatId])=>seatId===existing);
      if(previous && this.table.find(existing).connected) throw new SessionError('SEAT_IN_USE','This seat is active on another device.');
      if(previous) this.bindings.delete(previous[0]);
      this.transaction(()=>this.table.connection(existing,true));
      this.bindings.set(socketId,existing);
      return {seatId:existing,seatToken};
    }
    if (!this.mayEnter({name,seatToken})) throw new SessionError('ROOM_CLOSED','A valid seat token is required, or the table is full.');
    const seatId=randomUUID(), token=makeToken();
    this.transaction(()=>{
      this.table.join(seatId,name);
      this.credentials.push({seatId,tokenHash:fingerprint(token)});
    });
    this.bindings.set(socketId,seatId);
    return {seatId,seatToken:token};
  }
  seatOf(socketId) {
    const id=this.bindings.get(socketId);
    if(!id) throw new SessionError('NOT_SEATED','Socket is not seated.');
    return id;
  }
  snapshot(socketId) {return {...this.table.snapshot(this.seatOf(socketId)),code:this.code};}
  command(socketId,payload) {return this.transaction(()=>this.table.command(this.seatOf(socketId),payload));}
  markConnected(socketId,connected) {this.transaction(()=>this.table.connection(this.seatOf(socketId),connected));}
  detach(socketId) {
    if(!this.bindings.has(socketId)) return;
    const seat=this.bindings.get(socketId);
    this.transaction(()=>this.table.connection(seat,false));
    this.bindings.delete(socketId);
    // Deliberately preserve lobby seats and player tokens across refreshes / restarts.
  }
  get started(){return this.table.wasStarted;}
  get rules(){return this.table.rules;}
}
