/* =====================================================================
   BRAVE QUEST: LIGHTHOUSE — monsters.js  (Creatures agent)
   The fog's hunters: Hollows, Shade Hounds, and the Hollow Stag (boss). Brinelings (the sea cave) and the Nameless
   (the Hamlet Undercroft: placed by undercroft_boss.js; spawn('nameless',pos,{eatsMoths}) for the Wren defence).
   Act 1 (v12): the Stag guards Hesper's lantern at the Resisting Tree (G.monsters.startStag(), flow.js calls it on
   approach); it is no longer the finale (finale_boss.js answers 'finale:start'). Its death emits boss:dead {who:'stag'}.
   API: G.monsters = {list, spawn(kind,pos,opts), alive(), boss, startStag(), stagArena(), reset()}
   ===================================================================== */
(function(){
'use strict';
const G=window.G, THREE=G.THREE, U=G.U, PI=Math.PI, TAU=PI*2;
const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const rnd=U.rng(9137);
const H=(x,z)=>{try{const h=G.world.height(x,z);return isFinite(h)?h:0;}catch(e){return 0;}};
const LM=()=>(G.world&&G.world.landmarks)||{};
const BONE='#ddd3bf';

/* ---------------------------------------------------------------- params */
const P={
  hollow:{hp:6,radius:.5,height:2.5,aggro:16,speed:3.1,wander:1.1,clawRange:2.3,clawWind:.65,lungeWind:.8,lungeMin:3.2,lungeMax:6.5,lungeDist:3.2,
    clawDmg:2,lungeDmg:2,recover:.75,hurt:.4,lightSlow:.6,lightR:5},
  hound:{hp:4,radius:.42,height:1.1,aggro:18,speed:6.5,wander:1.6,circleR:5.5,dashWind:.5,dashSpeed:13,dashMax:.55,biteDmg:1,recover:.6,hurt:.35},
  brineling:{hp:3,radius:.42,height:.7,speed:2.6,scuttle:4.4,wander:1.3,mothR:12,eatR:2,eatRate:2,shyR:3.2,angryT:7,
    pinchRange:1.35,pinchWind:.45,pinchDmg:1,recover:.6,hurt:.3,
    // raft raiders (cave_puzzles.js runs the waves): claws on the edge for `grip` s (the telegraph), a `climb`, then aboard it
    // snatches a moth every `snatch` s (the first after `snatch0`) within `reach` m. Any hit knocks a raider off the raft.
    grip:1.5,climb:.5,snatch0:.8,snatch:1.05,reach:3.4},
  // the Nameless (the Hamlet Undercroft): villagers too far gone to talk. Slow, faceless; one two-handed grab with a long,
  // readable wind-up (arms rise, body rears back) and a short lunge. HP 4, the grab costs a heart. `mothR`/`eatRate` only for
  // spawns with opts.eatsMoths (the Wren defence: they crawl up to eat the feeding swarm).
  nameless:{hp:4,radius:.45,height:2.0,aggro:12,speed:1.75,wander:.7,grabRange:2.4,grabWind:1.15,grabDist:2.1,grabDmg:2,recover:1.1,hurt:.45,
    lightSlow:.75,lightR:5,mothR:16,eatR:1.6,eatRate:1.5},
  stag:{hp:48,radius:2.0,height:4.8,speed:3.2,chargeWind:1.0,chargeSpeed:17,chargeLen:30,stagger:2.0,sweepWind:.75,stompWind:.95,
    // chargeDmg was 3: with the 2-heart start (progression.js BASE_HP) a charge took a fresh player to half a heart. Every Stag blow
    // now costs exactly one heart.
    chargeDmg:2,sweepDmg:2,stompDmg:2,ringSpeed:11,ringMax:14}
};
const MAX_TOKENS=2, LEASH=30;

/* ---------------------------------------------------------------- ink fx helpers
   Everything visual about the shadows is built on ink.js (G.ink, G.SNOISE).
   puff()/ember() write straight into the shared ink particle pools so we can
   make directional streams (backward-streaming smoke, inward pulls, shockwave fronts). */
const INK=()=>G.ink||null;
const cInk=U.col('#06040a'), cSmoke=U.col('#0e0a15'), cMist=U.col('#2b2438'), cVio=U.col('#a67dff');
function puff(x,y,z,vx,vy,vz,life,s0,s1,a0,col,grav,drag){
  const I=INK(); if(!I||!I.smoke||!I.smoke.vel)return; const Q=I.smoke, i=Q.next; Q.next=(Q.next+1)%Q.N;
  Q.pos[i*3]=x;Q.pos[i*3+1]=y;Q.pos[i*3+2]=z;Q.vel[i*3]=vx;Q.vel[i*3+1]=vy;Q.vel[i*3+2]=vz;
  Q.life[i]=life;Q.max[i]=life;Q.s0[i]=s0;Q.s1[i]=s1;Q.a0[i]=a0;Q.grav[i]=grav||0;Q.drag[i]=drag==null?1.2:drag;
  Q.rot[i]=rnd()*TAU;Q.spin[i]=(rnd()-.5)*1.4;const c=col||cInk;Q.color[i*3]=c.r;Q.color[i*3+1]=c.g;Q.color[i*3+2]=c.b;
}
function ember(x,y,z,vx,vy,vz,life,s){
  const I=INK(); if(!I||!I.embers||!I.embers.vel)return; const Q=I.embers, i=Q.next; Q.next=(Q.next+1)%Q.N;
  Q.pos[i*3]=x;Q.pos[i*3+1]=y;Q.pos[i*3+2]=z;Q.vel[i*3]=vx;Q.vel[i*3+1]=vy;Q.vel[i*3+2]=vz;
  Q.life[i]=life;Q.max[i]=life;Q.s0[i]=s;Q.s1[i]=s*.3;Q.a0[i]=.95;Q.grav[i]=0;Q.drag[i]=.6;Q.rot[i]=0;Q.spin[i]=0;
  Q.color[i*3]=cVio.r;Q.color[i*3+1]=cVio.g;Q.color[i*3+2]=cVio.b;
}
/* legacy name kept: a splash of ink, drops and violet motes */
function sparks(pos,n=14,power=1){
  const I=INK(); if(!I)return;
  I.burst(pos,{n:Math.round(n*1.2),speed:2.4*power,size:[.25*power,.9*power],life:[.4,1.1],up:.6,embers:Math.round(n*.5),drops:Math.round(n*.35)});
}
/* directional ink splash for hits: spray + falling drops (they splat on the ground) + motes */
function splash(pos,dir,power){
  const n=Math.round(12*power);
  for(let k=0;k<n;k++){ const s=(1.5+rnd()*3.5)*power;
    puff(pos.x+(rnd()-.5)*.2,pos.y+(rnd()-.5)*.3,pos.z+(rnd()-.5)*.2, dir.x*s+(rnd()-.5)*2.2,(rnd()*.9+.1)*s*.5,dir.z*s+(rnd()-.5)*2.2, .45+rnd()*.6,.35*power,1.2*power,.95,cInk,0,3.4); }
  for(let k=0;k<Math.round(7*power);k++){ const s=(1.5+rnd()*3)*power;
    puff(pos.x,pos.y,pos.z, dir.x*s+(rnd()-.5)*1.6,1.2+rnd()*2.6,dir.z*s+(rnd()-.5)*1.6, 2,.16,.11,1,cInk,12,.3); }
  for(let k=0;k<Math.round(6*power);k++){ const s=(1+rnd()*3)*power; ember(pos.x,pos.y,pos.z,dir.x*s+(rnd()-.5)*2,rnd()*2.5+.5,dir.z*s+(rnd()-.5)*2,.4+rnd()*.6,.16); }
}
/* temporary ink puddles (stag hoof prints, summon wells) */
const puddles=[];
function puddle(x,y,z,r,life,alpha){
  const I=INK(); if(!I||!I.pool)return null;
  if(puddles.length>=14){const o=puddles.shift(); I.remove(o.h);}
  const h=I.pool({pos:V(x,y,z)},{radius:r,alpha:alpha||.8,rim:'#5b35ad'}); const p={h,t:0,life,grow:.25}; h.intensity=0; puddles.push(p); return p;
}
function updatePuddles(dt){
  const I=INK(); if(!I)return;
  for(let i=puddles.length-1;i>=0;i--){const p=puddles[i]; p.t+=dt;
    p.h.intensity=Math.min(1,p.t/p.grow)*(1-U.smooth(p.life*.45,p.life,p.t));
    if(p.t>p.life){I.remove(p.h);puddles.splice(i,1);} }
}
function clearPuddles(){const I=INK(); for(const p of puddles)I&&I.remove(p.h); puddles.length=0;}

const ash=(pos,n,spread)=>{ if(G.creatures&&G.creatures.ash)G.creatures.ash(pos,n,spread); };
let glowTex=null;
/* eye glint: a small hot core sprite with a faint wide bloom halo as its child */
function eyeSprite(color='#e2d0ff',size=.12,halo=3.2,haloO=.3){
  const s=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex||G.tex.flame,color:U.col(color).multiplyScalar(3),blending:THREE.AdditiveBlending,transparent:true,depthWrite:false}));
  s.scale.setScalar(size); s.renderOrder=4;
  const h=new THREE.Sprite(new THREE.SpriteMaterial({map:G.tex.soft,color:U.col('#8a5cff'),blending:THREE.AdditiveBlending,transparent:true,depthWrite:false,opacity:haloO}));
  h.scale.setScalar(halo); h.userData.o=haloO; h.renderOrder=4; s.add(h);
  return s;
}

/* ---------------------------------------------------------------- ink materials
   Like ink.js's living surface, plus: per-monster shared uniforms (uFade/uFlash/uRim/uGround,
   so one dissolve/flash/rim drives every part), legs that dissolve into mist toward the
   ground (uMist), and a torn hem that frays into nothing along the sheet's uv.y (uFray). */
const SN=G.SNOISE||'';
const MON_VS=`uniform float uTime;uniform float uAmp;uniform float uFlow;uniform float uScale;uniform float uGround;uniform float uMist;
varying vec3 vN;varying vec3 vV;varying vec3 vW;varying vec2 vUv;varying float vLow;
#include <fog_pars_vertex>
${SN}
void main(){
  vUv=uv;
  vec4 wp=modelMatrix*vec4(position,1.);
  vec3 wn=normalize(mat3(modelMatrix)*normal);
  vec3 q=wp.xyz*uScale+vec3(0.,-uTime*uFlow,0.);
  float n=snoise(q)*.65+snoise(q*2.3+7.1)*.35;
  float low=uMist>0.?1.-clamp((wp.y-uGround)/uMist,0.,1.):0.;
  wp.xyz+=wn*uAmp*n*(1.+low*2.5);
  wp.xz+=vec2(snoise(q*.8+3.3),snoise(q*.8-5.1))*low*low*uAmp*4.;
  vLow=low;
  vec4 mvPosition=viewMatrix*wp;
  vN=normalize(mat3(viewMatrix)*wn); vV=normalize(-mvPosition.xyz); vW=wp.xyz;
  gl_Position=projectionMatrix*mvPosition;
  #include <fog_vertex>
}`;
const MON_FS=`uniform float uTime;uniform float uFade;uniform float uFlash;uniform float uWisp;uniform float uFlow;uniform float uScale;
uniform float uFray;uniform float uMist;uniform float uRimK;uniform vec3 uRim;uniform vec3 uInk;
varying vec3 vN;varying vec3 vV;varying vec3 vW;varying vec2 vUv;varying float vLow;
#include <fog_pars_fragment>
${SN}
void main(){
  vec3 q=vW*uScale*1.4+vec3(0.,-uTime*uFlow*1.3,0.);
  float n=snoise(q)*.5+.5;
  float n2=snoise(q*2.7+vec3(3.1,0.,1.7)+vec3(0.,uTime*.2,0.))*.5+.5;
  float dn=n*.6+n2*.4;
  if(dn>uFade*1.08+.02)discard;
  float f=1.-abs(dot(normalize(vN),normalize(vV)));
  vec3 col=uInk*(.04+.96*pow(smoothstep(.35,1.,n2),2.5));
  col+=uRim*uRimK*pow(f,5.)*(.2+1.1*n)*.8;
  col+=uRim*(uFade<.98?smoothstep(uFade-.06,uFade,dn)*.6:0.);
  col+=mix(vec3(.55,.4,1.),vec3(1.),f)*uFlash*(.2+.9*f*f)+uRim*uFlash*.25;
  float a=1.-smoothstep(.35,1.0,f+(n-.5)*.8)*uWisp;
  if(uMist>0.){ a*=1.-smoothstep(.2,1.,vLow+(n-.5)*.6); col*=1.-.6*vLow; }
  if(uFray>0.){ float tat=snoise(vec3(vUv.x*18.,vUv.y*1.5,uTime*.35))*.5+.5; // torn vertical tatters
    a*=smoothstep(0.,uFray*.6,vUv.y-uFray*.25+(n2-.5)*uFray*.6-tat*uFray*.5); }
  if(a<.03)discard;
  gl_FragColor=vec4(col,clamp(a,0.,1.));
  #include <fog_fragment>
}`;
function sharedUniforms(rim,strength,ink,inkS){
  return {uFade:{value:1},uFlash:{value:0},uRim:{value:U.col(rim).multiplyScalar(strength)},uInk:{value:U.col(ink).multiplyScalar(inkS)},uGround:{value:0}};
}
function inkMat(S,o={}){
  if(!SN){ const m=G.negMaterial({rim:'#a37cff',strength:1.7}); if(o.side)m.side=o.side; return m; }
  const u=THREE.UniformsUtils.merge([THREE.UniformsLib.fog,{
    uAmp:{value:o.amp==null?.05:o.amp},uWisp:{value:o.wisp==null?.85:o.wisp},uFlow:{value:o.flow==null?.35:o.flow},uScale:{value:o.scale==null?1.6:o.scale},
    uMist:{value:o.mist||0},uFray:{value:o.fray||0},uRimK:{value:o.rimK==null?1:o.rimK}}]);
  for(const k in S)u[k]=S[k];
  u.uTime=G.negTime;
  return new THREE.ShaderMaterial({uniforms:u,fog:true,vertexShader:MON_VS,fragmentShader:MON_FS,transparent:true,depthWrite:true,side:o.side||THREE.FrontSide});
}

/* ---------------------------------------------------------------- smooth geometry
   sweep(): a smooth tube along a Catmull-Rom spine with elliptical cross-sections and
   rounded caps — one continuous mesh, no split normals, so the ink displacement never cracks. */
function sweep(pts,radial=12,sub=4){
  const n=pts.length, curve=new THREE.CatmullRomCurve3(pts.map(p=>V(p[0],p[1],p[2])),false,'centripetal');
  const N=(n-1)*sub+1, R=radial, pos=[], uv=[], idx=[];
  const T=V(), side=V(), up=V(), c=V(); let upPrev=null; const rings=[];
  for(let j=0;j<N;j++){
    const u=j/(N-1); curve.getPoint(u,c); curve.getTangent(u,T); T.normalize();
    const sf=u*(n-1), si=Math.min(n-2,Math.floor(sf)), f=sf-si, fs=f*f*(3-2*f);
    const rx=U.lerp(pts[si][3],pts[si+1][3],fs), ry=U.lerp(pts[si][4]==null?pts[si][3]:pts[si][4],pts[si+1][4]==null?pts[si+1][3]:pts[si+1][4],fs);
    if(!upPrev)upPrev=Math.abs(T.y)>.85?V(0,0,1):V(0,1,0);
    side.crossVectors(T,upPrev).normalize(); up.crossVectors(side,T).normalize(); upPrev=up.clone();
    for(let k=0;k<R;k++){const a=k/R*TAU, ca=Math.cos(a), sa=Math.sin(a);
      pos.push(c.x+side.x*ca*rx+up.x*sa*ry, c.y+side.y*ca*rx+up.y*sa*ry, c.z+side.z*ca*rx+up.z*sa*ry); uv.push(k/R,1-u);}
    rings.push({c:c.clone(),T:T.clone(),r:Math.min(rx,ry)});
  }
  for(let j=0;j<N-1;j++)for(let k=0;k<R;k++){const a=j*R+k,b=(j+1)*R+k,cc=j*R+(k+1)%R,d=(j+1)*R+(k+1)%R; idx.push(a,b,cc,b,d,cc);}
  const s0=rings[0], s1=rings[N-1], si=pos.length/3;
  pos.push(s0.c.x-s0.T.x*s0.r*.6,s0.c.y-s0.T.y*s0.r*.6,s0.c.z-s0.T.z*s0.r*.6); uv.push(.5,1);
  pos.push(s1.c.x+s1.T.x*s1.r*.6,s1.c.y+s1.T.y*s1.r*.6,s1.c.z+s1.T.z*s1.r*.6); uv.push(.5,0);
  for(let k=0;k<R;k++){idx.push(si,k,(k+1)%R); idx.push(si+1,(N-1)*R+(k+1)%R,(N-1)*R+k);}
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3)); g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  g.setIndex(idx); g.computeVertexNormals(); return g;
}
function mergeGeos(list){
  let nv=0; const P=[],UV=[],I=[],NM=[];
  for(const g of list){ const p=g.attributes.position, u=g.attributes.uv, nm=g.attributes.normal;
    for(let i=0;i<p.count;i++){P.push(p.getX(i),p.getY(i),p.getZ(i)); NM.push(nm.getX(i),nm.getY(i),nm.getZ(i)); UV.push(u?u.getX(i):0,u?u.getY(i):0);}
    const ix=g.index; for(let i=0;i<ix.count;i++)I.push(ix.getX(i)+nv); nv+=p.count; g.dispose(); }
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(P,3)); g.setAttribute('normal',new THREE.Float32BufferAttribute(NM,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(UV,2)); g.setIndex(I); return g;
}

/* ---------------------------------------------------------------- tendrils
   Follow-the-leader chains rebuilt as tubes every frame: manes, tails, sleeves, shroud ribbons.
   They lag behind motion, so a running hound streams smoke-tendrils and a lunge leaves ribbons trailing. */
const _ta=V(),_tb=V(),_tt=V(),_ts=V(),_tu=V(),_tq=new THREE.Quaternion(),_tinv=new THREE.Matrix4(),_tup=V(),_tsd=V(),_tT=V();
function tendril(root,anchor,o,mat){
  const n=o.n||8, R=o.radial||6, nv=n*R;
  const pos=new Float32Array(nv*3), nor=new Float32Array(nv*3), uv=new Float32Array(nv*2), idx=[];
  for(let j=0;j<n;j++)for(let k=0;k<R;k++){uv[(j*R+k)*2]=k/R;uv[(j*R+k)*2+1]=1-j/(n-1);}
  for(let j=0;j<n-1;j++)for(let k=0;k<R;k++){const a=j*R+k,b=(j+1)*R+k,c=j*R+(k+1)%R,d=(j+1)*R+(k+1)%R; idx.push(a,b,c,b,d,c);}
  const geo=new THREE.BufferGeometry(); geo.setAttribute('position',new THREE.BufferAttribute(pos,3)); geo.setAttribute('normal',new THREE.BufferAttribute(nor,3));
  geo.setAttribute('uv',new THREE.BufferAttribute(uv,2)); geo.setIndex(idx);
  const mesh=new THREE.Mesh(geo,mat); mesh.frustumCulled=false; mesh.userData.noShadow=true; root.add(mesh);
  const loc=[]; for(let j=0;j<n;j++)loc.push(V());
  return {anchor,mesh,geo,pos,nor,n,R,loc,root,len:o.len||1,r0:o.r0||.06,r1:o.r1||0,dir:(o.dir||V(0,0,-1)).clone().normalize(),
    stiff:o.stiff||10,wave:o.wave==null?.12:o.wave,freq:o.freq||3,ph:rnd()*TAU,lift:o.lift||0,pts:null};
}
function stepTendril(T,dt,t,agit=1,lift=0){
  const seg=T.len/(T.n-1);
  T.anchor.getWorldPosition(_ta); T.anchor.getWorldQuaternion(_tq);
  const dw=_tt.copy(T.dir).applyQuaternion(_tq);
  if(!T.pts){T.pts=[];for(let j=0;j<T.n;j++)T.pts.push(_ta.clone().addScaledVector(dw,seg*j));}
  const P=T.pts; P[0].copy(_ta);
  _ts.set(-dw.z,0,dw.x); if(_ts.lengthSq()<1e-4)_ts.set(1,0,0); _ts.normalize();
  const k=1-Math.exp(-Math.max(dt,1e-3)*T.stiff), L_=T.lift+lift;
  for(let j=1;j<T.n;j++){
    const f=j/(T.n-1);
    _tb.copy(P[j-1]).addScaledVector(dw,seg);
    _tb.addScaledVector(_ts,Math.sin(t*T.freq*agit+T.ph-j*.9)*T.wave*f*agit);
    _tb.y+=Math.sin(t*T.freq*.7*agit+T.ph*1.3-j*.7)*T.wave*.6*f*agit+L_*f*seg;
    P[j].lerp(_tb,k);
    _tu.subVectors(P[j],P[j-1]); const l=_tu.length(); if(l>1e-5)P[j].copy(P[j-1]).addScaledVector(_tu,seg/l);
  }
  _tinv.copy(T.root.matrixWorld).invert();
  for(let j=0;j<T.n;j++)T.loc[j].copy(P[j]).applyMatrix4(_tinv);
  const R=T.R, pos=T.pos, nor=T.nor;
  _tup.set(0,1,0);
  for(let j=0;j<T.n;j++){
    const a=T.loc[Math.max(0,j-1)], b=T.loc[Math.min(T.n-1,j+1)];
    _tT.subVectors(b,a); if(_tT.lengthSq()<1e-8)_tT.set(0,0,1); _tT.normalize();
    if(j===0&&Math.abs(_tT.y)>.9)_tup.set(1,0,0);
    _tsd.crossVectors(_tT,_tup).normalize(); _tup.crossVectors(_tsd,_tT).normalize();
    const f=j/(T.n-1), r=U.lerp(T.r0,T.r1,Math.pow(f,.8))*(j===T.n-1?.25:1);
    const c=T.loc[j];
    for(let q=0;q<R;q++){const an=q/R*TAU, ca=Math.cos(an), sa=Math.sin(an), i=(j*R+q)*3;
      const nx=_tsd.x*ca+_tup.x*sa, ny=_tsd.y*ca+_tup.y*sa, nz=_tsd.z*ca+_tup.z*sa;
      nor[i]=nx;nor[i+1]=ny;nor[i+2]=nz; pos[i]=c.x+nx*r;pos[i+1]=c.y+ny*r;pos[i+2]=c.z+nz*r;}
  }
  T.geo.attributes.position.needsUpdate=true; T.geo.attributes.normal.needsUpdate=true;
}
function anchor(parent,x,y,z){const o=new THREE.Object3D();o.position.set(x,y,z);parent.add(o);return o;}

