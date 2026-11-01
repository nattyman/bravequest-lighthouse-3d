/* =====================================================================
   alchemy.js — the core loop's economy (Alchemy agent)
   G.inv (satchel), G.tide, G.alchemy (recipes, the table in the shed),
   foraging (glowcaps, tidal harvest, monster ichor), recipe pages,
   pouring ether into the lamp, the satchel HUD and the loop objective
   chain. Persist key 'alchemy'. Spec: LOOP.md.
   Everything except the glowcap mushrooms is dormant until 'loop:start'.
   ===================================================================== */
(function(){
'use strict';
const G=window.G, THREE=G.THREE, U=G.U;
const {clamp,lerp,smooth}=U;
const PI=Math.PI, TAU=PI*2;
const V=(x,y,z)=>new THREE.Vector3(x,y,z);
const LM=()=>G.world.landmarks||{};
const col=hex=>U.col(hex);
const H=(x,z)=>G.world.height(x,z);
const looping=()=>!!(G.loop&&G.loop.active);

/* =====================================================================
   1. SATCHEL — G.inv
   ===================================================================== */
const ITEMS={
  glowcap:{name:'Glowcap',plural:'Glowcaps',desc:'A violet mushroom that glows the colour of the lamp. Weak, but common.'},
  kelp:{name:'Glowkelp',plural:'Glowkelp',desc:'Bioluminescent kelp, only uncovered at low tide.'},
  brine:{name:'Brine Crystal',plural:'Brine Crystals',desc:'Pale salt that grows on the wet sand when the sea draws back.'},
  pearl:{name:'Tide Pearl',plural:'Tide Pearls',desc:'The pearl-organ of something washed up. Rare.'},
  ichor:{name:'Ichor',plural:'Ichor',desc:'Black and glossy. What is left of a corrupted thing. It is still warm.'},
  vial:{name:'Ether Vial',plural:'Ether Vials',desc:'Refined ether, ready for the lamp.'}
};
const ORDER=['glowcap','kelp','brine','pearl','ichor','vial'];
const counts={};
let lastBigToast=-99;
function pickupToast(id,n){
  if(G.time-lastBigToast<2.6)return; // never step on an important toast
  const it=ITEMS[id]; if(!it)return;
  G.ui.toast('+'+n+' '+(n>1?it.plural:it.name));
}
function bigToast(t,s){ lastBigToast=G.time; G.ui.toast(t,s); }
G.inv={
  ITEMS,
  count(id){ return counts[id]|0; },
  has(id,n=1){ return (counts[id]|0)>=n; },
  add(id,n=1,o={}){
    if(!n)return this.count(id);
    counts[id]=Math.max(0,(counts[id]|0)+n);
    G.emit('inv:change',{id,n,total:counts[id]});
    if(n>0&&!o.silent)pickupToast(id,n);
    return counts[id];
  },
  take(id,n=1){
    if((counts[id]|0)<n)return false;
    counts[id]-=n; if(id==='vial'&&!counts[id])A.etherUnits=0;
    G.emit('inv:change',{id,n:-n,total:counts[id]});
    return true;
  },
  list(){ return ORDER.concat(Object.keys(counts).filter(k=>!ORDER.includes(k))).filter(k=>counts[k]>0).map(id=>({id,n:counts[id],name:(ITEMS[id]||{name:id}).name})); }
};

/* =====================================================================
   2. RECIPES + G.alchemy
   ===================================================================== */
const RECIPES={
  tincture:{id:'tincture',name:'Glowcap Tincture',needs:{glowcap:3},units:5,
    note:'Three caps crushed and steeped. A weak dose, but it keeps the lamp fed.',from:'the keeper’s logbook'},
  tidewater:{id:'tidewater',name:'Tidewater Ether',needs:{glowcap:2,kelp:2,brine:1},units:18,
    note:'The sea keeps its own light. Bind it with salt and steep it with glowcaps.',from:'a page in the wrecked boat'},
  ichor:{id:'ichor',name:'Ichor Distillate',needs:{ichor:2,glowcap:1},units:12,
    note:'Refining life back out of the things that stole it.',from:'a page in the hamlet ruins'},
  pearl:{id:'pearl',name:'Pearl Ether',needs:{pearl:1,kelp:2,brine:1},units:30,
    note:'One pearl, dissolved slowly. The strongest light the keeper ever made.',from:'the tide pool'},
  bait:{id:'bait',name:'Moth Bait',needs:{ichor:1},bait:120,
    note:'A smear of ichor on the lantern glass. The moths will come to it.',from:'watching the moths'}
};
const RORDER=['tincture','tidewater','ichor','pearl','bait'];
const A=G.alchemy={
  ownsMushrooms:true,         // flow.js defers mushroom healing to us
  recipes:RECIPES,
  known:new Set(),
  etherUnits:0,               // total ether units held in vials (G.inv 'vial' = number of vials)
  poured:0,                   // total ever poured
  learn(id,o={}){
    if(!RECIPES[id]||A.known.has(id))return false;
    A.known.add(id);
    G.emit('recipe:learned',{id});
    if(!o.silent){
      bigToast('Recipe learned',RECIPES[id].name);
      if(id!=='tincture')override('New recipe: '+RECIPES[id].name+' — brew it at the alchemy table',shedPos(),'Alchemy table',22);
    }
    refreshPanel();
    return true;
  },
  canBrew(id){ const r=RECIPES[id]; if(!r||!A.known.has(id))return false; for(const k in r.needs)if(!G.inv.has(k,r.needs[k]))return false; return true; },
  brew(id,o={}){ return brew(id,o); },
  pour(){ return pour(); },
  openTable(){ openPanel(); },
  closeTable(){ closePanel(); },
  addMushroomSpot(pos,o){ return addSpot(pos,o); },
  get spots(){ return spots; },
  get harvest(){ return drops.filter(d=>d.tidal); },
  get drops(){ return drops; },
  pages:null,
  table:null
};

/* =====================================================================
   3. SHARED LITTLE VISUALS (glow sprites, a sparkle pool)
   ===================================================================== */
const root=new THREE.Group(); root.name='alchemy';
const glowMats={};
function glow(hex,scale,op=.7){
  const k=hex+op; const m=glowMats[k]||(glowMats[k]=new THREE.SpriteMaterial({map:G.tex.soft,color:col(hex),transparent:true,opacity:op,depthWrite:false,blending:THREE.AdditiveBlending}));
  const s=new THREE.Sprite(m); s.scale.set(scale,scale,1); return s;
}
/* sparkles: one Points object, additive; colour fades to black = fades out */
const SPN=220; let spPts=null, spGeo=null; const spPos=new Float32Array(SPN*3), spCol=new Float32Array(SPN*3), spVel=new Float32Array(SPN*3), spLife=new Float32Array(SPN), spMax=new Float32Array(SPN), spBase=new Float32Array(SPN*3); let spNext=0;
function buildSparkles(){
  spGeo=new THREE.BufferGeometry();
  spGeo.setAttribute('position',new THREE.BufferAttribute(spPos,3));
  spGeo.setAttribute('color',new THREE.BufferAttribute(spCol,3));
  spPts=new THREE.Points(spGeo,new THREE.PointsMaterial({size:.22,map:G.tex.flame,vertexColors:true,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,sizeAttenuation:true,fog:true}));
  spPts.frustumCulled=false; spPts.renderOrder=4; root.add(spPts);
}
const _sc=new THREE.Color();
function sparkle(p,hex='#b48cff',n=18,o={}){
  _sc.copy(col(hex)).multiplyScalar(o.bright||1.6);
  const sp=o.speed||1.6, up=o.up==null?1.4:o.up;
  for(let k=0;k<n;k++){ const i=spNext; spNext=(spNext+1)%SPN;
    const a=Math.random()*TAU, r=Math.random()*(o.radius||.3);
    spPos[i*3]=p.x+Math.cos(a)*r; spPos[i*3+1]=p.y+(o.y||.3)+Math.random()*.2; spPos[i*3+2]=p.z+Math.sin(a)*r;
    const s=sp*(.3+Math.random()*.7);
    spVel[i*3]=Math.cos(a)*s*.6; spVel[i*3+1]=up*(.5+Math.random()); spVel[i*3+2]=Math.sin(a)*s*.6;
    spMax[i]=spLife[i]=(o.life||.9)*(.6+Math.random()*.7);
    spBase[i*3]=_sc.r; spBase[i*3+1]=_sc.g; spBase[i*3+2]=_sc.b; }
}
function stepSparkles(dt){
  if(!spGeo)return; let any=false;
  for(let i=0;i<SPN;i++){
    if(spLife[i]<=0){ if(spCol[i*3]||spCol[i*3+1]||spCol[i*3+2]){spCol[i*3]=spCol[i*3+1]=spCol[i*3+2]=0;any=true;} continue; }
    any=true; spLife[i]-=dt; const t=clamp(spLife[i]/spMax[i],0,1), k=Math.exp(-1.6*dt);
    spVel[i*3]*=k; spVel[i*3+2]*=k; spVel[i*3+1]=spVel[i*3+1]*k-.6*dt;
    spPos[i*3]+=spVel[i*3]*dt; spPos[i*3+1]+=spVel[i*3+1]*dt; spPos[i*3+2]+=spVel[i*3+2]*dt;
    const f=t*t*(1.6+Math.sin((spMax[i]-spLife[i])*28+i)*.4)*.7;
    spCol[i*3]=spBase[i*3]*f; spCol[i*3+1]=spBase[i*3+1]*f; spCol[i*3+2]=spBase[i*3+2]*f;
  }
  if(any){spGeo.attributes.position.needsUpdate=true; spGeo.attributes.color.needsUpdate=true;}
}

/* small geometry helper: merge non-indexed copies of geometries (position+normal) */
function merge(geos){
  const parts=geos.map(g=>g.index?g.toNonIndexed():g); let n=0; parts.forEach(g=>n+=g.attributes.position.count);
  const pos=new Float32Array(n*3), nor=new Float32Array(n*3); let o=0;
  for(const g of parts){ if(!g.attributes.normal)g.computeVertexNormals(); pos.set(g.attributes.position.array,o*3); nor.set(g.attributes.normal.array,o*3); o+=g.attributes.position.count; }
  const out=new THREE.BufferGeometry(); out.setAttribute('position',new THREE.BufferAttribute(pos,3)); out.setAttribute('normal',new THREE.BufferAttribute(nor,3)); out.computeBoundingSphere(); return out;
}

/* =====================================================================
   4. PICKUPS: tidal harvest, ichor, pearls (walk into them)
   ===================================================================== */
const drops=[]; // {id,n,mesh,pos,life,tidal,t,state,bob}
let GEO=null, MAT=null;
function buildPickupAssets(){
  GEO={}; MAT={};
  // glowkelp: three ribbon-strands lying on the sand, tips curling up
  const strands=[];
  for(let s=0;s<3;s++){ const a=s*2.1+.3, L=.9+s*.18, pts=[];
    for(let k=0;k<=6;k++){ const t=k/6; pts.push(V(Math.cos(a)*L*t+Math.sin(t*5+s)*.08,.03+Math.pow(t,3)*(.28+s*.06),Math.sin(a)*L*t+Math.cos(t*4+s)*.08)); }
    strands.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),14,.035-s*.004,5,false));
    for(const k of [.35,.6,.85]){ const b=new THREE.SphereGeometry(.05,6,4); const p=new THREE.CatmullRomCurve3(pts).getPoint(k); b.translate(p.x,p.y+.02,p.z); strands.push(b); } }
  GEO.kelp=merge(strands);
  MAT.kelp=new THREE.MeshBasicMaterial({color:new THREE.Color(.25,1.35,1.15),fog:true});
  // brine: a cluster of pale crystals
  const cr=[]; const cs=[[0,0,0,.16,.42,0,0],[.14,0,.06,.1,.28,.4,.3],[-.12,0,.05,.09,.24,-.5,.2],[.02,0,-.13,.08,.2,.2,-.5]];
  for(const [x,y,z,r,h,rz,rx] of cs){ const g=new THREE.OctahedronGeometry(r,0); g.scale(1,h/r,1); g.rotateZ(rz); g.rotateX(rx); g.translate(x,y+h*.45,z); cr.push(g); }
  GEO.brine=merge(cr);
  MAT.brine=G.toon('#e6eef5',{emissive:'#9fb6d8',emissiveIntensity:.55});
  // pearl in an opened shell
  GEO.pearl=new THREE.SphereGeometry(.11,14,10);
  MAT.pearl=new THREE.MeshBasicMaterial({color:new THREE.Color(1.55,1.3,1.45),fog:true});
  const sh=new THREE.SphereGeometry(.24,12,6,0,TAU,0,PI/2); sh.scale(1,.35,1);
  GEO.shell=sh; MAT.shell=G.toon('#5a4a5c',{side:THREE.DoubleSide});
  // ichor: a glossy black teardrop
  const d=new THREE.SphereGeometry(.15,14,12); const P=d.attributes.position;
  for(let i=0;i<P.count;i++){ const y=P.getY(i)/.15, k=y>0?Math.pow(1-y,.75)*.9+.1:1; P.setXYZ(i,P.getX(i)*k,P.getY(i)*(y>0?1.55:1),P.getZ(i)*k); }
  d.computeVertexNormals(); d.translate(0,.15,0); GEO.ichor=d;
  MAT.ichor=new THREE.MeshPhongMaterial({color:col('#09070c'),specular:col('#cdb0ff'),shininess:110,emissive:col('#1a0d2a'),emissiveIntensity:.6});
}
function makeDropMesh(id){
  const g=new THREE.Group();
  if(id==='kelp'){ const m=new THREE.Mesh(GEO.kelp,MAT.kelp); m.rotation.y=Math.random()*TAU; g.add(m); const s=glow('#4fe0d0',1.5,.55); s.position.y=.2; g.add(s); }
  else if(id==='brine'){ const m=new THREE.Mesh(GEO.brine,MAT.brine); m.rotation.y=Math.random()*TAU; m.castShadow=true; g.add(m); G.outline(m,{thickness:.012}); const s=glow('#cfe0ff',.9,.45); s.position.y=.25; g.add(s); }
  else if(id==='pearl'){ const sh=new THREE.Mesh(GEO.shell,MAT.shell); sh.rotation.x=PI; sh.position.y=.08; g.add(sh); const sh2=new THREE.Mesh(GEO.shell,MAT.shell); sh2.position.set(0,.09,-.2); sh2.rotation.x=-1.1; g.add(sh2);
    const p=new THREE.Mesh(GEO.pearl,MAT.pearl); p.position.y=.16; g.add(p); const s=glow('#ffd8ee',1.1,.6); s.position.y=.2; g.add(s); }
  else if(id==='ichor'){ const m=new THREE.Mesh(GEO.ichor,MAT.ichor); g.add(m); G.outline(m,{thickness:.012,color:'#4a2a7a'}); const s=glow('#7a4ad8',.8,.35); s.position.y=.12; g.add(s); }
  return g;
}
function spawnDrop(id,pos,o={}){
  const mesh=makeDropMesh(id); mesh.position.copy(pos); root.add(mesh);
  const d={id,n:o.n||1,mesh,pos:mesh.position,life:o.life==null?1e9:o.life,tidal:!!o.tidal,t:0,state:'in',vy:o.vy||0,bob:Math.random()*TAU,grav:!!o.grav,delay:o.delay||0};
  mesh.scale.setScalar(.01); drops.push(d); return d;
}
function removeDrop(d){ root.remove(d.mesh); const i=drops.indexOf(d); if(i>=0)drops.splice(i,1); }
function updateDrops(dt,play){
  const P=G.player;
  for(let i=drops.length-1;i>=0;i--){
    const d=drops[i]; d.t+=dt;
    if(d.grav){ d.vy-=14*dt; d.pos.y+=d.vy*dt; if(d.vx){ d.pos.x+=d.vx*dt; d.pos.z+=d.vz*dt; } const f=G.floorAt(d.pos.x,d.pos.z,d.pos.y+.5); if(d.pos.y<f){d.pos.y=f;d.vy=0;d.grav=false;} }
    // appear / wash away
    if(d.state==='in'){ const s=smooth(0,.5,d.t); d.mesh.scale.setScalar(Math.max(.01,s)); if(d.t>.5)d.state='live'; }
    else if(d.state==='out'){ d.out=(d.out||0)+dt; const k=1-d.out/(d.tidal?2.5:1.2); d.mesh.scale.setScalar(Math.max(.01,k)); d.pos.y-=dt*(d.tidal?.15:.05); if(k<=0){removeDrop(d);continue;} }
    if(d.id==='ichor'){ const c=d.mesh.children[0]; if(c){c.scale.set(1+Math.sin(d.t*3+d.bob)*.06,1-Math.sin(d.t*3+d.bob)*.06,1+Math.sin(d.t*3+d.bob)*.06);} }
    if(!play)continue;
    d.life-=dt;
    if(d.life<=0&&d.state!=='out'){ d.state='out'; d.out=0; continue; }
    if(d.state==='out'||!P||!P.pos||!P.alive||d.t<.35)continue;
    const dx=d.pos.x-P.pos.x, dz=d.pos.z-P.pos.z;
    if(dx*dx+dz*dz<1.35*1.35&&Math.abs(d.pos.y-P.pos.y)<2){ collect(d); removeDrop(d); }
  }
}
function collect(d){
  const hex={kelp:'#5fe8d8',brine:'#e0ecff',pearl:'#ffe0f2',ichor:'#8a5cff'}[d.id]||'#b48cff';
  sparkle(d.pos,hex,d.id==='ichor'?10:16,{radius:.3});
  G.inv.add(d.id,d.n);
  G.emit('pickup',{kind:d.id});
  if(d.id==='ichor'&&!S.firsts.ichor){ S.firsts.ichor=1; G.ui.say('The droplet is warm, and it clings to your fingers. Whatever this was, some of it is still alive in there.'); }
  if((d.id==='kelp'||d.id==='brine')&&!S.firsts.tidal){ S.firsts.tidal=1; G.ui.say('Cold, wet light. The sea has its own ether, it seems, and leaves a little behind when it goes out.'); }
  if(d.id==='pearl'&&!A.known.has('pearl')){ A.learn('pearl'); G.ui.say('The pearl is heavy for its size and faintly warm. In the logbook margin, half-remembered: one pearl, dissolved slowly, the strongest light there is.'); }
}

