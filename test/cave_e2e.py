"""Plays the Drowned Keepers' Cave end to end, headless, through the real controller (virtual stick/buttons + interact):
new loop -> recruit island moths -> the sandbar at low tide -> enter (swarm transfer) -> mouth vein -> gallery (roost, brinelings,
vein, page 1, seal) -> death + rise -> save/reload/Continue inside -> stair (low passage at low tide, crates/ledge at high tide)
-> channel (raft run: 25-35 s, telegraphed boarders knocked off with bolts from the walkway, page 2, sluice) -> drafts (lantern shut between gusts) -> door seal -> the Undertow
(shut lantern, moths reveal it, lashes/surges/drag, lens) -> defeat (jar, page 3, wall, Wound, arena lit, shortcut) ->
save/reload/Continue after the boss -> shortcut -> mouth -> out (swarm transfer) -> jar -> cure the Black Tide Pool.
Then, in a fresh session, the soft-lock guards (SOFTLOCK: rising never behind a seal/grate, the draught out, the keeper's bench,
Continue from a broken save). Plus: a camera random walk through every room (camera never inside the rock), draw calls, screenshots in /tmp/claude-0/cave-int/.
Only the start teleports (to the beach); it tops up hp like loop_e2e. Every step asserts.
usage: python3 test/cave_e2e.py [url] [--softlock]   (default http://localhost:8800/dev.html?debug; --softlock: only the soft-lock scenario)"""
import asyncio, sys, os, json
from playwright.async_api import async_playwright
URL=sys.argv[1] if len(sys.argv)>1 else 'http://localhost:8800/dev.html?debug&headless'
SOFT_ONLY='--softlock' in sys.argv[2:]   # run only the soft-lock scenario
SHOTS='/tmp/claude-0/cave-int'; os.makedirs(SHOTS,exist_ok=True)

LIB=r"""
window.T=(()=>{
const P=()=>G.player;
const KEYS=['forward','back','left','right','sprint','jump','attack','interact','shutter','roll','lock'];
function keys(set){ for(const k of ['forward','back','left','right','sprint']) G.input.setVirtual(k,set.has(k)); }
function release(){ for(const k of KEYS)G.input.setVirtual(k,false); }
function top(){ const p=P(); if(p.alive&&p.hp<p.maxHp-2)p.hp=p.maxHp; }
/* the virtual stick: 8-way keys relative to the camera, dithered between neighbours so the mean heading is analog */
function steer(x,z,o){ o=o||{}; const p=P().pos, dx=x-p.x, dz=z-p.z, d=Math.hypot(dx,dz); if(d<1e-3){keys(new Set());return d;}
  const yaw=P().camYaw, fx=Math.sin(yaw), fz=Math.cos(yaw), my=(dx*fx+dz*fz)/d, mx=(dx*-fz+dz*fx)/d, s=new Set();
  const a=Math.atan2(mx,my)/(Math.PI/4), lo=Math.floor(a), fr=a-lo; T._pwm=(T._pwm||0)+fr; let k=lo; if(T._pwm>=1){T._pwm-=1;k=lo+1;}
  k=((k%8)+8)%8; for(const n of [['forward'],['forward','right'],['right'],['back','right'],['back'],['back','left'],['left'],['forward','left']][k])s.add(n);
  if(o.sprint)s.add('sprint'); keys(s); return d; }
function where(){ const p=P().pos, l=G.cave.toLocal(p); return G.cave.inside?['L',+l.x.toFixed(1),+l.y.toFixed(2),+l.z.toFixed(1),G.cave.room(p)]:['W',+p.x.toFixed(1),+p.y.toFixed(2),+p.z.toFixed(1)]; }
/* walk waypoints [[x,z],..] (world, or cave-local with o.local) */
function walk(pts,o){ o=o||{}; let steps=0; const max=o.max||1800, tol=o.tol||.6;
  for(let i=0;i<pts.length;i++){ let [x,z]=pts[i]; if(o.local){x+=G.cave.origin.x; z+=G.cave.origin.z;}
    let best=1e9, bestAt=0;
    while(true){ const d=steer(x,z,o); if(d<(i===pts.length-1?tol:Math.max(tol,1.2)))break;
      G.step(1/30,1); steps++; if(o.top!==false)top(); if(o.each)o.each(steps);
      if(d<best-.05){best=d;bestAt=steps;}
      if(steps-bestAt>(o.patience||90)||steps>max){ release(); return {ok:false,wp:i,at:where(),d:+d.toFixed(2),steps}; } } }
  release(); G.step(1/30,6); return {ok:true,at:where(),steps}; }
function tap(a,n){ G.input.setVirtual(a,true); G.step(1/30,1); G.input.setVirtual(a,false); G.step(1/30,n==null?3:n); }
function label(){ const c=G.interact.pick(P().pos); return c?G.interact.label(c):null; }
/* press interact on what the controller offers (only if its label matches) */
function use(re){ G.step(1/30,2); const lab=label(); if(re&&!(lab&&re.test(lab)))return 'NOPE:'+lab; tap('interact',6); return lab; }
function wait(sec,o){ o=o||{}; const n=Math.round(sec*30); for(let i=0;i<n;i++){ G.step(1/30,1); if(o.top!==false)top(); if(o.until&&o.until())return +(i/30).toFixed(1); } return sec; }
const ML=()=>G.creatures.moths;
function swarm(){ return ML().filter(m=>m.tgt==='lantern'||m.tgt==='hunt'||m.tgt==='feed').length; }
function near(r){ const p=P().pos; return ML().filter(m=>(m.tgt==='lantern'||m.tgt==='hunt')&&m.p.distanceTo(p)<r).length; }
function states(){ const o={}; for(const m of ML())o[m.tgt]=(o[m.tgt]||0)+1; return o; }
function until(pred,max){ let n=0; while(!pred()&&n<(max||10000)){ G.step(1/30,1); top(); n++; } return +(n/30).toFixed(1); }
function hud(){ const $=id=>{const e=document.getElementById(id); return e?e.textContent:'';}; const mc=document.querySelector('.moth-chip .txt');
  return {obj:$('obj'),sub:$('objSub'),moths:mc?mc.textContent:'',boss:document.getElementById('boss').hidden?'':$('bossName')}; }
const marker=()=>{ const q=G.quest.target; return q?(G.cave.inside?(q.y>G.cave.origin.y-30&&Math.hypot(q.x-G.cave.origin.x,q.z-G.cave.origin.z)<200):true):null; };
/* fight monsters near the player: walk up and swing; bolts (lock-on) for anything in water / on the raft / slippery */
function bolt(m){ let ok=false;
  for(let k=0;k<6&&!ok;k++){ if(P().lockTarget)tap('lock',1); tap('lock',2); ok=P().lockTarget===m.hb;
    if(!ok){ if(P().lockTarget)tap('lock',1); for(let i=0;i<3;i++){ steer(m.pos.x,m.pos.z); G.step(1/30,1);} release(); } }
  G.input.setVirtual('attack',true); G.step(1/30,22); G.input.setVirtual('attack',false); G.step(1/30,12);
  if(P().lockTarget)tap('lock',1); return ok; }
function fight(o){ o=o||{}; const pp=P().pos; let steps=0, ft=null, fn=0; const max=o.max||1500;
  const alive=()=>G.monsters.list.filter(m=>m.alive&&!m.dying&&(!o.room||G.cave.room(m.pos)===o.room)&&m.pos.distanceTo(pp)<(o.r||30)&&(!o.threats||!/idle|return|wander/.test(m.state)));
  let a; while((a=alive()).length&&steps<max){ a.sort((x,y)=>x.pos.distanceTo(pp)-y.pos.distanceTo(pp)); const m=a[0], d=Math.hypot(m.pos.x-pp.x,m.pos.z-pp.z);
    if(m!==ft){ft=m;fn=0;} fn++;
    if(d>1.6&&(fn>90||m.pos.y<pp.y-1.2||m.onRaft)&&d<15){ bolt(m); steps+=46; fn=60; }
    else if(d>1.6){ steer(m.pos.x,m.pos.z); G.step(1/30,1); steps++; }
    else { release(); G.input.setVirtual('attack',true); G.step(1/30,1); G.input.setVirtual('attack',false); G.step(1/30,9); steps+=10; }
    top(); if(o.each)o.each(steps); }
  release(); const l=alive(); return {left:l.length,steps,who:l.map(m=>m.kind+':'+m.state+'@'+G.cave.toLocal(m.pos).toArray().map(v=>v.toFixed(1)).join(','))}; }
/* wait for a condition like a player would: keep fighting off anything that comes for the swarm meanwhile */
function guard(pred,max){ let n=0; const P0=P().pos.clone();
  while(!pred()&&n<(max||10000)){ const near=G.monsters.list.some(m=>m.alive&&!m.dying&&m.pos.distanceTo(P().pos)<12);
    if(near){ const f=fight({r:12,max:300}); n+=Math.max(1,f.steps); walk([[P0.x,P0.z]],{max:300}); }
    else { G.step(1/30,1); top(); n++; } }
  return +(n/30).toFixed(1); }
/* run and jump (holding jump to glide) onto cave-local (x,z) */
function leap(x,z,o){ o=o||{}; const O=G.cave.origin; x+=O.x; z+=O.z; let n=0, jumped=false, air=0;
  while(n<150){ const d=steer(x,z); if(!jumped&&d<(o.at||2.6)&&P().grounded){ G.input.setVirtual('jump',true); jumped=true; }
    G.step(1/30,1); n++; if(jumped&&!P().grounded)air++; if(jumped&&air>2&&P().grounded)break; if(d<.3)break; }
  release(); G.step(1/30,4); return where(); }
/* round the arena ring to cave-local (x,z), never through the pool */
function ring(x,z,r){ r=r||12.5; const A={x:60,z:-15}, O=G.cave.origin, p=P().pos; const a0=Math.atan2(p.z-O.z-A.z,p.x-O.x-A.x), a1=Math.atan2(z-A.z,x-A.x);
  let d=a1-a0; while(d>Math.PI)d-=2*Math.PI; while(d<-Math.PI)d+=2*Math.PI; const n=Math.max(1,Math.ceil(Math.abs(d)/.35)), pts=[];
  for(let i=0;i<=n;i++){ const a=a0+d*i/n; pts.push([A.x+Math.cos(a)*r,A.z+Math.sin(a)*r]); } pts.push([x,z]); return walk(pts,{local:true}); }
const losses={}; G.on('moths:lost',e=>{ const k=G.cave.inside?(G.cave.room(P().pos)||'cave'):'island'; losses[k]=(losses[k]||0)+e.n; });
return {keys,release,steer,walk,where,tap,label,use,wait,swarm,near,states,until,guard,hud,marker,fight,bolt,leap,ring,losses,top};
})(); 'lib'
"""

