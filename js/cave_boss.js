/* =====================================================================
   BRAVE QUEST: LIGHTHOUSE — cave_boss.js  (Boss agent)
   The Drowned Keepers' Cave: cave monster packs (brinelings + hollows),
   THE UNDERTOW (boss in the arena), Hesper's three logbook pages, the
   discovery beat (caption + quest), Halloran's cave line. Persist 'caveBoss'.

   The Undertow can't be seen in light. With the lantern shut, the swarm
   hunts it: the moths settle along its body (they are steered here onto
   per-segment prey points keyed to corrupt hurtboxes, so creatures.js keeps
   them), and its ink shows a violet rim only where moths are. Body hits only
   land where moths are; the lens core (2x) is exposed after a missed lash.

   API: G.caveBoss = {state, hp, maxHp, defeated, pages, discovered, undertow, discover(src), debug}
   Events: cave:bossStart · cave:bossPhase {n,name,high,drag} · cave:bossDead · cave:page {n}
           cave:wound · cave:bossTelegraph {kind:'lash'|'surge'|'drag', pos, lead} (audio)
           cave:bossHit {core, damage} · cave:bossMiss (a lash found nothing; the lens is out)
   ===================================================================== */
(function(){
'use strict';
const G=window.G, THREE=G.THREE, U=G.U, PI=Math.PI, TAU=PI*2;
const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const rnd=U.rng(7741);
const FX=()=>(G.monsters&&G.monsters.fx)||null;
const INK=()=>G.ink||null;
const isPlay=()=>G.state.mode==='play';
const lantern=()=>G.items&&G.items.lantern;
const looping=()=>!!(G.loop&&G.loop.active);

/* ---------------------------------------------------------------- cave frame (G.cave when present, else O + local) */
const O_FALL=V(0,60,800);
const origin=()=>(G.cave&&G.cave.origin&&G.cave.origin.isVector3)?G.cave.origin:O_FALL;
function W(x,y,z){ if(G.cave&&G.cave.toWorld){ try{ const v=G.cave.toWorld(x,y,z); if(v)return V(v.x,v.y,v.z); }catch(e){} } const o=origin(); return V(o.x+x,o.y+y,o.z+z); }
function toLocal(v){ const o=origin(); return V(v.x-o.x,v.y-o.y,v.z-o.z); }
function anchor(room,name,fb){
  const r=G.cave&&G.cave.rooms&&G.cave.rooms[room]; let a=r&&r.anchors&&r.anchors[name];
  if(Array.isArray(a))a=a[0];
  if(a&&isFinite(a.x))return V(a.x,a.y,a.z);
  return fb?W(fb[0],fb[1],fb[2]):null;
}
const LOCAL={mouth:{c:[0,.3,-10],r:12},gallery:{c:[0,3,-35],r:11},stair:{c:[0,1,-62],r:8},channel:{c:[25,0,-80],r:20},drafts:{c:[60,3,-56],r:12},arena:{c:[60,1,-15],r:18}};
function roomCentre(id){ const r=G.cave&&G.cave.rooms&&G.cave.rooms[id]; if(r&&r.centre&&isFinite(r.centre.x))return V(r.centre.x,r.centre.y,r.centre.z); const l=LOCAL[id]; return W(l.c[0],l.c[1],l.c[2]); }
const FALL_ROOMS={mouth:{c:[0,-10],r:14},gallery:{c:[0,-35],r:14},stair:{c:[0,-62],r:11},channel:{box:[0,50,-91,-72]},drafts:{box:[51,69,-72,-37]},arena:{c:[60,-15],r:21}};
function roomOf(p){
  if(G.cave&&G.cave.room){ try{ return G.cave.room(p); }catch(e){} }
  const l=toLocal(p); if(Math.abs(l.y)>25)return null;
  for(const id in FALL_ROOMS){ const f=FALL_ROOMS[id];
    if(f.box){ if(l.x>f.box[0]&&l.x<f.box[1]&&l.z>f.box[2]&&l.z<f.box[3])return id; }
    else if(Math.hypot(l.x-f.c[0],l.z-f.c[1])<f.r)return id; }
  return null;
}
function inCave(){
  if(G.cave&&'inside' in G.cave)return !!G.cave.inside;
  const P=G.player; if(!P||!P.pos)return false; const l=toLocal(P.pos);
  return Math.abs(l.y)<25&&l.x>-30&&l.x<90&&l.z>-110&&l.z<20;
}
const waterY=()=>{ if(G.cave&&G.cave.waterWorld){ try{ const y=G.cave.waterWorld(); if(isFinite(y))return y; }catch(e){} } return origin().y+1.5*(G.tide?G.tide.level:0); };
const isLit=id=>{ try{ return !!(G.cave&&G.cave.isLit&&G.cave.isLit(id)); }catch(e){ return false; } };
const floorAt=(x,z,y)=>{ const f=G.floorAt(x,z,y); return isFinite(f)?f:-1e9; };
function mouthPos(){
  const m=(G.world&&G.world.landmarks&&G.world.landmarks.caveMouth)||(G.cave&&G.cave.mouth);
  return m&&isFinite(m.x)?V(m.x,m.y||0,m.z):null;
}

/* ---------------------------------------------------------------- save state */
const S={v:1,pages:{},defeated:false,discovered:false,hal:false,entered:false,bossSeen:false,said:{}};
const say=(k,text,who)=>{ if(S.said[k])return false; S.said[k]=1; G.ui.say(text,who); return true; };

/* ---------------------------------------------------------------- beats on game time (works with G.step) */
const beats=[];
const later=(s,fn)=>beats.push({t:G.time+s,fn});
function runBeats(){ for(let i=beats.length-1;i>=0;i--){ if(G.time>=beats[i].t){ const b=beats.splice(i,1)[0]; try{b.fn();}catch(e){console.error('caveBoss beat',e);} } } }

/* =====================================================================
   1. CAVE MONSTERS — packs spawn when the player first enters a room on a
      visit; everything left alive is cleared when the player leaves the
      cave, and the next visit brings them back. Nothing spawns outside.
   ===================================================================== */
const PACKS={
  gallery:{brineling:3},
  stair:{hollow:2,darkOnly:true},
  channel:{brineling:2},
  drafts:{brineling:3,hollow:1}
};
const spawned=new Set(), mine=[];
let curRoom=null, roomT=0, wasInside=false;
function pickSpot(room,taken){
  const c=roomCentre(room), r=G.cave&&G.cave.rooms&&G.cave.rooms[room], b=r&&r.bounds;
  const P=G.player&&G.player.pos;
  for(let k=0;k<40;k++){
    let x,z;
    if(b&&b.min&&b.max){ x=U.lerp(b.min.x+2,b.max.x-2,rnd()); z=U.lerp(b.min.z+2,b.max.z-2,rnd()); }
    else{ const a=rnd()*TAU, d=Math.sqrt(rnd())*(LOCAL[room]?LOCAL[room].r*.75:8); x=c.x+Math.cos(a)*d; z=c.z+Math.sin(a)*d; }
    const y=floorAt(x,z,c.y+3); if(y<c.y-3.5||y>c.y+(room==='stair'?1.2:3))continue; // (not up on the stair's ledge: unreachable at low water)
    if(G.world.walkable&&!G.world.walkable(x,z))continue;
    if(roomOf(V(x,y+.5,z))!==room&&k<30)continue;
    if(P&&Math.hypot(P.x-x,P.z-z)<(k<25?9:5))continue;
    if(taken.some(t=>Math.hypot(t.x-x,t.z-z)<2.2))continue;
    const v=V(x,y,z); taken.push(v); return v;
  }
  const v=c.clone().add(V((rnd()-.5)*4,0,(rnd()-.5)*4)); v.y=floorAt(v.x,v.z,c.y+3); if(v.y<-1e8)v.y=c.y; taken.push(v); return v;
}
function spawnPack(room){
  const pk=PACKS[room]; if(!pk||!G.monsters||!G.monsters.spawn)return;
  spawned.add(room);
  const c=roomCentre(room), zone={name:'cave-'+room,x:c.x,z:c.z,r:(LOCAL[room]&&LOCAL[room].r)||12}, taken=[];
  for(const kind of ['brineling','hollow']){
    let n=pk[kind]||0; if(kind==='hollow'&&isLit(room))n=Math.max(0,n-1); if(pk.darkOnly&&isLit(room))n=0;
    for(let i=0;i<n;i++){ try{ const p=pickSpot(room,taken); const m=G.monsters.spawn(kind,{x:p.x,y:p.y,z:p.z},{zone,cave:room,intro:kind==='hollow'}); mine.push(m); }catch(e){console.error('cave spawn',e);} }
  }
}
function clearMine(){ for(const m of mine)if(m.alive&&G.monsters.despawn)G.monsters.despawn(m); mine.length=0; spawned.clear(); }
/* the raft: brinelings climb out of the channel to get at the moths riding it */
let surfaceT=6;
function updateRaftRaiders(dt){
  const cp=G.cavePuzzles, r=cp&&cp.raft; if(!r||!r.lantern||!r.pos||curRoom!=='channel')return;
  if(cp.raid)return; // cave_puzzles.js runs the boarding waves now (telegraphed, scripted by raft progress)
  if(r.state==='done'||r.state==='arrived')return;
  surfaceT-=dt; if(surfaceT>0)return; surfaceT=12+rnd()*5;
  const C=G.creatures; let n=0; for(const mo of (C&&C.moths)||[]){ if(mo.tgt!=='lantern')continue; if(Math.hypot(mo.p.x-r.pos.x,mo.p.z-r.pos.z)<2.6)n++; }
  if(n<4)return;
  let alive=0; for(const m of mine) if(m.alive&&!m.dying&&m.kind==='brineling'&&m.cave==='channel')alive++;
  if(alive>=3||!G.monsters)return;
  const s=rnd()<.5?1:-1, x=r.pos.x+(rnd()-.5)*3, z=r.pos.z+s*(3+rnd()*1.2);
  const c=roomCentre('channel');
  try{ const m=G.monsters.spawn('brineling',{x,y:waterY()-.6,z},{zone:{name:'cave-channel',x:c.x,z:c.z,r:24},cave:'channel',board:true}); mine.push(m);
    INK()&&INK().burst(V(x,waterY(),z),{n:14,speed:2,size:[.3,.9],life:[.4,1],up:1.4,embers:3,drops:8});
    G.emit('cave:brinelingRises',{pos:V(x,waterY(),z)}); }catch(e){console.error(e);}
}
function updateRooms(dt){
  const inside=inCave();
  if(inside&&!wasInside){ spawned.clear(); if(!S.entered){S.entered=true;} }
  if(!inside&&wasInside){ clearMine(); curRoom=null; }
  wasInside=inside; if(!inside)return;
  roomT-=dt; if(roomT>0)return; roomT=.25;
  const P=G.player; if(!P||!P.pos)return;
  const id=roomOf(P.pos); curRoom=id;
  if(id&&PACKS[id]&&!spawned.has(id)&&isPlay())spawnPack(id);
  for(let i=mine.length-1;i>=0;i--){ const m=mine[i]; if(!m.alive){ mine.splice(i,1); continue; }
    if(m.pos.y<origin().y-12&&G.monsters.despawn){ G.monsters.despawn(m); mine.splice(i,1); } } // fell out of the cave (off a ledge into nothing)
}

/* =====================================================================
   2. THE UNDERTOW
   ===================================================================== */
const UT={hp:40,poolR:6.5,ringR:18,H:9,turns:2.15,
  lashWind:1.35,lashDur:.55,lashArc:1.9,lashReach:15.5,lashDmg:2,exposeT:3.4,
  surgeWind:1.6,surgeSpeed:7.5,surgeDmg:2,dragWind:2.2,dragN:6,dragEvery:11,coreMul:2,
  seeR:20,idleLo:[2.0,3.0],idleHi:[2.6,3.6]};
const NB=46, NA=24, NS=16, NR=170; // body rings, arm points, moth samples, rope points
const B={built:false,state:'sunk',st:0,hp:UT.hp,rise:0,vis:0,reveal:0,flash:0,fade:1,ang:0,phaseName:'',phaseN:0,
  cool:2,dragCD:4,slump:0,slumpDir:0,expose:0,lash:null,surge:null,drag:0,out:0,started:false,hitPlayer:false,dying:0,lens:null};
let A=V(), floorY=0, arenaOK=false;
function arenaGeo(){
  A=anchor('arena','pool',LOCAL.arena.c);
  // the pool's real size: walk out from the centre until the floor comes up to the ring
  let ring=-1e9; for(const a of [0,1.6,3.2,4.7]){ const y=floorAt(A.x+Math.cos(a)*(UT.ringR-4),A.z+Math.sin(a)*(UT.ringR-4),A.y+6); if(y>ring)ring=y; }
  floorY=ring>-1e8?ring:W(0,1,0).y;
  const dirs=[.4,2.0,3.6,5.2]; let pr=0;
  for(const a of dirs){ let r=3.5; for(;r<UT.ringR-3;r+=.25){ if(floorAt(A.x+Math.cos(a)*r,A.z+Math.sin(a)*r,floorY+3)>floorY-.6)break; } pr=Math.max(pr,r); }
  UT.poolR=U.clamp(pr||6.5,4,12); arenaOK=true;
}
/* ---- shader: ink that only exists where the moths are ---- */
const SN=G.SNOISE||'';
const UT_VS=`uniform float uTime;uniform float uAmp;uniform float uScale;
varying vec3 vN;varying vec3 vV;varying vec3 vW;varying vec2 vUv;
#include <fog_pars_vertex>
${SN}
void main(){ vUv=uv; vec4 wp=modelMatrix*vec4(position,1.); vec3 wn=normalize(mat3(modelMatrix)*normal);
  vec3 q=wp.xyz*uScale+vec3(0.,-uTime*.35,0.); float n=snoise(q)*.65+snoise(q*2.3+7.1)*.35; wp.xyz+=wn*uAmp*n;
  vec4 mvPosition=viewMatrix*wp; vN=normalize(mat3(viewMatrix)*wn); vV=normalize(-mvPosition.xyz); vW=wp.xyz;
  gl_Position=projectionMatrix*mvPosition;
  #include <fog_vertex>
}`;
const UT_FS=`uniform float uTime;uniform float uVis;uniform float uFade;uniform float uFlash;uniform float uReveal;uniform float uScale;uniform float uRope;
uniform vec3 uRim;uniform vec3 uInk;uniform vec3 uMP[${NS}];uniform float uMW[${NS}];
varying vec3 vN;varying vec3 vV;varying vec3 vW;varying vec2 vUv;
#include <fog_pars_fragment>
${SN}
void main(){
  float mf=0.; for(int i=0;i<${NS};i++){ vec3 d=vW-uMP[i]; mf+=uMW[i]*exp(-dot(d,d)*.32); }
  mf=clamp(mf,0.,1.4);
  float see=max(mf,uReveal);
  float vis=uVis*see;
  if(vis<.02)discard;
  vec3 q=vW*uScale*1.4+vec3(0.,-uTime*.45,0.);
  float n=snoise(q)*.5+.5; float n2=snoise(q*2.7+vec3(3.1,0.,1.7)+vec3(0.,uTime*.2,0.))*.5+.5; float dn=n*.6+n2*.4;
  if(dn>uFade*1.08+.02)discard;
  float f=1.-abs(dot(normalize(vN),normalize(vV)));
  float strand=uRope>.5?.55+.45*sin(vUv.x*40.+vUv.y*900.):1.;
  vec3 col=uInk*(.06+.94*pow(smoothstep(.3,1.,n2),2.2))*strand;
  col+=uRim*pow(f,2.4)*(.3+1.1*n)*mf*1.3;
  col+=uRim*.22*mf*smoothstep(.55,.95,n2);
  col+=uRim*uReveal*pow(f,3.)*.6;
  col+=uRim*(uFade<.98?smoothstep(uFade-.2,uFade,dn)*2.:0.);
  col+=vec3(.75,.6,1.)*uFlash*(.25+f);
  float a=vis*(.22+.78*smoothstep(.15,.85,f+(n-.5)*.35))*(1.-smoothstep(.9,1.08,f)*.6);
  gl_FragColor=vec4(col,clamp(a,0.,1.));
  #include <fog_fragment>
}`;
let SH=null; // shared uniforms
function utMat(ink,rope){
  const u=THREE.UniformsUtils.merge([THREE.UniformsLib.fog,{uAmp:{value:rope?.015:.09},uScale:{value:rope?2.4:.9},uRope:{value:rope?1:0},
    uInk:{value:U.col(ink).multiplyScalar(rope?.8:.6)},uRim:{value:U.col('#a57cff').multiplyScalar(2.1)}}]);
  if(!SH){ SH={uVis:{value:0},uFade:{value:1},uFlash:{value:0},uReveal:{value:0},
    uMP:{value:Array.from({length:NS},()=>V(0,-9999,0))},uMW:{value:new Array(NS).fill(0)}}; }
  for(const k in SH)u[k]=SH[k]; u.uTime=G.negTime;
  return new THREE.ShaderMaterial({uniforms:u,vertexShader:UT_VS,fragmentShader:UT_FS,fog:true,transparent:true,depthWrite:true,side:THREE.FrontSide});
}
/* ---- dynamic tube: rebuilt from a point list each frame (parallel-transport frames) ---- */
function makeTube(n,R,mat){
  const nv=n*R, pos=new Float32Array(nv*3), nor=new Float32Array(nv*3), uv=new Float32Array(nv*2), idx=[];
  for(let j=0;j<n;j++)for(let k=0;k<R;k++){uv[(j*R+k)*2]=k/R;uv[(j*R+k)*2+1]=j/(n-1);}
  for(let j=0;j<n-1;j++)for(let k=0;k<R;k++){const a=j*R+k,b=(j+1)*R+k,c=j*R+(k+1)%R,d=(j+1)*R+(k+1)%R; idx.push(a,c,b,b,c,d);}
  const geo=new THREE.BufferGeometry(); geo.setAttribute('position',new THREE.BufferAttribute(pos,3)); geo.setAttribute('normal',new THREE.BufferAttribute(nor,3));
  geo.setAttribute('uv',new THREE.BufferAttribute(uv,2)); geo.setIndex(idx);
  const mesh=new THREE.Mesh(geo,mat); mesh.frustumCulled=false; mesh.renderOrder=3;
  return {mesh,geo,pos,nor,n,R,Ns:Array.from({length:n},()=>V()),Bs:Array.from({length:n},()=>V())};
}
const _t=V(),_nn=V(),_bb=V(),_tmp=V();
function setTube(T,pts,radAt){
  const n=T.n,R=T.R;
  for(let j=0;j<n;j++){
    const a=pts[Math.max(0,j-1)], b=pts[Math.min(n-1,j+1)]; _t.subVectors(b,a); if(_t.lengthSq()<1e-9)_t.set(0,1,0); _t.normalize();
    if(j===0){ _nn.set(0,1,0); if(Math.abs(_t.y)>.9)_nn.set(1,0,0); }
    else _nn.copy(T.Ns[j-1]);
    _nn.addScaledVector(_t,-_nn.dot(_t)); if(_nn.lengthSq()<1e-9)_nn.set(1,0,0); _nn.normalize();
    _bb.crossVectors(_t,_nn);
    T.Ns[j].copy(_nn); T.Bs[j].copy(_bb);
    const r=radAt(j/(n-1)), c=pts[j];
    for(let k=0;k<R;k++){ const an=k/R*TAU, ca=Math.cos(an), sa=Math.sin(an), i=(j*R+k)*3;
      const nx=_nn.x*ca+_bb.x*sa, ny=_nn.y*ca+_bb.y*sa, nz=_nn.z*ca+_bb.z*sa;
      T.nor[i]=nx;T.nor[i+1]=ny;T.nor[i+2]=nz; T.pos[i]=c.x+nx*r;T.pos[i+1]=c.y+ny*r;T.pos[i+2]=c.z+nz*r; }
  }
  T.geo.attributes.position.needsUpdate=true; T.geo.attributes.normal.needsUpdate=true;
}
/* ---- build ---- */
let glowPts=null; const NGLOW=140;
let body,rope,arms=[],lensG=null,lensParts=[],lensCore,lensHalo,lensLight,ripples=[],surgeMesh=null;
const spine=Array.from({length:NB},()=>V()), coilP=Array.from({length:NB},()=>V()), slumpP=Array.from({length:NB},()=>V());
const ropePts=Array.from({length:NR},()=>V());
const samples=Array.from({length:NS},()=>V()), sampW=new Float32Array(NS), sampN=new Int32Array(NS);
const hbs=[], preyS=[], preyLine=[], preyRing=[], preyDrag=[];
let lensHB=null;
const lensPos=V(), lensCoil=V(), lensHome=V();
function buildUndertow(){
  if(B.built)return; B.built=true; arenaGeo();
  body=makeTube(NB,16,utMat('#22113a')); G.scene.add(body.mesh);
  rope=makeTube(NR,5,utMat('#3a2a1c',true)); G.scene.add(rope.mesh);
  for(let a=0;a<2;a++){ const T=makeTube(NA,11,utMat('#22113a')); G.scene.add(T.mesh);
    arms.push({T,pts:Array.from({length:NA},()=>V()),ctrl:Array.from({length:6},()=>V()),curve:null,root:a?Math.round(NB*.56):Math.round(NB*.3),
      th:a?PI*.9:-.4,drift:a?.07:-.06,mode:'rest',k:{wind:0,sweep:0},hit:0,a}); }
  for(const ar of arms){ ar.curve=new THREE.CatmullRomCurve3(ar.ctrl,false,'centripetal'); }
  // the lens: a broken Fresnel lens in a tarnished brass frame
  lensG=new THREE.Group(); G.scene.add(lensG);
  const glass=(o)=>new THREE.MeshBasicMaterial({color:U.col('#c9b6ff'),transparent:true,opacity:o,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide});
  const rings=[[.32,.07,TAU],[.55,.06,TAU*.82],[.78,.055,TAU*.7],[1.0,.05,TAU*.62],[1.2,.045,TAU*.45]];
  rings.forEach(([r,tb,arc],i)=>{ const m=new THREE.Mesh(new THREE.TorusGeometry(r,tb,6,40,arc),glass(.5)); m.rotation.z=i*1.3; m.userData.o=.5; lensG.add(m); lensParts.push(m); });
  const disc=new THREE.Mesh(new THREE.CircleGeometry(.3,24),glass(.35)); disc.userData.o=.35; lensG.add(disc); lensParts.push(disc);
  const brass=G.toon('#6b5532',{emissive:'#120a04',transparent:true});
  const fr=new THREE.Mesh(new THREE.TorusGeometry(1.32,.07,6,40,TAU*.58),brass); fr.rotation.z=2.2; fr.userData.o=1; lensG.add(fr); lensParts.push(fr);
  const fr2=new THREE.Mesh(new THREE.BoxGeometry(.1,2.5,.1),brass); fr2.rotation.z=.5; fr2.position.x=.2; fr2.userData.o=1; lensG.add(fr2); lensParts.push(fr2);
  lensCore=new THREE.Sprite(new THREE.SpriteMaterial({map:G.tex.flame,color:U.col('#c4a2ff').multiplyScalar(2.2),transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,opacity:0}));
  lensCore.scale.setScalar(1.1); lensG.add(lensCore);
  lensHalo=new THREE.Sprite(new THREE.SpriteMaterial({map:G.tex.soft,color:U.col('#8a5cff'),transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,opacity:0}));
  lensHalo.scale.setScalar(6); lensG.add(lensHalo);
  lensLight=new THREE.PointLight(0x9a6cff,0,16,1.6); lensG.add(lensLight);
  // the swarm glows where it has settled on the body (the moths themselves are unlit and drown in the cave's fog)
  { const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(NGLOW*3).fill(-9999),3));
    glowPts=new THREE.Points(g,new THREE.PointsMaterial({map:G.tex.soft,color:U.col('#efe2ff'),size:.75,sizeAttenuation:true,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending,fog:false}));
    glowPts.frustumCulled=false; glowPts.renderOrder=5; G.scene.add(glowPts); }
  // ripples on the pool (water, not the creature: visible in light — the only warning you get there)
  for(let i=0;i<5;i++){ const m=new THREE.Mesh(new THREE.RingGeometry(.92,1,48).rotateX(-PI/2),new THREE.MeshBasicMaterial({color:U.col('#a9c4d4'),transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending}));
    m.renderOrder=2; m.visible=false; G.scene.add(m); ripples.push({m,t:9,life:1.6,r0:1,r1:4}); }
  // hurtboxes + moth prey points (keyed to the hurtboxes so creatures.js keeps its hunters)
  for(let i=0;i<NS;i++){
    const hb={team:'enemy',pos:V(),radius:i<10?1.25:.95,height:2,targetable:false,corrupt:true,name:'The Undertow',undertow:true,sample:i,
      // creatures.js post-cure hunting opt-in: lure only in the dark; we place the moths ourselves (claimMoths/steerMoths)
      mothPrey:()=>B.rise>.5&&!S.defeated&&wantDark(),mothRange:40,mothWant:1,mothDamage:0,
      alive:()=>B.state!=='sunk'&&B.state!=='dead'&&B.state!=='dying'&&B.rise>.5,hit:info=>hitBody(i,info)};
    hbs.push(hb); G.combat.add(hb);
    preyS.push({key:hb,center:samples[i],alive:()=>hb.alive(),r:2.2});
    preyDrag.push({key:hb,center:V(),alive:()=>hb.alive(),r:2.2});
  }
  for(let j=0;j<6;j++)preyLine.push({key:hbs[0],center:V(),alive:()=>hbs[0].alive(),r:2});
  for(let j=0;j<10;j++)preyRing.push({key:hbs[1],center:V(),alive:()=>hbs[1].alive(),r:2});
  lensHB={team:'enemy',pos:V(),radius:1.0,height:1.6,get targetable(){return B.state==='miss'&&B.expose>0;},corrupt:false,name:'The Undertow’s lens',lockOffset:.8,
    alive:()=>B.expose>0&&B.state==='miss',hit:info=>hitCore(info)};
  G.combat.add(lensHB);
  setVisible(false);
}
function setVisible(v){ if(!B.built)return; body.mesh.visible=rope.mesh.visible=v; if(!v&&glowPts)glowPts.visible=false; for(const a of arms)a.T.mesh.visible=v; }
/* ---- pose ---- */
function baseY(){ return waterY()-2.6-(1-B.rise)*(UT.H+4); }
function computeCoil(t){
  const by=baseY(), bob=Math.sin(t*.7)*.25;
  for(let j=0;j<NB;j++){ const u=j/(NB-1);
    let rc=U.lerp(3.6,2.3,u)*(1+.06*Math.sin(t*1.3+u*7));
    const head=U.smooth(.84,1,u); rc*=U.lerp(1,.35,head);
    const a=B.ang+u*UT.turns*TAU;
    coilP[j].set(A.x+Math.cos(a)*rc,by+u*UT.H+head*.9+bob*u+.18*Math.sin(t*1.1+u*9),A.z+Math.sin(a)*rc);
  }
  lensCoil.set(A.x,Math.max(by+UT.H*.55,floorY+3.3)+bob*.5,A.z);
}
function computeSlump(t){ // the coil throws itself across the ring floor; the lens lies at the end of it
  const d=V(Math.cos(B.slumpDir),0,Math.sin(B.slumpDir)), by=baseY();
  const p0=V(A.x,by,A.z), p1=V(A.x-d.x*1.2,by+UT.H*.9,A.z-d.z*1.2), p2=V(A.x+d.x*(UT.poolR*.8),floorY+5.5,A.z+d.z*(UT.poolR*.8)), p3=V(A.x+d.x*(UT.poolR+2.6),floorY+.7,A.z+d.z*(UT.poolR+2.6));
  for(let j=0;j<NB;j++){ const u=Math.min(1,j/(NB-1)/.86), v=1-u;
    slumpP[j].set(v*v*v*p0.x+3*v*v*u*p1.x+3*v*u*u*p2.x+u*u*u*p3.x, v*v*v*p0.y+3*v*v*u*p1.y+3*v*u*u*p2.y+u*u*u*p3.y, v*v*v*p0.z+3*v*v*u*p1.z+3*v*u*u*p2.z+u*u*u*p3.z);
    if(j/(NB-1)>.86){ const e=(j/(NB-1)-.86)/.14; slumpP[j].addScaledVector(d,e*1.8); slumpP[j].y=floorY+.6-e*.1; slumpP[j].x+=-d.z*Math.sin(e*3+t)*.5*e; slumpP[j].z+=d.x*Math.sin(e*3+t)*.5*e; }
    slumpP[j].y+=Math.sin(t*9+j)*.04;
  }
  return p3;
}
const dirV=(th,out)=>out.set(Math.cos(th),0,Math.sin(th));
const _d=V(),_d2=V();
function armPose(ar,t){
  const root=spine[ar.root], c=ar.ctrl;
  let th=ar.th; const sweeping=ar.mode==='sweep', winding=ar.mode==='wind';
  dirV(th,_d);
  const lift=ar.hit*1.6, reach=sweeping?UT.lashReach:ar.mode==='slam'?UT.lashReach-.5:Math.min(UT.lashReach-1.5,5.5)+Math.sin(t*.4+ar.a*2)*1.2;
  // resting / sweeping: out of the pool and along the ring floor
  c[0].copy(root);
  c[1].set(root.x+_d.x*1.5,root.y+1.2,root.z+_d.z*1.5);
  c[2].set(A.x+_d.x*(UT.poolR-.6),Math.max(floorY+1.6,waterY()+.9)+lift,A.z+_d.z*(UT.poolR-.6));
  c[3].set(A.x+_d.x*(UT.poolR+1.4),floorY+.75+lift*.7,A.z+_d.z*(UT.poolR+1.4));
  const side=V(-_d.z,0,_d.x), curl=sweeping?-ar.sign*1.6:Math.sin(t*.5+ar.a)*1.2;
  c[4].set(A.x+_d.x*(UT.poolR+reach*.55),floorY+.65+lift*.4,A.z+_d.z*(UT.poolR+reach*.55)).addScaledVector(side,curl*.6);
  c[5].set(A.x+_d.x*(Math.min(UT.ringR-2.2,UT.poolR+reach)),floorY+.55+lift*.3,A.z+_d.z*Math.min(UT.ringR-2.2,UT.poolR+reach)).addScaledVector(side,curl);
  if(B.rise<1){ for(let i=2;i<6;i++){ c[i].lerp(_tmp.set(root.x+_d.x*i*.5,root.y-i*.8,root.z+_d.z*i*.5),1-B.rise); } }
  if(ar.k.wind>.001){ // rears up over the pool, the tip curled back: the lash is coming from here
    const w=ar.k.wind; dirV(ar.th,_d2);
    const up=[V(root.x,root.y,root.z),V(root.x+_d2.x,root.y+3.2,root.z+_d2.z),V(A.x+_d2.x*(UT.poolR-1),floorY+7.5,A.z+_d2.z*(UT.poolR-1)),
      V(A.x+_d2.x*(UT.poolR+1.2),floorY+9.5,A.z+_d2.z*(UT.poolR+1.2)),V(A.x+_d2.x*(UT.poolR+.3),floorY+11,A.z+_d2.z*(UT.poolR+.3)),V(A.x+_d2.x*(UT.poolR-1.5),floorY+10.2+Math.sin(t*14)*.15,A.z+_d2.z*(UT.poolR-1.5))];
    for(let i=0;i<6;i++)c[i].lerp(up[i],w);
  }
  for(let i=1;i<6;i++){ c[i].x+=Math.sin(t*2.2+i*1.3+ar.a*3)*.18*i/5; c[i].y+=Math.sin(t*1.7+i*1.9+ar.a)*.12*i/5; }
  for(let j=0;j<NA;j++)ar.curve.getPoint(j/(NA-1),ar.pts[j]);
}
function computeRope(t){
  const ns=body.Ns, bs=body.Bs;
  for(let k=0;k<NR;k++){ const u=k/(NR-1)*.93, f=u*(NB-1), j=Math.min(NB-2,Math.floor(f)), e=f-j;
    _tmp.lerpVectors(spine[j],spine[j+1],e);
    const r=bodyRad(u)*1.0+.05, ph=u*52+Math.sin(u*9)*.6;
    _nn.lerpVectors(ns[j],ns[j+1],e).normalize(); _bb.lerpVectors(bs[j],bs[j+1],e).normalize();
    ropePts[k].copy(_tmp).addScaledVector(_nn,Math.cos(ph)*r).addScaledVector(_bb,Math.sin(ph)*r);
  }
}
const bodyRad=u=>U.lerp(.95,.32,Math.pow(u,.8))*(u>.94?Math.max(.1,(1-u)/.06):1)*(1+.04*Math.sin(G.time*3+u*20));
const armRad=u=>U.lerp(.5,.06,Math.pow(u,.7));
/* ---- moths ---- */
function mothsAll(){ const C=G.creatures; return (C&&C.moths)||[]; }
function lanternLitNear(){
  const L=lantern(); if(!L||!L.found||L.inCradle||!(L.lit&&L.lit()))return false;
  const w=L.world&&L.world.lengthSq()>0?L.world:L.pos; return Math.hypot(w.x-A.x,w.z-A.z)<UT.seeR+UT.poolR*.5&&Math.abs(w.y-A.y)<15;
}
function wantDark(){ return !lanternLitNear()&&!isLit('arena'); }
let utMoths=[];
function claimMoths(){
  // the swarm leaves the shut lantern and goes to the thing in the pool
  const n0=utMoths.length;
  for(const m of mothsAll()){ if(m.undertow)continue;
    const adopt=m.tgt==='hunt'&&m.prey&&m.prey.key&&m.prey.key.undertow;
    if(m.tgt!=='lantern'&&!adopt)continue; if(Math.hypot(m.p.x-A.x,m.p.z-A.z)>32||Math.abs(m.p.y-A.y)>16)continue;
    m.undertow=true; m.tgt='hunt'; m.rad=.15+rnd()*.75; m.hy=rnd()*.9; m.feedB=null; m.next=null; m.delay=0;
    // least-populated sample first: an even outline
    let best=0,bn=1e9; for(let i=0;i<NS;i++){ let c=0; for(const o of utMoths)if(o._ut===i)c++; c+=(i>=10?.5:0); if(c<bn){bn=c;best=i;} }
    m._ut=best; m.prey=preyS[best]; utMoths.push(m); }
  if(utMoths.length>n0&&!S.said.reveal&&utMoths.length>=6)later(1.8,()=>{ if(B.state!=='sunk'&&wantDark())say('reveal','In the dark the moths find it at once — they pour off you and settle on something huge in the pool. A coil of rope and ink, wound around a light that isn’t one. Where they land, you can see it.',{priority:'high'}); });
}
function releaseMoths(){
  const baited=G.moths&&G.moths.baited;
  for(const m of utMoths){ m.undertow=false; m._ut=null; if(m.tgt!=='hunt')continue; m.prey=null;
    if(baited){ if(G.moths.toLantern)G.moths.toLantern(m); else {m.tgt='lantern';m.rad=.35+rnd()*1.4;} }
    else if(G.moths&&G.moths.release)G.moths.release(m); else if(G.creatures&&G.creatures.toPatch)G.creatures.toPatch(m); else m.tgt='wander'; }
  utMoths=[];
}
function steerMoths(){
  for(let i=utMoths.length-1;i>=0;i--){ const m=utMoths[i]; if(m.tgt!=='hunt'||!m.undertow){ m.undertow=false; utMoths.splice(i,1); } }
  const L=B.lash, lw=B.state==='lashWind'&&L, sw=B.state==='surgeWind', dg=B.state==='dragWind';
  for(const m of utMoths){
    const i=m._ut; let p=preyS[i];
    if(lw&&i>=10&&((i-10)/3|0)===L.arm.a)p=preyLine[m.i%preyLine.length];   // lifted off the arm, scattered in a line
    else if(sw)p=preyRing[m.i%preyRing.length];                                 // flung off in a ring at the pool edge
    else if(dg&&i<4)p=preyDrag[i];                                              // the lowest coils pull them under
    if(m.prey!==p){ m.prey=p; if(m._pg!==p){ m._pg=p; m.rad=sw||lw?.25+rnd()*.6:.15+rnd()*.75; } }
  }
  // weights for the shader + hit rule: how many moths are actually on each part
  sampN.fill(0);
  for(const m of utMoths){ const s=samples[m._ut]; if(m.p.distanceToSquared(s)<5.3)sampN[m._ut]++; }
  for(let i=0;i<NS;i++){ sampW[i]=U.damp(sampW[i],Math.min(1,sampN[i]/4),5,G.dt||1/30); SH.uMW.value[i]=sampW[i]*(B.state==='dragWind'&&i<4?1.4:1); SH.uMP.value[i].copy(samples[i]); }
}
function updateSamples(){
  for(let i=0;i<10;i++){ const j=Math.round(U.lerp(.1,.9,i/9)*(NB-1)); samples[i].copy(spine[j]); }
  for(let a=0;a<2;a++)for(let k=0;k<3;k++){ const j=Math.round([.42,.66,.88][k]*(NA-1)); samples[10+a*3+k].copy(arms[a].pts[j]); }
  for(let i=0;i<NS;i++){ hbs[i].pos.copy(samples[i]); hbs[i].pos.y-=1; }
  // telegraph targets
  if(B.lash){ const L=B.lash; dirV(L.th0,_d); for(let j=0;j<preyLine.length;j++){ const r=UT.poolR+1+j/(preyLine.length-1)*(UT.lashReach-1.5);
    preyLine[j].center.set(A.x+_d.x*r,floorY+1.5+Math.sin(G.time*3+j)*.2,A.z+_d.z*r); } }
  for(let j=0;j<preyRing.length;j++){ const a=j/preyRing.length*TAU+B.ang; preyRing[j].center.set(A.x+Math.cos(a)*(UT.poolR+.8),Math.max(floorY,waterY())+1.6,A.z+Math.sin(a)*(UT.poolR+.8)); }
  const wy=waterY(); for(let i=0;i<4;i++){ preyDrag[i].center.copy(samples[i]); preyDrag[i].center.y=U.lerp(samples[i].y,wy-1.2,B.drag); }
}
/* ---- hits ---- */
function hitBody(i,info){
  if(B.state==='sunk'||B.state==='dying'||B.state==='dead')return;
  if(info.kind==='swarm'){ return; }           // the moths only show it; they can't hurt it
  if(info.source&&info.source.undertow)return;
  // one swing sweeps through several of the 16 body hurtboxes at once: it lands once (the core keeps its own rule)
  if(G.time-(B.lastHitT||-9)<.3&&info.kind===B.lastHitKind)return;
  const pos=samples[i];
  if(sampW[i]<.28||B.vis<.5){                   // nothing there to hit: the staff passes through the black like water
    const I=INK(); I&&I.burst(V(pos.x,Math.min(pos.y,floorY+1.2),pos.z),{n:6,speed:1.5,size:[.3,.8],life:[.3,.7],up:.5,embers:0,drops:3,color:'#0b0a10'});
    if(B.vis<.5)later(.4,()=>say('through','The staff goes through the dark like it’s water. There is something there — you felt it give — but you can’t strike what you can’t see.',{key:'through'}));
    return;
  }
  B.lastHitT=G.time; B.lastHitKind=info.kind;
  damage(info.damage||1,info,false,pos);
  if(i>=10){ const ar=arms[(i-10)/3|0]; ar.hit=1; }
  if(B.state==='dragWind'&&i<4){ B.drag=0; setB('recover'); later(.2,()=>say('dragSaved','You strike at the coils dragging them down and they let go. The moths spill back up into the dark.',{priority:'high'})); }
}
function hitCore(info){
  if(B.state!=='miss'||B.expose<=0||info.kind==='swarm')return;
  damage((info.damage||1)*UT.coreMul,info,true,lensPos);
  B.expose=Math.max(B.expose-.6,.25);
}
function damage(d,info,core,pos){
  B.hp=Math.max(0,B.hp-d); B.flash=1;
  const FXk=FX(); if(FXk)FXk.splash(V(pos.x,Math.min(pos.y,floorY+1.4),pos.z),info.dir||V(0,0,1),core?1.4:.9);
  G.ui.shake&&G.ui.shake(core?.35:.12);
  G.emit('cave:bossHit',{core,damage:d,hp:B.hp}); voice('hurt',pos);
  if(B.hp<=0)startDying();
}
/* ---- telegraph audio (audio.js owns the real sounds; this is a fallback hiss if it doesn't listen) ---- */
function voice(action,pos){ const Au=G.audio; if(!Au||!Au.cave||!Au.cave.undertow)return; try{ Au.cave.undertow(action,pos||V(A.x,floorY+3,A.z)); }catch(e){} }
function telegraph(kind,pos,lead){
  G.emit('cave:bossTelegraph',{kind,pos:pos.clone(),lead});
  voice(kind==='drag'?'grab':'wind',pos);   // the wet rising hiss
}
let creakT=1;
function creak(dt){ if((creakT-=dt)>0)return; creakT=1+rnd()*1.6; voice('creak',samples[(rnd()*10)|0]); }
function ripple(x,z,r0,r1,life,o){ const R=ripples.find(q=>q.t>=q.life); if(!R)return; R.t=0; R.life=life; R.r0=r0; R.r1=r1; R.o=o||.35; R.x=x; R.z=z; R.m.visible=true; }
function updateRipples(dt){
  const wy=Math.max(waterY(),floorY-5);
  for(const R of ripples){ if(R.t>=R.life){R.m.visible=false;continue;} R.t+=dt; const k=R.t/R.life;
    const r=U.lerp(R.r0,R.r1,1-Math.pow(1-k,2)); R.m.scale.set(r,1,r); R.m.position.set(R.x,wy+.04,R.z); R.m.material.opacity=R.o*(1-k)*Math.min(1,k*6); }
}
/* ---- state machine ---- */
function setB(s){ B.state=s; B.st=0; }
function phaseNow(){ const lv=G.tide?G.tide.level:0, drag=B.hp<=UT.hp*.5; return {name:(lv>.35?'high':lv<-.35?'low':'mid')+(drag?'-drag':''),high:lv>.35,drag}; }
function startFight(){
  if(!B.built)buildUndertow(); arenaGeo();
  setB('rise'); setVisible(true);
  if(!B.started){ B.started=true; G.emit('cave:bossStart',{}); }
  if(!S.bossSeen){ S.bossSeen=true; G.ui.say('The pool is very still. Then, slowly, it isn’t — the water heaves as if something under it has turned over in its sleep.',{priority:'high'}); }
  G.emit('cave:bossTelegraph',{kind:'rise',pos:A.clone(),lead:3}); voice('rise');
  for(let i=0;i<4;i++)later(i*.6,()=>ripple(A.x,A.z,1,UT.poolR+2,2.2,.45));
  B.phaseName='';
}
function sink(){ setB('sinking'); G.ui.bossBar(null); releaseMoths(); B.lash=null; B.surge=null; B.slump=0; B.expose=0; for(const a of arms){a.mode='rest';a.k.wind=0;} }
function chooseAttack(force){
  const ph=phaseNow(), pp=G.player.pos;
  if(force==='lash')ph.high=ph.drag=false;
  if(ph.drag&&B.dragCD<=0&&utMoths.length>=4){ B.dragCD=UT.dragEvery; setB('dragWind'); B.drag=0; telegraph('drag',A,UT.dragWind);
    if(!S.said.drag)later(.3,()=>{ say('drag','The lower coils are churning — it’s dragging the moths down with it! Strike the coils, or open the lantern and call them back.',{priority:'high'}); G.ui.toast&&G.ui.toast('The swarm is being pulled under','Strike the coils or open the lantern'); }); return; }
  if(ph.high&&rnd()<.6){ setB('surgeWind'); telegraph('surge',A,UT.surgeWind); B.surge=null; return; }
  // lash: the arm nearest the player sweeps across them
  const thp=Math.atan2(pp.z-A.z,pp.x-A.x);
  let ar=arms[0]; if(Math.abs(U.angDiff(thp,arms[1].th))<Math.abs(U.angDiff(thp,arms[0].th)))ar=arms[1];
  const sign=Math.sign(U.angDiff(thp,ar.th))||1;
  B.lash={arm:ar,sign,th0:thp-sign*UT.lashArc*.5,th1:thp+sign*UT.lashArc*.5,thStart:ar.th,set:new Set(),hit:false};
  ar.sign=sign; ar.mode='wind'; setB('lashWind'); telegraph('lash',dirV(B.lash.th0,V()).multiplyScalar(UT.poolR+3).add(A),UT.lashWind);
}
function updateFight(dt){
  const t=G.time, P=G.player, pp=P.pos;
  B.st+=dt; B.cool-=dt; B.dragCD-=dt;
  B.ang+=dt*.05;
  for(const ar of arms){ ar.hit=Math.max(0,ar.hit-dt*2.5); if(ar.mode==='rest')ar.th+=ar.drift*dt; }
  // phase follows the tide
  if(B.state!=='rise'&&B.state!=='sinking'){ const ph=phaseNow(); if(ph.name!==B.phaseName){ B.phaseName=ph.name; B.phaseN++; G.emit('cave:bossPhase',{n:B.phaseN,name:ph.name,high:ph.high,drag:ph.drag}); } }
  switch(B.state){
    case 'rise': B.rise=Math.min(1,B.st/3.2); if(B.rise>=1){ setB('idle'); B.cool=2.2; } break;
    case 'sinking': B.rise=Math.max(0,B.rise-dt/2.5); if(B.rise<=0){ setB('sunk'); setVisible(false); } break;
    case 'idle':
      if(B.cool<=0&&P.alive!==false)chooseAttack();
      break;
    case 'lashWind':{
      const L=B.lash, ar=L.arm; ar.k.wind=U.smooth(0,.55,B.st); ar.th=U.lerp(L.thStart,L.th0,U.smooth(0,.8,B.st/UT.lashWind));
      if(rnd()<dt*8){ const I=INK(); dirV(ar.th,_d); I&&I.burst(V(A.x+_d.x*UT.poolR,Math.max(waterY(),floorY)+.1,A.z+_d.z*UT.poolR),{n:3,speed:1.2,size:[.3,.8],life:[.4,.8],up:1.4,embers:1,drops:2}); }
      if(B.st>.2&&B.st<.25)ripple(A.x+Math.cos(L.th0)*(UT.poolR-1),A.z+Math.sin(L.th0)*(UT.poolR-1),.6,3,1,.5);
      if(B.st>=UT.lashWind){ ar.mode='sweep'; setB('lash'); G.emit('cave:bossLash',{}); voice('lash',ar.pts[NA>>1]); }
      break;}
    case 'lash':{
      const L=B.lash, ar=L.arm, k=Math.min(1,B.st/UT.lashDur);
      ar.k.wind=Math.max(0,1-k*4); ar.th=L.th0+(L.th1-L.th0)*U.smooth(0,1,k);
      // the arm along the floor strikes
      for(let j=5;j<NA;j+=2){ const q=ar.pts[j]; if(q.y>floorY+2.6)continue;
        const h=G.combat.strike({x:q.x,y:floorY+.7,z:q.z,radius:.95,team:'enemy',damage:UT.lashDmg,knockback:10,kind:'melee',source:hbs[0],exclude:L.set});
        if(h.some(x=>x.team==='player'))L.hit=true; }
      if(FX()&&rnd()<.7){ const q=ar.pts[(8+rnd()*(NA-8))|0]; FX().puff(q.x,floorY+.2,q.z,(rnd()-.5)*3,1+rnd()*2,(rnd()-.5)*3,.6,.4,1.2,.6,null,0,2); }
      if(k>=1){ if(L.hit){ ar.mode='rest'; setB('recover'); }
        else { ar.mode='slam'; B.slumpDir=L.th1; setB('miss'); B.expose=UT.exposeT; G.ui.shake&&G.ui.shake(.4); G.emit('cave:bossMiss',{});
          const q=ar.pts[NA-4]; INK()&&INK().burst(V(q.x,floorY+.3,q.z),{n:30,speed:3,size:[.5,1.6],life:[.6,1.3],up:1,embers:12,drops:12});
          if(!S.said.core)later(.5,()=>say('core','It overreached — the coil has flung itself half out of the pool, and at the end of it something glows: a broken lens. Strike it!',{priority:'high'})); } }
      break;}
    case 'miss':{
      B.slump=Math.min(1,B.slump+dt*3.5); B.expose-=dt;
      if(B.expose<=0){ setB('recover'); }
      break;}
    case 'recover':
      B.slump=Math.max(0,B.slump-dt*1.4); B.drag=Math.max(0,B.drag-dt*2);
      for(const ar of arms){ if(ar.mode!=='rest'&&B.st>.4)ar.mode='rest'; ar.k.wind=Math.max(0,ar.k.wind-dt*3); }
      if(B.st>1.2&&B.slump<=0){ B.lash=null; setB('idle'); const lo=phaseNow().high?UT.idleHi:UT.idleLo; B.cool=U.lerp(lo[0],lo[1],rnd()); }
      break;
    case 'surgeWind':
      B.rise=1-.25*U.smooth(0,1,B.st/UT.surgeWind);
      if(rnd()<dt*5)ripple(A.x,A.z,UT.poolR*.6,UT.poolR+1.5,1.1,.55);
      if(rnd()<dt*14&&FX()){ const a=rnd()*TAU; FX().puff(A.x+Math.cos(a)*UT.poolR,waterY()+.1,A.z+Math.sin(a)*UT.poolR,Math.cos(a)*.6,1.4+rnd(),Math.sin(a)*.6,.8,.4,1.4,.5,null,0,1); }
      if(B.st>=UT.surgeWind){ B.rise=1; B.surge={r:3,hit:false}; setB('surge'); G.ui.shake&&G.ui.shake(.45); G.emit('cave:bossSurge',{}); voice('surge'); }
      break;
    case 'surge':{
      const s=B.surge; s.r+=UT.surgeSpeed*dt;
      if(surgeMesh&&surgeMesh.material.uniforms){ surgeMesh.visible=true; surgeMesh.position.set(A.x,floorY+.08,A.z); surgeMesh.material.uniforms.uR.value=s.r/surgeMesh.userData.k; surgeMesh.material.uniforms.uA.value=1-U.smooth(UT.ringR-3,UT.ringR+1,s.r); }
      const F=FX(); if(F){ const nP=Math.round(s.r*dt*30*.9); for(let k=0;k<nP;k++){ const a=rnd()*TAU, ca=Math.cos(a), sa=Math.sin(a);
        F.puff(A.x+ca*s.r,floorY+.15,A.z+sa*s.r,ca*3.5,1.4+rnd()*1.8,sa*3.5,.5+rnd()*.3,.5,1.5,.7,null,0,2.5); if(rnd()<.2)F.ember(A.x+ca*s.r,floorY+.4,A.z+sa*s.r,ca*2,1.6,sa*2,.5,.2); } }
      if(!s.hit&&P.alive!==false){ const d=Math.hypot(pp.x-A.x,pp.z-A.z), air=pp.y-floorAt(pp.x,pp.z,pp.y+.3);
        if(Math.abs(d-s.r)<.8&&air<.5&&Math.abs(pp.y-floorY)<2.5){ const h=G.combat.strike({x:pp.x,y:pp.y+.4,z:pp.z,radius:.35,team:'enemy',damage:UT.surgeDmg,knockback:9,kind:'shockwave',source:hbs[1]}); if(h.length)s.hit=true; } }
      if(s.r>UT.ringR+1){ if(surgeMesh)surgeMesh.visible=false; B.surge=null; setB('recover'); }
      break;}
    case 'dragWind':{
      B.drag=U.smooth(0,1,B.st/UT.dragWind);
      if(rnd()<dt*10&&FX()){ const a=rnd()*TAU; FX().puff(A.x+Math.cos(a)*2.5,waterY()+.05,A.z+Math.sin(a)*2.5,0,.9,0,.6,.3,.9,.6,null,0,1); }
      if(rnd()<dt*3)ripple(A.x,A.z,1,3.5,.9,.4);
      if(B.st>=UT.dragWind){ // whatever it has hold of goes under
        let n=0; const wy=waterY();
        for(const m of utMoths.slice()){ if(n>=UT.dragN)break; if(m._ut>=4||m.p.y>wy+1.6)continue;
          if(G.moths&&G.moths.kill)G.moths.kill(m,true); else{ m.tgt='gone'; } n++; }
        if(n){ if(!(G.moths&&G.moths.kill))G.emit('moths:lost',{n,pos:A.clone(),by:'undertow'}); G.ui.toast&&G.ui.toast('The Undertow',n+' moths dragged under'); }
        B.drag=0; setB('recover'); }
      break;}
  }
  // the lens: wound inside the coil, or flung out at the end of a missed lash
  computeCoil(t); const lensEnd=computeSlump(t);
  const k=U.smooth(0,1,B.slump);
  for(let j=0;j<NB;j++)spine[j].lerpVectors(coilP[j],slumpP[j],k*U.smooth(0,.25,j/(NB-1)));
  lensPos.lerpVectors(lensCoil,_tmp.copy(lensEnd).add(V(0,.35,0)),k);
  lensHB.pos.copy(lensPos).y-=.6;
}
function startDying(){
  setB('dying'); B.lash=null; B.surge=null; for(const a of arms){a.mode='rest';a.k.wind=0;}
  G.ui.shake&&G.ui.shake(.9); G.ui.bossBar('The Undertow',0);
  const I=INK(); if(I)for(let i=0;i<10;i++)I.burst(samples[i],{n:24,speed:3,size:[.8,2.2],life:[.8,1.6],up:1.2,embers:10,drops:6});
  G.emit('cave:bossDying',{}); voice('death');
}
function updateDying(dt){
  const t=G.time, st=B.st+=dt;
  B.reveal=Math.min(1,st*3); B.fade=1-U.smooth(1,3.4,st); B.slump=Math.max(0,B.slump-dt);
  for(const ar of arms){ ar.th+=Math.sin(t*6+ar.a*2)*dt*1.5; ar.hit=.5+.5*Math.sin(t*9+ar.a); }
  computeCoil(t); const k=U.smooth(0,1,B.slump); const le=computeSlump(t);
  for(let j=0;j<NB;j++){ spine[j].lerpVectors(coilP[j],slumpP[j],k*U.smooth(0,.25,j/(NB-1))); spine[j].x+=(rnd()-.5)*.12*B.fade; spine[j].z+=(rnd()-.5)*.12*B.fade; }
  // the lens comes free and rises out of the black
  const lr=U.smooth(2.4,4.6,st);
  lensPos.lerpVectors(_tmp.lerpVectors(lensCoil,le,k),V(A.x,Math.max(waterY(),floorY)+4.6,A.z),lr);
  const F=FX(); if(F&&B.fade>0){ for(let n=0;n<Math.round(5*dt*30);n++){ const s=samples[(rnd()*NS)|0]; F.puff(s.x+(rnd()-.5)*2,s.y+(rnd()-.5)*2,s.z+(rnd()-.5)*2,(rnd()-.5)*1.4,.8+rnd()*1.6,(rnd()-.5)*1.4,1.2+rnd(),1.2,3.4,.65,null,0,1); }
    if(rnd()<dt*14){ const s=samples[(rnd()*NS)|0]; F.ember(s.x,s.y,s.z,(rnd()-.5)*3,2+rnd()*2,(rnd()-.5)*3,1.2,.3); } }
  if(st>=5)B.state='dead';
  if(st>=3.4&&!B.burst){ B.burst=1; const I=INK(); if(I){ I.burst(V(A.x,floorY+3,A.z),{n:220,speed:8,size:[1.2,4],life:[1,2.4],up:2.5,embers:140,drops:40}); I.burst(V(A.x,floorY+6,A.z),{n:90,speed:4,size:[2,5],life:[1.6,3],up:4,embers:60}); }
    G.ui.shake&&G.ui.shake(1); setVisible(false); onDefeated(false); }
}
/* ---- defeat ---- */
function pedestalPos(){ return anchor('arena','pedestal',[60,1,-3]); }
function onDefeated(restored){
  S.defeated=true; B.state=restored?'dead':B.state; G.flag('undertowDead',true);
  G.ui.bossBar(null); releaseMoths();
  if(!B.built)buildUndertow();
  lensHome.copy(pedestalPos()).add(V(0,3.3,0));
  if(restored){ setB('dead'); setVisible(false); lensPos.copy(lensHome); showPage(3,true); return; }
  G.emit('cave:bossDead',{pos:A.clone()});
  G.emit('monster:killed',{kind:'undertow',pos:V(A.x,floorY,A.z),boss:true});
  try{ G.cave&&G.cave.collapseWall&&G.cave.collapseWall(); }catch(e){console.error('collapseWall',e);}
  later(1.2,()=>{ G.ui.say('The black lets go of it all at once. What it was holding rises out of the pool — a piece of a keeper’s lens, still warm, still turning toward a light that isn’t there.',{priority:'high'}); G.ui.toast&&G.ui.toast('The Undertow','The lens is free'); });
  later(2.6,()=>{ try{ G.cave&&G.cave.lightRoom&&G.cave.lightRoom('arena'); }catch(e){console.error('arena light',e);} }); // the lens rises and the arena's veins catch its light
  later(5.5,()=>{ try{ G.moths&&G.moths.jar&&G.moths.jar.give&&G.moths.jar.give(); }catch(e){console.error('jar',e);} showPage(3,false); });
  B.woundBeat=true;
  if(!(G.cave&&G.cave.collapseWall))later(9,()=>G.emit('cave:wound',{pos:anchor('arena','wound',[60,-6,8])}));
}
function updateLens(dt){
  if(!lensG)return;
  const t=G.time, dead=S.defeated, st=B.state;
  if(dead&&st!=='dying'){ // drifting to the pedestal, then resting there
    if(lensPos.distanceTo(lensHome)>.02){ lensPos.lerp(lensHome,1-Math.exp(-dt*.9)); }
    lensG.position.set(lensPos.x,lensPos.y+Math.sin(t*1.1)*.06,lensPos.z);
  }else lensG.position.copy(lensPos);
  lensG.rotation.y+=dt*(st==='miss'?1.4:.35); lensG.rotation.x=Math.sin(t*.6)*.25;
  const vis=dead?1:B.vis*(st==='sunk'?0:1);
  const exposed=st==='miss'?Math.min(1,B.expose*3):0;
  const near=Math.min(1,(sampW[4]+sampW[5]+sampW[6])/2);
  const show=dead?1:Math.max(exposed,st==='dying'?1:.12+near*.5);
  lensG.visible=vis*show>.01;
  for(const m of lensParts)m.material.opacity=m.userData.o*vis*show;
  const pulse=.75+.25*Math.sin(t*(exposed?9:2));
  lensCore.material.opacity=vis*(dead?.55:exposed?1:show*.6)*pulse; lensCore.scale.setScalar(dead?.9:exposed?1.6:1);
  lensHalo.material.opacity=vis*(dead?.18:exposed*.45+show*.08);
  lensLight.intensity=vis*(dead?1.1:exposed*3+show*.3);
}
/* ---- render ---- */
function renderUndertow(dt){
  if(!B.built||B.state==='sunk'&&B.rise<=0)return;
  for(const ar of arms)armPose(ar,G.time);
  setTube(body,spine,bodyRad); computeRope(G.time); setTube(rope,ropePts,()=>.075);
  for(const ar of arms)setTube(ar.T,ar.pts,armRad);
  updateSamples();
  B.vis=U.damp(B.vis,wantDark()?1:0,3,dt);
  if(glowPts){ const a=glowPts.geometry.attributes.position.array; let k=0;
    for(const m of utMoths){ if(k>=NGLOW)break; if(m.tgt!=='hunt')continue; a[k*3]=m.p.x;a[k*3+1]=m.p.y;a[k*3+2]=m.p.z; k++; }
    for(let i=k;i<NGLOW;i++)a[i*3+1]=-9999; glowPts.geometry.attributes.position.needsUpdate=true;
    glowPts.material.opacity=.55*B.vis*B.fade; glowPts.visible=k>0; }
  SH.uVis.value=B.vis; SH.uFade.value=B.fade; B.flash=Math.max(0,B.flash-dt*4); SH.uFlash.value=B.flash*.8; SH.uReveal.value=B.reveal;
}
/* ---- the fight's frame ---- */
let outT=0, deadT=0, hintT=0;
function updateBoss(dt){
  if(S.defeated){ if(B.state==='dying'){ updateDying(dt); renderUndertow(dt); } updateLens(dt); return; }
  if(!B.built){ if(inCave())buildUndertow(); else return; }
  const P=G.player, pp=P&&P.pos; if(!pp)return;
  const inArena=inCave()&&(roomOf(pp)==='arena'||Math.hypot(pp.x-A.x,pp.z-A.z)<UT.ringR+1)&&Math.hypot(pp.x-A.x,pp.z-A.z)<UT.ringR+3&&Math.abs(pp.y-floorY)<8;
  if(B.state==='sunk'){ if(inArena&&isPlay()&&P.alive!==false)startFight(); else { updateLens(dt); return; } }
  if(B.state==='dying'){ updateDying(dt); renderUndertow(dt); updateLens(dt); return; }
  // leaving the arena: it sinks back down and waits (keeps its wounds)
  if(!inArena&&B.state!=='sinking'){ outT+=dt; if(outT>2.5){ outT=0; sink(); } } else outT=0;
  if(B.state==='sinking'&&inArena&&P.alive!==false)setB('rise');
  if(isPlay()){ updateFight(dt); if(B.state!=='sinking')creak(dt); }
  // the swarm: on the body in the dark, back to the lantern in the light
  if(B.state!=='sinking'&&B.rise>.6){ if(wantDark())claimMoths(); else if(utMoths.length)releaseMoths(); }
  steerMoths();
  renderUndertow(dt);
  updateLens(dt);
  updateRipples(dt);
  if(B.state!=='sinking'&&B.state!=='sunk')G.ui.bossBar('The Undertow',B.hp/UT.hp);
  // a nudge if the player fights it in the light
  if(B.state!=='rise'&&B.state!=='sinking'&&!wantDark()){ hintT+=dt; if(hintT>9)say('shut','Your light goes straight through it. The moths are straining off the lantern toward the pool — toward something you can’t see. They’d find it in the dark.'); } else hintT=0;
}
/* player death: the boss resets; a few lost moths find their way back */
G.on('player:respawn',()=>{
  if(!B.built||S.defeated)return;
  const was=B.state!=='sunk'||B.started;
  releaseMoths(); B.hp=UT.hp; B.rise=0; B.slump=0; B.expose=0; B.lash=null; B.surge=null; B.drag=0; B.dragCD=4; B.started=false; setB('sunk'); setVisible(false);
  if(surgeMesh)surgeMesh.visible=false; G.ui.bossBar(null);
  for(const a of arms){a.mode='rest';a.k.wind=0;}
  if(!was)return;
  const P=G.player, baited=G.moths&&G.moths.baited; let n=0;
  for(const m of mothsAll()){ if(n>=15)break; if(m.tgt!=='gone'||m.cave)continue;
    m.p.set(P.pos.x+(rnd()-.5)*3,P.pos.y+1+rnd(),P.pos.z+(rnd()-.5)*3); m.v.set(0,.5,0);
    if(baited){ if(G.moths.toLantern)G.moths.toLantern(m); else {m.tgt='lantern';m.rad=.4+rnd();} } else { m.tgt='wander'; m.home=null; }
    n++; }
  if(n)G.emit('moths:regrow',{n});
});

