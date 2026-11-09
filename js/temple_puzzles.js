/* =====================================================================
   BRAVE QUEST: LIGHTHOUSE — temple_puzzles.js  (Place agent)
   The Vigil's puzzles and the things on its anchors (TEMPLE.md):
   - the Vigil Lens on the reliquary altar (the mid-dungeon reward; G.lens.give)
   - ink-root seals only the Lens burns: the reliquary recess (the first burn), the cloister door, the gallery's offering-box
   - the Hall of Mirrors: bronze mirrors on the pier capitals, turned by wheels at their feet. The low one (M1) catches the
     lantern's beam from the floor; the east one (M2) catches only level light from another mirror, and it lies in the
     cloister until the winch there hoists it back. Light carried M1 → M2 → the sun-disc on the south door opens the way
     to the well; M1 → the watchers' eyes opens the niche behind them
   - the Drowned Cloister's winch (reached only along the walk that exists through the Glass)
   - the Moth Well: a roost of pale moths on the shaft wall; three ink seals on the walk only a swarm can eat — and the
     moths that eat a seal are spent. The upper and lower seals are the way down; the side niche's seal guards a
     keeper's vigil-box (ichor for bait). Choose how to spend them; the roost slowly refills.
   - after the temple: small ink-root thickets on the island that only the Lens burns (shortcuts)
   State rides in the 'temple' save (G.temple.persist). Events: temple:puzzle {id, solved}.
   ===================================================================== */
(function(){
'use strict';
const G=window.G, THREE=G.THREE, U=G.U, PI=Math.PI, TAU=PI*2;
const {clamp,lerp,smooth}=U;
const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const C=hex=>U.col(hex);
const TP=()=>G.temple;
if(!G.temple){ console.warn('temple_puzzles: no temple.js'); return; }
const O=G.temple.origin, W=(x,y,z)=>V(O.x+x,O.y+y,O.z+z), L=v=>V(v.x-O.x,v.y-O.y,v.z-O.z);
const A=id=>G.temple.rooms[id].anchors;
const isPlay=()=>G.state.mode==='play';
const inside=()=>!!G.temple.inside;

const S={lens:false,seals:{},mirrors:{M1:0,M2:0},winch:false,winchK:0,disc:false,eyes:false,box:false,galleryBox:false,well:{},
  vigilBox:false,said:{},shortcuts:{}};
const say=(k,t,o)=>{ if(S.said[k])return; S.said[k]=1; G.ui.say(t,o||{priority:'normal',key:'tpz'+k}); };
const puzzle=(id,solved,o)=>G.emit('temple:puzzle',Object.assign({id,solved:!!solved},o||{}));
const root=new THREE.Group(); root.name='templePuzzles'; root.position.copy(O); root.visible=false;
const isle=new THREE.Group(); isle.name='lensShortcuts';
function etherGift(units,vials,ichor,title){ // the old offerings: ether in vials, ichor for bait
  try{ if(vials&&G.inv)G.inv.add('vial',vials,{silent:true}); if(units&&G.alchemy)G.alchemy.etherUnits=(G.alchemy.etherUnits|0)+units; if(ichor&&G.inv)G.inv.add('ichor',ichor,{silent:true}); }catch(e){ console.error(e); }
  const bits=[]; if(units)bits.push('+'+units+' ether'); if(vials)bits.push('+'+vials+' vial'+(vials>1?'s':'')); if(ichor)bits.push('+'+ichor+' ichor');
  G.ui.toast(title,bits.join(' · ')); }

/* ================================================================ MATERIALS + SHAPES */
const inkMat=()=>G.negMaterial?G.negMaterial({rim:'#a37cff',strength:1.15,ink:'#1c0c2c',inkStrength:.55,amp:.06,wisp:.3,flow:.22,scale:1.3,opaque:true})
  :G.toon('#1a1020',{emissive:'#2a1240',emissiveIntensity:.35});
function mergeGeos(list){
  const P=[],N=[],idx=[]; let off=0;
  for(const g0 of list){ const g=g0; if(!g.attributes.normal)g.computeVertexNormals(); const p=g.attributes.position,n=g.attributes.normal;
    for(let i=0;i<p.count;i++){P.push(p.getX(i),p.getY(i),p.getZ(i));N.push(n.getX(i),n.getY(i),n.getZ(i));}
    if(g.index){for(const k of g.index.array)idx.push(k+off);} else for(let i=0;i<p.count;i++)idx.push(i+off);
    off+=p.count; }
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(P,3)); g.setAttribute('normal',new THREE.Float32BufferAttribute(N,3)); g.setIndex(idx); g.computeBoundingSphere(); return g; }
function tube(points,r,seg,rseg){ return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),seg||Math.max(4,points.length*4),r,rseg||5,false); }
/** a tangle of ink roots across an opening w wide, h high (local: x across, y up, z through), and a few knots */
function tangleGeo(w,h,seed,depth){
  const r=U.rng(seed), parts=[], anchors=[]; depth=depth||.4;
  for(let k=0;k<14;k++){ const side=k%2?1:-1, pts=[]; let x=side*w/2, y=r()*h, z=(r()-.5)*depth;
    pts.push(V(x,y,z)); for(let q=0;q<5;q++){ x-=side*(w/5)*(.8+r()*.5); y+=(r()-.5)*h*.35; z=(r()-.5)*depth; pts.push(V(x,clamp(y,.05,h),z)); }
    parts.push(tube(pts,.05+r()*.07,16,5)); pts.forEach((p,i)=>{ if(i%2)anchors.push(p.clone()); }); }
  for(let k=0;k<5;k++){ const s=new THREE.SphereGeometry(.22+r()*.2,8,6); s.scale(1,.8,.7); s.translate((r()-.5)*w*.7,r()*h,(r()-.5)*depth); parts.push(s); }
  return {geo:mergeGeos(parts),anchors}; }
function glowSprite(hex,size,op){ const s=new THREE.Sprite(new THREE.SpriteMaterial({map:G.tex.soft,color:C(hex),transparent:true,opacity:op,depthWrite:false,blending:THREE.AdditiveBlending})); s.scale.setScalar(size); return s; }

