/* =====================================================================
   BRAVE QUEST: LIGHTHOUSE — undercroft_boss.js  (Boss agent)
   The Hamlet Undercroft (UNDERCROFT.md): the Undercroft's hostiles (Nameless, hollows, two hounds) and
   ALDOUS CRANE, THE TITHE-KEEPER in the Tithe Store. Persist 'undercroftBoss'.

   The fight (target 3–4 min for a decent player, tuned for 3–5 hearts and the staff moves):
   · Phase 1 — The Tithe (hp 40 → 24). He walks the store reciting names. Quill strike (an ink line telegraphed
     across the floor, then stabbed along), page storm (a telegraphed cone of sharp pages: dodge or roll),
     "Tithe!" (1–2 Nameless crawl out of the grain bins).
   · Phase 2 — The Borrowed (≤ 60 %). He comes apart into four ink-and-page people shaped like Tamsin, Corwin, Wren and
     Hob. One is him. Through the Remembering Glass (G.glass.raised / canSee) he shows warm and solid and the copies show
     empty; without it, his shadow trails his feet by a moment (the copies' shadows don't). Hitting a copy bursts it
     into pages at you; hitting him lands, and the four sink and stand up again shuffled. They re-form every ~15 s.
   · Phase 3 — The Bargain (≤ 25 %). He opens the ledger; the names pull the room's moths into it and eat them. The
     Skyfall Slam (or the Starfall Plunge) near him scatters the pages, or three charged bolts into the open ledger:
     either way he staggers (open to full, heavier blows). Body blows only half-land while the ledger is open.
   · Death of the player: the fight resets cleanly; you rise at the store door. Leaving the arena resets it too.
   · Defeat: he comes apart into a whirl of pages that settle into the ledger; the ledger drifts to the strongroom
     lectern (take it: G.progress.reward "The Tithe Ledger"); his last page lies where he fell ("I kept my name. I didn't
     keep anything else."); the strongroom and the exit shaft open (G.undercroft.openStrongroom/openExit if present, and
     always the event); progression.js drops a Keeper's Heart (8th heart) + 2 Keeper's Marks.

   Frame: G.undercroft (Place agent) when present, else O + local with O = (0, 60, −800).
   API: G.undercroftBoss = {state, phase, hp, maxHp, defeated, ledger, pageRead, fighting, crane, figures, monsters, T, debug}
   Events: undercroft:bossStart · undercroft:bossPhase {n} · undercroft:bossDead {pos, restored} · undercroft:bossReset
           undercroft:bossTelegraph {kind:'quill'|'pages'|'tithe'|'ledger', pos, lead} · undercroft:bossHit {damage, hp, real}
           undercroft:bossCopy {pos} (a copy burst) · undercroft:bossStagger {by:'slam'|'bolt'} · undercroft:ledger {taken}
           undercroft:lastPage · monster:killed {kind:'crane', boss:true}
   Listens: undercroft:trap {pos} (Corwin's collapsing floor: two Nameless wait in the pit)
   ===================================================================== */