/* =====================================================================
   5. GLOWCAP MUSHROOMS (the 14 world clusters + any added later)
   ===================================================================== */
const REGROW=240;
const spots=[]; // {pos,mesh,regrow,base,added}
function initSpots(){
  const list=LM().mushrooms||[], meshes=G.world.mushroomMeshes||[];
  list.forEach((m,i)=>spots.push({pos:V(m.x,m.y,m.z),mesh:meshes[i]||null,regrow:0,base:true}));
}
function addSpot(pos,o={}){
  const y=G.floorAt(pos.x,pos.z);
  let mesh=null; const src=(G.world.mushroomMeshes||[])[spots.length%14]||(G.world.mushroomMeshes||[])[0];
  if(src){ mesh=src.clone(); mesh.position.set(pos.x,y,pos.z); mesh.rotation.y=Math.random()*TAU; mesh.visible=true; root.add(mesh); }
  const s={pos:V(pos.x,y,pos.z),mesh,regrow:0,base:false,tag:o.tag||''}; spots.push(s); return s;
}
function updateSpots(dt){
  const P=G.player; if(!P||!P.pos)return;
  for(const s of spots){
    if(s.regrow>0){ s.regrow-=dt; if(s.regrow<=0){ s.regrow=0; if(s.mesh){s.mesh.visible=true; s.mesh.scale.setScalar(.2); s.grow=0;} } continue; }
    if(s.mesh&&s.grow!=null){ s.grow+=dt; s.mesh.scale.setScalar(Math.min(1,.2+s.grow*.8)); if(s.grow>1){s.mesh.scale.setScalar(1); s.grow=null;} }
    if(!P.alive)continue;
    const dx=s.pos.x-P.pos.x, dz=s.pos.z-P.pos.z;
    if(dx*dx+dz*dz<1.5*1.5&&Math.abs(s.pos.y-P.pos.y)<2)pickSpot(s);
  }
}
function pickSpot(s){
  const P=G.player; const n=2+(Math.random()<.5?1:0);
  s.regrow=REGROW; if(s.mesh)s.mesh.visible=false;
  sparkle(s.pos,'#b07cff',22,{radius:.6,y:.25});
  if(P.hp<P.maxHp)P.heal(2);
  G.inv.add('glowcap',n);
  G.emit('pickup',{kind:'mushroom'});
  if(!G.flag('ateShroom')){ G.flag('ateShroom',true); G.ui.say('The mushrooms glow the same violet as the lantern. You tuck the caps into your satchel, and eating one, you feel steadier, as if something gave you back a little of yourself.'); }
}

