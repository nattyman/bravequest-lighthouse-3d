/* =====================================================================
   companions.js — Ember the fox and Corvin the raven (spec: COMPANIONS.md)
   - Ember: the first fox negative you free stays with you (creatures.js hands it over: G.creatures.claimFreed). Old saves with a
     fox already freed get her on load, quietly.
   - Corvin: a new negative, the raven, roosting on the standing stones (a custom negative in G.creatures.negatives, so the
     swarm hunts it and saves keep its index). It flits off before you or the swarm can reach it: weaken it first (a staff hit
     or a bolt while it perches), then the swarm (Maren's lantern in Act 1, a baited lantern in the core loop) frees it.
   - Following: Ember walks your breadcrumbs (no navmesh) at heel; Corvin flies loose circles above and behind and perches
     when you stop. Either catches up out of sight (fade out, reappear just off camera) beyond 35 m or with no route; both come
     through fast travel, the sea cave, the Undercroft and onto the cave raft; they wait outside the lighthouse and during the
     finale. Neither can be hurt: no hurtbox, never targeted; a blow that would land makes them hop / flap aside.
   - Commands: R / D-pad left / the fox button — Ember go (at a fox spot) or heel; T / D-pad right / the raven button — Corvin go
     (at a raven spot) or scout (circles once at ~30 m, pins shards, caches and companion spots within 40 m; 45 s cooldown).
   - Six optional spots (§4): the hollow log, the cottage grate (→ Maren's key → her sea-chest: a Heart Shard), the sea-cave
     crack (→ a rope ladder to a ledge with a bundle), the chapel bell (an echo of Wren, a candle lights itself), the hanging
     bundle in the dead tree, the north-cliff nest (a new Heart Shard).
   - Fights (§5): Ember's nip breaks a wind-up (6 s), Corvin's dive delays an attack 0.8 s (10 s); no damage, nothing on bosses.
     In the dark Corvin caws when something hostile comes within 15 m.
   - Budget: each companion is one skinned toon mesh + one skinned outline (rigid skinning, one draw each); the spot set pieces
     are one merged mesh per place (island / cave / Undercroft) plus a few small moving parts shown only nearby.
   API: G.companions = {ember, corvin, has(id), send(id), call(id), spots, debug, names:COMP_NAMES, shardSpots}
   Events: companion:earned {id,quiet} · companion:sent {id,spot} · companion:spot {id} · companion:scout {found} ·
           companion:nip {kind} · companion:dive {kind} · companion:heel · companion:caw {why}
   Persist key 'companions': {v, ember, corvin, spots, key, chest, cd, said, seen}
   ===================================================================== */
(function(){
'use strict';
const G=window.G, THREE=G.THREE, U=G.U;
const PI=Math.PI, TAU=PI*2;
const {clamp,lerp,smooth}=U;
const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const LM=()=>(G.world&&G.world.landmarks)||{};
const H=(x,z)=>{ try{ const h=G.world.height(x,z); return isFinite(h)?h:0; }catch(_){ return 0; } };
const isPlay=()=>G.state.mode==='play';
const $=s=>document.getElementById(s);

/* the working names (Heath can change them here, and only here) */
const COMP_NAMES={ember:'Ember',corvin:'Corvin'};
const NM=COMP_NAMES;

/* ---------------------------------------------------------------- tuning */
const T={
  heel:2.5, side:.65, sitAfter:2, lieAfter:10, crumbStep:.4, crumbs:96,
  trot:4.2, run:8.8, sprintBoost:1.15, catchUp:35, breakRise:.95, breakGap:2.6, maxDrop:2.6,
  flyMin:4, flyMax:8, flyBehind:3, flySpeed:11, perchAfter:2, perchR:8, shoulderChance:.3,
  spotR:3.4, ravenSpotR:7, scoutCD:45, scoutR:30, scoutFind:40, scoutTime:6.5,
  nipCD:6, nipRange:8, diveCD:10, diveDelay:.8, diveRange:12, warnR:15
};

/* ---------------------------------------------------------------- persisted state */
const S={v:1,ember:false,corvin:false,spots:{},key:false,chest:false,cd:0,said:{},seen:{}};

/* ---------------------------------------------------------------- scratch (no per-frame allocations) */
const _a=V(), _b=V(), _c=V(), _d=V(), _e=V(), _q=new THREE.Quaternion(), _q2=new THREE.Quaternion(), _m=new THREE.Matrix4();
const _fr=new THREE.Frustum(), _fm=new THREE.Matrix4();
function camFrustum(){ const c=G.camera; c.updateMatrixWorld(); _fm.multiplyMatrices(c.projectionMatrix,c.matrixWorldInverse); _fr.setFromProjectionMatrix(_fm); return _fr; }
function onScreen(p,r=.6){ camFrustum(); _e.copy(p); _e.y+=.3; if(!_fr.containsPoint(_e))return false; return G.camera.position.distanceTo(p)<70; }
const P=()=>G.player;

/* ================================================================ 1. GEOMETRY HELPERS
   Parts are merged into one indexed geometry with rigid skinning (each part follows one bone). */
function paintGeo(g,hex,fn){
  const n=g.attributes.position.count, c=new Float32Array(n*3), base=U.col(hex), tmp=new THREE.Color(), P0=g.attributes.position;
  for(let i=0;i<n;i++){ tmp.copy(base); if(fn)fn(P0.getX(i),P0.getY(i),P0.getZ(i),tmp); c[i*3]=tmp.r; c[i*3+1]=tmp.g; c[i*3+2]=tmp.b; }
  g.setAttribute('color',new THREE.BufferAttribute(c,3)); return g;
}
/** parts: [{geo (indexed or not, with color), bone, at:[x,y,z] (bind-space offset), m: Matrix4 (optional, applied first)}] */
function mergeSkinned(parts){
  let nv=0, ni=0;
  const geos=parts.map(p=>{ let g=p.geo.clone(); if(p.m)g.applyMatrix4(p.m); if(p.at)g.translate(p.at[0],p.at[1],p.at[2]);
    if(!g.index){ const n=g.attributes.position.count, a=new Uint32Array(n); for(let i=0;i<n;i++)a[i]=i; g.setIndex(new THREE.BufferAttribute(a,1)); }
    if(!g.attributes.normal)g.computeVertexNormals(); nv+=g.attributes.position.count; ni+=g.index.count; return g; });
  const pos=new Float32Array(nv*3), nor=new Float32Array(nv*3), col=new Float32Array(nv*3), si=new Uint16Array(nv*4), sw=new Float32Array(nv*4), idx=new Uint32Array(ni);
  let ov=0, oi=0;
  geos.forEach((g,k)=>{ const n=g.attributes.position.count, b=parts[k].bone|0, C=g.attributes.color;
    const PA=g.attributes.position, NA=g.attributes.normal;
    for(let i=0;i<n;i++){ pos[(ov+i)*3]=PA.getX(i); pos[(ov+i)*3+1]=PA.getY(i); pos[(ov+i)*3+2]=PA.getZ(i); nor[(ov+i)*3]=NA.getX(i); nor[(ov+i)*3+1]=NA.getY(i); nor[(ov+i)*3+2]=NA.getZ(i); }
    for(let i=0;i<n;i++){ if(C){ col[(ov+i)*3]=C.getX(i); col[(ov+i)*3+1]=C.getY(i); col[(ov+i)*3+2]=C.getZ(i); } else { col[(ov+i)*3]=col[(ov+i)*3+1]=col[(ov+i)*3+2]=1; }
      si[(ov+i)*4]=b; sw[(ov+i)*4]=1; }
    const I=g.index.array; for(let i=0;i<I.length;i++)idx[oi+i]=I[i]+ov; ov+=n; oi+=I.length; });
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.BufferAttribute(pos,3)); g.setAttribute('normal',new THREE.BufferAttribute(nor,3));
  g.setAttribute('color',new THREE.BufferAttribute(col,3)); g.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(si,4));
  g.setAttribute('skinWeight',new THREE.BufferAttribute(sw,4)); g.setIndex(new THREE.BufferAttribute(idx,1));
  g.computeBoundingSphere(); g.boundingSphere.radius*=1.6; g.computeBoundingBox();
  return g;
}
/** plain (unskinned) merge of colored geometries, each with an optional matrix — for the static set pieces */
function mergeStatic(list){
  let nv=0, ni=0;
  const geos=list.map(p=>{ let g=(p.geo||p).clone(); if(p.m)g.applyMatrix4(p.m); if(g.index==null){ const n=g.attributes.position.count, a=new Uint32Array(n); for(let i=0;i<n;i++)a[i]=i; g.setIndex(new THREE.BufferAttribute(a,1)); }
    if(!g.attributes.normal)g.computeVertexNormals(); nv+=g.attributes.position.count; ni+=g.index.count; return g; });
  const pos=new Float32Array(nv*3), nor=new Float32Array(nv*3), col=new Float32Array(nv*3), idx=new Uint32Array(ni); let ov=0, oi=0;
  for(const g of geos){ const n=g.attributes.position.count, C=g.attributes.color;
    for(let i=0;i<n;i++){ pos[(ov+i)*3]=g.attributes.position.getX(i); pos[(ov+i)*3+1]=g.attributes.position.getY(i); pos[(ov+i)*3+2]=g.attributes.position.getZ(i);
      nor[(ov+i)*3]=g.attributes.normal.getX(i); nor[(ov+i)*3+1]=g.attributes.normal.getY(i); nor[(ov+i)*3+2]=g.attributes.normal.getZ(i);
      col[(ov+i)*3]=C?C.getX(i):1; col[(ov+i)*3+1]=C?C.getY(i):1; col[(ov+i)*3+2]=C?C.getZ(i):1; }
    const I=g.index.array; for(let i=0;i<I.length;i++)idx[oi+i]=I[i]+ov; ov+=n; oi+=I.length; }
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.BufferAttribute(pos,3)); g.setAttribute('normal',new THREE.BufferAttribute(nor,3));
  g.setAttribute('color',new THREE.BufferAttribute(col,3)); g.setIndex(new THREE.BufferAttribute(idx,1)); g.computeBoundingSphere(); return g;
}
/** mirror a geometry in x and keep its faces pointing out (scale -1 flips the winding) */
function mirrorX(g){ g.scale(-1,1,1); if(g.index){ const I=g.index.array; for(let i=0;i<I.length;i+=3){ const t=I[i+1]; I[i+1]=I[i+2]; I[i+2]=t; } g.index.needsUpdate=true; }
  else { for(const k in g.attributes){ const A=g.attributes[k], n=A.itemSize, a=A.array; for(let i=0;i<A.count;i+=3){ for(let j=0;j<n;j++){ const t=a[(i+1)*n+j]; a[(i+1)*n+j]=a[(i+2)*n+j]; a[(i+2)*n+j]=t; } } A.needsUpdate=true; } }
  return g; }
/** turn a geometry inside out (faces and normals point in): the inside of the hollow log */
function flipFaces(g){ mirrorX(g); g.scale(-1,1,1); const N=g.attributes.normal; for(let i=0;i<N.array.length;i++)N.array[i]=-N.array[i]; N.needsUpdate=true; return g; }
const M4=(x=0,y=0,z=0,rx=0,ry=0,rz=0,sx=1,sy=sx,sz=sx)=>new THREE.Matrix4().compose(V(x,y,z),new THREE.Quaternion().setFromEuler(new THREE.Euler(rx,ry,rz)),V(sx,sy,sz));
const ell=(rx,ry,rz,hex,fn,seg=14)=>{ const g=new THREE.SphereGeometry(1,seg,Math.max(8,seg*.7|0)); g.scale(rx,ry,rz); return paintGeo(g,hex,fn); };
const cone=(r,h,hex,seg=8,fn)=>paintGeo(new THREE.ConeGeometry(r,h,seg),hex,fn);
const cyl=(r0,r1,h,hex,seg=8,fn)=>paintGeo(new THREE.CylinderGeometry(r0,r1,h,seg),hex,fn);
const box=(w,h,d,hex,fn)=>paintGeo(new THREE.BoxGeometry(w,h,d),hex,fn);