/* ---------------------------------------------------------------- lighthouse avoidance */
function lh(){return G.world.lighthouse;}
function outsideTower(x,z,y,r){
  const L=lh(); if(!L)return true;
  const cx=L.x!=null?L.x:180, cz=L.z!=null?L.z:0, R=(L.outerR||4.4)+r+.3;
  if(Math.hypot(x-cx,z-cz)<R&&y<(L.topY||1e9))return false;
  if(L.inBody){try{if(L.inBody(V(x,y+.5,z)))return false;}catch(e){}}
  return true;
}
function okGround(x,z,y){
  if(G.world.walkable&&!G.world.walkable(x,z))return false;
  return outsideTower(x,z,y==null?H(x,z):y,1);
}

/* ---------------------------------------------------------------- models
   Every monster is mostly ink: smooth swept forms with the living-ink shader, CPU-deformed
   cloth and smoke tendrils, a void face with two cold glints, and smoke/drips/pools from G.ink. */
function addMesh(parent,geo,mat,x=0,y=0,z=0){const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);parent.add(m);return m;}
const voidMat=()=>new THREE.MeshBasicMaterial({color:0x000000,transparent:true});

/* ---- Hollow: a gaunt hooded void in a streaming shroud ---- */
const SH_C=26, SH_R=13;
function buildHollow(S){
  const mat=inkMat(S,{amp:.035,wisp:.8,flow:.45,scale:2.2,rimK:.6});
  const shroudMat=inkMat(S,{amp:.05,wisp:.4,flow:.5,scale:2.0,fray:.45,rimK:.7,side:THREE.DoubleSide});
  const clawMat=inkMat(S,{amp:.006,wisp:.25,flow:.3,scale:3,rimK:1.6});
  const shroudMat2=inkMat(S,{amp:.04,wisp:.85,flow:.5,scale:2.0,rimK:.6});
  const ribbonMat=inkMat(S,{amp:.02,wisp:.8,flow:.6,scale:2.5,fray:.6,rimK:.5,side:THREE.DoubleSide});
  const root=new THREE.Group(), body=new THREE.Group(); root.add(body);
  // the shroud: a CPU-deformed open sheet from the shoulders that frays into smoke at the bottom
  const nC=SH_C+1, nV=nC*SH_R, pos=new Float32Array(nV*3), uv=new Float32Array(nV*2), base=new Float32Array(nV*4), idx=[];
  for(let r=0;r<SH_R;r++)for(let c=0;c<nC;c++){
    const t=r/(SH_R-1), s=c/SH_C, i=r*nC+c, a=s*TAU;
    const rr=U.lerp(.13,.62,Math.pow(t,.7))+.08*Math.exp(-((t-.14)**2)*60);
    base[i*4]=a; base[i*4+1]=rr; base[i*4+2]=2.3-t*2.5; base[i*4+3]=t;
    uv[i*2]=s; uv[i*2+1]=1-t;
  }
  for(let r=0;r<SH_R-1;r++)for(let c=0;c<SH_C;c++){const a=r*nC+c,b=(r+1)*nC+c,cc=r*nC+c+1,d=(r+1)*nC+c+1; idx.push(a,b,cc,b,d,cc);}
  const sg=new THREE.BufferGeometry(); sg.setAttribute('position',new THREE.BufferAttribute(pos,3)); sg.setAttribute('uv',new THREE.BufferAttribute(uv,2)); sg.setIndex(idx);
  const shroud=addMesh(body,sg,shroudMat); shroud.frustumCulled=false;
  const upper=new THREE.Group(); upper.position.y=1.9; body.add(upper);
  // gaunt torso + shoulders (inside the shroud)
  addMesh(upper,sweep([[0,-1.0,0,.13,.1],[0,-.45,0,.17,.13],[0,0,.0,.24,.16],[0,.22,.03,.28,.15],[0,.36,.06,.12,.11]],10,3),mat);
  // hood + void face + cold glints
  const head=new THREE.Group(); head.position.set(0,.5,.08); upper.add(head);
  const hood=addMesh(head,new THREE.SphereGeometry(.3,24,16,PI/2+.85,TAU-1.7,0,PI*.8),inkMat(S,{amp:.025,wisp:.55,flow:.4,scale:2.4,rimK:.8,side:THREE.DoubleSide}),0,0,-.03); hood.scale.set(1.0,1.25,1.25);
  const face=addMesh(head,new THREE.SphereGeometry(.2,16,12),voidMat(),0,-.04,-.02); face.scale.set(.85,1.1,.9);
  const eyes=[]; for(const s of [-1,1]){const e=eyeSprite('#e6dcff',.11,2.4,.22);e.position.set(s*.065,-.02,.24);head.add(e);eyes.push(e);}
  const hoodTip=anchor(head,0,.2,-.3);
  // long arms: smooth ink, sleeves that hang as tendrils, long dripping claws
  const arms=[], clawTips=[], ribbons=[];
  for(const s of [-1,1]){
    const sh=new THREE.Group(); sh.position.set(s*.27,.14,.02); upper.add(sh);
    addMesh(sh,sweep([[0,.04,0,.08],[0,-.35,-.01,.1,.09],[0,-.7,0,.13,.11],[0,-.86,.02,.16,.13]],10,3),shroudMat2);
    const el=new THREE.Group(); el.position.y=-.76; sh.add(el);
    addMesh(el,sweep([[0,-.05,0,.05],[0,-.35,.01,.038],[0,-.68,0,.03]],8,3),mat);
    const hand=new THREE.Group(); hand.position.y=-.68; el.add(hand);
    const cl=[sweep([[0,.03,0,.045,.03],[0,-.06,.01,.05,.03],[0,-.1,.02,.03,.02]],8,2)];
    for(let k=0;k<4;k++){const x=(k-1.5)*.03, sp=(k-1.5)*.07;
      cl.push(sweep([[x,-.06,.02,.016],[x+sp*.8,-.25,.06,.012],[x+sp*1.3,-.44,.14,.007],[x+sp*1.4,-.56,.25,.002]],5,3));
      clawTips.push(anchor(hand,x+sp*1.4,-.55,.24));}
    addMesh(hand,mergeGeos(cl),clawMat);
    ribbons.push({a:anchor(el,0,-.08,-.04),o:{n:7,len:.8,r0:.1,r1:.0,dir:V(0,-1,-.4),stiff:6,wave:.12,freq:2.4,lift:-.2}});
    arms.push({sh,el,hand,s});
  }
  // trailing shroud ribbons from the shoulders and the hood tip
  for(let k=0;k<4;k++){const x=(k-1.5)*.16; ribbons.push({a:anchor(upper,x,.18-(k%2)*.12,-.12),o:{n:9,len:1.3+(k%2)*.4,r0:.08,r1:.01,dir:V(x*.6,-1,-.5),stiff:5,wave:.16,freq:2,lift:.15}});}
  ribbons.push({a:hoodTip,o:{n:8,len:.85,r0:.09,r1:.0,dir:V(0,.3,-1),stiff:6,wave:.1,freq:2.6,lift:.5}});
  // hem anchors for the smoke the hollow sheds
  const hem=[]; for(let k=0;k<7;k++){const a=k/7*TAU; hem.push(anchor(body,Math.sin(a)*.42,.15,Math.cos(a)*.38));}
  hem.push(anchor(upper,.25,.2,0),anchor(upper,-.25,.2,0),anchor(head,0,.15,-.1));
  return {root,body,upper,head,arms,eyes,shroud:{geo:sg,pos,base,nC,lag:V(),lagV:V()},ribbonsDef:ribbons,ribbonMat,hem,clawTips,mats:[mat,shroudMat,shroudMat2,clawMat,ribbonMat],extra:[face.material],tendrils:[]};
}
function finishTendrils(c){
  if(c.ribbonsDef)for(const r of c.ribbonsDef)c.tendrils.push(tendril(c.root,r.a,r.o,r.mat||c.ribbonMat));
}

/* ---- Shade hound: a smooth inky wolf-blur, smoke mane & tail, legs dissolving into mist ---- */
function buildHound(S){
  const mat=inkMat(S,{amp:.035,wisp:.9,flow:.5,scale:2.6,mist:.55,rimK:.8});
  const tMat=inkMat(S,{amp:.02,wisp:.95,flow:.7,scale:3,fray:.7,rimK:.5});
  const root=new THREE.Group(), body=new THREE.Group(); root.add(body); body.position.y=.78;
  addMesh(body,sweep([[0,.1,-.66,.07],[0,.06,-.5,.17,.19],[0,.04,-.3,.2,.22],[0,-.01,-.05,.16,.19],[0,0,.2,.23,.28],[0,.07,.4,.2,.25],[0,.2,.56,.14,.16],[0,.3,.66,.11,.12]],12,4),mat);
  const neck=new THREE.Group(); body.add(neck);
  const head=new THREE.Group(); head.position.set(0,.3,.68); body.add(head);
  addMesh(head,sweep([[0,.04,-.1,.1],[0,.03,.04,.135,.12],[0,0,.16,.1,.09],[0,-.03,.3,.06,.055],[0,-.04,.4,.035,.03]],10,3),mat);
  for(const s of [-1,1])addMesh(head,sweep([[s*.07,.07,-.02,.045,.03],[s*.1,.17,-.05,.025,.018],[s*.11,.25,-.08,.004]],6,2),mat);
  const jaw=new THREE.Group(); jaw.position.set(0,-.07,.06); head.add(jaw);
  addMesh(jaw,sweep([[0,0,-.02,.07,.035],[0,-.015,.15,.05,.025],[0,-.02,.3,.025,.015]],8,2),mat);
  const eyes=[]; for(const s of [-1,1]){const e=eyeSprite('#d9c6ff',.1,1.2,.18);e.position.set(s*.072,.055,.135);e.userData.slit=1;head.add(e);eyes.push(e);}
  const tail=new THREE.Group(); tail.position.set(0,.1,-.62); body.add(tail);
  const legs=[], paws=[];
  for(const [sx,sz] of [[-1,1],[1,1],[-1,-1],[1,-1]]){
    const hip=new THREE.Group(); hip.position.set(sx*.14,-.04,sz*.36); body.add(hip);
    addMesh(hip,sweep([[0,.06,0,sz>0?.09:.11,.11],[0,-.18,sz>0?.02:-.03,.07],[0,-.4,0,.05]],8,3),mat);
    const knee=new THREE.Group(); knee.position.y=-.4; hip.add(knee);
    addMesh(knee,sweep([[0,.02,0,.048],[0,-.2,.01,.036],[0,-.37,.04,.035,.025],[0,-.39,.1,.02]],7,3),mat);
    knee.rotation.x=sz>0?.12:-.35; hip.rotation.x=sz>0?0:.25;
    paws.push(anchor(knee,0,-.33,.04));
    legs.push({hip,knee,front:sz>0,side:sx});
  }
  const ribbons=[];
  for(let k=0;k<6;k++)ribbons.push({a:anchor(body,(k%2?.05:-.05),.24-k*.02,.6-k*.16),o:{n:8,len:.6-k*.05,r0:.06,r1:.0,dir:V(k%2?.3:-.3,.25,-1),stiff:6,wave:.1,freq:3.2,lift:.15},mat:tMat});
  for(const s of [-1,1])ribbons.push({a:anchor(head,s*.1,.02,-.08),o:{n:6,len:.4,r0:.05,r1:0,dir:V(s*.6,.1,-1),stiff:7,wave:.08,freq:4,lift:.1},mat:tMat});
  ribbons.push({a:tail,o:{n:9,len:1.0,r0:.09,r1:.0,dir:V(0,.25,-1),stiff:6,wave:.14,freq:3,lift:.3},mat:tMat});
  ribbons.push({a:anchor(tail,.03,-.02,0),o:{n:7,len:.7,r0:.05,r1:0,dir:V(.2,.4,-1),stiff:5,wave:.16,freq:3.6,lift:.5},mat:tMat});
  const back=[anchor(body,0,.2,.35),anchor(body,0,.15,0),anchor(body,0,.15,-.35),anchor(head,0,.08,0)];
  return {root,body,head,jaw,neck,tail,legs,eyes,ribbonsDef:ribbons,ribbonMat:tMat,back,paws,mats:[mat,tMat],extra:[],tendrils:[]};
}

/* ---- The Hollow Stag: a huge stag of absence under a crown of burning ink ---- */
function antlerGeo(s,tips){
  const g=[]; const tip=(p)=>tips.push(V(p[0],p[1],p[2]));
  const beam=[[s*.22,0,0,.15],[s*.75,.6,-.3,.13],[s*1.3,1.25,-.35,.1],[s*1.6,2.0,-.1,.075],[s*1.55,2.7,.3,.05],[s*1.35,3.15,.55,.008]];
  g.push(sweep(beam,8,4)); tip(beam[5]);
  const tines=[ // [beam idx, frac, dir x, dir y, dir z, len]
    [0,.6, .1,.5,1,.75],[1,.5, .4,.9,.8,.95],[2,.2,-.15,1,.55,1.0],[2,.8,.8,.8,-.3,.8],[3,.5,-.3,1,.6,.8],[4,.1,.5,.9,-.4,.6]];
  for(const [bi,f,dx,dy,dz,L] of tines){
    const a=beam[bi], b=beam[bi+1], p=[U.lerp(a[0],b[0],f),U.lerp(a[1],b[1],f),U.lerp(a[2],b[2],f)], r=U.lerp(a[3],b[3],f)*.75;
    const d=V(dx*s,dy,dz).normalize();
    const m1=[p[0]+d.x*L*.5+s*.05,p[1]+d.y*L*.5,p[2]+d.z*L*.5], e=[p[0]+d.x*L+s*.04,p[1]+d.y*L+.12,p[2]+d.z*L];
    g.push(sweep([[p[0],p[1],p[2],r],[...m1,r*.6],[...e,.005]],6,3)); tip(e);
  }
  return mergeGeos(g);
}
function buildStag(S){
  const mat=inkMat(S,{amp:.1,wisp:.9,flow:.35,scale:.9,mist:1.3,rimK:.55});
  const tMat=inkMat(S,{amp:.04,wisp:.95,flow:.6,scale:1.6,fray:.7,rimK:.5});
  const crownMat=inkMat(S,{amp:.012,wisp:.35,flow:.6,scale:3,rimK:2.2});
  if(crownMat.uniforms.uInk)crownMat.uniforms.uInk={value:U.col('#3a2070')}; // violet-veined antlers
  const root=new THREE.Group(), body=new THREE.Group(); root.add(body); body.position.y=3.15;
  addMesh(body,sweep([[0,.55,-2.3,.2],[0,.3,-1.9,.86,.92],[0,.05,-1.0,1.0,1.08],[0,-.05,.1,1.0,1.15],[0,.1,.95,1.14,1.32],[0,.45,1.5,.92,1.08],[0,.9,1.8,.7,.78]],16,4),mat);
  const neck=new THREE.Group(); neck.position.set(0,.6,1.55); neck.rotation.x=.6; body.add(neck);
  addMesh(neck,sweep([[0,-.2,-.05,.8,.86],[0,.75,.05,.62,.66],[0,1.5,.12,.48,.5],[0,1.75,.12,.38]],14,4),mat);
  const head=new THREE.Group(); head.position.set(0,1.55,.15); head.rotation.x=-.42; head.scale.setScalar(1.3); neck.add(head);
  addMesh(head,sweep([[0,.08,-.42,.3],[0,.06,-.15,.42,.45],[0,0,.3,.38,.4],[0,-.12,.8,.25,.25],[0,-.2,1.2,.17,.15],[0,-.22,1.32,.08]],14,4),mat);
  for(const s of [-1,1])addMesh(head,sweep([[s*.3,.25,-.12,.11,.06],[s*.62,.42,-.2,.09,.04],[s*.85,.52,-.24,.005]],7,2),mat);
  const eyes=[]; for(const s of [-1,1]){const e=eyeSprite('#efe6ff',.3,3.4,.28);e.position.set(s*.33,.1,.5);head.add(e);eyes.push(e);}
  const mouth=[anchor(head,0,-.28,1.3),anchor(head,.08,-.18,1.3),anchor(head,-.08,-.18,1.3)];
  // the crown: branching ink with violet-burning tips
  const crown=new THREE.Group(); crown.position.set(0,.3,-.1); head.add(crown);
  const tips=[]; const ag=mergeGeos([antlerGeo(-1,tips),antlerGeo(1,tips)]);
  addMesh(crown,ag,crownMat);
  const flames=[], tipAnchors=[];
  const flameMat=()=>new THREE.SpriteMaterial({map:G.tex.flame,color:U.col('#a57bff').multiplyScalar(1.1),blending:THREE.AdditiveBlending,transparent:true,depthWrite:false});
  tips.forEach((p,i)=>{const f=new THREE.Sprite(flameMat()); f.scale.setScalar(.4); f.position.copy(p); f.renderOrder=4; crown.add(f); flames.push(f); tipAnchors.push(anchor(crown,p.x,p.y,p.z));});
  const halo=new THREE.Sprite(new THREE.SpriteMaterial({map:G.tex.soft,color:U.col('#8a5cff'),blending:THREE.AdditiveBlending,transparent:true,depthWrite:false,opacity:.3}));
  halo.scale.setScalar(4.2); halo.position.set(0,2,.1); crown.add(halo);
  const tail=new THREE.Group(); tail.position.set(0,.5,-2.15); body.add(tail);
  const legs=[], hooves=[];
  for(const [sx,sz] of [[-1,1],[1,1],[-1,-1],[1,-1]]){
    const hip=new THREE.Group(); hip.position.set(sx*.6,-.35,sz>0?1.25:-1.35); body.add(hip);
    addMesh(hip,sweep([[0,.45,sz>0?.05:-.1,.42,.5],[0,-.3,sz>0?.06:-.12,.33,.36],[0,-1.0,0,.22],[0,-1.55,0,.17]],10,3),mat);
    const knee=new THREE.Group(); knee.position.y=-1.5; hip.add(knee);
    addMesh(knee,sweep([[0,.05,0,.15],[0,-.7,.02,.11],[0,-1.25,.04,.12],[0,-1.45,.08,.17,.12]],8,3),mat);
    knee.rotation.x=sz>0?.08:-.3; hip.rotation.x=sz>0?0:.22;
    const hv=anchor(knee,0,-1.45,.08); hooves.push(hv);
    legs.push({hip,knee,front:sz>0,side:sx,hoof:hv,prev:0});
  }
  const ribbons=[];
  for(let k=0;k<7;k++)ribbons.push({a:anchor(body,(k%2?.3:-.3),.85-k*.05,1.2-k*.45),o:{n:8,len:1.4+(k%3)*.4,r0:.16,r1:.0,dir:V(k%2?.7:-.7,.15,-1),stiff:3.5,wave:.25,freq:1.5,lift:.1},mat:tMat});
  for(let k=0;k<4;k++)ribbons.push({a:anchor(body,(k-1.5)*.35,-.75,1.3+(k%2)*.15),o:{n:7,len:1.0+(k%2)*.35,r0:.17,r1:0,dir:V((k-1.5)*.2,-1,.25),stiff:4,wave:.18,freq:1.8,lift:-.1},mat:tMat});
  ribbons.push({a:tail,o:{n:8,len:1.3,r0:.2,r1:0,dir:V(0,.2,-1),stiff:4,wave:.2,freq:2,lift:.4},mat:tMat});
  for(let k=0;k<4;k++){const tA=tipAnchors[[0,6,7,13][k]]; if(tA)ribbons.push({a:tA,o:{n:6,len:.75,r0:.04,r1:0,dir:V(0,1,0),stiff:5,wave:.12,freq:2.5,lift:1.2},mat:crownMat});}
  const back=[]; for(let k=0;k<7;k++)back.push(anchor(body,(rnd()-.5)*.8,.75+(k%2)*.15,1.4-k*.55));
  back.push(anchor(neck,0,1.2,-.3),anchor(neck,0,.4,-.5));
  const light=new THREE.PointLight(0x9a6cff,2.2,22,1.6); light.position.set(0,2.2,0); head.add(light);
  return {root,body,head,neck,tail,legs,eyes,crown,crownMat,flames,halo,light,ribbonsDef:ribbons,ribbonMat:tMat,back,mouth,hooves,tipAnchors,mats:[mat,tMat,crownMat],extra:[],tendrils:[]};
}

