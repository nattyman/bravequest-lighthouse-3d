/* =====================================================================
   BRAVE QUEST: LIGHTHOUSE — cave_puzzles.js  (Puzzle agent)
   The Drowned Keepers' Cave puzzles: ether veins (light a room for 5 ether),
   corruption seals fed by the swarm, the cave-moth roost, floating crates on
   the Flooding Stair, the raft down the Channel, the blowholes in the Hall of
   Drafts, and a shutter for the cured lantern while underground.
   API: G.cavePuzzles = {anchor(room,name,fallbackLocal), veins, seals, crates, vents,
          raft:{pos,dir,moths,state,t,lantern,speed,runT,pushes,raiders,aboard}, raid:{wave,crabs}, gust:{phase,next}, lit(room), open(id), debug}
   Events: cave:lit {room} · cave:seal {id,state:'seen'|'feed'|'stall'|'stop'|'sated'} · cave:sealOpen {id}
           cave:raft {state:'loaded'|'drifting'|'pushed'|'arrived'|'done'|'taken', bump?}
           cave:raid {wave,n} (a boarding wave starts; the crabs: brineling:grip → brineling:board → brineling:aboard → brineling:knocked/splash)
           cave:gust {i,pos,phase:'telegraph'|'burst', lead} (telegraph fires `lead` s before the burst)
   Moth jar lives in moths.js (G.moths.jar) — persisted here. Persist key 'cavePuzzles'.
   Dormant until the player is in the cave.
   ===================================================================== */
