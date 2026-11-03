/* =====================================================================
   BRAVE QUEST: LIGHTHOUSE — creatures.js  (Creatures agent)
   Moth swarm, corruption patches, passive negatives (the Shadows),
   Halloran (one of the Unmade).
   API: G.creatures = {lanternCount, swarmAt(pos,r), freed, total, negatives, halloran, ash(pos,n,spread),
        moths, toPatch(m), toRoost(m), setRoost([{p,n}]), roost, clingR (null | max swarm radius, set per frame by cave_puzzles)}
   Moth states (m.tgt): glass spot lantern hunt lamp patch wander satchel feed gone + roost (cave) jar (moth jar).
   Post-cure hunting: a corrupt hurtbox with hb.mothPrey (bool|fn) draws the swarm (hb.mothRange m, hb.mothWant n, hb.mothDamage).
   ===================================================================== */
(function(){
'use strict';
const G=window.G, THREE=G.THREE, U=G.U, PI=Math.PI, TAU=PI*2;
const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const rnd=U.rng(4242);
const H=(x,z)=>{try{const h=G.world.height(x,z);return isFinite(h)?h:0;}catch(e){return 0;}};
const LM=()=>(G.world&&G.world.landmarks)||{};
const isPlay=()=>G.state.mode==='play';
function lmPoint(key,def){
  const p=LM()[key];
  if(p&&isFinite(p.x)&&isFinite(p.z))return {x:p.x,y:isFinite(p.y)?p.y:H(p.x,p.z),z:p.z,r:p.r||def.r};
  return {x:def.x,y:H(def.x,def.z),z:def.z,r:def.r};
}
const lantern=()=>G.items&&G.items.lantern;

/* ---------------------------------------------------------------- lighthouse geometry */
let fallbackLH=null, geoCache=null, geoFor=null;
function getLH(){
  const L=G.world.lighthouse;
  if(L&&L.lampCenter&&L.doorOut&&L.doorIn)return L;
  if(fallbackLH)return fallbackLH;
  const lp=lmPoint('lighthouse',{x:180,z:0});
  const x=lp.x,z=lp.z,baseY=lp.y||42,topY=baseY+20,outerR=4.4,innerR=3.9,colR=.9;
  const gp=[]; for(let i=0;i<24;i++){const a=i/24*TAU;for(let k=0;k<3;k++)gp.push(V(x+Math.cos(a)*3.8,topY+.7+k*.95,z+Math.sin(a)*3.8));}
  fallbackLH={x,z,baseY,topY,outerR,innerR,colR,doorAngle:PI,
    doorOut:V(x-outerR-1.4,baseY+1.4,z),doorIn:V(x-innerR+1.2,baseY+1.4,z),lampCenter:V(x,topY+1.55,z),glassPoints:gp,
    inBody:v=>Math.hypot(v.x-x,v.z-z)<outerR&&v.y<topY-.3&&v.y>baseY-1,
    inRoom:v=>Math.hypot(v.x-x,v.z-z)<outerR+.3&&v.y>=topY-.3&&v.y<topY+5,
    inside(v){return this.inBody(v)||this.inRoom(v);}};
  return fallbackLH;
}
/** derived numbers moths need (cached per lighthouse object) */
function lhGeo(){
  const L=getLH(); if(geoFor===L&&geoCache)return geoCache;
  const cx=L.x!=null?L.x:180, cz=L.z!=null?L.z:0;
  const outerR=L.outerR||4.4, innerR=L.innerR||outerR-.5, colR=L.colR||.9;
  const baseY=L.baseY!=null?L.baseY:(L.doorOut.y-1.4), topY=L.topY!=null?L.topY:L.lampCenter.y-1.55;
  const doorA=Math.atan2(L.doorOut.z-cz,L.doorOut.x-cx);
  let gR=0,gy0=1e9,gy1=-1e9; const gp=(L.glassPoints&&L.glassPoints.length)?L.glassPoints:getLHFallbackGlass(cx,cz,topY);
  for(const p of gp){gR+=Math.hypot(p.x-cx,p.z-cz);gy0=Math.min(gy0,p.y);gy1=Math.max(gy1,p.y);}
  gR/=gp.length; if(!(gR>.5))gR=Math.min(outerR-.3,3.8);
  geoFor=L;
  return geoCache={L,cx,cz,outerR,innerR,colR,baseY,topY,doorA,doorHalf:Math.max(.17,.85/outerR),
    glassR:gR,glassY0:Math.min(gy0,topY)-.2,glassY1:Math.max(gy1,topY+3)+.4,glassPts:gp};
}
function getLHFallbackGlass(cx,cz,topY){const a=[];for(let i=0;i<24;i++){const t=i/24*TAU;for(let k=0;k<3;k++)a.push(V(cx+Math.cos(t)*3.6,topY+.7+k*.95,cz+Math.sin(t)*3.6));}return a;}
/** 'out' | 'body' | 'room' for moth routing (our own classification, glass radius aware) */
function zoneOf(v,g){
  const r=Math.hypot(v.x-g.cx,v.z-g.cz);
  if(v.y<g.topY-.3){return (r<g.outerR&&v.y>g.baseY-1.2)?'body':'out';}
  if(v.y<g.glassY1+.6)return r<g.glassR?'room':'out';
  return 'out';
}

/* ---------------------------------------------------------------- shared ash particles */
const NA=420, ashPos=new Float32Array(NA*3), ashP=[];
for(let i=0;i<NA;i++){ashP.push({life:0,vx:0,vy:0,vz:0});ashPos[i*3+1]=-999;}
const ashGeo=new THREE.BufferGeometry(); ashGeo.setAttribute('position',new THREE.BufferAttribute(ashPos,3));
let ashPts=null, ashCursor=0;
function emitAsh(x,y,z,vx,vy,vz,life){
  const i=ashCursor; ashCursor=(ashCursor+1)%NA;
  const a=ashP[i]; ashPos[i*3]=x;ashPos[i*3+1]=y;ashPos[i*3+2]=z; a.vx=vx;a.vy=vy;a.vz=vz;a.life=life;
}
function ashBurst(pos,n=30,spread=1){
  for(let k=0;k<n;k++)emitAsh(pos.x+(rnd()-.5)*spread,pos.y+rnd()*spread*1.4,pos.z+(rnd()-.5)*spread,(rnd()-.5)*2.2,.6+rnd()*1.8,(rnd()-.5)*2.2,1+rnd()*1.6);
}
function updateAsh(dt){
  for(let i=0;i<NA;i++){const a=ashP[i]; if(a.life<=0)continue; a.life-=dt;
    if(a.life<=0){ashPos[i*3+1]=-999;continue;}
    ashPos[i*3]+=a.vx*dt; ashPos[i*3+1]+=a.vy*dt; ashPos[i*3+2]+=a.vz*dt; a.vx*=1-dt*.6; a.vz*=1-dt*.6; }
  ashGeo.attributes.position.needsUpdate=true;
}

/* ---------------------------------------------------------------- corruption patches */
const patches=[];
function buildPatches(){
  let list=LM().patches;
  if(!Array.isArray(list)||!list.length)list=[{x:-120,z:-20},{x:-95,z:30},{x:-150,z:-35},{x:-60,z:-15},{x:-35,z:40},{x:5,z:-30},{x:30,z:20},{x:70,z:-25},{x:85,z:30}];
  const SEG=18, pos=[], uv=[], ph=[], idx=[];
  list.forEach((p,pi)=>{
    const S=5.5+U.hash(p.x,p.z)*3, phase=rnd()*TAU, y0=isFinite(p.y)?p.y:H(p.x,p.z);
    const base=pos.length/3;
    for(let j=0;j<=SEG;j++)for(let i=0;i<=SEG;i++){
      const u=i/SEG*2-1, v=j/SEG*2-1, x=p.x+u*S/2, z=p.z+v*S/2;
      pos.push(x,H(x,z)+.09,z); uv.push(u,v); ph.push(phase);
    }
    for(let j=0;j<SEG;j++)for(let i=0;i<SEG;i++){const a=base+j*(SEG+1)+i,b=a+1,c=a+SEG+1,d=c+1;idx.push(a,c,b,b,c,d);}
    patches.push({c:V(p.x,y0+1.1,p.z),x:p.x,z:p.z,y:y0,size:S,ph:phase,ground:V(p.x,y0+.12,p.z)});
  });
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('aUv',new THREE.Float32BufferAttribute(uv,2));
  g.setAttribute('aPh',new THREE.Float32BufferAttribute(ph,1));
  g.setIndex(idx); g.computeBoundingSphere();
  const u=THREE.UniformsUtils.merge([THREE.UniformsLib.fog,{uRim:{value:U.col('#9a6cff').multiplyScalar(1.15)}}]); u.uTime=G.negTime;
  const mat=new THREE.ShaderMaterial({uniforms:u,fog:true,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-4,
    vertexShader:`uniform float uTime;attribute vec2 aUv;attribute float aPh;varying vec2 vUv;varying float vPh;
#include <fog_pars_vertex>
void main(){vUv=aUv;vPh=aPh;vec3 p=position;float r=length(aUv);p.y+=(1.-min(r,1.))*(.05+.05*sin(uTime*1.3+aPh));
vec4 mvPosition=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mvPosition;
#include <fog_vertex>
}`,
    fragmentShader:`uniform float uTime;uniform vec3 uRim;varying vec2 vUv;varying float vPh;
#include <fog_pars_fragment>
float hh(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hh(i),hh(i+vec2(1,0)),f.x),mix(hh(i+vec2(0,1)),hh(i+vec2(1,1)),f.x),f.y);}
void main(){
  float a=atan(vUv.y,vUv.x), r=length(vUv);
  float breathe=.06*sin(uTime*1.3+vPh);
  float n=vn(vec2(a*2.2+vPh,uTime*.15))*.28+vn(vUv*5.+vPh+uTime*.05)*.18;
  float edge=.62+breathe+n;
  float alpha=1.-smoothstep(edge-.14,edge,r);
  if(alpha<.01)discard;
  float rim=smoothstep(edge-.2,edge-.05,r)*alpha;
  float sheen=pow(max(0.,sin(vUv.x*7.+vUv.y*5.+uTime*.7+vPh)),12.)*.06*(1.-rim);
  vec3 c=uRim*rim*(.8+.4*sin(uTime*2.+a*3.+vPh))+vec3(.35,.3,.5)*sheen;
  gl_FragColor=vec4(c,alpha*.96);
  #include <fog_fragment>
}`});
  const mesh=new THREE.Mesh(g,mat); mesh.renderOrder=1; mesh.frustumCulled=false; mesh.name='corruptionPatches';
  G.scene.add(mesh);
}
/* low ink wisps rising off each patch (defined after the ink helpers; called from init) */
function patchWisps(){
  for(const p of patches){
    p.em=inkEm(p.ground,{rate:5,radius:p.size*.32,size:[.5,1.6],life:[1.8,3],rise:.22,drift:.2,trail:0,alpha:.32,embers:.25,color:'#0d0912'});
  }
}
function updatePatchWisps(){
  const r=inkRef();
  for(const p of patches){ if(!p.em)continue; const d=Math.hypot(p.x-r.x,p.z-r.z); p.em.intensity=d<INK_FAR?1-U.smooth(INK_FAR*.75,INK_FAR,d):0; }
}

/* ---------------------------------------------------------------- moths */
const NM=300, N_GLASS=70, N_SPOT=14, N_WANDER=26,
      N_ROOST=40; /* cave moths (cave_puzzles.js): the last 40 of the pool cling to the roost in the Gallery of Keepers */
const roost={pts:[],centre:null}; // set by G.creatures.setRoost([{p:Vector3,n:Vector3}])
const moths=[];
let mothMesh=null, glassOpen=false, cured=false, lanternCount=0;
const mothMat=new THREE.ShaderMaterial({
  uniforms:THREE.UniformsUtils.merge([THREE.UniformsLib.fog,{map:{value:null},uColor:{value:U.col('#efe6cf').multiplyScalar(.95)}}]),
  fog:true,side:THREE.DoubleSide,
  vertexShader:`attribute float aPhase;varying vec2 vUv;varying float vShade;uniform float uTime;
#include <fog_pars_vertex>
void main(){vUv=uv;vec3 p=position;float fl=sin(uTime*(17.+aPhase*9.)+aPhase*40.)*1.05;
  float ax=abs(p.x);p.y+=ax*sin(fl);p.x=sign(p.x)*ax*cos(fl);vShade=.72+.28*cos(fl);
  vec4 mvPosition=modelViewMatrix*instanceMatrix*vec4(p,1.);gl_Position=projectionMatrix*mvPosition;
  #include <fog_vertex>
}`,
  fragmentShader:`uniform sampler2D map;uniform vec3 uColor;varying vec2 vUv;varying float vShade;
#include <fog_pars_fragment>
void main(){vec4 t=texture2D(map,vUv);if(t.a<.4)discard;gl_FragColor=vec4(uColor*t.rgb*vShade,1.);
  #include <fog_fragment>
}`});
mothMat.uniforms.uTime=G.negTime;
function mothTexture(){
  return G.canvasTex(128,(g,s)=>{
    g.clearRect(0,0,s,s); g.translate(s/2,s/2);
    const wing=(sx)=>{
      g.save(); g.scale(sx,1);
      g.fillStyle='#fffaf0';
      g.beginPath(); g.moveTo(3,-8); g.bezierCurveTo(22,-44,58,-38,60,-22); g.bezierCurveTo(60,-6,30,4,3,4); g.fill(); // forewing
      g.beginPath(); g.moveTo(3,2); g.bezierCurveTo(30,4,46,22,36,40); g.bezierCurveTo(24,50,8,30,3,14); g.fill();   // hindwing
      g.fillStyle='rgba(176,150,118,.75)';
      g.beginPath(); g.ellipse(34,-18,6,4.5,.3,0,TAU); g.fill();                    // eye spot
      g.fillStyle='rgba(120,100,82,.55)'; g.beginPath(); g.ellipse(34,-18,2.3,1.8,.3,0,TAU); g.fill();
      g.strokeStyle='rgba(170,142,112,.6)'; g.lineWidth=2.2;
      g.beginPath(); g.moveTo(12,-10); g.quadraticCurveTo(36,-30,56,-24); g.stroke();
      g.beginPath(); g.moveTo(14,6); g.quadraticCurveTo(34,14,34,32); g.stroke();
      g.fillStyle='rgba(205,186,158,.8)'; g.beginPath(); g.ellipse(50,-14,7,3,.4,0,TAU); g.fill();
      g.restore();
    };
    wing(1); wing(-1);
    g.fillStyle='#b9a888'; g.beginPath(); g.ellipse(0,2,4.5,20,0,0,TAU); g.fill();
    g.strokeStyle='#cbbd9d'; g.lineWidth=1.6; for(const sx of [-1,1]){g.beginPath();g.moveTo(sx*1.5,-16);g.quadraticCurveTo(sx*8,-30,sx*14,-34);g.stroke();}
  });
}
function buildMoths(){
  const g=new THREE.BufferGeometry();
  // two wing quads in the xz plane (+z = head), hinge on x=0
  const P=[-1,0,-.62, 0,0,-.62, 0,0,.62, -1,0,.62,  0,0,-.62, 1,0,-.62, 1,0,.62, 0,0,.62];
  const UV=[0,0, .5,0, .5,1, 0,1, .5,0, 1,0, 1,1, .5,1];
  g.setAttribute('position',new THREE.Float32BufferAttribute(P,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(UV,2));
  g.setIndex([0,1,2,0,2,3,4,5,6,4,6,7]);
  const ph=new Float32Array(NM); for(let i=0;i<NM;i++)ph[i]=rnd();
  g.setAttribute('aPhase',new THREE.InstancedBufferAttribute(ph,1));
  const tex=mothTexture(); tex.flipY=false; tex.needsUpdate=true;
  mothMat.uniforms.map.value=tex;
  mothMesh=new THREE.InstancedMesh(g,mothMat,NM); mothMesh.frustumCulled=false; mothMesh.name='moths';
  mothMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  G.scene.add(mothMesh);
  const geo=lhGeo();
  for(let i=0;i<NM;i++){
    const m={i,p:V(),v:V(),ph:rnd()*TAU,sp:(1.2+rnd()*2.2)*(rnd()<.5?-1:1),rad:.6+rnd()*1.6,hy:rnd()*1.4,
      tgt:'patch',idx:patches.length?i%patches.length:0,prey:null,gp:null,home:null,jx:(rnd()-.5)*.8,jy:(rnd()-.5)*.8,
      scale:.11+rnd()*.05,delay:0,press:rnd()*TAU};
    if(i<N_GLASS){m.tgt='spot';m.rad=.6+rnd()*3.2;m.hy=rnd()*3;m.scale*=1.1;} // Act 1 v12: the moths left the lamp when it went wrong; they nest in the old wood with Maren's lantern
    else if(i<N_GLASS+N_SPOT){m.tgt='spot';m.rad=.35+rnd()*1.2;}
    else if(i>=NM-N_ROOST){m.tgt='roost';m.cave=true;m.scale*=.85;m.p.set(0,-999,0);} // hidden until a roost exists
    else if(i>=NM-N_ROOST-N_WANDER||!patches.length){m.tgt='wander';m.rad=3+rnd()*4;}
    moths.push(m);
  }
  assignGlass(true);
  for(const m of moths){ if(m.tgt==='roost')continue; mothTarget(m,0,m.p); if(m.tgt==='glass')m.p.addScaledVector(dirOut(m.gp,geo),.4);}
}
/* ---- cave support (cave_puzzles.js / moths.js) ---- */
const caveO=()=>(G.cave&&G.cave.origin)||_caveO;
const _caveO=V(0,60,800);
/** true when p is in the cave interior's region (far off-island) */
function inCaveRegion(p){ const o=caveO(); return Math.hypot(p.x-o.x,p.z-o.z)<170&&p.y>o.y-40; }
function toRoost(m){
  if(!roost.pts.length){ toPatch(m); return; }
  const r=roost.pts[(rnd()*roost.pts.length)|0];
  m.tgt='roost'; m.rp=r.p; m.rn=r.n; m.prey=null; m.home=null; m.feedB=null; m.next=null;
}
/** points [{p:Vector3(world),n:Vector3(unit normal)}] on a rock face; roost-born moths settle there */
function setRoost(points){
  roost.pts=points||[]; roost.centre=null;
  if(!roost.pts.length)return;
  const c=V(); for(const r of roost.pts)c.add(r.p); roost.centre=c.multiplyScalar(1/roost.pts.length);
  let k=0;
  for(const m of moths){ if(!m.cave||m.tgt!=='roost')continue; const r=roost.pts[k++%roost.pts.length];
    m.rp=r.p; m.rn=r.n; m.p.copy(r.p).addScaledVector(r.n,.05); m.v.set(0,0,0); }
}
function jarPos(){ const f=G.moths&&G.moths.jarPos; const p=f&&f(); return p||satchelPos(); }
function dirOut(p,g){const dx=p.x-g.cx,dz=p.z-g.cz,d=Math.hypot(dx,dz)||1;return V(dx/d,0,dz/d);}
/* the fair-play clue: moths on the glass cluster densest over the corruption inside */
function blobCenter(){
  const L=getLH();
  if(L.blobCenter&&L.blobCenter.isVector3)return L.blobCenter;
  if(L.blob&&L.blob.getWorldPosition){try{return L.blob.getWorldPosition(V());}catch(e){}}
  return null;
}
let glassWeights=null, glassT=0;
function computeGlassWeights(){
  const g=lhGeo(), pts=g.glassPts, b=blobCenter();
  let w;
  if(b){ w=pts.map(p=>{const d=p.distanceTo(b);return Math.exp(-d*d/(2*1.7*1.7))+.06;}); }
  else { // no blob position: cluster on the side facing the start / door (west-south-west) so the clue is visible early
    const st=LM().start, ca=st&&isFinite(st.x)?Math.atan2(st.z-g.cz,st.x-g.cx)+.5:PI-.3;
    w=pts.map(p=>{const a=Math.atan2(p.z-g.cz,p.x-g.cx);const d=U.angDiff(a,ca);return Math.exp(-d*d/(2*.55*.55))+.07;}); }
  let s=0; for(const x of w)s+=x; glassWeights=w.map(x=>x/s);
}
function pickGlass(){
  const pts=lhGeo().glassPts; let r=rnd();
  for(let i=0;i<pts.length;i++){r-=glassWeights[i];if(r<=0)return pts[i];}
  return pts[pts.length-1];
}
function assignGlass(all){
  computeGlassWeights();
  for(const m of moths){ if(m.tgt!=='glass')continue; if(all||rnd()<.12)m.gp=pickGlass(); }
}
function lanternPos(){
  const L=lantern();
  if(L&&L.found){ if(L.world&&L.world.lengthSq()>0)return L.world; return L.pos; }
  const s=lmPoint('lanternSpot',{x:-160,z:9}); _lp.set(s.x,s.y+.35,s.z); return _lp;
}
const _lp=V(), _sp=V();
function satchelPos(){ const P=G.player; if(!P||!P.pos)return lanternPos(); const h=P.heading||0; // left hip, slightly behind
  return _sp.set(P.pos.x+Math.cos(h)*.28-Math.sin(h)*.18,P.pos.y+1.05,P.pos.z-Math.sin(h)*.28-Math.cos(h)*.18); }
/* the core loop (moths.js): after the cure a *baited* lit lantern recruits again */
const baited=()=>!!(G.moths&&G.moths.baited);
function mothTarget(m,t,o){
  const g=lhGeo();
  let c;
  switch(m.tgt){
    case 'glass':{
      const gp=m.gp||g.glassPts[0], out=dirOut(gp,g);
      const press=Math.sin(t*1.7+m.press);  // drift off, then beat against the pane
      const off=press>.55?-.35:.25+.25*(.5+.5*Math.sin(t*.9+m.ph));
      const tx=-out.z, tz=out.x, sway=Math.sin(t*m.sp*.7+m.ph)*.35;
      return o.set(gp.x+out.x*off+tx*sway, gp.y+Math.sin(t*1.1+m.ph)*.3, gp.z+out.z*off+tz*sway);
    }
    case 'lantern': case 'spot': c=lanternPos(); break;
    case 'hunt': c=m.prey?m.prey.center:lanternPos(); break;
    case 'lamp':{ // the cure: they go past the lantern in the cradle and into the black on the lens, and eat it
      const b=blobCenter()||getLH().lampCenter, a=m.ph+t*m.sp*1.4, r=.62+m.rad*.28+.12*Math.sin(t*5+m.ph);
      return o.set(b.x+Math.cos(a)*r, b.y+(m.hy-.9)*.55+Math.sin(t*2.3+m.ph)*.2, b.z+Math.sin(a)*r); }
    case 'satchel': c=satchelPos(); break;                       // loop: drawn to the ichor in the player's satchel
    case 'feed': if(m.feedC)return o.set(m.feedC.x+Math.cos(m.ph+t*m.sp*.35)*m.rad,m.feedC.y+Math.sin(t*2.1+m.ph)*.18,m.feedC.z+Math.sin(m.ph+t*m.sp*.35)*m.rad); c=lanternPos(); break;
    case 'gone': return o.copy(m.p);
    case 'snatch':{ // taken by a raft raider (moths.js snatch): into the claw, then dragged down under the water
      const sn=m.snatch; if(!sn)return o.copy(m.p); const e=t-sn.t0;
      if(e<.25)return o.copy(sn.claw);
      const k=Math.min(1,(e-.25)/.45); return o.set(sn.claw.x+(m.ph%1-.5)*.3*k,U.lerp(sn.claw.y,sn.water-.7,k),sn.claw.z); }
    case 'roost':{ // cave moths clinging to the rock; now and then one lifts off and settles again
      if(!m.rp)return o.copy(m.p);
      const f=Math.sin(t*.31+m.ph*3.7)+.4*Math.sin(t*.83+m.ph);
      if(f>1.2){ const a=m.ph+t*m.sp*.6; return o.copy(m.rp).addScaledVector(m.rn,.45+.2*Math.sin(t+m.ph)).add(tmp2.set(Math.cos(a)*.35,Math.sin(t*1.7+m.ph)*.2,Math.sin(a)*.35)); }
      return o.copy(m.rp).addScaledVector(m.rn,.04);
    }
    case 'jar': return o.copy(jarPos());
    case 'wander':
      if(!m.home){const p=patches.length?patches[m.idx%patches.length]:{x:0,z:0};const a=rnd()*TAU,r=8+rnd()*22;const x=p.x+Math.cos(a)*r,z=p.z+Math.sin(a)*r;m.home=V(x,H(x,z)+2.2,z);}
      c=m.home; break;
    default: c=patches.length?patches[m.idx%patches.length].c:V(0,2,0);
  }
  const a=m.ph+t*m.sp;
  let rad=m.rad;
  if((m.tgt==='lantern'||m.tgt==='spot')&&zoneOf(c,g)!=='out')rad=Math.min(rad,1.05);
  if(m.tgt==='lantern'&&API.clingR!=null){ // a shut lantern in the cave / the raft: the swarm clings tight
    const cr=API.clingR*(.3+.7*Math.min(1,m.rad/1.75)), sh=API.clingShy; // clingShy {x,y,z}: the swarm shrinks back from a raider on the raft
    return o.set(c.x+Math.cos(a*.6)*cr+(sh?sh.x:0), c.y-.05+m.hy*.12+Math.sin(t*1.9+m.ph)*.1+(sh?sh.y*(.6+.4*Math.sin(t*3.1+m.ph)):0), c.z+Math.sin(a*.6)*cr+(sh?sh.z:0));
  }
  return o.set(c.x+Math.cos(a)*rad, c.y+m.hy*.5+Math.sin(t*1.3+m.ph)*.45-(m.tgt==='lamp'?.5:0), c.z+Math.sin(a)*rad);
}
const tmp=V(), tmp2=V(), wp=V(), _q=new THREE.Quaternion(), _e=new THREE.Euler(0,0,0,'YXZ'), _m4=new THREE.Matrix4(), _s=V(), _X=V(), _Y=V(), _Z=V();
function route(m,g){
  // send the moth via the tower door / stairwell when its target is on the other side of stone
  const mz=zoneOf(m.p,g), tz=zoneOf(tmp,g);
  if(mz===tz)return;
  const L=g.L;
  const dOut=L.doorOut, dIn=L.doorIn;
  const viaDoorIn=()=>{ if(Math.hypot(m.p.x-dOut.x,m.p.z-dOut.z)>1.3||Math.abs(m.p.y-dOut.y)>1.4)tmp.copy(dOut).add(tmp2.set(m.jx*.5,m.jy,m.jx)); else tmp.copy(dIn); };
  const viaDoorOut=()=>{ if(Math.hypot(m.p.x-dIn.x,m.p.z-dIn.z)>1.3||Math.abs(m.p.y-dIn.y)>1.4)tmp.copy(dIn).add(tmp2.set(m.jx*.5,m.jy,m.jx)); else tmp.copy(dOut); };
  if(mz==='out'){
    if(tz==='room'&&glassOpen&&m.p.y>g.topY-2.5)return;            // straight in through the opened lamp room
    if(tz==='room'&&glassOpen&&Math.hypot(m.p.x-g.cx,m.p.z-g.cz)>g.outerR+.6&&m.p.y>g.baseY+6){ tmp.y=Math.max(tmp.y,g.topY+1); tmp.x=g.cx+(m.p.x-g.cx)*.2; tmp.z=g.cz+(m.p.z-g.cz)*.2; return; }
    viaDoorIn();
  }else if(mz==='body'){
    if(tz==='room')return;                                          // up the stairwell, through the hatch
    viaDoorOut();
  }else{ // room
    if(tz==='out'&&glassOpen)return;
    const a=g.doorA, r=(g.colR+g.innerR)/2;
    tmp.set(g.cx+Math.cos(a+.6)*r,g.topY-1.6,g.cz+Math.sin(a+.6)*r);   // down through the hatch
  }
}
function wallClamp(m,px,pz,py,g){
  const p=m.p;
  if(p.y<g.topY-.3&&p.y>g.baseY-1.2){
    const pr=Math.hypot(px-g.cx,pz-g.cz), dx=p.x-g.cx, dz=p.z-g.cz, a=Math.atan2(dz,dx); let r=Math.hypot(dx,dz), r0=r;
    const door=Math.abs(U.angDiff(a,g.doorA))<g.doorHalf&&p.y<g.baseY+2.9;
    if(pr<g.outerR&&py<g.topY-.3){ if(r<g.colR+.15)r=g.colR+.15; if(!door&&r>g.innerR-.15)r=g.innerR-.15; }
    else if(!door&&r<g.outerR+.2) r=g.outerR+.2;
    if(r!==r0){p.x=g.cx+Math.cos(a)*r;p.z=g.cz+Math.sin(a)*r; const nx=Math.cos(a),nz=Math.sin(a),vr=m.v.x*nx+m.v.z*nz; m.v.x-=nx*vr*1.5; m.v.z-=nz*vr*1.5;}
  }else if(!glassOpen&&p.y>=g.topY-.3&&p.y<g.glassY1+.6){
    const pr=Math.hypot(px-g.cx,pz-g.cz), dx=p.x-g.cx, dz=p.z-g.cz, a=Math.atan2(dz,dx); let r=Math.hypot(dx,dz), r0=r;
    if(pr>=g.glassR){ if(r<g.glassR+.1)r=g.glassR+.1; } else if(r>g.glassR-.1)r=g.glassR-.1;
    if(r!==r0){p.x=g.cx+Math.cos(a)*r;p.z=g.cz+Math.sin(a)*r; const nx=Math.cos(a),nz=Math.sin(a),vr=m.v.x*nx+m.v.z*nz; m.v.x-=nx*vr*1.6; m.v.z-=nz*vr*1.6;} // bump the pane
  }
}
function toLanternOrHome(m){
  if(!cured||baited()){m.tgt='lantern';m.rad=.35+rnd()*1.4;m.prey=null;}
  else toPatch(m);
}
function toPatch(m){ if(roost.pts.length&&inCaveRegion(m.p)){ toRoost(m); return; } m.tgt=patches.length?'patch':'wander';m.idx=(rnd()*Math.max(1,patches.length))|0;m.rad=.6+rnd()*1.6;m.prey=null;m.home=null;}

/* swarm hunting: anything corrupt near the lantern gets engulfed */
const preyState=new Map(); // key -> {acc, count}
let assignT=0;
function preyList(){
  const out=[];
  for(const hb of G.hurtboxes){ if(!hb.corrupt||(hb.alive&&!hb.alive()))continue;
    if(!hb._swarmCenter)hb._swarmCenter=V();
    hb._swarmCenter.set(hb.pos.x,hb.pos.y+(hb.height||1.6)*.55,hb.pos.z);
    // loop/cave: after the cure only hurtboxes that opt in (hb.mothPrey: bool | ()=>bool) draw the swarm
    out.push({key:hb,hb,center:hb._swarmCenter,alive:()=>!(hb.alive&&!hb.alive()),r:(hb.radius||.6)+1.4,
      range:hb.mothRange||7,want:hb.mothWant||0,dmg:hb.mothDamage==null?1:hb.mothDamage,
      lure:()=>typeof hb.mothPrey==='function'?!!hb.mothPrey():!!hb.mothPrey}); }
  for(const n of negatives){ if(n.dead||n.dying&&n.fade<.3)continue; out.push({key:n,neg:n,center:n.center,alive:()=>!n.dead,r:1.9}); }
  return out;
}
let preys=[];
function updateHunting(dt){
  assignT-=dt; if(assignT>0)return; assignT=.25;
  preys=preyList();
  const live=new Set(preys.map(p=>p.key));
  for(const m of moths) if(m.tgt==='hunt'&&(!m.prey||!live.has(m.prey.key)||!m.prey.alive()))toLanternOrHome(m);
  for(const k of [...preyState.keys()]) if(!live.has(k))preyState.delete(k);
  if(!isPlay())return;
  const L=lantern(); if(!L||!L.found||L.inCradle)return;
  const lp=lanternPos();
  for(const p of preys){
    if(cured&&!(p.lure&&p.lure())){ for(const m of moths) if(m.tgt==='hunt'&&m.prey&&m.prey.key===p.key)toLanternOrHome(m); continue; }
    const d=Math.hypot(p.center.x-lp.x,p.center.z-lp.z), R=p.range||7;
    let have=0; for(const m of moths) if(m.tgt==='hunt'&&m.prey&&m.prey.key===p.key){have++; if(d>Math.max(14,R*1.5))toLanternOrHome(m); else m.prey=p;}
    if(d>R||lanternCount<=3)continue;
    const want=p.want||12+(((p.key.name||'').length+have)%5);
    for(const m of moths){ if(have>=want)break; if(m.tgt==='lantern'){m.tgt='hunt';m.prey=p;m.rad=.15+rnd()*.6;m.hy=rnd()*1.4;have++;} }
  }
}
function updateMoths(dt){
  const g=lhGeo(), t=G.time, play=isPlay(), L=lantern();
  const lp=lanternPos();
  let lc=0;
  // glass distribution follows the corruption as it moves
  glassT-=dt; if(glassT<=0){glassT=6; assignGlass(false);}
  const bait=cured&&baited()&&L&&L.lit&&L.lit();
  const canRecruit=play&&(!cured||bait)&&L&&L.found&&!L.inCradle, recR2=bait?144:81;
  const loopOn=!!(G.loop&&G.loop.active);
  for(const p of preys){const st=preyState.get(p.key)||{acc:0,count:0}; st.count=0; preyState.set(p.key,st);}
  for(let i=0;i<NM;i++){
    const m=moths[i];
    if(m.delay>0){m.delay-=dt; if(m.delay<=0&&m.next){m.tgt=m.next;m.next=null;}}
    if(m.tgt==='gone'){ if(!m.hidden){m.hidden=true;_m4.makeScale(0,0,0);_m4.setPosition(0,-999,0);mothMesh.setMatrixAt(i,_m4);} continue; }
    if((m.tgt==='roost'&&!m.rp)||(m.tgt==='jar'&&m.inJar)){ if(!m.hidden){m.hidden=true;_m4.makeScale(0,0,0);_m4.setPosition(0,-999,0);mothMesh.setMatrixAt(i,_m4);} continue; }
    if(m.tgt!=='jar')m.inJar=false;
    m.hidden=false;
    if(canRecruit&&(m.tgt==='patch'||m.tgt==='wander'||m.tgt==='roost')&&lanternCount<90&&m.p.distanceToSquared(lp)<recR2&&rnd()<dt*.9*((G.player&&G.player.mods&&G.player.mods.mothGather)||1)){ // Lantern Charm: x1.25
      m.tgt='lantern';m.rad=.35+rnd()*1.4;}
    if(m.tgt==='lantern'||m.tgt==='hunt')lc++;
    mothTarget(m,t,tmp);
    route(m,g);
    const hunting=m.tgt==='hunt'||m.tgt==='snatch', glass=m.tgt==='glass', clinging=m.tgt==='lantern'&&API.clingR!=null, perch=m.tgt==='roost', jar=m.tgt==='jar';
    const k=hunting||clinging||jar?13:glass||perch?9:7, c=hunting||clinging||jar?4.2:glass||perch?3.2:3.6, nz=glass||perch?3:clinging?2:6;
    tmp2.subVectors(tmp,m.p).multiplyScalar(k).addScaledVector(m.v,-c);
    tmp2.x+=(rnd()-.5)*nz; tmp2.y+=(rnd()-.5)*nz; tmp2.z+=(rnd()-.5)*nz;
    m.v.addScaledVector(tmp2,dt);
    const sp=m.v.length(); if(sp>14)m.v.multiplyScalar(14/sp);
    const px=m.p.x,pz=m.p.z,py=m.p.y;
    m.p.addScaledVector(m.v,dt);
    wallClamp(m,px,pz,py,g);
    if(loopOn&&(m.tgt==='lantern'||m.tgt==='feed'||m.tgt==='satchel'))flowAround(m,g);
    if(jar&&m.p.distanceToSquared(tmp)<.12){m.inJar=true; continue;}
    if(hunting&&m.prey&&m.p.distanceToSquared(m.prey.center)<m.prey.r*m.prey.r){
      const st=preyState.get(m.prey.key); if(st)st.count++;
      if(m.prey.neg){m.prey.neg.hits++; m.prey.neg.bite+=dt*.075;}
    }
    // orientation + matrix
    const s=m.scale;
    if((glass&&m.gp||perch&&m.rp)&&m.p.distanceToSquared(tmp)<.8){
      const out=perch?m.rn:dirOut(m.p,g); _Y.copy(out); _Z.set(0,1,0); if(perch&&Math.abs(out.y)>.9)_Z.set(1,0,0); _X.crossVectors(_Y,_Z).normalize(); _Z.crossVectors(_X,_Y);
      _m4.makeBasis(_X.multiplyScalar(s),_Y.multiplyScalar(s),_Z.multiplyScalar(s)); _m4.setPosition(m.p.x,m.p.y+Math.sin(t*9+m.ph)*.02,m.p.z);
    }else{
      const hs=Math.hypot(m.v.x,m.v.z);
      _e.set(-Math.atan2(m.v.y,hs+.4)*.6,Math.atan2(m.v.x,m.v.z),Math.sin(t*3+m.ph)*.35);
      _q.setFromEuler(_e); _s.set(s,s,s); wp.set(m.p.x,m.p.y+Math.sin(t*26+m.ph)*.035,m.p.z);
      _m4.compose(wp,_q,_s);
    }
    mothMesh.setMatrixAt(i,_m4);
  }
  mothMesh.instanceMatrix.needsUpdate=true;
  lanternCount=lc; API.lanternCount=lc;
  // swarm damage to corrupt hurtboxes (~1 per 1.2 s while engulfed)
  if(play)for(const p of preys){ if(!p.hb)continue; const st=preyState.get(p.key); if(!st)continue;
    if(st.count>=3){ st.acc+=dt; if(st.acc>=1.2){ st.acc=0;
      const dir=V(p.hb.pos.x-lp.x,0,p.hb.pos.z-lp.z); if(dir.lengthSq()<1e-6)dir.set(0,0,1); dir.normalize();
      if(p.dmg>0)try{p.hb.hit({damage:p.dmg,kind:'swarm',dir,knockback:.5,source:API});}catch(e){console.error(e);} } }
    else st.acc=Math.max(0,st.acc-dt*.25); }
}
/* herding outdoors: keep the swarm above the ground and flowing around trunks / rocks / posts */
function flowAround(m,g){
  const p=m.p; if(Math.hypot(p.x-g.cx,p.z-g.cz)<g.outerR+2.5)return; // the tower has its own routing
  const f=G.floorAt?G.floorAt(p.x,p.z,p.y+.5):H(p.x,p.z);
  if(p.y<f+.3){p.y=f+.3; if(m.v.y<0)m.v.y*=-.3;}
  if(!G.collidersNear)return;
  for(const c of G.collidersNear(p.x,p.z)){
    if(c.y1!=null&&p.y>c.y1+.2)continue;
    const dx=p.x-c.x, dz=p.z-c.z, d=Math.hypot(dx,dz), R=(c.r||0)+.18;
    if(d<R&&d>1e-4){ const nx=dx/d, nz=dz/d; p.x=c.x+nx*R; p.z=c.z+nz*R;
      const vr=m.v.x*nx+m.v.z*nz; if(vr<0){m.v.x-=nx*vr*1.2; m.v.z-=nz*vr*1.2;}
      m.v.x+=-nz*m.sp*.4; m.v.z+=nx*m.sp*.4; m.v.y+=.6; }      // slip round the side and a little up
  }
}
function swarmAt(pos,r=2){let n=0;const r2=r*r;for(const m of moths)if(m.tgt!=='gone'&&m.p.distanceToSquared(pos)<r2)n++;return n;}

/* ---------------------------------------------------------------- sculpting helpers
   sdfGeo: smooth-union of ellipsoids / round cones, meshed with surface nets → one smooth,
   subdivided blob (no seams, smooth normals, per-vertex colours blended from the primitives).
   tube: tapered sweep along a Catmull-Rom curve.  capsule: tapered lathe capsule along −y. */
const _m3=new THREE.Matrix4(), _eu=new THREE.Euler();
function prim(o){
  const p=Object.assign({k:.05},o);
  if(p.rot){_eu.set(p.rot[0],p.rot[1],p.rot[2]); p.inv=new THREE.Matrix4().makeRotationFromEuler(_eu).invert().elements;}
  p.col=U.col(p.col||'#ffffff');
  if(p.t==='c'){p.ba=[p.b[0]-p.a[0],p.b[1]-p.a[1],p.b[2]-p.a[2]];p.bb=p.ba[0]*p.ba[0]+p.ba[1]*p.ba[1]+p.ba[2]*p.ba[2]||1e-6;if(p.r1==null)p.r1=p.r0;}
  return p;
}
function primD(p,x,y,z){
  if(p.t==='e'){
    let dx=x-p.c[0],dy=y-p.c[1],dz=z-p.c[2];
    if(p.inv){const e=p.inv;const X=e[0]*dx+e[4]*dy+e[8]*dz,Y=e[1]*dx+e[5]*dy+e[9]*dz,Z=e[2]*dx+e[6]*dy+e[10]*dz;dx=X;dy=Y;dz=Z;}
    const rx=p.r[0],ry=p.r[1],rz=p.r[2];
    const k0=Math.hypot(dx/rx,dy/ry,dz/rz), k1=Math.hypot(dx/(rx*rx),dy/(ry*ry),dz/(rz*rz));
    return k1<1e-9?-Math.min(rx,ry,rz):k0*(k0-1)/k1;
  }
  const px=x-p.a[0],py=y-p.a[1],pz=z-p.a[2];
  const h=Math.max(0,Math.min(1,(px*p.ba[0]+py*p.ba[1]+pz*p.ba[2])/p.bb));
  return Math.hypot(px-p.ba[0]*h,py-p.ba[1]*h,pz-p.ba[2]*h)-(p.r0+(p.r1-p.r0)*h);
}
function smin(a,b,k){if(k<=0)return Math.min(a,b);const h=Math.max(0,Math.min(1,.5+.5*(b-a)/k));return b+(a-b)*h-k*h*(1-h);}
function sdfField(prims){return (x,y,z)=>{let d=primD(prims[0],x,y,z);for(let i=1;i<prims.length;i++)d=smin(d,primD(prims[i],x,y,z),prims[i].k);return d;};}
function sdfGeo(list,h=.03,colorFn){
  const prims=list.map(prim), f=sdfField(prims);
  let x0=1e9,y0=1e9,z0=1e9,x1=-1e9,y1=-1e9,z1=-1e9;
  for(const p of prims){
    if(p.t==='e'){const R=Math.max(...p.r);x0=Math.min(x0,p.c[0]-R);x1=Math.max(x1,p.c[0]+R);y0=Math.min(y0,p.c[1]-R);y1=Math.max(y1,p.c[1]+R);z0=Math.min(z0,p.c[2]-R);z1=Math.max(z1,p.c[2]+R);}
    else{const R=Math.max(p.r0,p.r1);for(const q of [p.a,p.b]){x0=Math.min(x0,q[0]-R);x1=Math.max(x1,q[0]+R);y0=Math.min(y0,q[1]-R);y1=Math.max(y1,q[1]+R);z0=Math.min(z0,q[2]-R);z1=Math.max(z1,q[2]+R);}}
  }
  const pad=h*2.5; x0-=pad;y0-=pad;z0-=pad;x1+=pad;y1+=pad;z1+=pad;
  const nx=Math.ceil((x1-x0)/h)+1, ny=Math.ceil((y1-y0)/h)+1, nz=Math.ceil((z1-z0)/h)+1;
  const F=new Float32Array(nx*ny*nz), I=(i,j,k)=>i+nx*(j+ny*k);
  for(let k=0;k<nz;k++)for(let j=0;j<ny;j++)for(let i=0;i<nx;i++)F[I(i,j,k)]=f(x0+i*h,y0+j*h,z0+k*h);
  const cell=new Int32Array(nx*ny*nz).fill(-1), pos=[];
  const C=[[0,0,0],[1,0,0],[0,1,0],[1,1,0],[0,0,1],[1,0,1],[0,1,1],[1,1,1]];
  const E=[[0,1],[2,3],[4,5],[6,7],[0,2],[1,3],[4,6],[5,7],[0,4],[1,5],[2,6],[3,7]];
  const v=new Float32Array(8);
  for(let k=0;k<nz-1;k++)for(let j=0;j<ny-1;j++)for(let i=0;i<nx-1;i++){
    let neg=0; for(let c=0;c<8;c++){v[c]=F[I(i+C[c][0],j+C[c][1],k+C[c][2])]; if(v[c]<0)neg++;}
    if(neg===0||neg===8)continue;
    let sx=0,sy=0,sz=0,n=0;
    for(const [a,b] of E){ if((v[a]<0)===(v[b]<0))continue; const t=v[a]/(v[a]-v[b]);
      sx+=C[a][0]+(C[b][0]-C[a][0])*t; sy+=C[a][1]+(C[b][1]-C[a][1])*t; sz+=C[a][2]+(C[b][2]-C[a][2])*t; n++; }
    cell[I(i,j,k)]=pos.length/3; pos.push(x0+(i+sx/n)*h,y0+(j+sy/n)*h,z0+(k+sz/n)*h);
  }
  const idx=[];
  const quad=(a,b,c,d,flip)=>{ if(a<0||b<0||c<0||d<0)return; if(flip)idx.push(a,c,b,a,d,c); else idx.push(a,b,c,a,c,d); };
  for(let k=1;k<nz-1;k++)for(let j=1;j<ny-1;j++)for(let i=1;i<nx-1;i++){
    const s=F[I(i,j,k)]<0;
    if(i<nx-1&&s!==(F[I(i+1,j,k)]<0)) quad(cell[I(i,j-1,k-1)],cell[I(i,j,k-1)],cell[I(i,j,k)],cell[I(i,j-1,k)],s);
    if(j<ny-1&&s!==(F[I(i,j+1,k)]<0)) quad(cell[I(i-1,j,k-1)],cell[I(i-1,j,k)],cell[I(i,j,k)],cell[I(i,j,k-1)],s);
    if(k<nz-1&&s!==(F[I(i,j,k+1)]<0)) quad(cell[I(i-1,j-1,k)],cell[I(i,j-1,k)],cell[I(i,j,k)],cell[I(i-1,j,k)],s);
  }
  // normals from the field gradient; colours blended from the nearest primitives
  const nv=pos.length/3, nor=new Float32Array(nv*3), col=new Float32Array(nv*3), e=h*.5;
  for(let q=0;q<nv;q++){
    const x=pos[q*3],y=pos[q*3+1],z=pos[q*3+2];
    let gx=f(x+e,y,z)-f(x-e,y,z), gy=f(x,y+e,z)-f(x,y-e,z), gz=f(x,y,z+e)-f(x,y,z-e); const L=Math.hypot(gx,gy,gz)||1;
    nor[q*3]=gx/L;nor[q*3+1]=gy/L;nor[q*3+2]=gz/L;
    let r=0,g=0,b=0,w=0;
    for(const p of prims){const d=Math.max(0,primD(p,x,y,z)); const ww=Math.exp(-d*(p.sharp||70)); r+=p.col.r*ww;g+=p.col.g*ww;b+=p.col.b*ww;w+=ww;}
    col[q*3]=r/w;col[q*3+1]=g/w;col[q*3+2]=b/w;
    if(colorFn)colorFn(x,y,z,col,q*3);
  }
  // make the winding agree with the normals
  for(let t=0;t<idx.length;t+=3){
    const a=idx[t],b=idx[t+1],c=idx[t+2];
    const ux=pos[b*3]-pos[a*3],uy=pos[b*3+1]-pos[a*3+1],uz=pos[b*3+2]-pos[a*3+2];
    const vx=pos[c*3]-pos[a*3],vy=pos[c*3+1]-pos[a*3+1],vz=pos[c*3+2]-pos[a*3+2];
    const fx=uy*vz-uz*vy,fy=uz*vx-ux*vz,fz=ux*vy-uy*vx;
    const mx=nor[a*3]+nor[b*3]+nor[c*3],my=nor[a*3+1]+nor[b*3+1]+nor[c*3+1],mz=nor[a*3+2]+nor[b*3+2]+nor[c*3+2];
    if(fx*mx+fy*my+fz*mz<0){idx[t+1]=c;idx[t+2]=b;}
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('normal',new THREE.BufferAttribute(nor,3));
  g.setAttribute('color',new THREE.BufferAttribute(col,3));
  g.setIndex(idx); g.computeBoundingSphere(); g.userData.field=f;
  return g;
}
/** tapered tube along points (array of [x,y,z]); r = number | fn(t). Rounded closed ends. */
function tube(pts,r0,r1,seg=12,rad=8,colHex,colorFn,flat=1){
  const curve=new THREE.CatmullRomCurve3(pts.map(p=>new THREE.Vector3(p[0],p[1],p[2])));
  const fr=curve.computeFrenetFrames(seg,false), P=[], idx=[];
  const rf=typeof r0==='function'?r0:(t=>r0+(r1-r0)*t);
  for(let i=0;i<=seg;i++){
    const t=i/seg, c=curve.getPointAt(t), N=fr.normals[i], B=fr.binormals[i];
    const r=Math.max(1e-4,rf(t)*(i===0||i===seg?.35:1));
    for(let j=0;j<rad;j++){const a=j/rad*TAU, ca=Math.cos(a)*r, sa=Math.sin(a)*r*flat;
      P.push(c.x+N.x*ca+B.x*sa,c.y+N.y*ca+B.y*sa,c.z+N.z*ca+B.z*sa);}
  }
  for(let i=0;i<seg;i++)for(let j=0;j<rad;j++){const a=i*rad+j,b=i*rad+(j+1)%rad,c=a+rad,d=b+rad;idx.push(a,c,b,b,c,d);}
  const s=curve.getPointAt(0), e=curve.getPointAt(1), ts=curve.getTangentAt(0), te=curve.getTangentAt(1);
  const r0v=rf(0)*.5, r1v=rf(1)*.5;
  const is=P.length/3; P.push(s.x-ts.x*r0v,s.y-ts.y*r0v,s.z-ts.z*r0v);
  const ie=P.length/3; P.push(e.x+te.x*r1v,e.y+te.y*r1v,e.z+te.z*r1v);
  for(let j=0;j<rad;j++){idx.push(is,j,(j+1)%rad); const o=seg*rad; idx.push(ie,o+(j+1)%rad,o+j);}
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(P,3)); g.setIndex(idx); g.computeVertexNormals();
  if(colHex)paint(g,colHex,colorFn);
  return g;
}
/** rounded capsule along −y from the origin, radius r0 at top, r1 at bottom */
function capsule(r0,r1,len,seg=12){
  const pts=[], n=6;
  for(let i=0;i<=n;i++){const a=-PI/2+PI/2*i/n; pts.push(new THREE.Vector2(Math.max(1e-4,Math.cos(a)*r1),-len+Math.sin(a)*r1));}
  for(let i=1;i<=n;i++){const a=PI/2*i/n; pts.push(new THREE.Vector2(Math.max(1e-4,Math.cos(a)*r0),Math.sin(a)*r0));}
  return new THREE.LatheGeometry(pts,seg);
}
function paint(g,hex,fn){
  const n=g.attributes.position.count, c=U.col(hex), a=new Float32Array(n*3), p=g.attributes.position;
  for(let i=0;i<n;i++){a[i*3]=c.r;a[i*3+1]=c.g;a[i*3+2]=c.b; if(fn)fn(p.getX(i),p.getY(i),p.getZ(i),a,i*3);}
  g.setAttribute('color',new THREE.BufferAttribute(a,3)); return g;
}
function mergeGeos(list){
  const P=[],N=[],Cc=[],UV=[],idx=[]; let off=0, hasC=list.every(g=>g.attributes.color), hasU=list.every(g=>g.attributes.uv);
  for(let g of list){
    if(!g.index){const n=g.attributes.position.count;g.setIndex([...Array(n).keys()]);}
    if(!g.attributes.normal)g.computeVertexNormals();
    const p=g.attributes.position, nn=g.attributes.normal, c=g.attributes.color;
    for(let i=0;i<p.count;i++){P.push(p.getX(i),p.getY(i),p.getZ(i));N.push(nn.getX(i),nn.getY(i),nn.getZ(i)); if(hasC)Cc.push(c.getX(i),c.getY(i),c.getZ(i)); if(hasU)UV.push(g.attributes.uv.getX(i),g.attributes.uv.getY(i));}
    const ix=g.index.array; for(let i=0;i<ix.length;i++)idx.push(ix[i]+off); off+=p.count;
  }
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(P,3)); g.setAttribute('normal',new THREE.Float32BufferAttribute(N,3));
  if(hasC)g.setAttribute('color',new THREE.Float32BufferAttribute(Cc,3));
  if(hasU)g.setAttribute('uv',new THREE.Float32BufferAttribute(UV,2));
  g.setIndex(idx); g.computeBoundingSphere(); return g;
}
const xf=(g,x=0,y=0,z=0,rx=0,ry=0,rz=0,s=1)=>{g.applyMatrix4(new THREE.Matrix4().compose(V(x,y,z),new THREE.Quaternion().setFromEuler(new THREE.Euler(rx,ry,rz)),typeof s==='number'?V(s,s,s):s));return g;};

/* ink helpers: guarded so the module still runs without ink.js */
const NOOP_EM={intensity:0,active:false,rate:0};
const inkEm=(t,o)=>G.ink&&G.ink.emitter?G.ink.emitter(t,o):Object.assign({},NOOP_EM);
const inkPool=(t,o)=>G.ink&&G.ink.pool?G.ink.pool(t,o):{intensity:0,active:false,mesh:{visible:false}};
const inkBurst=(p,o)=>{if(G.ink&&G.ink.burst)G.ink.burst(p,o);};
const INK_FAR=55;
function inkRef(){ if(G.state.mode==='title'||!G.player||!G.player.pos)return G.camera.position; return G.player.pos; }
/** negative ink: G.negMaterial + legs that thin into mist near the ground + smear along the velocity */
function negInk(o={}){
  const m=G.negMaterial(o);
  m.uniforms.uGround={value:-1e4}; m.uniforms.uMist={value:.6}; m.uniforms.uVel={value:V()};
  m.vertexShader=m.vertexShader.replace('uniform float uTime;','uniform float uTime;uniform vec3 uVel;')
    .replace('wp.xyz+=wn*uAmp*n;','wp.xyz+=wn*uAmp*n; float bk=max(0.,-dot(wn,normalize(uVel+vec3(0.,1e-4,0.)))); wp.xyz-=uVel*.075*bk*(.55+.45*n);');
  m.fragmentShader=m.fragmentShader.replace('uniform float uTime;','uniform float uTime;uniform float uGround;uniform float uMist;')
    .replace('gl_FragColor=vec4(col,clamp(a,0.,1.));','float gh=(vW.y-uGround)/uMist+(n-.5)*.7; a*=smoothstep(.05,1.,gh); if(a<.02)discard; gl_FragColor=vec4(col,clamp(a,0.,1.));');
  return m;
}
/* ---------------------------------------------------------------- negatives (the Shadows) */
const KINDS={
  stag:{bl:1.5,br:.36,ll:1.05,nk:.72,hd:.2,tail:.14,ear:.13,walk:1.3,run:5.4,noun:'a young stag',cured:'#7a5d45',sc:1,hgt:1.75},
  fox:{bl:.78,br:.2,ll:.36,nk:.24,hd:.15,tail:.6,ear:.15,walk:1.6,run:5.8,noun:'a fox',cured:'#b0612c',sc:.5,hgt:.7},
  hare:{bl:.44,br:.17,ll:.2,nk:.08,hd:.12,tail:.08,ear:.32,walk:1.4,run:6.2,noun:'a hare',cured:'#8a7d68',hop:true,sc:.38,hgt:.62},
  heron:{bl:.62,br:.17,ll:.95,nk:.62,hd:.08,tail:.12,ear:0,walk:.75,run:4.8,noun:'a grey heron',cured:'#9ea4aa',heron:true,sc:.55,hgt:1.45}
};
/* sculpt descriptions per kind. body-space: +z forward. Each returns {bodyY, body:[prims], neckAt, neck:[prims] (neck-space),
   headAt (neck-space), head:[prims], legs:[{at,pts,r0,r1,col,foot}], tail:{at,prims}, eyes:[[x,y,z]], extra tubes */
const COLS={
  stag:{a:'#7b5b40',b:'#5c4230',belly:'#c9b394',dark:'#2c211a',nose:'#1d1714',ant:'#d8c6a2'},
  fox:{a:'#b5622a',b:'#8f4920',belly:'#eee3cf',dark:'#2a1d18',nose:'#151110'},
  hare:{a:'#8d7b62',b:'#6f604c',belly:'#e3dacb',dark:'#3b3128',nose:'#5a4038'},
  heron:{a:'#a3a8ae',b:'#6f767f',belly:'#eef0ee',dark:'#24262b',nose:'#d1a640'}
};
function animalSpec(kind){
  const c=COLS[kind];
  if(kind==='stag')return {bodyY:1.24,
    body:[{t:'e',c:[0,0,0],r:[.27,.32,.6],col:c.a},{t:'e',c:[0,.04,.42],r:[.27,.36,.32],col:c.a,k:.12},{t:'e',c:[0,.03,-.42],r:[.27,.32,.3],col:c.a,k:.12},
      {t:'e',c:[0,-.16,.05],r:[.2,.16,.45],col:c.belly,k:.1},{t:'e',c:[.16,-.02,.42],r:[.11,.26,.16],col:c.b,k:.06},{t:'e',c:[-.16,-.02,.42],r:[.11,.26,.16],col:c.b,k:.06},
      {t:'e',c:[.15,-.06,-.42],r:[.13,.28,.2],col:c.a,k:.08},{t:'e',c:[-.15,-.06,-.42],r:[.13,.28,.2],col:c.a,k:.08},
      {t:'e',c:[0,.08,-.66],r:[.15,.17,.1],col:c.belly,k:.06},{t:'c',a:[0,.12,.5],b:[0,.4,.72],r0:.2,r1:.16,col:c.a,k:.1}],
    neckAt:[0,.32,.66], neck:[{t:'c',a:[0,0,0],b:[0,.5,.22],r0:.17,r1:.11,col:c.a},{t:'e',c:[0,.12,.06],r:[.15,.2,.13],col:c.belly,k:.06,sharp:40}],
    headAt:[0,.56,.25], head:[{t:'e',c:[0,0,0],r:[.11,.12,.14],col:c.a},{t:'c',a:[0,-.02,.06],b:[0,-.09,.3],r0:.085,r1:.055,col:c.b,k:.05},
      {t:'e',c:[0,-.1,.32],r:[.05,.04,.035],col:c.nose,k:.02,sharp:140},{t:'e',c:[.13,.1,-.06],r:[.035,.12,.055],rot:[.2,0,-1.05],col:c.b,k:.02},{t:'e',c:[-.13,.1,-.06],r:[.035,.12,.055],rot:[.2,0,1.05],col:c.b,k:.02}],
    antlers:true, eyes:[[.085,.03,.07],[-.085,.03,.07]],
    legs:[{at:[.15,-.12,.45],pts:[[0,0,0],[0,-.38,.03],[0,-.74,-.02],[0,-1.05,.02],[0,-1.12,.04]],r0:.085,r1:.032},
          {at:[-.15,-.12,.45],pts:[[0,0,0],[0,-.38,.03],[0,-.74,-.02],[0,-1.05,.02],[0,-1.12,.04]],r0:.085,r1:.032},
          {at:[.15,-.12,-.45],pts:[[0,0,0],[0,-.32,-.1],[0,-.58,-.2],[0,-.92,-.12],[0,-1.12,-.08]],r0:.1,r1:.032},
          {at:[-.15,-.12,-.45],pts:[[0,0,0],[0,-.32,-.1],[0,-.58,-.2],[0,-.92,-.12],[0,-1.12,-.08]],r0:.1,r1:.032}],
    legCol:[c.b,c.dark,.82],
    tail:{at:[0,.12,-.7],prims:[{t:'e',c:[0,-.06,-.03],r:[.06,.11,.05],rot:[-.4,0,0],col:c.belly}]},
    back:[[0,.3,.3],[0,.3,-.1],[0,.25,-.5]]};
  if(kind==='fox')return {bodyY:.47,
    body:[{t:'e',c:[0,0,0],r:[.13,.14,.32],col:c.a},{t:'e',c:[0,.0,.22],r:[.14,.17,.17],col:c.a,k:.07},{t:'e',c:[0,.01,-.22],r:[.14,.15,.16],col:c.a,k:.07},
      {t:'e',c:[0,-.07,.2],r:[.1,.12,.12],col:c.belly,k:.04,sharp:50},{t:'e',c:[0,-.08,-.02],r:[.09,.07,.24],col:c.belly,k:.05},
      {t:'c',a:[0,.04,.26],b:[0,.14,.36],r0:.1,r1:.085,col:c.a,k:.06}],
    neckAt:[0,.12,.34], neck:[{t:'c',a:[0,0,0],b:[0,.1,.08],r0:.085,r1:.075,col:c.a},{t:'e',c:[0,.02,.07],r:[.075,.08,.05],col:c.belly,k:.03}],
    headAt:[0,.14,.11], head:[{t:'e',c:[0,0,0],r:[.085,.075,.085],col:c.a},{t:'e',c:[.045,-.03,.03],r:[.055,.045,.06],col:c.belly,k:.03,sharp:90},{t:'e',c:[-.045,-.03,.03],r:[.055,.045,.06],col:c.belly,k:.03,sharp:90},
      {t:'c',a:[0,-.015,.05],b:[0,-.035,.19],r0:.045,r1:.017,col:c.a,k:.035},{t:'e',c:[0,-.035,.195],r:[.017,.015,.014],col:c.nose,k:.005,sharp:200},
      {t:'c',a:[.05,.045,-.01],b:[.07,.15,-.025],r0:.04,r1:.004,col:c.a,k:.02},{t:'c',a:[-.05,.045,-.01],b:[-.07,.15,-.025],r0:.04,r1:.004,col:c.a,k:.02}],
    eyes:[[.042,.018,.07],[-.042,.018,.07]],
    legs:[{at:[.07,-.06,.22],pts:[[0,0,0],[0,-.2,.01],[0,-.38,.0],[0,-.41,.03]],r0:.045,r1:.02},{at:[-.07,-.06,.22],pts:[[0,0,0],[0,-.2,.01],[0,-.38,.0],[0,-.41,.03]],r0:.045,r1:.02},
          {at:[.07,-.05,-.22],pts:[[0,0,0],[0,-.14,-.06],[0,-.26,-.08],[0,-.42,-.03]],r0:.055,r1:.02},{at:[-.07,-.05,-.22],pts:[[0,0,0],[0,-.14,-.06],[0,-.26,-.08],[0,-.42,-.03]],r0:.055,r1:.02}],
    legCol:[c.a,c.dark,.55],
    tail:{at:[0,.06,-.33],prims:[{t:'c',a:[0,0,0],b:[0,-.12,-.42],r0:.05,r1:.11,col:c.a},{t:'e',c:[0,-.15,-.5],r:[.09,.09,.13],col:c.belly,k:.06,sharp:60}]},
    back:[[0,.13,.18],[0,.13,-.15]]};
  if(kind==='hare')return {bodyY:.27,
    body:[{t:'e',c:[0,.02,-.02],r:[.12,.14,.2],rot:[-.25,0,0],col:c.a},{t:'e',c:[.06,-.01,-.1],r:[.07,.12,.13],col:c.a,k:.05},{t:'e',c:[-.06,-.01,-.1],r:[.07,.12,.13],col:c.a,k:.05},
      {t:'e',c:[0,-.02,.12],r:[.09,.11,.1],col:c.a,k:.06},{t:'e',c:[0,-.07,.04],r:[.08,.07,.15],col:c.belly,k:.04}],
    neckAt:[0,.07,.15], neck:[{t:'e',c:[0,.02,.0],r:[.06,.06,.06],col:c.a}],
    headAt:[0,.07,.05], head:[{t:'e',c:[0,0,0],r:[.065,.07,.085],col:c.a},{t:'e',c:[0,-.02,.07],r:[.045,.045,.05],col:c.a,k:.03},{t:'e',c:[0,-.02,.115],r:[.012,.01,.008],col:c.nose,k:.004,sharp:200},
      {t:'e',c:[.03,.17,-.04],r:[.024,.13,.042],rot:[-.35,0,-.16],col:c.a,k:.02},{t:'e',c:[-.03,.17,-.04],r:[.024,.13,.042],rot:[-.35,0,.16],col:c.a,k:.02}],
    earTips:[[.05,.29,-.09],[-.05,.29,-.09]],
    eyes:[[.05,.02,.04],[-.05,.02,.04]],
    legs:[{at:[.04,-.05,.12],pts:[[0,0,0],[0,-.12,.02],[0,-.22,.03]],r0:.026,r1:.016},{at:[-.04,-.05,.12],pts:[[0,0,0],[0,-.12,.02],[0,-.22,.03]],r0:.026,r1:.016},
          {at:[.07,-.08,-.1],pts:[[0,0,0],[0,-.1,-.06],[0,-.18,-.02],[0,-.19,.1]],r0:.045,r1:.022},{at:[-.07,-.08,-.1],pts:[[0,0,0],[0,-.1,-.06],[0,-.18,-.02],[0,-.19,.1]],r0:.045,r1:.022}],
    legCol:[c.a,c.a,.5],
    tail:{at:[0,.06,-.2],prims:[{t:'e',c:[0,0,-.01],r:[.04,.04,.035],col:c.belly}]},
    back:[[0,.13,0],[0,.12,-.12]]};
  // heron
  return {bodyY:.95,
    body:[{t:'e',c:[0,.12,0],r:[.14,.15,.3],rot:[-.35,0,0],col:c.a},{t:'e',c:[0,.06,.12],r:[.12,.15,.13],col:c.belly,k:.06,sharp:50},{t:'e',c:[0,.03,-.28],r:[.09,.05,.14],rot:[.3,0,0],col:c.b,k:.05}],
    neckAt:[0,.24,.2], neck:[], neckTube:{pts:[[0,0,0],[0,.16,.08],[0,.32,.06]],r0:.05,r1:.035,col:c.belly},
    neck2At:[0,.32,.06], neck2Tube:{pts:[[0,0,0],[0,.12,-.05],[0,.26,-.08]],r0:.035,r1:.03,col:c.belly},
    headAt:[0,.27,-.08], head:[{t:'e',c:[0,0,0],r:[.048,.05,.065],col:c.belly},{t:'e',c:[0,.032,-.02],r:[.03,.02,.06],col:c.dark,k:.01,sharp:120},
      {t:'c',a:[0,-.005,.05],b:[0,-.02,.26],r0:.022,r1:.003,col:c.nose,k:.015,sharp:160},{t:'c',a:[0,.03,-.04],b:[0,.04,-.17],r0:.012,r1:.003,col:c.dark,k:.01}],
    eyes:[[.033,.012,.02],[-.033,.012,.02]],
    wings:true,
    legs:[{at:[.06,.04,-.02],pts:[[0,0,0],[0,-.45,.02],[0,-.8,-.02],[0,-.96,.0]],r0:.022,r1:.012,foot:true},{at:[-.06,.04,-.02],pts:[[0,0,0],[0,-.45,.02],[0,-.8,-.02],[0,-.96,.0]],r0:.022,r1:.012,foot:true}],
    legCol:[c.b,'#8a7a52',.7],
    tail:{at:[0,.06,-.34],prims:[{t:'e',c:[0,-.02,-.06],r:[.07,.025,.1],rot:[.25,0,0],col:c.b}]},
    back:[[0,.25,.05],[0,.2,-.2]]};
}
const animalGeoCache={};
function animalGeos(kind){
  if(animalGeoCache[kind])return animalGeoCache[kind];
  const sp=animalSpec(kind), h=kind==='stag'?.035:kind==='heron'?.016:kind==='fox'?.02:.014;
  const fur=(x,y,z,a,i)=>{const n=.9+.2*U.vnoise(x*40+z*13,y*40);a[i]*=n;a[i+1]*=n;a[i+2]*=n;};
  const G2={sp};
  G2.body=sdfGeo(sp.body,h,fur);
  G2.neck=sp.neck.length?sdfGeo(sp.neck,h*.8,fur):null;
  G2.head=sdfGeo(sp.head,h*.6,fur);
  if(sp.neckTube)G2.neckT=tube(sp.neckTube.pts,sp.neckTube.r0,sp.neckTube.r1,10,10,sp.neckTube.col);
  if(sp.neck2Tube)G2.neck2T=tube(sp.neck2Tube.pts,sp.neck2Tube.r0,sp.neck2Tube.r1,10,10,sp.neck2Tube.col);
  G2.tail=sdfGeo(sp.tail.prims,h*.6,fur);
  const [lc,fc,fy]=sp.legCol;
  G2.legs=sp.legs.map(L=>{
    const len=-L.pts[L.pts.length-1][1];
    const g=tube(L.pts,L.r0,L.r1,16,9,lc,(x,y,z,a,i)=>{ if(-y>len*fy){const c=U.col(fc);a[i]=c.r;a[i+1]=c.g;a[i+2]=c.b;} });
    if(L.foot){ const ft=[]; for(const ang of [-.6,0,.6]){const t=tube([[0,0,0],[Math.sin(ang)*.08,0,Math.cos(ang)*.09]],.008,.005,3,5,fc);t.translate(0,-len,0);ft.push(t);} return mergeGeos([g,...ft]); }
    return g;
  });
  if(sp.antlers){
    const parts=[];
    for(const s of [-1,1]){
      const beam=[[s*.05,.1,-.03],[s*.16,.3,-.1],[s*.24,.52,-.08],[s*.26,.72,.02],[s*.22,.86,.12]];
      parts.push(tube(beam,.028,.012,14,7,COLS.stag.ant));
      const tines=[[1,[.0,.14,.16]],[2,[.06,.2,.12]],[3,[-.05,.2,.04]],[3.5,[.06,.12,-.12]]];
      const curve=new THREE.CatmullRomCurve3(beam.map(p=>V(...p)));
      for(const [k,d] of tines){const p=curve.getPointAt(Math.min(1,k/4)); parts.push(tube([[p.x,p.y,p.z],[p.x+s*d[0]*.6,p.y+d[1]*.6,p.z+d[2]*.6],[p.x+s*d[0],p.y+d[1],p.z+d[2]]],.016,.006,6,6,COLS.stag.ant));}
      // brow tine
      parts.push(tube([[s*.07,.14,-.03],[s*.1,.2,.08],[s*.1,.22,.18]],.017,.006,6,6,COLS.stag.ant));
    }
    G2.antlers=mergeGeos(parts);
  }
  if(sp.wings){
    G2.wing=[-1,1].map(s=>sdfGeo([{t:'e',c:[s*.03,0,-.12],r:[.04,.13,.34],rot:[-.4,0,0],col:COLS.heron.b},{t:'e',c:[s*.035,-.04,-.36],r:[.03,.06,.14],rot:[-.4,0,0],col:COLS.heron.dark,k:.04,sharp:60}],.016));
  }
  return animalGeoCache[kind]=G2;
}
/** builds an animal rig. mode 'neg' → ink materials, mist, eyes glow; 'real' → toon + outlines. */
function buildAnimal(kind,mode){
  const S=KINDS[kind], sp=animalSpec(kind), GG=animalGeos(kind), neg=mode==='neg';
  const root=new THREE.Group(), body=new THREE.Group(); root.add(body); body.position.y=sp.bodyY;
  const meshes=[], mats=[], outlines=[];
  let mat, thinMat;
  if(neg){
    const sc=S.sc;
    mat=negInk({amp:.045*sc+.012,scale:1.6/sc,wisp:.8,flow:.4,strength:1.05,rim:'#8a62f0',ink:'#1a0b26',inkStrength:.55});
    thinMat=negInk({amp:.01*sc+.004,scale:2.5/sc,wisp:.7,flow:.5,strength:1.3,rim:'#9a72ff',ink:'#1a0b26',inkStrength:.55});
    mats.push(mat,thinMat);
  }else{
    mat=G.toon('#ffffff',{vertexColors:true,transparent:true,opacity:1});
    mats.push(mat); thinMat=mat;
  }
  const add=(geo,parent,m=mat,ol=.012*Math.max(.6,S.sc))=>{const o=new THREE.Mesh(geo,m);parent.add(o);meshes.push(o);
    if(!neg){o.castShadow=true; const L=G.outline(o,{thickness:ol}); if(L)outlines.push(L);} return o;};
  add(GG.body,body);
  const neck=new THREE.Group(); neck.position.set(...sp.neckAt); body.add(neck);
  let head, neck2=null;
  if(GG.neck)add(GG.neck,neck);
  if(GG.neckT){ add(GG.neckT,neck,thinMat); neck2=new THREE.Group(); neck2.position.set(...sp.neck2At); neck.add(neck2); add(GG.neck2T,neck2,thinMat);
    head=new THREE.Group(); head.position.set(...sp.headAt); neck2.add(head); }
  else{ head=new THREE.Group(); head.position.set(...sp.headAt); neck.add(head); }
  add(GG.head,head,S.heron?thinMat:mat);
  if(GG.antlers)add(GG.antlers,head,thinMat,.008);
  const tail=new THREE.Group(); tail.position.set(...sp.tail.at); body.add(tail); add(GG.tail,tail);
  const legs=sp.legs.map((L,i)=>{const piv=new THREE.Group(); piv.position.set(...L.at); body.add(piv); add(GG.legs[i],piv,S.sc<.6?thinMat:mat,.01*Math.max(.6,S.sc)); return piv;});
  let wings=null;
  if(GG.wing){wings=[-1,1].map((s,i)=>{const w=new THREE.Group(); w.position.set(s*.12,.2,.08); body.add(w); add(GG.wing[i],w); return w;});}
  // eyes
  const eyeMat=neg?new THREE.MeshBasicMaterial({color:U.col('#c09aff').multiplyScalar(1.6),transparent:true,fog:true}):G.toon('#140f0c');
  const eyeGeo=new THREE.SphereGeometry(Math.max(.008,.016*S.sc+.004),8,6);
  const eyes=sp.eyes.map(e=>{const m=new THREE.Mesh(eyeGeo,eyeMat); m.position.set(...e); head.add(m); return m;});
  if(neg)mats.push(eyeMat);
  // ink anchors
  const anchors={back:[],tips:[],feet:[]};
  for(const b of sp.back){const o=new THREE.Object3D(); o.position.set(...b); body.add(o); anchors.back.push(o);}
  if(GG.antlers){for(const s of [-1,1])for(const p of [[s*.22,.86,.12],[s*.3,.7,.14],[s*.2,.68,-.12]]){const o=new THREE.Object3D(); o.position.set(...p); head.add(o); anchors.tips.push(o);}}
  if(sp.earTips)for(const p of sp.earTips){const o=new THREE.Object3D(); o.position.set(...p); head.add(o); anchors.tips.push(o);}
  {const o=new THREE.Object3D(); o.position.set(0,-.1,-.15); tail.add(o); anchors.tips.push(o);}
  if(kind==='fox'){const o=new THREE.Object3D(); o.position.set(0,-.15,-.5); tail.add(o); anchors.tips.push(o,o);}
  if(kind==='heron'){const o=new THREE.Object3D(); o.position.set(0,.04,-.15); head.add(o); anchors.tips.push(o);}
  for(const L of legs){const o=new THREE.Object3D(); o.position.set(0,-sp.bodyY*.85,0); L.add(o); anchors.feet.push(o);}
  return {root,body,head,neck,neck2,legs,tail,wings,S,sp,meshes,mats,mat,thinMat,outlines,eyes,anchors};
}
function animAnimal(c,phase,speed,graze,t,fly,dt){
  const S=c.S, amp=Math.min(1,speed/S.walk)*(speed>S.walk*1.5?.75:.45), k=Math.min(1,(dt||1/30)*5);
  const by=c.sp.bodyY;
  if(S.heron){
    if(fly){ c.wings.forEach((w,i)=>{w.rotation.z=(i?-1:1)*(1.1+Math.sin(t*9)*.8);}); c.legs.forEach(l=>l.rotation.x=-1.1); c.neck.rotation.x+=(-.6-c.neck.rotation.x)*.1; return; }
    c.wings.forEach(w=>w.rotation.z=Math.sin(t*1.3)*.03);
    c.legs.forEach((l,i)=>l.rotation.x=speed>.05?Math.sin(phase+(i?PI:0))*amp*.9:0);
    const stab=graze?Math.max(0,Math.sin(t*2.3+phase))**6:0;
    c.neck.rotation.x+=((graze?.7+stab*.8:Math.sin(t*.7)*.05)-c.neck.rotation.x)*k;
    if(c.neck2)c.neck2.rotation.x+=((graze?.3+stab*.4:0)-c.neck2.rotation.x)*k;
    c.head.rotation.y=Math.sin(t*.9+phase)*.35*(graze?0:1);
    c.body.position.y=by+(speed>.05?Math.abs(Math.sin(phase))*.03:0)+Math.sin(t*1.6)*.006;
    return;
  }
  if(S.hop){
    const hop=Math.abs(Math.sin(phase*.8)); c.body.position.y=by+(speed>.1?hop*(speed>3?.32:.14):0);
    c.body.rotation.x=speed>.1?-Math.cos(phase*.8)*.25:0;
    c.legs.forEach((l,i)=>l.rotation.x=speed>.1?Math.sin(phase*.8+(i<2?0:PI))*amp*1.2:0);
  }else{
    c.body.position.y=by+(speed>.1?Math.abs(Math.sin(phase))*.04*S.ll:Math.sin(t*1.4)*.006*S.ll);
    const off=[0,PI,PI*.85,PI*1.85];
    c.legs.forEach((l,i)=>l.rotation.x=Math.sin(phase+off[i])*amp);
    c.body.rotation.x=speed>.1?Math.sin(phase*2)*.02:0;
  }
  // grazing: the neck goes down, the head tilts to meet the grass
  const gz=graze?1:0;
  c.neck.rotation.x+=((gz*(S.hop?.5:S.sc>.9?1.3:1.55)+(speed>S.walk*1.5?-.15:0))-c.neck.rotation.x)*k;
  c.head.rotation.x+=((gz*(S.hop?.25:S.sc>.9?.45:.85))-c.head.rotation.x)*k;
  c.head.rotation.y=graze?Math.sin(t*1.7+phase)*.12:Math.sin(t*.5+phase)*.25;
  c.tail.rotation.x=(S.hop?0:Math.sin(t*2.2+phase)*.08)+(speed>S.walk*1.5?-.4:0);
  c.tail.rotation.y=Math.sin(t*3+phase)*.18;
}
const negatives=[], freedAnimals=[];
let freedCount=0;
function okGround(x,z){
  if(G.world.walkable&&!G.world.walkable(x,z))return false;
  const g=lhGeo(); if(Math.hypot(x-g.cx,z-g.cz)<g.outerR+4)return false;
  return true;
}
function negEmitters(n){
  const c=n.c, sc=c.S.sc, A=c.anchors;
  n.em={
    back:inkEm(A.back,{rate:8,radius:.22*sc+.04,height:.1*sc,size:[.5*sc+.12,1.5*sc+.3],life:[1,1.8],rise:.35+.25*sc,drift:.18,trail:1,alpha:.95,embers:.35}),
    tips:inkEm(A.tips,{rate:3.5,radius:.04,size:[.2*sc+.06,.7*sc+.14],life:[.7,1.3],rise:.25,drift:.12,trail:1,alpha:.85}),
    feet:inkEm(A.feet,{rate:3,radius:.18*sc+.05,size:[.6*sc+.15,1.5*sc+.3],life:[1.4,2.2],rise:.08,drift:.2,trail:.8,alpha:.22,color:'#4a4262'})
  };
  n.pool=inkPool(n.pos,{radius:Math.max(.45,c.S.bl*.6),alpha:.5,rim:'#2c1f4a'});
}
function buildNegatives(){
  let homes=LM().negativeHomes;
  if(!Array.isArray(homes)||!homes.length)homes=[{x:-110,z:-25,kind:'stag'},{x:-60,z:-40,kind:'stag'},{x:-95,z:30,kind:'fox'},{x:10,z:-20,kind:'fox'},{x:-40,z:50,kind:'fox'},{x:25,z:20,kind:'hare'},{x:70,z:25,kind:'hare'},{x:40,z:60,kind:'heron'}];
  homes.forEach((h,i)=>{
    const kind=KINDS[h.kind]?h.kind:'fox';
    const c=buildAnimal(kind,'neg');
    const y=isFinite(h.y)?h.y:H(h.x,h.z);
    const n={i,kind,c,mat:c.mat,pos:V(h.x,y,h.z),home:V(h.x,y,h.z),heading:rnd()*TAU,phase:rnd()*10,wt:null,pause:rnd()*3,fleeT:0,bite:0,hits:0,
      dying:false,dead:false,fade:1,center:V(),hgt:c.S.hgt,state:'wander',ashT:rnd(),prev:V(h.x,y,h.z),vel:V(),real:null};
    c.root.position.copy(n.pos); c.root.rotation.y=n.heading; c.root.name='negative_'+kind; G.scene.add(c.root);
    negEmitters(n);
    negatives.push(n);
  });
}
function spawnFreed(n){
  // the real animal has been fading in underneath; hand it over to the freed list
  const c=n.real||buildRealUnder(n);
  c.mats.forEach(m=>m.opacity=1); c.outlines.forEach(o=>o.visible=true); c.root.visible=true;
  const pp=G.player&&G.player.pos||n.pos;
  let hd=Math.atan2(n.pos.x-pp.x,n.pos.z-pp.z); if(!isFinite(hd))hd=n.heading;
  freedAnimals.push({c,mats:c.mats,outlines:c.outlines,pos:n.pos.clone(),heading:n.heading,want:hd,t:0,phase:0,kind:n.kind,vy:0});
}
function buildRealUnder(n){
  const c=buildAnimal(n.kind,'real');
  c.root.position.copy(n.pos); c.root.rotation.y=n.heading; G.scene.add(c.root);
  c.mats.forEach(m=>m.opacity=0); c.outlines.forEach(o=>o.visible=false);
  n.real=c; return c;
}
function finishNeg(n){
  n.dead=true; n.c.root.visible=false; spawnFreed(n); freedCount++; API.freed=freedCount;
  ashBurst(n.center,30,1.2);
  inkBurst(n.center,{n:22,speed:2.2*n.c.S.sc+.6,size:[.4*n.c.S.sc+.15,1.4*n.c.S.sc+.3],up:1.4,embers:14});
  for(const k in n.em)G.ink&&G.ink.remove&&G.ink.remove(n.em[k]);
  if(n.pool&&G.ink&&G.ink.remove)G.ink.remove(n.pool);
  G.emit('negative:freed',{kind:n.kind,pos:n.pos.clone(),freed:freedCount,total:negatives.length});
  for(const m of moths) if(m.tgt==='hunt'&&m.prey&&m.prey.key===n)toLanternOrHome(m);
}
/* save/load: silently mark negatives as already freed (no burst, no event) */
function restoreFreed(idx){
  (idx||[]).forEach(i=>{ const n=negatives[i]; if(!n||n.dead)return;
    n.dead=true; n.c.root.visible=false; freedCount++; API.freed=freedCount;
    for(const k in n.em)G.ink&&G.ink.remove&&G.ink.remove(n.em[k]);
    if(n.pool&&G.ink&&G.ink.remove)G.ink.remove(n.pool); });
}
function steer(o,want,rate,dt){o.heading+=U.angDiff(want,o.heading)*Math.min(1,dt*rate);}
function moveAnimal(o,speed,dt,r){
  if(speed<=0)return;
  const dx=Math.sin(o.heading)*speed*dt, dz=Math.cos(o.heading)*speed*dt;
  const nx=o.pos.x+dx, nz=o.pos.z+dz;
  if(!okGround(nx,nz)){o.heading+=1.3;o.wt=null;return;}
  const res=G.moveCharacter(o.pos,dx,dz,r,'creature');
  if(res.blocked){o.heading+=1.1;o.wt=null;}
}
const _iv=V(), _ref=V();
function updateNegatives(dt){
  const play=isPlay(), t=G.time, L=lantern(), lp=lanternPos();
  const swarmLive=lanternCount>3&&L&&L.found&&!cured;
  const pp=G.player&&G.player.pos, palive=G.player&&G.player.alive!==false;
  _ref.copy(inkRef());
  for(const n of negatives){
    if(n.dead)continue;
    n.center.set(n.pos.x,n.pos.y+n.hgt*.6,n.pos.z);
    const S=KINDS[n.kind], c=n.c;
    const near=U.dist2(n.pos,_ref)<INK_FAR;
    // ash (sparser now: the smoke carries the look)
    n.ashT-=dt; if(near&&n.ashT<=0){n.ashT=n.dying?.03:.4+rnd()*.4; emitAsh(n.pos.x+(rnd()-.5)*S.bl*.8,n.pos.y+rnd()*n.hgt,n.pos.z+(rnd()-.5)*S.bl*.8,(rnd()-.5)*.25*(n.dying?5:1),.4+rnd()*.6*(n.dying?3:1),(rnd()-.5)*.25*(n.dying?5:1),1.2+rnd()*1.6);}
    // ink uniforms: legs thin into mist above the ground; movement smears the body backwards
    if(dt>0){_iv.subVectors(n.pos,n.prev).divideScalar(dt); _iv.y=0; if(_iv.lengthSq()>400)_iv.set(0,0,0); n.vel.lerp(_iv,Math.min(1,dt*6));}
    n.prev.copy(n.pos);
    for(const m of [c.mat,c.thinMat]){ m.uniforms.uGround.value=n.pos.y+(S.heron?.05:.02); m.uniforms.uMist.value=Math.max(.12,S.ll*.55); m.uniforms.uVel.value.copy(n.vel); }
    const sp=n.vel.length(), I=near?1:0;
    n.em.back.intensity=I*(n.dying?1:sp>2?.55:1); n.em.tips.intensity=I; n.em.feet.intensity=I*(n.dying?0:1);
    n.pool.intensity=near?(n.dying?Math.max(0,n.fade):1):0;
    if(n.dying){
      // the black boils off in a smoke column, then the real animal stands where it was
      n.fade-=dt/2.2; const f=Math.max(0,n.fade);
      c.mat.uniforms.uFade.value=f; c.thinMat.uniforms.uFade.value=f;
      c.eyes[0].material.opacity=f;
      c.body.rotation.z=(rnd()-.5)*.25*f;
      const real=n.real||buildRealUnder(n);
      real.root.position.copy(n.pos); real.root.rotation.y=n.heading;
      animAnimal(real,0,0,false,t,false,dt); real.body.rotation.z=Math.sin(t*45)*.04;
      const op=U.smooth(.75,.15,f); real.mats.forEach(m=>m.opacity=op); real.outlines.forEach(o=>o.visible=op>.8); real.root.visible=op>.02;
      if(f<=0)finishNeg(n);
      continue;
    }
    if(n.bite>2.6){
      n.dying=true;
      Object.assign(n.em.back,{rate:30,rise:2.6,drift:.5,size:[.5*S.sc+.2,2.2*S.sc+.5],life:[1.2,2.2],alpha:.85,embers:8,radius:.3*S.sc+.08,height:n.hgt*.5});
      Object.assign(n.em.tips,{rate:14,rise:1.6,size:[.3*S.sc+.1,1*S.sc+.2]});
      inkBurst(n.center,{n:18,speed:1.5,size:[.4*S.sc+.15,1.2*S.sc+.3],up:2,embers:10});
      continue;
    }
    const dL=U.dist2(n.pos,lp), dP=pp?U.dist2(n.pos,pp):1e9;
    const swarm=swarmLive&&dL<9;
    let speed=0, want=n.heading, rate=4, graze=false;
    if(play&&(swarm||n.hits>3)){
      if(n.fleeT<2.6){n.fleeT+=dt;want=Math.atan2(n.pos.x-lp.x,n.pos.z-lp.z);speed=S.run;rate=8;n.state='flee';}
      else {n.state='cower';c.body.rotation.z=Math.sin(t*40)*.05; c.neck.rotation.x+=(.9-c.neck.rotation.x)*.2;}
    }else{
      n.fleeT=Math.max(0,n.fleeT-dt*.4); c.body.rotation.z=0;
      if(play&&palive&&dP<14&&!swarmLive){
        want=Math.atan2(pp.x-n.pos.x,pp.z-n.pos.z);
        if(dP>8.5)speed=S.walk*.9; else if(dP<4.5){want+=PI;speed=S.walk*2.2;}
        n.state='watch';
      }else{
        n.state='wander';
        if(!n.wt||U.dist2(n.pos,n.wt)<.6){
          if(n.pause>0){n.pause-=dt;graze=true;}
          else{ let x,z,k=0; do{const a=rnd()*TAU,r=2+rnd()*(S.heron?5:9);x=n.home.x+Math.cos(a)*r;z=n.home.z+Math.sin(a)*r;k++;}while(!okGround(x,z)&&k<12);
            n.wt=V(x,0,z); n.pause=1.5+rnd()*4; }
        }else{want=Math.atan2(n.wt.x-n.pos.x,n.wt.z-n.pos.z);speed=S.walk;}
      }
    }
    if(!(dt>0))speed=0;
    steer(n,want,rate,dt);
    moveAnimal(n,speed,dt,S.br+.1);
    n.pos.y=U.damp(n.pos.y,G.floorAt(n.pos.x,n.pos.z,n.pos.y+.6),12,dt);
    n.phase+=dt*speed*(S.hop?3.2:4.5/Math.max(.4,S.ll));
    c.root.position.copy(n.pos); c.root.rotation.y=n.heading;
    if(n.state!=='cower')animAnimal(c,n.phase,speed,graze,t,false,dt);
    // a watching negative locks its head on the player
    if(n.state==='watch'&&pp){const a=U.angDiff(Math.atan2(pp.x-n.pos.x,pp.z-n.pos.z),n.heading); c.head.rotation.y=U.clamp(a,-.8,.8);}
    // eyes flicker
    c.eyes[0].material.opacity=.55+.45*Math.max(0,Math.sin(t*1.7+n.i))*(Math.sin(t*.37+n.i*2)>.95?0:1);
    n.hits=0;
    c.root.visible=G.focus.distanceToSquared(n.pos)<130*130||G.state.mode==='title';
  }
  for(let i=freedAnimals.length-1;i>=0;i--){
    const k=freedAnimals[i]; k.t+=dt; const S=k.c.S;
    const fly=S.heron&&k.t>.7;
    let speed=k.t<.7?0:S.run*.85;
    if(k.t>.4)k.heading+=U.angDiff(k.want,k.heading)*Math.min(1,dt*6);
    if(fly){ k.vy=Math.min(3,k.vy+dt*4); k.pos.y+=k.vy*dt; k.pos.x+=Math.sin(k.heading)*speed*dt; k.pos.z+=Math.cos(k.heading)*speed*dt; }
    else{
      if(speed>0){const nx=k.pos.x+Math.sin(k.heading)*speed*dt,nz=k.pos.z+Math.cos(k.heading)*speed*dt; if(okGround(nx,nz)){k.pos.x=nx;k.pos.z=nz;}else{k.heading+=1.1;k.want=k.heading;}}
      else k.c.body.rotation.z=Math.sin(G.time*45)*.05;
      k.pos.y=G.floorAt(k.pos.x,k.pos.z,k.pos.y+.6);
    }
    k.phase+=dt*speed*(S.hop?3.2:4.5/Math.max(.4,S.ll));
    k.c.root.position.copy(k.pos); k.c.root.rotation.y=k.heading; animAnimal(k.c,k.phase,speed,false,G.time,fly,dt);
    const op=1-U.smooth(3,5,k.t); k.mats.forEach(m=>m.opacity=op); if(k.t>3)k.outlines.forEach(o=>o.visible=false);
    if(k.t>5.2){G.scene.remove(k.c.root);freedAnimals.splice(i,1);}
  }
}
/* ---------------------------------------------------------------- Halloran, one of the Unmade */
let hal=null;
const HAL_PRE=[
  'You can see me. Most things out here can’t, anymore. Name was Halloran, once. I kept that light for nineteen years.',
  'Don’t look at the arm. I know. It started with the arm.',
  'You’ll want a light before you go in there. My old storm lantern hangs on the oil shed, back past the cottage. Plain oil, plain flame. It’ll see you up the stair.',
  'The lamp went out the night the fog came. Nobody’s been up since. Nobody who came back down, anyway.',
  'Funny thing about moths. Out here they gather where there’s nothing to see at all.',
  'Go on. I’ll keep.'
];
/* after the storm lantern failed in the lamp room: he waits at the foot of the tower */
const HAL_FAIL=[
  'The moths left when the lamp went wrong. They nest in the old wood, west.',
  'Maren knew something about them. The night the fog came she took her lantern, the violet one, out to the old tree at the forest’s heart. She never came back. The lantern might have stayed.',
  'Something big walks those woods now. I hear it at night, breaking the trees. Keep that staff in your hand, and don’t let it corner you.',
  'Follow the path down off the cliff and across the moor. Mind the hamlet. I’ll keep.'
];
const HAL_MID=[
  'That’s her lantern. Then Maren’s... well. Keep it close. And keep those moths off me.',
  'My old flame only fed that thing up there. Hers is different. The moths know it.',
  'Go on, then. Up you go.'
];
const HAL_POST=[
  'You lit it. I felt it from down here, like sun on a bad tooth.',
  'Those moths went through the dark up there and didn’t leave a scrap of it.',
  'There’s more of it out on the island. More of me, too, if you go looking.',
  'Mind the swarm when you come by. I’d like to stay as much myself as I’ve got left.'
];
/* corruption stain: a toon material whose surface goes to ink where (aCor × uCreep + noise) passes a threshold,
   with a bruised, violet-lit creeping edge. aCor is a per-vertex 0..1 "how close to the source" value. */
const CREEP={value:1};
function corToon(hex,o={}){
  const m=G.toon(hex,o);
  m.onBeforeCompile=sh=>{
    sh.uniforms.uTime=G.negTime; sh.uniforms.uCreep=CREEP;
    sh.vertexShader='attribute float aCor;varying float vCor;varying vec3 vObj;\n'+sh.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvCor=aCor;vObj=position;');
    sh.fragmentShader='uniform float uTime;uniform float uCreep;varying float vCor;varying vec3 vObj;\n'+(G.SNOISE||'float snoise(vec3 p){return sin(p.x*3.1+p.y*2.3+p.z*1.7);}')+'\n'+sh.fragmentShader.replace(
      'vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;',
      `vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
      float cn=snoise(vObj*24.+vec3(0.,-uTime*.22,0.))*.55+snoise(vObj*8.-vec3(uTime*.05,uTime*.1,0.))*.45;
      float cm=vCor*uCreep+cn*.2-.5;
      float inkA=smoothstep(-.012,.012,cm);
      float edge=smoothstep(-.12,0.,cm)*(1.-inkA);
      vec3 inkc=vec3(.014,.01,.022)+vec3(.3,.18,.55)*pow(max(0.,snoise(vObj*40.+uTime*.3)),4.)*.5;
      outgoingLight=mix(outgoingLight,outgoingLight*vec3(.42,.36,.5),edge);
      outgoingLight+=vec3(.5,.28,1.)*pow(edge,3.)*.55;
      outgoingLight=mix(outgoingLight,inkc,inkA);`);
  };
  m.customProgramCacheKey=()=>'corToon'+(o.map?'m':'')+(o.vertexColors?'v':'');
  return m;
}
function corAttr(g,fn){
  const p=g.attributes.position, a=new Float32Array(p.count);
  for(let i=0;i<p.count;i++)a[i]=fn?Math.max(0,Math.min(1,fn(p.getX(i),p.getY(i),p.getZ(i)))):0;
  g.setAttribute('aCor',new THREE.BufferAttribute(a,1)); return g;
}
const sst=(a,b,x)=>{const t=Math.min(1,Math.max(0,(x-a)/(b-a)));return t*t*(3-2*t);};
function wool(g,w,h,base,n=40,alpha=.08){
  g.fillStyle=base; g.fillRect(0,0,w,h);
  for(let i=0;i<n*w*h/4096;i++){const x=Math.random()*w,y=Math.random()*h; g.fillStyle=Math.random()<.5?`rgba(255,255,255,${alpha})`:`rgba(0,0,0,${alpha*1.4})`; g.fillRect(x,y,1+Math.random()*2,1+Math.random()*3);}
}
function halFaceTex(blink){
  const c=document.createElement('canvas'); c.width=512; c.height=256; const g=c.getContext('2d');
  // weathered skin: warm base, ruddy cheeks and nose, shadowed sockets, darker toward the jaw
  g.fillStyle='#c39377'; g.fillRect(0,0,512,256);
  const cx=128, ey=124;
  let gr=g.createLinearGradient(0,60,0,200); gr.addColorStop(0,'rgba(120,70,50,0)'); gr.addColorStop(1,'rgba(110,64,48,.35)'); g.fillStyle=gr; g.fillRect(0,60,512,140);
  for(const s of [-1,1]){gr=g.createRadialGradient(cx+s*30,ey+22,0,cx+s*30,ey+22,22);gr.addColorStop(0,'rgba(196,96,82,.45)');gr.addColorStop(1,'rgba(196,96,82,0)');g.fillStyle=gr;g.fillRect(cx+s*30-24,ey,48,48);}
  // mottling
  for(let i=0;i<500;i++){const x=Math.random()*512,y=40+Math.random()*180; g.fillStyle=Math.random()<.5?'rgba(150,90,70,.12)':'rgba(230,190,160,.08)'; g.beginPath(); g.arc(x,y,1+Math.random()*3,0,TAU); g.fill();}
  // deep-set sockets
  for(const s of [-1,1]){gr=g.createRadialGradient(cx+s*22,ey-2,2,cx+s*22,ey-2,20);gr.addColorStop(0,'rgba(90,50,40,.45)');gr.addColorStop(1,'rgba(90,50,40,0)');g.fillStyle=gr;g.fillRect(cx+s*22-22,ey-24,44,44);}
  g.lineCap='round';
  // forehead furrows
  g.strokeStyle='rgba(110,62,46,.55)'; g.lineWidth=1.6;
  for(let k=0;k<3;k++){g.beginPath(); g.moveTo(cx-30+k*3,ey-38-k*7); g.quadraticCurveTo(cx,ey-43-k*7+(k%2)*3,cx+30-k*3,ey-38-k*7); g.stroke();}
  // eyes: tired, warm, heavy-lidded, bags beneath
  for(const s of [-1,1]){
    const ex=cx+s*22;
    g.strokeStyle='rgba(110,62,46,.6)'; g.lineWidth=1.4;
    g.beginPath(); g.moveTo(ex-9,ey+9); g.quadraticCurveTo(ex,ey+14,ex+9,ey+8); g.stroke();       // bag
    g.beginPath(); g.moveTo(ex-7,ey+13); g.quadraticCurveTo(ex,ey+17,ex+7,ey+12); g.stroke();
    for(let k=0;k<3;k++){g.beginPath(); g.moveTo(ex+s*12,ey-2+k*4); g.lineTo(ex+s*19,ey-5+k*6); g.stroke();} // crow's feet
    if(blink){
      g.strokeStyle='#3a2219'; g.lineWidth=2.6; g.beginPath(); g.moveTo(ex-9,ey+1); g.quadraticCurveTo(ex,ey+5,ex+9,ey+1); g.stroke();
      continue;
    }
    g.fillStyle='#efe4d4'; g.beginPath(); g.ellipse(ex,ey+1,9,6.5,0,0,TAU); g.fill();
    const ig=g.createRadialGradient(ex+s*.5,ey+2,0,ex+s*.5,ey+2,6); ig.addColorStop(0,'#2a170e'); ig.addColorStop(.45,'#6b4022'); ig.addColorStop(1,'#a8743c');
    g.fillStyle=ig; g.beginPath(); g.arc(ex+s*.5,ey+2,5.6,0,TAU); g.fill();
    g.fillStyle='#120a06'; g.beginPath(); g.arc(ex+s*.5,ey+2,2.3,0,TAU); g.fill();
    g.fillStyle='rgba(255,250,235,.95)'; g.beginPath(); g.arc(ex-2,ey-.5,1.6,0,TAU); g.fill();
    // heavy upper lid
    g.fillStyle='#a87459'; g.beginPath(); g.moveTo(ex-10,ey+1); g.quadraticCurveTo(ex,ey-9,ex+10,ey+1); g.quadraticCurveTo(ex,ey-3.2,ex-10,ey+1); g.fill();
    g.strokeStyle='#2c1a12'; g.lineWidth=2.2; g.beginPath(); g.moveTo(ex-9.5,ey+1.5); g.quadraticCurveTo(ex,ey-3.6,ex+9.5,ey+1.5); g.stroke();
    g.strokeStyle='rgba(90,50,38,.7)'; g.lineWidth=1.2; g.beginPath(); g.moveTo(ex-9,ey-4); g.quadraticCurveTo(ex,ey-10,ex+9,ey-4); g.stroke();
  }
  // nasolabial folds
  g.strokeStyle='rgba(110,60,45,.55)'; g.lineWidth=1.6;
  for(const s of [-1,1]){g.beginPath(); g.moveTo(cx+s*10,ey+20); g.quadraticCurveTo(cx+s*17,ey+32,cx+s*15,ey+44); g.stroke();}
  // grey stubble / beard shadow on the lower face
  gr=g.createLinearGradient(0,ey+26,0,ey+60); gr.addColorStop(0,'rgba(150,145,138,0)'); gr.addColorStop(1,'rgba(150,145,138,.85)'); g.fillStyle=gr; g.fillRect(cx-60,ey+26,120,80);
  for(let i=0;i<500;i++){const x=cx-55+Math.random()*110,y=ey+30+Math.random()*60; g.fillStyle=`rgba(${Math.random()<.5?'200,196,188':'90,86,82'},.35)`; g.fillRect(x,y,1,2);}
  // lower lip just showing under the moustache
  g.fillStyle='#8a4e44'; g.beginPath(); g.ellipse(cx,ey+42,8,2.6,0,0,TAU); g.fill();
  const t=new THREE.CanvasTexture(c); t.encoding=THREE.sRGBEncoding; t.anisotropy=4; return t;
}
const coatTex=()=>{const c=document.createElement('canvas');c.width=c.height=256;const g=c.getContext('2d');wool(g,256,256,'#ffffff',90,.07);
  const t=new THREE.CanvasTexture(c); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.encoding=THREE.sRGBEncoding; return t;};
/* skirt sim sizes */
const SK_C=22, SK_R=9, SK_L=.083;
function buildHalloran(){
  const hp=lmPoint('halloran',{x:124,z:16});
  const g=new THREE.Group(); g.name='Halloran';
  const rig=new THREE.Group(); g.add(rig);
  const ctex=coatTex();
  const M={
    coat:corToon('#5a4a3c',{map:ctex}), coatDk:corToon('#3f342b',{map:ctex}), coatVC:corToon('#ffffff',{vertexColors:true}),
    trou:G.toon('#3d3a38',{map:ctex}), boot:G.toon('#ffffff',{vertexColors:true}), skinVC:corToon('#ffffff',{vertexColors:true}),
    scarf:corToon('#4f5b66',{map:ctex}), btn:G.toon('#8a7550'), cap:G.toon('#ffffff',{map:ctex,vertexColors:true}), lining:G.toon('#2e2620',{side:THREE.BackSide}),
  };
  const faceOpen=halFaceTex(false), faceBlink=halFaceTex(true);
  M.face=corToon('#ffffff',{map:faceOpen});
  const neg=negInk({amp:.012,scale:7,wisp:.55,flow:.6,strength:2.2,rim:'#a37cff'});
  const negThin=negInk({amp:.006,scale:10,wisp:.4,flow:.7,strength:2.4,rim:'#b08cff'});
  const outl=[];
  const mk=(geo,mat,parent,x=0,y=0,z=0,ol=.012)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.castShadow=true;parent.add(m);if(ol)outl.push([m,ol]);return m;};
  const grp=(parent,x=0,y=0,z=0)=>{const o=new THREE.Group();o.position.set(x,y,z);parent.add(o);return o;};
  /* ---- skeleton (standing rest pose; root at the feet, +z forward) ---- */
  const hips=grp(rig,0,.94,0), spine=grp(hips,0,0,0), chest=grp(spine,0,.27,0), neck=grp(chest,0,.31,.03), head=grp(neck,0,.1,.03);
  const shL=grp(chest,.205,.235,-.02), shR=grp(chest,-.205,.235,-.02);
  const elL=grp(shL,0,-.3,0), elR=grp(shR,0,-.3,0), wrL=grp(elL,0,-.26,0), wrR=grp(elR,0,-.26,0);
  const thL=grp(hips,.1,-.02,0), thR=grp(hips,-.1,-.02,0), knL=grp(thL,0,-.44,0), knR=grp(thR,0,-.44,0), anL=grp(knL,0,-.42,0), anR=grp(knR,0,-.42,0);
  /* ---- legs: trousers + worn boots ---- */
  const bootGeo=sdfGeo([
    {t:'c',a:[0,.2,0],b:[0,-.02,0],r0:.07,r1:.068,col:'#4b3424'},
    {t:'e',c:[0,-.045,.06],r:[.062,.045,.12],col:'#4b3424',k:.04},
    {t:'e',c:[0,-.06,.155],r:[.05,.03,.04],col:'#3a281c',k:.03,sharp:90},
    {t:'e',c:[0,-.07,-.04],r:[.055,.016,.05],col:'#241a14',k:.01,sharp:120},
    {t:'c',a:[0,.2,0],b:[0,.25,0],r0:.083,r1:.085,col:'#5d4330',k:.012,sharp:120}],.012,(x,y,z,a,i)=>{const n=.85+.3*U.vnoise(x*60+z*30,y*60);a[i]*=n;a[i+1]*=n;a[i+2]*=n; if(y<-.075){a[i]*=.5;a[i+1]*=.5;a[i+2]*=.5;}});
  for(const [th,kn,an] of [[thL,knL,anL],[thR,knR,anR]]){
    mk(capsule(.088,.074,.44),M.trou,th);
    mk(capsule(.074,.064,.42),M.trou,kn);
    mk(bootGeo,M.boot,an,0,0,.0,.01);
  }
  /* ---- coat body (spine + chest), collar, lapels, buttons, scarf ---- */
  const coatLow=sdfGeo([{t:'e',c:[0,.1,0],r:[.2,.17,.155],col:'#ffffff'},{t:'e',c:[0,.02,-.01],r:[.205,.1,.16],col:'#ffffff',k:.06}],.02);
  corAttr(coatLow,(x,y,z)=>x>0?sst(.16,.21,x)*sst(.1,.25,y)*.55:0);
  mk(coatLow,M.coat,spine);
  const coatUp=sdfGeo([
    {t:'e',c:[0,.08,.0],r:[.205,.17,.15],col:'#5a4a3c'},
    {t:'e',c:[0,.2,-.035],r:[.215,.13,.15],col:'#5a4a3c',k:.08},
    {t:'e',c:[.15,.22,-.02],r:[.085,.08,.1],col:'#5a4a3c',k:.06},{t:'e',c:[-.15,.22,-.02],r:[.085,.08,.1],col:'#5a4a3c',k:.06},
    {t:'e',c:[0,.24,-.1],r:[.15,.1,.08],col:'#544538',k:.08},                                     // hunched upper back
    {t:'e',c:[.07,.13,.12],r:[.085,.13,.035],rot:[.1,0,-.25],col:'#3f342b',k:.012,sharp:110},    // lapels
    {t:'e',c:[-.07,.13,.12],r:[.085,.13,.035],rot:[.1,0,.25],col:'#3f342b',k:.012,sharp:110},
  ],.016,(x,y,z,a,i)=>{const n=.9+.15*U.vnoise(x*30+y*7,z*30+y*20);a[i]*=n;a[i+1]*=n;a[i+2]*=n;});
  corAttr(coatUp,(x,y,z)=>x>0?sst(.08,.2,x)*sst(.05,.25,y)*.62+sst(.13,.22,x)*sst(.15,.3,y)*.15:0);
  mk(coatUp,M.coatVC,chest,0,-.03,0);
  // standing collar, turned up
  const collar=new THREE.LatheGeometry([new THREE.Vector2(.115,0),new THREE.Vector2(.122,.04),new THREE.Vector2(.128,.08),new THREE.Vector2(.135,.11),new THREE.Vector2(.128,.115)],16,PI*.15,PI*1.7);
  corAttr(collar,(x,y,z)=>x>0?sst(.0,.12,x)*.7:0);
  mk(collar,corToon('#3f342b',{map:ctex,side:THREE.DoubleSide}),chest,0,.25,-.01,.008);
  // scarf: a knitted loop and a hanging tail
  const scarfLoop=tube([[-.1,0,.03],[-.06,.01,.1],[.02,0,.115],[.09,-.005,.07],[.1,0,-.02],[.04,.005,-.1],[-.05,0,-.1],[-.1,0,-.02],[-.1,0,.03]],.042,.042,24,9);
  corAttr(scarfLoop,(x,y,z)=>x>0?sst(.02,.1,x)*.7:0);
  mk(scarfLoop,M.scarf,chest,0,.27,0,.009);
  const scarfTail=tube([[-.06,.02,.11],[-.08,-.08,.15],[-.075,-.2,.155],[-.08,-.3,.14]],t=>.04*(1-t*.2),0,10,7,null,null,.45);
  corAttr(scarfTail);
  mk(scarfTail,M.scarf,chest,0,.27,0,.008);
  for(let i=0;i<3;i++)for(const s of [-1,1]){const b=mk(new THREE.SphereGeometry(.015,8,6),M.btn,chest,s*.055,.16-i*.085+.0,.142-i*.004,0); b.scale.set(1,1,.55);}
  for(let i=0;i<2;i++){const b=mk(new THREE.SphereGeometry(.015,8,6),M.btn,spine,.05,.14-i*.09,.152,0); b.scale.set(1,1,.55);}
  /* ---- arms ---- */
  const sleeveU=corAttr(capsule(.072,.066,.3),(x,y,z)=>0);
  mk(sleeveU,M.coat,shR);
  const sleeveUL=corAttr(capsule(.072,.066,.3),(x,y,z)=>sst(-.05,-.32,y)*.62);
  mk(sleeveUL,M.coat,shL);
  const fore=(cor)=>{const gg=mergeGeos([capsule(.066,.072,.24),xf(new THREE.CylinderGeometry(.081,.084,.07,14),0,-.215,0)]);return corAttr(gg,cor?(x,y,z)=>.5+sst(0,-.26,y)*.9:null);};
  mk(fore(false),M.coat,elR); mk(fore(true),M.coat,elL);
  // the good hand: gnarled, big knuckles, curled
  const handGeo=sdfGeo([
    {t:'e',c:[0,-.04,0],r:[.045,.055,.022],col:'#b98a6c'},
    {t:'c',a:[0,.01,0],b:[0,-.03,0],r0:.034,r1:.038,col:'#b98a6c',k:.02},
    ...[-1.5,-.5,.5,1.5].map((k,i)=>({t:'c',a:[k*.019,-.085,.0],b:[k*.021,-.125,.025],r0:.0125,r1:.011,col:'#b98a6c',k:.012})),
    ...[-1.5,-.5,.5,1.5].map((k,i)=>({t:'c',a:[k*.021,-.125,.025],b:[k*.02,-.14,.055],r0:.011,r1:.009,col:'#a97c62',k:.008})),
    ...[-1.5,-.5,.5,1.5].map((k,i)=>({t:'e',c:[k*.019,-.088,.006],r:[.012,.012,.012],col:'#a97c62',k:.006,sharp:150})),
    {t:'c',a:[-.04,-.03,.012],b:[-.055,-.075,.04],r0:.014,r1:.011,col:'#b98a6c',k:.015},
    {t:'c',a:[-.055,-.075,.04],b:[-.045,-.1,.06],r0:.011,r1:.009,col:'#a97c62',k:.008}],.006);
  corAttr(handGeo);
  mk(handGeo,M.skinVC,wrR,0,-.0,0,.007);
  // the corrupted hand: all ink, too-long fingers trailing into tendrils
  const inkHand=grp(wrL,0,0,0); inkHand.scale.setScalar(1.25);
  mk(sdfGeo([{t:'e',c:[0,-.045,0],r:[.05,.065,.026]},{t:'c',a:[0,.03,0],b:[0,-.03,0],r0:.04,r1:.043,k:.02}],.01),neg,inkHand,0,0,0,0);
  const fingers=[];
  for(let k=0;k<5;k++){
    const piv=grp(inkHand,(k-2)*.022,-.095,k===0?.03:0), len=.17+(k%2)*.05+(k===2?.07:0);
    piv.rotation.set(k===0?.5:.15,0,(k-2)*.12);
    mk(tube([[0,0,0],[0,-len*.4,.015],[0,-len*.75,.045],[0,-len,.03]],.014,.003,12,6),negThin,piv,0,0,0,0);
    const tip=new THREE.Object3D(); tip.position.set(0,-len,.02); piv.add(tip);
    fingers.push({piv,tip,base:piv.rotation.clone()});
  }
  const tendrils=[];
  for(let k=0;k<3;k++){
    const piv=grp(wrL,(k-1)*.03,-.02,-.02);
    const len=.18+k*.08;
    mk(tube([[0,0,0],[.02,-len*.35,-.02],[-.01,-len*.7,.01],[0,-len,0]],.008,.002,10,5),negThin,piv,0,0,0,0);
    tendrils.push(piv);
  }
  /* ---- head ---- */
  mk(corAttr(paint(capsule(.055,.06,.14),'#b6866a'),(x,y,z)=>x>0?sst(-.02,.06,x)*.85:0),M.skinVC,neck,0,.08,0,0);
  const skullG=new THREE.SphereGeometry(.112,40,28); skullG.scale(.96,1.06,1.0);
  corAttr(skullG,(x,y,z)=>x>0?sst(.055,.11,x)*(.42+.55*sst(.06,-.07,y))*(z>.05?.75:1):0);
  const skull=mk(skullG,M.face,head,0,.1,0,.008);
  const skinHex='#c39377';
  const sculpt=sdfGeo([
    {t:'e',c:[0,.088,.104],r:[.016,.026,.02],rot:[.3,0,0],col:'#b98670'},       // nose bridge-to-bulb
    {t:'e',c:[0,.07,.112],r:[.018,.016,.017],col:'#b67e68',k:.01},
    {t:'e',c:[.107,.098,-.005],r:[.016,.03,.02],col:skinHex},{t:'e',c:[-.107,.098,-.005],r:[.016,.03,.02],col:skinHex}  // ears
  ],.005);
  corAttr(sculpt,(x,y,z)=>x>.05?.95:0); mk(sculpt,M.skinVC,head,0,0,0,.005);
  // grey brows, beard, moustache, tousled hair
  const greyA='#8f8a81', greyB='#76716a', greyC='#aaa59b';
  const bp=[
    {t:'e',c:[0,.03,.04],r:[.09,.055,.068],col:greyB},
    {t:'e',c:[0,-.005,.058],r:[.066,.05,.045],col:greyA,k:.03},
    {t:'e',c:[.082,.07,.0],r:[.02,.045,.045],col:greyB,k:.03},{t:'e',c:[-.082,.07,.0],r:[.02,.045,.045],col:greyB,k:.03},
    {t:'e',c:[.024,.056,.104],r:[.027,.009,.013],rot:[0,.35,-.45],col:greyC,k:.008},{t:'e',c:[-.024,.056,.104],r:[.027,.009,.013],rot:[0,-.35,.45],col:greyC,k:.008}];
  for(let i=0;i<9;i++){const a=(i/8-.5)*2.2, x=Math.sin(a)*.06, z=.045+Math.cos(a)*.03; bp.push({t:'c',a:[x,.0,z],b:[x*1.15+Math.sin(i*3.1)*.008,-.055-Math.abs(Math.cos(a))*.03-Math.sin(i*2.3)*.008,z+.012],r0:.02,r1:.004,col:i%3?greyA:greyC,k:.018});}
  const beardG=sdfGeo(bp,.0055,(x,y,z,a,i)=>{const n=.72+.4*U.vnoise(x*160+z*40,y*30);a[i]*=n;a[i+1]*=n;a[i+2]*=n;});
  // keep only the beard that sits proud of the jaw (cut away anything that would cover the mouth/cheeks above y .06 in front)
  corAttr(beardG,(x,y,z)=>x>0?sst(.05,.1,x)*(.55+.4*sst(.06,-.03,y)):0);
  mk(beardG,M.coatVC,head,0,.0,0,.006);
  const browG=sdfGeo([
    {t:'c',a:[.012,.128,.1],b:[.045,.134,.094],r0:.009,r1:.008,col:greyA},
    {t:'c',a:[.045,.134,.094],b:[.068,.126,.078],r0:.007,r1:.004,col:greyA,k:.005},
    {t:'c',a:[-.012,.128,.1],b:[-.045,.134,.094],r0:.009,r1:.008,col:greyA},
    {t:'c',a:[-.045,.134,.094],b:[-.068,.126,.078],r0:.007,r1:.004,col:greyA,k:.005}],.0035);
  corAttr(browG,(x,y,z)=>x>.04?.7:0);
  mk(browG,M.coatVC,head,0,0,0,0);
  // tousled hair poking out under the knit cap at the sides and back
  const tufts=[];
  for(let i=0;i<16;i++){const a=PI*.42+i/15*PI*1.16, r=.1; const x=Math.sin(a)*r, z=Math.cos(a)*r, y=.15+Math.sin(i*2.7)*.008;
    tufts.push({t:'c',a:[x*.9,y,z*.9],b:[x*1.22+Math.sin(i*5.1)*.012,y-.035-Math.abs(Math.sin(i*1.9))*.03,z*1.22],r0:.017,r1:.004,col:i%2?greyA:greyC,k:.012});}
  tufts.push({t:'e',c:[0,.15,-.03],r:[.1,.05,.095],col:greyB});
  const hairG=sdfGeo(tufts,.006,(x,y,z,a,i)=>{const n=.8+.35*U.vnoise(x*90+y*40,z*90);a[i]*=n;a[i+1]*=n;a[i+2]*=n;});
  corAttr(hairG,(x,y,z)=>x>.08?.6:0); mk(hairG,M.coatVC,head,0,0,0,.006);
  // knit watch cap, pushed back
  const capG=sdfGeo([{t:'e',c:[0,.2,-.03],r:[.112,.085,.115],col:'#57594f'},{t:'c',a:[0,.16,-.02],b:[0,.192,-.02],r0:.121,r1:.124,k:.006,col:'#4a4c44'},{t:'e',c:[0,.27,-.05],r:[.05,.03,.05],col:'#57594f',k:.04}],.008);
  {const p=capG.attributes.position, c=capG.attributes.color; for(let i=0;i<p.count;i++){const a=Math.atan2(p.getX(i),p.getZ(i)); const rib=.82+.18*Math.abs(Math.sin(a*22)); c.setXYZ(i,c.getX(i)*rib,c.getY(i)*rib,c.getZ(i)*rib);}}
  const cap=mk(capG,M.cap,head,0,.0,0,.008); cap.rotation.x=-.22; cap.position.set(0,.0,-.02);
  // planar UVs for the wool texture on sdf meshes (cap)
  {const p=capG.attributes.position, uv=new Float32Array(p.count*2); for(let i=0;i<p.count;i++){uv[i*2]=Math.atan2(p.getX(i),p.getZ(i))*1.2; uv[i*2+1]=p.getY(i)*8;} capG.setAttribute('uv',new THREE.BufferAttribute(uv,2));}
  for(const gm of [coatLow,coatUp]){const p=gm.attributes.position, uv=new Float32Array(p.count*2); for(let i=0;i<p.count;i++){uv[i*2]=Math.atan2(p.getX(i),p.getZ(i))*1.4; uv[i*2+1]=p.getY(i)*4;} gm.setAttribute('uv',new THREE.BufferAttribute(uv,2));}
  for(const gm of [bootGeo,hairG,beardG,browG,sculpt,handGeo]){if(!gm.attributes.uv)gm.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(gm.attributes.position.count*2),2));}
  /* ---- the long coat skirt: a CPU-simulated cloth sheet hanging from the hips ---- */
  const nV=SK_C*SK_R, sp=new Float32Array(nV*3), sprev=new Float32Array(nV*3), suv=new Float32Array(nV*2), sang=new Float32Array(SK_C), scor=new Float32Array(nV), sidx=[];
  const gap=.32;
  for(let c=0;c<SK_C;c++){sang[c]=gap+c/(SK_C-1)*(TAU-2*gap);}
  for(let r=0;r<SK_R;r++)for(let c=0;c<SK_C;c++){const i=r*SK_C+c; suv[i*2]=c/(SK_C-1)*3; suv[i*2+1]=1-r/(SK_R-1);
    const a=sang[c], x=Math.sin(a); scor[i]=x>.3?sst(.3,1,x)*sst(2,0,r)*.55:0;}
  for(let r=0;r<SK_R-1;r++)for(let c=0;c<SK_C-1;c++){const a=r*SK_C+c,b=a+SK_C,cc=a+1,d=b+1; sidx.push(a,b,cc,b,d,cc);}
  const skG=new THREE.BufferGeometry(); skG.setAttribute('position',new THREE.BufferAttribute(sp,3)); skG.setAttribute('uv',new THREE.BufferAttribute(suv,2));
  skG.setAttribute('aCor',new THREE.BufferAttribute(scor,1)); skG.setIndex(sidx);
  const skirtMat=corToon('#56473a',{map:ctex,side:THREE.DoubleSide});
  const skirt=new THREE.Mesh(skG,skirtMat); skirt.castShadow=true; skirt.frustumCulled=false; rig.add(skirt);
  const skirtOl=G.outline(skirt,{thickness:.01}); if(skirtOl)skirtOl.frustumCulled=false;
  for(const [m,t] of outl)G.outline(m,{thickness:t});
  /* ---- home props: a barrel to sit on, a cairn, a crate, a broken oar ---- */
  const stoneM=G.toon('#7f796e',{flatShading:true}), wood=G.toon('#4a3a2a');
  const props=new THREE.Group(); props.position.set(hp.x,hp.y,hp.z); G.scene.add(props);
  const homeYaw=Math.atan2(LM().lighthouse?LM().lighthouse.x-hp.x:56,LM().lighthouse?LM().lighthouse.z-hp.z:-16)+.35;
  props.rotation.y=homeYaw;
  for(let i=0;i<4;i++){const s=new THREE.Mesh(new THREE.DodecahedronGeometry(.3-i*.05,0),stoneM);s.position.set(-1.25,.18+i*.34,-.6);s.rotation.y=i;s.castShadow=true;props.add(s);G.outline(s,{thickness:.02});}
  const oar=new THREE.Mesh(new THREE.BoxGeometry(.07,2,.14),wood); oar.position.set(1.0,.8,-.5); oar.rotation.set(.2,0,-.25); oar.castShadow=true; props.add(oar);
  const blade=new THREE.Mesh(new THREE.BoxGeometry(.04,.55,.24),wood); blade.position.set(0,.95,0); oar.add(blade);
  const crate=new THREE.Mesh(new THREE.BoxGeometry(.6,.45,.5),G.toon('#5b4630')); crate.position.set(-.9,.22,.35); crate.rotation.y=.4; crate.castShadow=true; props.add(crate); G.outline(crate,{thickness:.02});
  const barrelG=new THREE.CylinderGeometry(.25,.25,.46,18,4); {const p=barrelG.attributes.position; for(let i=0;i<p.count;i++){const y=p.getY(i), k=1+.12*(1-(y/.23)**2); p.setX(i,p.getX(i)*k); p.setZ(i,p.getZ(i)*k);} barrelG.computeVertexNormals();}
  const barrel=new THREE.Mesh(barrelG,G.toon('#5e4a35')); barrel.position.set(0,.23,0); barrel.castShadow=true; props.add(barrel); G.outline(barrel,{thickness:.015});
  for(const y of [.08,.38]){const hoop=new THREE.Mesh(new THREE.TorusGeometry(.262,.012,5,24).rotateX(PI/2),G.toon('#2d2a28')); hoop.position.y=y; barrel.add(hoop); hoop.position.y=y-.23;}
  const home=V(hp.x,hp.y,hp.z);
  g.position.copy(home); G.scene.add(g);
  {const c=V(-1.25,0,-.6).applyAxisAngle(V(0,1,0),homeYaw); G.addCollider&&G.addCollider({x:hp.x+c.x,z:hp.z+c.z,r:.45,y0:hp.y-1,y1:hp.y+2});}
  /* ---- ink: smoke off the hand, drips, a faint wisp off the stained shoulder/face ---- */
  const tipAnchors=fingers.map(f=>f.tip);
  const em={
    hand:inkEm([inkHand,inkHand,elL,...tipAnchors],{rate:10,radius:.06,size:[.16,.75],life:[1.2,2.2],rise:.4,drift:.1,trail:.8,alpha:.7,drip:1.8,embers:.6}),
    stain:inkEm([head,shL],{rate:2.5,radius:.06,size:[.12,.45],life:[1,1.6],rise:.25,drift:.06,trail:.8,alpha:.35,offset:V(.06,.06,0)})
  };
  hal={g,rig,neg,negThin,M,faceOpen,faceBlink,hips,spine,chest,neck,head,shL,shR,elL,elR,wrL,wrR,thL,thR,knL,knR,anL,anR,inkHand,fingers,tendrils,
    torso:chest,armL:shL,armR:shR,legL:thL,legR:thR,fore:elL,hand:inkHand,
    skirt:{geo:skG,pos:sp,prev:sprev,ang:sang,init:false},em,
    home,homeYaw,pos:home.clone(),heading:homeYaw,afraid:false,met:false,
    pre:0,mid:0,post:0,fail:0,stand:false,walk:0,center:V(),hgt:1.9,ashT:0,shoutT:0,talkPos:V(),
    sit:1,fear:0,talkT:0,talkK:0,blinkT:2,shiftT:3,shift:0,shiftTo:0,twitchT:1,twitch:0,lookYaw:0,lookPitch:0,glanceT:0,creep:1};
  G.interact.add({pos:()=>hal.talkPos.copy(hal.pos),radius:2.8,priority:2,
    label:()=>hal.met?'Talk to Halloran':'Talk to the figure',
    enabled:()=>!hal.afraid&&isPlay(),
    use:talkHalloran});
}
/* move him somewhere for a story beat (flow.js): teleports (the player is never watching), stands instead of sitting.
   halloranAt(null) sends him back to his barrel on the cliff path. */
