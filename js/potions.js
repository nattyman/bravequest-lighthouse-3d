/* =====================================================================
   potions.js — Mender's Draught: a healing potion the Traveler carries
   G.potions {count, max, heal, add(n), drink()}, the bottle model
   (G.models.draught), the drinking action (H · D-pad up · the touch bottle),
   the two starter bottles in the cottage chest, sounds, persist key 'potions'.
   Brewed at the alchemy table (alchemy.js recipe 'mender'); the HUD chip and
   touch button live in hud.js. Hooks used in player.js: actionLock, speedMul,
   poseHooks, sheathe(), hands.right.
   ===================================================================== */
(function(){
'use strict';
const G=window.G, THREE=G.THREE, U=G.U;
const {clamp,smooth,lerp}=U;
const PI=Math.PI, TAU=PI*2;
const col=hex=>U.col(hex);

/* ---------- tuning ---------- */
const N={
  max:3,          // bottles carried (raise to 5 later)
  heal:6,         // half-hearts per draught (3 hearts)
  drink:.8,       // seconds the Traveler is committed to drinking
  gulpAt:.36,     // first heal tick (the first swallow)
  tick:1/6,       // one half-heart per tick → 6 over ~1 s
  slow:.42,       // walk-speed multiplier while drinking
  buffer:.6,      // a press during a roll/swing/stagger waits this long for it to end
  starter:2,      // bottles in the cottage chest
  // the drinking pose (right arm to the lips, head back): targets blended over the current pose
  pose:{shRX:-.9,shRXtip:-.25,shRY:-.5,shRZ:.3,elR:-2.4,wrRX:-.25,wrRXtip:-.55,wrRZ:.25,hdX:-.8,nkX:-.12,spX:-.06},
  hold:{x:0,y:-.02,z:.03,rx:0,rz:-1.2,s:1.5}  // the bottle in the right hand
};
const S={n:0,starter:false,ever:false,taught:0}; // saved
let drinkT=-1, healLeft=0, healT=0, bufT=0, refuseAt=-9;

const P=()=>G.player;
const canAct=st=>['idle','move','sprint','exhausted','jump','fall','glide'].includes(st);

G.potions={
  N,
  get count(){ return S.n; }, get max(){ return N.max; }, get heal(){ return N.heal; },
  get drinking(){ return drinkT>=0; }, get healing(){ return healLeft>0; },
  /** add n bottles (capped); returns how many fit */
  add(n=1,o={}){
    const before=S.n; S.n=clamp(S.n+n,0,N.max); const got=S.n-before;
    if(got>0){ S.ever=true; changed(got); if(!o.silent)G.ui.toast('Mender’s Draught',S.n+' of '+N.max+' carried'); }
    return got;
  },
  take(n=1){ if(S.n<n)return false; S.n-=n; changed(-n); return true; },
  /** try to drink now: true, or a reason string ('empty' | 'whole' | 'busy' | 'dead') */
  drink(){ return tryDrink(true); },
  get state(){ return Object.assign({},S,{drinkT,healLeft}); }
};
function changed(n){ G.emit('potions:change',{count:S.n,max:N.max,n}); }

/* ---------- the bottle ---------- */
let M=null;
function mats(){
  if(M)return M;
  M={
    glass:new THREE.MeshToonMaterial({color:col('#f3c49a'),gradientMap:G.gradientMap,transparent:true,opacity:.2,depthWrite:false}),
    liquid:new THREE.MeshBasicMaterial({color:new THREE.Color(1.05,.34,.16),fog:true}),   // warm rose-amber, just glowing
    cork:G.toon('#a8794c'), wire:G.toon('#c8a24c',{emissive:'#2a1a06'}), label:G.toon('#e6dbc0'), string:G.toon('#6c3f5f')
  };
  return M;
}
/** a small round-bellied flask (~13 cm), corked, brass wire at the neck, a parchment tag; origin at its base */
G.models=G.models||{};
G.models.draught=function(){
  const m=mats(), g=new THREE.Group(); g.name='draught';
  const prof=[[0,0],[.032,.002],[.048,.016],[.054,.04],[.05,.064],[.036,.082],[.017,.094],[.015,.118],[.019,.124],[.019,.128]].map(([x,y])=>new THREE.Vector2(x,y));
  const glass=new THREE.Mesh(new THREE.LatheGeometry(prof,14),m.glass); glass.renderOrder=3; g.add(glass);
  const liq=new THREE.Mesh(new THREE.SphereGeometry(.046,12,8,0,TAU,PI*.28,PI*.72),m.liquid); liq.position.y=.042; g.add(liq);
  const cork=new THREE.Mesh(new THREE.CylinderGeometry(.016,.013,.03,8),m.cork); cork.position.y=.136; g.add(cork); G.outline(cork,{thickness:.004});
  const wire=new THREE.Mesh(new THREE.TorusGeometry(.0175,.003,4,12),m.wire); wire.rotation.x=PI/2; wire.position.y=.108; g.add(wire);
  const tag=new THREE.Mesh(new THREE.BoxGeometry(.028,.034,.003),m.label); tag.position.set(.03,.07,.042); tag.rotation.set(-.15,.6,.12); g.add(tag);
  const str=new THREE.Mesh(new THREE.CylinderGeometry(.0012,.0012,.04,3),m.string); str.position.set(.022,.092,.03); str.rotation.set(.5,0,.7); g.add(str);
  const halo=new THREE.Sprite(new THREE.SpriteMaterial({map:G.tex.soft,color:col('#ffb07a'),transparent:true,opacity:.35,depthWrite:false,blending:THREE.AdditiveBlending}));
  halo.scale.setScalar(.16); halo.position.y=.05; g.add(halo); g.userData.halo=halo;
  g.traverse(o=>{ if(o.isMesh){o.castShadow=false;} });
  return g;
};

/* ---------- warm glow + motes around the Traveler while the draught takes ---------- */
const fx={glow:null,motes:[],acc:0,k:0};
function buildFx(){
  fx.glow=new THREE.Sprite(new THREE.SpriteMaterial({map:G.tex.soft,color:col('#ffb36e'),transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending}));
  fx.glow.scale.setScalar(2.2); fx.glow.visible=false; fx.glow.renderOrder=4; G.scene.add(fx.glow);
  for(let i=0;i<22;i++){ const s=new THREE.Sprite(new THREE.SpriteMaterial({map:G.tex.flame,color:col(i%3?'#ffc27a':'#ff9a8a'),transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending}));
    s.visible=false; s.userData={t:0,life:0,a:0,r:0,vy:0}; G.scene.add(s); fx.motes.push(s); }
}
function updateFx(dt){
  const p=P(); if(!fx.glow||!p||!p.pos)return;
  fx.k=U.damp(fx.k,healLeft>0||(drinkT>=N.gulpAt-.1)?1:0,healLeft>0?7:3,dt);
  fx.glow.visible=fx.k>.01;
  if(fx.glow.visible){ fx.glow.position.set(p.pos.x,p.pos.y+.9,p.pos.z); fx.glow.material.opacity=.55*fx.k*(.85+Math.sin(G.time*9)*.15); fx.glow.scale.setScalar(1.6+fx.k*.9); }
  if(healLeft>0){ fx.acc+=dt*26; while(fx.acc>=1){ fx.acc-=1; const s=fx.motes.find(m=>!m.visible); if(!s)break; const u=s.userData;
    u.t=0; u.life=.7+Math.random()*.5; u.a=Math.random()*TAU; u.r=.25+Math.random()*.3; u.vy=.9+Math.random()*.8; u.y=.1+Math.random()*.6; s.visible=true; } }
  for(const s of fx.motes){ if(!s.visible)continue; const u=s.userData; u.t+=dt; if(u.t>=u.life){s.visible=false; continue;}
    const k=u.t/u.life, a=u.a+u.t*2.2, r=u.r*(1-k*.5);
    s.position.set(p.pos.x+Math.cos(a)*r,p.pos.y+u.y+u.vy*u.t,p.pos.z+Math.sin(a)*r);
    s.material.opacity=Math.sin(k*PI)*.9; s.scale.setScalar(.09*(1-k*.4)); }
}

/* ---------- sounds (synth placeholders on the shared palette) ---------- */
function sfx(kind){
  const A=G.audio; if(!A||!A.ready||!A.S||!A.context)return;
  const S2=A.S, t=A.context.currentTime;
  try{
    if(kind==='uncork'){ S2.clank(t,{f:1850,g:.035}); S2.thud(t+.06,{g:.12,f0:900,f1:420,dur:.05,click:.6,nf:3200}); }      // glass clink + cork pop
    else if(kind==='gulp'){ for(let i=0;i<3;i++)S2.thud(t+i*.2,{g:.22,f0:230-i*15,f1:110,dur:.11,click:.15,nf:700}); }       // three swallows
    else if(kind==='mended'){ S2.chime(t,[69,73,76,81],{g:.055,step:.07,decay:1.3}); }                                     // soft warm chime
    else if(kind==='no'){ S2.clank(t,{f:1500,g:.02}); }
  }catch(_){}
}

/* ---------- drinking ---------- */
let bottle=null;
function tryDrink(fromInput){
  const p=P();
  if(G.state.mode!=='play'||!p||!p.alive)return 'dead';
  if(drinkT>=0)return 'busy';
  if(S.n<=0){ refuse('empty'); return 'empty'; }
  if(p.hp>=p.maxHp){ refuse('whole'); return 'whole'; }
  if(p.inputEnabled===false||!canAct(p.state)){ if(fromInput)bufT=N.buffer; return 'busy'; }
  start(); return true;
}
function refuse(reason){
  if(G.time-refuseAt<.25)return; refuseAt=G.time;
  G.emit('potion:refuse',{reason}); sfx('no');
}
function start(){
  const p=P(); bufT=0;
  S.n--; changed(-1);
  drinkT=0; healLeft=N.heal; healT=N.gulpAt; p.actionLock=N.drink; p.speedMul=N.slow;
  if(p.sheathe)p.sheathe();
  if(!bottle)bottle=G.models.draught();
  const h=N.hold; bottle.position.set(h.x,h.y,h.z); bottle.rotation.set(h.rx,0,h.rz); bottle.scale.setScalar(h.s);
  if(bottle.userData.halo)bottle.userData.halo.visible=false; // in the hand the liquid's own glow is enough
  const hand=p.hands&&p.hands.right; if(hand){ hand.add(bottle); bottle.visible=true; }
  G.emit('potion:drink',{count:S.n,heal:N.heal});
  sfx('uncork');
}
function stop(){ drinkT=-1; const p=P(); if(p){ p.actionLock=0; p.speedMul=1; } if(bottle&&bottle.parent)bottle.parent.remove(bottle); }
/* the pose: raise the bottle to the lips, tip the head back, lower it (layered over whatever the legs are doing) */
function pose(T){
  if(drinkT<0)return;
  const d=drinkT, up=smooth(0,.2,d)*(1-smooth(.64,.8,d)), tip=smooth(.22,.36,d)*(1-smooth(.58,.7,d)), Q=N.pose;
  T.shRX=lerp(T.shRX,Q.shRX+Q.shRXtip*tip,up); T.shRY=lerp(T.shRY,Q.shRY,up); T.shRZ=lerp(T.shRZ,Q.shRZ,up);
  T.elR=lerp(T.elR,Q.elR,up); T.wrRX=lerp(T.wrRX,Q.wrRX+Q.wrRXtip*tip,up); T.wrRZ=lerp(T.wrRZ,Q.wrRZ,up);
  T.hdX=lerp(T.hdX,Q.hdX,tip); T.nkX=lerp(T.nkX,Q.nkX,tip); T.spX=lerp(T.spX,Q.spX,tip);
  return 16;
}
function update(dt){
  const p=P(); if(!p)return;
  const playing=G.state.mode==='play';
  if(drinkT>=0){
    if(!p.alive){ stop(); healLeft=0; }
    else{ drinkT+=dt; p.actionLock=Math.max(0,N.drink-drinkT)+.001; p.speedMul=N.slow;
      if(drinkT>=N.drink)stop(); }
  }
  if(healLeft>0&&p.alive){
    healT-=dt;
    while(healT<=0&&healLeft>0){
      if(healLeft===N.heal)sfx('gulp');
      p.heal(1); healLeft--; healT+=N.tick;
      if(p.hp>=p.maxHp)healLeft=0;
      if(healLeft===0){ sfx('mended'); G.emit('potion:healed',{hp:p.hp}); }
    }
  }else if(!p.alive)healLeft=0;
  if(!playing)return;
  // input
  if(G.input.pressed('potion'))tryDrink(true);
  else if(bufT>0){ bufT-=dt; if(bufT>0&&canAct(p.state)&&p.inputEnabled!==false)tryDrink(false); }
  // teach the control (the first few times it would help: see 'player:hurt' below)
  if(teachT>0){ teachT-=dt; if(S.n>0&&drinkT<0&&p.hp<p.maxHp)G.hint(drinkKey(),'Drink a Mender’s Draught'); else teachT=0; }
}
let teachT=0;
function drinkKey(){ const dev=G.input.device; return dev==='gamepad'?'H':(G.isMobile?'Drink':'H'); } // hud.js maps H to the D-pad glyph on a pad

/* ---------- the starter bottles: in the cottage chest, beside the cloak ---------- */
let chestB=null, chestOpenedLive=false, starterT=-1;
function buildChest(){
  const C=G.world.landmarks&&G.world.landmarks.chest; if(!C)return;
  chestB=new THREE.Group(); chestB.position.set(C.x,C.y,C.z); G.scene.add(chestB);
  [[.3,.1,.4],[.37,-.06,-.3]].forEach(([x,z,ry])=>{ const b=G.models.draught(); b.position.set(x,.44,z); b.rotation.set(.12,ry,-.08); b.scale.setScalar(1.25); chestB.add(b); });
  chestB.visible=false;
  G.interact.add({pos:new THREE.Vector3(C.x+.3,C.y,C.z-.1),radius:1.6,priority:2,label:'Take the small bottles',
    enabled:()=>!S.starter&&!!(G.world.cottage&&G.world.cottage.chestOpen)&&!chestOpenedLive,use:takeStarter});
  G.on('chest:open',()=>{ chestOpenedLive=true; starterT=0; }); // taken just after the cloak (world.js lifts it out ~1 s after the lid opens)
}
function takeStarter(){
  if(S.starter)return; S.starter=true;
  if(chestB)chestB.visible=false;
  G.potions.add(N.starter,{silent:true});
  G.emit('pickup',{kind:'draught'});
  const k=G.input.device==='gamepad'?'D-pad up':G.isMobile?'the bottle button':'H';
  setTimeout(()=>G.ui.say('Tucked into the folds: two small stoppered bottles, warm to the touch, a tag tied to each in the keeper’s hand: “Mender’s Draught. For the bad nights.” ('+k+' to drink one when you’re hurt.)'),900);
  teachT=7;
}

/* ---------- saves ---------- */
const PERSIST={
  save:()=>({v:1,n:S.n,starter:S.starter,ever:S.ever,taught:S.taught}),
  load:d=>{ if(!d)return; stop(); healLeft=0; bufT=0;
    S.n=clamp(d.n|0,0,Math.max(N.max,5)); // up to 5 with the Wide Bandolier (progression.js raises N.max) S.starter=!!d.starter; S.ever=!!d.ever||S.n>0; S.taught=d.taught|0;
    if(chestB)chestB.visible=false; changed(0); }
};
if(G.persist&&G.persist.register)G.persist.register('potions',PERSIST);
else G.on('ready',()=>{ if(G.persist&&G.persist.register)G.persist.register('potions',PERSIST); });

G.system('potions',{order:25,modes:['play','dead','paused','menu'],
  init(){
    buildFx();
    try{ buildChest(); }catch(e){ console.error('potions chest',e); }
    if(G.player&&G.player.poseHooks)G.player.poseHooks.push(pose);
    G.on('player:respawn',()=>{ stop(); healLeft=0; });
    G.on('player:hurt',e=>{ const p=P(); if(S.n>0&&S.taught<3&&teachT<=0&&p&&p.alive&&e&&e.hp<=p.maxHp*.5){ S.taught++; teachT=6; } });
    changed(0);
  },
  update(dt){
    const mode=G.state.mode;
    if(mode==='play'||mode==='dead')update(dt);
    updateFx(mode==='play'||mode==='dead'?dt:0);
    if(starterT>=0&&mode==='play'){ starterT+=dt; const cl=G.items.cloak; if(S.starter)starterT=-1; else if((cl&&cl.owned&&starterT>1.5)||starterT>4){ starterT=-1; takeStarter(); } }
    if(chestB){ const open=!!(G.world.cottage&&G.world.cottage.chestOpen); chestB.visible=open&&!S.starter;
      if(chestB.visible)chestB.children.forEach((b,i)=>{ const h=b.userData.halo; if(h)h.material.opacity=.3+.12*Math.sin(G.time*3+i*2); }); }
  }
});

if(G.debug)G.potions.debug={set:n=>{ S.n=clamp(n|0,0,N.max); S.ever=S.ever||S.n>0; changed(0); },save:()=>PERSIST.save(),load:d=>PERSIST.load(d),S,
  get drinkT(){return drinkT;}, get healLeft(){return healLeft;}};
})();
