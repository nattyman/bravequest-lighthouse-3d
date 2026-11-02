/* =====================================================================
   BRAVE QUEST: LIGHTHOUSE — finale_boss.js  (Boss agent B)
   THE GLOAMING — the finale. "The fog answers the light."
   A towering hooded shape made of the fog itself drags up over the cliff
   edge west of the lighthouse: many-armed, grey-violet mist, a dim ink heart.
   Only the turning lighthouse beam can make it solid.

   - Solid only in the beam: strikes pass through it ("whff") until the beam
     sweeps across it; then it flashes solid for T.solidT s (rim light warns
     of the coming sweep). Two-sided beam at 0.42 rad/s -> a window every ~7.5 s.
   - Between sweeps: fog-hand slams (ground decals; the hand hardens where it
     strikes the stone and can be hit for a while), a sweeping arm (jump or
     roll), and it calls Hollows from the fog at most once per phase.
   - Phase 2 (<=50 % HP): three tendrils climb the tower. Cut their roots at
     the tower foot (3 HP each). A tendril reaching the top gutters the beam
     (no windows for 6 s) and starts over. All three cut -> long stagger.
   - Death: dissolves upward into the beam; the fog thins over the island.
     Emits boss:dead {who:'gloaming'} and clears the boss bar.
   - Player death: the fight resets cleanly (full HP, tendrils gone) and the
     Gloaming rises again a few seconds after the player does.

   API: G.finaleBoss = {start(), reset(), active, hp, maxHp, solid, state, phase, T, debug}
   Events: gloaming:start · gloaming:solid {stagger} · gloaming:phase {n} · gloaming:gutter
           gloaming:telegraph {kind,pos,lead} · boss:dead {who:'gloaming'}
   Starts on finale:start. Never throws if other modules are missing.
   ===================================================================== */
