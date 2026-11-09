/* =====================================================================
   BRAVE QUEST: LIGHTHOUSE — glass.js  (Place agent)
   The Remembering Glass: a cracked keeper's lens in a brass ring, the lighthouse lens's little sister. Found in the
   sexton's niche in the Undercroft's crypt chapel (behind the bell-ropes' stone), kept for good.
   - hold G (controller: hold Y; touch: the Glass button, hud.js) to raise it: a slow walk (no sprint, roll or attack, no
     stamina cost), a soft sepia-violet vignette, and the PAST LAYER shows
   - the past layer (G.glass.pastLayer): a shared group that only renders while the Glass is up; others add children.
     undercroft.js puts the doorway and the stair that were there into it — solid while the Glass is up (G.glass.solid)
   - echoes: 3–6 s ghost vignettes at fixed spots, each with a caption: five in the Undercroft, four on the island
     (the cottage, the lighthouse gallery, the standing stones, the hamlet square)
   - on the island it outlines any heart shard or keeper's cache within 25 m, even through walls. No puzzle needs it there.
   API: G.glass = {owned, raised, k, solid, raise(on), toggle(), give(o), pastLayer, addPast(obj), addEcho({id,pos,r,lines,who,
        figures,props,scene,zone}), echo(id), echoes, canSee(pos), memoryMaterial(color,{base,additive})}
   Events: glass:raise {on} · glass:echo {id, first} · glass:found {}. Persist key 'glass'.
   ===================================================================== */
