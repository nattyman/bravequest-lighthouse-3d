/* =====================================================================
   BRAVE QUEST: LIGHTHOUSE — moths.js  (Moth agent)
   The core loop's moth half: after the cure the moths stop caring about the
   lantern. Ichor in the satchel draws a few (the clue → Moth Bait); a *baited*
   lit lantern recruits a swarm again; the player herds it, protects it from
   monsters and carries it to the Blights, where it feeds and cures them.
   API: G.moths  = {swarm, feeding, bait(seconds), baited, baitLeft, lost,
                    addSite(site), sites, kill(m), toLantern(m), release(m),          // shared feeding (cave seals)
                    jar:{owned,count,capacity:60,give(),capture(),release()}, jarPos()} // the moth jar (cave reward)
        G.blights = [{id,name,pos,radius,needs,cured,reward,progress,feeding,stalled,hum}]
   Events: moths:bait {seconds,left} · moths:baitEnd · moths:lost {n,pos} · moths:noticed
           blight:seen {id} · blight:near / blight:far {id} · blight:feed {id} · blight:stall {id}
           blight:cured {id,name,pos,restored?} · blight:reward {id,kind,spots|pos} · spring:heal {hp}
   Dormant until 'loop:start'. Persist key 'moths'.
   ===================================================================== */
(function(){
'use strict';
const G=window.G, THREE=G.THREE, U=G.U, PI=Math.PI, TAU=PI*2;
const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const rnd=U.rng(7313);
const H=(x,z)=>{try{const h=G.world.height(x,z);return isFinite(h)?h:0;}catch(e){return 0;}};
const loopOn=()=>!!(G.loop&&G.loop.active);
const isPlay=()=>G.state.mode==='play';
const CR=()=>G.creatures||null;
const ichor=()=>{try{return G.inv&&G.inv.count?(G.inv.count('ichor')|0):0;}catch(e){return 0;}};
const lantern=()=>G.items&&G.items.lantern;

/* ---------------------------------------------------------------- numbers */
const FEED_TIME=10, STALL_BELOW=15, KILL_RATE=1.2, /* was 3: idle monsters alone wiped the swarm */ KILL_R=4, REGROW_EVERY=20, SATCHEL_N=5, SATCHEL_R=45,
      BAIT_MAX=600, NEEDS=40, SPRING_R=1.35, SPRING_EVERY=2;

/* ---------------------------------------------------------------- state (persisted) */
const S={noticed:false,baitLeft:0,lost:0,seen:{},cured:{},baitedOnce:false,fedOnce:false,jarLeft:0};
let started=false;

/* ---------------------------------------------------------------- geometry helpers */
function taper(pts,r0,r1,seg=12,rad=6){
  const curve=new THREE.CatmullRomCurve3(pts), fr=curve.computeFrenetFrames(seg,false), P=[], idx=[];
  for(let i=0;i<=seg;i++){
    const t=i/seg, c=curve.getPointAt(t), N=fr.normals[i], B=fr.binormals[i], r=Math.max(.004,r0+(r1-r0)*t);
    for(let j=0;j<rad;j++){const a=j/rad*TAU,ca=Math.cos(a)*r,sa=Math.sin(a)*r; P.push(c.x+N.x*ca+B.x*sa,c.y+N.y*ca+B.y*sa,c.z+N.z*ca+B.z*sa);}
  }
  for(let i=0;i<seg;i++)for(let j=0;j<rad;j++){const a=i*rad+j,b=i*rad+(j+1)%rad,c=a+rad,d=b+rad;idx.push(a,c,b,b,c,d);}
  const e=curve.getPointAt(1), te=curve.getTangentAt(1), ie=P.length/3; P.push(e.x+te.x*r1,e.y+te.y*r1,e.z+te.z*r1);
  for(let j=0;j<rad;j++){const o=seg*rad; idx.push(ie,o+(j+1)%rad,o+j);}
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(P,3)); g.setIndex(idx); g.computeVertexNormals();
  g.userData.curve=curve; return g;
}
function merge(list){
  const P=[],N=[],C=[],idx=[]; let off=0; const hasC=list.every(g=>g.attributes.color);
  for(const g0 of list){
    const g=g0.index?g0:g0; if(!g.attributes.normal)g.computeVertexNormals();
    const p=g.attributes.position, n=g.attributes.normal, c=g.attributes.color;
    for(let i=0;i<p.count;i++){P.push(p.getX(i),p.getY(i),p.getZ(i));N.push(n.getX(i),n.getY(i),n.getZ(i)); if(hasC)C.push(c.getX(i),c.getY(i),c.getZ(i));}
    if(g.index){const ix=g.index.array; for(let i=0;i<ix.length;i++)idx.push(ix[i]+off);} else for(let i=0;i<p.count;i++)idx.push(i+off);
    off+=p.count;
  }
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(P,3)); g.setAttribute('normal',new THREE.Float32BufferAttribute(N,3));
  if(hasC)g.setAttribute('color',new THREE.Float32BufferAttribute(C,3)); g.setIndex(idx); g.computeBoundingSphere(); return g;
}
function paint(g,fn){ const p=g.attributes.position, a=new Float32Array(p.count*3), c=new THREE.Color();
  for(let i=0;i<p.count;i++){fn(p.getX(i),p.getY(i),p.getZ(i),c); a[i*3]=c.r;a[i*3+1]=c.g;a[i*3+2]=c.b;}
  g.setAttribute('color',new THREE.BufferAttribute(a,3)); return g; }
const M4=new THREE.Matrix4(), Q=new THREE.Quaternion(), E=new THREE.Euler();
function xf(g,x,y,z,rx=0,ry=0,rz=0,sx=1,sy=sx,sz=sx){E.set(rx,ry,rz);Q.setFromEuler(E);M4.compose(V(x,y,z),Q,V(sx,sy,sz));g.applyMatrix4(M4);return g;}
/** lumpy boulder (indexed so the noise moves shared vertices together) */
function rockGeo(r,seed,flat=.75){
  const g=new THREE.IcosahedronGeometry(1,2), p=g.attributes.position;
  for(let i=0;i<p.count;i++){ const x=p.getX(i),y=p.getY(i),z=p.getZ(i), n=.78+.42*U.vnoise(x*1.7+seed,z*1.7+y*1.3+seed*.7)+.08*U.vnoise(x*5+seed,y*5);
    p.setXYZ(i,x*r*n,y*r*n*flat,z*r*n); }
  g.computeVertexNormals(); return g;
}
const COL=h=>U.col(h);

/* ---------------------------------------------------------------- materials */
function inkMat(){ return G.negMaterial?G.negMaterial({rim:'#a37cff',strength:1.15,ink:'#1c0c2c',inkStrength:.55,amp:.07,wisp:.3,flow:.22,scale:1.3,opaque:true})
  :new THREE.MeshBasicMaterial({color:0x0a090c}); }