/* skinned toon material + inverted-hull outline that follows the same skeleton */
function skinToon(){ const m=G.toon('#ffffff',{vertexColors:true}); m.skinning=true; return m; }
function skinOutline(th,hex){
  const m=new THREE.MeshBasicMaterial({color:U.col(hex||G.PAL.outline||'#1a1418'),side:THREE.BackSide,skinning:true});
  m.onBeforeCompile=sh=>{ sh.vertexShader=sh.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n transformed+=normal*'+th.toFixed(4)+';'); };
  m.customProgramCacheKey=()=>'compol'+th; return m;
}
/** bones: [{name, parent (index|-1), at:[x,y,z] relative to the parent}] -> {root mesh group, mesh, outline, bones{name:Bone}, skeleton} */
function rig(boneDefs,geo,olTh){
  const bones=boneDefs.map(d=>{ const b=new THREE.Bone(); b.name=d.name; b.position.set(d.at[0],d.at[1],d.at[2]); return b; });
  boneDefs.forEach((d,i)=>{ if(d.parent>=0)bones[d.parent].add(bones[i]); });
  const mat=skinToon(), mesh=new THREE.SkinnedMesh(geo,mat);
  mesh.add(bones[0]); mesh.updateMatrixWorld(true);
  const skel=new THREE.Skeleton(bones); mesh.bind(skel);
  const ol=new THREE.SkinnedMesh(geo,skinOutline(olTh)); ol.bind(skel,mesh.bindMatrix); ol.castShadow=false; ol.raycast=()=>{}; ol.name='outline';
  mesh.add(ol); mesh.castShadow=true; mesh.frustumCulled=true; ol.frustumCulled=true;
  const by={}; bones.forEach(b=>by[b.name]=b);
  const rest={}; bones.forEach(b=>rest[b.name]=b.position.clone());
  const root=new THREE.Group(); root.add(mesh);
  return {root,mesh,ol,mat,olMat:ol.material,bones:by,rest,skel};
}
function setOpacity(R,o){
  const tr=o<.999;
  if(R.mat.transparent!==tr){ R.mat.transparent=tr; R.olMat.transparent=tr; R.mat.depthWrite=!tr||o>.6; R.mat.needsUpdate=true; R.olMat.needsUpdate=true; }
  R.mat.opacity=o; R.olMat.opacity=o; R.ol.visible=o>.35; R.root.visible=o>.01; R.mesh.castShadow=o>.5;
}

/* ================================================================ 2. EMBER (the freed fox, as one skinned mesh) */
let EM=null;   // rig
function buildFox(){
  const C=G.creatures; if(!C||!C.animalGeos)return null;
  const GG=C.animalGeos('fox'), sp=GG.sp;
  const BD=[{name:'root',parent:-1,at:[0,0,0]},{name:'body',parent:0,at:[0,sp.bodyY,0]},{name:'neck',parent:1,at:sp.neckAt},{name:'head',parent:2,at:sp.headAt},
    {name:'tail',parent:1,at:sp.tail.at}];
  sp.legs.forEach((L,i)=>BD.push({name:'leg'+i,parent:1,at:L.at}));
  // bind-space offsets (all rotations are identity in the bind pose, so offsets just add)
  const add3=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
  const body=[0,sp.bodyY,0], neck=add3(body,sp.neckAt), head=add3(neck,sp.headAt), tail=add3(body,sp.tail.at);
  const parts=[{geo:GG.body,bone:1,at:body},{geo:GG.head,bone:3,at:head},{geo:GG.tail,bone:4,at:tail}];
  if(GG.neck)parts.push({geo:GG.neck,bone:2,at:neck});
  GG.legs.forEach((g,i)=>parts.push({geo:g,bone:5+i,at:add3(body,sp.legs[i].at)}));
  // eyes: dark beads with a tiny warm glint
  for(const e of sp.eyes){ parts.push({geo:ell(.021,.021,.017,'#140f0c',null,10),bone:3,at:add3(head,e)});
    parts.push({geo:ell(.0065,.0065,.004,'#fff4dc',null,6),bone:3,at:add3(head,[e[0]*1.02,e[1]+.008,e[2]+.016])}); }
  const geo=mergeSkinned(parts);
  const R=rig(BD,geo,.011);
  R.root.name='ember'; R.sp=sp;
  // the thing in her mouth (shown only while carrying): a child of the head bone
  R.carry=new THREE.Group(); R.carry.position.set(0,-.045,.2); R.bones.head.add(R.carry); R.carry.visible=false;
  R.carryItems={};
  return R;
}
function carryItem(kind){
  const R=EM; if(!R)return;
  for(const k in R.carryItems)R.carryItems[k].visible=false;
  if(!kind){ R.carry.visible=false; return; }
  let o=R.carryItems[kind];
  if(!o){
    if(kind==='key'){ o=new THREE.Mesh(mergeStatic([{geo:new THREE.TorusGeometry(.035,.009,5,12),m:M4(-.07,0,0,0,PI/2,0)},{geo:box(.11,.012,.012,'#6f8f7a'),m:M4(0,0,0)},{geo:box(.012,.03,.012,'#6f8f7a'),m:M4(.045,-.018,0)}].map(p=>{ if(!p.geo.attributes.color)paintGeo(p.geo,'#6f8f7a'); return p; })),G.toon('#ffffff',{vertexColors:true})); o.rotation.y=PI/2; }
    else if(kind==='rope'){ o=new THREE.Mesh(mergeStatic([{geo:cyl(.012,.012,.32,'#b59b6a',6),m:M4(0,0,0,0,0,PI/2)}]),G.toon('#ffffff',{vertexColors:true})); }
    else { o=new THREE.Mesh(mergeStatic([{geo:ell(.1,.075,.085,'#a8855a',(x,y,z,c)=>{ if(y>.03)c.multiplyScalar(.85); }),m:M4(0,-.03,.04)},{geo:cone(.03,.06,'#8a6a46',6),m:M4(0,.035,.04)}]),G.toon('#ffffff',{vertexColors:true})); }
    o.castShadow=true; R.carry.add(o); R.carryItems[kind]=o;
  }
  o.visible=true; R.carry.visible=true;
}

/* ================================================================ 3. CORVIN (a low-poly raven, one skinned mesh) */
const RAV={black:'#26232f',sheen:'#3b3956',dark:'#17151d',beak:'#3a3742',leg:'#2c2a31',eye:'#1b120e'};
let CV=null;
function ravenParts(){
  // bind pose: standing, wings spread flat along ±x (leading edge +z), tail behind (−z). Units: metres; ~0.62 m long, 1.2 m span.
  const sheen=(x,y,z,c)=>{ const k=smooth(.3,.42,y); c.lerp(U.col(RAV.sheen),k*.55); };
  const BY=.2, WI=.28;
  const BD=[{name:'root',parent:-1,at:[0,0,0]},{name:'body',parent:0,at:[0,BY,0]},{name:'head',parent:1,at:[0,.1,.14]},{name:'tail',parent:1,at:[0,.01,-.16]},
    {name:'wingL',parent:1,at:[.075,.055,.04]},{name:'handL',parent:4,at:[WI,0,-.02]},{name:'wingR',parent:1,at:[-.075,.055,.04]},{name:'handR',parent:6,at:[-WI,0,-.02]},
    {name:'legL',parent:1,at:[.04,-.07,-.01]},{name:'legR',parent:1,at:[-.04,-.07,-.01]},{name:'foldL',parent:1,at:[.074,.045,0]},{name:'foldR',parent:1,at:[-.074,.045,0]}];
  const B={body:[0,BY,0]}; B.head=[0,BY+.1,.14]; B.tail=[0,BY+.01,-.16]; B.wingL=[.075,BY+.055,.04]; B.handL=[.075+WI,BY+.055,.02]; B.wingR=[-.075,BY+.055,.04]; B.handR=[-.075-WI,BY+.055,.02];
  B.legL=[.04,BY-.07,-.01]; B.legR=[-.04,BY-.07,-.01]; B.foldL=[.074,BY+.045,0]; B.foldR=[-.074,BY+.045,0];
  const parts=[], put=(geo,bone,at,m)=>parts.push({geo,bone,at,m});
  // body: a deep chest tapering to the tail, back sheen
  put(ell(.088,.092,.175,RAV.black,sheen,16),1,B.body,M4(0,0,0,-.18));
  put(ell(.075,.07,.1,RAV.black,sheen,12),1,B.body,M4(0,.035,.1,-.3));
  // head: a big flat-topped head
  put(ell(.062,.06,.075,RAV.black,sheen,14),2,B.head,M4(0,.01,0));
  // shaggy throat hackles (the raven's beard)
  for(let i=0;i<5;i++){ const a=(i-2)*.32; put(cone(.02,.075,RAV.dark,5),2,B.head,M4(Math.sin(a)*.028,-.05,.035+Math.cos(a)*.008,PI*.82,0,a*.4)); }
  // the heavy beak: deep at the base, curved culmen, slightly hooked
  put(cone(.03,.11,RAV.beak,8,(x,y,z,c)=>{ if(y>.03)c.multiplyScalar(.8); }),2,B.head,M4(0,-.002,.105,PI/2+.08,0,0,1,1,.78));
  put(cone(.012,.03,RAV.beak,6),2,B.head,M4(0,-.016,.16,PI/2+.9,0,0));
  // nasal bristles on the beak's base
  put(ell(.026,.02,.03,RAV.dark,null,8),2,B.head,M4(0,.012,.07));
  // eyes: dark with a bright glint (charm)
  for(const s of [-1,1]){ put(ell(.014,.016,.012,RAV.eye,null,8),2,B.head,M4(s*.05,.018,.04)); put(ell(.0055,.0055,.004,'#fffaf0',null,6),2,B.head,M4(s*.058,.026,.048)); }
  // the wedge (diamond) tail: a raven's tell in silhouette
  const tail=new THREE.Shape(); tail.moveTo(-.035,0); tail.lineTo(-.075,-.13); tail.lineTo(0,-.24); tail.lineTo(.075,-.13); tail.lineTo(.035,0); tail.lineTo(-.035,0);
  const tg=new THREE.ExtrudeGeometry(tail,{depth:.014,bevelEnabled:true,bevelThickness:.004,bevelSize:.004,bevelSegments:1}); tg.rotateX(PI/2); tg.translate(0,.007,0);
  put(paintGeo(tg,RAV.black,(x,y,z,c)=>c.lerp(U.col(RAV.dark),smooth(-.05,-.22,z)*.6)),3,B.tail,M4(0,0,0,.12));
  // wings: inner (coverts + secondaries) and hand (primaries with five spread "fingers")
  for(const s of [1,-1]){
    const inner=new THREE.Shape(); inner.moveTo(0,.05); inner.quadraticCurveTo(.14,.07,WI,.035); inner.lineTo(WI,-.115); inner.quadraticCurveTo(.13,-.16,0,-.13); inner.lineTo(0,.05);
    const ig=new THREE.ExtrudeGeometry(inner,{depth:.016,bevelEnabled:true,bevelThickness:.005,bevelSize:.005,bevelSegments:1}); ig.rotateX(PI/2); ig.translate(0,.008,0);
    if(s<0)mirrorX(ig);
    put(paintGeo(ig,RAV.black,(x,y,z,c)=>{ c.lerp(U.col(RAV.sheen),smooth(-.02,.04,z)*.5); }),s>0?4:6,s>0?B.wingL:B.wingR);
    const hp=[];
    const hand=new THREE.Shape(); hand.moveTo(0,.035); hand.quadraticCurveTo(.1,.03,.17,-.005); hand.lineTo(.13,-.1); hand.quadraticCurveTo(.06,-.115,0,-.1); hand.lineTo(0,.035);
    const hg=new THREE.ExtrudeGeometry(hand,{depth:.012,bevelEnabled:true,bevelThickness:.004,bevelSize:.004,bevelSegments:1}); hg.rotateX(PI/2); hg.translate(0,.006,0);
    hp.push(hg);
    // the fingers: five long primaries splayed at the tip
    for(let f=0;f<5;f++){ const a=.02-f*.2, len=.24-f*.02; const fg=new THREE.BoxGeometry(len,.008,.028); fg.translate(len/2,0,0); fg.scale(1,1,1); fg.applyMatrix4(M4(.12,0,.01-f*.024,0,a,0)); hp.push(fg); }
    for(const g of hp){ if(s<0)mirrorX(g); paintGeo(g,RAV.dark,(x,y,z,c)=>c.lerp(U.col(RAV.black),smooth(.02,-.06,z)*.5)); put(g,s>0?5:7,s>0?B.handL:B.handR); }
  }
  // legs + toes (short: a raven stands low)
  const LL=BY-.07;
  for(const s of [1,-1]){ const b=s>0?8:9, at=s>0?B.legL:B.legR;
    put(cyl(.011,.008,LL,RAV.leg,6),b,at,M4(0,-LL/2,0));
    put(ell(.022,.03,.025,RAV.black,null,8),b,at,M4(0,-.005,0));   // feathered thigh
    for(const a of [-.45,0,.45])put(cone(.007,.06,RAV.leg,5),b,at,M4(Math.sin(a)*.025,-LL+.006,Math.cos(a)*.028,PI/2,0,-a));
    put(cone(.007,.045,RAV.leg,5),b,at,M4(0,-LL+.006,-.02,-PI/2,0,0)); }
  // the folded wings as they sit on a perched bird: long, teardrop-shaped, the primaries crossing over the tail
  for(const s of [1,-1]){ const b=s>0?10:11, at=s>0?B.foldL:B.foldR;
    put(ell(.03,.078,.19,RAV.black,(x,y,z,c)=>c.lerp(U.col(RAV.sheen),smooth(0,.06,y)*.5),12),b,at,M4(0,-.012,-.07,.16,0,0));
    put(cone(.032,.2,RAV.dark,6),b,at,M4(-s*.012,-.02,-.31,-PI/2+.2,0,0,1,1,.45)); }
  return {BD,parts,B};
}
function buildRaven(){
  const {BD,parts}=ravenParts();
  const geo=mergeSkinned(parts), R=rig(BD,geo,.009);
  R.root.name='corvin';
  // fold quaternions (wings swept back along the body, face out, leading edge up)
  R.foldL=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(V(0,0,-1),V(-1,0,0),V(0,1,0)));
  R.foldR=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(V(0,0,1),V(1,0,0),V(0,1,0)));
  // a slight droop so the folded wing tips cross over the tail
  _q.setFromEuler(new THREE.Euler(-.12,0,0)); R.foldL.premultiply(_q); R.foldR.premultiply(_q);
  return R;
}

/* ---------------------------------------------------------------- the raven negative's look: the same raven, in ink */
function buildRavenNeg(){
  const {parts}=ravenParts();
  const mat=G.negMaterial({rim:'#8a62f0',strength:1.9});
  const bodyParts=parts.filter(p=>p.bone!==4&&p.bone!==5&&p.bone!==6&&p.bone!==7);
  const root=new THREE.Group(); root.name='ravenNegative';
  const body=new THREE.Mesh(mergeStatic(bodyParts.map(p=>{ const m=(p.m?p.m.clone():new THREE.Matrix4()); m.premultiply(new THREE.Matrix4().makeTranslation(p.at[0],p.at[1],p.at[2])); return {geo:p.geo,m}; })),mat);
  root.add(body);
  const wing=s=>{ const piv=new THREE.Group(); piv.position.set(s*.075,.255,.04); root.add(piv);
    const list=parts.filter(p=>p.bone===(s>0?4:6)).map(p=>({geo:p.geo,m:new THREE.Matrix4()}))
      .concat(parts.filter(p=>p.bone===(s>0?5:7)).map(p=>({geo:p.geo,m:new THREE.Matrix4().makeTranslation(s*.28,0,-.02)})));
    piv.add(new THREE.Mesh(mergeStatic(list),mat)); return piv; };
  const wL=wing(1), wR=wing(-1);
  const eyeM=new THREE.MeshBasicMaterial({color:U.col('#c09aff').multiplyScalar(1.6),transparent:true,fog:true});
  const eye=new THREE.Mesh(new THREE.SphereGeometry(.016,8,6),eyeM); eye.position.set(.052,.318,.18); root.add(eye);
  const eye2=eye.clone(); eye2.position.x=-.05; root.add(eye2);
  return {root,body,wL,wR,mat,eyeM};
}

/* ================================================================ 4. THE SPOTS (§4) — where they are, and the set pieces
   Each: {id, who:'ember'|'corvin', place:'island'|'cave'|'undercroft', at (the gap / perch), stand (where you stand), r,
          prompt, when()} — the static bits of each spot are one merged mesh (shown within 130 m); a few moving parts are their own. */
const CAVE=G.cave, UC=G.undercroft;
const cw=(x,y,z)=>CAVE&&CAVE.toWorld?CAVE.toWorld(x,y,z):V(x,y+60,z+800);
const uw=(x,y,z)=>UC&&UC.toWorld?UC.toWorld(x,y,z):V(x,y+60,z-800);
const loopOn=()=>!!(G.loop&&G.loop.active);
const COT={x:158,z:24,y:42};
const NEST={x:165,y:39.3,z:-47.3};
const SPOTS=[
  {id:'log',who:'ember',place:'island',name:'The hollow log',prompt:'Send Ember through the gap',
    c:V(25,H(25,7),7),yaw:.5},
  {id:'grate',who:'ember',place:'island',name:'The cottage grate',prompt:'Send Ember through the gap',
    at:V(160.6,42.12,27.3),stand:V(160.6,42,28.9)},
  {id:'crack',who:'ember',place:'cave',name:'The crack in the cave wall',prompt:'Send Ember through the gap',
    at:cw(-6.62,1.5,-12.2),stand:cw(-4.9,1.4,-12.2),when:()=>loopOn()},
  {id:'bell',who:'corvin',place:'undercroft',name:'The chapel handbell',prompt:'Send Corvin up',
    at:uw(-20.2,-.42,-48),stand:uw(-20.2,-4,-46.2),r:6.5},
  {id:'bundle',who:'corvin',place:'island',name:'The bundle in the dead tree',prompt:'Send Corvin up',
    c:V(4,H(4,9),9)},
  {id:'nest',who:'corvin',place:'island',name:'The raven’s nest',prompt:'Send Corvin down to the nest',
    at:V(NEST.x,NEST.y+.12,NEST.z),stand:V(NEST.x,42,-44.4),r:5.2}
];
const SP={}; SPOTS.forEach(s=>SP[s.id]=s);
// derived points for the two built from a centre
{ const L=SP.log, fx=Math.sin(L.yaw), fz=Math.cos(L.yaw); L.end=V(L.c.x+fx*1.75,L.c.y,L.c.z+fz*1.75);
  L.at=V(L.c.x+fx*1.65,L.c.y+.32,L.c.z+fz*1.65); L.stand=V(L.c.x+fx*3.5,0,L.c.z+fz*3.5); L.stand.y=H(L.stand.x,L.stand.z); }
{ const B=SP.bundle; B.branch=V(B.c.x+1.55,B.c.y+4.5,B.c.z+.35); B.at=V(B.branch.x,B.branch.y-.62,B.branch.z); B.stand=V(B.c.x+2.6,0,B.c.z+2.2); B.stand.y=H(B.stand.x,B.stand.z); }
SPOTS.forEach(s=>{ s.r=s.r||(s.who==='corvin'?T.ravenSpotR:T.spotR); });
// the two Heart Shards the companions bring (progression.js adds them to its list: 14 in all)
const SEACHEST={x:157.25,y:42.24,z:26.28};
const shardSpots=[
  {id:'chest',name:'Maren’s sea-chest',how:'In the keeper’s cottage, in Maren’s locked sea-chest by the south wall. Ember fetches the spare key from under the cottage (the grate on its south side).',
    pos:V(SEACHEST.x,SEACHEST.y+.5,SEACHEST.z),from:V(SEACHEST.x,SEACHEST.y,SEACHEST.z-1)},
  {id:'nest',name:'The raven’s nest',how:'In an old raven’s nest on a ledge below the headland’s north cliff, out of anyone’s reach. Corvin brings it up.',
    pos:V(NEST.x,NEST.y+.5,NEST.z),from:V(NEST.x,42,-44.4)}
];

/* ---------------------------------------------------------------- set-piece builders */
const VC=()=>G.toon('#ffffff',{vertexColors:true});
let setMat=null;
const pieces=[];   // {mesh, place, near:Vector3, r}
function addPiece(list,place,near,r){ if(!setMat)setMat=VC(); const m=new THREE.Mesh(mergeStatic(list),setMat); m.castShadow=true; m.receiveShadow=true; m.name='compSpot';
  G.scene.add(m); pieces.push({mesh:m,place,near,r:r||130}); return m; }
// markers: scratch marks + a tuft of red fur (fox spots); white streaks + a dangling black feather (raven spots)
function scratches(list,at,yaw,o={}){ const n=o.n||3, len=o.len||.32;
  for(let i=0;i<n;i++){ const g=box(.022,len,.012,o.col||'#e8dcc6'); list.push({geo:g,m:new THREE.Matrix4().compose(V(at.x+Math.cos(yaw)*(i-1)*.07,at.y+(i%2)*.03,at.z-Math.sin(yaw)*(i-1)*.07),new THREE.Quaternion().setFromEuler(new THREE.Euler(o.tilt||0,yaw,.32)),V(1,1,1))}); } }
function furTuft(list,at){ for(let i=0;i<6;i++){ const a=i*1.1, g=cone(.026,.13,i%2?'#d0702e':'#b8561f',5); list.push({geo:g,m:M4(at.x+Math.cos(a)*.04,at.y+.03,at.z+Math.sin(a)*.04,Math.cos(a)*.9,0,Math.sin(a)*.9)}); }
  list.push({geo:ell(.05,.03,.05,'#e9dcc8',null,8),m:M4(at.x,at.y+.01,at.z)}); }
function streaks(list,top,yaw,len=.9,n=4){ for(let i=0;i<n;i++){ const l=len*(.55+((i*37)%10)/14); list.push({geo:box(.026,l,.012,'#b9b4a8'),m:M4(top.x+Math.cos(yaw)*(i-1.5)*.09,top.y-l/2,top.z-Math.sin(yaw)*(i-1.5)*.09,0,yaw,0)});
    list.push({geo:ell(.026,.02,.026,'#c4bfb3',null,6),m:M4(top.x+Math.cos(yaw)*(i-1.5)*.09,top.y-l,top.z-Math.sin(yaw)*(i-1.5)*.09)}); } }
function featherGeo(){ const sh=new THREE.Shape(); sh.moveTo(0,0); sh.quadraticCurveTo(.035,-.09,0,-.22); sh.quadraticCurveTo(-.03,-.09,0,0);
  const g=new THREE.ShapeGeometry(sh,6); const v=mergeStatic([{geo:paintGeo(g,'#15131c')},{geo:paintGeo(new THREE.ShapeGeometry(sh,6).rotateY(PI),'#15131c')},{geo:cyl(.004,.004,.26,'#3a3742',4),m:M4(0,-.1,0)}]); return v; }
function dangle(list,from,len=.35,yaw=0){ list.push({geo:cyl(.004,.004,len,'#2a2830',4),m:M4(from.x,from.y-len/2,from.z)}); list.push({geo:featherGeo(),m:M4(from.x,from.y-len,from.z,.15,yaw,.1)}); }
function bark(x,y,z,c){ const n=U.vnoise(x*9+z*3,y*7); c.multiplyScalar(.82+.3*n); }