(function(){
'use strict';
const G=window.G, THREE=G.THREE, U=G.U, PI=Math.PI, TAU=PI*2;
const {clamp,lerp,smooth}=U;
const V=(x,y,z)=>new THREE.Vector3(x,y,z);
const C=hex=>U.col(hex);
const LM=()=>(G.world&&G.world.landmarks)||{};

/* ================================================================ STATE + API */
const S={owned:false,latch:false,hold:false,raised:false,k:0,seen:{},found:false,niche:false,said:{},slowSet:false,stamPre:null};
const K={value:0}, T={value:0};
const pastLayer=new THREE.Group(); pastLayer.name='glassPast'; pastLayer.visible=false;
const echoes=[];
const API=G.glass={
  get owned(){ return S.owned; },
  get raised(){ return S.raised; },
  /** 0..1, how far up the Glass is (fades over ~.3 s) */
  get k(){ return S.k; },
  /** the past is solid (undercroft.js's past doorways and stairs) */
  get solid(){ return S.raised&&S.k>.55; },
  /** latch the Glass up or down (the talk card toggles it this way); holding G / Y / the button raises it too */
  raise(on){ S.latch=!!on&&S.owned; if(!on)S.hold=false; refresh(); return S.raised; },
  toggle(){ return API.raise(!S.raised); },
  /** make it yours (the niche; devtools; old saves). o.silent: no reward moment */
  give(o){ if(S.owned)return false; S.owned=true; if(!(o&&o.silent))rewardMoment(); G.emit('glass:found',{silent:!!(o&&o.silent)}); return true; },
  pastLayer,
  addPast(obj){ if(obj)pastLayer.add(obj); return obj; },
  addEcho, echo:id=>echoes.find(e=>e.id===id)||null, echoes,
  /** does the Glass, raised now, reveal pos? (in front of the camera, within ~30 m) */
  canSee(pos){ if(!S.raised||S.k<.5||!pos)return false; const cam=G.camera; if(!cam)return true;
    const d=_v.copy(pos).sub(cam.position); const L=d.length(); if(L>32)return false; if(L<2)return true;
    cam.getWorldDirection(_f); return d.dot(_f)/L>.25; },
  memoryMaterial,
  /** the niche in the chapel can be opened by the People agent's bell puzzle (undercroft:puzzle {id:'bells'}) */
  get nicheOpen(){ return nicheOpen(); },
};
const _v=new THREE.Vector3(), _f=new THREE.Vector3();

/* ================================================================ MATERIALS */
/** the warm translucent "memory" look: rim-lit amber, a slow shimmer, fades with the Glass (uK) */
function memoryMaterial(color,o){ o=o||{};
  const m=new THREE.ShaderMaterial({uniforms:{uK:K,uTime:T,uC:{value:C(color||'#ffc98a')},uBase:{value:o.base==null?.35:o.base},uA:{value:1}},
    transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:o.additive?THREE.AdditiveBlending:THREE.NormalBlending,
    vertexShader:`varying vec3 vN;varying vec3 vV;varying vec3 vW;void main(){ vec4 wp=modelMatrix*vec4(position,1.); vW=wp.xyz; vN=normalize(mat3(modelMatrix)*normal); vV=cameraPosition-wp.xyz; gl_Position=projectionMatrix*viewMatrix*wp; }`,
    fragmentShader:`uniform float uK,uTime,uBase,uA;uniform vec3 uC;varying vec3 vN;varying vec3 vV;varying vec3 vW;
      void main(){ vec3 n=normalize(vN), v=normalize(vV); float fr=1.-abs(dot(n,v)); float rim=pow(fr,2.2);
        float sh=.5+.5*sin(vW.y*9.-uTime*2.1+sin(vW.x*1.3+vW.z*1.1)*2.);
        float lit=.55+.45*max(n.y,0.);
        vec3 c=uC*(lit*.75+rim*1.1)*(.9+.1*sh);
        float a=(uBase+rim*.55)*(.82+.18*sh)*uK*uA;
        gl_FragColor=vec4(c,a); }`});
  return m;
}

/* ================================================================ GHOST FIGURES (echo scenes) */
const PROF=[[.0,0],[.2,.02],[.26,.2],[.24,.6],[.2,.95],[.25,1.18],[.21,1.32],[.11,1.42],[0,1.45]].map(p=>new THREE.Vector2(p[0],p[1]));
function mergeGeos(list){
  let n=0; const parts=list.map(g=>{ const q=g.index?g.toNonIndexed():g; if(!q.attributes.normal)q.computeVertexNormals(); n+=q.attributes.position.count; return q; });
  const pos=new Float32Array(n*3), nor=new Float32Array(n*3); let o=0;
  for(const g of parts){ pos.set(g.attributes.position.array,o*3); nor.set(g.attributes.normal.array,o*3); o+=g.attributes.position.count; }
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.BufferAttribute(pos,3)); g.setAttribute('normal',new THREE.BufferAttribute(nor,3)); g.computeBoundingSphere(); return g; }
const _m=new THREE.Matrix4(), _e=new THREE.Euler();
const put=(g,x,y,z,ry,rx,rz,s)=>{ const q=g.clone(); _m.makeRotationFromEuler(_e.set(rx||0,ry||0,rz||0,'YXZ')); if(s)_m.scale(s.isVector3?s:V(s,s,s)); _m.setPosition(x,y,z); q.applyMatrix4(_m); return q; };
/** one figure at the origin facing +z: pose stand|sit|kneel|carry|fog; h = height scale (a child ~.7) */
function figureGeo(pose,h){
  h=h||1; const out=[];
  const body=new THREE.LatheGeometry(PROF,10), head=new THREE.SphereGeometry(.15,10,8), arm=new THREE.CylinderGeometry(.05,.045,.55,6);
  if(pose==='fog'){ const sh=new THREE.LatheGeometry([[0,0],[.42,.02],[.5,.5],[.38,1.3],[.28,1.8],[.18,2.05],[0,2.1]].map(p=>new THREE.Vector2(p[0],p[1])),12);
    out.push(put(sh,0,0,0,0,0,0,V(h,h,h))); return mergeGeos(out); }
  if(pose==='sit'){ out.push(put(body,0,-.42*h,0,0,0,0,V(h,h*.92,h))); out.push(put(new THREE.BoxGeometry(.4,.14,.5),0,.43*h,.2*h,0,0,0,h)); out.push(put(head,0,1.12*h,.02,0,0,0,h));
    out.push(put(arm,-.24*h,.78*h,.22*h,0,-1.1,0,h)); out.push(put(arm,.24*h,.78*h,.22*h,0,-1.1,0,h)); return mergeGeos(out); }
  if(pose==='kneel'){ out.push(put(body,0,-.55*h,.05,0,.18,0,V(h,h*.95,h))); out.push(put(new THREE.BoxGeometry(.4,.16,.55),0,.1*h,.25*h,0,0,0,h)); out.push(put(head,0,.98*h,.2*h,0,0,0,h));
    out.push(put(arm,-.2*h,.62*h,.32*h,0,-1.3,.2,h)); out.push(put(arm,.2*h,.62*h,.32*h,0,-1.3,-.2,h)); return mergeGeos(out); }
  out.push(put(body,0,0,0,0,0,0,V(h,h,h))); out.push(put(head,0,1.56*h,0,0,0,0,h));
  if(pose==='carry'){ out.push(put(new THREE.SphereGeometry(.26,8,6),.16*h,1.5*h,-.08*h,0,0,0,V(h*1.1,h*.75,h))); out.push(put(arm,.2*h,1.3*h,0,0,0,2.6,h)); out.push(put(arm,-.24*h,.95*h,.05,0,0,.15,h)); }
  else { out.push(put(arm,-.25*h,.98*h,0,0,0,.12,h)); out.push(put(arm,.25*h,.98*h,0,0,0,-.12,h)); }
  return mergeGeos(out);
}
function propGeo(p){
  if(p.type==='table'){ const g=[put(new THREE.BoxGeometry(1.6,.07,.85),0,.72,0)]; for(const [x,z] of [[-.7,-.35],[.7,-.35],[-.7,.35],[.7,.35]])g.push(put(new THREE.BoxGeometry(.07,.72,.07),x,.36,z)); return mergeGeos(g); }
  if(p.type==='ledger'){ return mergeGeos([put(new THREE.BoxGeometry(.9,.9,.5),0,.45,0),put(new THREE.BoxGeometry(.6,.05,.45),0,.93,0,0,0,.08)]); }
  if(p.type==='sack'){ return mergeGeos([put(new THREE.SphereGeometry(.34,8,6),0,.28,0,0,0,0,V(1,.85,1))]); }
  return mergeGeos([put(new THREE.BoxGeometry(.5,.5,.5),0,.25,0)]);
}

/* ================================================================ ECHOES */
/** {id, pos:Vector3 (world, on the floor), r, lines:[...], who, figures:[{x,z,yaw,pose,h,walk:{dx,dz}}], props:[{type,x,z,yaw}],
    scene: Object3D (instead of figures), zone:'undercroft'|'island', dur} */
function addEcho(o){
  const e=Object.assign({r:4,lines:[],who:'An echo',figures:[],props:[],zone:'undercroft',dur:null},o);
  e.pos=e.pos.clone(); e.t=-1; e.cool=0; e.inside=false; e.root=null; e.a=0;
  const old=echoes.findIndex(q=>q.id===e.id); if(old>=0){ const q=echoes[old]; if(q.root)pastLayer.remove(q.root); echoes.splice(old,1); }
  echoes.push(e); return e;
}
function buildEcho(e){
  if(e.root)return;
  const root=new THREE.Group(); root.position.copy(e.pos); root.visible=false;
  const fm=memoryMaterial('#ffd6a0',{base:.16,additive:true}), pm=memoryMaterial('#e8b880',{base:.12,additive:true});
  fm.uniforms.uA=pm.uniforms.uA={value:0}; e.mat=fm.uniforms.uA;
  e.figs=[];
  if(e.scene){ root.add(e.scene); e.scene.traverse(c=>{ if(c.isMesh){ c.material=fm; } }); }
  for(const f of e.figures||[]){ const m=new THREE.Mesh(figureGeo(f.pose,f.h),f.pose==='fog'?memoryMaterial('#b8b0c8',{base:.1,additive:true}):fm);
    if(f.pose==='fog')m.material.uniforms.uA=e.mat;
    m.position.set(f.x||0,0,f.z||0); m.rotation.y=f.yaw||0; root.add(m); e.figs.push({m,f,x:f.x||0,z:f.z||0}); }
  for(const p of e.props||[]){ const m=new THREE.Mesh(propGeo(p),pm); m.position.set(p.x||0,0,p.z||0); m.rotation.y=p.yaw||0; root.add(m); }
  pastLayer.add(root); e.root=root;
}
function zoneNow(){ if(G.undercroft&&G.undercroft.inside)return 'undercroft'; if(G.cave&&G.cave.inside)return 'cave'; return 'island'; }
function echoDur(e){ if(e.dur)return e.dur; const n=e.lines.join(' ').length; return clamp(3+n/70,3,6); }
function playEcho(e){
  buildEcho(e); e.t=0; e.root.visible=true;
  const first=!S.seen[e.id]; S.seen[e.id]=1;
  // a scene of more than one line is a story moment: the conversation card (talk.js) with the Glass held up behind it, so the
  // scene plays on while you read. One line, or not calm: captions, as ever.
  let shown='';
  if(e.lines.length>1&&G.talk&&G.talk.moment){ try{ shown=G.talk.moment({who:'echo',name:e.who||'An echo',title:e.title||'',portrait:'echo',glass:true,key:'echo:'+e.id,lines:e.lines.map(l=>({text:l,who:e.who||'An echo'}))}); }catch(err){ console.error('echo card',err); } }
  if(!shown)e.lines.forEach((l,i)=>{ try{ G.ui.say(l,e.who||'An echo',{priority:i?'normal':'high',key:'echo:'+e.id+':'+i}); }catch(_){} });
  G.emit('glass:echo',{id:e.id,first,pos:e.pos.clone()});
}
function updateEchoes(dt){
  const P=G.player; if(!P||!P.pos)return;
  const z=zoneNow(), up=S.raised&&S.k>.7;
  for(const e of echoes){
    const near=e.zone===z&&Math.hypot(P.pos.x-e.pos.x,P.pos.z-e.pos.z)<e.r&&Math.abs(P.pos.y-e.pos.y)<4;
    if(!near&&e.inside)e.cool=0;
    e.inside=near; e.cool=Math.max(0,e.cool-dt);
    if(e.zone==='island'&&!S.owned)continue;
    if(e.t<0&&up&&near&&e.cool<=0&&G.state.mode==='play'){ playEcho(e); }
    if(e.t>=0){ e.t+=dt; const D=echoDur(e);
      const tgt=(e.t<D&&S.raised)?1:0; e.a=U.damp(e.a,tgt,tgt?2.4:4,dt);
      e.mat.value=e.a;
      for(const g of e.figs){ const f=g.f, k=clamp(e.t/D,0,1);
        if(f.walk){ g.m.position.x=g.x+f.walk.dx*smooth(.2,1,k); g.m.position.z=g.z+f.walk.dz*smooth(.2,1,k); g.m.rotation.y=Math.atan2(f.walk.dx,f.walk.dz); }
        g.m.position.y=f.pose==='fog'?.05*Math.sin(G.time*1.3):.02*Math.sin(G.time*2+g.x); }
      if(e.t>=D&&e.a<.02){ e.t=-1; e.root.visible=false; e.cool=20; } }
  }
}

/* ================================================================ ISLAND ECHOES (placeholder captions: the People agent sets the text) */
function islandEchoes(){
  const L=LM(), H=(x,z)=>G.world.height(x,z);
  const cot=L.cottage||{x:158,z:24}, st=L.stones||{x:40,z:-35}, ham=L.hamlet||{x:-20,z:30};
  const lh=G.world.lighthouse;
  addEcho({id:'cottage',zone:'island',pos:V(cot.x+.6,(cot.y||42)+.24,cot.z-.4),r:4.2,who:'An echo',
    lines:['A keeper at the cottage table, writing by a violet light. She stops, and looks a long while toward the forest.'],
    figures:[{x:0,z:0,yaw:-PI/2,pose:'sit'}],props:[{type:'table',x:-.9,z:0,yaw:PI/2}]});
  if(lh&&lh.lampCenter){ const c=lh.lampCenter, gy=lh.topY!=null?lh.topY:c.y-1.2; const ga=V(c.x-(lh.outerR||5)-.6,gy,c.z);
    addEcho({id:'gallery',zone:'island',pos:V(c.x,G.floorAt(c.x+1.6,c.z,c.y)||gy,c.z),r:5.5,who:'An echo',
      lines:['Two keepers at the lamp, passing a pipe between them. “If the lamp ever goes,” says one, “the moths will know before we do.”'],
      figures:[{x:1.5,z:.6,yaw:-2.2,pose:'stand'},{x:1.4,z:-.9,yaw:-1,pose:'stand',h:.96}]}); void ga; }
  addEcho({id:'stones',zone:'island',pos:V(st.x,H(st.x,st.z),st.z),r:8,who:'An echo',
    lines:['Children running the ring of stones, counting. One of them stops at the seventh stone, and will not go on.'],
    figures:[{x:3,z:2,yaw:1,pose:'stand',h:.7},{x:-2.5,z:3.5,yaw:2,pose:'stand',h:.65},{x:4.6,z:-3.2,yaw:-2.6,pose:'stand',h:.72}]});
  const sq={x:ham.x+2,z:ham.z+1};
  addEcho({id:'square',zone:'island',pos:V(sq.x,H(sq.x,sq.z),sq.z),r:6.5,who:'An echo',
    lines:['Market day in Wickham’s End. The reeve counts the tithe sacks off the cart: three, two, one. Everyone’s name is still their own.'],
    figures:[{x:0,z:0,yaw:.6,pose:'stand',h:1.1},{x:1.6,z:1.2,yaw:-2.5,pose:'carry'},{x:-1.4,z:1.5,yaw:2.8,pose:'stand',h:.7}],props:[{type:'sack',x:.8,z:.5},{type:'sack',x:1.1,z:-.2}]});
}

/* ================================================================ SHARDS + CACHES (island, ≤ 25 m, through walls) */
const OUT=[]; let ringTex=null;
function buildOutlines(){
  ringTex=G.canvasTex(128,(g,s)=>{ const h=s/2; const gr=g.createRadialGradient(h,h,h*.45,h,h,h); gr.addColorStop(0,'rgba(255,255,255,0)'); gr.addColorStop(.55,'rgba(255,255,255,.9)'); gr.addColorStop(.7,'rgba(255,255,255,.35)'); gr.addColorStop(1,'rgba(255,255,255,0)'); g.fillStyle=gr; g.fillRect(0,0,s,s); });
  for(let i=0;i<8;i++){ const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:ringTex,color:C('#ffd9a0'),transparent:true,opacity:0,depthTest:false,depthWrite:false,blending:THREE.AdditiveBlending,fog:false}));
    sp.renderOrder=20; sp.visible=false; sp.scale.set(1.4,1.4,1); G.scene.add(sp); OUT.push(sp); }
}
function updateOutlines(dt){
  const on=S.owned&&S.raised&&S.k>.3&&zoneNow()==='island', PR=G.progress, P=G.player;
  const list=[];
  if(on&&PR&&P&&P.pos){ const st=PR.state||{shards:{},caches:{}};
    for(const s of PR.spots||[]){ if(st.shards[s.id]||s.cave||!s.pos)continue; if(s.when&&!s.when())continue; const d=s.pos.distanceTo(P.pos); if(d<25)list.push([d,s.pos,'shard']); }
    for(const c of PR.caches||[]){ if(st.caches[c.id]||c.cave||!c.pos)continue; if(c.when&&!c.when())continue; const d=c.pos.distanceTo(P.pos); if(d<25)list.push([d,c.pos,'cache']); } }
  list.sort((a,b)=>a[0]-b[0]);
  OUT.forEach((sp,i)=>{ const it=list[i];
    if(it){ sp.visible=true; sp.position.set(it[1].x,it[1].y+(it[2]==='shard'?.6:.5),it[1].z); const pulse=.85+.15*Math.sin(G.time*2.4+i);
      sp.material.opacity=U.damp(sp.material.opacity,.75*S.k*pulse,6,dt); const sc=(it[2]==='shard'?1.3:1.7)*(1+.04*Math.sin(G.time*2.4+i)); sp.scale.set(sc,sc,1);
      sp.material.color.copy(it[2]==='shard'?C('#ffb4c8'):C('#ffd9a0')); }
    else{ sp.material.opacity=U.damp(sp.material.opacity,0,8,dt); sp.visible=sp.material.opacity>.01; } });
  if(list.length&&!S.said.outline){ S.said.outline=1; G.ui.say('Through the lens, something close by glows like a remembered thing — a keeper’s treasure the island hasn’t forgotten.',{priority:'low',key:'glassOutline'}); }
}

