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
/* DEVTOOLS: the one switch for the "Test tools" panel (js/devtools.js). false hides it, unless the URL has ?debug.
   While it's on, the test helpers other modules expose under G.debug (G.debugStartLoop, G.debugEnterCave, …) exist too. */
G.DEVTOOLS=true;
G.debugUrl=/[?&]debug/.test(location.search);
G.debug=G.debugUrl||G.DEVTOOLS;
G.timeScale=1; // devtools time speed: whole-number substeps per frame while playing

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
  attack:['KeyJ','mouse0'], lock:['KeyQ','Tab','mouse2'], interact:['KeyE'], shutter:['KeyF'], potion:['KeyH'], pause:['Escape','KeyP'],
  advance:['Enter','NumpadEnter'], log:['KeyL'], // L: straight to the message log (playtest 2026-11-07; the controller's View button stays on the map, map.js) // next caption (hud.js); Enter on a focused menu button only clicks that button (see keydown)
  glass:['KeyG'], // hold: raise the Remembering Glass (glass.js; the Undercroft). Controller: hold Y (see pollPad)
  fox:['KeyR'], raven:['KeyT'] // companions.js: Ember go / heel, Corvin go / scout (controller: D-pad left / right)
};
const held=new Set(), pressed=new Set(), released=new Set(), vheld=new Set(), vpressed=new Set();
let lookX=0, lookY=0, dragging=false;
const joy={on:false,id:null,ox:0,oy:0,x:0,y:0}, look={id:null,x:0,y:0};
const actionsOf=code=>Object.keys(BIND).filter(a=>BIND[a].includes(code));
function press(code){ if(!held.has(code)){held.add(code);actionsOf(code).forEach(a=>pressed.add(a));} }
function release(code){ if(held.has(code)){held.delete(code);actionsOf(code).forEach(a=>released.add(a));} }
addEventListener('keydown',e=>{ if(e.repeat)return;
  if((e.code==='Enter'||e.code==='NumpadEnter')&&e.target&&e.target.closest&&e.target.closest('button,input,select,textarea,a,.card'))return; // a menu's Enter (e.g. on Resume) must not also advance a caption
  if(['Tab','Space','ArrowUp','ArrowDown'].includes(e.code))e.preventDefault(); press(e.code); });
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

/* ---------- control settings (pause menu), persisted as JSON in localStorage 'bq-controls' ---------- */
G.settings=G.settings||{};
G.settings.invertY=false;
try{ const c=JSON.parse(localStorage.getItem('bq-controls')||'{}'); if(c&&typeof c.invertY==='boolean')G.settings.invertY=c.invertY; }catch(_){}
G.setInvertY=(on)=>{
  G.settings.invertY=!!on;
  try{localStorage.setItem('bq-controls',JSON.stringify({invertY:G.settings.invertY}));}catch(_){}
  if(G.emit)G.emit('settings',{invertY:G.settings.invertY});
};

/* ---------- gamepad (standard mapping — Xbox Wireless Controller over Bluetooth etc.) ----------
   Polled once at the start of every frame (rAF loop and G.step). Buttons feed the same
   pressed/held/released sets as keys; sticks feed move() and look(). While a menu/card is up,
   the pad drives the card's buttons instead, and any button used there is ignored by gameplay
   until it is released (so A on "Begin" doesn't also jump). */
const PAD_BTN={0:'jump',1:'roll',2:'attack',3:'interact',4:'sprint',5:'shutter',6:'lock',7:'attack',8:'pause',9:'pause',10:'sprint',11:'lock',12:'potion',13:'advance',14:'fox',15:'raven'}; // 12 = D-pad up: drink a draught; 13 = D-pad down: next message; 14/15 = D-pad left/right: the companions (companions.js)
/* look: px-equivalent per second at full deflection. player.js turns 1 px into .0042 rad yaw / .0036 rad pitch,
   so 750 px/s ≈ 3.15 rad/s ≈ 180°/s horizontally and 330 px/s ≈ 1.2 rad/s (≈68°/s) vertically. */