/* ---- Brineling: a knee-high crab of ink under a barnacled shell (the Drowned Keepers' Cave) ----
   Local +z is its face; it scuttles along local x (sideways). Shell, claws and barnacles are
   cel-shaded so the lantern picks them out; everything under the shell is living ink. */
function buildBrineling(S){
  const mat=inkMat(S,{amp:.018,wisp:.6,flow:.4,scale:3.2,rimK:1.1});
  const legMat=inkMat(S,{amp:.008,wisp:.45,flow:.5,scale:4,rimK:1.3});
  const shellMat=G.toon('#ffffff',{emissive:'#0d0816',vertexColors:true});
  const clawMat=G.toon('#2c2633',{emissive:'#0d0816'});
  const barnMat=G.toon('#9d9384',{emissive:'#0a0710'});
  const root=new THREE.Group(), body=new THREE.Group(); root.add(body); body.position.y=.3;
  // ink body (wide, flat) — the part that bleeds smoke
  addMesh(body,sweep([[-.31,-.02,0,.04],[-.22,-.01,0,.2,.11],[0,0,0,.26,.14],[.22,-.01,0,.2,.11],[.31,-.02,0,.04]],12,3),mat);
  // carapace dome, flattened, with a notched front lip
  const dome=new THREE.SphereGeometry(.36,26,12,0,TAU,0,PI*.5);
  { const p=dome.attributes.position; for(let i=0;i<p.count;i++){ const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
      const a=Math.atan2(x,z), ridge=.012*Math.sin(a*9)*(1-y/.36), lip=z>.18&&y<.08?-.025:0;
      p.setXYZ(i,x*(1.06+ridge),y*.5+lip+.02*Math.sin(x*14)*Math.cos(z*11),z*.84); }
    dome.computeVertexNormals();
    // wet slate, sea-green mottling, a darker rim where the ink seeps out
    const col=new Float32Array(p.count*3), cA=U.col('#2a2433'), cB=U.col('#33464a'), cR=U.col('#120e18'), c=new THREE.Color();
    for(let i=0;i<p.count;i++){ const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
      const n=U.vnoise?U.vnoise(x*9+3,z*9-1):(.5+.5*Math.sin(x*21)*Math.cos(z*17));
      c.copy(cA).lerp(cB,U.smooth(.45,.75,n)).lerp(cR,1-U.smooth(.0,.09,y));
      col[i*3]=c.r;col[i*3+1]=c.g;col[i*3+2]=c.b; }
    dome.setAttribute('color',new THREE.BufferAttribute(col,3)); }
  const shell=addMesh(body,dome,shellMat,0,.02,-.02); G.outline(shell,{thickness:.012,color:'#06040a'});
  // barnacles: little open cones and pearls crusted on the back half of the shell
  const bl=[]; const r2=U.rng(4411);
  for(let k=0;k<26;k++){ const a=(r2()-.5)*3.6+PI, el=.18+r2()*1.1, R=.36;
    const nx=Math.sin(a)*Math.cos(el), ny=Math.sin(el), nz=Math.cos(a)*Math.cos(el);
    const px=nx*R*1.06, py=ny*R*.5+.02, pz=nz*R*.84-.02;
    const n=V(nx/1.06,ny/.5,nz/.84).normalize();
    const s=.8+r2()*.9, g=k%4===3?new THREE.SphereGeometry(.024*s,6,4):new THREE.CylinderGeometry(.012*s,.035*s,.045*s,7,1,true);
    if(k%4!==3)g.translate(0,.02*s,0);
    const q=new THREE.Quaternion().setFromUnitVectors(V(0,1,0),n); g.applyMatrix4(new THREE.Matrix4().compose(V(px,py,pz),q,V(1,1,1)));
    bl.push(g); }
  addMesh(body,mergeGeos(bl),barnMat);
  // eye stalks with violet glints
  const eyes=[], stalks=[];
  for(const s of [-1,1]){ const st=new THREE.Group(); st.position.set(s*.07,.1,.22); body.add(st);
    addMesh(st,sweep([[0,0,0,.022],[s*.01,.09,.03,.016],[s*.02,.17,.04,.013]],6,3),legMat);
    const e=eyeSprite('#7f45ff',.085,.9,.3); e.position.set(s*.02,.18,.05); st.add(e); eyes.push(e); stalks.push(st); }
  // pincers: the right one is the big one
  const claws=[];
  for(const s of [-1,1]){ const big=s>0?1.3:1;
    const sh=new THREE.Group(); sh.position.set(s*.19,.0,.17); body.add(sh);
    addMesh(sh,sweep([[0,0,0,.038],[s*.08,.04,.1,.034],[s*.1,.05,.2,.03]],8,3),legMat);
    const el=new THREE.Group(); el.position.set(s*.1,.05,.2); sh.add(el);
    addMesh(el,sweep([[0,0,0,.034],[-s*.02,.02,.1,.04*big]],8,2),clawMat);
    const hand=new THREE.Group(); hand.position.set(-s*.02,.02,.11); hand.scale.setScalar(big); el.add(hand);
    const palm=addMesh(hand,sweep([[0,0,-.03,.05,.04],[0,0,.07,.068,.05],[0,-.012,.15,.04,.03],[0,-.02,.22,.006]],10,3),clawMat);
    G.outline(palm,{thickness:.01,color:'#06040a'});
    const fing=new THREE.Group(); fing.position.set(0,.035,.05); hand.add(fing);
    addMesh(fing,sweep([[0,0,0,.026],[0,.035,.08,.022],[0,.01,.17,.005]],8,3),clawMat);
    claws.push({sh,el,hand,fing,s,tip:anchor(hand,0,0,.2)}); }
  // six legs, tripod gait
  const legs=[], feet=[];
  for(const s of [-1,1])for(let i=0;i<3;i++){ const z=.1-i*.12;
    const hip=new THREE.Group(); hip.position.set(s*.2,-.01,z); body.add(hip);
    addMesh(hip,sweep([[0,0,0,.032],[s*.12,.1,0,.027],[s*.22,.12,0,.022]],7,3),legMat);
    const knee=new THREE.Group(); knee.position.set(s*.22,.12,0); hip.add(knee);
    addMesh(knee,sweep([[0,0,0,.022],[s*.08,-.15,0,.018],[s*.13,-.37,0,.003]],6,3),legMat);
    hip.rotation.y=s*(i-1)*-.45;
    const ft=anchor(knee,s*.13,-.36,0); feet.push(ft);
    legs.push({hip,knee,s,i,y0:hip.rotation.y}); }
  // smoke seeps from under the shell rim; ink drips from the claws
  const rim=[]; for(let k=0;k<6;k++){const a=k/6*TAU; rim.push(anchor(body,Math.sin(a)*.3,-.02,Math.cos(a)*.26));}
  return {root,body,shell,eyes,stalks,claws,legs,feet,rim,shellMats:[shellMat,clawMat,barnMat],
    mats:[mat,legMat],extra:[shellMat,clawMat,barnMat],tendrils:[],clawTips:claws.map(c=>c.tip)};
}


/* ---- Nameless: a hunched, faceless villager gone to ink (the Hamlet Undercroft) ----
   Grey smock and long arms of ink; a smooth blank face of pale grey (no eyes, no mouth: that was taken). Through the
   Remembering Glass a warm translucent echo of who they were stands over them (parts.echo; tone only). */
function buildNameless(S){
  const mat=inkMat(S,{amp:.03,wisp:.7,flow:.35,scale:2.2,rimK:.55});
  const smockMat=inkMat(S,{amp:.04,wisp:.45,flow:.4,scale:2.0,fray:.5,rimK:.5,side:THREE.DoubleSide});
  const handMat=inkMat(S,{amp:.006,wisp:.3,flow:.3,scale:3,rimK:1.3});
  const faceMat=G.toon('#8e8996',{emissive:'#1a1620',transparent:true});
  const root=new THREE.Group(), body=new THREE.Group(); root.add(body);
  // the smock: a frayed skirt from the waist to the floor
  const sk=new THREE.LatheGeometry([[.2,1.0],[.3,.75],[.4,.38],[.46,.05],[.44,0]].map(([r,y])=>new THREE.Vector2(r,y)),18);
  addMesh(body,sk,smockMat).frustumCulled=false;
  const upper=new THREE.Group(); upper.position.y=.95; body.add(upper);
  // hunched torso, bent forward from the hips; a hump of shoulders
  addMesh(upper,sweep([[0,-.1,0,.2,.16],[0,.25,.04,.22,.17],[0,.5,.14,.25,.19],[0,.66,.24,.2,.17],[0,.74,.32,.1,.09]],10,3),mat);
  const head=new THREE.Group(); head.position.set(0,.8,.4); upper.add(head);
  const face=addMesh(head,new THREE.SphereGeometry(.16,18,14),faceMat); face.scale.set(.9,1.15,1);
  if(G.outline)G.outline(face,{thickness:.012,color:'#06040a'});
  addMesh(head,new THREE.SphereGeometry(.18,14,10,0,TAU,0,PI*.55),inkMat(S,{amp:.02,wisp:.6,flow:.4,scale:2.5,rimK:.7,side:THREE.DoubleSide}),0,.03,-.03).scale.set(1,1.1,1.1); // ink hair / a cap
  const arms=[], tips=[];
  for(const s of [-1,1]){
    const sh=new THREE.Group(); sh.position.set(s*.24,.62,.22); upper.add(sh);
    addMesh(sh,sweep([[0,.02,0,.075],[s*.02,-.3,.02,.068],[s*.03,-.55,.03,.058]],8,3),mat);
    const el=new THREE.Group(); el.position.set(s*.03,-.55,.03); sh.add(el);
    addMesh(el,sweep([[0,0,0,.05],[0,-.28,.03,.042],[0,-.5,.05,.035]],8,3),mat);
    const hand=new THREE.Group(); hand.position.set(0,-.5,.05); el.add(hand);
    const fg=[sweep([[0,.02,0,.05,.035],[0,-.07,.01,.055,.03]],8,2)];
    for(let k=0;k<4;k++){ const x=(k-1.5)*.028; fg.push(sweep([[x,-.05,0,.016],[x*1.4,-.18,.03,.012],[x*1.6,-.3,.07,.004]],5,3)); tips.push(anchor(hand,x*1.6,-.3,.07)); }
    addMesh(hand,mergeGeos(fg),handMat);
    arms.push({sh,el,hand,s});
  }
  // the echo: who they were, warm and translucent (only drawn while the Glass is raised)
  const echo=new THREE.Group(); echo.visible=false; root.add(echo);
  const em=new THREE.MeshBasicMaterial({color:U.col('#ffd6a8'),transparent:true,opacity:.22,depthWrite:false,blending:THREE.AdditiveBlending});
  const eb=new THREE.Mesh(new THREE.CylinderGeometry(.2,.36,1.45,12),em); eb.position.y=.8; echo.add(eb);
  const eh=new THREE.Mesh(new THREE.SphereGeometry(.16,12,10),em); eh.position.y=1.72; echo.add(eh);
  const eg=new THREE.Sprite(new THREE.SpriteMaterial({map:G.tex.soft,color:U.col('#ffc890'),transparent:true,opacity:.35,depthWrite:false,blending:THREE.AdditiveBlending})); eg.scale.set(1.6,2.6,1); eg.position.y=1.1; echo.add(eg);
  const hem=[]; for(let k=0;k<6;k++){ const a=k/6*TAU; hem.push(anchor(body,Math.sin(a)*.4,.12,Math.cos(a)*.4)); }
  hem.push(anchor(upper,0,.6,.1));
  return {root,body,upper,head,arms,eyes:[],echo,echoMat:em,hem,clawTips:tips,mats:[mat,smockMat,handMat],extra:[faceMat],tendrils:[]};
}

/* ---------------------------------------------------------------- per-monster fx (smoke, drips, pools) */
function attachFx(m){
  const I=INK(), c=m.parts; m.fx={list:[]};
  if(!I)return;
  const add=h=>{m.fx.list.push(h);return h;};
  if(m.kind==='hollow'){
    m.fx.body=add(I.emitter(c.hem,{rate:16,radius:.25,height:.3,size:[.8,2.2],life:[1.0,1.9],rise:.6,drift:.22,trail:.9,alpha:.85,color:'#0b0712'}));
    m.fx.claws=add(I.emitter(c.clawTips,{rate:3,radius:.05,size:[.15,.5],life:[.6,1.1],rise:.25,drift:.1,trail:.5,alpha:.5,drip:2.6}));
    m.fx.pool=add(I.pool(m.pos,{radius:1.0,alpha:.75}));
  }else if(m.kind==='hound'){
    m.fx.body=add(I.emitter(c.back,{rate:9,radius:.12,size:[.45,1.3],life:[.7,1.4],rise:.35,drift:.15,trail:1,alpha:.75,color:'#0b0712'}));
    m.fx.legs=add(I.emitter(c.paws,{rate:7,radius:.12,size:[.4,1.1],life:[.5,1.0],rise:.15,drift:.25,trail:.9,alpha:.6,color:'#16101f'}));
    m.fx.pool=add(I.pool(m.pos,{radius:.85,alpha:.6}));
  }else if(m.kind==='nameless'){
    m.fx.body=add(I.emitter(c.hem,{rate:9,radius:.2,height:.25,size:[.6,1.6],life:[.9,1.7],rise:.4,drift:.18,trail:.9,alpha:.7,color:'#0d0a12'}));
    m.fx.claws=add(I.emitter(c.clawTips,{rate:2,radius:.04,size:[.12,.4],life:[.6,1.1],rise:.2,drift:.1,trail:.5,alpha:.45,drip:2}));
    m.fx.pool=add(I.pool(m.pos,{radius:.9,alpha:.65}));
  }else if(m.kind==='vigilant'){
    m.fx.body=add(I.emitter(c.hem,{rate:10,radius:.25,height:.3,size:[.7,1.9],life:[1.1,2],rise:.35,drift:.2,trail:.9,alpha:.5,color:'#4a4656'}));
    m.fx.skin=add(I.emitter(c.skinPts,{rate:5,radius:.2,size:[.3,.9],life:[.7,1.3],rise:.5,drift:.12,trail:.7,alpha:.7,color:'#0b0712'}));
    m.fx.pool=add(I.pool(m.pos,{radius:.9,alpha:.5}));
  }else if(m.kind==='brineling'){
    m.fx.body=add(I.emitter(c.rim,{rate:7,radius:.08,size:[.25,.7],life:[.6,1.2],rise:.25,drift:.12,trail:1,alpha:.7,color:'#0b0712'}));
    m.fx.claws=add(I.emitter(c.clawTips,{rate:0,radius:.03,drip:1.6,alpha:.6}));
    m.fx.pool=add(I.pool(m.pos,{radius:.6,alpha:.6}));
  }else{
    m.fx.body=add(I.emitter(c.back,{rate:22,radius:.55,height:.4,size:[1.5,3.9],life:[1.6,2.7],rise:.8,drift:.35,trail:.8,alpha:.75,color:'#0a0710'}));
    m.fx.mouth=add(I.emitter(c.mouth,{rate:9,radius:.08,size:[.35,1.3],life:[.8,1.6],rise:.25,drift:.3,trail:.6,alpha:.6,drip:1.2}));
    m.fx.legs=add(I.emitter(c.hooves,{rate:6,radius:.25,size:[.7,1.8],life:[.6,1.1],rise:.15,drift:.4,trail:.9,alpha:.45,color:'#120d1a'}));
    m.fx.crown=add(I.emitter(c.tipAnchors,{rate:0,radius:.05,embers:12}));
    m.fx.pool=add(I.pool(m.pos,{radius:3.9,alpha:.8}));
  }
}
function removeFx(m){ const I=INK(); if(!I||!m.fx)return; for(const h of m.fx.list)I.remove(h); m.fx.list.length=0; }
function fxIntensity(m,k){ if(!m.fx)return; for(const h of m.fx.list)h.intensity=k; }

/* ---------------------------------------------------------------- ink animation */
const _v=V(), _v2=V();
function stepShroud(m,dt,t){
  const c=m.parts, S=c.shroud, pos=S.pos, base=S.base, nC=S.nC;
  const W=m.state==='windup', A=m.state==='attack';
  // spring lag: the hem trails behind motion, and kicks forward on a lunge
  const sp=m.speedNow||0, lunge=A&&m.atk==='lunge';
  const tgtZ=-Math.min(.9,sp*.12)-(lunge?.55:0), tgtY=Math.min(.45,sp*.06)+(lunge?.35:0);
  if(dt>0){ S.lagV.z+=(40*(tgtZ-S.lag.z)-7*S.lagV.z)*dt; S.lagV.y+=(40*(tgtY-S.lag.y)-7*S.lagV.y)*dt; S.lag.addScaledVector(S.lagV,dt); }
  const flare=m.flare, hurt=m.state==='hurt'?1:0;
  for(let i=0;i<pos.length/3;i++){
    const a=base[i*4], rr0=base[i*4+1], y=base[i*4+2], tr=base[i*4+3];
    const w=Math.pow(tr,1.3);
    const wave=(Math.sin(t*2.6+a*3-tr*4.2+m.id)*.06+Math.sin(t*4.3+a*5.3+m.id*2)*.03)*w*(1+flare*1.8);
    const rr=rr0*(1+flare*1.15*w+hurt*.25*w)+wave;
    let x=Math.sin(a)*rr, z=Math.cos(a)*rr, yy=y+S.lag.y*w*1.2+Math.sin(t*3.2+a*4+m.id)*.05*w;
    z+=S.lag.z*w*1.4; yy+=flare*.3*w*(.5+.5*Math.cos(a*2));
    pos[i*3]=x; pos[i*3+1]=yy; pos[i*3+2]=z;
  }
  S.geo.attributes.position.needsUpdate=true; S.geo.computeVertexNormals();
  const nr=S.geo.attributes.normal.array; // weld the seam so the ink displacement never cracks
  for(let r=0;r<SH_R;r++){const i0=r*nC*3, i1=(r*nC+nC-1)*3; for(let k=0;k<3;k++){const av=(nr[i0+k]+nr[i1+k])*.5; nr[i0+k]=nr[i1+k]=av;}}
}
function stepTendrils(m,dt,agit,lift){
  const c=m.parts; if(m.fxK<=0&&c.tendrils[0]&&c.tendrils[0].pts)return; c.root.updateMatrixWorld(true);
  for(const T of c.tendrils)stepTendril(T,dt,G.time,agit,lift);
}
/* smoke drawn INTO the body (crouch / gathering), or streamed away from it */
function gather(cx,cy,cz,r,n,col){
  for(let k=0;k<n;k++){const a=rnd()*TAU, el=(rnd()-.3)*.9, rr=r*(.7+rnd()*.5);
    const x=cx+Math.cos(a)*rr, y=cy+el*rr*.6, z=cz+Math.sin(a)*rr;
    puff(x,y,z,(cx-x)*2.2,(cy-y)*2.2,(cz-z)*2.2,.42+rnd()*.15,.7*r,.15*r,.55,col||cSmoke,0,.4);}
}
function eyesFlare(c,base,k,fade){
  c.eyes.forEach(e=>{ const s=base*(1+k*1.1); if(e.userData.slit)e.scale.set(s*1.5,s*.45,1); else e.scale.setScalar(s);
    e.material.opacity=fade; const h=e.children[0]; if(h)h.material.opacity=h.userData.o*(1+k*2.2)*fade; });
}

function animHollow(m,dt){
  const c=m.parts, t=G.time;
  m.phase+=dt;
  const bob=.32+Math.sin(t*1.8+m.id)*.09;
  c.body.position.y=U.damp(c.body.position.y,bob,8,dt);
  const W=m.state==='windup', A=m.state==='attack', R=m.state==='recover', Hh=m.state==='hurt';
  const lean=W?-.35*m.flare:A?.45:Hh?-.25:(m.speedNow>2?.18:.05);
  c.upper.rotation.x=U.damp(c.upper.rotation.x,lean,10,dt);
  c.body.rotation.x=U.damp(c.body.rotation.x,(m.speedNow>2?.12:0)+(A?.15:0),6,dt);
  for(const a of c.arms){
    let sx=Math.sin(t*1.3+a.s)*.08, sz=a.s*.12, ex=-.15;
    if(W){ if(m.atk==='claw'){ sx=a.s>0?-2.6*m.flare:-.6*m.flare; sz=a.s*(.5*m.flare+.1); ex=-.9*m.flare; } else { sx=-.9*m.flare; sz=a.s*.9*m.flare; ex=-.6*m.flare; } }
    else if(A){ if(m.atk==='claw'){ sx=a.s>0?-.2:-.4; sz=a.s>0?-.5:.2; ex=-.1;} else { sx=-1.5; sz=a.s*.15; ex=-.1; } }
    else if(R){ sx=-.2; ex=-.3; }
    else if(m.speedNow>2){ sx=.45; ex=-.05; }
    a.sh.rotation.x=U.damp(a.sh.rotation.x,sx,A?30:9,dt); a.sh.rotation.z=U.damp(a.sh.rotation.z,sz,A?30:9,dt);
    a.el.rotation.x=U.damp(a.el.rotation.x,ex,12,dt);
  }
  if(m.fxK>0||!c.shroud.init){c.shroud.init=1; stepShroud(m,dt,t);}
  stepTendrils(m,dt,1+m.flare*1.5+(A?1:0),m.flare*.8);
  eyesFlare(c,.11,m.flare*.8,m.fade);
  // smoke: constant shedding, thickening on the wind-up, a trail on the lunge
  const k=m.fxK;
  if(m.fx.body){ m.fx.body.intensity=k*(1+m.flare*1.4+(A?1:0)); m.fx.body.radius=.18+m.flare*.35; m.fx.body.rate=13; }
  if(m.fx.claws)m.fx.claws.intensity=k*(1+m.flare);
  if(m.fx.pool)m.fx.pool.intensity=Math.min(1,k*m.fade*(1+m.flare*.4));
  if(k>0&&W&&rnd()<dt*14*m.flare)gather(m.pos.x,m.pos.y+1.6,m.pos.z,1.3,1);
  if(k>0&&A&&m.atk==='lunge'){ for(let n=0;n<2;n++)puff(m.pos.x+(rnd()-.5)*.5,m.pos.y+.4+rnd()*1.6,m.pos.z+(rnd()-.5)*.5,(rnd()-.5)*.3,.2,(rnd()-.5)*.3,1.1+rnd()*.6,.6,1.6,.6,cInk,0,2); }
}