/* =====================================================================
   3. HESPER'S LOGBOOK — three pages
   ===================================================================== */
const PAGES={
  1:{room:'gallery',fb:[-6,3,-41],text:'“Down to the keepers’ cave at low water, the way old Tam said every keeper does once — to see the faces. Tide used to dare me to come down here. He never did either. I counted thirty-one, and room left for more. Past the stair there was a light under the water. Low, and violet, and patient. I didn’t go after it. Not today.” — H.'},
  2:{room:'channel',fb:[22,4,-86],text:'“Brought the lamp down again. The dark gives way to it here, like it always does — but then it comes back closer, as if it has been listening for the place where the light stops. Close the shutter and you can hear it. The moths hear it too. They go quiet, and then they go toward it.” — H.'},
  3:{room:'arena',fb:[60,1,-3],text:'“It isn’t a light. It’s a seam in the floor of the sea, and something comes in through it the way water comes into a hull — slowly, and then all at once. The thing in the pool was a keeper’s lens once. I think it was trying to hold the seam shut. I’m going down to where it comes in. If the tide turns and I’m not back, don’t come after me. That’s for Da. Tide won’t listen anyway.”'}
};
const pageObjs={};
function pageTex(){
  return G.canvasTex(128,(g,s)=>{
    g.fillStyle='#d8ccb0'; g.fillRect(0,0,s,s);
    const gr=g.createRadialGradient(s/2,s/2,s*.2,s/2,s/2,s*.75); gr.addColorStop(0,'rgba(0,0,0,0)'); gr.addColorStop(1,'rgba(70,50,30,.55)'); g.fillStyle=gr; g.fillRect(0,0,s,s);
    g.strokeStyle='rgba(50,36,40,.75)'; g.lineWidth=1.4;
    for(let y=16;y<s-12;y+=9){ g.beginPath(); let x=12; g.moveTo(x,y); while(x<s-14){ x+=4+Math.random()*7; g.lineTo(x,y+(Math.random()-.5)*1.5); if(Math.random()<.18){x+=5; g.moveTo(x,y);} } g.stroke(); }
    g.fillStyle='rgba(60,40,70,.35)'; g.beginPath(); g.arc(s*.75,s*.7,9,0,TAU); g.fill(); // a water stain
  },true);
}
function buildPage(n){
  if(pageObjs[n])return pageObjs[n];
  const d=PAGES[n];
  let pos=n===3?(anchor('arena','page',null)||pedestalPos().add(V(.9,0,.4))):anchor(d.room,'page',d.fb);
  const y=floorAt(pos.x,pos.z,pos.y+1.5); if(y>-1e8&&Math.abs(y-pos.y)<2.5)pos.y=y;
  const g=new THREE.Group(); g.position.copy(pos); g.rotation.y=rnd()*TAU;
  const tex=pageTex();
  // a curled page propped against a stone, tilted up so it reads from the follow camera (flat on the floor it was a white tile)
  const geo=new THREE.PlaneGeometry(.42,.54,4,4).rotateX(-PI/2); { const p=geo.attributes.position; for(let i=0;i<p.count;i++)p.setY(i,.025*Math.sin(p.getX(i)*9)+.02*p.getZ(i)*p.getZ(i)*20); geo.computeVertexNormals(); }
  const paper=new THREE.Mesh(geo,new THREE.MeshToonMaterial({map:tex,color:0xffffff,emissive:U.col('#3a2c1a'),emissiveIntensity:.6,side:THREE.DoubleSide,transparent:true}));
  paper.position.set(0,.16,.02); paper.rotation.set(.62,.2,0,'YXZ'); g.add(paper);
  const stone=new THREE.Mesh(new THREE.DodecahedronGeometry(.17,0),G.toon('#5d5a63')); stone.scale.set(1.3,.75,1); stone.position.set(-.04,.1,-.26); g.add(stone);
  if(G.outline)G.outline(stone,{thickness:.012});
  const glow=new THREE.Sprite(new THREE.SpriteMaterial({map:G.tex.soft,color:U.col('#e3b46a'),transparent:true,opacity:.28,depthWrite:false,blending:THREE.AdditiveBlending}));
  glow.scale.setScalar(1.5); glow.position.y=.3; g.add(glow);
  G.scene.add(g);
  const o={n,g,pos,paper,glow,shown:n!==3,fade:n!==3?1:0};
  g.visible=o.shown;
  G.interact.add({pos:()=>o.pos,radius:1.8,priority:2,label:()=>S.pages[n]?'Read Hesper’s page again':'Read the page',
    enabled:()=>o.shown&&isPlay(),use:()=>readPage(n)});
  pageObjs[n]=o; return o;
}
function showPage(n,instant){ const o=buildPage(n); o.shown=true; o.g.visible=true; if(instant)o.fade=1; }
function readPage(n){
  // a reading: the conversation card with the book (talk.js; captions instead if something is after you)
  const card={who:'page',name:'Hesper’s logbook',title:'Page '+n+' of 3',portrait:'page',lines:[PAGES[n].text],key:'page'};
  if(G.talk&&G.talk.moment)G.talk.moment(card); else G.ui.say(PAGES[n].text,'Hesper’s logbook',{priority:'high',key:'page'});
  const first=!S.pages[n]; S.pages[n]=true;
  G.emit('cave:page',{n,first});
  if(first){ const k=Object.keys(S.pages).length; G.ui.toast&&G.ui.toast('Hesper’s logbook',k+' of 3 pages'); }
}
function updatePages(dt){
  if(!inCave())return;
  for(const n of [1,2,3]){ const o=buildPage(n); if(!o.shown)continue;
    o.fade=Math.min(1,o.fade+dt*.6); o.paper.material.opacity=o.fade; o.glow.material.opacity=(.26+.12*Math.sin(G.time*1.7+n))*o.fade*(S.pages[n]?.5:1); }
}