(function(){
'use strict';
const G=window.G, THREE=G.THREE, U=G.U, PI=Math.PI, TAU=PI*2;
const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const rnd=U.rng(5150);
const COL=h=>U.col(h);

/* ---------------------------------------------------------------- numbers */
const VEIN_COST=5;
const SEALS={ gallery:{anchor:['gallery','seal',[0,3,-46]],needs:20,time:6,name:'The Gallery Seal',gate:'gallery',r:2.4},
              channel:{anchor:['channel','seal',[47,1,-80]],needs:20,time:8,name:'The Sluice Seal',gate:'channel',r:3.6},
              arena:  {anchor:['arena','door',[60,3,-38]],needs:20,time:8,name:'The Undertow Door',gate:'arena',r:2.6} };
/* the raft run (~38 m): a short escort set piece, ~25–35 s with no help. The channel always runs toward the sluice;
   the tide only adds to it (RAFT_VT at the flood/ebb's fastest, none at slack). Bolts / strikes / a slam on the raft shove it on. */
const RAFT_V0=1.25, RAFT_VT=.45, TIDE_DL_PEAK=1.343*TAU/300,  // m/s current; tide level's peak rate of change (alchemy.js TIDE)
      RAFT_CAST=2.5, RAFT_RAMP=1.4,                           // s before it casts off (time to climb to the walkway), s to reach speed
      RAFT_PUSH_V=2.4, RAFT_PUSH_DECAY=1.3, RAFT_PUSH_MAX=4,  // a shove: +m/s, fading at this rate (≈1.8 m each)
      RAFT_DRAG=.1, RAFT_HOME_V=4, RAFT_REACH=7;              // each crab aboard slows it 10%; an empty raft swings home at 4 m/s
const RAID_WAVES=[{at:.24,sides:[1]},{at:.5,sides:[-1,1]},{at:.76,sides:[1,-1]}], RAID_GAP=.7; // boarding waves by raft progress; crabs in a wave .7 s apart
const GUST_PERIOD=6, GUST_LEAD=1.2, GUST_LEN=.8, GUST_R=3, GUST_PUSH=3.2, CLING_SHUT=.6, CLING_RAFT=1.0;
const ROOST_N=40, ROOST_REGROW=8;

/* ---------------------------------------------------------------- cave frame */
const O_FALL=V(0,60,800);
const origin=()=>(G.cave&&G.cave.origin)||O_FALL;
function W(x,y,z){ if(G.cave&&G.cave.toWorld){ try{ const v=G.cave.toWorld(x,y,z); if(v)return v.clone?v.clone():V(v.x,v.y,v.z); }catch(e){} } const o=origin(); return V(o.x+x,o.y+y,o.z+z); }
function toLocal(v){ const o=origin(); return V(v.x-o.x,v.y-o.y,v.z-o.z); }
/** world anchor from G.cave.rooms[room].anchors[name] (Vector3 or array), else O + fallback local [x,y,z] (or [[x,y,z],…]) */
function anchor(room,name,fb){
  const r=G.cave&&G.cave.rooms&&G.cave.rooms[room], a=r&&r.anchors&&r.anchors[name];
  if(a){ if(Array.isArray(a))return a.map(v=>V(v.x,v.y,v.z)); if(isFinite(a.x))return V(a.x,a.y,a.z); }
  if(fb==null)return null;
  if(Array.isArray(fb[0]))return fb.map(f=>W(f[0],f[1],f[2]));
  return W(fb[0],fb[1],fb[2]);
}
const waterY=()=>{ if(G.cave&&G.cave.waterWorld){ const y=G.cave.waterWorld(); if(isFinite(y))return y; } return origin().y+1.5*(G.tide?G.tide.level:0); };
let selfQ=false;
const floorY=(x,z,y)=>{ selfQ=true; let f; try{ f=G.floorAt(x,z,y); }finally{ selfQ=false; } return f; };
const inside=()=>{ if(G.cave&&'inside' in G.cave)return !!G.cave.inside; const P=G.player; return !!(P&&P.pos&&G.creatures&&G.creatures.inCaveRegion&&G.creatures.inCaveRegion(P.pos)); };
const FALL_ROOMS={mouth:{c:[0,-10],r:14},gallery:{c:[0,-35],r:14},stair:{c:[0,-62],r:11},channel:{box:[0,50,-91,-72]},drafts:{box:[51,69,-72,-37]},arena:{c:[60,-15],r:21}};
function roomOf(p){
  if(G.cave&&G.cave.room){ try{ return G.cave.room(p); }catch(e){} }
  const l=toLocal(p);
  for(const id in FALL_ROOMS){ const f=FALL_ROOMS[id];
    if(f.box){ if(l.x>f.box[0]&&l.x<f.box[1]&&l.z>f.box[2]&&l.z<f.box[3])return id; }
    else if(Math.hypot(l.x-f.c[0],l.z-f.c[1])<f.r)return id; }
  return null;
}
const lantern=()=>G.items&&G.items.lantern;
const isPlay=()=>G.state.mode==='play';
const CR=()=>G.creatures||null;
const mothList=()=>(CR()&&CR().moths)||[];
const SWARM=m=>m.tgt==='lantern'||m.tgt==='hunt'||m.tgt==='feed'||m.tgt==='satchel';

/* ---------------------------------------------------------------- state (persisted) */
const S={lit:{},open:{},prog:{},raftT:0,raftDone:false,bossDead:false,said:{}};
let built=false, pendingLoad=null;
const API=G.cavePuzzles={anchor,veins:[],seals:{},crates:[],vents:[],
  raft:{pos:V(),moths:0,state:'idle',t:0,lantern:false},
  gust:{phase:'idle',next:0},
  lit:id=>!!S.lit[id], open:id=>!!S.open[id]};

/* ---------------------------------------------------------------- shared bits */
function glowSprite(color,size,op=.6){
  const s=new THREE.Sprite(new THREE.SpriteMaterial({map:G.tex.soft,color:COL(color),transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,opacity:op}));
  s.scale.setScalar(size); s.userData.op=op; return s;
}
function inkMat(){ return G.negMaterial?G.negMaterial({rim:'#a37cff',strength:1.2,ink:'#1c0c2c',inkStrength:.55,amp:.09,wisp:.3,flow:.22,scale:1.3,opaque:true})
  :new THREE.MeshBasicMaterial({color:0x0a090c}); }
function rockGeo(r,seed,flat=.75){
  const g=new THREE.IcosahedronGeometry(1,3), p=g.attributes.position;
  for(let i=0;i<p.count;i++){ const x=p.getX(i),y=p.getY(i),z=p.getZ(i), n=.8+.38*U.vnoise(x*1.7+seed,z*1.7+y*1.3+seed*.7)+.08*U.vnoise(x*5+seed,y*5);
    p.setXYZ(i,x*r*n,y*r*n*flat,z*r*n); }
  g.computeVertexNormals(); return g;
}
const say=(k,t,who)=>{ if(S.said[k])return; S.said[k]=1; G.ui.say(t,who); };

/* ---------------------------------------------------------------- the lantern shutter underground
   player.js only offers the shutter before the cure; in the cave the cured lantern needs it again
   (drafts, the Undertow). Skipped on any frame where player.js already toggled it. */
let shutEvT=-1;
G.on('lantern:shutter',()=>{ shutEvT=G.time; });
function updateShutter(){
  const L=lantern(), P=G.player; if(!L||!L.carried||!L.cured||!P||P.alive===false)return;
  G.hint('F',L.shut?'Open the shutter':'Close the shutter');
  if(G.input&&G.input.pressed&&G.input.pressed('shutter')&&shutEvT!==G.time){ L.shut=!L.shut; G.emit('lantern:shutter',{shut:L.shut,cave:true}); shutEvT=G.time;
    if(L.shut)say('shut','You close the shutter. The dark comes down like water, and the moths fold in tight around the cage.'); }
}

/* ================================================================ 1. ETHER VEINS */
const VEIN_FALL={mouth:[[-4.5,1.5,-14],[4.5,2,-19]],gallery:[[-11.5,4.2,-32],[11.5,4.2,-39]],stair:[[-5,1,-58],[5,3.6,-66]],
  channel:[[8,5,-86.8],[40,5,-86.8]],drafts:[[56.5,4.5,-66],[63.5,4.5,-46]],arena:[[46,3,-10],[74,3,-20]]};
function buildVeins(){
  const free=anchor('mouth','vein',VEIN_FALL.mouth[0]);
  for(const room in VEIN_FALL){
    let list=anchor(room,'veins',VEIN_FALL[room]); if(!Array.isArray(list))list=[list];
    if(room==='mouth'&&!list.some(v=>v.distanceTo(free)<.5))list=[free].concat(list);
    list.forEach((pos,i)=>{
      const v={room,i,pos,free:room==='mouth'&&pos.distanceTo(free)<.5};
      API.veins.push(v);
      v.ipos=veinStand(v.pos);                 // veins sit up the wall; interact from the open floor in front of it
      v.inter=G.interact.add({pos:()=>v.ipos,radius:2.4,priority:2,
        enabled:()=>inside()&&isPlay()&&!S.lit[room]&&!(G.cave&&G.cave.isLit&&G.cave.isLit(room)),
        label:()=>veinLabel(v), use:()=>useVein(v)});
    });
  }
}
/** where a player can stand to reach a vein: step out from the rock (cave sdf) onto open floor */
function veinStand(p){
  const q=p.clone().add(V(0,-1.3,0)), sdf=G.cave&&G.cave.sdf; if(!sdf)return q;
  const o=origin(); let x=p.x-o.x, z=p.z-o.z; const e=.2;
  for(let i=0;i<40&&sdf(x,z)>-.9;i++){ const gx=sdf(x+e,z)-sdf(x-e,z), gz=sdf(x,z+e)-sdf(x,z-e), gl=Math.hypot(gx,gz)||1; x-=gx/gl*.12; z-=gz/gl*.12; }
  const f=floorY(x+o.x,z+o.z,p.y+1); return V(x+o.x,isFinite(f)&&f>p.y-6?f:q.y,z+o.z);
}
function ether(){ return G.alchemy?G.alchemy.etherUnits|0:0; }
function vials(){ return G.inv?G.inv.count('vial'):0; }
function veinLabel(v){
  if(v.room==='arena'&&!S.bossDead)return 'The vein won’t take the light';
  if(v.free&&!S.said.freeVein)return 'Wake the vein · old ether residue';
  const e=ether(), n=vials();
  if(!n||e<VEIN_COST)return 'Light the vein · needs '+VEIN_COST+' ether'+(n?' (you have '+e+')':' — no vials');
  return 'Light the vein · '+VEIN_COST+' ether';
}
/** take `units` ether out of the vials (what pour() does, partially): vial count shrinks with what's left */
function spendEther(units){
  const A=G.alchemy; if(!A||!G.inv)return false;
  const n=vials(); if(!n||A.etherUnits<units)return false;
  A.etherUnits-=units;
  const keep=A.etherUnits>0?Math.min(n,Math.ceil(A.etherUnits/VEIN_COST)):0;
  if(keep<n)G.inv.take('vial',n-keep); else G.emit('inv:change',{id:'vial',n:0,total:n});
  return true;
}
function useVein(v){
  if(v.room==='arena'&&!S.bossDead){ G.ui.say('You hold the vial to the seam and the light just goes out of it — swallowed. Something in this dark is drinking every scrap of light you bring.',{priority:'high'}); return; }
  if(v.free&&!S.said.freeVein){
    S.said.freeVein=1; lightRoom(v.room,v);
    setTimeout(()=>G.ui.say('Old ether, left in the rock by whoever came down here before. It takes the lantern’s touch and runs bright. The other seams are dry — they’ll want ether of your own, a vial’s worth each.'),600);
    return;
  }
  if(!spendEther(VEIN_COST)){
    G.ui.say(vials()?'Not enough ether left in your vials. The vein needs '+VEIN_COST+' — brew more at the alchemy table.':'The seam is dry, and it’s thirsty. A vial of ether — '+VEIN_COST+' units, brewed at the alchemy table — would wake it.',{priority:'high',key:'vein'});
    G.emit('cave:veinDry',{room:v.room}); return;
  }
  lightRoom(v.room,v);
  G.ui.toast('The vein wakes','−'+VEIN_COST+' ether · '+(roomName[v.room]||v.room)+' is lit');
}
const roomName={mouth:'The Mouth',gallery:'The Gallery of Keepers',stair:'The Flooding Stair',channel:'The Channel',drafts:'The Hall of Drafts',arena:'The Undertow'};
let litEv=null;
G.on('cave:lit',e=>{ litEv=e&&e.room; if(e&&e.room)S.lit[e.room]=true; });
function lightRoom(room,v,restored){
  S.lit[room]=true; litEv=null;
  if(G.cave&&G.cave.lightRoom){ try{ if(!(G.cave.isLit&&G.cave.isLit(room)))G.cave.lightRoom(room,{restored:!!restored}); }catch(e){console.error('lightRoom',e);} }
  if(litEv!==room)G.emit('cave:lit',{room,restored:!!restored});
  if(v&&!restored&&G.ink&&G.ink.burst)G.ink.burst(v.pos,{n:0,embers:26,speed:2});
}

/* ================================================================ 2. SEALS */
function buildSeal(id){
  const d=SEALS[id], pos=anchor(d.anchor[0],d.anchor[1],d.anchor[2]);
  const root=new THREE.Group(); root.name='seal_'+id; G.scene.add(root);
  const mat=inkMat();
  const R=d.r, anchors=[];
  // the plug: a squashed breathing blob jammed into the opening, plus thorny spines
  const blob=new THREE.Mesh(new THREE.SphereGeometry(1,28,18),mat);
  blob.position.set(pos.x,pos.y+R*.55,pos.z); blob.scale.set(R,R*.85,R*.6); blob.userData.base=blob.scale.clone(); root.add(blob);
  const spines=[];
  for(let i=0;i<9;i++){ const a=rnd()*TAU, el=(rnd()-.3)*1.2, L=.6+rnd()*1.3, c=new THREE.ConeGeometry(.09+rnd()*.07,L,6);
    const dir=V(Math.cos(a)*Math.cos(el),Math.sin(el),Math.sin(a)*Math.cos(el)*.6).normalize();
    c.translate(0,L/2,0); c.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0,1,0),dir)));
    c.translate(dir.x*R*.8,R*.55+dir.y*R*.7,dir.z*R*.45); spines.push(c); }
  const sp=mergeGeos(spines); const spm=new THREE.Mesh(sp,mat); spm.position.copy(pos); root.add(spm);
  for(let i=0;i<16;i++){ const a=rnd()*TAU, el=(rnd()-.2)*1.3; anchors.push(V(pos.x+Math.cos(a)*Math.cos(el)*R*.95,pos.y+R*.55+Math.sin(el)*R*.8,pos.z+Math.sin(a)*Math.cos(el)*R*.55)); }
  const em=G.ink&&G.ink.emitter?G.ink.emitter(V(pos.x,pos.y+R*.6,pos.z),{rate:6,radius:R*.6,height:R*.6,size:[.8,2.4],life:[2.5,4.5],rise:.5,drift:.25,trail:0,alpha:.4,embers:1.6,color:'#0b0710',intensity:0}):null;
  const glow=glowSprite('#7b45ff',R*3.2,.22); glow.position.set(pos.x,pos.y+R*.6,pos.z); root.add(glow);
  // the plug blocks its passage: a wall-to-wall box through G.cave.block (cave-local), else a plain collider
  let col=null, blockId=null;
  if(id!=='channel'){
    if(G.cave&&G.cave.block&&G.cave.sdf){ const l=toLocal(pos), sdf=G.cave.sdf, reach=(dx,dz)=>{ let d=0; while(d<7&&sdf(l.x+dx*d,l.z+dz*d)<0)d+=.1; return d; };
      const xp=reach(1,0),xn=reach(-1,0),zp=reach(0,1),zn=reach(0,-1);
      const b=(xp+xn)<(zp+zn)?{x:l.x+(xp-xn)/2,z:l.z,hw:(xp+xn)/2+.6,hd:.75}:{x:l.x,z:l.z+(zp-zn)/2,hw:.75,hd:(zp+zn)/2+.6};
      blockId='seal_'+id; G.cave.block(blockId,Object.assign(b,{y0:l.y-3,y1:l.y+8})); }
    else if(G.addCollider)col=G.addCollider({x:pos.x,z:pos.z,r:R*.9,y0:pos.y-1.5,y1:pos.y+R*1.6});
  }
  const s={id,name:d.name,pos:V(pos.x,pos.y+.6,pos.z),radius:d.r+1.2,needs:d.needs,feedTime:d.time,stallBelow:Math.round(d.needs*.4),yRange:6.5,anchors,
    root,mat,blob,em,glow,col,blockId,gate:d.gate,boil:-1,flash:0,seen:false,partial:id==='channel',
    enabled:()=>inside()&&isPlay()&&(id!=='channel'||API.raft.lantern||API.raft.state==='arrived'),
    onFeed(x){ x.flash=1; G.emit('cave:seal',{id,state:'feed'});
      say('sealFeed','The moths settle on the plug and begin to eat. It shudders, and the whole thing draws in a long breath.'); },
    onStall(x,n){ G.emit('cave:seal',{id,state:'stall',n}); },
    onSated(x,n){ G.emit('cave:seal',{id,state:'sated',n,progress:x.progress});
      G.ui.say('The moths eat what they can and lift away, gorged. The plug is still breathing — '+Math.round(x.progress*100)+'% eaten. It wants more moths than you brought.',{priority:'high',key:'sated'}); },
    onStop(){ G.emit('cave:seal',{id,state:'stop'}); },
    onDone(){ openSeal(id,false); }};
  API.seals[id]=s;
  if(G.moths&&G.moths.addSite)G.moths.addSite(s);
  if(id==='channel'&&G.cave&&G.cave.setGate&&!S.open.channel){ try{G.cave.setGate('channel',false);}catch(e){} }
  return s;
}
function mergeGeos(list){
  const P=[],N=[],idx=[]; let off=0;
  for(const g of list){ const p=g.attributes.position,n=g.attributes.normal;
    for(let i=0;i<p.count;i++){P.push(p.getX(i),p.getY(i),p.getZ(i));N.push(n.getX(i),n.getY(i),n.getZ(i));}
    if(g.index){for(const k of g.index.array)idx.push(k+off);} else for(let i=0;i<p.count;i++)idx.push(i+off);
    off+=p.count; }
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(P,3)); g.setAttribute('normal',new THREE.Float32BufferAttribute(N,3)); g.setIndex(idx); g.computeBoundingSphere(); return g;
}
function openSeal(id,restored){
  const s=API.seals[id]; if(!s)return;
  if(S.open[id]&&!restored)return;
  S.open[id]=true; s.cured=true; s.feeding=false; s.progress=1;
  if(s.col&&G.removeCollider){G.removeCollider(s.col); s.col=null;}
  if(s.blockId&&G.cave&&G.cave.block)G.cave.block(s.blockId,null);
  if(id==='channel'&&G.cave&&G.cave.setGate){ try{G.cave.setGate('channel',true);}catch(e){console.error('setGate',e);} }
  if(restored){ s.root.visible=false; if(s.em)s.em.intensity=0; }
  else{
    s.boil=0;
    if(G.ink&&G.ink.burst){ G.ink.burst(s.blob.position,{n:110,speed:5,size:[1,3],life:[1,2.2],up:2.5,embers:60,drops:12}); }
    G.ui.shake&&G.ui.shake(.3);
    G.ui.toast(s.name.replace(/^The /,'')+' · eaten away',id==='channel'?'The sluice is open':'The way is open');
  }
  if(id==='channel'){ API.raft.state='done'; S.raftDone=true; if(!restored)G.emit('cave:raft',{state:'done'}); }
  G.emit('cave:sealOpen',{id,restored:!!restored});
}
function updateSeals(dt){
  const P=G.player;
  for(const id in API.seals){ const s=API.seals[id];
    if(s.boil>=0){ s.boil+=dt; const k=Math.min(1,s.boil/2.6);
      if(s.mat.uniforms&&s.mat.uniforms.uFade)s.mat.uniforms.uFade.value=1-k;
      s.glow.material.opacity=.22*(1-k); if(s.em)s.em.intensity=Math.max(0,1-k*1.6);
      if(rnd()<dt*8&&k<.8&&G.ink&&G.ink.burst)G.ink.burst(s.anchors[(rnd()*s.anchors.length)|0],{n:8,speed:2,size:[.5,1.4],up:2,embers:5});
      if(k>=1){ s.boil=-1; s.root.visible=false; } continue; }
    if(S.open[id])continue;
    const near=P&&P.pos&&inside()&&P.pos.distanceTo(s.pos)<26;
    if(s.em)s.em.intensity=near?(s.feeding?.7:1):0;
    if(near&&!s.seen&&P.pos.distanceTo(s.pos)<12){ s.seen=true; G.emit('cave:seal',{id,state:'seen'});
      say('sealSeen','A plug of black has grown into the passage, wet and breathing, filling it wall to wall. The moths would make short work of it — if there were enough of them.'); }
    const br=1+.06*Math.sin(G.time*(s.feeding?3.4:1.1)+s.pos.x)+(s.feeding?.03*Math.sin(G.time*13):0), sh=1-.4*s.progress, b=s.blob.userData.base;
    s.blob.scale.set(b.x*br*sh,b.y*(2-br)*sh,b.z*br*(.6+.4*sh));
    s.flash=Math.max(0,s.flash-dt*2); if(s.mat.uniforms&&s.mat.uniforms.uFlash)s.mat.uniforms.uFlash.value=s.flash*.6+(s.feeding&&!s.stalled?.12+.1*Math.sin(G.time*9):0);
    S.prog[id]=s.progress;
  }
}