function animNameless(m,dt){
  const c=m.parts, t=G.time;
  const sp=m.speedNow||0; m.phase+=dt*(1+sp*1.6);
  const W=m.state==='windup', A=m.state==='attack', R=m.state==='recover', Hh=m.state==='hurt', E=m.state==='eat';
  // a slow, rolling shuffle: weight from foot to foot
  c.body.position.y=U.damp(c.body.position.y,Math.abs(Math.sin(m.phase*2.2))*.05*Math.min(1,sp),8,dt);
  c.body.rotation.z=U.damp(c.body.rotation.z,Math.sin(m.phase*2.2)*.07*Math.min(1,sp+.3),6,dt);
  const lean=W?.05-.25*m.flare:A?.85:Hh?.1:E?.9:.55;
  c.upper.rotation.x=U.damp(c.upper.rotation.x,lean,A?18:7,dt);
  // the blank face turns, slowly, as if listening for a name
  c.head.rotation.y=U.damp(c.head.rotation.y,W||A?0:Math.sin(t*.5+m.id*1.7)*.5,3,dt);
  c.head.rotation.z=U.damp(c.head.rotation.z,W||A?0:Math.sin(t*.37+m.id)*.18,3,dt);
  for(const a of c.arms){
    let sx=Math.sin(m.phase*2.2+(a.s>0?0:PI))*.15*Math.min(1,sp)+.15, sz=a.s*.06, ex=-.25;
    if(W){ sx=-2.5*m.flare; sz=a.s*.25*m.flare; ex=-.55*m.flare; }        // both arms rise high: the grab is coming
    else if(A){ sx=-1.55; sz=-a.s*.12; ex=-.05; }                         // thrust forward, hands together
    else if(R){ sx=-.6; ex=-.4; }
    else if(E){ sx=-1.1+Math.sin(t*9+a.s)*.25; ex=-.7; }
    a.sh.rotation.x=U.damp(a.sh.rotation.x,sx,A?28:8,dt); a.sh.rotation.z=U.damp(a.sh.rotation.z,sz,A?28:8,dt);
    a.el.rotation.x=U.damp(a.el.rotation.x,ex,10,dt);
  }
  stepTendrils(m,dt,1,0);
  const k=m.fxK;
  if(m.fx.body)m.fx.body.intensity=k*(1+m.flare*1.2+(A?.8:0));
  if(m.fx.claws)m.fx.claws.intensity=k*(1+m.flare);
  if(m.fx.pool)m.fx.pool.intensity=Math.min(1,k*m.fade);
  if(k>0&&W&&rnd()<dt*10*m.flare)gather(m.pos.x,m.pos.y+1.5,m.pos.z,1.1,1);
  // through the Glass: who they were
  const gl=G.glass, see=!!(gl&&gl.raised)&&(!gl.canSee||gl.canSee(m.pos)!==false);
  c.echo.visible=see&&m.fade>.05; if(see)c.echoMat.opacity=.2*m.fade*(.85+.15*Math.sin(t*2+m.id));
}

function animQuadLegs(c,m,dt,speed,stride,gallop){
  m.phase+=dt*speed*stride;
  const amp=Math.min(1,speed/2)*(gallop?.8:.5);
  c.legs.forEach((l,i)=>{
    const off=gallop?(l.front?0:PI*.9)+(l.side>0?.35:0):[0,PI,PI,0][i];
    const s=Math.sin(m.phase+off);
    l.hip.rotation.x=(l.front?0:.22)+s*amp;
    l.knee.rotation.x=(l.front?.1:-.3)+Math.max(0,-Math.cos(m.phase+off))*amp*(l.front?.9:-.9);
    l.footfall=speed>.3&&l.prevS!=null&&l.prevS<0&&s>=0; l.prevS=s;
  });
}
function animHound(m,dt){
  const c=m.parts, t=G.time, W=m.state==='windup', A=m.state==='attack';
  animQuadLegs(c,m,dt,m.speedNow,3.2,m.speedNow>4);
  const crouch=W?-.22*m.flare:0;
  c.body.position.y=U.damp(c.body.position.y,.78+crouch+(m.speedNow>4?Math.abs(Math.sin(m.phase))*.08:0),14,dt);
  c.body.rotation.x=U.damp(c.body.rotation.x,W?.12:A?-.1:0,10,dt);
  c.head.rotation.x=U.damp(c.head.rotation.x,W?.25:m.state==='flee'?-.2:0,10,dt);
  c.jaw.rotation.x=U.damp(c.jaw.rotation.x,A?.7:W?.35:.05+Math.max(0,Math.sin(t*3+m.id))*.06,20,dt);
  c.tail.rotation.x=U.damp(c.tail.rotation.x,m.state==='flee'?-.9:W?.5:0,6,dt);
  c.tail.rotation.y=Math.sin(t*5+m.id)*.2;
  // mane/tail: flatten back on the run, bristle up on the crouch, tight & stiff on the dash
  stepTendrils(m,dt,1+Math.min(1.5,m.speedNow*.12)+m.flare,W?.9*m.flare:A?-.3:0);
  eyesFlare(c,.075,m.flare*.9,m.fade);
  const k=m.fxK;
  if(m.fx.body){ m.fx.body.intensity=k*(W?.25:1+(A?1.5:0)); m.fx.body.trail=1; }
  if(m.fx.legs)m.fx.legs.intensity=k*(m.speedNow>.5?1+m.speedNow*.12:.6)*(W?.2:1);
  if(m.fx.pool)m.fx.pool.intensity=Math.min(1,k*m.fade);
  // the crouch before a dash pulls smoke inward
  if(k>0&&W&&rnd()<dt*22)gather(m.pos.x,m.pos.y+.6,m.pos.z,1.1,1);
  // dash leaves a thin smoke streak
  if(k>0&&A)puff(m.pos.x,m.pos.y+.6+rnd()*.2,m.pos.z,0,.1,0,.8+rnd()*.4,.45,.9,.6,cInk,0,2);
}

function animBrineling(m,dt){
  const c=m.parts, t=G.time, s=m.state, W=s==='windup', A=s==='attack', E=s==='eat'||!!(m.raid&&m.raid.snapT>0), Hh=s==='hurt', B=s==='board', Gr=s==='grip';
  const sp=m.speedNow||0; m.phase+=dt*Math.max(sp,0)*7.5;
  const amp=Math.min(1,sp/2.4);
  c.body.position.y=U.damp(c.body.position.y,.3+(W?-.07*m.flare:0)+(B?.05:0)+(sp>.3?Math.abs(Math.sin(m.phase))*.03:Math.sin(t*2.3+m.id)*.008),18,dt);
  c.body.rotation.z=U.damp(c.body.rotation.z,-(m.lat||0)*amp*.14+(Hh?Math.sin(t*40)*.06:0),9,dt);
  c.body.rotation.x=U.damp(c.body.rotation.x,Gr?-.55:B?-.35:W?-.22*m.flare:A?.16:E?.1:Hh?-.15:0,12,dt);
  for(const l of c.legs){
    const off=((l.i%2)^(l.s>0?1:0))?PI:0, ph=m.phase+off;
    const lift=sp>.2?Math.max(0,Math.sin(ph))*amp:(B?.6:0);
    l.hip.rotation.z=U.damp(l.hip.rotation.z,l.s*(lift*.55+(W?.12:0)),20,dt);
    l.hip.rotation.y=l.y0+(sp>.2?Math.cos(ph)*.32*amp:Math.sin(t*1.7+l.i+l.s)*.03);
    l.knee.rotation.z=U.damp(l.knee.rotation.z,l.s*(sp>.2?Math.cos(ph)*.28*amp:0)-(B?l.s*.5:0),20,dt);
  }
  for(const cl of c.claws){
    let rx=-.15+Math.sin(t*1.3+cl.s)*.06, ry=0, fx=-(.18+.14*Math.max(0,Math.sin(t*2.1+cl.s*1.7)));
    if(Gr){ const k=Math.sin(t*9+cl.s*2); rx=-1.25+.12*k; ry=cl.s*.35; fx=-.85-.15*k; }   // hooked over the raft's edge, working for a grip
    else if(W){ rx=-1.05*m.flare; ry=cl.s*.55*m.flare; fx=-.95*m.flare; }
    else if(A){ rx=.2; ry=-cl.s*.3; fx=0; }
    else if(E){ const k=Math.max(0,Math.sin(t*13+(cl.s>0?0:PI))); rx=-.45-.5*k; fx=-.6*k; ry=-cl.s*.2*k; }
    else if(Hh){ rx=.5; fx=-.3; }
    else if(sp>.3){ rx=-.35; fx=-.1; }
    cl.sh.rotation.x=U.damp(cl.sh.rotation.x,rx,A?34:14,dt); cl.sh.rotation.y=U.damp(cl.sh.rotation.y,ry,A?34:14,dt);
    cl.fing.rotation.x=U.damp(cl.fing.rotation.x,fx,A?40:18,dt);
  }
  c.stalks.forEach((st,i)=>{ st.rotation.z=Math.sin(t*2.6+i*2+m.id)*.18; st.rotation.x=U.damp(st.rotation.x,W?-.35*m.flare:E?.25:0,10,dt); });
  eyesFlare(c,.09,m.flare*1.2,m.fade);
  const f=m.flash;
  for(const mt of c.shellMats){ mt.emissive.setRGB(.05+f*.55,.03+f*.38,.09+f*.85); }
  const k=m.fxK;
  if(m.fx.body)m.fx.body.intensity=k*(1+m.flare*1.4+(sp>.3?.5:0));
  if(m.fx.claws)m.fx.claws.intensity=k*(E?2.2:1);
  if(m.fx.pool)m.fx.pool.intensity=Math.min(1,k*m.fade)*(m.onRaft||B||Gr||m.knock?0:1);
  if(k>0&&W&&rnd()<dt*16*m.flare)gather(m.pos.x,m.pos.y+.35,m.pos.z,.6,1);
}

function animStag(m,dt){
  const c=m.parts, t=G.time, s=m.state;
  animQuadLegs(c,m,dt,m.speedNow,s==='charge'?1.1:1.5,s==='charge');
  let bodyY=3.15, pitch=0, headX=0, headZ=0;
  if(s==='chargeWind'){ // paws the ground, lowers the crown
    const paw=c.legs[1]; paw.hip.rotation.x=-.5+Math.sin(t*14)*.5; paw.knee.rotation.x=.9;
    headX=.85*m.flare; pitch=.08*m.flare; bodyY=3.0;
  }else if(s==='charge'){ headX=.85; pitch=.06; }
  else if(s==='staggered'){ headX=1.0+Math.sin(t*5)*.1; headZ=Math.sin(t*3)*.25; bodyY=2.55; pitch=.16; }
  else if(s==='sweepWind'){ headX=.4; headZ=-.7*m.flare; }
  else if(s==='sweep'){ headX=.4; headZ=-.7+m.st/.35*1.4; }
  else if(s==='stompWind'||s==='summon'){ // rears up on its hind legs
    const k=s==='summon'?Math.min(1,m.st*2)*(m.st<1.3?1:Math.max(0,1-(m.st-1.3)*3)):m.flare;
    pitch=-.75*k; bodyY=3.15+1.1*k; headX=-.35*k;
    c.legs.forEach(l=>{if(l.front){l.hip.rotation.x=-.9*k;l.knee.rotation.x=1.3*k;}});
  }else if(s==='stomp'){ pitch=U.damp(c.body.rotation.x,0,14,dt); }
  else if(s==='intro'){ headX=-.3; }
  else if(s==='dying'){ bodyY=3.15-1.6*Math.min(1,m.st/2.4); pitch=.2; headX=.9; }
  c.body.position.y=U.damp(c.body.position.y,bodyY,10,dt);
  c.body.rotation.x=s==='stomp'?pitch:U.damp(c.body.rotation.x,pitch,8,dt);
  c.neck.rotation.x=U.damp(c.neck.rotation.x,.6+headX,8,dt);
  c.head.rotation.z=U.damp(c.head.rotation.z,headZ,s==='sweep'?20:8,dt);
  c.tail.rotation.y=Math.sin(t*2)*.2;
  const stag=s==='staggered', wind=s==='chargeWind', chg=s==='charge';
  stepTendrils(m,dt,stag?.4:1+m.flare*.8+(chg?1:0),stag?-1.2:m.flare*.6);
  // the crown burns hotter during wind-ups
  const heat=stag?.35:1+m.flare*1.2;
  c.flames.forEach((f,i)=>{f.scale.setScalar((.36+.14*Math.sin(t*13+i*1.7)+.08*Math.sin(t*29+i))*heat*(i%7===0?1.35:1));});
  c.halo.material.opacity=(.16+m.flare*.3)*m.fade; c.light.intensity=(1.6+m.flare*2.5)*m.fade*(stag?.4:1);
  c.flames.forEach(f=>f.material.opacity=m.fade);
  eyesFlare(c,.3,stag?-.5:m.flare,m.fade);
  // smoke: rolls off the back, pours from the mouth; slackens when staggered; streams backward on the wind-up
  const k=m.fxK;
  if(m.fx.body){ m.fx.body.intensity=k*(stag?.35:1+m.flare*.6+(chg?.6:0)); m.fx.body.rise=stag?.2:.9; }
  if(m.fx.mouth)m.fx.mouth.intensity=k*(stag?.3:1+m.flare*1.5);
  if(m.fx.legs)m.fx.legs.intensity=k*(m.speedNow>.5?1.2:.5);
  if(m.fx.crown)m.fx.crown.intensity=k*(stag?.15:1+m.flare*2.5);
  if(m.fx.pool)m.fx.pool.intensity=Math.min(1,k*m.fade*(stag?.7:1));
  if(k>0&&wind){ // smoke streams backward off the whole body: the charge is coming
    const fx=Math.sin(m.heading), fz=Math.cos(m.heading);
    for(let n=0;n<3;n++){ const a=c.back[(rnd()*c.back.length)|0]; a.getWorldPosition(_v);
      puff(_v.x+(rnd()-.5),_v.y+(rnd()-.5)*.6,_v.z+(rnd()-.5),-fx*(5+rnd()*4)*m.flare,.3,-fz*(5+rnd()*4)*m.flare,.7+rnd()*.5,.9,2.4,.55,cInk,0,.9); }
    if(rnd()<dt*30){ const tp=c.tipAnchors[(rnd()*c.tipAnchors.length)|0]; tp.getWorldPosition(_v); ember(_v.x,_v.y,_v.z,-fx*3,1,-fz*3,.6,.22); }
  }
  if(k>0&&chg){ for(let n=0;n<2;n++)puff(m.pos.x+(rnd()-.5)*2,m.pos.y+.6+rnd()*3,m.pos.z+(rnd()-.5)*2,(rnd()-.5)*.5,.4,(rnd()-.5)*.5,1.2+rnd()*.8,1.4,3.2,.55,cInk,0,1.6); }
  // hooves leave ink puddles and splats
  if(k>0&&m.speedNow>.5)c.legs.forEach(l=>{ if(!l.footfall)return; l.hoof.getWorldPosition(_v); const y=G.floorAt(_v.x,_v.z,_v.y+1);
    puddle(_v.x,y,_v.z,.55+rnd()*.25,chg?2.2:3.2,.75);
    for(let n=0;n<4;n++)puff(_v.x,y+.1,_v.z,(rnd()-.5)*2.5,rnd()*1.5+.5,(rnd()-.5)*2.5,1.6,.15,.1,1,cInk,10,.4); });
}

/* ---------------------------------------------------------------- stomp shockwave: an ink ring */
const RING_FS=`uniform float uTime;uniform float uR;uniform float uHalf;uniform float uA;uniform vec3 uRim;varying vec2 vUv;varying vec3 vW;
#include <fog_pars_fragment>
${SN}
void main(){ vec2 p=(vUv*2.-1.)*uHalf; float d=length(p); float ang=atan(p.y,p.x);
  float n=snoise(vec3(cos(ang)*2.,sin(ang)*2.,uTime*1.5+uR*.3))*.5+.5;
  float x=d-uR;                          // >0 ahead of the front, <0 behind it
  float front=1.-smoothstep(0.,.35+.25*n,abs(x+.1));
  float wake=smoothstep(-2.6-n*1.2,-.2,x)*(1.-smoothstep(-.2,.05,x));
  float a=max(front,wake*.75)*uA; if(a<.01)discard;
  vec3 c=vec3(.01,.006,.02)+uRim*front*(.6+.8*n);
  gl_FragColor=vec4(c,a);
  #include <fog_fragment>
}`;
const RING_VS=`varying vec2 vUv;varying vec3 vW;
#include <fog_pars_vertex>
void main(){vUv=uv;vec4 wp=modelMatrix*vec4(position,1.);vW=wp.xyz;vec4 mvPosition=viewMatrix*wp;gl_Position=projectionMatrix*mvPosition;
#include <fog_vertex>
}`;
function ringMesh(){
  const half=P.stag.ringMax+2;
  const u=THREE.UniformsUtils.merge([THREE.UniformsLib.fog,{uR:{value:.5},uHalf:{value:half},uA:{value:1},uRim:{value:U.col('#b28aff').multiplyScalar(2.4)}}]); u.uTime=G.negTime;
  const mat=SN?new THREE.ShaderMaterial({uniforms:u,vertexShader:RING_VS,fragmentShader:RING_FS,transparent:true,depthWrite:false,fog:true,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3})
    :new THREE.MeshBasicMaterial({color:0x9a6cff,transparent:true});
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(half*2,half*2,1,1).rotateX(-PI/2),mat); mesh.renderOrder=2;
  return mesh;
}
/* ---------------------------------------------------------------- monsters */
const list=[], tokens=new Set();
let boss=null, finaleZone=null, ringFx=[];
function playerPos(){return G.player&&G.player.pos;}
function playerAlive(){const p=G.player;return !!(p&&p.pos&&p.alive!==false&&!(p.hp<=0));}
function takeToken(m){
  if(tokens.has(m))return true;
  let n=0; for(const t of tokens) if(!t.boss&&t.alive&&!t.dying)n++; else if(!t.alive||t.dying)tokens.delete(t);
  if(n>=MAX_TOKENS)return false; tokens.add(m); return true;
}
const dropToken=m=>tokens.delete(m);
function setState(m,s){ if(m.state==='windup'||m.state==='attack'||m.state==='recover'){ if(s!=='attack'&&s!=='recover'&&s!=='windup')dropToken(m);} m.state=s; m.st=0; }