# camera check: the camera must never end up inside the rock, above the ceiling or below the floor
CAMCHECK=r"""
window.NAN=window.NAN||[]; if(!console._nanHook){ const ce=console.error; console._nanHook=1; console.error=function(...a){ if(String(a[0]).includes('NaN')&&NAN.length<3)NAN.push(new Error().stack.split('\n').slice(2,8).join(' | ')); return ce.apply(console,a); }; }
window.CAM={n:0,bad:[]}; G.system('camCheck',{order:99,modes:['play'],update(){ if(!G.cave.inside)return; const D=G.cave._debug, O=G.cave.origin, c=G.camera.position, x=c.x-O.x, y=c.y-O.y, z=c.z-O.z;
  CAM.n++; const s=D.Sat(x,z), f=D.Fat(x,z), cc=D.Cat(x,z); const b=s>.02?'rock':y>cc+.02?'ceil':y<f-.12?'floor':''; /* .1: hurt / landing shake jitters the camera after it is placed */ if(b&&CAM.bad.length<50)CAM.bad.push([b,G.cave.room(G.player.pos),+x.toFixed(1),+y.toFixed(1),+z.toFixed(1)]); }}); 'cam'
"""

STEPS=[
 # ---------------------------------------------------------------- setup + the island
 ("setup", r"""(()=>{ document.getElementById('begin').click(); G.debugStartLoop(); G.step(1/30,10);
   const L=G.items.lantern; L.carried=true; L.inCradle=false; L.shut=false;
   G.alchemy.learn('bait'); G.alchemy.debug.give('ichor',5); G.alchemy.debug.give('glowcap',12);
   G.player.teleport(151.8,42,32.1,0); G.step(1/30,5);   // at the alchemy table in the shed
   const brewed=['tincture','tincture','tincture','tincture','bait','bait'].map(id=>G.alchemy.brew(id,{instant:true}));
   let t=40; G.alchemy.debug.setTide(t); G.step(1/30,2);
   G.player.teleport(95,G.floorAt(95,55.5),55.5,Math.PI); G.step(1/30,20);   // the beach below the moor (the only teleport)
   return {ok:brewed.every(Boolean)&&G.inv.count('vial')===4&&G.alchemy.etherUnits===20&&G.moths.baitLeft>200&&!G.tide.low,
     vials:G.inv.count('vial'),ether:G.alchemy.etherUnits,bait:Math.round(G.moths.baitLeft),tide:+G.tide.level.toFixed(2),at:T.where()}; })()"""),
 ("recruit", r"""(()=>{ // walk up to the corruption patch on the moor above the beach: the baited lantern draws its moths
   const p=G.world.landmarks.patches.reduce((a,b)=>Math.hypot(b.x-95,b.z-55)<Math.hypot(a.x-95,a.z-55)?b:a);
   const r=T.walk([[90,45],[p.x+4,p.z+4]],{max:2400}); T.wait(10,{until:()=>T.swarm()>=24}); T.wait(2);
   const r2=T.walk([[90,45],[95,55.5]],{max:2400});
   return {ok:(r.ok||r.d<3)&&r2.ok&&T.swarm()>=12,swarm:T.swarm(),r,r2}; })()"""),
 ("sandbar", r"""(()=>{ const tw=T.until(()=>G.tide.low,9000);
   const r=T.walk([[97,55.7],[110,56.7],[124,55.9],[138,56.9]],{max:3000}); const disc=G.caveBoss.discovered, q=G.quest.step;
   return {ok:G.tide.low&&r.ok&&disc&&q==='cave'&&T.hud().obj.includes('Keepers'),tideWait:tw,disc,q,r,hud:T.hud()}; })()"""),
 ("shot:beach-lowtide",None),
 ("toMouth", r"""(()=>{ const r=T.walk([[152,56.2],[166,57.5],[176,57.7],[181.2,56],[181.2,51.6]],{max:3000}); T.wait(1);
   const lab=T.label(); const sw=T.swarm(), near=T.near(14);
   window._in={sw,near};
   return {ok:r.ok&&lab==='Enter the sea cave'&&G.tide.low,r,lab,swarm:sw,near}; })()"""),
 ("shot:mouth-arch",None),
 ("enter", r"""(()=>{ const u=T.use(/Enter/); T.wait(2.5); const near=T.near(14), sw=T.swarm();
   return {ok:u==='Enter the sea cave'&&G.cave.inside&&G.cave.room(G.player.pos)==='mouth'&&near>=window._in.near-1&&sw>=window._in.sw-1,
     before:window._in,after:{near,swarm:sw},at:T.where(),checkpoint:G.state.checkpointName,obj:T.hud().obj,marker:T.marker()}; })()"""),
 ("shot:mouth-dark",None),
 ("mouthVein", r"""(()=>{ const r=T.walk([[-5.5,-9]],{local:true}); const lab=T.label(); const u=T.use(/vein/i); T.wait(2);
   return {ok:r.ok&&/Wake the vein/.test(lab)&&G.cave.isLit('mouth')&&G.alchemy.etherUnits===20,lab,lit:G.cave.isLit('mouth'),ether:G.alchemy.etherUnits,hud:T.hud()}; })()"""),
 ("shot:mouth-lit",None),
 # ---------------------------------------------------------------- the gallery of keepers
 ("gallery", r"""(()=>{ const sw0=T.swarm(); const r=T.walk([[0,-16],[0,-24],[0,-28],[4,-29]],{local:true}); T.wait(3,{until:()=>G.cavePuzzles.roost.count<5});
   const sw1=T.swarm(), roostLeft=G.cavePuzzles.roost.count, packs=G.caveBoss.monsters.filter(m=>m.alive&&m.kind==='brineling').length;
   return {ok:r.ok&&sw1>=sw0+30&&packs>=2&&/Gallery Seal|Keepers/.test(T.hud().obj),swarmBefore:sw0,swarm:sw1,roostLeft,brinelings:packs,hud:T.hud(),marker:T.marker()}; })()"""),
 ("shot:gallery-dark",None),
 ("galleryFight", r"""(()=>{ const f=T.fight({room:'gallery'}); T.wait(2);
   return {ok:f.left===0&&T.swarm()>=30&&G.inv.count('ichor')>=1,fight:f,swarm:T.swarm(),lost:T.losses.gallery||0,ichor:G.inv.count('ichor')}; })()"""),
 ("galleryVein", r"""(()=>{ const r=T.walk([[-12.3,-33]],{local:true}); const lab=T.label(); const u=T.use(/vein/i); T.wait(1.5);
   return {ok:/Light the vein/.test(lab||'')&&G.cave.isLit('gallery')&&G.alchemy.etherUnits===15,lab,ether:G.alchemy.etherUnits,vials:G.inv.count('vial')}; })()"""),
 ("shot:gallery-lit",None),
 ("toPage1", r"""(()=>{ const r=T.walk([[-4.6,-40.2],[-6.2,-41.4]],{local:true}); T.wait(.5); return {ok:r.ok&&/page/i.test(T.label()||''),lab:T.label()}; })()"""),
 ("shot:page-prop",None),
 ("page1", r"""(()=>{ const r=T.walk([[-6.5,-41.6]],{local:true}); const u=T.use(/page/i); T.wait(.5);
   return {ok:u==='Read the page'&&G.caveBoss.pages.includes(1),u,pages:G.caveBoss.pages}; })()"""),
 ("gallerySeal", r"""(()=>{ const s=G.cavePuzzles.seals.gallery; const r=T.walk([[0,-41.5]],{local:true}); const t=T.wait(16,{until:()=>s.cured}); T.wait(3);
   return {ok:s.cured&&G.cavePuzzles.open('gallery'),t,progress:Math.round(s.progress*100),swarm:T.swarm()}; })()"""),
 # ---------------------------------------------------------------- dying in the cave
 ("die", r"""(()=>{ const P=G.player; P.hurt({damage:99,kind:'melee',dir:new THREE.Vector3(0,0,1),knockback:0,ignoreIframes:true}); G.step(1/30,30);
   return {ok:G.state.mode==='dead'&&!P.alive,mode:G.state.mode,cp:G.state.checkpointName}; })()"""),
 ("rise", "WAIT_RISE"),
 ("afterRise", r"""(()=>{ G.step(1/30,30); const P=G.player, L=G.items.lantern;
   return {ok:G.state.mode==='play'&&P.alive&&G.cave.inside&&G.cave.room(P.pos)==='gallery'&&L.carried&&G.cave.isLit('gallery'),
     mode:G.state.mode,at:T.where(),cp:G.state.checkpointName,lantern:L.carried,hp:P.hp}; })()"""),
 # ---------------------------------------------------------------- save -> reload -> Continue, inside the cave
 ("saveInCave", r"""(()=>{ T.wait(2); G.setMode('paused'); document.getElementById('saveBtn').click(); const d=JSON.parse(localStorage.getItem('bq-save-v1')||'null');
   window._save1={lit:G.cave.litRooms.sort().join(','),open:['gallery','channel','arena'].filter(id=>G.cavePuzzles.open(id)).join(','),pages:G.caveBoss.pages.join(',')};
   return {ok:!!d&&d.mods&&d.mods.cave&&d.mods.cavePuzzles&&d.mods.caveBoss,keys:Object.keys(d.mods||{}),state:window._save1}; })()"""),
 ("reload", "RELOAD"),
 ("continueInCave", r"""(()=>{ G.step(1/30,30); const s=window._save1||{};
   const lit=G.cave.litRooms.sort().join(','), open=['gallery','channel','arena'].filter(id=>G.cavePuzzles.open(id)).join(','), pages=G.caveBoss.pages.join(',');
   return {ok:G.cave.inside&&G.cave.room(G.player.pos)==='gallery'&&G.loop.active&&G.cave.isLit('gallery')&&G.cavePuzzles.open('gallery')&&G.caveBoss.pages.includes(1)&&G.items.lantern.carried&&G.moths.baitLeft>0&&/Keepers|Gallery|Stair/.test(T.hud().obj),
     at:T.where(),lit,open,pages,bait:Math.round(G.moths.baitLeft),hud:T.hud(),marker:T.marker()}; })()"""),
 ("regroup", r"""(()=>{ // the swarm isn't saved: the baited lantern gathers the cave moths again at the roost
   const r=T.walk([[2,-30],[5,-29.5]],{local:true}); T.wait(6,{until:()=>T.swarm()>=36}); T.wait(1);
   return {ok:T.swarm()>=30,swarm:T.swarm(),roost:G.cavePuzzles.roost.count}; })()"""),
 # ---------------------------------------------------------------- the flooding stair
 ("stairLight", r"""(()=>{ const r=T.walk([[0,-45],[0,-49.5],[-4,-51],[-8.2,-50.3]],{local:true}); const d=T.where();
   const lab=T.label(); const u=T.use(/vein/i); T.wait(1);
   return {ok:r.ok&&G.cave.isLit('stair')&&G.alchemy.etherUnits===10,lab,ether:G.alchemy.etherUnits,at:d,hud:T.hud()}; })()"""),
 ("shot:stair-lit",None),
 ("lowPassage", r"""(()=>{ const f=T.fight({room:'stair'}); const r0=T.walk([[-7.5,-53],[-7.6,-60],[-8,-65]],{local:true});
   const tw=T.guard(()=>G.cave.lowPassageOpen()&&G.tide.low&&G.tide.lowLeft>40,12000); // through and back before the water returns
   const r1=T.walk([[-8,-70],[-8,-76],[-8,-79.5],[-6,-83]],{local:true});
   return {ok:r0.ok&&r1.ok&&G.cave.room(G.player.pos)==='channel',fight:f,tideWait:tw,level:+G.tide.level.toFixed(2),r1,swarm:T.swarm()}; })()"""),
 ("backThroughPassage", r"""(()=>{ const r=T.walk([[-7.6,-81],[-7.8,-77],[-8,-70],[-8,-65],[-7.6,-60],[-7.6,-53.5],[-4,-51.5],[-1.8,-52.6]],{local:true});
   return {ok:r.ok&&G.cave.room(G.player.pos)==='stair',r,lowOpen:G.cave.lowPassageOpen()}; })()"""),
 ("highTide", r"""(()=>{ const tw=T.guard(()=>G.cave.water()>1.3,12000); const r=T.walk([[-1.6,-53.6]],{local:true});
   const c=G.cavePuzzles.crates.map(c=>+(c.top-G.cave.origin.y).toFixed(2));
   return {ok:G.cave.water()>1.3&&c.every(y=>y>1.8),tideWait:tw,water:+G.cave.water().toFixed(2),crateTops:c,lowOpen:G.cave.lowPassageOpen(),swarm:T.swarm(),hud:T.hud()}; })()"""),
 ("shot:stair-crates",None),
 ("crates", r"""(()=>{ const a=T.leap(-1.3,-56.4,{at:2.4}), b=T.leap(.9,-59,{at:2.8}), c=T.leap(3.3,-61.6,{at:2.8}), d=T.leap(6.8,-63,{at:2.6});
   const onLedge=d[2]>2.4;
   const r=T.walk([[7.5,-70],[6,-76],[0,-77],[0,-80.5],[-5,-83]],{local:true});
   return {ok:a[2]>1.6&&b[2]>1.6&&c[2]>1.6&&onLedge&&r.ok&&G.cave.room(G.player.pos)==='channel',crate1:a,crate2:b,crate3:c,ledge:d,r,swarm:T.swarm()}; })()"""),
 # ---------------------------------------------------------------- the channel
 ("shot:channel-dark",None),
 ("channelLight", r"""(()=>{ const f=T.fight({room:'channel',max:900});
   // the fight can end out by the raft (east); come back round the walkway rather than straight through the crates
   const back=G.cave.toLocal(G.player.pos).x>-1?T.walk([[1,-81.5],[-2,-84]],{local:true}):null; const r=T.walk([[-6,-86],[-6.1,-89.4]],{local:true}); const lab=T.label(); const u=T.use(/vein/i); T.wait(1);
   return {ok:G.cave.isLit('channel')&&G.alchemy.etherUnits===5,fight:f,lab,ether:G.alchemy.etherUnits,swarm:T.swarm()}; })()"""),
 ("loadRaft", r"""(()=>{ const back=T.walk([[-2,-84],[1,-81.5]],{local:true}); const ich=G.inv.count('ichor');
   const r=T.walk([[4.6,-80.4]],{local:true}); const lab=T.label(); const u=T.use(/raft/i); G.step(1/30,2);
   const R=G.cavePuzzles.raft;   // no waiting on the tide: the channel always runs toward the sluice
   return {ok:u==='Set the lantern on the raft'&&R.lantern&&R.state==='loaded'&&!G.items.lantern.carried&&R.moths>=20,level:+G.tide.level.toFixed(2),lab,state:R.state,raftMoths:R.moths,swarm:T.swarm(),bait:Math.round(G.moths.baitLeft),ichorUsed:ich-G.inv.count('ichor'),hud:T.hud()}; })()"""),
 ("raftRun", r"""(()=>{ const R=G.cavePuzzles.raft, O=G.cave.origin; const log=[]; let shots=0, page=null, steps=0, boarded=0, gripped=0, knocked=0;
   G.on('brineling:board',()=>boarded++); G.on('brineling:grip',()=>gripped++); G.on('brineling:knocked',()=>knocked++);
   const r0=T.walk([[0,-82.5],[-6,-83.4],[-10,-85],[-10,-86],[-3,-86],[4,-86]],{local:true,sprint:true});
   const sw0=T.swarm(), at0=+R.runT.toFixed(1);
   while(R.state!=='arrived'&&R.state!=='done'&&steps<2400){
     const b=G.monsters.list.filter(m=>m.alive&&!m.dying&&m.raid);   // crabs gripping the edge or aboard: a charged bolt from the walkway
     if(b.length){ T.bolt(b[0]); shots++; steps+=46; continue; }
     const tx=Math.min(R.pos.x-O.x,44.5)-1, px=G.player.pos.x-O.x;
     if(!page&&Math.abs(px-31)<1.5){ T.walk([[31,-86.4]],{local:true}); page=T.use(/page/i); continue; }
     if(Math.abs(tx-px)>1.2)T.steer(tx+O.x,O.z-86.1); else T.keys(new Set());
     G.step(1/30,1); steps++; T.top();
     if(steps%150===0)log.push([+R.runT.toFixed(1),+R.t.toFixed(2),R.moths,T.swarm(),R.raiders|0].join('/')); }
   T.release(); const runT=+R.runT.toFixed(1), pushes=R.pushes|0;
   return {ok:r0.ok&&(R.state==='arrived'||R.state==='done')&&page==='Read the page'&&G.caveBoss.pages.includes(2)&&T.swarm()>=G.cavePuzzles.seals.channel.needs
       &&gripped>=3&&boarded>=1&&knocked>=1&&shots>=1&&runT<=35&&(pushes>0||runT>=25),
     runT,pushes,atWalkway:at0,gripped,boarded,knocked,shots,swarmStart:sw0,swarm:T.swarm(),lost:T.losses.channel||0,log,pages:G.caveBoss.pages,at:T.where()}; })()"""),
 ("sluice", r"""(()=>{ const s=G.cavePuzzles.seals.channel; const t=T.wait(20,{until:()=>s.cured}); T.wait(3);
   const crabs=G.monsters.list.filter(m=>m.alive&&!m.dying&&m.raid).length;
   const lab=T.label(); const u=T.use(/lantern/i); T.wait(1);
   return {ok:s.cured&&t<=12&&G.cave.gate('channel')&&G.items.lantern.carried&&crabs===0,t,crabs,gate:G.cave.gate('channel'),lab,swarm:T.swarm(),hud:T.hud()}; })()"""),
 ("shot:channel-lit",None),
 # ---------------------------------------------------------------- the hall of drafts
 ("drafts", r"""(()=>{ const r=T.walk([[46,-86.3],[52,-86.5]],{local:true}); const L=G.items.lantern; if(!L.shut)T.tap('shutter',3); const shut=L.shut;
   const f=T.fight({room:'drafts',max:2400,r:45,threats:true}); // shy crabs with nothing to hunt are left alone, like a player would
   const r2=T.walk([[58,-86.3],[60,-80]],{local:true});
   return {ok:r.ok&&r2.ok&&shut&&f.left===0&&T.swarm()>=20,shut,fight:f,r2,swarm:T.swarm(),lost:T.losses.drafts||0,hud:T.hud()}; })()"""),
 ("shot:drafts-dark",None),
 ("gusts", r"""(()=>{ const L=G.items.lantern, gust=G.cavePuzzles.gust; let bursts=0, killedInGust=0; const lost0=G.moths.lost;
   G.on('moths:lost',e=>{ if(gust.phase==='burst'&&e.pos&&G.cavePuzzles.vents.some(v=>Math.hypot(e.pos.x-v.pos.x,e.pos.z-v.pos.z)<3.3))killedInGust+=e.n; }); // a gust's victims die over its vent
   const seen=()=>{ if(gust.phase==='burst'&&!seen.b){ seen.b=1; bursts++; } if(gust.phase!=='burst')seen.b=0; };
   if(!L.shut)T.tap('shutter',3);
   for(const [x,z] of [[60,-72],[60,-62],[60,-54],[60,-46],[60,-42]]){
     while(gust.phase!=='idle'||gust.next<3.5){ G.step(1/30,1); T.top(); seen(); }
     T.fight({r:9,max:600,threats:true}); T.walk([[x,z]],{local:true,each:seen}); if(z===-54&&!window._gustShot){ window._gustShot=1; } }
   const sw=T.swarm();
   return {ok:L.shut&&bursts>=3&&killedInGust===0&&sw>=20&&G.cave.room(G.player.pos)==='drafts',bursts,killedInGust,swarm:sw,at:T.where()}; })()"""),
 ("shot:gust-crossing",None),
 ("draftsLight", r"""(()=>{ T.tap('shutter',3); const r=T.walk([[57,-58],[56.8,-61.8]],{local:true}); const lab=T.label(); const u=T.use(/vein/i); T.wait(1);
   return {ok:!G.items.lantern.shut&&G.cave.isLit('drafts')&&G.alchemy.etherUnits===0,lab,ether:G.alchemy.etherUnits,swarm:T.swarm()}; })()"""),
 ("shot:drafts-lit",None),
 ("doorSeal", r"""(()=>{ const s=G.cavePuzzles.seals.arena; const r=T.walk([[60,-50],[60,-37.5]],{local:true}); const t=T.wait(20,{until:()=>s.cured}); T.wait(3);
   return {ok:s.cured&&G.cavePuzzles.open('arena'),t,needs:s.needs,swarm:T.swarm(),cp:G.state.checkpointName,hud:T.hud()}; })()"""),
 # ---------------------------------------------------------------- the Undertow
 ("bossStart", r"""(()=>{ const L=G.items.lantern; if(!L.shut)T.tap('shutter',3); const r=T.walk([[60,-33],[60,-30]],{local:true});
   T.wait(5,{until:()=>G.caveBoss.state==='idle'}); T.wait(4);
   const B=G.caveBoss; const hudN=+(T.hud().moths.match(/\d+/)||[0])[0];
   return {ok:r.ok&&L.shut&&B.state!=='sunk'&&B.moths>=10&&B.undertow.vis>.5&&hudN>=B.moths&&T.hud().boss==='The Undertow',state:B.state,onBoss:B.moths,hudMoths:hudN,vis:+B.undertow.vis.toFixed(2),hud:T.hud()}; })()"""),
 ("shot:boss-revealed",None),
 ("lashWindup", r"""(()=>{ const B=G.caveBoss.undertow, P=G.player, A=G.caveBoss.debug.centre(); let n=0;
   while(!(B.state==='lashWind'&&B.st>.75)&&n<2400){ if(B.state==='surge'||B.state==='surgeWind'){ const a=Math.atan2(P.pos.z-A.z,P.pos.x-A.x); T.steer(A.x+Math.cos(a)*16.5,A.z+Math.sin(a)*16.5); } else T.release(); G.step(1/30,1); n++; T.top(); }
   T.release(); return {ok:B.state==='lashWind',state:B.state,waited:+(n/30).toFixed(1),onBoss:G.caveBoss.moths}; })()"""),
 ("shot:lash-windup",None),
 ("bossFight", r"""(()=>{ const CB=G.caveBoss, B=CB.undertow, D=CB.debug, P=G.player, L=G.items.lantern;
   const ev={phase:[],tele:{},hits:0,core:0,miss:0,dmg:0,rolls:0,drags:0,hud0:0}; const A=D.centre();
   G.on('cave:bossPhase',e=>ev.phase.push(e.name)); G.on('cave:bossTelegraph',e=>ev.tele[e.kind]=(ev.tele[e.kind]||0)+1);
   G.on('cave:bossHit',e=>{ev.hits++; if(e.core)ev.core++;}); G.on('cave:bossMiss',()=>ev.miss++); G.on('player:hurt',e=>ev.dmg+=e.damage);
   const polar=(r,a)=>[A.x+Math.cos(a)*r,A.z+Math.sin(a)*r]; let steps=0, last='', dragOpen=0, hudBad=0;
   while(!CB.defeated&&steps<15000&&B.state!=='dying'){
     const st=B.state, dP=Math.hypot(P.pos.x-A.x,P.pos.z-A.z), aP=Math.atan2(P.pos.z-A.z,P.pos.x-A.x);
     if(steps%60===0&&CB.moths>0){ const n=+(T.hud().moths.match(/\d+/)||[0])[0]; if(n<CB.moths)hudBad++; }
     if(P.hp<P.maxHp-3)P.hp=P.maxHp;
     if(st==='dragWind'&&L.shut&&!dragOpen){ T.tap('shutter',1); dragOpen=1; ev.drags++; steps+=4; continue; }   // call the moths back to the light
     if(dragOpen&&st!=='dragWind'&&++dragOpen>40){ if(!L.shut)T.tap('shutter',1); dragOpen=0; }
     if(st==='lash'&&last!=='lash'){ T.steer(...polar(dP+4,aP)); G.input.setVirtual('roll',true); G.step(1/30,1); G.input.setVirtual('roll',false); ev.rolls++; steps++; last=st; continue; }
     if(st==='surge'&&B.surge){ const s=B.surge.r; if(Math.abs(s-dP)<1.6&&s<dP){ T.steer(...polar(dP-3,aP)); G.input.setVirtual('roll',true); G.step(1/30,1); G.input.setVirtual('roll',false); G.step(1/30,8); ev.rolls++; steps+=9; last=st; continue; } }
     last=st; let tgt=null;
     if(st==='miss'&&B.expose>.3)tgt=[D.lensPos.x,D.lensPos.z];
     else if(st==='idle'||st==='recover'){ let best=-1,bw=.35; for(let i=10;i<16;i++){ const s=D.samples[i], r=Math.hypot(s.x-A.x,s.z-A.z); if(r<CB.params.poolR+1.2||s.y>D.floorY()+2.4)continue; if(D.sampW[i]>bw){bw=D.sampW[i];best=i;} }
       if(best>=0)tgt=[D.samples[best].x,D.samples[best].z]; }
     if(tgt){ const d=Math.hypot(tgt[0]-P.pos.x,tgt[1]-P.pos.z);
       if(d>1.4){ T.steer(tgt[0],tgt[1]); G.step(1/30,1); steps++; }
       else { T.release(); G.input.setVirtual('attack',true); G.step(1/30,1); G.input.setVirtual('attack',false); G.step(1/30,7); steps+=8; } }
     else { const [hx,hz]=polar(12.5,aP); if(Math.hypot(hx-P.pos.x,hz-P.pos.z)>1.2)T.steer(hx,hz); else T.release(); G.step(1/30,1); steps++; }
     if(steps===2400)window._bossMid=1;
   }
   T.release();
   return {ok:(CB.defeated||B.state==='dying')&&ev.hits>=8&&ev.phase.length>=1&&(ev.tele.lash||0)+(ev.tele.surge||0)>=2&&hudBad===0,
     secs:Math.round(steps/30),state:B.state,hudBad,ev:JSON.stringify(ev),swarm:T.swarm(),lost:T.losses.arena||0}; })()"""),
 ("shot:boss-defeat",None),
 ("defeat", r"""(()=>{ const CB=G.caveBoss; let wound=0; G.on('cave:wound',()=>wound++); const t=T.wait(14,{until:()=>CB.defeated&&G.moths.jar.owned&&G.cave.wallDown}); T.wait(5);
   const L=G.items.lantern; if(L.shut)T.tap('shutter',3);
   const pg=G.cave.rooms.arena.anchors.page, O=G.cave.origin; const r=T.ring(pg.x-O.x-1,pg.z-O.z); const u=T.use(/page/i); T.wait(.5);
   return {ok:CB.defeated&&G.cave.wallDown&&G.cave.gate('shortcut')&&G.cave.isLit('arena')&&G.moths.jar.owned&&u==='Read the page'&&G.caveBoss.pages.includes(3)&&document.getElementById('boss').hidden,
     t,wall:G.cave.wallDown,shortcut:G.cave.gate('shortcut'),lit:G.cave.isLit('arena'),jar:G.moths.jar.owned,page:u,pages:CB.pages,hud:T.hud()}; })()"""),
 ("shot:arena-lit",None),
 ("wound", r"""(()=>{ const r=T.ring(60,-3.2,12.2); T.walk([[60,-2.6]],{local:true}); for(let i=0;i<14;i++){ T.steer(G.cave.origin.x+60,G.cave.origin.z+8); G.step(1/30,1);} T.release(); T.wait(1.5);
   const cv=document.querySelector('canvas'); cv.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0})); window.dispatchEvent(new MouseEvent('mousemove',{movementX:0,movementY:90})); G.step(1/30,2); window.dispatchEvent(new MouseEvent('mouseup',{bubbles:true})); G.step(1/30,10);
   return {ok:G.cave.wallDown&&r.ok,at:T.where()}; })()"""),
 ("shot:the-wound",None),
 # ---------------------------------------------------------------- save -> reload -> Continue after the boss
 ("saveAfterBoss", r"""(()=>{ T.wait(2); G.setMode('paused'); document.getElementById('saveBtn').click(); const d=JSON.parse(localStorage.getItem('bq-save-v1')||'null');
   return {ok:!!d&&d.mods.caveBoss.defeated===true&&d.mods.cave.wall===true,cb:d&&d.mods.caveBoss,cave:d&&d.mods.cave}; })()"""),
 ("reload", "RELOAD"),
 ("continueAfterBoss", r"""(()=>{ G.step(1/30,30);
   return {ok:G.cave.inside&&G.caveBoss.defeated&&G.cave.wallDown&&G.cave.gate('shortcut')&&G.cave.isLit('arena')&&G.moths.jar.owned&&G.caveBoss.pages.length===3&&G.caveBoss.state==='dead'&&document.getElementById('boss').hidden,
     at:T.where(),boss:G.caveBoss.state,jar:G.moths.jar.owned,lit:G.cave.litRooms,hud:T.hud()}; })()"""),
 # ---------------------------------------------------------------- out by the shortcut
 ("shortcut", r"""(()=>{ const L=G.items.lantern; if(L.shut)T.tap('shutter',3); const r=T.ring(44.5,-14.6);
   const r2=T.walk([[43.5,-14.3],[31,-8.2],[20,-5],[7,-10.4],[2,-12]],{local:true});
   const r3=T.walk([[2,-26],[5,-29.5]],{local:true}); T.wait(8,{until:()=>T.swarm()>=36}); // pick the roost moths up again on the way
   const r4=T.walk([[0,-24],[0,-12],[0,-6]],{local:true});
   return {ok:r.ok&&r2.ok&&r4.ok&&G.cave.room(G.player.pos)==='mouth',r2,swarm:T.swarm(),roost:G.cavePuzzles.roost.count,obj:T.hud()}; })()"""),
 ("leave", r"""(()=>{ const tw=T.guard(()=>G.cave.water()<-.6,12000); const r=T.walk([[0,0.5]],{local:true}); T.wait(1);
   const lab=T.label(), sw=T.swarm(), near=T.near(14); const u=T.use(/Leave/); T.wait(3);
   const sw2=T.swarm(), near2=T.near(14);
   return {ok:u==='Leave the cave'&&!G.cave.inside&&near2>=near-1&&sw2>=sw-1&&!G.items.lantern.shut&&!/Keepers/.test(T.hud().obj),
     tideWait:tw,before:{swarm:sw,near},after:{swarm:sw2,near:near2},at:T.where(),cp:G.state.checkpointName,obj:T.hud().obj,states:JSON.stringify(T.states())}; })()"""),
 ("shot:outside",None),
 ("capture", r"""(()=>{ const lab=T.label(); const u=T.use(/Capture/); T.wait(2);
   return {ok:/Capture/.test(u)&&G.moths.jar.count>=25,lab,jar:G.moths.jar.count,swarm:T.swarm()}; })()"""),
 ("toBlight", r"""(()=>{ const tw=T.until(()=>G.tide.low&&G.tide.lowLeft>45,12000);  // the sandbar floods again: set off at the start of a low tide
   const r=T.walk([[181.2,56.8],[176,57.7],[166,57.5],[152,56.2],[138,56.9],[124,55.9],[110,56.7],[97,55.7],[85,63],[70,69],[50,73],[40,73]],{max:4000});
   return {ok:r.ok&&G.moths.jar.count>=25&&G.player.alive,tideWait:tw,r,jar:G.moths.jar.count}; })()"""),
 ("topUp", r"""(()=>{ // 39 moths aren't the 40 a blight needs: free the jar at the patch on the moor, gather its moths too, jar them all again
   const p=G.world.landmarks.patches.reduce((a,b)=>Math.hypot(b.x-40,b.z-73)<Math.hypot(a.x-40,a.z-73)&&b.y<14?b:a);
   const r=T.walk([[p.x+3,p.z+3]],{max:3000}); const u=T.use(/Release/); T.wait(8,{until:()=>T.swarm()>=50}); T.wait(2); const sw=T.swarm();
   const c=T.use(/Capture/); T.wait(2);
   const r2=T.walk([[40,73]],{max:3000});
   return {ok:/Release|Capture/.test(u)&&/Capture/.test(c)&&G.moths.jar.count>=44&&r2.ok,patch:[Math.round(p.x),Math.round(p.z)],r,swarm:sw,jar:G.moths.jar.count,r2}; })()"""),
 ("cureWithJar", r"""(()=>{ const b=G.blights.find(x=>x.id==='tidepool'); T.walk([[b.pos.x+2.5,b.pos.z]],{max:600}); const lab=T.label(); const u=T.use(/Release/); T.wait(1); const sw=T.swarm();
   let t=0; const fights=[]; while(!b.cured&&t<3600){ const f=T.fight({r:14,max:300}); if(f.steps)fights.push(f.steps); T.walk([[b.pos.x+2.5,b.pos.z]],{max:300}); T.wait(1); t+=30+f.steps; }
   T.wait(3);
   return {ok:/Release/.test(u)&&b.cured,lab,released:sw,fights,cured:b.cured,progress:Math.round(b.progress*100),swarm:T.swarm()}; })()"""),
 ("shot:blight-cured",None),
 # ---------------------------------------------------------------- camera random walk + draw calls
 ("cameraWalk", r"""(()=>{ const D=G.cave._debug, O=G.cave.origin, cv=document.querySelector('canvas'); const rng=G.U.rng(4242);
   cv.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0})); const look=(dx,dy)=>window.dispatchEvent(new MouseEvent('mousemove',{movementX:dx,movementY:dy}));
   const n0=CAM.n; for(const room of ['mouth','gallery','stair','channel','drafts','arena']){ G.debugEnterCave(room); G.step(1/30,20); for(const m of G.monsters.list)if(m.alive)G.monsters.despawn(m);
     const R=G.cave.rooms[room].bounds; let frames=0;
     for(let k=0;k<40&&frames<900;k++){ let x,z,ok=false; for(let t=0;t<60&&!ok;t++){ x=R.min.x+rng()*(R.max.x-R.min.x)-O.x; z=R.min.z+rng()*(R.max.z-R.min.z)-O.z; ok=D.Sat(x,z)<-.8&&D.zoneFloor(x,z,50)!=null&&G.cave.room(G.cave.toWorld(x,0,z))===room; }
       if(ok)T.walk([[x,z]],{local:true,max:240,patience:40,each:()=>{ frames++; if(frames%9===0)look((rng()-.5)*160,(rng()-.5)*60); }}); } }
   window.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));
   const bad=CAM.bad.length;
   return {ok:bad===0,frames:CAM.n-n0,allFrames:CAM.n,bad,first:JSON.stringify(CAM.bad.slice(0,6))}; })()"""),
 ("drawCalls", "DRAWCALLS"),
]