/* ================================================================ 3. THE ROOST */
let roostGlow=null;
function buildRoost(){
  const a=anchor('gallery','roost',[8,3,-30]);
  const fy=floorY(a.x,a.z,a.y+2); const y0=isFinite(fy)&&fy>a.y-4?fy:a.y;
  const g=rockGeo(1.7,3.3,.9); g.translate(0,1.1,0);
  const p=g.attributes.position, n=g.attributes.normal, cols=new Float32Array(p.count*3), c=new THREE.Color();
  for(let i=0;i<p.count;i++){ c.copy(COL('#4b4a50')).lerp(COL('#2a2a30'),U.vnoise(p.getX(i)*2,p.getY(i)*2+p.getZ(i))); if(p.getY(i)>1.2)c.lerp(COL('#6d6a64'),.25); cols[i*3]=c.r;cols[i*3+1]=c.g;cols[i*3+2]=c.b; }
  g.setAttribute('color',new THREE.BufferAttribute(cols,3));
  const m=new THREE.Mesh(g,G.toon('#ffffff',{vertexColors:true})); m.position.set(a.x,y0,a.z); m.rotation.y=rnd()*TAU; m.castShadow=true; m.name='mothRoost';
  G.scene.add(m); if(G.outline)G.outline(m,{thickness:.03}); m.updateMatrixWorld(true);
  if(G.addCollider)G.addCollider({x:a.x,z:a.z,r:1.45,y0:y0-1,y1:y0+2.6});
  // cling points: the upper and side faces
  const cand=[]; const nm=new THREE.Matrix3().getNormalMatrix(m.matrixWorld);
  for(let i=0;i<p.count;i++){ const ny=n.getY(i); if(ny<-.15||p.getY(i)<.35)continue;
    cand.push({p:V(p.getX(i),p.getY(i),p.getZ(i)).applyMatrix4(m.matrixWorld),n:V(n.getX(i),n.getY(i),n.getZ(i)).applyMatrix3(nm).normalize()}); }
  const pts=[]; for(let k=0;k<ROOST_N&&cand.length;k++)pts.push(cand.splice((rnd()*cand.length)|0,1)[0]);
  if(CR()&&CR().setRoost)CR().setRoost(pts);
  roostGlow=glowSprite('#efe6cf',5,.1); roostGlow.position.set(a.x,y0+1.6,a.z); G.scene.add(roostGlow);
  API.roost={pos:V(a.x,y0+1.4,a.z),mesh:m,points:pts};
}
let roostT=ROOST_REGROW, roostSaid=false;
function updateRoost(dt){
  if(!API.roost)return;
  const ms=mothList(); let n=0; for(const m of ms) if(m.tgt==='roost')n++;
  API.roost.count=n;
  if(roostGlow)roostGlow.material.opacity=.03+.1*n/ROOST_N;
  const P=G.player;
  if(!roostSaid&&P&&P.pos&&n>8&&P.pos.distanceTo(API.roost.pos)<9){ roostSaid=true;
    say('roost','The rock is furred with pale moths — cave moths, wings folded flat, so still they look like lichen. They have never seen a lantern.'); }
  // the roost slowly refills (only cave-born moths, so the dungeon can't run dry)
  roostT-=dt; if(roostT>0)return; roostT=ROOST_REGROW;
  if(n>=ROOST_N)return;
  const R=CR(); const pts=R&&R.roost&&R.roost.pts; if(!pts||!pts.length)return;
  for(const m of ms) if(m.cave&&m.tgt==='gone'){ const r=pts[(rnd()*pts.length)|0]; m.p.copy(r.p).addScaledVector(r.n,.8); m.v.set(0,0,0); R.toRoost(m); break; }
}