const POOL_VS=`attribute vec2 aUv;varying vec2 vUv;
#include <fog_pars_vertex>
void main(){vUv=aUv;vec4 mvPosition=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mvPosition;
#include <fog_vertex>
}`;
const POOL_FS=`uniform float uTime;uniform float uFade;uniform float uProg;uniform float uFeed;uniform float uSeed;uniform float uEdge;uniform vec3 uRim;varying vec2 vUv;
#include <fog_pars_fragment>
float hh(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hh(i),hh(i+vec2(1,0)),f.x),mix(hh(i+vec2(0,1)),hh(i+vec2(1,1)),f.x),f.y);}
void main(){
  float a=atan(vUv.y,vUv.x), r=length(vUv);
  float breathe=.045*sin(uTime*1.05+uSeed)+.02*sin(uTime*2.3+uSeed*2.);
  float n=vn(vec2(a*2.6+uSeed,uTime*.12))*.24+vn(vUv*4.5+uSeed+uTime*.05)*.14;
  float edge=(uEdge+breathe+n)*uFade;
  float alpha=(1.-smoothstep(edge-.12,edge,r))*step(.001,uFade);
  float rim=smoothstep(edge-.22,edge-.04,r)*alpha;
  float ripple=pow(max(0.,sin(r*16.-uTime*1.4+n*4.)),14.)*(1.-smoothstep(0.,edge,r));
  float sheen=pow(max(0.,sin(vUv.x*6.+vUv.y*4.+uTime*.6+uSeed)),12.)*.08;
  vec3 c=vec3(.012,.008,.02)+uRim*rim*(.75+.45*sin(uTime*1.8+a*3.+uSeed))+vec3(.28,.2,.42)*(ripple*.16+sheen);
  /* feeding progress: a pale arc of moth-light around the edge */
  float a01=fract(.25-a/6.28318);
  float band=1.-smoothstep(.012,.032,abs(r-.94));
  float track=band*uFeed*.35, fill=band*uFeed*step(a01,uProg);
  vec3 arc=vec3(1.45,1.32,1.05)*fill+vec3(.5,.42,.6)*track*(1.-step(a01,uProg));
  float A=max(alpha*.95,max(fill,track*.8));
  if(A<.01)discard;
  c=mix(c,arc,clamp(fill+track*(1.-step(a01,uProg)),0.,1.));
  gl_FragColor=vec4(c,A);
  #include <fog_fragment>
}`;
/** a breathing ink pool laid on the ground (or flat at y0). Returns mesh; uniforms on mesh.material */
function poolMesh(cx,cz,R,yAt,seed,edge=.72){
  const SEG=30, pos=[], uv=[], idx=[];
  for(let j=0;j<=SEG;j++)for(let i=0;i<=SEG;i++){const u=i/SEG*2-1,v=j/SEG*2-1,x=cx+u*R,z=cz+v*R; pos.push(x,yAt(x,z),z); uv.push(u,v);}
  for(let j=0;j<SEG;j++)for(let i=0;i<SEG;i++){const a=j*(SEG+1)+i,b=a+1,c=a+SEG+1,d=c+1;idx.push(a,c,b,b,c,d);}
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3)); g.setAttribute('aUv',new THREE.Float32BufferAttribute(uv,2)); g.setIndex(idx); g.computeBoundingSphere();
  const u=THREE.UniformsUtils.merge([THREE.UniformsLib.fog,{uFade:{value:1},uProg:{value:0},uFeed:{value:0},uSeed:{value:seed},uEdge:{value:edge},uRim:{value:COL('#9a6cff').multiplyScalar(1.25)}}]); u.uTime=G.negTime;
  const mat=new THREE.ShaderMaterial({uniforms:u,vertexShader:POOL_VS,fragmentShader:POOL_FS,fog:true,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-4});
  const m=new THREE.Mesh(g,mat); m.renderOrder=1; m.frustumCulled=false; return m;
}
const WATER_VS=`varying vec2 vUv;varying vec3 vW;
#include <fog_pars_vertex>
void main(){vUv=uv;vec4 wp=modelMatrix*vec4(position,1.);vW=wp.xyz;vec4 mvPosition=viewMatrix*wp;gl_Position=projectionMatrix*mvPosition;
#include <fog_vertex>
}`;
const WATER_FS=`uniform float uTime;uniform float uA;uniform vec3 uDeep;uniform vec3 uShallow;varying vec2 vUv;varying vec3 vW;
#include <fog_pars_fragment>
void main(){vec2 p=vUv*2.-1.;float r=length(p);if(r>1.)discard;
  float w=sin(vW.x*3.1+uTime*1.3+sin(vW.z*1.7))*sin(vW.z*3.6-uTime*1.05);
  vec3 c=mix(uDeep,uShallow,smoothstep(.15,1.,r)*.75+w*.07);
  c+=vec3(.95,.97,1.)*pow(max(0.,w),22.)*1.4;
  c+=vec3(.75,.6,1.)*pow(max(0.,sin(r*9.-uTime*1.2)),30.)*.12;
  gl_FragColor=vec4(c,uA*(1.-smoothstep(.82,1.,r)*.7));
  #include <fog_fragment>
}`;
function waterDisc(x,y,z,R,deep='#16343f',shallow='#5f9aa3'){
  const u=THREE.UniformsUtils.merge([THREE.UniformsLib.fog,{uA:{value:0},uDeep:{value:COL(deep)},uShallow:{value:COL(shallow)}}]); u.uTime=G.negTime;
  const m=new THREE.Mesh(new THREE.CircleGeometry(R,40).rotateX(-PI/2),new THREE.ShaderMaterial({uniforms:u,vertexShader:WATER_VS,fragmentShader:WATER_FS,fog:true,transparent:true,depthWrite:false}));
  m.position.set(x,y,z); m.renderOrder=1; return m;
}
function glowSprite(color,size,op=.6){
  const s=new THREE.Sprite(new THREE.SpriteMaterial({map:G.tex.soft,color:COL(color),transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,opacity:op}));
  s.scale.setScalar(size); s.userData.op=op; return s;
}

/* ---------------------------------------------------------------- corruption kit (brambles, spires, thorns) */
function thorns(out,anchors,curve,r0,r1,every,len){
  const n=Math.max(2,Math.round(curve.getLength()/every));
  for(let i=1;i<n;i++){ const t=i/n+(rnd()-.5)*.3/n; if(t<.08||t>.94)continue;
    const p=curve.getPointAt(t), tg=curve.getTangentAt(t), side=V(rnd()-.5,rnd()-.5,rnd()-.5).cross(tg).normalize();
    const L=len*(.6+rnd()*.8), rb=(r0+(r1-r0)*t)*.75;
    out.push(taper([p.clone(),p.clone().addScaledVector(side,L*.55).addScaledVector(tg,L*.12),p.clone().addScaledVector(side,L).addScaledVector(tg,L*.35)],rb,.004,3,4));
    if(rnd()<.5)anchors.push(p.clone());
  }
}
/** an arching black bramble from a (ground) to b (ground), apex h above */
function bramble(out,anchors,a,b,h,r0){
  const mid=a.clone().lerp(b,.5); mid.y=Math.max(a.y,b.y)+h;
  const perp=V(-(b.z-a.z),0,b.x-a.x).normalize();
  const j=()=>(rnd()-.5)*.8;
  const pts=[a.clone().setY(a.y-.35), a.clone().lerp(mid,.38).add(V(0,h*.38,0)).addScaledVector(perp,j()), mid.clone().addScaledVector(perp,j()),
    b.clone().lerp(mid,.42).add(V(0,h*.22,0)).addScaledVector(perp,j()), b.clone().setY(b.y-.25)];
  const g=taper(pts,r0,r0*.4,18,7); out.push(g);
  thorns(out,anchors,g.userData.curve,r0,r0*.4,.42,.42);
  for(let t=.2;t<.85;t+=.15)anchors.push(g.userData.curve.getPointAt(t));
}
/** a twisting upright spike */
function spire(out,anchors,base,h,r0,twist){
  const pts=[]; const ph=rnd()*TAU;
  for(let i=0;i<=5;i++){const t=i/5, a=ph+t*twist, rr=.25+.35*t*(1-t)*2; pts.push(V(base.x+Math.cos(a)*rr*(i?1:0),base.y-.3+t*h,base.z+Math.sin(a)*rr*(i?1:0)));}
  const g=taper(pts,r0,.012,16,7); out.push(g);
  thorns(out,anchors,g.userData.curve,r0,.03,.36,.5);
  for(let t=.15;t<.8;t+=.18)anchors.push(g.userData.curve.getPointAt(t));
}
/** low tendril crawling along the ground / over rocks (follows yAt) */
function crawler(out,anchors,from,ang,len,r0,yAt,lift=.06){
  const pts=[]; let x=from.x,z=from.z,a=ang;
  for(let i=0;i<=6;i++){ const y=yAt(x,z)+lift+(i===0?-.1:0); pts.push(V(x,y,z)); a+=(rnd()-.5)*.7; x+=Math.cos(a)*len/6; z+=Math.sin(a)*len/6; }
  pts[6].y-=.2;
  const g=taper(pts,r0,.02,16,6); out.push(g);
  thorns(out,anchors,g.userData.curve,r0,.02,.55,.3);
  anchors.push(g.userData.curve.getPointAt(.3));
}

/* ---------------------------------------------------------------- the blights */
const DEFS=[
  {id:'grove',name:'The Blighted Grove',x:-126,z:-30,radius:7,reward:'glowcaps',
    seeLine:'Black thorns have closed over a ring of glowcaps. Under them the mushrooms have gone grey, and the whole thicket rises and falls like something breathing.',
    curedLine:'The thorns boil away into nothing. Underneath, the glowcaps were only sleeping: they open violet, one after another.',
    toast:'Glowcaps bloom in the grove'},
  {id:'tidepool',name:'The Black Tide Pool',x:32,z:72,radius:6,reward:'pearls',
    seeLine:'The rock pool is full to the brim with black. It swells and sinks, slow, out of time with the sea.',
    curedLine:'The black lifts off the pool like a sheet. The water underneath is clear and cold, and something at the bottom catches the light.',
    toast:'Pearls at low tide'},
  {id:'well',name:'The Choked Well',x:-15,z:33,radius:6,reward:'spring',
    seeLine:'The hamlet’s well is choked to the lip with ink. It has been drinking this village a long time.',
    curedLine:'The ink goes out of the well like a held breath let go. Clean water wells up and spills over the stones. It feels like somewhere you could rest.',
    toast:'A healing spring · a place to rest'},
];
const blights=G.blights=[];
DEFS.forEach(d=>blights.push({id:d.id,name:d.name,pos:V(d.x,0,d.z),radius:d.radius,needs:NEEDS,cured:false,reward:d.reward,
  progress:0,feeding:false,stalled:false,hum:0}));
const P_={}; // private per-blight data (meshes, emitters, anchors)
const def=id=>DEFS.find(d=>d.id===id);

function newPrivate(b){
  const p=P_[b.id]={root:new THREE.Group(),inkParts:[],curedParts:[],anchors:[],ems:[],mat:inkMat(),heart:null,pool:null,
    boil:-1,feedT:0,spawnPlan:0,spawnT:0,near:false,seenT:-1,flash:0};
  p.root.name='blight_'+b.id; p.root.visible=false; G.scene.add(p.root); return p;
}
function inkMesh(p,list){ const m=new THREE.Mesh(merge(list),p.mat); m.castShadow=false; p.root.add(m); p.inkParts.push(m); return m; }
function heartMesh(p,x,y,z,sx,sy,sz){
  const m=new THREE.Mesh(new THREE.SphereGeometry(1,28,18),p.mat); m.position.set(x,y,z); m.scale.set(sx,sy,sz); m.userData.base=V(sx,sy,sz);
  p.root.add(m); p.heart=m; p.inkParts.push(m);
  for(let i=0;i<14;i++){const a=rnd()*TAU,el=rnd()*.9; p.anchors.push(V(x+Math.cos(a)*Math.cos(el)*sx,y+Math.sin(el)*sy,z+Math.sin(a)*Math.cos(el)*sz));}
  return m;
}
function addEmitters(p,b,c,R){
  if(!(G.ink&&G.ink.emitter))return;
  p.ems.push(G.ink.emitter(V(c.x,c.y+.6,c.z),{rate:7,radius:R*.28,size:[1.2,3.6],life:[3.5,6],rise:1.15,drift:.32,trail:0,alpha:.42,embers:2.2,color:'#0b0710',intensity:0}));
  p.ems.push(G.ink.emitter(V(c.x,c.y+.15,c.z),{rate:6,radius:R*.75,size:[.6,1.7],life:[1.8,3],rise:.22,drift:.25,trail:0,alpha:.3,embers:.6,color:'#0d0912',intensity:0}));
}