/* =====================================================================
   6. THE TIDE — G.tide (+ the small hook in world.js: G.world.tide)
   ===================================================================== */
const TIDE={period:300,drop:1.2,amp:1.343};
const T=G.tide={level:1,low:false,phase:0,nextLowIn:TIDE.period*.375,t:0,offset:0};
const levelAt=t=>clamp(TIDE.amp*Math.cos(TAU*t/TIDE.period),-1,1);
const LOWV=-.95;
function updateTide(dt){
  const prevLevel=T.level;
  T.t=(T.t+dt)%(TIDE.period*1000);
  T.phase=(T.t%TIDE.period)/TIDE.period;
  T.level=levelAt(T.t);
  T.rising=T.level>prevLevel;
  T.offset=(T.level-1)/2*TIDE.drop;
  G.world.tide=T.offset; G.world.seaLevel=T.offset;
  // seconds to the next low window (low when |t-150| < ~37.5)
  const ph=T.t%TIDE.period;
  const half=Math.acos(-LOWV/TIDE.amp)/TAU*TIDE.period; // ~37.5 s either side of mid-period
  const ls=TIDE.period/2-half;
  T.nextLowIn=T.level<=LOWV?0:(ph<ls?ls-ph:TIDE.period-ph+ls);
  T.lowLeft=T.level<=LOWV?Math.max(0,TIDE.period/2+half-ph):0;
  const low=T.level<=LOWV;
  if(low!==T.low){ T.low=low; if(low)onLowTide(); else onHighTide(); }
}
function setTideTime(t){ T.t=t; T.low=levelAt(t)<=LOWV; updateTide(0); if(T.low&&!drops.some(d=>d.tidal))spawnHarvest(); }
let lowCount=0;
function beachZ(x,hTarget){ for(let z=40;z<112;z+=.5){ if(H(x,z)<hTarget)return z; } return null; }
function spawnHarvest(){
  lowCount++;
  const r=U.rng(9001+lowCount*7919), placed=[];
  const N=13;
  for(let k=0,tries=0;k<N&&tries<80;tries++){
    const x=-52+r()*134;
    const z1=beachZ(x,-.3), z2=beachZ(x,-1.0); if(z1==null||z2==null||z2-z1>14)continue;
    const z=lerp(z1,z2,.15+r()*.75), h=H(x,z);
    if(h<-1.1||h>-.2||!G.world.walkable(x,z))continue;
    if(placed.some(p=>Math.hypot(p.x-x,p.z-z)<5))continue;
    placed.push({x,z});
    const id=k%5===2||k%5===4?'brine':'kelp';
    spawnDrop(id,V(x,h,z),{tidal:true});
    k++;
  }
  // pearls at the cured Black Tide Pool
  if(S.tidepool){
    const b=blight('tidepool'), c=b?b.pos:V(30,0,75);
    for(let k=0;k<2;k++){ const a=r()*TAU, d=2.5+r()*3, x=c.x+Math.cos(a)*d, z=c.z+Math.sin(a)*d;
      spawnDrop('pearl',V(x,G.floorAt(x,z),z),{tidal:true}); }
  }
}
function onLowTide(){
  if(!looping())return;
  spawnHarvest();
  G.emit('tide:low',{});
  if(!S.firsts.lowtide){ S.firsts.lowtide=1; G.ui.say('The sea draws back… something glows on the wet sand.'); override('Low tide — something glows on the south beach',beachPos(),'South beach',30); }
  else{ bigToast('Low tide','The south beach is uncovered'); override('Low tide — the south beach is uncovered',beachPos(),'South beach',18); }
}
function onHighTide(){
  for(const d of drops) if(d.tidal&&d.state!=='out'){ d.state='out'; d.out=0; }
  if(!looping())return;
  G.emit('tide:high',{});
  const P=G.player; if(P&&P.pos&&P.pos.z>50&&P.pos.y<12)G.ui.toast('The tide turns','What it uncovered washes away');
}
/* the returning sea gently walks the player up the beach instead of drowning them */
function tideRescue(dt){
  const P=G.player; if(!P||!P.pos||!P.alive||!T.rising||T.offset>-.02)return;
  const h=H(P.pos.x,P.pos.z); if(h>-1.2+T.offset+.4||P.pos.y>h+.3)return;
  const gx=H(P.pos.x+1,P.pos.z)-H(P.pos.x-1,P.pos.z), gz=H(P.pos.x,P.pos.z+1)-H(P.pos.x,P.pos.z-1), L=Math.hypot(gx,gz)||1;
  G.moveCharacter(P.pos,gx/L*2.6*dt,gz/L*2.6*dt,.4,'player');
  if(!S.firsts.wade){ S.firsts.wade=1; G.ui.toast('The tide is coming in'); }
}

/* =====================================================================
   7. RECIPE PAGES + THE WRECKED BOAT
   ===================================================================== */
