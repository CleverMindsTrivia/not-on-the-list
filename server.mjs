import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { randomBytes, randomInt } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { createGame, activePlayer, rollDie, moveGuest, eliminateGuest, sendGuestHome, legalDestinations, eligibleTargets, ROOMS } from './rules.mjs';

const PORT=Number(process.env.PORT||3000), root=resolve('public');
const rooms=new Map();
// Avoid repeating a player's costume across consecutive games while this server is running.
const recentCostumes=new Map();
const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const code=()=>Array.from({length:6},()=>chars[randomInt(chars.length)]).join('');
const token=()=>randomBytes(24).toString('hex');
const send=(ws,type,data={})=>{ if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type,...data})); };
const current=(lobby)=>lobby.game ? activePlayer(lobby.game) : null;
const publicState=(lobby,seat)=>{
 const g=lobby.game, host=lobby.seats[0];
 const state={code:lobby.code,phase:g?.phase||'lobby',seats:lobby.seats.map(s=>({id:s.id,name:s.name,online:!!s.ws&&s.ws.readyState===WebSocket.OPEN})),hostId:host?.id,viewerId:seat?.id||null,display:!seat,rooms:ROOMS};
 if(g){state.game={phase:g.phase,guests:g.guests,players:g.players.map(p=>({id:p.id,name:p.name,alive:p.alive,draws:p.draws})),activeId:g.players[g.activeIndex].id,roll:g.roll,turn:g.turn,log:g.log.slice(0,20),winner:g.winner,winnerCharacterId:g.phase==='over'&&g.winner!=null?g.players.find(p=>p.id===g.winner)?.characterId:null};
  if(seat){const p=g.players.find(p=>p.id===seat.id);state.private={characterId:p?.characterId||null,legalTargets:p?.id===current(lobby)?.id&&g.roll==='black'?eligibleTargets(g).map(x=>x.id):[],legalMoves:p?.id===current(lobby)?.id&&g.roll&&g.roll!=='black'?g.guests.filter(x=>x.status==='party').flatMap(x=>legalDestinations(g,x.id).map(dest=>({guestId:x.id,destination:dest}))):[]};}
 }
 return state;
};
function broadcast(lobby){for(const s of lobby.seats)if(s.ws)send(s.ws,'state',{state:publicState(lobby,s)});for(const ws of lobby.spectators)send(ws,'state',{state:publicState(lobby,null)});}
function fail(ws,message){send(ws,'error',{message});}
function validName(name){return typeof name==='string'&&name.trim().length>=1&&name.trim().length<=22 ? name.trim():null;}
function dropConnection(ws){const meta=ws.meta;if(!meta)return;const lobby=rooms.get(meta.code);if(!lobby)return;if(meta.spectator)lobby.spectators.delete(ws);else {const seat=lobby.seats.find(s=>s.id===meta.id);if(seat?.ws===ws)seat.ws=null;}broadcast(lobby);}
function bind(ws,lobby,seat=null){dropConnection(ws);ws.meta={code:lobby.code,id:seat?.id||null,spectator:!seat};if(seat){seat.ws?.close(4001,'Rejoined elsewhere');seat.ws=ws;}else lobby.spectators.add(ws);broadcast(lobby);send(ws,'joined',{code:lobby.code,token:seat?.token||null});}
function handle(ws,msg){const action=msg.type;
 if(action==='create') {const name=validName(msg.name);if(!name)throw Error('Enter a name (1–22 characters).');let key;do{key=code()}while(rooms.has(key));const lobby={code:key,seats:[{id:1,name,token:token(),ws:null}],spectators:new Set(),game:null,created:Date.now()};rooms.set(key,lobby);bind(ws,lobby,lobby.seats[0]);return;}
 if(action==='join'){const lobby=rooms.get(String(msg.code||'').trim().toUpperCase());if(!lobby)throw Error('That party code was not found.');if(lobby.game)throw Error('This party has already started.');if(lobby.seats.length>=8)throw Error('This party is full (8 players).');const name=validName(msg.name);if(!name)throw Error('Enter a name (1–22 characters).');if(lobby.seats.some(s=>s.name.toLowerCase()===name.toLowerCase()))throw Error('That name is already taken.');const seat={id:lobby.seats.length+1,name,token:token(),ws:null};lobby.seats.push(seat);bind(ws,lobby,seat);return;}
 if(action==='reconnect'){const lobby=rooms.get(String(msg.code||'').toUpperCase());const seat=lobby?.seats.find(s=>s.token===msg.token);if(!seat)throw Error('Your saved session was not found. Rejoin before the game starts.');bind(ws,lobby,seat);return;}
 if(action==='watch'){const lobby=rooms.get(String(msg.code||'').trim().toUpperCase());if(!lobby)throw Error('Party not found.');bind(ws,lobby);return;}
 const meta=ws.meta,lobby=rooms.get(meta?.code),seat=lobby?.seats.find(s=>s.id===meta?.id);if(!lobby||!seat||seat.ws!==ws)throw Error('You must join as a player first.');
 if(action==='start'){if(lobby.seats[0]!==seat)throw Error('Only the host can start.');if(lobby.game)throw Error('The game has already started.');if(lobby.seats.length<2)throw Error('At least two players are required.');lobby.game=createGame(lobby.seats.map(s=>s.name),()=>randomInt(0x100000000)/0x100000000);
 const game=lobby.game;
 // Swap secret assignments when a player drew their immediately previous costume.
 // Swap only player identities, never guest positions or the public deck.
 for(let i=0;i<game.players.length;i++){
  const p=game.players[i],prev=recentCostumes.get(p.name.toLocaleLowerCase());
  if(prev!==p.characterId)continue;
  const other=game.players.find((candidate,j)=>j>i&&candidate.characterId!==prev&&recentCostumes.get(candidate.name.toLocaleLowerCase())!==p.characterId);
  if(other){const temp=p.characterId;p.characterId=other.characterId;other.characterId=temp;}
  else {
   const replacement=game.guests.find(g=>g.id!==prev&&!game.players.some(x=>x.characterId===g.id));
   if(replacement){const oldId=p.characterId;p.characterId=replacement.id;const at=game.deck.indexOf(replacement.id);if(at>=0)game.deck[at]=oldId;}
  }
 }
 for(const p of game.players)recentCostumes.set(p.name.toLocaleLowerCase(),p.characterId);
 broadcast(lobby);return;}
 const g=lobby.game;if(!g||g.phase!=='playing')throw Error('There is no active game.');if(current(lobby)?.id!==seat.id)throw Error('It is not your turn.');
 if(action==='roll')rollDie(g);else if(action==='move')moveGuest(g,msg.guestId,msg.destination);else if(action==='eliminate')eliminateGuest(g,msg.guestId);else if(action==='sendHome')sendGuestHome(g);else throw Error('Unknown game action.');
 broadcast(lobby);
}
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml'};
const server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');let path=resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));if(path!==root&&!path.startsWith(root+sep)){res.writeHead(403).end();return;}const file=await stat(path);if(!file.isFile())throw Error('Not found');res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});res.end(await readFile(path));}catch{res.writeHead(404).end('Not found');}});
const wss=new WebSocketServer({server,maxPayload:8192});
wss.on('connection',(ws)=>{ws.on('message',raw=>{try{const msg=JSON.parse(raw.toString());if(!msg||typeof msg.type!=='string')throw Error('Invalid request.');handle(ws,msg);}catch(e){fail(ws,e.message||'Unable to complete action.');}});ws.on('close',()=>dropConnection(ws));});
// Idle lobbies expire automatically; active games last until process restart or cleanup.
setInterval(()=>{for(const [key,lobby] of rooms)if(Date.now()-lobby.created>24*3600*1000){for(const s of lobby.seats)s.ws?.close();for(const ws of lobby.spectators)ws.close();rooms.delete(key);}},3600*1000).unref();
server.listen(PORT,()=>console.log(`Not on the List listening on http://localhost:${PORT}`));