const DYN={};   // moving parts: {bundleTree, bundleLog, lid, ladder, ledgeBundle, bell, nestGlint}
function buildIsland(){
  /* 1. the hollow log: a fallen oak, open at one end, too small to crawl into */
  { const L=SP.log, list=[], len=3.6, R=.56;
    const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(PI/2,L.yaw,0,'YXZ')), at=V(L.c.x,L.c.y+R*.82,L.c.z);
    const mm=(o,rx=0,ry=0,rz=0)=>{ const m=new THREE.Matrix4().compose(at,q,V(1,1,1)); return m.multiply(M4(o[0],o[1],o[2],rx,ry,rz)); };
    const outer=new THREE.CylinderGeometry(R,R*1.08,len,14,4,true); paintGeo(outer,'#5d4634',(x,y,z,c)=>{ bark(x,y,z,c); if(z<-.2)c.lerp(U.col('#56663e'),smooth(-.2,-.5,z)*.8); });
    list.push({geo:outer,m:mm([0,0,0])});
    const inner=flipFaces(new THREE.CylinderGeometry(R*.8,R*.86,len*.98,14,1,true)); paintGeo(inner,'#20160f'); list.push({geo:inner,m:mm([0,0,0])});
    const cap=new THREE.CircleGeometry(R*1.06,14); paintGeo(cap,'#6b4f38',(x,y,z,c)=>{ const r=Math.hypot(x,y); c.lerp(U.col('#8f7052'),Math.sin(r*40)*.25+.25); }); list.push({geo:cap,m:mm([0,-len/2+.02,0],PI/2)});   // the closed (rotten) far end
    const ring=new THREE.RingGeometry(R*.8,R*1.03,14); paintGeo(ring,'#8a6a4a',(x,y,z,c)=>c.lerp(U.col('#a6855f'),Math.sin(Math.hypot(x,y)*55)*.3+.3)); list.push({geo:ring,m:mm([0,len/2-.01,0],-PI/2)});
    list.push({geo:cyl(.08,.12,.6,'#4f3a2b',6),m:mm([.4,-.6,.35],0,0,-1.1)}); list.push({geo:cyl(.06,.1,.45,'#4f3a2b',6),m:mm([-.42,.4,-.3],0,0,1.3)});
    // the fox marker: scratch marks on the bark beside the opening, a tuft of red fur caught on the rim
    const fx=Math.sin(L.yaw), fz=Math.cos(L.yaw), sx=Math.cos(L.yaw), sz=-Math.sin(L.yaw);
    scratches(list,V(L.end.x-fx*.25+sx*.5,L.c.y+.62,L.end.z-fz*.25+sz*.5),L.yaw+PI/2,{tilt:.2});
    furTuft(list,V(L.end.x-sx*.3,L.c.y+.22,L.end.z-sz*.3));
    // a bundle glimpsed inside (dynamic: Ember drags it out)
    addPiece(list,'island',L.c);
    const b=new THREE.Mesh(mergeStatic([{geo:ell(.2,.15,.17,'#a8855a',(x,y,z,c)=>{ if(y>.06)c.multiplyScalar(.85); })},{geo:cone(.05,.1,'#8a6a46',6),m:M4(0,.15,0)}]),VC());
    b.position.set(L.c.x+fx*.9,L.c.y+.42,L.c.z+fz*.9); G.scene.add(b); DYN.bundleLog=b;
    G.addCollider({x:L.c.x,z:L.c.z,r:.7,y0:L.c.y-1,y1:L.c.y+1.05}); G.addCollider({x:L.c.x+fx*1.2,z:L.c.z+fz*1.2,r:.6,y0:L.c.y-1,y1:L.c.y+1.05}); G.addCollider({x:L.c.x-fx*1.2,z:L.c.z-fz*1.2,r:.6,y0:L.c.y-1,y1:L.c.y+1.05}); }

  /* 5. the dead tree by the moor road, a bundle caught high in it */
  { const B=SP.bundle, c=B.c, list=[], bk='#6d655c';
    list.push({geo:cyl(.2,.34,4.8,bk,9,bark),m:M4(c.x,c.y+2.3,c.z,.04,0,-.05)});
    const br=(x0,y0,z0,x1,y1,z1,r0,r1)=>{ const a=V(x0,y0,z0), b=V(x1,y1,z1), d=b.clone().sub(a), l=d.length(); const g=cyl(r1,r0,l,bk,6,bark); g.translate(0,l/2,0);
      const q=new THREE.Quaternion().setFromUnitVectors(V(0,1,0),d.normalize()); list.push({geo:g,m:new THREE.Matrix4().compose(a,q,V(1,1,1))}); };
    br(c.x+.05,c.y+3.6,c.z,B.branch.x,B.branch.y,B.branch.z,.12,.045);
    br(B.branch.x-.5,B.branch.y-.2,B.branch.z-.1,B.branch.x+.4,B.branch.y+.55,B.branch.z-.2,.04,.015);
    br(c.x,c.y+3.1,c.z,c.x-1.4,c.y+4.3,c.z-.6,.11,.03); br(c.x,c.y+4.3,c.z,c.x+.3,c.y+5.6,c.z+.5,.1,.025); br(c.x-.9,c.y+3.8,c.z-.4,c.x-1.2,c.y+4.8,c.z+.4,.04,.015);
    br(c.x,c.y+.25,c.z,c.x+.9,c.y-.05,c.z+.4,.16,.05); br(c.x,c.y+.25,c.z,c.x-.7,c.y-.05,c.z+.6,.15,.05); br(c.x,c.y+.25,c.z,c.x-.2,c.y-.05,c.z-.9,.15,.05);
    // raven marker: white streaks down the trunk under the branch, a black feather on a thread from it
    streaks(list,V(c.x+.27,c.y+3.55,c.z+.12),PI/2+.3,.9,4);
    dangle(list,V(B.branch.x-.45,B.branch.y-.12,B.branch.z-.08),.42,.6);
    addPiece(list,'island',c);
    G.addCollider({x:c.x,z:c.z,r:.4,y0:c.y-1,y1:c.y+5});
    // the bundle on its twine (dynamic: it drops)
    const twine=cyl(.006,.006,.5,'#b59b6a',4); twine.translate(0,.3,0);
    const b=new THREE.Mesh(mergeStatic([{geo:ell(.2,.16,.18,'#a8855a',(x,y,z,cc)=>{ if(y>.06)cc.multiplyScalar(.85); })},{geo:cone(.05,.1,'#8a6a46',6),m:M4(0,.15,0)},{geo:twine}]),VC());
    b.position.copy(B.at); b.castShadow=true; G.scene.add(b); DYN.bundleTree=b; DYN.twine=twine; }

  /* 2. the cottage: a rusted grate in the plinth on the south side, and Maren's locked sea-chest inside by the south wall */
  { const g=SP.grate, list=[], a=g.at;
    list.push({geo:box(.62,.36,.06,'#0b0809'),m:M4(a.x,a.y+.06,a.z-.05)});   // the dark beyond
    for(let i=0;i<5;i++)list.push({geo:cyl(.016,.016,.38,'#5a3a2a',6,(x,y,z,c)=>c.lerp(U.col('#8a4a26'),U.vnoise(y*30,i)*.6)),m:M4(a.x-.24+i*.12,a.y+.06,a.z)});
    list.push({geo:box(.66,.04,.05,'#4a3226'),m:M4(a.x,a.y+.25,a.z)}); list.push({geo:box(.66,.04,.05,'#4a3226'),m:M4(a.x,a.y-.13,a.z)});
    scratches(list,V(a.x+.46,a.y+.08,a.z+.02),0,{len:.24}); furTuft(list,V(a.x-.18,a.y-.12,a.z+.04));
    // the sea-chest (iron-bound, salt-crusted): body here, the lid moves
    const C=SEACHEST, w=.78, d=.46, h=.38;
    list.push({geo:box(w,h,d,'#3f5560',(x,y,z,c)=>{ c.lerp(U.col('#2f4048'),U.vnoise(x*20,z*20)*.5); }),m:M4(C.x,C.y+h/2,C.z)});
    for(const x of [-.28,.28])list.push({geo:box(.05,h+.01,d+.02,'#2c2a30'),m:M4(C.x+x,C.y+h/2,C.z)});
    list.push({geo:box(.12,.13,.03,'#c8a24c'),m:M4(C.x,C.y+h-.08,C.z-d/2-.012)});
    list.push({geo:box(w*.9,.02,d*.9,'#d9d4c8',(x,y,z,c)=>c.lerp(U.col('#ffffff'),U.vnoise(x*40,z*40))),m:M4(C.x,C.y+.012,C.z)});
    addPiece(list,'island',V(COT.x,COT.y,COT.z),110);
    const lid=new THREE.Group(); lid.position.set(C.x,C.y+h,C.z+d/2); G.scene.add(lid);
    const lm=new THREE.Mesh(mergeStatic([{geo:box(w+.02,.08,d+.02,'#46606c'),m:M4(0,.04,-d/2)},{geo:box(.055,.085,d+.03,'#2c2a30'),m:M4(-.28,.04,-d/2)},{geo:box(.055,.085,d+.03,'#2c2a30'),m:M4(.28,.04,-d/2)}]),VC());
    lm.castShadow=true; lid.add(lm); DYN.lid=lid;
    G.addBoxCollider({x:C.x,z:C.z,hw:w/2+.02,hd:d/2+.02,yaw:0,y0:C.y-1,y1:C.y+h+.05}); }

  /* 6. the raven's nest on a ledge below the north cliff */
  { const n=NEST, list=[];
    list.push({geo:paintGeo(new THREE.DodecahedronGeometry(1,1),'#6f6b66',(x,y,z,c)=>{ c.lerp(U.col('#56603e'),smooth(.3,.9,y)*.7); c.multiplyScalar(.85+.3*U.vnoise(x*3,z*3)); }),m:M4(n.x,n.y-.55,n.z+.75,0,.4,0,1.3,.75,1.7)});
    for(let i=0;i<26;i++){ const a=i/26*TAU, l=.42+(i%3)*.08; list.push({geo:cyl(.016,.012,l,i%2?'#5a4632':'#776048',4),m:M4(n.x+Math.cos(a)*.38,n.y+.07+(i%3)*.03,n.z+Math.sin(a)*.38,PI/2,a+PI/2+.35,(i%5-2)*.12)}); }
    list.push({geo:ell(.38,.09,.38,'#3c3024'),m:M4(n.x,n.y+.04,n.z)});
    streaks(list,V(n.x-.1,n.y-.75,n.z-.72),.1,2.6,6);
    dangle(list,V(n.x+.35,n.y+.06,n.z-.3),.3,.9);
    addPiece(list,'island',V(n.x,n.y,n.z),140);
    const s=new THREE.Sprite(new THREE.SpriteMaterial({map:G.tex.soft,color:0xb48cff,transparent:true,opacity:.6,depthWrite:false,blending:THREE.AdditiveBlending}));
    s.scale.setScalar(.9); s.position.set(n.x,n.y+.24,n.z); G.scene.add(s); DYN.nestGlint=s; }
}
function buildCave(){
  if(!CAVE)return;
  const list=[], at=SP.crack.at;
  // the crack: a fox-sized black split at the foot of the west wall
  list.push({geo:paintGeo(new THREE.ConeGeometry(.3,1.1,4),'#050405'),m:M4(at.x+.02,at.y+.2,at.z,0,0,0,1,1,.35)});
  list.push({geo:box(.5,.3,.12,'#050405'),m:M4(at.x+.02,at.y-.05,at.z,0,PI/2,0)});
  scratches(list,V(at.x+.15,at.y+.35,at.z+.42),PI/2,{len:.26}); furTuft(list,V(at.x+.25,at.y-.1,at.z-.3));
  // the ledge above, and the rock under it
  const L=cw(-5.95,4.3,-14.7); SP.crack.ledge=L;
  const fl=CAVE.floorVis?CAVE.floorVis(-5.95,-14.7)+60:L.y-2.9;
  list.push({geo:paintGeo(new THREE.CylinderGeometry(1,1.15,.5,9),'#5e5a55',(x,y,z,c)=>c.multiplyScalar(.8+.35*U.vnoise(x*4,z*4))),m:M4(L.x,L.y-.25,L.z)});
  list.push({geo:paintGeo(new THREE.DodecahedronGeometry(1,1).scale(.8,(L.y-fl)/2,.9),'#4c4844',(x,y,z,c)=>c.multiplyScalar(.75+.3*U.vnoise(x*5,y*5))),m:M4(L.x-.35,(L.y+fl)/2-.25,L.z)});
  addPiece(list,'cave',L,60);
  G.addCollider({x:L.x-.2,z:L.z,r:.95,y0:fl-2,y1:L.y-.4});
  G.floorProviders.push((x,z,y)=>{ const dx=x-L.x, dz=z-L.z; if(dx*dx+dz*dz>.92*.92)return null; return L.y<=y+.05?L.y:null; });
  (G.walkOverrides||[]).push((x,z)=>{ const dx=x-L.x, dz=z-L.z; if(dx*dx+dz*dz<=.92*.92&&G.player&&G.player.pos&&Math.abs(G.player.pos.y-L.y)<1.2)return true; return null; });
  // the rope ladder (rolled up on the ledge until Ember pulls the rope)
  const lad=new THREE.Group(); lad.position.set(L.x+.82,L.y,L.z); G.scene.add(lad);
  const rungs=[]; for(let i=0;i<9;i++)rungs.push({geo:cyl(.02,.02,.42,'#8a6a46',5),m:M4(0,-.15-i*.32,0,0,0,PI/2)});
  rungs.push({geo:cyl(.014,.014,2.95,'#b59b6a',4),m:M4(-.2,-1.47,0)},{geo:cyl(.014,.014,2.95,'#b59b6a',4),m:M4(.2,-1.47,0)});
  const ladM=new THREE.Mesh(mergeStatic(rungs),VC()); ladM.rotation.y=PI/2; lad.add(ladM);
  const roll=new THREE.Mesh(paintGeo(new THREE.CylinderGeometry(.12,.12,.48,8),'#8a6a46'),VC()); roll.rotation.z=PI/2; roll.rotation.y=PI/2; roll.position.set(-.12,.1,0); lad.add(roll);
  DYN.ladder=lad; DYN.ladderMesh=ladM; DYN.ladderRoll=roll;
  const b=new THREE.Mesh(mergeStatic([{geo:ell(.2,.15,.17,'#a8855a')},{geo:cone(.05,.1,'#8a6a46',6),m:M4(0,.15,0)}]),VC());
  b.position.set(L.x-.3,L.y+.14,L.z+.15); G.scene.add(b); DYN.ledgeBundle=b;
}
function buildUndercroft(){
  if(!UC)return;
  const list=[], at=SP.bell.at, by=at.y+.42;
  // a timber beam between the nave's middle pillars, high under the vault
  const a=uw(-26.5,0,-48), b=uw(-17.5,0,-48);
  list.push({geo:box(9.2,.26,.3,'#4a3526',(x,y,z,c)=>c.multiplyScalar(.85+.3*U.vnoise(x*6,z))),m:M4((a.x+b.x)/2,by,a.z)});
  list.push({geo:cyl(.02,.02,.24,'#2c2a30',4),m:M4(at.x,by-.2,at.z)});
  streaks(list,V(at.x+1.1,by-.13,at.z+.16),0,.7,4);
  streaks(list,V(b.x+.43,by-.3,b.z+.1),PI/2,1.6,3);
  dangle(list,V(at.x-.8,by-.13,at.z),.34,.4);
  addPiece(list,'undercroft',at,60);
  const bell=new THREE.Group(); bell.position.set(at.x,by-.3,at.z); G.scene.add(bell);
  const bm=new THREE.Mesh(mergeStatic([{geo:paintGeo(new THREE.CylinderGeometry(.06,.15,.22,12,1,true),'#b8913f'),m:M4(0,-.12,0)},{geo:mirrorX(paintGeo(new THREE.CylinderGeometry(.055,.145,.21,12,1,true),'#4a3a1e')),m:M4(0,-.12,0)},
    {geo:ell(.06,.03,.06,'#b8913f',null,10),m:M4(0,-.01,0)},{geo:ell(.03,.03,.03,'#5a4a2a',null,6),m:M4(0,-.21,0)}]),G.toon('#ffffff',{vertexColors:true,side:THREE.DoubleSide}));
  bell.add(bm); DYN.bell=bell;
}

/* ================================================================ 5. WHERE THE PLAYER IS */
const lhInside=p=>{ const L=G.world&&G.world.lighthouse; return !!(L&&L.inside&&L.inside(p)); };
const inCave=()=>!!(G.cave&&G.cave.inside), inUC=()=>!!(G.undercroft&&G.undercroft.inside);
const interior=()=>inCave()||inUC();
const placeNow=()=>inCave()?'cave':inUC()?'undercroft':'island';
const finale=()=>!!(G.finaleBoss&&G.finaleBoss.active);
function bossFight(){
  const B=G.monsters&&G.monsters.boss; if(B&&B.alive&&!B.dying&&B.state!=='idle'&&B.state!=='guard')return true;
  const CB=G.caveBoss; if(CB&&CB.state&&/fight|rise|surge|lash|intro/.test(CB.state)&&!CB.defeated)return true;
  const UB=G.undercroftBoss; if(UB&&UB.active)return true;
  return finale();
}
function hunted(r){ const p=P().pos; for(const m of (G.monsters&&G.monsters.list)||[]){ if(!m.alive||m.dying||m.boss)continue; if(m.state==='idle'||m.state==='return')continue;
  if(Math.abs(m.pos.x-p.x)<r&&Math.abs(m.pos.z-p.z)<r&&m.pos.distanceTo(p)<r)return true; } return false; }
const waterY=()=>inCave()&&G.cave.waterWorld?G.cave.waterWorld():interior()?-1e9:((G.world&&G.world.tide)||0);
function floorNear(x,z,y){ const f=G.floorAt(x,z,y+.7); return isFinite(f)?f:y; }

/* ---------------------------------------------------------------- the breadcrumb trail (Ember follows your footsteps) */
const TR={p:[],brk:[],seq:0,n:0,last:V(1e9,0,0)};   // ring of the last T.crumbs grounded positions; seq = the next sequence number
for(let i=0;i<T.crumbs;i++){ TR.p.push(V()); TR.brk.push(false); }
const crumb=k=>TR.p[((k%T.crumbs)+T.crumbs)%T.crumbs];
const crumbBrk=k=>TR.brk[((k%T.crumbs)+T.crumbs)%T.crumbs];
const oldest=()=>TR.seq-TR.n;
function trailReset(p){ TR.n=0; TR.seq=0; trailPush(p,false); }
function trailPush(p,brk){ const i=TR.seq%T.crumbs; TR.p[i].copy(p); TR.brk[i]=!!brk; TR.seq++; TR.n=Math.min(T.crumbs,TR.n+1); TR.last.copy(p); }
function trailUpdate(){
  const p=P(); if(!p||!p.pos)return;
  if(p.grounded===false)return;
  const d=Math.hypot(p.pos.x-TR.last.x,p.pos.z-TR.last.z);
  if(d<T.crumbStep&&Math.abs(p.pos.y-TR.last.y)<.5)return;
  const rise=p.pos.y-TR.last.y, brk=d>T.breakGap||rise>T.breakRise||rise<-T.maxDrop;
  trailPush(p.pos,brk);
}