let pageTex=null, pageMat=null;
const pages=A.pages=[]; // {id,pos,mesh,found}
function makePageTex(){
  return G.canvasTex(128,(g,s)=>{
    g.fillStyle='#e8dcc0'; g.fillRect(0,0,s,s);
    const gr=g.createRadialGradient(s/2,s/2,s*.2,s/2,s/2,s*.75); gr.addColorStop(0,'rgba(0,0,0,0)'); gr.addColorStop(1,'rgba(90,60,30,.45)'); g.fillStyle=gr; g.fillRect(0,0,s,s);
    g.strokeStyle='rgba(50,30,40,.75)'; g.lineWidth=2;
    for(let y=22;y<s-14;y+=11){ g.beginPath(); let x=14; g.moveTo(x,y); while(x<s-16){ x+=4+Math.random()*7; g.lineTo(x,y+(Math.random()-.5)*2.5); } g.stroke(); }
    g.strokeStyle='rgba(110,70,190,.9)'; g.lineWidth=3; g.beginPath(); g.arc(s*.72,s*.7,12,0,TAU); g.stroke(); g.beginPath(); g.moveTo(s*.72,s*.7-12); g.lineTo(s*.72,s*.7-24); g.stroke();
    // torn edge
    g.fillStyle='rgba(0,0,0,1)'; g.globalCompositeOperation='destination-out'; g.beginPath(); g.moveTo(s,0);
    for(let y=0;y<=s;y+=8)g.lineTo(s-4-Math.random()*9,y); g.lineTo(s,s); g.fill(); g.globalCompositeOperation='source-over';
  });
}
function makePage(id,pos,yaw,tilt){
  if(!pageMat){ pageTex=makePageTex(); pageMat=G.toon('#ffffff',{map:pageTex,side:THREE.DoubleSide,transparent:true,alphaTest:.5,emissive:'#3a2a18',emissiveIntensity:.35}); }
  const grp=new THREE.Group(); grp.position.copy(pos);
  const m=new THREE.Mesh(new THREE.PlaneGeometry(.46,.6),pageMat); m.rotation.set(-PI/2+(tilt||.15),0,yaw||0); m.position.y=.05; m.castShadow=true; grp.add(m);
  const s=glow('#ffcf8a',1.6,.5); s.position.y=.35; grp.add(s); const s2=glow('#b48cff',.9,.45); s2.position.y=.2; grp.add(s2);
  grp.visible=false; root.add(grp);
  const p={id,pos:pos.clone(),mesh:grp,found:false};
  pages.push(p);
  G.interact.add({pos:()=>p.pos,radius:2.3,priority:3,label:'Pick up the torn page',
    enabled:()=>looping()&&!p.found&&!A.known.has(id),use(){ takePage(p); }});
  return p;
}
function takePage(p){
  p.found=true; p.mesh.visible=false; sparkle(p.pos,'#ffd59a',20,{radius:.4});
  const r=RECIPES[p.id];
  const lines={tidewater:'A water-stained page, folded into the boat’s seat: “Tidewater Ether. Two glowcaps, two of the glowing kelp, one brine crystal. The sea keeps its own light. Only at low water.”',
    ichor:'A page pinned under a stone, in the keeper’s hand but shakier: “Ichor Distillate. Two of the black ichor, one glowcap to wake it. It feels like stealing back. I suppose it is.”'};
  G.ui.say(lines[p.id]||('A torn page: '+r.name+'.'));
  A.learn(p.id);
}
function buildBoat(){
  // a small broken rowboat, heeled over in the sand above the waterline
  const x=-8, zDry=beachZ(x,.55)||74, z=zDry-1.2, y=H(x,z);
  const grp=new THREE.Group(); grp.position.set(x,y-.12,z); grp.rotation.set(0,.6,.42); root.add(grp);
  const wood=G.toon('#7a5638',{side:THREE.DoubleSide}), dark=G.toon('#4e3626'), paint=G.toon('#5a6f78');
  const L=3.6, hull=new THREE.CylinderGeometry(.78,.78,L,14,12,true,PI,PI); hull.rotateZ(PI/2);
  const P=hull.attributes.position;
  for(let i=0;i<P.count;i++){ const hx=P.getX(i), t=hx/(L/2), w=Math.max(.04,1-Math.pow(Math.abs(t),2.4));
    P.setXYZ(i,hx,P.getY(i)*.62*(1-.25*t*t)+.18*t*t,P.getZ(i)*w); }
  hull.computeVertexNormals();
  const hm=new THREE.Mesh(hull,wood); hm.castShadow=true; hm.receiveShadow=true; hm.position.y=.48; grp.add(hm); G.outline(hm,{thickness:.025});
  // gunwale stripe, thwart (seat), a missing-plank hole shown as a dark patch, a snapped oar
  const seat=new THREE.Mesh(new THREE.BoxGeometry(.18,.06,1.2),dark); seat.position.set(.2,.32,0); grp.add(seat);
  const seat2=new THREE.Mesh(new THREE.BoxGeometry(.16,.06,1.0),dark); seat2.position.set(-.9,.36,0); seat2.rotation.y=.25; grp.add(seat2);
  const hole=new THREE.Mesh(new THREE.PlaneGeometry(.7,.28),new THREE.MeshBasicMaterial({color:col('#140e12'),side:THREE.DoubleSide,fog:true}));
  hole.position.set(.55,.12,.66); hole.rotation.set(-.35,0,.08); grp.add(hole);
  const rib=new THREE.BoxGeometry(.06,.05,1.4); for(const rx of [-1.2,-.4,.9]){ const m=new THREE.Mesh(rib,dark); m.position.set(rx,.08,0); grp.add(m); }
  const stripe=new THREE.Mesh(new THREE.TorusGeometry(1,.03,4,24,PI),paint); stripe.scale.set(1.75,.4,.72); stripe.rotation.x=PI/2; stripe.position.y=.46; grp.add(stripe);
  const oar=new THREE.Group(); oar.position.set(x+1.6,H(x+1.6,z+1.4)+.05,z+1.4); oar.rotation.set(0,1.1,.05); root.add(oar);
  const shaft=new THREE.Mesh(new THREE.CylinderGeometry(.035,.035,1.5,5),wood); shaft.rotation.z=PI/2; oar.add(shaft);
  const blade=new THREE.Mesh(new THREE.BoxGeometry(.5,.03,.16),wood); blade.position.x=.9; oar.add(blade);
  const plank=new THREE.Mesh(new THREE.BoxGeometry(1.4,.05,.18),wood); plank.position.set(x-2,H(x-2,z+.8)+.04,z+.8); plank.rotation.y=-.4; root.add(plank);
  G.addCollider({x,z,r:1.2,y0:y-2,y1:y+1.2});
  A.boat={x,y,z};
  // the page lies tucked against the seat, on the beach side
  const pz=z-1.25, px=x+.5; makePage('tidewater',V(px,H(px,pz)+.02,pz),.4,.35);
}
function buildHamletPage(){
  const x=-25.5, z=35.2;
  const y=G.floorAt(x,z);
  const p=makePage('ichor',V(x,y+.02,z),-.6,.1);
  const stone=new THREE.Mesh(new THREE.DodecahedronGeometry(.13,0),G.toon('#7f7a72')); stone.position.set(x+.08,y+.11,z-.06); stone.scale.set(1,.6,1); root.add(stone);
  return p;
}

/* =====================================================================
   8. THE ALCHEMY TABLE (dresses the shed's outdoor bench, world.js)
   ===================================================================== */