let halHome0=null, halYaw0=0;
function halloranAt(pos,yaw){
  if(!hal)return;
  if(!halHome0){halHome0=hal.home.clone(); halYaw0=hal.homeYaw;}
  if(pos){ hal.home.set(pos.x,G.floorAt?G.floorAt(pos.x,pos.z,(pos.y||0)+2):H(pos.x,pos.z),pos.z); hal.homeYaw=yaw==null?hal.homeYaw:yaw; hal.stand=true; }
  else { hal.home.copy(halHome0); hal.homeYaw=halYaw0; hal.stand=false; }
  hal.pos.copy(hal.home); hal.heading=hal.homeYaw; hal.afraid=false; hal.sit=hal.stand?0:1; hal.skirt.init=false;
  hal.g.position.copy(hal.pos); hal.g.rotation.y=hal.heading;
}
function talkHalloran(){
  if(!hal||hal.afraid)return;
  const L=lantern();
  const isCured=cured||(L&&L.cured);
  const found=(L&&L.found)||G.flag('lanternFound');
  const failed=!!((G.items.storm&&G.items.storm.failed)||G.flag('stormFailed'));
  let line, index;
  if(isCured){index=Math.min(hal.post,HAL_POST.length-1);line=HAL_POST[index];hal.post++;}
  else if(found){index=Math.min(hal.mid,HAL_MID.length-1);line=HAL_MID[index];hal.mid++;}
  else if(failed){index=Math.min(hal.fail,HAL_FAIL.length-1);line=HAL_FAIL[index];hal.fail++;}
  else{index=Math.min(hal.pre,HAL_PRE.length-1);line=HAL_PRE[index];hal.pre++;}
  hal.met=true;
  if(G.player&&G.player.pos&&hal.sit<.5)hal.heading=Math.atan2(G.player.pos.x-hal.pos.x,G.player.pos.z-hal.pos.z);
  hal.talkT=2.6; hal.talkK=(hal.talkK+1)%3;
  G.ui.say(line,'Halloran');
  G.emit('talk',{who:'Halloran',line,index,phase:isCured?'cured':found?'lantern':failed?'failed':'start'});
}
/* pose tables: standing / seated / afraid. Angles in radians (x: + = backward for limbs, − = forward) */
const HP={
  stand:{hy:.92,hz:0,sp:.16,ch:.12,nk:-.12,hd:-.06,shLx:.05,shLz:.12,elL:-.25,shRx:.05,shRz:-.1,elR:-.2,thx:0,kn:0,an:0,sw:.0},
  sit:{hy:.53,hz:0,sp:.38,ch:.18,nk:-.3,hd:-.1,shLx:-.12,shLz:.1,elL:-1.1,shRx:-.2,shRz:-.12,elR:-1.15,thx:-1.42,kn:1.5,an:-.05,sw:.0},
  fear:{hy:.8,hz:-.05,sp:.55,ch:.25,nk:.1,hd:.25,shLx:.5,shLz:.35,elL:-.5,shRx:-1.3,shRz:.5,elR:-1.7,thx:-.45,kn:.85,an:-.4,sw:.0}
};
const _pz={}; for(const k in HP.stand)_pz[k]=HP.stand[k];
function blendPose(s,f){
  for(const k in _pz){const a=HP.stand[k]+(HP.sit[k]-HP.stand[k])*s; _pz[k]=a+(HP.fear[k]-a)*f;}
  return _pz;
}
const _mInv=new THREE.Matrix4(), _cA=[V(),V(),V(),V(),V(),V(),V(),V()];
function skirtCaps(){
  const R=hal.rig; R.updateMatrixWorld(true); _mInv.copy(R.matrixWorld).invert();
  const J=[[hal.thL,hal.knL],[hal.thR,hal.knR],[hal.knL,hal.anL],[hal.knR,hal.anR]];
  for(let i=0;i<4;i++){J[i][0].getWorldPosition(_cA[i*2]).applyMatrix4(_mInv); J[i][1].getWorldPosition(_cA[i*2+1]).applyMatrix4(_mInv);}
}
function pushCap(p,a,b,r){
  const bx=b.x-a.x,by=b.y-a.y,bz=b.z-a.z, px=p[0]-a.x,py=p[1]-a.y,pz=p[2]-a.z;
  const h=Math.max(0,Math.min(1,(px*bx+py*by+pz*bz)/(bx*bx+by*by+bz*bz||1)));
  const dx=px-bx*h,dy=py-by*h,dz=pz-bz*h, d=Math.hypot(dx,dy,dz);
  if(d<r&&d>1e-5){const k=r/d; p[0]=a.x+bx*h+dx*k; p[1]=a.y+by*h+dy*k; p[2]=a.z+bz*h+dz*k;}
}
const _p3=[0,0,0], _hw=V();
function updateSkirt(dt){
  const S=hal.skirt, P=S.pos, Q=S.prev, sit=hal.sit;
  skirtCaps();
  // top ring follows the hips (in rig space)
  hal.hips.updateMatrixWorld(true);
  const hipsM=new THREE.Matrix4().multiplyMatrices(_mInv,hal.hips.matrixWorld);
  const seatTop=.47-hal.rig.position.y; // barrel top in rig space (rig sits on the ground)
  const first=!S.init; S.init=true;
  const kRest=1-Math.exp(-dt*(first?1e3:4.5));
  const t=G.time;
  for(let c=0;c<SK_C;c++){
    const a=S.ang[c], sa=Math.sin(a), ca=Math.cos(a), front=Math.max(0,ca);
    _hw.set(sa*.205,.06,ca*.165).applyMatrix4(hipsM);
    let x=_hw.x,y=_hw.y,z=_hw.z; P[c*3]=x;P[c*3+1]=y;P[c*3+2]=z; Q[c*3]=x;Q[c*3+1]=y;Q[c*3+2]=z;
    // rest direction: hang and flare; seated, the front drapes along the thighs, the back spreads on the barrel
    for(let r=1;r<SK_R;r++){
      const i=(r*SK_C+c)*3, tr=r/(SK_R-1);
      let dx=sa*.12, dy=-1, dz=ca*.1;
      if(r<=5){ dz+=sit*front*2.2*(1-hal.fear); dy*=1-sit*front*.75; }
      if(r<=2){ dx+=sit*(1-front)*sa*.9; dz+=sit*(1-front)*ca*.9; }
      dx+=Math.sin(t*1.3+c*.7)*.03*tr; dz+=Math.cos(t*1.1+c*.5)*.03*tr;
      const L=Math.hypot(dx,dy,dz); x+=dx/L*SK_L; y+=dy/L*SK_L; z+=dz/L*SK_L;
      if(first){P[i]=x;P[i+1]=y;P[i+2]=z;Q[i]=x;Q[i+1]=y;Q[i+2]=z;continue;}
      // verlet + spring toward rest
      const vx=(P[i]-Q[i])*.9, vy=(P[i+1]-Q[i+1])*.9, vz=(P[i+2]-Q[i+2])*.9;
      Q[i]=P[i];Q[i+1]=P[i+1];Q[i+2]=P[i+2];
      P[i]+=vx+(x-P[i])*kRest; P[i+1]+=vy-4*dt*dt+(y-P[i+1])*kRest; P[i+2]+=vz+(z-P[i+2])*kRest;
    }
  }
  if(!first){
    for(let it=0;it<3;it++){
      for(let c=0;c<SK_C;c++)for(let r=1;r<SK_R;r++){
        const i=(r*SK_C+c)*3, j=((r-1)*SK_C+c)*3;
        // column length
        let dx=P[i]-P[j],dy=P[i+1]-P[j+1],dz=P[i+2]-P[j+2]; const d=Math.hypot(dx,dy,dz)||1e-6, k=(d-SK_L)/d;
        if(r===1){P[i]-=dx*k;P[i+1]-=dy*k;P[i+2]-=dz*k;} else {P[i]-=dx*k*.5;P[i+1]-=dy*k*.5;P[i+2]-=dz*k*.5;P[j]+=dx*k*.5;P[j+1]+=dy*k*.5;P[j+2]+=dz*k*.5;}
        _p3[0]=P[i];_p3[1]=P[i+1];_p3[2]=P[i+2];
        pushCap(_p3,_cA[0],_cA[1],.12); pushCap(_p3,_cA[2],_cA[3],.12); pushCap(_p3,_cA[4],_cA[5],.1); pushCap(_p3,_cA[6],_cA[7],.1);
        // barrel (only when he's on it)
        if(sit>.3&&_p3[1]<seatTop+.02){const rr=Math.hypot(_p3[0],_p3[2]); if(rr<.3){ if(_p3[1]>seatTop-.08){_p3[1]=seatTop+.02;} else if(rr>1e-4){_p3[0]*=.3/rr;_p3[2]*=.3/rr;} }}
        if(_p3[1]<.02)_p3[1]=.02;
        P[i]=_p3[0];P[i+1]=_p3[1];P[i+2]=_p3[2];
      }
    }
  }
  S.geo.attributes.position.needsUpdate=true; S.geo.computeVertexNormals(); S.geo.computeBoundingSphere();
}
function updateHalloran(dt){
  if(!hal)return;
  const play=isPlay(), t=G.time, L=lantern(), lp=lanternPos();
  const pp=G.player&&G.player.pos||hal.pos;
  const dL=U.dist2(hal.pos,lp), dP=U.dist2(hal.pos,pp);
  const swarmOn=play&&lanternCount>3&&L&&L.found&&!L.inCradle&&!cured;
  if(hal.afraid){ if(!swarmOn||dL>14)hal.afraid=false; } else if(swarmOn&&dL<10) hal.afraid=true;
  let speed=0, want=hal.heading;
  const dh=U.dist2(hal.pos,hal.home);
  if(hal.afraid){
    if(dh<12&&dL<12){want=Math.atan2(hal.pos.x-lp.x,hal.pos.z-lp.z);speed=2.3*Math.min(1,(1-hal.sit)*1.5);}
    else want=Math.atan2(lp.x-hal.pos.x,lp.z-hal.pos.z);
    hal.shoutT-=dt;
    if(dP<16&&hal.shoutT<=0){hal.shoutT=12;G.ui.say('Keep them back! Keep those things away from me!','Halloran');}
  }else if(dh>.4&&(!swarmOn||U.dist2(lp,hal.home)>13)){want=Math.atan2(hal.home.x-hal.pos.x,hal.home.z-hal.pos.z);speed=1.1*Math.min(1,(1-hal.sit)*1.5);}
  else if(dh<=.4){ // at home: settle back onto the barrel, turning only a little toward the player
    let a=hal.homeYaw; if(dP<12){const pa=Math.atan2(pp.x-hal.pos.x,pp.z-hal.pos.z); a=hal.homeYaw+U.clamp(U.angDiff(pa,hal.homeYaw),-.55,.55);} want=a;
  }
  else if(dP<12)want=Math.atan2(pp.x-hal.pos.x,pp.z-hal.pos.z);
  if(!(dt>0))speed=0;
  steer(hal,want,hal.afraid?7:hal.talkT>0?4:2,dt);
  if(speed>0){const dx=Math.sin(hal.heading)*speed*dt,dz=Math.cos(hal.heading)*speed*dt; const r=G.moveCharacter(hal.pos,dx,dz,.35,'npc'); if(r.blocked)hal.heading+=1.2;}
  hal.pos.y=U.damp(hal.pos.y,G.floorAt(hal.pos.x,hal.pos.z,hal.pos.y+.6),12,dt);
  hal.walk+=dt*speed*4.2;
  hal.g.position.copy(hal.pos); hal.g.rotation.y=hal.heading;
  // pose blends
  const sitT=(!hal.afraid&&dh<.45&&speed===0&&!hal.stand)?1:0;
  hal.sit=U.damp(hal.sit,sitT,sitT?1.6:3.5,dt);
  hal.fear=U.damp(hal.fear,hal.afraid?1:0,hal.afraid?5:1.5,dt);
  hal.talkT=Math.max(0,hal.talkT-dt);
  const P=blendPose(hal.sit,hal.fear), s=hal.sit, f=hal.fear;
  const walking=speed>0?1:0, sw=walking?Math.sin(hal.walk):0;
  // breathing, weight shifts, glances
  const br=Math.sin(t*1.5);
  hal.shiftT-=dt; if(hal.shiftT<=0){hal.shiftT=4+rnd()*5; hal.shiftTo=(rnd()-.5)*2;}
  hal.shift=U.damp(hal.shift,hal.shiftTo,1.2,dt);
  // look at the player when near, with tired glances away
  hal.glanceT-=dt; if(hal.glanceT<=0)hal.glanceT=3+rnd()*4;
  let ly=0, lpch=0;
  if(dP<7&&!hal.afraid){
    const pa=Math.atan2(pp.x-hal.pos.x,pp.z-hal.pos.z);
    const away=hal.talkT<=0&&hal.glanceT<1.1;
    ly=away?(hal.shift>0?-.5:.4):U.clamp(U.angDiff(pa,hal.heading),-1,1);
    lpch=away?.25:-.06;
  }else if(!hal.afraid){ly=Math.sin(t*.23)*.3; lpch=.12+Math.sin(t*.31)*.05;}
  hal.lookYaw=U.damp(hal.lookYaw,ly,3,dt); hal.lookPitch=U.damp(hal.lookPitch,lpch,3,dt);
  // talking: nods and a small gesture with the good hand, varied per line
  const tk=hal.talkT>0?Math.min(1,hal.talkT*2)*Math.min(1,(2.6-hal.talkT)*4):0;
  const nod=tk*Math.sin(t*7.5)*.09*(hal.talkK===1?1.4:1);
  const gest=tk*(.6+.4*Math.sin(t*3.1));
  // apply
  hal.rig.position.set(0,0,(1-s)*.32+P.hz);
  hal.hips.position.set(Math.sin(hal.shift)*.012*(1-s),P.hy+(walking?Math.abs(Math.cos(hal.walk))*.025:0)+br*.004*s,0);
  hal.hips.rotation.set(0,walking?sw*.06:0,walking?sw*.03:Math.sin(hal.shift)*.025);
  hal.spine.rotation.set(P.sp+br*.012+(walking?.06:0),hal.lookYaw*.15,-Math.sin(hal.shift)*.03);
  hal.chest.rotation.set(P.ch-br*.02,hal.lookYaw*.2,0);
  hal.chest.scale.set(1+br*.008,1,1+br*.012);
  hal.neck.rotation.set(P.nk+hal.lookPitch*.5*(1-f),hal.lookYaw*.3*(1-f)+f*.5,0);
  hal.head.rotation.set(P.hd+hal.lookPitch*.5*(1-f)+nod,hal.lookYaw*.35*(1-f)+f*.45,Math.sin(t*.8)*.05+(hal.talkK===2?tk*.12:0)+f*.12);
  // arms
  hal.shR.rotation.set(P.shRx-sw*.35-gest*.55*(1-f),0,P.shRz-gest*.15*(1-f));
  hal.elR.rotation.set(P.elR-gest*.55*(1-f)+(walking?-.2:0),0,0);
  hal.wrR.rotation.set(gest*.3*(1-f)-.1,gest*.6*(1-f),0);
  // corrupted arm: held a little away from him; it twitches
  hal.twitchT-=dt; if(hal.twitchT<=0){hal.twitchT=.6+rnd()*2.5; hal.twitch=1;}
  hal.twitch=Math.max(0,hal.twitch-dt*5);
  const tw=hal.twitch*Math.sin(t*55)*.12;
  hal.shL.rotation.set(P.shLx+sw*.25+tw*.4,0,P.shLz+Math.sin(t*1.3)*.02);
  hal.elL.rotation.set(P.elL+tw,0,0);
  hal.wrL.rotation.set(-.2+Math.sin(t*1.7)*.08+tw*2,tw,0);
  hal.fingers.forEach((F,i)=>{F.piv.rotation.x=F.base.x+Math.sin(t*2.3+i*1.3)*.18+tw*3*(i%2?1:-1); F.piv.rotation.z=F.base.z+Math.sin(t*1.7+i)*.1;});
  hal.tendrils.forEach((p,i)=>{p.rotation.x=Math.sin(t*1.9+i*1.7)*.35; p.rotation.z=Math.cos(t*1.4+i)*.35;});
  // legs
  const lsw=walking?.45:0;
  hal.thL.rotation.set(P.thx+sw*lsw,0,.03+s*.12); hal.thR.rotation.set(P.thx-sw*lsw,0,-.03-s*.12);
  hal.knL.rotation.set(P.kn+(walking?Math.max(0,-Math.sin(hal.walk))*.6:0),0,0); hal.knR.rotation.set(P.kn+(walking?Math.max(0,Math.sin(hal.walk))*.6:0),0,0);
  hal.anL.rotation.set(-(P.thx+P.kn)*1+P.an-(walking?sw*lsw*.0:0),0,0); hal.anR.rotation.set(-(P.thx+P.kn)+P.an,0,0);
  // blink
  hal.blinkT-=dt; if(hal.blinkT<0){hal.M.face.map=hal.faceBlink; if(hal.blinkT<-.14){hal.blinkT=2.2+rnd()*3.8; hal.M.face.map=hal.faceOpen;}}
  if(hal.afraid&&Math.sin(t*3.3)>.6)hal.M.face.map=hal.faceBlink; // screwed-shut eyes
  // corruption creeps, breathes and boils when he's afraid
  hal.creep=U.damp(hal.creep,1+f*.35+Math.sin(t*.4)*.04,2,dt); CREEP.value=hal.creep;
  const near=U.dist2(hal.pos,inkRef())<INK_FAR?1:0;
  hal.em.hand.intensity=near; hal.em.hand.rate=9+f*5; hal.em.hand.drip=1.6+f*1.2; hal.em.hand.size[1]=.5+f*.25;
  hal.em.stain.intensity=near; hal.em.stain.rate=2.5+f*3;
  if(dt>0)updateSkirt(Math.min(dt,1/30));
  hal.center.set(hal.pos.x,hal.pos.y+1.3-s*.4,hal.pos.z);
}