(function(){
'use strict';
const G=window.G; if(!G||!G.THREE)return;
const THREE=G.THREE, U=G.U, PI=Math.PI, TAU=PI*2;
const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const rnd=U.rng?U.rng(91373):Math.random;
const FX=()=>(G.monsters&&G.monsters.fx)||null;
const INK=()=>G.ink||null;
const ui=(k,...a)=>{ try{ if(G.ui&&G.ui[k])G.ui[k](...a); }catch(e){} };

/* ---------------------------------------------------------------- tuning */
const T={
  hp:44, H:11,                          // HP in half-hearts; body height (m)
  solidT:2.6, crossTol:.15, warnT:1.6,   // solid window per sweep; beam half-width (rad) that counts as "in"; rim warning lead (s)
  beamW:.42,                             // fallback beam angular speed (rad/s), lighthouse.js uses .42
  slamWind:1.45, slamWind2:1.15, slamR:2.7, slamDmg:2, slamFall:.2,
  handLinger:1.6, handMul:.6, handCap:3, // the hardened hand: damage x .6 to the boss, at most 3 per hand
  sweepWind:1.35, sweepDur:.75, sweepArc:2.3, sweepR0:2.5, sweepR1:13.5, sweepDmg:2,
  idle:[1.1,1.9], idle2:[.7,1.3],
  callN:[2,3], maxHollows:3,
  postR:17, postR2:12.5, speed:2.6,
  rootHp:3, climbT:21, climbGap:4.5, regrowT:3, gutterT:6, staggerT:6.5, staggerMul:1.25,
  introT:6.5, respawnDelay:3, dieT:5.5
};

/* ---------------------------------------------------------------- places */
const LM=()=>(G.world&&G.world.landmarks)||{};
function tower(){ const L=G.world&&G.world.lighthouse; if(L&&isFinite(L.x))return L;
  const l=LM().lighthouse||{x:180,y:42,z:0}; return {x:l.x,z:l.z,baseY:l.y||42,topY:(l.y||42)+24,outerR:4.2}; }
function arena(){ const f=LM().finale; return f&&isFinite(f.x)?{x:f.x,y:isFinite(f.y)?f.y:42,z:f.z,r:f.r||28}:{x:165,y:42,z:0,r:28}; }
function ground(x,z,y){ try{ const h=G.floorAt?G.floorAt(x,z,y==null?60:y):G.world.height(x,z); if(isFinite(h)&&h>-1e8)return h; }catch(e){} try{ return G.world.height(x,z); }catch(e){ return 42; } }
const plateauY=()=>arena().y;
const onPlateau=(x,z)=>Math.abs(ground(x,z,plateauY()+6)-plateauY())<1.2;
const lampPos=()=>{ const L=G.world&&G.world.lighthouse; if(L&&L.lampCenter)return L.lampCenter; const t=tower(); return V(t.x,t.topY+1.65,t.z); };
const dirOf=(yaw,out)=>(out||V()).set(Math.sin(yaw),0,Math.cos(yaw));   // heading convention used by player/monsters
const yawTo=(a,b)=>Math.atan2(b.x-a.x,b.z-a.z);

/* ---------------------------------------------------------------- the beam
   G.lighthouse.beam = {yaw(), lit} (agent A). Fallback: the lamp's beam group in the scene
   (its local +x is one of the two beams; lighthouse.js spins it about y), else a clock. */
let beamObj=null, beamSearched=0, beamConv=0;  // 0 unknown, 1 = (sin,cos) heading convention, 2 = (cos,sin)
function findBeam(){
  if(beamObj||G.time-beamSearched<3)return beamObj; beamSearched=G.time;
  const root=G.scene&&G.scene.getObjectByName('lighthouse'); if(!root)return null;
  root.traverse(o=>{ if(beamObj||!o.isGroup||o.children.length<2)return;
    if(o.children.every(c=>c.isMesh&&c.geometry&&c.geometry.type==='ConeGeometry'&&c.geometry.parameters&&c.geometry.parameters.openEnded&&c.geometry.parameters.height>=40))beamObj=o; });
  return beamObj;
}
const _bv=V();
function sceneYaw(){ const b=findBeam(); if(!b)return null; b.updateMatrixWorld(); _bv.set(1,0,0).transformDirection(b.matrixWorld); return Math.atan2(_bv.x,_bv.z); }
function beamYaw(){
  const LB=G.lighthouse&&G.lighthouse.beam;
  if(LB&&typeof LB.yaw==='function'){
    let y=+LB.yaw(); if(!isFinite(y))y=0;
    // agent A's convention: check once against the scene beam (two-sided: compare mod PI)
    if(!beamConv){ const s=sceneYaw(); if(s==null)beamConv=1; else { const fold=a=>Math.abs(((a%PI)+PI*1.5)%PI-PI*.5);
      const y2=Math.atan2(Math.cos(y),Math.sin(y)); beamConv=fold(U.angDiff(y,s))<=fold(U.angDiff(y2,s))?1:2; } }
    return beamConv===2?Math.atan2(Math.cos(y),Math.sin(y)):y;
  }
  const s=sceneYaw(); if(s!=null)return s;
  return G.time*T.beamW;
}
function beamLit(){
  const LB=G.lighthouse&&G.lighthouse.beam; if(LB&&'lit' in LB)return !!LB.lit;
  if(G.lighthouse&&'cured' in G.lighthouse)return !!G.lighthouse.cured||(G.atmo&&G.atmo.cured>.99);
  return true;
}
/* gutter: dim the real beam meshes after lighthouse.js has set them this frame (it resets opacity every frame) */
function gutterBeam(k){ const b=findBeam(); if(!b||k<=0)return;
  const f=Math.max(0,1-k)+k*.12*(Math.sin(G.time*31)>.6?1:0);
  const mats=new Set(); b.children.forEach(c=>c.material&&mats.add(c.material)); mats.forEach(m=>{ m.opacity*=f; }); }

/* ---------------------------------------------------------------- audio (Suno names reserved; synth fallback) */
function sfx(name,pos,fb){
  const A=G.audio; if(!A||!A.ready)return;
  try{ if(A.sfx&&A.sfx.play&&A.sfx.play(name,{pos}))return; }catch(e){}
  try{ const ctx=A.context, S=A.S; if(ctx&&S&&fb)fb(S,ctx.currentTime); }catch(e){}
}
const SND={
  rise:p=>sfx('gloaming_rise',p,(S,t)=>{ S.rumble(t,{g:.55,dur:4.5,f0:46,f1:28,lp:240}); S.moan(t+.6,{dur:3.4,g:.12,f:150}); S.hiss(t+1,{dur:3,f0:260,f1:900,g:.06}); }),
  slam:p=>sfx('gloaming_slam',p,(S,t)=>{ S.thud(t,{g:.55,f0:95,f1:34,dur:.55,click:.2}); S.whoosh(t,{dur:.5,f0:300,f1:900,g:.12}); }),
  wind:p=>sfx('gloaming_wind',p,(S,t)=>{ S.hiss(t,{dur:1.1,f0:240,f1:1400,g:.07,Q:1.5}); }),
  solid:p=>sfx('gloaming_solid',p,(S,t)=>{ S.chime(t,[74,81,86],{g:.05,step:.06,decay:1.4}); S.growl(t,{dur:.8,g:.12,f:60,lp:380}); }),
  whff:p=>sfx('gloaming_whff',p,(S,t)=>{ S.whoosh(t,{dur:.26,f0:500,f1:1500,g:.09,Q:.8}); }),
  hurt:p=>sfx('gloaming_hurt',p,(S,t)=>{ S.growl(t,{dur:.5,g:.16,f:52,lp:420}); }),
  tendril:p=>sfx('gloaming_tendril',p,(S,t)=>{ S.hiss(t,{dur:1.4,f0:180,f1:700,g:.08}); S.growl(t+.2,{dur:1,g:.08,f:40,lp:300}); }),
  cut:p=>sfx('gloaming_cut',p,(S,t)=>{ S.dissolve(t,{dur:.9,g:.14}); }),
  gutter:p=>sfx('gloaming_gutter',p,(S,t)=>{ S.hiss(t,{dur:2,f0:2000,f1:200,g:.1,Q:1}); S.rumble(t,{g:.3,dur:2,f0:40,f1:30}); }),
  call:p=>sfx('gloaming_call',p,(S,t)=>{ S.moan(t,{dur:2.4,g:.14,f:120}); S.howl(t+.3,{dur:1.8,g:.05}); }),
  death:p=>sfx('gloaming_death',p,(S,t)=>{ S.dissolve(t,{dur:4.5,g:.3}); S.rumble(t,{g:.45,dur:5,f0:50,f1:26}); S.moan(t+.4,{dur:4,g:.1,f:200}); })
};
function music(on){ try{ const M=G.audio&&G.audio.music; if(M&&M.setOverride){ if(on)M.setOverride('boss'); else if(M.state==='boss'||on===false)M.setOverride(null); } }catch(e){} }

/* ---------------------------------------------------------------- shaders */
const SN=G.SNOISE||'vec3 _m(vec3 x){return x-floor(x*(1./289.))*289.;} float snoise(vec3 v){ return fract(sin(dot(_m(v),vec3(12.9898,78.233,37.719)))*43758.5453)*2.-1.; }';
const FS_MIST=`uniform float uTime;uniform float uSolid;uniform float uWarn;uniform float uFlash;uniform float uFade;uniform float uAlpha;uniform float uDense;
uniform vec3 uMist;uniform vec3 uInk;uniform vec3 uWarm;uniform vec3 uFogC;uniform vec3 uLamp;uniform float uSky;uniform vec3 uSkyC;
varying vec3 vN;varying vec3 vV;varying vec3 vW;varying vec3 vWN;varying float vY;
#include <fog_pars_fragment>
${SN}
void main(){
  vec3 q=vW*.32+vec3(0.,-uTime*.55,0.);
  float n=snoise(q)*.5+.5, n2=snoise(q*2.4+vec3(4.1,uTime*.15,1.3))*.5+.5, dn=n*.6+n2*.4;
  if(dn>uFade*1.12+.02)discard;
  float f=1.-abs(dot(normalize(vN),normalize(vV)));
  float side=max(0.,dot(normalize(vWN),normalize(uLamp-vW)));
  vec3 mist=mix(uFogC,uMist,.6)*(.72+.4*n);
  vec3 col=mix(mist,uInk*(.55+.6*n2),uSolid*.82+uDense*.5);
  col+=uWarm*pow(f,2.6)*(uSolid*(.35+.65*side)+uWarn*side*.9)*(.5+.6*n);
  col+=uMist*pow(f,3.)*.18;
  col+=uSkyC*pow(f,2.4)*uSky*(.55+.5*n);   // a cool silhouette rim so it reads against the dusk sky
  col+=uWarm*(uFade<.98?smoothstep(uFade-.25,uFade,dn)*1.6:0.);
  col+=vec3(1.,.93,.82)*uFlash*(.12+.5*f);
  float a=uAlpha*(.3+.7*smoothstep(.05,.85,f+(n-.5)*.7))*(.5+.5*dn);
  a=mix(a,min(1.,a*2.4+.25),max(uSolid*.85,uDense));
  a=max(a,uSky*.5*smoothstep(.4,.95,f)*(.45+.55*dn)*uFade);
  a*=smoothstep(0.,.1,vY);
  gl_FragColor=vec4(col,clamp(a,0.,1.));
  #include <fog_fragment>
}`;
const VS_BODY=`uniform float uTime;uniform float uAmp;uniform float uLean;uniform float uRise;
varying vec3 vN;varying vec3 vV;varying vec3 vW;varying vec3 vWN;varying float vY;
#include <fog_pars_vertex>
${SN}
void main(){
  vec3 p=position; float h=p.y/${T.H.toFixed(1)};
  float hood=smoothstep(.72,1.,h); p.z+=hood*hood*2.4+smoothstep(.45,1.,h)*1.2+uLean*h*h*2.6; p.y-=hood*hood*hood*.9+uLean*h*h*.9;
  vec4 wp=modelMatrix*vec4(p,1.);
  vec3 wn=normalize(mat3(modelMatrix)*normal);
  float n=snoise(wp.xyz*.33+vec3(0.,-uTime*.5,uTime*.1))*.7+snoise(wp.xyz*.9+vec3(2.,-uTime*.9,0.))*.3;
  wp.xyz+=wn*uAmp*n*(.6+.8*(1.-h));
  vec4 mvPosition=viewMatrix*wp; vN=normalize(mat3(viewMatrix)*wn); vWN=wn; vV=normalize(-mvPosition.xyz); vW=wp.xyz; vY=h*${T.H.toFixed(1)}+uRise;
  gl_Position=projectionMatrix*mvPosition;
  #include <fog_vertex>
}`;
const NARM=6, ASEG=26, ARAD=10;
const VS_ARM=`attribute float aArm;attribute float aT;attribute float aA;
uniform float uTime;uniform vec3 uP[${NARM*4}];uniform float uR[${NARM}];uniform float uHand[${NARM}];uniform float uGround;
varying vec3 vN;varying vec3 vV;varying vec3 vW;varying vec3 vWN;varying float vY;
#include <fog_pars_vertex>
${SN}
vec3 bez(vec3 a,vec3 b,vec3 c,vec3 d,float t){float u=1.-t;return u*u*u*a+3.*u*u*t*b+3.*u*t*t*c+t*t*t*d;}
vec3 bezD(vec3 a,vec3 b,vec3 c,vec3 d,float t){float u=1.-t;return 3.*u*u*(b-a)+6.*u*t*(c-b)+3.*t*t*(d-c);}
void main(){
  int i=int(aArm+.5); vec3 a=uP[i*4],b=uP[i*4+1],c=uP[i*4+2],d=uP[i*4+3]; float t=aT;
  vec3 p=bez(a,b,c,d,t); vec3 tg=normalize(bezD(a,b,c,d,t)+vec3(1e-4,1e-5,0.));
  vec3 up=abs(tg.y)>.96?vec3(1.,0.,0.):vec3(0.,1.,0.);
  vec3 N=normalize(cross(tg,up)); vec3 B=cross(N,tg); vec3 n=N*cos(aA)+B*sin(aA);
  float h=uHand[i], R=uR[i];
  float r=R*mix(1.,.3,t);
  float palm=smoothstep(.7,.9,t)*(1.-smoothstep(.95,1.,t));
  r+=R*palm*(.45+1.2*h)*(1.+.55*h*max(0.,cos(aA*2.5+1.3)));
  r*=1.+.22*snoise(p*.55+vec3(0.,-uTime*.9,0.));
  r*=1.-smoothstep(.975,1.,t)*.8;
  vec3 wp=p+n*r;
  vec4 mvPosition=viewMatrix*vec4(wp,1.); vN=normalize(mat3(viewMatrix)*n); vWN=n; vV=normalize(-mvPosition.xyz); vW=wp; vY=max(.3,wp.y-uGround+.3);
  gl_Position=projectionMatrix*mvPosition;
  #include <fog_vertex>
}`;
const NTEN=3;
const VS_TEN=`attribute vec3 aOff;attribute float aT;attribute float aId;
uniform float uTime;uniform float uGrow[${NTEN}];uniform float uLive[${NTEN}];uniform float uHit[${NTEN}];
varying vec3 vN;varying vec3 vV;varying vec3 vW;varying vec3 vWN;varying float vY;
#include <fog_pars_vertex>
${SN}
void main(){
  int i=int(aId+.5); float g=uGrow[i], l=uLive[i], t=aT;
  float r=mix(.5,.15,t)+.75*(1.-smoothstep(0.,.05,t));
  r*=smoothstep(g+.002,g-.035,t)*l*(1.+.35*uHit[i]);
  r*=1.+.25*snoise(position*.8+vec3(0.,-uTime*1.2,0.));
  vec3 c=position+aOff*(.18*sin(t*38.-uTime*3.+aId*2.)*(1.-smoothstep(0.,.1,t)*.3));
  vec3 wp=c+aOff*r;
  vec4 mvPosition=viewMatrix*vec4(wp,1.); vN=normalize(mat3(viewMatrix)*aOff); vWN=aOff; vV=normalize(-mvPosition.xyz); vW=wp; vY=1.;
  gl_Position=projectionMatrix*mvPosition;
  #include <fog_vertex>
}`;
function mistMat(vs,extra,o={}){
  const u=THREE.UniformsUtils.merge([THREE.UniformsLib.fog,{
    uSolid:{value:0},uWarn:{value:0},uFlash:{value:0},uFade:{value:1},uAlpha:{value:o.alpha||.5},uDense:{value:o.dense||0},
    uMist:{value:U.col(o.mist||'#a49cc0')},uInk:{value:U.col(o.ink||'#3a3150')},uWarm:{value:U.col(o.warm||'#ffdca6')},
    uFogC:{value:U.col('#5a5a78')},uSky:{value:0},uSkyC:{value:U.col('#dcd6f6')},uLamp:{value:V(180,67,0)},uAmp:{value:o.amp||.55},uLean:{value:0},uRise:{value:0},uGround:{value:42}},extra||{}]);
  u.uTime=G.negTime||{value:0};
  return new THREE.ShaderMaterial({uniforms:u,vertexShader:vs,fragmentShader:FS_MIST,fog:true,transparent:true,depthWrite:false,side:o.side||THREE.FrontSide});
}
const DECAL_FS=`uniform float uK;uniform float uA;uniform vec3 uC;varying vec2 vUv;
void main(){ vec2 p=vUv*2.-1.; float r=length(p); if(r>1.)discard;
  float ring=smoothstep(.84,.92,r)*(1.-smoothstep(.96,1.,r));
  float fill=(1.-smoothstep(uK-.05,uK,r))*(.22+.25*smoothstep(uK-.3,uK,r));
  float core=(1.-smoothstep(0.,.25,r))*.15;
  gl_FragColor=vec4(uC*(.55+.9*ring),(ring*.85+fill+core)*uA); }`;
const DECAL_VS=`varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`;
const SECT_VS=`attribute vec2 aRT;uniform float uR0;uniform float uR1;uniform float uTh0;uniform float uTh1;varying vec2 vRT;
void main(){ vRT=aRT; float r=mix(uR0,uR1,aRT.x), th=mix(uTh0,uTh1,aRT.y); vec3 p=vec3(sin(th)*r,0.,cos(th)*r);
  gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.); }`;
const SECT_FS=`uniform float uK;uniform float uA;uniform vec3 uC;varying vec2 vRT;
void main(){ float e=max(smoothstep(.9,1.,vRT.x),max(1.-smoothstep(0.,.04,vRT.y),smoothstep(.96,1.,vRT.y)));
  float sweep=1.-smoothstep(0.,.07,abs(vRT.y-uK));
  float fill=.18+.18*smoothstep(.0,1.,vRT.x);
  gl_FragColor=vec4(uC*(.6+.8*e+sweep),(e*.8+fill+sweep*.6)*uA*smoothstep(0.,.12,vRT.x)); }`;

/* ---------------------------------------------------------------- state */
const B={built:false,state:'idle',st:0,hp:T.hp,phase:1,pos:V(),vel:V(),facing:0,rise:0,lean:0,recoil:0,
  solidT:0,solidK:0,warn:0,flash:0,fade:1,staggerT:0,gutterT:0,lastCross:-99,atk:null,cool:2,
  yawPrev:null,omega:T.beamW,tt:99,called:[false,false],phase2T:0,defeated:false,respawnT:-1,said:{},dieBurst:false,
  bossDeadSent:false,fogThin:0,withdraw:0,hitT:-9,hitKind:''};
const hollows=[];
let body=null, shell=null, armMesh=null, armMat=null, tenMesh=null, tenMat=null, heart=null, heartGlow=null, hoodVoid=null, eyes=[], spill=null;
const decals=[], arms=[], roots=[];
let sector=null, bodyHB=null, handHBs=[];
const say=(k,text,who)=>{ if(B.said[k])return false; B.said[k]=1; ui('say',text,who); return true; };

/* ---------------------------------------------------------------- build */
function lathe(){
  const H=T.H, pr=[[0,-1.5],[3.6,-1.2],[3.9,0],[3.4,1.2],[2.7,3],[2.35,4.6],[2.6,6.2],[3.0,7.4],[2.75,8.2],[2.2,8.8],[2.35,9.4],[2.05,10.1],[1.45,10.7],[.75,11.2],[.2,11.6],[0,11.7]];
  return new THREE.LatheGeometry(pr.map(([r,y])=>new THREE.Vector2(r,y*H/11)),28);
}
function build(){
  if(B.built)return; B.built=true;
  // body: an inner mist shell + an outer haze (same lathe)
  const geo=lathe();
  body=new THREE.Mesh(geo,mistMat(VS_BODY,null,{alpha:.62,amp:.45})); body.frustumCulled=false; body.renderOrder=5;
  shell=new THREE.Mesh(geo,mistMat(VS_BODY,null,{alpha:.26,amp:.9,mist:'#b9b2cf'})); shell.scale.set(1.16,1.04,1.16); shell.frustumCulled=false; shell.renderOrder=4;
  G.scene.add(body); G.scene.add(shell);
  // arms: one draw call, every arm a cubic bezier evaluated in the vertex shader
  { const n=NARM*ASEG*ARAD, aArm=new Float32Array(n), aT=new Float32Array(n), aA=new Float32Array(n), idx=[];
    for(let i=0;i<NARM;i++)for(let s=0;s<ASEG;s++)for(let k=0;k<ARAD;k++){ const v=(i*ASEG+s)*ARAD+k; aArm[v]=i; aT[v]=s/(ASEG-1); aA[v]=k/ARAD*TAU; }
    for(let i=0;i<NARM;i++)for(let s=0;s<ASEG-1;s++)for(let k=0;k<ARAD;k++){ const o=i*ASEG*ARAD, a=o+s*ARAD+k, b=o+(s+1)*ARAD+k, c=o+s*ARAD+(k+1)%ARAD, d=o+(s+1)*ARAD+(k+1)%ARAD; idx.push(a,c,b,b,c,d); }
    const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(n*3),3));
    g.setAttribute('aArm',new THREE.BufferAttribute(aArm,1)); g.setAttribute('aT',new THREE.BufferAttribute(aT,1)); g.setAttribute('aA',new THREE.BufferAttribute(aA,1)); g.setIndex(idx);
    armMat=mistMat(VS_ARM,{uP:{value:Array.from({length:NARM*4},()=>V(0,-999,0))},uR:{value:new Array(NARM).fill(.5)},uHand:{value:new Array(NARM).fill(0)}},{alpha:.6});
    armMesh=new THREE.Mesh(g,armMat); armMesh.frustumCulled=false; armMesh.renderOrder=5; G.scene.add(armMesh);
    for(let i=0;i<NARM;i++)arms.push({i,big:i<2,side:i%2?-1:1,P:[V(),V(),V(),V()],R:i<2?.85:.5,hand:0,ph:rnd()*TAU,
      mode:'rest',k:0,tip:V(),target:V(),hardT:0,hp:0}); }
  // the ink heart: a solid toon core (outlined) + a glow that wakes in the beam
  { const g=new THREE.IcosahedronGeometry(.75,1); heart=new THREE.Mesh(g,G.toon?G.toon('#1b1028',{emissive:'#2c1650',emissiveIntensity:.35}):new THREE.MeshBasicMaterial({color:0x1b1028}));
    if(G.outline)G.outline(heart,{thickness:.05}); G.scene.add(heart);
    heartGlow=new THREE.Sprite(new THREE.SpriteMaterial({map:G.tex&&G.tex.soft,color:U.col('#a57cff'),transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending,fog:false}));
    heartGlow.scale.setScalar(5); heartGlow.renderOrder=9; G.scene.add(heartGlow);
    hoodVoid=new THREE.Sprite(new THREE.SpriteMaterial({map:G.tex&&G.tex.soft,color:U.col('#07050c'),transparent:true,opacity:.9,depthWrite:false}));
    hoodVoid.scale.setScalar(3.4); hoodVoid.renderOrder=6; G.scene.add(hoodVoid);
    for(let i=0;i<2;i++){ const e=new THREE.Sprite(new THREE.SpriteMaterial({map:G.tex&&G.tex.flame,color:U.col('#e6dcff'),transparent:true,opacity:.0,depthWrite:false,blending:THREE.AdditiveBlending,fog:false}));
      e.scale.setScalar(.38); e.renderOrder=7; G.scene.add(e); eyes.push(e); } }
  // the light that falls on it: a soft cone from the lamp down to the heart
  { const g=new THREE.CylinderGeometry(.06,1,1,20,1,true); g.translate(0,-.5,0);
    const tex=G.canvasTex?G.canvasTex(64,(c,s)=>{ const gr=c.createLinearGradient(0,0,0,s); gr.addColorStop(0,'rgba(255,255,255,.9)'); gr.addColorStop(.6,'rgba(255,255,255,.35)'); gr.addColorStop(1,'rgba(255,255,255,0)'); c.fillStyle=gr; c.fillRect(0,0,s,s); }):null;
    spill=new THREE.Mesh(g,new THREE.MeshBasicMaterial({map:tex,color:U.col('#ffe6bf'),transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide,fog:false}));
    spill.frustumCulled=false; spill.visible=false; spill.renderOrder=8; G.scene.add(spill); }
  // ground decals: slam rings (pool of 3) + the sweep sector
  for(let i=0;i<3;i++){ const m=new THREE.Mesh(new THREE.PlaneGeometry(2,2).rotateX(-PI/2),new THREE.ShaderMaterial({uniforms:{uK:{value:0},uA:{value:0},uC:{value:U.col('#d4c2ff')}},
      vertexShader:DECAL_VS,fragmentShader:DECAL_FS,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,polygonOffset:true,polygonOffsetFactor:-2}));
    m.visible=false; m.renderOrder=3; G.scene.add(m); decals.push({m,t:0,life:0,busy:false,kind:''}); }
  { const nr=8, nt=40, rt=new Float32Array((nr+1)*(nt+1)*2), idx=[];
    for(let i=0;i<=nr;i++)for(let j=0;j<=nt;j++){ const v=i*(nt+1)+j; rt[v*2]=i/nr; rt[v*2+1]=j/nt; }
    for(let i=0;i<nr;i++)for(let j=0;j<nt;j++){ const a=i*(nt+1)+j,b=a+1,c=a+nt+1,d=c+1; idx.push(a,c,b,b,c,d); }
    const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.BufferAttribute(new Float32Array((nr+1)*(nt+1)*3),3)); g.setAttribute('aRT',new THREE.BufferAttribute(rt,2)); g.setIndex(idx);
    sector=new THREE.Mesh(g,new THREE.ShaderMaterial({uniforms:{uR0:{value:2},uR1:{value:12},uTh0:{value:0},uTh1:{value:1},uK:{value:0},uA:{value:0},uC:{value:U.col('#d4c2ff')}},
      vertexShader:SECT_VS,fragmentShader:SECT_FS,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2}));
    sector.frustumCulled=false; sector.visible=false; sector.renderOrder=3; G.scene.add(sector); }
  buildTendrils();
  // hurtboxes
  bodyHB={team:'enemy',pos:V(0,-999,0),radius:2.6,height:T.H-1,name:'The Gloaming',lockOffset:4.2,corrupt:false,gloaming:true,
    get targetable(){ return active()&&B.state!=='intro'; },
    alive:()=>active()&&B.rise>.6&&B.state!=='dying',hit:info=>hitBody(info)};
  G.combat&&G.combat.add(bodyHB);
  for(const ar of arms.slice(0,2)){ const hb={team:'enemy',pos:V(0,-999,0),radius:1.7,height:1.8,name:'The Gloaming’s hand',targetable:false,corrupt:false,gloaming:true,
      alive:()=>active()&&ar.hardT>0,hit:info=>hitHand(ar,info)}; ar.hb=hb; handHBs.push(hb); G.combat&&G.combat.add(hb); }
  hideAll();
}
function buildTendrils(){
  const L=tower(), base=L.baseY, top=L.topY, n=56, R=8;
  const a0s=[PI-1.05,PI+1.0,.15]; // world angle atan2(z,x) around the tower: NW, SW, E (keeps the west door clear)
  const pos=[], off=[], at=[], aid=[], idx=[];
  const cx=L.x, cz=L.z, oR=L.outerR||4.2;
  for(let i=0;i<NTEN;i++){
    const a0=a0s[i], spin=(i%2?1:-1)*1.15, o=i*n*R;
    for(let s=0;s<n;s++){ const t=s/(n-1);
      const a=a0+spin*t+.12*Math.sin(t*9+i), y=base-.25+t*(top-base+1.4);
      const rr=(t<.04?oR+1.2-t/.04*.75:oR+.42-.25*t)+(t>.9?U.smooth(.9,1,t)*1.3:0);
      const c=V(cx+Math.cos(a)*rr,y,cz+Math.sin(a)*rr);
      const radial=V(Math.cos(a),0,Math.sin(a)), tang=V(-Math.sin(a)*spin,(top-base)/(oR*Math.abs(spin)+1e-3)*.05,Math.cos(a)*spin).normalize();
      const up=V().crossVectors(radial,tang).normalize();
      for(let k=0;k<R;k++){ const th=k/R*TAU, d=radial.clone().multiplyScalar(Math.cos(th)).addScaledVector(up,Math.sin(th));
        pos.push(c.x,c.y,c.z); off.push(d.x,d.y,d.z); at.push(t); aid.push(i); }
    }
    for(let s=0;s<n-1;s++)for(let k=0;k<R;k++){ const a=o+s*R+k,b=o+(s+1)*R+k,c=o+s*R+(k+1)%R,d=o+(s+1)*R+(k+1)%R; idx.push(a,c,b,b,c,d); }
    const rx=cx+Math.cos(a0)*(oR+.9), rz=cz+Math.sin(a0)*(oR+.9);
    const root={i,a0,pos:V(rx,ground(rx,rz,base+3),rz),hp:T.rootHp,cut:false,grow:0,live:0,delay:0,hit:0,active:false,ring:null};
    root.hb={team:'enemy',pos:root.pos,radius:1.15,height:1.8,name:'Fog root',lockOffset:.8,corrupt:false,gloaming:true,
      get targetable(){ return root.active&&!root.cut; }, alive:()=>active()&&root.active&&!root.cut,hit:info=>hitRoot(root,info)};
    G.combat&&G.combat.add(root.hb);
    const ring=new THREE.Mesh(new THREE.PlaneGeometry(2,2).rotateX(-PI/2),new THREE.ShaderMaterial({uniforms:{uK:{value:1},uA:{value:0},uC:{value:U.col('#b893ff')}},
      vertexShader:DECAL_VS,fragmentShader:DECAL_FS,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,polygonOffset:true,polygonOffsetFactor:-2}));
    ring.scale.setScalar(1.7); ring.position.set(rx,root.pos.y+.06,rz); ring.visible=false; ring.renderOrder=3; G.scene.add(ring); root.ring=ring;
    roots.push(root);
  }
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3)); g.setAttribute('aOff',new THREE.Float32BufferAttribute(off,3));
  g.setAttribute('aT',new THREE.Float32BufferAttribute(at,1)); g.setAttribute('aId',new THREE.Float32BufferAttribute(aid,1)); g.setIndex(idx);
  tenMat=mistMat(VS_TEN,{uGrow:{value:[0,0,0]},uLive:{value:[0,0,0]},uHit:{value:[0,0,0]}},{alpha:1,dense:.95,ink:'#2a2140'});
  tenMesh=new THREE.Mesh(g,tenMat); tenMesh.frustumCulled=false; tenMesh.renderOrder=5; tenMesh.visible=false; G.scene.add(tenMesh);
}
function hideAll(){ if(!B.built)return;
  body.visible=shell.visible=armMesh.visible=heart.visible=heartGlow.visible=hoodVoid.visible=false; eyes.forEach(e=>e.visible=false);
  spill.visible=false; sector.visible=false; decals.forEach(d=>{d.m.visible=false;d.busy=false;});
  tenMesh.visible=false; roots.forEach(r=>{ r.ring.visible=false; }); }