function spawn(kind,pos,opts={}){
  if(!P[kind])kind='hollow';
  const p=P[kind];
  const S=kind==='vigilant'?sharedUniforms('#e2dcff',1.1,'#cfc8e0',1.7):sharedUniforms(kind==='stag'?'#b58cff':'#a37cff',kind==='stag'?1.8:1.7,kind==='stag'?'#2a1446':'#24103a',kind==='stag'?.5:.65);
  const SV=kind==='vigilant'?sharedUniforms('#a37cff',2.0,'#12081e',.5):null;   // the Vigilant's ink skin fades on its own
  const mat={uniforms:S}; // one set of uniforms drives every ink part of this monster (fade, flash, rim)
  const parts=kind==='hollow'?buildHollow(S):kind==='hound'?buildHound(S):kind==='brineling'?buildBrineling(S):kind==='nameless'?buildNameless(S):kind==='vigilant'?buildVigilant(S,SV):buildStag(S);
  const y=G.floorAt(pos.x,pos.z,(pos.y!=null?pos.y:H(pos.x,pos.z))+1);
  const m={kind,boss:kind==='stag',parts,mat,rimBase:mat.uniforms.uRim.value.clone(),pos:V(pos.x,y,pos.z),home:V(pos.x,y,pos.z),
    zone:opts.zone||{x:pos.x,z:pos.z,r:20,name:'adhoc'},heading:opts.heading!=null?opts.heading:rnd()*TAU,hp:p.hp,maxHp:p.hp,
    state:opts.aggro?'chase':'idle',st:0,kv:V(),vy:0,flash:0,flare:0,alive:true,dying:false,fade:1,cool:1+rnd()*1.5,
    wt:null,pause:rnd()*2,phase:rnd()*10,speedNow:0,orbit:rnd()<.5?1:-1,orbitA:rnd()*TAU,fled:false,hitSet:new Set(),
    atk:null,dashDir:V(),travel:0,didHit:false,summoned:false,aggro:!!opts.aggro,center:V(),id:list.length,finale:!!opts.finale};
  m.hb={team:'enemy',pos:m.pos,radius:p.radius+(kind==='stag'?.2:.1),height:p.height,targetable:true,corrupt:true,
    name:kind==='hollow'?'Hollow':kind==='hound'?'Shade Hound':kind==='brineling'?'Brineling':kind==='nameless'?'Nameless':'The Hollow Stag',
    lockOffset:kind==='stag'?3.2:kind==='hound'?.8:kind==='brineling'?.35:kind==='nameless'?1.3:1.7, monster:m,
    alive:()=>m.alive&&!m.dying, hit:info=>onHit(m,info)};
  G.combat.add(m.hb);
  parts.root.position.copy(m.pos); parts.root.rotation.y=m.heading; parts.root.name='monster_'+kind;
  parts.root.traverse(o=>{if(o.isMesh){o.castShadow=kind!=='hollow'&&kind!=='nameless'&&!o.userData.noShadow&&o.material.uniforms&&!o.material.uniforms.uFray.value;}});
  G.scene.add(parts.root); parts.root.updateMatrixWorld(true);
  finishTendrils(parts);
  m.fxK=1; attachFx(m);
  m.ground=S.uGround;
  if(opts.intro){m.state='intro';m.fade=0;S.uFade.value=0;
    const I=INK(); if(I){ const w=puddle(m.pos.x,m.pos.y,m.pos.z,kind==='stag'?4.5:1.3,kind==='stag'?4:2.2,.9); if(w)w.grow=.4; } }
  if(kind==='brineling'){ m.eatsMoths=true; m.mothRate=P.brineling.eatRate; }  // moths.js: monsters with eatsMoths do their own eating (don't add the generic kill on top)
  if(opts.cave)m.cave=opts.cave;
  if(opts.undercroft)m.undercroft=opts.undercroft;
  if(kind==='vigilant'){ m.skinS=SV; initVigilant(m,opts); }
  if(kind==='nameless'&&opts.eatsMoths){ m.mothHunter=true; m.eatsMoths=true; m.mothRate=P.nameless.eatRate; }
  list.push(m);
  if(opts.board||opts.raid){ const R=raftInfo(); if(R)startGrip(m,R,opts.raid&&opts.raid.side,opts.raid&&opts.raid.along); }
  return m;
}
function onHit(m,info){
  if(!m.alive||m.dying)return;
  if(m.kind==='vigilant'&&vigilantGlance(m,info))return;   // the ink skin turns the blow (TEMPLE.md)
  let d=info.damage||1;
  if(m.boss&&m.state==='staggered')d*=2;
  if(m.state==='return'&&!m.boss&&info.kind!=='swarm'){ m.flash=.5; splash(V(m.pos.x,m.pos.y+1,m.pos.z),info.dir||V(0,0,1),.4); setState(m,'chase'); m.aggro=true; return; } // re-engage instead of being farmed while leashing
  if(m.raid&&info.kind!=='swarm')d=Math.max(d,m.hp); // a raider on (or gripping) the raft: any blow knocks it off into the water
  m.hp-=d; m.flash=1; m.lastHit=G.time;
  m.center.set(m.pos.x,m.pos.y+P[m.kind].height*.55,m.pos.z);
  const dir=info.dir||V(0,0,1);
  splash(m.center,dir,info.kind==='swarm'?.35:m.boss?1.6:1);
  ash(m.center,info.kind==='swarm'?2:5,m.boss?2:.8);
  const kb=(info.knockback==null?5:info.knockback)*(m.boss?.04:m.kind==='hound'?1.1:.75);
  m.kv.x+=dir.x*kb; m.kv.z+=dir.z*kb;
  m.aggro=true;
  if(m.hp<=0){die(m,info);return;}
  if(!m.boss&&info.kind!=='swarm'){ dropToken(m); if(m.state!=='board')setState(m,'hurt'); }
  if(m.boss&&m.state==='staggered')G.ui.shake&&G.ui.shake(.15);
}
function die(m,info){
  if(m.raid)knockOff(m,info);
  m.dying=true; m.hp=0; dropToken(m); m.st=0; m.state='dying';
  m.center.set(m.pos.x,m.pos.y+P[m.kind].height*.55,m.pos.z);
  ash(m.center,m.boss?60:14,m.boss?4:1.2); splash(m.center,(info&&info.dir)||V(0,0,1),m.boss?2:1.2);
  if(!m.boss&&rnd()<.35){try{G.pickups.spawn('heart',m.pos.clone().setY(m.pos.y+.3));}catch(e){}}
  G.emit('monster:killed',{kind:m.kind,pos:m.pos.clone(),boss:m.boss});
  if(m.boss){
    G.ui.shake&&G.ui.shake(.8);
    for(const o of list) if(o!==m&&o.finale&&o.alive&&!o.dying)die(o,{});
  }
}
function remove(m){
  if(m.kind==='vigilant')vigilantGone(m);
  m.alive=false; G.combat.remove(m.hb); G.scene.remove(m.parts.root); dropToken(m); removeFx(m);
  m.parts.root.traverse(o=>{if(o.isMesh){o.geometry.dispose(); if(o.material.dispose)o.material.dispose();}});
  const i=list.indexOf(m); if(i>=0)list.splice(i,1);
  if(m===boss){ boss=null; G.ui.bossBar(null); G.emit('boss:dead',{who:m.kind}); }
}

/* quietly remove a monster without a kill (no ichor, no event); sink=true leaves a small splash */
function despawn(m,sink){
  if(!m||!m.alive)return;
  if(sink){ const I=INK(); I&&I.burst(V(m.pos.x,m.pos.y+.2,m.pos.z),{n:10,speed:1.4,size:[.3,.8],life:[.5,1.1],up:.8,embers:2,drops:5}); }
  remove(m);
}
/* movement helpers */
function faceTo(m,x,z,rate,dt){const want=Math.atan2(x-m.pos.x,z-m.pos.z);m.heading+=U.angDiff(want,m.heading)*Math.min(1,rate*dt);return want;}
function stepMove(m,dx,dz){
  const r=P[m.kind].radius;
  const nx=m.pos.x+dx, nz=m.pos.z+dz;
  if(!outsideTower(nx,nz,m.pos.y,r))return false;
  if(G.world.walkable&&!G.world.walkable(nx,nz))return false;
  const res=G.moveCharacter(m.pos,dx,dz,r,'monster');
  if(!outsideTower(m.pos.x,m.pos.z,m.pos.y,r)){m.pos.x-=dx;m.pos.z-=dz;return false;}
  return !res.blocked;
}
function moveDir(m,ang,speed,dt){ if(speed<=0||!(dt>0))return true; return stepMove(m,Math.sin(ang)*speed*dt,Math.cos(ang)*speed*dt); }
function settle(m,dt){
  const f=G.floorAt(m.pos.x,m.pos.z,m.pos.y+.7);
  if(m.pos.y>f+.02){m.vy-=22*dt;m.pos.y+=m.vy*dt;if(m.pos.y<f){m.pos.y=f;m.vy=0;}}
  else{m.pos.y=f;m.vy=0;}
}
function separation(m,dt){
  const r=P[m.kind].radius;
  for(const o of list){ if(o===m||!o.alive||o.dying)continue;
    const dx=m.pos.x-o.pos.x, dz=m.pos.z-o.pos.z, d=Math.hypot(dx,dz), min=r+P[o.kind].radius+.5;
    if(d<min&&d>1e-4){const push=(min-d)*(o.boss?3:1.6)*dt*(m.boss?.1:1); stepMove(m,dx/d*push,dz/d*push);} }
}
function applyKnock(m,dt){
  if(m.kv.lengthSq()<1e-4)return;
  stepMove(m,m.kv.x*dt,m.kv.z*dt); m.kv.multiplyScalar(Math.exp(-dt*7));
}
function wander(m,dt,p){
  if(!m.wt||U.dist2(m.pos,m.wt)<.8){
    if(m.pause>0){m.pause-=dt;m.speedNow=0;return;}
    let x,z,k=0; do{const a=rnd()*TAU,r=2+rnd()*Math.min(10,m.zone.r*.4);x=m.home.x+Math.cos(a)*r;z=m.home.z+Math.sin(a)*r;k++;}while(!okGround(x,z)&&k<10);
    m.wt=V(x,0,z); m.pause=1.5+rnd()*3.5; return;
  }
  faceTo(m,m.wt.x,m.wt.z,3,dt);
  if(!moveDir(m,m.heading,p.wander,dt)){m.wt=null;}
  m.speedNow=p.wander;
}
function playerFar(m){
  const pp=playerPos(); if(!pp||!playerAlive())return true;
  const dz=Math.hypot(pp.x-m.zone.x,pp.z-m.zone.z);
  return dz>m.zone.r+LEASH||Math.abs(pp.y-m.pos.y)>12;
}
function strikeAt(m,x,y,z,radius,damage,knock,kind){
  return G.combat.strike({x,y,z,radius,team:'enemy',damage,knockback:knock,kind,source:m.hb,exclude:m.hitSet});
}
function lanternNear(m,r){
  const L=G.items&&G.items.lantern; if(!L||!L.found||!L.lit||!L.lit()||L.inCradle)return false;
  const w=L.world&&L.world.lengthSq()>0?L.world:L.pos; return Math.hypot(w.x-m.pos.x,w.z-m.pos.z)<r;
}
function goHome(m,dt,speed){
  const want=faceTo(m,m.home.x,m.home.z,5,dt);
  const ok=moveDir(m,want,speed,dt); m.speedNow=speed;
  if(U.dist2(m.pos,m.home)<1.2||!ok&&m.st>8){ m.hp=m.maxHp; setState(m,'idle'); m.aggro=false; m.fled=false; }
}

/* ---- Hollow ---- */
function updateHollow(m,dt){
  const p=P.hollow, pp=playerPos(), dP=pp?U.dist2(m.pos,pp):1e9;
  let slow=lanternNear(m,p.lightR)?p.lightSlow:1;
  m.flare=U.damp(m.flare,0,4,dt);
  switch(m.state){
    case 'idle':
      wander(m,dt,p);
      if(!playerFar(m)&&dP<p.aggro)setState(m,'chase');
      break;
    case 'chase':{
      if(playerFar(m)||U.dist2(m.pos,m.home)>m.zone.r+LEASH+5){setState(m,'return');break;}
      m.cool-=dt;
      faceTo(m,pp.x,pp.z,4,dt);
      const toP=Math.atan2(pp.x-m.pos.x,pp.z-m.pos.z);
      const ready=m.cool<=0&&dP<9&&takeToken(m);   // holding the attack token = allowed to close in
      if(ready&&dP<p.clawRange){m.atk='claw';setState(m,'windup');break;}
      if(ready&&dP>p.lungeMin&&dP<p.lungeMax&&rnd()<dt*.7){m.atk='lunge';setState(m,'windup');break;}
      if(tokens.has(m)||dP>7){ moveDir(m,toP,p.speed*slow,dt); m.speedNow=p.speed*slow; }
      else{ // wait our turn: hover at a respectful distance, drifting sideways
        const ring=4.6, side=toP+PI/2*m.orbit; let a=side, s=p.speed*.35*slow;
        if(dP<ring-.6){a=toP+PI;s=p.speed*.6*slow;} else if(dP>ring+.8){a=toP;s=p.speed*.7*slow;}
        if(!moveDir(m,a,s,dt))m.orbit*=-1; m.speedNow=s; }
      if(dP<1.1){moveDir(m,toP+PI,1.5,dt);}
      break;}
    case 'windup':{
      const W=m.atk==='claw'?p.clawWind:p.lungeWind;
      if(pp)faceTo(m,pp.x,pp.z,m.st<W*.7?6:1.5,dt);
      m.flare=Math.min(1,m.st/W*1.3); m.speedNow=0;
      if(m.atk==='lunge'&&pp)m.dashDir.set(Math.sin(m.heading),0,Math.cos(m.heading));
      if(m.st>=W/slow*(slow<1?.85:1)){m.hitSet.clear();m.travel=0;setState(m,'attack');}
      break;}
    case 'attack':{
      m.flare=1;
      const fx=Math.sin(m.heading), fz=Math.cos(m.heading);
      if(m.atk==='claw'){
        if(m.st<.18){ strikeAt(m,m.pos.x+fx*1.25,m.pos.y+1.3,m.pos.z+fz*1.25,1.15,p.clawDmg,6,'melee'); moveDir(m,m.heading,2.5,dt); }
        if(m.st>.3)setState(m,'recover');
      }else{
        const v=p.lungeDist/.26;
        if(m.travel<p.lungeDist){ moveDir(m,m.heading,v,dt); m.travel+=v*dt;
          strikeAt(m,m.pos.x+fx*.9,m.pos.y+1.2,m.pos.z+fz*.9,1.0,p.lungeDmg,7,'melee'); }
        if(m.st>.35)setState(m,'recover');
      }
      break;}
    case 'recover':
      m.speedNow=0;
      if(m.st>p.recover){dropToken(m);m.cool=1.1+rnd()*1.2;setState(m,'chase');}
      break;
    case 'hurt':
      m.speedNow=0;
      if(m.st>p.hurt){m.cool=Math.max(m.cool,.5);setState(m,'chase');}
      break;
    case 'return':
      goHome(m,dt,p.speed*1.2);
      if(!playerFar(m)&&dP<p.aggro*.6)setState(m,'chase');
      break;
  }
  if(m.state!=='attack')separation(m,dt);
}
/* ---- Shade Hound ---- */
function updateHound(m,dt){
  const p=P.hound, pp=playerPos(), dP=pp?U.dist2(m.pos,pp):1e9;
  m.flare=U.damp(m.flare,0,5,dt);
  switch(m.state){
    case 'idle':
      wander(m,dt,p);
      if(!playerFar(m)&&dP<p.aggro)setState(m,'chase');
      break;
    case 'chase':{
      if(playerFar(m)||U.dist2(m.pos,m.home)>m.zone.r+LEASH+5){setState(m,'return');break;}
      if(m.hp<=1&&!m.fled){m.fled=true;setState(m,'flee');break;}
      m.cool-=dt;
      const toP=Math.atan2(pp.x-m.pos.x,pp.z-m.pos.z);
      if(dP>11){ faceTo(m,pp.x,pp.z,7,dt); moveDir(m,m.heading,p.speed,dt); m.speedNow=p.speed; }
      else{
        m.orbitA+=m.orbit*dt*.9;
        const tx=pp.x+Math.sin(m.orbitA)*p.circleR, tz=pp.z+Math.cos(m.orbitA)*p.circleR;
        const d=Math.hypot(tx-m.pos.x,tz-m.pos.z);
        if(d>.4){ faceTo(m,tx,tz,8,dt); const s=Math.min(p.speed,d*3+1.5); if(!moveDir(m,m.heading,s,dt))m.orbit*=-1; m.speedNow=s; }
        else { faceTo(m,pp.x,pp.z,8,dt); m.speedNow=0; }
        if(m.cool<=0&&dP<8&&takeToken(m)){setState(m,'windup');}
      }
      void toP;
      break;}
    case 'windup':
      if(pp)faceTo(m,pp.x,pp.z,10,dt);
      m.flare=Math.min(1,m.st/p.dashWind*1.3); m.speedNow=0;
      if(m.st>=p.dashWind){ m.dashDir.set(Math.sin(m.heading),0,Math.cos(m.heading)); m.hitSet.clear(); m.didHit=false; setState(m,'attack'); }
      break;
    case 'attack':{
      m.flare=1;
      const ok=moveDir(m,Math.atan2(m.dashDir.x,m.dashDir.z),p.dashSpeed,dt); m.speedNow=p.dashSpeed;
      const hits=strikeAt(m,m.pos.x+m.dashDir.x*.6,m.pos.y+.7,m.pos.z+m.dashDir.z*.6,.75,p.biteDmg,4,'bite');
      if(hits.length)m.didHit=true;
      if(m.didHit||!ok||m.st>p.dashMax)setState(m,'recover');
      break;}
    case 'recover':
      if(pp){ const away=Math.atan2(m.pos.x-pp.x,m.pos.z-pp.z); moveDir(m,away,5,dt); faceTo(m,pp.x,pp.z,6,dt); }
      m.speedNow=3;
      if(m.st>p.recover){dropToken(m);m.cool=1.4+rnd()*1.4;m.orbit=rnd()<.5?1:-1;if(pp)m.orbitA=Math.atan2(m.pos.x-pp.x,m.pos.z-pp.z);setState(m,'chase');}
      break;
    case 'hurt':
      m.speedNow=0;
      if(m.st>p.hurt){m.cool=Math.max(m.cool,.6);setState(m,m.hp<=1&&!m.fled?'flee':'chase');if(m.state==='flee')m.fled=true;}
      break;
    case 'flee':
      if(pp){ const away=Math.atan2(m.pos.x-pp.x,m.pos.z-pp.z); m.heading+=U.angDiff(away,m.heading)*Math.min(1,dt*6); if(!moveDir(m,m.heading,p.speed*.9,dt))m.heading+=1.2; m.speedNow=p.speed*.9; }
      if(m.st>4){ m.hp=Math.min(m.maxHp,m.hp+1); setState(m,'chase'); }
      break;
    case 'return':
      goHome(m,dt,p.speed*.8);
      if(!playerFar(m)&&dP<p.aggro*.6)setState(m,'chase');
      break;
  }
  if(m.state!=='attack')separation(m,dt);
}
/* ---- Brineling ----
   Hunts moths first: the nearest swarm moth within mothR, eaten at eatRate within eatR. It boards
   the raft (G.cavePuzzles.raft) to get at the moths riding it. It only fights the player when hit
   (angry for angryT s) or crowded (the player stays on top of it while it hunts). */
const MOTH_SKIP={gone:1,patch:1,wander:1,glass:1,lamp:1,spot:1,roost:1,jar:1,snatch:1};
function mothsAll(){const c=G.creatures; return (c&&c.moths)||[];}
function swarmMoth(mo){return !!mo&&!MOTH_SKIP[mo.tgt]&&!mo.hidden&&!mo.undertow;}
function nearestMoth(pos,R,dyMax){
  let best=null, bd=R*R;
  for(const mo of mothsAll()){ if(!swarmMoth(mo))continue; const dy=mo.p.y-pos.y; if(dy<-1.5||dy>(dyMax||6))continue;
    const dx=mo.p.x-pos.x, dz=mo.p.z-pos.z, d=dx*dx+dz*dz; if(d<bd){bd=d;best=mo;} }
  return best;
}
/* eat one moth. Prefers the moth system's own API (so the swarm count/HUD stay right); falls back to the moth record. */
function eatMoth(mo,m){
  if(G.moths&&typeof G.moths.eat==='function'){ try{G.moths.eat(mo,{by:m.kind,pos:m.pos.clone()});return;}catch(e){console.error(e);} }
  if(G.moths&&typeof G.moths.kill==='function'){ try{G.moths.kill(mo,true);return;}catch(e){console.error(e);} }
  mo.tgt='gone'; mo.feedB=null; mo.prey=null; mo.next=null; mo.delay=0; mo._rel=0;
  const I=INK(); I&&I.burst(mo.p,{n:5,speed:1.2,size:[.12,.45],life:[.5,1.1],up:.5,alpha:.75,color:'#efe6cf',embers:1});
  G.emit('moths:lost',{n:1,pos:mo.p.clone(),by:m.kind});
}
function raftInfo(){
  const cp=G.cavePuzzles, r=cp&&cp.raft; if(!r||r.active===false||r.visible===false)return null;
  const pos=(r.pos&&r.pos.isVector3&&r.pos)||(r.position&&r.position.isVector3&&r.position)||(r.mesh&&r.mesh.position)||(r.group&&r.group.position)||(r.root&&r.root.position);
  if(!pos)return null;
  return {pos,deckY:r.deckY!=null?r.deckY:pos.y+(r.deck!=null?r.deck:.2),r:r.radius||1.4,raw:r};
}
function crabFace(m,mv,dt,rate){ // body side-on to the motion; picks whichever side needs the smaller turn
  const a1=mv+PI/2, a2=mv-PI/2;
  const want=Math.abs(U.angDiff(a1,m.heading))<Math.abs(U.angDiff(a2,m.heading))?a1:a2;
  m.heading+=U.angDiff(want,m.heading)*Math.min(1,rate*dt);
  m.lat=Math.sign(Math.sin(mv-m.heading))||0;
}
function crabMove(m,mv,speed,dt){
  crabFace(m,mv,dt,9);
  if(moveDir(m,mv,speed,dt)){m.speedNow=speed;return true;}
  for(const d of [.7,-.7,1.4,-1.4]){ if(moveDir(m,mv+d*m.orbit,speed*.8,dt)){m.speedNow=speed*.8;return true;} }
  m.orbit*=-1; m.speedNow=0; return false;
}
/* ---- raft raiders ----
   Every crab that goes for the raft takes the same readable path:
   grip  — 1.5 s in the water with its claws hooked over the edge, eyes brightening, the raft dipping toward it (the telegraph;
           cave_puzzles.js adds ripples and splashes). It can be hit off already.
   climb — it hauls itself up onto the deck (.5 s).
   raft  — glued to the deck at that edge, it snatches a moth every P.brineling.snatch s (moths.js snatch(): the moth flashes,
           is dragged into the water, the HUD count drops). It never leaves on its own while the lantern rides the raft.
   Any hit knocks it off: it tumbles over the side and splashes in (knockOff/updateKnock). Moths never hurt it. */