/* ================================================================ 4. FLOATING CRATES */
const CRATE_HW=.6, CRATE_H=1.0;
function buildCrates(){
  let homes=anchor('stair','crateSpots',null)||anchor('stair','crates',[-2,0,-60]);
  const ledge=anchor('stair','ledge',[3,2.6,-65]);
  if(!Array.isArray(homes)){ const c=homes, d=V(ledge.x-c.x,0,ledge.z-c.z); if(d.lengthSq()<.01)d.set(1,0,0); d.normalize(); const pr=V(-d.z,0,d.x);
    homes=[-1,0,1].map(k=>c.clone().addScaledVector(d,k*1.5).addScaledVector(pr,(k===0?.25:-.15)));
    // stepping stones: the last crate sits a short jump from the ledge
    const far=Math.hypot(ledge.x-homes[2].x,ledge.z-homes[2].z); if(far>2.2)homes.forEach(h=>h.addScaledVector(d,far-1.7)); }
  const mat=G.toon('#ffffff',{vertexColors:true});
  homes.slice(0,3).forEach((h,i)=>{
    const g=crateGeo(i); const mesh=new THREE.Mesh(g,mat); mesh.castShadow=true; G.scene.add(mesh); if(G.outline)G.outline(mesh,{thickness:.025});
    const fl=floorY(h.x,h.z,h.y+3);
    const c={i,home:h.clone(),pos:h.clone(),yaw:rnd()*TAU,mesh,bed:isFinite(fl)&&fl>-1e8?fl:-1e9,top:h.y,prev:h.clone(),ph:rnd()*TAU};
    API.crates.push(c);
  });
  G.floorProviders.push(crateFloor);
  G.constrainers.push(crateWall);
}
function crateGeo(seed){
  const parts=[], box=(w,h,d,x,y,z)=>{const b=new THREE.BoxGeometry(w,h,d); b.translate(x,y,z); return b;};
  const s=CRATE_HW*2;
  parts.push(box(s,CRATE_H,s,0,0,0));
  for(const sx of [-1,1])for(const sz of [-1,1])parts.push(box(.12,CRATE_H+.02,.12,sx*(CRATE_HW-.04),0,sz*(CRATE_HW-.04)));
  for(const y of [-.38,.38])parts.push(box(s+.03,.1,.06,0,y,CRATE_HW),box(s+.03,.1,.06,0,y,-CRATE_HW),box(.06,.1,s+.03,CRATE_HW,y,0),box(.06,.1,s+.03,-CRATE_HW,y,0));
  const g=mergeGeos(parts.map(b=>b.toNonIndexed?b:b)); const p=g.attributes.position, a=new Float32Array(p.count*3), c=new THREE.Color();
  for(let i=0;i<p.count;i++){ const y=p.getY(i); c.copy(COL('#6b5038')).lerp(COL('#3f2e21'),U.vnoise(p.getX(i)*5+seed*3,y*9+p.getZ(i)*5)*.8); if(y<-.2)c.lerp(COL('#2d3a33'),.45); a[i*3]=c.r;a[i*3+1]=c.g;a[i*3+2]=c.b; }
  g.setAttribute('color',new THREE.BufferAttribute(a,3)); return g;
}
function crateLocal(c,x,z){ const cs=Math.cos(c.yaw),sn=Math.sin(c.yaw), dx=x-c.pos.x, dz=z-c.pos.z; return [dx*cs-dz*sn,dx*sn+dz*cs]; }
function crateFloor(x,z,y){
  if(selfQ||!built||!API.crates.length)return null;
  for(const c of API.crates){ if(Math.abs(x-c.pos.x)>1.2||Math.abs(z-c.pos.z)>1.2)continue;
    const [lx,lz]=crateLocal(c,x,z); if(Math.abs(lx)<CRATE_HW+.08&&Math.abs(lz)<CRATE_HW+.08&&c.top<=y+.9)return c.top; }
  return null;
}
function crateWall(prev,n,y,radius){
  if(!built)return false; let hit=false;
  for(const c of API.crates){ if(Math.abs(n.x-c.pos.x)>2||Math.abs(n.z-c.pos.z)>2)continue;
    if(y>=c.top-.35||y+1.6<c.top-CRATE_H)continue;
    const cs=Math.cos(c.yaw),sn=Math.sin(c.yaw), dx=n.x-c.pos.x, dz=n.z-c.pos.z; let lx=dx*cs-dz*sn, lz=dx*sn+dz*cs;
    const ex=CRATE_HW+radius, ez=CRATE_HW+radius;
    if(Math.abs(lx)<ex&&Math.abs(lz)<ez){ if(ex-Math.abs(lx)<ez-Math.abs(lz))lx=Math.sign(lx||1)*ex; else lz=Math.sign(lz||1)*ez;
      n.x=c.pos.x+lx*cs+lz*sn; n.z=c.pos.z-lx*sn+lz*cs; hit=true; } }
  return hit;
}
function updateCrates(dt){
  if(!API.crates.length)return;
  const wy=waterY(), t=G.time, P=G.player;
  for(const c of API.crates){
    c.prev.copy(c.pos); const prevTop=c.top;
    const floating=wy-.1>c.bed+.5;
    const drift=floating?1:0;
    c.pos.x=c.home.x+(Math.sin(t*.13+c.ph)*.16+Math.sin(t*.29+c.ph*2)*.06)*drift;
    c.pos.z=c.home.z+(Math.cos(t*.11+c.ph*1.7)*.16)*drift;
    const bob=floating?.05*Math.sin(t*1.4+c.ph)+.02*Math.sin(t*2.7+c.ph):0;
    c.pos.y=Math.max(wy+.1+bob,c.bed+CRATE_H/2);
    c.top=c.pos.y+CRATE_H/2;
    c.yaw+=dt*.03*Math.sin(t*.05+c.ph)*drift;
    c.mesh.position.copy(c.pos); c.mesh.rotation.set(floating?.035*Math.sin(t*1.1+c.ph):0,c.yaw,floating?.03*Math.cos(t*1.3+c.ph):0);
    // a player standing on it rides along
    if(P&&P.pos&&isPlay()){ const [lx,lz]=crateLocal(c,P.pos.x,P.pos.z);
      if(Math.abs(lx)<CRATE_HW+.1&&Math.abs(lz)<CRATE_HW+.1&&Math.abs(P.pos.y-prevTop)<.12){
        const dx=c.pos.x-c.prev.x, dz=c.pos.z-c.prev.z; if(dx*dx+dz*dz>1e-8)G.moveCharacter(P.pos,dx,dz,.35,'player');
        if(c.top>P.pos.y)P.pos.y=c.top; c.ridden=true; } else c.ridden=false; }
  }
}

/* ================================================================ 5. THE RAFT
   Load the baited lantern at the jetty → it casts off after RAFT_CAST s → the current carries it down the channel (a bolt, a strike or a
   slam on the raft shoves it on) → boarding waves at RAID_WAVES (each crab telegraphs 1.5 s on the edge, then climbs aboard and snatches
   moths until it is knocked off) → it bumps into the plug and the swarm feeds (partial: too few moths only eat their share). */
