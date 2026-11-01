/* =====================================================================
   ink.js — the look of corruption: misty, inky, amorphous.
   1. Upgrades G.negMaterial (same API) to a living ink surface:
      churning noise displacement, inner violet swirls, wispy translucent
      silhouette, violet rim, dissolve + hit flash.
   2. G.ink particle system: smoke that curls off bodies, ink drips,
      violet embers, bursts, and ground pools.
   Loaded right after core.js; every other module can use it in init().
   ===================================================================== */
(function(){
'use strict';
const G=window.G, THREE=G.THREE, U=G.U;

/* ---------- 3D simplex noise (Ashima / Ian McEwan, MIT) ---------- */
const SNOISE=`
vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;}
vec4 mod289(vec4 x){return x-floor(x*(1./289.))*289.;}
vec4 permute(vec4 x){return mod289(((x*34.)+1.)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1./6.,1./3.); const vec4 D=vec4(0.,.5,1.,2.);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));
  float n_=.142857142857; vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.+1.; vec4 s1=floor(b1)*2.+1.; vec4 sh=-step(h,vec4(0.));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.); m=m*m;
  return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}`;
G.SNOISE=SNOISE;

/* ---------- living ink surface ---------- */
const INK_VS=`uniform float uTime;uniform float uAmp;uniform float uFlow;uniform float uScale;
varying vec3 vN;varying vec3 vV;varying vec3 vW;
#include <fog_pars_vertex>
${SNOISE}
void main(){
  vec4 wp=modelMatrix*vec4(position,1.);
  vec3 wn=normalize(mat3(modelMatrix)*normal);
  vec3 q=wp.xyz*uScale+vec3(0.,-uTime*uFlow,0.);
  float n=snoise(q)*.65+snoise(q*2.3+7.1)*.35;
  wp.xyz+=wn*uAmp*n;
  vec4 mvPosition=viewMatrix*wp;
  vN=normalize(mat3(viewMatrix)*wn); vV=normalize(-mvPosition.xyz); vW=wp.xyz;
  gl_Position=projectionMatrix*mvPosition;
  #include <fog_vertex>
}`;
const INK_FS=`uniform float uTime;uniform float uFade;uniform float uFlash;uniform float uWisp;uniform float uFlow;uniform float uScale;
uniform vec3 uRim;uniform vec3 uInk;
varying vec3 vN;varying vec3 vV;varying vec3 vW;
#include <fog_pars_fragment>
${SNOISE}
void main(){
  vec3 q=vW*uScale*1.4+vec3(0.,-uTime*uFlow*1.3,0.);
  float n=snoise(q)*.5+.5;
  float n2=snoise(q*2.7+vec3(3.1,0.,1.7)+vec3(0.,uTime*.2,0.))*.5+.5;
  float dn=n*.6+n2*.4;
  if(dn>uFade*1.08+.02)discard;
  float f=1.-abs(dot(normalize(vN),normalize(vV)));
  vec3 col=uInk*(.15+.85*pow(n2,3.));
  col+=uRim*pow(f,3.4)*(.35+.9*n);
  col+=uRim*(uFade<.98?smoothstep(uFade-.22,uFade,dn)*2.2:0.);
  col+=vec3(uFlash)*(.5+f);
  float a=1.-smoothstep(.42,1.02,f+(n-.5)*.7)*uWisp;
  gl_FragColor=vec4(col,clamp(a,0.,1.));
  #include <fog_fragment>
}`;
/**
 * G.negMaterial(opts) — same API as before (uniforms.uFade, uniforms.uFlash) plus:
 *  rim:'#hex' strength, ink:'#hex' (inner swirl colour), amp (m of surface churn, default .05),
 *  wisp (0..1 how much the silhouette mists away, default .85), flow (upward drift speed, default .35),
 *  scale (noise frequency per metre, default 1.6). Set opaque:true for big solid things (e.g. the lamp blob).
 */
G.negMaterial=(o={})=>{
  const rim=U.col(o.rim||'#a37cff').multiplyScalar(o.strength==null?2.4:o.strength);
  const ink=U.col(o.ink||'#24103a').multiplyScalar(o.inkStrength==null?.8:o.inkStrength);
  const u=THREE.UniformsUtils.merge([THREE.UniformsLib.fog,{
    uFade:{value:1},uRim:{value:rim},uInk:{value:ink},uFlash:{value:0},
    uAmp:{value:o.amp==null?.05:o.amp},uWisp:{value:o.wisp==null?.85:o.wisp},uFlow:{value:o.flow==null?.35:o.flow},uScale:{value:o.scale==null?1.6:o.scale}}]);
  u.uTime=G.negTime;
  const m=new THREE.ShaderMaterial({uniforms:u,fog:true,vertexShader:INK_VS,fragmentShader:INK_FS,transparent:!o.opaque,depthWrite:true});
  m.extensions={derivatives:false};
  return m;
};

/* ---------- particles ---------- */
const smokeTex=G.canvasTex(128,(g,s)=>{
  // a cloudy puff: several soft lobes, then eaten away at the edges so it reads as smoke, not a ball
  const c=s/2;
  for(let k=0;k<9;k++){ const a=Math.random()*Math.PI*2, d=k===0?0:c*(.15+Math.random()*.32), x=c+Math.cos(a)*d, y=c+Math.sin(a)*d, r=c*(k===0?.6:.28+Math.random()*.3);
    const gr=g.createRadialGradient(x,y,0,x,y,r); gr.addColorStop(0,'rgba(255,255,255,.55)'); gr.addColorStop(.6,'rgba(255,255,255,.22)'); gr.addColorStop(1,'rgba(255,255,255,0)');
    g.fillStyle=gr; g.fillRect(0,0,s,s); }
  g.globalCompositeOperation='destination-out';
  for(let i=0;i<110;i++){ const a=Math.random()*Math.PI*2, r=c*(.25+Math.random()*.75); g.fillStyle=`rgba(0,0,0,${.08+Math.random()*.3})`; g.beginPath(); g.arc(c+Math.cos(a)*r,c+Math.sin(a)*r,3+Math.random()*11,0,Math.PI*2); g.fill(); }
},false);
const PT_VS=`attribute float aSize;attribute float aAlpha;attribute vec3 aColor;attribute float aRot;
uniform float uScale;varying float vA;varying vec3 vC;varying float vR;
#include <fog_pars_vertex>
void main(){ vec4 mvPosition=modelViewMatrix*vec4(position,1.); gl_Position=projectionMatrix*mvPosition;
  gl_PointSize=aSize*uScale/max(.1,-mvPosition.z); vA=aAlpha; vC=aColor; vR=aRot;
  #include <fog_vertex>
}`;
const PT_FS=`uniform sampler2D uTex;varying float vA;varying vec3 vC;varying float vR;
#include <fog_pars_fragment>
void main(){ vec2 p=gl_PointCoord-.5; float cs=cos(vR),sn=sin(vR); p=vec2(cs*p.x-sn*p.y,sn*p.x+cs*p.y)+.5;
  float a=texture2D(uTex,p).a*vA; if(a<.01)discard; gl_FragColor=vec4(vC,a);
  #include <fog_fragment>
}`;
function makePool(N,additive){
  const geo=new THREE.BufferGeometry();
  const pos=new Float32Array(N*3), size=new Float32Array(N), alpha=new Float32Array(N), color=new Float32Array(N*3), rot=new Float32Array(N);
  geo.setAttribute('position',new THREE.BufferAttribute(pos,3)); geo.setAttribute('aSize',new THREE.BufferAttribute(size,1));
  geo.setAttribute('aAlpha',new THREE.BufferAttribute(alpha,1)); geo.setAttribute('aColor',new THREE.BufferAttribute(color,3)); geo.setAttribute('aRot',new THREE.BufferAttribute(rot,1));
  const u=THREE.UniformsUtils.merge([THREE.UniformsLib.fog,{uScale:{value:600},uTex:{value:null}}]); u.uTex.value=additive?G.tex.flame:smokeTex;
  const mat=new THREE.ShaderMaterial({uniforms:u,vertexShader:PT_VS,fragmentShader:PT_FS,transparent:true,depthWrite:false,fog:true,
    blending:additive?THREE.AdditiveBlending:THREE.NormalBlending});
  const pts=new THREE.Points(geo,mat); pts.frustumCulled=false; pts.renderOrder=additive?3:2;
  const P={N,geo,mat,pts,pos,size,alpha,color,rot,
    vel:new Float32Array(N*3),life:new Float32Array(N),max:new Float32Array(N),s0:new Float32Array(N),s1:new Float32Array(N),a0:new Float32Array(N),
    grav:new Float32Array(N),spin:new Float32Array(N),drag:new Float32Array(N),next:0,live:0};
  return P;
}
const smoke=makePool(4200,false), embers=makePool(900,true);
const _c=new THREE.Color();
function spawn(P,x,y,z,vx,vy,vz,life,s0,s1,a0,colHex,grav,drag){
  const i=P.next; P.next=(P.next+1)%P.N;
  P.pos[i*3]=x;P.pos[i*3+1]=y;P.pos[i*3+2]=z; P.vel[i*3]=vx;P.vel[i*3+1]=vy;P.vel[i*3+2]=vz;
  P.life[i]=life;P.max[i]=life;P.s0[i]=s0;P.s1[i]=s1;P.a0[i]=a0;P.grav[i]=grav||0;P.drag[i]=drag==null?1.2:drag;
  P.rot[i]=Math.random()*6.28;P.spin[i]=(Math.random()-.5)*1.4;
  _c.copy(colHex); P.color[i*3]=_c.r;P.color[i*3+1]=_c.g;P.color[i*3+2]=_c.b;
}
function stepPool(P,dt,fadeIn){
  const {pos,vel,life,max,size,alpha,s0,s1,a0,grav,rot,spin,drag}=P;
  for(let i=0;i<P.N;i++){
    if(life[i]<=0){ if(alpha[i]!==0){alpha[i]=0;size[i]=0;} continue; }
    life[i]-=dt; const t=1-life[i]/max[i];
    const k=Math.exp(-drag[i]*dt);
    vel[i*3]*=k; vel[i*3+2]*=k; vel[i*3+1]=vel[i*3+1]*k-grav[i]*dt;
    pos[i*3]+=vel[i*3]*dt; pos[i*3+1]+=vel[i*3+1]*dt; pos[i*3+2]+=vel[i*3+2]*dt;
    if(grav[i]>0){ const f=G.floorAt(pos[i*3],pos[i*3+2],pos[i*3+1]+.5); if(pos[i*3+1]<f+.02){ life[i]=0; alpha[i]=0; size[i]=0; splat(pos[i*3],f,pos[i*3+2]); continue; } }
    rot[i]+=spin[i]*dt;
    size[i]=s0[i]+(s1[i]-s0[i])*t;
    alpha[i]=a0[i]*Math.min(1,t/fadeIn)*Math.pow(1-t,1.15);
    if(life[i]<=0){alpha[i]=0;size[i]=0;}
  }
  const g=P.geo.attributes; g.position.needsUpdate=g.aSize.needsUpdate=g.aAlpha.needsUpdate=g.aColor.needsUpdate=g.aRot.needsUpdate=true;
}
const INK_BLACK=U.col('#07050a'), INK_DEEP=U.col('#1a0d26'), VIOLET=U.col('#9a6bff');
let splatBudget=0;
function splat(x,y,z){ if(splatBudget<=0)return; splatBudget--; spawn(smoke,x,y+.05,z,0,.05,0,.9,.25,.6,.55,INK_BLACK,0,3); }

/* ---------- emitters ---------- */
const emitters=[];
const _w=new THREE.Vector3(), _prev=new THREE.Vector3();
/**
 * G.ink.emitter(target, opts) -> handle. target: Object3D (or array of Object3Ds = spawn anchors), or {pos:Vector3}.
 * opts: rate (smoke puffs/s, 14), radius (spawn spread m, .35), height (extra vertical spread, 0), size [start,end] ([.5,1.4]),
 *   life [min,max] ([1,2.2]), rise (m/s, .5), drift (random m/s, .25), trail (0..1 how much puffs lag behind motion, .6),
 *   alpha (.55), color ('#07050a'), drip (drops/s, 0), embers (violet motes/s, 0), intensity (0..1 multiplier, 1)
 * handle.intensity / handle.active can be changed any time; G.ink.remove(handle) when done.
 */
function emitter(target,o={}){
  const e=Object.assign({rate:14,radius:.35,height:0,size:[.5,1.4],life:[1,2.2],rise:.5,drift:.25,trail:.6,alpha:.75,color:'#0b0710',drip:0,embers:0,intensity:1,active:true},o);
  e.target=target; e.col=U.col(e.color); e.acc=0; e.dacc=0; e.eacc=0; e.last=null; e.vel=new THREE.Vector3();
  emitters.push(e); return e;
}
function anchorPos(e,out){
  let t=e.target;
  if(Array.isArray(t)){ t=t[(Math.random()*t.length)|0]; }
  if(t&&t.isObject3D){ t.getWorldPosition(out); }
  else if(t&&t.pos){ out.copy(t.pos); }
  else if(t&&t.isVector3){ out.copy(t); }
  if(e.offset)out.add(e.offset);
  return out;
}
function stepEmitters(dt){
  for(const e of emitters){
    if(!e.active||e.intensity<=0)continue;
    // velocity of the main anchor for trailing
    const main=Array.isArray(e.target)?e.target[0]:e.target;
    if(main&&main.isObject3D)main.getWorldPosition(_w); else if(main&&main.pos)_w.copy(main.pos); else if(main&&main.isVector3)_w.copy(main);
    if(e.last){ e.vel.subVectors(_w,e.last).divideScalar(Math.max(dt,1e-3)); if(e.vel.lengthSq()>900)e.vel.set(0,0,0);} else e.last=new THREE.Vector3();
    e.last.copy(_w);
    const k=e.intensity, sp=e.vel.length();
    e.acc+=dt*e.rate*k*(1+Math.min(2,sp*.25));
    while(e.acc>=1){ e.acc-=1;
      anchorPos(e,_prev);
      const a=Math.random()*6.283, r=Math.sqrt(Math.random())*e.radius;
      const x=_prev.x+Math.cos(a)*r, y=_prev.y+(Math.random()-.3)*e.height, z=_prev.z+Math.sin(a)*r;
      const life=U.lerp(e.life[0],e.life[1],Math.random());
      spawn(smoke,x,y,z,
        -e.vel.x*e.trail*.35+(Math.random()-.5)*e.drift*2, e.rise*(.6+Math.random()*.8), -e.vel.z*e.trail*.35+(Math.random()-.5)*e.drift*2,
        life,e.size[0]*(.7+Math.random()*.6),e.size[1]*(.7+Math.random()*.6),e.alpha*k,e.col,0,1.1);
    }
    if(e.drip>0){ e.dacc+=dt*e.drip*k; while(e.dacc>=1){ e.dacc-=1; anchorPos(e,_prev);
      spawn(smoke,_prev.x+(Math.random()-.5)*e.radius,_prev.y,_prev.z+(Math.random()-.5)*e.radius,(Math.random()-.5)*.3,-.3,(Math.random()-.5)*.3,1.6,.16,.1,.95,INK_BLACK,9,.2); } }
    if(e.embers>0){ e.eacc+=dt*e.embers*k; while(e.eacc>=1){ e.eacc-=1; anchorPos(e,_prev);
      spawn(embers,_prev.x+(Math.random()-.5)*e.radius*2,_prev.y+(Math.random()-.5)*e.radius,_prev.z+(Math.random()-.5)*e.radius*2,(Math.random()-.5)*.4,.4+Math.random()*.6,(Math.random()-.5)*.4,1+Math.random()*1.2,.14,.04,.9,VIOLET,0,.6); } }
  }
}
/** a burst of ink: hits, deaths, splashes. opts: n (40), speed (3), size [.4,1.6], life [.6,1.6], up (1), embers (n/3), drops (0) */
function burst(pos,o={}){
  const n=o.n||40, sp=o.speed||3, up=o.up==null?1:o.up, col=o.color?U.col(o.color):INK_BLACK;
  for(let i=0;i<n;i++){ const a=Math.random()*6.283, el=(Math.random()-.2)*1.2, s=sp*(.3+Math.random()*.7);
    spawn(smoke,pos.x,pos.y,pos.z,Math.cos(a)*Math.cos(el)*s,Math.sin(el)*s*.6+up,Math.sin(a)*Math.cos(el)*s,
      U.lerp((o.life||[.6,1.6])[0],(o.life||[.6,1.6])[1],Math.random()),(o.size||[.4,1.6])[0],(o.size||[.4,1.6])[1]*(.7+Math.random()*.6),o.alpha||.75,col,0,2.2); }
  const ne=o.embers==null?Math.round(n/3):o.embers;
  for(let i=0;i<ne;i++){ const a=Math.random()*6.283, s=sp*(.4+Math.random());
    spawn(embers,pos.x,pos.y,pos.z,Math.cos(a)*s,Math.random()*sp+.5,Math.sin(a)*s,.6+Math.random()*1,.18,.04,1,VIOLET,1.5,1.5); }
  for(let i=0;i<(o.drops||0);i++){ const a=Math.random()*6.283, s=sp*(.3+Math.random()*.8);
    spawn(smoke,pos.x,pos.y,pos.z,Math.cos(a)*s,1+Math.random()*2.5,Math.sin(a)*s,2,.2,.14,1,INK_BLACK,12,.3); }
  splatBudget=Math.min(splatBudget+(o.drops||0),60);
}

/* ---------- ground pools: a soft breathing ink stain under a creature ---------- */
const POOL_FS=`uniform float uTime;uniform float uAlpha;uniform vec3 uRim;varying vec2 vUv;varying vec3 vW;
#include <fog_pars_fragment>
${SNOISE}
void main(){ vec2 p=vUv*2.-1.; float r=length(p);
  float n=snoise(vec3(vW.x*.9,vW.z*.9,uTime*.25))*.5+.5;
  float edge=.62+.32*n;
  float a=(1.-smoothstep(edge-.35,edge,r))*uAlpha;
  if(a<.01)discard;
  vec3 c=vec3(.012,.008,.02)+uRim*smoothstep(edge-.16,edge-.02,r)*(1.-smoothstep(edge-.02,edge,r))*.6;
  gl_FragColor=vec4(c,a*.85);
  #include <fog_fragment>
}`;
const POOL_VS=`varying vec2 vUv;varying vec3 vW;
#include <fog_pars_vertex>
void main(){vUv=uv;vec4 wp=modelMatrix*vec4(position,1.);vW=wp.xyz;vec4 mvPosition=viewMatrix*wp;gl_Position=projectionMatrix*mvPosition;
#include <fog_vertex>
}`;
const pools=[];
const poolGeo=new THREE.PlaneGeometry(1,1).rotateX(-Math.PI/2);
/** G.ink.pool(target, {radius, alpha, rim}) -> handle {mesh, intensity, active} ; follows the target on the ground */
function pool(target,o={}){
  const u=THREE.UniformsUtils.merge([THREE.UniformsLib.fog,{uAlpha:{value:o.alpha||.8},uRim:{value:U.col(o.rim||'#6a3fc0')}}]); u.uTime=G.negTime;
  const m=new THREE.ShaderMaterial({uniforms:u,vertexShader:POOL_VS,fragmentShader:POOL_FS,transparent:true,depthWrite:false,fog:true,
    polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
  const mesh=new THREE.Mesh(poolGeo,m); const r=o.radius||1; mesh.scale.set(r*2,1,r*2); mesh.renderOrder=1; G.scene.add(mesh);
  const h={target,mesh,intensity:1,active:true,baseAlpha:o.alpha||.8}; pools.push(h); return h;
}
function stepPools(){
  for(const h of pools){
    const t=h.target; if(t&&t.isObject3D)t.getWorldPosition(_w); else if(t&&t.pos)_w.copy(t.pos); else if(t&&t.isVector3)_w.copy(t);
    h.mesh.visible=h.active&&h.intensity>.01;
    if(!h.mesh.visible)continue;
    h.mesh.position.set(_w.x,G.floorAt(_w.x,_w.z,_w.y+.5)+.05,_w.z);
    h.mesh.material.uniforms.uAlpha.value=h.baseAlpha*h.intensity;
  }
}
function remove(h){
  let i=emitters.indexOf(h); if(i>=0){emitters.splice(i,1);return;}
  i=pools.indexOf(h); if(i>=0){G.scene.remove(h.mesh);h.mesh.material.dispose();pools.splice(i,1);}
}

G.ink={emitter,burst,pool,remove,smoke,embers,get emitterCount(){return emitters.length;}};

const _sz=new THREE.Vector2();
G.system('ink',{order:46,modes:'always',
  init(){ G.scene.add(smoke.pts,embers.pts); },
  update(dt){
    G.renderer.getDrawingBufferSize(_sz);
    const sc=_sz.y*.5/Math.tan(G.camera.fov*Math.PI/360);
    smoke.mat.uniforms.uScale.value=sc; embers.mat.uniforms.uScale.value=sc;
    if(G.state.mode!=='paused'){ stepEmitters(dt); stepPool(smoke,dt,.15); stepPool(embers,dt,.05); }
    stepPools();
    splatBudget=Math.min(60,splatBudget+dt*8);
  }
});
})();
