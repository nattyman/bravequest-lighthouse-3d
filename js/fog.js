/* =====================================================================
   fog.js — the living fog boundary that the lighthouse's light pushes back.
   Owns G.lamp (ether, drain, feeding) and G.fog (radius, inside/depth/safeNear),
   the towering fog wall, the atmosphere blend beyond it, the chill (danger
   outside the light), deep-fog monster spawns, the light gauge HUD and the
   persist key 'fog'. Dormant until 'loop:start' (Act 1 is untouched).
   ===================================================================== */
(function(){
'use strict';
const G=window.G, THREE=G.THREE, U=G.U;
const clamp=U.clamp, lerp=U.lerp, smooth=U.smooth;

/* ---------- tuning (LOOP.md) ---------- */
const CAP=130, START_ETHER=40, BASE_R=30, PER_ETHER=3;
const DRAIN_PER_MIN=60/75;                 // 1 ether / 75 s of play
const WALL_H=60;                           // main band height above the ground (m)
const LAYERS=[{off:-5,h:.45,a:.5},{off:0,h:1,a:.75},{off:10,h:1.2,a:.7}];
const SEG=G.isMobile?192:256, ROWS=16;
const BUBBLE=7, BUBBLE_DEPTH=60;
const MILESTONES=[
  {name:'beach', radius:200,title:'The fog lifts from the south beach',small:'The tide pools lie open to the light'},
  {name:'hamlet',radius:205,title:'The fog withdraws from the hamlet',small:'The ruined cottages stand in the light again'},
  {name:'forest',radius:255,title:'The light reaches the forest edge',small:'The old oaks stir'},
  {name:'tree',  radius:350,title:'The Resisting Tree stands in the light',small:'It held out alone for so long'},
  {name:'island',radius:415,title:'The whole island lies in the light',small:'The fog has nowhere left to stand'}
];
const MS_LABEL={beach:'the south beach',hamlet:'the hamlet',forest:'the forest edge',tree:'the Resisting Tree',island:'the whole island'};

const radiusFor=e=>BASE_R+clamp(e,0,CAP)*PER_ETHER;
const centre={x:180,z:0};

/* ---------- state ---------- */
let loaded=false, edgeV=0, flash=0, warnedThis=false, insideT=0, wasOutside=false, chillAcc=0, chillVis=0, hurtPulse=0;
const reached=new Set();
const S={crossed:false,fed:false,deepLantern:false};

const lamp=G.lamp={
  ether:START_ETHER, capacity:CAP, drainPerMin:DRAIN_PER_MIN, active:false,
  /** pour ether into the light; returns the new ether level */
  feed(units){
    units=+units||0; if(units<=0)return lamp.ether;
    const before=lamp.ether;
    lamp.ether=clamp(lamp.ether+units,0,lamp.capacity);
    fog.targetRadius=radiusFor(lamp.ether);
    flash=1; gaugePulse();
    G.emit('lamp:fed',{units:lamp.ether-before,ether:lamp.ether,radius:fog.targetRadius});
    if(!S.fed&&lamp.active){ S.fed=true;
      G.ui.say('The lamp drinks the ether and flares violet. Far out across the moor, the wall of fog shudders and rolls back.'); }
    return lamp.ether;
  }
};
const fog=G.fog={
  radius:radiusFor(START_ETHER), targetRadius:radiusFor(START_ETHER), centre,
  inside(p){ if((G.cave&&G.cave.inside)||(G.undercroft&&G.undercroft.inside)||(G.temple&&G.temple.inside))return true; /* cave + undercroft + temple hook: no fog underground */ return Math.hypot(p.x-centre.x,p.z-centre.z)<=fog.radius; },
  depth(p){ if((G.cave&&G.cave.inside)||(G.undercroft&&G.undercroft.inside)||(G.temple&&G.temple.inside))return 0; /* cave + undercroft hook */ return Math.max(0,Math.hypot(p.x-centre.x,p.z-centre.z)-fog.radius); },
  /** inside the light, or within a lit lantern's bubble (the lantern itself no deeper than 60 m) */
  safeNear(p){
    if(fog.inside(p))return true;
    const L=G.items&&G.items.lantern; if(!L||!L.found||L.inCradle||!L.lit||!L.lit())return false;
    const w=L.carried&&L.world&&L.world.lengthSq()>0?L.world:L.pos;
    return fog.depth(w)<=BUBBLE_DEPTH&&Math.hypot(w.x-p.x,w.z-p.z)<=BUBBLE;
  },
  milestones:MILESTONES.map(m=>({name:m.name,radius:m.radius,label:MS_LABEL[m.name]})),
  reached:n=>reached.has(n),
  /** next unreached milestone {name,radius,label} or null (for objective subs: "Next: the hamlet · 205 m") */
  next(){ const m=MILESTONES.filter(m=>!reached.has(m.name)).sort((a,b)=>a.radius-b.radius)[0]; return m?{name:m.name,radius:m.radius,label:MS_LABEL[m.name]}:null; },
  chill:0,          // 0..1 vignette strength right now
  extras:[]         // deep-fog monsters spawned by this module
};

/* ---------- persistence ---------- */
const persistH={
  save:()=>({ether:+lamp.ether.toFixed(3),milestones:[...reached],crossed:S.crossed,fed:S.fed}),
  load:(j)=>{
    if(!j)return;
    loaded=true;
    if(typeof j.ether==='number')lamp.ether=clamp(j.ether,0,CAP);
    reached.clear(); (j.milestones||[]).forEach(n=>reached.add(n));
    S.crossed=!!j.crossed; S.fed=!!j.fed;
    fog.targetRadius=fog.radius=radiusFor(lamp.ether); edgeV=0;
    for(const m of MILESTONES) if(fog.radius>=m.radius)reached.add(m.name);
    groundDirty=true; gaugeUpdate(true);
  }
};
fog._persist=persistH;
G.persist&&G.persist.register('fog',persistH);

G.on('loop:start',()=>{
  if(lamp.active)return;
  lamp.active=true;
  if(!loaded){ lamp.ether=START_ETHER; fog.targetRadius=fog.radius=radiusFor(lamp.ether); }
  for(const m of MILESTONES) if(fog.radius>=m.radius)reached.add(m.name);
  groundDirty=true; gaugeUpdate(true);
});

/* =====================================================================
   The wall: three concentric churning bands of slate-violet fog
   ===================================================================== */
const WALL_VS=`
attribute float aGround; attribute float aLayer;
uniform float uR; uniform float uTime; uniform float uH; uniform vec2 uC;
varying vec3 vW; varying float vV; varying float vGround; varying float vLayer;
${G.SNOISE}
void main(){
  vec2 dir=position.xz; float v=position.y;
  float off=aLayer<.5?-5.:(aLayer<1.5?0.:10.);
  float hk=aLayer<.5?.45:(aLayer<1.5?1.:1.2);
  float R=uR+off;
  vec2 bp=uC+dir*R;
  // slow billows bulge the band in and out, more towards the top
  float n=snoise(vec3(bp.x*.022,v*1.6-uTime*.045+aLayer*3.1,bp.y*.022+uTime*.02));
  R+=n*(2.+5.*v);
  vec3 wp=vec3(uC.x+dir.x*R, aGround-6.+v*(uH*hk+6.), uC.y+dir.y*R);
  vW=wp; vV=v; vGround=aGround; vLayer=aLayer;
  gl_Position=projectionMatrix*viewMatrix*vec4(wp,1.);
}`;
const WALL_FS=`
uniform float uTime; uniform vec2 uC; uniform float uR; uniform float uCamIn; uniform float uFlash; uniform float uDark;
uniform vec3 uInLo; uniform vec3 uInMid; uniform vec3 uInHi; uniform vec3 uOutLo; uniform vec3 uOutHi; uniform vec3 uGlow; uniform vec3 uEther;
uniform vec2 uBeam; uniform float uBeamOn; uniform vec3 uFogColor; uniform float uFogDensity;
varying vec3 vW; varying float vV; varying float vGround; varying float vLayer;
${G.SNOISE}
void main(){
  vec3 q=vec3(vW.x*.028, vW.y*.04-uTime*.06, vW.z*.028+vLayer*1.7);
  float n1=snoise(q);
  float n1b=snoise(q+vec3(0.,-.14,0.));
  float n2=snoise(vec3(vW.x*.075+uTime*.02, vW.y*.022-uTime*.09, vW.z*.075-vLayer*2.3));   // tall drapes: the wall reads as a curtain, not a cloud
  float n=n1*.7+n2*.3;
  float la=vLayer<.5?.7:(vLayer<1.5?.95:.9);
  float above=vW.y-vGround;
  float base=smoothstep(-2.,6.,above);
  float h=vV+n*.28;
  float top=1.-smoothstep(.58,.86,h);
  float a=la*base*top;
  // fade where the camera passes through a band
  float dc=length(vW-cameraPosition);
  a*=smoothstep(1.5,9.,dc);
  if(a<.004)discard;
  float lit=clamp((n1-n1b)*3.5,-1.,1.);   // billow tops catch the light from above
  float shade=.84+.22*lit+.16*n2;
  vec3 inC=mix(mix(uInLo,uInMid,smoothstep(.0,.35,vV)),uInHi,smoothstep(.3,.85,vV))*shade;
  inC+=uGlow*exp(-max(above,0.)/6.)*.14;    // the light presses on the foot of the wall
  vec3 outC=mix(uOutLo,uOutHi,smoothstep(0.,.75,vV))*(.85+.2*lit);
  vec3 col=mix(outC,inC,uCamIn);
  // a silver lining along the billowing crest: the light behind the fog
  float rim=smoothstep(.55,.68,h)*(1.-smoothstep(.72,.86,h))*smoothstep(.2,.6,vV);
  col+=uGlow*rim*mix(.4,.22,uCamIn);
  // the beam sweeps across the inner face and holds it back
  vec2 d=normalize(vW.xz-uC);
  float bk=pow(abs(dot(d,uBeam)),70.)*uBeamOn*(1.-smoothstep(.1,.9,vV)*.6);
  col+=uGlow*bk*.55; a=min(1.,a+bk*.08*base);
  // feeding: a violet flare races up the wall
  col+=uEther*uFlash*(.35+.65*(1.-vV))*.9;
  // our own gentle fog so the wall stays readable at distance
  float fd=min(uFogDensity,.012);
  float f=1.-exp(-fd*fd*dc*dc*.3);
  col=mix(col,uFogColor,clamp(f,0.,1.)*.7);
  col*=1.-uDark*.85;
  gl_FragColor=vec4(col,a);
}`;
let wall=null, wallU=null, groundAttr=null, groundDirty=true, groundR=-1, idxIn=null, idxOut=null, idxSide=true;
const _dirs=[];
function buildWall(){
  const L=LAYERS.length, nv=(SEG+1)*(ROWS+1);
  const pos=new Float32Array(L*nv*3), gr=new Float32Array(L*nv), lay=new Float32Array(L*nv), per=[];
  for(let i=0;i<=SEG;i++){ const a=i/SEG*Math.PI*2; _dirs.push([Math.cos(a),Math.sin(a)]); }
  for(let l=0;l<L;l++){ const o=l*nv;
    for(let j=0;j<=ROWS;j++){ const v=Math.pow(j/ROWS,1.35);
      for(let i=0;i<=SEG;i++){ const k=o+j*(SEG+1)+i;
        pos[k*3]=_dirs[i][0]; pos[k*3+1]=v; pos[k*3+2]=_dirs[i][1]; lay[k]=l; } }
    const idx=[]; for(let j=0;j<ROWS;j++)for(let i=0;i<SEG;i++){ const a=o+j*(SEG+1)+i, b=a+1, c=a+SEG+1, d=c+1; idx.push(a,c,b,b,c,d); }
    per.push(idx);
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.BufferAttribute(pos,3));
  groundAttr=new THREE.BufferAttribute(gr,1); groundAttr.setUsage&&groundAttr.setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('aGround',groundAttr); g.setAttribute('aLayer',new THREE.BufferAttribute(lay,1));
  // transparent layers draw far-to-near: outer first when seen from inside the light, inner first from out in the fog
  idxIn=new THREE.Uint16BufferAttribute([].concat(...per.slice().reverse()),1); idxOut=new THREE.Uint16BufferAttribute([].concat(...per),1);
  g.setIndex(idxIn); idxSide=true;
  wallU={uR:{value:fog.radius},uTime:{value:0},uH:{value:WALL_H},uC:{value:new THREE.Vector2(centre.x,centre.z)},
    uCamIn:{value:1},uFlash:{value:0},uDark:{value:0},
    uInLo:{value:U.col('#cdc4df')},uInMid:{value:U.col('#7d7399')},uInHi:{value:U.col('#4c456b')},uOutLo:{value:U.col('#a294cf')},uOutHi:{value:U.col('#3b3655')},
    uGlow:{value:U.col('#d4c4ff')},uEther:{value:U.col('#9150ff')},
    uBeam:{value:new THREE.Vector2(1,0)},uBeamOn:{value:0},uFogColor:{value:new THREE.Color()},uFogDensity:{value:.01}};
  const m=new THREE.ShaderMaterial({uniforms:wallU,vertexShader:WALL_VS,fragmentShader:WALL_FS,transparent:true,depthWrite:false,side:THREE.DoubleSide,fog:false});
  wall=new THREE.Mesh(g,m); fog._wall=wall; wall.frustumCulled=false; wall.renderOrder=1; wall.name='fogWall'; wall.visible=false;
  G.scene.add(wall);
}
function updateGround(){
  const H=G.world.height, nv=(SEG+1)*(ROWS+1), arr=groundAttr.array;
  for(let l=0;l<LAYERS.length;l++){ const R=fog.radius+LAYERS[l].off, o=l*nv;
    for(let i=0;i<=SEG;i++){ const x=centre.x+_dirs[i][0]*R, z=centre.z+_dirs[i][1]*R;
      // the band stands on the higher of the ground and the sea; a neighbour peek keeps it from cutting into ridges
      let h=Math.max(H(x,z),H(x+_dirs[i][1]*4,z-_dirs[i][0]*4),H(x-_dirs[i][1]*4,z+_dirs[i][0]*4));
      h=Math.max(h,-.3);
      for(let j=0;j<=ROWS;j++)arr[o+j*(SEG+1)+i]=h; } }
  groundAttr.needsUpdate=true; groundR=fog.radius; groundDirty=false;
}

/* the lighthouse beam (lighthouse.js keeps it private: find the group of additive cones once) */
let beam=null, beamSearch=0;
const _bv=new THREE.Vector3();
function findBeam(){
  G.scene.traverse(o=>{ if(beam||!o.isGroup||o.children.length<2)return;
    if(o.children.every(c=>c.isMesh&&c.geometry&&c.geometry.type==='ConeGeometry'&&c.material&&c.material.blending===THREE.AdditiveBlending))beam=o; });
}

/* ---------- drifting fog close to the player ---------- */
let edgeEm=null, deepEm=null;
const edgeAnchor={pos:new THREE.Vector3()}, deepAnchor={pos:new THREE.Vector3()};
function buildEmitters(){
  if(!G.ink)return;
  edgeEm=G.ink.emitter(edgeAnchor,{rate:8,radius:16,height:7,size:[4,9],life:[5,9],rise:.22,drift:.7,trail:0,alpha:.3,color:'#aaa3c2',intensity:0});
  deepEm=G.ink.emitter(deepAnchor,{rate:6,radius:16,height:3,size:[2.5,6],life:[4,8],rise:.12,drift:.6,trail:0,alpha:.34,color:'#4a465e',intensity:0});
}

/* =====================================================================
   DOM: the chill vignette and the light gauge
   ===================================================================== */
let chillEl=null, gaugeEl=null, gaugeBar=null, gaugeTxt=null, lastPct=-1, lastTxt='';
const NOISE_SVG="url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 .78  0 0 0 0 .8  0 0 0 0 .92  0 0 0 .9 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")";
function buildDom(){
  const st=document.createElement('style'); st.id='fogStyle';
  st.textContent=`
#fogChill{position:fixed;inset:0;pointer-events:none;opacity:0;display:none;
  background:radial-gradient(ellipse 75% 70% at 50% 47%,transparent 42%,rgba(52,48,84,.38) 66%,rgba(16,13,30,.86) 88%,rgba(8,6,16,.97) 100%)}
#fogChill::before{content:"";position:absolute;inset:0;background-image:${NOISE_SVG};opacity:.2;mix-blend-mode:screen;
  -webkit-mask-image:radial-gradient(ellipse 70% 66% at 50% 47%,transparent 50%,#000 100%);mask-image:radial-gradient(ellipse 70% 66% at 50% 47%,transparent 50%,#000 100%)}
#fogChill::after{content:"";position:absolute;inset:-4%;opacity:var(--frost,0);transition:opacity .25s;
  background:radial-gradient(ellipse 68% 62% at 50% 47%,transparent 55%,rgba(196,206,240,.24) 82%,rgba(220,226,250,.4) 100%);animation:fogBreath 5.5s ease-in-out infinite}
@keyframes fogBreath{0%,100%{transform:scale(1)}50%{transform:scale(1.025)}}
.lampgauge{display:flex;align-items:center;gap:7px;font:500 12px/1 var(--body);color:var(--fog);text-shadow:0 1px 3px #000;
  opacity:0;transition:opacity .9s,filter .9s;pointer-events:none}
.lampgauge.on{opacity:1}
.lampgauge .flame{width:13px;height:18px;flex:none;color:var(--ether-hi);filter:drop-shadow(0 0 4px var(--ether));transform-origin:50% 90%;animation:lampFlick 2.6s ease-in-out infinite}
.lampgauge .bar{position:relative;width:118px;height:6px;border-radius:3px;background:rgba(20,15,26,.72);box-shadow:0 0 0 1px rgba(214,188,255,.32),0 1px 4px rgba(0,0,0,.5);overflow:hidden}
.lampgauge .bar i{position:absolute;left:0;top:0;bottom:0;width:30%;border-radius:3px;background:linear-gradient(90deg,#5b33b8,var(--ether) 70%,var(--ether-hi));box-shadow:0 0 8px var(--ether);transition:width .7s cubic-bezier(.2,.8,.2,1)}
.lampgauge .bar b{position:absolute;top:0;bottom:0;width:1px;background:rgba(241,233,216,.45)}
.lampgauge .r{font-variant-numeric:tabular-nums;letter-spacing:.04em;min-width:40px}
.lampgauge.low{filter:saturate(.55) brightness(.8)}
.lampgauge.low .flame{animation:lampFlick .7s steps(3) infinite}
.lampgauge.fed .bar{animation:lampFed 1.4s ease-out}
.lampgauge.fed .flame{animation:lampFedF 1.4s ease-out}
@keyframes lampFlick{0%,100%{transform:scale(1,1)}40%{transform:scale(.94,1.06)}70%{transform:scale(1.04,.95)}}
@keyframes lampFed{0%{box-shadow:0 0 0 1px rgba(214,188,255,.9),0 0 18px 4px rgba(165,108,255,.9)}100%{box-shadow:0 0 0 1px rgba(214,188,255,.32),0 1px 4px rgba(0,0,0,.5)}}
@keyframes lampFedF{0%{transform:scale(1.7);filter:drop-shadow(0 0 12px var(--ether-hi))}100%{transform:scale(1)}}
@media (prefers-reduced-motion:reduce){#fogChill::after,.lampgauge .flame{animation:none}}`;
  document.head.appendChild(st);
  chillEl=document.createElement('div'); chillEl.id='fogChill'; chillEl.setAttribute('aria-hidden','true');
  const hud=document.getElementById('hud');
  if(hud&&hud.parentNode)hud.parentNode.insertBefore(chillEl,hud); else document.body.appendChild(chillEl);
  gaugeEl=document.createElement('div'); gaugeEl.className='lampgauge'; gaugeEl.hidden=true;
  gaugeEl.setAttribute('role','meter'); gaugeEl.setAttribute('aria-label','Lamp ether'); gaugeEl.setAttribute('aria-valuemin','0'); gaugeEl.setAttribute('aria-valuemax',String(CAP));
  gaugeEl.innerHTML='<svg class="flame" viewBox="0 0 13 18" aria-hidden="true"><path d="M6.5 1C8 4.2 11.5 6.4 11.5 10.6A5 5 0 0 1 1.5 10.6C1.5 8 3 6.6 4 5c.3 1.6 1 2.6 2 3C6 5.6 5.8 3.4 6.5 1Z" fill="currentColor"/><path d="M6.5 9c1 1.2 2 2 2 3.3a2 2 0 0 1-4 0C4.5 11 5.6 10.4 6.5 9Z" fill="#fff" opacity=".75"/></svg>'+
    '<span class="bar"><i></i></span><span class="r">150 m</span>';
  gaugeBar=gaugeEl.querySelector('.bar i'); gaugeTxt=gaugeEl.querySelector('.r');
  const bar=gaugeEl.querySelector('.bar');
  for(const m of MILESTONES){ const t=document.createElement('b'); t.style.left=((m.radius-BASE_R)/PER_ETHER/CAP*100).toFixed(1)+'%'; bar.appendChild(t); }
  const vit=document.querySelector('#hud .vitals');
  if(vit)vit.appendChild(gaugeEl); else { gaugeEl.style.cssText='position:fixed;left:16px;top:52px'; document.body.appendChild(gaugeEl); }
}
function gaugePulse(){ if(!gaugeEl)return; gaugeEl.classList.remove('fed'); void gaugeEl.offsetWidth; gaugeEl.classList.add('fed'); }
function gaugeUpdate(force){
  if(!gaugeEl)return;
  const on=lamp.active; if(gaugeEl.hidden===on){ gaugeEl.hidden=!on; if(on)requestAnimationFrame(()=>gaugeEl.classList.add('on')); else gaugeEl.classList.remove('on'); }
  if(!on)return;
  const pct=Math.round(lamp.ether/CAP*1000)/10;
  if(force||pct!==lastPct){ lastPct=pct; gaugeBar.style.width=pct+'%'; gaugeEl.setAttribute('aria-valuenow',lamp.ether.toFixed(1)); gaugeEl.classList.toggle('low',lamp.ether<10); }
  const txt=Math.round(fog.radius)+' m';
  if(force||txt!==lastTxt){ lastTxt=txt; gaugeTxt.textContent=txt; gaugeEl.title='The light reaches '+txt+' from the lighthouse'; }
}

/* =====================================================================
   Deep-fog spawns
   ===================================================================== */
let spawnT=8;
function trySpawn(P){
  if(!G.monsters||!G.monsters.spawn)return;
  const out=Math.atan2(P.pos.z-centre.z,P.pos.x-centre.x);
  for(let k=0;k<10;k++){
    const a=out+(Math.random()-.5)*2.6, d=20+Math.random()*10, x=P.pos.x+Math.cos(a)*d, z=P.pos.z+Math.sin(a)*d;
    if(fog.depth({x,z})<10)continue;
    if(G.world.walkable&&!G.world.walkable(x,z))continue;
    const h=G.world.height(x,z); if(h<.6||Math.abs(h-P.pos.y)>9)continue;
    const kind=Math.random()<.4?'hound':'hollow';
    let m=null; try{ m=G.monsters.spawn(kind,{x,z},{aggro:true,intro:true,zone:{x,z,r:40,name:'deepfog'}}); }catch(e){ console.error('fog spawn',e); }
    if(m){ m.fogExtra=true; fog.extras.push(m); }
    return m;
  }
  return null;
}
function dissolve(m){
  // the fog takes it back: no kill event (no ichor, no heart), just the dissolve
  if(!m.alive||m.dying)return;
  m.dying=true; m.hp=0; m.st=0; m.state='dying';
  if(G.monsters.tokens)G.monsters.tokens.delete(m);
  if(m.pos&&m.center)m.center.copy(m.pos);
}
function updateExtras(dt,P,depth){
  for(let i=fog.extras.length-1;i>=0;i--){ if(!fog.extras[i].alive)fog.extras.splice(i,1); }
  const live=fog.extras.filter(m=>m.alive&&!m.dying);
  const far=m=>Math.hypot(m.pos.x-P.pos.x,m.pos.z-P.pos.z)>90;
  for(const m of live){ if(insideT>5||far(m)||!lamp.active)dissolve(m); }
  if(!lamp.active||G.state.mode!=='play'||!P.alive)return;
  if(depth>40){
    spawnT-=dt;
    if(spawnT<=0){ spawnT=10+Math.random()*12;
      if(live.length<4&&Math.random()<lerp(.55,.9,smooth(40,110,depth)))trySpawn(P); }
  }else spawnT=Math.max(spawnT,6);
}

/* =====================================================================
   The system
   ===================================================================== */
const FOGC={out:U.col('#3d3a54'),deep:U.col('#24222f')};
const _c=new THREE.Color();
G.system('fog',{order:12,modes:'always',
  init(){
    buildWall(); buildEmitters(); buildDom();
    if(lamp.active)gaugeUpdate(true);
  },
  update(dt){
    const mode=G.state.mode, P=G.player, act=lamp.active&&mode!=='title';
    wall.visible=act;
    if(!act){ if(edgeEm)edgeEm.intensity=0; if(deepEm)deepEm.intensity=0; chillEl.style.display='none'; fog.chill=0; gaugeUpdate(); return; }

    /* ether, drain, radius */
    if(mode==='play'&&dt>0){ lamp.ether=Math.max(0,lamp.ether-dt*lamp.drainPerMin/60); }
    fog.targetRadius=radiusFor(lamp.ether);
    const diff=fog.targetRadius-fog.radius;
    // ~1 m/s for slow changes; a fresh pour rushes outward then settles
    const want=clamp(diff*.45,-1,1)*Math.max(1,Math.min(14,Math.abs(diff)*.4));
    edgeV=U.damp(edgeV,want,4,dt);
    if(Math.abs(diff)<.02&&Math.abs(edgeV)<.05){ fog.radius=fog.targetRadius; edgeV=0; }
    else { const step=edgeV*dt; fog.radius=Math.abs(step)>Math.abs(diff)?fog.targetRadius:fog.radius+step; }
    if(groundDirty||Math.abs(fog.radius-groundR)>.4)updateGround();

    /* milestones */
    for(const m of MILESTONES){ if(!reached.has(m.name)&&fog.radius>=m.radius){ reached.add(m.name);
      G.emit('fog:milestone',{name:m.name,radius:m.radius}); G.ui.toast(m.title,m.small); } }

    /* cave hook (cave.js): inside the sea cave the wall is hidden, no chill, no deep-fog spawns (the lamp still drains) */
    if((G.cave&&G.cave.inside)||(G.undercroft&&G.undercroft.inside)||(G.temple&&G.temple.inside)){ wall.visible=false; if(edgeEm)edgeEm.intensity=0; if(deepEm)deepEm.intensity=0; chillEl.style.display='none'; fog.chill=0; chillAcc=0; chillVis=0; gaugeUpdate(); return; }
    /* player relation to the edge */
    const pp=P&&P.pos?P.pos:G.focus;
    const dist=Math.hypot(pp.x-centre.x,pp.z-centre.z), depth=Math.max(0,dist-fog.radius);
    const cam=G.camera.position, camD=Math.hypot(cam.x-centre.x,cam.z-centre.z);
    if(depth>0){ insideT=0; } else insideT+=dt;

    /* wall uniforms */
    const A=G.atmo, dark=clamp(A.dark,0,1);
    flash=Math.max(0,flash-dt*.45);
    wallU.uR.value=fog.radius; wallU.uTime.value=G.time; wallU.uFlash.value=flash*flash;
    wallU.uCamIn.value=1-smooth(fog.radius-6,fog.radius+6,camD); wallU.uDark.value=dark;
    if((camD<fog.radius)!==idxSide){ idxSide=camD<fog.radius; wall.geometry.setIndex(idxSide?idxIn:idxOut); }
    if(!beam&&beamSearch<=0){ beamSearch=2; findBeam(); } beamSearch-=dt;
    if(beam&&beam.visible){ beam.updateMatrixWorld(); _bv.setFromMatrixColumn(beam.matrixWorld,0); _bv.y=0;
      if(_bv.lengthSq()>1e-6){ _bv.normalize(); wallU.uBeam.value.set(_bv.x,_bv.z); wallU.uBeamOn.value=clamp(A.cured,0,1); } }
    else wallU.uBeamOn.value=0;

    /* atmosphere: clearer air in the light, thick murk beyond (never inside the dark tower) */
    const sf=G.scene.fog;
    if(sf&&sf.isFogExp2){
      const k=(1-dark)*smooth(-3,16,dist-fog.radius), deepK=smooth(15,90,depth);
      const inK=(1-dark)*(1-k);
      sf.density=sf.density*lerp(1,.72,inK);
      if(k>0){
        _c.copy(FOGC.out).lerp(FOGC.deep,deepK);
        sf.color.lerp(_c,k*.9);
        sf.density=lerp(sf.density,lerp(.024,.05,deepK),k);
        if(G.scene.background&&G.scene.background.isColor)G.scene.background.copy(sf.color);
        const L=G.lights; L.hemi.intensity*=lerp(1,.68,k*(.5+.5*deepK)); L.sun.intensity*=lerp(1,.45,k);
      }
      wallU.uFogColor.value.copy(sf.color); wallU.uFogDensity.value=sf.density;
    }

    /* drifting fog near the wall and around the player out in it */
    if(edgeEm){
      const dx=pp.x-centre.x, dz=pp.z-centre.z, L=Math.max(1e-3,dist);
      const ex=centre.x+dx/L*(fog.radius+3), ez=centre.z+dz/L*(fog.radius+3);
      edgeAnchor.pos.set(ex,Math.max(G.world.height(ex,ez),0)+3,ez);
      edgeEm.intensity=(1-smooth(12,55,Math.abs(dist-fog.radius)))*(1-dark)*(mode==='play'||mode==='dead'?1:0);
      deepAnchor.pos.set(pp.x,pp.y+1,pp.z);
      deepEm.intensity=smooth(2,30,depth)*(1-dark)*(mode==='play'||mode==='dead'?1:0);
    }

    /* the chill */
    updateChill(dt,P,pp,depth);
    updateExtras(dt,P||{pos:pp,alive:false},depth);
    gaugeUpdate();
  }
});

/** seconds between chill half-hearts at a given depth (Infinity inside the free band) */
const CHILL_FREE=10;
function chillInterval(d){
  if(d<=CHILL_FREE)return Infinity;
  if(d<=40)return lerp(24,12,(d-CHILL_FREE)/(40-CHILL_FREE));
  return Math.max(3,lerp(12,3,(d-40)/80));
}
fog.chillInterval=chillInterval;
function lanternCarriedLit(){ const L=G.items&&G.items.lantern; return !!(L&&L.carried&&L.lit&&L.lit()); }
function updateChill(dt,P,pp,depth){
  const playing=G.state.mode==='play'&&P&&P.alive!==false;
  const out=depth>0;
  const lantern=lanternCarriedLit();
  const safe=!out||fog.safeNear(pp);
  if(out&&!wasOutside&&playing){
    if(!S.crossed){ S.crossed=true;
      G.ui.say('The cold comes through your cloak at once, as if the fog were breathing on your bones. Out here, the light can’t reach you.'); }
  }
  if(!out&&insideT>20)warnedThis=false;
  wasOutside=out;
  // damage (see chillInterval): none in the first 10 m, slow to 40 m, dangerous well beyond; a lit carried lantern = 7 m bubble up to 60 m deep, then half rate
  let rate=0;
  const iv=chillInterval(depth);
  if(out&&!safe&&playing&&iv<1e8){
    rate=1/iv;
    if(lantern&&fog.depth(G.items.lantern.world.lengthSq()>0?G.items.lantern.world:pp)>BUBBLE_DEPTH){ rate*=.5;
      if(!S.deepLantern){ S.deepLantern=true; G.ui.say('Even the lantern’s light thins out this deep. The cold is finding its way past it.'); } }
  }
  // soft warning just before the damaging band (or as the first tick nears)
  if(playing&&out&&!safe&&!warnedThis&&(depth>CHILL_FREE-3||chillAcc>.55)){ warnedThis=true;
      G.ui.toast('The cold is getting in',lantern?'Go back towards the light':'Return to the light, or carry a lit lantern'); }
  if(rate>0){
    chillAcc+=dt*rate;
    // exactly one tick at a time; the accumulator restarts so ticks are always a full interval apart
    if(chillAcc>=1){ chillAcc=0; hurtPulse=1; fog.lastChillAt=G.time;
      P.hurt({damage:1,kind:'chill',ignoreIframes:true,dir:new THREE.Vector3(),knockback:0}); }
  }else chillAcc=Math.max(0,chillAcc-dt*(out?.15:.5));
  // the vignette: builds with depth (gentler inside a lantern bubble), frost flares as a hit nears and on each hit
  hurtPulse=Math.max(0,hurtPulse-dt*1.6);
  const target=out?(safe?.15+.25*smooth(0,60,depth):.22+.78*smooth(0,70,depth)):0;
  chillVis=U.damp(chillVis,target,out?1.6:2.6,dt);
  fog.chill=chillVis;
  if(chillVis<.005&&hurtPulse<=0){ if(chillEl.style.display!=='none')chillEl.style.display='none'; return; }
  if(chillEl.style.display!=='block')chillEl.style.display='block';
  chillEl.style.opacity=clamp(chillVis+hurtPulse*.25,0,1).toFixed(3);
  const frost=clamp(rate>0?smooth(.45,1,chillAcc)*.8+hurtPulse:hurtPulse*.6,0,1);
  chillEl.style.setProperty('--frost',frost.toFixed(3));
}
})();