const RAIDER_EDGE=.98, RAIDER_DECK=.5;   // across the raft from its centre: in the water at the edge / on the deck
function raftAxes(R){ const raw=R.raw, d=raw&&raw.dir; const ax=d&&isFinite(d.x)?{x:d.x,z:d.z}:{x:1,z:0}; return {ax,pr:{x:-ax.z,z:ax.x}}; }
function raiderOff(R,side,along,k){ const {ax,pr}=raftAxes(R), r=k==null?RAIDER_EDGE:k; return {x:ax.x*along+pr.x*side*r,z:ax.z*along+pr.z*side*r}; }
function startGrip(m,R,side,along){
  if(side==null){ const {pr}=raftAxes(R); side=((m.pos.x-R.pos.x)*pr.x+(m.pos.z-R.pos.z)*pr.z)>=0?1:-1; }
  if(along==null)along=(rnd()-.5)*1.3;
  m.raid={side:side<0?-1:1,along,from:m.pos.clone(),snatchT:P.brineling.snatch0,snapT:0,took:0};
  m.onRaft=null; m.board=null; m.prey=null; m.flare=0; m.hb.mothPrey=false; m.hb.lockPriority=true; setState(m,'grip');   // lock-on goes to a raider first (the channel is too tight to aim the camera at it)
  const o=raiderOff(R,m.raid.side,along), wy=waterAt(R);
  G.emit('brineling:grip',{pos:V(R.pos.x+o.x,wy,R.pos.z+o.z),side:m.raid.side,lead:P.brineling.grip,monster:m});
}
function startBoard(m,R){ startGrip(m,R); }   // a crab that reaches the raft on its own climbs aboard the same way
function waterAt(R){ const w=G.cave&&G.cave.waterWorld?G.cave.waterWorld():NaN; return isFinite(w)?w:R.pos.y-.1; }
function updateRaider(m,dt,R){
  const p=P.brineling, rd=m.raid;
  m.noSettle=true; m.kv.set(0,0,0);
  // the run was called off (the lantern hooked back): nothing to eat, it lets go and drops back into the channel
  if(!R||!(R.raw&&R.raw.lantern)){
    if(!m.leaving){ m.leaving=true; m.vy=m.state==='grip'?0:2.2; const a=Math.atan2(rd.side*(R?raftAxes(R).pr.x:0),rd.side*(R?raftAxes(R).pr.z:1)); m.kv.set(Math.sin(a)*2.4,0,Math.cos(a)*2.4); setState(m,'leave'); }
    m.vy-=12*dt; m.pos.x+=m.kv.x*dt; m.pos.z+=m.kv.z*dt; m.pos.y+=m.vy*dt;
    if(m.pos.y<(R?waterAt(R):m.pos.y)-.5||m.st>3){ despawn(m,true); }
    return;
  }
  const wy=waterAt(R);
  switch(m.state){
    case 'grip':{
      const k=Math.min(1,m.st/p.grip), o=raiderOff(R,rd.side,rd.along), e=Math.min(1,m.st/.3);
      m.pos.set(U.lerp(rd.from.x,R.pos.x+o.x,e),U.lerp(rd.from.y,wy-.62+.32*k,e),U.lerp(rd.from.z,R.pos.z+o.z,e));
      faceTo(m,R.pos.x+raftAxes(R).ax.x*rd.along,R.pos.z+raftAxes(R).ax.z*rd.along,12,dt);
      m.flare=.25+.75*k; m.speedNow=0;
      if(m.st>=p.grip){ const d=raiderOff(R,rd.side,rd.along,RAIDER_DECK);
        m.board={from:m.pos.clone(),off:d,dur:p.climb}; setState(m,'board');
        const I=INK(); I&&I.burst(V(m.pos.x,wy+.1,m.pos.z),{n:10,speed:1.6,size:[.2,.6],life:[.4,.9],up:1.2,embers:2,drops:8});
        G.emit('brineling:board',{pos:m.pos.clone(),monster:m}); }
      break;}
    case 'board':{
      const b=m.board, k=Math.min(1,m.st/b.dur), tx=R.pos.x+b.off.x, tz=R.pos.z+b.off.z;
      m.pos.x=U.lerp(b.from.x,tx,k); m.pos.z=U.lerp(b.from.z,tz,k);
      m.pos.y=U.lerp(b.from.y,R.deckY,k)+Math.sin(k*PI)*.45; m.flare=1-k*.6; m.speedNow=0;
      faceTo(m,R.pos.x,R.pos.z,10,dt);
      if(k>=1){ m.onRaft=b.off; m.board=null; rd.snatchT=p.snatch0; setState(m,'raft');
        G.emit('brineling:aboard',{pos:m.pos.clone(),monster:m}); }
      break;}
    case 'raft':{
      m.pos.set(R.pos.x+m.onRaft.x,R.deckY,R.pos.z+m.onRaft.z); m.speedNow=0;
      const lp=R.raw.pos; faceTo(m,lp.x,lp.z,8,dt);
      rd.snapT=Math.max(0,rd.snapT-dt); m.flare=U.damp(m.flare,rd.snapT>0?.9:.35,6,dt);
      rd.snatchT-=dt;
      if(rd.snatchT<=0){
        const fx=Math.sin(m.heading), fz=Math.cos(m.heading), claw=V(m.pos.x+fx*.45,m.pos.y+.35,m.pos.z+fz*.45);
        const mo=nearestMoth(claw,p.reach,3);
        if(mo&&G.moths&&G.moths.snatch){ G.moths.snatch(mo,{by:'brineling',claw,water:wy,monster:m}); rd.took++; m.ate=(m.ate||0)+1; rd.snapT=.45; rd.snatchT=p.snatch*(.9+rnd()*.2); }
        else if(mo){ eatMoth(mo,m); rd.took++; rd.snapT=.45; rd.snatchT=p.snatch; }
        else rd.snatchT=.3;
      }
      break;}
    default: setState(m,'raft'); if(!m.onRaft)m.onRaft=raiderOff(R,rd.side,rd.along,RAIDER_DECK);
  }
}
/* any blow sends a raider over the side: it tumbles off the edge it came up and splashes into the channel */
function knockOff(m,info){
  const R=raftInfo(), rd=m.raid;
  m.hb.lockPriority=false;
  { const pl=G.player; if(pl&&pl.lockTarget===m.hb){ const nx=G.combat.nearestTarget(pl.pos,18,null,'enemy',true); pl.lockTarget=nx&&nx.lockPriority?nx:null; } }   // knocked off: the lock hops to the next raider, or lets go
  let ox=0, oz=1;
  if(R){ const {pr}=raftAxes(R); ox=pr.x*rd.side; oz=pr.z*rd.side; }
  const d=info&&info.dir; if(d&&isFinite(d.x)){ const dot=d.x*ox+d.z*oz; if(dot<-.2){ ox=-ox; oz=-oz; } }   // knocked away from the blow, off the near edge
  const sp=m.state==='grip'?1.2:3.2;
  m.knock={vx:ox*sp,vz:oz*sp,vy:m.state==='grip'?1.4:3.6,rx:0,rz:0,spin:(rnd()<.5?-1:1)*(7+rnd()*4),splashed:false,water:R?waterAt(R):m.pos.y-1};
  m.onRaft=null; m.board=null; m.noSettle=true;
  G.emit('brineling:knocked',{pos:m.pos.clone(),from:rd&&rd.took?'raft':'edge',state:m.state,took:rd?rd.took:0});
}
function updateKnock(m,dt){
  const k=m.knock; k.vy-=14*dt; m.pos.x+=k.vx*dt; m.pos.z+=k.vz*dt; m.pos.y+=k.vy*dt; k.vx*=1-dt*.6; k.vz*=1-dt*.6;
  k.rz+=k.spin*dt*(k.splashed?.2:1); k.rx+=k.spin*.4*dt*(k.splashed?.2:1);
  const w=G.cave&&G.cave.waterWorld?G.cave.waterWorld():k.water;
  if(!k.splashed&&m.pos.y<w){ k.splashed=true; k.vx*=.2; k.vz*=.2; k.vy=0;
    const I=INK(); I&&I.burst(V(m.pos.x,w+.05,m.pos.z),{n:24,speed:2.2,size:[.4,1.1],life:[.5,1.2],up:3,embers:0,drops:6,color:'#e8f3f5',alpha:.8});
    G.emit('brineling:splash',{pos:V(m.pos.x,w,m.pos.z)}); }
  if(k.splashed){ k.vy=-.45; m.pos.y=Math.max(m.pos.y,w-1.4); }   // it wallows at the surface a moment, then sinks as it comes apart
}
function crabWander(m,dt,p){
  if(!m.wt||U.dist2(m.pos,m.wt)<.6){
    if(m.pause>0){m.pause-=dt;m.speedNow=0;return;}
    let x,z,k=0; do{const a=rnd()*TAU,r=1.5+rnd()*Math.min(6,m.zone.r*.4);x=m.home.x+Math.cos(a)*r;z=m.home.z+Math.sin(a)*r;k++;}while(!okGround(x,z)&&k<10);
    m.wt=V(x,0,z); m.pause=1+rnd()*3; return;
  }
  if(!crabMove(m,Math.atan2(m.wt.x-m.pos.x,m.wt.z-m.pos.z),p.wander,dt))m.wt=null;
}
function updateBrineling(m,dt){
  const p=P.brineling, pp=playerPos(), dP=pp?U.dist2(m.pos,pp):1e9;
  const R=raftInfo();
  if(m.raid){ updateRaider(m,dt,R); return; }
  m.flare=U.damp(m.flare,0,5,dt);
  m.cool-=dt;
  if(m.onRaft&&!R)m.onRaft=null;
  m.scanT=(m.scanT||0)-dt;
  if(m.scanT<=0||(m.prey&&!swarmMoth(m.prey))){ m.scanT=.3; m.prey=nearestMoth(m.pos,m.onRaft?R.r+2.5:p.mothR,m.onRaft?3:6); }
  const angry=!m.onRaft&&G.time-(m.lastHit||-99)<p.angryT;
  const near=pp&&dP<1.8&&Math.abs(pp.y-m.pos.y)<1.5;
  m.crowd=near?(m.crowd||0)+dt:Math.max(0,(m.crowd||0)-dt*.5);
  const canPinch=()=>m.cool<=0&&pp&&playerAlive()&&dP<p.pinchRange&&Math.abs(pp.y-m.pos.y)<1.4&&takeToken(m);
  const prey=m.prey;
  switch(m.state){
    case 'idle':
      if(prey){setState(m,'hunt');break;}
      if(angry&&!playerFar(m)){setState(m,'chase');break;}
      if(pp&&dP<p.shyR&&Math.abs(pp.y-m.pos.y)<2){ crabMove(m,Math.atan2(m.pos.x-pp.x,m.pos.z-pp.z),p.scuttle,dt); m.wt=null; break; } // shy: skitters off sideways
      crabWander(m,dt,p);
      break;
    case 'hunt':{
      if(!prey){setState(m,angry?'chase':'idle');break;}
      if((angry||m.crowd>1.2)&&canPinch()){setState(m,'windup');break;}
      const dx=prey.p.x-m.pos.x, dz=prey.p.z-m.pos.z, d=Math.hypot(dx,dz);
      if(d<p.eatR*.85&&prey.p.y-m.pos.y<2.6){m.eatAcc=0;setState(m,'eat');break;}
      if(R&&R.raw.lantern&&!m.onRaft&&(R.raw.state==='loaded'||R.raw.state==='drifting')&&Math.hypot(prey.p.x-R.pos.x,prey.p.z-R.pos.z)<R.r+.9&&Math.hypot(m.pos.x-R.pos.x,m.pos.z-R.pos.z)<R.r+4.5){startBoard(m,R);break;}   // only while it's on its way: docked at the sluice, with the swarm feeding, no crab climbs aboard
      const mv=Math.atan2(dx,dz);
      if(m.onRaft){ const o=m.onRaft, s=p.speed*.5*dt; o.x+=Math.sin(mv)*s; o.z+=Math.cos(mv)*s; const l=Math.hypot(o.x,o.z), mx=R.r*.75; if(l>mx){o.x*=mx/l;o.z*=mx/l;} crabFace(m,mv,dt,9); m.speedNow=p.speed*.5; }
      else crabMove(m,mv,d>4?p.scuttle:p.speed,dt);
      if(playerFar(m)&&!m.onRaft&&U.dist2(m.pos,m.home)>m.zone.r+LEASH)setState(m,'return');
      break;}
    case 'eat':{
      m.speedNow=0;
      if(prey)faceTo(m,prey.p.x,prey.p.z,8,dt);
      if((angry||m.crowd>1.2)&&canPinch()){setState(m,'windup');break;}
      m.eatAcc=(m.eatAcc||0)+dt*p.eatRate*(m.onRaft?.5:1); // a rocking raft makes for slow, nervous eating: the run is a defence, not a coin toss
      while(m.eatAcc>=1){ m.eatAcc-=1; const mo=nearestMoth(m.pos,p.eatR,2.6); if(!mo){m.eatAcc=0;break;} eatMoth(mo,m); m.ate=(m.ate||0)+1; }
      if(!prey||Math.hypot(prey.p.x-m.pos.x,prey.p.z-m.pos.z)>p.eatR){ m.prey=nearestMoth(m.pos,p.eatR,2.6); if(!m.prey)setState(m,'hunt'); }
      break;}
    case 'chase':{
      if(!angry||m.onRaft){setState(m,prey?'hunt':'idle');break;}
      if(playerFar(m)||U.dist2(m.pos,m.home)>m.zone.r+LEASH){setState(m,'return');break;}
      if(canPinch()){setState(m,'windup');break;}
      const mv=Math.atan2(pp.x-m.pos.x,pp.z-m.pos.z);
      if(dP>2.2)crabMove(m,mv,p.scuttle,dt); else { faceTo(m,pp.x,pp.z,8,dt); m.speedNow=0; }
      break;}
    case 'windup':
      if(pp)faceTo(m,pp.x,pp.z,m.st<p.pinchWind*.7?9:2,dt);
      m.flare=Math.min(1,m.st/p.pinchWind*1.2); m.speedNow=0;
      if(m.st>=p.pinchWind){m.hitSet.clear();setState(m,'attack');}
      break;
    case 'attack':{
      m.flare=1; const fx=Math.sin(m.heading), fz=Math.cos(m.heading);
      if(m.st<.16){ if(!m.onRaft)moveDir(m,m.heading,3,dt); strikeAt(m,m.pos.x+fx*.7,m.pos.y+.35,m.pos.z+fz*.7,.6,p.pinchDmg,4,'melee'); }
      if(m.st>.26)setState(m,'recover');
      break;}
    case 'recover':
      m.speedNow=0;
      if(m.st>p.recover){dropToken(m);m.cool=1.2+rnd()*1.2;m.crowd=0;setState(m,prey?'hunt':angry?'chase':'idle');}
      break;
    case 'hurt':
      m.speedNow=0;
      if(m.st>p.hurt){m.cool=Math.max(m.cool,.5);setState(m,m.onRaft?'hunt':'chase');}
      break;
    case 'return':
      goHome(m,dt,p.scuttle); crabFace(m,m.heading,dt,6);
      if(prey&&!playerFar(m))setState(m,'hunt');
      break;
    case 'board':{
      const b=m.board; if(!b||!R){m.board=null;setState(m,'idle');break;}
      const k=Math.min(1,m.st/b.dur), tx=R.pos.x+b.off.x, tz=R.pos.z+b.off.z;
      m.pos.x=U.lerp(b.from.x,tx,k); m.pos.z=U.lerp(b.from.z,tz,k);
      m.pos.y=U.lerp(b.from.y,R.deckY,k)+Math.sin(k*PI)*Math.max(.8,(R.deckY-b.from.y)*.5+.8);
      faceTo(m,tx,tz,10,dt); m.speedNow=0;
      if(k>=1){ m.onRaft=b.off; m.board=null; m.prey=null; m.scanT=0; setState(m,'hunt');
        const I=INK(); I&&I.burst(V(m.pos.x,m.pos.y+.1,m.pos.z),{n:6,speed:1,size:[.2,.5],life:[.3,.7],up:.4,embers:0,drops:5}); }
      break;}
  }
  // (raft riders are raiders now: updateRaider. A crab never leaves the raft on its own.)
  m.noSettle=!!m.onRaft||m.state==='board';
  if(m.state!=='attack'&&!m.noSettle)separation(m,dt);
}


/* ---- Nameless ----
   Shuffles toward the player; inside grabRange (with an attack token) it rears back with both arms raised for a long,
   readable wind-up, then lunges a short way with both hands (2 half-hearts). A lit lantern slows it a little. With
   opts.eatsMoths (m.mothHunter) it goes for the nearest swarm moth instead, unless the player is right on top of it. */
function updateNameless(m,dt){
  const p=P.nameless, pp=playerPos(), dP=pp?U.dist2(m.pos,pp):1e9;
  const slow=lanternNear(m,p.lightR)?p.lightSlow:1;
  m.flare=U.damp(m.flare,0,4,dt);
  if(m.mothHunter&&(m.state==='idle'||m.state==='chase'||m.state==='eat')&&!(dP<2.2&&m.angryT>G.time)){
    m.scanT=(m.scanT||0)-dt; if(m.scanT<=0||(m.prey&&!swarmMoth(m.prey))){ m.scanT=.4; m.prey=nearestMoth(m.pos,p.mothR,4); }
    const prey=m.prey;
    if(prey){
      const d=Math.hypot(prey.p.x-m.pos.x,prey.p.z-m.pos.z);
      if(d<p.eatR){ if(m.state!=='eat')setState(m,'eat'); m.speedNow=0; faceTo(m,prey.p.x,prey.p.z,6,dt);
        m.eatAcc=(m.eatAcc||0)+dt*p.eatRate; while(m.eatAcc>=1){ m.eatAcc-=1; const mo=nearestMoth(m.pos,p.eatR+.6,4); if(!mo)break; eatMoth(mo,m); m.ate=(m.ate||0)+1; } }
      else { if(m.state==='eat')setState(m,'chase'); faceTo(m,prey.p.x,prey.p.z,4,dt); moveDir(m,m.heading,p.speed*1.15*slow,dt); m.speedNow=p.speed*1.15*slow; }
      separation(m,dt); return;
    } else if(m.state==='eat')setState(m,'chase');
  }
  switch(m.state){
    case 'idle':
      wander(m,dt,p);
      if(!playerFar(m)&&dP<p.aggro)setState(m,'chase');
      break;
    case 'chase':{
      if(playerFar(m)||U.dist2(m.pos,m.home)>m.zone.r+LEASH+5){setState(m,'return');break;}
      m.cool-=dt;
      faceTo(m,pp.x,pp.z,3,dt);
      const toP=Math.atan2(pp.x-m.pos.x,pp.z-m.pos.z);
      if(m.cool<=0&&dP<p.grabRange&&Math.abs(pp.y-m.pos.y)<1.6&&takeToken(m)){ m.atk='grab'; setState(m,'windup'); G.emit('nameless:windup',{pos:m.pos.clone(),lead:p.grabWind,monster:m}); break; }
      if(dP>1.4){ moveDir(m,toP,p.speed*slow,dt); m.speedNow=p.speed*slow; } else m.speedNow=0;
      break;}
    case 'windup':
      if(pp)faceTo(m,pp.x,pp.z,m.st<p.grabWind*.6?5:1.2,dt);
      m.flare=Math.min(1,m.st/p.grabWind*1.2); m.speedNow=0;
      if(m.st>=p.grabWind/slow){ m.hitSet.clear(); m.travel=0; setState(m,'attack'); G.emit('nameless:grab',{pos:m.pos.clone(),monster:m}); }
      break;
    case 'attack':{
      m.flare=1; const fx=Math.sin(m.heading), fz=Math.cos(m.heading), v=p.grabDist/.3;
      if(m.travel<p.grabDist){ moveDir(m,m.heading,v,dt); m.travel+=v*dt;
        strikeAt(m,m.pos.x+fx*.85,m.pos.y+1.1,m.pos.z+fz*.85,.95,p.grabDmg,6,'melee'); }
      if(m.st>.42)setState(m,'recover');
      break;}
    case 'recover':
      m.speedNow=0;
      if(m.st>p.recover){ dropToken(m); m.cool=1.4+rnd()*1.4; setState(m,'chase'); }
      break;
    case 'hurt':
      m.speedNow=0; m.angryT=G.time+4;
      if(m.st>p.hurt){ m.cool=Math.max(m.cool,.6); setState(m,'chase'); }
      break;
    case 'return':
      goHome(m,dt,p.speed*1.1);
      if(!playerFar(m)&&dP<p.aggro*.6)setState(m,'chase');
      break;
    case 'eat': setState(m,'chase'); break;
  }
  if(m.state!=='attack')separation(m,dt);
}