const PAD={moveDead:.18,lookDead:.15,lookCurve:2,lookX:750,lookY:330,trigger:.5,navDelay:.38,navRepeat:.14};
const pad={connected:false,id:'',index:-1,mapping:'',count:0,blocked:false,blockError:'',policy:null,last:null,prev:[],sup:[],acts:new Set(),mx:0,my:0,mmag:0,navDir:'',navT:0,yT:-1,rest:null,map:null};
try{ const fp=document.featurePolicy||document.permissionsPolicy; if(fp&&fp.allowsFeature)pad.policy=!!fp.allowsFeature('gamepad'); }catch(_){}
let device=isMobile?'touch':'keyboard';
function setDevice(d){
  if(device===d)return; device=d;
  if(d!=='gamepad')document.querySelectorAll('.pad-focus').forEach(e=>e.classList.remove('pad-focus'));
  G.emit('input:device',{device:d});
}
addEventListener('keydown',()=>setDevice('keyboard'),true);
addEventListener('mousedown',e=>{ if(!e.sourceCapabilities||!e.sourceCapabilities.firesTouchEvents)setDevice(isMobile?'touch':'keyboard'); },true);
addEventListener('mousemove',e=>{ if(Math.abs(e.movementX)+Math.abs(e.movementY)>3&&!isMobile)setDevice('keyboard'); },true);
addEventListener('touchstart',()=>setDevice('touch'),{capture:true,passive:true});
const padName=id=>/xbox|045e|xinput/i.test(id||'')?'Xbox Wireless Controller':String(id||'Controller').replace(/\s*\((?:STANDARD GAMEPAD\s*)?Vendor:.*$/i,'').replace(/^[0-9a-f]{4}-[0-9a-f]{4}-/i,'').trim()||'Controller';
function padConnect(g){
  if(pad.connected&&pad.id===g.id&&pad.index===g.index)return;
  const fresh=!pad.connected||pad.id!==g.id;
  pad.connected=true; pad.id=g.id||''; pad.index=g.index==null?-1:g.index; pad.mapping=g.mapping||''; pad.rest=null; pad.map=null;
  pad.prev=[]; pad.sup=[]; // a different pad: its buttons start fresh (and any held one waits for a release)
  try{ padMap(g); }catch(_){} // reads its rest position and settles pad.map before anyone shows the status
  setDevice('gamepad');
  if(fresh){ try{ G.ui.toast('Controller connected',padName(g.id)); }catch(_){} }
  G.emit('input:pad',{connected:true,id:pad.id,name:padName(pad.id),mapping:pad.mapping});
}
function padDisconnect(){
  if(!pad.connected)return;
  pad.connected=false; pad.last=null; padActs(new Set()); pad.prev=[]; pad.sup=[]; pad.mx=pad.my=pad.mmag=0; pad.index=-1; pad.rest=null; pad.map=null;
  if(device==='gamepad')setDevice(isMobile?'touch':'keyboard');
  G.emit('input:pad',{connected:false,id:pad.id});
}
function padBlock(e){
  if(pad.blocked)return; pad.blocked=true; pad.blockError=(e&&(e.name||e.message))||'blocked';
  if(e&&e.name&&e.message&&e.message!==e.name)pad.blockError=e.name+': '+e.message;
  console.warn('Gamepad API blocked in this frame ('+pad.blockError+'). Open the game on its own page to use a controller.');
  G.emit('input:padblocked',{error:pad.blockError});
}
try{
  addEventListener('gamepadconnected',e=>{ try{ if(e.gamepad&&!pad.connected)padConnect(e.gamepad); }catch(_){} });
  addEventListener('gamepaddisconnected',e=>{ try{ if(!e.gamepad||!pad.id||(e.gamepad.id===pad.id&&(e.gamepad.index==null||e.gamepad.index===pad.index)))padDisconnect(); }catch(_){} });
}catch(_){}
const btnDown=b=>b!=null&&(typeof b==='object'?(!!b.pressed||+b.value>.5):+b>.5);
/* Which pad to read. getGamepads() can hold several entries: nulls, a stale entry from a previous connection, a virtual pad
   (Steam Input, DS4Windows), or a headset/keyboard that reports itself as a gamepad. The pad in use stays in use while it is
   listed; any other pad takes over the moment one of its buttons is pressed. With nothing pressed, prefer a standard mapping.
   (Was: always the first standard-mapping entry, so an idle ghost entry listed first could swallow the real controller.) */
function readPad(){
  if(pad.blocked||!navigator.getGamepads)return null;
  let list; try{ list=navigator.getGamepads(); }catch(e){ padBlock(e); return null; }
  const all=[], n=list&&list.length|0; // an array in current browsers, a GamepadList (not iterable everywhere) in older ones
  for(let i=0;i<n;i++){ const g=list[i]; if(g&&g.connected!==false)all.push(g); }
  pad.count=all.length;
  if(!all.length)return null;
  let pick=null;
  if(pad.connected)for(const g of all) if(g.id===pad.id&&(g.index==null||g.index===pad.index)){pick=g;break;}
  const act=all.filter(g=>{ const B=g.buttons; if(!B)return false; for(let i=0;i<B.length;i++) if(btnDown(B[i]))return true; return false; });
  if(act.length&&(!pick||!act.includes(pick)))pick=act.find(g=>g.mapping==='standard')||act[0];
  if(!pick)pick=all.find(g=>g.mapping==='standard')||all[0];
  return pick;
}
/* Pads without the 'standard' mapping (mapping ''; Firefox on Linux/macOS, some Bluetooth stacks) list their buttons and axes in
   the driver's own order. On an Xbox pad that order has the triggers on axes 2 and 5, resting at -1: read as the standard layout,
   the camera spun on its own and LT/RT did nothing. Known Xbox layouts are remapped; anything else keeps its button order, and
   axes that rest far from 0 (triggers) are kept off the sticks. Returns {B:[{pressed,value}x17], A:[lx,ly,rx,ry]}. */
const XPAD_BTN=[0,1,2,3,4,5,8,9,16,10,11]; // Linux xpad / Firefox: A B X Y LB RB View Menu Guide LS RS -> standard indices
function padMap(g){
  const B=g.buttons||[], A=g.axes||[];
  if(g.mapping==='standard'||(!g.mapping&&A.length<=4)){ pad.map=null; return {B,A}; }
  const out=[]; for(let i=0;i<17;i++)out[i]={pressed:false,value:0};
  const set=(i,v)=>{ if(i==null||!out[i])return; v=U.clamp(+v||0,0,1); if(v>out[i].value)out[i]={pressed:v>.5,value:v}; };
  const val=b=>b==null?0:typeof b==='object'?Math.max(+b.value||0,b.pressed?1:0):+b||0;
  if(!pad.rest||pad.rest.length!==A.length)pad.rest=A.map(v=>+v||0); // first reading = rest position
  const trig=a=>Math.abs(pad.rest[a])>.6; // rests near ±1: a trigger, not a stick
  if(/xbox|045e|xinput|x-box/i.test(g.id||'')&&A.length>=6){
    pad.map='xpad';
    XPAD_BTN.forEach((s,i)=>set(s,val(B[i])));
    const tv=a=>(pad.rest[a]<-.5||+A[a]<-.05)?((+A[a]||0)+1)/2:(+A[a]||0); // -1..1 (or 0..1 before first touched)
    set(6,tv(2)); set(7,tv(5));
    if(A.length>=8){ set(14,-A[6]); set(15,+A[6]); set(12,-A[7]); set(13,+A[7]); }
    return {B:out,A:[+A[0]||0,+A[1]||0,+A[3]||0,+A[4]||0]};
  }
  pad.map='generic';
  for(let i=0;i<Math.min(B.length,17);i++)set(i,val(B[i]));
  const sticks=[]; let nt=0;
  for(let a=0;a<A.length;a++){
    if(trig(a)){ if(nt<2)set(6+nt,((+A[a]||0)-pad.rest[a])/(pad.rest[a]<0?2:-2)); nt++; continue; } // trigger: 0 at rest, 1 fully pulled
    if(sticks.length<4)sticks.push(+A[a]||0); }
  while(sticks.length<4)sticks.push(0);
  return {B:out,A:sticks};
}
function padActs(next){
  for(const a of next) if(!pad.acts.has(a))pressed.add(a);
  for(const a of pad.acts) if(!next.has(a))released.add(a);
  pad.acts=next;
}
/* ---- menus with the pad ---- */
const shown=el=>!el.hidden&&!el.disabled&&el.getClientRects().length>0;
function activeCard(){ const cs=[...document.querySelectorAll('.card')].filter(shown); return cs[cs.length-1]||null; }
function focusables(card){ return [...card.querySelectorAll('button, input[type=range], input[type=checkbox]')].filter(shown); }
function primaryOf(list){ return list.find(e=>e.classList.contains('btn')&&!e.classList.contains('ghost'))||list.find(e=>e.tagName==='BUTTON')||list[0]||null; }
function padFocus(el){
  if(!el)return;
  document.querySelectorAll('.pad-focus').forEach(e=>{ if(e!==el)e.classList.remove('pad-focus'); });
  try{ el.focus({focusVisible:true}); }catch(_){ try{el.focus();}catch(__){} }
  el.classList.add('pad-focus');
}
function navigate(dir,list){
  const cur=document.activeElement, i=list.indexOf(cur);
  if(i<0){ padFocus(primaryOf(list)); return; }
  if(cur.type==='range'&&(dir==='left'||dir==='right')){
    const lo=+cur.min||0, hi=cur.max===''?100:+cur.max, st=Math.max(+cur.step||1,(hi-lo)/20);
    cur.value=String(U.clamp(+cur.value+(dir==='left'?-st:st),lo,hi));
    cur.dispatchEvent(new Event('input',{bubbles:true})); cur.dispatchEvent(new Event('change',{bubbles:true})); return;
  }
  // spatial: the nearest control in that direction (rows for up/down, same row for left/right)
  const r0=cur.getBoundingClientRect(), cx=r0.left+r0.width/2, cy=r0.top+r0.height/2;
  const cand=[];
  for(const el of list){ if(el===cur)continue;
    const r=el.getBoundingClientRect(), dy=r.top+r.height/2-cy;
    const dx=r.right<r0.left?r.right-r0.left:r.left>r0.right?r.left-r0.right:0; // horizontal gap (0 = overlapping columns)
    const sameRow=Math.abs(dy)<Math.max(r0.height,r.height)*.6;
    if(dir==='up'&&dy<-4&&!sameRow||dir==='down'&&dy>4&&!sameRow)cand.push({el,row:Math.abs(dy),col:Math.abs(dx)});
    else if((dir==='left'&&dx<0||dir==='right'&&dx>0)&&sameRow)cand.push({el,row:0,col:Math.abs(dx)}); }
  let best=null;
  if(cand.length){ const near=Math.min(...cand.map(c=>c.row)); // nearest row first, then the closest control in it
    best=cand.filter(c=>c.row<=near+12).sort((a,b)=>a.col-b.col)[0].el; }
  if(!best&&(dir==='left'||dir==='right'))best=list[i+(dir==='left'?-1:1)]||null; // wrap across rows
  if(best)padFocus(best);
}
function padMenu(btn,lx,ly,dt){
  const card=activeCard(); if(!card){pad.navDir='';return;}
  const list=focusables(card); if(!list.length)return;
  const edge=i=>btn[i]&&!pad.prev[i];
  const cur=list.includes(document.activeElement)?document.activeElement:null;
  if(cur&&!cur.classList.contains('pad-focus'))padFocus(cur);
  const paused=G.state.mode==='paused'&&card.id==='pause';
  if(edge(0)){ const el=cur||primaryOf(list); if(el&&el.type!=='range'){ padFocus(el); el.click(); } return; }
  if(paused&&(edge(1)||edge(9)||edge(8))){ const r=document.getElementById('resume'); if(r&&shown(r))r.click(); return; }
  if(card.id==='title'&&edge(9)){ const el=primaryOf(list); if(el)el.click(); return; }
  if(card.dataset.padBack&&(edge(1)||edge(9))){ const b=document.getElementById(card.dataset.padBack); if(b&&shown(b)){ b.click(); return; } } // B / Menu closes cards that name a back button
  const dir=(btn[12]||ly<-.5)?'up':(btn[13]||ly>.5)?'down':(btn[14]||lx<-.5)?'left':(btn[15]||lx>.5)?'right':'';
  if(dir!==pad.navDir){ pad.navDir=dir; pad.navT=PAD.navDelay; if(dir)navigate(dir,list); }
  else if(dir){ pad.navT-=dt; if(pad.navT<=0){ pad.navT=PAD.navRepeat; navigate(dir,list); } }
}
function menuActive(){ return G.state.mode!=='play'||!!activeCard(); }
function pollPad(dt){
  try{
    const g=readPad();
    pad.mx=pad.my=pad.mmag=0;
    if(!g){ if(pad.connected&&navigator.getGamepads&&!pad.blocked)padDisconnect(); return; }
    if(!pad.connected||pad.id!==g.id||(g.index!=null&&pad.index!==g.index))padConnect(g);
    pad.last=g;
    const M=padMap(g), B=M.B, A=M.A;
    const btn=[];
    for(let i=0;i<17;i++){ const b=B[i]; let v=0,p=false;
      if(b!=null){ if(typeof b==='object'){v=+b.value||0;p=!!b.pressed;} else {v=+b||0;p=v>.5;} }
      btn[i]=(i===6||i===7)?Math.max(v,p?1:0)>PAD.trigger:(p||v>.5); }
    const ax=i=>U.clamp(+A[i]||0,-1,1);
    const lx=ax(0), ly=ax(1), rx0=ax(2), ry0=ax(3);
    // left stick: radial deadzone, rescaled to 0..1 (the last 5% counts as full, for worn sticks)
    let mx=0,my=0,mm=0; const lm=Math.hypot(lx,ly);
    if(lm>PAD.moveDead){ const k=U.clamp((lm-PAD.moveDead)/(.95-PAD.moveDead),0,1); mx=lx/lm*k; my=-ly/lm*k; mm=k; }
    /* the D-pad doesn't walk: up drinks a draught, down advances messages, left / right call the companions (companions.js) */
    // right stick: radial deadzone + response curve
    let rx=0,ry=0; const rm=Math.hypot(rx0,ry0);
    if(rm>PAD.lookDead){ const k=Math.pow(U.clamp((rm-PAD.lookDead)/(.95-PAD.lookDead),0,1),PAD.lookCurve); rx=rx0/rm*k; ry=ry0/rm*k; }
    if(btn.some(Boolean)||lm>PAD.moveDead||rm>PAD.lookDead)setDevice('gamepad');
    if(menuActive()){
      padMenu(btn,lx,ly,dt);
      for(let i=0;i<btn.length;i++) if(btn[i])pad.sup[i]=true;
      padActs(new Set());
    }else{
      const acts=new Set();
      for(let i=0;i<btn.length;i++){ if(!btn[i]){pad.sup[i]=false;continue;} if(!pad.sup[i]&&PAD_BTN[i])acts.add(PAD_BTN[i]); }
      /* GLASS HOOK (glass.js): once the Remembering Glass is yours, Y is interact on a tap (sent when it's let go) and the Glass
         while held past .35 s. Before that Y interacts at once, as it always has. */
      if(G.glass&&G.glass.owned){
        const y=acts.has('interact'); acts.delete('interact');
        if(y){ pad.yT=pad.yT<0?0:pad.yT+dt; if(pad.yT>=.35)acts.add('glass'); }
        else{ if(pad.yT>=0&&pad.yT<.35){ pressed.add('interact'); released.add('interact'); } pad.yT=-1; }
      }else pad.yT=-1;
      padActs(acts);
      pad.mx=mx; pad.my=my; pad.mmag=mm;
      lookX+=rx*PAD.lookX*dt; lookY+=ry*PAD.lookY*dt;
      pad.navDir='';
    }
    pad.prev=btn;
  }catch(e){ if(!pad._err){pad._err=1;console.error('gamepad',e);} }
}

/* LENS HOOK (lens.js, the Vigil): once the Vigil Lens is yours and the lantern is open (G.lens.armed()), the shutter action
   (F, controller RB, the lantern button) waits for its release: let go within .3 s and it is the shutter tap it always was
   (sent on release); held .3 s it becomes the 'lens' action (G.input.down('lens'): the focused beam) and the shutter stays
   open. Otherwise the shutter acts the moment it is pressed, as it always has. */
const shHold={t:-1,on:false};
function shutterHold(dt){
  const hit=pressed.has('shutter')||vpressed.has('shutter');
  if(shHold.t<0){ if(!hit||!(G.lens&&G.lens.armed&&G.lens.armed()))return; shHold.t=0; }
  pressed.delete('shutter'); vpressed.delete('shutter');
  if(G.input.down('shutter')){ shHold.t+=dt; if(shHold.t>=.3&&!shHold.on){ shHold.on=true; pressed.add('lens'); } return; }
  if(shHold.on)released.add('lens'); else pressed.add('shutter');
  shHold.t=-1; shHold.on=false;
}
G.input={
  BIND,
  /** held this frame ('lens': the shutter held past .3 s with the Vigil Lens, see LENS HOOK) */
  down:a=>a==='lens'?shHold.on:(vheld.has(a)||pad.acts.has(a)||BIND[a].some(c=>held.has(c))),
  /** went down since last frame */
  pressed:a=>pressed.has(a)||vpressed.has(a),
  released:a=>released.has(a),
  /** {x: right+, y: forward+, mag} from keys, the touch stick or a gamepad (whichever is pushed furthest) */
  move(){ let x=0,y=0; if(this.down('right'))x+=1; if(this.down('left'))x-=1; if(this.down('forward'))y+=1; if(this.down('back'))y-=1;
    if(joy.on){x+=joy.x;y-=joy.y;} const m=Math.hypot(x,y); if(m>1){x/=m;y/=m;}
    if(pad.mmag>Math.min(1,m))return {x:pad.mx,y:pad.my,mag:pad.mmag};
    return {x,y,mag:Math.min(1,m)}; },
  /** last-used device: 'keyboard' | 'touch' | 'gamepad' */
  get device(){return device;},
  /** {connected, id, name, blocked, error, policy, supported, count, index, mapping, remap}. policy: false when the page's
      permissions policy forbids 'gamepad' (an embedding iframe), null when the browser can't say. count: pads listed now. */
  get gamepad(){return {connected:pad.connected,id:pad.id,name:pad.connected?padName(pad.id):'',blocked:pad.blocked,error:pad.blockError,policy:pad.policy,
    supported:!!navigator.getGamepads,count:pad.count,index:pad.index,mapping:pad.connected?pad.mapping:'',remap:pad.connected?pad.map:null};},
  /** the pad in use this frame in the standard layout ({B:[{pressed,value}], A:[lx,ly,rx,ry]}), or null (hud.js scrolls the log with it) */
  padState(){ const g=pad.last; if(!pad.connected||!g)return null; try{ return padMap(g); }catch(_){ return null; } },
  padConfig:PAD,
  /** controller rumble, strength 0..1 for ms milliseconds; no-op without a rumble-capable pad */
  rumble(strength=.5,ms=200){
    const g=pad.last, a=g&&g.vibrationActuator; if(!pad.connected||!a||!a.playEffect)return false;
    const s=U.clamp(+strength||0,0,1);
    try{ const p=a.playEffect('dual-rumble',{startDelay:0,duration:Math.max(10,ms|0),weakMagnitude:s,strongMagnitude:U.clamp(s*.85,0,1)}); if(p&&p.catch)p.catch(()=>{}); }catch(_){ return false; }
    return true;
  },
  /** called by the frame loop / G.step before systems update */
  poll(dt){ pollPad(dt||0); shutterHold(dt||0); },
  /** mouse / touch / right-stick look in pixels since last frame (+y = look down unless inverted).
      Invert is applied here, once, so every source respects G.settings.invertY. */
  look(){ return {x:lookX,y:G.settings.invertY?-lookY:lookY}; },
  /** "old school" flight-stick look: mouse/stick up tilts the camera down. Persisted in localStorage 'bq-controls'. */
  get invertY(){return G.settings.invertY;},
  set invertY(v){G.setInvertY(v);},
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
/* INTERIOR HOOK (cave.js): G.interior = null | {id, contains(x,z,y)->bool}. Inside contains(), terrain is ignored
   (floor providers only; -1e9 = a pit / open water) and walkable() is true. G.walkOverrides: fn(x,z)->true|false|null,
   consulted by walkable() before world.js (the cave's low-tide causeway). */
G.interior=null;
G.walkOverrides=[];
G.floorAt=(x,z,y=1e9)=>{let f=(G.interior&&G.interior.contains(x,z,y))?-1e9:G.world.height(x,z); for(const p of G.floorProviders){const h=p(x,z,y); if(h!=null&&h>f)f=h;} return f;};
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
  /** best lock-on candidate in front of `from` facing `dir` (Vector3); prio: a hurtbox flagged lockPriority wins wherever it is */
  nearestTarget(from,maxDist=18,dir=null,team='enemy',prio=false){
    let best=null,bs=1e9;
    for(const hb of G.hurtboxes){ if(hb.team!==team||hb.targetable===false||(hb.alive&&!hb.alive()))continue;
      const dx=hb.pos.x-from.x,dz=hb.pos.z-from.z,d=Math.hypot(dx,dz), pri=prio&&!!hb.lockPriority; if(d>maxDist+(pri?4:0))continue;
      let s=d; if(dir&&!pri){const dot=(dx*dir.x+dz*dir.z)/Math.max(d,1e-3); s=d*(1.6-dot);}
      if(pri)s-=1000;   // hb.lockPriority (a crab on the raft): chosen first, wherever the camera points
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

/* controller rumble from game events (only while the pad is the active device) */
{
  const padOn=()=>device==='gamepad'&&pad.connected;
  let lastAtk={combo:1,charged:false,t:-9};
  G.on('player:attack',e=>{ lastAtk={combo:(e&&e.combo)||0,charged:!!(e&&e.charged),t:G.time}; });
  G.on('player:hurt',()=>{ if(padOn())G.input.rumble(.6,220); });
  G.on('strike',e=>{ if(!e||e.team!=='player'||!padOn())return;
    const big=e.kind&&e.kind!=='melee'||lastAtk.charged&&G.time-lastAtk.t<1.5||lastAtk.combo>=3&&G.time-lastAtk.t<1;
    G.input.rumble(big?.55:.25,big?170:90); });
  G.on('boss:dead',()=>{ if(padOn())G.input.rumble(1,900); });
  let airTop=null;
  G.system('padFeel',{order:99,modes:['play'],update(){
    const P=G.player; if(!P||!P.pos)return;
    if(P.grounded===false){ airTop=P.gliding||airTop==null?P.pos.y:Math.max(airTop,P.pos.y); return; }
    if(airTop!=null){ const drop=airTop-P.pos.y; airTop=null;
      if(drop>3.2&&drop<60&&padOn())G.input.rumble(U.clamp(.3+drop/20,0,.9),drop>7?260:150); }
  }});
}

/* sun follows the focus so shadows stay crisp around the player */
G.system('sunFollow',{order:95,modes:'always',update(){
  const d=G.lights.sunDir;
  sun.position.set(G.focus.x+d.x*120,G.focus.y+d.y*120,G.focus.z+d.z*120);
  sun.target.position.copy(G.focus); sun.target.updateMatrixWorld();
}});

/** shared model builders (player.js defines G.models.lantern / G.models.staff) */
G.models={};
/** deterministic stepping for headless tests: runs every system's update n times without rendering */
/* ?headless (tests): the game still updates in real time, but frames are only drawn when something may want to see them —
   the first frame after a G.step() (so a screenshot right after a scripted step is current), and ~2 a second otherwise.
   Software-rendered Chrome spends most of its CPU drawing frames nobody watches; this is the tests' big speed-up.
   G.headless.draw(n) forces the next n frames to draw (e.g. before a screenshot of an animation). */
G.headless=/[?&]headless/.test(location.search)?{dirty:true,force:0,lastDraw:0,draw(n=2){this.force=Math.max(this.force,n);}}:null;
G.step=(dt=1/30,n=1)=>{ const mode=G.state.mode; if(G.headless)G.headless.dirty=true; for(let k=0;k<n;k++){ G.input.poll(dt); G.time+=dt; G.dt=dt; G.hints.length=0;
  for(const s of systems){ if(!s.update)continue; if(s.modes!=='always'&&!s.modes.includes(mode))continue; try{s.update(dt);}catch(e){console.error('step '+s.name,e);} }
  G.atmo.dark=U.damp(G.atmo.dark,G.atmo.darkTarget,2.2,dt); G.input.endFrame(); } };
G.systems=systems;
let started=false;
G.start=()=>{
  if(started)return; started=true;
  { const w=G.world.walkable; // interior / override hook (see G.interior above); world.js has installed its walkable by now
    G.world.walkable=(x,z)=>{ if(G.interior&&G.interior.contains(x,z))return true;
      for(const o of G.walkOverrides){ const r=o(x,z); if(r!=null)return r; } return w(x,z); }; }
  for(const s of systems){ if(s.init){ try{s.init();}catch(e){console.error('init '+s.name,e);} } }
  G.emit('ready');
  let last=performance.now();
  function frame(now){
    if(G.quality.cap&&now-last<1000/G.quality.cap-2){requestAnimationFrame(frame);return;}
    const dt=Math.min(.05,(now-last)/1000); last=now; G.dt=dt;
    G.input.poll(dt);
    const steps=G.state.mode==='play'?Math.max(1,Math.min(8,G.timeScale|0)):1; // devtools time speed: n whole substeps
    for(let k=0;k<steps;k++){
    if(k>0)G.input.endFrame(); // presses and look count once
    const mode=G.state.mode;
    if(mode!=='paused')G.time+=dt;
    G.hints.length=0;
    for(const s of systems){
      if(!s.update)continue;
      if(s.modes!=='always'&&!s.modes.includes(mode))continue;
      try{s.update(mode==='paused'?0:dt);}catch(e){ if(!s._err){console.error('update '+s.name,e);s._err=1;} }
    }
    G.atmo.dark=U.damp(G.atmo.dark,G.atmo.darkTarget,2.2,dt);
    }
    const H=G.headless;
    if(!H||H.dirty||H.force>0||now-H.lastDraw>500){
      if(composer)composer.render(); else renderer.render(scene,camera);
      if(H){ H.dirty=false; if(H.force>0)H.force--; H.lastDraw=now; }
    }
    G.input.endFrame();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
};
/* modules load as plain scripts after core; index.html calls G.start() at the end */
})();