let raftMesh=null, raftA=null, raftB=null, raftLen=1, raftPushV=0, raftLat=0, raftLatV=0, raftYaw=0, raftRoll=0, raftPitch=0, prevLevel=null, raftDrifting=false, raftInter=null, raftTake=null, raftSaid={}, raftHB=null;
const raid={wave:0,crabs:[],rings:[],ringT:0,glints:[],sprays:[]};
API.raid=raid;
function buildRaft(){
  raftA=anchor('channel','raftStart',[7,0,-80]); raftB=anchor('channel','raftEnd',[44,0,-80]);
  raftLen=Math.max(1,Math.hypot(raftB.x-raftA.x,raftB.z-raftA.z)); API.raft.dir=raftDir(); API.raft.len=raftLen; API.raft.radius=1.4;
  const parts=[], box=(w,h,d,x,y,z,ry=0)=>{const b=new THREE.BoxGeometry(w,h,d); b.rotateY(ry); b.translate(x,y,z); return b;};
  for(let i=0;i<6;i++)parts.push(box(2.3+(rnd()-.5)*.25,.13,.27,(rnd()-.5)*.08,.02*(i%2),-.72+i*.29,(rnd()-.5)*.05));
  for(const z of [-.55,.55])parts.push(box(.18,.16,1.9,0,-.13,0,PI/2+.0),box(2.0,.14,.16,0,-.12,z));
  for(const x of [-1.05,1.05])parts.push(new THREE.CylinderGeometry(.06,.07,.5,6).translate(x,.22,.78));
  const g=mergeGeos(parts); const p=g.attributes.position, a=new Float32Array(p.count*3), c=new THREE.Color();
  for(let i=0;i<p.count;i++){ c.copy(COL('#75573c')).lerp(COL('#3c2b1e'),U.vnoise(p.getX(i)*3,p.getZ(i)*7)*.85); if(p.getY(i)<0)c.lerp(COL('#26332e'),.5); a[i*3]=c.r;a[i*3+1]=c.g;a[i*3+2]=c.b; }
  g.setAttribute('color',new THREE.BufferAttribute(a,3));
  raftMesh=new THREE.Mesh(g,G.toon('#ffffff',{vertexColors:true})); raftMesh.castShadow=true; raftMesh.name='raft'; G.scene.add(raftMesh); if(G.outline)G.outline(raftMesh,{thickness:.025});
  placeRaft(0);
  raftInter=G.interact.add({pos:()=>V(API.raft.pos.x,G.player.pos.y,API.raft.pos.z),radius:3.3,priority:3,
    enabled:()=>inside()&&isPlay()&&!API.raft.lantern&&API.raft.state!=='done'&&lantern()&&lantern().carried&&API.raft.t<.05,
    label:()=>{ const L=lantern(); if(!(G.moths&&G.moths.baited))return 'Set the lantern on the raft · bait it first'; if(L.shut)return 'Set the lantern on the raft · open the shutter first'; return 'Set the lantern on the raft'; },
    use:()=>loadRaft()});
  raftTake=G.interact.add({pos:()=>V(API.raft.pos.x,G.player.pos.y,API.raft.pos.z),radius:RAFT_REACH,priority:3,
    enabled:()=>inside()&&isPlay()&&API.raft.lantern&&lantern()&&!lantern().carried&&(Math.hypot(G.player.pos.x-API.raft.pos.x,G.player.pos.z-API.raft.pos.z)<2.2||API.raft.state==='arrived'||API.raft.state==='done'),
    label:()=>'Hook the lantern back off the raft', use:()=>takeLantern()});
  // the raft takes blows: a bolt from the walkway, a strike from the jetty, a slam — each shoves it on toward the sluice.
  // Lock-on only offers it (and it only takes hits) while no crab is on it or at its edge: then the crabs come first.
  raftHB={team:'enemy',pos:API.raft.pos,radius:1.25,height:.55,corrupt:false,name:'The raft',lockOffset:.25,raft:true,
    get targetable(){ return !!(API.raft.lantern&&API.raft.state!=='arrived'&&API.raft.state!=='done'&&!raiders().length); },
    alive:()=>built&&!!raftMesh&&API.raft.state!=='done'&&inside()&&!raiders().length,   // while a crab is on it or at its edge, blows (and bolts) go to the crab
    hit:info=>pushRaft(info)};
  G.combat.add(raftHB);
  // ripples where a crab grips the edge (the telegraph): a few flat rings on the water
  const rm=new THREE.MeshBasicMaterial({color:COL('#cfe2e6'),transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide});
  for(let i=0;i<10;i++){ const m=new THREE.Mesh(new THREE.RingGeometry(.82,1,28),rm.clone()); m.rotation.x=-PI/2; m.visible=false; m.renderOrder=3; G.scene.add(m); raid.rings.push({m,t:9,life:1,big:1}); }
  // a cold glint on a crab gripping the edge (reads at walkway distance), and the white spray of one going over the side
  for(let i=0;i<4;i++){ const g=glowSprite('#e6d4ff',1.7,0); g.visible=false; G.scene.add(g); raid.glints.push(g); }
  const crownG=new THREE.CylinderGeometry(.8,.32,1,18,1,true); crownG.translate(0,.5,0);
  for(let i=0;i<4;i++){ const g=new THREE.Mesh(crownG,new THREE.MeshBasicMaterial({color:COL('#e9f4f6'),transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide}));
    g.visible=false; g.renderOrder=4; G.scene.add(g); raid.sprays.push({s:g,t:9,life:.75,pos:V()}); }
}
function raftDir(){ return V(raftB.x-raftA.x,0,raftB.z-raftA.z).normalize(); }
function placeRaft(dt){
  const r=API.raft, d=raftDir(), pr=V(-d.z,0,d.x), wy=waterY(), t=G.time;
  r.pos.set(raftA.x+(raftB.x-raftA.x)*r.t,wy+.08+.04*Math.sin(t*1.3)-.06*Math.abs(raftRoll)*4,raftA.z+(raftB.z-raftA.z)*r.t).addScaledVector(pr,raftLat);
  r.deckY=r.pos.y+.1;
  if(raftMesh){ raftMesh.position.copy(r.pos); raftMesh.rotation.set(.03*Math.sin(t*1.1)+raftRoll,Math.atan2(d.x,d.z)+PI/2+raftYaw,.04*Math.cos(t*.9)+raftPitch); }
}
function loadRaft(){
  const L=lantern(); if(!L)return;
  if(!(G.moths&&G.moths.baited)){ G.ui.say('A bare lantern on a raft is just a lantern on a raft. The moths would need the bait to follow it.',{priority:'high',key:'raft'}); return; }
  if(L.shut){ G.ui.say('Open the shutter first — the moths need the light to settle by.',{priority:'high',key:'raft'}); return; }
  L.carried=false; L.shut=false; L.pos.set(API.raft.pos.x,API.raft.pos.y+.12,API.raft.pos.z);
  G.emit('lantern:drop',{pos:L.pos.clone(),raft:true});
  const r=API.raft; r.lantern=true; r.state='loaded'; r.runT=0; r.pushes=0; raftDrifting=false; raftPushV=0;
  raid.wave=RAID_WAVES.findIndex(w=>w.at>r.t); if(raid.wave<0)raid.wave=RAID_WAVES.length;
  G.emit('cave:raft',{state:'loaded'});
  if(!raftSaid.load){ raftSaid.load=1; G.ui.say('You set the lantern down among the planks and the swarm settles over it like snow on a lamp. The current is already tugging at the rope. Get up on the walkway.',{priority:'high',key:'raft'}); }
}
function takeLantern(){
  const L=lantern(); if(!L||L.carried)return;
  const pick=G.interact.list.find(o=>o.use&&o.use.name==='lanternPickup');
  if(pick){ try{ pick.use(); }catch(e){console.error(e);} }
  if(!L.carried){ L.carried=true; L.inCradle=false; G.emit('lantern:pickup',{pos:G.player.pos.clone()}); }
}
// taking the lantern back before the sluice is open sends the empty raft home to its mooring (it can't be reached at the far end)
G.on('lantern:pickup',()=>{ const r=API.raft; if(!r.lantern)return; r.lantern=false; raftDrifting=false; raftPushV=0; if(r.state!=='done')r.state='idle'; G.emit('cave:raft',{state:'taken'}); });
/** a blow on the raft (its hurtbox): always on toward the sluice — there is nothing to gain by pushing it back */
function pushRaft(info){
  const r=API.raft; if(!r.lantern||r.state==='arrived'||r.state==='done')return;
  raftPushV=Math.min(RAFT_PUSH_MAX,raftPushV+RAFT_PUSH_V*(info&&info.kind==='bolt'?1:.8)); r.pushes=(r.pushes||0)+1;
  raftPitch=.09; if(r.state==='loaded'&&r.runT<RAFT_CAST)r.runT=RAFT_CAST; // a shove casts it off at once
  G.emit('cave:raft',{state:'pushed',dir:1,pos:r.pos.clone()});
  const d=raftDir(); if(G.ink&&G.ink.burst){ G.ink.burst(V(r.pos.x-d.x*1.3,r.pos.y+.05,r.pos.z-d.z*1.3),{n:8,speed:2,size:[.3,.9],life:[.4,.9],up:1.4,embers:0,drops:10,color:'#bcd6dc',alpha:.45}); }
  if(!raftSaid.push){ raftSaid.push=1; G.ui.say('The raft lurches forward and rides a little faster.',{priority:'low'}); }
}
function raiders(){ return raid.crabs.filter(m=>m.alive&&!m.dying); }
function raftCurrent(dl){ const tk=Math.min(1,Math.abs(dl)/TIDE_DL_PEAK); return RAFT_V0+RAFT_VT*tk; }
function updateRaft(dt){
  if(!raftMesh)return;
  const r=API.raft, L=lantern(), lv=G.tide?G.tide.level:0;
  const dl=prevLevel==null||dt<=0?0:(lv-prevLevel)/dt; prevLevel=lv;
  const on=raiders(), aboard=on.filter(m=>m.onRaft).length;
  r.raiders=on.length; r.aboard=aboard;
  let v=0;
  if(r.lantern&&(r.state==='loaded'||r.state==='drifting')){
    r.runT=(r.runT||0)+dt;
    if(r.state==='loaded'&&r.runT>=RAFT_CAST){ r.state='drifting'; raftDrifting=true; G.emit('cave:raft',{state:'drifting',speed:+raftCurrent(dl).toFixed(2)});
      if(!raftSaid.drift){ raftSaid.drift=1; G.ui.say('The rope slips and the current takes the raft. A bolt against it would hurry it along.',{key:'raft'}); } }
    if(r.state==='drifting'){ const ramp=Math.min(1,(r.runT-RAFT_CAST)/RAFT_RAMP);
      v=raftCurrent(dl)*(.15+.85*ramp)*Math.max(.7,1-RAFT_DRAG*aboard); }
  }
  // an empty raft swings back to its mooring by the jetty (a stray blow can't strand it out of reach)
  if(!r.lantern&&r.state!=='done'&&r.t>0){ raftPushV=0; r.t=Math.max(0,r.t-dt*RAFT_HOME_V/raftLen); if(r.state==='arrived')r.state='idle'; }
  if(r.lantern&&r.state==='drifting'&&raftPushV>0)v+=raftPushV;
  raftPushV=Math.max(0,raftPushV-dt*RAFT_PUSH_DECAY*Math.max(1,raftPushV));
  r.t=U.clamp(r.t+v*dt/raftLen,0,1);
  r.speed=v;
  // bumping along the walls
  raftLatV+=(Math.sin(G.time*.4)*.3-raftLat)*dt*.6+(rnd()-.5)*dt*.6*Math.min(1,Math.abs(v)+.1);
  raftLat+=raftLatV*dt;
  if(Math.abs(raftLat)>.75){ raftLat=Math.sign(raftLat)*.75; raftLatV*=-.5; raftYaw+=(rnd()-.5)*.25;
    if(Math.abs(v)>.04)G.emit('cave:raft',{state:r.state,bump:true}); }
  raftYaw*=1-dt*.4;
  // the raft dips toward a crab hauling on its edge or sitting on it; a shove pitches it
  let roll=0; for(const m of on){ if(m.state==='grip')roll+=.07*Math.min(1,m.st/.4)*(m.raid?m.raid.side:1); else if(m.onRaft||m.state==='board')roll+=.035*(m.raid?m.raid.side:1); }
  raftRoll=U.damp(raftRoll,U.clamp(roll,-.14,.14)+(on.some(m=>m.state==='grip')?.012*Math.sin(G.time*17):0),6,dt);
  raftPitch=U.damp(raftPitch,0,3,dt);
  placeRaft(dt);
  if(r.lantern&&L&&!L.carried){ L.pos.set(r.pos.x,r.pos.y+.12,r.pos.z); }
  if((r.state==='loaded'||r.state==='drifting')&&r.lantern&&r.t>=.985){ r.state='arrived'; raftDrifting=false; raftPushV=0; G.emit('cave:raft',{state:'arrived',runT:+r.runT.toFixed(2)});
    // docked: the raid is over. A crab still gripping the edge or aboard slips off into the sluice, as if knocked
    for(const m of raiders()) if(G.monsters&&G.monsters.kill)G.monsters.kill(m,{kind:'melee',dir:V(0,0,1)});
    if(!raftSaid.arr){ raftSaid.arr=1; G.ui.say('The raft bumps up against the black at the sluice gate. The moths lift off the lantern and go to it.',{key:'raft'}); } }
  S.raftT=r.t;
  let n=0; for(const m of mothList()) if(SWARM(m)&&Math.abs(m.p.x-r.pos.x)<3&&Math.abs(m.p.z-r.pos.z)<3&&Math.abs(m.p.y-r.pos.y)<3)n++;
  r.moths=n;
  updateRaid(dt,on);
}
/* ---- the boarding waves ---- */
function spawnRaider(side){
  const r=API.raft, d=raftDir(), pr=V(-d.z,0,d.x), along=(rnd()-.5)*1.2, wy=waterY();
  const x=r.pos.x+d.x*along+pr.x*side*1.7, z=r.pos.z+d.z*along+pr.z*side*1.7, c=W(25,0,-80);
  if(!G.monsters||!G.monsters.spawn)return null;
  try{ const m=G.monsters.spawn('brineling',{x,y:wy-.6,z},{zone:{name:'cave-channel',x:c.x,z:c.z,r:24},cave:'channel',raid:{side,along}});
    if(m){ m.raider=true; if(!raid.crabs.includes(m))raid.crabs.push(m); if(G.ink&&G.ink.burst)G.ink.burst(V(x,wy+.05,z),{n:8,speed:1.6,size:[.3,.8],life:[.4,1],up:1.6,embers:1,drops:10,color:'#bcd6dc',alpha:.5});
      G.emit('cave:brinelingRises',{pos:V(x,wy,z),raid:true}); }
    return m; }catch(e){ console.error('raid spawn',e); return null; }
}
let raidQ=[];
function ring(p,life,big,delay){ const g=raid.rings.find(x=>x.t>=x.life); if(!g)return; g.t=-(delay||0); g.life=life; g.big=big||1; g.m.position.set(p.x,waterY()+.03,p.z); g.m.visible=!delay; }
G.on('brineling:splash',e=>{ if(!built||!e||!e.pos)return; ring(e.pos,1.1,1.6); ring(e.pos,1.2,2.2,.15);
  const sp=raid.sprays.find(x=>x.t>=x.life); if(sp){ sp.t=0; sp.pos.copy(e.pos); } });