function showAll(){ body.visible=shell.visible=armMesh.visible=heart.visible=heartGlow.visible=hoodVoid.visible=true; eyes.forEach(e=>e.visible=true); }

/* ---------------------------------------------------------------- helpers */
const active=()=>B.state==='intro'||B.state==='fight'||B.state==='dying';
const solid=()=>B.solidT>0||B.staggerT>0;
const P=()=>G.player;
const playerOK=()=>{ const p=P(); return !!(p&&p.pos&&p.alive!==false&&!(p.hp<=0)); };
function playerInTower(){ const L=G.world&&G.world.lighthouse, p=P(); try{ return !!(L&&L.inside&&p&&L.inside(p.pos)); }catch(e){ return false; } }
function heartPos(out){ return (out||V()).set(B.pos.x,B.pos.y-(1-B.rise)*16+5.9-B.recoil*.4,B.pos.z).addScaledVector(dirOf(B.facing,_f),.75+B.lean*1.2); }
const _f=V(),_s=V(),_t=V(),_u=V(),_w=V();
function decal(kind,x,z,r,life){
  const d=decals.find(q=>!q.busy)||decals[0]; d.busy=true; d.t=0; d.life=life; d.kind=kind; d.r=r;
  d.m.position.set(x,ground(x,z,plateauY()+4)+.07,z); d.m.scale.set(r,1,r); d.m.visible=true; d.m.material.uniforms.uK.value=0; d.m.material.uniforms.uA.value=0; return d; }