/* =====================================================================
   4. DISCOVERY + HALLORAN
   ===================================================================== */
function discover(src){
  if(S.discovered)return; const mp=mouthPos(); if(!mp)return;
  S.discovered=true;
  const lines={tide:'The sea has drawn back from the foot of the lighthouse cliff. Where the water stood a moment ago there is a black arch in the rock, breathing cold air.',
    logbook:'Pressed between the last pages, a tide table in the same tidy hand. One line is underlined twice: “Keepers’ cave, foot of the cliff — low water only. Mind the stair.”',
    halloran:'The keepers’ cave. At the foot of the cliff, where the sea goes out.'};
  if(src!=='halloran')G.ui.say(lines[src]||lines.tide);
  setQuest();
  G.emit('cave:discovered',{src});
}
function setQuest(){ const mp=mouthPos(); if(!mp||!G.quest)return; G.quest.set('cave','The Drowned Keepers’ Cave','Only at low tide',mp.clone().add(V(0,1.5,0)),'Sea cave'); }
let discT=0;
function updateDiscovery(dt){
  if(!looping()||!isPlay())return;
  discT-=dt; if(discT>0)return; discT=.5;
  const P=G.player, mp=mouthPos(); if(!P||!P.pos||!mp)return;
  if(!S.discovered&&G.tide&&G.tide.low&&Math.hypot(P.pos.x-mp.x,P.pos.z-mp.z)<120&&!inCave())discover('tide');
  // wrap the cottage logbook(s): reading it again during the loop also points you at the cave
  for(const o of G.interact.list){ if(o._caveWrapped||G.interact.label(o)!=='Read the logbook')continue; o._caveWrapped=true;
    const use=o.use; o.use=function(){ const r=use.apply(this,arguments); if(looping()&&!S.discovered)later(4.5,()=>discover('logbook')); return r; }; }
}
G.on('cave:wound',()=>{ if(!B.woundBeat)return; B.woundBeat=false;   // cave.js reveals it once the far wall is down
  later(4,()=>say('wound','Through the fallen wall, far down: a crack in the sea floor, breathing violet. This is where it comes in.',{priority:'high'})); });