/* ---- Blighted Grove ---- */
const glowMat=G.toon('#b995ff',{emissive:'#7c3dff',emissiveIntensity:1.05});
const deadMat=G.toon('#6c6670');
function shroomCluster(list,x,y,z,s,seed){
  const n=2+((seed*7)|0)%2;
  for(let i=0;i<n;i++){ const a=seed*9+i*2.1, d=i?(.14+.1*i)*s:0, h=(.22+.16*((i+seed*3)%1))*s*(i?0.8:1.2), cr=(.11+.05*(i===0))*s*(i?0.85:1.25);
    const px=x+Math.cos(a)*d, pz=z+Math.sin(a)*d, py=G.floorAt(px,pz,y+1);
    list.push(xf(new THREE.CylinderGeometry(.03*s+.012,.045*s+.015,h,6),px,py+h/2,pz,(Math.sin(a)*.18),0,(Math.cos(a)*.18)));
    list.push(xf(new THREE.SphereGeometry(cr,10,6,0,TAU,0,PI/2),px+Math.sin(a)*.0,py+h-.01,pz,0,0,0,1,.62,1));
  }
}
function buildGrove(b,p){
  const c=b.pos; c.y=H(c.x,c.z); const R=b.radius;
  const yAt=(x,z)=>H(x,z)+.07;
  p.pool=poolMesh(c.x,c.z,R*1.05,yAt,1.7,.74); p.root.add(p.pool);
  // the ring of glowcaps it smothers: six real spots (alchemy pickups) + small decorative clusters
  p.spots=[]; const shrooms=[];
  for(let i=0;i<6;i++){ const a=i/6*TAU+.4, r=3.9+(rnd()-.5)*.6, x=c.x+Math.cos(a)*r, z=c.z+Math.sin(a)*r, y=H(x,z);
    p.spots.push(V(x,y,z)); shroomCluster(shrooms,x,y,z,1.35,rnd()); }
  for(let i=0;i<10;i++){ const a=rnd()*TAU, r=1.8+rnd()*3.6, x=c.x+Math.cos(a)*r, z=c.z+Math.sin(a)*r; shroomCluster(shrooms,x,H(x,z),z,.8+rnd()*.5,rnd()); }
  const sg=merge(shrooms); p.shrooms=new THREE.Mesh(sg,deadMat); p.root.add(p.shrooms);
  // brambles arching inward over the ring, spires in the middle, a heart under them
  const out=[];
  for(let i=0;i<8;i++){ const a=i/8*TAU+rnd()*.4, a2=a+.8+rnd()*.6, r0=R*(.95+rnd()*.15), r1=.6+rnd()*1.2;
    const A=V(c.x+Math.cos(a)*r0,0,c.z+Math.sin(a)*r0); A.y=H(A.x,A.z); const B=V(c.x+Math.cos(a2)*r1,0,c.z+Math.sin(a2)*r1); B.y=H(B.x,B.z);
    bramble(out,p.anchors,A,B,1.5+rnd()*1.3,.13+rnd()*.06); }
  for(let i=0;i<4;i++){ const a=i/4*TAU+rnd(), r=i?.9+rnd()*.9:0, x=c.x+Math.cos(a)*r, z=c.z+Math.sin(a)*r;
    spire(out,p.anchors,V(x,H(x,z),z),i?2.3+rnd()*1.2:4.4,i?.17:.26,2+rnd()*2); }
  for(let i=0;i<7;i++){ const a=rnd()*TAU; crawler(out,p.anchors,V(c.x+Math.cos(a)*1.4,0,c.z+Math.sin(a)*1.4),a,R*.8,.08,yAt); }
  inkMesh(p,out);
  heartMesh(p,c.x,c.y+.15,c.z,1.5,.9,1.35);
  addEmitters(p,b,c,R);
  // cured: soft violet glows over the opened caps
  for(const s of p.spots){ const g=glowSprite('#a56cff',1.6,.45); g.position.set(s.x,s.y+.55,s.z); g.visible=false; p.root.add(g); p.curedParts.push(g); }
}

/* ---- Black Tide Pool: a rock shelf at the waterline with a pool on top ---- */
let shelf=null;
function buildTidepool(b,p){
  const c=b.pos, g0=H(c.x,c.z); const top=Math.max(2.2,g0+1.5); c.y=top;
  const SR=4.6;
  shelf={x:c.x,z:c.z,r:SR-.25,top};
  const rocks=[];
  // the shelf: a flattened lumpy slab sunk into the beach
  const slab=new THREE.CylinderGeometry(SR,SR+1.4,top+3,22,4); const sp=slab.attributes.position;
  for(let i=0;i<sp.count;i++){ const x=sp.getX(i),y=sp.getY(i),z=sp.getZ(i); const a=Math.atan2(z,x), k=1+.12*Math.sin(a*3+1)+.08*U.vnoise(Math.cos(a)*3+7,y*.8);
    sp.setXYZ(i,x*(y>(top+3)/2-.01?k*.98:k),y,z*(y>(top+3)/2-.01?k*.98:k)); }
  slab.computeVertexNormals(); xf(slab,c.x,top-(top+3)/2,c.z);
  rocks.push(slab);
  // rim boulders, leaving a couple of gaps
  for(let i=0;i<11;i++){ if(i===3||i===8)continue; const a=i/11*TAU+(rnd()-.5)*.2, r=3.35+rnd()*.5, s=.55+rnd()*.55;
    rocks.push(xf(rockGeo(1,i*3.7+1,.7),c.x+Math.cos(a)*r,top+s*.25,c.z+Math.sin(a)*r,rnd(),rnd()*TAU,0,s*1.25,s,s*1.1)); }
  // tumbled boulders on the beach below
  for(let i=0;i<7;i++){ const a=rnd()*TAU, r=SR+.8+rnd()*2.4, x=c.x+Math.cos(a)*r, z=c.z+Math.sin(a)*r, s=.4+rnd()*.7;
    rocks.push(xf(rockGeo(1,i*5.1+9,.75),x,H(x,z)+s*.2,z,rnd(),rnd()*TAU,0,s*1.3,s,s)); }
  const rg=merge(rocks.map(g=>g.index?g:g));
  paint(rg,(x,y,z,o)=>{ const n=U.vnoise(x*.9,z*.9+y); o.copy(COL('#55555b')).lerp(COL('#34343b'),n*.8);
    if(y<top-.6)o.lerp(COL('#2c2a2e'),U.smooth(top-.6,top-2.5,y)*.8);           // wet, dark lower face
    if(y>top-.25&&y<top+.25)o.lerp(COL('#4f5b3e'),.35*U.vnoise(x*2,z*2));        // a little weed on the lip
  });
  const rm=new THREE.Mesh(rg,G.toon('#ffffff',{vertexColors:true})); rm.castShadow=true; rm.receiveShadow=true; p.root.add(rm);
  if(G.outline)G.outline(rm,{thickness:.035});
  const flat=()=>top+.05;
  p.pool=poolMesh(c.x,c.z,3.25,flat,4.1,.78); p.root.add(p.pool);
  // ink: a domed heart rising out of the pool, tendrils spilling over the rim and down the rock face
  const out=[];
  const yRock=(x,z)=>{const d=Math.hypot(x-c.x,z-c.z); return d<SR?top+.05+Math.max(0,(d-2.9))*.5:H(x,z);};
  for(let i=0;i<7;i++){ const a=i/7*TAU+rnd()*.5; crawler(out,p.anchors,V(c.x+Math.cos(a)*.9,0,c.z+Math.sin(a)*.9),a,6+rnd()*2,.13,yRock,.12); }
  for(let i=0;i<7;i++){ const a=i/7*TAU+rnd()*.6, r=i?.9+rnd()*1.5:0; spire(out,p.anchors,V(c.x+Math.cos(a)*r,top,c.z+Math.sin(a)*r),i?1.8+rnd()*1.8:4.2,i?.15:.24,3); }
  inkMesh(p,out);
  heartMesh(p,c.x,top+.05,c.z,1.9,1.15,1.9);
  addEmitters(p,b,V(c.x,top,c.z),3.5);
  // cured: clear water and a pearl glint at the bottom
  const w=waterDisc(c.x,top+.08,c.z,3.15); p.root.add(w); p.water=w;
  const pearl=new THREE.Mesh(new THREE.SphereGeometry(.13,14,10),G.toon('#fff4ee',{emissive:'#f4dcff',emissiveIntensity:.85}));
  pearl.position.set(c.x+.9,top+.12,c.z-.5); p.root.add(pearl); pearl.visible=false; p.curedParts.push(pearl); p.pearl=pearl;
  const glint=glowSprite('#ffffff',.9,.9); glint.position.copy(pearl.position).add(V(0,.12,0)); glint.visible=false; p.root.add(glint); p.curedParts.push(glint); p.glint=glint;
}