# ---------------------------------------------------------------- soft-lock guards: a second, fresh session (the playthrough above
# is timed against the tide; these run separately so they can't shift it). Heath died in the gallery before opening its seal and
# rose behind the Undertow's door: wandering the shortcut tunnel from the mouth counted as reaching the arena.
SOFTLOCK=[
 ("s:setup", r"""(()=>{ document.getElementById('begin').click(); G.debugStartLoop(); G.step(1/30,10);
   const L=G.items.lantern; L.carried=true; L.inCradle=false; L.shut=false; G.alchemy.debug.give('glowcap',2);
   const room=G.debugEnterCave('mouth'); G.step(1/30,30); G.alchemy.debug.setTide(150); G.step(1/30,2);   // low water
   return {ok:G.cave.inside&&room==='mouth'&&/mouth/.test(G.state.checkpointName),room,cp:G.state.checkpointName,water:+G.cave.water().toFixed(2)}; })()"""),
 ("s:tunnelDetour", r"""(()=>{ // the shortcut tunnel is open from the mouth up to its grate: wandering it must not count as reaching the arena
   const r=T.walk([[2,-9],[7,-10.4],[20,-5.2],[31,-8.2],[40.5,-13.6]],{local:true}); T.wait(1.5); const reg=G.cave.region(G.player.pos), cp=G.state.checkpointName, reached=G.cave.reached();
   const r2=T.walk([[31,-8.2],[20,-5.2],[7,-10.4],[0,-10]],{local:true});
   return {ok:r.ok&&r2.ok&&reg==='tunnel'&&G.cave.room(G.player.pos)!=null&&/mouth/.test(cp)&&!reached.includes('arena')&&!G.cave.stranded(),reg,cp,reached,r}; })()"""),
 ("s:keeperBench", r"""(()=>{ // the alchemy table in the mouth: the shed's panel and recipes; glowcaps grow beside it; one caption
   const c0=G.inv.count('glowcap'), e0=G.alchemy.etherUnits; const r=T.walk([[0,-16],[-5,-19.3],[3.7,-19.4]],{local:true}); const u=T.use(/bench/); G.step(1/30,3);
   const open=!document.getElementById('alchemy').hidden, mode=G.state.mode, where=document.getElementById('alchWhere').textContent;
   const brewed=G.alchemy.brew('tincture',{instant:true}); G.alchemy.closeTable(); G.step(1/30,3);
   return {ok:r.ok&&u==='Work the keeper’s bench'&&open&&mode==='menu'&&/cave/.test(where)&&brewed&&G.alchemy.etherUnits===e0+5&&G.state.mode==='play'&&G.flag('caveBench'),
     where,picked:G.inv.count('glowcap')-c0+3,ether:G.alchemy.etherUnits}; })()"""),
 ("shot:s-keeper-bench",None),
 ("s:tunnelDie", r"""(()=>{ if(G.state.mode==='paused')document.getElementById('resume').click(); // headless: re-locking the pointer after the panel drops and pauses
   T.walk([[0,-12],[7,-10.4],[20,-5.2]],{local:true}); const P=G.player; P.hurt({damage:99,kind:'melee',dir:new THREE.Vector3(1,0,0),knockback:4,ignoreIframes:true}); G.step(1/30,30);
   return {ok:G.state.mode==='dead'&&/mouth/.test(G.state.checkpointName),cp:G.state.checkpointName,at:T.where()}; })()"""),
 ("s:rise1", "WAIT_RISE"),
 ("s:afterRise1", r"""(()=>{ G.step(1/30,30); return {ok:G.state.mode==='play'&&G.player.alive&&G.cave.region(G.player.pos)==='mouth',at:T.where(),cp:G.state.checkpointName}; })()"""),
 ("s:highTideMouth", r"""(()=>{ // the flood tide in the mouth: wash, drown-push, die there — rise on dry sand, still the mouth
   G.alchemy.debug.setTide(0); G.step(1/30,2); T.walk([[0,6]],{local:true,max:240,patience:240}); T.wait(3);
   const P=G.player; P.hurt({damage:99,kind:'melee',dir:new THREE.Vector3(0,0,1),knockback:4,ignoreIframes:true}); G.step(1/30,30);
   return {ok:G.state.mode==='dead'&&/mouth/.test(G.state.checkpointName),water:+G.cave.water().toFixed(2),cp:G.state.checkpointName,at:T.where()}; })()"""),
 ("s:rise4", "WAIT_RISE"),
 ("s:afterRise4", r"""(()=>{ G.step(1/30,30); const l=G.cave.toLocal(G.player.pos), f=G.cave.floorVis(l.x,l.z), w=G.cave.water();
   G.alchemy.debug.setTide(150); G.step(1/30,2);
   return {ok:G.state.mode==='play'&&G.cave.region(G.player.pos)==='mouth'&&w-f<1.1&&w>1.3,at:T.where(),water:+G.cave.water().toFixed(2)}; })()"""),
 ("s:sealPushDie", r"""(()=>{ // lean on the closed gallery seal (the stair is on its far side), then die against it, knocked into it
   const r=T.walk([[0,-16],[0,-24],[0,-30],[0,-40.5]],{local:true}); T.fight({room:'gallery',max:900});
   T.walk([[0,-40.5]],{local:true}); for(const x of [0,-1.5,1.5,0]) T.walk([[x,-52]],{local:true,max:60,patience:60});
   const reg=G.cave.region(G.player.pos), reached=G.cave.reached(), cp=G.state.checkpointName;
   const P=G.player; P.hurt({damage:99,kind:'melee',dir:new THREE.Vector3(0,0,-1),knockback:8,ignoreIframes:true}); G.step(1/30,30);
   return {ok:r.ok&&reg==='gallery'&&!reached.includes('stair')&&/Gallery/.test(cp)&&G.state.mode==='dead'&&!G.cavePuzzles.open('gallery'),reg,reached,cp,at:T.where()}; })()"""),
 ("s:rise2", "WAIT_RISE"),
 ("s:afterRise2", r"""(()=>{ G.step(1/30,30); const reg=G.cave.region(G.player.pos);
   return {ok:G.state.mode==='play'&&G.player.alive&&reg==='gallery'&&G.cave.connected().includes(reg)&&!G.cave.stranded(),reg,at:T.where(),cp:G.state.checkpointName}; })()"""),
 ("s:monsterDeath", r"""(()=>{ // killed by the cave's own monsters (no top-ups): a brineling pack and a hollow set on the player in the gallery
   const O=G.cave.origin, p=G.player.pos; const ms=['brineling','brineling','hollow'].map((k,i)=>G.monsters.spawn(k,{x:p.x+1.5*Math.cos(i*2),y:p.y,z:p.z+1.5*Math.sin(i*2)},{zone:{name:'cave-gallery',x:O.x,z:O.z-35,r:12},cave:'gallery'}));
   G.player.hp=1; const t=T.wait(30,{top:false,until:()=>!G.player.alive}); G.step(1/30,30);
   const cp=G.state.checkpointName; for(const m of ms)if(m&&m.alive)G.monsters.despawn(m);
   return {ok:G.state.mode==='dead'&&/Gallery/.test(cp),t,cp,at:T.where()}; })()"""),
 ("s:rise3", "WAIT_RISE"),
 ("s:afterRise3", r"""(()=>{ G.step(1/30,30); return {ok:G.state.mode==='play'&&G.cave.region(G.player.pos)==='gallery',at:T.where()}; })()"""),
 ("s:strandedDraught", r"""(()=>{ // defence in depth: put the player behind the closed seal; the draught always offers the way back to the mouth
   G.alchemy.debug.setTide(150); G.debugEnterCave('stair'); T.wait(1.5); const lab=T.label(), str=G.cave.stranded(), cp=G.state.checkpointName;
   const u=T.use(/draught/); T.wait(2.5); const reg=G.cave.region(G.player.pos);
   return {ok:str&&lab==='Follow the draught back to the mouth'&&!/Stair/.test(cp)&&reg==='mouth'&&!G.cave.stranded()&&!G.cave.reached().includes('stair'),lab,cp,reg}; })()"""),
 ("s:brokenSave", r"""(()=>{ // Heath's save: checkpoint behind the Undertow's door, standing in the gallery, seal closed, no 'reached' list
   G.setMode('paused'); document.getElementById('saveBtn').click(); const d=JSON.parse(localStorage.getItem('bq-save-v1'));
   const O=G.cave.origin; d.cp=[O.x+60,O.y+3,O.z-41]; d.cpName='the Undertow’s door'; d.pos=[O.x,O.y+3,O.z-33]; delete d.mods.cave.reached;
   localStorage.setItem('bq-save-v1',JSON.stringify(d)); return {ok:true}; })()"""),
 ("s:reload", "RELOAD"),
 ("s:continueBroken", r"""(()=>{ G.step(1/30,40); const cp=G.state.checkpointName, reg=G.cave.region(G.player.pos);
   const P=G.player; P.hurt({damage:99,kind:'melee',dir:new THREE.Vector3(0,0,1),knockback:0,ignoreIframes:true}); G.step(1/30,30);
   return {ok:G.cave.inside&&reg==='gallery'&&!/Undertow/.test(G.state.checkpointName)&&G.state.mode==='dead',cpAfterLoad:cp,cp:G.state.checkpointName,reg}; })()"""),
 ("s:rise5", "WAIT_RISE"),
 ("s:afterRise5", r"""(()=>{ G.step(1/30,30); const reg=G.cave.region(G.player.pos); return {ok:G.state.mode==='play'&&G.cave.connected().includes(reg),reg,at:T.where(),cp:G.state.checkpointName}; })()"""),
 ("s:strandedSave", r"""(()=>{ // a save made trapped in the drafts (Heath's other possible state): Continue, then the draught leads out
   G.setMode('paused'); document.getElementById('saveBtn').click(); const d=JSON.parse(localStorage.getItem('bq-save-v1'));
   const O=G.cave.origin; d.pos=[O.x+60,O.y+3,O.z-41]; localStorage.setItem('bq-save-v1',JSON.stringify(d)); return {ok:true}; })()"""),
 ("s:reload2", "RELOAD"),
 ("s:continueStranded", r"""(()=>{ G.step(1/30,40); const reg=G.cave.region(G.player.pos), str=G.cave.stranded(), lab=T.label(); const u=T.use(/draught/); T.wait(2.5);
   return {ok:reg==='drafts'&&str&&u==='Follow the draught back to the mouth'&&G.cave.region(G.player.pos)==='mouth',reg,lab,at:T.where()}; })()"""),
]

