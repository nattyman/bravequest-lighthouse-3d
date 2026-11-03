/* =====================================================================
   progression.js — rewards, collectibles and upgrades (spec: PROGRESSION.md)
   - You start with 2 hearts (BASE_HP 4 half-hearts); max 7: 2 + 3 from shards + 2 boss hearts
   - Heart Shards (12 on the island, 4 = +1 heart) with a violet glint + chime
   - Keeper's Hearts from the Hollow Stag and the Undertow (+1 heart each)
   - Moth Wings: every 2 negatives freed -> +20% stamina (4 max)
   - Keeper's Marks (currency) from 8 Keeper's Caches, bosses and first blight cures
   - "Temper" tab on the keeper's benches (alchemy panel): 7 upgrades with real effects
   - G.progress.reward({id,name,desc,icon,eyebrow,item}): the shared "get item" moment (queued, never stacks)
   - the Journal (pause menu), persistence ('progress') with retroactive grants for old saves
   Effects go through small hook points owned by other modules:
     G.player.mods {dmg, cost, stamMax, charge, boltSpeed, pierce, baitTime, mothGather} (player.js, moths.js, creatures.js),
     G.potions.N.max/heal (potions.js), G.moths.jar.capacity (moths.js), G.player.camPull (player.js camera).
   API: G.progress = {reward, state, maxHp(), marks, buy(id), owns(id), UPGRADES, spots, caches, journal:{open,close}, debug}
   Events: progress:shard {n,total} · progress:heart {src} · progress:wing {n} · progress:mark {n,src} · progress:cache {id}
           progress:upgrade {id} · progress:reward {id}
   ===================================================================== */