function freeDecal(d){ if(d){ d.busy=false; d.m.visible=false; } }
function mistPuff(x,y,z,vx,vy,vz,life,s0,s1,a,col){ const F=FX(); if(F&&F.puff)F.puff(x,y,z,vx,vy,vz,life,s0,s1,a,col||C_MIST,0,1.1); }
const C_MIST=U.col('#8f88a8'), C_PALE=U.col('#c9c2dc'), C_INK=U.col('#120c1c');

/* ---------------------------------------------------------------- start / reset */
function riseSpot(){
  // the cliff edge west-north-west of the lighthouse: walk out from the arena until the ground drops away
  const A=arena(); const d=V(-.5,0,-.87).normalize(); let x=A.x, z=A.z;
  for(let r=0;r<70;r+=1){ const xx=A.x+d.x*r, zz=A.z+d.z*r; if(!onPlateau(xx,zz))break; x=xx; z=zz; }
  return V(x,plateauY(),z);
}
let edge=V();
function start(force){
  if(B.defeated&&!force)return false;
  if(active())return false;
  build(); resetFight(true);
  edge=riseSpot(); const A=arena();
  const inward=V(A.x-edge.x,0,A.z-edge.z).normalize();
  B.pos.set(edge.x-inward.x*1.5,plateauY(),edge.z-inward.z*1.5); B.facing=Math.atan2(inward.x,inward.z);
  B.state='intro'; B.st=0; B.rise=0; showAll();
  for(const ar of arms){ ar.mode='grip'; ar.k=0; }
  G.emit('gloaming:start',{pos:B.pos.clone()});
  ui('bossBar','The Gloaming',1); music(true); SND.rise(B.pos);
  ui('shake',.5);
  if(!B.said.intro){ B.said.intro=1; setTimeout(()=>{ if(active())ui('toast','The Gloaming','The fog answers the light'); },900); }
  cineStart();
  later(2.2,()=>say('intro2','It is made of the fog itself. Your light goes straight through it — but where the great beam turns across it, it catches.',{priority:'high'}));
  return true;
}
/* ---------------------------------------------------------------- the rise: a short skippable intro shot
   The first time it rises (per session) the camera cuts to a low three-quarter view from the arena side, framing it against
   the sky as it drags itself over the edge, and eases in for ~4 s while the fog thins around it. Any button skips. Then
   control comes back with the Traveler (and so the follow camera) turned to face it. */
const CINE={on:false,seen:false,t:0,dur:4.2,skip:false,fogK:0,bars:null,cp:V(),lp:V(),side:-1,dk:1};
function cineBars(){
  if(CINE.bars||typeof document==='undefined')return CINE.bars;
  const wrap=document.createElement('div'); wrap.id='gloamingCine'; wrap.setAttribute('aria-hidden','true');
  wrap.style.cssText='position:fixed;inset:0;pointer-events:none;opacity:0;transition:opacity .35s';
  const bar=top=>{ const b=document.createElement('div'); b.style.cssText='position:absolute;left:0;right:0;height:8vh;background:#05040a;'+(top?'top:0':'bottom:0'); return b; };
  const hint=document.createElement('div'); hint.textContent='Press any button to skip';
  hint.style.cssText='position:absolute;right:18px;bottom:calc(8vh + 10px);font:500 12px/1 system-ui,sans-serif;letter-spacing:.08em;color:#d8d0e8;opacity:.6;text-shadow:0 1px 3px #000';
  wrap.append(bar(true),bar(false),hint);
  const hud=document.getElementById('hud'); if(hud&&hud.parentNode)hud.parentNode.insertBefore(wrap,hud); else document.body.appendChild(wrap); // under the HUD (captions stay readable)
  CINE.bars=wrap; return wrap;
}
const cineSkipKey=e=>{ if(CINE.on&&CINE.t>.25)CINE.skip=true; };
/* pick the side/distance whose line of sight to the rise misses the trees (circle colliders; canopies are wider than trunks) */
function cineFrame(){
  const A=arena(), inw=V(A.x-edge.x,0,A.z-edge.z).normalize(), side=V(inw.z,0,-inw.x);
  let best=null;
  for(const sg of [-1,1])for(const dk of [1,.8,1.25]){ let hits=0;
    for(const k of [0,1]){ const D=(14.5-3.5*k)*dk, S=(4.5-1.5*k)*sg, cx=edge.x+inw.x*D+side.x*S, cz=edge.z+inw.z*D+side.z*S;
      for(let i=0;i<=16;i++){ const f=i/16, x=cx+(B.pos.x-cx)*f, z=cz+(B.pos.z-cz)*f; let near=G.collidersNear?G.collidersNear(x,z):[];
        for(const c of near){ if(c.r>3)continue; if(Math.hypot(c.x-x,c.z-z)<c.r+2.8){ hits++; break; } } } }
    const score=hits+(dk!==1?.5:0)+(sg>0?.2:0); if(!best||score<best.score)best={score,sg,dk}; }
  CINE.side=best.sg; CINE.dk=best.dk;
}
function cineStart(){
  if(CINE.seen||CINE.on)return; const p=P(); if(!p||!p.pos||G.state.mode!=='play')return;
  try{ cineFrame(); }catch(e){ CINE.side=-1; CINE.dk=1; }
  CINE.seen=true; CINE.on=true; CINE.t=0; CINE.skip=false;
  try{ p.setControl&&p.setControl(false); }catch(e){}
  const b=cineBars(); if(b){ b.style.visibility='visible'; b.style.opacity='1'; }
  addEventListener('keydown',cineSkipKey,true); addEventListener('pointerdown',cineSkipKey,true);
  G.emit('gloaming:cine',{on:true});
}
function cineEnd(){
  if(!CINE.on)return; CINE.on=false;
  removeEventListener('keydown',cineSkipKey,true); removeEventListener('pointerdown',cineSkipKey,true);
  if(CINE.bars){ const w=CINE.bars; w.style.opacity='0'; setTimeout(()=>{ if(!CINE.on)w.style.visibility='hidden'; },420); } // (hidden outright once faded: no lingering bars where frames are throttled)
  const p=P();
  if(p&&p.pos&&G.state.mode==='play'){ // face it: the follow camera snaps in behind the Traveler, looking at the Gloaming
    // still in the doorway? step out onto the apron so the camera behind isn't pressed against the tower wall
    const L=tower(), rx=p.pos.x-L.x, rz=p.pos.z-L.z, rd=Math.hypot(rx,rz), want=(L.outerR||4.2)+7;
    if(rd<want&&rd>.5&&!playerInTower()){ const nx=L.x+rx/rd*want, nz=L.z+rz/rd*want; if(onPlateau(nx,nz)){ p.pos.x=nx; p.pos.z=nz; p.pos.y=ground(nx,nz,plateauY()+2); } }
    const yaw=Math.atan2(B.pos.x-p.pos.x,B.pos.z-p.pos.z); try{ p.teleport(p.pos.x,p.pos.y,p.pos.z,yaw); }catch(e){}
    // and level the camera (it may still be pitched down from the stairwell) so the whole shape is in frame
    try{ if(p.aimCamera)p.aimCamera(yaw,.04); }catch(e){} }
  try{ p&&p.setControl&&p.setControl(true); }catch(e){}
  G.emit('gloaming:cine',{on:false});
}
const SKIP_ACTS=['attack','jump','interact','roll','lock','sprint','shutter','potion','pause'];
function cineCamera(dt){
  if(!CINE.on)return;
  if(G.state.mode!=='play'||B.state!=='intro'){ cineEnd(); return; }
  CINE.t+=dt;
  if(CINE.t>.25&&G.input&&G.input.pressed){ for(const a of SKIP_ACTS){ try{ if(G.input.pressed(a)){ CINE.skip=true; break; } }catch(e){} } }
  if(CINE.skip||CINE.t>=CINE.dur){ cineEnd(); return; }
  const A=arena(), inw=_u.set(A.x-edge.x,0,A.z-edge.z).normalize(), side=_s.set(inw.z,0,-inw.x);
  const k=U.smooth(0,CINE.dur,CINE.t), y0=plateauY();
  const D=(14.5-3.5*k)*CINE.dk, S=(4.5-1.5*k)*CINE.side;   // close and low, looking up: it towers against the sky (and no trees get between)
  CINE.cp.set(edge.x+inw.x*D+side.x*S,y0+1.5+.8*k,edge.z+inw.z*D+side.z*S);
  CINE.lp.set(B.pos.x,y0+2.5+4.5*B.rise,B.pos.z);
  G.camera.position.copy(CINE.cp); G.camera.lookAt(CINE.lp); G.camera.updateMatrixWorld();
}
G.system('gloamingCam',{order:84,modes:['play','dead'],update:dt=>{ try{ cineCamera(dt); }catch(e){ CINE.on=true; cineEnd(); } }}); // after player.js's camera (80), before the HUD shake (90)