/* ================================================================ 1. LENS SEALS (ink roots the beam burns) */
const LSEALS={};
/** id, local centre of the tangle's base, width, height, yaw (the tangle's face normal), onOpen, block (local box or null), parent */
function lensSeal(o){
  const g=new THREE.Group(); g.position.copy(o.at); g.rotation.y=o.yaw||0; (o.parent||root).add(g);
  const t=tangleGeo(o.w,o.h,o.seed||o.id.length*97,o.depth); const mat=inkMat(); const m=new THREE.Mesh(t.geo,mat); g.add(m);
  const gl=glowSprite('#7b45ff',Math.max(o.w,o.h)*1.6,.18); gl.position.y=o.h/2; g.add(gl);
  const s={id:o.id,g,mat,gl,boil:-1,open:false,o};
  const world=(o.parent===isle)?o.at.clone().add(V(0,o.h/2,0)):W(o.at.x,o.at.y+o.h/2,o.at.z);
  s.b=G.lens?G.lens.burnable({id:'seal:'+o.id,pos:world,radius:o.r||Math.max(o.w,o.h)*.45,needs:o.needs||1.2,
    enabled:()=>!s.open&&(o.enabled?o.enabled():inside()),
    onHeat:(q,k)=>{ if(mat.uniforms&&mat.uniforms.uFlash)mat.uniforms.uFlash.value=k>0?.25+.5*k:0; gl.material.color.copy(C(k>0?'#ffb060':'#7b45ff')); gl.material.opacity=.18+.4*k; },
    onBurn:()=>openLensSeal(o.id,false)}):null;
  if(o.block&&!S.seals[o.id])G.temple.block('lseal:'+o.id,o.block);
  LSEALS[o.id]=s; return s; }
function openLensSeal(id,restored){
  const s=LSEALS[id]; if(!s||s.open&&!restored)return;
  s.open=true; S.seals[id]=true; if(s.b){ s.b.burned=true; }
  if(s.o.block)G.temple.block('lseal:'+id,null);
  if(restored){ s.g.visible=false; }
  else{ s.boil=0; if(G.ink&&G.ink.burst)try{ G.ink.burst(s.b.pos,{n:70,speed:4,size:[.5,1.8],life:[.8,1.8],up:2,embers:60,drops:6,color:'#120a1a'}); }catch(_){}
    if(G.ui.shake)G.ui.shake(.2); }
  try{ s.o.onOpen&&s.o.onOpen(restored); }catch(e){ console.error(e); }
  puzzle('seal:'+id,true,{restored:!!restored});
}
function updateLensSeals(dt){
  for(const id in LSEALS){ const s=LSEALS[id];
    if(s.boil>=0){ s.boil+=dt; const k=Math.min(1,s.boil/1.8); if(s.mat.uniforms&&s.mat.uniforms.uFade)s.mat.uniforms.uFade.value=1-k; else s.g.scale.setScalar(Math.max(.01,1-k));
      s.gl.material.opacity=.6*(1-k); if(k>=1){ s.boil=-1; s.g.visible=false; } continue; }
    if(s.open)continue;
    const br=1+.03*Math.sin(G.time*1.4+s.o.at.x); s.g.scale.set(br,1,br); }
}

/* ================================================================ 2. THE LENS ON THE ALTAR */
const LV={};
function buildAltar(){
  const at=L(A('reliquary').lens); const g=new THREE.Group(); g.position.set(at.x,-2.84,at.z); root.add(g); LV.g=g;
  const brass=G.toon(G.PAL.gold,{emissive:'#3a2a0c',emissiveIntensity:.35});
  const lens=new THREE.Group(); const ring=new THREE.Mesh(new THREE.TorusGeometry(.17,.03,8,24),brass); lens.add(ring);
  lens.add(new THREE.Mesh(new THREE.CircleGeometry(.16,20),new THREE.MeshBasicMaterial({color:C('#f6e8c8'),transparent:true,opacity:.4,depthWrite:false,side:THREE.DoubleSide})));
  const stand=new THREE.Mesh(new THREE.CylinderGeometry(.02,.06,.22,6),brass); stand.position.y=-.24; lens.add(stand);
  lens.position.y=.28; lens.rotation.y=PI/2; g.add(lens); LV.lens=lens;
  const glow=glowSprite('#ffd890',1.4,.5); glow.position.y=.3; g.add(glow); LV.glow=glow;
  const ray=new THREE.Mesh(new THREE.CylinderGeometry(.02,.5,3.2,10,1,true),new THREE.MeshBasicMaterial({color:C('#ffe2a8'),transparent:true,opacity:.08,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide}));
  ray.position.y=1.9; g.add(ray); LV.ray=ray;
  G.interact.add({pos:()=>A('reliquary').altar.clone().add(V(1.4,0,0)),radius:2.0,priority:6,label:'Take the Vigil Lens',
    enabled:()=>inside()&&isPlay()&&!(G.lens&&G.lens.owned), use:()=>takeLens()});
}
function takeLens(){ if(!G.lens||G.lens.owned)return; G.lens.give(); S.lens=true; puzzle('lens',true);
  setTimeout(()=>{ if(!S.seals.recess)say('recess','Under the altar’s glow you notice what it lit: in the wall to the south a low recess, choked shut with ink roots. They look like they would burn.',{priority:'normal'}); },6500); }
function updateAltar(dt){ if(!LV.g)return; const own=!!(G.lens&&G.lens.owned); LV.lens.visible=!own; LV.glow.visible=!own; LV.ray.visible=!own;
  if(!own){ LV.lens.rotation.y=PI/2+.25*Math.sin(G.time*.7); LV.glow.material.opacity=.4+.12*Math.sin(G.time*1.9); } }