/* ---- The Hollow Stag ---- */
/* its arena: the Resisting Tree clearing (the lantern lies in the roots). r 18: charges stay in the clearing, the trunk stops them */
function arenaOf(){
  const t=LM().resistingTree;
  return t&&isFinite(t.x)?{x:t.x,z:t.z,y:isFinite(t.y)?t.y:H(t.x,t.z),r:18,name:'stag'}:{x:-165,z:5,y:H(-165,5),r:18,name:'stag'};
}
const GUARD_IN=2, GUARD_OUT=12; // engages inside r+2 (with the staff in hand), goes back to guarding beyond r+12
function inArena(x,z,pad){const a=m_arena||arenaOf();return Math.hypot(x-a.x,z-a.z)<a.r-pad;}
let m_arena=null;
function updateStag(m,dt){
  const p=P.stag, pp=playerPos(), dP=pp?U.dist2(m.pos,pp):1e9, pa=playerAlive();
  m.flare=U.damp(m.flare,0,3,dt);
  if(m.state!=='intro'&&m.state!=='dying')G.ui.bossBar('The Hollow Stag',Math.max(0,m.hp/m.maxHp));
  const A=m_arena||arenaOf(), dC=pp?Math.hypot(pp.x-A.x,pp.z-A.z):1e9, armed=!!(G.items&&G.items.staff&&G.items.staff.owned);
  switch(m.state){
    case 'intro':
      m.fade=Math.min(1,m.st/2.2); m.mat.uniforms.uFade.value=m.fade; m.flare=1-m.fade*.5;
      if(m.st>2.6){m.fade=1;setState(m,'guard');m.cool=1;}
      break;
    case 'guard':{ // stands over the lantern; walks back to it if it was drawn off
      G.ui.bossBar(null);
      const dh=Math.hypot(m.home.x-m.pos.x,m.home.z-m.pos.z);
      if(dh>1.2){ faceTo(m,m.home.x,m.home.z,3,dt); if(!moveDir(m,m.heading,p.speed,dt))m.heading+=.4; m.speedNow=p.speed; }
      else { m.speedNow=0; if(pp)faceTo(m,pp.x,pp.z,1.2,dt); }
      if(pp&&pa&&armed&&dC<A.r+GUARD_IN&&dh<6){ setState(m,'stalk'); m.cool=1.2; G.emit('stag:engage'); }
      break;}
    case 'stalk':{
      m.cool-=dt;
      if(!pp||!pa){m.speedNow=0;break;}
      if(dC>A.r+GUARD_OUT){ setState(m,'guard'); break; }
      faceTo(m,pp.x,pp.z,2.2,dt);
      if(dP>8){ if(!moveDir(m,m.heading,p.speed,dt))m.heading+=.4; m.speedNow=p.speed; } else m.speedNow=0;
      if(!m.summoned&&m.hp<=m.maxHp/2){m.summoned=true;setState(m,'summon');break;}
      if(m.cool<=0){
        const r=rnd();
        if(dP<6.5) m.atk=r<.6?'sweep':'stomp';
        else if(dP<11) m.atk=r<.5?'charge':'stomp';
        else m.atk='charge';
        setState(m,m.atk+'Wind');
      }
      break;}
    case 'chargeWind':
      if(pp)faceTo(m,pp.x,pp.z,m.st<.7?4:1,dt);
      m.flare=Math.min(1,m.st/p.chargeWind); m.speedNow=0;
      chargeLine(m,true);
      if(m.st>=p.chargeWind){ m.dashDir.set(Math.sin(m.heading),0,Math.cos(m.heading)); m.travel=0; m.didHit=false; m.hitSet.clear(); chargeLine(m,false); setState(m,'charge'); G.ui.shake&&G.ui.shake(.25); }
      break;
    case 'charge':{
      m.flare=1;
      const step=p.chargeSpeed*dt; m.travel+=step;
      const nx=m.pos.x+m.dashDir.x*step, nz=m.pos.z+m.dashDir.z*step;
      let stop=m.travel>p.chargeLen||!inArena(nx,nz,2)||!outsideTower(nx,nz,m.pos.y,p.radius);
      if(!stop)stop=!stepMove(m,m.dashDir.x*step,m.dashDir.z*step);
      m.speedNow=p.chargeSpeed;
      const hits=strikeAt(m,m.pos.x+m.dashDir.x*2.2,m.pos.y+1.4,m.pos.z+m.dashDir.z*2.2,1.9,p.chargeDmg,14,'charge');
      if(hits.length)m.didHit=true;
      if(stop||(m.didHit&&m.travel>p.chargeLen*.6)){
        if(!outsideTower(nx,nz,m.pos.y,p.radius)||!inArena(nx,nz,2))G.ui.shake&&G.ui.shake(.5);
        setState(m,m.didHit?'recover':'staggered'); }
      break;}
    case 'staggered':
      m.speedNow=0; m.flare=0;
      if(m.st>p.stagger){m.cool=.8;setState(m,'stalk');}
      break;
    case 'sweepWind':
      if(pp)faceTo(m,pp.x,pp.z,3,dt);
      m.flare=Math.min(1,m.st/p.sweepWind); m.speedNow=0;
      if(m.st>=p.sweepWind){m.hitSet.clear();setState(m,'sweep');}
      break;
    case 'sweep':{
      m.flare=1;
      const a=m.heading+(-1+m.st/.35*2)*1.1; const fx=Math.sin(a), fz=Math.cos(a);
      strikeAt(m,m.pos.x+fx*3.6,m.pos.y+1.2,m.pos.z+fz*3.6,2.0,p.sweepDmg,10,'melee');
      if(m.st>.35)setState(m,'recover');
      break;}
    case 'stompWind':
      if(pp)faceTo(m,pp.x,pp.z,2,dt);
      m.flare=Math.min(1,m.st/p.stompWind); m.speedNow=0;
      if(m.st>=p.stompWind){setState(m,'stomp');
        const fx=Math.sin(m.heading),fz=Math.cos(m.heading);
        spawnRing(m.pos.x+fx*2.6,m.pos.y,m.pos.z+fz*2.6,m); G.ui.shake&&G.ui.shake(.6); }
      break;
    case 'stomp':
      if(m.st>.6)setState(m,'recover');
      break;
    case 'summon':
      m.flare=1; m.speedNow=0;
      if(m.st>.9&&!m.summonDone){ m.summonDone=true;
        for(let k=0;k<3;k++){const a=m.heading+PI+(k-1)*.9, r=5;
          let x=m.pos.x+Math.sin(a)*r, z=m.pos.z+Math.cos(a)*r;
          if(!okGround(x,z)||!inArena(x,z,3)){x=m_arena.x+(rnd()-.5)*10;z=m_arena.z+(rnd()-.5)*10;}
          const h=spawn('hound',{x,z},{zone:m_arena,aggro:true,intro:true,finale:true}); h.state='intro';
          INK()&&INK().burst(V(x,h.pos.y+.2,z),{n:26,speed:1.6,size:[.6,1.8],life:[.8,1.6],up:1.6,embers:10,drops:6});} }
      if(m.st<.9&&m.fxK>0&&rnd()<dt*20){ // ink wells up where they will rise
        for(let k=0;k<3;k++){const a=m.heading+PI+(k-1)*.9; const x=m.pos.x+Math.sin(a)*5, z=m.pos.z+Math.cos(a)*5, y=G.floorAt(x,z,m.pos.y+1);
          if(!m.wells){} puff(x+(rnd()-.5)*.8,y+.1,z+(rnd()-.5)*.8,0,1.2+rnd(),0,.9,.4,1.3,.7,cInk,0,1);}
        if(!m.wells){ m.wells=1; for(let k=0;k<3;k++){const a=m.heading+PI+(k-1)*.9; const x=m.pos.x+Math.sin(a)*5, z=m.pos.z+Math.cos(a)*5; puddle(x,G.floorAt(x,z,m.pos.y+1),z,1.4,2.6,.9);} } }
      if(m.st>1.8){m.cool=1;setState(m,'stalk');}
      break;
    case 'recover':
      m.speedNow=0;
      if(m.st>.9){m.cool=.9+rnd()*1.2;setState(m,'stalk');}
      break;
  }
}
const chargeLines=new Map();
function chargeLine(m,on){
  let l=chargeLines.get(m);
  if(!l){ const g=new THREE.PlaneGeometry(2.6,1,1,1); g.rotateX(-PI/2); g.translate(0,0,.5);
    l=new THREE.Mesh(g,new THREE.MeshBasicMaterial({map:G.tex.soft,color:U.col('#9a6cff').multiplyScalar(1.6),transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false}));
    l.renderOrder=2; G.scene.add(l); chargeLines.set(m,l); }
  l.visible=on; if(!on)return;
  l.position.set(m.pos.x,m.pos.y+.15,m.pos.z); l.rotation.y=m.heading; l.scale.set(1,1,P.stag.chargeLen*Math.min(1,m.st*1.6));
  l.material.opacity=.25+.35*Math.abs(Math.sin(G.time*10));
}
function spawnRing(x,y,z,m){
  const mesh=ringMesh(); mesh.position.set(x,y+.06,z); G.scene.add(mesh);
  ringFx.push({x,y,z,r:.5,mesh,hit:false,m});
  INK()&&INK().burst(V(x,y+.3,z),{n:40,speed:4,size:[.6,2],life:[.6,1.3],up:.8,embers:20,drops:16});
  puddle(x,y,z,2.2,3,.9);
}
function updateRings(dt){
  const pp=playerPos();
  for(let i=ringFx.length-1;i>=0;i--){
    const R=ringFx[i]; R.r+=P.stag.ringSpeed*dt;
    const fade=1-U.smooth(P.stag.ringMax*.6,P.stag.ringMax,R.r);
    if(R.mesh.material.uniforms){R.mesh.material.uniforms.uR.value=R.r; R.mesh.material.uniforms.uA.value=fade;}
    // an ink wall rolls along the front
    const nP=Math.round(R.r*1.1*dt*30);
    for(let k=0;k<nP;k++){const a=rnd()*TAU, ca=Math.cos(a), sa=Math.sin(a), px=R.x+ca*R.r, pz=R.z+sa*R.r;
      puff(px,G.floorAt(px,pz,R.y+1)+.15,pz,ca*3,1.2+rnd()*1.4,sa*3,.45+rnd()*.3,.5,1.4,.7*fade,cInk,0,2.5);
      if(rnd()<.25)ember(px,R.y+.3,pz,ca*2,1.5+rnd(),sa*2,.5,.2);}
    if(pp&&!R.hit&&playerAlive()){
      const d=Math.hypot(pp.x-R.x,pp.z-R.z), air=pp.y-G.floorAt(pp.x,pp.z,pp.y+.3);
      if(Math.abs(d-R.r)<.75&&air<.45&&Math.abs(pp.y-R.y)<2.5){
        const hits=G.combat.strike({x:pp.x,y:pp.y+.4,z:pp.z,radius:.35,team:'enemy',damage:P.stag.stompDmg,knockback:8,kind:'shockwave',source:R.m&&R.m.hb});
        if(hits.length)R.hit=true;
      }
    }
    if(R.r>P.stag.ringMax){G.scene.remove(R.mesh);R.mesh.geometry.dispose();ringFx.splice(i,1);}
  }
}
/* ---------------------------------------------------------------- per-frame */
function updateMonster(m,dt){
  m.st+=dt;
  if(m.dying){
    const dur=m.boss?3.2:1.3;
    // the form loses cohesion: it shudders, sheds smoke in sheets, dissolves, then bursts
    m.fade=Math.max(0,1-m.st/dur); m.mat.uniforms.uFade.value=m.fade; m.mat.uniforms.uFlash.value=Math.max(0,.5-m.st*2)*.4; m.mat.uniforms.uRim.value.copy(m.rimBase).multiplyScalar(.6+m.fade*.4);
    m.center.set(m.pos.x,m.pos.y+P[m.kind].height*(.3+rnd()*.5),m.pos.z);
    if(rnd()<dt*(m.boss?20:8))ash(m.center,m.boss?4:1,m.boss?3:.8);
    const loose=1-m.fade, H_=P[m.kind].height;
    for(let k=0;k<Math.round((m.boss?7:2.5)*(.3+loose)*dt*30);k++){const r=P[m.kind].radius*(1+rnd()), a=rnd()*TAU;
      puff(m.pos.x+Math.cos(a)*r,m.pos.y+rnd()*H_,m.pos.z+Math.sin(a)*r,Math.cos(a)*.6,.8+rnd()*1.2,Math.sin(a)*.6,1+rnd(),m.boss?1.2:.5,m.boss?3.2:1.4,.6,cInk,0,1);}
    if(m.fx){ fxIntensity(m,(1+loose)*m.fxK); if(m.fx.pool)m.fx.pool.intensity=m.fade; }
    if(m.knock)updateKnock(m,dt);
    if(m.parts.root){ const j=loose*(m.boss?.06:.04); m.parts.root.position.set(m.pos.x+(rnd()-.5)*j,m.pos.y-(m.boss||m.knock?0:loose*.3),m.pos.z+(rnd()-.5)*j);
      if(m.knock){ m.parts.root.rotation.set(m.knock.rx,m.heading,m.knock.rz); }
      if(!m.boss){ m.parts.body.scale.set(1+loose*.35,1-loose*.25,1+loose*.35); } }
    if(m.boss){ G.ui.bossBar('The Hollow Stag',0); animStag(m,dt); }
    else if(m.kind==='hollow')animHollow(m,dt); else if(m.kind==='brineling')animBrineling(m,dt); else if(m.kind==='nameless')animNameless(m,dt); else if(m.kind==='vigilant')animVigilant(m,dt); else animHound(m,dt);
    if(m.parts.eyes)eyesFlare(m.parts,m.boss?.3:.1,loose,m.fade);
    if(m.parts.extra)m.parts.extra.forEach(x=>{x.transparent=true;x.opacity=m.fade;});
    if(m.st>dur){ const I=INK(); if(I){ m.center.set(m.pos.x,m.pos.y+P[m.kind].height*.45,m.pos.z);
        I.burst(m.center,{n:m.boss?150:40,speed:m.boss?6:3,size:m.boss?[1,3.5]:[.5,1.8],life:[.8,1.8],up:1.2,embers:m.boss?90:22,drops:m.boss?40:12});
        puddle(m.pos.x,m.pos.y,m.pos.z,m.boss?4.5:1.3,m.boss?6:3.5,.85); }
      remove(m); }
    return;
  }
  if(m.state==='intro'&&m.fxK>0&&rnd()<dt*25*(1-m.fade)){ const r=P[m.kind].radius*1.5; // ink wells up and gathers into a shape
    puff(m.pos.x+(rnd()-.5)*r*2,m.pos.y+.1,m.pos.z+(rnd()-.5)*r*2,0,1+rnd()*1.5,0,1+rnd()*.5,m.boss?1:.4,m.boss?2.8:1.2,.7,cInk,0,1); }
  if(m.state==='intro'&&!m.boss){ m.fade=Math.min(1,m.st/1.2); m.mat.uniforms.uFade.value=m.fade; if(m.st>1.2){m.fade=1;m.mat.uniforms.uFade.value=1;setState(m,'chase');} }
  else if(m.kind==='hollow')updateHollow(m,dt);
  else if(m.kind==='hound')updateHound(m,dt);
  else if(m.kind==='nameless')updateNameless(m,dt);
  else if(m.kind==='vigilant')updateVigilant(m,dt);
  else if(m.kind==='brineling'){ updateBrineling(m,dt); if(!m.alive)return; }
  else updateStag(m,dt);
  if(m.state!=='return'&&!m.boss&&m.st>0&&m.zone)leashHeal(m,dt);
  if(!m.noSettle){ applyKnock(m,dt); settle(m,dt); }
  m.flash=Math.max(0,m.flash-dt*5); m.mat.uniforms.uFlash.value=m.flash*.9;
  m.ground.value=m.pos.y;
  // rim flares bright on wind-ups (the main telegraph)
  const fl=m.state==='staggered'?.4:1+m.flare*(m.boss?1.8:2.0);
  m.mat.uniforms.uRim.value.copy(m.rimBase).multiplyScalar(fl);
}
function leashHeal(m,dt){ if(m.state==='idle'&&m.hp<m.maxHp&&G.time-(m.lastHit||-99)>6)m.hp=Math.min(m.maxHp,m.hp+dt*.5); }
function render(m,dt){
  const c=m.parts;
  c.root.position.copy(m.pos); c.root.rotation.y=m.heading;
  c.root.updateMatrixWorld(true);
  if(m.kind==='hollow')animHollow(m,dt); else if(m.kind==='hound')animHound(m,dt); else if(m.kind==='brineling')animBrineling(m,dt); else if(m.kind==='nameless')animNameless(m,dt); else if(m.kind==='vigilant')animVigilant(m,dt); else if(!m.dying)animStag(m,dt);
}

/* ---------------------------------------------------------------- spawning */
const DEFAULT_ZONES=[
  {name:'forest',x:-130,z:0,r:50,kinds:['hollow','hound'],count:7},
  {name:'hamlet',x:-20,z:30,r:22,kinds:['hollow'],count:3},
  {name:'moor',x:55,z:-10,r:30,kinds:['hound'],count:3}];
function spawnZones(){
  let zones=LM().monsterZones; if(!Array.isArray(zones)||!zones.length)zones=DEFAULT_ZONES;
  for(const z of zones){
    const kinds=(z.kinds&&z.kinds.length?z.kinds:['hollow']).filter(k=>k==='hollow'||k==='hound');
    if(!kinds.length)continue;
    const zone={name:z.name||'zone',x:z.x,z:z.z,r:z.r||25};
    const n=z.count||3;
    for(let i=0;i<n;i++){
      let x,zz,k=0; do{const a=rnd()*TAU,r=Math.sqrt(rnd())*zone.r*.75;x=zone.x+Math.cos(a)*r;zz=zone.z+Math.sin(a)*r;k++;}while(!okGround(x,zz)&&k<20);
      // hounds come in pairs
      const kind=kinds.length===1?kinds[0]:kinds[i%3===2?1:0];
      spawn(kind,{x,z:zz},{zone});
    }
  }
}
function startStag(){
  if(boss&&boss.alive&&!boss.dying)return boss;
  m_arena=arenaOf(); const A=m_arena;
  // the forest's own hunters clear out of the clearing: this is the Stag's ground
  for(const o of list.slice()) if(!o.boss&&!o.finale&&o.alive&&!o.dying&&Math.hypot(o.pos.x-A.x,o.pos.z-A.z)<A.r+10)despawn(o,true);
  // it rises on the far (west) side of the trunk, facing the way you came in
  let x=A.x-11, z=A.z-1; if(!okGround(x,z)){x=A.x-8; z=A.z+3;}
  boss=spawn('stag',{x,z},{zone:A,aggro:true,intro:true,finale:true,heading:PI/2});
  boss.state='intro'; boss.forest=true;
  ash(V(x,boss.pos.y+2,z),120,4);
  for(let k=0;k<3;k++){const a=(k-1)*1.4; let hx=A.x+Math.cos(a)*-13, hz=A.z+Math.sin(a)*13;
    if(!okGround(hx,hz)){hx=A.x-12+(k-1)*3;hz=A.z+(k-1)*7;}
    spawn('hollow',{x:hx,z:hz},{zone:A,aggro:true,intro:true,finale:true});}
  return boss;
}

/* =====================================================================
   VIGILANTS (Boss agent; spec TEMPLE.md) — the Vigil's acolytes: tall, hollow-eyed, in grey robes of fog, under a skin of ink.
   · They hunt by light: an open lantern within `aggro` m, or a focused Lens beam within `hear` m (they turn to it), brings
     them; with the shutter shut they lose you after `lose` s (they walk to where they last saw the light, look, and go
     back to their vigil). Right up close (`touch` m) they find you even in the dark.
   · The ink skin: staff blows, bolts and the swarm glance off it until the Lens beam burns it away (~`burn` s of beam;
     each skin is a G.lens burnable). Then they're ordinary (hp 5). Without lens.js loaded at all they spawn without a skin.
   · One attack: both sleeves rise and spread (a long, readable wind-up, the rim flares), then a two-handed downward sweep
     a short step forward (2 half-hearts).
   Placed by temple_boss.js: G.monsters.spawn('vigilant', pos, {zone, temple:room, skin}). Events: vigilant:notice {monster},
   vigilant:lost {monster}, vigilant:glance {monster, kind}, vigilant:burn {monster}.
   ===================================================================== */
P.vigilant={hp:5,radius:.45,height:2.4,aggro:16,hear:25,touch:2.4,lose:3.2,speed:2.7,wander:.55,strikeRange:2.3,strikeWind:.85,
  strikeDmg:2,strikeDist:1.4,recover:.95,hurt:.4,burn:1.2,searchT:2.6};
