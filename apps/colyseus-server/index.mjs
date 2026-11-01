import {defineServer, defineRoom, matchMaker} from 'colyseus';
import express from 'express';
import {resolve} from 'node:path';
import {existsSync} from 'node:fs';
import {KaliTiriRoom} from './KaliTiriRoom.mjs';
import {tableStore,activeRoomId,validateTableCode,INTERNAL_RESTORE_KEY} from './registry.mjs';
import {DurableTable} from './durable-table.mjs';

const port=Number(process.env.PORT||2567);
const recovering=new Map();
async function resolveRoom(code) {
  if(!tableStore.exists(code)) return null;
  const existing=activeRoomId(code);
  if(existing) {
    try {if(await matchMaker.getRoomById(existing)) return existing;} catch {}
  }
  if(recovering.has(code)) return recovering.get(code);
  const work=(async()=>{
    const room=await matchMaker.createRoom('kalitiri',{restoreCode:code,restoreKey:INTERNAL_RESTORE_KEY});
    return room.roomId;
  })();
  recovering.set(code,work);
  try{return await work;}finally{recovering.delete(code);}
}
const frontend=resolve('apps/react-web/dist');
const appServer=defineServer({
  rooms:{kalitiri:defineRoom(KaliTiriRoom)},
  express:app=>{
    app.disable('x-powered-by');
    app.use(express.json({limit:'1kb'}));
    app.get('/health',(_req,res)=>res.json({ok:true,service:'kalitiri',version:'0.4.0'}));
    app.post('/api/resolve',async(req,res)=>{
      try {
        const {code,seatToken}=req.body||{};
        if(!validateTableCode(code)) return res.status(400).json({error:'Invalid table code.'});
        const saved=tableStore.load(code);
        if(!saved) return res.status(404).json({error:'Table not found.'});
        // Live socket attach ALSO authenticates. Prevent room lookup for private started matches.
        const state=new DurableTableView(saved);
        if(!state.canResolve(seatToken)) return res.status(403).json({error:'A valid saved seat token is required to return to this table.'});
        const roomId=await resolveRoom(code);
        res.set('Cache-Control','no-store');
        return res.json({roomId,code});
      }catch(err){console.error('Resolve failed',err.message);return res.status(503).json({error:'Table recovery is currently unavailable.'});}
    });
    if(existsSync(frontend)) {
      app.use(express.static(frontend,{index:false}));
      app.use((req,res,next)=>{
        if(req.method==='GET' && !req.path.startsWith('/api/') && req.headers.accept?.includes('text/html')) {
          return res.sendFile(resolve(frontend,'index.html'));
        }
        next();
      });
    }
  },
});
// Read-only authorization avoids loading/rewriting a saved game just to resolve its code.
class DurableTableView {
  constructor(record){this.record=record;}
  canResolve(token){
    if(!this.record.table.wasStarted) return true;
    // Compare in constant time via the same credential helper without exposing seat identity.
    return DurableTable.prototype.tokenSeat.call({credentials:this.record.credentials},token)!==null;
  }
}
await appServer.listen(port);
console.log(`KaliTiri server ready on ${port} (storage: ${tableStore.directory})`);