(function(){
'use strict';
const G=window.G, THREE=G.THREE, U=G.U;
const PI=Math.PI, TAU=PI*2;
const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const LM=()=>(G.world&&G.world.landmarks)||{};
const $=s=>document.getElementById(s);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const isPlay=()=>G.state.mode==='play';
const H=(x,z)=>{ try{ const h=G.world.height(x,z); return isFinite(h)?h:0; }catch(_){ return 0; } };

/* ---------------------------------------------------------------- numbers */
// BASE_HP: you start with 2 hearts (Heath: hearts come quickly early on). maxHp is derived from it on every load, so every
// save — old ones included — moves to the new base; hp is clamped to the new maximum (apply()).
const SHARDS_PER_HEART=4, WING_EVERY=2, WING_STAM=.2, BASE_HP=4, CHIME_R=12, PICK_R=1.25;

/* ---------------------------------------------------------------- state (persisted) */
const S={v:1,shards:{},caches:{},hearts:{},marks:{},spent:0,upgrades:{},freed:0,said:{}};
// marks: source -> count (stag 1, undertow 2, gloaming 2, cache:<id> 1, blight:<id> 1); spent: marks paid at the bench
const count=o=>Object.keys(o).length;
const marksEarned=()=>Object.values(S.marks).reduce((a,b)=>a+b,0);
const marksHeld=()=>Math.max(0,marksEarned()-S.spent);
const shardN=()=>count(S.shards);
const heartN=()=>count(S.hearts)+Math.floor(shardN()/SHARDS_PER_HEART);
const wingN=()=>Math.min(4,Math.floor(S.freed/WING_EVERY));
let heldHp=0; // a heart being lifted overhead fills in when the moment ends, not when it is picked up
const maxHp=()=>Math.min(20,BASE_HP+2*heartN())-heldHp;

/* ---------------------------------------------------------------- upgrades (the Temper tab) */
const UPGRADES=[
  {id:'tip',name:'Ether Tip',desc:'A sliver of lamp-glass bound to the staff’s head. Every strike lands one half-heart harder.',effect:'+1 damage on every staff strike',cost:{mark:2,ichor:2}},
  {id:'lens',name:'Lens Shard',desc:'Ground from the old lens. The charged bolt gathers faster, flies faster, and passes through one more foe.',effect:'Bolt charges 30% faster, flies faster, pierces 1 extra',cost:{mark:2,pearl:1}},
  {id:'grip',name:'Ashwood Grip',desc:'Ash-wood wrapped in waxed cord. Rolls and techniques cost less breath.',effect:'Roll, air-roll and technique stamina −25%',cost:{mark:1,glowcap:3}},
  {id:'bandolier',name:'Wide Bandolier',desc:'A keeper’s leather bandolier with room for more bottles.',effect:'Carry 5 Mender’s Draughts (was 3)',cost:{mark:1,brine:2}},
  {id:'jar',name:'Deep Jar',desc:'The moth jar, re-blown with a deeper belly.',effect:'Moth jar holds 100 (was 60)',cost:{mark:2,pearl:1,brine:2},needs:'jar'},
  {id:'charm',name:'Lantern Charm',desc:'A brass moth on a chain. The bait clings longer and the moths come quicker.',effect:'Bait lasts 50% longer · moths gather 25% faster',cost:{mark:3}},
  {id:'recipe2',name:'Mender’s Recipe II',desc:'A margin note in Maren’s hand: steep the glowcaps twice.',effect:'Mender’s Draught heals 4 hearts (was 3)',cost:{mark:1,glowcap:2,kelp:1}}
];
const UP=Object.fromEntries(UPGRADES.map(u=>[u.id,u]));
const owns=id=>!!S.upgrades[id];

/* ---------------------------------------------------------------- applying effects */
const P=()=>G.player;
function ensureMods(){ const p=P(); if(!p)return {}; if(!p.mods)p.mods={};
  const d={dmg:0,cost:1,stamMax:1,charge:1,boltSpeed:1,pierce:0,baitTime:1,mothGather:1}; for(const k in d)if(p.mods[k]==null)p.mods[k]=d[k]; return p.mods; }
let lastMax=BASE_HP;
function apply(o={}){
  const p=P(); if(!p)return;
  const m=ensureMods();
  m.dmg=owns('tip')?1:0;
  m.charge=owns('lens')?1/.7:1; m.boltSpeed=owns('lens')?1.3:1; m.pierce=owns('lens')?1:0;
  m.cost=owns('grip')?.75:1;
  m.stamMax=1+WING_STAM*wingN();
  m.baitTime=owns('charm')?1.5:1; m.mothGather=owns('charm')?1.25:1;
  if(G.potions&&G.potions.N){ G.potions.N.max=owns('bandolier')?5:3; G.potions.N.heal=owns('recipe2')?8:6; }
  const J=G.moths&&G.moths.jar; if(J)J.capacity=owns('jar')?100:60;
  const mx=maxHp();
  if(mx!==p.maxHp){ const gain=mx-(p.maxHp||BASE_HP); p.maxHp=mx; if(gain>0&&!o.noHeal)p.hp=Math.min(mx,(p.hp||0)+gain); if(p.hp>mx)p.hp=mx; }
  lastMax=mx;
}

/* ---------------------------------------------------------------- icons (inline SVG; parchment-friendly) */
const ICON={
  shard:'<svg viewBox="0 0 32 32"><path d="M16 2l5 11-5 17-5-17z" fill="#b48cff" stroke="#4b3863" stroke-width="1.2"/><path d="M16 2l5 11h-5z" fill="#e6d6ff"/><path d="M11 13h5l0 17z" fill="#8a5cf0"/></svg>',
  heart:'<svg viewBox="0 0 32 32"><path d="M16 28S4 20.6 2.6 13.4C1.6 8.4 4.8 4.4 9.2 4.4c3 0 5 1.8 6.8 4.4 1.8-2.6 3.8-4.4 6.8-4.4 4.4 0 7.6 4 6.6 9C28 20.6 16 28 16 28z" fill="#c2405a" stroke="#c8a24c" stroke-width="1.6"/><path d="M8.6 9.4c1.8-1.6 3.8-1.1 4.8.2" stroke="#ffd6de" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>',
  mark:'<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="12.5" fill="#c8a24c" stroke="#6a4a2e" stroke-width="1.4"/><circle cx="16" cy="16" r="9.4" fill="none" stroke="#8a6a2e" stroke-width="1"/><path d="M16 8.5l2.2 6.6h-4.4zM13.4 16.2h5.2l-1 7.4h-3.2z" fill="#6a4a2e"/><path d="M11 16.2h10" stroke="#6a4a2e" stroke-width="1.2"/></svg>',
  wing:'<svg viewBox="0 0 32 32"><path d="M16 9C12 4 4 5 3 11c-1 5 5 7 11 4-4 3-6 9-1 10 3 .6 3-5 3-9 0 4 0 9.6 3 9 5-1 3-7-1-10 6 3 12 1 11-4-1-6-9-7-13-2z" fill="#efe6d8" stroke="#6c3f5f" stroke-width="1"/><path d="M16 9v16" stroke="#6a5a50" stroke-width="1.4"/></svg>',
  cache:'<svg viewBox="0 0 32 32"><rect x="4" y="11" width="24" height="15" rx="1.5" fill="#6a4a2e" stroke="#2b2026" stroke-width="1.2"/><path d="M4 11c0-4 3-6 12-6s12 2 12 6z" fill="#7a5636" stroke="#2b2026" stroke-width="1.2"/><path d="M9 6.5v19.5M23 6.5v19.5" stroke="#3a3540" stroke-width="2"/><rect x="13.5" y="12" width="5" height="6" rx="1" fill="#c8a24c"/></svg>',
  tip:'<svg viewBox="0 0 32 32"><path d="M8 28L22 10" stroke="#6a4a2e" stroke-width="3" stroke-linecap="round"/><path d="M22 4l5 5-5 5-5-5z" fill="#b48cff" stroke="#4b3863"/></svg>',
  lens:'<svg viewBox="0 0 32 32"><path d="M6 20l8-14 12 4-6 16z" fill="rgba(200,226,232,.7)" stroke="#4b6a7a" stroke-width="1.2"/><path d="M10 18l4-8 6 2" stroke="#fff" stroke-width="1.2" fill="none"/></svg>',
  grip:'<svg viewBox="0 0 32 32"><rect x="12" y="3" width="8" height="26" rx="3" fill="#8a6a46"/><path d="M12 9l8 3M12 13l8 3M12 17l8 3M12 21l8 3" stroke="#3d2f33" stroke-width="1.4"/></svg>',
  bandolier:'<svg viewBox="0 0 32 32"><path d="M4 6l24 20" stroke="#6a4a2e" stroke-width="6" stroke-linecap="round"/><g fill="#a46cff" stroke="#2b2026"><rect x="8" y="7" width="3.4" height="6" rx="1"/><rect x="13" y="11" width="3.4" height="6" rx="1"/><rect x="18" y="15" width="3.4" height="6" rx="1"/></g></svg>',
  jar:'<svg viewBox="0 0 32 32"><path d="M11 4h10v3h-1v3c4 2 6 5 6 9v6a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3v-6c0-4 2-7 6-9V7h-1z" fill="rgba(207,230,226,.6)" stroke="#4b6a7a" stroke-width="1.2"/><circle cx="13" cy="20" r="1.6" fill="#fff0c8"/><circle cx="18" cy="23" r="1.3" fill="#fff0c8"/><circle cx="19" cy="17" r="1.1" fill="#fff0c8"/></svg>',
  charm:'<svg viewBox="0 0 32 32"><path d="M16 2v6" stroke="#8a6a2e" stroke-width="1.4"/><circle cx="16" cy="9" r="2" fill="none" stroke="#8a6a2e" stroke-width="1.4"/><path d="M16 12c-3-3-9-2-9 2 0 3 5 4 8 2-2 2-3 6 0 6 1 0 1-3 1-5 0 2 0 5 1 5 3 0 2-4 0-6 3 2 8 1 8-2 0-4-6-5-9-2z" fill="#c8a24c" stroke="#6a4a2e"/></svg>',
  recipe2:'<svg viewBox="0 0 32 32"><path d="M6 4h16l4 4v20H6z" fill="#efe4cc" stroke="#6a4a2e" stroke-width="1.2"/><path d="M10 11h12M10 15h12M10 19h8" stroke="#6c3f5f" stroke-width="1.2"/><circle cx="22" cy="23" r="3.4" fill="#c2405a"/></svg>'
};

/* ---------------------------------------------------------------- world helpers: perches (floor + walkable + collider) */
const perches=[];   // {x,z,r,top,tide:boolean (only above water at low tide)}
// a perch is a built surface you jump onto: it only catches you from above (the landing test samples 0.3 m up, so a
// jump has to clear the top to within 0.35 m; walking never steps up onto one)
G.floorProviders.push((x,z,y)=>{
  let best=null;
  for(const p of perches){ const dx=x-p.x, dz=z-p.z; if(dx*dx+dz*dz>p.r*p.r)continue; if(p.top<=y+.05&&(best==null||p.top>best))best=p.top; }
  return best;
});
const tideLevel=()=>(G.world&&G.world.tide)||0;
const perchAllowed=p=>!p.tide||p.top>tideLevel()+.15;
// a perch is dry footing even where the ground under it is sea or sheer cliff (core: G.walkOverrides)
(G.walkOverrides||[]).push((x,z)=>{ for(const p of perches){ const dx=x-p.x, dz=z-p.z; if(dx*dx+dz*dz<=p.r*p.r&&perchAllowed(p)&&Math.abs((G.player&&G.player.pos?G.player.pos.y:p.top)-p.top)<1.2)return true; } return null; });
function addPerch(o){ const p=Object.assign({r:1,tide:false},o); perches.push(p); return p; }

/* ---------------------------------------------------------------- materials + small builders */
let MAT=null;
function mats(){
  if(MAT)return MAT;
  MAT={
    stone:G.toon('#7f8288'), stoneDark:G.toon('#5f6268'), moss:G.toon('#5d6a4a'), timber:G.toon('#5a4030'), plank:G.toon('#7a5a3e'),
    iron:G.toon('#3a3540'), brass:G.toon('#c8a24c',{emissive:'#5a4214',emissiveIntensity:.25}),
    shard:G.toon('#b48cff',{emissive:'#7a3cff',emissiveIntensity:.9,transparent:true,opacity:.92}),
    heart:G.toon('#d0465f',{emissive:'#7a1428',emissiveIntensity:.6}),
    wing:new THREE.MeshBasicMaterial({map:G.tex.moth,color:0xfff2dc,transparent:true,depthWrite:false,side:THREE.DoubleSide})
  };
  return MAT;
}
function glowSprite(hex,scale,op){ const s=new THREE.Sprite(new THREE.SpriteMaterial({map:G.tex.soft,color:new THREE.Color(hex),transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,opacity:op}));
  s.scale.setScalar(scale); return s; }
function rockGeo(rTop,rBot,h,seed){
  const g=new THREE.CylinderGeometry(rTop,rBot,h,8,3); const Pp=g.attributes.position, r=U.rng(seed||7);
  for(let i=0;i<Pp.count;i++){ const x=Pp.getX(i),y=Pp.getY(i),z=Pp.getZ(i); if(Math.abs(y)>h/2-.01&&y>0){ continue; } const k=1+(r()-.5)*.28; Pp.setXYZ(i,x*k,y,z*k); }
  g.computeVertexNormals(); return g;
}
/** a rock pillar from `base` up to a flat top at `top` (radius r) */
function pillar(root,x,z,base,top,r,o={}){
  const h=top-base, M=mats();
  const m=new THREE.Mesh(rockGeo(r*.92,r*(o.flare||1.25),h,Math.round(x*7+z*3)),o.mat||M.stone); m.position.set(x,base+h/2,z); m.rotation.y=(x*1.7+z)%TAU;
  m.castShadow=true; m.receiveShadow=true; root.add(m);
  const cap=new THREE.Mesh(new THREE.CylinderGeometry(r*.88,r*.94,.12,8),M.moss); cap.position.set(x,top-.05,z); cap.rotation.y=m.rotation.y; root.add(cap);
  if(!o.noCollider)G.addCollider({x,z,r:r*.9,y0:base-2,y1:top-.3});
  return m;
}

/* ---------------------------------------------------------------- shard + cache meshes */
let shardGeo=null;
function shardMesh(){
  const M=mats(); if(!shardGeo){ shardGeo=new THREE.OctahedronGeometry(.22,0); shardGeo.scale(.55,1.6,.4); }
  const g=new THREE.Group(); const c=new THREE.Mesh(shardGeo,M.shard); g.add(c); g.userData.core=c;
  const glow=glowSprite('#a274ff',2.1,.7); g.add(glow); g.userData.glow=glow;
  const tw=glowSprite('#f0e4ff',.5,0); g.add(tw); g.userData.tw=tw;
  return g;
}
function heartRelic(){
  const s=new THREE.Shape(); s.moveTo(0,-.32); s.bezierCurveTo(-.45,-.05,-.36,.3,0,.14); s.bezierCurveTo(.36,.3,.45,-.05,0,-.32);
  const geo=new THREE.ExtrudeGeometry(s,{depth:.12,bevelEnabled:true,bevelThickness:.04,bevelSize:.04,bevelSegments:2}); geo.center();
  const m=new THREE.Mesh(geo,mats().heart); G.outline&&G.outline(m,{thickness:.02});
  const g=new THREE.Group(); g.add(m); g.add(glowSprite('#ff7a96',1.4,.6)); return g;
}
function markRelic(){
  const M=mats(), g=new THREE.Group();
  const c=new THREE.Mesh(new THREE.CylinderGeometry(.2,.2,.05,20),M.brass); c.rotation.x=PI/2; g.add(c);
  const e=new THREE.Mesh(new THREE.CylinderGeometry(.06,.1,.06,5),G.toon('#6a4a2e')); e.position.z=.03; e.rotation.x=PI/2; g.add(e);
  g.add(glowSprite('#ffd27a',1.0,.45)); return g;
}
function wingRelic(){
  const g=new THREE.Group(); const p=new THREE.Mesh(new THREE.PlaneGeometry(.9,.9),mats().wing); g.add(p); g.add(glowSprite('#fff0c8',1.2,.5)); return g;
}
function genericRelic(hex){ const g=new THREE.Group(); const m=new THREE.Mesh(new THREE.IcosahedronGeometry(.16,0),G.toon(hex,{emissive:hex,emissiveIntensity:.5})); g.add(m); g.add(glowSprite(hex,1,.45)); return g; }
function relicFor(icon){
  if(icon==='shard'){ const s=shardMesh(); s.scale.setScalar(1.3); return s; }
  if(icon==='heart')return heartRelic(); if(icon==='mark'||icon==='cache')return markRelic(); if(icon==='wing')return wingRelic();
  return genericRelic(icon==='charm'?'#c8a24c':icon==='lens'||icon==='jar'?'#bfe4ee':'#b48cff');
}
function cacheMesh(){
  const M=mats(), g=new THREE.Group();
  const body=new THREE.Mesh(new THREE.BoxGeometry(.9,.5,.58),M.timber); body.position.y=.25; g.add(body);
  for(const x of [-.3,.3]){ const b=new THREE.Mesh(new THREE.BoxGeometry(.07,.52,.61),M.iron); b.position.set(x,.25,0); g.add(b); }
  const lid=new THREE.Group(); lid.position.set(0,.5,-.29); g.add(lid);
  const top=new THREE.Mesh(new THREE.CylinderGeometry(.29,.29,.9,10,1,false,0,PI),M.timber); top.rotation.z=PI/2; top.scale.set(1,1,.62); top.position.set(0,0,.29); lid.add(top);
  for(const x of [-.3,.3]){ const b=new THREE.Mesh(new THREE.CylinderGeometry(.305,.305,.07,10,1,false,0,PI),M.iron); b.rotation.z=PI/2; b.scale.set(1,1,.64); b.position.set(x,0,.29); lid.add(b); }
  const lock=new THREE.Mesh(new THREE.BoxGeometry(.14,.16,.04),M.brass); lock.position.set(0,.4,.3); g.add(lock);
  const glow=glowSprite('#ffcf7a',.9,0); glow.position.y=.6; g.add(glow);
  g.traverse(o=>{ if(o.isMesh){ o.castShadow=true; } });
  G.outline&&G.outline(body,{thickness:.015});
  g.userData={lid,glow,lock}; return g;
}

/* ---------------------------------------------------------------- the spots
   Each shard spot: where it sits (`at()` -> Vector3, evaluated at init), what it needs (`when()`), and the built bits that make
   the route (perches). `how` is the route in words; PROGRESSION.md has the same table. Cave spots use G.cave anchors. */
const root=new THREE.Group(); root.name='progression';
const caveAnchor=(room,key,fb)=>{ const r=G.cave&&G.cave.rooms&&G.cave.rooms[room]; const a=r&&r.anchors&&r.anchors[key]; return a&&!Array.isArray(a)?a.clone():(fb?fb.clone():null); };
const blightCured=id=>{ const b=G.moths&&G.moths.blight&&G.moths.blight(id); return !!(b&&b.cured); };
const SPOTS=[];   // filled in buildSpots()
const SAND=[];    // props on cave.js's sandbar (it only exists in the core loop)
const CACHES=[];

function buildSpots(){
  const M=mats();
  const lm=LM();
  /* 1. Standing stones: the crown of the shortest standing stone (stone 1, ~2.5 m) — too tall for a double jump from the grass.
     A broken-off chunk of it lies at its foot: jump onto that, then double jump up. */
  { const st=lm.stones||{x:40,z:-35}, a1=1/9*TAU+.2;
    const s1={x:st.x+Math.cos(a1)*8.5,z:st.z+Math.sin(a1)*8.5}, g1=H(s1.x,s1.z), t1=topOf(s1.x,s1.z,g1+2.5);
    const ox=Math.cos(a1), oz=Math.sin(a1), rb={x:s1.x+ox*2.0+oz*.45,z:s1.z+oz*2.0-ox*.45}, gr=H(rb.x,rb.z), tr=gr+.85;
    addPerch({x:s1.x,z:s1.z,r:.82,top:t1}); lowerCollider(s1.x,s1.z,t1-.4);   // the standing stone's crown
    addPerch({x:rb.x,z:rb.z,r:.78,top:tr});                                   // the broken chunk (a step)
    const stoneMat=G.toon('#86878d');
    const chunk=new THREE.Mesh(rockGeo(.7,.85,tr-gr+.3,21),stoneMat); chunk.position.set(rb.x,gr+(tr-gr+.3)/2-.3,rb.z); chunk.rotation.set(.08,a1,-.06); chunk.scale.set(1.05,1,.8); chunk.castShadow=true; root.add(chunk);
    const cap=new THREE.Mesh(new THREE.CylinderGeometry(.66,.7,.1,8),M.moss); cap.position.set(rb.x,tr-.04,rb.z); cap.scale.set(1.05,1,.8); cap.rotation.y=a1; root.add(cap);
    G.addCollider({x:rb.x,z:rb.z,r:.75,y0:gr-1,y1:tr-.35});
    SPOTS.push({id:'stones',name:'The standing stones',how:'On the crown of the shortest standing stone (north-east side of the circle), 2.5 m up: too tall for a double jump from the grass. Jump onto the broken-off chunk at its foot, then double jump.',
      pos:V(s1.x,t1+.55,s1.z),from:V(rb.x,tr,rb.z)}); }
  /* 2. The moor spire: a ~11 m stone spire on the moor at the foot of the headland's west face, beside the bottom of the cliff
     path. Too tall to climb: glide to it off the headland's west edge (the sea-facing cliffs are walls; this face is a steep
     slope you can run off). */
  { const x=101.5, z=10, g=H(x,z), top=Math.max(g+10,26);   // ~13 m out from the edge: the cloak sinks about 1 m per metre flown
    addPerch({x,z,r:1.7,top}); pillar(root,x,z,g-.5,top,1.7,{flare:1.7});
    for(let i=0;i<3;i++){ const a=i*2.1+.4, rx=x+Math.cos(a)*3.4, rz=z+Math.sin(a)*3.4; const r=new THREE.Mesh(rockGeo(.4,.7,.9,i+31),M.stoneDark); r.position.set(rx,H(rx,rz)+.3,rz); root.add(r); }
    SPOTS.push({id:'spire',name:'The moor spire',how:'On top of an 11 m stone spire beside the foot of the cliff path. Too tall to climb: from the headland top, run west off the steep edge just north of where the cliff path starts down (z ≈ 10), glide straight at the spire and let go over it.',
      pos:V(x,top+.55,z),from:V(118,H(118,10),10)}); }
  /* 3. Sea stack at low tide: a shelf at the foot of a stack off the south beach, under water except at low tide. */
  { const x=46; let z=80; for(;z<100;z+=.25){ if(H(x,z)<-1.75)break; }
    const sand=H(x,z), top=sand+1.25;   // sand ~-1.75 (dry only at low tide); the shelf top ~-0.5: above low water, under high water
    addPerch({x,z,r:1.3,top,tide:true});
    pillar(root,x,z,sand-.6,top,1.3,{flare:1.15,noCollider:true});
    pillar(root,x+1.6,z+2.2,sand-1,sand+7.5,1.5,{flare:1.3});          // the stack itself
    SPOTS.push({id:'stack',name:'The sea stack',how:'A shelf at the foot of a sea stack off the south beach. It only comes out of the water at low tide: wade out across the sand and jump up.',
      pos:V(x,top+.55,z),from:V(x,sand,z-2.4),tide:true}); }
  /* 4. Hamlet attic: a loft of old floorboards inside the north-west ruin; a heap of fallen slates is the step up. */
  { const hx=-28, hz=41, yaw=.35, base=Math.min(H(hx-3,hz-2),H(hx+3,hz-2),H(hx-3,hz+2),H(hx+3,hz+2));
    const L=(lx,lz)=>({x:hx+lx*Math.cos(yaw)+lz*Math.sin(yaw), z:hz-lx*Math.sin(yaw)+lz*Math.cos(yaw)});
    const loft=L(-1.8,.9), heap=L(.6,-.6), lt=base+2.6, ht=base+.95;
    addPerch({x:loft.x,z:loft.z,r:1.25,top:lt}); addPerch({x:heap.x,z:heap.z,r:.75,top:ht});
    const boards=new THREE.Mesh(new THREE.BoxGeometry(2.8,.14,2.2),M.plank); boards.position.set(loft.x,lt-.07,loft.z); boards.rotation.y=yaw; root.add(boards);
    for(const s of [-1,1]){ const post=new THREE.Mesh(new THREE.BoxGeometry(.16,lt-base,.16),M.timber); const q=L(-1.8+s*1.1,1.8); post.position.set(q.x,base+(lt-base)/2,q.z); root.add(post); }
    const pile=new THREE.Mesh(rockGeo(.6,.85,ht-base+.2,5),G.toon('#5a6070')); pile.position.set(heap.x,base+(ht-base)/2-.1,heap.z); root.add(pile);
    G.addCollider({x:heap.x,z:heap.z,r:.7,y0:base-1,y1:ht-.3});
    SPOTS.push({id:'attic',name:'The hamlet attic',how:'On the last floorboards of a loft in the north-west ruin. Jump onto the heap of fallen slates, then double jump up to the loft.',
      pos:V(loft.x,lt+.55,loft.z),from:V(heap.x,ht,heap.z)}); }
  /* 5. The Resisting Tree: tucked behind the roots on the far (west) side of the giant tree. */
  { const t=lm.resistingTree||{x:-165,z:5}; const x=t.x-6.2, z=t.z-2.6;
    SPOTS.push({id:'roots',name:'Behind the old tree’s roots',how:'Walk round the Resisting Tree: the glint is in a hollow of its roots on the far, western side.',pos:V(x,H(x,z)+.55,z),from:V(x-3,H(x-3,z),z)}); }
  /* 6. Guarded by the moor's hound pack, in the middle of their range. */
  { const x=58, z=-12;
    for(let i=0;i<5;i++){ const a=i/5*TAU+.4, rx=x+Math.cos(a)*2.2, rz=z+Math.sin(a)*2.2; const r=new THREE.Mesh(rockGeo(.35,.55,.7,i+3),M.stoneDark); r.position.set(rx,H(rx,rz)+.25,rz); root.add(r); }
    SPOTS.push({id:'hounds',name:'The hounds’ ring',how:'In a ring of stones on the open moor where the hound pack runs. Fight or slip past them.',pos:V(x,H(x,z)+.55,z),from:V(x-4,H(x-4,z),z)}); }
  /* 7. The Blighted Grove: appears where the blight was, once it is cured. */
  { const b=G.moths&&G.moths.blight&&G.moths.blight('grove'); const gp=b?b.pos:V(-120,0,-25), x=gp.x+1.5, z=gp.z+1.5;
    SPOTS.push({id:'grove',name:'The cured grove',how:'Cure the Blighted Grove in the forest (the core loop): a shard rises where the black was.',pos:V(x,H(x,z)+.55,z),when:()=>blightCured('grove'),from:V(x+3,H(x+3,z),z)}); }
  /* 8. The sea cave, off the main path: the Flooding Stair's upper ledge (reached at high tide from the floating crates). */
  { const a=caveAnchor('stair','ledge',V(7.6,62.6,734)); a.x+=.6;
    SPOTS.push({id:'cave',name:'The Flooding Stair’s ledge',how:'In the sea cave: the upper ledge of the Flooding Stair. At high tide, ride the floating crates up and jump across.',pos:V(a.x,a.y+.55,a.z),cave:true,from:a.clone()}); }
  /* 9. The cliff-path outcrop: a rock jutting from the drop beside the cliff path's long northward run, 1.6 m above it. */
  { const px=115.5, pz=-6, py=H(px,pz); let ox=px-2.7; const top=py+1.6, g=Math.min(H(ox,pz),py-.5);
    addPerch({x:ox,z:pz,r:.85,top}); pillar(root,ox,pz,g-1,top,.85,{flare:1.5});
    SPOTS.push({id:'outcrop',name:'The cliff-path outcrop',how:'On a rock jutting out over the drop beside the cliff path where it runs north along the headland’s west face. Double jump from the path.',
      pos:V(ox,top+.55,pz),from:V(px+.6,py,pz)}); }
  /* 10. The tidepool on the sandbar (cave.js's causeway under the headland: dry only at low tide, core loop only). */
  { const x=131, z=56.35, y=-.95;
    const pool=new THREE.Mesh(new THREE.CircleGeometry(1.1,14),G.toon('#2f4a5a',{emissive:'#1a2a3a',emissiveIntensity:.3})); pool.rotation.x=-PI/2; pool.position.set(x,y+.04,z); root.add(pool); SAND.push(pool);
    for(let i=0;i<6;i++){ const a=i/6*TAU+.3, rx=x+Math.cos(a)*1.35, rz=z+Math.sin(a)*1.1; const r=new THREE.Mesh(rockGeo(.2,.36,.42,i+9),M.stoneDark); r.position.set(rx,y+.12,rz); root.add(r); SAND.push(r); }
    SPOTS.push({id:'tidepool',name:'The tidepool',how:'In a rock pool on the sandbar that runs under the headland’s south cliff to the sea cave. The bar is only above water at low tide.',
      pos:V(x,y+.5,z),tide:true,when:()=>!!(G.loop&&G.loop.active),from:V(x-4,y,z)}); }
  /* 11. The west tip: on a rock at the far end of the island, past the forest. */
  { let x=-215, z=-4; for(let k=0;k<60&&H(x-1,z)>.8;k++)x-=1; const g=H(x,z), top=g+1.1;
    addPerch({x,z,r:.9,top}); pillar(root,x,z,g-.5,top,.9);
    SPOTS.push({id:'west',name:'The west tip',how:'At the very end of the island, past the Resisting Tree: on a rock above the last beach. A plain jump.',pos:V(x,top+.55,z),from:V(x+2.5,H(x+2.5,z),z)}); }
  /* 12. The north cliff spire: a stone needle at the headland's north edge — double jump from the path. */
  { const x=150, z=-30, g=H(x,z), top=g+1.85;
    addPerch({x,z,r:.75,top}); pillar(root,x,z,g-.3,top,.75,{flare:1.4});
    SPOTS.push({id:'needle',name:'The headland needle',how:'A stone needle on the headland’s north side. Run at it and double jump onto the top.',pos:V(x,top+.55,z),from:V(x+2.5,g,z)}); }
  // the shard objects
  for(const s of SPOTS){ s.mesh=shardMesh(); s.mesh.position.copy(s.pos); root.add(s.mesh); s.t=Math.random()*10; s.chimeT=2+Math.random()*3; }

  /* ---- Keeper's Caches ---- */
  const cache=(id,name,x,z,o={})=>{ const y=o.y!=null?o.y:G.floorAt(x,z,(o.yHint!=null?o.yHint:H(x,z))+3); CACHES.push(Object.assign({id,name,pos:V(x,y,z),yaw:o.yaw||0,loot:o.loot||{}},o)); };
  const lh=lm.lighthouse||{x:180,z:0};
  cache('tower','Behind the lighthouse',lh.x+8.5,lh.z+5,{yaw:-2.2,loot:{glowcap:3},how:'On the seaward side of the lighthouse, by the cliff edge.'});
  cache('hamlet','In the hamlet ruin',-9+1.5,19+.8,{yaw:2.9,loot:{ichor:2},how:'Inside the south-east ruin of the hamlet.'});
  cache('ramp','Under the cliff path',96,20,{yaw:-1,loot:{brine:2},how:'Tucked beside the foot of the cliff path.'});
  cache('forest','By the fallen log',-120,32,{yaw:.6,loot:{glowcap:2,ichor:1},how:'In the southern forest, among the fallen trunks.'});
  cache('stones','Behind the standing stones',33,-48,{yaw:1.2,loot:{pearl:1},how:'Just outside the stone circle, on its far (north) side.'});
  cache('north','On the north shore',-20,-80,{yaw:2.6,loot:{kelp:2,brine:1},how:'On the moor’s north shore, above the shingle.'});
  { const g=caveAnchor('gallery','roost',V(8,63,770)); cache('gallery','Among the keepers’ statues',g.x-3.2,g.z+3.2,{y:G.floorAt(g.x-3.2,g.z+3.2,g.y+2),cave:true,yaw:PI,loot:{pearl:1,ichor:1},how:'In the sea cave’s Gallery of Keepers, near the moth roost.'}); }
  cache('sandbar','On the sandbar',146,56.6,{y:-.95,loot:{pearl:1,kelp:1},tide:true,when:()=>!!(G.loop&&G.loop.active),yaw:PI,how:'On the sandbar under the headland, near the sea cave — low tide only.'});
  for(const c of CACHES){
    c.mesh=cacheMesh(); c.mesh.position.copy(c.pos); c.mesh.rotation.y=c.yaw; root.add(c.mesh);
    G.addCollider({x:c.pos.x,z:c.pos.z,r:.45,y0:c.pos.y-1,y1:c.pos.y+.45});
    c.ia=G.interact.add({pos:()=>c.pos,radius:1.9,priority:6,label:'Open the keeper’s cache',enabled:()=>!S.caches[c.id]&&isPlay()&&!reward.active&&(!c.when||c.when()),use(){ openCache(c); }});
  }
}
/* the actual top of a world mesh at (x,z) (raycast straight down; used for the standing stone) */
function topOf(x,z,fb,strict){
  try{ const rc=new THREE.Raycaster(V(x,fb+8,z),V(0,-1,0),0,12); const list=[]; G.scene.traverse(o=>{ if(o.isMesh&&!o.isInstancedMesh&&o.visible&&o.name!=='terrain'&&o.name!=='sea'&&!(o.parent&&o.parent.name==='progression'))list.push(o); });
    const h=rc.intersectObjects(list,false).filter(q=>Math.hypot(q.point.x-x,q.point.z-z)<.2&&q.point.y>fb-1.6&&q.point.y<fb+1.6); if(h.length)return h[0].point.y; }catch(e){}
  return strict?null:fb;
}
function lowerCollider(x,z,y1){ try{ for(const c of G.collidersNear(x,z)) if(Math.hypot(c.x-x,c.z-z)<.3&&c.y1>y1)c.y1=y1; }catch(e){} }

/* ---------------------------------------------------------------- collecting */
function collectShard(s,o={}){
  if(S.shards[s.id])return; S.shards[s.id]=1; s.mesh.visible=false;
  const n=shardN(), into=((n-1)%SHARDS_PER_HEART)+1, full=into===SHARDS_PER_HEART;
  G.emit('progress:shard',{id:s.id,n,total:SPOTS.length});
  if(o.silent){ apply(); return; }
  if(full)heldHp+=2;
  sparkleAt(s.pos,'#c4a0ff',22);
  rewardFn({id:'shard',icon:'shard',name:full?'A new heart':'Heart Shard',eyebrow:full?'Heart Shard · 4 of 4':'Heart Shard · '+into+' of 4',
    desc:full?'Four slivers of the old lamp’s glass fit together, warm as a hand. Your heart grows.':'A sliver of the old lamp’s glass, still warm. '+(SHARDS_PER_HEART-into)+' more and it will be a heart.',
    pips:into,onLift:()=>{ if(full){ heldHp=Math.max(0,heldHp-2); G.emit('progress:heart',{src:'shards'}); } apply(); },sub:n+' of '+SPOTS.length+' shards found'});
}
function openCache(c){
  if(S.caches[c.id])return; S.caches[c.id]=1; S.marks['cache:'+c.id]=1;
  c.open=0.001;
  const loot=Object.entries(c.loot||{}); for(const [k,n] of loot){ try{ G.inv&&G.inv.add(k,n,{silent:true}); }catch(e){} }
  const items=G.inv&&G.inv.ITEMS||{};
  const lootTxt=loot.map(([k,n])=>n+' '+(n>1?((items[k]&&items[k].plural)||k):((items[k]&&items[k].name)||k))).join(', ');
  G.emit('progress:cache',{id:c.id}); G.emit('progress:mark',{n:1,src:'cache'});
  rewardFn({id:'cache',icon:'mark',name:'Keeper’s Mark',eyebrow:'Keeper’s cache · '+count(S.caches)+' of '+CACHES.length,
    desc:'A brass keeper’s token, worn smooth by a thumb.'+(lootTxt?' Beneath it: '+lootTxt+'.':''),sub:marksHeld()+' '+(marksHeld()===1?'Mark':'Marks')+' to spend at a keeper’s bench'});
  autosave();
}
function grantMarks(src,n,o={}){ if(S.marks[src])return false; S.marks[src]=n; G.emit('progress:mark',{n,src}); return true; }
function grantHeart(src){ if(S.hearts[src])return false; S.hearts[src]=1; G.emit('progress:heart',{src}); return true; }
function grantCharm(){ if(S.upgrades.charm)return false; S.upgrades.charm='gift'; return true; }

/* ---------------------------------------------------------------- live events */
/* a boss leaves its Keeper's Heart lying where it fell: you walk into it (the moment never takes your hands mid-stride) */
const drops={};   // src -> {mesh,pos,t}
function dropHeart(src,pos,o){
  if(S.hearts[src]||drops[src])return;
  const mesh=heartRelic(); mesh.scale.setScalar(1.25); mesh.position.copy(pos).add(V(0,.75,0)); root.add(mesh);
  drops[src]={mesh,pos:pos.clone(),t:0,o,cave:!!o.cave};
  sparkleAt(mesh.position,'#ff9ab0',20);
}
function updateDrops(dt,p){
  for(const src in drops){ const d=drops[src]; d.t+=dt; d.mesh.rotation.y+=dt*1.4; d.mesh.position.y=d.pos.y+.75+Math.sin(d.t*2.2)*.1;
    d.mesh.visible=(!!d.cave)===!!(G.cave&&G.cave.inside);
    if(isPlay()&&p.alive&&d.mesh.visible&&Math.hypot(d.pos.x-p.pos.x,d.pos.z-p.pos.z)<1.3&&Math.abs(d.pos.y-p.pos.y)<1.8){
      root.remove(d.mesh); delete drops[src]; const o=d.o;
      const h=grantHeart(src), m=grantMarks(src,o.marks); if(h)heldHp+=2;
      rewardFn({id:'heart',icon:'heart',name:'Keeper’s Heart',eyebrow:o.eyebrow,desc:o.desc,onLift:()=>{ if(h)heldHp=Math.max(0,heldHp-2); apply(); },sub:'+'+o.marks+' Keeper’s '+(o.marks>1?'Marks':'Mark')});
      autosave(); } }
}
function onBoss(e){
  const who=e&&e.who;
  if(who==='stag'){
    const sp=LM().lanternSpot||{x:-160,y:9,z:9}, x=sp.x-3.2, z=sp.z+2.6;
    dropHeart('stag',V(x,G.floorAt(x,z,H(x,z)+2),z),{marks:1,eyebrow:'The Hollow Stag',desc:'Where the Stag fell, something red and warm was left in the roots. Your heart grows by one.'});
  }else if(who==='gloaming'){
    const m=grantMarks('gloaming',2), c=grantCharm(); if(!m&&!c)return; apply();
    // the ending card follows the Gloaming within a few seconds; the moment waits for play to resume (Keep exploring)
    later(6,()=>rewardFn({id:'charm',icon:'charm',name:'Lantern Charm',eyebrow:'The Gloaming',desc:'A brass moth on a chain, left in the beam’s wake. The bait clings longer and the moths come quicker.',sub:'+2 Keeper’s Marks'}));
  }
}
function onUndertow(){
  const pd=caveAnchor('arena','pedestal',V(60,61.4,785)), dr=caveAnchor('arena','door',V(60,61.7,766));
  const dir=dr.clone().sub(pd).setY(0).normalize(), x=pd.x+dir.x*3.5, z=pd.z+dir.z*3.5; let y=G.floorAt(x,z,pd.y+2); if(!(y>pd.y-2))y=pd.y;
  dropHeart('undertow',V(x,y,z),{marks:2,cave:true,eyebrow:'The Undertow',desc:'The drowned lens gives up one last warm thing. Your heart grows by one.'});
}
function onFreed(e){
  const before=wingN(); S.freed=Math.max(S.freed+1,(e&&e.freed)|0,G.state.freed|0); const n=wingN();
  if(n>before){ G.emit('progress:wing',{n});
    rewardFn({id:'wing',icon:'wing',name:'Moth Wing',eyebrow:'Moth Wing · '+n+' of 4',desc:'The swarm lends you its lightness. Your breath runs deeper (+20% stamina).',onLift:()=>{ apply(); wingFlourish(); }});
    autosave(); }
}
function onBlight(e){
  if(!e||!e.id||e.restored)return;
  if(grantMarks('blight:'+e.id,1)){
    later(2,()=>rewardFn({id:'mark',icon:'mark',name:'Keeper’s Mark',eyebrow:e.name||'A blight cured',desc:'In the cured ground, a brass token the black had swallowed.',sub:marksHeld()+' '+(marksHeld()===1?'Mark':'Marks')+' to spend at a keeper’s bench'}));
    autosave(); }
}
/* old saves (and saves from before this module): grant what their state already earned, quietly */
function reconcile(quiet){
  const got=[];
  const F=G.flow||{};
  if((F.stagDead||G.flag('stagDead'))&&!drops.stag){ if(grantHeart('stag'))got.push('a Keeper’s Heart'); if(grantMarks('stag',1))got.push('a Mark'); }
  if(F.bossDead){ if(grantMarks('gloaming',2))got.push('2 Marks'); if(grantCharm())got.push('the Lantern Charm'); }
  const CB=G.caveBoss; if(((CB&&CB.defeated)||G.flag('undertowDead'))&&!drops.undertow){ if(grantHeart('undertow'))got.push('a Keeper’s Heart'); if(grantMarks('undertow',2))got.push('2 Marks'); }
  const fr=G.state.freed|0; if(fr>S.freed){ const w0=wingN(); S.freed=fr; if(wingN()>w0)got.push((wingN()-w0)+' Moth '+(wingN()-w0>1?'Wings':'Wing')); }
  for(const b of (G.blights||[])) if(b&&b.cured&&grantMarks('blight:'+b.id,1))got.push('a Mark');
  apply();
  if(got.length&&!quiet&&G.ui&&G.ui.toast){ G.ui.toast('Keeper’s relics',got.join(' · ')); }
  return got;
}

/* ---------------------------------------------------------------- the reward moment */
const queue=[]; const reward={active:null,t:0};
const LIFT=1.7, CARD=3.6;
let card=null, liftObj=null;
function later(s,fn){ pend.push({t:s,fn}); }
const pend=[];
function rewardFn(o){ if(!o)return; queue.push(Object.assign({t0:0},o)); G.emit('progress:reward',{id:o.id}); }
function canStart(){ const p=P(); return isPlay()&&p&&p.alive&&p.grounded!==false&&!(G.cave&&G.cave._debug&&G.cave._debug.S&&G.cave._debug.S.trans); }
function startReward(o){
  reward.active=o; reward.t=0; reward.lifted=false;
  const p=P();
  if(p.setControl)p.setControl(false);
  p.camPull={yaw:(p.heading||0)+PI,pitch:.1,dist:3.4,rate:4};
  liftObj=relicFor(o.icon); liftObj.scale.multiplyScalar(1.15); root.add(liftObj);
  showCard(o); sting(o.icon==='heart'||o.icon==='shard'&&o.pips===4);
}
function endLift(){
  if(reward.lifted)return; reward.lifted=true;
  const p=P(), o=reward.active;
  if(p){ if(p.setControl)p.setControl(true); p.camPull=null; }
  if(liftObj){ root.remove(liftObj); liftObj=null; }
  if(o&&o.onLift){ try{o.onLift();}catch(e){console.error(e);} o.onLift=null; }
}
function updateReward(dt){
  for(let i=pend.length-1;i>=0;i--){ pend[i].t-=dt; if(pend[i].t<=0){ const f=pend[i].fn; pend.splice(i,1); try{f();}catch(e){console.error(e);} } }
  const o=reward.active;
  if(!o){ if(queue.length&&canStart())startReward(queue.shift()); return; }
  if(!isPlay()){ if(reward.t<LIFT){ /* paused/menu/dead mid-lift: hold */ if(G.state.mode==='dead'){ endLift(); hideCard(); reward.active=null; } return; } }
  const prev=reward.t; reward.t+=dt;
  const p=P();
  if(liftObj&&p&&p.pos){ const k=U.smooth(0,.35,reward.t); liftObj.position.set(p.pos.x,p.pos.y+1.45+.5*k+Math.sin(reward.t*3)*.03,p.pos.z); liftObj.rotation.y+=dt*1.6;
    liftObj.scale.setScalar(1.15*(.6+.4*k)); }
  if(reward.t>=LIFT)endLift();
  if(reward.t>=CARD){ hideCard(); reward.active=null; }
}
// the Traveler lifts the item overhead (blended over the current pose)
const LIFT_POSE={shRX:-.35,shLX:-.35,shRZ:-2.65,shLZ:2.65,elR:-.45,elL:-.45,hdX:-.32,spX:-.08}; // both arms straight up (Z raises them sideways in this rig)
function liftPose(T){
  const o=reward.active; if(!o||reward.t>=LIFT)return;
  const k=U.smooth(0,.28,reward.t)*(1-U.smooth(LIFT-.25,LIFT,reward.t));
  const Q=LIFT_POSE; for(const key in Q)T[key]=T[key]+(Q[key]-T[key])*k;
  return 14;
}
function sting(big){
  const A=G.audio; if(!A||!A.ready||!A.S||!A.context)return;
  try{ if(A.sfx&&A.sfx.play&&A.sfx.play('reward_sting',{gain:.9}))return; }catch(_){}
  const S2=A.S, t=A.context.currentTime;
  try{ S2.chime(t,[62,66,69,74],{g:.09,step:.11,decay:1.4}); S2.chime(t+.5,big?[74,78,81,86]:[74,81],{g:.08,step:.07,decay:2.2}); S2.bell&&S2.bell(t+.48,50,{g:.12,decay:2.8}); S2.sparkle&&S2.sparkle(t+.55,{g:.05}); }catch(e){}
}
function chime(dist){
  const A=G.audio; if(!A||!A.ready||!A.S||!A.context)return;
  const g=.035*(1-dist/CHIME_R); if(g<=.003)return;
  try{ A.S.chime(A.context.currentTime,[93,98,100],{g,step:.07,decay:1.1}); }catch(e){}
}

/* ---------------------------------------------------------------- small fx */
const fx=[];
function sparkleAt(p,hex,n){
  for(let i=0;i<n;i++){ const s=glowSprite(hex,.25+Math.random()*.25,.9); s.position.copy(p); root.add(s);
    fx.push({s,v:V((Math.random()-.5)*2.4,1+Math.random()*2.2,(Math.random()-.5)*2.4),life:.8+Math.random()*.6,t:0}); }
}
function wingFlourish(){
  const p=P(); if(!p||!p.pos)return; const M=mats();
  for(let i=0;i<14;i++){ const m=new THREE.Mesh(new THREE.PlaneGeometry(.32,.32),M.wing); const a=i/14*TAU;
    m.position.set(p.pos.x+Math.cos(a)*.4,p.pos.y+1+Math.random()*.4,p.pos.z+Math.sin(a)*.4); root.add(m);
    fx.push({s:m,v:V(Math.cos(a)*1.4,1.2+Math.random(),Math.sin(a)*1.4),life:1.4+Math.random()*.6,t:0,spin:a,wing:true}); }
}
function updateFx(dt){
  for(let i=fx.length-1;i>=0;i--){ const f=fx[i]; f.t+=dt; f.s.position.addScaledVector(f.v,dt); f.v.multiplyScalar(Math.exp(-dt*1.5));
    if(f.wing){ f.s.rotation.y=f.spin+f.t*4; f.s.rotation.x=Math.sin(f.t*22)*.6; }
    const k=1-f.t/f.life; if(f.s.material.opacity!=null)f.s.material.opacity=Math.max(0,k);
    if(f.t>=f.life){ root.remove(f.s); if(f.wing)f.s.geometry.dispose(); fx.splice(i,1); } }
}

/* ---------------------------------------------------------------- world update: shards glint, chime, pickup; caches open */
let reveal=false, beams=[];
function updateWorld(dt){
  const p=P(); if(!p||!p.pos)return;
  const t=G.time, play=isPlay(), inCave=!!(G.cave&&G.cave.inside);
  for(const s of SPOTS){
    const got=!!S.shards[s.id], avail=!got&&(!s.when||s.when());
    const dx=s.pos.x-p.pos.x, dz=s.pos.z-p.pos.z, d=Math.hypot(dx,dz);
    s.mesh.visible=avail&&d<220&&(!!s.cave===inCave);
    if(!s.mesh.visible)continue;
    s.t+=dt; const u=s.mesh.userData;
    u.core.rotation.y+=dt*1.3; u.core.position.y=Math.sin(s.t*1.8)*.08;
    u.glow.material.opacity=.6+.18*Math.sin(s.t*2.3); u.glow.scale.setScalar(2+.25*Math.sin(s.t*1.7));
    const tw=(s.t*.45)%1; u.tw.material.opacity=tw<.12?Math.sin(tw/.12*PI)*.95:0; u.tw.scale.setScalar(.4+tw*3); u.tw.position.set(.08,.18,0);
    // the glint carries further at a distance (screen-size floor) so the spot reads from where you'd look for it
    const far=U.clamp((d-15)/60,0,1); u.glow.scale.multiplyScalar(1+far*2.2);
    if(play&&d<CHIME_R){ s.chimeT-=dt; if(s.chimeT<=0){ s.chimeT=3.6+Math.random()*1.6; chime(d); } }
    const dy=p.pos.y-(s.pos.y-.55); // standing at the shard's footing (or just above): no grabbing it in passing from below a perch
    if(play&&p.alive&&d<PICK_R&&dy>-.4&&dy<1.6)collectShard(s);
  }
  for(const c of CACHES){
    const d=Math.hypot(c.pos.x-p.pos.x,c.pos.z-p.pos.z), vis=d<200&&(!!c.cave===inCave)&&(!c.when||c.when());
    c.mesh.visible=vis; if(!vis)continue;
    const u=c.mesh.userData, opened=!!S.caches[c.id];
    if(opened&&c.open==null)c.open=1;
    if(opened&&c.open<1)c.open=Math.min(1,c.open+dt*2.2);
    const k=opened?U.smooth(0,1,c.open):0; u.lid.rotation.x=-k*1.9; u.lock.visible=!opened;
    u.glow.material.opacity=opened?Math.max(0,.9*(1-c.open)*(c.open>0?1:0)):(.12+.08*Math.sin(t*2+c.pos.x));
  }
  for(const b of beams)b.visible=reveal&&!b.userData.done();
  const loop=!!(G.loop&&G.loop.active); for(const m of SAND)m.visible=loop;
}
function buildBeams(){
  const geo=new THREE.CylinderGeometry(.12,.12,60,6,1,true);
  const mk=(pos,hex,done)=>{ const m=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({color:hex,transparent:true,opacity:.55,depthWrite:false,blending:THREE.AdditiveBlending}));
    m.position.set(pos.x,pos.y+30,pos.z); m.userData.done=done; m.visible=false; root.add(m); beams.push(m); };
  for(const s of SPOTS)mk(s.pos,0xb48cff,()=>!!S.shards[s.id]);
  for(const c of CACHES)mk(c.pos,0xffc860,()=>!!S.caches[c.id]);
}

/* ---------------------------------------------------------------- DOM: reward card, Temper tab, Journal */
const CSS=`
#rewardCard{position:fixed;right:max(16px,env(safe-area-inset-right,0px));bottom:calc(25% + env(safe-area-inset-bottom,0px));transform:translate(0,14px);z-index:7;pointer-events:none;opacity:0;
  transition:opacity .45s,transform .55s cubic-bezier(.2,.8,.2,1);width:min(410px,calc(100% - 32px));display:grid;grid-template-columns:64px 1fr;gap:4px 16px;align-items:center;
  color:var(--ink);background:linear-gradient(180deg,var(--parch),var(--parch-2));padding:16px 20px 15px;border-radius:3px;
  box-shadow:0 18px 50px rgba(0,0,0,.55),inset 0 0 0 1px rgba(60,40,30,.25),inset 0 0 0 5px rgba(239,228,204,1),inset 0 0 0 6px rgba(60,40,30,.35)}
#rewardCard.show{opacity:1;transform:translate(0,0)}
#rewardCard .rc-ic{grid-row:1/span 3;width:64px;height:64px;display:grid;place-items:center;border-radius:50%;background:radial-gradient(circle,rgba(165,108,255,.28),rgba(165,108,255,0) 70%)}
#rewardCard .rc-ic svg{width:46px;height:46px;filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))}
#rewardCard .eyebrow{font-size:11.5px}
#rewardCard .rc-name{font-family:var(--display);font-size:clamp(26px,4vw,32px);line-height:1;color:#21161f}
#rewardCard .rc-desc{margin:0;font-family:var(--serif);font-style:italic;font-size:16px;line-height:1.38;color:#3d2f33}
#rewardCard .rc-sub{grid-column:2;font:600 12.5px var(--body);color:#6c3f5f;display:flex;align-items:center;gap:8px}
.rc-pips{display:inline-flex;gap:3px}.rc-pips i{width:11px;height:15px;clip-path:polygon(50% 0,100% 35%,50% 100%,0 35%);background:rgba(75,56,99,.22)}
.rc-pips i.on{background:#9a6cff}
@media (max-width:760px){#rewardCard{right:auto;left:50%;bottom:auto;top:calc(76px + env(safe-area-inset-top,0px));transform:translate(-50%,-10px)}#rewardCard.show{transform:translate(-50%,0)}}
@media (max-width:520px){#rewardCard{grid-template-columns:48px 1fr;padding:13px 15px;gap:3px 12px}#rewardCard .rc-ic{width:48px;height:48px}#rewardCard .rc-ic svg{width:36px;height:36px}#rewardCard .rc-desc{font-size:15px}}
/* Temper tab on the keeper's bench */
.alch-tabs{display:flex;gap:6px;border-bottom:1px solid rgba(60,40,30,.3);margin-top:-2px}
.alch-tabs button{font:600 14px var(--body);letter-spacing:.06em;padding:8px 16px 7px;min-height:40px;border:1px solid transparent;border-bottom:0;border-radius:3px 3px 0 0;background:transparent;color:#6c5a5f;cursor:pointer;margin-bottom:-1px}
.alch-tabs button[aria-selected="true"]{background:rgba(255,255,255,.35);border-color:rgba(60,40,30,.3);color:#21161f}
.alch-tabs button:focus-visible{outline:2px solid var(--ether);outline-offset:2px}
.alch-tabs .marks{margin-left:auto;align-self:center;display:inline-flex;align-items:center;gap:5px;font:700 14px var(--body);color:#4b3863;font-variant-numeric:tabular-nums}
.alch-tabs .marks svg{width:20px;height:20px}
#alchemy.tempering #alchList,#alchemy.tempering .alch-sat,#alchemy.tempering .alch-brewing,#alchemy.tempering .alch-lost,#alchemy.tempering .alch-sat+.alch-foot .alch-lost{display:none!important}
#alchemy:not(.tempering) #temperList{display:none}
#temperList{display:grid;gap:8px}
.tmp-up{display:grid;grid-template-columns:34px 1fr auto;gap:4px 12px;align-items:center;padding:9px 12px;border-radius:3px;background:rgba(255,255,255,.28);box-shadow:inset 0 0 0 1px rgba(60,40,30,.18)}
.tmp-up.ready{background:rgba(165,108,255,.13);box-shadow:inset 0 0 0 1px rgba(75,56,99,.45)}
.tmp-up.owned{background:rgba(200,162,76,.16);box-shadow:inset 0 0 0 1px rgba(138,106,46,.45)}
.tmp-up>svg{width:30px;height:30px}
.tmp-up .nm{font-family:var(--serif);font-size:18.5px;color:#21161f;line-height:1.15}
.tmp-up .eff{font:600 12.5px var(--body);color:#4b3863;margin-top:1px}
.tmp-up .note{font-size:13px;line-height:1.35;color:#5a4a4e;margin-top:2px}
.tmp-up .btn{padding:9px 16px;min-width:84px}
.tmp-up .btn:disabled{opacity:.42;cursor:not-allowed;filter:none}
.tmp-up .own{font:700 12px var(--body);letter-spacing:.14em;text-transform:uppercase;color:#8a6a2e}
.tmp-cost{display:flex;flex-wrap:wrap;gap:3px 10px;margin-top:4px}
.tmp-cost span{display:inline-flex;align-items:center;gap:4px;font:600 13px var(--body);color:#3d2f33;font-variant-numeric:tabular-nums}
.tmp-cost span.short{color:#a3304a}
.tmp-cost svg{width:15px;height:15px}
.tmp-lede{font-family:var(--serif);font-style:italic;font-size:15.5px;color:#3d2f33;margin:0}
@media (max-width:520px){.tmp-up{grid-template-columns:28px 1fr}.tmp-up .btn,.tmp-up .own{grid-column:2;justify-self:start}}
/* the Journal */
#journal .sheet{max-width:620px;width:100%;margin-block:auto;gap:14px}
#journal h2{font-size:clamp(30px,5vw,44px)}
.jr-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
@media (max-width:420px){.jr-grid{gap:7px}.jr-cell{padding:8px 10px}.jr-cell .v{font-size:22px}}
.jr-cell{display:grid;gap:4px;padding:10px 12px;border-radius:3px;background:rgba(255,255,255,.26);box-shadow:inset 0 0 0 1px rgba(60,40,30,.16)}
.jr-cell .k{font:600 11px var(--body);letter-spacing:.18em;text-transform:uppercase;color:#6c3f5f}
.jr-cell .v{font-family:var(--display);font-size:26px;line-height:1;color:#21161f;display:flex;align-items:center;gap:8px;font-variant-numeric:tabular-nums}
.jr-cell .v svg{width:24px;height:24px}
.jr-cell .s{font-size:13px;color:#5a4a4e;line-height:1.35}
.jr-pips{display:inline-flex;gap:3px;vertical-align:middle}.jr-pips i{width:10px;height:14px;clip-path:polygon(50% 0,100% 35%,50% 100%,0 35%);background:rgba(75,56,99,.22)}.jr-pips i.on{background:#9a6cff}
.jr-wings{display:inline-flex;gap:2px}.jr-wings svg{width:22px!important;height:22px!important;opacity:.25}.jr-wings svg.on{opacity:1}
.jr-list{display:flex;flex-wrap:wrap;gap:6px}
.jr-list span{display:inline-flex;align-items:center;gap:5px;font:600 13px var(--body);padding:4px 9px 4px 6px;border-radius:12px;background:rgba(40,25,30,.07);color:#9b8fa6}
.jr-list span.on{background:rgba(75,56,99,.14);color:#3d2f33}
.jr-list span svg{width:16px;height:16px}
.jr-list span:not(.on) svg{opacity:.35}
#journal .eyebrow.sec{margin-bottom:-6px}
.hearts .heart.born{animation:heartBorn 1.6s ease-out}
@keyframes heartBorn{0%{transform:scale(.2);filter:drop-shadow(0 0 0 #ff7a96)}35%{transform:scale(1.45);filter:drop-shadow(0 0 10px #ff9ab0)}100%{transform:scale(1);filter:none}}
@media (prefers-reduced-motion:reduce){.hearts .heart.born{animation:none}#rewardCard{transition:opacity .3s}}
`;
function buildDOM(){
  const st=document.createElement('style'); st.id='progress-css'; st.textContent=CSS; document.head.appendChild(st);
  card=document.createElement('div'); card.id='rewardCard'; card.setAttribute('role','status'); card.setAttribute('aria-live','polite'); document.body.appendChild(card);
  // Journal button in the pause menu
  const acts=$('pause')&&$('pause').querySelector('.actions');
  if(acts){ const b=document.createElement('button'); b.className='btn ghost'; b.type='button'; b.id='journalBtn'; b.textContent='Journal';
    const save=$('saveBtn'); if(save)acts.insertBefore(b,save); else acts.appendChild(b); b.addEventListener('click',()=>openJournal()); }
  const j=document.createElement('div'); j.className='card'; j.id='journal'; j.hidden=true; j.dataset.padBack='journalClose';
  j.setAttribute('role','dialog'); j.setAttribute('aria-modal','true'); j.setAttribute('aria-labelledby','journalTitle');
  j.innerHTML='<div class="sheet"><div><span class="eyebrow">The keeper’s journal</span><h2 id="journalTitle">What you carry</h2></div><div id="journalBody"></div><div class="actions"><button class="btn" id="journalClose" type="button">Back</button></div></div>';
  document.body.appendChild(j);
  $('journalClose').addEventListener('click',()=>closeJournal());
  addEventListener('keydown',e=>{ if(j.hidden)return; if(e.code==='Escape'||e.code==='KeyP'||e.code==='Backspace'||e.code==='KeyJ'){ e.preventDefault(); e.stopPropagation(); closeJournal(); } },true);
}
let cardT=null;
function showCard(o){
  if(!card)return;
  const pips=o.pips?`<span class="rc-pips">${[1,2,3,4].map(i=>`<i class="${i<=o.pips?'on':''}"></i>`).join('')}</span>`:'';
  card.innerHTML=`<div class="rc-ic">${ICON[o.icon]||ICON.shard}</div><span class="eyebrow">${esc(o.eyebrow||'')}</span><div class="rc-name">${esc(o.name)}</div><p class="rc-desc">${esc(o.desc||'')}</p>`+
    ((o.sub||pips)?`<div class="rc-sub">${pips}${esc(o.sub||'')}</div>`:'');
  card.classList.add('show');
}
function hideCard(){ if(card)card.classList.remove('show'); }

/* ---- Temper tab (injected into alchemy.js's panel) ---- */
let tab='brew', panelWasOpen=false, tabsEl=null, listEl=null;
const NAMES={mark:'Mark',glowcap:'Glowcap',kelp:'Glowkelp',brine:'Brine Crystal',pearl:'Tide Pearl',ichor:'Ichor'};
const INV_ICON={
  glowcap:'<svg viewBox="0 0 16 16"><path d="M2.2 8.6C2.6 4.6 5 2.6 8 2.6s5.4 2 5.8 6c-1.6.7-3.6 1-5.8 1s-4.2-.3-5.8-1z" fill="#a46cff"/><path d="M6.6 9.4h2.8l.5 4.4H6.1z" fill="#e6dcef"/></svg>',
  kelp:'<svg viewBox="0 0 16 16" fill="none" stroke="#2fa89a" stroke-width="1.6" stroke-linecap="round"><path d="M4 14c-1-3 2-5 0-8s1-4 1-4"/><path d="M8.5 14c1-3-2-5 0-8s0-4 0-4"/></svg>',
  brine:'<svg viewBox="0 0 16 16"><path d="M7 1.6l2.6 4.6L7 14 4.4 6.2z" fill="#e8f0f8" stroke="#8ea4c4" stroke-width=".8"/></svg>',
  pearl:'<svg viewBox="0 0 16 16"><circle cx="8" cy="8.4" r="5" fill="#f4e4ee" stroke="#b49aac" stroke-width=".8"/><circle cx="6.4" cy="6.6" r="1.5" fill="#fff"/></svg>',
  ichor:'<svg viewBox="0 0 16 16"><path d="M8 1.6C10 5 12.4 7.6 12.4 10.2A4.4 4.4 0 0 1 3.6 10.2C3.6 7.6 6 5 8 1.6z" fill="#0c0910" stroke="#9a6cff" stroke-width="1"/></svg>',
  mark:ICON.mark
};
const have=k=>k==='mark'?marksHeld():(G.inv?G.inv.count(k):0);
function available(u){ if(u.needs==='jar')return !!(G.moths&&G.moths.jar&&G.moths.jar.owned); return true; }
function canBuy(id){ const u=UP[id]; if(!u||owns(id)||!available(u))return false; for(const k in u.cost)if(have(k)<u.cost[k])return false; return true; }
function buy(id,o={}){
  const u=UP[id]; if(!u||owns(id))return false;
  if(!o.free){ if(!canBuy(id))return false;
    for(const k in u.cost){ if(k==='mark')S.spent+=u.cost[k]; else G.inv.take(k,u.cost[k]); } }
  S.upgrades[id]=o.free?'gift':1; apply();
  G.emit('progress:upgrade',{id});
  if(!o.silent)rewardFn({id:'upgrade',icon:id,name:u.name,eyebrow:'Tempered at the keeper’s bench',desc:u.effect+'.',sub:marksHeld()+' '+(marksHeld()===1?'Mark':'Marks')+' left'});
  renderTemper(); autosave(); return true;
}
function injectTemper(){
  const panel=$('alchemy'); if(!panel||tabsEl)return !!tabsEl;
  const head=panel.querySelector('.alch-head'); if(!head)return false;
  tabsEl=document.createElement('div'); tabsEl.className='alch-tabs'; tabsEl.setAttribute('role','tablist');
  tabsEl.innerHTML=`<button type="button" role="tab" id="tabBrew" data-tab="brew" aria-selected="true">Brew</button><button type="button" role="tab" id="tabTemper" data-tab="temper" aria-selected="false">Temper</button><span class="marks" id="temperMarks" title="Keeper’s Marks"></span>`;
  head.after(tabsEl);
  listEl=document.createElement('div'); listEl.id='temperList'; tabsEl.after(listEl);
  tabsEl.addEventListener('click',e=>{ const b=e.target.closest('[data-tab]'); if(b)setTab(b.dataset.tab,true); });
  listEl.addEventListener('click',e=>{ const b=e.target.closest('[data-buy]'); if(b&&!b.disabled)buy(b.dataset.buy); });
  // left/right (keys or d-pad via the pad's arrow emulation) switch tabs when a tab has focus
  tabsEl.addEventListener('keydown',e=>{ if(e.code==='ArrowRight'||e.code==='ArrowLeft'){ setTab(tab==='brew'?'temper':'brew',true); e.preventDefault(); } });
  return true;
}
function setTab(t,focus){
  tab=t; const panel=$('alchemy'); if(!panel)return;
  panel.classList.toggle('tempering',t==='temper');
  for(const b of tabsEl.querySelectorAll('[data-tab]'))b.setAttribute('aria-selected',String(b.dataset.tab===t));
  const lede=panel.querySelector('.alch-lede');
  if(lede){ if(!lede.dataset.brew)lede.dataset.brew=lede.textContent;
    lede.textContent=t==='temper'?'Brass marks and a little alchemy: the keeper’s way of tempering tools. Each can be done once.':lede.dataset.brew; }
  if(t==='temper')renderTemper();
  if(focus){ const f=t==='temper'?(listEl.querySelector('[data-buy]:not(:disabled)')||$('tabTemper')):$('tabBrew'); try{f.focus({preventScroll:true});}catch(_){f.focus();} if(G.input.device==='gamepad')f.classList.add('pad-focus'); }
}
function renderTemper(){
  if(!tabsEl)return;
  $('temperMarks').innerHTML=ICON.mark+marksHeld()+' '+(marksHeld()===1?'Mark':'Marks');
  if(tab!=='temper')return;
  const keep=document.activeElement&&document.activeElement.dataset&&document.activeElement.dataset.buy;
  let h='';
  for(const u of UPGRADES){
    const own=owns(u.id), ok=canBuy(u.id), av=available(u);
    const cost=own?'':Object.keys(u.cost).map(k=>`<span class="${have(k)<u.cost[k]?'short':''}">${INV_ICON[k]||''}${u.cost[k]} ${esc(NAMES[k]||k)}${u.cost[k]>1&&k!=='kelp'&&k!=='ichor'?'s':''} <small style="font-weight:400;color:#7a6a6e">(${have(k)})</small></span>`).join('');
    h+=`<div class="tmp-up${own?' owned':ok?' ready':''}">${ICON[u.id]}<div><div class="nm">${esc(u.name)}</div><div class="eff">${esc(u.effect)}</div>
      ${own?'':`<div class="note">${esc(av?u.desc:'Needs the moth jar from the sea cave first.')}</div><div class="tmp-cost">${cost}</div>`}</div>
      ${own?`<span class="own">${S.upgrades[u.id]==='gift'?'Given':'Tempered'}</span>`:`<button class="btn" type="button" data-buy="${u.id}" ${ok?'':'disabled'} aria-label="Temper ${esc(u.name)}">Temper</button>`}</div>`;
  }
  listEl.innerHTML=h;
  if(keep){ const f=listEl.querySelector(`[data-buy="${keep}"]:not(:disabled)`)||listEl.querySelector('[data-buy]:not(:disabled)')||$('tabTemper'); try{f.focus({preventScroll:true});}catch(_){f.focus();} }
}
function updatePanel(){
  const panel=$('alchemy'); if(!panel)return;
  if(!tabsEl&&!injectTemper())return;
  const open=!panel.hidden;
  if(open&&!panelWasOpen){ setTab('brew',false); renderTemper(); }
  panelWasOpen=open;
}

/* ---- Journal ---- */
let journalFrom=null;
function openJournal(){
  const j=$('journal'); if(!j)return;
  journalFrom=!$('pause').hidden?'pause':null;
  if(journalFrom)$('pause').hidden=true;
  renderJournal(); j.hidden=false;
  const b=$('journalClose'); try{b.focus({preventScroll:true});}catch(_){b.focus();}
}
function closeJournal(){
  const j=$('journal'); if(!j||j.hidden)return; j.hidden=true;
  if(journalFrom==='pause'&&G.state.mode==='paused'){ $('pause').hidden=false; const b=$('journalBtn'); if(b){ try{b.focus({preventScroll:true});}catch(_){b.focus();} } }
  journalFrom=null;
}
function journalData(){
  const negs=Math.min(8,Math.max(S.freed,G.state.freed|0));
  const bl=(G.blights&&G.blights.length?G.blights:[{id:'grove',name:'Blighted Grove'},{id:'tidepool',name:'Black Tide Pool'},{id:'well',name:'Choked Well'}]);
  const F=G.flow||{};
  return {hearts:maxHp()/2, shardsInto:shardN()%SHARDS_PER_HEART, shards:shardN(), shardTotal:SPOTS.length||12, wings:wingN(), marks:marksHeld(), earned:marksEarned(), spent:S.spent,
    upgrades:UPGRADES.filter(u=>owns(u.id)).map(u=>u.id), caches:count(S.caches), cacheTotal:CACHES.length||8, freed:negs,
    blights:bl.map(b=>({id:b.id,name:b.name,cured:!!b.cured})),
    bosses:[{id:'stag',name:'The Hollow Stag',done:!!(F.stagDead||S.hearts.stag)},{id:'gloaming',name:'The Gloaming',done:!!(F.bossDead||S.marks.gloaming)},{id:'undertow',name:'The Undertow',done:!!((G.caveBoss&&G.caveBoss.defeated)||S.hearts.undertow)}]};
}
function renderJournal(){
  const d=journalData(), el=$('journalBody'); if(!el)return;
  const pips=n=>`<span class="jr-pips">${[0,1,2,3].map(i=>`<i class="${i<n?'on':''}"></i>`).join('')}</span>`;
  const wings=`<span class="jr-wings">${[0,1,2,3].map(i=>ICON.wing.replace('<svg',`<svg class="${i<d.wings?'on':''}"`)).join('')}</span>`;
  const check='<svg viewBox="0 0 16 16"><path d="M3 8.5l3 3 7-7" stroke="#4b3863" stroke-width="2" fill="none" stroke-linecap="round"/></svg>';
  el.innerHTML=`<div class="jr-grid">
    <div class="jr-cell"><span class="k">Hearts</span><span class="v">${ICON.heart}${d.hearts}</span><span class="s">${pips(d.shardsInto)} ${d.shardsInto} of 4 toward the next</span></div>
    <div class="jr-cell"><span class="k">Moth Wings</span><span class="v">${wings}</span><span class="s">${d.wings} of 4 · stamina +${d.wings*20}%</span></div>
    <div class="jr-cell"><span class="k">Keeper’s Marks</span><span class="v">${ICON.mark}${d.marks}</span><span class="s">${d.earned} found · ${d.spent} spent</span></div>
    <div class="jr-cell"><span class="k">Heart Shards</span><span class="v">${ICON.shard}${d.shards} <small style="font-size:16px;color:#6c5a5f">/ ${d.shardTotal}</small></span><span class="s">found on the island</span></div>
    <div class="jr-cell"><span class="k">Keeper’s Caches</span><span class="v">${ICON.cache}${d.caches} <small style="font-size:16px;color:#6c5a5f">/ ${d.cacheTotal}</small></span><span class="s">opened</span></div>
    <div class="jr-cell"><span class="k">Negatives freed</span><span class="v">${ICON.wing}${d.freed} <small style="font-size:16px;color:#6c5a5f">/ 8</small></span><span class="s">every two lend a wing</span></div>
  </div>
  <span class="eyebrow sec">Tempered</span><div class="jr-list">${UPGRADES.map(u=>`<span class="${owns(u.id)?'on':''}">${ICON[u.id]}${esc(u.name)}</span>`).join('')}</div>
  <span class="eyebrow sec">Blights cured</span><div class="jr-list">${d.blights.map(b=>`<span class="${b.cured?'on':''}">${b.cured?check:''}${esc(b.name)}</span>`).join('')}</div>
  <span class="eyebrow sec">Bosses</span><div class="jr-list">${d.bosses.map(b=>`<span class="${b.done?'on':''}">${b.done?check:''}${esc(b.name)}</span>`).join('')}</div>`;
}

/* ---------------------------------------------------------------- persistence */
function autosave(){ try{ G.flow&&G.flow.writeSave&&setTimeout(()=>{ if(isPlay())G.flow.writeSave(); },600); }catch(e){} }
let reconcileT=-1;
G.persist.register('progress',{
  save:()=>JSON.parse(JSON.stringify(S)),
  load:d=>{
    if(!d||typeof d!=='object')return;
    for(const k of ['shards','caches','hearts','marks','upgrades','said'])S[k]=Object.assign({},d[k]||{});
    S.spent=Math.max(0,d.spent|0); S.freed=Math.max(0,d.freed|0);
    for(const s of SPOTS)if(s.mesh)s.mesh.visible=!S.shards[s.id];
    for(const c of CACHES)c.open=S.caches[c.id]?1:null;
    heldHp=0; apply({noHeal:true}); reconcileT=.3;
  }
});

/* ---------------------------------------------------------------- API */
const API=G.progress={
  reward:rewardFn, state:S, UPGRADES, owns, buy, canBuy, maxHp, apply:()=>apply(),
  get marks(){ return marksHeld(); }, get shards(){ return shardN(); }, get wings(){ return wingN(); },
  get spots(){ return SPOTS; }, get caches(){ return CACHES; }, get busy(){ return !!reward.active||queue.length>0; },
  get rewarding(){ return reward.active?reward.active.id:null; },
  journal:{open:openJournal,close:closeJournal,data:journalData},
  reconcile:q=>reconcile(q),
  get reveal(){ return reveal; }, set reveal(v){ reveal=!!v; },
  /* devtools + tests */
  give(kind,n=1){
    if(kind==='shard'){ for(let i=0;i<n;i++){ const s=SPOTS.find(x=>!S.shards[x.id]); if(!s)break; collectShard(s,{silent:i<n-1}); } }
    else if(kind==='heart'){ const src=['stag','undertow'].find(k=>!S.hearts[k])||('dev'+count(S.hearts)); S.hearts[src]=1; apply(); rewardFn({id:'heart',icon:'heart',name:'Keeper’s Heart',eyebrow:'Test tools',desc:'Your heart grows by one.'}); }
    else if(kind==='mark'){ S.marks['dev:'+Date.now()+Math.random()]=n; renderTemper(); G.ui.toast('Keeper’s Mark',marksHeld()+' held'); }
    else if(kind==='wing'){ S.freed=Math.min(8,(wingN()+1)*WING_EVERY); apply(); wingFlourish(); G.ui.toast('Moth Wing',wingN()+' of 4'); }
    else if(kind==='upgrades'){ for(const u of UPGRADES)if(!owns(u.id))S.upgrades[u.id]=1; apply(); renderTemper(); }
    return API.summary();
  },
  lateGame(){ // the state a thorough player has before the cave: everything except what the cave itself gives
    const o={v:1,shards:{},caches:{},hearts:{stag:1,undertow:1},marks:{stag:1,undertow:2,gloaming:2},spent:0,upgrades:{},freed:8,said:{}};
    for(const s of SPOTS)o.shards[s.id]=1; for(const c of CACHES){ o.caches[c.id]=1; o.marks['cache:'+c.id]=1; }
    for(const u of UPGRADES)o.upgrades[u.id]=u.id==='charm'?'gift':1; o.spent=UPGRADES.reduce((a,u)=>a+(u.id==='charm'?0:u.cost.mark),0);
    return o;
  },
  summary(){ const p=P(); return {hp:p.hp,maxHp:p.maxHp,shards:shardN(),marks:marksHeld(),wings:wingN(),upgrades:Object.keys(S.upgrades),caches:count(S.caches)}; },
  liftPose:LIFT_POSE, perches, get drops(){ return drops; }, endReward(){ let n=0; while((reward.active||queue.length)&&n++<64){ if(!reward.active)startReward(queue.shift()); endLift(); hideCard(); reward.active=null; } }, // tests: finish every queued moment now
  debug:{collect:id=>{ const s=SPOTS.find(x=>x.id===id); if(s)collectShard(s); }, open:id=>{ const c=CACHES.find(x=>x.id===id); if(c)openCache(c); },
    reset(){ for(const k of ['shards','caches','hearts','marks','upgrades','said'])S[k]={}; S.spent=0; S.freed=0; heldHp=0; queue.length=0; pend.length=0; for(const k in drops){ root.remove(drops[k].mesh); delete drops[k]; } for(const c of CACHES)c.open=null; apply(); },
    get queue(){ return queue; }, get pend(){ return pend; }, reward}
};

/* ---------------------------------------------------------------- system */
G.system('progress',{order:62,modes:'always',
  init(){
    G.scene.add(root);
    try{ buildSpots(); }catch(e){ console.error('progress spots',e); }
    try{ buildBeams(); }catch(e){ console.error('progress beams',e); }
    buildDOM();
    ensureMods(); apply({noHeal:true});
    if(G.player&&G.player.poseHooks)G.player.poseHooks.push(liftPose);
    // no harm while the item is overhead (the moment pauses your hands, not the world)
    const p=P(); if(p&&p.hurt){ const h0=p.hurt; p.hurt=function(info){ if(reward.active&&reward.t<LIFT&&!(info&&info.kind==='fall'))return false; return h0.call(this,info); }; }
    G.on('boss:dead',onBoss);
    G.on('cave:bossDead',onUndertow);
    G.on('negative:freed',onFreed);
    G.on('blight:cured',onBlight);
    G.on('inv:change',()=>{ if(tab==='temper')renderTemper(); });
    G.on('cave:jar',()=>apply({noHeal:true}));
    G.on('loop:start',()=>{ reconcileT=.5; });
    G.on('player:respawn',()=>{ if(reward.active)endLift(); });
  },
  update(dt){
    const mode=G.state.mode;
    if(mode==='title')return;
    updatePanel();
    const sweep=!API.debug.noSweep; // tests that build a state by hand switch the automatic grants off
    if(reconcileT>0){ reconcileT-=dt; if(reconcileT<=0&&sweep)reconcile(true); }
    if(mode==='play'||mode==='dead'){ updateWorld(dt); updateFx(dt); if(G.player&&G.player.pos)updateDrops(dt,G.player); }
    updateReward(mode==='play'?dt:0);
    if(card){ const vis=mode==='play'?'':'hidden'; if(card.style.visibility!==vis)card.style.visibility=vis; }
    // a cheap periodic sweep catches anything an old save already earned (or an event this module missed)
    if(mode==='play'&&sweep){ sweepT-=dt; if(sweepT<=0){ sweepT=2; reconcile(false); } }
    if(G.player&&G.player.maxHp!==maxHp())apply();
  }
});
let sweepT=1.5;
})();