/* ================================================================ 6. EMBER — the brain */
const E={on:false,pos:V(),heading:0,speed:0,phase:0,opa:0,fade:0,mode:'off',still:0,ci:0,t:0,vy:0,
  k:{sit:0,lie:0,carry:0,squeeze:0,swim:0,alert:0,bark:0,nip:0},task:null,taskT:0,nipT:0,nipCD:0,target:null,hopT:-1,awayT:0,barkT:-1,carry:null,waitAt:V(),_tw:V()};
function emberShow(){ if(!EM){ EM=buildFox(); if(!EM)return false; G.scene.add(EM.root); } return true; }
function emberPlace(p,yaw){ E.pos.copy(p); if(yaw!=null)E.heading=yaw; E.ci=TR.seq; E.speed=0; }
/** where Ember can reappear unseen: a crumb a few metres back along your route, off screen; else a point behind the camera */
function hiddenSpot(out,minD=4,maxD=14){
  const p=P().pos;
  for(let k=TR.seq-1;k>=oldest();k--){ const c=crumb(k), d=c.distanceTo(p); if(d<minD)continue; if(d>maxD)break; if(!onScreen(c)){ out.copy(c); return k; } }
  // behind the camera, on the same floor
  const cam=G.camera; _a.set(p.x-cam.position.x,0,p.z-cam.position.z); if(_a.lengthSq()<1e-4)_a.set(0,0,1); _a.normalize();
  for(const dist of [7,9,5.5]) for(const da of [0,.5,-.5,1,-1]){ const ca=Math.cos(da), sa=Math.sin(da), dx=_a.x*ca-_a.z*sa, dz=_a.x*sa+_a.z*ca;
    const x=p.x-dx*dist, z=p.z-dz*dist, f=floorNear(x,z,p.y); if(Math.abs(f-p.y)>.8)continue; if(!interior()&&G.world.walkable&&!G.world.walkable(x,z))continue;
    out.set(x,f,z); if(!onScreen(out))return -1; }
  return null;
}
function emberAway(){ if(E.mode!=='away'){ E.mode='away'; E.awayT=0; } }
function emberReappear(){
  const p=P().pos, k=hiddenSpot(_b);
  if(k===null){ // nothing hidden: fade in at your side
    const h=P().heading||0; _b.set(p.x-Math.sin(h)*1.6+Math.cos(h)*.8,0,p.z-Math.cos(h)*1.6-Math.sin(h)*.8); _b.y=floorNear(_b.x,_b.z,p.y); if(Math.abs(_b.y-p.y)>.8)_b.copy(p);
    E.opa=0; E.fade=1; }
  else { E.opa=1; E.fade=1; }
  emberPlace(_b,Math.atan2(p.x-_b.x,p.z-_b.z)); E.ci=k!=null&&k>=0?k+1:TR.seq; E.mode='follow'; E.still=0;
}
function setPoseTo(key,v,rate,dt){ E.k[key]+=(v-E.k[key])*Math.min(1,dt*rate); }
function emberStep(dt){
  const p=P(); if(!E.on||!EM)return;
  E.t+=dt; E.nipCD=Math.max(0,E.nipCD-dt);
  const pp=p.pos, moving=Math.hypot(p.vel?p.vel.x:0,p.vel?p.vel.z:0)>.4;
  E.still=moving?0:E.still+dt;
  const alert=bossFight()||hunted(15);
  let want=null, wantSpeed=0, face=null;
  // --- modes
  if(E.mode==='away'&&(lhInside(pp)||finale())){ E.mode='wait'; E.opa=0; E.pos.set(1e6,0,0); }
  if(E.mode==='away'){ E.awayT+=dt; E.fade=0;
    if(E.opa<=.01&&E.awayT>.4&&!lhInside(pp)&&!finale()&&p.alive!==false&&p.grounded!==false)emberReappear(); }
  else if(lhInside(pp)||finale()){ // wait outside: by the tower door, or out of the fight by the cottage
    const L=G.world.lighthouse; if(finale())E.waitAt.set(155.4,42.2,19.6); else if(L&&L.doorOut){ E.waitAt.copy(L.doorOut); E.waitAt.x-=1.2; E.waitAt.z+=1.4; }
    if(E.pos.distanceTo(E.waitAt)>40){ if(!onScreen(E.pos))emberPlace(E.waitAt,0); else E.fade=0; }
    if(E.opa<.02&&E.pos.distanceTo(E.waitAt)>1)emberPlace(E.waitAt,0);
    E.fade=1; want=E.waitAt; wantSpeed=E.pos.distanceTo(E.waitAt)>1.2?T.trot:0; if(!wantSpeed)face=Math.atan2(pp.x-E.pos.x,pp.z-E.pos.z); E.mode='wait'; }
  else if(E.mode==='wait'){ E.mode='follow'; E.ci=TR.seq; if(E.pos.distanceTo(pp)>12)emberAway(); }
  else if(E.mode==='task')return taskStepEmber(dt);
  else if(E.mode==='nip'){ const m=E.target; E.nipT+=dt;
    if(!m||!m.alive||m.dying||E.nipT>.9){ E.mode='follow'; E.ci=TR.seq; }
    else { want=m.pos; wantSpeed=12; face=Math.atan2(m.pos.x-E.pos.x,m.pos.z-E.pos.z);
      if(Math.hypot(m.pos.x-E.pos.x,m.pos.z-E.pos.z)<(m.hb?m.hb.radius:.5)+.55){ const did=G.monsters&&G.monsters.interrupt&&G.monsters.interrupt(m);
        G.emit('companion:nip',{kind:m.kind,interrupted:!!did}); sfx('nip',E.pos); E.k.nip=1; E.hopT=0; E.mode='follow'; E.ci=TR.seq; E.target=null; } } }
  else if(E.mode==='heel'){ want=_c.set(pp.x-Math.sin(p.heading||0)*1.1+Math.cos(p.heading||0)*.7,pp.y,pp.z-Math.cos(p.heading||0)*1.1-Math.sin(p.heading||0)*.7);
    wantSpeed=T.run; if(E.pos.distanceTo(want)<.5||E.taskT>3){ E.mode='follow'; E.ci=TR.seq; E.still=T.sitAfter; } E.taskT+=dt; }
  if(E.mode==='follow'){
    // too far, or the way is broken (a climb, a glide): catch up out of sight
    const dP=E.pos.distanceTo(pp);
    if(dP>T.catchUp||(E.ci<oldest()&&dP>6)){ if(!onScreen(E.pos)||E.opa<.02){ E.opa=0; emberAway(); } else E.fade=0; }
    // walk the crumbs: the crumb at heel distance behind you is the goal
    let goalK=TR.seq-1, acc=0;
    for(let k=TR.seq-1;k>Math.max(oldest(),E.ci);k--){ acc+=crumb(k).distanceTo(crumb(k-1)); if(acc>=(alert?4.5:T.heel)){ goalK=k-1; break; } goalK=k-1; }
    if(E.ci<oldest())E.ci=oldest();
    while(E.ci<goalK&&Math.hypot(crumb(E.ci).x-E.pos.x,crumb(E.ci).z-E.pos.z)<.45)E.ci++;
    if(E.ci<=goalK&&crumbBrk(E.ci)&&Math.hypot(crumb(E.ci).x-E.pos.x,crumb(E.ci).z-E.pos.z)<3){ // a step she can't take: wait here, then reappear by you
      want=null; wantSpeed=0; face=Math.atan2(pp.x-E.pos.x,pp.z-E.pos.z); if(dP>6&&!onScreen(E.pos))emberAway(); else if(dP>9)E.fade=0; }
    else if(dP>(alert?4.2:T.heel+.6)||E.ci<goalK){
      const c=crumb(Math.min(E.ci,goalK)); want=c;
      let rem=0; for(let k=E.ci;k<TR.seq-1;k++)rem+=crumb(k).distanceTo(crumb(k+1)); rem+=Math.hypot(c.x-E.pos.x,c.z-E.pos.z);
      wantSpeed=clamp((rem-T.heel)*1.6+1.2,0,T.run*(p.sprinting?T.sprintBoost:1)); if(wantSpeed<1.2&&rem>T.heel+.3)wantSpeed=1.2;
    } else if(E.still>.5){ face=Math.atan2(pp.x-E.pos.x,pp.z-E.pos.z); }
    // a shove sideways: stand a little to one side of you, never in your path
    if(!want&&dP<1.1){ _c.set(E.pos.x-pp.x,0,E.pos.z-pp.z); if(_c.lengthSq()<1e-4)_c.set(Math.cos(p.heading||0),0,-Math.sin(p.heading||0)); _c.normalize(); want=_d.set(pp.x+_c.x*1.4,pp.y,pp.z+_c.z*1.4); wantSpeed=2.4; }
    // combat help: a nip at whatever is winding up to hit you
    if(E.nipCD<=0&&alert&&E.opa>.9)tryNip();
  }
  // --- movement
  const sp0=E.speed; E.speed+=(wantSpeed-E.speed)*Math.min(1,dt*(wantSpeed>E.speed?5:7));
  if(want){ const dx=want.x-E.pos.x, dz=want.z-E.pos.z, d=Math.hypot(dx,dz);
    if(d>.05){ const hd=Math.atan2(dx,dz); E.heading=U.dampAngle?U.dampAngle(E.heading,hd,E.speed>4?10:7,dt):E.heading+U.angDiff(hd,E.heading)*Math.min(1,dt*8);
      const st=Math.min(d,E.speed*dt), ca=Math.cos(U.angDiff(hd,E.heading)); E.pos.x+=dx/d*st*Math.max(.2,ca); E.pos.z+=dz/d*st*Math.max(.2,ca); }
    else E.speed=Math.min(E.speed,.5); }
  else if(face!=null){ E.heading=U.dampAngle?U.dampAngle(E.heading,face,4,dt):face; E.speed*=Math.exp(-dt*8); }
  // ground + water
  const f=floorNear(E.pos.x,E.pos.z,E.pos.y), wy=waterY(), swim=f<wy-.25;
  const targetY=swim?wy-.32:f;
  if(E.pos.y>targetY+.05){ E.vy-=22*dt; E.pos.y=Math.max(targetY,E.pos.y+E.vy*dt); } else { E.pos.y=U.damp?U.damp(E.pos.y,targetY,18,dt):targetY; E.vy=0; }
  if(E.pos.y<targetY-.6)E.pos.y=targetY;
  // --- poses
  const sit=E.mode!=='nip'&&!alert&&E.speed<.3&&(E.still>T.sitAfter||E.mode==='wait')&&!swim, lie=sit&&E.still>T.lieAfter&&E.mode!=='wait';
  setPoseTo('sit',sit&&!lie?1:0,4,dt); setPoseTo('lie',lie?1:0,2.5,dt); setPoseTo('swim',swim?1:0,6,dt); setPoseTo('alert',alert?1:0,4,dt);
  setPoseTo('carry',E.carry?1:0,8,dt); setPoseTo('squeeze',0,5,dt); E.k.nip=Math.max(0,E.k.nip-dt*3); E.k.bark=Math.max(0,E.k.bark-dt*2.5);
  void sp0;
  emberDraw(dt);
}
function tryNip(){
  const p=P().pos; let best=null, bd=1e9;
  for(const m of (G.monsters&&G.monsters.list)||[]){ if(!m.alive||m.dying||m.boss||m.state!=='windup'||m.raid)continue;
    const d=Math.hypot(m.pos.x-p.x,m.pos.z-p.z); if(d>T.nipRange)continue; if(Math.abs(m.pos.y-p.y)>2.5)continue; if(d<bd){bd=d;best=m;} }
  if(!best||Math.hypot(best.pos.x-E.pos.x,best.pos.z-E.pos.z)>T.nipRange+2)return false;
  E.mode='nip'; E.target=best; E.nipT=0; E.nipCD=T.nipCD; return true;
}
const OFF_G=[0,.35,PI,PI+.35], OFF_W=[0,PI,PI*.85,PI*1.85];
/* the pose: walk cycle + blended sit / lie / swim / carry / squeeze / bark / nip */
function emberDraw(dt){
  const R=EM, B=R.bones, sp=R.sp, k=E.k, t=E.t;
  // fade
  const tgt=E.mode==='away'?0:E.fade; E.opa+=(tgt-E.opa)*Math.min(1,dt*(tgt>E.opa?3.5:4.5)); if(Math.abs(E.opa-tgt)<.01)E.opa=tgt;
  setOpacity(R,E.opa);
  R.root.position.copy(E.pos); R.root.rotation.y=E.heading;
  const S0=E.speed, walk=1.6, amp=Math.min(1,S0/walk)*(S0>walk*2.2?.85:.5)*(1-k.sit)*(1-k.lie);
  E.phase+=dt*Math.min(S0,9)*(S0>5?3.1:4.4)/Math.max(.4,.36)*.6;
  const ph=E.phase, gallop=S0>5;
  const off=gallop?OFF_G:OFF_W;
  // body
  let by=sp.bodyY+(S0>.1?Math.abs(Math.sin(ph))*.035*(gallop?1.8:1):Math.sin(t*1.4)*.004);
  let bx=(S0>.1?Math.sin(ph*2)*.02*(gallop?3:1):0);
  by=lerp(by,sp.bodyY-.09,k.sit); bx=lerp(bx,-.62,k.sit);
  by=lerp(by,sp.bodyY-.27,k.lie); bx=lerp(bx,.02,k.lie);
  by=lerp(by,sp.bodyY-.16,k.squeeze); by=lerp(by,sp.bodyY-.05,k.swim); bx=lerp(bx,-.18,k.swim);
  B.body.position.y=by; B.body.rotation.x=bx; B.body.rotation.z=Math.sin(t*45)*.02*k.nip;
  B.body.scale.set(1+.12*k.squeeze,1-.28*k.squeeze,1+.06*k.squeeze);
  // legs
  if(!R.legs)R.legs=[B.leg0,B.leg1,B.leg2,B.leg3]; const legs=R.legs;
  for(let i=0;i<4;i++){ let a=Math.sin(ph+off[i])*amp; const front=i<2;
    a=lerp(a,front?.6:-1.15,k.sit); a=lerp(a,front?-1.35:-1.05,k.lie); a=lerp(a,Math.sin(t*9+off[i])*.7,k.swim); a=lerp(a,front?-1.2:1.1,k.squeeze);
    legs[i].rotation.x=a; legs[i].rotation.z=front&&k.lie>.5?(i?-.12:.12)*k.lie:0; }
  // neck + head: alert ears-forward, sniffing while walking, looking at you while sitting, head up with something in the mouth
  const pp=P().pos, look=Math.atan2(pp.x-E.pos.x,pp.z-E.pos.z), la=clamp(U.angDiff(look,E.heading),-.9,.9);
  let nx=(S0>.1?-.05:Math.sin(t*.6)*.04)-(gallop?.15:0), hx=0, hy=Math.sin(t*.5)*.2*(1-k.alert);
  nx=lerp(nx,-.35,k.alert*.6); hy=lerp(hy,0,k.alert*.6);
  nx=lerp(nx,.25,k.sit); hx=lerp(hx,.25,k.sit); hy=lerp(hy,la*.8,Math.max(k.sit,k.lie*.6));
  nx=lerp(nx,.85,k.lie); hx=lerp(hx,-.55,k.lie);
  nx=lerp(nx,-.5,k.carry); hx=lerp(hx,.15,k.carry);
  nx=lerp(nx,-.55,k.swim); hx=lerp(hx,.35,k.swim);
  nx=lerp(nx,.55,k.squeeze); hx=lerp(hx,-.4,k.squeeze);
  nx+= -k.bark*.35*Math.abs(Math.sin(t*28)); nx+=k.nip*.4;
  B.neck.rotation.x=nx; B.head.rotation.x=hx; B.head.rotation.y=hy; B.head.rotation.z=Math.sin(t*.9)*.08*k.sit;
  // tail: streams behind at a run, wags while you're near, curls round her when lying
  B.tail.rotation.x=lerp(Math.sin(t*2.2)*.08+(gallop?-.45:0),.75,Math.max(k.sit*.7,k.lie));
  B.tail.rotation.y=lerp(Math.sin(t*(k.sit>.5?6:3))*(.18+.2*k.sit),1.25,k.lie);
  // the thing in her mouth
  if(R.carryKind!==E.carry){ R.carryKind=E.carry; carryItem(E.carry); }
  // a dodge hop
  if(E.hopT>=0){ E.hopT+=dt; const h=Math.sin(Math.min(1,E.hopT/.35)*PI)*.32; R.root.position.y+=h; if(E.hopT>.35)E.hopT=-1; }
}

/* ================================================================ 7. CORVIN — the brain */
const C={on:false,pos:V(),vel:V(),heading:0,bank:0,pitch:0,opa:0,fade:0,mode:'off',t:0,still:0,flap:0,flapPh:0,glideT:0,
  perch:V(),perchK:null,perchT:0,shoulderT:0,ground:false,landK:0,k:{fold:1,flare:0,hop:0,look:0,alert:0},task:null,taskT:0,
  diveCD:0,target:null,diveT:0,scoutT:-1,scoutA:0,cawT:0,warned:new Set(),warned2:new Set(),warnCD:0,hopT:-1,awayT:0,ride:false,tgt:V(),_v:V()};
function ravenShow(){ if(!CV){ CV=buildRaven(); G.scene.add(CV.root); } return true; }
function shoulderPos(out){ const p=P(), h=p.heading||0; // the left shoulder (the staff rides on the right)
  return out.set(p.pos.x+Math.cos(h)*.21+Math.sin(h)*.02,p.pos.y+1.18,p.pos.z-Math.sin(h)*.21+Math.cos(h)*.02); }