/* ================================================================ 3. THE HALL OF MIRRORS */
const MIR={};
const LEVEL=.22;                                   // |dir.y| under which a beam counts as level (mirror to mirror)
function mirrorAims(){
  const N=A('nave'), m1=N.mirrors[0], m2=N.mirrors[1];
  const dir=(a,b)=>b.clone().sub(a).normalize();
  return {
    M1:[ {name:'the north wall',d:dir(m1,W(-1.0,1.9,-10.6))}, {name:'the watchers',d:dir(m1,N.eyes)}, {name:'the east pier',d:dir(m1,m2)}, {name:'the south-west corner',d:dir(m1,W(-6.6,1.2,-49.8))} ],
    M2:[ {name:'the west wall',d:dir(m2,W(-6.9,1.9,-40))}, {name:'the sun-disc',d:dir(m2,N.disc)}, {name:'the hall',d:dir(m2,W(-1,1.9,-12))}, {name:'the east wall',d:dir(m2,W(6.9,1.9,-30))} ]};
}
function buildMirrors(){
  const N=A('nave'), aims=mirrorAims();
  const bronze=G.toon('#8a6a3a',{emissive:'#1c1408',emissiveIntensity:.3}), verd=G.toon('#5f8a74',{emissive:'#0c1a14',emissiveIntensity:.25});
  const face=new THREE.MeshToonMaterial({color:C('#c9a868'),emissive:C('#3a2a10'),emissiveIntensity:.5,gradientMap:G.toonGradient||null});
  [['M1',0],['M2',1]].forEach(([id,i])=>{
    const pos=N.mirrors[i], crank=N.cranks[i];
    const g=new THREE.Group(); g.position.copy(L(pos)); root.add(g);
    const yoke=new THREE.Group(); g.add(yoke);
    // the disc: a bronze mirror green with age at the rim, a polished centre; on a yoke that turns
    const disc=new THREE.Group(); yoke.add(disc);
    const d=new THREE.Mesh(new THREE.CylinderGeometry(.66,.66,.08,24),face); d.rotation.x=PI/2; disc.add(d);
    const rim=new THREE.Mesh(new THREE.TorusGeometry(.68,.06,6,26),verd); disc.add(rim);
    for(let k=0;k<8;k++){ const a=k/8*TAU; const knob=new THREE.Mesh(new THREE.SphereGeometry(.05,6,4),bronze); knob.position.set(Math.cos(a)*.68,Math.sin(a)*.68,.05); disc.add(knob); }
    const back=new THREE.Mesh(new THREE.CylinderGeometry(.6,.62,.06,18),verd); back.rotation.x=PI/2; back.position.z=-.07; disc.add(back);
    const fork=new THREE.Mesh(new THREE.TorusGeometry(.78,.04,5,16,PI),bronze); fork.rotation.z=PI; yoke.add(fork);
    const post=new THREE.Mesh(new THREE.CylinderGeometry(.06,.1,.6,6),bronze); post.position.y=-1.05; yoke.add(post);
    // the bracket that holds it out from the pier
    const side=pos.x-O.x<0?-1:1; const arm=new THREE.Mesh(new THREE.BoxGeometry(1.0,.16,.22),bronze); arm.position.set(side*.55,-1.35,0); g.add(arm);
    const strut=new THREE.Mesh(new THREE.BoxGeometry(.12,.9,.12),bronze); strut.position.set(side*.85,-1.75,0); strut.rotation.z=side*.6; g.add(strut);
    const sheen=glowSprite('#fff2c8',1.6,0); disc.add(sheen); sheen.position.z=.1;
    if(G.outline){ G.outline(rim,{thickness:.02}); }
    // the wheel at the pier's foot that turns it
    const cl=L(crank); const wg=new THREE.Group(); wg.position.set(cl.x,-3+1.1,cl.z); wg.rotation.y=i===1?-PI/2:PI/2; root.add(wg);
    const wheel=new THREE.Mesh(new THREE.TorusGeometry(.32,.04,5,14),bronze); wg.add(wheel);
    for(let k=0;k<4;k++){ const sp=new THREE.Mesh(new THREE.BoxGeometry(.62,.035,.035),bronze); sp.rotation.z=k*PI/4; wg.add(sp); }
    const m={id,pos:pos.clone(),radius:.8,aims:aims[id],g,yoke,disc,sheen,wheel,q:new THREE.Quaternion(),k:1,lit:-1,
      enabled:()=>inside()&&(id!=='M2'||S.winch),
      out:(dIn,b,from)=>{ const a=m.aims[S.mirrors[id]]; if(!a)return null;
        if(id==='M1'){ if(dIn.y<LEVEL*.4)return null; }            // the low mirror catches light thrown up from the floor
        else if(Math.abs(dIn.y)>LEVEL)return null;                 // the others only level light, handed on by another mirror
        return a.d.clone(); }};
    if(G.lens)G.lens.addMirror(m);
    MIR[id]=m;
    G.interact.add({pos:()=>crank,radius:1.7,priority:4,label:()=>id==='M2'&&!S.winch?'The wheel turns nothing: its mirror is gone':'Turn the mirror · it faces '+m.aims[S.mirrors[id]].name,
      enabled:()=>inside()&&isPlay(), use:()=>turnMirror(id)});
  });
  setMirrorPose(true);
}
/** the mirror's face turns to the bisector of where its light comes from and where it sends it */
function setMirrorPose(snap,dt){
  const N=A('nave'); const from={M1:N.plinth.clone().add(V(0,1.1,0)),M2:N.mirrors[0]};
  for(const id in MIR){ const m=MIR[id], a=m.aims[S.mirrors[id]]; const inD=m.pos.clone().sub(from[id]).normalize();
    const n=a.d.clone().sub(inD).normalize(); const q=new THREE.Quaternion().setFromUnitVectors(V(0,0,1),n);
    if(snap)m.disc.quaternion.copy(q); else m.disc.quaternion.slerp(q,1-Math.exp(-4*dt));
    // M2 lies in the cloister until the winch hoists it: below the capital, chain-hung, face down
    if(id==='M2'){ const k=m.k=snap?(S.winch?1:0):U.damp(m.k,S.winch?1:0,.8,dt); m.yoke.position.y=lerp(-4.6,0,smooth(0,1,k)); m.g.visible=k>.02||!S.winch&&false; m.yoke.visible=k>.02; } }
}
function turnMirror(id){
  if(id==='M2'&&!S.winch){ say('m2gone','The wheel spins loose. A chain runs up from it into the capital and down again through a slot in the floor, toward the east — whatever it held is gone below.',{priority:'high'}); return; }
  S.mirrors[id]=(S.mirrors[id]+1)%MIR[id].aims.length; const m=MIR[id];
  m.turnT=0; G.emit('temple:mirror',{id,idx:S.mirrors[id],facing:m.aims[S.mirrors[id]].name});
  if(G.audio&&G.audio.S&&G.audio.context)try{ G.audio.S.thud(G.audio.context.currentTime,{g:.2,f0:220,f1:90,dur:.25}); }catch(_){}
  say('mirror1','Stone grinds on bronze. High on the pier, the old mirror swings round a quarter-turn and settles.');
}
function updateMirrors(dt){
  setMirrorPose(false,dt);
  for(const id in MIR){ const m=MIR[id]; const lit=G.lens&&G.lens.focused&&G.time-(m.lit||-9)<.15;
    m.sheen.material.opacity=U.damp(m.sheen.material.opacity,lit?.85:0,10,dt); m.wheel.rotation.z+=dt*(m.turnT!=null&&m.turnT<.6?6:0); if(m.turnT!=null)m.turnT+=dt; }
}
/* the sun-disc on the south door (only light handed on by the east mirror lands square on it), the watchers' eyes */
const TG={};
function buildTargets(){
  const N=A('nave');
  // the disc: a sun of bronze rays round a blind glass boss, set into the door's face
  const g=new THREE.Group(); g.position.copy(L(N.disc)); root.add(g);
  const bronze=G.toon('#8a6a3a',{emissive:'#2a1a08',emissiveIntensity:.3});
  const boss=new THREE.Mesh(new THREE.SphereGeometry(.36,14,10),new THREE.MeshToonMaterial({color:C('#3a2a1c'),emissive:C('#ffb050'),emissiveIntensity:0}));
  boss.scale.z=.45; g.add(boss);
  for(let k=0;k<12;k++){ const a=k/12*TAU; const ray=new THREE.Mesh(new THREE.ConeGeometry(.09,.55,4),bronze); ray.position.set(Math.cos(a)*.62,Math.sin(a)*.62,0); ray.rotation.z=a-PI/2; g.add(ray); }
  const ring=new THREE.Mesh(new THREE.TorusGeometry(.44,.05,5,20),bronze); g.add(ring);
  const glow=glowSprite('#ffc060',2.4,0); g.add(glow);
  // the disc faces back along the light from the east mirror
  const fromM2=N.mirrors[1].clone().sub(N.disc).normalize(); g.quaternion.setFromUnitVectors(V(0,0,1),fromM2);
  TG.disc={g,boss,glow};
  TG.discB=G.lens&&G.lens.burnable({id:'disc',pos:N.disc.clone(),radius:.75,needs:1.4,keep:true,minBounces:2,from:'M2',
    enabled:()=>inside()&&!S.disc,
    onHeat:(q,k)=>{ boss.material.emissiveIntensity=k*1.6; glow.material.opacity=k*.9; },
    onReject:(q,h)=>{ say('discSlant',h.bounces===0?'The disc drinks nothing from the lantern itself. The old keepers handed their light from mirror to mirror before it was let near the door.':'The light strikes the sun-disc at a slant and slides off it. It wants light that comes square on — from the east.',{priority:'high'}); },
    onBurn:()=>solveDisc(false)});
  // the eyes of the great watcher: lit from the low mirror, the niche behind it opens
  const eg=glowSprite('#ffd27a',1.2,0); eg.position.copy(L(N.eyes)); root.add(eg); TG.eyes=eg;
  TG.eyesB=G.lens&&G.lens.burnable({id:'eyes',pos:N.eyes.clone(),radius:.45,needs:1.2,keep:true,minBounces:1,
    enabled:()=>inside()&&!S.eyes,
    onHeat:(q,k)=>{ eg.material.opacity=k*.9; },
    onReject:()=>{ say('eyesDirect','The watcher’s hollow eyes swallow the beam and give nothing back. The old keepers lit them some other way — from above.',{priority:'normal'}); },
    onBurn:()=>solveEyes(false)});
}
function solveDisc(restored){ if(S.disc&&!restored)return; S.disc=true; G.temple.setGate('sunDoor',true);
  if(TG.disc){ TG.disc.boss.material.emissiveIntensity=1.2; TG.disc.glow.material.opacity=.6; }
  if(!restored){ G.ui.shake&&G.ui.shake(.35); G.ui.toast('The sun-disc','The south door is sinking into the floor');
    setTimeout(()=>G.ui.say('The disc takes the light and holds it. Somewhere in the wall a weight drops, and the great south door sinks into the floor. Below, something breathes out — a cold wind, and the sound of wings.',{priority:'high'}),800); }
  puzzle('disc',true,{restored:!!restored}); }
