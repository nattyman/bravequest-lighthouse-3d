/* =====================================================================
   BRAVE QUEST: LIGHTHOUSE — northisle_foes.js
   The north island, slice 5 (Heath, 2026-11-14): things that fight back, off the path.
     - crabs: brinelings scuttling on the cove beach, on the shelf to the sea cave, and out on the reef at low tide. A
       handful, territorial (they go for Rowan when he comes close: m.provokedUntil, the one opt-in read monsters.js
       has for this), respawning slowly out of his sight. They never sit on the landing spot, the boat or the first 20 m
       of the path; the reef crabs go back under when the tide turns.
     - the drowned (monsters.js kind 'drowned'): while the lure burns (no fire-room outcome yet: stage 'before' or
       'known'), the crews the green light put on the rocks rise out of the ground among the cairns when Rowan comes
       within ~15 m of the graveyard, 3–5 at a time, and sink back into the earth if he goes (> 35 m). Never in the
       Margery's corner: those men rest, and the drowned don't step there. After the fire room, whichever ending, they
       never rise again. A wet heap of sand and weed is left where one falls, for a while.
   Nothing here exists at home: monsters are only spawned while Rowan is on the north island's surface, and all of them
   go when he leaves it. After the fire room, whichever ending, the island is quiet: no drowned and no crabs (the
   'died' ending's cairn-building on the cove beach is a quiet scene). Nothing spawns in the bothy, at the Margery's corner, on the path's first 20 m, on the
   landing beach or in the boat.
   API: G.northIsleFoes = { state, debug:{ wake(o), rest(), counts(), crabs(), drowned(), spots() } }
   Events: northFoes:rise {n}, northFoes:sink {n, why}, northFoes:cleared {}
   Save: G.persist 'northIsleFoes' (which lines have been said; how often they've risen).
   ===================================================================== */