/* ---------------------------------------------------------------- events */
G.on('lantern:pickup',()=>{for(const m of moths) if(m.tgt==='spot'){m.tgt='lantern';}});
G.on('lamp:placed',()=>{
  glassOpen=true;
  for(const m of moths){ if(m.tgt==='lantern'||m.tgt==='hunt'||m.tgt==='spot'||m.tgt==='glass'){m.tgt='lamp';m.prey=null;m.rad=.45+rnd()*1.3;m.hy=rnd()*1.8;} }
});
G.on('lamp:cured',()=>{
  cured=true;
  // 'glass' too: a restored save skips lamp:placed, so the moths on the lamp-room glass would never come down
  for(const m of moths){ if(m.tgt==='lamp'||m.tgt==='lantern'||m.tgt==='hunt'||m.tgt==='spot'||m.tgt==='glass'){ m.delay=.5+rnd()*7; m.next=patches.length?'patch':'wander'; m.idx=(rnd()*Math.max(1,patches.length))|0; m.rad=.6+rnd()*1.6; m.prey=null; m.home=null; } }
});

/* ---------------------------------------------------------------- API + system */
const API=G.creatures={lanternCount:0,swarmAt,restoreFreed,freed:0,total:0,negatives,moths,patches,get halloran(){return hal;},
  toPatch, toRoost, setRoost, inCaveRegion, get roost(){return roost;}, clingR:null, N_ROOST,
  lanternPos:()=>lanternPos(), satchelPos:()=>satchelPos(),
  ash:(pos,n,spread)=>ashBurst(pos,n,spread),talk:()=>talkHalloran(),halloranAt:(p,yaw)=>halloranAt(p,yaw),
  get glassOpen(){return glassOpen;}, get cured(){return cured;}};

G.system('creatures',{order:30,modes:'always',
  init(){
    try{buildPatches();patchWisps();}catch(e){console.error('creatures patches',e);}
    try{buildMoths();}catch(e){console.error('creatures moths',e);}
    try{buildNegatives();}catch(e){console.error('creatures negatives',e);}
    API.total=negatives.length;
    try{buildHalloran();}catch(e){console.error('creatures halloran',e);}
    ashPts=new THREE.Points(ashGeo,new THREE.PointsMaterial({map:G.tex.flame,color:0x050407,size:.17,transparent:true,opacity:.9,depthWrite:false}));
    ashPts.frustumCulled=false; ashPts.name='ash'; G.scene.add(ashPts);
    if(lantern()&&lantern().cured)cured=true;
  },
  update(dt){
    if(!mothMesh)return;
    updateHunting(dt);
    updateMoths(dt);
    updateNegatives(dt);
    updateHalloran(dt);
    updatePatchWisps();
    updateAsh(dt);
  }
});
})();