function solveEyes(restored){ if(S.eyes&&!restored)return; S.eyes=true; G.temple.setGate('eyes',true);
  if(TG.eyes)TG.eyes.material.opacity=.5;
  if(!restored){ G.ui.toast('The watchers’ eyes','A slab grinds aside behind them');
    setTimeout(()=>G.ui.say('The watcher’s eyes fill with gold and keep it. Behind it a slab grinds aside on a niche no bigger than a cupboard — and something is cut into its back wall.',{priority:'normal'}),700); }
  puzzle('eyes',true,{restored:!!restored}); }
function updateTargets(dt){
  if(TG.eyes&&S.eyes)TG.eyes.material.opacity=.4+.1*Math.sin(G.time*1.3);
  if(TG.disc&&S.disc){ TG.disc.boss.material.emissiveIntensity=.9+.2*Math.sin(G.time*1.1); TG.disc.glow.material.opacity=.45; }
}

/* ================================================================ 4. THE WINCH (the cloister, beyond the past walk) */
const WV={};
function buildWinch(){
  const at=L(A('cloister').winch); const g=new THREE.Group(); g.position.set(at.x,-6,at.z); root.add(g); WV.g=g;
  const bronze=G.toon('#8a6a3a',{emissive:'#1c1408',emissiveIntensity:.25}), wood=G.toon('#5a4636'), iron=G.toon('#3a3640');
  const drum=new THREE.Group(); drum.position.set(.2,1.15,0); g.add(drum); WV.drum=drum;
  const cyl=new THREE.Mesh(new THREE.CylinderGeometry(.42,.42,3.2,14),wood); cyl.rotation.x=PI/2; drum.add(cyl);
  for(const z of [-1.5,1.5]){ const rim=new THREE.Mesh(new THREE.CylinderGeometry(.6,.6,.12,14),bronze); rim.rotation.x=PI/2; rim.position.z=z; drum.add(rim); }
  for(let k=0;k<8;k++){ const sp=new THREE.Mesh(new THREE.BoxGeometry(1.7,.08,.08),bronze); sp.rotation.z=k*PI/4; sp.position.z=1.75; drum.add(sp); }
  for(let k=0;k<10;k++){ const link=new THREE.Mesh(new THREE.TorusGeometry(.08,.025,4,8),iron); link.position.set(-.3,1.45+k*.42,0); link.rotation.y=k%2?PI/2:0; g.add(link); }
  WV.chainTop=new THREE.Mesh(new THREE.CylinderGeometry(.03,.03,3,4),iron); WV.chainTop.position.set(-.3,4.9,0); g.add(WV.chainTop);
  G.interact.add({pos:()=>A('cloister').winch.clone().add(V(-1.4,0,0)),radius:1.9,priority:5,label:()=>S.winch?'The chain is wound tight':'Wind the chain',
    enabled:()=>inside()&&isPlay()&&!WV.turning&&!(G.glass&&G.glass.raised), use:()=>windWinch()});
}
function windWinch(){
  if(S.winch){ say('wound','The drum won’t turn any further. The chain runs taut up into the dark.'); return; }
  WV.turning=0; G.emit('temple:winch',{state:'start'});
  if(G.player.setControl)G.player.setControl(false);
}
function updateWinch(dt){
  if(WV.turning==null)return; WV.turning+=dt; WV.drum.rotation.z-=dt*2.4;
  if(WV.turning>2.4){ WV.turning=null; if(G.player.setControl)G.player.setControl(true); S.winch=true;
    G.ui.toast('The winch','Somewhere above, a mirror rises'); puzzle('winch',true);
    setTimeout(()=>G.ui.say('The chain comes up out of the floor link by link, wet and black, and runs off through the vault toward the hall. Far off, bronze knocks on stone — something heavy being hauled up a pier.',{priority:'high'}),500); }
}