function updateRaid(dt,on){
  const r=API.raft, P=G.player;
  // waves (only while a lantern rides with moths on it)
  if(r.lantern&&r.state==='drifting'&&raid.wave<RAID_WAVES.length&&r.t>=RAID_WAVES[raid.wave].at){
    const w=RAID_WAVES[raid.wave]; raid.wave++;
    if(r.moths>0){ w.sides.forEach((s,i)=>raidQ.push({at:G.time+i*RAID_GAP,side:s})); G.emit('cave:raid',{wave:raid.wave,n:w.sides.length}); }
  }
  for(let i=raidQ.length-1;i>=0;i--){ if(G.time>=raidQ[i].at){ const q=raidQ.splice(i,1)[0]; if(r.lantern&&r.state!=='done')spawnRaider(q.side); } }
  for(let i=raid.crabs.length-1;i>=0;i--) if(!raid.crabs[i].alive)raid.crabs.splice(i,1);
  // telegraph: ripples and little splashes round the claws on the edge
  raid.ringT-=dt;
  for(const m of on){ if(m.state!=='grip')continue;
    if(raid.ringT<=0){ ring(m.pos,.9,1); raid.ringT=.32; }
    if(rnd()<dt*5&&G.ink&&G.ink.burst)G.ink.burst(V(m.pos.x+(rnd()-.5)*.5,waterY()+.05,m.pos.z+(rnd()-.5)*.5),{n:1,speed:1,size:[.15,.4],life:[.3,.6],up:1.3,embers:0,drops:3,color:'#bcd6dc',alpha:.45}); }
  for(const g of raid.rings){ if(g.t>=g.life){ if(g.m.visible)g.m.visible=false; continue; } g.t+=dt; if(g.t<0)continue; g.m.visible=true; const k=g.t/g.life; g.m.scale.setScalar((.35+k*1.3)*g.big); g.m.material.opacity=.48*(1-k); g.m.position.y=waterY()+.03; }
  let gi=0; for(const m of on){ if(m.state!=='grip'||gi>=raid.glints.length)continue; const g=raid.glints[gi++], k=Math.min(1,m.st/.5);
    g.visible=true; g.position.set(m.pos.x,waterY()+.45,m.pos.z); g.material.opacity=k*(.38+.26*Math.sin(G.time*11)); g.scale.setScalar(1.3+.4*k); }
  for(;gi<raid.glints.length;gi++) if(raid.glints[gi].visible)raid.glints[gi].visible=false;
  for(const sp of raid.sprays){ if(sp.t>=sp.life){ if(sp.s.visible)sp.s.visible=false; continue; } sp.t+=dt; const k=sp.t/sp.life;
    sp.s.visible=true; sp.s.position.set(sp.pos.x,waterY()-.05,sp.pos.z); const h=Math.sin(Math.min(1,k*1.6)*PI*.5)*(1-Math.max(0,k-.55)*1.6);   // a crown of spray: up, then falling back
    sp.s.scale.set(.8+k*1.1,.15+1.25*Math.max(.05,h),.8+k*1.1); sp.s.material.opacity=.5*(1-k); }
  // the swarm shrinks back from a raider (so the crab reads as a thing among the moths, not swallowed by them)
  const C=CR(); if(C){ let sh=null; const lp=r.pos;
    for(const m of on){ if(!(m.onRaft||m.state==='board'||m.state==='grip'))continue; const dx=lp.x-m.pos.x, dz=lp.z-m.pos.z, d=Math.hypot(dx,dz)||1;
      sh=sh||{x:0,y:0,z:0}; sh.x+=dx/d*.42; sh.z+=dz/d*.42; sh.y=.32; }
    const cur=C.clingShy||{x:0,y:0,z:0}, k=Math.min(1,dt*5), want=sh||{x:0,y:0,z:0};
    const nx=U.lerp(cur.x,U.clamp(want.x,-.6,.6),k), ny=U.lerp(cur.y,want.y,k), nz=U.lerp(cur.z,U.clamp(want.z,-.6,.6),k);
    C.clingShy=Math.abs(nx)+Math.abs(ny)+Math.abs(nz)<.01&&!sh?null:{x:nx,y:ny,z:nz}; }
}
G.on('brineling:grip',e=>{ const m=e&&e.monster; if(!built||!m)return;
  if(!raid.crabs.includes(m))raid.crabs.push(m);   // a channel crab that went for the raft by itself joins the raid (ripples, the dip, cleanup)
  if(!raftSaid.grip){ raftSaid.grip=1; G.ui.say('Claws hook over the edge of the raft. Something is hauling itself up out of the water — hit it before it gets aboard.',{priority:'high',key:'raid'}); } });