G.on('tide:low',()=>{ // a nudge each low tide until the player has been inside
  if(!S.discovered||S.entered||!looping())return; const P=G.player, mp=mouthPos(); if(!P||!mp)return;
  if(Math.hypot(P.pos.x-mp.x,P.pos.z-mp.z)<150)later(2.5,()=>{ if(!S.entered)setQuest(); });
});
const HAL_LINE='You’ll have seen the arch at the foot of the cliff when the sea goes out. The keepers’ cave. Hesper went down there once and came back quieter than she went, and never said what she’d found. I never asked. I wish I had.';
let halInter=null;
function setupHalloran(){
  if(halInter)return; const C=G.creatures; if(!C)return;
  halInter=G.interact.add({pos:()=>{const h=C.halloran; return h&&h.pos?h.pos:null;},radius:2.8,priority:4,label:'Talk to Halloran',
    enabled:()=>{ const h=C.halloran; return looping()&&!S.hal&&!!h&&!h.afraid&&isPlay(); },
    use:()=>{ const h=C.halloran, P=G.player; S.hal=true;
      // his card, opening on the cave (creatures.js emits the 'talk' event {phase:'cave'} as the line shows); his usual replies follow
      if(!(C.talk&&C.talk([{text:HAL_LINE,phase:'cave',index:-1}]))){
        if(h&&P&&P.pos){ if(!(h.sit>.5))h.heading=Math.atan2(P.pos.x-h.pos.x,P.pos.z-h.pos.z); h.talkT=2.6; }
        G.ui.say(HAL_LINE,'Halloran'); G.emit('talk',{who:'Halloran',line:HAL_LINE,index:-1,phase:'cave'}); }
      if(!S.discovered)later(5,()=>discover('halloran')); }});
}