let table=null; // {grp, burner, flame, glowS, liquid, bubbles, world:Vector3}
let brewT=0, brewGlow=0;
function buildTable(){
  const S0=LM().shed||{x:150,y:42,z:33};
  const grp=new THREE.Group(); grp.position.set(S0.x,S0.y,S0.z); grp.rotation.y=.15; root.add(grp);
  const bench=new THREE.Group(); bench.position.set(2.9,1.01,-.6); grp.add(bench); // top of the bench world.js builds
  const glass=new THREE.MeshToonMaterial({color:col('#b9d6d0'),gradientMap:G.gradientMap,transparent:true,opacity:.55,depthWrite:false});
  const brass=G.toon('#b08a3e'), iron=G.toon('#2c2628'), stone=G.toon('#8a847a'), wood=G.toon('#5e4330');
  const liquid=new THREE.MeshBasicMaterial({color:new THREE.Color(1.0,.5,2.2),fog:true});
  const add=(geo,mat,x,y,z,o)=>{ const m=new THREE.Mesh(geo,mat); m.position.set(x,y,z); if(o)o(m); bench.add(m); return m; };
  // burner (iron cup on brass feet) with a violet flame
  add(new THREE.CylinderGeometry(.09,.11,.12,10),iron,-.05,.06,0,m=>G.outline(m,{thickness:.01}));
  for(let k=0;k<3;k++){ const a=k/3*TAU; add(new THREE.CylinderGeometry(.012,.012,.42,4),brass,-.05+Math.cos(a)*.16,.21,Math.sin(a)*.16,m=>{m.rotation.z=Math.cos(a)*.18;m.rotation.x=-Math.sin(a)*.18;}); }
  add(new THREE.TorusGeometry(.15,.012,4,16),brass,-.05,.4,0,m=>m.rotation.x=PI/2);
  const flame=glow('#b07cff',.34,.95); flame.position.set(-.05,.2,0); bench.add(flame);
  const flame2=glow('#e6d4ff',.16,1); flame2.position.set(-.05,.17,0); bench.add(flame2);
  // retort: round flask on the ring, long neck out to a receiving flask
  const bulb=add(new THREE.SphereGeometry(.13,14,10),glass,-.05,.53,0);
  const inside=add(new THREE.SphereGeometry(.105,12,8,0,TAU,PI*.45,PI*.55),liquid,-.05,.53,0);
  const neck=add(new THREE.CylinderGeometry(.018,.035,.62,6),glass,.2,.66,0,m=>{m.rotation.z=-1.15;});
  const recv=add(new THREE.SphereGeometry(.08,12,8),glass,.5,.1,0);
  add(new THREE.SphereGeometry(.065,10,6,0,TAU,PI*.5,PI*.5),liquid,.5,.1,0);
  add(new THREE.CylinderGeometry(.022,.022,.1,6),glass,.5,.2,0);
  // a stoppered vial rack, mortar & pestle, a scrap of paper, a glowcap or two
  add(new THREE.BoxGeometry(.36,.05,.12),wood,-.55,.025,-.15);
  for(let k=0;k<3;k++){ add(new THREE.CylinderGeometry(.028,.028,.16,8),glass,-.67+k*.12,.12,-.15);
    if(k<2)add(new THREE.CylinderGeometry(.024,.024,.08,8),liquid,-.67+k*.12,.08,-.15); add(new THREE.CylinderGeometry(.02,.022,.03,6),wood,-.67+k*.12,.215,-.15); }
  const mortar=new THREE.LatheGeometry([new THREE.Vector2(.0,0),new THREE.Vector2(.1,0),new THREE.Vector2(.12,.06),new THREE.Vector2(.11,.11),new THREE.Vector2(.085,.1),new THREE.Vector2(.07,.03),new THREE.Vector2(0,.03)],12);
  add(mortar,stone,-.55,0,.17,m=>G.outline(m,{thickness:.008}));
  add(new THREE.CylinderGeometry(.018,.026,.22,6),stone,-.51,.13,.17,m=>{m.rotation.z=-.5;});
  add(new THREE.PlaneGeometry(.26,.2),G.toon('#e6dbc0',{side:THREE.DoubleSide}),.42,.004,.2,m=>{m.rotation.x=-PI/2;m.rotation.z=.3;});
  const cap=src=>{ const g=(G.world.mushroomMeshes||[])[src]; if(!g)return; const c=g.clone(); c.scale.setScalar(.35); c.position.set(-.85+src*.06,0,.18); bench.add(c); };
  cap(2); cap(5);
  const g1=glow('#a070ff',1.6,.25); g1.position.set(-.05,.45,0); bench.add(g1);
  // bubbles inside the bulb
  const bubbles=[]; for(let k=0;k<5;k++){ const b=glow('#e4d0ff',.05,.9); b.position.set(-.05,.5,0); b.userData.ph=k/5; bench.add(b); bubbles.push(b); }
  bench.updateMatrixWorld(true);
  const world=new THREE.Vector3(); bench.getWorldPosition(world);
  table={grp,bench,flame,flame2,g1,liquid,bubbles,bulb,world:V(world.x,S0.y,world.z)};
  A.table=table;
  G.interact.add({pos:()=>table.world,radius:2.8,priority:2,label:'Work the alchemy table',
    enabled:()=>looping(),use(){ openPanel(); }});
}
function animTable(dt){
  if(!table)return;
  const t=G.time, on=looping()?1:0;
  brewGlow=U.damp(brewGlow,brewT>0?1:0,4,dt);
  const k=(on*.75+brewGlow*.9)*(.85+Math.sin(t*9)*.08+Math.sin(t*23)*.05);
  table.flame.visible=table.flame2.visible=on>0;
  table.flame.scale.set(.3+k*.18,.36+k*.3,1); table.flame.material.opacity=.95;
  table.g1.material.opacity=.18+brewGlow*.45; table.g1.scale.setScalar(1.4+brewGlow*1.2);
  const lp=.8+brewGlow*1.2+Math.sin(t*2.2)*.12; table.liquid.color.setRGB(.5*lp,.25*lp,1.15*lp);
  for(const b of table.bubbles){ const ph=(t*(.6+brewGlow*1.6)+b.userData.ph)%1; b.visible=on>0; b.position.set(-.05+Math.sin(ph*9+b.userData.ph*6)*.04,.45+ph*.15,Math.cos(ph*7)*.03); b.scale.setScalar(.03+.04*Math.sin(ph*PI)); }
}

/* =====================================================================
   9. POURING INTO THE LAMP
   ===================================================================== */
function lampPos(){ const lh=G.world.lighthouse; return lh&&lh.lampCenter?lh.lampCenter:V(180,60,0); }
function setupPour(){
  const lh=G.world.lighthouse; if(!lh)return;
  const q=V(lh.lampCenter.x,lh.topY!=null?lh.topY:lh.lampCenter.y-1.65,lh.lampCenter.z);
  G.interact.add({pos:q,radius:6,priority:4,
    label:()=>{ const n=G.inv.count('vial'); return 'Pour ether into the lamp ('+A.etherUnits+(n>1?' · '+n+' vials':'')+')'; },
    enabled:()=>looping()&&G.inv.count('vial')>0&&lh.inRoom(G.player.pos),use(){ pour(); }});
}
function pour(){
  const n=G.inv.count('vial'), units=A.etherUnits; if(!n||units<=0)return 0;
  G.inv.take('vial',n); A.etherUnits=0; A.poured+=units;
  let ether=null; if(G.lamp&&G.lamp.feed){ try{ ether=G.lamp.feed(units); }catch(e){ console.error('lamp.feed',e); } }
  const lc=lampPos();
  sparkle(V(lc.x,lc.y-.6,lc.z),'#c4a0ff',60,{radius:.8,speed:3,up:2.2,life:1.4,bright:2.2});
  G.ui.shake(.18);
  bigToast('The light swells','+'+units+' ether'+(ether!=null?' · the lamp holds '+Math.round(ether):''));
  if(!S.firsts.pour){ S.firsts.pour=1; G.ui.say('The ether runs into the lamp like light poured into water. The beam steadies, and far out on the moor the fog takes a step back.'); }
  S.poured=true; G.emit('alchemy:pour',{units,ether});
  chainNow();
  return units;
}

/* =====================================================================
   10. BREWING
   ===================================================================== */
let brewing=null;
function brew(id,o={}){
  const r=RECIPES[id]; if(!r||brewing||!A.canBrew(id))return false;
  if(r.bait&&!(G.moths&&G.moths.bait)){ return false; }
  for(const k in r.needs)G.inv.take(k,r.needs[k]);
  const finish=()=>{
    brewing=null; brewT=0;
    if(r.bait){ try{ G.moths.bait(r.bait); }catch(e){ console.error('moths.bait',e); }
      bigToast('Moth Bait','The lantern glass is smeared · '+r.bait+' s'); }
    else{ A.etherUnits+=r.units; G.inv.add('vial',1,{silent:true});
      const n=G.inv.count('vial'); bigToast(r.name,'+'+r.units+' ether · '+n+(n>1?' vials':' vial')+' held'); }
    if(table)sparkle(table.world.clone().setY(table.world.y+1.4),'#c4a0ff',26,{radius:.25,up:1.8});
    G.emit('brew',{recipe:id,units:r.units||0});
    if(!S.firsts.brew){ S.firsts.brew=1; setTimeout(()=>G.ui.say('The steam smells of rain and violets. What drips from the retort glows faintly in the vial — ether, the same stuff that burns in the lamp.'),300); }
    refreshPanel(); chainNow();
  };
  if(o.instant){ finish(); return true; }
  brewing=id; brewT=1.7;
  refreshPanel(true);
  setTimeout(finish,1700);
  return true;
}

/* =====================================================================
   11. THE PANEL (parchment card)
   ===================================================================== */
