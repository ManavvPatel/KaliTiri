/**
 * Transport-free, authoritative room controller. This is deliberately independent
 * of Colyseus so its legality and privacy can be tested without sockets.
 */
import { randomInt } from 'node:crypto';
import {
  FOUR_PLAYER, SIX_PLAYER, createMatch, applyMatchAction,
  nextHand, viewForSeat, viewerLegalCards, auditHand, GameRuleError,
} from '../../packages/game-core/dist/index.js';

export class SessionError extends Error {
  constructor(code, message) { super(message); this.name = 'SessionError'; this.code = code; }
}
const assert = (yes, code, reason) => { if (!yes) throw new SessionError(code, reason); };
const cardId = v => typeof v === 'string' && /^(C|D|H|S):(2|3|4|5|6|7|8|9|10|11|12|13|14)$/.test(v);
export function nickname(input) {
  assert(typeof input === 'string', 'INVALID_NAME', 'Enter a nickname.');
  const name = input.replace(/\s+/g, ' ').trim();
  assert(name.length > 0 && name.length <= 20 && !/[<>\x00-\x1f\x7f]/.test(name),
    'INVALID_NAME', 'Nickname must be 1–20 characters without markup.');
  return name;
}
export function actionForSeat(value, seat) {
  assert(value && typeof value === 'object' && !Array.isArray(value), 'INVALID_ACTION', 'Invalid action.');
  switch (value.type) {
    case 'bid':
      assert(Number.isInteger(value.amount), 'INVALID_BID', 'Bid must be an integer.');
      return { type: 'bid', seat, amount: value.amount };
    case 'pass': return { type: 'pass', seat };
    case 'play':
      assert(cardId(value.card), 'INVALID_CARD', 'Invalid card.');
      return { type: 'play', seat, card: value.card };
    case 'call':
      assert(['C','D','H','S','NT','DUGGI'].includes(value.trump), 'INVALID_TRUMP', 'Invalid trump mode.');
      assert(Array.isArray(value.cards) && value.cards.length <= 2 && value.cards.every(cardId),
        'INVALID_CALL', 'Invalid called-card list.');
      return { type: 'call', seat, trump: value.trump, cards: value.cards };
    default: throw new SessionError('INVALID_ACTION', 'Unsupported game action.');
  }
}