/** somewhere to land near you: a post, a rock, a stone top (collider tops), else the grass beside you */
function findPerch(out){
  const p=P().pos; let best=null, bs=-1e9;
  if(G.collidersNear){ for(const dx of [-6,0,6])for(const dz of [-6,0,6]) for(const c of G.collidersNear(p.x+dx,p.z+dz)){
    if(c.y1==null||!isFinite(c.y1)||c.r>1.4)continue; const g=floorNear(c.x,c.z,c.y1-1), top=c.y1, hgt=top-H(c.x,c.z);
    if(hgt<.35||hgt>4.5)continue; const d=Math.hypot(c.x-p.x,c.z-p.z); if(d<1.5||d>T.perchR)continue;
    const s=-Math.abs(d-4)+Math.random()*1.5; if(s>bs){ bs=s; best=c; void g; } } }
  if(best){ const top=G.floorAt(best.x,best.z,best.y1+.6); out.set(best.x,Math.abs(top-best.y1)<.7?top:best.y1-.05,best.z); return 'post'; }
  const a=Math.random()*TAU, x=p.x+Math.cos(a)*2.6, z=p.z+Math.sin(a)*2.6, f=floorNear(x,z,p.y);
  if(Math.abs(f-p.y)<1&&(interior()||!G.world.walkable||G.world.walkable(x,z))&&f>waterY()+.1){ out.set(x,f,z); return 'ground'; }
  return null;
}
function ravenAway(){ if(C.mode!=='away'){ C.mode='away'; C.awayT=0; } }
function ravenReappear(){ // out of sight: high behind the camera, then it flies in
  const cam=G.camera, p=P().pos; _a.set(cam.position.x-p.x,0,cam.position.z-p.z); if(_a.lengthSq()<1e-4)_a.set(0,0,1); _a.normalize();
  if(interior()){ shoulderPos(C.pos); C.mode='shoulder'; C.opa=0; C.fade=1; C.shoulderT=0; return; }
  C.pos.set(cam.position.x+_a.x*4,cam.position.y+7,cam.position.z+_a.z*4); C.vel.set(-_a.x*4,0,-_a.z*4); C.opa=1; C.fade=1; C.mode='fly';
}
function ravenStep(dt){
  const p=P(); if(!C.on||!CV)return;
  C.t+=dt; C.diveCD=Math.max(0,C.diveCD-dt); C.warnCD=Math.max(0,C.warnCD-dt); C.cawT=Math.max(0,C.cawT-dt);
  const pp=p.pos, moving=Math.hypot(p.vel?p.vel.x:0,p.vel?p.vel.z:0)>.4; C.still=moving?0:C.still+dt;
  const alert=bossFight(); C.k.alert+=((alert||hunted(15)?1:0)-C.k.alert)*Math.min(1,dt*3);
  if(C.scoutT>=0)return scoutStep(dt);
  if(C.mode==='task')return taskStepRaven(dt);
  // wait outside the tower / out of the finale
  if(lhInside(pp)||finale()){ const L=G.world.lighthouse;
    if(finale())_b.set(156.6,42.2,19.4); else if(L&&L.doorOut)_b.set(L.doorOut.x-2,L.doorOut.y,L.doorOut.z+.5);
    _b.y=floorNear(_b.x,_b.z,_b.y);
    if(C.mode==='away'||C.pos.distanceTo(_b)>45){ C.pos.copy(_b); C.pos.y+=6; C.mode='land'; C.opa=onScreen(_b)?0:1; }
    if(C.mode!=='perch'||C.perch.distanceTo(_b)>.3){ C.perch.copy(_b); C.perchK='ground'; if(C.mode!=='land')C.mode='land'; }
    C.fade=1; C.waiting=true; }
  else if(C.waiting){ C.waiting=false; C.mode='fly'; C.vel.y=3; }
  if(C.mode==='away'){ C.awayT+=dt; if(C.opa<=.01&&C.awayT>.3&&!lhInside(pp)&&!finale())ravenReappear(); ravenDraw(dt); return; }
  if(C.mode==='ride')return rideStep(dt);
  const dP=C.pos.distanceTo(pp);
  if(dP>T.catchUp&&!C.waiting){ if(!onScreen(C.pos)||C.opa<.02){ C.opa=0; ravenAway(); ravenDraw(dt); return; } C.fade=0; }
  else C.fade=1;
  // the cave raft: Corvin rides the lantern while it drifts
  const R=G.cavePuzzles&&G.cavePuzzles.raft;
  if(inCave()&&R&&R.lantern&&(R.state==='drifting'||R.state==='loaded')&&R.pos&&R.pos.distanceTo(pp)<26&&C.mode!=='dive'){ C.mode='ride'; C.rideK=0; return rideStep(dt); }
  // in the dark close places it keeps to your shoulder
  if(interior()&&C.mode!=='dive'&&C.mode!=='shoulder'&&C.mode!=='toShoulder'){ C.mode='toShoulder'; }
  // combat help: a dive at whatever has fixed on you
  if(C.diveCD<=0&&C.mode!=='dive'&&!C.waiting&&C.opa>.9)tryDive();
  // the dark: a caw when something hostile comes within 15 m
  darkWarn();
  switch(C.mode){
    case 'fly':{
      const h=p.heading||0, a=C.t*.33, rr=alert?5:3.2, ht=(alert?9:T.flyMin+(T.flyMax-T.flyMin)*(.5+.5*Math.sin(C.t*.41)));
      C.tgt.set(pp.x-Math.sin(h)*T.flyBehind+Math.cos(a)*rr,pp.y+ht,pp.z-Math.cos(h)*T.flyBehind+Math.sin(a)*rr);
      fly(dt,C.tgt,T.flySpeed+(p.sprinting?4:0));
      if(C.still>T.perchAfter&&!alert){ const k=Math.random()<T.shoulderChance?'shoulder':findPerch(C.perch); if(k==='shoulder'){ C.mode='toShoulder'; } else if(k){ C.perchK=k; C.mode='land'; } else C.still=-2; }
      break; }
    case 'land':{ // approach from above, flare, settle
      _b.copy(C.perch); const d=Math.hypot(_b.x-C.pos.x,_b.z-C.pos.z);
      _b.y+=Math.min(2.5,d*.6);
      fly(dt,_b,Math.max(3,Math.min(T.flySpeed,d*2.2+1)),true);
      C.k.flare=smooth(3,.4,C.pos.distanceTo(C.perch));
      if(C.pos.distanceTo(C.perch)<.25||(d<.3&&Math.abs(C.pos.y-C.perch.y)<.35)){ C.pos.copy(C.perch); C.vel.set(0,0,0); C.mode='perch'; C.perchT=0; }
      if(!C.waiting&&(moving&&C.still<.1&&p.pos.distanceTo(C.perch)>T.perchR))C.mode='fly';
      break; }
    case 'perch':{
      C.perchT+=dt; C.vel.set(0,0,0); C.pos.copy(C.perch);
      C.heading=U.dampAngle(C.heading,Math.atan2(pp.x-C.pos.x,pp.z-C.pos.z)+Math.sin(C.t*.3)*.5,2,dt);
      if(C.perchK==='ground'&&C.hopT<0&&Math.random()<dt*.25)C.hopT=0;
      if(!C.waiting&&(C.pos.distanceTo(pp)>T.perchR+1.5||(moving&&C.perchT>1&&C.pos.distanceTo(pp)>5))){ C.mode='fly'; C.vel.y=4; }
      break; }
    case 'toShoulder':{
      shoulderPos(_b); const d=C.pos.distanceTo(_b);
      if(C.opa<.05){ C.pos.copy(_b); }
      fly(dt,_b,Math.max(4,Math.min(T.flySpeed+6,d*3+2)),true); C.k.flare=smooth(2,.3,d);
      if(d<.18){ C.mode='shoulder'; C.shoulderT=0; }
      break; }
    case 'shoulder':{
      shoulderPos(C.pos); C.vel.set(0,0,0); C.shoulderT+=dt;
      C.heading=U.dampAngle(C.heading,(p.heading||0)+Math.sin(C.t*.4)*.6,5,dt);
      const off=!interior()&&(p.sprinting||p.grounded===false||(p.move&&p.move.id)||alert||(moving&&C.shoulderT>10+Math.sin(C.t)*4));
      if(off||p.alive===false){ C.mode='fly'; C.vel.set(Math.sin(p.heading||0)*3,4,Math.cos(p.heading||0)*3); C.pos.y+=.1; }
      break; }
    case 'dive':{
      const m=C.target; C.diveT+=dt;
      if(!m||!m.alive||m.dying||C.diveT>1.6){ C.mode=interior()?'toShoulder':'fly'; C.vel.y=5; break; }
      _b.set(m.pos.x,m.pos.y+(m.hb&&m.hb.height?m.hb.height*.75:1.2),m.pos.z);
      fly(dt,_b,17,false,true);
      if(C.pos.distanceTo(_b)<.75){ const did=G.monsters&&G.monsters.delay&&G.monsters.delay(m,T.diveDelay); G.emit('companion:dive',{kind:m.kind,delayed:!!did}); sfx('caw',C.pos,1.3);
        C.mode=interior()?'toShoulder':'fly'; C.vel.set(-C.vel.x*.4,7,-C.vel.z*.4); C.target=null; }
      break; }
  }
  ravenDraw(dt);
}
/** steer toward a point (flight). land: slow onto it; dive: no altitude floor */
function fly(dt,to,maxS,land,dive){
  _a.subVectors(to,C.pos); const d=_a.length();
  const want=Math.min(maxS,land?d*2.5+.5:Math.max(2.5,d*1.6));
  if(d>1e-3)_a.multiplyScalar(want/d);
  C.vel.lerp(_a,Math.min(1,dt*(land?4.5:dive?5:2.2)));
  C.pos.addScaledVector(C.vel,dt);
  // keep off the ground (and under cave / Undercroft ceilings)
  const f=floorNear(C.pos.x,C.pos.z,C.pos.y); if(!land&&!dive&&C.pos.y<f+.8){ C.pos.y=f+.8; if(C.vel.y<0)C.vel.y*=.3; }
  if(C.pos.y<f+.05)C.pos.y=f+.05;
  if(interior()){ const ceil=inCave()&&G.cave.ceilVis?G.cave.ceilVis(C.pos.x-G.cave.origin.x,C.pos.z-G.cave.origin.z)+G.cave.origin.y:inUC()&&G.undercroft.ceilVis?G.undercroft.ceilVis(C.pos.x-G.undercroft.origin.x,C.pos.z-G.undercroft.origin.z)+G.undercroft.origin.y:1e9;
    if(isFinite(ceil)&&C.pos.y>ceil-.5)C.pos.y=ceil-.5; }
  const hs=Math.hypot(C.vel.x,C.vel.z);
  if(hs>.3){ const hd=Math.atan2(C.vel.x,C.vel.z), turn=U.angDiff(hd,C.heading); C.heading=U.dampAngle(C.heading,hd,6,dt); C.bank+=(clamp(-turn*1.6,-.7,.7)-C.bank)*Math.min(1,dt*4); }
  else C.bank*=Math.exp(-dt*5);
  C.pitch+=(clamp(-Math.atan2(C.vel.y,hs+.5)*.6,-.6,.6)-C.pitch)*Math.min(1,dt*5);
  // flap when climbing / slow / speeding up; glide on the level (a raven's flap-flap-glide)
  const climbing=C.vel.y>.6||hs<3.5||land; C.glideT-=dt;
  if(climbing||C.glideT<-1.6){ C.flap=1; if(!climbing&&C.glideT<-2.4)C.glideT=1.2+Math.random()*1.4; } else if(C.glideT>0)C.flap=0;
}
function tryDive(){
  const p=P().pos; let best=null, bd=1e9;
  for(const m of (G.monsters&&G.monsters.list)||[]){ if(!m.alive||m.dying||m.boss||m.raid)continue;
    if(!(m.state==='chase'||m.state==='windup'||m.state==='stalk'||m.state==='circle'))continue; if(m.state==='chase'&&m.cool!=null&&m.cool>1.2)continue;
    const d=Math.hypot(m.pos.x-p.x,m.pos.z-p.z); if(d>T.diveRange||Math.abs(m.pos.y-p.y)>3)continue; if(d<bd){bd=d;best=m;} }
  if(!best)return false;
  C.mode='dive'; C.target=best; C.diveT=0; C.diveCD=T.diveCD; return true;
}
function darkWarn(){
  const dark=interior()||(G.atmo&&G.atmo.dark>.5); const p=P().pos;
  const now=C.warned2; now.clear();
  for(const m of (G.monsters&&G.monsters.list)||[]){ if(!m.alive||m.dying)continue; if(Math.abs(m.pos.x-p.x)>T.warnR||Math.abs(m.pos.z-p.z)>T.warnR)continue; if(m.pos.distanceTo(p)<T.warnR)now.add(m); }
  if(dark&&C.warnCD<=0){ for(const m of now) if(!C.warned.has(m)){ C.warnCD=6; sfx('caw',C.pos); C.k.look=1; G.emit('companion:caw',{why:'warn',kind:m.kind}); break; } }
  C.warned2=C.warned; C.warned=now;
}
/* the cave raft: Corvin rides the lantern while the moths do */
function rideStep(dt){
  const R=G.cavePuzzles&&G.cavePuzzles.raft, pp=P().pos;
  if(!inCave()||!R||!R.lantern||R.state==='done'||!R.pos||R.pos.distanceTo(pp)>30){ C.mode='fly'; C.vel.y=3; ravenDraw(dt); return; }
  _b.set(R.pos.x+.35,(R.deckY||R.pos.y)+.02,R.pos.z-.25);
  if(C.rideK<1){ fly(dt,_b,9,true); C.k.flare=smooth(2,.3,C.pos.distanceTo(_b)); if(C.pos.distanceTo(_b)<.2)C.rideK=1; }
  else { C.pos.copy(_b); C.vel.set(0,0,0); C.heading=U.dampAngle(C.heading,Math.atan2(pp.x-C.pos.x,pp.z-C.pos.z),2,dt); C.ground=true; }
  ravenDraw(dt);
}
/* the pose */
function ravenDraw(dt){
  const R=CV, B=R.bones, k=C.k, t=C.t;
  const tgt=C.mode==='away'?0:C.fade; C.opa+=(tgt-C.opa)*Math.min(1,dt*(tgt>C.opa?3.5:4.5)); if(Math.abs(C.opa-tgt)<.01)C.opa=tgt;
  setOpacity(R,C.opa);
  const sitting=C.mode==='perch'||C.mode==='shoulder'||(C.mode==='ride'&&C.rideK>=1)||(C.mode==='task'&&C.sat);
  k.fold+=((sitting?1:0)-k.fold)*Math.min(1,dt*(sitting?5:9));
  if(!sitting){ C.flapPh+=dt*(C.flap?10.5:0); }
  R.root.position.copy(C.pos); R.root.rotation.set(0,C.heading,0);
  // body attitude: level in flight, upright when perched
  const fly=1-k.fold;
  B.body.rotation.x=lerp(-.32,C.pitch*.8,fly)+(C.k.flare*-.5*fly); B.body.rotation.z=C.bank*fly;
  B.body.position.y=lerp(.2,.06,fly);   // in flight the feet aren't the pivot
  // wings: folded quats when sitting; spread with flap / glide otherwise
  const flapA=C.flap?Math.sin(C.flapPh)*.85:Math.sin(t*1.1)*.05, flareA=k.flare*.5;
  for(const s of [1,-1]){ const wb=s>0?B.wingL:B.wingR, hb=s>0?B.handL:B.handR;
    _q.setFromEuler(_eu.set(-flareA*.6,s*flareA*.4,s*(flapA+.12-flareA*.3)));
    _q2.copy(s>0?R.foldL:R.foldR); _q.slerp(_q2,k.fold);
    wb.quaternion.copy(_q); wb.position.x=s*lerp(.075,.098,k.fold); wb.scale.setScalar(Math.max(.001,smooth(.8,.35,k.fold)));
    (s>0?B.foldL:B.foldR).scale.setScalar(Math.max(.001,smooth(.35,.8,k.fold)));
    hb.rotation.set(0,s*(k.fold>.5?-.1:(C.flap?Math.sin(C.flapPh-.9)*.25:.05)),s*(C.flap?Math.sin(C.flapPh-.6)*.5:-.06)*(1-k.fold)); }
  // tail fans a little in flight, bobs when perched
  B.tail.rotation.x=lerp(.25+Math.sin(t*2.1)*.05,.05+C.pitch*.3,fly); B.tail.scale.x=1+.35*fly+.25*k.flare;
  // head: looks about, tilts (curious), looks at you, looks at a threat
  const pp=P().pos, la=clamp(U.angDiff(Math.atan2(pp.x-C.pos.x,pp.z-C.pos.z),C.heading),-1.2,1.2);
  const tilt=Math.sin(t*.7+Math.sin(t*1.9))*.35;
  B.head.rotation.set(lerp(.25,-C.pitch*.7,fly)+k.alert*-.1,lerp(sitting?la*.7+Math.sin(t*.37)*.4:0,0,fly),sitting?tilt:0);
  k.look=Math.max(0,k.look-dt);
  // legs: tucked in flight, forward on landing, a hop now and then on the ground
  const lx=lerp(-B.body.rotation.x,-1.1,fly)+k.flare*.9*fly;
  B.legL.rotation.x=lx; B.legR.rotation.x=lx;
  if(C.hopT>=0){ C.hopT+=dt; const u=Math.min(1,C.hopT/.32); R.root.position.y+=Math.sin(u*PI)*.16; B.wingL.rotation.z+=Math.sin(u*PI)*.4; if(u>=1){ C.hopT=-1; if(C.perchK==='ground'&&C.mode==='perch'){ const a=C.heading+(Math.random()-.5)*1.5; C.perch.x+=Math.sin(a)*.25; C.perch.z+=Math.cos(a)*.25; C.perch.y=floorNear(C.perch.x,C.perch.z,C.perch.y); } } }
  C.k.flare=Math.max(0,C.k.flare-dt*1.5);
}
const _eu=new THREE.Euler();

/* ================================================================ 8. THE RAVEN NEGATIVE (on the standing stones)
   It hops and flaps without a sound. It lifts off before you (or the swarm) come close and settles on another stone, just out
   of reach. A staff hit or a bolt while it perches weakens it: it slumps on its stone for a while, and then the swarm can
   take it (Maren's lantern in Act 1, a baited lantern in the core loop). Freed, it becomes Corvin. */
const RN={custom:true,kind:'raven',pos:V(),center:V(),bite:0,hits:0,dead:false,dying:false,fade:1,preyR:1.6,
  state:'perch',stone:0,from:V(),to:V(),flyT:0,flyDur:1,heading:0,weak:0,dmgN:0,flash:0,t:0,said:{},flee:0,model:null,hb:null};
