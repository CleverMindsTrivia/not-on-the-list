// Optional room-wide WebRTC voice for up to 8 players. Microphone permission is opt-in.
const safe = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function createVoiceChat(send, notify){
 const peers=new Map();
 const members=new Map();
 let local=null, joining=false, joined=false, muted=false, selfId=null, roomCode=null;
 let ctx=null, analyser=null, samples=null, speaking=false, monitor=null, soundBlocked=false;
 const iceServers=[{urls:'stun:stun.l.google.com:19302'}];
 const hub=()=>{let el=document.getElementById('voice-audio-hub');if(!el){el=document.createElement('div');el.id='voice-audio-hub';el.hidden=true;document.body.append(el)}return el};
 function updatePanel(){const el=document.getElementById('party-voice');if(el)el.outerHTML=html();}
 function html(){
  const arr=[...members.values()];
  const people=arr.map(p=>'<div class="voice-person '+(p.speaking&&!p.muted?'voice-speaking':'')+'"><span class="voice-avatar" aria-hidden="true">'+safe((p.name||'?').slice(0,1).toUpperCase())+'</span><span class="voice-person-name">'+safe(p.name)+'</span><span class="voice-person-status">'+(p.muted?'Muted':p.speaking?'Speaking':'Listening')+'</span></div>').join('');
  return '<section class="panel voice-panel" id="party-voice" aria-label="Party voice chat"><div class="voice-header"><h2>🎙️ Party Voice Chat</h2><span class="voice-count">'+arr.length+' in voice</span></div>'+
   '<p class="voice-explain">Talk to everyone in this party. Microphone access is optional.</p>'+
   '<div class="voice-controls">'+(!joined?
   '<button type="button" class="mint" data-action="voiceJoin" '+(joining?'disabled':'')+'>'+(joining?'Connecting…':'Join Voice Chat')+'</button>':
   '<button type="button" class="secondary" data-action="voiceMute">'+(muted?'🎤 Unmute':'🔇 Mute')+'</button><button type="button" class="secondary" data-action="voiceLeave">Leave Voice</button>')+
   (soundBlocked?'<button type="button" class="mint" data-action="voiceResumeAudio">Enable Sound</button>':'')+'</div>'+
   (arr.length?'<div class="voice-people">'+people+'</div>':'<p class="voice-empty">Nobody has joined voice yet.</p>')+
   '<p class="voice-note">Headphones recommended. Audio is peer-to-peer; some networks may require a relay.</p></section>';
 }
 function sendSignal(to,signal){send('voiceSignal',{to,signal});}
 function disposePeer(id){
  const peer=peers.get(id);if(!peer)return;
  peer.pc.onicecandidate=null;peer.pc.ontrack=null;peer.pc.onconnectionstatechange=null;
  peer.pc.close();peer.audio?.remove();peers.delete(id);
 }
 function makePeer(id){
  if(peers.has(id))return peers.get(id);
  const pc=new RTCPeerConnection({iceServers});
  const peer={pc,pending:[],audio:null,offering:false};
  peers.set(id,peer);
  for(const track of local?.getAudioTracks()||[])pc.addTrack(track,local);
  pc.onicecandidate=event=>{if(event.candidate)sendSignal(id,{kind:'ice',candidate:event.candidate.toJSON()});};
  pc.ontrack=event=>{
   let audio=peer.audio;
   if(!audio){audio=document.createElement('audio');audio.autoplay=true;audio.playsInline=true;audio.dataset.peerId=String(id);hub().append(audio);peer.audio=audio;}
   audio.srcObject=event.streams[0]||new MediaStream([event.track]);
   audio.play().then(()=>{soundBlocked=false;updatePanel()}).catch(()=>{soundBlocked=true;updatePanel()});
  };
  pc.onconnectionstatechange=()=>{
   if(pc.connectionState==='failed')notify('Voice connection failed with a player. Try leaving and rejoining voice.');
  };
  return peer;
 }
 async function createOffer(id){
  const p=makePeer(id);
  if(p.offering||p.pc.signalingState!=='stable')return;
  p.offering=true;
  try{
   await p.pc.setLocalDescription(await p.pc.createOffer());
   sendSignal(id,{kind:'offer',description:p.pc.localDescription.toJSON()});
  }catch(err){notify('Unable to connect voice: '+err.message)}
  finally{p.offering=false}
 }
 async function handleSignal(data){
  if(!joined||!local||!members.has(data.from))return;
  const signal=data.signal;if(!signal)return;
  const p=makePeer(data.from);
  try{
   if(signal.kind==='offer'){
    if(p.pc.signalingState!=='stable'){disposePeer(data.from);return handleSignal(data);}
    await p.pc.setRemoteDescription(signal.description);
    for(const candidate of p.pending.splice(0))await p.pc.addIceCandidate(candidate);
    await p.pc.setLocalDescription(await p.pc.createAnswer());
    sendSignal(data.from,{kind:'answer',description:p.pc.localDescription.toJSON()});
   }else if(signal.kind==='answer'){
    if(p.pc.signalingState!=='have-local-offer')return;
    await p.pc.setRemoteDescription(signal.description);
    for(const candidate of p.pending.splice(0))await p.pc.addIceCandidate(candidate);
   }else if(signal.kind==='ice'&&signal.candidate){
    if(p.pc.remoteDescription)await p.pc.addIceCandidate(signal.candidate);
    else p.pending.push(signal.candidate);
   }
  }catch(err){notify('Voice connection error: '+err.message)}
 }
 function setMembers(list){
  members.clear();for(const m of list||[])members.set(m.id,m);
  if(joined){
   for(const id of peers.keys())if(!members.has(id))disposePeer(id);
   for(const m of members.values())if(m.id!==selfId&&selfId<m.id&&!peers.has(m.id))createOffer(m.id);
  }
  updatePanel();
 }
 function startMeter(){
  try{
   ctx=new (window.AudioContext||window.webkitAudioContext)();
   const source=ctx.createMediaStreamSource(local);
   analyser=ctx.createAnalyser();analyser.fftSize=1024;source.connect(analyser);
   samples=new Uint8Array(analyser.fftSize);
   monitor=setInterval(()=>{
    if(!joined||!analyser)return;
    analyser.getByteTimeDomainData(samples);
    let energy=0;for(const n of samples){const x=(n-128)/128;energy+=x*x}
    const active=!muted&&Math.sqrt(energy/samples.length)>.035;
    if(active!==speaking){speaking=active;send('voiceSpeaking',{speaking});}
   },300);
  }catch{ /* Voice still works without level meter on unsupported browsers. */ }
 }
 async function join(){
  if(joined||joining)return;
  if(!selfId||!roomCode)return notify('Join a party before enabling voice.');
  if(!navigator.mediaDevices?.getUserMedia||typeof RTCPeerConnection==='undefined')return notify('Voice requires a secure HTTPS browser with microphone support.');
  joining=true;updatePanel();
  try{
   local=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
   joined=true;muted=false;speaking=false;
   startMeter();send('voiceJoin');
  }catch(err){notify(err.name==='NotAllowedError'?'Microphone permission denied. Allow access in your browser settings.':'Could not start microphone: '+err.message)}
  finally{joining=false;updatePanel();}
 }
 function leave(notifyServer=true){
  if(notifyServer&&joined)send('voiceLeave');
  joined=false;joining=false;muted=false;speaking=false;soundBlocked=false;
  if(monitor){clearInterval(monitor);monitor=null}
  if(ctx){ctx.close().catch(()=>{});ctx=null}
  analyser=null;samples=null;
  for(const id of [...peers.keys()])disposePeer(id);
  for(const track of local?.getTracks()||[])track.stop();
  local=null;members.clear();updatePanel();
 }
 function toggleMute(){
  if(!joined)return;
  muted=!muted;
  for(const track of local?.getAudioTracks()||[])track.enabled=!muted;
  if(muted&&speaking){speaking=false;send('voiceSpeaking',{speaking:false})}
  send('voiceMute',{muted});updatePanel();
 }
 async function resumeAudio(){
  soundBlocked=false;
  for(const audio of hub().querySelectorAll('audio'))try{await audio.play()}catch{soundBlocked=true}
  updatePanel();
 }
 function sessionState(state){
  const code=state?.code||null,id=state&&!state.display?state.viewerId:null;
  if((roomCode&&roomCode!==code)||(selfId&&selfId!==id))leave(false);
  roomCode=code;selfId=id;
 }
 return {html,join,leave,toggleMute,resumeAudio,handleSignal,setMembers,sessionState,
  handleAction(action){
   if(action==='voiceJoin')join();
   else if(action==='voiceLeave')leave();
   else if(action==='voiceMute')toggleMute();
   else if(action==='voiceResumeAudio')resumeAudio();
  }};
}