DRAW=r"""new Promise(res=>{ const r=G.renderer, out={}; const rooms=['mouth','gallery','stair','channel','drafts','arena']; let i=0;
  function next(){ if(i>=rooms.length){ res(out); return; } const room=rooms[i++]; G.debugEnterCave(room); G.step(1/30,10); let n=0;
    requestAnimationFrame(function f(){ if(n===0){ r.info.autoReset=false; r.info.reset(); } if(++n<=8)return requestAnimationFrame(f);
      out[room]=Math.round(r.info.render.calls/8); r.info.autoReset=true; next(); }); }
  next(); })"""

async def main():
    fails=[]
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        pg=await (await b.new_context(viewport={'width':1000,'height':600})).new_page(); pg.set_default_timeout(480000)
        errs=[]; pg.on('pageerror',lambda e: errs.append('PAGEERROR '+str(e))); pg.on('console',lambda m: errs.append(m.text) if m.type=='error' else None)
        async def boot():
            await pg.evaluate(LIB); await pg.evaluate(CAMCHECK)
        await pg.goto(URL,timeout=180000); await pg.wait_for_timeout(5000)
        await pg.evaluate("localStorage.removeItem('bq-save-v1')")
        await boot()
        async def run(steps):
          for name,js in steps:
            if name.startswith('shot:'):
                await pg.wait_for_timeout(1400); await pg.evaluate('G.headless&&G.headless.draw(3); 0'); await pg.wait_for_timeout(250); await pg.screenshot(path=f'{SHOTS}/{name[5:]}.png',timeout=120000); print('  shot',name[5:]); continue
            try:
                if js=='WAIT_RISE':
                    await pg.wait_for_timeout(2600); await pg.click('#rise'); await pg.wait_for_timeout(600); r={'ok':True}
                elif js=='RELOAD':
                    await pg.reload(); await pg.wait_for_timeout(5000); await pg.click('#continue'); await pg.wait_for_timeout(2500); await boot(); r={'ok':True}
                elif js=='DRAWCALLS':
                    d=await pg.evaluate(DRAW); r={'ok':max(d.values())<=330,'calls':d,'nanStacks':await pg.evaluate('window.NAN')}
                else: r=await pg.evaluate(js)
            except Exception as e: r={'ok':False,'exc':str(e).split('\n')[0][:300]}
            ok=bool(r.get('ok')) if isinstance(r,dict) else False
            if not ok: fails.append(name)
            print(('PASS ' if ok else 'FAIL ')+name,':',json.dumps(r)[:900])
        if not SOFT_ONLY: await run(STEPS)
        # the soft-lock guards, in a fresh session (see SOFTLOCK)
        await pg.goto(URL,timeout=180000); await pg.wait_for_timeout(5000); await pg.evaluate("localStorage.removeItem('bq-save-v1')"); await boot()
        await run(SOFTLOCK)
        errs=[e for e in errs if '404' not in e and 'favicon' not in e]
        if errs: print('console errors:\n  '+'\n  '.join(errs[:12]))
        await b.close()
    print('\nRESULT:', 'ALL PASS' if not fails and not errs else 'FAILED '+', '.join(fails)+(' + console errors' if errs else ''))
    sys.exit(1 if fails or errs else 0)
asyncio.run(main())