export class TableSession {
  constructor(variant = 'four', rng = randomInt) {
    assert(variant === 'four' || variant === 'six', 'INVALID_VARIANT', 'Select 4 or 6 players.');
    this.variant = variant;
    this.rules = variant === 'four' ? FOUR_PLAYER : SIX_PLAYER;
    this.rng = rng;
    this.players = [];
    this.match = null;
    this.version = 0;
    this.wasStarted = false;
    this.history = new Map();
  }
  /** Store full authoritative data on the SERVER ONLY; never send this object to clients. */
  exportState() {
    return {
      variant:this.variant, version:this.version, wasStarted:this.wasStarted,
      players:this.players.map(p=>({...p})), match:this.match,
      history:[...this.history].map(([id, commands])=>[id,[...commands]]),
    };
  }
  static fromState(saved, rng=randomInt) {
    assert(saved && ['four','six'].includes(saved.variant), 'BAD_SAVE','Invalid saved variant.');
    const table = new TableSession(saved.variant,rng);
    assert(Number.isSafeInteger(saved.version) && saved.version>=0 && typeof saved.wasStarted==='boolean', 'BAD_SAVE','Invalid saved version.');
    assert(Array.isArray(saved.players) && saved.players.length<=table.rules.players,'BAD_SAVE','Invalid player roster.');
    const ids=new Set();
    saved.players.forEach((p,i)=>{
      assert(p && typeof p.sessionId==='string' && p.sessionId.length>=8 && !ids.has(p.sessionId) && p.seat===i,
        'BAD_SAVE','Invalid seat identity.');
      nickname(p.name);ids.add(p.sessionId);
    });
    assert((saved.wasStarted && saved.match && saved.players.length===table.rules.players) ||
      (!saved.wasStarted && !saved.match),'BAD_SAVE','Invalid saved match.');
    if (saved.match) {
      assert(saved.match.rules?.id===table.rules.id && saved.match.hand?.rules?.id===table.rules.id &&
        Array.isArray(saved.match.scores) && saved.match.scores.length===table.rules.players,
        'BAD_SAVE','Saved rule preset mismatch.');
      auditHand(saved.match.hand);
    }
    table.players=saved.players.map(p=>({...p,connected:false})); // connections are always ephemeral
    table.match=saved.match || null;
    table.wasStarted=saved.wasStarted;
    table.version=saved.version+1; // invalidate stale commands from before restart
    table.history=new Map();
    for (const [id,commands] of (saved.history||[])) {
      if (!ids.has(id) || !Array.isArray(commands)) throw new SessionError('BAD_SAVE','Invalid saved command history.');
      table.history.set(id,new Map(commands.slice(-100)));
    }
    for (const id of ids) if (!table.history.has(id)) table.history.set(id,new Map());
    return table;
  }
  find(sessionId) {
    const player = this.players.find(p => p.sessionId === sessionId);
    assert(player, 'NOT_SEATED', 'You are not seated at this table.');
    return player;
  }
  join(sessionId, name) {
    assert(!this.wasStarted, 'GAME_STARTED', 'This table already started.');
    assert(!this.players.some(p => p.sessionId === sessionId), 'DUPLICATE_SEAT', 'Already joined.');
    assert(this.players.length < this.rules.players, 'ROOM_FULL', 'The table is full.');
    const player = {sessionId, seat: this.players.length, name: nickname(name), connected: true};
    this.players.push(player);
    this.history.set(sessionId, new Map());
    this.version++;
    return player.seat;
  }
  connection(sessionId, connected) {
    const player = this.find(sessionId);
    if (player.connected !== connected) { player.connected = connected; this.version++; }
  }
  leave(sessionId) {
    const index = this.players.findIndex(p => p.sessionId === sessionId);
    if (index < 0) return;
    if (this.wasStarted) {
      this.connection(sessionId, false);
      return; // seat stays reserved; the game never reassigns a dealt hand
    }
    this.players.splice(index, 1);
    this.history.delete(sessionId);
    this.players.forEach((p, seat) => {p.seat = seat;});
    this.version++;
  }
  snapshot(sessionId) {
    const player = this.find(sessionId);
    const hand = this.match?.hand;
    // Only whitelisted fields. Never send the engine's full match or hand state.
    return {
      version: this.version,
      variant: this.variant,
      yourSeat: player.seat,
      hostSeat: 0,
      requiredPlayers: this.rules.players,
      started: this.wasStarted,
      players: this.players.map(p => ({seat:p.seat, name:p.name, connected:p.connected})),
      scores: this.match ? [...this.match.scores] : Array(this.rules.players).fill(0),
      view: hand ? viewForSeat(hand, player.seat) : null,
      legalCards: hand ? viewerLegalCards(hand, player.seat) : [],
    };
  }
  command(sessionId, payload) {
    const player = this.find(sessionId);
    assert(payload && typeof payload === 'object', 'INVALID_COMMAND', 'Missing command payload.');
    const {commandId, expectedVersion, action} = payload;
    assert(typeof commandId === 'string' && /^[\w-]{8,80}$/.test(commandId),
      'INVALID_COMMAND', 'Each command requires an ID.');
    const seen = this.history.get(sessionId);
    if (seen.has(commandId)) return {...seen.get(commandId), duplicated:true};
    assert(Number.isSafeInteger(expectedVersion) && expectedVersion === this.version,
      'STALE_STATE', 'The table changed. Try again with the latest state.');
    assert(action && typeof action === 'object', 'INVALID_ACTION', 'No action supplied.');
    if (action.type === 'start') {
      assert(player.seat === 0, 'NOT_HOST', 'Only the host can start the hand.');
      assert(!this.wasStarted, 'ALREADY_STARTED', 'The match has already begun.');
      assert(this.players.length === this.rules.players && this.players.every(p => p.connected),
        'NOT_READY', 'All players must be connected before starting.');
      this.match = createMatch(this.rules, 0, this.rng);
      this.wasStarted = true;
    } else if (action.type === 'nextHand') {
      assert(player.seat === 0, 'NOT_HOST', 'Only the host may deal the next hand.');
      assert(this.match?.hand.phase === 'complete', 'HAND_INCOMPLETE', 'Finish the current hand first.');
      this.match = nextHand(this.match, this.rng);
    } else {
      assert(this.match, 'NOT_STARTED', 'The match has not started.');
      try { this.match = applyMatchAction(this.match, actionForSeat(action, player.seat)); }
      catch (error) {
        if (error instanceof GameRuleError) throw new SessionError(error.code, error.message);
        throw error;
      }
    }
    this.version++;
    const result = {ok:true,version:this.version};
    seen.set(commandId,result);
    if (seen.size > 100) seen.delete(seen.keys().next().value);
    return result;
  }
}
