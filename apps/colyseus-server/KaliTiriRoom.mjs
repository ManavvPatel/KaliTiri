/** Colyseus authoritative transport adapter. Never broadcast a full match or credential. */
import {Room} from 'colyseus';
import {DurableTable} from './durable-table.mjs';
import {SessionError} from './session.mjs';
import {tableStore,registerTable,unregisterTable,INTERNAL_RESTORE_KEY} from './registry.mjs';

export class KaliTiriRoom extends Room {
  onCreate(options) {
    // Only this process's recovery API may restore an existing table.
    // Never trust restoreCode provided by a client.create() call.
    if(options.restoreCode && options.restoreKey!==INTERNAL_RESTORE_KEY) throw new Error('Unauthorized table restoration');
    this.durable=new DurableTable({store:tableStore,code:options.restoreCode || null,variant:options.variant || 'four'});
    this.maxClients=this.durable.rules.players;
    // Disconnected seats remain reclaimable, including after the short SDK reconnect window expires.
    this.autoDispose=false;
    this.maxMessagesPerSecond=12;
    this.setPrivate(true);
    registerTable(this.durable.code,this.roomId);
    this.onMessage('sync',client=>{this.sendIdentity(client);this.sendSnapshot(client);});
    this.onMessage('command',(client,payload)=>{
      const commandId=typeof payload?.commandId==='string'?payload.commandId:null;
      try {
        const result=this.durable.command(client.sessionId,payload);
        client.send('command-result',{commandId,...result});
        if(!result.duplicated) this.broadcastSnapshots();
      }catch(error) {
        client.send('command-result',{commandId,ok:false,code:error instanceof SessionError?error.code:'SERVER_ERROR',
          message:error instanceof SessionError?error.message:'Could not save or process your move.'});
      }
    });
  }
  onAuth(_client,options) {
    if(!this.durable.mayEnter(options)) throw new Error('Table is full or seat token is invalid.');
    return true;
  }
  onJoin(client,options) {
    try {
      const identity=this.durable.attach(client.sessionId,options);
      client.userIdentity=identity;
      this.sendIdentity(client);
      this.broadcastSnapshots();
    }catch(error) {
      client.send('table-error',{message:error.message});
      client.leave();
    }
  }
  sendIdentity(client) {
    if(!client.userIdentity) return;
    // Send ONLY to the authenticated socket; never in shared state/snapshots.
    client.send('identity',{code:this.durable.code,seatToken:client.userIdentity.seatToken});
  }
  sendSnapshot(client) {
    try {client.send('snapshot',this.durable.snapshot(client.sessionId));}
    catch { /* disconnected or unseated */ }
  }
  broadcastSnapshots() {for(const client of this.clients) this.sendSnapshot(client);}
  onDrop(client) {
    try {this.durable.markConnected(client.sessionId,false);}catch{}
    this.broadcastSnapshots();
    // Colyseus reconnect token: short outage. Private seatToken: longer outage/restart.
    this.allowReconnection(client,300).catch(()=>{});
  }
  onReconnect(client) {
    try {this.durable.markConnected(client.sessionId,true);}catch{}
    this.sendIdentity(client);
    this.broadcastSnapshots();
  }
  onLeave(client) {
    try {this.durable.detach(client.sessionId);}catch{}
    this.broadcastSnapshots();
  }
  onDispose(){unregisterTable(this.durable.code,this.roomId);}
}