/* ================================================================ 5. THE GALLERY'S OFFERING-BOX, THE NICHES' GIFTS */
const BX={};
function buildBoxes(){
  const wood=G.toon('#6a4e36'), bronze=G.toon('#8a6a3a',{emissive:'#1c1408',emissiveIntensity:.25});
  const mk=()=>{ const g=new THREE.Group(); const b=new THREE.Mesh(new THREE.BoxGeometry(.7,.42,.46),wood); b.position.y=.21; g.add(b);
    const lid=new THREE.Mesh(new THREE.BoxGeometry(.74,.08,.5),bronze); lid.position.y=.46; g.add(lid);
    const m=new THREE.Mesh(new THREE.ConeGeometry(.12,.04,3),bronze); m.position.set(0,.5,.0); g.add(m); return g; };
  // the gallery box: up on the west gallery in its roots; burned free, it tumbles down to the floor
  const gal=A('nave').gallery; BX.gal=mk(); BX.gal.position.copy(L(gal)).add(V(.2,-.15,0)); root.add(BX.gal); BX.galFrom=BX.gal.position.clone(); BX.galTo=V(-5.4,-3,-28);
  G.interact.add({pos:()=>W(BX.galTo.x,BX.galTo.y,BX.galTo.z),radius:1.7,priority:4,label:'Open the offering-box',
    enabled:()=>inside()&&isPlay()&&S.seals.gallery&&!S.galleryBox&&BX.galT==null, use:()=>{ S.galleryBox=true; etherGift(5,1,2,'An offering-box'); BX.gal.children[1].rotation.x=-1.2; puzzle('galleryBox',true); }});
  // the reliquary recess: an offering of ether on a little shelf
  const rec=L(A('reliquary').recess); BX.rec=mk(); BX.rec.scale.setScalar(.8); BX.rec.position.set(rec.x,-3.5,rec.z-.6); root.add(BX.rec);
  G.interact.add({pos:()=>A('reliquary').recess.clone().add(V(0,0,1.2)),radius:1.8,priority:4,label:'Take the old offering',
    enabled:()=>inside()&&isPlay()&&S.seals.recess&&!S.box, use:()=>{ S.box=true; etherGift(5,1,0,'An old offering'); BX.rec.visible=false; puzzle('offering',true); }});
  // the well's side niche: a keeper's vigil-box (ichor: moth bait), behind the seal only the swarm eats
  const ni=L(A('well').niche); BX.vig=mk(); BX.vig.position.set(ni.x,ni.y+.5,ni.z); BX.vig.rotation.y=-G.temple._debug.NICHE_A*PI/180+PI/2; root.add(BX.vig);
  G.interact.add({pos:()=>A('well').niche.clone(),radius:1.8,priority:4,label:'Open the vigil-box',
    enabled:()=>inside()&&isPlay()&&G.temple.gate('wellSide')&&!S.vigilBox, use:()=>{ S.vigilBox=true; etherGift(0,0,4,'A keeper’s vigil-box'); BX.vig.children[1].rotation.x=-1.2;
      setTimeout(()=>G.ui.say('Ichor in stoppered horn cups, still good: the keepers baited their lanterns down here. The roost on the shaft wall will keep the moths coming.',{priority:'normal'}),600); puzzle('vigilBox',true); }});
}
function updateBoxes(dt){
  if(BX.galT!=null){ BX.galT+=dt; const k=clamp(BX.galT/.9,0,1); BX.gal.position.lerpVectors(BX.galFrom,BX.galTo,k); BX.gal.position.y=lerp(BX.galFrom.y,BX.galTo.y,k*k);
    BX.gal.rotation.z=k*2.2; if(k>=1){ BX.galT=null; BX.gal.rotation.z=0; BX.gal.rotation.y=.4; G.ui.shake&&G.ui.shake(.15);
      if(G.ink&&G.ink.burst)try{ G.ink.burst(W(BX.galTo.x,BX.galTo.y+.2,BX.galTo.z),{n:10,speed:2,size:[.3,.8],up:1,embers:6,color:'#6a6070'}); }catch(_){} } }
}