/* ---- the objective while underground: one line per room, the marker only ever points inside the cave ---- */
let objT=0, objKey='';
function caveGoal(room){
  const cp=G.cavePuzzles||{}, open=id=>!!(cp.open&&cp.open(id)), lit=id=>isLit(id), L=lantern();
  const sw=(G.moths&&G.moths.swarm)||0, baited=!!(G.moths&&G.moths.baited), a=(r,k)=>anchor(r,k,null);
  const T='The Drowned Keepers’ Cave';
  if(S.defeated){
    if(room==='arena'&&!(G.moths&&G.moths.jar&&G.moths.jar.owned))return [T,'The lens is free — something waits on the pedestal',null];
    return [T,'The way out: the shortcut tunnel from the Undertow, then the mouth',room==='arena'?a('arena','exit'):null,'Shortcut'];
  }
  switch(room){
    case 'mouth':
      if(!lit('mouth'))return [T,'Wake the ether vein in the wall — the old ether in it still answers a light',a('mouth','vein'),'Ether vein'];
      return [T,'Go deeper, into the Gallery of Keepers',roomCentre('gallery'),'Gallery'];
    case 'gallery':
      if(!open('gallery')){
        if(!baited&&sw<20)return ['The Gallery Seal','Bait the lantern — the cave moths on the roost will follow it',a('gallery','roost'),'Moth roost'];
        if(sw<20)return ['The Gallery Seal','Gather moths at the roost: '+sw+' of 20',a('gallery','roost'),'Moth roost'];
        return ['The Gallery Seal','Bring the swarm to the black plug — '+sw+' moths (20 needed)',a('gallery','seal'),'Seal'];
      }
      return [T,'Down the passage to the Flooding Stair',null];
    case 'stair':
      return ['The Flooding Stair',(G.cave&&G.cave.lowPassageOpen&&G.cave.lowPassageOpen())?'Low water — the passage under the left wall is open':
        (waterY()-origin().y>.9?'High water — the floating crates reach the ledge on the right':'The tide decides the way: low water opens the passage below, high water floats the crates'),null];
    case 'channel':{
      const r=cp.raft||{}, seal=cp.seals&&cp.seals.channel, need=(seal&&seal.needs)||20, pct=seal?Math.round(seal.progress*100):0;
      const left=seal?Math.max(1,Math.ceil((1-seal.progress)*need-1e-6)):need;
      if(!open('channel')){
        if(r.state==='arrived'){
          if(r.aboard)return ['The Sluice Seal','A crab is on the raft, snatching moths — knock it off',a('channel','seal'),'Sluice seal'];
          if(seal&&seal.sated&&!seal.feeding)return ['The Sluice Seal','The plug is '+pct+'% eaten — too few moths. Hook the lantern back and bring '+left+' more from the roost',a('channel','seal'),'Sluice seal'];
          return ['The Sluice Seal','The raft is at the gate — the swarm is eating the plug',a('channel','seal'),'Sluice seal'];
        }
        if(r.lantern){
          if(r.aboard)return ['The Channel','A crab is on the raft, snatching moths — knock it off',null];
          if(r.raiders)return ['The Channel','Claws on the raft’s edge — hit the crab before it climbs aboard',null];
          if(r.state==='loaded')return ['The Channel','Up onto the walkway — the raft is casting off',a('channel','walkway'),'Walkway'];
          return ['The Channel','Escort the raft from the walkway — knock off any crab that climbs aboard. A bolt to the raft hurries it',null];
        }
        if(!(L&&L.carried))return ['The Channel','Pick your lantern up again',null];
        const more=pct>0?' — the plug still needs '+left+' moths':'';
        if(!baited)return ['The Channel','Bait the lantern, then set it on the raft'+more,a('channel','jetty'),'Raft'];
        return ['The Channel','Set the baited lantern on the raft — the swarm will ride it to the sluice'+more,a('channel','jetty'),'Raft'];
      }
      if(r.lantern&&!(L&&L.carried))return ['The Channel','Hook the lantern back off the raft from the walkway',null];
      return [T,'The sluice is open — on, past the gate at the end of the walkway',a('channel','gate'),'Sluice gate'];
    }
    case 'drafts':
      if(!open('arena'))return ['The Hall of Drafts','Shut the lantern before each gust (the swarm clings tight), then feed the door seal — '+((cp.seals&&cp.seals.arena&&cp.seals.arena.needs)||20)+' moths',a('arena','door'),'Door seal'];
      return ['The Hall of Drafts','On through the door',null];
    case 'arena':
      if(B.state!=='sunk'&&B.state!=='dead')return ['The Undertow',wantDark()?'Strike where the moths settle · it overreaches — hit the lens':'Shut the lantern — let the moths show it to you',null];
      return ['The Undertow','Something waits in the pool',null];
  }
  return [T,'',null];
}
function updateObjective(dt){
  if(!inCave()||!G.quest){ objKey=''; return; }
  objT-=dt; if(objT>0)return; objT=.5;
  const room=roomOf(G.player.pos)||curRoom||'mouth'; let g;
  try{ g=caveGoal(room); }catch(e){ g=['The Drowned Keepers’ Cave','',null]; }
  const key=room+'|'+g[0]+'|'+g[1]+'|'+(g[2]?Math.round(g[2].x)+','+Math.round(g[2].z):'');
  if(key===objKey&&/^cave:/.test(G.quest.step||''))return; objKey=key;
  G.quest.set('cave:'+room,g[0],g[1],g[2]?g[2].clone().add(V(0,.5,0)):null,g[2]?(g[3]||''):'');
}