let stones=[];
function findStones(){
  const st=LM().stones||{x:40,z:-35}, out=[];
  for(let i=0;i<9;i++){ if(i===5)continue; const a=i/9*TAU+.2, x=st.x+Math.cos(a)*8.5, z=st.z+Math.sin(a)*8.5; let top=null;
    for(const c of G.collidersNear(x,z)){ if(Math.hypot(c.x-x,c.z-z)<.3&&c.y1!=null&&isFinite(c.y1)){ top=c.y1; break; } }
    if(top==null)continue; const f=G.floorAt(x,z,top+.8); out.push(V(x,Math.abs(f-top)<.7?f:top-.08,z)); }
  return out.length?out:[V(st.x,H(st.x,st.z)+2.5,st.z)];
}
RN.lure=()=>RN.weak>0&&!RN.dead;
RN.restore=()=>{ RN.dead=true; if(RN.model)RN.model.root.visible=false; if(RN.hb)G.combat.remove(RN.hb); };
function ravenNegInit(){
  stones=findStones(); RN.stone=0; RN.pos.copy(stones[0]); RN.heading=Math.random()*TAU;
  RN.model=buildRavenNeg(); RN.model.root.position.copy(RN.pos); G.scene.add(RN.model.root);
  RN.hb={team:'enemy',pos:RN.pos,radius:.45,height:.7,name:'A raven-shaped hole',lockOffset:.35,corrupt:false,
    get targetable(){ return !RN.dead&&!RN.dying&&RN.state==='perch'; },
    alive:()=>!RN.dead&&!RN.dying&&RN.state==='perch',
    hit:info=>ravenNegHit(info)};
  G.combat.add(RN.hb);
  if(G.creatures&&G.creatures.addCustom)G.creatures.addCustom(RN);
}
function ravenNegHit(info){
  if(RN.dead||RN.dying)return;
  RN.flash=1; RN.dmgN++; if(G.creatures&&G.creatures.ash)G.creatures.ash(RN.center,8,.5);
  if(RN.dmgN>=2&&RN.weak<=0){ RN.weak=30; RN.dmgN=0;
    if(!RN.said.weak){ RN.said.weak=1; G.ui.say('The raven-shape sags on its stone, too tired to lift. If the moths came now, it couldn’t get away.',null,{key:'ravenWeak',portrait:'corvin'}); }
    G.emit('raven:weak',{}); }
  else if(RN.weak>0)RN.weak=Math.max(RN.weak,20);
}
function stoneFarFrom(p){ let best=0, bd=-1; stones.forEach((s,i)=>{ if(i===RN.stone)return; const d=Math.hypot(s.x-p.x,s.z-p.z)+Math.random()*2; if(d>bd){bd=d;best=i;} }); return best; }
function ravenNegStep(dt){
  if(!RN.model||RN.dead)return;
  const p=P(), pp=p&&p.pos, M=RN.model, t=(RN.t+=dt);
  M.root.visible=G.focus.distanceToSquared(RN.pos)<140*140||G.state.mode==='title';
  RN.center.set(RN.pos.x,RN.pos.y+.35,RN.pos.z);
  RN.flash=Math.max(0,RN.flash-dt*3); M.mat.uniforms.uFlash.value=RN.flash*.6;
  if(RN.dying){
    RN.fade-=dt/2.2; const f=Math.max(0,RN.fade); M.mat.uniforms.uFade.value=f; M.eyeM.opacity=f;
    M.root.position.y=RN.pos.y+Math.sin(t*30)*.01;
    if(!C.on&&f<.75&&!RN.realIn){ RN.realIn=true; ravenShow(); C.t=0; C.k.fold=1; }
    if(RN.realIn&&CV&&!C.on){ C.pos.copy(RN.pos); C.perch.copy(RN.pos); C.heading=RN.heading; C.mode='perch'; C.fade=1; ravenDraw(dt);
      C.opa=clamp((.75-f)/.6,0,1); setOpacity(CV,C.opa); }
    if(f<=0){ RN.dying=false; M.root.visible=false; G.combat.remove(RN.hb); if(G.creatures&&G.creatures.freeCustom)G.creatures.freeCustom(RN); else RN.dead=true; earnCorvin(false); }
    return;
  }
  if(RN.bite>2.6&&RN.weak>0){ RN.dying=true; if(G.ink&&G.ink.burst)try{ G.ink.burst(RN.center,{n:16,speed:1.4,size:[.3,.9],up:1.6,embers:10}); }catch(_){} return; }
  RN.weak=Math.max(0,RN.weak-dt); if(RN.weak<=0)RN.bite=Math.max(0,RN.bite-dt*.2);
  const L=G.items&&G.items.lantern, lp=G.creatures&&G.creatures.lanternPos?G.creatures.lanternPos():null;
  const swarmNear=lp&&(G.creatures.lanternCount|0)>3&&L&&L.found&&Math.hypot(lp.x-RN.pos.x,lp.z-RN.pos.z)<9;
  const dP=pp?Math.hypot(pp.x-RN.pos.x,pp.z-RN.pos.z):1e9;
  if(isPlay()&&dP<26&&!RN.said.seen){ RN.said.seen=1; G.ui.say('On the standing stones sits a raven-shaped hole in the dusk. It hops, and flaps, and makes no sound at all.',null,{key:'ravenSeen',portrait:'corvin'}); }
  if(RN.state==='perch'){
    RN.pos.copy(stones[RN.stone]);
    const want=pp?Math.atan2(pp.x-RN.pos.x,pp.z-RN.pos.z):RN.heading; RN.heading=U.dampAngle(RN.heading,want+(RN.weak>0?.4:0)+Math.sin(t*.5)*.4,2,dt);
    const spook=isPlay()&&RN.weak<=0&&(dP<5.2||swarmNear||(p&&p.lockTarget===RN.hb&&dP<9&&Math.random()<dt*.15));
    if(spook){ const to=stoneFarFrom(swarmNear?lp:pp); RN.from.copy(RN.pos); RN.to.copy(stones[to]); RN.stone=to; RN.flyT=0; RN.flyDur=1.1+RN.from.distanceTo(RN.to)*.07; RN.state='fly'; RN.flee++;
      if(RN.flee===2&&!RN.said.flee){ RN.said.flee=1; G.ui.say('It lifts off before you’re close and settles on another stone, just out of reach. Too quick to catch on foot. A bolt from the staff might reach it while it perches.',null,{key:'ravenFlee',portrait:'corvin'}); } }
    else if(Math.random()<dt*.06&&RN.weak<=0&&dP>14){ const to=(RN.stone+1+((Math.random()*(stones.length-1))|0))%stones.length; RN.from.copy(RN.pos); RN.to.copy(stones[to]); RN.stone=to; RN.flyT=0; RN.flyDur=1.4; RN.state='fly'; }
  } else if(RN.state==='fly'){
    RN.flyT+=dt; const u=Math.min(1,RN.flyT/RN.flyDur), e=u*u*(3-2*u);
    RN.pos.lerpVectors(RN.from,RN.to,e); RN.pos.y+=Math.sin(u*PI)*(1.5+RN.from.distanceTo(RN.to)*.12);
    RN.heading=U.dampAngle(RN.heading,Math.atan2(RN.to.x-RN.from.x,RN.to.z-RN.from.z),8,dt);
    if(u>=1){ RN.state='perch'; RN.pos.copy(RN.to); }
  }
  // the look: silent flaps, a hop now and then; slumped when weak
  M.root.position.copy(RN.pos); M.root.rotation.y=RN.heading;
  const flying=RN.state==='fly', weak=RN.weak>0;
  const burst=flying?1:(Math.max(0,Math.sin(t*1.3))**10)*(weak?0:1), fl=flying?Math.sin(t*11)*.9:Math.sin(t*16)*.7;
  const ws=burst>.08?1:.001; M.wL.scale.setScalar(ws); M.wR.scale.setScalar(ws);
  M.wL.rotation.set(0,0,fl+(flying?0:.5)); M.wR.rotation.set(0,0,-fl-(flying?0:.5));
  M.body.rotation.x=flying?.35:(weak?.35:-.05)+Math.sin(t*2)*.03; M.body.position.y=weak?-.08:0;
  M.eyeM.opacity=weak?.35:.6+.4*Math.max(0,Math.sin(t*1.7));
  M.mat.uniforms.uFade.value=1;
}

/* ================================================================ 9. EARNING THEM */
function earnEmber(quiet,at,yaw){
  if(S.ember&&E.on)return; S.ember=true; if(!emberShow())return;
  E.on=true; E.mode='follow'; E.opa=1; E.fade=1;
  const p=P();
  if(at){ emberPlace(at,yaw); }
  else if(p&&p.pos){ const h=p.heading||0; _b.set(p.pos.x+Math.cos(h)*1.1-Math.sin(h)*.6,0,p.pos.z-Math.sin(h)*1.1-Math.cos(h)*.6); _b.y=floorNear(_b.x,_b.z,p.pos.y); if(Math.abs(_b.y-p.pos.y)>1)_b.copy(p.pos); emberPlace(_b,h); }
  if(!quiet){ E.mode='intro'; E.introT=0; moment({who:'ember',name:NM.ember,title:'The fox',portrait:'ember',key:'ember',lines:[{text:'The fox doesn’t run. It sits, and looks at you, and waits.',who:''}]}); }
  refreshUI(); G.emit('companion:earned',{id:'ember',quiet:!!quiet}); if(!quiet)autosave();
}
function earnCorvin(quiet){
  if(S.corvin&&C.on)return; S.corvin=true; ravenShow();
  C.on=true; C.opa=1; C.fade=1; C.vel.set(0,0,0);
  if(RN.model&&!RN.dead){ RN.dead=true; RN.model.root.visible=false; if(RN.hb)G.combat.remove(RN.hb); }
  if(quiet){ C.mode='fly'; ravenReappearNear(); }
  else { C.mode='intro'; C.introT=0; moment({who:'corvin',name:NM.corvin,title:'The raven',portrait:'corvin',key:'corvin',lines:[{text:'The raven lands on your shoulder, light as a glove. It doesn’t leave.',who:''}]}); }
  refreshUI(); G.emit('companion:earned',{id:'corvin',quiet:!!quiet}); if(!quiet)autosave();
}
/* a story beat: the conversation card when it's calm (talk.js), captions (with the portrait) when it isn't */
function moment(o){
  if(G.talk&&G.talk.moment)return G.talk.moment(o);
  o.lines.forEach((l,i)=>{ const L=typeof l==='string'?{text:l}:l; G.ui.say(L.text,L.who||null,{key:o.key+i,priority:i?'normal':'high',portrait:o.portrait}); });
  return 'caption';
}
function ravenReappearNear(){ const p=P(); if(!p||!p.pos)return; if(interior()){ shoulderPos(C.pos); C.mode='shoulder'; return; } C.pos.set(p.pos.x,p.pos.y+6,p.pos.z); C.opa=0; C.fade=1; C.mode='fly'; }
/* intros: Ember shakes herself, looks at you, trots to heel; Corvin to your shoulder, then a circle overhead */
function introStep(dt){
  if(E.on&&E.mode==='intro'&&EM){ E.introT+=dt; const u=E.introT;
    E.k.sit+=((u>.9&&u<2.4?1:0)-E.k.sit)*Math.min(1,dt*5); E.speed=0;
    const pp=P().pos; E.heading=U.dampAngle(E.heading,Math.atan2(pp.x-E.pos.x,pp.z-E.pos.z),3,dt);
    emberDraw(dt); if(u<.8){ EM.bones.body.rotation.z=Math.sin(u*40)*.12*(1-u/.8); EM.bones.neck.rotation.z=Math.sin(u*40+1)*.2*(1-u/.8); }
    if(u>2.6){ E.mode='follow'; E.ci=Math.max(oldest(),TR.seq-6); } }
  if(C.on&&C.mode==='intro'&&CV){ C.introT+=dt; const u=C.introT;
    if(u<1.6){ shoulderPos(_b); fly(dt,_b,8,true); C.k.flare=smooth(2,.3,C.pos.distanceTo(_b)); if(C.pos.distanceTo(_b)<.2)C.pos.copy(_b); C.sat=false; }
    else if(u<4.2){ shoulderPos(C.pos); C.vel.set(0,0,0); C.heading=U.dampAngle(C.heading,(P().heading||0)+.6,4,dt); C.sat=true; C.mode='intro'; }
    else if(u<8){ const pp=P().pos, a=(u-4.2)*1.5; _b.set(pp.x+Math.cos(a)*4,pp.y+5.5,pp.z+Math.sin(a)*4); fly(dt,_b,10); }
    else { C.mode='fly'; }
    const was=C.mode; if(u>=1.6&&u<4.2){ C.mode='perch'; ravenDraw(dt); C.mode=was; } else ravenDraw(dt); }
}

/* ================================================================ 10. THE SPOT TASKS (§4) */
const spotAvail=s=>!S.spots[s.id]&&s.place===placeNow()&&(!s.when||s.when());
function spotHere(who){
  const p=P().pos; let best=null, bd=1e9;
  for(const s of SPOTS){ if(s.who!==who||!spotAvail(s))continue; const d=Math.hypot(s.stand.x-p.x,s.stand.z-p.z); if(d>s.r||Math.abs(s.stand.y-p.y)>3.5)continue; if(d<bd){bd=d;best=s;} }
  return best;
}
/* Ember: run to the gap, squeeze in, rummage, come out with something, bring it */
function startEmberTask(s){
  if(E.mode==='away')emberReappear();
  const out=V(s.stand.x-s.at.x,0,s.stand.z-s.at.z).normalize();
  E.task={spot:s,phase:'go',t:0,out,door:V(s.at.x+out.x*.55,0,s.at.z+out.z*.55)}; E.task.door.y=floorNear(E.task.door.x,E.task.door.z,s.at.y+.5);
  E.mode='task'; E.carry=null; G.emit('companion:sent',{id:'ember',spot:s.id});
}
function taskStepEmber(dt){
  const k=E.task, s=k.spot, pp=P().pos; k.t+=dt; let want=null, sp=0;
  if(k.phase==='go'){ want=k.door; sp=T.run*.85; if(Math.hypot(k.door.x-E.pos.x,k.door.z-E.pos.z)<.2||k.t>8){ if(k.t>8)E.pos.copy(k.door); k.phase='in'; k.t=0; sfx('sniff',E.pos); } }
  else if(k.phase==='in'){ E.heading=U.dampAngle(E.heading,Math.atan2(s.at.x-E.pos.x,s.at.z-E.pos.z),10,dt); E.k.squeeze=Math.min(1,E.k.squeeze+dt*3);
    if(k.t>.35){ E.pos.x+=(s.at.x-E.pos.x)*Math.min(1,dt*2.2); E.pos.z+=(s.at.z-E.pos.z)*Math.min(1,dt*2.2); E.fade=0; }
    if(k.t>1.4){ k.phase='inside'; k.t=0; sfx('scrabble',s.at); } }
  else if(k.phase==='inside'){ E.fade=0; if(k.t>1.8){ k.phase='out'; k.t=0; E.carry=s.id==='log'?'bundle':s.id==='grate'?'key':'rope'; E.heading+=PI; E.fade=1; if(s.id==='log'&&DYN.bundleLog)DYN.bundleLog.visible=false; } }
  else if(k.phase==='out'){ E.fade=1; E.k.squeeze=Math.max(0,1-k.t*1.6); E.pos.x+=(k.door.x-E.pos.x)*Math.min(1,dt*3); E.pos.z+=(k.door.z-E.pos.z)*Math.min(1,dt*3);
    if(s.id==='crack'){ ladderDrop(k.t); }
    if(k.t>1){ k.phase=s.id==='crack'?'ret':'bring'; k.t=0; if(s.id==='crack'){ E.carry=null; spotDone(s); G.ui.say('Somewhere above, a rope gives. A rolled rope ladder tumbles off the ledge and hangs to the sand.',NM.ember,{key:'ladder'}); } } }
  else if(k.phase==='bring'){ const h=P().heading||0; want=_c.set(pp.x+Math.sin(h)*.9,pp.y,pp.z+Math.cos(h)*.9); sp=T.run*.8;
    if(Math.hypot(want.x-E.pos.x,want.z-E.pos.z)<.35||k.t>10){ k.phase='drop'; k.t=0; E.heading=Math.atan2(pp.x-E.pos.x,pp.z-E.pos.z); } }
  else if(k.phase==='drop'){ E.k.carry=Math.max(0,1-k.t*2); if(k.t>.5){ E.carry=null; carryItem(null); spotDone(s); spotReward(s); k.phase='ret'; k.t=0; } }
  else if(k.phase==='ret'){ if(k.t>(s.id==='crack'?1.4:.6)){ E.task=null; E.mode='follow'; E.ci=TR.seq; E.still=T.sitAfter; } else if(s.id==='crack')ladderDrop(1+k.t); }
  if(k.phase==='in'||k.phase==='out')E.speed=0;
  // move
  if(want){ const dx=want.x-E.pos.x, dz=want.z-E.pos.z, d=Math.hypot(dx,dz); E.speed+=(sp-E.speed)*Math.min(1,dt*5);
    if(d>.05){ E.heading=U.dampAngle(E.heading,Math.atan2(dx,dz),10,dt); const st=Math.min(d,E.speed*dt); E.pos.x+=dx/d*st; E.pos.z+=dz/d*st; } }
  else E.speed*=Math.exp(-dt*8);
  const f=floorNear(E.pos.x,E.pos.z,E.pos.y+.3); E.pos.y=U.damp(E.pos.y,f,16,dt);
  E.k.sit=Math.max(0,E.k.sit-dt*4); E.k.lie=Math.max(0,E.k.lie-dt*4); E.k.carry+=((E.carry?1:0)-E.k.carry)*Math.min(1,dt*8);
  E.k.alert=Math.max(0,E.k.alert-dt);
  emberDraw(dt);
}
function ladderDrop(u){ if(!DYN.ladder)return; const k=clamp(u/1.2,0,1); DYN.ladderMesh.scale.y=Math.max(.02,k); DYN.ladderMesh.position.y=0; DYN.ladderRoll.visible=k<.9; DYN.ladderRoll.position.y=.1-k*2.8; }
/* Corvin: fly to the perch, do the job, come back */
function startRavenTask(s){
  if(C.mode==='away'){ ravenReappear(); }
  if(C.mode==='shoulder'){ C.vel.set(0,4,0); }
  C.task={spot:s,phase:'go',t:0}; C.mode='task'; C.sat=false; G.emit('companion:sent',{id:'corvin',spot:s.id});
}
function ravenPerchFor(s,out){ if(s.id==='bell')return out.set(s.at.x+.32,s.at.y+.42+.13,s.at.z); if(s.id==='bundle')return out.copy(SP.bundle.branch).add(_d.set(-.12,.03,0)); return out.set(s.at.x+.12,s.at.y-.02,s.at.z+.1); }
function taskStepRaven(dt){
  const k=C.task, s=k.spot, pp=P().pos; k.t+=dt;
  if(k.phase==='go'){ ravenPerchFor(s,_b); const d=C.pos.distanceTo(_b);
    if(d>2.5){ _c.copy(_b); _c.y+=Math.min(3,d*.3); fly(dt,_c,T.flySpeed); C.sat=false; }
    else { fly(dt,_b,Math.max(2,d*3),true); C.k.flare=smooth(1.5,.2,d); }
    if(d<.15||k.t>9){ C.pos.copy(_b); C.vel.set(0,0,0); k.phase='work'; k.t=0; C.sat=true; } }
  else if(k.phase==='work'){ ravenPerchFor(s,C.pos); C.sat=true;
    const peck=Math.max(0,Math.sin(k.t*14))**3;
    if(s.id==='bell'){ C.heading=U.dampAngle(C.heading,-PI/2,6,dt); if(k.t>.4&&!k.rang){ k.rang=1; bellRing(); } if(k.t>2.6){ k.phase='back'; k.t=0; spotDone(s); spotReward(s); } }
    else if(s.id==='bundle'){ C.heading=U.dampAngle(C.heading,PI/2,6,dt); if(k.t>1.5&&!k.cut){ k.cut=1; sfx('snip',C.pos); bundleFall(); } if(k.t>2.1){ k.phase='back'; k.t=0; spotDone(s); } }
    else { C.heading=U.dampAngle(C.heading,PI,6,dt); if(k.t>1.6&&!k.got){ k.got=1; if(DYN.nestGlint)DYN.nestGlint.visible=false; sfx('caw',C.pos,.6); } if(k.t>2){ k.phase='bring'; k.t=0; C.sat=false; C.vel.set(0,6,2); } }
    C.k.peck=peck; }
  else if(k.phase==='bring'){ shoulderPos(_b); _b.y+=.35; const d=C.pos.distanceTo(_b); if(d>2.5){ _c.copy(_b); _c.y+=1.5; fly(dt,_c,T.flySpeed); } else fly(dt,_b,Math.max(2,d*3),true);
    scoutGlint(C.pos,1,k.t);
    if(d<.3||k.t>9){ k.phase='back'; k.t=0; spotDone(s); spotReward(s); } }
  else if(k.phase==='back'){ C.sat=false; if(k.t<.3){ C.vel.y=4; } C.task=null; C.mode=interior()?'toShoulder':'fly'; }
  ravenDraw(dt);
  if(C.mode==='task'&&C.sat&&k.phase==='work')CV.bones.head.rotation.x+=Math.max(0,Math.sin(k.t*14))**3*.7;
}