/* ---- Choked Well ---- */
let wellCollider=false;
function buildWell(b,p){
  const c=b.pos; c.y=H(c.x,c.z); const y=c.y;
  const stone=[], timber=[];
  // two courses of dressed stones, then a coping ring
  for(let k=0;k<3;k++){ const n=13, rr=1.02;
    for(let i=0;i<n;i++){ const a=(i+(k%2)*.5)/n*TAU, w=2*PI*rr/n*.94;
      stone.push(xf(new THREE.BoxGeometry(w,.3,.36,1,1,1),c.x+Math.cos(a)*rr,y+.15+k*.3,c.z+Math.sin(a)*rr,(rnd()-.5)*.05,-a+PI/2,(rnd()-.5)*.05)); } }
  stone.push(xf(new THREE.TorusGeometry(1.03,.13,6,26),c.x,y+.95,c.z,PI/2,0,0,1,1,.9));
  const sg=merge(stone); paint(sg,(x,yy,z,o)=>{o.copy(COL('#8d877c')).lerp(COL('#6c665e'),U.vnoise(x*4+yy*3,z*4)); if(yy<y+.35)o.lerp(COL('#55663f'),.35);});
  const sm=new THREE.Mesh(sg,G.toon('#ffffff',{vertexColors:true})); sm.castShadow=true; p.root.add(sm); if(G.outline)G.outline(sm,{thickness:.025});
  // frame, beam, little roof, rope and bucket
  const yaw=.35, cs=Math.cos(yaw), sn=Math.sin(yaw), side=(d)=>[c.x+cs*d,c.z-sn*d];
  for(const d of [-1.18,1.18]){ const [x,z]=side(d); timber.push(xf(new THREE.BoxGeometry(.16,2.35,.16),x,y+1.17,z,0,yaw,(d<0?1:-1)*.03)); }
  timber.push(xf(new THREE.CylinderGeometry(.075,.075,2.6,8),c.x,y+2.05,c.z,0,yaw,PI/2));
  for(const s of [-1,1]) timber.push(xf(new THREE.BoxGeometry(2.7,.07,.75),c.x+sn*s*.32,y+2.42,c.z+cs*s*.32,s*.55,yaw,0));
  timber.push(xf(new THREE.CylinderGeometry(.012,.012,.85,4),c.x,y+1.62,c.z));
  timber.push(xf(new THREE.CylinderGeometry(.19,.15,.3,10,1,true),c.x,y+1.08,c.z));
  const tg=merge(timber); paint(tg,(x,yy,z,o)=>{o.copy(COL('#5c4532')).lerp(COL('#3f2e22'),U.vnoise(x*6,yy*6+z));});
  const tm=new THREE.Mesh(tg,G.toon('#ffffff',{vertexColors:true,side:THREE.DoubleSide})); tm.castShadow=true; p.root.add(tm); if(G.outline)G.outline(tm,{thickness:.02});
  // spring basin beside it (cured: water; it heals)
  const sx=c.x-1.5*sn+2.3*cs*0, sz=c.z+2.6; // a little south of the well, off the path
  p.spring=V(c.x+.4,y,c.z+2.7); const bs=[];
  for(let i=0;i<11;i++){ const a=i/11*TAU, r=1.25; bs.push(xf(rockGeo(1,i*2.3+40,.8),p.spring.x+Math.cos(a)*r,y+.08,p.spring.z+Math.sin(a)*r,0,rnd()*TAU,0,.42,.3,.36)); }
  const bg=merge(bs); paint(bg,(x,yy,z,o)=>{o.copy(COL('#7d7870')).lerp(COL('#56663e'),U.vnoise(x*3,z*3)*.5);});
  const bm=new THREE.Mesh(bg,G.toon('#ffffff',{vertexColors:true})); p.root.add(bm);
  void sx; void sz;
  // ink: overflowing the mouth, running down the stones, spreading over the ground, climbing the posts
  const yAt=(x,z)=>H(x,z)+.07;
  p.pool=poolMesh(c.x,c.z,b.radius*.95,yAt,7.3,.7); p.root.add(p.pool);
  const out=[];
  for(let i=0;i<9;i++){ const a=i/9*TAU+rnd()*.3, x0=c.x+Math.cos(a)*1.05, z0=c.z+Math.sin(a)*1.05;
    out.push(taper([V(c.x+Math.cos(a)*.7,y+1.02,c.z+Math.sin(a)*.7),V(c.x+Math.cos(a)*1.18,y+1.02,c.z+Math.sin(a)*1.18),V(c.x+Math.cos(a)*1.22,y+.5,c.z+Math.sin(a)*1.22),V(c.x+Math.cos(a)*1.4,y+.1,c.z+Math.sin(a)*1.4)],.09+rnd()*.05,.13,10,6));
    crawler(out,p.anchors,V(x0+Math.cos(a)*.35,0,z0+Math.sin(a)*.35),a,3+rnd()*2.5,.1,yAt); }
  for(const d of [-1.18,1.18]){ const [x,z]=side(d), pts=[];
    for(let i=0;i<=8;i++){const t=i/8, a=t*9+d; pts.push(V(x+Math.cos(a)*.13,y+t*2.1,z+Math.sin(a)*.13));}
    const g=taper(pts,.07,.02,24,5); out.push(g); thorns(out,p.anchors,g.userData.curve,.07,.02,.3,.22); }
  for(let i=0;i<5;i++){ const a=i/5*TAU+rnd()*.8, r=1.9+rnd()*1.6, x=c.x+Math.cos(a)*r, z=c.z+Math.sin(a)*r; spire(out,p.anchors,V(x,H(x,z),z),i%2?1.6+rnd():2.6+rnd()*1.2,i%2?.12:.17,2.5); }
  for(let i=0;i<4;i++){ const a=i/4*TAU+.4; spire(out,p.anchors,V(c.x+Math.cos(a)*.45,y+.9,c.z+Math.sin(a)*.45),1.2+rnd()*.9,.11,3); }
  inkMesh(p,out);
  heartMesh(p,c.x,y+.95,c.z,1.0,.75,1.0);
  addEmitters(p,b,V(c.x,y+1,c.z),3);
  if(G.ink&&G.ink.emitter)p.ems.push(G.ink.emitter(V(c.x,y+1,c.z),{rate:0,radius:.9,drip:2.5,embers:0,intensity:0}));
  // cured parts
  const w=waterDisc(c.x,y+.84,c.z,.93,'#1a3a44','#6fa6ad'); p.root.add(w); p.water=w;
  const sw=waterDisc(p.spring.x,y+.11,p.spring.z,1.12,'#24505a','#8cc4c4'); p.root.add(sw); p.springWater=sw;
  const sgw=glowSprite('#d9c8ff',2.4,.35); sgw.position.set(p.spring.x,y+.5,p.spring.z); sgw.visible=false; p.root.add(sgw); p.curedParts.push(sgw);
  if(G.ink&&G.ink.emitter){ p.springEm=G.ink.emitter(V(p.spring.x,y+.15,p.spring.z),{rate:0,radius:.8,embers:2.2,intensity:0}); }
}
function addWellCollider(){
  if(wellCollider)return; const b=blights.find(x=>x.id==='well'); if(!b||!G.addCollider)return;
  G.addCollider({x:b.pos.x,z:b.pos.z,r:1.3,y0:b.pos.y-1,y1:b.pos.y+1.1}); wellCollider=true;
}
function shelfFloor(x,z,y){
  if(!started||!shelf)return null;
  const d=Math.hypot(x-shelf.x,z-shelf.z); if(d>shelf.r)return null;
  return shelf.top;
}

function buildAll(){
  for(const b of blights){ const p=newPrivate(b);
    try{ if(b.id==='grove')buildGrove(b,p); else if(b.id==='tidepool')buildTidepool(b,p); else buildWell(b,p); }
    catch(e){console.error('moths: blight '+b.id,e);} }
  if(G.floorProviders)G.floorProviders.push(shelfFloor);
}

/* ---------------------------------------------------------------- show / cure visuals */
function setCuredLook(b,k){ // k: 0 corrupt .. 1 fully cured (used for the transition and for loads)
  const p=P_[b.id]; if(!p)return;
  const f=Math.max(0,1-k*1.25);
  p.mat.uniforms&&(p.mat.uniforms.uFade.value=f);
  for(const m of p.inkParts)m.visible=f>0.01;
  if(p.pool){p.pool.material.uniforms.uFade.value=f; p.pool.visible=f>0.01;}
  const c=U.smooth(.35,1,k);
  for(const o of p.curedParts){ o.visible=c>0.01; if(o.isSprite)o.material.opacity=(o.userData.op||.6)*c; else o.scale.setScalar(Math.max(.01,c)); }
  if(p.water){p.water.material.uniforms.uA.value=.82*c; p.water.visible=c>0.01;}
  if(p.springWater){p.springWater.material.uniforms.uA.value=.8*c; p.springWater.visible=c>0.01;}
  if(p.shrooms){ p.shrooms.material=k>.45?glowMat:deadMat; p.shrooms.scale.setScalar(1); }
}
function showAll(){
  for(const b of blights){ const p=P_[b.id]; if(!p)continue; p.root.visible=true; setCuredLook(b,b.cured?1:0); }
  addWellCollider();
}