function resetFight(quiet){
  B.hp=T.hp; B.phase=1; B.solidT=0; B.solidK=0; B.staggerT=0; B.gutterT=0; B.warn=0; B.flash=0; B.fade=1; B.atk=null; B.cool=2.2;
  B.lean=0; B.recoil=0; B.called=[false,false]; B.phase2T=0; B.lastCross=-99; B.dieBurst=false; B.bossDeadSent=false; B.withdraw=0; B.fogThin=0;
  for(const r of roots){ r.hp=T.rootHp; r.cut=false; r.grow=0; r.live=0; r.delay=0; r.active=false; r.hit=0; if(r.ring)r.ring.visible=false; }
  for(const ar of arms){ ar.mode='rest'; ar.k=0; ar.hand=0; ar.hardT=0; ar.hp=0; }
  if(B.built){ decals.forEach(freeDecal); sector.visible=false; tenMesh.visible=false; spill.visible=false; }
  clearHollows();
  if(!quiet){ B.state='idle'; hideAll(); ui('bossBar',null); music(false); }
}
function clearHollows(){ for(const m of hollows){ try{ if(m.alive&&G.monsters&&G.monsters.despawn)G.monsters.despawn(m,true); }catch(e){} } hollows.length=0; }
const beats=[]; const later=(s,fn)=>beats.push({t:G.time+s,fn});
function runBeats(){ for(let i=beats.length-1;i>=0;i--){ if(G.time>=beats[i].t){ const b=beats.splice(i,1)[0]; try{b.fn();}catch(e){console.error('gloaming beat',e);} } } }

/* ---------------------------------------------------------------- hits */
function hitBody(info){
  if(!active()||B.state==='intro'||B.state==='dying')return;
  if(info&&info.kind==='swarm')return;
  const hp=heartPos(_w);
  if(!solid()){
    // through the fog: a soft puff where the staff passed
    const p=P(), at=p&&p.pos?V(U.lerp(p.pos.x,B.pos.x,.55),p.pos.y+1.2,U.lerp(p.pos.z,B.pos.z,.55)):hp;
    for(let k=0;k<10;k++)mistPuff(at.x,at.y,at.z,(rnd()-.5)*3,.6+rnd()*1.4,(rnd()-.5)*3,.8+rnd()*.6,.6,1.8,.55,C_PALE);
    if(G.time-B.hitT>.25)SND.whff(at); B.hitT=G.time;
    if(!B.said.through)later(.3,()=>say('through','The staff passes through it like breath on a cold morning. Wait for the beam to come round.',{key:'through'}));
    return;
  }
  // one swing sweeps the tall cylinder once
  if(G.time-B.hitT<.12&&info.kind===B.hitKind)return; B.hitT=G.time; B.hitKind=info.kind;
  let d=(info.damage||1)*(B.staggerT>0?T.staggerMul:1);
  damage(d,info,hp);
}
function hitHand(ar,info){
  if(!active()||ar.hardT<=0||(info&&info.kind==='swarm'))return;
  const d=Math.min((info.damage||1)*T.handMul,T.handCap-ar.hp); if(d<=0)return;
  ar.hp+=d; ar.hand=Math.min(1.6,ar.hand+.4);
  const p=ar.P[3]; damage(d,info,V(p.x,p.y+.6,p.z));
  if(ar.hp>=T.handCap-.01){ ar.hardT=Math.min(ar.hardT,.2); for(let k=0;k<16;k++)mistPuff(p.x,p.y+.5,p.z,(rnd()-.5)*5,1+rnd()*2,(rnd()-.5)*5,1,.6,2,.6,C_PALE); }
}
function hitRoot(r,info){
  if(!r.active||r.cut||(info&&info.kind==='swarm'))return;
  r.hp-=Math.max(1,info.damage||1); r.hit=1;
  const F=FX(); if(F&&F.splash)F.splash(V(r.pos.x,r.pos.y+.8,r.pos.z),info.dir||V(0,0,1),.8);
  SND.hurt(r.pos);
  if(r.hp<=0){ r.cut=true; SND.cut(r.pos); ui('shake',.25);
    const I=INK(); if(I&&I.burst)I.burst(V(r.pos.x,r.pos.y+.6,r.pos.z),{n:30,speed:3,size:[.4,1.4],life:[.6,1.3],up:1.6,embers:14,drops:8});
    const left=roots.filter(q=>!q.cut).length;
    ui('toast','Root cut',left?left+' left':'It staggers!');
    if(!left)stagger(); }
}
function damage(d,info,pos){
  B.hp=Math.max(0,B.hp-d); B.flash=1; B.recoil=Math.min(1,B.recoil+.35);
  const F=FX(); if(F&&F.splash)F.splash(pos,(info&&info.dir)||V(0,0,1),1.2);
  ui('shake',.15); SND.hurt(pos);
  if(B.phase===1&&B.hp<=T.hp*.5)enterPhase2();
  if(B.hp<=0)startDying();
}
function stagger(){
  B.staggerT=T.staggerT; B.atk=null; endAttackVisuals(); B.solidT=0;
  tenMesh.visible=roots.some(r=>r.live>.01);
  G.emit('gloaming:solid',{stagger:true}); SND.solid(heartPos(_w)); ui('shake',.6);
  say('stagger','Cut off from the tower, it reels. The whole of it hardens — strike now!',{priority:'high'});
}

/* ---------------------------------------------------------------- phase 2 */
function enterPhase2(){
  B.phase=2; B.phase2T=0; B.cool=Math.max(B.cool,1.6);
  roots.forEach((r,i)=>{ r.active=true; r.hp=T.rootHp; r.cut=false; r.grow=0; r.live=0; r.delay=1.2+i*T.climbGap; r.ring.visible=true; });
  tenMesh.visible=true;
  G.emit('gloaming:phase',{n:2}); SND.tendril(tower()); ui('shake',.45);
  say('phase2','It turns from you to the tower. Tendrils of fog are climbing toward the lamp — cut their roots at the tower’s foot!',{priority:'high'});
  ui('toast','It reaches for the lamp','Cut the roots at the tower’s foot');
}
function updateTendrils(dt){
  if(B.phase<2){ return; }
  let any=false;
  const climbing=B.staggerT<=0&&B.state==='fight';
  for(const r of roots){
    r.hit=Math.max(0,r.hit-dt*4);
    if(r.cut){ r.live=Math.max(0,r.live-dt*1.6); r.grow=Math.max(0,r.grow-dt*.5); r.ring.visible=false; }
    else if(r.active){
      r.live=Math.min(1,r.live+dt*2);
      if(r.delay>0)r.delay-=dt;
      else if(climbing){ r.grow+=dt/T.climbT;
        if(r.grow>=1){ r.grow=0; r.delay=T.regrowT; gutter(r); } }
      r.ring.visible=true; const u=r.ring.material.uniforms; u.uA.value=.55+.35*Math.sin(G.time*4+r.i)+r.hit; u.uK.value=1;
      if(rnd()<dt*6){ const a=rnd()*TAU; mistPuff(r.pos.x+Math.cos(a)*.8,r.pos.y+.2,r.pos.z+Math.sin(a)*.8,0,.8+rnd(),0,1.2,.5,1.4,.5); }
    }
    if(r.live>.005)any=true;
  }
  tenMesh.visible=any;
  const u=tenMat.uniforms; for(let i=0;i<NTEN;i++){ const r=roots[i]; u.uGrow.value[i]=r.cut?Math.max(r.grow,.05):Math.max(.0,r.grow*.97+.03*Math.min(1,r.live)); u.uLive.value[i]=r.live; u.uHit.value[i]=r.hit; }
}
function gutter(r){
  B.gutterT=T.gutterT; const LB=G.lighthouse&&G.lighthouse.beam; if(LB&&LB.gutter)LB.gutter(T.gutterT); B.solidT=0; G.emit('gloaming:gutter',{root:r.i}); SND.gutter(lampPos());
  say('gutter','A tendril reaches the lamp and the beam gutters — without the light it cannot be touched. Cut the roots!',{priority:'high'});
  ui('toast','The beam gutters','Cut the roots');
}

/* ---------------------------------------------------------------- the beam on it */
function updateBeam(dt){
  const y=beamYaw();
  const L=tower(), b=Math.atan2(B.pos.x-L.x,B.pos.z-L.z);
  // closing speed of the beam on its bearing (the beam turns, and the Gloaming drifts round the tower too)
  if(B.yawPrev!=null&&dt>0){ const w=(U.angDiff(y,B.yawPrev)-U.angDiff(b,B.bPrev))/dt; if(isFinite(w)&&Math.abs(w)<6)B.omega=U.damp(B.omega,w,4,dt); }
  B.yawPrev=y; B.bPrev=b;
  let s=U.angDiff(b,y); s=((s+PI*.5)%PI+PI)%PI-PI*.5;               // two-sided beam: fold to (-PI/2, PI/2]
  const lit=beamLit()&&B.gutterT<=0;
  B.tt=Math.abs(B.omega)>.02?s/B.omega:99; if(B.tt<0)B.tt+=PI/Math.max(.02,Math.abs(B.omega));
  B.warn=U.damp(B.warn,lit&&B.tt<T.warnT&&B.solidT<=0?1-B.tt/T.warnT:0,8,dt);
  if(lit&&Math.abs(s)<T.crossTol&&G.time-B.lastCross>1.5&&B.state==='fight'){
    B.lastCross=G.time; B.solidT=Math.max(B.solidT,T.solidT); B.recoil=1; B.flash=Math.max(B.flash,.6);
    if(B.atk&&B.atk.phase==='wind'){ B.atk=null; endAttackVisuals(); }   // the light breaks the windup
    G.emit('gloaming:solid',{stagger:false}); SND.solid(heartPos(_w));
    if(!B.said.solid)later(.2,()=>say('solid','The beam sweeps across it and for a moment it is solid — a shape of wet stone-grey, its ink heart glowing. Strike!',{priority:'high'}));
  }
}

