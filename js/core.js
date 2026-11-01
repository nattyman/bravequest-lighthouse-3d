/* =====================================================================
   BRAVE QUEST: LIGHTHOUSE — core.js
   Shared engine. Every other module talks to the game through window.G.
   See CONTRACT.md for the full API. Do not rename anything here without
   updating the contract.
   ===================================================================== */
(function(){
'use strict';
const THREE=window.THREE;
const G=window.G={THREE};
const PI=Math.PI, TAU=PI*2;
G.PI=PI; G.TAU=TAU;
G.debug=/[?&]debug/.test(location.search);

/* ---------- utilities ---------- */
const U=G.U={
  clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),
  lerp:(a,b,t)=>a+(b-a)*t,
  smooth:(a,b,x)=>{const t=Math.min(1,Math.max(0,(x-a)/(b-a)));return t*t*(3-2*t);},
  damp:(a,b,k,dt)=>a+(b-a)*(1-Math.exp(-k*dt)),
  angDiff:(a,b)=>{let d=(a-b)%TAU; if(d>PI)d-=TAU; if(d<-PI)d+=TAU; return d;},
  dampAngle:(a,b,k,dt)=>a+U.angDiff(b,a)*(1-Math.exp(-k*dt)),
  dist2:(a,b)=>Math.hypot(a.x-b.x,a.z-b.z),
  hash:(x,z)=>{const s=Math.sin(x*127.1+z*311.7)*43758.5453;return s-Math.floor(s);},
  vnoise:(x,z)=>{const xi=Math.floor(x),zi=Math.floor(z),xf=x-xi,zf=z-zi;const u=xf*xf*(3-2*xf),v=zf*zf*(3-2*zf);
    const h=U.hash,a=h(xi,zi),b=h(xi+1,zi),c=h(xi,zi+1),d=h(xi+1,zi+1);return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v;},
  fbm:(x,z,oct=5)=>{let f=0,amp=.5,fr=1;for(let i=0;i<oct;i++){f+=amp*U.vnoise(x*fr,z*fr);fr*=2;amp*=.5;}return f;},
  rng:(seed=1)=>{let s=seed%2147483647; if(s<=0)s+=2147483646; return ()=>{s=(s*16807)%2147483647;return (s-1)/2147483646;};},
  col:hex=>new THREE.Color(hex).convertSRGBToLinear(),
};

/* ---------- palette (from the Gentle Gothic + Traveler style guides) ---------- */
G.PAL={
  fogIvory:'#e8e2d4', slateBlue:'#4d5a6a', pineBlack:'#18241f', stone:'#8b857b', amber:'#e3a13a',
  ether:'#9150ff', etherBright:'#c4a0ff', corruption:'#0a090c',
  deepViolet:'#4b3863', duskyPlum:'#6c3f5f', umber:'#6a4a2e', gold:'#c8a24c',
  skin:'#f0c9a8', hair:'#6b4128', leather:'#6e4a2c', boot:'#5a3c26', trouser:'#2f2a2c', tunic:'#5b4a3d',
  outline:'#1c1520'
};

/* ---------- renderer ---------- */
const canvas=document.getElementById('c');
const isMobile=matchMedia('(pointer:coarse)').matches;
G.isMobile=isMobile;
const renderer=new THREE.WebGLRenderer({canvas,antialias:!isMobile,powerPreference:'high-performance'});
let PR=Math.min(window.devicePixelRatio||1,isMobile?1.25:1.5);
renderer.setPixelRatio(PR);
renderer.outputEncoding=THREE.sRGBEncoding;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.1;
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
G.renderer=renderer;
const scene=G.scene=new THREE.Scene();
scene.fog=new THREE.FogExp2(new THREE.Color('#5a5a78'),0.012);
const camera=G.camera=new THREE.PerspectiveCamera(58,1,0.1,1200);
camera.position.set(0,40,60);

/* lights: world.js tunes colors/intensity; the sun follows G.focus so its shadow map stays local */
const hemi=new THREE.HemisphereLight(0xb7a9d8,0x2a2420,0.75);
const sun=new THREE.DirectionalLight(0xffd2b0,0.9);
sun.castShadow=true; sun.shadow.mapSize.set(isMobile?1024:2048,isMobile?1024:2048);
Object.assign(sun.shadow.camera,{left:-45,right:45,top:45,bottom:-45,near:1,far:260});
sun.shadow.bias=-0.0005; sun.shadow.normalBias=0.04;
scene.add(hemi,sun,sun.target);
G.lights={hemi,sun,sunDir:new THREE.Vector3(-0.55,0.62,0.35).normalize()};
G.focus=new THREE.Vector3(0,0,0);

/* post: bloom + gamma, with a plain fallback */
let composer=null, bloom=null;
try{
  if(THREE.EffectComposer&&THREE.RenderPass&&THREE.UnrealBloomPass&&THREE.ShaderPass&&THREE.GammaCorrectionShader){
    composer=new THREE.EffectComposer(renderer);
    composer.addPass(new THREE.RenderPass(scene,camera));
    bloom=new THREE.UnrealBloomPass(new THREE.Vector2(256,256),0.7,0.5,0.72);
    composer.addPass(bloom);
    composer.addPass(new THREE.ShaderPass(THREE.GammaCorrectionShader));
  }
}catch(e){composer=null;bloom=null;}
G.bloom=bloom;
function resize(){
  const w=window.innerWidth,h=window.innerHeight;
  renderer.setSize(w,h,false);
  if(composer){composer.setPixelRatio&&composer.setPixelRatio(PR);composer.setSize(w,h);}
  camera.aspect=w/h; camera.updateProjectionMatrix();
}
addEventListener('resize',resize); resize();
/* applied after the sun exists (below) */

/* ---------- quality presets (pause menu) ----------
   saver: 30 fps cap, 1x resolution, no shadows or bloom — cool and quiet laptops
   balanced: 60 fps, modest resolution, 1024 shadows, bloom      high: sharper, 2048 shadows */
const QUALITY={
  saver:{pr:1,shadows:false,map:1024,bloom:false,cap:30},
  balanced:{pr:isMobile?1.25:1.25,shadows:true,map:1024,bloom:true,cap:0},
  high:{pr:isMobile?1.75:1.75,shadows:true,map:2048,bloom:true,cap:0}
};
G.quality={level:'balanced',cap:0};
G.setQuality=(level)=>{
  const q=QUALITY[level]||QUALITY.balanced; G.quality.level=QUALITY[level]?level:'balanced'; G.quality.cap=q.cap;
  PR=Math.min(window.devicePixelRatio||1,q.pr); renderer.setPixelRatio(PR);
  sun.castShadow=q.shadows;
  if(sun.shadow.mapSize.x!==q.map){ sun.shadow.mapSize.set(q.map,q.map); if(sun.shadow.map){sun.shadow.map.dispose();sun.shadow.map=null;} }
  if(bloom)bloom.enabled=q.bloom;
  resize();
  try{localStorage.setItem('bq-quality',G.quality.level);}catch(_){}
  if(G.emit)G.emit('quality',{level:G.quality.level});
};
{ let ql='balanced'; try{ql=localStorage.getItem('bq-quality')||'balanced';}catch(_){} G.setQuality(ql); }

/* ---------- textures ---------- */
function canvasTex(size,draw,srgb=true){const c=document.createElement('canvas');c.width=c.height=size;draw(c.getContext('2d'),size);const t=new THREE.CanvasTexture(c);if(srgb)t.encoding=THREE.sRGBEncoding;t.anisotropy=4;return t;}
G.canvasTex=canvasTex;
G.tex={
  soft:canvasTex(128,(g,s)=>{const gr=g.createRadialGradient(s/2,s/2,0,s/2,s/2,s/2);gr.addColorStop(0,'rgba(255,255,255,.55)');gr.addColorStop(.5,'rgba(255,255,255,.2)');gr.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=gr;g.fillRect(0,0,s,s);}),
  flame:canvasTex(64,(g,s)=>{const gr=g.createRadialGradient(s/2,s/2,0,s/2,s/2,s/2);gr.addColorStop(0,'rgba(255,255,255,1)');gr.addColorStop(.25,'rgba(255,255,255,.7)');gr.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=gr;g.fillRect(0,0,s,s);}),
  moth:canvasTex(64,(g)=>{g.translate(32,32);g.fillStyle='#fff';
    for(const s of [-1,1]){g.beginPath();g.ellipse(s*12,-5,12,9,s*.5,0,TAU);g.fill();g.beginPath();g.ellipse(s*9,9,8,6,-s*.4,0,TAU);g.fill();}
    g.fillStyle='rgba(120,110,95,1)';g.beginPath();g.ellipse(0,1,3,12,0,0,TAU);g.fill();}),
};

/* ---------- soft cel shading ---------- */
const gradData=new Uint8Array([72,72,150,150,215,215,255,255]);
const gradTex=new THREE.DataTexture(gradData,8,1,THREE.LuminanceFormat);
gradTex.minFilter=gradTex.magFilter=THREE.NearestFilter; gradTex.generateMipmaps=false; gradTex.needsUpdate=true;
G.gradientMap=gradTex;
/** G.toon('#hex' | Color, {emissive:'#hex', emissiveIntensity, map, side, transparent, opacity, flatShading}) */
G.toon=(c,o={})=>{
  const m=new THREE.MeshToonMaterial({color:typeof c==='string'?U.col(c):c,gradientMap:gradTex});
  for(const k in o){ if(k==='emissive')m.emissive=typeof o[k]==='string'?U.col(o[k]):o[k]; else m[k]=o[k]; }
  return m;
};
/* inverted-hull outlines: G.outline(mesh,{thickness,color}) adds a child back-face shell */
const outlineCache={};
G.outlineMat=(thickness=.02,color=G.PAL.outline)=>{
  const key=thickness+color; if(outlineCache[key])return outlineCache[key];
  const m=new THREE.MeshBasicMaterial({color:U.col(color),side:THREE.BackSide});
  m.onBeforeCompile=sh=>{sh.vertexShader=sh.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n transformed+=normal*'+thickness.toFixed(4)+';');};
  m.customProgramCacheKey=()=>'ol'+key;
  return outlineCache[key]=m;
};
G.outline=(mesh,o={})=>{
  if(!mesh.geometry)return null;
  const s=new THREE.Mesh(mesh.geometry,G.outlineMat(o.thickness,o.color));
  s.name='outline'; s.castShadow=false; s.receiveShadow=false; s.raycast=()=>{};
  mesh.add(s); return s;
};
/* near-camera + line-of-sight dither fade (foliage, trunks, rocks): G.nearFade(material, near, far)
   Pixels closer than `far` to the camera, or sitting on the line between camera and player,
   dissolve with a stable dither so the third-person view stays clear (Breath-of-the-Wild style). */
G.occlusion={uP:{value:new THREE.Vector3(0,0,-5)}};
G.nearFade=(m,near=1.6,far=5)=>{
  const prev=m.onBeforeCompile;
  m.onBeforeCompile=(sh,r)=>{ if(prev)prev(sh,r);
    sh.uniforms.uOccP=G.occlusion.uP;
    sh.fragmentShader='uniform vec3 uOccP;\n'+sh.fragmentShader.replace('void main() {',`void main() {
      { vec3 V=-vViewPosition; float dC=length(V); float k=smoothstep(${near.toFixed(2)},${far.toFixed(2)},dC);
        float pp=dot(uOccP,uOccP); float t=pp>0.01?dot(V,uOccP)/pp:2.;
        if(t>0.0&&t<0.93){ float d=length(V-uOccP*t); k=min(k,smoothstep(0.7,1.6,d)); }
        vec2 q=floor(gl_FragCoord.xy); float n=fract(52.9829189*fract(dot(q,vec2(.06711056,.00583715))));
        if(n>k) discard; }`); };
  m.customProgramCacheKey=()=>'nf2'+near+far+(prev?prev.toString().length:0);
  m.needsUpdate=true; return m;
};
/* animated "negative" shader: black void, violet rim, dissolves as uniforms.uFade -> 0 */
G.negTime={value:0};
const NEG_VS=`uniform float uTime;varying vec3 vN;varying vec3 vV;varying vec3 vW;
#include <fog_pars_vertex>
void main(){vec4 wp=modelMatrix*vec4(position,1.);
  vec3 p=position+normal*sin(uTime*23.+wp.y*40.+wp.x*13.)*.012;
  vec4 mvPosition=modelViewMatrix*vec4(p,1.);
  vN=normalize(normalMatrix*normal);vV=normalize(-mvPosition.xyz);vW=wp.xyz;
  gl_Position=projectionMatrix*mvPosition;
  #include <fog_vertex>
}`;
const NEG_FS=`uniform float uTime;uniform float uFade;uniform vec3 uRim;uniform float uFlash;varying vec3 vN;varying vec3 vV;varying vec3 vW;
#include <fog_pars_fragment>
float h(vec3 p){return fract(sin(dot(p,vec3(12.9898,78.233,37.719)))*43758.5453);}
void main(){
  float n=h(floor(vW*24.)+floor(uTime*12.));
  if(n>uFade+.02)discard;
  float f=1.-abs(dot(normalize(vN),normalize(vV)));
  float rim=pow(f,3.2)*(.65+.7*n);
  float edge=uFade<.98?smoothstep(uFade-.25,uFade,n)*2.:0.;
  gl_FragColor=vec4(uRim*(rim+edge)+vec3(uFlash),1.);
  #include <fog_fragment>
}`;
/** G.negMaterial({rim:'#hex', strength}) -> ShaderMaterial; set .uniforms.uFade (1..0) and .uniforms.uFlash (0..1 hit flash) */
G.negMaterial=(o={})=>{
  const rim=U.col(o.rim||'#a37cff').multiplyScalar(o.strength||2.4);
  const u=THREE.UniformsUtils.merge([THREE.UniformsLib.fog,{uFade:{value:1},uRim:{value:rim},uFlash:{value:0}}]);
  u.uTime=G.negTime;
  return new THREE.ShaderMaterial({uniforms:u,fog:true,vertexShader:NEG_VS,fragmentShader:NEG_FS});
};

/* ---------- events ---------- */
const handlers={};
G.on=(name,fn)=>{(handlers[name]=handlers[name]||[]).push(fn);return ()=>{handlers[name]=handlers[name].filter(f=>f!==fn);};};
G.emit=(name,data)=>{(handlers[name]||[]).slice().forEach(fn=>{try{fn(data);}catch(e){console.error('event',name,e);}});};

/* ---------- game state ---------- */
G.state={mode:'title',flags:{},checkpoint:new THREE.Vector3(),checkpointName:'',difficulty:1};
G.setMode=m=>{const prev=G.state.mode; if(prev===m)return; G.state.mode=m; G.emit('mode',{mode:m,prev});};
G.flag=(k,v)=>{if(v===undefined)return !!G.state.flags[k]; const was=G.state.flags[k]; G.state.flags[k]=v; if(was!==v)G.emit('flag',{key:k,value:v});};
G.time=0; G.dt=0;

/* atmosphere knobs. world.js reads these each frame and applies fog/sky/light.
   dark: 0 outdoors .. 1 inside the unlit tower (lighthouse.js sets darkTarget)
   cured: 0..1 after the lamp is lit (lighthouse.js animates it) */
G.atmo={dark:0,darkTarget:0,cured:0};

/* items shared between modules (player.js renders the lantern wherever it is) */
G.items={
  lantern:{found:false,carried:false,shut:false,cured:false,inCradle:false,
    pos:new THREE.Vector3(),   // resting position (feet of lantern) when not carried
    world:new THREE.Vector3(), // flame position, updated every frame by player.js
    lit(){return !this.shut;}},
  staff:{owned:false,pos:new THREE.Vector3()}
};

/* ---------- input ---------- */
const BIND={
  forward:['KeyW','ArrowUp'], back:['KeyS','ArrowDown'], left:['KeyA','ArrowLeft'], right:['KeyD','ArrowRight'],
  jump:['Space'], sprint:['ShiftLeft','ShiftRight'], roll:['KeyC','ControlLeft','AltLeft'],
  attack:['KeyJ','mouse0'], lock:['KeyQ','Tab','mouse2'], interact:['KeyE'], shutter:['KeyF'], pause:['Escape','KeyP']
};
const held=new Set(), pressed=new Set(), released=new Set(), vheld=new Set(), vpressed=new Set();
let lookX=0, lookY=0, dragging=false;
const joy={on:false,id:null,ox:0,oy:0,x:0,y:0}, look={id:null,x:0,y:0};
const actionsOf=code=>Object.keys(BIND).filter(a=>BIND[a].includes(code));
function press(code){ if(!held.has(code)){held.add(code);actionsOf(code).forEach(a=>pressed.add(a));} }
function release(code){ if(held.has(code)){held.delete(code);actionsOf(code).forEach(a=>released.add(a));} }
addEventListener('keydown',e=>{ if(e.repeat)return; if(['Tab','Space','ArrowUp','ArrowDown'].includes(e.code))e.preventDefault(); press(e.code); });
addEventListener('keyup',e=>release(e.code));
addEventListener('blur',()=>{[...held].forEach(release);});
canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('mousedown',e=>{
  if(G.state.mode==='play'&&document.pointerLockElement!==canvas&&!isMobile){ G.input.lockPointer(); dragging=true; return; }
  press('mouse'+e.button);
});
addEventListener('mouseup',e=>{release('mouse'+e.button);dragging=false;});
addEventListener('mousemove',e=>{ if(document.pointerLockElement===canvas||dragging){lookX+=e.movementX;lookY+=e.movementY;} });
canvas.addEventListener('wheel',e=>{G.input.wheel+=Math.sign(e.deltaY);},{passive:true});
canvas.addEventListener('touchstart',e=>{for(const t of e.changedTouches){
  if(t.clientX<innerWidth*.42&&!joy.on){joy.on=true;joy.id=t.identifier;joy.ox=t.clientX;joy.oy=t.clientY;joy.x=joy.y=0;}
  else if(look.id===null){look.id=t.identifier;look.x=t.clientX;look.y=t.clientY;}}e.preventDefault();},{passive:false});
canvas.addEventListener('touchmove',e=>{for(const t of e.changedTouches){
  if(t.identifier===joy.id){joy.x=U.clamp((t.clientX-joy.ox)/55,-1,1);joy.y=U.clamp((t.clientY-joy.oy)/55,-1,1);}
  if(t.identifier===look.id){lookX+=(t.clientX-look.x)*1.8;lookY+=(t.clientY-look.y)*1.8;look.x=t.clientX;look.y=t.clientY;}}e.preventDefault();},{passive:false});
const endTouch=e=>{for(const t of e.changedTouches){if(t.identifier===joy.id){joy.on=false;joy.id=null;joy.x=joy.y=0;}if(t.identifier===look.id)look.id=null;}};
canvas.addEventListener('touchend',endTouch); canvas.addEventListener('touchcancel',endTouch);

G.input={
  BIND,
  /** held this frame */
  down:a=>vheld.has(a)||BIND[a].some(c=>held.has(c)),
  /** went down since last frame */
  pressed:a=>pressed.has(a)||vpressed.has(a),
  released:a=>released.has(a),
  /** {x: right+, y: forward+, mag} from keys or the touch stick */
  move(){ let x=0,y=0; if(this.down('right'))x+=1; if(this.down('left'))x-=1; if(this.down('forward'))y+=1; if(this.down('back'))y-=1;
    if(joy.on){x+=joy.x;y-=joy.y;} const m=Math.hypot(x,y); if(m>1){x/=m;y/=m;} return {x,y,mag:Math.min(1,m)}; },
  /** mouse / touch look in pixels since last frame */
  look(){ return {x:lookX,y:lookY}; },
  wheel:0,
  /** virtual buttons for touch UI: G.input.setVirtual('attack', true|false) */
  setVirtual(a,on){ if(on){ if(!vheld.has(a))vpressed.add(a); vheld.add(a);} else vheld.delete(a); },
  lockPointer(){ if(isMobile)return; try{const r=canvas.requestPointerLock(); if(r&&r.catch)r.catch(()=>{});}catch(_){} },
  unlockPointer(){ try{document.exitPointerLock&&document.exitPointerLock();}catch(_){} },
  get locked(){return document.pointerLockElement===canvas;},
  get stickActive(){return joy.on;},
  endFrame(){ pressed.clear(); released.clear(); vpressed.clear(); lookX=0; lookY=0; this.wheel=0; }
};

/* ---------- world queries (filled in by world.js / lighthouse.js) ---------- */
G.world={
  seaLevel:0,
  /** terrain height at (x,z); world.js replaces this */
  height:(x,z)=>0,
  /** can a character stand here at all (false = deep water / off the map) */
  walkable:(x,z)=>true,
  /** named places; world.js fills these. See CONTRACT.md for the required keys. */
  landmarks:{},
  /** lighthouse.js fills this with geometry helpers */
  lighthouse:null
};
/** floor providers: fn(x,z,y) -> height or null. Return a height only when it is a surface a character standing at y could be on (<= y+0.9). */
G.floorProviders=[];
G.floorAt=(x,z,y=1e9)=>{let f=G.world.height(x,z); for(const p of G.floorProviders){const h=p(x,z,y); if(h!=null&&h>f)f=h;} return f;};
/** wall constrainers: fn(prev{x,z}, next{x,z} (mutate), y, radius, who) -> true if it blocked */
G.constrainers=[];
/** camera constrainers: fn(camPos:Vector3, targetPos:Vector3) mutate camPos */
G.cameraConstrainers=[];

/* static circle colliders with a spatial hash (trees, rocks, posts, buildings) */
const CELL=8, grid=new Map();
const cellKey=(cx,cz)=>cx+','+cz;
G.addCollider=(c)=>{ // {x,z,r,y0,y1}
  c.y0=c.y0==null?-1e9:c.y0; c.y1=c.y1==null?1e9:c.y1;
  const x0=Math.floor((c.x-c.r)/CELL),x1=Math.floor((c.x+c.r)/CELL),z0=Math.floor((c.z-c.r)/CELL),z1=Math.floor((c.z+c.r)/CELL);
  c._cells=[]; for(let i=x0;i<=x1;i++)for(let j=z0;j<=z1;j++){const k=cellKey(i,j);if(!grid.has(k))grid.set(k,[]);grid.get(k).push(c);c._cells.push(k);}
  return c;
};
G.removeCollider=c=>{(c._cells||[]).forEach(k=>{const a=grid.get(k);if(a){const i=a.indexOf(c);if(i>=0)a.splice(i,1);}});};
G.collidersNear=(x,z)=>grid.get(cellKey(Math.floor(x/CELL),Math.floor(z/CELL)))||[];
/* box colliders (axis-aligned in a local yaw frame) for buildings: {x,z,hw,hd,yaw,y0,y1} */
G.boxColliders=[];
G.addBoxCollider=b=>{b.y0=b.y0==null?-1e9:b.y0;b.y1=b.y1==null?1e9:b.y1;G.boxColliders.push(b);return b;};

const MAX_STEP=0.65, MAX_SLOPE=1.35;
function resolveStatic(n,y,radius){
  for(let pass=0;pass<2;pass++){
    for(const c of G.collidersNear(n.x,n.z)){
      if(y+1.6<c.y0||y>c.y1)continue;
      const dx=n.x-c.x,dz=n.z-c.z,d=Math.hypot(dx,dz),min=c.r+radius;
      if(d<min&&d>1e-6){n.x=c.x+dx/d*min;n.z=c.z+dz/d*min;}
    }
    for(const b of G.boxColliders){
      if(y+1.6<b.y0||y>b.y1)continue;
      const cs=Math.cos(b.yaw||0),sn=Math.sin(b.yaw||0);
      const lx=(n.x-b.x)*cs-(n.z-b.z)*sn, lz=(n.x-b.x)*sn+(n.z-b.z)*cs;
      const ex=b.hw+radius, ez=b.hd+radius;
      if(Math.abs(lx)<ex&&Math.abs(lz)<ez){
        let nx=lx,nz=lz; if(ex-Math.abs(lx)<ez-Math.abs(lz))nx=Math.sign(lx||1)*ex; else nz=Math.sign(lz||1)*ez;
        n.x=b.x+nx*cs+nz*sn; n.z=b.z-nx*sn+nz*cs;
      }
    }
  }
}
function stepOK(px,pz,n,y){
  if(!G.world.walkable(n.x,n.z))return false;
  const f=G.floorAt(n.x,n.z,y);
  if(f>y+MAX_STEP)return false;
  const run=Math.hypot(n.x-px,n.z-pz);
  // the slope test is for terrain (cliffs, steep banks). Built surfaces (floors, steps, stairs) from
  // floor providers only need to be within a step's height, or a 20 cm doorstep reads as a cliff.
  const builtFloor=f>G.world.height(n.x,n.z)+.02;
  if(run>1e-4&&!builtFloor){ const f0=G.floorAt(px,pz,y); if((f-f0)/run>MAX_SLOPE&&f>y-.05)return false; }
  return true;
}
/**
 * Move a character standing at pos (feet) by (dx,dz) with collision.
 * Returns {blocked:boolean, wall:boolean}. Mutates pos.x/pos.z only.
 */
G.moveCharacter=(pos,dx,dz,radius=.4,who='player')=>{
  const tryMove=(mx,mz)=>{
    const n={x:pos.x+mx,z:pos.z+mz};
    resolveStatic(n,pos.y,radius);
    let wall=false; for(const c of G.constrainers){ if(c({x:pos.x,z:pos.z},n,pos.y,radius,who))wall=true; }
    if(!stepOK(pos.x,pos.z,n,pos.y))return null;
    return {n,wall};
  };
  let r=tryMove(dx,dz);
  if(!r){ r=tryMove(dx,0)||tryMove(0,dz); }
  if(!r)return {blocked:true,wall:true};
  pos.x=r.n.x; pos.z=r.n.z;
  return {blocked:false,wall:r.wall};
};

/* ---------- interaction ---------- */
/* G.interact.add({pos:Vector3|()=>Vector3, radius, label:string|()=>string, priority, enabled:()=>bool, use:()=>void, key:'E'}) */
G.interact={list:[],current:null,
  add(o){o.key=o.key||'E';o.priority=o.priority||0;o.radius=o.radius||2.2;this.list.push(o);return o;},
  remove(o){const i=this.list.indexOf(o);if(i>=0)this.list.splice(i,1);},
  /** player.js calls this each frame with the player's feet position */
  pick(p){ let best=null,bs=-1e9;
    for(const o of this.list){ if(o.enabled&&!o.enabled())continue; const q=typeof o.pos==='function'?o.pos():o.pos; if(!q)continue;
      const d=Math.hypot(q.x-p.x,q.z-p.z), dy=Math.abs((q.y||0)-p.y); if(d>o.radius||dy>2.6)continue;
      const s=o.priority*10-d; if(s>bs){bs=s;best=o;} }
    this.current=best; return best; },
  label(o){return typeof o.label==='function'?o.label():o.label;}
};
/* per-frame hint rows for the HUD: G.hint('F','Close the shutter') ; cleared every frame */
G.hints=[]; G.hint=(key,label)=>G.hints.push({key,label});

/* ---------- combat ---------- */
/* hurtbox: {team:'player'|'enemy'|'neutral', pos:Vector3 feet, radius, height, alive:()=>bool, hit(info), targetable, name, lockOffset} */
G.hurtboxes=new Set();
const _v=new THREE.Vector3();
G.combat={
  add(hb){G.hurtboxes.add(hb);return hb;},
  remove(hb){G.hurtboxes.delete(hb);},
  /** sphere strike against opposing hurtboxes. o={x,y,z,radius,team,damage,knockback,kind,source,exclude:Set} -> hit list */
  strike(o){
    const hits=[];
    for(const hb of G.hurtboxes){
      if(hb.team===o.team||hb.team==='neutral'&&!o.hitNeutral)continue;
      if(hb.alive&&!hb.alive())continue;
      if(o.exclude&&o.exclude.has(hb))continue;
      const cy=U.clamp(o.y,hb.pos.y,hb.pos.y+(hb.height||1.6));
      const dx=o.x-hb.pos.x,dy=o.y-cy,dz=o.z-hb.pos.z;
      if(dx*dx+dy*dy+dz*dz>(o.radius+hb.radius)**2)continue;
      _v.set(hb.pos.x-o.x,0,hb.pos.z-o.z); if(_v.lengthSq()<1e-6)_v.set(0,0,1); _v.normalize();
      const info={damage:o.damage||1,dir:_v.clone(),knockback:o.knockback==null?5:o.knockback,kind:o.kind||'melee',source:o.source||null};
      try{hb.hit(info);}catch(e){console.error(e);}
      if(o.exclude)o.exclude.add(hb);
      hits.push(hb);
    }
    if(hits.length)G.emit('strike',{hits,team:o.team,kind:o.kind});
    return hits;
  },
  /** best lock-on candidate in front of `from` facing `dir` (Vector3) */
  nearestTarget(from,maxDist=18,dir=null,team='enemy'){
    let best=null,bs=1e9;
    for(const hb of G.hurtboxes){ if(hb.team!==team||hb.targetable===false||(hb.alive&&!hb.alive()))continue;
      const dx=hb.pos.x-from.x,dz=hb.pos.z-from.z,d=Math.hypot(dx,dz); if(d>maxDist)continue;
      let s=d; if(dir){const dot=(dx*dir.x+dz*dir.z)/Math.max(d,1e-3); s=d*(1.6-dot);}
      if(s<bs){bs=s;best=hb;} }
    return best;
  },
  projectiles:[],
  /** {pos:Vector3, vel:Vector3, radius, team, damage, life, kind, mesh(optional, added to scene), knockback, onHit(hb), onEnd()} */
  spawnProjectile(p){ p.life=p.life||2; p.exclude=new Set(); if(p.mesh){p.mesh.position.copy(p.pos);scene.add(p.mesh);} this.projectiles.push(p); return p; }
};
function updateProjectiles(dt){
  const P=G.combat.projectiles;
  for(let i=P.length-1;i>=0;i--){
    const p=P[i]; p.life-=dt; p.pos.addScaledVector(p.vel,dt);
    if(p.gravity)p.vel.y-=p.gravity*dt;
    if(p.mesh){p.mesh.position.copy(p.pos); if(p.spin)p.mesh.rotation.y+=dt*p.spin;}
    const hits=G.combat.strike({x:p.pos.x,y:p.pos.y,z:p.pos.z,radius:p.radius||.4,team:p.team,damage:p.damage,knockback:p.knockback,kind:p.kind||'bolt',source:p,exclude:p.exclude});
    let end=p.life<=0||p.pos.y<G.floorAt(p.pos.x,p.pos.z,p.pos.y+1)-.05;
    if(hits.length){ if(p.onHit)hits.forEach(h=>p.onHit(h)); if(!p.pierce)end=true; }
    if(end){ if(p.mesh)scene.remove(p.mesh); if(p.onEnd)p.onEnd(p); P.splice(i,1); }
  }
}

/* ---------- player stub (player.js replaces) ---------- */
G.player={pos:new THREE.Vector3(),vel:new THREE.Vector3(),heading:0,hp:10,maxHp:10,stamina:1,alive:true,
  heal(n){this.hp=Math.min(this.maxHp,this.hp+n);}, hurt(){}, respawn(){}, model:null};

/* ---------- pickups / ui stubs (flow.js and hud.js replace) ---------- */
G.pickups={spawn(kind,pos){}};
G.ui={say(t,who){console.log((who?who+': ':'')+t);},objective(t){},toast(t){},bossBar(name,frac){},flash(c){},shake(a){}};

/* ---------- systems ---------- */
/* G.system('name',{order, modes:['play',...] or 'always', init(), update(dt)}) */
const systems=[];
G.system=(name,def)=>{def.name=name; def.order=def.order==null?50:def.order; def.modes=def.modes||['play','dead']; systems.push(def); systems.sort((a,b)=>a.order-b.order); return def;};
G.system('projectiles',{order:45,update:updateProjectiles});
/* keep the occlusion target (player chest, in view space) current after the camera moves */
const _occ=new THREE.Vector3();
G.system('occlusion',{order:85,modes:'always',update(){
  const P=G.player&&G.player.pos;
  if(!P||G.state.mode==='title'){G.occlusion.uP.value.set(0,0,0);return;}
  G.camera.updateMatrixWorld();
  _occ.set(P.x,P.y+1,P.z).applyMatrix4(G.camera.matrixWorldInverse);
  G.occlusion.uP.value.copy(_occ);
}});

G.system('negTime',{order:0,modes:'always',update(){G.negTime.value=G.time;}});

/* sun follows the focus so shadows stay crisp around the player */
G.system('sunFollow',{order:95,modes:'always',update(){
  const d=G.lights.sunDir;
  sun.position.set(G.focus.x+d.x*120,G.focus.y+d.y*120,G.focus.z+d.z*120);
  sun.target.position.copy(G.focus); sun.target.updateMatrixWorld();
}});

/** shared model builders (player.js defines G.models.lantern / G.models.staff) */
G.models={};
/** deterministic stepping for headless tests: runs every system's update n times without rendering */
G.step=(dt=1/30,n=1)=>{ const mode=G.state.mode; for(let k=0;k<n;k++){ G.time+=dt; G.dt=dt; G.hints.length=0;
  for(const s of systems){ if(!s.update)continue; if(s.modes!=='always'&&!s.modes.includes(mode))continue; try{s.update(dt);}catch(e){console.error('step '+s.name,e);} }
  G.atmo.dark=U.damp(G.atmo.dark,G.atmo.darkTarget,2.2,dt); G.input.endFrame(); } };
G.systems=systems;
let started=false;
G.start=()=>{
  if(started)return; started=true;
  for(const s of systems){ if(s.init){ try{s.init();}catch(e){console.error('init '+s.name,e);} } }
  G.emit('ready');
  let last=performance.now();
  function frame(now){
    if(G.quality.cap&&now-last<1000/G.quality.cap-2){requestAnimationFrame(frame);return;}
    const dt=Math.min(.05,(now-last)/1000); last=now; G.dt=dt;
    const mode=G.state.mode;
    if(mode!=='paused')G.time+=dt;
    G.hints.length=0;
    for(const s of systems){
      if(!s.update)continue;
      if(s.modes!=='always'&&!s.modes.includes(mode))continue;
      try{s.update(mode==='paused'?0:dt);}catch(e){ if(!s._err){console.error('update '+s.name,e);s._err=1;} }
    }
    G.atmo.dark=U.damp(G.atmo.dark,G.atmo.darkTarget,2.2,dt);
    if(composer)composer.render(); else renderer.render(scene,camera);
    G.input.endFrame();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
};
/* modules load as plain scripts after core; index.html calls G.start() at the end */
})();