function lensOn(){ const L=G.lens; return !!(L&&L.focused); }
function lanternOpenCarried(){ const L=G.items&&G.items.lantern; return !!(L&&L.found&&L.carried&&L.lit&&L.lit()); }
function vigilantSenses(m,pp,dP){
  const p=P.vigilant;
  if(!pp||!playerAlive())return 0;
  if(Math.abs(pp.y-m.pos.y)>6)return 0;
  if(lensOn()&&dP<p.hear)return 2;                         // it hears the beam
  if(lanternOpenCarried()&&dP<p.aggro)return 1;           // it sees your light
  if(dP<p.touch)return 1;                                  // or bumps into you in the dark
  const L=G.items&&G.items.lantern;                        // a lantern left open on the floor draws it, not you
  if(L&&L.found&&!L.carried&&!L.inCradle&&L.lit&&L.lit()&&U.dist2(m.pos,L.pos)<p.aggro*.7)return 3;
  return 0;
}
function buildVigilant(S,skinS){
  const robeMat=inkMat(S,{amp:.035,wisp:.55,flow:.22,scale:1.7,mist:.7,rimK:.75,side:THREE.DoubleSide});
  const bodyMat=inkMat(S,{amp:.02,wisp:.5,flow:.25,scale:2.2,rimK:.6});
  const skinMat=inkMat(skinS,{amp:.05,wisp:.35,flow:.5,scale:2.4,rimK:1.1,side:THREE.DoubleSide});
  const handMat=inkMat(S,{amp:.006,wisp:.25,flow:.3,scale:3,rimK:1});
  const hollow=new THREE.MeshBasicMaterial({color:0x050308,transparent:true});
  const root=new THREE.Group(), body=new THREE.Group(); root.add(body);
  // the robe: tall, narrow, pooling at the floor into fog
  const robePts=[[.16,1.62],[.22,1.45],[.28,1.1],[.34,.7],[.42,.3],[.5,.04],[.46,0]];
  addMesh(body,new THREE.LatheGeometry(robePts.map(([r,y])=>new THREE.Vector2(r,y)),18),robeMat).frustumCulled=false;
  const upper=new THREE.Group(); upper.position.y=1.45; body.add(upper);
  addMesh(upper,sweep([[0,-.1,0,.2,.15],[0,.18,.01,.22,.16],[0,.38,.02,.19,.14],[0,.5,.03,.1,.09]],10,3),bodyMat);
  // the hood: a deep cowl, its opening a dark oval with two hollow eyes in it
  const head=new THREE.Group(); head.position.set(0,.66,.04); upper.add(head);
  const hood=addMesh(head,new THREE.SphereGeometry(.2,16,12,0,TAU,0,PI*.72),robeMat); hood.scale.set(1,1.25,1.15); hood.rotation.x=-.25;
  const tip=addMesh(head,new THREE.ConeGeometry(.1,.26,10),robeMat,0,.2,-.13); tip.rotation.x=-.9;
  const face=addMesh(head,new THREE.CircleGeometry(.13,18),hollow,0,-.02,.185); face.scale.set(.85,1.15,1);
  const eyes=[];
  for(const s of [-1,1]){ const e=eyeSprite('#e8e2ff',.07,1.6,.18); e.position.set(s*.05,.0,.2); head.add(e); eyes.push(e); }
  // arms: long sleeves; pale ink hands that hold nothing (they used to hold candles)
  const arms=[], tips=[], skinArms=[];
  for(const s of [-1,1]){
    const sh=new THREE.Group(); sh.position.set(s*.22,.36,.03); upper.add(sh);
    const ug=sweep([[0,0,0,.08],[s*.02,-.3,.02,.1],[s*.03,-.55,.04,.13]],8,3); addMesh(sh,ug,robeMat);
    const el=new THREE.Group(); el.position.set(s*.03,-.55,.04); sh.add(el);
    const lg=sweep([[0,0,0,.12],[0,-.25,.03,.14],[0,-.42,.05,.16]],8,3); addMesh(el,lg,robeMat);
    const su=addMesh(sh,ug,skinMat); su.scale.setScalar(1.14); const sl=addMesh(el,lg,skinMat); sl.scale.setScalar(1.14); skinArms.push(su,sl);   // the ink on the sleeves
    const hand=new THREE.Group(); hand.position.set(0,-.44,.06); el.add(hand);
    const fg=[sweep([[0,.03,0,.045,.03],[0,-.05,.01,.05,.03]],8,2)];
    for(let k=0;k<4;k++){ const x=(k-1.5)*.024; fg.push(sweep([[x,-.04,0,.014],[x*1.4,-.17,.03,.01],[x*1.6,-.27,.06,.004]],5,3)); tips.push(anchor(hand,x*1.6,-.27,.06)); }
    addMesh(hand,mergeGeos(fg),handMat);
    arms.push({sh,el,hand,s});
  }
  // the ink skin: a ragged black shell over robe and hood (burned off by the Lens beam)
  const skin=new THREE.Group(); body.add(skin);
  const sk=addMesh(skin,new THREE.LatheGeometry(robePts.map(([r,y])=>new THREE.Vector2(r*1.09+.012,y)),18),skinMat); sk.frustumCulled=false;
  const sk2=addMesh(skin,new THREE.SphereGeometry(.23,14,10,0,TAU,0,PI*.62),skinMat,0,1.45+.66,.02); sk2.scale.set(1.05,1.3,1.15); sk2.rotation.x=-.25;
  const sk3=addMesh(skin,new THREE.CylinderGeometry(.24,.3,.55,14,1,true),skinMat,0,1.62,0);
  void sk3;
  const hem=[]; for(let k=0;k<7;k++){ const a=k/7*TAU; hem.push(anchor(body,Math.sin(a)*.45,.12,Math.cos(a)*.45)); }
  hem.push(anchor(upper,0,.4,.05));
  const skinPts=[anchor(body,0,1.2,.25),anchor(body,.2,.7,.2),anchor(body,-.2,.9,.15),anchor(upper,0,.7,.15)];
  return {root,body,upper,head,arms,eyes,hem,clawTips:tips,skin,skinArms,skinPts,skinMat,mats:[robeMat,bodyMat,skinMat,handMat],extra:[hollow],tendrils:[]};
}
function initVigilant(m,opts){
  const p=P.vigilant;
  m.hb.name='Vigilant'; m.hb.lockOffset=1.6;
  m.skin=opts.skin===false||!G.lens?0:1; m.skinK=m.skin; m.burnT=0; m.burnH=null; m.lostT=0; m.lastSeen=null; m.sense=0; m.hunting=false;
  m.temple=opts.temple||null; m.skinPos=V(m.pos.x,m.pos.y+1.3,m.pos.z);
  m.parts.skin.visible=!!m.skin; for(const a of m.parts.skinArms)a.visible=!!m.skin; m.skinS.uFade.value=m.skin?1:0;
  m.vigil=m.heading; void p;
}
function lensBurnAdd(m){
  const L=G.lens; if(!L||!m.skin||m.burnH)return;
  const o={id:'vigilant-'+m.id,kind:'vigilant',monster:m,hb:m.hb,pos:m.skinPos,radius:.95,needs:P.vigilant.burn,
    alive:()=>m.alive&&!m.dying&&m.skin>0,enabled:()=>m.alive&&!m.dying&&m.skin>0,onBurn:()=>burnSkin(m)};
  let h=null;
  try{ const b=L.burnable; if(b&&typeof b.add==='function')h=b.add(o)||o; else if(typeof b==='function')h=b(o)||o; }catch(e){ console.error('lens burnable',e); }
  m.burnH=h||'self';   // 'self': lens.js offers no burnable API; burnByBeam() below watches the beam
}
function lensBurnRemove(m){
  const h=m.burnH; m.burnH=null; if(!h||h==='self')return;
  try{ const b=G.lens&&G.lens.burnable; if(b&&typeof b.remove==='function')b.remove(h); else if(h.remove)h.remove(); }catch(e){}
}
const _bs=V(), _bp=V();
function beamTouches(pos,r){
  const L=G.lens; if(!L||!L.focused||!L.beam||!L.beam.origin||!L.beam.dir)return false;
  const o=L.beam.origin, d=L.beam.dir, len=L.beam.hit&&L.beam.hit.pos?Math.min(L.beam.length||14,o.distanceTo(L.beam.hit.pos)+r):(L.beam.length||14);
  _bs.subVectors(pos,o); const t=U.clamp(_bs.dot(d),0,len); _bp.copy(o).addScaledVector(d,t);
  return _bp.distanceTo(pos)<r;
}
function burnByBeam(m,dt){
  if(m.burnH!=='self'||!m.skin)return;
  if(beamTouches(m.skinPos,.95)){ m.burnT+=dt; if(m.burnT>=P.vigilant.burn)burnSkin(m); }
  else m.burnT=Math.max(0,m.burnT-dt*.5);
}
function burnSkin(m){
  if(!m.skin||!m.alive||m.dying)return;
  m.skin=0; lensBurnRemove(m); m.flash=1;
  const I=INK(); if(I){ m.center.set(m.pos.x,m.pos.y+1.4,m.pos.z); I.burst(m.center,{n:30,speed:2.4,size:[.4,1.2],life:[.6,1.3],up:1.8,embers:24,drops:6}); }
  for(let k=0;k<14;k++)ember(m.pos.x+(rnd()-.5)*.6,m.pos.y+.4+rnd()*1.8,m.pos.z+(rnd()-.5)*.6,(rnd()-.5)*1.5,1.5+rnd()*2,(rnd()-.5)*1.5,.8+rnd()*.6,.2);
  if(m.state==='idle'||m.state==='search'||m.state==='return'){ m.aggro=true; setState(m,'chase'); }
  G.emit('vigilant:burn',{monster:m,pos:m.pos.clone()});
}
/* staff, bolt and swarm all glance off the ink skin (no damage); true = the hit was turned */
function vigilantGlance(m,info){
  if(!m.skin)return false;
  m.flash=.35; m.lastGlance=G.time;
  const dir=info.dir||V(0,0,1); m.center.set(m.pos.x,m.pos.y+1.3,m.pos.z);
  if(info.kind!=='swarm'){ sparks(m.center,8,.6); m.kv.x+=dir.x*.8; m.kv.z+=dir.z*.8; }
  if(m.state==='idle'||m.state==='search'||m.state==='return'){ m.aggro=true; setState(m,'chase'); }
  G.emit('vigilant:glance',{monster:m,kind:info.kind});
  return true;
}
function updateVigilant(m,dt){
  const p=P.vigilant, pp=playerPos(), dP=pp?U.dist2(m.pos,pp):1e9;
  m.flare=U.damp(m.flare,0,4,dt);
  if(m.skin&&!m.burnH&&G.lens)lensBurnAdd(m);
  burnByBeam(m,dt);
  m.skinPos.set(m.pos.x,m.pos.y+1.3,m.pos.z);
  const s=vigilantSenses(m,pp,dP); m.sense=s;
  const sees=s===1||s===2;
  if(sees){ m.lastSeen=(m.lastSeen||V()).copy(pp); m.lostT=0; }
  const wasHunting=m.hunting; m.hunting=['chase','windup','attack','recover','hurt'].includes(m.state);
  if(m.hunting&&!wasHunting)G.emit('vigilant:notice',{monster:m,beam:s===2});
  switch(m.state){
    case 'idle':{
      // keeping vigil: still, head bowed, turning back to the way it watches; now and then a slow pace
      m.speedNow=0; m.heading+=U.angDiff(m.vigil,m.heading)*Math.min(1,dt*1.5);
      if(s===3){ const L=G.items.lantern; m.lastSeen=(m.lastSeen||V()).copy(L.pos); setState(m,'search'); break; }
      if(sees&&!playerFar(m))setState(m,'chase');
      break;}
    case 'chase':{
      if(playerFar(m)||U.dist2(m.pos,m.home)>m.zone.r+LEASH+5){ setState(m,'return'); break; }
      if(!sees){ m.lostT+=dt; if(m.lostT>p.lose){ G.emit('vigilant:lost',{monster:m}); dropToken(m); setState(m,'search'); break; } }
      const tgt=sees?pp:(m.lastSeen||pp);
      m.cool-=dt; faceTo(m,tgt.x,tgt.z,3.5,dt);
      const toT=Math.atan2(tgt.x-m.pos.x,tgt.z-m.pos.z), dT=Math.hypot(tgt.x-m.pos.x,tgt.z-m.pos.z);
      if(sees&&m.cool<=0&&dP<p.strikeRange&&Math.abs(pp.y-m.pos.y)<1.6&&takeToken(m)){ m.atk='sweep'; setState(m,'windup'); G.emit('vigilant:windup',{pos:m.pos.clone(),lead:p.strikeWind,monster:m}); break; }
      if(dT>1.3){ const sp=p.speed*(sees?1:.6); moveDir(m,toT,sp,dt); m.speedNow=sp; } else m.speedNow=0;
      break;}
    case 'search':{
      // walks to where the light was, stands and listens, then goes back to its vigil
      if(sees&&!playerFar(m)){ setState(m,'chase'); break; }
      const t=m.lastSeen;
      if(t&&Math.hypot(t.x-m.pos.x,t.z-m.pos.z)>1.2&&m.st<6){ faceTo(m,t.x,t.z,3,dt); moveDir(m,m.heading,p.speed*.5,dt); m.speedNow=p.speed*.5; }
      else { m.speedNow=0; m.heading+=Math.sin(m.st*1.3+m.id)*dt*1.2; if(m.st>6+p.searchT||(t&&m.st>p.searchT&&Math.hypot(t.x-m.pos.x,t.z-m.pos.z)<=1.2&&m.st>3))setState(m,'return'); }
      break;}
    case 'windup':
      if(pp)faceTo(m,pp.x,pp.z,m.st<p.strikeWind*.6?5:1.2,dt);
      m.flare=Math.min(1,m.st/p.strikeWind*1.2); m.speedNow=0;
      if(m.st>=p.strikeWind){ m.hitSet.clear(); m.travel=0; setState(m,'attack'); }
      break;
    case 'attack':{
      m.flare=1; const fx=Math.sin(m.heading), fz=Math.cos(m.heading), v=p.strikeDist/.25;
      if(m.travel<p.strikeDist){ moveDir(m,m.heading,v,dt); m.travel+=v*dt; }
      if(m.st>.08&&m.st<.3)strikeAt(m,m.pos.x+fx*1.15,m.pos.y+1.1,m.pos.z+fz*1.15,1.1,p.strikeDmg,6,'melee');
      if(m.st>.42)setState(m,'recover');
      break;}
    case 'recover':
      m.speedNow=0;
      if(m.st>p.recover){ dropToken(m); m.cool=1.3+rnd()*1.3; setState(m,'chase'); }
      break;
    case 'hurt':
      m.speedNow=0;
      if(m.st>p.hurt){ m.cool=Math.max(m.cool,.5); setState(m,'chase'); }
      break;
    case 'return':
      goHome(m,dt,p.speed*.7);
      if(m.state==='idle')m.heading=m.vigil;
      if(sees&&!playerFar(m))setState(m,'chase');
      break;
  }
  if(m.state!=='attack')separation(m,dt);
  // the skin shell follows the main dissolve; burned, it chars away in about a second
  m.skinK=U.damp(m.skinK,m.skin?1:0,m.skin?8:3.5,dt);
  m.skinS.uFade.value=Math.min(m.mat.uniforms.uFade.value,m.skinK); m.skinS.uFlash.value=m.mat.uniforms.uFlash.value;
  m.parts.skin.visible=m.skinK>.02; for(const a of m.parts.skinArms)a.visible=m.parts.skin.visible;
}
function vigilantGone(m){ lensBurnRemove(m); }
function animVigilant(m,dt){
  const c=m.parts, t=G.time, sp=m.speedNow||0;
  if(m.dying&&m.skinS){ m.skinS.uFade.value=Math.min(m.fade,m.skinK); c.skin.visible=m.skinK>.02&&m.fade>.02; for(const a of c.skinArms)a.visible=c.skin.visible; }
  m.phase+=dt*(1+sp);
  const W=m.state==='windup', A=m.state==='attack', R=m.state==='recover', Hh=m.state==='hurt', idle=m.state==='idle'||m.state==='return';
  // it glides; the robe sways; at its vigil the head is bowed and the hands meet at the chest
  c.body.position.y=U.damp(c.body.position.y,.04+Math.sin(t*1.1+m.id)*.03,6,dt);
  c.body.rotation.x=U.damp(c.body.rotation.x,sp>1?.1:0,5,dt);
  const lean=W?-.3*m.flare:A?.5:Hh?-.2:idle?.18:.06;
  c.upper.rotation.x=U.damp(c.upper.rotation.x,lean,A?18:6,dt);
  c.head.rotation.x=U.damp(c.head.rotation.x,idle?.45:m.state==='search'?.05+Math.sin(t*.9)*.12:-.05,3,dt);
  c.head.rotation.y=U.damp(c.head.rotation.y,m.state==='search'?Math.sin(t*.8+m.id)*.7:0,3,dt);
  for(const a of c.arms){
    let sx=-.95, sz=-a.s*.32, ex=-1.15;                                  // hands together at the chest
    if(!idle){ sx=-.35+Math.sin(m.phase*2+(a.s>0?0:PI))*.08; sz=a.s*.06; ex=-.45; }
    if(W){ sx=-2.7*m.flare; sz=a.s*.75*m.flare; ex=-.25*m.flare; }      // sleeves rise and spread: the sweep is coming
    else if(A){ sx=-.45; sz=a.s*.1; ex=-.05; }
    else if(R){ sx=-.25; ex=-.3; }
    a.sh.rotation.x=U.damp(a.sh.rotation.x,sx,A?28:7,dt); a.sh.rotation.z=U.damp(a.sh.rotation.z,sz,A?28:7,dt);
    a.el.rotation.x=U.damp(a.el.rotation.x,ex,9,dt);
  }
  stepTendrils(m,dt,1,0);
  const hunt=m.hunting||m.state==='search';
  eyesFlare(c,hunt?.08:.04,m.flare,m.fade*(hunt?1:.5));
  const k=m.fxK;
  if(m.fx&&m.fx.body)m.fx.body.intensity=k*(.8+m.flare*1.2+(A?.8:0));
  if(m.fx&&m.fx.skin)m.fx.skin.intensity=k*m.skinK;
  if(m.fx&&m.fx.pool)m.fx.pool.intensity=Math.min(1,k*m.fade*.8);
  if(k>0&&W&&rnd()<dt*10*m.flare)gather(m.pos.x,m.pos.y+1.9,m.pos.z,1.2,1);
  // under the beam the ink skin smokes and spits violet
  if(m.skin&&k>0&&(m.burnT>0||beamTouches(m.skinPos,.95))&&rnd()<dt*30){ const a=rnd()*TAU;
    ember(m.pos.x+Math.cos(a)*.4,m.pos.y+.6+rnd()*1.6,m.pos.z+Math.sin(a)*.4,Math.cos(a)*.6,1+rnd()*1.5,Math.sin(a)*.6,.5+rnd()*.4,.18);
    puff(m.pos.x+Math.cos(a)*.35,m.pos.y+.8+rnd()*1.4,m.pos.z+Math.sin(a)*.35,0,.9,0,.8,.25,.8,.6,cInk,0,1); }
}

/* ---------------------------------------------------------------- system */
// (v12) the Stag no longer answers 'finale:start' — the Gloaming does (finale_boss.js). flow.js calls startStag() in the forest.
G.on('player:respawn',()=>{
  for(const m of list.slice()){
    if(!m.alive||m.dying)continue;
    if(m.finale&&m.kind==='hound'&&boss){remove(m);continue;}  // summoned hounds vanish; boss re-summons
    m.hp=m.maxHp; m.kv.set(0,0,0); m.pos.copy(m.home); m.onRaft=null; m.board=null; m.noSettle=false; m.lastHit=-99; m.state=m.boss?'stalk':'idle'; m.st=0; m.flare=0; m.cool=1.5; m.aggro=false; m.fled=false;
    if(m.boss){m.summoned=false;m.summonDone=false;m.state=m.forest?'guard':'stalk';}
    if(m.finale&&!m.boss)m.state='chase';
    dropToken(m);
  }
  for(const R of ringFx)G.scene.remove(R.mesh); ringFx.length=0; clearPuddles();
  chargeLines.forEach(l=>l.visible=false);
});
G.monsters={list,spawn:(kind,pos,opts)=>spawn(kind,pos,opts||{aggro:false}),
  alive:()=>list.filter(m=>m.alive&&!m.dying).length,
  get boss(){return boss;}, tokens, startStag, stagArena:()=>m_arena||arenaOf(), params:P, despawn:(m,sink)=>despawn(m,sink),
  kill:(m,info)=>{ if(m&&m.alive&&!m.dying)die(m,info||{}); },
  /* COMPANIONS HOOK (companions.js): Ember's nip breaks a wind-up like a light stagger; Corvin's dive puts the next attack off.
     Never damage, never bosses. Both return true when they did something. */
  interrupt:m=>{ if(!m||m.boss||!m.alive||m.dying||m.state!=='windup'||m.raid)return false; dropToken(m); m.flare=0; m.cool=Math.max(m.cool,.6); setState(m,'hurt'); m.st=-.15; return true; },
  delay:(m,s=.8)=>{ if(!m||m.boss||!m.alive||m.dying)return false; if(m.state==='windup')m.st-=s; else m.cool=Math.max(m.cool,0)+s; return true; },
  // shared ink kit (cave_boss.js builds the Undertow with the same look)
  fx:{puff,ember,splash,sparks,gather,puddle,inkMat,sharedUniforms,sweep,mergeGeos,tendril,stepTendril,eyeSprite,anchor,ringMesh,raftInfo,nearestMoth,eatMoth,swarmMoth}};
G.system('monsters',{order:40,modes:['play'],
  init(){
    glowTex=G.tex.flame;
    try{spawnZones();}catch(e){console.error('monsters spawn',e);}
  },
  update(dt){
    const f=(G.player&&G.player.pos)||G.focus;
    for(const m of list.slice()){
      const far=f.distanceToSquared(m.pos)>150*150&&G.focus.distanceToSquared(m.pos)>150*150&&!m.boss;
      m.parts.root.visible=!far;
      const dF=Math.sqrt(f.distanceToSquared(m.pos));
      m.fxK=m.boss?1:1-U.smooth(45,55,dF); if(far)m.fxK=0;
      if(far&&!m.dying){ fxIntensity(m,0); if(m.state!=='idle'){m.pos.copy(m.home);m.hp=m.maxHp;setState(m,'idle');} continue; }
      updateMonster(m,dt);
      if(m.alive)render(m,dt);
    }
    updateRings(dt);
    updatePuddles(dt);
  }
});
/* keep idle monsters gently animated (and positioned) on the title screen */
G.system('monstersIdle',{order:41,modes:['title','paused','dead','ending'],update(dt){
  const cam=G.camera.position;
  for(const m of list){ if(G.state.mode==='paused')break; m.parts.root.position.copy(m.pos); if(m.kind==='hollow'){m.parts.body.position.y=.32+Math.sin(G.time*1.8+m.id)*.09;}
    // smoke keeps curling off visible monsters on the title/ending cameras; far ones go quiet
    m.fxK=m.dying?m.fxK:(1-U.smooth(45,55,Math.min(cam.distanceTo(m.pos),G.focus.distanceTo(m.pos))))*.7;
    if(!m.dying&&m.fx)for(const h of m.fx.list)h.intensity=m.fxK; }
}});
})();