/* =====================================================================
   5. SAVE / LOAD, SYSTEM, API
   ===================================================================== */
function save(){ return {v:1,pages:Object.keys(S.pages).map(Number),defeated:S.defeated,discovered:S.discovered,hal:S.hal,entered:S.entered,bossSeen:S.bossSeen,said:Object.keys(S.said)}; }
function load(d){
  if(!d)return;
  S.pages={}; for(const n of d.pages||[])S.pages[n]=true;
  S.discovered=!!d.discovered; S.hal=!!d.hal; S.entered=!!d.entered; S.bossSeen=!!d.bossSeen;
  S.said={}; for(const k of d.said||[])S.said[k]=1;
  if(d.defeated&&!S.defeated){ try{ onDefeated(true); }catch(e){console.error(e);} }
}
if(G.persist&&G.persist.register)G.persist.register('caveBoss',{save,load});
else G.on('ready',()=>{ if(G.persist&&G.persist.register)G.persist.register('caveBoss',{save,load}); });

G.system('caveBoss',{order:42,modes:['play','dead'],
  init(){
    try{ const F=FX(); if(F&&F.ringMesh){ surgeMesh=F.ringMesh(); surgeMesh.userData.k=1.25; surgeMesh.scale.setScalar(1.25); surgeMesh.visible=false; G.scene.add(surgeMesh); } }catch(e){console.error(e);}
    setupHalloran();
  },
  update(dt){
    try{
      runBeats();
      updateDiscovery(dt);
      if(!G.monsters)return;
      updateRooms(dt);
      if(inCave()&&isPlay())updateRaftRaiders(dt);
      updatePages(dt);
      updateBoss(dt);
      updateObjective(dt);
    }catch(e){ if(!this._err){console.error('caveBoss',e);this._err=1;} }
  }
});