const ICON={
  glowcap:'<svg viewBox="0 0 16 16"><path d="M2.2 8.6C2.6 4.6 5 2.6 8 2.6s5.4 2 5.8 6c-1.6.7-3.6 1-5.8 1s-4.2-.3-5.8-1z" fill="#a46cff"/><path d="M6.6 9.4h2.8l.5 4.4H6.1z" fill="#e6dcef"/><circle cx="6" cy="6" r=".9" fill="#e6d6ff"/><circle cx="9.6" cy="5" r=".7" fill="#e6d6ff"/></svg>',
  kelp:'<svg viewBox="0 0 16 16" fill="none" stroke="#56e2d2" stroke-width="1.6" stroke-linecap="round"><path d="M4 14c-1-3 2-5 0-8s1-4 1-4"/><path d="M8.5 14c1-3-2-5 0-8s0-4 0-4"/><path d="M12.5 14c-1-2.5 1.8-4.2.2-6.6"/></svg>',
  brine:'<svg viewBox="0 0 16 16"><path d="M7 1.6l2.6 4.6L7 14 4.4 6.2z" fill="#e8f0f8" stroke="#8ea4c4" stroke-width=".8"/><path d="M11.6 6l1.8 3-1.8 4.6-1.8-4.6z" fill="#d4e2f2" stroke="#8ea4c4" stroke-width=".7"/></svg>',
  pearl:'<svg viewBox="0 0 16 16"><circle cx="8" cy="8.4" r="5" fill="#f4e4ee" stroke="#b49aac" stroke-width=".8"/><circle cx="6.4" cy="6.6" r="1.5" fill="#fff"/></svg>',
  ichor:'<svg viewBox="0 0 16 16"><path d="M8 1.6C10 5 12.4 7.6 12.4 10.2A4.4 4.4 0 0 1 3.6 10.2C3.6 7.6 6 5 8 1.6z" fill="#0c0910" stroke="#9a6cff" stroke-width="1"/><path d="M6 9.6c.2-1.2.8-2 1.4-2.6" stroke="#d6bcff" stroke-width=".9" fill="none" stroke-linecap="round"/></svg>',
  vial:'<svg viewBox="0 0 16 16"><path d="M6.2 1.8h3.6v1.6H9.4v2.8l2.8 5.2a2 2 0 0 1-1.8 3H5.6a2 2 0 0 1-1.8-3l2.8-5.2V3.4h-.4z" fill="rgba(220,235,232,.35)" stroke="#e6dcef" stroke-width=".9"/><path d="M5 10.6h6l.8 1.6a1.2 1.2 0 0 1-1.1 1.8H5.3a1.2 1.2 0 0 1-1.1-1.8z" fill="#b37cff"/></svg>',
  bait:'<svg viewBox="0 0 16 16"><path d="M8 3c-2 2-5 1.6-6 4 2 .6 4 .2 6-1.6 2 1.8 4 2.2 6 1.6-1-2.4-4-2-6-4z" fill="#efe6d8"/><path d="M8 5.4v7" stroke="#6a5a50" stroke-width="1.2"/></svg>'
};
const CSS=`
#alchemy .sheet{max-width:600px;width:100%;margin-block:auto;gap:14px;padding:26px 28px 22px}
#alchemy.card{align-items:flex-start;background:linear-gradient(90deg,rgba(14,10,18,.86) 0%,rgba(14,10,18,.55) 55%,rgba(14,10,18,.15) 85%)}
#alchemy .alch-head{display:grid;gap:6px}
#alchemy h2{font-size:clamp(30px,5vw,44px)}
#alchemy .alch-lede{font-family:var(--serif);font-style:italic;font-size:16px;line-height:1.4}
#alchemy .alch-list{display:grid;gap:8px}
.alch-rec{display:grid;grid-template-columns:1fr auto;gap:6px 14px;align-items:center;padding:10px 12px;border-radius:3px;
  background:rgba(255,255,255,.28);box-shadow:inset 0 0 0 1px rgba(60,40,30,.18)}
.alch-rec.ready{background:rgba(165,108,255,.13);box-shadow:inset 0 0 0 1px rgba(75,56,99,.45)}
.alch-rec .nm{font-family:var(--serif);font-size:19px;color:#21161f;line-height:1.15}
.alch-rec .yield{font:700 12px var(--body);letter-spacing:.14em;text-transform:uppercase;color:#6c3f5f;margin-left:8px;white-space:nowrap}
.alch-rec .note{font-size:13.5px;line-height:1.35;color:#5a4a4e;margin-top:2px}
.alch-needs{display:flex;flex-wrap:wrap;gap:4px 10px;margin-top:5px}
.alch-need{display:inline-flex;align-items:center;gap:4px;font:600 13.5px var(--body);color:#3d2f33;font-variant-numeric:tabular-nums}
.alch-need.short{color:#a3304a}
.alch-need svg,.alch-chip svg,.sat-i svg{width:16px;height:16px;flex:none}
.alch-need small{font-weight:400;color:#7a6a6e}
.alch-rec .btn{padding:9px 18px;min-width:84px}
.alch-rec .btn:disabled{opacity:.42;cursor:not-allowed;filter:none}
.alch-tide{font-size:12.5px;color:#4b6a6a;margin-top:3px}
.alch-lost{font-size:13.5px;color:#7a6a6e;font-style:italic;font-family:var(--serif);padding:2px 2px 0}
.alch-sat{display:grid;gap:8px}
.alch-chips{display:flex;flex-wrap:wrap;gap:6px}
.alch-chip{display:inline-flex;align-items:center;gap:5px;padding:4px 9px 4px 6px;border-radius:12px;background:rgba(40,25,30,.08);font:600 13.5px var(--body);color:#3d2f33;font-variant-numeric:tabular-nums}
.alch-chip.empty{opacity:.4}
.alch-vials{font-size:14.5px;color:#3d2f33}
.alch-vials b{color:#4b3863}
.alch-foot{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
.alch-foot kbd{color:#21161f;background:rgba(255,255,255,.35);border-color:rgba(40,25,30,.45);margin-left:6px}
.alch-brewing{display:flex;align-items:center;gap:14px;padding:10px 12px;border-radius:3px;background:rgba(75,56,99,.12)}
.alch-brewing[hidden]{display:none}
.alch-brewing svg{width:46px;height:56px;flex:none}
.alch-brewing span{font-family:var(--serif);font-style:italic;font-size:17px;color:#4b3863}
.alch-brewing .bub{animation:alchBub 1.1s infinite ease-in;opacity:0}
.alch-brewing .bub:nth-child(2){animation-delay:.35s}.alch-brewing .bub:nth-child(3){animation-delay:.7s}
.alch-brewing .liq{animation:alchGlow .8s infinite alternate}
@keyframes alchBub{0%{transform:translateY(0);opacity:0}20%{opacity:1}100%{transform:translateY(-16px);opacity:0}}
@keyframes alchGlow{from{fill:#9a5cff}to{fill:#cfaaff}}
@media (max-width:520px){#alchemy .sheet{padding:20px 18px 18px;gap:12px}.alch-rec{grid-template-columns:1fr;}.alch-rec .btn{justify-self:start}}
@media (prefers-reduced-motion:reduce){.alch-brewing .bub,.alch-brewing .liq{animation:none;opacity:1}}
/* satchel HUD row */
.satchel{display:flex;flex-wrap:wrap;gap:4px 10px;align-items:center;font:700 13px var(--body);color:var(--bone);text-shadow:0 1px 3px #000;max-width:260px}
.satchel[hidden]{display:none}
.sat-i{display:inline-flex;align-items:center;gap:3px;font-variant-numeric:tabular-nums;transition:transform .25s}
.sat-i svg{filter:drop-shadow(0 1px 2px rgba(0,0,0,.8))}
.sat-i.pulse{transform:scale(1.28);color:var(--ether-hi)}
.sat-i.ether{color:var(--ether-hi)}
`;
let panel=null, satEl=null;
const $q=(s,el)=>(el||document).querySelector(s);
function esc(s){return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
function buildDOM(){
  const st=document.createElement('style'); st.id='alchemy-css'; st.textContent=CSS; document.head.appendChild(st);
  panel=document.createElement('div'); panel.className='card'; panel.id='alchemy'; panel.hidden=true;
  panel.setAttribute('role','dialog'); panel.setAttribute('aria-modal','true'); panel.setAttribute('aria-labelledby','alchTitle');
  panel.innerHTML=`<div class="sheet">
    <div class="alch-head"><span class="eyebrow">The keeper’s shed</span><h2 id="alchTitle">The Alchemy Table</h2>
      <p class="alch-lede">A burner that takes a violet flame, a retort, a mortar worn smooth. Whatever you steep here comes out as ether.</p></div>
    <div class="alch-brewing" hidden aria-live="polite"><svg viewBox="0 0 46 56"><path d="M17 4h12v4h-2v10l11 20a7 7 0 0 1-6 11H12a7 7 0 0 1-6-11l11-20V8h-2z" fill="rgba(255,255,255,.35)" stroke="#4b3863" stroke-width="2"/><path class="liq" d="M9 38h28l3.4 6.4A3.6 3.6 0 0 1 37.2 50H8.8a3.6 3.6 0 0 1-3.2-5.6z" fill="#a56cff"/><g fill="#efe4ff"><circle class="bub" cx="19" cy="40" r="2"/><circle class="bub" cx="26" cy="43" r="1.6"/><circle class="bub" cx="22" cy="38" r="1.3"/></g></svg><span>Steeping…</span></div>
    <div class="alch-list" id="alchList"></div>
    <div class="rule"></div>
    <div class="alch-sat"><span class="eyebrow">Your satchel</span><div class="alch-chips" id="alchChips"></div><div class="alch-vials" id="alchVials"></div></div>
    <div class="alch-foot"><span class="alch-lost" id="alchLost"></span><button class="btn ghost" type="button" id="alchClose">Step away<kbd>Esc</kbd></button></div>
  </div>`;
  document.body.appendChild(panel);
  $q('#alchClose',panel).addEventListener('click',()=>closePanel());
  panel.addEventListener('click',e=>{ const b=e.target.closest&&e.target.closest('[data-brew]'); if(b&&!b.disabled)brew(b.dataset.brew); });
  addEventListener('keydown',e=>{ if(panel.hidden)return; if(e.code==='Escape'||e.code==='KeyP'||e.code==='Backspace'){ e.preventDefault(); e.stopPropagation(); closePanel(); } },true);
  // satchel HUD row
  const vit=document.querySelector('#hud .vitals');
  satEl=document.createElement('div'); satEl.className='satchel'; satEl.id='satchel'; satEl.hidden=true; satEl.setAttribute('aria-label','Satchel');
  if(vit)vit.appendChild(satEl);
}
function needsHTML(r){
  return Object.keys(r.needs).map(k=>{ const have=G.inv.count(k), need=r.needs[k], it=ITEMS[k];
    return `<span class="alch-need${have<need?' short':''}">${ICON[k]}${esc(need>1?it.plural:it.name)} <small>${have}/${need}</small></span>`; }).join('');
}
function tideNote(){
  if(!looping())return '';
  if(T.low)return `<div class="alch-tide">Low tide now · about ${Math.max(1,Math.round(T.lowLeft))} s left</div>`;
  const m=T.nextLowIn; return `<div class="alch-tide">Next low tide in ${m>90?Math.round(m/60)+' min':Math.round(m)+' s'}</div>`;
}
function refreshPanel(isBrewing){
  if(!panel||panel.hidden)return;
  const list=$q('#alchList',panel), busy=!!brewing;
  $q('.alch-brewing',panel).hidden=!busy;
  const keepFocus=document.activeElement&&document.activeElement.dataset?document.activeElement.dataset.brew||document.activeElement.id:null;
  let html='';
  for(const id of RORDER){ if(!A.known.has(id))continue; const r=RECIPES[id], ok=A.canBrew(id);
    const noMoths=r.bait&&!(G.moths&&G.moths.bait);
    const yieldTxt=r.bait?'lures moths · '+r.bait+' s':r.units+' ether';
    const tidal=r.needs.kelp||r.needs.brine;
    html+=`<div class="alch-rec${ok&&!noMoths?' ready':''}"><div><span class="nm">${esc(r.name)}</span><span class="yield">${yieldTxt}</span>
      <div class="note">${esc(r.note)}</div><div class="alch-needs">${needsHTML(r)}</div>${tidal&&!ok?tideNote():''}</div>
      <button class="btn" type="button" data-brew="${id}" ${ok&&!busy&&!noMoths?'':'disabled'} aria-label="Brew ${esc(r.name)}">${busy&&brewing===id?'Brewing':'Brew'}</button></div>`; }
  list.innerHTML=html;
  const lost=RORDER.filter(id=>!A.known.has(id)).length;
  $q('#alchLost',panel).textContent=lost?(lost===1?'One recipe is still lost somewhere on the island.':lost+' recipes are still lost somewhere on the island.'):'Every recipe the keeper knew is yours.';
  const chips=['glowcap','kelp','brine','pearl','ichor'].filter(k=>G.inv.count(k)>0||k==='glowcap').map(k=>`<span class="alch-chip${G.inv.count(k)?'':' empty'}" title="${esc(ITEMS[k].desc)}">${ICON[k]}${esc(ITEMS[k].name)} · ${G.inv.count(k)}</span>`).join('');
  $q('#alchChips',panel).innerHTML=chips;
  const n=G.inv.count('vial');
  $q('#alchVials',panel).innerHTML=n?`${ICON.vial.replace('<svg','<svg style="width:16px;height:16px;vertical-align:-3px"')} <b>${n} ${n>1?'vials':'vial'} · ${A.etherUnits} ether</b> — pour ${n>1?'them':'it'} into the lamp at the top of the lighthouse.`:'No ether yet. Brew a vial, then carry it up to the lamp.';
  // focus: keep the same control, else the first ready Brew, else Step away
  let f=keepFocus&&(panel.querySelector(`[data-brew="${keepFocus}"]:not(:disabled)`)||(keepFocus==='alchClose'?$q('#alchClose',panel):null));
  if(!f)f=panel.querySelector('[data-brew]:not(:disabled)')||$q('#alchClose',panel);
  if(!isBrewing||!busy){ try{ f.focus({preventScroll:true}); }catch(_){ f.focus(); } }
}
let panelOpenAt=0, padPrevB=true;
function openPanel(){
  if(!panel||!panel.hidden)return;
  if(G.state.mode!=='play')return;
  G.setMode('menu');            // set before unlocking, so flow.js doesn't read the unlock as a pause
  G.input.unlockPointer();
  panel.hidden=false; panelOpenAt=performance.now(); padPrevB=true;
  refreshPanel();
  if(!S.firsts.table){ S.firsts.table=1; }
}
function closePanel(){
  if(!panel||panel.hidden)return;
  panel.hidden=true;
  document.querySelectorAll('#alchemy .pad-focus').forEach(e=>e.classList.remove('pad-focus'));
  if(G.state.mode==='menu'){ G.setMode('play'); G.input.lockPointer(); }
  chainNow();
}
function padBack(){
  // B / Back / Menu on a pad closes the panel (core.js only maps B for the pause card)
  let gp=null; try{ const l=navigator.getGamepads?navigator.getGamepads():[]; for(const g of l||[]) if(g&&g.connected!==false){gp=g;break;} }catch(_){ return; }
  if(!gp)return; const b=i=>{const x=gp.buttons&&gp.buttons[i]; return !!x&&(typeof x==='object'?x.pressed:x>.5);};
  const now=b(1)||b(8)||b(9);
  if(now&&!padPrevB&&performance.now()-panelOpenAt>250)closePanel();
  padPrevB=now;
}
/* satchel HUD */
let satKey='';
function refreshSatchel(changed){
  if(!satEl)return;
  const items=['glowcap','kelp','brine','pearl','ichor','vial'].filter(k=>G.inv.count(k)>0);
  satEl.hidden=!items.length;
  const key=items.map(k=>k+G.inv.count(k)).join(',')+'|'+A.etherUnits;
  if(key===satKey)return; satKey=key;
  satEl.innerHTML=items.map(k=>`<span class="sat-i${k==='vial'?' ether':''}" data-id="${k}" title="${esc(ITEMS[k].name)}">${ICON[k]}${k==='vial'?G.inv.count(k)+' · '+A.etherUnits:G.inv.count(k)}</span>`).join('');
  satEl.setAttribute('aria-label','Satchel: '+items.map(k=>G.inv.count(k)+' '+ITEMS[k].name).join(', '));
  if(changed){ const el=satEl.querySelector(`[data-id="${changed}"]`); if(el){ el.classList.add('pulse'); setTimeout(()=>el.classList.remove('pulse'),320); } }
}

/* =====================================================================
   12. THE OBJECTIVE CHAIN
   ===================================================================== */
const MILESTONES=[{name:'beach',r:200,label:'the south beach'},{name:'hamlet',r:205,label:'the hamlet'},{name:'forest',r:255,label:'the forest edge'},
  {name:'tree',r:350,label:'the Resisting Tree'},{name:'island',r:415,label:'the whole island'}];
function shedPos(){ return table?table.world.clone():(()=>{const s=LM().shed||{x:150,y:42,z:33}; return V(s.x,s.y,s.z);})(); }
function beachPos(){ return A.boat?V(A.boat.x,A.boat.y,A.boat.z+3):V(-8,0,78); }
function doorPos(){ const lh=G.world.lighthouse; return lh&&lh.doorOut?lh.doorOut.clone():V(173,42,0); }
function milestonePos(name){
  const l=LM();
  if(name==='beach')return beachPos();
  if(name==='hamlet')return l.hamlet?V(l.hamlet.x,l.hamlet.y,l.hamlet.z):V(-20,10,30);
  if(name==='forest')return V(-72,H(-72,9),9);
  if(name==='tree')return l.resistingTree?V(l.resistingTree.x,l.resistingTree.y,l.resistingTree.z):V(-165,10,5);
  return V(-212,H(-212,4),4);
}
function blight(id){ return (G.blights||[]).find(b=>b&&b.id===id)||null; }
let ov=null; // temporary marker retarget {sub,target,name,until}
function override(sub,target,name,secs){ ov={sub,target:target||null,name:name||'',until:G.time+(secs||18)}; chainNow(); }
const S={poured:false,firsts:{},tidepool:false,grove:false,sighted:{}}; // save state
let chainT=0, lastChain='';
function nearestShroom(){
  const P=G.player.pos; let best=null,bd=1e9;
  for(const s of spots){ if(s.regrow>0)continue; const d=Math.hypot(s.pos.x-P.x,s.pos.z-P.z); if(d<bd){bd=d;best=s;} }
  return best?best.pos.clone():null;
}
function anyBrewable(){ return RORDER.some(id=>id!=='bait'&&A.canBrew(id)); }
function chainNow(){ chainT=0; }
function setQ(step,obj,sub,target,name){
  const key=step+'|'+obj+'|'+sub+'|'+name+'|'+(target?Math.round(target.x)+','+Math.round(target.z):'');
  if(key===lastChain)return; lastChain=key;
  if(G.quest&&G.quest.set)G.quest.set(step,obj,sub,target,name); else G.ui.objective(obj,sub);
}
function lampTarget(){ const lh=G.world.lighthouse, P=G.player.pos; if(lh&&lh.inside&&lh.inside(P))return {t:lh.inRoom(P)?null:lampPos().clone(),n:'The lamp'}; return {t:doorPos(),n:'Lighthouse'}; }
function updateChain(dt){
  if(!looping())return;
  chainT-=dt; if(chainT>0)return; chainT=.5;
  const vials=G.inv.count('vial'), caps=G.inv.count('glowcap');
  if(ov&&G.time>ov.until)ov=null;
  // blight sighting (moths.js owns blights; we only point at them once)
  for(const b of G.blights||[]){ if(!b||b.cured||S.sighted[b.id]||!b.pos)continue;
    if(Math.hypot(b.pos.x-G.player.pos.x,b.pos.z-G.player.pos.z)<(b.radius||8)+22){ S.sighted[b.id]=1; override('A blight: '+(b.name||'something rotten')+(b.needs?' — it will take '+b.needs+' moths':''),b.pos.clone?b.pos.clone():V(b.pos.x,b.pos.y,b.pos.z),b.name||'Blight',16); } }
  if(!S.poured){
    if(vials>0){ const lt=lampTarget(); setQ('loop-pour','Pour the ether into the lamp',vials>1?vials+' vials · '+A.etherUnits+' ether':'Climb to the lamp room',lt.t,lt.n); return; }
    if(anyBrewable()){ setQ('loop-brew','Brew ether','The alchemy table is at the shed by the cottage',shedPos(),'Alchemy table'); return; }
    if(ov){ setQ('loop-gather','Feed the light',ov.sub,ov.target,ov.name); return; }
    setQ('loop-gather','Feed the light','Gather glowcaps for the alchemy table · '+Math.min(caps,3)+'/3',nearestShroom(),'Glowcaps'); return;
  }
  // open-ended: push back the fog
  const R=G.fog&&G.fog.radius!=null?G.fog.radius:null;
  if(ov){ setQ('loop-push','Push back the fog',ov.sub,ov.target,ov.name); return; }
  if(vials>0){ const lt=lampTarget(); setQ('loop-push','Push back the fog','Pour your '+A.etherUnits+' ether into the lamp',lt.t,lt.n); return; }
  const next=MILESTONES.find(m=>R==null||R<m.r);
  const rTxt=R!=null?' · the light reaches '+Math.round(R)+' m':'';
  if(!next){ setQ('loop-push','The island is lit','The fog has nowhere left to stand'+rTxt,null,''); return; }
  if(anyBrewable()&&G.player.pos.distanceTo(shedPos())>12){ setQ('loop-push','Push back the fog','Next: '+next.label+' · '+next.r+' m'+rTxt+' · you can brew more ether',shedPos(),'Alchemy table'); return; }
  setQ('loop-push','Push back the fog','Next: '+next.label+' · '+next.r+' m'+rTxt,milestonePos(next.name),next.label.replace(/^the /,'').replace(/^./,c=>c.toUpperCase()));
}

/* =====================================================================
   13. LOGBOOK (the keeper's tincture), BLIGHT REWARDS, MONSTER ICHOR
   ===================================================================== */
function setupLogbook(){
  const lb=G.interact.list.find(o=>G.interact.label(o)==='Read the logbook');
  if(!lb)return;
  const pos=typeof lb.pos==='function'?lb.pos():lb.pos;
  let n=0;
  G.interact.add({pos,radius:lb.radius||1.25,priority:(lb.priority||1)+1,label:'Read the logbook',enabled:()=>looping(),
    use(){ const L=['A newer page, in the keeper’s tidy hand: “Glowcap Tincture. Three caps, crushed and steeped over the burner in the shed. A weak dose, but it keeps the lamp fed through a bad night. Pour it in at the top.”',
      '“The fog only eats what the light can’t reach. Feed the light and it gives the ground back. Kelp and brine at low water make a stronger draught. I wrote the recipe on a loose page — I think it went with the old boat.”',
      'Tide times in a column, then: “Low water every five minutes or so, if you count the way the fog counts. Don’t get caught out on the sand.”'];
      G.ui.say(L[n%L.length]); n++; if(!A.known.has('tincture'))A.learn('tincture'); }});
}
function groveRing(){
  if(S.groveBuilt)return; S.groveBuilt=true;
  const b=blight('grove'), c=b&&b.pos?b.pos:V(-120,0,-25), R=(b&&b.radius?Math.min(b.radius,7):5.5);
  for(let k=0;k<6;k++){ const a=k/6*TAU+.3; addSpot(V(c.x+Math.cos(a)*R,0,c.z+Math.sin(a)*R),{tag:'grove'}); }
}
function onBlightCured(e){
  if(!e)return;
  if(e.id==='grove'){ S.grove=true; groveRing(); if(!e.restored)setTimeout(()=>G.ui.say('Where the black was, the ground is already glowing: a ring of glowcaps, fatter than any on the moor.'),1800); }
  if(e.id==='tidepool'){ S.tidepool=true; if(!e.restored)setTimeout(()=>G.ui.say('The pool is clear now, and deep. At low water, something pale might be left behind in it.'),1800); }
}
function onKilled(e){
  if(!looping()||!e||!e.pos)return;
  const n=e.boss?5:1;
  for(let k=0;k<n;k++){ const a=Math.random()*TAU, s=n>1?1.5+Math.random()*1.5:0;
    const p=V(e.pos.x,e.pos.y+.9,e.pos.z);
    const d=spawnDrop('ichor',p,{life:40,grav:true,vy:3+Math.random()*2});
    d.vx=Math.cos(a)*s; d.vz=Math.sin(a)*s; }
  if(!S.firsts.ichorSeen){ S.firsts.ichorSeen=1; setTimeout(()=>G.ui.say('Where it came apart, a bead of something black and glossy is left on the ground, trembling.'),600); }
}

/* =====================================================================
   14. LOOP START + SAVES
   ===================================================================== */
function onLoopStart(e){
  A.learn('tincture',{silent:true});
  for(const p of pages)p.mesh.visible=!p.found&&!A.known.has(p.id);
  if(!(e&&e.restored)){
    setTimeout(()=>G.ui.say('The beam holds the fog back, but only so far. Already the light is dimming, and the lamp will need feeding. The keeper’s glowcaps, and the alchemy table in the shed…'),900);
  }
  chainNow();
}
G.persist&&G.persist.register('alchemy',{
  save:()=>({v:1,inv:Object.assign({},counts),ether:A.etherUnits,poured:A.poured,known:[...A.known],tide:+T.t.toFixed(1),
    pages:pages.filter(p=>p.found).map(p=>p.id),regrow:spots.map(s=>Math.round(s.regrow)),
    S:{poured:S.poured,firsts:S.firsts,tidepool:S.tidepool,grove:S.grove,sighted:S.sighted}}),
  load:(d)=>{
    if(!d)return;
    for(const k in counts)delete counts[k];
    Object.assign(counts,d.inv||{});
    A.etherUnits=d.ether|0; A.poured=d.poured|0;
    A.known.clear(); (d.known||[]).forEach(id=>RECIPES[id]&&A.known.add(id)); A.known.add('tincture');
    const s=d.S||{}; S.poured=!!s.poured; S.firsts=Object.assign({},s.firsts||{}); S.tidepool=!!s.tidepool; S.sighted=Object.assign({},s.sighted||{});
    if(s.grove){ S.grove=true; groveRing(); }
    for(const p of pages){ p.found=(d.pages||[]).includes(p.id); p.mesh.visible=looping()&&!p.found&&!A.known.has(p.id); }
    (d.regrow||[]).forEach((r,i)=>{ const sp=spots[i]; if(!sp)return; sp.regrow=r>0?r:0; if(sp.mesh)sp.mesh.visible=!(r>0); });
    for(const dr of drops.slice())removeDrop(dr);
    T.low=false; setTideTime(+d.tide||0);
    G.emit('inv:change',{id:'*',n:0,total:0});
    lastChain=''; chainNow();
  }
});

/* =====================================================================
   15. SYSTEM
   ===================================================================== */
G.system('alchemy',{order:55,modes:'always',
  init(){
    G.scene.add(root);
    buildSparkles(); buildPickupAssets(); initSpots();
    try{ buildTable(); }catch(e){ console.error('alchemy table',e); }
    try{ buildBoat(); buildHamletPage(); }catch(e){ console.error('alchemy pages',e); }
    setupPour(); setupLogbook(); buildDOM();
    G.on('loop:start',onLoopStart);
    G.on('monster:killed',onKilled);
    G.on('blight:cured',onBlightCured);
    G.on('inv:change',e=>{ refreshSatchel(e&&e.id); if(panel&&!panel.hidden&&!brewing)refreshPanel(); });
    G.on('mode',e=>{ if(e.mode!=='menu'&&panel&&!panel.hidden){ panel.hidden=true; } });
    if(looping())onLoopStart({restored:true});
  },
  update(dt){
    const mode=G.state.mode, play=mode==='play'||mode==='dead';
    stepSparkles(dt); animTable(dt);
    if(brewT>0)brewT-=dt;
    for(const p of pages){ if(p.mesh.visible){ p.mesh.children[0].position.y=.05+Math.sin(G.time*2+p.pos.x)*.01; } }
    if(mode==='menu'){ if(panel&&!panel.hidden){ padBack(); if(((G.time*2)|0)!==((G.time*2-dt*2)|0)&&!brewing)refreshTideOnly(); } }
    updateDrops(play?dt:0,play);
    if(!play)return;
    updateSpots(dt);
    if(looping()){ updateTide(dt); tideRescue(dt); }
    updateChain(dt);
  }
});
function refreshTideOnly(){ const el=panel&&panel.querySelector('.alch-tide'); if(el){ const w=document.createElement('div'); w.innerHTML=tideNote(); if(w.firstChild)el.textContent=w.firstChild.textContent; } }

/* debug helpers (tests) */
A.debug={ setTide:t=>setTideTime(t), give:(id,n)=>G.inv.add(id,n,{silent:true}), state:S, sparkle,
  info:()=>({inv:G.inv.list(),ether:A.etherUnits,known:[...A.known],tide:{level:+T.level.toFixed(3),low:T.low,next:Math.round(T.nextLowIn),off:+T.offset.toFixed(3)},drops:drops.length,step:G.quest&&G.quest.step}) };
})();
