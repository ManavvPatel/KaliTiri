import {DiskTableStore, CODE_PATTERN} from './store.mjs';
import {randomBytes} from 'node:crypto';

export const tableStore = new DiskTableStore();
export const INTERNAL_RESTORE_KEY = randomBytes(32).toString('base64url');
const active = new Map();
export function registerTable(code, roomId) {active.set(code,roomId);}
export function unregisterTable(code,roomId) {if(active.get(code)===roomId) active.delete(code);}
export function activeRoomId(code) {return active.get(code);}
export function validateTableCode(code) {return typeof code==='string' && CODE_PATTERN.test(code);}