/* ================================================================ 6. THE MOTH WELL: the roost, three seals the swarm eats (and is spent on) */
const WELL={seals:{}};
const ROOST_N=40, ROOST_REGROW=5;
function mothList(){ return (G.creatures&&G.creatures.moths)||[]; }
function buildWellSeals(){
  const ws=A('well').seals, D=G.temple._debug;
  const defs=[{id:'wellUpper',pos:ws[0],needs:18,r:1.3,name:'The upper seal'},{id:'wellLower',pos:ws[1],needs:22,r:1.6,name:'The lower seal'},{id:'wellSide',pos:ws[2],needs:10,r:1.1,name:'The niche seal'}];
  for(const d of defs){
    const g=new THREE.Group(); g.position.copy(L(d.pos)); root.add(g);
    const mat=inkMat(); const r=U.rng(d.id.length*31); const parts=[]; const anchors=[];
    const blob=new THREE.SphereGeometry(d.r,16,12); blob.scale(1,1.15,.75); blob.translate(0,d.r*.9,0); parts.push(blob);
    for(let k=0;k<10;k++){ const a=r()*TAU, el=(r()-.3)*1.2, Ln=.5+r()*1.1, c=new THREE.ConeGeometry(.08+r()*.06,Ln,6);
      const dir=V(Math.cos(a)*Math.cos(el),Math.sin(el),Math.sin(a)*Math.cos(el)*.6).normalize();
      c.translate(0,Ln/2,0); c.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0,1,0),dir)));
      c.translate(dir.x*d.r*.8,d.r*.9+dir.y*d.r*.7,dir.z*d.r*.5); parts.push(c); }
    for(let k=0;k<14;k++){ const a=r()*TAU, el=(r()-.2)*1.3; anchors.push(d.pos.clone().add(V(Math.cos(a)*Math.cos(el)*d.r*.95,d.r*.9+Math.sin(el)*d.r*.85,Math.sin(a)*Math.cos(el)*d.r*.6))); }
    const m=new THREE.Mesh(mergeGeos(parts),mat); g.add(m);
    // face the seal along the walk (the upper one sits across the spiral), the niche seal into the shaft
    if(d.id==='wellUpper')g.rotation.y=-D.UPPER_A*PI/180;
    if(d.id==='wellSide')g.rotation.y=-D.NICHE_A*PI/180+PI/2;
    const glow=glowSprite('#7b45ff',d.r*3.6,.22); glow.position.y=d.r; g.add(glow);
    const em=G.ink&&G.ink.emitter?G.ink.emitter(d.pos.clone().add(V(0,d.r,0)),{rate:5,radius:d.r*.6,height:d.r*.6,size:[.6,1.8],life:[2,4],rise:.45,drift:.2,trail:0,alpha:.35,embers:1.4,color:'#0b0710',intensity:0}):null;
    WELL.seals[d.id]={id:d.id,name:d.name,pos:d.pos.clone().add(V(0,d.r*.9,0)),base:d.pos.clone(),needs:d.needs,radius:d.r+2.2,anchors,g,mat,glow,em,
      progress:0,feeding:false,stalled:false,cured:false,eaters:[],boil:-1,flash:0};
  }
}
function feedSeal(s){
  const ms=mothList(), near=[];
  for(const m of ms) if(m.tgt==='lantern'&&Math.hypot(m.p.x-s.pos.x,m.p.z-s.pos.z)<s.radius+1.2&&Math.abs(m.p.y-s.pos.y)<4)near.push(m);
  s.near=near.length;
  if(!s.feeding){
    if(near.length>=s.needs){ // exactly `needs` moths split off and settle on it; the rest of the swarm stays with you
      near.sort((a,b)=>a.p.distanceToSquared(s.pos)-b.p.distanceToSquared(s.pos));
      s.eaters=near.slice(0,s.needs);
      for(const m of s.eaters){ const a=s.anchors[(Math.random()*s.anchors.length)|0]; m.tgt='feed'; m.feedB=s; m._rel=0; m.delay=0; m.next=null; m.prey=null; m._lensRad=null;
        m.feedC=(m.feedC||V()).set(a.x+(Math.random()-.5)*.4,a.y+Math.random()*.3,a.z+(Math.random()-.5)*.4); m.rad=.08+Math.random()*.35; }
      s.feeding=true; s.flash=1; G.emit('temple:wellSeal',{id:s.id,state:'feed',n:s.needs});
      say('wellFeed','The swarm splits. '+s.needs+' of them peel away and settle on the black, and begin to eat — and they don’t come back up. The ink is eating them as they eat it.',{priority:'high'});
    }else if(near.length>=3&&!s.saidShort){ s.saidShort=1; G.ui.say('The moths circle the seal and won’t settle: not enough of them. It would take '+s.needs+'.',{priority:'normal',key:'wellShort'}); }
    return; }
  const alive=s.eaters.filter(m=>m.tgt==='feed'&&m.feedB===s);
  if(!alive.length){ s.feeding=false; s.eaters=[]; G.emit('temple:wellSeal',{id:s.id,state:'stop'}); return; }
  s.stalled=alive.length<s.needs*.5;
  s.progress=Math.min(1,s.progress+(G.dt||1/30)/6*Math.max(.2,alive.length/s.needs));
  if(s.progress>=1)openWellSeal(s.id,false);
}
function openWellSeal(id,restored){
  const s=WELL.seals[id]; if(!s)return; if(s.cured&&!restored)return;
  s.cured=true; s.feeding=false; s.progress=1; S.well[id]=true;
  G.temple.setGate(id,true);
  if(!restored){ // the moths that ate it are spent: they come apart in a grey drift
    let n=0; for(const m of s.eaters) if(m.tgt==='feed'&&m.feedB===s){ m.feedB=null; if(G.moths&&G.moths.kill)G.moths.kill(m,true); n++; } s.spent=n;
    s.eaters=[]; s.boil=0;
    if(G.ink&&G.ink.burst)try{ G.ink.burst(s.pos,{n:90,speed:4.5,size:[.8,2.4],life:[1,2.2],up:2.5,embers:50,drops:10}); }catch(_){}
    G.ui.shake&&G.ui.shake(.3);
    G.ui.toast(s.name+' · eaten away',n+' moths spent');
    if(!S.said.spent){ S.said.spent=1; setTimeout(()=>G.ui.say('The seal comes apart — and so do the moths that ate it, into a grey drift that settles like ash. The roost on the shaft wall stirs. It will send more, slowly.',{priority:'high'}),700); }
  }else s.g.visible=false;
  G.emit('temple:wellSeal',{id,state:'open',restored:!!restored,spent:restored?0:s.spent|0});
  puzzle(id,true,{restored:!!restored});
}
let roostT=ROOST_REGROW;
function updateWell(dt){
  const P=G.player, inWell=inside()&&G.temple.room(P.pos)==='well';
  for(const id in WELL.seals){ const s=WELL.seals[id];
    if(s.boil>=0){ s.boil+=dt; const k=Math.min(1,s.boil/2.4); if(s.mat.uniforms&&s.mat.uniforms.uFade)s.mat.uniforms.uFade.value=1-k; s.glow.material.opacity=.22*(1-k); if(s.em)s.em.intensity=0;
      if(k>=1){ s.boil=-1; s.g.visible=false; } continue; }
    if(s.cured)continue;
    if(s.em)s.em.intensity=inWell?(s.feeding?.6:1):0;
    if(inWell&&isPlay())feedSeal(s);
    const br=1+.05*Math.sin(G.time*(s.feeding?3.2:1.1)+s.pos.x), sh=1-.45*s.progress; s.g.scale.set(br*sh,(2-br)*sh,br*sh);
    s.flash=Math.max(0,s.flash-dt*2); if(s.mat.uniforms&&s.mat.uniforms.uFlash)s.mat.uniforms.uFlash.value=s.flash*.6+(s.feeding?.12+.1*Math.sin(G.time*9):0); }
  // the roost: pale moths furred on the shaft wall; it refills slowly with cave-born moths (so the well can't run dry)
  if(!inWell)return;
  const R=G.creatures; const pts=R&&R.roost&&R.roost.pts; if(!pts||!pts.length)return;
  let n=0; for(const m of mothList()) if(m.tgt==='roost')n++; WELL.roostCount=n;
  if(!S.said.roost&&n>8&&P.pos.distanceTo(A('well').roost)<12){ S.said.roost=1; G.ui.say('The shaft wall above the walk is furred with pale moths, wings folded flat, so still they look like frost. They have been waiting down here a long time for a light.',{priority:'normal'}); }
  roostT-=dt; if(roostT>0||n>=ROOST_N)return; roostT=ROOST_REGROW;
  for(const m of mothList()) if(m.cave&&m.tgt==='gone'){ const r=pts[(Math.random()*pts.length)|0]; m.p.copy(r.p).addScaledVector(r.n,.8); m.v.set(0,0,0); R.toRoost(m); break; }
}