G.caveBoss={
  get state(){return B.state;}, get hp(){return B.hp;}, maxHp:UT.hp, get defeated(){return S.defeated;}, get discovered(){return S.discovered;},
  get pages(){return Object.keys(S.pages).map(Number);}, get entered(){return S.entered;}, get room(){return curRoom;}, get moths(){return utMoths.length;},
  undertow:B, params:UT, discover:src=>discover(src||'tide'), readPage, monsters:mine,
  debug:G.debug?{save,load,S,B,
    kill:()=>{ if(!B.built)buildUndertow(); if(B.state==='sunk')startFight(); B.rise=1; B.hp=0; startDying(); },
    expose:()=>{ B.slumpDir=Math.atan2(G.player.pos.z-A.z,G.player.pos.x-A.x); B.expose=UT.exposeT; setB('miss'); },
    attack:k=>{ if(k==='surge'){setB('surgeWind');telegraph('surge',A,UT.surgeWind);} else if(k==='drag'){B.dragCD=0;B.hp=Math.min(B.hp,UT.hp*.5);chooseAttack();} else { B.cool=0; chooseAttack('lash'); } },
    centre:()=>A.clone(), floorY:()=>floorY, samples, sampW, hbs, lensPos, spawnPack, clearMine}:null
};
})();