(function(){
'use strict';
const G=window.G, THREE=G.THREE, U=G.U;
const PI=Math.PI, TAU=PI*2;
const {clamp,smooth}=U;
const V=(x,y,z)=>new THREE.Vector3(x,y,z);
const NI=()=>G.northIsle, NS=()=>G.northIsleStory;

const RISE_R=15, SINK_R=35;          // from the edge of the graveyard
const CRAB_LIVE_R=45;                // a crab group exists while Rowan is within this of its ground (they cost ~20 draw calls each)
const CRAB_RESPAWN=[70,110];         // s after a crab dies before another takes its place (out of his sight)
const PROVOKE_R=3.6, PROVOKE_T=2.6;  // the beach crabs come for him inside this, and keep at it this long after
const HEAP_LIFE=32, HEAP_MAX=6;

/* ================================================================ 1. WHERE */
// read live (northisle_story.js owns the sites); fall back to its numbers if it's missing
const FIELD=()=>(NS()&&NS().sites&&NS().sites.field)||{x:176.5,z:-706,rx:12,rz:9};
const CORNER=()=>(NS()&&NS().sites&&NS().sites.corner)||{x:183,z:-693.5,r:4.1};
const BOTHY=()=>(NS()&&NS().sites&&NS().sites.bothy)||{x:204.5,z:-669.5};
/** metres from (x,z) to the edge of the graveyard's ellipse (0 inside it) */
function graveDist(x,z){ const F=FIELD(), dx=x-F.x, dz=z-F.z, q=Math.hypot(dx/F.rx,dz/F.rz), d=Math.hypot(dx,dz); return q<=1?0:d*(1-1/q); }
/* ground nothing of ours may stand on: the landing, the boat, the first 20 m of the path, the bothy, the corner, the
   tower's apron and the cave mouth */
let NOGO=null;
function nogo(){
  if(NOGO)return NOGO; const N=NI(); if(!N)return [];
  const out=[], b=N.cove.beach, m=N.cove.moor, C=CORNER(), B=BOTHY(), T=N.tower;
  out.push({x:b.x,z:b.z,r:6.5,why:'landing'},{x:m.x,z:m.z,r:6,why:'boat'},{x:C.x,z:C.z,r:C.r+1.6,why:'corner'},{x:B.x+.4,z:B.z,r:6.5,why:'bothy'},{x:T.x,z:T.z,r:10,why:'tower'});
  // the path's first 20 m from where you land (landing → the path's first point counts)
  const pts=[[b.x,b.z]].concat(N.path.map(p=>[p[0],p[1]])); let left=20;
  for(let i=0;i<pts.length-1&&left>0;i++){ const a=pts[i], c=pts[i+1], L=Math.hypot(c[0]-a[0],c[1]-a[1]), n=Math.ceil(Math.min(L,left)/1.5);
    for(let k=0;k<=n;k++){ const t=Math.min(L,left)*k/n/L; out.push({x:a[0]+(c[0]-a[0])*t,z:a[1]+(c[1]-a[1])*t,r:3.4,why:'path'}); } left-=L; }
  const M=G.northCave&&G.northCave.mouth; if(M)out.push({x:M.x,z:M.z,r:6,why:'cave mouth'});
  else { const a=N.cove.mouthA, R=N.shoreR(a); out.push({x:N.centre.x+Math.cos(a)*R,z:N.centre.z+Math.sin(a)*R,r:7,why:'cave mouth'}); }
  NOGO=out; return out;
}
const inNogo=(x,z,pad)=>nogo().some(c=>Math.hypot(x-c.x,z-c.z)<c.r+(pad||0));
function inBothy(p){ try{ const B=NS()&&NS().sites&&NS().sites.bothy; return !!(B&&B.inside&&B.inside(p)); }catch(e){ return false; } }
function freeOfColliders(x,z,y,pad){ for(const c of G.collidersNear(x,z)){ if(Math.hypot(c.x-x,c.z-z)<c.r+pad&&c.y1>y+.2&&c.y0<y+1.8)return false; } return true; }
function slopeAt(x,z){ const H=NI().height, e=.6; return Math.hypot(H(x+e,z)-H(x-e,z),H(x,z+e)-H(x,z-e))/(2*e); }

/* crab grounds: seeded candidate spots, picked once, the first time Rowan lands */
let CRAB=null;
function crabGrounds(){
  if(CRAB)return CRAB; const N=NI(), r=U.rng(5521), H=N.height, b=N.cove.beach;
  const g={cove:{spots:[],count:3,tidal:false},shelf:{spots:[],count:1,tidal:false},reef:{spots:[],count:2,tidal:true}};
  const ok=(x,z)=>!inNogo(x,z,.5)&&slopeAt(x,z)<.7&&freeOfColliders(x,z,H(x,z),.9);
  // the cove beach: the sand between the wrecks, either side of where you land
  for(let i=0;i<1500&&g.cove.spots.length<16;i++){ const x=b.x+(r()-.5)*50, z=b.z+(r()-.5)*40, h=H(x,z);
    if(h<-.5||h>3.6||N.coveK(x,z)<.3||Math.hypot(x-b.x,z-b.z)<8.5)continue; if(ok(x,z)&&G.world.walkable(x,z))g.cove.spots.push({x,z}); }
  // the shelf to the sea cave, west along the foot of the cliffs
  const C=N.centre, a0=N.cove.mouthA, a1=1.2;
  for(let i=0;i<500&&g.shelf.spots.length<12;i++){ const a=a1+(a0-a1)*(.25+r()*.65), R=N.shoreR(a)-(r()*7-2), x=C.x+Math.cos(a)*R, z=C.z+Math.sin(a)*R, h=H(x,z);
    if(h<-.9||h>2.2||Math.hypot(x-b.x,z-b.z)<12)continue; if(ok(x,z)&&G.world.walkable(x,z))g.shelf.spots.push({x,z}); }
  // the reef: wet rock and sand round the reef's rocks that's only out of the water at low tide
  const reef=(N.rocks||[]).filter(k=>k.kind==='reef');
  for(let i=0;i<700&&g.reef.spots.length<14&&reef.length;i++){ const k=reef[Math.floor(r()*reef.length)], a=r()*TAU, d=k.r+1+r()*4.5, x=k.x+Math.cos(a)*d, z=k.z+Math.sin(a)*d, h=H(x,z);
    if(h>-1.25||h<-2.3)continue; if(ok(x,z))g.reef.spots.push({x,z}); }
  for(const k in g){ const s=g[k].spots; let cx=0,cz=0; for(const p of s){ cx+=p.x; cz+=p.z; } g[k].c=s.length?{x:cx/s.length,z:cz/s.length}:{x:b.x,z:b.z};
    g[k].live=[]; g[k].wait=[]; g[k].name=k; }
  CRAB=g; return g;
}

/* ================================================================ 2. STATE */
const S={v:1,said:{},rose:0,killed:0};
const D={paused:false,list:[],armed:true,up:false,lastRise:-1e9,sinkWhy:null,heaps:[],heapGeo:null,heapMat:null,on:false,postSaid:false,snd:new Map()};
const say=(t,who,o)=>{ try{ G.ui.say(t,who===undefined?'Rowan':who,Object.assign({priority:'normal',group:'nisfoe'},o||{})); }catch(e){} };
function sayOnce(k,lines,o){ if(S.said[k])return false; S.said[k]=1; lines.forEach((l,i)=>say(l,'Rowan',Object.assign({key:'nisfoe-'+k+i},o||{}))); return true; }
const outcome=()=>{ try{ const F=G.northFire; return (F&&F.state&&F.state.outcome)||null; }catch(e){ return null; } };
const stage=()=>{ try{ return NS()?NS().stage():(outcome()||'before'); }catch(e){ return 'before'; } };
/** the lure burns: no fire-room outcome yet, and the island hasn't moved past the ledger/meeting stages */
const lureBurns=()=>{ const st=stage(); return !outcome()&&(st==='before'||st==='known'); };
function onSurface(){ const N=NI(), P=G.player; if(!N||!P||!P.pos)return false; if(N.crossing||N.at!=='north')return false;
  if(G.northCave&&G.northCave.inside)return false; if(G.northFire&&G.northFire.inside)return false; return N.inBox(P.pos.x,P.pos.z); }

/* ================================================================ 3. THE DROWNED */
function drownedSpots(n,P){
  // candidates among the cairns, 4.5–20 m from him; the ones nearest his own level first (the rise's crown can be ~10 m
  // above the slope he comes up), spread out
  const F=FIELD(), C=CORNER(), H=NI().height, r=U.rng(8800+S.rose*131), cand=[];
  for(let i=0;i<700&&cand.length<40;i++){ const a=r()*TAU, d=Math.sqrt(r())*.92, x=F.x+Math.cos(a)*F.rx*d, z=F.z+Math.sin(a)*F.rz*d;
    if(Math.hypot(x-C.x,z-C.z)<C.r+3.2)continue; if(inNogo(x,z,.6))continue;
    const dp=P?Math.hypot(x-P.x,z-P.z):10; if(dp<4.5||dp>20)continue;
    const h=H(x,z), dh=P?Math.abs(h-P.y):0; if(dh>9)continue;
    if(slopeAt(x,z)>.75||!G.world.walkable(x,z)||!freeOfColliders(x,z,h,.75))continue;
    cand.push({x,z,k:dh+dp*.15}); }
  cand.sort((a,b)=>a.k-b.k); const out=[];
  for(const c of cand){ if(out.length>=n)break; if(out.some(o=>Math.hypot(o.x-c.x,o.z-c.z)<2.6))continue; out.push({x:c.x,z:c.z}); }
  return out;
}
function riseCount(){ const mh=(G.player&&G.player.maxHp)||16; return mh>=20?5:mh>=16?4:3; }
function rise(o){
  o=o||{}; const P=G.player; if(!G.monsters||!P)return 0;
  const n=o.n||riseCount(), spots=drownedSpots(n,P.pos); if(spots.length<Math.min(3,n))return 0;   // not from here: a step or two nearer
  const F=FIELD(), C=CORNER(), zone={name:'graveyard',x:F.x,z:F.z,r:20}, avoid=[{x:C.x,z:C.z,r:C.r+1.1}];
  spots.forEach((s,i)=>{ const m=G.monsters.spawn('drowned',{x:s.x,z:s.z},{zone,rise:true,avoid,heading:Math.atan2(P.pos.x-s.x,P.pos.z-s.z)});
    m.northFoe='drowned'; m.st=-i*.4; D.list.push(m); });
  D.up=true; D.armed=false; D.lastRise=G.time; S.rose++;
  G.emit('northFoes:rise',{n:spots.length});
  riseSnd();
  if(!o.quiet){ const st=stage();
    const first=sayOnce('rise1',['The cairns. Something’s moving under them.','They’re coming up out of the ground. The crews that light called in.'],{priority:'high'});
    if(st==='known')sayOnce('riseKnown',['He built their cairns with his own hands. And his fire won’t let them stay in the ground.'],{priority:'high'});
    else if(!first&&S.rose>=3)sayOnce('rise3',['Every time I come near. As if they’re waiting for someone to answer for it.']); }
  return spots.length;
}
function sinkAll(why){
  let n=0; for(const m of D.list){ if(m.alive&&!m.dying&&!m.sinkAway){ m.sinkAway=true; n++; } }
  if(n){ G.emit('northFoes:sink',{n,why}); sinkSnd();
    if(why==='left'&&!S.said.sink1)sayOnce('sink1',['Behind me they’re going back into the ground. To wait for the next ship.'],{priority:'low'}); }
  D.sinkWhy=why; return n;
}
function clearDrowned(){ for(const m of D.list){ if(m.alive)try{ G.monsters.despawn(m,false); }catch(e){} } D.list.length=0; D.up=false; }
function updateDrowned(P,dt){
  // prune
  for(let i=D.list.length-1;i>=0;i--)if(!D.list[i].alive)D.list.splice(i,1);
  const standing=D.list.filter(m=>!m.dying&&!m.sinkAway).length;
  if(D.up&&!D.list.length){ D.up=false; if(D.sinkWhy==null){ G.emit('northFoes:cleared',{});
      if(!S.said.clear1)sayOnce('clear1',['Sand and weed. That’s all that’s left of them.','Until that fire calls them up again.'],{priority:'normal'}); } }
  const gd=graveDist(P.x,P.z), lure=lureBurns();
  if(!lure){ if(standing)sinkAll('fire'); D.armed=false;
    // once, the first time he comes back to the graveyard after the fire room, if he ever saw them rise
    if(!D.postSaid&&gd<RISE_R&&S.rose>0){ D.postSaid=true; const oc=outcome();
      if(oc==='lived')sayOnce('restLived',['Nothing stirs. The cairns are only cairns now.'],{priority:'low'});
      else if(oc==='died')sayOnce('restDied',['Quiet. Whatever kept them waiting went out with the fire.'],{priority:'low'}); }
    return; }
  if(gd>SINK_R){ if(standing)sinkAll('left'); D.armed=true; D.sinkWhy=null; }
  else if(D.armed&&!D.list.length&&gd<=RISE_R&&G.time>=(D.nextTry||0)&&!inBothy(P)&&G.state.mode==='play'&&Math.abs(P.y-NI().height(P.x,P.z))<3){ D.sinkWhy=null; if(!rise())D.nextTry=G.time+.5; }
}

/* the heap a drowned man leaves: wet sand, a tangle of weed, a scrap of oilskin; it settles into the ground and goes */
function heapGeo(){
  if(D.heapGeo)return D.heapGeo; const GE=G.world.geo, c1=U.col('#7e735c'), c2=U.col('#5b5442'), weed=U.col('#2f4529'), oil=U.col('#4a482c');
  const wet=U.col('#3e392e'), sand=(p,n,o)=>o.copy(c1).lerp(c2,smooth(.3,.7,U.vnoise(p.x*5+1,p.z*5))).lerp(wet,.6*smooth(.45,.8,U.vnoise(p.x*3-2,p.z*3+4)));
  const parts=[{g:GE.blob(1,2,4.1,.3),m:GE.mat4(0,0,0,0,0,0,.85,.34,.7),c:sand},
    {g:GE.blob(.5,1,7.7,.3),m:GE.mat4(.4,.1,-.25,0,0,0,.8,.55,.7),c:sand},
    {g:GE.blob(.4,1,2.2,.3),m:GE.mat4(-.45,.08,.3,0,0,0,.9,.5,.8),c:sand},
    {g:GE.blob(.35,1,9.1,.4),m:GE.mat4(-.15,.26,.05,.2,.6,.1,1.3,.22,.9),c:oil}];
  for(let k=0;k<11;k++){ const a=k/11*TAU+.3, r=.3+(k%3)*.12; parts.push({g:new THREE.CylinderGeometry(.018,.035,.6+(k%3)*.25,4),m:GE.mat4(Math.cos(a)*r,.2-(k%3)*.04,Math.sin(a)*r*.85,PI/2-.25,-a+PI/2,0),c:weed}); }
  D.heapGeo=GE.mergeParts(parts); D.heapMat=G.toon('#ffffff',{vertexColors:true}); return D.heapGeo;
}
function addHeap(pos){
  if(!G.world.geo)return; heapGeo();
  if(D.heaps.length>=HEAP_MAX){ const o=D.heaps.shift(); G.scene.remove(o.mesh); }
  const mesh=new THREE.Mesh(D.heapGeo,D.heapMat); const y=G.floorAt(pos.x,pos.z,pos.y+1);
  mesh.position.set(pos.x,y-.02,pos.z); mesh.rotation.y=Math.random()*TAU; mesh.scale.setScalar(.9+Math.random()*.25); mesh.receiveShadow=true; mesh.name='drownedHeap';
  G.scene.add(mesh); D.heaps.push({mesh,t:0,y});
}
function updateHeaps(dt){
  for(let i=D.heaps.length-1;i>=0;i--){ const h=D.heaps[i]; h.t+=dt; const k=smooth(HEAP_LIFE-8,HEAP_LIFE,h.t); h.mesh.position.y=h.y-.02-k*.45;
    if(h.t>HEAP_LIFE){ G.scene.remove(h.mesh); D.heaps.splice(i,1); } }
}
function clearHeaps(){ for(const h of D.heaps)G.scene.remove(h.mesh); D.heaps.length=0; }

/* ================================================================ 4. THE CRABS */
function crabSpot(g,P,minD){
  const live=g.live.filter(m=>m.alive), r=Math.random;
  const cand=g.spots.filter(s=>(!P||Math.hypot(s.x-P.x,s.z-P.z)>=minD)&&G.world.walkable(s.x,s.z)&&!live.some(m=>Math.hypot(m.pos.x-s.x,m.pos.z-s.z)<3));
  return cand.length?cand[Math.floor(r()*cand.length)]:null;
}
function spawnCrab(g,P,minD){
  const s=crabSpot(g,P,minD); if(!s)return null;
  const m=G.monsters.spawn('brineling',{x:s.x,z:s.z},{zone:{name:'north-'+g.name,x:s.x,z:s.z,r:8}});
  m.northFoe='crab'; m.crabGround=g.name; g.live.push(m);
  m.parts.root.traverse(o=>{ if(o.isMesh)o.castShadow=false; });   // small, and grounded by their ink pool: no shadow pass (it doubled their cost)
  return m;
}
const lowTide=()=>!!(G.tide&&G.tide.low);
function updateCrabs(P,dt){
  const g=crabGrounds(), lure=lureBurns();   // after the fire room (either ending) the island is quiet: no crabs either
  for(const k in g){ const z=g[k];
    for(let i=z.live.length-1;i>=0;i--){ const m=z.live[i]; if(!m.alive){ z.live.splice(i,1); if(m.hp<=0)z.wait.push(G.time+CRAB_RESPAWN[0]+Math.random()*(CRAB_RESPAWN[1]-CRAB_RESPAWN[0])); } }
    const near=lure&&Math.hypot(P.x-z.c.x,P.z-z.c.z)<CRAB_LIVE_R, tideOk=!z.tidal||lowTide();
    if(!near||!tideOk){ // gone: out of range (quietly), or the tide's come back over the reef (a splash: back under)
      for(const m of z.live)if(m.alive&&!m.dying)G.monsters.despawn(m,!tideOk); z.live.length=0; if(!tideOk)z.wait.length=0; z.filled=false; continue; }
    if(!z.filled){ // this ground comes alive: as many as aren't still waiting to come back after being killed, none close to him
      z.filled=true; for(let n=z.live.length;n<z.count-z.wait.length;n++)spawnCrab(z,P,8); }
    for(let i=z.wait.length-1;i>=0;i--){ if(G.time>=z.wait[i]&&z.live.length<z.count){ if(spawnCrab(z,P,20))z.wait.splice(i,1); else z.wait[i]=G.time+5; } }
    for(const m of z.live){ if(!m.alive||m.dying)continue;
      // territorial: they come for him when he's close
      const d=Math.hypot(m.pos.x-P.x,m.pos.z-P.z);
      if(d<PROVOKE_R&&Math.abs(P.y-m.pos.y)<1.5&&G.player.alive!==false)m.provokedUntil=G.time+PROVOKE_T;
      // and never stand on the landing, in the boat or on the first of the path
      for(const c of nogo()){ if(c.why==='tower'||c.why==='corner'||c.why==='bothy')continue; const dx=m.pos.x-c.x, dz=m.pos.z-c.z, dd=Math.hypot(dx,dz), R=c.r*.8+.42;
        if(dd<R&&dd>1e-4){ m.pos.x+=dx/dd*(R-dd); m.pos.z+=dz/dd*(R-dd); m.wt=null; if(m.state==='chase'&&m.provokedUntil!=null&&G.time>m.provokedUntil-PROVOKE_T+.5)m.provokedUntil=null; } } }
  }
}
function clearCrabs(){ if(!CRAB)return; for(const k in CRAB){ for(const m of CRAB[k].live)if(m.alive)try{ G.monsters.despawn(m,false); }catch(e){} CRAB[k].live.length=0; CRAB[k].wait.length=0; CRAB[k].filled=false; } }

/* ================================================================ 5. SOUND (the synth kit in audio.js; nothing new to load) */
function snd(fn,pos,g){ try{ const A=G.audio; if(!A||!A.ready||!A.S)return; const P=G.player, d=pos&&P?Math.hypot(pos.x-P.pos.x,pos.z-P.pos.z):0, k=clamp(1-d/40,0,1)*(g||1); if(k<=.02)return; fn(A.S,A.context.currentTime,k); }catch(e){} }
function riseSnd(){ const F=FIELD(); snd((S_,t,k)=>{ S_.rumble(t,{g:.3*k,dur:2.4,f0:48,f1:30,lp:220}); S_.hiss(t+.3,{dur:1.6,f0:900,f1:220,g:.05*k}); S_.moan&&S_.moan(t+1,{f:72,dur:1.8,g:.06*k}); },V(F.x,0,F.z)); }
function sinkSnd(){ const F=FIELD(); snd((S_,t,k)=>{ S_.rumble(t,{g:.22*k,dur:2,f0:40,f1:26,lp:180}); },V(F.x,0,F.z)); }
function drownedSounds(){
  for(const m of D.list){ let M=D.snd.get(m); if(!M){ D.snd.set(m,{s:m.state,hit:m.lastHit,dead:false,gr:2+Math.random()*6}); continue; }
    const p=m.pos;
    if(m.dying){ if(!M.dead){ M.dead=true; snd((S_,t,k)=>{ S_.thud(t,{g:.35*k,f0:90,f1:40,dur:.4}); S_.hiss(t+.1,{dur:.9,f0:700,f1:160,g:.08*k}); },p); } continue; }
    if(m.lastHit!=null&&m.lastHit!==M.hit){ M.hit=m.lastHit; snd((S_,t,k)=>{ S_.thud(t,{g:.28*k,f0:130,f1:55,dur:.2}); S_.hiss(t,{dur:.25,f0:2400,f1:700,g:.07*k}); },p); }
    if(m.state!==M.s){ const s=m.state; M.s=s;
      if(s==='windup')snd((S_,t,k)=>S_.moan(t,{f:m.atk==='lurch'?64:78,dur:m.atk==='lurch'?1.4:1.1,g:.13*k}),p);
      else if(s==='attack')snd((S_,t,k)=>{ S_.whoosh(t,{f0:180,f1:800,dur:.4,g:.2*k}); },p); }
    if(m.state==='chase'||m.state==='idle'){ M.gr-=1/30; if(M.gr<=0){ M.gr=5+Math.random()*7; snd((S_,t,k)=>S_.moan(t,{f:60+Math.random()*25,dur:1.6,g:.05*k}),p,.8); } }
  }
  for(const m of D.snd.keys())if(!m.alive&&!m.dying)D.snd.delete(m);
}

/* ================================================================ 6. WIRING */
G.on('monster:killed',e=>{ if(!e)return; if(e.kind==='drowned'&&D.on){ S.killed++; addHeap(e.pos); } });
G.on('game:reset',()=>{ S.said={}; S.rose=0; S.killed=0; D.armed=true; D.postSaid=false; clearDrowned(); clearCrabs(); clearHeaps(); });
const reg=()=>G.persist&&G.persist.register&&G.persist.register('northIsleFoes',{save:()=>({v:1,said:Object.assign({},S.said),rose:S.rose,killed:S.killed}),
  load:d=>{ if(!d)return; S.said=Object.assign({},d.said||{}); S.rose=+d.rose||0; S.killed=+d.killed||0; }});
if(G.persist&&G.persist.register)reg(); else G.on('ready',reg);

function goAway(){ clearDrowned(); clearCrabs(); clearHeaps(); D.armed=true; D.sinkWhy=null; D.on=false; }
G.system('northIsleFoes',{order:42,modes:['play','dead'],
  update(dt){
    const P=G.player, here=onSurface();
    if(!here||D.paused){ if(D.on)goAway(); return; }
    if(!D.on){ D.on=true; D.armed=true; D.postSaid=false; }
    if(G.state.mode!=='play')return;
    try{ updateDrowned(P.pos,dt); }catch(e){ console.error('northIsleFoes drowned',e); }
    try{ updateCrabs(P.pos,dt); }catch(e){ console.error('northIsleFoes crabs',e); }
    updateHeaps(dt); drownedSounds();
  }});

const live=k=>{ const out=[]; if(k==='drowned'){ for(const m of D.list)if(m.alive)out.push(m); } else if(CRAB){ for(const g in CRAB)for(const m of CRAB[g].live)if(m.alive)out.push(m); } return out; };
G.northIsleFoes={state:S,get on(){ return D.on; },graveDist,lureBurns,
  debug:{
    /** raise a group now if the rules allow it (the lure burning, Rowan on the island) wherever he is; {n, force} */
    wake:(o)=>{ o=o||{}; if(!onSurface())return {n:0,why:'not on the island'}; if(!o.force&&!lureBurns())return {n:0,why:'the fire room is done: they rest'};
      if(D.list.some(m=>m.alive&&!m.dying&&!m.sinkAway))return {n:0,why:'already up'}; D.on=true; return {n:rise({n:o.n,quiet:o.quiet})}; },
    rest:()=>sinkAll('debug'),
    /** pause(true): everything of ours goes and nothing spawns (draw-call comparisons); pause(false) resumes */
    pause:(on)=>{ D.paused=!!on; if(on&&D.on)goAway(); return D.paused; },
    counts:()=>{ const P=G.player, dr=live('drowned'), c={cove:0,shelf:0,reef:0};
      if(CRAB)for(const g in CRAB)c[g]=CRAB[g].live.filter(m=>m.alive&&!m.dying).length;
      return {on:D.on,drowned:dr.filter(m=>!m.dying&&!m.sinkAway).length,rising:dr.filter(m=>m.state==='rise').length,sinking:dr.filter(m=>m.state==='sink').length,dying:dr.filter(m=>m.dying).length,
        crabs:c,crabTotal:c.cove+c.shelf+c.reef,heaps:D.heaps.length,armed:D.armed,lure:lureBurns(),stage:stage(),outcome:outcome(),rose:S.rose,killed:S.killed,
        graveDist:P?+graveDist(P.pos.x,P.pos.z).toFixed(1):null,lowTide:lowTide(),monsters:G.monsters?G.monsters.list.length:0}; },
    drowned:()=>live('drowned'), crabs:()=>live('crabs'), spots:()=>{ crabGrounds(); const o={}; for(const k in CRAB)o[k]=CRAB[k].spots.map(s=>[+s.x.toFixed(1),+s.z.toFixed(1)]); return o; },
    nogo:()=>nogo(), graveDist, heaps:()=>D.heaps.map(h=>h.mesh.position.clone()) }};
})();
