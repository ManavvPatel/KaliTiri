/** Single-process durable snapshot store. Use an actual persisted volume in production. */
import {randomBytes} from 'node:crypto';
import {existsSync, mkdirSync, openSync, closeSync, writeFileSync, readFileSync, renameSync, unlinkSync, fsyncSync} from 'node:fs';
import {resolve, join} from 'node:path';

export const CODE_PATTERN = /^[A-HJ-NP-Z2-9]{8}$/; // no 0/O/1/I
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function newTableCode() {
  const bytes = randomBytes(8);
  return [...bytes].map(v => ALPHABET[v % ALPHABET.length]).join('');
}
export class DiskTableStore {
  constructor(directory = process.env.KALITIRI_DATA_DIR || './data/tables') {
    this.directory = resolve(directory);
    mkdirSync(this.directory, {recursive:true, mode:0o700});
  }
  filename(code) {
    if (!CODE_PATTERN.test(code)) throw new Error('Invalid table code');
    return join(this.directory, `${code}.json`);
  }
  exists(code) {return existsSync(this.filename(code));}
  load(code) {
    try {
      const data = JSON.parse(readFileSync(this.filename(code), 'utf8'));
      if (data.schemaVersion !== 1 || data.code !== code || !['four','six'].includes(data.variant) ||
          !data.table || !Array.isArray(data.credentials)) throw new Error('Invalid table snapshot schema');
      return data;
    } catch (err) {
      if (err.code === 'ENOENT') return null;
      throw err;
    }
  }
  save(record) {
    if (record.schemaVersion !== 1 || record.table?.variant !== record.variant) throw new Error('Invalid snapshot');
    const dest = this.filename(record.code);
    const tmp = join(this.directory, `.${record.code}-${randomBytes(8).toString('hex')}.tmp`);
    let fd;
    try {
      fd = openSync(tmp, 'wx', 0o600);
      writeFileSync(fd, JSON.stringify(record));
      fsyncSync(fd);
      closeSync(fd); fd = undefined;
      renameSync(tmp, dest);
      // Directory metadata sync, supported on Linux/macOS.
      try { const dirFd = openSync(this.directory, 'r'); try {fsyncSync(dirFd);} finally {closeSync(dirFd);} } catch { /* best effort */ }
    } finally {
      if (fd !== undefined) closeSync(fd);
      if (existsSync(tmp)) unlinkSync(tmp);
    }
  }
  generateUniqueCode() {
    for (let i=0;i<30;i++) {const code=newTableCode();if (!this.exists(code)) return code;}
    throw new Error('Could not allocate a unique table code');
  }
}