/* ================================================================ THE VIGNETTE (DOM: a brass ring of sepia-violet at the edges) */
let vig=null;
function buildVignette(){
  const st=document.createElement('style');
  st.textContent=`#glassVig{position:fixed;inset:0;pointer-events:none;opacity:0;z-index:4;
    background:radial-gradient(ellipse 72% 78% at 50% 50%,rgba(0,0,0,0) 54%,rgba(120,84,96,.32) 72%,rgba(58,34,62,.78) 90%,rgba(24,14,30,.95) 100%);
    box-shadow:inset 0 0 0 2px rgba(200,162,76,.25),inset 0 0 90px rgba(150,110,170,.35)}
    #glassVig::after{content:'';position:absolute;inset:0;background:rgba(190,150,120,.10);mix-blend-mode:color}
    #glassVig i{position:absolute;left:50%;top:50%;width:min(132vh,150vw);height:min(132vh,150vw);transform:translate(-50%,-50%);border-radius:50%;
      border:1px solid rgba(214,180,110,.18);box-shadow:0 0 0 1px rgba(60,30,40,.25)}
    @media (prefers-reduced-motion: reduce){ #glassVig{transition:none} }`;
  document.head.appendChild(st);
  vig=document.createElement('div'); vig.id='glassVig'; vig.setAttribute('aria-hidden','true'); vig.innerHTML='<i></i>'; document.body.appendChild(vig);
}