/* ---------------------------------------------------------------- the moving parts */
const FALL={on:false,t:0,vy:0,landed:false,pos:V()};
function bundleFall(){ const b=DYN.bundleTree; if(!b)return; FALL.on=true; FALL.vy=0; FALL.landed=false; FALL.pos.copy(b.position); if(DYN.twine)DYN.twine.visible=false; }
function fallStep(dt){
  if(!FALL.on||FALL.landed)return; const b=DYN.bundleTree; FALL.vy-=14*dt; FALL.pos.y+=FALL.vy*dt;
  const f=floorNear(FALL.pos.x,FALL.pos.z,FALL.pos.y)+.15; if(FALL.pos.y<=f){ FALL.pos.y=f; FALL.landed=true; sfx('thump',FALL.pos); b.rotation.z=.3; }
  b.position.copy(FALL.pos); b.rotation.x+=dt*3;
}
let bellT=-1;
function bellRing(){ bellT=0; }
function bellStep(dt){ if(bellT<0||!DYN.bell)return; bellT+=dt; const a=Math.sin(bellT*9)*Math.exp(-bellT*.9)*.6; DYN.bell.rotation.z=a;
  if((bellT>0&&bellT-dt<=0)||(bellT>.7&&bellT-dt<=.7)||(bellT>1.4&&bellT-dt<=1.4))sfx('bell',SP.bell.at,bellT>1?.6:1);
  if(bellT>6){ bellT=-1; DYN.bell.rotation.z=0; } }
function lidStep(dt){ if(!DYN.lid)return; const want=S.chest?-1.9:0; DYN.lid.rotation.x+=(want-DYN.lid.rotation.x)*Math.min(1,dt*3); }

/* ---------------------------------------------------------------- rewards */
const pend=[];
function later(s,fn){ pend.push({t:s,fn}); }
function laterStep(dt){ for(let i=pend.length-1;i>=0;i--){ pend[i].t-=dt; if(pend[i].t<=0){ const f=pend[i].fn; pend.splice(i,1); try{ f(); }catch(e){ console.error('companions later',e); } } } }
function autosave(){ try{ if(G.flow&&G.flow.writeSave)setTimeout(()=>{ if(isPlay())G.flow.writeSave(); },700); }catch(_){} }
function spotDone(s){ if(S.spots[s.id])return; S.spots[s.id]=1; G.emit('companion:spot',{id:s.id}); autosave(); }
const ITEMN={glowcap:['glowcap','glowcaps'],ichor:['ichor','ichor'],brine:['brine crystal','brine crystals'],pearl:['tide pearl','tide pearls'],kelp:['glowkelp','glowkelp'],vial:['vial of ether','vials of ether']};
function giveBundle(loot,o){
  const got=[];
  for(const [k,n] of Object.entries(loot)){
    if(k==='draught'){ const fit=G.potions&&G.potions.add?G.potions.add(n,{silent:true}):0; if(fit)got.push(fit>1?fit+' Mender’s Draughts':'a Mender’s Draught'); else if(G.inv){ G.inv.add('glowcap',2,{silent:true}); got.push('2 glowcaps (your bottles are full)'); } continue; }
    if(k==='vial'){ if(G.inv)G.inv.add('vial',n,{silent:true}); if(G.alchemy)G.alchemy.etherUnits=(G.alchemy.etherUnits||0)+12*n; got.push(n>1?n+' vials of ether':'a vial of ether'); continue; }
    if(G.inv)try{ G.inv.add(k,n,{silent:true}); }catch(_){}
    const nm=ITEMN[k]||[k,k+'s']; got.push((n>1?n+' ':'a ')+(n>1?nm[1]:nm[0]));
  }
  const list=got.length>1?got.slice(0,-1).join(', ')+' and '+got[got.length-1]:got[0]||'';
  if(G.progress&&G.progress.reward)G.progress.reward({id:'bundle',icon:'bundle',name:o.name,eyebrow:o.eyebrow,desc:o.desc+(list?' Inside: '+list+'.':'')});
  else G.ui.toast(o.name,list);
}
function spotReward(s){
  if(s.id==='log')giveBundle({draught:1,glowcap:2},{name:'A keeper’s bundle',eyebrow:NM.ember+' · the hollow log',desc:'Oilcloth tied with twine, dragged out backwards by a very pleased fox.'});
  else if(s.id==='grate'){ S.key=true;
    if(G.progress&&G.progress.reward)G.progress.reward({id:'key',icon:'key',name:'Maren’s spare key',eyebrow:NM.ember+' · under the cottage',desc:'Small, green with salt, on a loop of tarred string. It looks like it would fit a sea-chest.'});
    G.ui.say('Maren kept a sea-chest by the south wall of the cottage. This would be its key.',null,{key:'keyHint'}); }
  else if(s.id==='bell'){
    const lines=['The note goes down into the dark and comes back changed. For a moment the chapel is full of people, and a girl is ringing this same bell, too hard, laughing.',
      '“Wren! Gently. It’s a bell, not a pan.” — “It wants to be heard, Mother.”',
      'Then only the dark again, and one candle burning that wasn’t.'];
    later(.4,()=>moment({who:'echo',name:'An echo',title:'The chapel bell',portrait:'echo',key:'bellEcho',lines:lines.map((l,i)=>({text:l,who:i===1?'An echo':''}))}));
    try{ if(G.undercroft&&G.undercroft.lightCandle){ const c=(G.undercroft.candles||[]).find(c=>c.room==='chapel'&&!G.undercroft.isLit('chapel')); if(c)G.undercroft.lightCandle(c.id,{free:true}); } }catch(e){ console.error('bell candle',e); }
    if(G.alchemy)G.alchemy.etherUnits=(G.alchemy.etherUnits||0)+5;
    G.emit('companion:echo',{id:'wren'}); }
  else if(s.id==='nest'){ if(G.progress&&G.progress.grantShard)G.progress.grantShard('nest'); G.ui.say(NM.corvin+' drops something warm into your hand and looks very satisfied with himself.',NM.corvin,{key:'nestShard'}); }
  else if(s.id==='bundleOpen')giveBundle({ichor:2,brine:1,glowcap:1},{name:'A bundle from the tree',eyebrow:NM.corvin+' · the dead tree',desc:'Snagged in the branches since some storm. The twine is pecked clean through.'});
  else if(s.id==='ledge')giveBundle({vial:1,pearl:1},{name:'A keeper’s bundle',eyebrow:NM.ember+' · the cave ledge',desc:'Left high and dry on a ledge by a keeper who knew the tide.'});
}
function openSeaChest(){
  if(S.chest)return;
  if(!S.key){ G.ui.say('A sea-chest bound in iron, its lock crusted green with salt. Maren would have kept a spare key somewhere. Somewhere small.',null,{key:'chestLocked',priority:'high'});
    if(!S.ember)return; if(!S.said.chestHint){ S.said.chestHint=1; later(.3,()=>G.ui.say('Somewhere small. Under the cottage, perhaps, where only a fox could go.',null,{key:'chestHint'})); } return; }
  S.chest=true; sfx('lid',V(SEACHEST.x,SEACHEST.y,SEACHEST.z));
  if(G.progress&&G.progress.grantShard)G.progress.grantShard('chest');
  later(2.6,()=>moment({who:'maren',name:'Maren',title:'A note under the oilskin',portrait:'maren',key:'chestNote',
    lines:[{text:'Under a folded oilskin, a note in a small, square hand: “If you’re reading this, you found the key, so you found the fox, so you’re all right. Keep the light. Keep the fox. — M.”',who:'Maren'}]}));
  G.emit('companion:chest',{}); autosave();
}

/* ================================================================ 11. SCOUTING (Corvin, T elsewhere) */
const glints=[]; let glintN=0;
function scoutGlint(p,s,t){ const g=glints[glintN%glints.length]; if(!g)return; glintN++; g.visible=true; g.position.copy(p); g.userData.t=0; g.userData.life=.5; g.scale.setScalar(.5*s); }
function shimmer(p){ for(const g of glints){ if(g.visible)continue; g.visible=true; g.position.set(p.x,p.y+.6,p.z); g.userData.t=0; g.userData.life=3.2; g.userData.big=1; return; } }
function glintStep(dt){ for(const g of glints){ if(!g.visible)continue; const u=g.userData; u.t+=dt; const k=u.t/u.life; if(k>=1){ g.visible=false; continue; }
  g.material.opacity=(u.big?.9:.6)*Math.sin(Math.min(1,k)*PI); g.scale.setScalar((u.big?1.6:.5)*(1+.35*Math.sin(u.t*7))); } }
function startScout(){
  if(S.cd>0){ sfx('caw',C.pos,.7); C.k.look=1; G.emit('companion:caw',{why:'cooldown',cd:S.cd}); return false; }
  if(C.mode==='away')ravenReappear();
  if(C.mode==='shoulder'||C.mode==='perch')C.vel.set(0,5,0);
  C.scoutT=0; C.scoutA=Math.atan2(C.pos.x-P().pos.x,C.pos.z-P().pos.z); S.cd=T.scoutCD; sfx('caw',C.pos);
  // what Corvin sees: shards, caches and companion spots within 40 m (same place), pinned on the map and shimmering
  const p=P().pos, place=placeNow(), found=[];
  const near=v=>v&&Math.hypot(v.x-p.x,v.z-p.z)<T.scoutFind&&Math.abs(v.y-p.y)<30;
  const PR=G.progress;
  if(PR){ for(const s of PR.spots||[]){ if(PR.state.shards[s.id]||(s.when&&!s.when()))continue; if(!!s.cave!==(place==='cave'))continue; if(near(s.pos)){ found.push('shard:'+s.id); shimmer(s.pos); } }
    for(const c of PR.caches||[]){ if(PR.state.caches[c.id]||(c.when&&!c.when()))continue; if(!!c.cave!==(place==='cave'))continue; if(near(c.pos)){ found.push('cache:'+c.id); shimmer(c.pos); } } }
  for(const s of SPOTS){ if(S.spots[s.id]||s.place!==place)continue; if(near(s.at)){ found.push('comp:'+s.id); S.seen[s.id]=1; shimmer(s.at); } }
  if(G.map){ for(const id of found)if(G.map.markSeen)G.map.markSeen(id); if(place==='island'&&G.map.reveal)G.map.reveal(p.x,p.z,T.scoutFind); }
  G.emit('companion:scout',{found:found.length,ids:found});
  if(!S.said.scout){ S.said.scout=1; later(2.2,()=>G.ui.say(found.length?NM.corvin+' circles wide and comes back pleased with himself. Whatever he saw is on your map now.':NM.corvin+' circles wide and comes back with nothing to show. Nothing hidden here, then.',NM.corvin,{key:'scout'})); }
  return true;
}
function scoutStep(dt){
  C.scoutT+=dt; const p=P().pos, u=C.scoutT/T.scoutTime;
  if(interior()){ const a=C.scoutA+u*TAU; _b.set(p.x+Math.sin(a)*3.5,p.y+2.6,p.z+Math.cos(a)*3.5); fly(dt,_b,9); }
  else { const r=u<.15?lerp(4,T.scoutR,u/.15):u>.85?lerp(T.scoutR,4,(u-.85)/.15):T.scoutR, a=C.scoutA+u*TAU; _b.set(p.x+Math.sin(a)*r,p.y+12+Math.sin(u*PI)*6,p.z+Math.cos(a)*r); fly(dt,_b,T.flySpeed+10); }
  if(C.scoutT>=T.scoutTime){ C.scoutT=-1; C.mode=interior()?'toShoulder':'fly'; }
  ravenDraw(dt);
}

/* ================================================================ 12. COMMANDS */
function send(id){
  if(id==='ember'){ if(!S.ember||!E.on)return 'none'; if(E.mode==='task'||E.mode==='intro')return 'busy';
    const s=spotHere('ember'); if(s){ startEmberTask(s); return 'spot:'+s.id; }
    // heel, with a bark
    if(E.mode==='away')emberReappear();
    E.mode='heel'; E.taskT=0; E.k.bark=1; sfx('bark',E.pos); G.emit('companion:heel',{}); return 'heel'; }
  if(id==='corvin'){ if(!S.corvin||!C.on)return 'none'; if(C.mode==='task'||C.mode==='intro'||C.scoutT>=0)return 'busy';
    const s=spotHere('corvin'); if(s){ startRavenTask(s); return 'spot:'+s.id; }
    return startScout()?'scout':'caw'; }
  return 'none';
}
const call=send;
function readInput(){
  if(!isPlay())return; const p=P(); if(!p||p.alive===false||(p.inputEnabled===false))return;
  if(G.map&&G.map.isOpen)return;
  if(G.input.pressed('fox'))send('ember');
  if(G.input.pressed('raven'))send('corvin');
  // the prompts at the spots
  if(S.ember&&E.on&&E.mode!=='task'&&E.mode!=='intro'){ const s=spotHere('ember'); if(s)G.hint('R',s.prompt.replace('Ember',NM.ember)); }
  if(S.corvin&&C.on&&C.mode!=='task'&&C.mode!=='intro'&&C.scoutT<0){ const s=spotHere('corvin'); if(s)G.hint('T',s.prompt.replace('Corvin',NM.corvin)); }
}

/* ================================================================ 13. SOUNDS (synth, through audio.js's palette) */
function sfx(kind,pos,g=1){
  const A=G.audio; if(!A||!A.ready||!A.S||!A.context)return; const S2=A.S, t=A.context.currentTime;
  let k=1; const pp=P()&&P().pos; if(pos&&pp){ const d=pos.distanceTo(pp); k=clamp(1.4/(1+d*.12),.08,1); } g*=k;
  try{
    if(kind==='bark'){ S2.shriek(t,{f:1250,g:.07*g}); S2.shriek(t+.17,{f:1400,g:.06*g}); }
    else if(kind==='nip'){ S2.clank(t,{f:900,g:.05*g}); S2.shriek(t,{f:1500,g:.04*g}); }
    else if(kind==='caw'){ S2.shriek(t,{f:640,g:.09*g}); S2.shriek(t+.26,{f:600,g:.08*g}); }
    else if(kind==='bell'){ S2.bell(t,84,{g:.16*g,decay:2.6}); }
    else if(kind==='scrabble'){ for(let i=0;i<5;i++)S2.whoosh(t+i*.22,{dur:.12,g:.06*g,f0:1800,f1:3200}); }
    else if(kind==='sniff'){ S2.whoosh(t,{dur:.1,g:.04*g,f0:2400,f1:4000}); S2.whoosh(t+.14,{dur:.1,g:.04*g,f0:2400,f1:4000}); }
    else if(kind==='snip'){ S2.clank(t,{f:1400,g:.04*g}); }
    else if(kind==='thump'){ S2.thud(t,{g:.35*g,f0:110,f1:50}); }
    else if(kind==='lid'){ S2.clank(t,{f:420,g:.08*g}); S2.thud(t+.1,{g:.25*g}); }
    else if(kind==='flap'){ S2.whoosh(t,{dur:.2,g:.05*g,f0:300,f1:900}); }
  }catch(e){}
}

