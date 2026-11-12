/* =====================================================================
   devtools.js — "Test tools" (God Mode) for playtesting
   Open: the small "Test tools" link on the title card or in the pause menu, the backquote key (`), or ?debug.
   Hide everything: set G.DEVTOOLS=false in core.js (the panel then only exists with ?debug).
   - Start points build a save object and play it through flow.js's applySave (the Continue path), then
     use the real systems (startLoop, G.cave.enter, discover, bait, jar) so quests, HUD, music and saves agree.
     From the title they apply straight away; mid-game the page reloads first so the state is clean.
   - Anything used here switches this session's saves to a separate test slot (bq-save-test-v1);
     the real save (bq-save-v1) is never written while test mode is on.
   ===================================================================== */
(function(){
'use strict';
const G=window.G, THREE=G.THREE, U=G.U, PI=Math.PI;
const ENABLED=!!(G.DEVTOOLS||G.debugUrl);
if(!ENABLED)return;
const V=(x,y,z)=>new THREE.Vector3(x,y,z);
const $=s=>document.getElementById(s);
const LM=()=>(G.world&&G.world.landmarks)||{};
const BOOT_KEY='bq-devtools-boot';
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

const DT=G.devtools={open:false,cheats:{god:false,stamina:false,ether:false,fps:false},starts:null,start:null,
  get test(){return !!G.testSaves;}};

/* ---------------------------------------------------------------- storage (sandboxed iframes may throw) */
function stash(k,v){ for(const st of ['sessionStorage','localStorage']){ try{ window[st].setItem(k,JSON.stringify(v)); return st; }catch(_){} } return null; }
function unstash(k){ for(const st of ['sessionStorage','localStorage']){ try{ const s=window[st].getItem(k); if(s!=null){ window[st].removeItem(k); return JSON.parse(s); } }catch(_){} } return null; }
function peekSave(key){ try{ const d=JSON.parse(localStorage.getItem(key)||'null'); return d&&d.v===1?d:null; }catch(_){ return null; } }
function ago(t){ const m=Math.round((Date.now()-t)/60000); return m<1?'just now':m<60?m+' min ago':m<1440?Math.round(m/60)+' h ago':Math.round(m/1440)+' d ago'; }

/* ---------------------------------------------------------------- test mode */
function testMode(){ if(G.testSaves)return; G.testSaves=true; badge(); render(); }
const anyCheat=()=>Object.keys(DT.cheats).some(k=>k!=='fps'&&DT.cheats[k])||G.timeScale>1;

/* ---------------------------------------------------------------- swarm + lantern */
const SWARM_FREE=new Set(['patch','wander','roost','spot','satchel']);
function carryLantern(){
  const L=G.items.lantern; if(!L.found&&!L.inCradle)return false;
  if(L.carried)return true;
  if(L.inCradle&&!L.cured)return false; // Act 1: the corrupted lantern stays in the lamp once placed
  const pick=G.interact&&G.interact.list&&G.interact.list.find(o=>o.use&&o.use.name==='lanternPickup');
  if(pick){ try{pick.use();}catch(e){console.error(e);} }
  if(!L.carried){ L.carried=true; L.inCradle=false; L.found=true; G.emit('lantern:pickup',{pos:G.player.pos.clone(),devtools:true}); }
  return L.carried;
}
function swarmCount(){ let n=0; for(const m of (G.creatures&&G.creatures.moths)||[]) if(m.tgt==='lantern'||m.tgt==='hunt'||m.tgt==='feed')n++; return n; }
function giveSwarm(n){
  n=n||60; const M=G.moths, ms=(G.creatures&&G.creatures.moths)||[], P=G.player;
  if(!M||!M.toLantern||!ms.length)return 'The moths aren’t awake yet.';
  if(!carryLantern())return 'You need the lantern in hand first.';
  const L=G.items.lantern; if(L.shut){ L.shut=false; G.emit('lantern:shutter',{shut:false,devtools:true}); }
  if(G.loop&&G.loop.active&&M.baitLeft<240)M.bait(240-M.baitLeft); // a cured lantern only keeps a swarm while baited
  let have=swarmCount(); const inCave=!!(G.cave&&G.cave.inside);
  const free=ms.filter(m=>SWARM_FREE.has(m.tgt)&&!m.delay&&(inCave||!m.cave)).sort((a,b)=>a.p.distanceToSquared(P.pos)-b.p.distanceToSquared(P.pos));
  for(const m of free){ if(have>=n)break;
    m.p.set(P.pos.x+(Math.random()-.5)*2.4,P.pos.y+1+Math.random()*1.2,P.pos.z+(Math.random()-.5)*2.4); if(m.v)m.v.set(0,0,0);
    m.next=null; m.delay=0; M.toLantern(m); have++; }
  return have+' moths with you';
}
/* carry the swarm along an island teleport (the cave does this itself on enter/exit) */
function teleportWithSwarm(x,y,z,yaw){
  const P=G.player, from=P.pos.clone();
  P.teleport(x,y,z,yaw);
  const d=P.pos.clone().sub(from), SW=(G.cave&&G.cave.swarmStates)||new Set(['lantern','hunt','feed']);
  for(const m of (G.creatures&&G.creatures.moths)||[]) if(SW.has(m.tgt)&&m.p.distanceTo(from)<45)m.p.add(d);
}

/* ---------------------------------------------------------------- tide */
const TIDE_T={low:125,rising:225,high:0,falling:75};
function setTide(k){
  const A=G.alchemy; if(!A||!A.debug||!A.debug.setTide||!G.tide)return 'No tide yet.';
  const P=300, base=Math.floor((G.tide.t||0)/P)*P; let t=base+TIDE_T[k]; if(t<(G.tide.t||0)-1)t+=P;
  A.debug.setTide(t); return 'Tide: '+k;
}
function tideName(){ const T=G.tide; if(!T)return '—'; if(T.low)return 'low'; if(T.level>.9)return 'high'; return T.rising?'rising':'falling'; }

/* ---------------------------------------------------------------- start points
   Each builds the save a real playthrough would have at that point, then runs it through flow.js. */
const CAVE_ORDER=['mouth','gallery','stair','channel','drafts','arena'];
const SEAL_BEFORE={stair:['gallery'],channel:['gallery'],drafts:['gallery','channel'],arena:['gallery','channel','arena'],after:['gallery','channel','arena']};
const PAGES_BEFORE={mouth:[],gallery:[],stair:[1],channel:[1],drafts:[1,2],arena:[1,2],after:[1,2,3]};
const arr=v=>v?[+v.x.toFixed(2),+v.y.toFixed(2),+v.z.toFixed(2)]:null;
function lhDoorOut(){ const lh=G.world.lighthouse; if(lh&&lh.doorOut)return lh.doorOut.clone(); const l=LM().lighthouse||{x:180,y:42,z:0}; return V(l.x-7,l.y,l.z); }
function base(o){
  const lh=LM().lighthouse||{x:180,y:42,z:0};
  return Object.assign({v:1,at:Date.now(),quiet:true,step:'done',objective:'The lamp burns',sub:'Explore the island freely',target:null,targetName:'',
    cp:[lh.x-8,lh.y,lh.z+2],cpYaw:-PI/2,cpName:'the lighthouse',
    flags:{lanternFound:true,lanternBeat:true},pos:null,yaw:-PI/2,hp:20,maxHp:20, // hp is clamped to the derived maxHp on load: full health
    lantern:{found:true,carried:false,shut:false,cured:true,inCradle:true,pos:null},
    staff:true,cloak:true,lampCured:true,bossDead:true,freed:[],loop:false,mods:{}},o||{});
}
function loopSave(o){
  o=o||{};
  const s=base({loop:true,step:'loop-push',objective:'Push back the fog',sub:'',flags:{lanternFound:true,lanternBeat:true,loop:true}});
  s.mods={
    fog:{ether:o.ether||55,milestones:[],crossed:true,fed:true},
    alchemy:{v:1,inv:Object.assign({glowcap:6,ichor:4,vial:4},o.inv||{}),ether:o.vialEther||24,poured:15,known:o.known||['tincture','bait','ichor'],
      tide:TIDE_T.low,pages:[],regrow:[],S:{poured:true,firsts:{},tidepool:false,grove:false,sighted:{}}},
    moths:{v:1,noticed:true,baitLeft:300,lost:0,seen:[],cured:[],baitedOnce:true,fedOnce:true,progress:{}}
  };
  if(o.lantern)s.lantern={found:true,carried:true,shut:false,cured:true,inCradle:false,pos:null};
  return s;
}
function caveSave(room){
  const after=room==='after', idx=after?6:CAVE_ORDER.indexOf(room);
  const lit=CAVE_ORDER.slice(0,Math.max(0,idx)); // every room before this one (after the boss: all six)
  const open=SEAL_BEFORE[room]||[];
  const s=loopSave({lantern:true,known:after?Object.keys((G.alchemy&&G.alchemy.recipes)||{}):null});
  const mp=LM().caveMouth||{x:180,y:1,z:52.4};
  s.pos=[mp.x,mp.y,mp.z+2.2]; s.yaw=PI;
  s.mods.caveBoss={v:1,pages:PAGES_BEFORE[room]||[],defeated:after,discovered:true,hal:false,entered:true,bossSeen:after,said:[]};
  s.mods.cavePuzzles={v:1,lit,open,prog:{},raft:{t:open.includes('channel')?1:0,done:open.includes('channel')},bossDead:after,said:{},
    jar:{owned:after,count:0,left:0,said:{}}};
  s.mods.cave={lit,gates:{channel:open.includes('channel'),shortcut:after},wall:after};
  if(after)s.flags.undertowDead=true;
  return s;
}
const STARTS=[
  {id:'story',name:'Story start',sub:'A brand-new game: the wreck on the south beach, the cold, the cottage',group:'Act 1'},
  {id:'loop',name:'Lighthouse lit',sub:'Act 1 done: staff, cloak, lamp cured · the core loop begins',group:'Act 1',main:true},
  {id:'lamp-failed',name:'The lamp failed',sub:'The storm lantern’s flame was drunk · staff in hand, at the foot of the stairs: Halloran waits outside',group:'Act 1'},
  {id:'stag',name:'Before the Hollow Stag',sub:'Edge of the old wood, staff in hand · the Stag guards Hesper’s lantern',group:'Act 1'},
  {id:'finale',name:'Before the finale boss',sub:'Lamp cured, staff in hand, at the foot of the stairs: step outside',group:'Act 1'},
  {id:'late',name:'Late game',sub:'Loop running · 7 hearts (the most there are), 4 Moth Wings, every upgrade, all shards and caches · moth jar',group:'Act 1'},
  {id:'sandbar',name:'The sandbar, low tide',sub:'Loop running, lantern baited, 60 moths · the cave mouth ahead',group:'The cave'},
  {id:'cave:mouth',name:'The Mouth',sub:'Just inside, nothing lit yet',group:'The cave'},
  {id:'cave:gallery',name:'Gallery of Keepers',sub:'Mouth lit · the gallery seal ahead',group:'The cave'},
  {id:'cave:stair',name:'The Flooding Stair',sub:'Gallery seal eaten · page 1 read',group:'The cave'},
  {id:'cave:channel',name:'The Channel',sub:'Stair behind you · the raft at its mooring',group:'The cave'},
  {id:'cave:drafts',name:'Hall of Drafts',sub:'Sluice open · page 2 read',group:'The cave'},
  {id:'cave:arena',name:'The Undertow',sub:'Door seal eaten · the boss in the pool',group:'The cave'},
  {id:'cave:after',name:'After the Undertow',sub:'Boss down, jar owned, the Wound revealed',group:'The cave'},
  {id:'undercroft',name:'The Undercroft',sub:'Well cured, trapdoor open · at the foot of the stair, nothing lit, 40 moths',group:'The Undercroft'},
  {id:'undercroft-chapel',name:'The Crypt Chapel',sub:'Stair and cellars lit · the bell-ropes and the sexton’s niche ahead',group:'The Undercroft'},
  {id:'undercroft-boss',name:'Before the Tithe-Keeper',sub:'Glass owned, sluice set, portcullis up · at the store door',group:'The Undercroft'},
  {id:'temple',name:'The Vigil',sub:'Wren saved, the door’s roots eaten · at the foot of the Stair of Watchers, nothing lit, 40 moths',group:'The Vigil'},
  {id:'temple-well',name:'The Moth Well',sub:'Lens owned, mirrors set, sun-disc door open · at the rim of the well, 40 moths',group:'The Vigil'},
  {id:'temple-boss',name:'Before the Answer',sub:'Lens and Glass, the well’s seals eaten · at the sanctum door',group:'The Vigil'},
  {id:'boat',name:'Rowan’s boat',sub:'The green light seen, the boat looked over, all four parts gathered · at the wreck: patch her',group:'The north island'},
  {id:'north-sail',name:'Sail north',sub:'The boat patched and moored off the south beach · the crossing',group:'The north island'},
  {id:'north-landing',name:'The north beach',sub:'Just landed in the cove · the wrecks, and the tower up the path',group:'The north island'},
  {id:'north-cave',name:'The sea cave, low tide',sub:'The tower door tried and barred · at the cave mouth under the cliffs',group:'The north island'},
  {id:'north-cave-in',name:'Inside the sea cave',sub:'Just inside: the store, the ledger and the flooded way on',group:'The north island'},
  {id:'north-hoist',name:'The hoist',sub:'Ledger read, sluice drained · at the hoist up into the tower',group:'The north island'},
  {id:'north-father',name:'Rowan’s father',sub:'At the top of the hoist, the foot of the tower · he comes down the stair',group:'The north island'},
  {id:'north-met',name:'After the meeting',sub:'He’s gone back up and barred the trapdoor · the end of the chapter so far',group:'The north island'},
  {id:'companions',name:'Companions',sub:'Loop running · Ember and Corvin with you · on the moor by the hollow log',group:'Companions',main:false},
  {id:'testsave',name:'Continue test save',sub:'',group:'Saves',test:true}
];
DT.starts=STARTS;
/* the Undercroft (undercroft.js / glass.js). Other Undercroft modules can add their own state to these saves:
   G.devtools.undercroftHooks.push((save,id)=>{ save.mods.myKey={...}; })  — id is 'undercroft' | 'undercroft-chapel' | 'undercroft-boss' */
DT.undercroftHooks=[];
const UC_ORDER=['stair','cellars','chapel','mill','store'];
function undercroftSave(id){
  const room=id==='undercroft-boss'?'store':id==='undercroft-chapel'?'chapel':'stair', idx=UC_ORDER.indexOf(room);
  const s=loopSave({lantern:true});
  s.mods.moths.cured=['well'];
  const lit=UC_ORDER.slice(0,Math.max(0,idx)).filter(r=>r!=='mill'||room==='store');
  const reached=UC_ORDER.slice(1,idx+1);
  s.mods.undercroft={v:1,open:true,lit,reached,gates:{portcullis:room==='store',strongroom:false,exit:false},trap:false,freeUsed:lit.length>0,mill:room==='store',prevCp:null};
  s.mods.glass={v:1,owned:room==='store',seen:room==='store'?['tithe','supper','bargain','register']:[],niche:room==='store'};
  const d=LM().undercroftDoor||{x:-8.6,y:13,z:37.6}; s.pos=[d.x+1.7,d.y,d.z]; s.yaw=PI/2;
  for(const fn of DT.undercroftHooks){ try{ fn(s,id); }catch(e){ console.error('undercroft start hook',e); } }
  return s;
}
function undercroftEnter(id){
  const room=id==='undercroft-boss'?'store':id==='undercroft-chapel'?'chapel':'stair';
  if(G.undercroft&&G.undercroft.enter){ const S=G.undercroft._debug&&G.undercroft._debug.S; if(S)S.trans=null; G.undercroft.enter(room,{instant:true}); }
  giveSwarm(40); setTimeout(()=>{ giveSwarm(40); render(); },60);
}
/* the Vigil (temple.js / lens.js / temple_puzzles.js). Other Vigil modules can add their own state to these saves:
   G.devtools.templeHooks.push((save,id)=>{ save.mods.myKey={...}; })  — id is 'temple' | 'temple-well' | 'temple-boss' */
DT.templeHooks=[];
const TP_ROOM={temple:'vestibule','temple-well':'well','temple-boss':'sanctum'};
function templeSave(id){
  const room=TP_ROOM[id]||'vestibule', deep=room!=='vestibule', boss=room==='sanctum';
  const s=loopSave({lantern:true});
  s.mods.moths.cured=['well'];
  s.mods.undercroft={v:1,open:true,lit:['stair','cellars','chapel','mill','store'],reached:['cellars','chapel','mill','store'],gates:{portcullis:true,strongroom:true,exit:true},trap:false,freeUsed:true,mill:true,prevCp:null};
  s.mods.glass={v:1,owned:true,seen:['tithe','supper','bargain','register'],niche:true};
  s.mods.temple={v:1,unlocked:true,open:true,lit:deep?['vestibule','nave','reliquary']:[],reached:deep?['nave','reliquary','cloister','well'].concat(boss?['wellDeep']:[]):[],
    gates:{cloisterDoor:deep,sunDoor:deep,wellUpper:boss,wellLower:boss,wellSide:false,exit:false,sanctum:true,eyes:false},freeUsed:deep,pages:[],said:['doorSeen'],prevCp:null,
    puz:{puzzles:deep?{v:1,lens:true,seals:['recess','cloisterDoor'],mirrors:{M1:2,M2:1},winch:true,disc:true,eyes:false,box:true,galleryBox:false,well:boss?['wellUpper','wellLower']:[],wellProg:{},vigilBox:false,said:['nave','clo','well'],shortcuts:[]}:null}};
  s.mods.lens={v:1,owned:deep,range:14,said:deep?['first']:[]};
  const d=LM().vigilDoor||{x:-195,y:7.5,z:2}; s.pos=[d.x+2,d.y,d.z]; s.yaw=-PI/2;
  for(const fn of DT.templeHooks){ try{ fn(s,id); }catch(e){ console.error('temple start hook',e); } }
  return s;
}
function templeEnter(id){
  const room=TP_ROOM[id]||'vestibule';
  if(G.temple&&G.temple.enter){ const S=G.temple._debug&&G.temple._debug.S; if(S)S.trans=null; G.temple.enter(room==='sanctum'?'well':room,{instant:true});
    if(room==='sanctum'){ const a=G.temple.rooms.well.anchors.door; G.player.teleport(a.x,a.y,a.z+1.2,PI); } }
  giveSwarm(40); setTimeout(()=>{ giveSwarm(40); render(); },60);
}
/* the north island (boat.js / northisle.js / northcave.js): the chapter after the Vigil, so every earlier place is done (the cave,
   the Undercroft and the Vigil, their bosses down), the wrecker's light seen, then each step of the boat and the island done in
   order up to the chosen point */
const NORTH_ORDER=['boat','north-sail','north-landing','north-cave','north-cave-in','north-hoist','north-father','north-met'];
const NORTH_STEP={
  boat:['boat:patch','Patch your boat','You have everything. Back to the wreck'],
  'north-sail':['boat:ready','Sail north','Your boat is waiting in the shallows by the wreck']
};   // on the island, northisle.js / northcave.js set their own objective (northEnter)
function northSave(id){
  const k=NORTH_ORDER.indexOf(id), s=templeSave('temple-boss');
  s.mods.lens={v:1,owned:true,range:20,said:['first']};
  s.mods.templeBoss={v:1,defeated:true,reward:'lens',said:[]};
  s.mods.undercroftBoss={v:1,defeated:true,ledger:true,pageRead:true,bossSeen:true,said:[]};
  s.mods.caveBoss={v:1,pages:[1,2,3],defeated:true,discovered:true,hal:false,entered:true,bossSeen:true,said:[]};
  s.mods.cavePuzzles={v:1,lit:CAVE_ORDER.slice(),open:['gallery','channel','arena'],prog:{},raft:{t:1,done:true},bossDead:true,said:{},jar:{owned:true,count:0,left:0,said:{}}};
  s.mods.cave={lit:CAVE_ORDER.slice(),gates:{channel:true,shortcut:true},wall:true};
  s.mods.alchemy.known=Object.keys((G.alchemy&&G.alchemy.recipes)||{}).length?Object.keys(G.alchemy.recipes):s.mods.alchemy.known;
  Object.assign(s.flags,{undertowDead:true,northLight:true});
  s.mods.boat={v:1,started:true,looked:true,parts:{planks:true,rope:true,sail:true,pitch:true},built:k>=1};
  const BT=G.boat&&G.boat.debug, W=BT?BT.wreckPos:V(80.4,0,67.4), M=BT?BT.moor:{x:77.6,z:76.2};
  const NI=G.northIsle, B=NI?NI.cove.beach:{x:150,z:-640}, by=NI?NI.height(B.x,B.z):1;
  if(k<=1){ // the south beach: at the wreck, or a few steps up the sand from the moored boat
    const dx=W.x-M.x, dz=W.z-M.z, L=Math.hypot(dx,dz)||1, x=k===0?W.x-1.6:M.x+dx/L*3.6, z=k===0?W.z+1.4:M.z+dz/L*3.6;
    s.pos=[x,G.world.height(x,z)+.2,z]; s.yaw=k===0?Math.atan2(W.x-x,W.z-z):Math.atan2(M.x-x,M.z-z);
  }else{
    s.mods.northIsle={v:1,at:'north',landed:true,read:{},door:k>=3};
    const cb=NI&&NI.cove.dir; s.pos=[B.x,by,B.z]; s.yaw=cb?Math.atan2(-cb.x,-cb.z):PI;
    s.cp=s.pos.slice(); s.cpYaw=s.yaw; s.cpName='the north island';
    const m=G.northCave&&G.northCave.mouth; if(k>=3&&m){ s.pos=[m.x,G.world.height(m.x,m.z)+.2,m.z]; s.yaw=m.yaw; }
  }
  if(k>=4)s.mods.northCave={v:1,entered:true,drained:k>=5,hoistTop:k>=6,read:k>=5?{ledger:true}:{},met:k>=7,prevCp:null};
  const st=NORTH_STEP[id]; if(st){ s.step=st[0]; s.objective=st[1]; s.sub=st[2]; s.target=null; s.targetName=''; }
  return s;
}
function northEnter(id){
  const k=NORTH_ORDER.indexOf(id), NC=G.northCave;
  if(k>=3)setTide('low');
  if(G.northIsle&&k>=2)G.northIsle.setQuest();
  if(k>=4&&NC){ const S=NC.debug.S; S.trans=null; NC.enter({instant:true,at:k>=6?'foot':'mouth'});
    if(k===5){ const D=NC.debug, p=D.toWorld(D.SHAFT.x,1.3,D.SHAFT.z+1.3); G.player.teleport(p.x,p.y,p.z,PI); if(G.player.aimCamera)G.player.aimCamera(PI,.3); }
    if(k>=6){ // on the hoist platform where the ride ends, facing the stair he comes down (the foot spawn sits by the wall, camera in the stone)
      const D=NC.debug, p=D.toWorld(D.SHAFT.x,D.TOP+.05,D.SHAFT.z); G.player.teleport(p.x,p.y,p.z,PI/2); if(G.player.aimCamera)G.player.aimCamera(PI/2,.55); }
    if(k===6)NC.debug.meet();
    NC.setQuest(); }
}
function caveSwarmAndEnter(room){
  setTide('low');
  giveSwarm(60);
  if(room&&G.cave&&G.cave.enter){ G.cave.enter(room==='after'?'arena':room,{instant:true}); }
  setTimeout(()=>{ giveSwarm(60); render(); },60); // top up anything the transfer missed
}
/* hearts at each start point: what a typical player has picked up by then (progression.js: 2 hearts to start, 4 Heart Shards
   per heart, a Keeper's Heart from the Stag and the Undertow). The Act 1 road passes the needle (headland), the cliff-path
   outcrop, the hamlet attic and the hounds' ring; by the cave a player has also found the stones, the spire, the old tree's roots
   and the west tip. 'late' keeps progression.js's lateGame() (everything). */
const ROUTE_ACT1=['needle','outcrop','attic','hounds'], ROUTE_LOOP=ROUTE_ACT1.concat(['stones','spire','roots','west']);
function progressFor(id){
  const shards=id==='lamp-failed'?['needle']:(id==='stag'||id==='finale'||id==='loop')?ROUTE_ACT1:(id==='sandbar'||/^cave:/.test(id)||/^undercroft/.test(id)||/^temple/.test(id)||NORTH_ORDER.includes(id))?ROUTE_LOOP:null;
  if(!shards)return null;
  const o={v:1,shards:{},caches:{},hearts:{},marks:{},spent:0,upgrades:{},freed:0,said:{}};
  for(const k of shards)o.shards[k]=1;
  if(id!=='lamp-failed'&&id!=='stag'){ o.hearts.stag=1; o.marks.stag=1; }       // the Stag is down from the finale on
  if(id==='cave:after'){ o.hearts.undertow=1; o.marks.undertow=2; }
  if(/^temple/.test(id)){ o.hearts.undertow=1; o.marks.undertow=2; o.hearts.crane=1; o.marks.crane=2; }
  if(NORTH_ORDER.includes(id)){ o.hearts.undertow=1; o.marks.undertow=2; o.hearts.crane=1; o.marks.crane=2; o.hearts.answer=1; o.marks.answer=2; }   // after the Vigil: the Answer down too   // the Vigil comes after the cave and the Undercroft: 7 hearts with the route's shards
  return o;
}
function runStart(id){
  const F=G.flow; if(!F)return;
  if(id==='story'&&G.progress&&G.progress.debug)G.progress.debug.reset();   // a brand-new game: 2 hearts, nothing found
  const b0=F.begin, pr=progressFor(id);
  if(pr)F.begin=s=>{ if(s&&typeof s==='object'){ s.mods=s.mods||{}; if(!s.mods.progress)s.mods.progress=pr; } return b0(s); };
  try{ runStart0(id); } finally{ F.begin=b0; }
  if(G.map&&G.map.debug&&G.map.debug.resetWaypoints)G.map.debug.resetWaypoints();       // waystones + spotted collectibles for this point
  if(G.player&&G.player.alive)G.player.hp=G.player.maxHp;
}
function runStart0(id){
  const F=G.flow; if(!F)return;
  testMode();
  closePanel(true);
  const P=G.player;
  if(id==='story'){ F.begin(false); return; }
  if(id==='testsave'){ const d=F.readSave(F.keys.test); if(d){ d.quiet=false; F.begin(d); } else F.begin(false); return; }
  if(id==='loop'){
    const s=base({pos:arr(lhDoorOut()),yaw:-PI/2});
    F.begin(s); F.startLoop(false); // the real 'Keep exploring' path: caption, light gauge, "Feed the light"
    return;
  }
  if(id==='lamp-failed'||id==='stag'){
    const lh=G.world.lighthouse, inP=lh&&lh.doorIn?lh.doorIn.clone():lhDoorOut();
    const sp=LM().lanternSpot||{x:-160,y:9,z:9}, edge=(G.flow.stagEdge&&G.flow.stagEdge())||V(-131,9,7);
    const act={lampCured:false,bossDead:false,flags:{stormFailed:true,logbook:true},
      lantern:{found:false,carried:false,shut:false,cured:false,inCradle:false,pos:null},
      storm:{found:true,carried:true,inCradle:false,failed:true,spent:false,pos:null}};
    const s=id==='stag'
      ?base(Object.assign(act,{step:'forest',objective:'Find Hesper’s lantern',sub:'At the old tree in the forest, far to the west',target:[sp.x,sp.y,sp.z],targetName:'The old wood',
        pos:arr(edge),yaw:-PI/2,cp:arr(edge),cpYaw:-PI/2,cpName:'the edge of the old wood'}))
      :base(Object.assign(act,{step:'failed',objective:'Go back down',sub:'The plain flame wasn’t enough',pos:arr(inP),yaw:-PI/2}));
    F.begin(s); return;
  }
  if(id==='finale'){
    const lh=G.world.lighthouse, inP=lh&&lh.doorIn?lh.doorIn.clone():lhDoorOut();
    const s=base({bossDead:false,step:'descend',objective:'Something is climbing the cliff',sub:'Go down and meet it',target:arr(lhDoorOut()),targetName:'Lighthouse door',
      pos:arr(inP),yaw:-PI/2});
    F.begin(s); return;
  }
  if(id==='late'){ // progression.js: everything a thorough player has (hearts, wings, upgrades) — then the real loop + jar
    const s=loopSave({lantern:true,known:Object.keys((G.alchemy&&G.alchemy.recipes)||{}),inv:{glowcap:12,ichor:8,vial:4,kelp:4,brine:4,pearl:2}});
    s.flags.undertowDead=true; s.hp=20; s.freed=[0,1,2,3,4,5,6,7];
    if(G.progress)s.mods.progress=G.progress.lateGame();
    s.mods.cavePuzzles={v:1,lit:[],open:[],prog:{},raft:{t:0,done:false},bossDead:true,said:{},jar:{owned:true,count:0,left:0,said:{}}};
    s.mods.caveBoss={v:1,pages:[1,2,3],defeated:true,discovered:true,hal:false,entered:true,bossSeen:true,said:[]};
    s.pos=arr(lhDoorOut()); F.begin(s); if(G.moths&&G.moths.jar&&!G.moths.jar.owned)G.moths.jar.give({silent:true}); if(G.progress)G.progress.apply(); G.player.hp=G.player.maxHp; return; }
  if(id==='sandbar'){
    const s=caveSave('mouth'); s.mods.caveBoss.discovered=false; s.mods.caveBoss.entered=false;
    F.begin(s); caveSwarmAndEnter(null);
    if(G.caveBoss&&G.caveBoss.discover)G.caveBoss.discover('tide');
    return;
  }
  if(/^cave:/.test(id)){ const room=id.slice(5); F.begin(caveSave(room)); caveSwarmAndEnter(room); return; }
  if(/^undercroft/.test(id)){ F.begin(undercroftSave(id)); undercroftEnter(id); return; }
  if(/^temple/.test(id)){ F.begin(templeSave(id)); templeEnter(id); return; }
  if(NORTH_ORDER.includes(id)){ F.begin(northSave(id)); northEnter(id); return; }
  if(id==='companions'){ // companions.js: both earned (a fox and the raven freed), standing by the hollow log on the moor
    const s=loopSave({lantern:true}); const N=(G.creatures&&G.creatures.negatives)||[];
    s.freed=N.map((n,i)=>(n.kind==='raven'||(n.kind==='fox'&&i===N.findIndex(m=>m.kind==='fox')))?i:-1).filter(i=>i>=0);
    s.mods.fog={ether:90,milestones:['beach','hamlet','forest'],crossed:true,fed:true};
    s.mods.companions={v:1,ember:true,corvin:true,spots:{},key:false,chest:false,cd:0,said:{hal:1},seen:{}};
    const L=G.companions&&G.companions.spots.find(q=>q.id==='log'); const at=L?L.stand:V(28,13,9);
    s.pos=[at.x+1,at.y,at.z+1]; s.yaw=PI; F.begin(s); return; }
}
function chooseStart(id){
  if(G.state.mode==='title'){ runStart(id); return; }
  // mid-game: reload first so nothing from this run (lit rooms, open seals, dead bosses) leaks into the new state
  G.testSaves=true;
  const where=stash(BOOT_KEY,{id,cheats:DT.cheats,timeScale:G.timeScale});
  if(!where){ note('This browser blocks storage, so the start is applied without a reload; reload first if anything looks off.'); runStart(id); return; }
  note('Restarting…'); setTimeout(()=>location.reload(),60);
}
DT.start=runStart;

/* ---------------------------------------------------------------- teleports */
const SPOTS=[
  {id:'cottage',name:'Cottage',at:()=>{ const c=LM().cottageDoor||LM().cottage; return c&&[c.x-2,c.y,c.z-3,PI]; }},
  {id:'lighthouse',name:'Lighthouse',at:()=>{ const d=lhDoorOut(); return [d.x-1.5,d.y,d.z,-PI/2]; }},
  {id:'grove',name:'Blighted Grove',blight:'grove'},
  {id:'tidepool',name:'Tide pool',blight:'tidepool'},
  {id:'well',name:'Choked Well',blight:'well'},
  {id:'hamlet',name:'Hamlet',at:()=>{ const h=LM().hamlet; return h&&[h.x+12,null,h.z,-PI/2]; }},
  {id:'resisting',name:'Resisting Tree',at:()=>{ const t=LM().resistingTree; return t&&[t.x+8,null,t.z+6,-PI/2]; }},
  {id:'mouthOut',name:'Cave mouth',at:()=>{ const m=LM().caveMouth; return m&&[m.x,m.y,m.z+2.2,PI]; }},
  {id:'trapdoor',name:'Undercroft trapdoor',at:()=>{ const d=LM().undercroftDoor; return d&&[d.x+1.7,null,d.z,PI/2]; }},
  {id:'vigil',name:'The Vigil’s door',at:()=>{ const d=LM().vigilDoor; return d&&[d.x+2,null,d.z,-PI/2]; }}
];
DT.teleports=SPOTS;
/* a home-island teleport from the north island: out of the sea cave, then sail home (instantly), so the boat comes too */
function leaveNorth(){
  const NC=G.northCave, NI=G.northIsle;
  if(NC&&NC.inside){ NC.debug.S.trans=null; NC.exit({instant:true}); }
  if(NI&&NI.at==='north'&&!NI.crossing)NI.cross('home',{instant:true});
}
function teleport(id){
  const P=G.player; testMode();
  { const s=SPOTS.find(x=>x.id===id); if(s&&s.go){ const r=s.go(); if(!r)return 'That place isn’t built.';
      if(Array.isArray(r)){ if(G.cave&&G.cave.inside){ const S=G.cave._debug&&G.cave._debug.S; if(S)S.trans=null; G.cave.exit({instant:true}); }
        if(G.undercroft&&G.undercroft.inside){ const S=G.undercroft._debug&&G.undercroft._debug.S; if(S)S.trans=null; G.undercroft.exit({instant:true}); }
        if(G.temple&&G.temple.inside){ const S=G.temple._debug&&G.temple._debug.S; if(S)S.trans=null; G.temple.exit({instant:true}); }
        leaveNorth();
        teleportWithSwarm(r[0],r[1],r[2],r[3]); closePanel(); return 'Teleported to '+s.name; }
      if(!(G.loop&&G.loop.active))return 'That one opens with the core loop — use a start point.';
      if(r.cave&&G.cave){ const S=G.cave._debug&&G.cave._debug.S; if(S)S.trans=null; G.cave.enter(r.cave,{instant:true}); }
      if(r.undercroft&&G.undercroft){ const S=G.undercroft._debug&&G.undercroft._debug.S; if(S)S.trans=null; G.undercroft.enter(r.undercroft,{instant:true}); }
      if(r.pos)P.teleport(r.pos.x,r.pos.y,r.pos.z,r.yaw); closePanel(); return 'Teleported to '+s.name; } }
  if(CAVE_ORDER.includes(id)){
    if(!(G.loop&&G.loop.active))return 'The cave opens with the core loop — use a start point.';
    const S=G.cave._debug&&G.cave._debug.S; if(S)S.trans=null;
    G.cave.enter(id,{instant:true}); closePanel(); return 'Into '+id; // works from inside too (the swarm comes along)
  }
  const s=SPOTS.find(x=>x.id===id); if(!s)return '';
  let a=null;
  if(s.blight){ const b=G.moths&&G.moths.blight&&G.moths.blight(s.blight); if(b)a=[b.pos.x-b.radius-3,null,b.pos.z,PI/2]; }
  else a=s.at();
  if(!a)return 'That place isn’t built.';
  if(G.cave&&G.cave.inside){ const S=G.cave._debug&&G.cave._debug.S; if(S)S.trans=null; G.cave.exit({instant:true}); }
  if(G.undercroft&&G.undercroft.inside){ const S=G.undercroft._debug&&G.undercroft._debug.S; if(S)S.trans=null; G.undercroft.exit({instant:true}); }
  if(G.temple&&G.temple.inside){ const S=G.temple._debug&&G.temple._debug.S; if(S)S.trans=null; G.temple.exit({instant:true}); }
  leaveNorth();
  if(id==='mouthOut')setTide('low');
  teleportWithSwarm(a[0],a[1],a[2],a[3]); closePanel(); return 'Teleported to '+s.name;
}

/* ---------------------------------------------------------------- monsters */
function spawnMonster(kind){
  const P=G.player; if(!G.monsters||!G.monsters.spawn)return 'No monsters module.';
  testMode();
  // in front if there's open, level ground to walk to; else the first clear direction around you
  const y=P.pos.y, h=P.heading||0; let x=P.pos.x, z=P.pos.z;
  outer: for(const r of [6,4,2.5]) for(const da of [0,.6,-.6,1.3,-1.3,2,-2,PI]){
    const a=h+da, tx=P.pos.x+Math.sin(a)*r, tz=P.pos.z+Math.cos(a)*r, fl=G.floorAt(tx,tz,y+1);
    if(!(fl>y-1.5&&fl<y+1.5))continue;
    const q=P.pos.clone(); for(let k=0;k<8;k++)G.moveCharacter(q,(tx-P.pos.x)/8,(tz-P.pos.z)/8,.4,'monster');
    if(Math.hypot(q.x-tx,q.z-tz)<.5){ x=tx; z=tz; break outer; } }
  const room=G.cave&&G.cave.inside?G.cave.room(P.pos):null;
  const opts={aggro:kind!=='brineling',zone:{x,z,r:30,name:'devtools'}}; if(room)opts.cave=room;
  G.monsters.spawn(kind,{x,y,z},opts); closePanel(); return kind+' spawned';
}
function killNearby(){
  const P=G.player; let n=0; testMode();
  for(const m of (G.monsters&&G.monsters.list||[]).slice()) if(m.alive&&!m.dying&&m.pos.distanceTo(P.pos)<40){ G.monsters.kill(m,{dir:V(0,0,1)}); n++; }
  const CB=G.caveBoss; if(CB&&CB.debug&&CB.debug.kill&&G.cave&&G.cave.inside&&G.cave.room(P.pos)==='arena'&&!CB.defeated&&CB.state!=='sunk'){ CB.debug.kill(); n++; }
  return n?n+' killed':'Nothing hostile within 40 m';
}

/* ---------------------------------------------------------------- items (generic over G.inv.ITEMS / G.alchemy.recipes) */
function giveItem(id){
  const I=G.inv; if(!I)return 'No satchel yet.'; testMode();
  if(id==='vial'){ I.add('vial',1); if(G.alchemy)G.alchemy.etherUnits+=12; return '+1 vial (12 ether)'; }
  I.add(id,5); return '+5 '+((I.ITEMS[id]&&(I.ITEMS[id].plural||I.ITEMS[id].name))||id);
}
function learnAll(){ const A=G.alchemy; if(!A||!A.recipes)return ''; testMode(); let n=0;
  for(const id in A.recipes) if(!A.known.has(id)){ try{A.learn(id,{silent:true});}catch(e){A.known.add(id);} n++; }
  return n?n+' recipes learned':'All recipes known'; }

/* ---------------------------------------------------------------- cheats (applied every frame) */
let origHurt=null, origDrain=null;
function hookPlayer(){
  const P=G.player; if(!P||!P.hurt||origHurt)return;
  origHurt=P.hurt;
  // God mode: no damage of any kind. Falling and deep water still put you back on safe ground (they teleport before they hurt).
  P.hurt=function(info){ if(DT.cheats.god)return false; return origHurt.call(this,info); };
}
function applyCheats(){
  const P=G.player, c=DT.cheats;
  if(c.stamina&&P){ P.stamina=1; P.exhausted=false; }
  if(G.lamp){ if(c.ether){ if(origDrain==null)origDrain=G.lamp.drainPerMin; G.lamp.drainPerMin=0; } else if(origDrain!=null){ G.lamp.drainPerMin=origDrain; origDrain=null; } }
  if(c.ether&&G.inv&&G.alchemy&&G.loop&&G.loop.active){ if(G.inv.count('vial')<3)G.inv.add('vial',3-G.inv.count('vial'),{silent:true}); if(G.alchemy.etherUnits<30)G.alchemy.etherUnits=30; }
}
function toggle(k){ DT.cheats[k]=!DT.cheats[k]; if(k!=='fps'&&DT.cheats[k])testMode(); if(k==='fps')setFps(DT.cheats.fps); badge(); render(); }
function setSpeed(n){ G.timeScale=n; if(n>1)testMode(); badge(); render(); }

/* ---------------------------------------------------------------- HUD badge + FPS */
let badgeEl=null, fpsTxt='';
function badge(){
  if(!badgeEl)return;
  const on=anyCheat()||G.testSaves;
  badgeEl.hidden=!on||G.state.mode==='title';
  const bits=[]; if(anyCheat()||G.testSaves)bits.push('<b>TEST</b>');
  if(DT.cheats.god)bits.push('god'); if(DT.cheats.stamina)bits.push('∞ stamina'); if(DT.cheats.ether)bits.push('∞ ether'); if(G.timeScale>1)bits.push(G.timeScale+'×');
  const h=bits.join(' · '); if(badgeEl._h!==h){ badgeEl._h=h; badgeEl.innerHTML=h; }
}
/* "Show FPS": a small corner readout — fps, frame ms, render pixel ratio (and the dynamic-resolution scale), draw calls,
   triangles. renderer.info is read once per frame (all passes: shadows, scene, bloom), so draws include post-processing. */
let frames=0, fpsT=performance.now(), newFrame=false, calls=0, tris=0, fpsEl=null;
function rafCount(){ if(!DT.cheats.fps)return; frames++; newFrame=true;
  const now=performance.now(); if(now-fpsT>=500){ const fps=frames*1000/(now-fpsT), ms=(now-fpsT)/Math.max(1,frames); frames=0; fpsT=now;
    const P=G.perf, R=G.renderer, pr=P?P.pixelRatio:(R?R.getPixelRatio():1);
    const f=P&&P.fps?P.fps:Math.round(fps), m=P&&P.frameMs?P.frameMs:Math.round(ms*10)/10;
    fpsTxt=`<b>${f}</b> fps · ${m.toFixed(1)} ms<br>${pr.toFixed(2)}× px`+(P&&P.scale<1?` (${Math.round(P.scale*100)}%)`:'')+
      `<br>${calls} draws · ${(tris/1000).toFixed(0)}k tris<br>${esc(G.quality?G.quality.level:'')}${G.quality&&G.quality.cap?' · '+G.quality.cap+' cap':''}`;
    if(fpsEl&&fpsEl._h!==fpsTxt){ fpsEl._h=fpsTxt; fpsEl.innerHTML=fpsTxt; } }
  requestAnimationFrame(rafCount); }
function setFps(on){ const R=G.renderer; if(R&&R.info){ R.info.autoReset=!on; if(!on)R.info.reset(); }
  if(fpsEl){ fpsEl.hidden=!on; if(!on){ fpsEl.innerHTML=''; fpsEl._h=''; } }
  if(on){ frames=0; fpsT=performance.now(); requestAnimationFrame(rafCount); } else fpsTxt=''; }

/* ---------------------------------------------------------------- panel */
const css=`
#devtools{z-index:20;align-items:flex-start;touch-action:pan-y;-webkit-overflow-scrolling:touch;background:linear-gradient(90deg,rgba(14,10,18,.88) 0%,rgba(14,10,18,.6) 60%,rgba(14,10,18,.35) 100%)}
#devtools .sheet{max-width:660px;width:100%;margin-block:auto;gap:12px;padding:22px 24px 20px}
#devtools h2{font-size:clamp(28px,4.4vw,40px)}
#devtools .dt-top{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}
#devtools .dt-slot{font-size:13.5px;line-height:1.45;color:#3d2f33;background:rgba(75,56,99,.08);border-left:2px solid #6c3f5f;padding:8px 10px}
#devtools .dt-slot b{color:#4b3863}
#devtools .dt-h{font:600 11.5px var(--body);letter-spacing:.2em;text-transform:uppercase;color:#6c3f5f;margin-top:4px}
#devtools .dt-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(176px,1fr));gap:6px}
#devtools .dt-start{display:grid;gap:2px;text-align:left;font:600 15px var(--body);padding:9px 11px;min-height:48px;border-radius:2px;cursor:pointer;
  border:1px solid rgba(60,40,30,.4);background:rgba(255,255,255,.22);color:#21161f}
#devtools .dt-start small{font:400 12.5px/1.3 var(--body);color:#6c5a5f}
#devtools .dt-start.main{background:#4b3863;border-color:#4b3863;color:var(--bone)}
#devtools .dt-start.main small{color:#d9cde6}
#devtools .dt-start:hover{filter:brightness(1.06)}
#devtools .dt-sub{font:600 11px var(--body);letter-spacing:.14em;text-transform:uppercase;color:#8a7478;grid-column:1/-1;margin-top:2px}
#devtools .seg button{min-height:40px}
#devtools .seg button:focus-visible,#devtools .dt-start:focus-visible{outline:2px solid var(--ether);outline-offset:2px}
#devtools .dt-row{display:flex;flex-wrap:wrap;gap:6px 8px;align-items:center}
#devtools .dt-row .lbl{font-size:13.5px;color:#3d2f33;min-width:92px}
#devtools .dt-note{font-size:13.5px;color:#6c3f5f;min-height:1.3em}
#devtools button:disabled{opacity:.42;cursor:default}
#devtools .dt-x{flex:none}
@media (pointer:coarse){ #devtools .seg button{min-height:44px;padding:8px 13px} #devtools .dt-start{min-height:52px} }
@media (max-width:520px){ #devtools .sheet{padding:18px 16px 18px} #devtools .dt-grid{grid-template-columns:1fr 1fr} #devtools .dt-start{font-size:14px;padding:8px 9px} }
.dt-entry{display:flex;justify-content:flex-start}
.dt-entry button{font:600 12.5px var(--body);letter-spacing:.12em;text-transform:uppercase;background:none;border:0;border-bottom:1px dashed rgba(108,63,95,.6);
  color:#6c3f5f;padding:6px 2px;cursor:pointer;min-height:32px}
.dt-entry button:focus-visible{outline:2px solid var(--ether);outline-offset:3px}
#dtBadge{position:fixed;top:calc(20px + env(safe-area-inset-top,0px));left:calc(50% + 32px);z-index:6;pointer-events:none;
  font:500 11.5px var(--body);letter-spacing:.06em;color:var(--bone);background:rgba(20,15,26,.62);border:1px solid rgba(214,188,255,.5);
  border-radius:11px;padding:3px 9px;text-shadow:none;white-space:nowrap;font-variant-numeric:tabular-nums;max-width:calc(50% - 48px);overflow:hidden;text-overflow:ellipsis}
#dtBadge b{color:#ffcf7a;letter-spacing:.16em}
#dtFps{position:fixed;left:calc(12px + env(safe-area-inset-left,0px));top:calc(64px + env(safe-area-inset-top,0px));z-index:6;pointer-events:none;
  font:500 11.5px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;color:#efe6d6;background:rgba(20,15,26,.66);border:1px solid rgba(214,188,255,.4);
  border-radius:6px;padding:5px 8px;font-variant-numeric:tabular-nums;white-space:nowrap}
#dtFps b{color:#ffcf7a;font-size:13px}`;
let card=null, sheet=null, noteEl=null, opener=null, lastNote='';
function build(){
  const st=document.createElement('style'); st.textContent=css; document.head.appendChild(st);
  card=document.createElement('div'); card.className='card'; card.id='devtools'; card.hidden=true; card.dataset.padBack='dtClose';
  card.setAttribute('role','dialog'); card.setAttribute('aria-label','Test tools');
  sheet=document.createElement('div'); sheet.className='sheet'; card.appendChild(sheet); document.body.appendChild(card);
  sheet.addEventListener('click',onClick);
  badgeEl=document.createElement('div'); badgeEl.id='dtBadge'; badgeEl.hidden=true; document.body.appendChild(badgeEl);
  fpsEl=document.createElement('div'); fpsEl.id='dtFps'; fpsEl.hidden=!DT.cheats.fps; fpsEl.setAttribute('aria-hidden','true'); document.body.appendChild(fpsEl);
  // entry links on the title card and in the pause menu
  for(const id of ['title','pause']){ const sh=$(id)&&$(id).querySelector('.sheet'), acts=sh&&sh.querySelector('.actions'); if(!acts)continue;
    const d=document.createElement('div'); d.className='dt-entry'; d.innerHTML='<button type="button" data-dt-open>Test tools</button>';
    acts.after(d); d.firstChild.addEventListener('click',()=>openPanel()); }
}
function note(t){ lastNote=t||''; if(noteEl)noteEl.textContent=lastNote; }
function slotText(){
  const real=peekSave(G.flow?G.flow.keys.save:'bq-save-v1'), test=peekSave(G.flow?G.flow.keys.test:'bq-save-test-v1');
  const r=real?'Your real save ('+esc(ago(real.at))+' · '+esc(real.objective||'')+')':'Your real save slot (empty)';
  if(G.testSaves)return '<b>Test mode is on.</b> This session saves to a separate test slot'+(test?' (last '+esc(ago(test.at))+')':'')+'. '+r+' is not touched. Reload the page to play normally again.';
  return 'Using any tool here switches this session to a separate <b>test save slot</b>, so '+r.charAt(0).toLowerCase()+r.slice(1)+' stays untouched.';
}
function render(){
  if(!card||card.hidden)return;
  const title=G.state.mode==='title', loop=!!(G.loop&&G.loop.active);
  const dis=c=>c?'':' disabled';
  const testSave=peekSave(G.flow?G.flow.keys.test:'bq-save-test-v1');
  let h=`<div class="dt-top"><div><span class="eyebrow">Test tools</span><h2>God Mode</h2></div><button class="btn ghost dt-x" id="dtClose" type="button" data-act="close">Close</button></div>
  <div class="dt-slot">${slotText()}</div>
  <div class="dt-h">Start from</div><div class="dt-grid">`;
  let grp='';
  for(const s of STARTS){
    if(s.test&&!testSave)continue;
    if(s.group!==grp){ grp=s.group; h+=`<span class="dt-sub">${esc(grp)}</span>`; }
    const sub=s.test?('Saved '+ago(testSave.at)+' · '+(testSave.objective||'')):s.sub;
    h+=`<button type="button" class="dt-start${s.main?' main':''}" data-start="${s.id}"><span>${esc(s.name)}</span><small>${esc(sub)}</small></button>`;
  }
  h+=`</div><div class="dt-h">Cheats</div><div class="seg">`;
  for(const [k,l] of [['god','God mode'],['stamina','Infinite stamina'],['ether','Infinite ether · lamp never drains'],['fps','Show FPS']])
    h+=`<button type="button" data-cheat="${k}" aria-pressed="${!!DT.cheats[k]}">${l}</button>`;
  h+=`</div>`;
  if(title)h+=`<p class="dt-note" style="color:#6c5a5f">Pick a start point; the other tools work once you’re playing (toggles carry over).</p>`;
  h+=`<div class="dt-h">Give</div><div class="seg">`;
  const items=(G.inv&&G.inv.ITEMS)||{};
  for(const id in items){ const it=items[id]; h+=`<button type="button" data-give="${esc(id)}"${dis(!title)}>${id==='vial'?'+1 '+esc(it.name):'+5 '+esc(it.plural||it.name)}</button>`; }
  h+=`<button type="button" data-act="recipes"${dis(!title&&G.alchemy)}>All recipes</button>
    <button type="button" data-act="swarm"${dis(!title)}>60-moth swarm</button>
    <button type="button" data-act="jar"${dis(!title&&G.moths&&G.moths.jar&&!G.moths.jar.owned)}>Moth jar</button>
    <button type="button" data-act="heal"${dis(!title)}>Heal</button></div>
  ${G.progress?`<div class="dt-row"><span class="lbl">Progress <small>(${G.progress.shards} shards · ${G.progress.marks} marks)</small></span><div class="seg">
    <button type="button" data-prog="shard"${dis(!title)}>+1 Heart Shard</button><button type="button" data-prog="heart"${dis(!title)}>+1 Keeper’s Heart</button>
    <button type="button" data-prog="mark"${dis(!title)}>+1 Mark</button><button type="button" data-prog="wing"${dis(!title)}>+1 Moth Wing</button>
    <button type="button" data-prog="upgrades"${dis(!title)}>All upgrades</button>
    <button type="button" data-prog="reveal" aria-pressed="${!!G.progress.reveal}"${dis(!title)}>Reveal collectibles</button></div></div>`:''}
  <div class="dt-row"><span class="lbl">Tide <small>(${tideName()})</small></span><div class="seg">${['low','rising','high','falling'].map(k=>`<button type="button" data-tide="${k}" aria-pressed="${tideName()===k}"${dis(!title&&loop)}>${k[0].toUpperCase()+k.slice(1)}</button>`).join('')}</div></div>
  <div class="dt-row"><span class="lbl">Time speed</span><div class="seg">${[1,4].map(n=>`<button type="button" data-speed="${n}" aria-pressed="${(G.timeScale||1)===n}">${n}×</button>`).join('')}</div></div>
  ${G.ui.setCaptionSpeed?`<div class="dt-row"><span class="lbl">Captions <small>(${G.ui.messages().length} logged)</small></span><div class="seg">${[['relaxed','Relaxed'],['standard','Standard'],['hold','Hold']].map(([k,l])=>`<button type="button" data-capspeed="${k}" aria-pressed="${G.ui.captionSpeed===k}">${l}</button>`).join('')}
    <button type="button" data-act="capTest"${dis(!title)}>Say a burst of lines</button><button type="button" data-act="capClear">Clear message log</button></div></div>`:''}
  <div class="dt-h">Map</div><div class="seg">
    <button type="button" data-act="mapReveal"${dis(!title&&G.map)}>Reveal the whole map</button>
    <button type="button" data-act="mapCover"${dis(!title&&G.map)}>Cover it in cloud again</button>
    <button type="button" data-act="mapOpen"${dis(!title&&G.map)}>Open the map</button></div>
  <div class="dt-h">Teleport</div><div class="seg">`;
  for(const s of SPOTS)h+=`<button type="button" data-tp="${s.id}"${dis(!title)}>${esc(s.name)}</button>`;
  h+=`</div><div class="seg">`;
  const rn={mouth:'Mouth',gallery:'Gallery',stair:'Stair',channel:'Channel',drafts:'Drafts',arena:'Arena'};
  for(const r of CAVE_ORDER)h+=`<button type="button" data-tp="${r}"${dis(!title&&loop)}>Cave · ${rn[r]}</button>`;
  h+=`</div><div class="dt-h">Monsters</div><div class="seg">
    <button type="button" data-spawn="hollow"${dis(!title)}>Spawn hollow</button><button type="button" data-spawn="hound"${dis(!title)}>Spawn hound</button>
    <button type="button" data-spawn="brineling"${dis(!title)}>Spawn brineling</button><button type="button" data-act="kill"${dis(!title)}>Kill nearby</button></div>
  <p class="dt-note" id="dtNote" aria-live="polite"></p>`;
  const focusKey=document.activeElement&&sheet.contains(document.activeElement)?keyOf(document.activeElement):null;
  sheet.innerHTML=h; noteEl=$('dtNote'); noteEl.textContent=lastNote;
  if(focusKey){ const el=sheet.querySelector(focusKey); if(el&&!el.disabled){ try{el.focus({preventScroll:true});}catch(_){el.focus();} if(G.input.device==='gamepad')el.classList.add('pad-focus'); } }
}
function keyOf(el){ for(const a of ['data-capspeed','data-prog','data-start','data-cheat','data-give','data-act','data-tide','data-speed','data-tp','data-spawn']) if(el.hasAttribute(a))return `[${a}="${el.getAttribute(a)}"]`; return null; }
function onClick(e){
  const b=e.target.closest('button'); if(!b||b.disabled)return;
  const d=b.dataset; let msg='';
  try{
    if(d.start){ chooseStart(d.start); return; }
    if(d.cheat){ toggle(d.cheat); return; }
    if(d.prog){ testMode(); if(d.prog==='reveal'){ G.progress.reveal=!G.progress.reveal; msg=G.progress.reveal?'Shards (violet) and caches (amber) marked with beams':'Markers hidden'; } else { G.progress.give(d.prog); msg='Given: '+d.prog; } }
    else if(d.give)msg=giveItem(d.give);
    else if(d.tide){ testMode(); msg=setTide(d.tide); }
    else if(d.speed){ setSpeed(+d.speed); return; }
    else if(d.capspeed){ G.ui.setCaptionSpeed(d.capspeed); msg='Message reading time: '+d.capspeed; }
    else if(d.act==='capTest'){ sayBurst(); msg='Five lines queued (one low, one high): close the panel to watch them, then pause > Messages'; }
    else if(d.act==='capClear'){ G.ui.clearMessages(); msg='Message log cleared'; }
    else if(d.tp)msg=teleport(d.tp);
    else if(d.spawn)msg=spawnMonster(d.spawn);
    else if(d.act==='close'){ closePanel(); return; }
    else if(d.act==='recipes')msg=learnAll();
    else if(d.act==='swarm'){ testMode(); msg=giveSwarm(60); }
    else if(d.act==='jar'){ testMode(); msg=G.moths.jar.give()?'The moth jar is yours':'You already have it'; }
    else if(d.act==='heal'){ G.player.heal(G.player.maxHp); msg='Healed'; }
    else if(d.act==='kill')msg=killNearby();
    else if(d.act==='mapReveal'){ testMode(); G.map.revealAll(); msg='The whole island is charted'; }
    else if(d.act==='mapCover'){ testMode(); G.map.reset(); msg='Clouds over everything again (they clear as you walk)'; }
    else if(d.act==='mapOpen'){ const from=opener; closePanel(from==='play'); G.map.open(); return; } // from play: stay paused under the map (it resumes on close)
  }catch(err){ console.error('devtools',err); msg='That failed: '+(err&&err.message); }
  note(msg); render();
}
/* captions: a burst of lines of every priority, to try the reading time, the Enter/tap hint, the queue and the log */
function sayBurst(){
  const say=(t,o)=>G.ui.say(t,o);
  say('A long line to read at your own pace: the fog lies thick in the hollows of the moor, and somewhere inside it a bell is ringing very slowly.');
  say('“Can’t get in, can you?” he says. “No more could I.”',{who:'Halloran'});
  say('A gull cries somewhere below.',{priority:'low'});
  say('A second thing, waiting its turn behind the first.');
  setTimeout(()=>say('Something stirs in the fog. (a high-priority line: it cuts in)',{priority:'high'}),2500);
}
function openPanel(){
  if(!card||!card.hidden)return;
  const mode=G.state.mode;
  if(mode==='dead'||mode==='ending')return;
  opener=mode==='play'?'play':mode==='paused'?'pause':'title';
  if(mode==='play'){ G.setMode('paused'); G.input.unlockPointer(); }
  card.hidden=false; DT.open=true; lastNote=''; render();
  const f=sheet.querySelector('.dt-start.main')||sheet.querySelector('button'); if(f){ try{f.focus({preventScroll:true});}catch(_){f.focus();} }
  card.scrollTop=0;
}
function closePanel(silent){
  if(!card||card.hidden)return;
  card.hidden=true; DT.open=false;
  if(silent){ opener=null; return; }
  if(opener==='play'&&G.state.mode==='paused'){ G.setMode('play'); G.input.lockPointer(); }
  else if(opener==='pause'){ const r=$('resume'); if(r&&!$('pause').hidden)r.focus(); }
  else if(opener==='title'){ const b=$('continue'); const t=b&&!b.hidden?b:$('begin'); if(t)t.focus(); }
  opener=null; badge();
}
DT.openPanel=openPanel; DT.closePanel=closePanel; DT.giveSwarm=giveSwarm; DT.setTide=setTide; DT.teleport=teleport; DT.toggle=toggle; DT.setSpeed=setSpeed;
DT.spawn=spawnMonster; DT.kill=killNearby; DT.give=giveItem;

/* keyboard: ` toggles; Esc closes (caught before core so it doesn't also resume/pause the game) */
addEventListener('keydown',e=>{
  if(e.code==='Backquote'&&!e.repeat){ e.preventDefault(); e.stopPropagation(); if(card&&!card.hidden)closePanel(); else openPanel(); return; }
  if(card&&!card.hidden&&(e.code==='Escape'||e.code==='KeyP')){ e.preventDefault(); e.stopPropagation(); closePanel(); }
},true);

/* ---------------------------------------------------------------- system */
let renderT=0;
G.system('devtools',{order:-5,modes:'always',
  init(){
    build(); hookPlayer();
    const boot=unstash(BOOT_KEY);
    if(boot&&boot.id){
      G.testSaves=true;
      if(boot.cheats)Object.assign(DT.cheats,boot.cheats);
      if(boot.timeScale)G.timeScale=boot.timeScale;
      if(DT.cheats.fps)setFps(true);
      G.on('ready',()=>setTimeout(()=>{ try{ runStart(boot.id); }catch(e){console.error('devtools start',e);} badge(); },30));
    }
  },
  update(dt){
    if(DT.cheats.fps&&newFrame&&G.renderer&&G.renderer.info){ newFrame=false; const r=G.renderer.info.render; calls=r.calls; tris=r.triangles; G.renderer.info.reset(); }
    if(G.state.mode==='play')applyCheats();
    if(card&&!card.hidden){ renderT-=G.dt||0; if(renderT<=0){ renderT=1; const t=sheet.querySelector('[data-tide]'); if(t&&t.closest('.dt-row')){ const lbl=t.closest('.dt-row').querySelector('small'); if(lbl)lbl.textContent='('+tideName()+')'; } } }
    if(badgeEl){ const want=!((anyCheat()||G.testSaves)&&G.state.mode!=='title'); if(badgeEl.hidden!==want)badge(); }
  }
});
})();