/* ================================================================ RAISING */
function canUse(){
  const P=G.player, m=G.state.mode;
  if(!S.owned||!P||P.alive===false)return false;
  const talking=!!document.querySelector('#talk:not([hidden])');
  if(m!=='play'&&!(m==='paused'&&talking))return false;
  const U_=G.undercroft; if(U_&&U_._debug&&U_._debug.S&&U_._debug.S.trans)return false;
  return true;
}
function refresh(){
  const want=S.owned&&(S.latch||S.hold)&&canUse();
  if(want!==S.raised){ S.raised=want; G.emit('glass:raise',{on:want});
    if(want&&!S.said.first){ S.said.first=1; } }
}
function applyToPlayer(dt){
  const P=G.player; if(!P)return;
  if(S.raised){
    const sprint=G.input.down('sprint');
    P.speedMul=sprint?.27:.42; S.slowSet=true;                       // a slow walk (sprint would be 8.4 m/s: keep it a walk)
    P.actionLock=Math.max(P.actionLock||0,.06);                       // no roll, no attack (and no interact) while you look
  }else if(S.slowSet){ S.slowSet=false; if(!(P.actionLock>.06)){ P.speedMul=1; P.actionLock=0; } }   // potions.js may own them now
}

/* ================================================================ THE NICHE (crypt chapel): the reward moment */
function nicheOpen(){
  if(S.niche)return true;
  const PP=G.undercroftPeople; if(PP&&PP.state&&PP.state.bells){ S.niche=true; return true; }
  return !PP;                                   // no People module: the niche stands open
}
G.on('undercroft:puzzle',e=>{ if(e&&e.id==='bells'&&e.solved)S.niche=true; });
const NV={root:null,slab:null,lens:null,glow:null,slabK:0};
function nicheAnchor(){ const R=G.undercroft&&G.undercroft.rooms&&G.undercroft.rooms.chapel; return R&&R.anchors.nicheShelf||null; }
function buildNiche(){
  const at=nicheAnchor(); if(!at)return;
  const root=new THREE.Group(); root.position.copy(at); G.undercroft&&G.scene.add(root); NV.root=root;
  // the Glass: a cracked lens in a brass ring on a little stand, leaning back
  const brass=G.toon(G.PAL.gold,{emissive:'#3a2a0c',emissiveIntensity:.35});
  const ring=new THREE.Mesh(new THREE.TorusGeometry(.16,.025,8,24),brass);
  const lensM=new THREE.MeshBasicMaterial({color:C('#e9d9ff'),transparent:true,opacity:.35,depthWrite:false});
  const lens=new THREE.Mesh(new THREE.CircleGeometry(.15,20),lensM);
  const crack=new THREE.Mesh(new THREE.PlaneGeometry(.01,.24),new THREE.MeshBasicMaterial({color:C('#f6efff')})); crack.rotation.z=.5; crack.position.z=.003;
  const handle=new THREE.Mesh(new THREE.CylinderGeometry(.018,.022,.16,6),brass); handle.position.y=-.24;
  const g=new THREE.Group(); g.add(ring,lens,crack,handle); g.position.set(0,.33,0); g.rotation.set(-.25,-PI/2,0); root.add(g); NV.lens=g;
  const glow=new THREE.Sprite(new THREE.SpriteMaterial({map:G.tex.soft,color:C('#ffcf8a'),transparent:true,opacity:.5,depthWrite:false,blending:THREE.AdditiveBlending}));
  glow.scale.set(1.1,1.1,1); glow.position.set(0,.33,0); root.add(glow); NV.glow=glow;
  // the stone that seals the niche until the bells ring true
  const slab=new THREE.Group(); const sm=G.toon('#5f5852'), dm=G.toon('#3f3a37');
  const face=new THREE.Mesh(new THREE.BoxGeometry(.18,1.9,2.0),sm); slab.add(face);
  for(const [y,z,w,h] of [[.35,0,.02,1.95],[-.3,0,1.96,.02],[.5,-.55,.02,.02],[0,.4,.9,.02]]){ const l=new THREE.Mesh(new THREE.BoxGeometry(.2,h===.02?.025:h,w===.02?.025:w),dm); l.position.set(-.005,y,z); slab.add(l); }
  const cross=new THREE.Mesh(new THREE.BoxGeometry(.2,.5,.08),dm); cross.position.set(-.01,.35,0); slab.add(cross); const cb=new THREE.Mesh(new THREE.BoxGeometry(.2,.08,.32),dm); cb.position.set(-.01,.45,0); slab.add(cb);
  slab.position.set(-1.0,-.25,0); root.add(slab); NV.slab=slab;
  G.interact.add({pos:()=>NV.root.position.clone().setY(NV.root.position.y-1.25),radius:1.9,priority:5,label:'Take the Remembering Glass',
    enabled:()=>!!(G.undercroft&&G.undercroft.inside)&&!S.owned&&nicheOpen()&&NV.slabK>.9, use:()=>{ API.give(); }});
}
function updateNiche(dt){
  if(!NV.root)return; const vis=!!(G.undercroft&&G.undercroft.inside); NV.root.visible=vis; if(!vis)return;
  NV.slabK=U.damp(NV.slabK,nicheOpen()?1:0,1.2,dt); if(nicheOpen()&&NV.slabK>.995)NV.slabK=1;
  NV.slab.position.z=-1.9*NV.slabK; NV.slab.visible=NV.slabK<.999;
  NV.lens.visible=NV.glow.visible=!S.owned;
  NV.lens.rotation.y=-PI/2+.15*Math.sin(G.time*.8); NV.glow.material.opacity=.38+.12*Math.sin(G.time*1.7);
}
function rewardMoment(){
  try{ G.ui.toast('The Remembering Glass',(G.input.device==='gamepad'?'Hold Y':G.input.device==='touch'||G.isMobile?'Hold the Glass button':'Hold G')+' to raise it · see what was taken'); }catch(_){}
  setTimeout(()=>{ try{ G.ui.say('A cracked lens in a brass ring, small enough for one hand — the lighthouse lens’s little sister. Through it, the chapel is fuller than it is: the edges of things that used to be here, warm as breath.',{priority:'high',key:'glassFound'}); }catch(_){} },700);
  try{ if(G.ui.flash)G.ui.flash('#ffd9a0'); }catch(_){}
}