(function(){
'use strict';
const G=window.G, THREE=G.THREE, U=G.U, PI=Math.PI, TAU=PI*2;
const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const rnd=U.rng(5821);
const FX=()=>(G.monsters&&G.monsters.fx)||null;
const INK=()=>G.ink||null;
const isPlay=()=>G.state.mode==='play';
const UC=()=>G.undercroft||null;

/* ---------------------------------------------------------------- frame (G.undercroft when present, else O + local) */
const O_FALL=V(0,60,-800);
const origin=()=>{ const u=UC(); return u&&u.origin&&u.origin.isVector3?u.origin:O_FALL; };
function W(x,y,z){ const u=UC(); if(u&&u.toWorld){ try{ const v=u.toWorld(x,y,z); if(v&&isFinite(v.x))return V(v.x,v.y,v.z); }catch(e){} } const o=origin(); return V(o.x+x,o.y+y,o.z+z); }
function toLocal(v){ const o=origin(); return V(v.x-o.x,v.y-o.y,v.z-o.z); }
const LOCAL={stair:{c:[0,0,0],r:7},cellars:{c:[0,-2,-24],r:14,box:[-15,15,-34,-14]},chapel:{c:[-22,-4,-48],r:10},mill:{c:[22,-6,-50],r:10},store:{c:[0,-8,-80],r:16}};
const FB={ 'store.door':[0,-8,-63.5], 'store.centre':[0,-8,-80], 'store.lectern':[0,-8,-99], 'store.exit':[11,-8,-93] };
function anchor(room,name,all){
  const u=UC(), r=u&&u.rooms&&u.rooms[room]; let a=r&&r.anchors&&r.anchors[name];
  if(Array.isArray(a)){ if(all)return a.filter(q=>q&&isFinite(q.x)).map(q=>V(q.x,q.y,q.z)); a=a[0]; }
  if(a&&isFinite(a.x))return all?[V(a.x,a.y,a.z)]:V(a.x,a.y,a.z);
  const f=FB[room+'.'+name]; if(!f)return all?[]:null; const w=W(f[0],f[1],f[2]); return all?[w]:w;
}
function roomCentre(id){ const u=UC(), r=u&&u.rooms&&u.rooms[id]; if(r&&r.centre&&isFinite(r.centre.x))return V(r.centre.x,r.centre.y,r.centre.z); const l=LOCAL[id]; return W(l.c[0],l.c[1],l.c[2]); }
function roomOf(p){
  const u=UC(); if(u&&u.room){ try{ return u.room(p); }catch(e){} }
  const l=toLocal(p); if(Math.abs(l.y+4)>14)return null;
  for(const id in LOCAL){ const f=LOCAL[id]; if(f.box){ if(l.x>f.box[0]&&l.x<f.box[1]&&l.z>f.box[2]&&l.z<f.box[3])return id; continue; }
    if(Math.hypot(l.x-f.c[0],l.z-f.c[2])<f.r+(id==='store'?3:1))return id; }
  return null;
}
function inside(){
  const u=UC(); if(u&&'inside' in u)return !!u.inside;
  const P=G.player; if(!P||!P.pos)return false; const l=toLocal(P.pos);
  return Math.abs(l.y+4)<14&&l.x>-40&&l.x<40&&l.z>-112&&l.z<12;
}
const floorAt=(x,z,y)=>{ const f=G.floorAt(x,z,y); return isFinite(f)?f:-1e9; };
const groundAt=(p,fb)=>{ const y=floorAt(p.x,p.z,p.y+2); return y>p.y-4&&y<p.y+4?y:(fb!=null?fb:p.y); };

/* ---------------------------------------------------------------- save state */
const S={v:1,defeated:false,ledger:false,pageRead:false,bossSeen:false,said:{}};
const say=(k,text,who,o)=>{ if(S.said[k])return false; S.said[k]=1; G.ui.say(text,who,o); return true; };

/* beats on game time (works with G.step) */
const beats=[];
const later=(s,fn)=>beats.push({t:G.time+s,fn});
function runBeats(){ for(let i=beats.length-1;i>=0;i--){ if(G.time>=beats[i].t){ const b=beats.splice(i,1)[0]; try{b.fn();}catch(e){console.error('undercroftBoss beat',e);} } } }

/* ---------------------------------------------------------------- audio (audio.js owns the sounds; quiet if absent) */
function snd(name,pos){ const A=G.audio, u=A&&A.undercroft; if(!u||!u.play)return; try{ u.play(name,pos); }catch(e){} }
function music(on){ try{ const M=G.audio&&G.audio.music; if(M&&M.setOverride){ if(on)M.setOverride('boss'); else if(M.state==='boss'||on===false)M.setOverride(null); } }catch(e){} }

/* =====================================================================
   1. THE UNDERCROFT'S HOSTILES — packs spawn when the player first stands in a room on a visit (as in the sea cave);
      whatever is left alive is cleared when the player leaves the Undercroft, and the next visit brings them back.
      13 across the rooms + 2 in Corwin's trap pit + the boss's summons = the cave's level of combat.
      Nameless shuffle in twos and threes, so a pack's Nameless spawn clustered.
   ===================================================================== */
const PACKS={
  cellars:{nameless:3,hollow:2},     // five family cellars knocked through: Tamsin is here
  chapel:{nameless:3,hollow:1},      // the crypt chapel (pews, the font)
  mill:{nameless:2,hound:2}          // the mill-race: the two hounds
};
const spawned=new Set(), mine=[];
let curRoom=null, roomT=0, wasInside=false;
function okSpot(x,z,c,room,taken,P,minP){
  const y=floorAt(x,z,c.y+3); if(y<c.y-3||y>c.y+2.5)return null;
  if(G.world.walkable&&!G.world.walkable(x,z))return null;
  if(roomOf(V(x,y+.5,z))!==room)return null;
  if(P&&Math.hypot(P.x-x,P.z-z)<minP)return null;
  if(taken.some(t=>Math.hypot(t.x-x,t.z-z)<1.6))return null;
  return V(x,y,z);
}
function pickSpot(room,taken,near){
  const c=roomCentre(room), u=UC(), r=u&&u.rooms&&u.rooms[room], b=r&&r.bounds, P=G.player&&G.player.pos, R=LOCAL[room].r;
  for(let k=0;k<50;k++){
    let x,z;
    if(near&&k<30){ const a=rnd()*TAU, d=1.5+rnd()*2; x=near.x+Math.cos(a)*d; z=near.z+Math.sin(a)*d; }
    else if(b&&b.min&&b.max){ x=U.lerp(b.min.x+2,b.max.x-2,rnd()); z=U.lerp(b.min.z+2,b.max.z-2,rnd()); }
    else { const a=rnd()*TAU, d=Math.sqrt(rnd())*R*.75; x=c.x+Math.cos(a)*d; z=c.z+Math.sin(a)*d; }
    const v=okSpot(x,z,c,room,taken,P,k<35?8:4); if(v){ taken.push(v); return v; }
  }
  return null;
}
function spawnPack(room){
  const pk=PACKS[room]; if(!pk||!G.monsters||!G.monsters.spawn)return; spawned.add(room);
  const c=roomCentre(room), zone={name:'undercroft-'+room,x:c.x,z:c.z,r:LOCAL[room].r+2}, taken=[];
  let cluster=null;
  for(const kind of ['nameless','hollow','hound']){
    for(let i=0;i<(pk[kind]||0);i++){
      const p=pickSpot(room,taken,kind==='nameless'?cluster:null); if(!p)continue;
      if(kind==='nameless'&&!cluster)cluster=p;
      try{ mine.push(G.monsters.spawn(kind,{x:p.x,y:p.y,z:p.z},{zone,undercroft:room,intro:kind!=='hound'})); }catch(e){console.error('undercroft spawn',e);}
    }
  }
}
function clearMine(){ for(const m of mine)if(m.alive&&G.monsters.despawn)G.monsters.despawn(m); mine.length=0; spawned.clear(); }
G.on('undercroft:trap',e=>{ // Corwin's lie: the floor gives way into a Nameless pit (survivable)
  const p=e&&e.pos; if(!p||!G.monsters)return; const room=roomOf(p)||'cellars', c=roomCentre(room);
  for(let i=0;i<2;i++){ const a=rnd()*TAU, x=p.x+Math.cos(a)*2.4, z=p.z+Math.sin(a)*2.4;
    try{ mine.push(G.monsters.spawn('nameless',{x,y:p.y,z},{zone:{name:'undercroft-pit',x:p.x,z:p.z,r:8},undercroft:room,intro:true,aggro:true})); }catch(err){console.error(err);} }
  void c;
});
function updateRooms(dt){
  const ins=inside();
  if(ins&&!wasInside)spawned.clear();
  if(!ins&&wasInside){ clearMine(); curRoom=null; }
  wasInside=ins; if(!ins)return;
  roomT-=dt; if(roomT>0)return; roomT=.25;
  const P=G.player; if(!P||!P.pos)return;
  const id=roomOf(P.pos); curRoom=id;
  if(id&&PACKS[id]&&!spawned.has(id)&&isPlay())spawnPack(id);
  for(let i=mine.length-1;i>=0;i--){ const m=mine[i]; if(!m.alive){ mine.splice(i,1); continue; }
    if(m.pos.y<origin().y-30&&G.monsters.despawn){ G.monsters.despawn(m); mine.splice(i,1); } }
}

/* =====================================================================
   2. ALDOUS CRANE, THE TITHE-KEEPER
   ===================================================================== */
const T={hp:40,p2:24,p3:10,speed:1.35,keep:5.5,reach:15,arenaR:16,startR:12,leaveR:19,
  quillWind:1.0,quillLen:13,quillW:1.3,quillDmg:2,
  pageWind:.95,pageArc:1.0,pageLen:10,pageN:12,pageSpeed:13,pageDmg:2,
  titheWind:1.3,titheEvery:20,titheMax:3,
  cool:[1.6,2.6],coolP3:[1.3,2.1],
  figR:8,figSpeed:1.1,reform:15,lag:.42,copyBurstN:7,copyDmg:1,figAtkEvery:[3.2,4.6],
  ledgerOpen:10,ledgerShut:6,eatRate:3,boltHits:3,slamR:7.5,stagger:3.6,staggerMul:1.5,guardMul:.5};
const B={built:false,state:'dormant',st:0,phase:1,hp:T.hp,pos:V(),heading:0,cool:2,atk:null,flash:0,fade:1,tithecd:6,
  started:false,outT:0,speedNow:0,shuffleAt:0,reciteT:4,staggerT:0,ledger:{open:false,k:0,t:0,hits:0,shut:T.ledgerShut},deadT:0,
  figs:[],reformT:0,figAtkT:3,shuffleT:0,lastHitT:-9,said:{}};
let C=V(), floorY=0, door=V(), home=V(), summoned=[];
function arenaGeo(){
  C=anchor('store','centre'); floorY=groundAt(C,C.y); C.y=floorY;
  door=anchor('store','door'); door.y=groundAt(door,floorY);
  home.set(C.x,floorY,C.z-5);
}
function bins(){
  let b=anchor('store','bins',true); if(b.length>=2)return b;
  b=[]; for(const a of [-2.3,-1.6,-.9,-.2,.5,1.2,1.9,2.6]){ const ang=-PI/2+a; b.push(V(C.x+Math.cos(ang)*13,floorY,C.z+Math.sin(ang)*13)); } // round the far wall
  return b;
}

/* ---------------------------------------------------------------- materials */
let MAT=null, pageTexture=null;
function pageTex(){
  if(pageTexture)return pageTexture;
  pageTexture=G.canvasTex(256,(g,s)=>{
    g.fillStyle='#d6c9ab'; g.fillRect(0,0,s,s);
    g.strokeStyle='rgba(120,96,70,.35)'; g.lineWidth=1; for(let y=10;y<s;y+=14){ g.beginPath(); g.moveTo(0,y); g.lineTo(s,y); g.stroke(); }
    g.strokeStyle='rgba(150,60,60,.35)'; g.beginPath(); g.moveTo(26,0); g.lineTo(26,s); g.stroke();
    // a thousand names in a cramped reeve's hand (scribbled, unreadable at this size; the ink is what matters)
    g.strokeStyle='rgba(28,16,34,.88)'; g.lineWidth=1.3; const r=U.rng(77);
    for(let y=8;y<s;y+=14){ let x=30+r()*6; g.beginPath(); g.moveTo(x,y);
      while(x<s-8){ const w=10+r()*26; for(let k=0;k<w;k+=3){ x+=3; g.lineTo(x,y-1.5-Math.abs(Math.sin(k*.9+r()*3))*4.2+r()*1.2); } x+=5+r()*8; g.moveTo(x,y); }
      g.stroke(); }
    for(let i=0;i<14;i++){ g.fillStyle='rgba(40,20,50,'+(.15+r()*.3)+')'; g.beginPath(); g.arc(r()*s,r()*s,2+r()*6,0,TAU); g.fill(); } // blots
  },true);
  pageTexture.wrapS=pageTexture.wrapT=THREE.RepeatWrapping; return pageTexture;
}
function mats(){
  if(MAT)return MAT;
  const t=pageTex();
  MAT={
    skin:G.toon('#cbbfa4',{map:t,emissive:'#1c1420'}),
    coat:G.toon('#3a2a24',{emissive:'#0c0808'}), coatDark:G.toon('#241a18'), hat:G.toon('#1e1719'),
    leather:G.toon('#4a2a26',{emissive:'#120606'}), brass:G.toon('#a88a46',{emissive:'#2a1e08'}),
    quill:G.toon('#d8d2c8',{emissive:'#1a1a1a'}), eye:new THREE.MeshBasicMaterial({color:0x120a18}),
    paper:new THREE.MeshBasicMaterial({map:t,color:U.col('#e8dcc0'),side:THREE.DoubleSide,transparent:true,opacity:1}),
    leaf:new THREE.MeshBasicMaterial({map:t,color:U.col('#f6ead0').multiplyScalar(1.6),side:THREE.DoubleSide,transparent:true,depthWrite:false}),
    shadow:new THREE.MeshBasicMaterial({map:G.tex.soft,color:0x000000,transparent:true,opacity:.7,depthWrite:false}),
    spike:G.toon('#120c18',{emissive:'#2a1450'})
  };
  return MAT;
}
function decalTex(kind){
  return G.canvasTex(128,(g,s)=>{
    if(kind==='line'){ const gr=g.createLinearGradient(0,0,s,0); gr.addColorStop(0,'rgba(255,255,255,0)'); gr.addColorStop(.25,'rgba(255,255,255,.6)'); gr.addColorStop(.5,'rgba(255,255,255,1)'); gr.addColorStop(.75,'rgba(255,255,255,.6)'); gr.addColorStop(1,'rgba(255,255,255,0)'); g.fillStyle=gr; g.fillRect(0,0,s,s);
      g.fillStyle='rgba(255,255,255,.9)'; for(let y=0;y<s;y+=16){ g.fillRect(s*.47,y,s*.06,8); } }
    else { const gr=g.createRadialGradient(s/2,s/2,0,s/2,s/2,s/2); gr.addColorStop(0,'rgba(255,255,255,.15)'); gr.addColorStop(.8,'rgba(255,255,255,.55)'); gr.addColorStop(.97,'rgba(255,255,255,1)'); gr.addColorStop(1,'rgba(255,255,255,0)'); g.fillStyle=gr; g.fillRect(0,0,s,s); }
  });
}

/* ---------------------------------------------------------------- models */
let crane=null, ledgerHB=null, craneHB=null, glowLight=null;
const flutter=[];
function addM(parent,geo,mat,x=0,y=0,z=0){ const m=new THREE.Mesh(geo,mat); m.position.set(x,y,z); parent.add(m); return m; }
function buildCrane(){
  const M=mats(), g=new THREE.Group(); g.name='craneBoss';
  const body=new THREE.Group(); g.add(body);
  // the reeve's coat: long, flared, buttoned; worn thin
  const coat=addM(body,new THREE.LatheGeometry([[.62,0],[.6,.15],[.5,.8],[.4,1.5],[.36,2.0],[.4,2.25],[.3,2.42],[0,2.45]].map(([r,y])=>new THREE.Vector2(r,y)),20),M.coat);
  if(G.outline)G.outline(coat,{thickness:.02});
  for(let i=0;i<5;i++)addM(body,new THREE.SphereGeometry(.035,6,5),M.brass,0,1.3+i*.2,.38-i*.004);
  const collar=addM(body,new THREE.TorusGeometry(.26,.07,6,16),M.coatDark,0,2.4,0); collar.rotation.x=PI/2;
  // neck + head of pages (the names crawl over them: the texture scrolls)
  addM(body,new THREE.CylinderGeometry(.14,.2,.4,12),M.skin,0,2.6,0);
  const head=new THREE.Group(); head.position.set(0,2.98,.02); body.add(head);
  const hd=addM(head,new THREE.SphereGeometry(.27,18,14),M.skin); hd.scale.set(.84,1.18,.92); if(G.outline)G.outline(hd,{thickness:.015});
  for(const s of [-1,1]){ const e=addM(head,new THREE.SphereGeometry(.045,8,6),M.eye,s*.09,.04,.22); e.scale.set(1,.55,.4); }   // two tired ink hollows
  const brim=addM(head,new THREE.CylinderGeometry(.42,.42,.04,20),M.hat,0,.27,0); brim.rotation.x=-.08;
  addM(head,new THREE.CylinderGeometry(.22,.25,.42,16),M.hat,0,.48,0);
  // arms: long sleeves, page hands; the quill in the right, the ledger in the left
  const arms=[];
  for(const s of [-1,1]){
    const sh=new THREE.Group(); sh.position.set(s*.36,2.3,0); body.add(sh);
    addM(sh,new THREE.CylinderGeometry(.1,.14,1.0,10),M.coat,0,-.5,0);
    const el=new THREE.Group(); el.position.y=-1.0; sh.add(el);
    addM(el,new THREE.CylinderGeometry(.08,.11,.9,10),M.coat,0,-.45,0);
    const hand=new THREE.Group(); hand.position.y=-.95; el.add(hand);
    addM(hand,new THREE.SphereGeometry(.09,10,8),M.skin).scale.set(.8,1.3,.6);
    arms.push({sh,el,hand,s});
  }
  const quill=new THREE.Group(); quill.position.set(0,-.08,.05); quill.rotation.x=PI*.5; arms[1].hand.add(quill);
  addM(quill,new THREE.CylinderGeometry(.012,.004,.9,6),M.quill,0,.35,0);
  const vane=addM(quill,new THREE.PlaneGeometry(.14,.6),M.leaf,0,.5,0); vane.rotation.y=.3;
  // the ledger: a heavy book bound in red-brown leather; opens in phase 3
  const ledger=new THREE.Group(); ledger.position.set(0,-.12,.12); arms[0].hand.add(ledger);
  const coverL=new THREE.Group(), coverR=new THREE.Group(); ledger.add(coverL,coverR);
  addM(coverL,new THREE.BoxGeometry(.36,.05,.5),M.leather,-.18,0,0);
  addM(coverR,new THREE.BoxGeometry(.36,.05,.5),M.leather,.18,0,0);
  const leaves=addM(ledger,new THREE.PlaneGeometry(.68,.46),M.leaf,0,.03,0); leaves.rotation.x=-PI/2; leaves.visible=false;
  const lglow=new THREE.Sprite(new THREE.SpriteMaterial({map:G.tex.soft,color:U.col('#ffd9a0'),transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending})); lglow.scale.setScalar(2.4); lglow.position.y=.3; ledger.add(lglow);
  // loose pages always circling him, more of them before a storm
  for(let i=0;i<10;i++){ const p=addM(g,new THREE.PlaneGeometry(.22,.3),M.leaf); p.userData={a:i/10*TAU,r:.9+rnd()*.6,h:.6+rnd()*2.6,sp:.6+rnd()*.6}; flutter.push(p); }
  glowLight=new THREE.PointLight(0xc9a8ff,.9,10,1.6); glowLight.position.set(0,2.8,.6); g.add(glowLight);
  g.visible=false; G.scene.add(g);
  return {g,body,head,arms,quill,ledger,coverL,coverR,leaves,lglow};
}
/* the Borrowed: four people of ink and pages, shaped like the villagers you've met */
const SHAPES={
  tamsin:{h:1.5,skirt:[.42,.95],torso:[.2,.42],hunch:.45,head:.15,shawl:true},
  corwin:{h:1.95,skirt:[.3,1.2],torso:[.17,.55],hunch:.12,head:.15,hat:'clerk',sleeves:true},
  wren:{h:1.35,skirt:[.34,.75],torso:[.14,.36],hunch:.05,head:.14,hair:true},
  hob:{h:1.85,skirt:[.48,1.0],torso:[.27,.55],hunch:.2,head:.17,hat:'cap'}
};
function figMats(){ const t=pageTex();
  return {ink:G.toon('#6a6474',{map:t,emissive:'#140c1c',transparent:true}),
          warm:new THREE.MeshBasicMaterial({color:U.col('#ffcf96'),transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending})}; }
function buildFigure(kind){
  const sh=SHAPES[kind], m=figMats(), g=new THREE.Group(), body=new THREE.Group(); g.add(body);
  const parts=[];
  const add=(geo,x,y,z)=>{ const a=addM(body,geo,m.ink,x,y,z); parts.push(a); const w=new THREE.Mesh(geo,m.warm); w.position.copy(a.position); w.rotation.copy(a.rotation); w.scale.copy(a.scale).multiplyScalar(1.06); body.add(w); a.userData.warm=w; return a; };
  add(new THREE.CylinderGeometry(sh.skirt[0]*.55,sh.skirt[0],sh.skirt[1],14),0,sh.skirt[1]/2,0);
  const tor=add(new THREE.CylinderGeometry(sh.torso[0]*.85,sh.torso[0],sh.torso[1],12),0,sh.skirt[1]+sh.torso[1]/2,sh.hunch*.25); tor.rotation.x=sh.hunch; tor.userData.warm.rotation.x=sh.hunch;
  const hy=sh.skirt[1]+sh.torso[1]+sh.head*.9, hz=sh.hunch*.55;
  add(new THREE.SphereGeometry(sh.head,14,12),0,hy,hz);
  if(sh.shawl){ const s=add(new THREE.SphereGeometry(sh.torso[0]*1.6,12,8,0,TAU,0,PI*.45),0,sh.skirt[1]+sh.torso[1]*.8,sh.hunch*.35); s.scale.set(1.1,.7,1); s.userData.warm.scale.set(1.17,.75,1.06); }
  if(sh.hat==='clerk'){ add(new THREE.CylinderGeometry(sh.head*1.6,sh.head*1.6,.03,14),0,hy+sh.head*.8,hz); add(new THREE.CylinderGeometry(sh.head*.9,sh.head,.18,12),0,hy+sh.head*.8+.1,hz); }
  if(sh.hat==='cap'){ const c=add(new THREE.SphereGeometry(sh.head*1.1,12,8,0,TAU,0,PI*.5),0,hy+sh.head*.35,hz); c.scale.set(1.15,.6,1.2); c.userData.warm.scale.set(1.22,.64,1.27); }
  if(sh.hair)add(new THREE.CylinderGeometry(sh.head*.9,sh.head*.6,.5,10),0,hy-.18,hz-.08);
  if(sh.sleeves)for(const s of [-1,1]){ const a=add(new THREE.CylinderGeometry(.05,.07,.7,8),s*(sh.torso[0]+.06),sh.skirt[1]+sh.torso[1]*.45,.06); a.rotation.z=s*.12; a.userData.warm.rotation.z=s*.12; }
  // its shadow: a soft dark pool with a faint pale rim, so it reads on the store's dark floor
  const shadow=new THREE.Group();
  const sd=new THREE.Mesh(new THREE.PlaneGeometry(1.7,1.7).rotateX(-PI/2),mats().shadow); shadow.add(sd);
  const rim=new THREE.Mesh(new THREE.RingGeometry(.6,.68,28).rotateX(-PI/2),new THREE.MeshBasicMaterial({color:U.col('#b9a6d8'),transparent:true,opacity:.28,depthWrite:false}));
  rim.position.y=.005; shadow.add(rim); shadow.renderOrder=1; G.scene.add(shadow);
  g.visible=false; shadow.visible=false; G.scene.add(g);
  return {kind,g,body,parts,mats:m,shadow,shadowRim:rim.material,h:sh.h};
}
/* pools: page projectiles, quill spikes, ground telegraphs */
const pagePool=[], spikePool=[];
let lineDecal=null, coneDecal=null, ringDecal=null;
function buildPools(){
  const M=mats(), pg=new THREE.PlaneGeometry(.34,.44);
  for(let i=0;i<30;i++){ const m=new THREE.Mesh(pg,M.paper); m.visible=false; m.userData.busy=false; pagePool.push(m); }
  const cg=new THREE.ConeGeometry(.16,1.1,5); cg.translate(0,.55,0);
  for(let i=0;i<16;i++){ const m=new THREE.Mesh(cg,M.spike); m.visible=false; G.scene.add(m); spikePool.push({m,t:9,x:0,z:0,d:0}); }
  const dm=t=>new THREE.MeshBasicMaterial({map:t,color:U.col('#9a6cff'),transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide});
  lineDecal=new THREE.Mesh(new THREE.PlaneGeometry(1,1).rotateX(-PI/2).translate(0,0,.5),dm(decalTex('line')));
  coneDecal=new THREE.Mesh(new THREE.CircleGeometry(1,28,0,1).rotateX(-PI/2),dm(decalTex('ring')));
  ringDecal=new THREE.Mesh(new THREE.RingGeometry(.85,1,40).rotateX(-PI/2),dm(null)); ringDecal.material.map=null;
  for(const d of [lineDecal,coneDecal,ringDecal]){ d.visible=false; d.renderOrder=2; G.scene.add(d); }
}
function build(){
  if(B.built)return; B.built=true; arenaGeo();
  crane=buildCrane(); buildPools();
  for(const k of ['tamsin','corwin','wren','hob'])B.figs.push(Object.assign(buildFigure(k),{pos:V(),hist:[],real:false,alive:false,hb:null,ang:0,face:0,burst:0,sink:0}));
  craneHB={team:'enemy',pos:B.pos,radius:.85,height:3.4,targetable:true,corrupt:false,name:'Aldous Crane',lockOffset:2.1,crane:true,
    alive:()=>B.state==='fight'&&B.phase!==2&&B.fade>.5,hit:info=>hitCrane(info)};
  G.combat.add(craneHB);
  // the open ledger: the moths' prey (creatures.js steers the swarm onto corrupt hurtboxes that opt in) + the bolt weak point
  ledgerHB={team:'enemy',pos:V(),radius:.6,height:1.1,targetable:false,corrupt:true,name:'The Tithe Ledger',lockOffset:.55,ledger:true,
    mothPrey:()=>B.ledger.open,mothRange:30,mothWant:999,mothDamage:0,
    alive:()=>B.state==='fight'&&B.phase===3&&B.ledger.open,hit:info=>hitLedger(info)};
  Object.defineProperty(ledgerHB,'targetable',{get:()=>B.ledger.open&&B.phase===3,enumerable:true});
  G.combat.add(ledgerHB);
  for(const f of B.figs){
    f.hb={team:'enemy',pos:f.pos,radius:.55,height:1.8,targetable:true,corrupt:false,name:'One of the Borrowed',lockOffset:1.1,fig:f,
      alive:()=>B.state==='fight'&&B.phase===2&&f.alive&&f.sink<.5,hit:info=>hitFigure(f,info)};
    G.combat.add(f.hb);
  }
}

/* ---------------------------------------------------------------- telegraphs + attacks */
const _d=V(), _e=V();
function showLine(from,dir,len,w,k){ lineDecal.visible=k>0; lineDecal.position.set(from.x,floorY+.06,from.z); lineDecal.rotation.y=Math.atan2(dir.x,dir.z); lineDecal.scale.set(w,1,len); lineDecal.material.opacity=k; }
function showCone(at,yaw,arc,len,k){ coneDecal.visible=k>0; coneDecal.position.set(at.x,floorY+.07,at.z); coneDecal.scale.set(len,1,len);
  coneDecal.rotation.set(0,yaw-PI/2-arc/2,0); // the sector (from +x, swept toward −z once laid flat) turned to centre on yaw
  coneDecal.material.opacity=k*.75; }
function hideDecals(){ for(const d of [lineDecal,coneDecal,ringDecal])if(d)d.visible=false; }
function fireQuill(src,dir,len){
  // the line stabs: ink spikes burst up one after another along it, each one a strike
  const n=Math.round(len/1.0); let k=0;
  for(const s of spikePool){ if(k>=n)break; s.t=-k*.022; s.x=src.x+dir.x*(1+k); s.z=src.z+dir.z*(1+k); s.d=k; s.hit=false; k++; }
  B.quill={set:new Set(),t:0};
  G.ui.shake&&G.ui.shake(.18); snd('crane_quill',src);
}
function updateSpikes(dt){
  const P=G.player;
  for(const s of spikePool){
    if(s.t>=.9){ s.m.visible=false; continue; }
    s.t+=dt; if(s.t<0){ s.m.visible=false; continue; }
    const k=s.t<.08?s.t/.08:1-U.smooth(.45,.9,s.t);
    s.m.visible=k>.02; s.m.position.set(s.x,floorY-.05,s.z); s.m.scale.set(1,Math.max(.01,k*(1+.25*Math.sin(s.d*1.7))),1); s.m.rotation.set(Math.sin(s.d)*.25,s.d,Math.cos(s.d*1.3)*.25);
    if(!s.hit&&s.t>0&&s.t<.2&&B.quill){ s.hit=true;
      G.combat.strike({x:s.x,y:floorY+.6,z:s.z,radius:.7,team:'enemy',damage:T.quillDmg,knockback:7,kind:'melee',source:craneHB,exclude:B.quill.set});
      const I=INK(); if(I&&s.d%2===0)I.burst(V(s.x,floorY+.2,s.z),{n:5,speed:2,size:[.3,.7],life:[.3,.7],up:1.5,embers:2,drops:3}); }
  }
  void P;
}
function firePages(src,dir,arc,n,dmg,speed){
  const yaw=Math.atan2(dir.x,dir.z);
  for(let i=0;i<n;i++){ const m=pagePool.find(q=>!q.userData.busy); if(!m)break; m.userData.busy=true; m.visible=true;
    const a=yaw+(n>1?(i/(n-1)-.5):0)*arc+(rnd()-.5)*.08, sp=speed*(.85+rnd()*.3);
    const pos=V(src.x+Math.sin(a)*.6,floorY+1.0+rnd()*.9,src.z+Math.cos(a)*.6);
    m.rotation.set(rnd()*PI,rnd()*PI,0);
    G.combat.spawnProjectile({pos,vel:V(Math.sin(a)*sp,(rnd()-.4)*.8,Math.cos(a)*sp),radius:.32,team:'enemy',damage:dmg,life:T.pageLen/sp+.15,kind:'melee',knockback:3,mesh:m,spin:9,
      onEnd:()=>{ m.userData.busy=false; m.visible=false; }});
  }
  snd('crane_pages',src);
}
function telegraph(kind,pos,lead){ G.emit('undercroft:bossTelegraph',{kind,pos:pos.clone(),lead}); }
function chooseAttack(){
  const pp=G.player.pos, d=Math.hypot(pp.x-B.pos.x,pp.z-B.pos.z);
  _d.set(pp.x-B.pos.x,0,pp.z-B.pos.z).normalize();
  const alive=summoned.filter(m=>m.alive&&!m.dying).length;
  if(B.noAtk)return;
  if(B.tithecd<=0&&alive<2&&(B.phase===1||B.phase===3)){ B.atk={kind:'tithe',t:0}; B.tithecd=T.titheEvery; telegraph('tithe',B.pos,T.titheWind);
    G.ui.say('“Tithe!”','Aldous Crane',{priority:'low',key:'crane'}); snd('crane_recite',B.pos); return; }
  if(d<8.5&&rnd()<.6){ B.atk={kind:'pages',t:0,dir:_d.clone()}; telegraph('pages',B.pos,T.pageWind); return; }
  B.atk={kind:'quill',t:0,dir:_d.clone(),from:B.pos.clone()}; telegraph('quill',B.pos,T.quillWind);
}
function updateAttack(dt){
  const a=B.atk; if(!a)return; a.t+=dt;
  const pp=G.player.pos;
  if(a.kind==='quill'){
    const w=T.quillWind;
    if(a.t<w*.55){ _d.set(pp.x-a.from.x,0,pp.z-a.from.z); if(_d.lengthSq()>.01){ _d.normalize(); a.dir.lerp(_d,Math.min(1,dt*6)).normalize(); } } // tracks you for the first half, then sets
    B.heading=Math.atan2(a.dir.x,a.dir.z);
    showLine(a.from,a.dir,T.quillLen,T.quillW,Math.min(1,a.t/w*1.3)*(a.t<w?.55+.45*Math.sin(a.t*22)*.5+.2:1));
    if(a.t>=w&&!a.fired){ a.fired=true; fireQuill(a.from,a.dir,T.quillLen); }
    if(a.t>=w+.35){ lineDecal.visible=false; B.atk=null; B.cool=coolNext(); }
  }else if(a.kind==='pages'){
    const w=T.pageWind;
    if(a.t<w*.6){ _d.set(pp.x-B.pos.x,0,pp.z-B.pos.z); if(_d.lengthSq()>.01){ _d.normalize(); a.dir.lerp(_d,Math.min(1,dt*5)).normalize(); } }
    B.heading=Math.atan2(a.dir.x,a.dir.z);
    showCone(B.pos,B.heading,T.pageArc,T.pageLen,Math.min(1,a.t/w*1.4));
    if(a.t>=w&&!a.fired){ a.fired=true; firePages(B.pos,a.dir,T.pageArc,T.pageN,T.pageDmg,T.pageSpeed); }
    if(a.t>=w+.3){ coneDecal.visible=false; B.atk=null; B.cool=coolNext(); }
  }else if(a.kind==='tithe'){
    if(a.t>=T.titheWind&&!a.fired){ a.fired=true; tithe(); }
    if(a.t>=T.titheWind+.6){ B.atk=null; B.cool=coolNext(); }
  }
}
function coolNext(){ const c=B.phase===3?T.coolP3:T.cool; return U.lerp(c[0],c[1],rnd()); }
function tithe(){
  if(!G.monsters)return;
  const pp=G.player.pos, bs=bins().filter(b=>Math.hypot(b.x-pp.x,b.z-pp.z)>4).sort((a,b)=>Math.hypot(a.x-pp.x,a.z-pp.z)-Math.hypot(b.x-pp.x,b.z-pp.z));
  const alive=summoned.filter(m=>m.alive&&!m.dying).length, n=Math.min(T.titheMax-alive,B.phase===3?1:1+(rnd()<.55?1:0));
  for(let i=0;i<n&&i<bs.length;i++){ const b=bs[i]; const I=INK(); I&&I.burst(V(b.x,floorY+1,b.z),{n:24,speed:2.5,size:[.4,1.2],life:[.6,1.3],up:2,embers:6,drops:8});
    const x=b.x+(C.x-b.x)*.12, z=b.z+(C.z-b.z)*.12;
    try{ const m=G.monsters.spawn('nameless',{x,y:floorY,z},{zone:{name:'undercroft-store',x:C.x,z:C.z,r:T.arenaR},undercroft:'store',intro:true,aggro:true}); summoned.push(m); }catch(e){console.error(e);} }
  G.ui.shake&&G.ui.shake(.25);
}
function clearSummoned(){ for(const m of summoned)if(m.alive&&G.monsters&&G.monsters.despawn)G.monsters.despawn(m,true); summoned.length=0; }

/* ---------------------------------------------------------------- hits */
function damage(d,info,pos,real){
  if(B.hp<=0)return;
  B.hp=Math.max(0,B.hp-d); B.flash=1; B.lastHitT=G.time;
  const F=FX(); if(F)F.splash(V(pos.x,pos.y,pos.z),(info&&info.dir)||V(0,0,1),.9);
  const I=INK(); I&&I.burst(pos,{n:8,speed:2,size:[.3,.8],life:[.4,.9],up:1,embers:4,drops:2});
  pageBurst(pos,4);
  G.ui.shake&&G.ui.shake(.1);
  G.emit('undercroft:bossHit',{damage:d,hp:B.hp,real:!!real});
  if(B.hp<=0)startDying();
  else if(B.phase===1&&B.hp<=T.p2)enterPhase(2);
  else if(B.phase===2&&B.hp<=T.p3)enterPhase(3);
}
const _hp=V();
function hitCrane(info){
  if(B.state!=='fight'||B.phase===2||info.kind==='swarm')return;
  if(G.time-B.lastHitT<.12&&info.kind===B.lastKind)return; B.lastKind=info.kind;
  let d=info.damage||1;
  if(B.staggerT>0)d*=T.staggerMul;
  else if(B.phase===3&&B.ledger.open){ d*=T.guardMul; pageBurst(_hp.set(B.pos.x,floorY+1.8,B.pos.z),6); }   // the names close over him
  damage(d,info,_hp.set(B.pos.x,floorY+1.6,B.pos.z),true);
}
function hitLedger(info){
  if(!B.ledger.open||info.kind!=='bolt')return;
  B.ledger.hits++; B.flash=1; pageBurst(ledgerHB.pos.clone().add(V(0,.6,0)),8);
  const I=INK(); I&&I.burst(ledgerHB.pos.clone().add(V(0,.6,0)),{n:12,speed:3,size:[.3,.9],life:[.4,.9],up:1.5,embers:10,drops:3});
  G.emit('undercroft:bossHit',{damage:0,hp:B.hp,ledger:B.ledger.hits});
  if(B.ledger.hits===1&&!S.said.ledgerHit)say('ledgerHit','The bolt tears into the open ledger and the names on that page scatter like birds. Again.',null,{priority:'high'});
  if(B.ledger.hits>=T.boltHits)stagger('bolt');
}
function hitFigure(f,info){
  if(B.phase!==2||!f.alive||info.kind==='swarm')return;
  if(f.real){
    if(G.time-B.lastHitT<.12&&info.kind===B.lastKind)return; B.lastKind=info.kind;
    f.flash=1; damage((info.damage||1)*(B.staggerT>0?T.staggerMul:1),info,_hp.set(f.pos.x,floorY+1.2,f.pos.z),true);
    if(B.phase===2&&!B.shuffleAt){ B.shuffleAt=G.time+1.3; B.staggerT=1.2;
      if(!S.said.realHit)later(.4,()=>say('realHit','It’s him. Under the borrowed shape something gives like wet paper — and all four of them flinch.',null,{priority:'high'})); }
    return;
  }
  // a copy: empty ink and pages; it bursts at you
  f.alive=false; f.burst=1;
  const pp=G.player.pos; _e.set(pp.x-f.pos.x,0,pp.z-f.pos.z); if(_e.lengthSq()<.01)_e.set(0,0,1); _e.normalize();
  const I=INK(); I&&I.burst(V(f.pos.x,floorY+1,f.pos.z),{n:26,speed:3,size:[.4,1.1],life:[.5,1.1],up:1.5,embers:6,drops:8});
  later(.22,()=>{ if(B.state==='fight')firePages(f.pos,_e.clone(),.7,T.copyBurstN,T.copyDmg,11); });
  G.emit('undercroft:bossCopy',{pos:f.pos.clone()}); snd('crane_pages',f.pos);
  if(!S.said.copyHit)later(.6,()=>say('copyHit','It was empty — only ink in a borrowed shape, and it came apart into pages at you.',null,{priority:'high'}));
}
function stagger(by){
  B.staggerT=T.stagger; closeLedger(); B.atk=null; hideDecals();
  pageBurst(V(B.pos.x,floorY+2.4,B.pos.z),16); G.ui.shake&&G.ui.shake(.35);
  G.emit('undercroft:bossStagger',{by}); snd('crane_split',B.pos);
  if(!S.said['stag'+by])say('stag'+by,by==='slam'?'The slam blows the pages out of his hands. The names scatter across the floor and he stoops after them — open.':'The last bolt goes through the ledger’s spine. He staggers, clutching at loose pages — open.',null,{priority:'high'});
}

/* ---------------------------------------------------------------- loose page fx (simple pooled sprites of paper) */
const loose=[];
function pageBurst(pos,n){ const M=mats(); for(let i=0;i<n;i++){ let L=loose.find(q=>q.t>=q.life); if(!L){ if(loose.length>=40)break; L={m:new THREE.Mesh(new THREE.PlaneGeometry(.2,.26),M.leaf),t:9,life:1}; G.scene.add(L.m); loose.push(L); }
  L.t=0; L.life=.9+rnd()*.8; L.m.visible=true; L.m.position.copy(pos); L.v=V((rnd()-.5)*4,1+rnd()*2.5,(rnd()-.5)*4); L.sp=V(rnd()*8,rnd()*8,0); L.to=null; } }
function pageTo(pos,to,n,life){ pageBurst(pos,n); for(const L of loose)if(L.t===0){ L.to=to.clone(); L.life=life||2; } }
function updateLoose(dt){ for(const L of loose){ if(L.t>=L.life){ L.m.visible=false; continue; } L.t+=dt;
  if(L.to){ const k=Math.min(1,L.t/L.life); _e.subVectors(L.to,L.m.position); L.v.lerp(_e.multiplyScalar(2.2),Math.min(1,dt*2*(.5+k*3))); L.v.x+=-_e.z*.2; L.v.z+=_e.x*.2; }
  else { L.v.y-=2.2*dt; L.v.multiplyScalar(Math.exp(-dt*1.4)); }
  L.m.position.addScaledVector(L.v,dt); if(L.m.position.y<floorY+.03){ L.m.position.y=floorY+.03; L.v.set(0,0,0); }
  L.m.rotation.x+=L.sp.x*dt; L.m.rotation.y+=L.sp.y*dt; } }

/* ---------------------------------------------------------------- phases */
function enterPhase(n){
  B.phase=n; B.atk=null; hideDecals(); B.staggerT=0;
  G.emit('undercroft:bossPhase',{n,name:n===2?'borrowed':'bargain'});
  if(n===2){
    snd('crane_split',B.pos); G.ui.shake&&G.ui.shake(.4);
    pageBurst(V(B.pos.x,floorY+2,B.pos.z),24);
    B.fade=1; B.split=0; reform(true);
    later(.5,()=>G.ui.say('“You’ve met them. Haven’t you. Then you’ll know which one is me.”','Aldous Crane',{priority:'high',key:'crane'}));
    later(2.2,()=>{ const owned=!!(G.glass&&G.glass.owned!==false&&G.glass);
      G.ui.toast&&G.ui.toast('The Borrowed',owned?'Raise the Glass: only one of them is real':'One of them casts its shadow a moment late');
      say('p2hint',owned?'Four people of pages, shaped like Tamsin, Corwin, Wren and Hob. Only one is really him. The Glass would show you which — or watch their shadows: one keeps a moment behind its feet.':'Four people of pages, shaped like the villagers you’ve met. Only one is really him. Watch their shadows: one of them keeps a moment behind its feet.',null,{priority:'high'}); });
  }else{
    // the four collapse into pages that fly together, and he stands up out of them with the ledger open
    for(const f of B.figs){ if(f.g.visible)pageTo(V(f.pos.x,floorY+1,f.pos.z),V(C.x,floorY+2,C.z),6,1.4); f.alive=false; f.sink=1; }
    B.pos.set(C.x,floorY,C.z); B.fade=0; B.rejoin=0;
    snd('crane_split',C);
    B.ledger.open=false; B.ledger.shut=2.2; B.ledger.hits=0;
    later(1,()=>G.ui.say('“Let me show you what I paid. Every one of them, in my own hand.”','Aldous Crane',{priority:'high',key:'crane'}));
  }
}
const ROLES=['tamsin','corwin','wren','hob'];
function reform(first){
  // every figure stands up again from ink at a ring around the centre; one (at random) is really him
  const real=(rnd()*4)|0, a0=rnd()*TAU;
  B.figs.forEach((f,i)=>{ f.real=i===real; f.alive=true; f.sink=1; f.burst=0; f.flash=0; f.ang=a0+i/4*TAU+(rnd()-.5)*.4;
    f.pos.set(C.x+Math.cos(f.ang)*T.figR,floorY,C.z+Math.sin(f.ang)*T.figR); f.hist.length=0; f.wob=rnd()*TAU;
    const I=INK(); I&&I.burst(V(f.pos.x,floorY+.3,f.pos.z),{n:12,speed:1.6,size:[.3,.9],life:[.5,1],up:1.4,embers:3,drops:4}); });
  B.reformT=T.reform; B.shuffleAt=0; B.figAtkT=first?3:T.figAtkEvery[0];
  if(!first)snd('crane_split',C);
}
function realFig(){ return B.figs.find(f=>f.real); }

/* ---------------------------------------------------------------- the ledger (phase 3) */
function openLedger(){ B.ledger.open=true; B.ledger.t=0; B.ledger.hits=0; B.atk=null; hideDecals(); telegraph('ledger',B.pos,1);
  snd('crane_recite',B.pos);
  if(!S.said.ledger){ say('ledger','He opens the ledger and reads, very fast. The moths in the room swerve toward the open pages, and the pages are eating them.',null,{priority:'high'});
    later(2.5,()=>G.ui.toast&&G.ui.toast('The Bargain','Skyfall Slam near him scatters the pages · or 3 charged bolts into the open ledger')); } }
function closeLedger(){ if(!B.ledger.open)return; B.ledger.open=false; B.ledger.shut=T.ledgerShut; B.ledger.hits=0; releaseMoths(); }
function ledgerPos(out){ return crane?crane.lglow.getWorldPosition(out||V()):(out||V()).set(B.pos.x,floorY+2.4,B.pos.z); }
let eatAcc=0; const pulled=new Set(); let ledgerPrey=null;
function mothsAll(){ const c=G.creatures; return (c&&c.moths)||[]; }
function pullMoths(dt){
  const lp=ledgerPos(_e); ledgerHB.pos.set(lp.x,lp.y-.6,lp.z);
  if(!ledgerPrey)ledgerPrey={key:ledgerHB,center:V(),alive:()=>B.ledger.open,r:1.4};
  ledgerPrey.center.copy(lp);
  for(const m of mothsAll()){
    if(pulled.has(m)){ if(m.tgt!=='hunt')pulled.delete(m); else m.prey=ledgerPrey; continue; }
    if(m.tgt!=='lantern'&&m.tgt!=='hunt'&&m.tgt!=='wander')continue;
    if(m.p.distanceToSquared(lp)>30*30)continue;
    m.tgt='hunt'; m.prey=ledgerPrey; m.rad=.2+rnd()*.5; m.hy=rnd()*.6; m.feedB=null; pulled.add(m);
  }
  eatAcc+=dt*T.eatRate;
  while(eatAcc>=1){ eatAcc-=1; let best=null,bd=1.8*1.8; for(const m of pulled){ const d=m.p.distanceToSquared(lp); if(d<bd){bd=d;best=m;} }
    if(!best){ eatAcc=0; break; } pulled.delete(best); if(G.moths&&G.moths.eat)G.moths.eat(best); else best.tgt='gone'; B.ate=(B.ate||0)+1; }
}
function releaseMoths(){ for(const m of pulled){ if(m.tgt==='hunt'){ m.prey=null; if(G.moths&&G.moths.baited&&G.moths.toLantern)G.moths.toLantern(m); else if(G.moths&&G.moths.release)G.moths.release(m); else m.tgt='wander'; } } pulled.clear(); eatAcc=0; }

/* ---------------------------------------------------------------- start / reset / leave */
function startFight(){
  build(); arenaGeo();
  B.state='intro'; B.st=0; B.phase=1; B.hp=T.hp; B.fade=0; B.pos.copy(home); B.heading=Math.atan2(door.x-home.x,door.z-home.z);
  B.cool=2.6; B.tithecd=9; B.atk=null; B.staggerT=0; B.ledger.open=false; B.ledger.k=0;
  crane.g.visible=true; G.ui.bossBar('Aldous Crane, the Tithe-Keeper',1); music(true);
  if(!B.started){ B.started=true; G.emit('undercroft:bossStart',{}); }
  snd('crane_recite',home);
  if(!S.bossSeen){ S.bossSeen=true;
    G.ui.say('Among the grain bins a tall man in a reeve’s coat is reading aloud from a ledger. His skin is pages. Every name he reads crawls across him in wet ink.',null,{priority:'high'});
    later(4,()=>G.ui.say('“Wickham’s End. The tithe for the year. All present; all accounted for. All but you.”','Aldous Crane',{priority:'high',key:'crane'})); }
}
function resetFight(why){
  if(!B.built)return;
  B.state='dormant'; B.started=false; B.shuffleAt=0; B.phase=1; B.hp=T.hp; B.atk=null; B.staggerT=0; B.fade=0; B.outT=0;
  closeLedger(); B.ledger.k=0; hideDecals(); clearSummoned();
  for(const f of B.figs){ f.alive=false; f.g.visible=false; f.shadow.visible=false; }
  for(const s of spikePool){ s.t=9; s.m.visible=false; } B.quill=null;
  crane.g.visible=false; G.ui.bossBar(null); music(false);
  G.emit('undercroft:bossReset',{why});
}

/* ---------------------------------------------------------------- per-frame */
const _p=V();
/* the Skyfall Slam's landing: player:combo {id:'slam'} when it starts, then the touch-down; the plunge reports its own landing */
let slamFrom=0, slamAt=null;
G.on('player:combo',e=>{ if(e&&e.id==='slam')slamFrom=G.time; });
G.on('player:plunge',e=>{ if(e&&e.pos)slamAt=V(e.pos.x,e.pos.y,e.pos.z); });
function watchSlam(){ if(!slamFrom)return; const P=G.player; if(G.time-slamFrom>2.5){ slamFrom=0; return; }
  if(G.time-slamFrom>.12&&P&&P.grounded!==false&&P.pos){ slamAt=P.pos.clone(); slamFrom=0; } }
function moveTo(pos,tx,tz,speed,dt,r){
  const dx=tx-pos.x, dz=tz-pos.z, d=Math.hypot(dx,dz); if(d<.05)return 0;
  const s=Math.min(d,speed*dt); const res=G.moveCharacter?G.moveCharacter(pos,dx/d*s,dz/d*s,r||.8,'monster'):(pos.x+=dx/d*s,pos.z+=dz/d*s,null); void res;
  // stay inside the arena
  const ox=pos.x-C.x, oz=pos.z-C.z, od=Math.hypot(ox,oz); if(od>T.arenaR-2){ pos.x=C.x+ox/od*(T.arenaR-2); pos.z=C.z+oz/od*(T.arenaR-2); }
  pos.y=groundAt(pos,floorY); return s;
}
function updateCrane(dt){
  const P=G.player, pp=P.pos;
  B.st+=dt; B.cool-=dt; B.tithecd-=dt; B.staggerT=Math.max(0,B.staggerT-dt); B.flash=Math.max(0,B.flash-dt*4);
  if(B.state==='intro'){ B.fade=Math.min(1,B.st/1.6); if(B.st>2.2){ B.state='fight'; B.st=0; } return; }
  if(P.alive===false)return;
  if(B.phase===2){ updateFigures(dt); return; }
  if(B.phase===3){
    if(B.fade<1){ B.fade=Math.min(1,B.fade+dt*.9); if(B.fade<1)return; }
    const L=B.ledger;
    if(B.staggerT>0){ /* stooping after the pages: no attacks */ }
    else if(L.open){ L.t+=dt; pullMoths(dt); if(L.t>=T.ledgerOpen)closeLedger(); }
    else { L.shut-=dt; if(L.shut<=0&&!B.atk)openLedger(); }
    // the Skyfall Slam (or a plunge) landing near him scatters the pages
    if(slamAt&&L.open&&B.staggerT<=0&&Math.hypot(slamAt.x-B.pos.x,slamAt.z-B.pos.z)<T.slamR)stagger('slam');
    slamAt=null;
  }
  // walk the store, keeping a reading distance; face the player
  const d=Math.hypot(pp.x-B.pos.x,pp.z-B.pos.z);
  if(!B.atk&&B.staggerT<=0&&!(B.phase===3&&B.ledger.open)){
    const want=d>T.keep+1.5?1:d<T.keep-1.5?-.6:0;
    if(want){ const tx=B.pos.x+(pp.x-B.pos.x)/Math.max(d,.1)*want*3, tz=B.pos.z+(pp.z-B.pos.z)/Math.max(d,.1)*want*3; B.speedNow=moveTo(B.pos,tx,tz,T.speed,dt)/Math.max(dt,1e-4); }
    else B.speedNow=0;
    B.heading+=U.angDiff(Math.atan2(pp.x-B.pos.x,pp.z-B.pos.z),B.heading)*Math.min(1,dt*3);
    if(B.cool<=0&&!B.noAtk)chooseAttack();
  } else { B.speedNow=0; if(B.phase===3&&B.ledger.open)B.heading+=U.angDiff(Math.atan2(pp.x-B.pos.x,pp.z-B.pos.z),B.heading)*Math.min(1,dt*1.5); }
  updateAttack(dt);
  // reciting names (sparse, low-priority captions)
  B.reciteT-=dt; if(B.reciteT<=0&&!B.atk){ B.reciteT=13+rnd()*6; recite(); }
}
const NAMES=['Abel Fletcher','Mary Fletcher','Joan Thatcher','little Ned Thatcher','Agnes Cole','William Cole','Ruth Pell','Simon Pell','Tamsin Rowe','old Gideon Marsh','Bet Marsh','the Ashby twins','Hannah Wyatt','Piers Wyatt'];
function recite(){ const a=(rnd()*NAMES.length)|0; const n=[NAMES[a],NAMES[(a+3)%NAMES.length],NAMES[(a+7)%NAMES.length]];
  G.ui.say('“…'+n[0]+'. '+n[1]+'. '+n[2]+'…”','Aldous Crane',{priority:'low',key:'crane'}); snd('crane_recite',B.pos); }
function updateFigures(dt){
  const pp=G.player.pos;
  B.reformT-=dt;
  // after a true hit (or every ~15 s) the four sink and stand up again, shuffled
  if(B.shuffleAt&&G.time>=B.shuffleAt){ B.shuffleAt=0; for(const f of B.figs){ if(f.g.visible)pageBurst(V(f.pos.x,floorY+1,f.pos.z),5); f.alive=false; } later(1.1,()=>{ if(B.phase===2&&B.state==='fight')reform(false); }); B.reformT=99; }
  if(B.reformT<=0){ for(const f of B.figs)f.alive=false; later(.9,()=>{ if(B.phase===2&&B.state==='fight')reform(false); }); B.reformT=99; }
  for(const f of B.figs){
    if(!f.alive){ f.sink=Math.min(1,f.sink+dt*2); continue; }
    f.sink=Math.max(0,f.sink-dt*1.4);
    // drift round the store, never quite still, so a late shadow shows
    f.ang+=dt*(.09+.03*Math.sin(G.time*.7+f.wob))*(f.real?1:1);
    const r=T.figR+Math.sin(G.time*.55+f.wob*2)*2.2;
    const tx=C.x+Math.cos(f.ang)*r, tz=C.z+Math.sin(f.ang)*r;
    moveTo(f.pos,tx,tz,T.figSpeed+.6,dt,.5);
    f.face+=U.angDiff(Math.atan2(pp.x-f.pos.x,pp.z-f.pos.z),f.face)*Math.min(1,dt*3);
  }
  // one of them (any of them) strikes with a short quill line now and then
  B.figAtkT-=dt;
  if(B.figAtkT<=0&&!B.atk&&!B.shuffleAt&&!B.noAtk){ const live=B.figs.filter(f=>f.alive&&f.sink<.2); if(live.length){ const f=live[(rnd()*live.length)|0];
      _d.set(pp.x-f.pos.x,0,pp.z-f.pos.z).normalize(); B.atk={kind:'quill',t:0,dir:_d.clone(),from:f.pos.clone(),fig:f}; telegraph('quill',f.pos,T.quillWind); }
    B.figAtkT=U.lerp(T.figAtkEvery[0],T.figAtkEvery[1],rnd()); }
  if(B.atk){ const a=B.atk; a.t+=dt; const w=T.quillWind;
    if(a.t<w*.5){ _d.set(pp.x-a.from.x,0,pp.z-a.from.z); if(_d.lengthSq()>.01){ _d.normalize(); a.dir.lerp(_d,Math.min(1,dt*6)).normalize(); } }
    showLine(a.from,a.dir,T.quillLen*.75,T.quillW,Math.min(1,a.t/w*1.3));
    if(a.t>=w&&!a.fired){ a.fired=true; fireQuill(a.from,a.dir,T.quillLen*.75); }
    if(a.t>=w+.35){ lineDecal.visible=false; B.atk=null; } }
}

/* ---------------------------------------------------------------- render */
const _q=V();
function glassSees(p){ const g=G.glass; if(!g||!g.raised)return false; try{ return !g.canSee||g.canSee(p)!==false; }catch(e){ return true; } }
function render(dt){
  if(!B.built)return;
  const t=G.time, M=mats();
  if(pageTexture){ pageTexture.offset.y=(pageTexture.offset.y+dt*.035)%1; pageTexture.offset.x=Math.sin(t*.13)*.05; }   // the names crawl
  const showCrane=B.state!=='dormant'&&B.state!=='dead'&&(B.phase!==2)&&B.fade>.01;
  crane.g.visible=showCrane;
  if(showCrane){
    const g=crane.g; g.position.copy(B.pos); g.rotation.y=B.heading;
    const stag=B.staggerT>0, open=B.phase===3&&B.ledger.open&&B.staggerT<=0;
    g.scale.set(1,U.lerp(.15,1,U.smooth(0,1,B.fade)),1);
    crane.body.rotation.x=U.damp(crane.body.rotation.x,stag?.45:open?-.08:.06,6,dt);
    crane.head.rotation.x=U.damp(crane.head.rotation.x,stag?.5:open?.35:.1+Math.sin(t*.8)*.05,6,dt);
    const a=B.atk, wind=a&&!a.fired?Math.min(1,a.t/(a.kind==='pages'?T.pageWind:a.kind==='tithe'?T.titheWind:T.quillWind)):0;
    const R=crane.arms[1], L=crane.arms[0], sway=Math.sin(t*1.6)*.12*Math.min(1,B.speedNow||0);
    // right arm: the quill raised high and back on a quill wind-up; thrown forward on a page storm; flung up for "Tithe!"
    const rx=a&&a.kind==='quill'?(a.fired?-1.2:-2.6*wind):a&&a.kind==='pages'?(a.fired?-1.5:-.4-.6*wind):a&&a.kind==='tithe'?-2.9*wind:stag?-.3:-.25+sway;
    R.sh.rotation.x=U.damp(R.sh.rotation.x,rx,a&&a.fired?25:7,dt); R.sh.rotation.z=U.damp(R.sh.rotation.z,a&&a.kind==='pages'&&!a.fired?.6*wind:.05,7,dt);
    R.el.rotation.x=U.damp(R.el.rotation.x,a&&a.kind==='quill'&&!a.fired?-.6:-.25,7,dt);
    // left arm: the ledger held at the chest; raised open in phase 3
    L.sh.rotation.x=U.damp(L.sh.rotation.x,open?-1.6:stag?.2:-.55-sway,5,dt); L.el.rotation.x=U.damp(L.el.rotation.x,open?-.9:-1.3,5,dt);
    L.sh.rotation.z=U.damp(L.sh.rotation.z,open?.35:-.1,5,dt);
    B.ledger.k=U.damp(B.ledger.k,open?1:0,4,dt);
    crane.coverL.rotation.z=B.ledger.k*1.45; crane.coverR.rotation.z=-B.ledger.k*1.45; crane.leaves.visible=B.ledger.k>.3;
    crane.lglow.material.opacity=B.ledger.k*(.55+.25*Math.sin(t*7)); crane.lglow.scale.setScalar(1.8+B.ledger.k*1.4);
    M.skin.emissive.setRGB(.11+B.flash*.6,.08+B.flash*.5,.13+B.flash*.6);
    glowLight.intensity=.8+B.ledger.k*1.4+B.flash; glowLight.color.setHex(B.ledger.k>.3?0xffd2a0:0xc9a8ff);
    // the circling pages: a storm gathers on a page wind-up
    const storm=a&&a.kind==='pages'&&!a.fired?wind:0;
    for(const p of flutter){ const u=p.userData; u.a+=dt*u.sp*(1+storm*5+B.ledger.k*2);
      const r=u.r*(1-storm*.35)+B.ledger.k*.6; p.position.set(Math.cos(u.a)*r,u.h*(1-storm*.4)+B.ledger.k*.6+Math.sin(t*2+u.a)*.1,Math.sin(u.a)*r);
      p.rotation.set(Math.sin(t*3+u.a)*.8,u.a,Math.cos(t*2.3+u.a)*.6); }
  }
  // the Borrowed
  const see=B.phase===2&&B.state==='fight';
  for(const f of B.figs){
    const vis=see&&(f.alive||f.sink<1);
    f.g.visible=vis; f.shadow.visible=vis&&f.sink<.6;
    if(!vis)continue;
    f.flash=Math.max(0,(f.flash||0)-dt*4);
    f.g.position.set(f.pos.x,f.pos.y-f.sink*f.h,f.pos.z); f.g.rotation.y=f.face; f.g.scale.y=1-f.sink*.5;
    f.body.rotation.z=Math.sin(t*1.7+f.wob)*.05; f.body.position.y=Math.abs(Math.sin(t*2.2+f.wob))*.04;
    // shadow: the copies' shadows sit at their feet; his trails where he was ~0.4 s ago
    f.hist.push({t,x:f.pos.x,z:f.pos.z}); while(f.hist.length>2&&f.hist[1].t<t-T.lag)f.hist.shift();
    const h=f.real&&f.hist.length?f.hist[0]:f.pos;
    f.shadow.position.set(h.x,floorY+.04,h.z); f.shadowRim.opacity=.28*(1-f.sink);
    // through the Glass: he shows warm and solid; the copies are empty ink
    const seen=glassSees(f.pos);
    const warm=seen&&f.real?1:0, empty=seen&&!f.real?1:0;
    f.mats.ink.opacity=U.damp(f.mats.ink.opacity,(1-f.sink)*(empty?.22:1),8,dt);
    f.mats.ink.emissive.setRGB(.08+f.flash*.6+warm*.35,.05+f.flash*.5+warm*.22,.11+f.flash*.6+warm*.08);
    f.mats.ink.color.setRGB(empty?.25:.42+warm*.5,empty?.22:.4+warm*.38,empty?.4:.46+warm*.18);
    f.mats.warm.opacity=U.damp(f.mats.warm.opacity,warm*.28*(1-f.sink),8,dt);
  }
  updateSpikes(dt); updateLoose(dt);
}

/* ---------------------------------------------------------------- dying + defeat */
function startDying(){
  B.state='dying'; B.st=0; B.atk=null; hideDecals(); closeLedger(); clearSummoned();
  for(const f of B.figs){ f.alive=false; f.g.visible=false; f.shadow.visible=false; }
  G.ui.bossBar('Aldous Crane, the Tithe-Keeper',0); G.ui.shake&&G.ui.shake(.6); music(false);
  snd('crane_death',B.pos); G.emit('undercroft:bossDying',{});
  later(.6,()=>G.ui.say('“…I kept it. My name. I kept it.”','Aldous Crane',{priority:'high',key:'crane'}));
}
const ledgerProp={g:null,pos:V(),t:0,state:'none',ia:null};
const lastPage={g:null,pos:V(),ia:null};
function updateDying(dt){
  B.st+=dt; const st=B.st;
  B.fade=1-U.smooth(.6,3.2,st);
  // he comes apart into a whirl of pages that rises and turns, then settles into the ledger
  if(st<3.4&&rnd()<dt*30){ const a=rnd()*TAU; pageTo(V(B.pos.x+Math.cos(a)*.6,floorY+.5+rnd()*2.8,B.pos.z+Math.sin(a)*.6),V(B.pos.x,floorY+1.2,B.pos.z),1,1.6+rnd()); }
  if(crane&&crane.g.visible){ crane.g.rotation.y+=dt*(1+st*2); crane.g.scale.set(1+st*.1,Math.max(.05,B.fade),1+st*.1); }
  if(st>=3.6&&B.state==='dying'){ B.state='dead'; crane.g.visible=false; onDefeated(false); }
}
function lecternPos(){ const l=anchor('store','lectern'); l.y=groundAt(l,floorY); return l; }
function onDefeated(restored){
  S.defeated=true; B.state='dead'; G.flag('craneDead',true);
  G.ui.bossBar(null); music(false); releaseMoths(); clearSummoned();
  if(!B.built)build();
  crane.g.visible=false;
  const fell=restored?V(C.x+1.2,floorY,C.z+1.5):B.pos.clone();
  placeLastPage(fell);
  if(!S.ledger)placeLedger(restored?lecternPos():V(B.pos.x,floorY+1.2,B.pos.z),restored);
  try{ const u=UC(); if(u){ if(u.openStrongroom)u.openStrongroom({restored}); if(u.openExit)u.openExit({restored}); } }catch(e){console.error('undercroft open',e);}
  G.emit('undercroft:bossDead',{pos:fell.clone(),restored:!!restored});
  if(restored)return;
  G.emit('monster:killed',{kind:'crane',pos:fell.clone(),boss:true});
  later(1.2,()=>G.ui.say('The pages settle like snow, and then all at once they go into the ledger — every one — and it closes on them. Behind the grain bins, an iron door you hadn’t noticed swings open.',null,{priority:'high'}));
  later(2,()=>G.ui.toast&&G.ui.toast('Aldous Crane, the Tithe-Keeper','The strongroom is open'));
}
function bookMesh(){
  const M=mats(), g=new THREE.Group();
  addM(g,new THREE.BoxGeometry(.62,.12,.48),M.leather);
  addM(g,new THREE.BoxGeometry(.58,.1,.44),M.paper,.02,0,0);
  const s=new THREE.Sprite(new THREE.SpriteMaterial({map:G.tex.soft,color:U.col('#ffd9a0'),transparent:true,opacity:.45,depthWrite:false,blending:THREE.AdditiveBlending})); s.scale.setScalar(1.6); s.position.y=.25; g.add(s); g.userData.glow=s;
  G.outline&&G.outline(g.children[0],{thickness:.015}); return g;
}
function placeLedger(from,restored){
  if(!ledgerProp.g){ ledgerProp.g=bookMesh(); G.scene.add(ledgerProp.g);
    ledgerProp.ia=G.interact.add({pos:()=>ledgerProp.pos,radius:2,priority:6,label:'Take the Tithe Ledger',enabled:()=>ledgerProp.state==='rest'&&!S.ledger&&isPlay(),use:takeLedger}); }
  ledgerProp.from=from.clone(); ledgerProp.to=lecternPos().add(V(0,1.15,0)); ledgerProp.t=0;
  ledgerProp.state=restored?'rest':'drift'; ledgerProp.pos.copy(restored?ledgerProp.to:from); ledgerProp.g.visible=true;
}
function takeLedger(){
  if(S.ledger)return; S.ledger=true; ledgerProp.state='taken'; ledgerProp.g.visible=false;
  G.flag('titheLedger',true);
  G.emit('undercroft:ledger',{taken:true});
  try{ G.progress&&G.progress.reward&&G.progress.reward({id:'ledger',icon:'ledger',name:'The Tithe Ledger',eyebrow:'Wickham’s End',
    desc:'Every name in Wickham’s End, in the reeve’s cramped hand. Heavier than a book should be. Some of them might still be given back.',sub:'Speak a name to its owner'}); }catch(e){console.error(e);}
  try{ G.flow&&G.flow.writeSave&&setTimeout(()=>{ if(isPlay())G.flow.writeSave(); },800); }catch(e){}
}
const LAST_PAGE='I kept my name. I didn’t keep anything else.';
function placeLastPage(pos){
  if(!lastPage.g){
    const M=mats(), g=new THREE.Group();
    const p=addM(g,new THREE.PlaneGeometry(.42,.54),M.paper,0,.16,0); p.rotation.set(-PI/2+.62,.2,0,'YXZ');
    const s=new THREE.Sprite(new THREE.SpriteMaterial({map:G.tex.soft,color:U.col('#e3b46a'),transparent:true,opacity:.3,depthWrite:false,blending:THREE.AdditiveBlending})); s.scale.setScalar(1.4); s.position.y=.3; g.add(s); lastPage.glow=s;
    G.scene.add(g); lastPage.g=g;
    lastPage.ia=G.interact.add({pos:()=>lastPage.pos,radius:1.8,priority:5,label:()=>S.pageRead?'Read Crane’s last page again':'Read the last page',enabled:()=>S.defeated&&isPlay()&&inside(),use:readLastPage});
  }
  lastPage.pos.copy(pos); lastPage.pos.y=groundAt(pos,floorY); lastPage.g.position.copy(lastPage.pos); lastPage.g.visible=true;
}
function readLastPage(){
  const t='“'+LAST_PAGE+'”';   // a reading on the conversation card (talk.js), the caption if it can't pause now
  if(G.talk&&G.talk.moment)G.talk.moment({who:'page',name:'Aldous Crane’s last page',title:'',portrait:'page',key:'page',lines:[{text:t,who:'Aldous Crane’s last page'}]});
  else G.ui.say(t,'Aldous Crane’s last page',{priority:'high',key:'page'});
  const first=!S.pageRead; S.pageRead=true; G.emit('undercroft:lastPage',{first});
}
function updateProps(dt){
  const L=ledgerProp; if(L.g&&L.g.visible){
    if(L.state==='drift'){ L.t+=dt; const k=U.smooth(0,3,L.t); L.pos.lerpVectors(L.from,L.to,k); L.pos.y+=Math.sin(k*PI)*1.2; if(L.t>=3){ L.state='rest'; L.pos.copy(L.to); } }
    L.g.position.copy(L.pos); L.g.position.y+=L.state==='rest'?Math.sin(G.time*1.4)*.03:0; L.g.rotation.y+=dt*(L.state==='drift'?2:.2);
    L.g.userData.glow.material.opacity=.35+.15*Math.sin(G.time*2); }
  if(lastPage.g&&lastPage.glow)lastPage.glow.material.opacity=(S.pageRead?.15:.3)+.1*Math.sin(G.time*1.7);
  const vis=inside(); if(L.g)L.g.visible=vis&&L.state!=='taken'&&L.state!=='none'; if(lastPage.g)lastPage.g.visible=vis&&S.defeated;
}

/* ---------------------------------------------------------------- the fight's frame */
function inArena(p,r){ return Math.hypot(p.x-C.x,p.z-C.z)<r&&Math.abs(p.y-floorY)<4; }
function updateBoss(dt){
  if(S.defeated){ if(B.state==='dying'){ updateDying(dt); render(dt); } return; }
  if(B.state==='dying'){ updateDying(dt); render(dt); return; }
  if(!inside()){ if(B.state!=='dormant')resetFight('left'); return; }
  if(!B.built)build(); else if(B.state==='dormant')arenaGeo();
  const P=G.player, pp=P&&P.pos; if(!pp)return;
  if(B.state==='dormant'){ if(isPlay()&&P.alive!==false&&inArena(pp,T.startR))startFight(); else return; }
  // walking out of the store: he lets you go, and the fight starts over when you come back
  if(!inArena(pp,T.leaveR)&&P.alive!==false){ B.outT+=dt; if(B.outT>2.5){ resetFight('left'); return; } } else B.outT=0;
  if(isPlay()){ watchSlam(); updateCrane(dt); }
  render(dt);
  if(B.state==='fight'||B.state==='intro')G.ui.bossBar('Aldous Crane, the Tithe-Keeper',B.hp/T.hp);
}
/* player death: the fight stops; on rising, it resets cleanly and you stand at the store door */
G.on('player:dead',()=>{ if(!B.built||S.defeated||B.state==='dormant')return; B.atk=null; hideDecals(); closeLedger();
  try{ if(G.state.checkpoint&&G.state.checkpoint.copy){ G.state.checkpoint.copy(door); G.state.checkpointName='the door of the Tithe Store'; } }catch(e){} B.diedHere=true; });
G.on('player:respawn',()=>{
  if(!B.built||S.defeated||!B.diedHere)return; B.diedHere=false;
  resetFight('death');
  // rise at the store door, facing in (after any other respawn handler has placed you)
  later(.02,()=>{ const P=G.player; if(!P||!P.teleport||!inside())return; if(Math.hypot(P.pos.x-door.x,P.pos.z-door.z)>2.5){ const yaw=Math.atan2(C.x-door.x,C.z-door.z); P.teleport(door.x,door.y,door.z,yaw); } });
});

/* ---------------------------------------------------------------- objective while in the store */
let objT=0, objKey='';
function updateObjective(dt){
  if(!inside()||!G.quest){ objKey=''; return; }
  objT-=dt; if(objT>0)return; objT=.5;
  const room=roomOf(G.player.pos); if(room!=='store'&&!(B.state!=='dormant'))return;
  let g=null;
  if(S.defeated){ g=S.ledger?['The Tithe Store','The exit shaft is open',anchor('store','exit'),'Exit']:['The Tithe Store','The strongroom is open: take the ledger',lecternPos(),'Ledger']; }
  else if(B.state!=='dormant'){ g=B.phase===1?['Aldous Crane','Dodge the quill line and the page storm · strike between',null]:B.phase===2?['The Borrowed','Find the real one — raise the Glass, or watch for the late shadow · then strike',null]:['The Bargain',B.ledger.open?'Skyfall Slam near him, or charged bolts into the open ledger':'Strike while the ledger is shut',null]; }
  else return;
  const key=g[0]+'|'+g[1]; if(key===objKey)return; objKey=key;
  G.quest.set('undercroft:boss',g[0],g[1],g[2]?g[2].clone().add(V(0,.5,0)):null,g[3]||'');
}

/* =====================================================================
   3. TEST STUB (debug only): until undercroft.js exists, a flat floor for the rooms so the fight can be exercised.
      Never on in a real game: only G.undercroftBoss.debug.stub(true) turns it on, and only while G.undercroft is absent.
   ===================================================================== */
let stubOn=false;
function stubFloor(x,z,y){ if(!stubOn||UC())return null; const l=toLocal(V(x,0,z));
  for(const id in LOCAL){ const f=LOCAL[id], ok=f.box?(l.x>f.box[0]&&l.x<f.box[1]&&l.z>f.box[2]&&l.z<f.box[3]):Math.hypot(l.x-f.c[0],l.z-f.c[2])<f.r+(id==='store'?3:0);
    if(ok&&y>=origin().y+f.c[1]-3)return origin().y+f.c[1]; }
  if(Math.abs(l.x)<2&&l.z<-95&&l.z>-102)return origin().y-8;   // the strongroom
  return null; }
function enableStub(on){
  stubOn=!!on;
  if(stubOn&&!enableStub.done){ enableStub.done=true; G.floorProviders.push(stubFloor);
    (G.walkOverrides||[]).push((x,z)=>stubOn&&!UC()&&stubFloor(x,z,1e9)!=null?true:null); }
  if(stubOn&&!UC()&&!G.interior)G.interior={id:'undercroftStub',contains:(x,z)=>stubOn&&Math.abs(z-origin().z+50)<70&&Math.abs(x-origin().x)<45};
  if(!stubOn&&G.interior&&G.interior.id==='undercroftStub')G.interior=null;
}

/* =====================================================================
   4. SAVE / LOAD, SYSTEM, API
   ===================================================================== */
function save(){ return {v:1,defeated:S.defeated,ledger:S.ledger,pageRead:S.pageRead,bossSeen:S.bossSeen,said:Object.keys(S.said)}; }
function load(d){
  if(!d)return;
  S.ledger=!!d.ledger; S.pageRead=!!d.pageRead; S.bossSeen=!!d.bossSeen; S.said={}; for(const k of d.said||[])S.said[k]=1;
  if(d.defeated&&!S.defeated){ try{ arenaGeo(); onDefeated(true); if(S.ledger&&ledgerProp.g){ ledgerProp.state='taken'; ledgerProp.g.visible=false; } }catch(e){console.error(e);} }
}
if(G.persist&&G.persist.register)G.persist.register('undercroftBoss',{save,load});
else G.on('ready',()=>{ if(G.persist&&G.persist.register)G.persist.register('undercroftBoss',{save,load}); });

G.system('undercroftBoss',{order:43,modes:['play','dead'],
  update(dt){
    try{
      runBeats();
      if(!G.monsters)return;
      updateRooms(dt);
      updateBoss(dt);
      updateProps(dt);
      updateObjective(dt);
      if(stubOn&&!UC()&&G.player&&G.player.pos){ const l=toLocal(G.player.pos); if(Math.abs(l.y+4)<14&&Math.abs(l.x)<40&&l.z<12&&l.z>-112){ G.atmo.darkTarget=Math.max(G.atmo.darkTarget||0,.6); } }
    }catch(e){ if(!this._err){console.error('undercroftBoss',e);this._err=1;} }
  }
});

G.undercroftBoss={
  get state(){return B.state;}, get phase(){return B.phase;}, get hp(){return B.hp;}, maxHp:T.hp, get defeated(){return S.defeated;},
  get ledger(){return S.ledger;}, get pageRead(){return S.pageRead;}, get fighting(){return B.state==='fight'||B.state==='intro';},
  get room(){return curRoom;}, get figures(){return B.figs;}, get summoned(){return summoned;}, get eaten(){return B.ate||0;},
  crane:B, monsters:mine, T, LAST_PAGE, readLastPage, takeLedger, packs:PACKS,
  debug:G.debug?{S,B,save,load,stub:enableStub,
    /** stand at the store door, ready to walk in (uses G.undercroft.enter when it exists, else the test stub) */
    enter(room){ if(!(G.loop&&G.loop.active)&&G.debugStartLoop)G.debugStartLoop();
      if(G.state.mode==='title'){ const t=document.getElementById('title'); if(t)t.hidden=true; G.setMode('play'); }
      const u=UC(); room=room||'store';
      if(u&&u.enter){ u.enter(room,{instant:true}); G.step&&G.step(1/30,2);
        if(room==='store'){ arenaGeo(); const k=4/Math.max(1,Math.hypot(door.x-C.x,door.z-C.z)), x=door.x+(C.x-door.x)*k, z=door.z+(C.z-door.z)*k; G.player.teleport(x,floorAt(x,z,door.y+2),z,Math.atan2(C.x-x,C.z-z)); } }
      else { enableStub(true); const p=room==='store'?W(0,-8,-63.5):roomCentre(room); G.player.teleport(p.x,p.y+.2,p.z,PI); }
      arenaGeo(); return roomOf(G.player.pos); },
    start(){ build(); arenaGeo(); G.player.teleport(C.x,floorY+.2,C.z+6,PI); startFight(); B.state='fight'; B.fade=1; return B.state; },
    phase(n){ if(B.state==='dormant')this.start(); B.hp=n===2?T.p2-.01:n===3?T.p3-.01:T.hp; if(n===2&&B.phase!==2)enterPhase(2); if(n===3&&B.phase!==3){ if(B.phase===1)B.phase=2; enterPhase(3); } return B.phase; },
    attack(k){ B.cool=99; if(k==='tithe'){ B.tithecd=0; } else B.tithecd=99; const pp=G.player.pos; _d.set(pp.x-B.pos.x,0,pp.z-B.pos.z).normalize();
      if(k==='tithe'){ B.atk={kind:'tithe',t:0}; B.tithecd=T.titheEvery; telegraph('tithe',B.pos,T.titheWind); } else B.atk={kind:k,t:0,dir:_d.clone(),from:B.pos.clone()}; return B.atk&&B.atk.kind; },
    hold(on){ B.noAtk=on!==false; if(B.noAtk){ B.cool=1e9; B.tithecd=1e9; B.ledger.shut=1e9; } else { B.cool=1; B.tithecd=6; B.ledger.shut=2; } return B.noAtk; },
    openLedger, stagger, kill(){ if(B.state==='dormant')this.start(); B.hp=.01; damage(1,{},V(B.pos.x,floorY+1.5,B.pos.z),true); return B.state; },
    hitFigure, real:realFig, centre:()=>C.clone(), door:()=>door.clone(), floorY:()=>floorY, lectern:lecternPos, spawnPack, clearMine, reset:()=>resetFight('debug'),
    restore(){ S.defeated=false; S.ledger=false; S.pageRead=false; B.state='dormant'; if(ledgerProp.g){ ledgerProp.g.visible=false; ledgerProp.state='none'; } if(lastPage.g)lastPage.g.visible=false; }}:null
};
})();