/* ================================================================ 7. THE NAVE / RELIQUARY / CLOISTER SEALS */
function buildSeals(){
  const N=A('nave');
  // the reliquary's recess: the Lens's first burn
  const rec=L(A('reliquary').seal);
  lensSeal({id:'recess',at:V(rec.x,-4,rec.z+.1),w:2.4,h:2.6,yaw:0,seed:31,block:{x:rec.x,z:rec.z-.2,hw:1.3,hd:.3,y0:-6,y1:0},
    onOpen:r=>{ if(!r)say('recessOpen','The roots shrivel back from the beam and crumble. In the recess, on a little shelf, an old offering waits where someone left it.'); }});
  // the cloister door: roots across the east doorway (the gate itself is temple.js's)
  const cd=L(N.cloisterDoor);
  lensSeal({id:'cloisterDoor',at:V(cd.x-.2,-3,cd.z),w:2.6,h:3.0,yaw:PI/2,seed:57,
    onOpen:r=>{ G.temple.setGate('cloisterDoor',true); if(!r)say('cloOpen','The roots across the east door blacken and fall away in flakes. Beyond, steps go down toward the sound of water.'); }});
  // the gallery: a knot of roots strangling an offering-box on the west gallery, high over the floor
  const ga=L(N.gallery);
  lensSeal({id:'gallery',at:V(ga.x+.3,ga.y-.2,ga.z),w:1.6,h:1.4,yaw:PI/2,seed:83,r:.9,
    onOpen:r=>{ if(!r){ BX.galT=0; say('galOpen','Up on the gallery the knot of roots flares and lets go — and something wooden tips off the edge and crashes to the floor.'); }
      else if(BX.gal){ BX.gal.position.copy(BX.galTo); BX.gal.rotation.y=.4; } }});
}
G.on('temple:enter',()=>{ if(!S.said.discHint&&G.lens&&G.lens.owned)return; });
G.on('temple:room',e=>{
  if(e.id==='nave'&&!S.said.nave){ S.said.nave=1; setTimeout(()=>G.ui.say('A hall so tall your light gives out before the roof does. Bronze mirrors stand on the capitals of the piers, green with age, turned this way and that. At the far end, a door with a sun on it, shut.',{priority:'normal'}),400); }
  if(e.id==='cloister'&&!S.said.clo){ S.said.clo=1; setTimeout(()=>G.ui.say('Half the cloister has fallen into black water. The walk breaks off a step from your feet and doesn’t come back. Across the water a doorway, and a chain running up into the dark.',{priority:'normal'}),400); }
  if(e.id==='well'&&!S.said.well){ S.said.well=1; setTimeout(()=>G.ui.say('A round shaft, deep, a stone walk spiralling down its wall. Far below, violet light comes up through the floor. And on the wall above you, wings.',{priority:'normal'}),400); }
});

/* ================================================================ 8. ISLAND SHORTCUTS: the keepers' ladders, choked with ink only the Lens burns
   Two old ladders up the escarpment beside the cliff path (the moor → the path's middle, the path → the headland): with the
   thicket at a ladder's foot burned away, the ladder cuts out the long switchbacks. Built here (the island's own layout is
   untouched); climbing is a short fade, like a door. */