/* ---------------------------------------------------------------- attacks */
function chooseAttack(){
  const p=P(); if(!playerOK()||playerInTower())return;
  const pp=p.pos, d=Math.hypot(pp.x-B.pos.x,pp.z-B.pos.z);
  // don't start what the beam would interrupt
  const len=B.phase>1?1.6:1.9; if(B.tt<len&&beamLit()&&B.gutterT<=0)return;
  // hollows: once per phase
  const ph=B.phase-1;
  if(!B.called[ph]&&(B.phase===1?B.hp<=T.hp*.78||B.st>32:B.phase2T>14||B.hp<=T.hp*.3)){ callHollows(); return; }
  const r=rnd();
  if(d<T.sweepR1-1.5&&r<(B.phase>1?.42:.38))startSweep(pp);
  else if(B.phase>1&&r>.6)startSlam(pp,true);
  else startSlam(pp,false);
}
function startSlam(pp,double){
  const p=P(), lead=p&&p.vel?.35:0;
  const tgt=V(pp.x+(p.vel?p.vel.x*lead:0),0,pp.z+(p.vel?p.vel.z*lead:0)); tgt.y=ground(tgt.x,tgt.z,pp.y+3);
  const wind=B.phase>1?T.slamWind2:T.slamWind;
  const ar=arms[rnd()<.5?0:1];
  B.atk={kind:'slam',phase:'wind',t:0,wind,arms:[{ar,tgt,d:decal('slam',tgt.x,tgt.z,T.slamR,wind),done:false,delay:0}]};
  if(double){ const o=arms[ar.i?0:1]; const a=rnd()*TAU, t2=V(pp.x+Math.sin(a)*3.4,0,pp.z+Math.cos(a)*3.4); t2.y=ground(t2.x,t2.z,pp.y+3);
    if(onPlateau(t2.x,t2.z))B.atk.arms.push({ar:o,tgt:t2,d:decal('slam',t2.x,t2.z,T.slamR,wind+.45),done:false,delay:.45}); }
  for(const s of B.atk.arms){ s.ar.mode='raise'; s.ar.target.copy(s.tgt); }
  G.emit('gloaming:telegraph',{kind:'slam',pos:tgt.clone(),lead:wind}); SND.wind(tgt);
}
function startSweep(pp){
  const th=yawTo(B.pos,pp), sign=rnd()<.5?1:-1;
  B.atk={kind:'sweep',phase:'wind',t:0,wind:T.sweepWind,th0:th-sign*T.sweepArc*.5,th1:th+sign*T.sweepArc*.5,sign,ar:arms[sign>0?0:1],hit:new Set()};
  B.atk.ar.mode='sweepWind';
  sector.visible=true; sector.position.set(B.pos.x,ground(B.pos.x,B.pos.z,plateauY()+4)+.08,B.pos.z);
  const u=sector.material.uniforms; u.uR0.value=T.sweepR0; u.uR1.value=T.sweepR1; u.uTh0.value=Math.min(B.atk.th0,B.atk.th1); u.uTh1.value=Math.max(B.atk.th0,B.atk.th1); u.uA.value=0; u.uK.value=sign>0?0:1;
  G.emit('gloaming:telegraph',{kind:'sweep',pos:B.pos.clone(),lead:T.sweepWind}); SND.wind(B.pos);
  if(!B.said.sweep)later(.2,()=>say('sweep','It draws a long arm back low across the stone — jump it, or roll through.',{priority:'high'}));
}
function callHollows(){
  B.called[B.phase-1]=true;
  const p=P(), pp=p.pos, alive=hollows.filter(m=>m.alive&&!m.dying).length;
  const n=Math.max(0,Math.min(T.callN[B.phase-1],T.maxHollows-alive));
  B.atk={kind:'call',phase:'wind',t:0,wind:1.6}; SND.call(B.pos);
  for(const ar of arms)if(!ar.big)ar.mode='call';
  if(!n)return;
  const A=arena(), zone={name:'finale',x:A.x,z:A.z,r:A.r};
  for(let i=0;i<n;i++){
    let x=0,z=0,ok=false;
    for(let k=0;k<20&&!ok;k++){ const a=yawTo(pp,B.pos)+(i-(n-1)/2)*1.1+(rnd()-.5)*.6, r=7+rnd()*3; x=pp.x+Math.sin(a)*r; z=pp.z+Math.cos(a)*r;
      ok=onPlateau(x,z)&&Math.hypot(x-A.x,z-A.z)<A.r+4&&Math.hypot(x-tower().x,z-tower().z)>6; }
    if(!ok){ x=A.x+(rnd()-.5)*10; z=A.z+(rnd()-.5)*10; }
    later(.5+i*.35,()=>{ if(!active()||B.state==='dying')return;
      try{ if(G.monsters&&G.monsters.spawn){ const m=G.monsters.spawn('hollow',{x,z},{zone,aggro:true,intro:true}); if(m){ m.gloaming=true; hollows.push(m); } } }catch(e){ console.error('gloaming hollow',e); }
      for(let k=0;k<18;k++){ const a=rnd()*TAU; mistPuff(x+Math.cos(a)*1.2,ground(x,z)+.3,z+Math.sin(a)*1.2,Math.cos(a)*.6,1+rnd()*1.5,Math.sin(a)*.6,1.4,.8,2.4,.55); } });
  }
  say('call'+B.phase,'It draws up shapes out of the fog — Hollows, crawling from the mist at its hem.',{key:'call'});
}
function endAttackVisuals(){ decals.forEach(freeDecal); if(sector)sector.visible=false; for(const ar of arms){ if(ar.mode!=='rest'&&ar.hardT<=0)ar.mode='rest'; } }
function updateAttack(dt){
  const A=B.atk; if(!A)return;
  A.t+=dt;
  if(A.kind==='slam'){
    let all=true;
    for(const s of A.arms){
      const tl=A.t-s.delay, wind=A.wind;
      if(s.d&&s.d.busy){ const u=s.d.m.material.uniforms; u.uK.value=U.clamp(tl/wind,0,1); u.uA.value=Math.min(1,Math.max(0,tl)*3)*(.75+.25*Math.sin(G.time*14)); }
      if(!s.done){ all=false; s.ar.k=U.clamp(tl/wind,0,1);
        if(tl>=wind){ s.ar.mode='fall'; s.ar.k=0; }
        if(tl>=wind+T.slamFall){ s.done=true; s.ar.mode='hard'; s.ar.hardT=T.handLinger; s.ar.hp=0; s.ar.hand=1.4; slamImpact(s); freeDecal(s.d); s.d=null; } }
    }
    if(all&&A.t>A.wind+T.slamFall+.45+(A.arms.length>1?.45:0)){ B.atk=null; B.cool=lerpR(B.phase>1?T.idle2:T.idle); }
    A.phase=A.arms.every(s=>s.done)?'recover':A.arms.some(s=>A.t-s.delay>=A.wind)?'strike':'wind';
  }else if(A.kind==='sweep'){
    const u=sector.material.uniforms;
    if(A.phase==='wind'){ A.ar.k=U.clamp(A.t/A.wind,0,1); u.uA.value=Math.min(1,A.t*3)*(.7+.3*Math.sin(G.time*14)); u.uK.value=A.sign>0?0:1;
      if(A.t>=A.wind){ A.phase='strike'; A.t=0; A.ar.mode='sweep'; SND.slam(B.pos); ui('shake',.25); } }
    else if(A.phase==='strike'){ const k=U.smooth(0,1,A.t/T.sweepDur), th=U.lerp(A.th0,A.th1,k); A.ar.k=k; A.th=th;
      u.uK.value=A.sign>0?k:1-k; u.uA.value=1-k*.6;
      const gy=ground(B.pos.x,B.pos.z,plateauY()+4);
      for(let r=T.sweepR0+.5;r<=T.sweepR1;r+=1.4){ const x=B.pos.x+Math.sin(th)*r, z=B.pos.z+Math.cos(th)*r;
        G.combat&&G.combat.strike({x,y:gy+.5,z,radius:.95,team:'enemy',damage:T.sweepDmg,knockback:11,kind:'melee',source:bodyHB,exclude:A.hit});
        if(rnd()<.25)mistPuff(x,gy+.3,z,Math.cos(th)*A.sign*3,1+rnd(),-Math.sin(th)*A.sign*3,.8,.6,1.8,.5); }
      if(A.t>=T.sweepDur){ A.phase='recover'; A.t=0; sector.visible=false; A.ar.mode='rest'; } }
    else if(A.t>.7){ B.atk=null; B.cool=lerpR(B.phase>1?T.idle2:T.idle); }
  }else if(A.kind==='call'){
    if(A.t>=A.wind){ for(const ar of arms)if(ar.mode==='call')ar.mode='rest'; B.atk=null; B.cool=lerpR(T.idle); }
  }
}
const lerpR=a=>U.lerp(a[0],a[1],rnd());
function slamImpact(s){
  const t=s.tgt;
  G.combat&&G.combat.strike({x:t.x,y:t.y+.8,z:t.z,radius:T.slamR-.15,team:'enemy',damage:T.slamDmg,knockback:10,kind:'melee',source:bodyHB});
  SND.slam(t); ui('shake',.35);
  const F=FX(); if(F&&F.puff)for(let k=0;k<30;k++){ const a=rnd()*TAU, sp=2+rnd()*4; F.puff(t.x+Math.cos(a)*T.slamR*.6,t.y+.2,t.z+Math.sin(a)*T.slamR*.6,Math.cos(a)*sp,.6+rnd()*1.4,Math.sin(a)*sp,.9+rnd()*.5,.6,2.2,.6,C_MIST,0,2.2); }
  const I=INK(); if(I&&I.burst)I.burst(V(t.x,t.y+.2,t.z),{n:10,speed:2,size:[.3,.9],life:[.4,.9],up:.6,embers:6,drops:3});
  if(!B.said.hand)later(.4,()=>say('hand','Where the hand struck the stone the fog has hardened. Hit it before it melts away.',{key:'hand'}));
}