/* ================================================================ 14. HUD: touch buttons, legends, prompt chips */
const CSS=`
.touch [data-act=fox],.touch [data-act=raven]{--s:46px;display:grid;place-items:center;border-color:rgba(241,200,160,.6);background:rgba(36,22,18,.55)}
.touch [data-act=raven]{border-color:rgba(200,190,255,.55);background:rgba(22,18,34,.6)}
.touch [data-act=fox][hidden],.touch [data-act=raven][hidden]{display:none}
.touch [data-act=fox]{--x:-160px;--y:6px}
.touch [data-act=raven]{--x:-152px;--y:-188px}
.touch [data-act=fox] svg,.touch [data-act=raven] svg{width:28px;height:28px;pointer-events:none}
.touch [data-act=raven]::after{content:'';position:absolute;inset:-3px;border-radius:50%;pointer-events:none;
  background:conic-gradient(rgba(10,8,14,.72) calc(var(--cd,0)*1turn),transparent 0);opacity:var(--cdo,0);transition:opacity .3s}
@media (orientation:landscape){ .touch [data-act=fox]{--x:-236px;--y:0px} .touch [data-act=raven]{--x:-222px;--y:-80px} }
.prompt .tap{font:700 10.5px var(--body);letter-spacing:.12em;text-transform:uppercase;padding:2px 6px;border:1px solid rgba(241,233,216,.55);border-radius:9px;margin-right:6px}
`;
const FOX_SVG='<svg viewBox="0 0 28 28" aria-hidden="true"><path d="M5 4l5 6h8l5-6 1 10c0 5-4 10-10 10S4 19 4 14z" fill="#d0702e" stroke="#2a1d18" stroke-width="1.2" stroke-linejoin="round"/><path d="M8 17c2 1 4 1.2 6 1.2s4-.2 6-1.2c-1 3.6-3.4 5.4-6 5.4S9 20.6 8 17z" fill="#f1e6d2"/><circle cx="10.6" cy="14" r="1.3" fill="#1b120e"/><circle cx="17.4" cy="14" r="1.3" fill="#1b120e"/><path d="M13 19.6h2l-1 1.2z" fill="#151110"/></svg>';
const RAVEN_SVG='<svg viewBox="0 0 28 28" aria-hidden="true"><path d="M3 15c3-1 5-3 7-6 2-3 6-4 9-2 2 1 3 2 6 2-2 1-3 1-4 2 1 4-1 8-5 10l-2 5-2-4c-3 0-6-2-9-7z" fill="#2b2836" stroke="#d6cdf0" stroke-width="1" stroke-linejoin="round"/><circle cx="16.6" cy="9.6" r="1.2" fill="#f6f0ff"/></svg>';
let foxBtn=null, ravenBtn=null, legendDone={ember:false,corvin:false};
function mountUI(){
  const st=document.createElement('style'); st.textContent=CSS; document.head.appendChild(st);
  const t=$('touch'); if(!t)return;
  const mk=(act,svg,label)=>{ const b=document.createElement('button'); b.type='button'; b.dataset.act=act; b.hidden=true; b.setAttribute('aria-label',label); b.innerHTML=svg;
    b.addEventListener('pointerdown',e=>{ e.preventDefault(); b.classList.add('on'); G.input.setVirtual(act,true); });
    const up=()=>{ b.classList.remove('on'); G.input.setVirtual(act,false); }; b.addEventListener('pointerup',up); b.addEventListener('pointercancel',up); b.addEventListener('pointerleave',up);
    b.addEventListener('contextmenu',e=>e.preventDefault()); t.insertBefore(b,t.firstChild); return b; };
  foxBtn=mk('fox',FOX_SVG,NM.ember+': go, or come to heel'); ravenBtn=mk('raven',RAVEN_SVG,NM.corvin+': go, or scout');
  if(G.ui.padRowHooks)G.ui.padRowHooks.push(()=>{ const r=[]; if(S.ember)r.push(['Left',NM.ember+': go · heel']); if(S.corvin)r.push(['Right',NM.corvin+': go · scout']); return r; });
}
function legendRow(key,text){ const s=document.createElement('span'); s.dataset.comp=key; s.innerHTML='<kbd>'+key+'</kbd> '+text; return s; }
function refreshUI(){
  if(foxBtn)foxBtn.hidden=!S.ember; if(ravenBtn)ravenBtn.hidden=!S.corvin;
  let changed=false;
  for(const [id,key,txt] of [['ember','R',NM.ember+': go · heel'],['corvin','T',NM.corvin+': go · scout']]){
    if(!S[id]||legendDone[id])continue; legendDone[id]=true; changed=true;
    document.querySelectorAll('[data-kb-legend]').forEach(el=>{ if(!el.querySelector('[data-comp="'+key+'"]'))el.appendChild(legendRow(key,txt)); });
    const k=$('keys'); if(k&&k.dataset.mode!=='pad'&&!k.querySelector('[data-comp="'+key+'"]')){ const esc_=[...k.children].find(c=>/pause/.test(c.textContent)); k.insertBefore(legendRow(key,id==='ember'?NM.ember:NM.corvin),esc_||null); }
  }
  if(changed&&G.ui.refreshLegends)G.ui.refreshLegends();
}
function uiStep(){ if(ravenBtn&&!ravenBtn.hidden){ const cd=clamp(S.cd/T.scoutCD,0,1); ravenBtn.style.setProperty('--cd',cd.toFixed(3)); ravenBtn.style.setProperty('--cdo',cd>0?'1':'0'); } }

/* ================================================================ 15. THE MAP: companion spots get a pin once seen (or scouted) */
function mapMarkers(){
  if(!G.map||!G.map.addMarker)return;
  for(const s of SPOTS){
    const pos=s.place==='cave'?()=>{ const m=LM().caveMouth; return m?{x:m.x-1,z:m.z+5}:null; }:s.place==='undercroft'?()=>{ const d=LM().undercroftDoor; return d?{x:d.x+2,z:d.z+2}:null; }:{x:s.at.x,z:s.at.z};
    G.map.addMarker({id:'comp:'+s.id,kind:s.who==='ember'?'fox':'raven',label:(s.who==='ember'?NM.ember:NM.corvin)+': '+s.name.replace(/^The /,'the ')+(s.place==='cave'?' (in the sea cave)':s.place==='undercroft'?' (in the Undercroft)':''),pos,
      item:{done:()=>!!S.spots[s.id],doneLabel:s.name+' (done)'},visible:()=>!!S[s.who]&&(!!S.seen[s.id]||(G.map.isSeen&&G.map.isSeen('comp:'+s.id)))});
  }
}
let seenT=0;
function seeSpots(dt){ seenT-=dt; if(seenT>0)return; seenT=.5; const p=P().pos, place=placeNow();
  for(const s of SPOTS){ if(S.seen[s.id]||s.place!==place)continue; const d=Math.hypot(s.at.x-p.x,s.at.z-p.z); if(d<22||(d<45&&onScreen(s.at)))S.seen[s.id]=1; } }

/* ================================================================ 16. FIGHTS: no harm can come to them (they hop / flap aside) */
function wrapStrike(){
  const C0=G.combat; if(!C0||C0._compWrapped)return; const s0=C0.strike.bind(C0); C0._compWrapped=true;
  C0.strike=function(o){ const r=s0(o);
    if(o&&o.team==='enemy'){ const R=(o.radius||1)+.6;
      if(E.on&&E.opa>.5&&E.hopT<0&&Math.abs(o.x-E.pos.x)<R&&Math.abs(o.z-E.pos.z)<R&&Math.hypot(o.x-E.pos.x,o.z-E.pos.z)<R){ E.hopT=0; const a=Math.atan2(E.pos.x-o.x,E.pos.z-o.z); E.pos.x+=Math.sin(a)*.5; E.pos.z+=Math.cos(a)*.5; G.emit('companion:dodge',{id:'ember'}); }
      if(C.on&&C.opa>.5&&Math.abs(o.x-C.pos.x)<R&&Math.abs(o.z-C.pos.z)<R&&C.pos.distanceTo(_a.set(o.x,o.y==null?C.pos.y:o.y,o.z))<R+.4){ if(C.mode==='perch'||C.mode==='land'){ C.mode='fly'; } C.vel.y+=5; C.hopT=0; G.emit('companion:dodge',{id:'corvin'}); } }
    return r; };
}

/* ================================================================ 17. PERSISTENCE + OLD SAVES */
G.persist&&G.persist.register('companions',{
  save:()=>({v:1,ember:!!S.ember,corvin:!!S.corvin,spots:Object.assign({},S.spots),key:!!S.key,chest:!!S.chest,cd:Math.round(S.cd*10)/10,said:Object.assign({},S.said),seen:Object.assign({},S.seen)}),
  load:d=>{ if(!d||typeof d!=='object')return;
    for(const k of ['spots','said','seen'])S[k]=Object.assign({},d[k]||{}); S.key=!!d.key; S.chest=!!d.chest; S.cd=Math.max(0,+d.cd||0);
    if(d.ember)earnEmber(true); if(d.corvin)earnCorvin(true);
    applySpots(); pendingPlace=true; }
});
let pendingPlace=false;
/** set the moving parts to match the saved spots */
function applySpots(){
  if(DYN.bundleLog)DYN.bundleLog.visible=!S.spots.log;
  if(DYN.bundleTree){ if(S.spots.bundle){ DYN.bundleTree.visible=!S.spots.bundleOpen; const B=SP.bundle; FALL.on=true; FALL.landed=true; FALL.pos.set(B.at.x+.2,0,B.at.z+.3); FALL.pos.y=floorNear(FALL.pos.x,FALL.pos.z,B.c.y+1)+.15; DYN.bundleTree.position.copy(FALL.pos); DYN.bundleTree.rotation.set(.4,0,.3); if(DYN.twine)DYN.twine.visible=false; }
    else { FALL.on=false; DYN.bundleTree.visible=true; DYN.bundleTree.position.copy(SP.bundle.at); DYN.bundleTree.rotation.set(0,0,0); if(DYN.twine)DYN.twine.visible=true; } }
  if(DYN.ladder)ladderDrop(S.spots.crack?2:0);
  if(DYN.ledgeBundle)DYN.ledgeBundle.visible=!S.spots.ledge;
  if(DYN.nestGlint)DYN.nestGlint.visible=!S.spots.nest;
  if(DYN.lid)DYN.lid.rotation.x=S.chest?-1.9:0;
}
/** an old save: a fox already freed means Ember is already yours (quietly); the raven negative's index keeps Corvin's */
function reconcile(){
  const N=(G.creatures&&G.creatures.negatives)||[];
  if(!S.ember&&N.some(n=>n.kind==='fox'&&n.dead&&!n.custom))earnEmber(true);
  if(!S.corvin&&RN.dead&&!RN.dying)earnCorvin(true);
}

/* ================================================================ 18. API + SYSTEM */
const API=G.companions={
  names:COMP_NAMES, T, state:S, spots:SPOTS, shardSpots,
  get ember(){ return E.on?{on:true,mode:E.mode,pos:E.pos,opacity:E.opa,pose:Object.assign({},E.k),carry:E.carry,task:E.task&&E.task.spot.id}:null; },
  get corvin(){ return C.on?{on:true,mode:C.mode,pos:C.pos,opacity:C.opa,scouting:C.scoutT>=0,cd:S.cd,task:C.task&&C.task.spot.id}:null; },
  has:id=>!!S[id], send, call,
  raven:RN,
  debug:{
    E, C, S, SP, TR, RN, DYN, FALL, get rigs(){ return {ember:EM,corvin:CV}; },
    earn:(id,quiet)=>{ if(id==='ember')earnEmber(quiet!==false); else earnCorvin(quiet!==false); },
    reset(){ for(const k of ['spots','said','seen'])S[k]={}; S.ember=S.corvin=S.key=S.chest=false; S.cd=0; E.on=C.on=false; E.mode=C.mode='off'; if(EM)EM.root.visible=false; if(CV)CV.root.visible=false; applySpots(); refreshUI(); },
    drawRaven:dt=>ravenDraw(dt||0), drawEmber:dt=>emberDraw(dt||0),
    spotHere, startScout, tryNip:()=>tryNip(), tryDive:()=>tryDive(), weaken:()=>{ RN.weak=30; RN.dmgN=0; },
    finishTasks(){ let n=0; while((E.task||C.task)&&n++<2000){ G.step(1/30,1); } return !E.task&&!C.task; }
  }
};
// devtools: a start point with both companions, and a teleport to each spot
if(G.devtools){
  const tp=(id,name,go)=>{ (G.devtools.teleports=G.devtools.teleports||[]).push({id:'comp-'+id,name,go}); };
  const isl=s=>()=>{ const p=s.stand; return [p.x,null,p.z,Math.atan2(s.at.x-p.x,s.at.z-p.z)]; };
  tp('log',NM.ember+': hollow log',isl(SP.log)); tp('grate',NM.ember+': cottage grate',isl(SP.grate)); tp('bundle',NM.corvin+': dead tree',isl(SP.bundle)); tp('nest',NM.corvin+': north-cliff nest',isl(SP.nest));
  tp('crack',NM.ember+': cave crack',()=>({cave:'mouth',pos:SP.crack.stand,yaw:-PI/2}));
  tp('bell',NM.corvin+': chapel bell',()=>({undercroft:'chapel',pos:SP.bell.stand,yaw:PI}));
}

let built=false, lastP=V(1e9,0,0), hookedHal=false;
G.system('companions',{order:46,modes:['play','dead'],
  init(){
    try{ buildIsland(); }catch(e){ console.error('companions island',e); }
    try{ buildCave(); }catch(e){ console.error('companions cave',e); }
    try{ buildUndercroft(); }catch(e){ console.error('companions undercroft',e); }
    try{ ravenNegInit(); }catch(e){ console.error('companions raven',e); }
    for(let i=0;i<10;i++){ const s=new THREE.Sprite(new THREE.SpriteMaterial({map:G.tex.soft,color:0xd8c4ff,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending})); s.visible=false; s.userData={t:0,life:1}; G.scene.add(s); glints.push(s); }
    mountUI(); wrapStrike(); built=true;
    // creatures.js hands over the first freed fox
    if(G.creatures)G.creatures.claimFreed=(n,c)=>{ if(n.kind!=='fox'||S.ember)return false; earnEmber(false,n.pos,c.root.rotation.y); return true; };
    if(G.creatures&&!hookedHal){ hookedHal=true; (G.creatures.halloranHooks=G.creatures.halloranHooks||[]).push(()=>{ if(!S.ember||S.said.hal)return null; S.said.hal=1; return 'That one’s taken a shine to you. Foxes don’t, as a rule.'; }); }
    // interactions: Maren's sea-chest, the bundle under the dead tree, the cave ladder and the ledge's bundle
    const IA=G.interact;
    IA.add({pos:V(SEACHEST.x,SEACHEST.y,SEACHEST.z-.45),radius:1.6,priority:4,label:()=>S.key?'Open Maren’s sea-chest':'A locked sea-chest',enabled:()=>!S.chest&&isPlay(),use:openSeaChest});
    IA.add({pos:()=>FALL.pos,radius:1.7,priority:5,label:'Open the bundle',enabled:()=>!!S.spots.bundle&&!S.spots.bundleOpen&&FALL.landed&&isPlay(),use(){ S.spots.bundleOpen=1; if(DYN.bundleTree)DYN.bundleTree.visible=false; spotReward({id:'bundleOpen'}); autosave(); }});
    if(SP.crack.ledge){ const L=SP.crack.ledge, foot=V(L.x+1.1,0,L.z); foot.y=floorNear(foot.x,foot.z,L.y-2.5);
      IA.add({pos:foot,radius:1.5,priority:5,label:'Climb the rope ladder',enabled:()=>!!S.spots.crack&&inCave()&&isPlay()&&P().pos.y<L.y-1,use(){ P().teleport(L.x+.3,L.y,L.z,-PI/2); G.emit('companion:ladder',{}); }});
      IA.add({pos:V(L.x-.3,L.y,L.z+.15),radius:1.4,priority:5,label:'Open the bundle',enabled:()=>!!S.spots.crack&&!S.spots.ledge&&inCave()&&isPlay(),use(){ S.spots.ledge=1; if(DYN.ledgeBundle)DYN.ledgeBundle.visible=false; spotReward({id:'ledge'}); autosave(); }}); }
    applySpots(); mapMarkers();
    G.on('player:respawn',()=>{ lastP.set(1e9,0,0); });
    G.on('map:travel',e=>{ if(e&&e.phase==='arrive')lastP.set(1e9,0,0); });
  },
  update(dt){
    if(!built)return;
    const p=P(); if(!p||!p.pos)return;
    if(G.state.mode!=='play'&&G.state.mode!=='dead')return;
    if(pendingPlace){ pendingPlace=false; lastP.set(1e9,0,0); }
    // the player moved a long way at once (fast travel, the cave, the Undercroft, a respawn): start a new trail, catch up unseen
    if(lastP.distanceTo(p.pos)>8){ trailReset(p.pos);
      if(E.on&&E.mode!=='intro'){ E.task=null; E.carry=null; if(E.pos.distanceTo(p.pos)>6){ E.opa=0; E.mode='away'; E.awayT=0; } E.ci=TR.seq; }
      if(C.on&&C.mode!=='intro'){ C.task=null; C.scoutT=-1; if(C.pos.distanceTo(p.pos)>8){ C.opa=0; C.mode='away'; C.awayT=0; } } }
    lastP.copy(p.pos);
    trailUpdate();
    S.cd=Math.max(0,S.cd-dt);
    try{ ravenNegStep(dt); }catch(e){ console.error('raven negative',e); }
    if(G.state.mode==='play')readInput();
    const eI=E.on&&E.mode==='intro', cI=C.on&&C.mode==='intro';
    if(eI||cI)introStep(dt);
    if(E.on&&!eI)emberStep(dt);
    if(C.on&&!cI)ravenStep(dt);
    laterStep(dt); fallStep(dt); bellStep(dt); lidStep(dt); glintStep(dt);
    if(DYN.nestGlint&&DYN.nestGlint.visible)DYN.nestGlint.material.opacity=.45+.25*Math.sin(G.time*2.2);
    // show each place's set pieces only where you are
    const place=placeNow();
    for(const pc of pieces){ const vis=pc.place===place&&Math.abs(pc.near.x-p.pos.x)<pc.r&&Math.abs(pc.near.z-p.pos.z)<pc.r; if(pc.mesh.visible!==vis)pc.mesh.visible=vis; }
    if(DYN.bell)DYN.bell.visible=place==='undercroft'; if(DYN.ladder)DYN.ladder.visible=place==='cave'; if(DYN.ledgeBundle)DYN.ledgeBundle.visible=place==='cave'&&!S.spots.ledge;
    seeSpots(dt); uiStep();
    reconT-=dt; if(reconT<=0){ reconT=1; reconcile(); }
  }
});
let reconT=.5;
})();