const SHORTCUTS=[
  {id:'lowLadder',name:'The lower keepers’ ladder',foot:[101.4,-22],top:[106.9,-22],from:[102.7,-22],to:[104.9,-22],face:-PI/2},
  {id:'highLadder',name:'The upper keepers’ ladder',foot:[115.8,-22],top:[121.6,-22],from:[117.3,-22],to:[119.7,-22],face:-PI/2},
];
const SC=[];
const H=(x,z)=>G.world.height(x,z);
function buildShortcuts(){
  const wood=G.toon('#6a5240'), iron=G.toon('#3a3640');
  for(const d of SHORTCUTS){
    const foot=V(d.foot[0],H(d.foot[0],d.foot[1]),d.foot[1]), top=V(d.top[0],H(d.top[0],d.top[1]),d.top[1]);
    const a=V(d.from[0],H(d.from[0],d.from[1])-.1,d.from[1]), b=V(d.to[0],top.y+.6,d.to[1]);
    // the ladder: two rails and rungs, leaning on the rock, pinned with iron
    const g=new THREE.Group(); isle.add(g); const dir=b.clone().sub(a), len=dir.length(); dir.normalize();
    const q=new THREE.Quaternion().setFromUnitVectors(V(0,1,0),dir); const side=V(Math.cos(d.face+PI/2)*0,0,1);
    for(const sd of [-.36,.36]){ const r=new THREE.Mesh(new THREE.BoxGeometry(.09,len,.09),wood); r.quaternion.copy(q); r.position.copy(a).addScaledVector(dir,len/2).addScaledVector(side,sd); g.add(r); }
    for(let k=1;k<len/.42;k++){ const r=new THREE.Mesh(new THREE.CylinderGeometry(.03,.03,.72,5),wood); r.rotation.x=PI/2; r.position.copy(a).addScaledVector(dir,k*.42); g.add(r); }
    for(const t of [.2,.55,.9]){ const pin=new THREE.Mesh(new THREE.BoxGeometry(.5,.06,.06),iron); pin.position.copy(a).addScaledVector(dir,len*t).add(V(.2,0,0)); g.add(pin); }
    if(G.outline)g.children.slice(0,2).forEach(m=>G.outline(m,{thickness:.015}));
    // the thicket at its foot
    const at=V(d.from[0]-.9,H(d.from[0]-.9,d.from[1]),d.from[1]);
    const s=lensSeal({id:'isle:'+d.id,at,w:2.2,h:2.6,yaw:d.face,seed:d.id.length*13,parent:isle,r:1.25,depth:.6,
      enabled:()=>!inside()&&isPlay()&&!!(G.lens&&G.lens.owned),
      onOpen:r=>{ S.shortcuts[d.id]=true; if(sc.col&&G.removeBoxCollider)G.removeBoxCollider(sc.col); else if(sc.col){ sc.col.y0=-1e3; sc.col.y1=-999; } sc.col=null;
        if(!r){ G.ui.toast('The roots burn away',d.name+' is clear'); say('ladder','The ink comes off the old ladder in flakes. The rungs are sound — the keepers built it to last.'); } }});
    const sc={d,s,foot,top,ladder:g,col:Object.assign(G.addBoxCollider({x:at.x,z:at.z,hw:1.3,hd:.5,yaw:d.face,y0:at.y-2,y1:at.y+3})||{},{noStand:true})};
    SC.push(sc);
    G.interact.add({pos:()=>foot,radius:1.9,priority:4,label:'Climb the keepers’ ladder',enabled:()=>!inside()&&isPlay()&&!!S.shortcuts[d.id]&&!LAD.t, use:()=>climb(sc,'up')});
    G.interact.add({pos:()=>top,radius:1.9,priority:4,label:'Climb down the keepers’ ladder',enabled:()=>!inside()&&isPlay()&&!!S.shortcuts[d.id]&&!LAD.t, use:()=>climb(sc,'down')});
  }
}
const LAD={t:0,sc:null,dir:null,moved:false};
function climb(sc,dir){ if(LAD.t)return; LAD.t=1e-4; LAD.sc=sc; LAD.dir=dir; LAD.moved=false; const f=document.getElementById('fade'); if(f)f.style.opacity='1'; if(G.player.setControl)G.player.setControl(false); G.emit('lens:ladder',{id:sc.d.id,dir}); }
function updateLadder(dt){
  if(!LAD.t)return; LAD.t+=dt;
  if(!LAD.moved&&LAD.t>.6){ LAD.moved=true; const sc=LAD.sc, to=LAD.dir==='up'?sc.top:sc.foot, yaw=LAD.dir==='up'?sc.d.face+PI:sc.d.face;
    // the swarm and the jar come along, as through a door
    const from=G.player.pos.clone(); G.player.teleport(to.x,to.y,to.z,yaw); if(G.player.aimCamera)G.player.aimCamera(yaw,.3);
    const delta=G.player.pos.clone().sub(from); for(const m of mothList()){ if(m&&m.p&&(m.tgt==='lantern'||m.tgt==='jar'||m.tgt==='satchel')&&m.p.distanceTo(from)<30)m.p.add(delta); }
    const f=document.getElementById('fade'); if(f)f.style.opacity='0'; }
  if(LAD.t>1.05){ LAD.t=0; if(G.player.setControl)G.player.setControl(true); }
}

/* ================================================================ PERSISTENCE (inside the 'temple' save) */
G.temple.persist({id:'puzzles',
  save:()=>({v:1,lens:S.lens,seals:Object.keys(S.seals),mirrors:Object.assign({},S.mirrors),winch:S.winch,disc:S.disc,eyes:S.eyes,box:S.box,galleryBox:S.galleryBox,
    well:Object.keys(S.well),wellProg:Object.fromEntries(Object.entries(WELL.seals).map(([k,s])=>[k,+s.progress.toFixed(3)])),vigilBox:S.vigilBox,said:Object.keys(S.said),shortcuts:Object.keys(S.shortcuts)}),
  load:d=>{ if(!d)return;
    S.lens=!!d.lens; S.mirrors=Object.assign({M1:0,M2:0},d.mirrors||{}); S.winch=!!d.winch; S.box=!!d.box; S.galleryBox=!!d.galleryBox; S.vigilBox=!!d.vigilBox;
    S.said={}; (d.said||[]).forEach(k=>{S.said[k]=1;});
    for(const id of d.seals||[])openLensSeal(id,true);
    if(d.disc)solveDisc(true); if(d.eyes)solveEyes(true);
    for(const id of d.well||[])openWellSeal(id,true);
    for(const k in (d.wellProg||{})){ const s=WELL.seals[k]; if(s&&!s.cured)s.progress=Math.min(.95,+d.wellProg[k]||0); }
    if(BX.rec)BX.rec.visible=!S.box; setMirrorPose(true); }
});

/* ================================================================ SYSTEM */
G.system('templePuzzles',{order:24,modes:'always',
  init(){
    G.scene.add(root,isle);
    try{ buildAltar(); }catch(e){ console.error('temple altar',e); }
    try{ buildMirrors(); buildTargets(); }catch(e){ console.error('temple mirrors',e); }
    try{ buildBoxes(); buildSeals(); }catch(e){ console.error('temple seals',e); }
    try{ buildWinch(); buildWellSeals(); }catch(e){ console.error('temple winch/well',e); }
    try{ buildShortcuts(); }catch(e){ console.error('lens shortcuts',e); }
  },
  update(dt){
    root.visible=inside(); isle.visible=!inside();
    updateLensSeals(dt); updateLadder(dt);
    if(!inside())return;
    updateAltar(dt); updateMirrors(dt); updateTargets(dt); updateWinch(dt); updateBoxes(dt); updateWell(dt);
  }
});
G.templePuzzles={state:S,mirrors:MIR,lensSeals:LSEALS,well:WELL,shortcuts:SC,turnMirror,windWinch,openLensSeal,openWellSeal,solveDisc,solveEyes,takeLens};
})();