G.on('brineling:aboard',()=>{ if(!built)return;
  if(!raftSaid.aboard){ raftSaid.aboard=1; G.ui.say('A brineling hauls itself onto the raft — it’s snatching the moths! Knock it off: lock on and loose a charged bolt from the walkway.',{priority:'high',key:'raid'}); } });
G.on('brineling:knocked',e=>{ if(!built)return;
  if(!raftSaid.knock){ raftSaid.knock=1; G.ui.say('Over the side it goes, with a splash. The swarm settles back over the lantern.',{priority:'low',key:'raidOff'}); } });
G.on('moths:lost',e=>{ if(!built||!(e&&e.snatch))return;
  if(!raftSaid.snatchToast){ raftSaid.snatchToast=1; G.ui.toast&&G.ui.toast('A moth dragged under','Knock the crab off the raft'); } });
function clearRaid(){ for(const m of raid.crabs) if(m.alive&&G.monsters&&G.monsters.despawn)G.monsters.despawn(m); raid.crabs.length=0; raidQ.length=0; }
G.on('cave:exit',()=>clearRaid());

/* ================================================================ 6. THE HALL OF DRAFTS */
let ventFx=[];
function buildVents(){
  let list=anchor('drafts','vents',[[60,3,-64],[59,3,-56],[61,3,-48]]); if(!Array.isArray(list))list=[list];
  const ringMat=G.toon('#2b2a2f'), holeMat=new THREE.MeshBasicMaterial({color:0x020203});
  list.forEach((p,i)=>{
    const fy=floorY(p.x,p.z,p.y+1.5); const y=isFinite(fy)&&Math.abs(fy-p.y)<2?fy:p.y;
    const g=new THREE.Group(); g.position.set(p.x,y,p.z); G.scene.add(g);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(.75,.22,6,16),ringMat); ring.rotation.x=PI/2; ring.position.y=.03; ring.scale.z=.5; g.add(ring);
    const hole=new THREE.Mesh(new THREE.CircleGeometry(.66,16),holeMat); hole.rotation.x=-PI/2; hole.position.y=.035; g.add(hole);
    const col=[]; for(let k=0;k<4;k++){ const s=glowSprite('#cfe4ea',1,0); s.position.y=.5+k*1.1; g.add(s); col.push(s); }
    API.vents.push({i,pos:V(p.x,y,p.z),group:g,col});
  });
}
let gustClock=0, gustPhase='idle', gustSaid=false;
function updateDrafts(dt){
  if(!API.vents.length)return;
  const P=G.player, here=inside()&&P&&P.pos&&API.vents.some(v=>Math.hypot(P.pos.x-v.pos.x,P.pos.z-v.pos.z)<30);
  const g=API.gust;
  if(!here){ gustPhase='idle'; g.phase='idle'; for(const v of API.vents)for(const s of v.col)s.material.opacity=0; return; }
  gustClock=(gustClock+dt)%GUST_PERIOD;
  const tele0=GUST_PERIOD-GUST_LEAD; // telegraph runs in the last GUST_LEAD s of the cycle; the burst at clock 0
  let ph=gustClock>=tele0?'telegraph':gustClock<GUST_LEN?'burst':'idle';
  if(ph!==gustPhase){ gustPhase=ph;
    if(ph==='telegraph'){ API.vents.forEach(v=>G.emit('cave:gust',{i:v.i,pos:v.pos.clone(),phase:'telegraph',lead:GUST_LEAD}));
      if(P.pos.distanceTo(API.vents[0].pos)<22){ const L=lantern(); if(!(L&&L.shut))say('gustWarn','The floor ahead hisses, and the air drags toward the holes in it. Close the lantern’s shutter — the moths will cling to the cage — and cross between the gusts.'); } }
    if(ph==='burst'){ API.vents.forEach(v=>{ G.emit('cave:gust',{i:v.i,pos:v.pos.clone(),phase:'burst',lead:0});
      if(G.ink&&G.ink.burst)G.ink.burst(V(v.pos.x,v.pos.y+.6,v.pos.z),{n:14,speed:2.5,size:[.6,1.8],life:[.6,1.3],up:6,embers:0,color:'#c3d9de',alpha:.35}); });
      if(!gustSaid&&P.pos.distanceTo(API.vents[0].pos)<14){ gustSaid=true; say('gust','The sea breathes up through the floor — a roaring gust of spray. Any moth caught in it is simply gone.',{priority:'high'}); } }
  }
  g.phase=ph; g.next=ph==='telegraph'?GUST_PERIOD-gustClock:ph==='burst'?0:tele0-gustClock;
  // visuals: a hissing build of spray, then a tall column
  const k=ph==='telegraph'?(gustClock-tele0)/GUST_LEAD:ph==='burst'?1:0;
  for(const v of API.vents) v.col.forEach((s,j)=>{ const on=ph==='burst'?1-gustClock/GUST_LEN*.6:j===0?k*.8:j===1?Math.max(0,k-.5)*.6:0;
    s.material.opacity=.38*on; s.scale.set(.9+.5*k+j*.25,(ph==='burst'?2.4:1.2)+j*.3,1); s.position.y=.5+j*(ph==='burst'?1.4:.5)+(rnd()-.5)*.05; });
  if(ph!=='burst'||!isPlay())return;
  // the gust: open-lantern swarm moths in range are lost; the player is shoved
  const L=lantern(), safe=L&&L.carried&&L.shut;
  for(const v of API.vents){
    if(!safe&&G.moths&&G.moths.kill){ for(const m of mothList()){ if(!SWARM(m))continue; const dx=m.p.x-v.pos.x, dz=m.p.z-v.pos.z;
      if(dx*dx+dz*dz<GUST_R*GUST_R&&m.p.y>v.pos.y-1&&m.p.y<v.pos.y+8&&rnd()<dt*7)G.moths.kill(m,true); } }
    const dx=P.pos.x-v.pos.x, dz=P.pos.z-v.pos.z, d=Math.hypot(dx,dz);
    if(d<GUST_R+.4&&P.alive!==false){ const f=GUST_PUSH*(1-d/(GUST_R+.4))*dt; const nx=d>.05?dx/d:1, nz=d>.05?dz/d:0; G.moveCharacter(P.pos,nx*f,nz*f,.4,'player'); }
  }
}