/* ---------------------------------------------------------------- movement + pose */
function postFor(){
  const L=tower(), p=P(), A=arena();
  const R=B.phase>1?T.postR2:T.postR;
  let a=p&&p.pos?Math.atan2(p.pos.x-L.x,p.pos.z-L.z):-PI/2;
  const cur=Math.atan2(B.pos.x-L.x,B.pos.z-L.z);
  a=cur+U.clamp(U.angDiff(a,cur),-.9,.9);   // drift round toward the player's side, never jump across
  for(let k=0;k<12;k++){ const x=L.x+Math.sin(a)*R, z=L.z+Math.cos(a)*R;
    const cot=LM().cottage, shed=LM().shed;
    const clear=onPlateau(x,z)&&(!cot||Math.hypot(x-cot.x,z-cot.z)>8)&&(!shed||Math.hypot(x-shed.x,z-shed.z)>6)&&Math.hypot(x-A.x,z-A.z)<A.r;
    if(clear)return V(x,plateauY(),z);
    a+=(k%2?1:-1)*(k+1)*.22; }
  return V(L.x+Math.sin(cur)*R,plateauY(),L.z+Math.cos(cur)*R);
}
function updateMove(dt){
  if(B.state!=='fight')return;
  const slow=solid()?.25:B.atk?.35:1;
  const tgt=postFor(); _t.subVectors(tgt,B.pos); _t.y=0; const d=_t.length();
  if(d>.3){ _t.multiplyScalar(Math.min(1,T.speed*slow*U.clamp(d/5,1,3)*dt/d)); B.pos.add(_t); }
  B.pos.y=U.damp(B.pos.y,ground(B.pos.x,B.pos.z,plateauY()+5),4,dt);
  const p=P(), face=B.atk&&B.atk.kind==='sweep'&&B.atk.th!=null?B.atk.th:(p&&p.pos?yawTo(B.pos,p.pos):B.facing);
  B.facing=U.dampAngle(B.facing,face,2.2,dt);
  // the solid body doesn't let you stand inside it
  if(solid()&&p&&p.pos&&playerOK()){ const dx=p.pos.x-B.pos.x, dz=p.pos.z-B.pos.z, dd=Math.hypot(dx,dz);
    if(dd<2.4&&dd>1e-3&&G.moveCharacter){ G.moveCharacter(p.pos,dx/dd*(2.4-dd)*Math.min(1,dt*8),dz/dd*(2.4-dd)*Math.min(1,dt*8),p.radius||.38,'player'); } }
}
function armPose(ar,t,dt){
  const f=dirOf(B.facing,_f), s=_s.set(f.z,0,-f.x), up=1-B.rise, by=B.pos.y-up*16;
  const gy=ground(B.pos.x,B.pos.z,plateauY()+5);
  const P0=ar.P[0], P1=ar.P[1], P2=ar.P[2], P3=ar.P[3];
  const sh=ar.big?7.6:5.8+(ar.i%3)*.6, sw=ar.big?2.4:1.9+(ar.i>3?.5:0);
  P0.set(B.pos.x,by+sh-B.recoil*.5,B.pos.z).addScaledVector(s,sw*ar.side).addScaledVector(f,ar.big?.3:-.2);
  const w=Math.sin(t*.9+ar.ph), w2=Math.sin(t*1.3+ar.ph*1.7);
  // rest: hanging down and out, writhing
  const out=ar.big?4.6:3.6+(ar.i%2)*.6, fw=ar.big?2.2:(ar.i<4?1.2:-1.4);
  _t.copy(P0).addScaledVector(s,ar.side*(out+w*.7)).addScaledVector(f,fw+w2*.8); _t.y=Math.max(gy+.9,by+(ar.big?1.6:2.2)+w2*.6);
  let tip=_t.clone(), c1=P0.clone().addScaledVector(s,ar.side*1.4).add(V(0,1.1,0)), c2=tip.clone().lerp(P0,.45).add(V(0,1.8,0));
  let hand=ar.big?.25:0;
  if(B.state==='dying'){ tip.set(P0.x+s.x*ar.side*1.5,by+T.H+5+ar.i*.7+w*.8,P0.z+s.z*ar.side*1.5); c1.copy(P0).add(V(0,2,0)); c2.copy(tip).add(V(0,-2.5,0)); }
  else if(ar.mode==='grip'){ // intro: hands on the cliff edge, pulling
    const e=edge, k=U.smooth(.3,1.6,B.st);
    tip.set(e.x+s.x*ar.side*(ar.big?3.6:5.2)+f.x*(ar.big?2.2:1),e.y+.3,e.z+s.z*ar.side*(ar.big?3.6:5.2)+f.z*(ar.big?2.2:1)).lerp(_t,1-k);
    c1.copy(P0).add(V(0,2.6,0)).addScaledVector(f,1.5); c2.copy(tip).add(V(0,3.2,0)); hand=ar.big?.8:.3;
  }else if(ar.mode==='raise'){ // the slam windup: the hand climbs over its mark
    const k=U.smooth(0,1,ar.k); const hi=ar.target.clone().add(V(0,9.5+Math.sin(t*6)*.2,0)).lerp(P0,.18);
    tip.lerp(hi,k); c1.lerp(P0.clone().add(V(0,3.5,0)),k); c2.lerp(hi.clone().lerp(P0,.4).add(V(0,3.5,0)),k); hand=.4+k*.9;
  }else if(ar.mode==='fall'||ar.mode==='hard'){
    const k=ar.mode==='fall'?U.clamp(ar.k,0,1):1; const hi=ar.target.clone().add(V(0,9.5,0)).lerp(P0,.18), lo=ar.target.clone().add(V(0,.35,0));
    tip.copy(hi).lerp(lo,k*k); c1.copy(P0).add(V(0,3,0)); c2.copy(tip).lerp(P0,.45).add(V(0,2.5*(1-k)+1.2,0)); hand=ar.mode==='hard'?ar.hand:1.3;
  }else if(ar.mode==='sweepWind'||ar.mode==='sweep'){
    const A=B.atk; if(A&&A.kind==='sweep'){ const k=ar.mode==='sweep'?ar.k:0, th=ar.mode==='sweep'?U.lerp(A.th0,A.th1,k):A.th0-A.sign*.35*U.smooth(0,1,ar.k);
      const R=ar.mode==='sweep'?T.sweepR1-.5:T.sweepR1*.55, lift=ar.mode==='sweep'?.55:U.lerp(1.5,3.4,ar.k);
      tip.set(B.pos.x+Math.sin(th)*R,gy+lift,B.pos.z+Math.cos(th)*R);
      const mid=V(B.pos.x+Math.sin(th)*R*.5,gy+lift+1.2,B.pos.z+Math.cos(th)*R*.5);
      c1.copy(P0).lerp(mid,.35).add(V(0,1.5,0)); c2.copy(mid); hand=.6; }
  }else if(ar.mode==='call'){ tip.copy(P0).addScaledVector(s,ar.side*2.5).add(V(0,4.5+w,0)); c1.copy(P0).add(V(0,1.5,0)); c2.copy(tip).add(V(0,-1.5,0)); }
  // phase 2, the small arms reach toward the tower roots
  if(B.phase>1&&!ar.big&&ar.mode==='rest'&&B.state==='fight'){ const r=roots[ar.i%3]; if(r&&!r.cut){ const k=.55;
    tip.lerp(V(U.lerp(B.pos.x,r.pos.x,.6),gy+.6,U.lerp(B.pos.z,r.pos.z,.6)),k); c2.lerp(tip.clone().add(V(0,2,0)),k); } }
  // stagger / solid: everything pulls in a little
  if(B.staggerT>0){ tip.lerp(V(tip.x,gy+.4,tip.z),.6); }
  P1.copy(c1); P2.copy(c2); P3.copy(tip);
  // wobble along the length
  P1.x+=Math.sin(t*1.7+ar.ph)*.3; P1.z+=Math.cos(t*1.5+ar.ph)*.3; P2.x+=Math.sin(t*2.1+ar.ph*2)*.45; P2.y+=Math.sin(t*1.6+ar.ph)*.3;
  ar.hand=U.damp(ar.hand,hand,6,dt);
  if(ar.hb){ ar.hb.pos.set(P3.x,P3.y-.6,P3.z); }
}
function updateHands(dt){
  for(const ar of arms){ if(ar.hardT>0){ ar.hardT-=dt;
      if(rnd()<dt*8){ const p=ar.P[3]; mistPuff(p.x,p.y+.4,p.z,(rnd()-.5),.6+rnd(),(rnd()-.5),1,.5,1.4,.45); }
      if(ar.hardT<=0){ ar.mode='rest'; } } }
}

/* ---------------------------------------------------------------- render */
function render(dt){
  const t=G.time, L=tower(), lamp=lampPos();
  B.solidK=U.damp(B.solidK,solid()?1:0,solid()?14:3,dt);
  B.flash=Math.max(0,B.flash-dt*3); B.recoil=Math.max(0,B.recoil-dt*.9);
  const leanT=B.phase>1&&B.state==='fight'&&B.staggerT<=0?.35:0;
  B.lean=U.damp(B.lean,B.staggerT>0?-.3:leanT-B.recoil*.25,2,dt);
  const up=1-B.rise, by=B.pos.y-up*16;
  bodyHB.pos.set(B.pos.x,by,B.pos.z);
  B.introK=U.damp(B.introK||0,B.state==='intro'?1:0,1.2,dt);
  B.skyK=U.damp(B.skyK||0,(B.state==='intro'||CINE.on?1:.45)*(1-.6*B.solidK),2,dt);
  for(const m of [body,shell]){ m.position.set(B.pos.x,by,B.pos.z); m.rotation.y=B.facing; const u=m.material.uniforms;
    u.uAlpha.value=(m===shell?.26*(1-.75*B.solidK):.62)*(1+.9*B.introK);
    u.uSky.value=B.skyK*(m===shell?.55:1);
    u.uSolid.value=B.solidK*(m===shell?.5:1); u.uWarn.value=B.warn; u.uFlash.value=B.flash*(m===shell?.4:1); u.uFade.value=B.fade; u.uLean.value=B.lean;
    u.uLamp.value.copy(lamp); if(G.scene.fog)u.uFogC.value.copy(G.scene.fog.color); }
  body.scale.set(1+B.recoil*.04,1-(B.staggerT>0?.12:0)+(B.state==='dying'?U.smooth(0,T.dieT,B.st)*.5:0),1+B.recoil*.04);
  shell.scale.set(body.scale.x*1.16,body.scale.y*1.04,body.scale.z*1.16);
  // arms
  for(const ar of arms)armPose(ar,t,dt);
  const u=armMat.uniforms; for(const ar of arms){ for(let k=0;k<4;k++)u.uP.value[ar.i*4+k].copy(ar.P[k]); u.uR.value[ar.i]=ar.R*(ar.hardT>0?1.1:1); u.uHand.value[ar.i]=ar.hand; }
  const hard=arms.some(a=>a.hardT>0);
  u.uSky.value=B.skyK*.8;
  u.uSolid.value=Math.max(B.solidK,hard?.75:0); u.uWarn.value=B.warn; u.uFlash.value=B.flash; u.uFade.value=B.fade; u.uGround.value=plateauY()-.4; u.uLamp.value.copy(lamp); if(G.scene.fog)u.uFogC.value.copy(G.scene.fog.color);
  if(tenMat){ const v=tenMat.uniforms; v.uSolid.value=.6+B.solidK*.3; v.uWarn.value=B.gutterT>0?.8:0; v.uLamp.value.copy(lamp); v.uFade.value=B.fade; if(G.scene.fog)v.uFogC.value.copy(G.scene.fog.color); }
  // heart, hood, eyes
  const hp=heartPos(_w); heart.position.copy(hp); heart.rotation.y+=dt*.6; heart.rotation.x=Math.sin(t*.7)*.3;
  const beat=.5+.5*Math.pow(Math.max(0,Math.sin(t*(solid()?5:2.2))),3);
  heart.scale.setScalar((.85+.15*beat)*(B.state==='dying'?Math.max(.01,1-U.smooth(1,4,B.st)):1));
  if(heart.material.emissiveIntensity!=null)heart.material.emissiveIntensity=.25+B.solidK*1.4*beat+B.flash;
  heartGlow.position.copy(hp); heartGlow.material.opacity=(.12+.12*beat+B.solidK*(.6+.4*beat)+B.warn*.12)*B.fade; heartGlow.scale.setScalar(3.5+B.solidK*3.5*(.8+.2*beat));
  const f=dirOf(B.facing,_f), hy=by+T.H*.87+B.lean*-.6;
  hoodVoid.position.set(B.pos.x+f.x*(2.25+B.lean*2.2),hy,B.pos.z+f.z*(2.25+B.lean*2.2)); hoodVoid.material.opacity=.85*B.fade*(1-B.solidK*.3);
  const sd=_s.set(f.z,0,-f.x);
  eyes.forEach((e,i)=>{ e.position.copy(hoodVoid.position).addScaledVector(sd,(i?-1:1)*.42).addScaledVector(f,.3); e.position.y+=.1;
    const blink=Math.sin(t*.37+i*.1)>.985?0:1; e.material.opacity=(.45+B.solidK*.5+B.warn*.2)*blink*B.fade*B.rise; e.scale.setScalar(.34+B.solidK*.2); });
  // the light falling on it
  const sk=Math.max(B.solidK*(B.staggerT>0?.4:1),B.warn*.25,B.state==='dying'?U.smooth(0,1.2,B.st)*(1-U.smooth(T.dieT-1,T.dieT,B.st)):0);
  spill.visible=sk>.01&&beamLit();
  if(spill.visible){ _t.subVectors(hp,lamp); const len=_t.length(); spill.position.copy(lamp); spill.scale.set(3.4,len+2,3.4);
    spill.quaternion.setFromUnitVectors(V(0,-1,0),_t.normalize()); spill.material.opacity=.12*sk; }
  // mist trailing off the hem and the arms (shared ink pools: no extra draw calls)
  const F=FX(); if(F&&F.puff&&B.fade>.05){ const n=Math.round(dt*30*(B.state==='intro'?3:1.6));
    for(let k=0;k<n;k++){ const a=rnd()*TAU, r=2.5+rnd()*1.6; F.puff(B.pos.x+Math.cos(a)*r,Math.max(by,plateauY()-1)+rnd()*1.2,B.pos.z+Math.sin(a)*r,Math.cos(a)*.5,.5+rnd()*.9,Math.sin(a)*.5,1.6+rnd(),1,2.8,.32,C_MIST,0,.8);
      const ar=arms[(rnd()*NARM)|0], q=ar.P[3]; F.puff(q.x,q.y,q.z,(rnd()-.5)*.6,.3+rnd()*.5,(rnd()-.5)*.6,1,.4,1.3,.3,C_PALE,0,.9); } }
}