/* ================================================================ PERSISTENCE */
if(G.persist&&G.persist.register) G.persist.register('glass',{
  save:()=>({v:1,owned:S.owned,seen:Object.keys(S.seen),niche:S.niche}),
  load:d=>{ if(!d)return; S.owned=!!d.owned; S.seen={}; (d.seen||[]).forEach(id=>{S.seen[id]=1;}); S.niche=!!d.niche; S.latch=false; S.hold=false; refresh(); }
});

/* ================================================================ SYSTEMS */
G.system('glassPre',{order:19,modes:['play'],update(){ const P=G.player; S.stamPre=P?P.stamina:null; }});
G.system('glass',{order:22,modes:'always',
  init(){
    G.scene.add(pastLayer);
    buildVignette(); buildOutlines();
    try{ islandEchoes(); }catch(e){ console.error('glass island echoes',e); }
    try{ buildNiche(); }catch(e){ console.error('glass niche',e); }
  },
  update(dt){
    T.value=G.time;
    const m=G.state.mode, talking=!!document.querySelector('#talk:not([hidden])');
    S.hold=S.owned&&m==='play'&&G.input.down('glass');
    refresh();
    const rdt=dt>0?dt:(talking?1/60:0);
    S.k=U.damp(S.k,S.raised?1:0,S.raised?5:7,rdt); if(!S.raised&&S.k<.003)S.k=0;
    K.value=smooth(0,1,S.k);
    pastLayer.visible=S.k>.01;
    if(vig)vig.style.opacity=(K.value*.95).toFixed(3);
    if(m==='play'){ applyToPlayer(dt);
      const P=G.player; if(S.raised&&P&&S.stamPre!=null&&P.stamina<S.stamPre){ P.stamina=S.stamPre; if(P.exhausted&&P.stamina>.05)P.exhausted=false; } } // no stamina cost
    updateEchoes(rdt); updateOutlines(rdt); updateNiche(rdt);
    // discoverability: standing where an echo hasn't been seen yet, the Glass is offered
    if(S.owned&&!S.raised&&m==='play'&&G.player&&G.player.alive){ const P=G.player, z=zoneNow();
      if(echoes.some(e=>e.zone===z&&!S.seen[e.id]&&Math.hypot(P.pos.x-e.pos.x,P.pos.z-e.pos.z)<e.r&&Math.abs(P.pos.y-e.pos.y)<4))
        G.hint(G.input.device==='gamepad'?'Y':'G','Hold up the Remembering Glass'); }
  }
});
G.on('player:dead',()=>{ S.latch=false; refresh(); });
G.on('undercroft:leaving',()=>{ S.latch=false; refresh(); });
G.on('undercroft:entering',()=>{ S.latch=false; refresh(); });

if(G.debug)API._debug={S,K,pastLayer,echoes,playEcho,NV,figureGeo};
})();