/* ================================================================ re-baiting underground
   The alchemy table is on the island; down here, when the bait is about to go cold, a bead of ichor from the satchel
   (cave monsters drop it) is smeared straight on the cage, so a long visit (tides, the raft, the Undertow) can't strand
   the swarm. Automatic: it would otherwise fight the jar / the lantern for the one interact button. */
const REBAIT_AT=4, REBAIT_S=120;
function canRebait(){ const L=lantern(), A=G.alchemy;
  return inside()&&isPlay()&&L&&L.found&&!L.inCradle&&G.moths&&G.moths.bait&&A&&A.known&&A.known.has('bait')&&G.inv&&G.inv.count('ichor')>0&&(G.moths.baitLeft||0)>0&&G.moths.baitLeft<REBAIT_AT; }
function updateRebait(){
  if(!canRebait()||!G.inv.take('ichor',1))return;
  G.moths.bait(REBAIT_S);
  if(!S.said.rebait){ S.said.rebait=1; G.ui.say('The bait is going cold. No alchemy table down here — but the bait is only ichor, and you smear a bead of it straight onto the cage. The moths stay.'); }
  else G.ui.toast('Fresh bait on the lantern','1 ichor · '+G.inv.count('ichor')+' left');
}

/* ================================================================ first-time guidance (one line per mechanic) */
G.on('cave:room',e=>{
  const id=e&&e.id, L=lantern(); if(!id||!built)return;
  if(id!=='mouth'&&id!=='arena'&&!S.lit[id]&&S.lit.mouth&&!(G.cave&&G.cave.isLit&&G.cave.isLit(id)))
    say('veinHint',vials()?'Another seam of ether glints in the wall. A vial’s worth would wake it and light this room.':'Another seam of ether glints in the wall, dry and dark. A vial of ether from the alchemy table would wake it.');
  if(id==='channel'&&!S.open.channel)setTimeout(()=>say('raftSeen','A raft is moored at the jetty, and the channel runs away from it to a black plug at the far sluice. A walkway follows the water along the wall above.'),900);
});
function updateGuidance(){
  const P=G.player; if(!P||!P.pos||!API.crates.length)return;
  const r=roomOf(P.pos); if(r!=='stair')return;
  const wl=waterY()-origin().y;
  if(wl>.9&&API.crates[0].pos.distanceTo(P.pos)<9)say('crates','The crates have floated up with the tide. From the landing a jump would reach the first — and from the last, the ledge on the far side.');
  if(G.cave&&G.cave.lowPassageOpen&&G.cave.lowPassageOpen())say('lowPassage','The water has drained out of a low passage under the left-hand wall. It won’t stay drained for long.');
}

/* ================================================================ swarm cling + lifecycle */
function updateCling(){
  const C=CR(); if(!C)return; const L=lantern();
  let r=null;
  if(API.raft.lantern&&L&&!L.carried)r=CLING_RAFT;
  else if(inside()&&L&&L.carried&&L.shut)r=CLING_SHUT;
  C.clingR=r;
}
function build(){
  if(built)return; built=true;
  const steps=[['veins',buildVeins],['seals',()=>{for(const id in SEALS)buildSeal(id);}],['roost',buildRoost],['crates',buildCrates],['raft',buildRaft],['vents',buildVents]];
  for(const [n,f] of steps){ try{f();}catch(e){console.error('cave_puzzles '+n,e);} }
  if(pendingLoad){ const d=pendingLoad; pendingLoad=null; load(d); }
}
G.on('cave:bossDead',()=>{ S.bossDead=true; });
G.on('cave:enter',()=>{ if(!built)build(); });
/* out in the open the cured lantern has no shutter (player.js only offers it before the cure): never carry it out shut,
   or it stays dark, recruits nothing and the swarm drifts off the moment you step onto the sand */
G.on('cave:exit',()=>{ const L=lantern(); if(L&&L.shut){ L.shut=false; G.emit('lantern:shutter',{shut:false,cave:true}); } });

/* ---------------------------------------------------------------- save / load */
function save(){ return {v:1,lit:Object.keys(S.lit).filter(k=>S.lit[k]),open:Object.keys(S.open).filter(k=>S.open[k]),
  prog:Object.fromEntries(Object.entries(S.prog).map(([k,v])=>[k,+(+v).toFixed(3)])),raft:{t:+API.raft.t.toFixed(3),done:S.raftDone,ride:!!API.raft.lantern&&!S.raftDone},
  bossDead:S.bossDead,said:S.said,jar:G.moths&&G.moths.jar?G.moths.jar._save():null}; }
/* saved mid-run (the autosave can fire while the lantern rides the raft): the lantern is back in your hand and the raft at its
   mooring — you set off again from the jetty. (flow.js has already put an uncarried cured lantern back in the lamp's cradle.)
   Older saves have no `ride` flag: a raft saved out in the channel (t > 0, not done) with the lantern not in hand counts too. */
function rescueLantern(d){
  const L=lantern(), r=d.raft||{}; if(!L||L.carried||!L.found||r.done)return;
  const ride=r.ride===true||(r.ride==null&&(+r.t||0)>.02);
  if(ride){ L.carried=true; L.inCradle=false; L.shut=false; }
}
function load(d){
  if(!d)return;
  try{ rescueLantern(d); }catch(e){ console.error('raft rescue',e); }
  if(d.jar&&G.moths&&G.moths.jar)G.moths.jar._load(d.jar);
  if(!built){ pendingLoad=Object.assign({},d,{jar:null}); return; }
  S.bossDead=!!d.bossDead; S.said=Object.assign({},d.said||{});
  for(const id of d.lit||[])lightRoom(id,null,true);
  for(const id of d.open||[])openSeal(id,true);
  for(const id in API.seals){ const s=API.seals[id]; if(!S.open[id])s.progress=Math.max(0,Math.min(.95,(d.prog&&+d.prog[id])||0)); }
  const r=d.raft||{}; API.raft.t=S.open.channel?1:0; API.raft.lantern=false; raftPushV=0; clearRaid();   // a run never resumes mid-channel: the raft is back at its mooring
  API.raft.state=S.open.channel?'done':'idle'; S.raftDone=!!S.open.channel; placeRaft(0);
  const cs=API.seals.channel; if(cs&&!S.open.channel){ cs.credit=cs.progress; cs.fed=new Set(); cs.sated=false; }
}
if(G.persist&&G.persist.register)G.persist.register('cavePuzzles',{save,load});
else G.on('ready',()=>{ if(G.persist&&G.persist.register)G.persist.register('cavePuzzles',{save,load}); });

if(G.debug)API.debug={S,save:()=>save(),load:d=>load(d),build:()=>build(),spendEther,lightRoom:id=>lightRoom(id,null,false),openSeal:id=>openSeal(id,false),
  W,toLocal,roomOf,gust:()=>({clock:gustClock,phase:gustPhase}),setGust:t=>{gustClock=t;},
  spawnRaider:s=>spawnRaider(s==null?1:s),raidWaves:RAID_WAVES,raftCurrent:()=>raftCurrent(0),pushRaft:()=>pushRaft({kind:'bolt'})};

G.system('cavePuzzles',{order:36,modes:'always',
  init(){},
  update(dt){
    if(!built){ if(G.state.mode==='title'&&!(G.cave&&G.cave.rooms))return; build(); }
    if(G.state.mode==='paused')return;
    try{
      updateCling();
      const inC=inside();
      if(inC&&isPlay())updateShutter();
      if(inC)updateRebait();
      updateSeals(dt);
      updateRaft(inC?dt:0);
      if(inC){ updateCrates(dt); updateDrafts(dt); updateRoost(dt); if(isPlay())updateGuidance(); }
      else API.gust.phase='idle';
    }catch(e){ console.error('cavePuzzles',e); }
  }
});
})();