/* ---------------------------------------------------------------- the frame */
function updateFight(dt){
  B.st+=dt;
  if(B.state==='intro'){
    B.rise=U.smooth(0,T.introT*.75,B.st);
    // lurch in from the edge as it comes up
    const A=arena(); const inw=V(A.x-edge.x,0,A.z-edge.z).normalize();
    const k=U.smooth(T.introT*.45,T.introT,B.st); B.pos.set(edge.x+inw.x*(-1.5+k*6),plateauY(),edge.z+inw.z*(-1.5+k*6));
    if(B.st>T.introT*.6)for(const ar of arms)if(ar.mode==='grip')ar.mode='rest';
    if(B.st>=T.introT){ B.state='fight'; B.st=0; B.rise=1; B.cool=1.4; }
    ui('bossBar','The Gloaming',B.hp/T.hp);
    return;
  }
  if(B.state==='dying')return updateDying(dt);
  if(B.state!=='fight')return;
  if(B.phase>1)B.phase2T+=dt;
  B.solidT=Math.max(0,B.solidT-dt); B.gutterT=Math.max(0,B.gutterT-dt);
  if(B.staggerT>0){ B.staggerT-=dt; if(B.staggerT<=0){ B.cool=1.2; } }
  updateBeam(dt);
  updateMove(dt);
  updateTendrils(dt);
  updateHands(dt);
  if(solid()&&B.atk&&B.atk.phase==='wind'){ B.atk=null; endAttackVisuals(); }   // the light (or the stagger) breaks a windup
  updateAttack(dt);
  if(!B.atk&&!solid()){ B.cool-=dt; if(B.cool<=0&&playerOK()&&!playerInTower())chooseAttack(); }
  for(let i=hollows.length-1;i>=0;i--)if(!hollows[i].alive)hollows.splice(i,1);
  ui('bossBar','The Gloaming',B.hp/T.hp);
  if(B.solidT<=0&&B.staggerT<=0&&!B.said.wait&&B.st>14&&B.hp>=T.hp)say('wait','It can’t be struck in the fog. Watch the turning beam — its edge glows warm just before the light finds it.',{key:'wait'});
}
function startDying(){
  if(B.state==='dying')return;
  B.state='dying'; B.st=0; B.atk=null; endAttackVisuals(); B.solidT=0; B.staggerT=0;
  for(const r of roots){ if(!r.cut){ r.cut=true; } r.ring.visible=false; }
  for(const ar of arms){ ar.mode='rest'; ar.hardT=0; }
  ui('bossBar','The Gloaming',0); ui('shake',.8); SND.death(heartPos(_w));
  G.emit('gloaming:dying',{});
  for(const m of hollows){ try{ if(m.alive&&!m.dying&&G.monsters&&G.monsters.kill)G.monsters.kill(m,{}); }catch(e){} }
}
function updateDying(dt){
  const st=B.st;
  B.fade=1-U.smooth(.8,T.dieT-.6,st); B.fogThin=U.smooth(0,2,st);
  B.pos.y+=dt*U.smooth(.5,3,st)*2.2;     // drawn up into the beam
  updateTendrils(dt);
  const F=FX(), lamp=lampPos(), hp=heartPos(_w);
  if(F&&F.puff&&B.fade>0){ for(let k=0;k<Math.round(dt*30*6);k++){ const y=B.pos.y+rnd()*T.H, a=rnd()*TAU, r=rnd()*3;
      const x=B.pos.x+Math.cos(a)*r, z=B.pos.z+Math.sin(a)*r; _t.set(lamp.x-x,lamp.y-y,lamp.z-z).normalize().multiplyScalar(2+rnd()*4);
      F.puff(x,y,z,_t.x,_t.y+1,_t.z,1.6+rnd(),1,3.2,.4*B.fade,rnd()<.5?C_PALE:C_MIST,0,.4);
      if(rnd()<.3&&F.ember)F.ember(x,y,z,_t.x*.6,_t.y*.6+1,_t.z*.6,1.2,.25); } }
  if(st>2.2&&!B.dieBurst){ B.dieBurst=true; const I=INK(); if(I&&I.burst)I.burst(hp,{n:60,speed:4,size:[.8,2.4],life:[1,2.2],up:3,embers:60,drops:0}); ui('shake',.5); }
  if(st>3.2&&!B.bossDeadSent){ B.bossDeadSent=true; finish(); }
  if(st>=T.dieT){ B.state='dead'; hideAll(); }
}
function finish(){
  B.defeated=true; try{ G.flag&&G.flag('gloamingDead',true); }catch(e){}
  ui('bossBar',null); music(false);
  later(.4,()=>ui('say','It goes up into the light like breath on glass and is gone. All across the island the fog thins, and for a moment you can see the whole of the sea.'));
  G.emit('monster:killed',{kind:'gloaming',pos:B.pos.clone(),boss:true});
  G.emit('boss:dead',{who:'gloaming'});
}
let fogK=0, fogT=0;
function updateFog(dt){ // the fog thins over the island for a while after it dies (after world.js/fog.js set it this frame)
  if(B.state==='dying')fogT=9; else fogT=Math.max(0,fogT-dt);
  const want=B.state==='dying'?B.fogThin:fogT>0?1:0;
  fogK=U.damp(fogK,want,want>fogK?2:.35,dt);
  // the rise: the fog draws back from it while it comes up, and settles again over a few seconds once the fight starts
  CINE.fogK=U.damp(CINE.fogK,(B.state==='intro'||CINE.on)?1:0,(B.state==='intro'||CINE.on)?1.5:.5,dt);
  const k=Math.max(fogK,CINE.fogK*.85);
  if(k>.002&&G.scene.fog&&G.scene.fog.density!=null)G.scene.fog.density*=1-.6*k;
}

/* player death: withdraw now, reset when they rise, come again a few seconds later */
G.on('player:dead',()=>{ if(!active()||B.state==='dying')return; B.atk=null; if(B.built)endAttackVisuals(); B.withdraw=1; });
G.on('player:respawn',()=>{
  if(!B.built||B.defeated||!(active()||B.respawnT>0))return;
  if(B.state==='dying')return;
  resetFight(false);
  B.respawnT=T.respawnDelay;
});
G.on('finale:start',()=>{ try{ start(false); }catch(e){ console.error('gloaming start',e); } });

G.system('finaleBoss',{order:43,modes:['play','dead'],
  update(dt){
    if(!B.built)return;
    runBeats();
    if(B.respawnT>0&&G.state.mode==='play'){ B.respawnT-=dt; if(B.respawnT<=0){ B.respawnT=-1; start(false); } }
    if(B.state==='idle'){ updateFog(dt); return; }
    if(B.state==='dead'){ updateFog(dt); return; }
    if(G.state.mode==='play'&&B.withdraw<=0)updateFight(dt);
    else if(B.withdraw>0){ B.warn=U.damp(B.warn,0,4,dt); B.solidT=Math.max(0,B.solidT-dt); }
    if(B.state!=='idle'&&B.state!=='dead')render(dt);
    if(B.gutterT>0&&!(G.lighthouse&&G.lighthouse.beam&&G.lighthouse.beam.gutter))gutterBeam(Math.min(1,B.gutterT*2,(T.gutterT-B.gutterT)*4));
    updateFog(dt);
  }
});

/* ---------------------------------------------------------------- API */
G.finaleBoss={
  start:()=>start(true), reset:()=>{ resetFight(false); B.respawnT=-1; },
  get active(){ return active(); }, get hp(){ return B.hp; }, get maxHp(){ return T.hp; }, get solid(){ return solid(); },
  get state(){ return B.state; }, get phase(){ return B.phase; }, get defeated(){ return B.defeated; }, T,
  debug:{ B, roots, arms, hollows, get bodyHB(){ return bodyHB; }, beamYaw, beamLit, heartPos:()=>heartPos(V()),
    solidNow:(t)=>{ B.solidT=t==null?T.solidT:t; B.lastCross=G.time; },
    setHp:h=>{ B.hp=h; if(B.phase===1&&B.hp<=T.hp*.5)enterPhase2(); if(B.hp<=0)startDying(); },
    attack:k=>{ const p=G.player.pos; B.atk=null; endAttackVisuals(); if(k==='sweep')startSweep(p); else if(k==='call'){ B.called[B.phase-1]=false; callHollows(); } else startSlam(p,k==='double'); },
    setVisible:v=>{ if(!B.built)return; if(v)showAll(); else hideAll(); },
    skipIntro:()=>{ if(B.state==='intro'){ B.st=T.introT; } },
    cine:CINE, skipCine:()=>{ if(CINE.on){ CINE.skip=true; CINE.t=Math.max(CINE.t,.3); } } }
};
})();