/* ---------------------------------------------------------------- HUD */
let hudEl=null, hudRow=null, hudFeed=null, hudBar=null, hudFeedTxt=null;
function buildHud(){
  if(hudEl)return;
  const st=document.createElement('style');
  st.textContent=`
.moth-chip{display:grid;gap:3px;font-size:13px;color:var(--bone,#f1e9d8);text-shadow:0 1px 3px #000;transition:opacity .5s;opacity:0}
.moth-chip.show{opacity:1}
.moth-chip .row{display:flex;align-items:center;gap:6px;white-space:nowrap}
.moth-chip svg{width:18px;height:14px;flex:none;filter:drop-shadow(0 1px 2px rgba(0,0,0,.7))}
.moth-chip b{font-weight:700;font-variant-numeric:tabular-nums;color:var(--ether-hi,#d6bcff)}
.moth-chip .bait b{color:var(--amber,#e3a13a)}
.moth-chip .dot{color:var(--fog,#a7a3b3)}
.moth-chip .feed{display:flex;align-items:center;gap:7px;font-family:var(--serif,Georgia,serif);font-style:italic;font-size:14px}
.moth-chip .feed.stall{color:#e9a0a0}
.moth-chip .bar{width:96px;height:5px;border-radius:3px;background:rgba(20,15,26,.65);border:1px solid rgba(241,233,216,.35);overflow:hidden}
.moth-chip .bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,#bfae86,#fbf3de);transition:width .25s}`;
  document.head.appendChild(st);
  hudEl=document.createElement('div'); hudEl.className='moth-chip'; hudEl.hidden=true; hudEl.setAttribute('aria-live','off');
  hudEl.innerHTML=`<div class="row"><svg viewBox="0 0 36 28" aria-hidden="true"><path fill="#efe6cf" d="M18 6c-1 0-1.5 1-1.5 2v14c0 1 .6 2 1.5 2s1.5-1 1.5-2V8c0-1-.5-2-1.5-2zM16 10C12 2 3 1 2 6c-1 4 5 8 13 8zm4 0c4-8 13-9 14-4 1 4-5 8-13 8zm-4 6c-6 0-11 3-10 7 1 3 7 2 11-3zm4 0c6 0 11 3 10 7-1 3-7 2-11-3z"/></svg><span class="txt"></span></div>
  <div class="feed" hidden><span class="ft"></span><span class="bar"><i></i></span></div>`;
  hudRow=hudEl.querySelector('.txt'); hudFeed=hudEl.querySelector('.feed'); hudFeedTxt=hudEl.querySelector('.ft'); hudBar=hudEl.querySelector('.bar i');
  const host=document.querySelector('#hud .vitals'); if(host)host.appendChild(hudEl);
}
let hudKey='', hudShowT=0;
const mmss=s=>{s=Math.ceil(s); return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');};
function updateHud(dt){
  if(!hudEl){ if(document.querySelector('#hud .vitals'))buildHud(); if(!hudEl)return; }
  const fb=blights.find(b=>b.feeding)||sites.find(b=>b.feeding&&!b.cured);
  const rel=started&&(S.baitLeft>0||S.jarLeft>0||API.swarm>0||!!fb||JAR.count>0);
  hudShowT=rel?2:Math.max(0,hudShowT-dt);
  const show=hudShowT>0;
  if(hudEl.hidden===show){ hudEl.hidden=!show; if(show)requestAnimationFrame(()=>hudEl.classList.add('show')); else hudEl.classList.remove('show'); }
  if(!show)return;
  let k=`Moths with you <b>${API.swarm}</b>`;
  if(S.baitLeft>0)k+=` <span class="dot">·</span> <span class="bait">bait <b>${mmss(S.baitLeft)}</b></span>`;
  else if(S.jarLeft>0)k+=` <span class="dot">·</span> <span class="bait">freed <b>${mmss(S.jarLeft)}</b></span>`;
  else if(API.swarm>0)k+=` <span class="dot">·</span> <span class="bait">bait gone</span>`;
  if(JAR.owned&&JAR.count>0)k+=` <span class="dot">·</span> jar <b>${JAR.count}</b>`;
  if(k!==hudKey){hudKey=k; hudRow.innerHTML=k;}
  hudFeed.hidden=!fb;
  if(fb){ const n=API.feeding; hudFeed.classList.toggle('stall',fb.stalled);
    const t=fb.stalled?`Too few to feed (${n}) — bring more`:`Feeding · ${n} moths`; if(hudFeedTxt.textContent!==t)hudFeedTxt.textContent=t;
    hudBar.style.width=Math.round(fb.progress*100)+'%'; }
}

/* ---------------------------------------------------------------- moth handling */
const SWARM_T={lantern:1,feed:1,satchel:1};
function mothList(){ const c=CR(); return c&&c.moths||[]; }
function release(m){ m.feedB=null; m._rel=0; const c=CR(); if(c&&c.toPatch)c.toPatch(m); else m.tgt='patch'; }
function toLantern(m){ m.feedB=null; m._rel=0; m.tgt='lantern'; m.rad=.35+rnd()*1.4; m.hy=rnd()*1.4; m.prey=null; }
function toFeed(m,b){
  const an=b.anchors&&b.anchors.length?b.anchors:(P_[b.id]&&P_[b.id].anchors)||[]; const a=an.length?an[(rnd()*an.length)|0]:b.pos;
  m.tgt='feed'; m.feedB=b; m._rel=0; m.delay=0; m.next=null; m.prey=null;
  m.feedC=(m.feedC||V()).set(a.x+(rnd()-.5)*.5,a.y+.12+rnd()*.45,a.z+(rnd()-.5)*.5); m.rad=.08+rnd()*.4;
}
function kill(m,dust){
  m.tgt='gone'; m.feedB=null; m._rel=0; m.prey=null; m.next=null; m.delay=0;
  if(dust&&G.ink&&G.ink.burst)G.ink.burst(m.p,{n:4,speed:1.1,size:[.12,.45],life:[.5,1.1],up:.5,alpha:.75,color:'#efe6cf',embers:1});
}
function revive(m){
  const c=CR(); const pats=(c&&c.patches)||[];
  if(m.cave&&c&&c.roost&&c.roost.pts.length&&c.toRoost){ const r=c.roost.pts[(rnd()*c.roost.pts.length)|0]; m.p.copy(r.p).addScaledVector(r.n,.6); m.v.set(0,.3,0); c.toRoost(m); return; }
  const sites=pats.map(p=>({x:p.x,z:p.z,y:p.y})).concat(blights.filter(b=>b.cured).map(b=>({x:b.pos.x,z:b.pos.z,y:b.pos.y,blight:1})));
  const s=sites.length?sites[(rnd()*sites.length)|0]:{x:0,z:0,y:H(0,0)};
  m.p.set(s.x+(rnd()-.5)*2,(s.y||H(s.x,s.z))+.6,s.z+(rnd()-.5)*2); m.v.set(0,.8,0);
  if(s.blight){ m.tgt='wander'; const a=rnd()*TAU, r=2+rnd()*5; m.home=V(s.x+Math.cos(a)*r,H(s.x+Math.cos(a)*r,s.z+Math.sin(a)*r)+1.6,s.z+Math.sin(a)*r); m.rad=1+rnd()*2; }
  else { release(m); const i=pats.findIndex(p=>p.x===s.x&&p.z===s.z); if(i>=0)m.idx=i; }
}
function goneCount(){ let n=0; for(const m of mothList())if(m.tgt==='gone')n++; return n; }

/* ---- the clue: ichor in the satchel ---- */
let satchelT=0, noticeT=0;
function updateSatchel(dt){
  satchelT-=dt; if(satchelT>0)return; satchelT=.4;
  const ms=mothList(), P=G.player; if(!P||!P.pos||!ms.length)return;
  const have=ichor()>0&&P.alive!==false;
  let n=0, close=0;
  for(const m of ms) if(m.tgt==='satchel'){ if(!have)release(m); else{ n++; if(m.p.distanceToSquared(P.pos)<9+2*P.pos.y*0)close++; } }
  if(!have){noticeT=0;return;}
  if(n<SATCHEL_N){
    const free=[]; for(const m of ms){ if((m.tgt==='patch'||m.tgt==='wander')&&!m.delay){ const d=m.p.distanceToSquared(P.pos); if(d<SATCHEL_R*SATCHEL_R)free.push([d,m]); } }
    free.sort((a,b)=>a[0]-b[0]);
    for(let i=0;i<free.length&&n<SATCHEL_N;i++){ const m=free[i][1]; m.tgt='satchel'; m.rad=.3+rnd()*.55; m.hy=rnd()*.7; m.home=null; n++; }
  }
  // close moths near the satchel: the player notices
  let near=0; for(const m of ms) if(m.tgt==='satchel'&&Math.hypot(m.p.x-P.pos.x,m.p.z-P.pos.z)<2.6&&Math.abs(m.p.y-P.pos.y-1)<2)near++;
  if(!S.noticed&&near>=3){ noticeT+=.4; if(noticeT>=1.6){
    S.noticed=true;
    G.ui.say('The moths are circling your satchel. Not the lantern — the ichor.');
    try{ G.alchemy&&G.alchemy.learn&&G.alchemy.learn('bait'); }catch(e){console.error(e);}
    G.emit('moths:noticed',{});
  } }
}

/* ---- bait ---- */
const baitV=V(); let baitEm=null, unlitT=0;
function bait(seconds){
  seconds=+seconds||120;
  const was=S.baitLeft>0;
  S.baitLeft=Math.min(BAIT_MAX,Math.max(0,S.baitLeft)+seconds);
  G.emit('moths:bait',{seconds,left:S.baitLeft});
  if(!S.baitedOnce){ S.baitedOnce=true;
    setTimeout(()=>G.ui.say('You smear the bait over the lantern’s cage. The flame gutters dark, and the air around it begins to stir.'),400); }
  else if(!was&&G.ui.toast)G.ui.toast('The lantern is baited',mmss(S.baitLeft)+' of ichor-scent');
  return S.baitLeft;
}
function updateBait(dt){
  const L=lantern(), c=CR();
  if((S.baitLeft>0||S.jarLeft>0)&&isPlay()){
    S.baitLeft=Math.max(0,S.baitLeft-dt); S.jarLeft=Math.max(0,S.jarLeft-dt);
    if(S.baitLeft<=0&&S.jarLeft<=0){
      let n=0; for(const m of mothList()) if(m.tgt==='lantern'){release(m);n++;}
      G.emit('moths:baitEnd',{released:n});
      if(n>0)G.ui.say('The bait has gone cold. The moths lose the scent and drift back toward the patches.');
    }
  }
  // a shut (unlit) baited lantern loses its swarm after a moment
  if(API.baited&&L&&L.lit&&!L.lit()&&!(c&&c.clingR!=null)){ unlitT+=dt; if(unlitT>1.5){ for(const m of mothList()) if(m.tgt==='lantern')release(m); } } else unlitT=0;
  // ichor smoke curling off the baited lantern
  if(G.ink&&G.ink.emitter&&!baitEm)baitEm=G.ink.emitter(baitV,{rate:5,radius:.12,size:[.18,.6],life:[.8,1.5],rise:.35,drift:.12,trail:.9,alpha:.55,embers:1.5,color:'#120a1a',intensity:0});
  if(baitEm){ const lp=c&&c.lanternPos?c.lanternPos():null; if(lp)baitV.copy(lp);
    baitEm.intensity=(S.baitLeft>0&&L&&L.found&&!L.inCradle&&(!L.lit||L.lit()))?1:0; }
}

/* ---- protection: monsters eat the swarm ---- */
const killAcc=new WeakMap(); let lostBatch=0, lostPos=V(), nudgeT=0;
const _ctr=V();
function updateThreats(dt){
  const ML=G.monsters&&G.monsters.list; const ms=mothList(); if(!ms.length)return;
  // the swarm (and its centre)
  const sw=[]; _ctr.set(0,0,0);
  for(const m of ms) if(SWARM_T[m.tgt]){sw.push(m); _ctr.add(m.p);}
  if(sw.length)_ctr.multiplyScalar(1/sw.length);
  if(!ML||!sw.length)return;
  for(const mo of ML){
    if(!mo.alive||mo.dying||mo.state==='intro'||mo.state==='dying')continue;
    const cx=mo.pos.x, cy=mo.pos.y+(mo.kind==='hound'?.6:1.2), cz=mo.pos.z;
    let best=null, bd=KILL_R*KILL_R;
    for(const m of sw){ if(m.tgt==='gone')continue; const dx=m.p.x-cx,dy=m.p.y-cy,dz=m.p.z-cz,d=dx*dx+dy*dy*.6+dz*dz; if(d<bd){bd=d;best=m;} }
    if(!best){killAcc.set(mo,0);continue;}
    // a monster that's hunting the player bites at the full rate; one just drifting about nibbles
    const calm=mo.state==='idle'||mo.state==='return'||mo.state==='wander';
    let a=(killAcc.get(mo)||0)+dt*KILL_RATE*(calm?.35:1);
    while(a>=1){ a-=1;
      let tgt=best; if(tgt.tgt==='gone'){ tgt=null; let d2=KILL_R*KILL_R; for(const m of sw){ if(m.tgt==='gone')continue; const d=m.p.distanceToSquared(mo.pos); if(d<d2){d2=d;tgt=m;} } }
      if(!tgt)break; lostPos.copy(tgt.p); kill(tgt,true); S.lost++; lostBatch++; }
    killAcc.set(mo,a);
  }
  if(lostBatch>0){ G.emit('moths:lost',{n:lostBatch,pos:lostPos.clone()}); lostBatch=0; }
  // idle monsters nearby wander toward a swarm (monsters.js has no targeting hook: steer their wander goal)
  nudgeT-=dt; if(nudgeT<=0){ nudgeT=1.5;
    for(const mo of ML){ if(!mo.alive||mo.dying||mo.state!=='idle')continue;
      if(Math.hypot(mo.pos.x-_ctr.x,mo.pos.z-_ctr.z)<18){ mo.wt=V(_ctr.x+(rnd()-.5)*3,0,_ctr.z+(rnd()-.5)*3); mo.pause=0; } } }
}

/* ---- regrowth ---- */
let regrowT=REGROW_EVERY;
function updateRegrow(dt){
  regrowT-=dt; if(regrowT>0)return; regrowT=REGROW_EVERY;
  for(const m of mothList()) if(m.tgt==='gone'){ revive(m); S.lost=Math.max(0,S.lost-1); G.emit('moths:regrow',{}); break; }
}

/* ---- shared feeding: blights and other sites (cave seals) ----
   site: {id,name,pos:Vector3,radius,needs,cured,progress,feeding,stalled, anchors?:[Vector3], feedTime?, stallBelow?, yRange?,
          onFeed?(s), onStall?(s,n), onStop?(s), onDone?(s)}   — moths on a baited lantern within radius+1 start feeding at `needs`. */
const sites=[];
function feedTick(b,dt,ms,o){
  const R=b.radius+1, by=b.pos.y, yr=b.yRange||7, near=(m,r)=>m.tgt==='lantern'&&Math.hypot(m.p.x-b.pos.x,m.p.z-b.pos.z)<r&&Math.abs(m.p.y-by)<yr;
  if(!b.feeding){
    b.progress=Math.max(0,b.progress-dt*.01);
    let n=0; for(const m of ms) if(near(m,R))n++;
    b.near=n;
    if(n>=b.needs){
      b.feeding=true; b.stalled=false;
      for(const m of ms) if(near(m,R+2))toFeed(m,b);
      o.onFeed&&o.onFeed(b);
    }
    return 0;
  }
  for(const m of ms) if(near(m,R))toFeed(m,b);     // more moths arriving join in
  let n=0; for(const m of ms) if(m.tgt==='feed'&&m.feedB===b&&!m._rel)n++;
  b.near=n;
  const stalled=n<(b.stallBelow!=null?b.stallBelow:STALL_BELOW);
  if(stalled&&!b.stalled)o.onStall&&o.onStall(b,n);
  b.stalled=stalled;
  if(!stalled)b.progress=Math.min(1,b.progress+dt/(b.feedTime||FEED_TIME));
  if(n===0){ b.feeding=false; b.stalled=false; o.onStop&&o.onStop(b); }
  if(b.progress>=1)o.onDone&&o.onDone(b);
  return n;
}
/** lift the fed moths off a finished site (they rejoin the lantern or go home) */
function liftOff(b){ for(const m of mothList()) if(m.tgt==='feed'&&m.feedB===b){ m._rel=G.time+1.5+rnd()*2.5; if(m.feedC)m.feedC.y+=1.2+rnd()*1.5; } }
function siteDone(s){ if(s.cured)return; s.cured=true; s.feeding=false; s.stalled=false; s.progress=1; liftOff(s); try{s.onDone&&s.onDone(s);}catch(e){console.error(e);} }
function updateSites(dt,ms){
  let n=0;
  for(const s of sites){ if(s.cured||s.enabled&&!s.enabled())continue;
    n+=feedTick(s,dt,ms,{onFeed:x=>x.onFeed&&x.onFeed(x),onStall:(x,k)=>x.onStall&&x.onStall(x,k),onStop:x=>x.onStop&&x.onStop(x),onDone:x=>siteDone(x)}); }
  return n;
}

/* ---- blights: sighting, feeding, attackers, cure ---- */
let questPrev=null;
function sight(b){
  S.seen[b.id]=true; const d=def(b.id);
  G.ui.say(d.seeLine);
  G.emit('blight:seen',{id:b.id,name:b.name,pos:b.pos.clone()});
  const sub=S.noticed||S.baitedOnce?'Bring the swarm — '+b.needs+' moths on a baited lantern':'The moths would know what to do with this.';
  try{
    const $=id=>document.getElementById(id);
    if(!questPrev||!String(G.quest.step).startsWith('blight:'))questPrev={step:G.quest.step,obj:$('obj')?$('obj').textContent:'',sub:$('objSub')?$('objSub').textContent:'',target:G.quest.target,name:G.quest.targetName};
    G.quest.set('blight:'+b.id,b.name,sub,b.pos.clone().add(V(0,1,0)),b.name);
    const step='blight:'+b.id;
    setTimeout(()=>{ if(G.quest.step===step&&questPrev){ const q=questPrev; questPrev=null; G.quest.set(q.step,q.obj,q.sub,q.target,q.name); } },22000);
  }catch(e){console.error(e);}
}
function spawnAttacker(b){
  if(!(G.monsters&&G.monsters.spawn))return;
  if(G.monsters.alive&&G.monsters.alive()>14)return;
  const P=G.player, base=P&&P.pos?Math.atan2(b.pos.z-P.pos.z,b.pos.x-P.pos.x):rnd()*TAU;
  for(let k=0;k<20;k++){
    const a=base+(rnd()-.5)*(k<10?2.4:TAU), r=22+rnd()*8, x=b.pos.x+Math.cos(a)*r, z=b.pos.z+Math.sin(a)*r;
    if(G.world.walkable&&!G.world.walkable(x,z))continue; if(H(x,z)<.9)continue;
    if(G.fog&&G.fog.inside&&k<12&&G.fog.inside(V(x,H(x,z),z))&&rnd()<.6)continue; // prefer coming out of the fog
    const kind=b.id==='well'?'hollow':rnd()<.5?'hound':'hollow';
    try{ G.monsters.spawn(kind,{x,z},{aggro:true,intro:true,zone:{name:'blight-'+b.id,x:b.pos.x,z:b.pos.z,r:36}}); G.emit('blight:attacker',{id:b.id,kind}); }catch(e){console.error(e);}
    return;
  }
}
function updateBlights(dt){
  const ms=mothList(), P=G.player, play=isPlay();
  let feedN=0;
  for(const b of blights){
    const p=P_[b.id]; if(!p)continue;
    const dP=P&&P.pos?Math.hypot(P.pos.x-b.pos.x,P.pos.z-b.pos.z):1e9;
    // presence: emitters, hum, near/far events, first sighting
    const vis=b.cured?0:1-U.smooth(120,170,dP);
    for(const e of p.ems)if(e!==p.springEm&&e!==undefined)e.intensity=vis*(p.boil>=0?Math.max(0,1-p.boil/2.5):1)*(b.feeding?.7:1);
    b.hum=b.cured?0:1-U.smooth(6,60,dP);
    const near=dP<40&&!b.cured; if(near!==p.near){p.near=near; G.emit(near?'blight:near':'blight:far',{id:b.id});}
    if(play&&!S.seen[b.id]&&!b.cured&&dP<30)sight(b);
    // heart breathing (faster while feeding / boiling)
    if(p.heart&&p.heart.visible){ const bs=p.heart.userData.base, sp=b.feeding?3.2:1.05, br=1+.07*Math.sin(G.time*sp+b.pos.x)+(b.feeding?.04*Math.sin(G.time*13):0), sh=1-.45*b.progress;
      p.heart.scale.set(bs.x*br*sh,bs.y*(2-br)*sh,bs.z*br*sh); }
    if(p.mat.uniforms&&p.mat.uniforms.uFlash)p.mat.uniforms.uFlash.value=Math.max(0,p.flash-=dt*2)*.6;
    if(p.boil>=0){ // the corruption boils away, the place transforms
      p.boil+=dt; const k=Math.min(1,p.boil/3.2); setCuredLook(b,k);
      if(p.boil<2.6&&rnd()<dt*9&&G.ink&&G.ink.burst){ const a=p.anchors[(rnd()*p.anchors.length)|0]||b.pos; G.ink.burst(a,{n:10,speed:2.2,size:[.5,1.6],up:2.2,embers:6}); }
      if(k>=1)p.boil=-1;
    }
    if(b.cured)continue;
    if(p.pool){ const u=p.pool.material.uniforms; u.uProg.value=b.progress; u.uFeed.value=U.damp(u.uFeed.value,(b.feeding||b.progress>.01)?1:0,4,dt); }
    if(!play)continue;
    const was=b.feeding;
    feedN+=feedTick(b,dt,ms,{
      onFeed(){ p.spawnPlan=2+((rnd()*3)|0); p.spawnT=1.8; p.flash=1;
        G.emit('blight:feed',{id:b.id});
        if(!S.fedOnce){S.fedOnce=true; G.ui.say('The moths pour down onto the black and begin to eat. Something out in the fog has noticed. Keep them alive.');}
        else G.ui.toast(b.name,'The moths descend — keep them alive'); },
      onStall(x,n){ G.emit('blight:stall',{id:b.id,n}); },
      onStop(){ G.emit('blight:feedStop',{id:b.id}); },
      onDone(){ cure(b,false); }});
    if(was&&b.feeding){ p.spawnT-=dt; if(p.spawnPlan>0&&p.spawnT<=0){ p.spawnPlan--; p.spawnT=2.2+rnd()*1.8; spawnAttacker(b); } }
  }
  feedN+=updateSites(dt,ms);
  API.feeding=feedN;
  // fed moths rise off a cured blight and go home (or back to the baited lantern)
  for(const m of ms) if(m.tgt==='feed'&&m._rel&&G.time>=m._rel){ if(API.baited)toLantern(m); else release(m); }
  for(const m of ms) if(m.tgt==='feed'&&m.feedB&&!m.feedB.feeding&&!m.feedB.cured&&!m._rel){ if(API.baited)toLantern(m); else release(m); }
}
function reward(b,restored){
  const p=P_[b.id];
  if(b.id==='grove'){
    const spots=p.spots||[];
    if(G.alchemy&&typeof G.alchemy.addMushroomSpot==='function'){ for(const s of spots){ try{G.alchemy.addMushroomSpot(s.clone(),{restored:!!restored,source:'grove'});}catch(e){console.error(e);} } }
    G.emit('blight:reward',{id:b.id,kind:'mushrooms',spots:spots.map(s=>s.clone()),restored:!!restored});
  }else if(b.id==='tidepool'){
    G.emit('blight:reward',{id:b.id,kind:'pearls',pos:b.pos.clone(),restored:!!restored});
  }else{
    G.emit('blight:reward',{id:b.id,kind:'spring',pos:p.spring.clone(),restored:!!restored});
    if(!restored){ const s=p.spring; G.state.checkpoint.set(s.x+1.6,s.y,s.z+.6); G.state.checkpointYaw=-PI/2; G.state.checkpointName='the hamlet well'; }
  }
}
function cure(b,restored){
  if(b.cured)return; const p=P_[b.id];
  b.cured=true; b.feeding=false; b.stalled=false; b.progress=1; S.cured[b.id]=true;
  if(restored){ setCuredLook(b,1); p.boil=-1; }
  else{
    p.boil=0; p.flash=1;
    if(G.ink&&G.ink.burst){ const c=p.heart?p.heart.position:b.pos;
      G.ink.burst(c,{n:140,speed:6,size:[1,3.2],life:[1,2.4],up:3.5,embers:70,drops:16});
      G.ink.burst(c.clone().add(V(0,2,0)),{n:60,speed:3,size:[1.5,4],life:[1.6,3],up:4,embers:30}); }
    G.ui.shake&&G.ui.shake(.35);
    const d=def(b.id);
    G.ui.toast(b.name.replace(/^The /,'')+' · cured',d.toast);
    setTimeout(()=>G.ui.say(d.curedLine),1800);
    liftOff(b); // the fed moths lift off together, then go
  }
  if(p.pool)p.pool.material.uniforms.uFeed.value=0;
  G.emit('blight:cured',{id:b.id,name:b.name,pos:b.pos.clone(),restored:!!restored});
  reward(b,restored);
  if(!restored&&G.quest&&String(G.quest.step).startsWith('blight:')&&questPrev){ const q=questPrev; questPrev=null; G.quest.set(q.step,q.obj,q.sub,q.target,q.name); }
}

/* ---- the healing spring ---- */
let springT=0;
function updateSpring(dt){
  const b=blights.find(x=>x.id==='well'), p=b&&P_[b.id]; if(!p||!p.spring)return;
  if(p.springEm)p.springEm.intensity=b.cured?1:0;
  if(!b.cured||!isPlay())return;
  const P=G.player; if(!P||!P.pos||P.alive===false)return;
  const inside=Math.hypot(P.pos.x-p.spring.x,P.pos.z-p.spring.z)<SPRING_R&&Math.abs(P.pos.y-p.spring.y)<1.5;
  if(!inside){springT=0;return;}
  if(P.hp>=P.maxHp){springT=0;return;}
  springT+=dt; if(springT>=SPRING_EVERY){ springT-=SPRING_EVERY; P.heal(2); G.emit('spring:heal',{hp:P.hp});
    if(G.ink&&G.ink.burst)G.ink.burst(V(P.pos.x,P.pos.y+.8,P.pos.z),{n:0,embers:10,speed:1}); }
}

/* ---------------------------------------------------------------- the moth jar (cave reward; works everywhere) */
const JAR_CAP=60, JAR_FREE=60, JAR_R=7;
let jarObj=null, jarGlow=null, jarNear=0, jarCount=0, jarSaid={};
const _jw=V();
function jarWorld(){ if(jarObj&&jarObj.parent){ jarObj.updateMatrixWorld(true); return jarObj.getWorldPosition(_jw).add(V(0,.04,0)); } return null; }
function buildJar(){
  const P=G.player; if(jarObj||!P||!P.model)return;
  const g=new THREE.Group(); g.name='mothJar';
  const glass=new THREE.Mesh(new THREE.CylinderGeometry(.075,.07,.17,14,1,true),G.toon('#cfe6e2',{transparent:true,opacity:.42,side:THREE.DoubleSide,emissive:'#b8d8d4',emissiveIntensity:.15}));
  const base=new THREE.Mesh(new THREE.CylinderGeometry(.07,.066,.012,14),G.toon('#a9c3bf',{transparent:true,opacity:.6}));
  base.position.y=-.085;
  const neck=new THREE.Mesh(new THREE.CylinderGeometry(.05,.075,.03,14),G.toon('#cfe6e2',{transparent:true,opacity:.45})); neck.position.y=.1;
  const cork=new THREE.Mesh(new THREE.CylinderGeometry(.046,.04,.045,10),G.toon('#8a6a46')); cork.position.y=.13;
  const strap=new THREE.Mesh(new THREE.TorusGeometry(.078,.009,5,16),G.toon('#5c4532')); strap.rotation.x=PI/2; strap.position.y=.06;
  jarGlow=glowSprite('#fff0c8',.32,0); jarGlow.position.y=-.01;
  g.add(glass,base,neck,cork,strap,jarGlow);
  g.position.set(.26,.92,.04); g.rotation.z=-.18;          // left hip (model faces +z)
  P.model.add(g); jarObj=g; g.visible=JAR.owned;
}
function jarMoths(){ const o=[]; for(const m of mothList()) if(m.tgt==='jar')o.push(m); return o; }
function nearSwarm(r){ const P=G.player; if(!P||!P.pos)return []; const o=[];
  for(const m of mothList()) if((m.tgt==='lantern'||m.tgt==='hunt'||m.tgt==='satchel')&&m.p.distanceToSquared(P.pos)<r*r)o.push(m); return o; }
const JAR={capacity:JAR_CAP, owned:false,
  get count(){ return jarCount; },
  get freedLeft(){ return S.jarLeft; },
  give(o={}){
    if(JAR.owned)return false; JAR.owned=true; buildJar(); if(jarObj)jarObj.visible=true;
    if(!o.silent){ G.ui.toast('The moth jar','Capture a swarm · carry it anywhere · release it');
      setTimeout(()=>G.ui.say('A keeper’s jar, the glass gone milky with salt. Moths settle in it as if it were a lantern that never goes out.'),900); }
    G.emit('cave:jar',{action:'give',count:jarCount}); return true; },
  capture(){
    if(!JAR.owned)return 0;
    const room=JAR_CAP-jarCount; if(room<=0)return 0;
    const list=nearSwarm(JAR_R).slice(0,room);
    for(const m of list){ m.tgt='jar'; m.inJar=false; m.prey=null; m.feedB=null; m._rel=0; m.next=null; m.delay=0; }
    jarCount+=list.length;
    if(list.length){ G.emit('cave:jar',{action:'capture',count:jarCount,n:list.length});
      if(!jarSaid.c){ jarSaid.c=1; G.ui.say('The swarm pours into the jar and settles, wings folded, glowing faintly against the glass. They don’t need the bait to stay.'); }
      else G.ui.toast('Moths captured',jarCount+' in the jar'); }
    return list.length; },
  release(){
    const list=jarMoths(); if(!list.length)return 0;
    const from=jarWorld()||(CR()&&CR().satchelPos())||(G.player&&G.player.pos);
    for(const m of list){ toLantern(m); m.inJar=false; m.p.copy(from).add(V((rnd()-.5)*.2,(rnd()-.2)*.2,(rnd()-.5)*.2));
      m.v.set((rnd()-.5)*5,1.5+rnd()*2.5,(rnd()-.5)*5); }
    jarCount=0; S.jarLeft=JAR_FREE;
    G.emit('cave:jar',{action:'release',count:0,n:list.length});
    if(!jarSaid.r){ jarSaid.r=1; G.ui.say('You pull the cork. The moths spill out in a pale rush and wheel round you, hungry, looking for the dark.'); }
    else G.ui.toast('Moths released',list.length+' · they follow you for a minute');
    return list.length; },
  _save(){ return {owned:JAR.owned,count:jarCount,left:+S.jarLeft.toFixed(1),said:jarSaid}; },
  _load(d){
    if(!d)return;
    if(d.owned&&!JAR.owned)JAR.give({silent:true});
    for(const m of jarMoths())toLantern(m);
    jarCount=0; const want=Math.min(JAR_CAP,Math.max(0,d.count|0));
    for(const m of mothList()){ if(jarCount>=want)break; if(m.tgt==='patch'||m.tgt==='wander'||m.tgt==='roost'){ m.tgt='jar'; m.inJar=true; jarCount++; } }
    S.jarLeft=Math.max(0,Math.min(JAR_FREE,+d.left||0)); jarSaid=Object.assign({},d.said||{});
  }
};
let jarInteract=null;
function updateJar(dt){
  if(!JAR.owned)return;
  if(!jarObj)buildJar();
  jarCount=0; for(const m of mothList()) if(m.tgt==='jar')jarCount++;
  jarNear=nearSwarm(JAR_R).length;
  if(jarObj){ jarObj.visible=true; const k=jarCount/JAR_CAP;
    jarGlow.material.opacity=k>0?.25+.6*k+.08*Math.sin(G.time*3.1):0; jarGlow.scale.setScalar(.22+.25*k); }
  if(!jarInteract&&G.interact){
    jarInteract=G.interact.add({pos:()=>G.player&&G.player.pos,radius:1,priority:-3,
      label:()=>jarNear>=3&&jarCount<JAR_CAP?'Capture moths · '+Math.min(jarNear,JAR_CAP-jarCount)+' into the jar':'Release moths · '+jarCount,
      enabled:()=>JAR.owned&&isPlay()&&G.player&&G.player.alive!==false&&((jarNear>=3&&jarCount<JAR_CAP)||jarCount>0),
      use(){ if(jarNear>=3&&jarCount<JAR_CAP)JAR.capture(); else JAR.release(); }});
  }
}
let lostKill=0, lostKillPos=V();
function killOne(m,dust){ if(!m||m.tgt==='gone')return false; lostKillPos.copy(m.p); kill(m,dust); S.lost++; lostKill++; return true; }

/* ---------------------------------------------------------------- API */
const API=G.moths={swarm:0,feeding:0,bait,
  get baited(){return S.baitLeft>0||S.jarLeft>0;},
  addSite(s){ s.progress=s.progress||0; s.feeding=false; s.stalled=false; s.cured=!!s.cured; s.near=0; if(sites.indexOf(s)<0)sites.push(s); return s; },
  sites, kill:(m,dust=true)=>killOne(m,dust), toLantern:m=>toLantern(m), release:m=>release(m),
  jar:JAR, jarPos:()=>jarWorld(), get baitLeft(){return S.baitLeft;}, get lost(){return S.lost;},
  get noticed(){return S.noticed;}, get active(){return started;},
  blight:id=>blights.find(b=>b.id===id)||null};
if(G.debug)API._debug={S,P_,save:()=>save(),load:d=>load(d),cure:id=>{const b=API.blight(id); if(b)cure(b,false);},
  tp:id=>{const b=API.blight(id); if(b&&G.player)G.player.teleport(b.pos.x-b.radius-3,null,b.pos.z,PI/2);}};

/* ---------------------------------------------------------------- save / load */
function save(){ return {v:1,noticed:S.noticed,baitLeft:+S.baitLeft.toFixed(1),lost:goneCount(),seen:Object.keys(S.seen),cured:blights.filter(b=>b.cured).map(b=>b.id),
  baitedOnce:S.baitedOnce,fedOnce:S.fedOnce,progress:Object.fromEntries(blights.map(b=>[b.id,+b.progress.toFixed(3)]))}; }
function load(d){
  if(!d)return;
  if(!started)start();
  S.noticed=!!d.noticed; S.baitLeft=Math.max(0,Math.min(BAIT_MAX,+d.baitLeft||0)); S.baitedOnce=!!d.baitedOnce||S.baitLeft>0; S.fedOnce=!!d.fedOnce;
  S.seen={}; for(const id of d.seen||[])S.seen[id]=true;
  for(const id of d.cured||[]){ const b=API.blight(id); if(b&&!b.cured)cure(b,true); }
  for(const b of blights) if(!b.cured)b.progress=Math.max(0,Math.min(.95,(d.progress&&+d.progress[b.id])||0));
  // moths lost to monsters stay lost (until they regrow)
  const want=Math.max(0,d.lost|0); let have=goneCount();
  const ms=mothList();
  for(const m of ms){ if(have>=want)break; if(m.tgt==='patch'||m.tgt==='wander'){kill(m,false);have++;} }
  for(const m of ms){ if(have<=want)break; if(m.tgt==='gone'){revive(m);have--;} }
  S.lost=want;
}
if(G.persist&&G.persist.register)G.persist.register('moths',{save,load});
else G.on('ready',()=>{ if(G.persist&&G.persist.register)G.persist.register('moths',{save,load}); });

/* ---------------------------------------------------------------- lifecycle */
function start(){ if(started)return; started=true; showAll(); }
G.on('loop:start',()=>start());

G.system('moths',{order:32,modes:'always',
  init(){
    try{buildAll();}catch(e){console.error('moths build',e);}
    try{buildHud();}catch(e){console.error('moths hud',e);}
    if(G.loop&&G.loop.active)start();
  },
  update(dt){
    if(!started){ return; }
    if(G.state.mode==='paused'){ updateHud(0); return; }
    try{
      if(isPlay()){ updateSatchel(dt); updateThreats(dt); updateRegrow(dt); }
      updateBait(dt);
      updateBlights(dt);
      updateSpring(dt);
      updateJar(dt);
      if(lostKill>0){ G.emit('moths:lost',{n:lostKill,pos:lostKillPos.clone()}); lostKill=0; }
      let n=0; for(const m of mothList()) if(m.tgt==='lantern')n++; API.swarm=n;
      updateHud(dt);
    }catch(e){ console.error('moths',e); }
  }
});
})();
