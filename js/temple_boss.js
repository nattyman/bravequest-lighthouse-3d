/* =====================================================================
   BRAVE QUEST: LIGHTHOUSE — temple_boss.js  (Boss agent; spec TEMPLE.md)
   The Vigil's hostiles (Vigilants, hollows, two hounds in the well) and THE ANSWER in the Sanctum of the Seam.
   Persist 'templeBoss'.

   The fight (target 4–5 min, tuned for 5–7 hearts and the staff moves; every blow costs one heart):
   · Phase 1 — The Hands (hp 120 → 72). Hesper kneels with both hands on the seam. Hands of ink push up out of the floor
     around her (a violet crack telegraphs each, 1.1 s), then crawl toward her. Each wears an ink skin: the Lens beam burns it
     (1 s), then the staff can break it (6 hp; 12 off the Answer's bar: four of them end the phase). A hand you stand next to rears and slams (0.9 s
     wind-up, a ring on the floor). A hand that reaches Hesper grips her: she loses ground, and the ring of ink around the
     seam grows (standing in it hurts). If she loses all of it, the Answer drinks what it took (+15 hp) and she claws back.
   · Phase 2 — The Answer (≤ 60 %). She lets go. It rises out of the seam: a tall shape of violet light with a hollow where a
     heart would be. The inverse of the Gloaming: solid only while your light is shut; with the lantern open it is only glare
     (blows pass through). It sweeps (a cone, 1.05 s), calls hands up under you (three circles, 1.1 s), and — only while your
     lantern is open — flares (1.3 s): shut the shutter before it does. Stand under it too long and it pulses you off.
   · Phase 3 — The Sealing (≤ 25 %). It pulls the room's moths into itself and eats them; Hesper catches the ones that pass
     near her. Hold the Lens beam on the seam (12 s in all, slow decay off it) while she seals it, under sweeps and hands.
     The bar falls with the seal.
   · Death of the player: the fight resets cleanly (Hesper back at the seam); you rise at the sanctum door. Leaving the
     arena resets it too.
   · Defeat: the seam takes it back and closes. temple:bossDead → progression.js drops the 9th heart (+2 Marks) at the seam;
     the Lens is ground true (a longer beam) if lens.js takes it, else ether for the lamp; temple_people.js plays the ending.

   Frame: G.temple (Place agent) when present, else O + local with O = (−800, 60, 0).
   API: G.templeBoss = {state, phase, hp, maxHp, defeated, fighting, seal, hesper:{pose,at,hold}, hands, monsters, T, debug}
   Events: temple:bossStart · temple:bossPhase {n} · temple:bossDead {pos, restored} · temple:bossReset {why}
           temple:bossTelegraph {kind:'rise'|'slam'|'sweep'|'grasp'|'glare'|'pulse', pos, lead} · temple:bossHit {damage, hp, glare}
           temple:hand {what:'rise'|'burn'|'broken'|'grip', pos} · temple:hesperHold {hold, lost} · temple:seal {k, on}
           monster:killed {kind:'answer', boss:true}
   ===================================================================== */
(function(){
'use strict';
const G=window.G, THREE=G.THREE, U=G.U, PI=Math.PI, TAU=PI*2;
const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const rnd=U.rng(7711);
const FX=()=>(G.monsters&&G.monsters.fx)||null;
const INK=()=>G.ink||null;
const isPlay=()=>G.state.mode==='play';
const TP=()=>G.temple||null;

/* ---------------------------------------------------------------- frame (G.temple when present, else O + local) */
const O_FALL=V(-800,60,0);
const origin=()=>{ const t=TP(); return t&&t.origin&&t.origin.isVector3?t.origin:O_FALL; };
function W(x,y,z){ const t=TP(); if(t&&t.toWorld){ try{ const v=t.toWorld(x,y,z); if(v&&isFinite(v.x))return V(v.x,v.y,v.z); }catch(e){} } const o=origin(); return V(o.x+x,o.y+y,o.z+z); }
function toLocal(v){ const o=origin(); return V(v.x-o.x,v.y-o.y,v.z-o.z); }
const LOCAL={vestibule:{c:[0,0,0],r:7},nave:{c:[0,-3,-30],r:20,box:[-7,7,-50,-10]},reliquary:{c:[-24,-4,-40],r:8},
  cloister:{c:[24,-6,-46],r:10},well:{c:[0,-10,-70],r:9,deep:true},sanctum:{c:[0,-16,-100],r:18}};
const FB={'sanctum.centre':[0,-16,-100],'sanctum.seam':[0,-16,-100],'sanctum.hesper':[0,-16,-101.7],'sanctum.carving':[0,-13,-117.6],
  'sanctum.exit':[12,-16,-113],'sanctum.door':[0,-16,-83.5],'vestibule.entry':[0,0,3]};
function anchor(room,name,all){
  const t=TP(), r=t&&t.rooms&&t.rooms[room]; let a=r&&r.anchors&&r.anchors[name];
  if(Array.isArray(a)){ if(all)return a.filter(q=>q&&isFinite(q.x)).map(q=>V(q.x,q.y,q.z)); a=a[0]; }
  if(a&&a.pos&&isFinite(a.pos.x))a=a.pos;
  if(a&&isFinite(a.x))return all?[V(a.x,a.y,a.z)]:V(a.x,a.y,a.z);
  const f=FB[room+'.'+name]; if(!f)return all?[]:null; const w=W(f[0],f[1],f[2]); return all?[w]:w;
}
function roomCentre(id){ const t=TP(), r=t&&t.rooms&&t.rooms[id]; if(r&&r.centre&&isFinite(r.centre.x))return V(r.centre.x,r.centre.y,r.centre.z); const l=LOCAL[id]; return W(l.c[0],l.c[1],l.c[2]); }
function roomOf(p){
  const t=TP(); if(t&&t.room){ try{ return t.room(p); }catch(e){} }
  const l=toLocal(p); if(l.y>6||l.y<-26)return null;
  for(const id in LOCAL){ const f=LOCAL[id]; if(Math.abs(l.y-f.c[1])>(f.deep?12:7))continue;
    if(f.box){ if(l.x>f.box[0]&&l.x<f.box[1]&&l.z>f.box[2]&&l.z<f.box[3])return id; continue; }
    if(Math.hypot(l.x-f.c[0],l.z-f.c[2])<f.r+(id==='sanctum'?3:1))return id; }
  return null;
}
function inside(){
  const t=TP(); if(t&&'inside' in t)return !!t.inside;
  const P=G.player; if(!P||!P.pos)return false; const l=toLocal(P.pos);
  return l.y<8&&l.y>-30&&l.x>-45&&l.x<45&&l.z>-125&&l.z<14;
}
const floorAt=(x,z,y)=>{ const f=G.floorAt(x,z,y); return isFinite(f)?f:-1e9; };
const groundAt=(p,fb)=>{ const y=floorAt(p.x,p.z,p.y+2); return y>p.y-4&&y<p.y+4?y:(fb!=null?fb:p.y); };

/* ---------------------------------------------------------------- save state */
const S={v:1,defeated:false,reward:null,said:{}};
const say=(k,text,who,o)=>{ if(S.said[k])return false; S.said[k]=1; G.ui.say(text,who,o); return true; };
const beats=[];
const later=(s,fn)=>beats.push({t:G.time+s,fn});
function runBeats(){ for(let i=beats.length-1;i>=0;i--){ if(G.time>=beats[i].t){ const b=beats.splice(i,1)[0]; try{b.fn();}catch(e){console.error('templeBoss beat',e);} } } }

/* ---------------------------------------------------------------- audio (audio.js owns the sounds; quiet if absent) */
function snd(name,pos){ const A=G.audio, t=A&&A.temple; if(!t||!t.play)return; try{ t.play(name,pos); }catch(e){} }
function music(on){ try{ const M=G.audio&&G.audio.music; if(M&&M.setOverride){ if(on)M.setOverride('boss'); else if(M.state==='boss'||on===false)M.setOverride(null); } }catch(e){} }

/* ---------------------------------------------------------------- light: the lantern, the Lens */
const lantern=()=>G.items&&G.items.lantern;
function lightOpen(near){
  const L=lantern(); if(!L||!L.found)return false;
  if(G.lens&&G.lens.focused)return true;
  if(L.carried)return !!(L.lit&&L.lit());
  if(L.inCradle||!(L.lit&&L.lit()))return false;
  return !!(near&&Math.hypot(L.pos.x-near.x,L.pos.z-near.z)<9);   // left open on the floor close by: that's light too
}
const lensOwned=()=>!!(G.lens&&(G.lens.owned||(G.items&&G.items.lens&&G.items.lens.owned)));
const _bs=V(), _bp=V();
/** is the focused beam on pos (within r)? Uses G.lens.beam; without lens.js, an open lantern aimed along the camera. */
function beamOn(pos,r){
  const Ls=G.lens;
  if(Ls){ if(!Ls.focused||!Ls.beam||!Ls.beam.origin||!Ls.beam.dir)return false;
    const o=Ls.beam.origin, d=Ls.beam.dir, len=(Ls.beam.length||14)+r;
    _bs.subVectors(pos,o); const t=_bs.dot(d); if(t<-r||t>len)return false; _bp.copy(o).addScaledVector(d,U.clamp(t,0,len));
    if(Ls.beam.hit&&Ls.beam.hit.pos&&Ls.beam.hit.kind!=='enemy'&&o.distanceTo(Ls.beam.hit.pos)+r<t)return false;   // blocked short of it
    return _bp.distanceTo(pos)<r; }
  const L=lantern(), P=G.player; if(!L||!L.carried||!L.lit()||!P)return false;
  const cam=G.camera; if(!cam)return false; cam.getWorldDirection(_bs);
  _bp.set(pos.x-P.pos.x,pos.y-(P.pos.y+1.2),pos.z-P.pos.z); const d=_bp.length(); if(d>15)return false;
  return _bp.normalize().dot(_bs)>Math.cos(Math.atan2(r,Math.max(d,.1))+.05);
}

/* =====================================================================
   1. THE VIGIL'S HOSTILES — packs spawn the first time the player stands in a room on a visit (as in the Undercroft);
      whatever is left alive is cleared when the player leaves the temple, and the next visit brings them back.
      13 Vigilants + 2 hollows + the well's 2 hounds. Never in the sanctum.
   ===================================================================== */
const PACKS={
  vestibule:{vigilant:2},            // among the carved watchers on the stair: they teach the shutter
  nave:{vigilant:3,hollow:1},        // the Hall of Mirrors
  reliquary:{vigilant:2},            // round the Lens
  cloister:{vigilant:2,hollow:1},    // the Drowned Cloister (on the floor that's still there)
  well:{vigilant:2,hound:2}          // the Moth Well: the two hounds
};
const spawned=new Set(), mine=[];
let curRoom=null, roomT=0, wasInside=false;
function okSpot(x,z,c,room,taken,P,minP){
  const deep=LOCAL[room].deep, y=floorAt(x,z,c.y+(deep?5:3)); if(y<c.y-(deep?9:3)||y>c.y+(deep?4:2.5))return null;
  if(G.world.walkable&&!G.world.walkable(x,z))return null;
  if(roomOf(V(x,y+.5,z))!==room)return null;
  if(P&&Math.hypot(P.x-x,P.z-z)<minP)return null;
  if(taken.some(t=>Math.hypot(t.x-x,t.z-z)<1.8))return null;
  return V(x,y,z);
}
function pickSpot(room,taken,near){
  const c=roomCentre(room), t=TP(), r=t&&t.rooms&&t.rooms[room], b=r&&r.bounds, P=G.player&&G.player.pos, f=LOCAL[room];
  for(let k=0;k<60;k++){
    let x,z;
    if(near&&k<30){ const a=rnd()*TAU, d=1.6+rnd()*2.2; x=near.x+Math.cos(a)*d; z=near.z+Math.sin(a)*d; }
    else if(b&&b.min&&b.max){ x=U.lerp(b.min.x+1.5,b.max.x-1.5,rnd()); z=U.lerp(b.min.z+1.5,b.max.z-1.5,rnd()); }
    else if(f.box){ const o=origin(); x=o.x+U.lerp(f.box[0]+1.5,f.box[1]-1.5,rnd()); z=o.z+U.lerp(f.box[2]+2,f.box[3]-2,rnd()); }
    else { const a=rnd()*TAU, d=Math.sqrt(rnd())*f.r*.78; x=c.x+Math.cos(a)*d; z=c.z+Math.sin(a)*d; }
    const v=okSpot(x,z,c,room,taken,P,k<40?9:5); if(v){ taken.push(v); return v; }
  }
  return null;
}
function spawnPack(room){
  const pk=PACKS[room]; if(!pk||!G.monsters||!G.monsters.spawn)return; spawned.add(room);
  const c=roomCentre(room), zone={name:'temple-'+room,x:c.x,z:c.z,r:(LOCAL[room].box?22:LOCAL[room].r)+2}, taken=[];
  let houndAt=null;
  for(const kind of ['vigilant','hollow','hound']){
    for(let i=0;i<(pk[kind]||0);i++){
      const p=pickSpot(room,taken,kind==='hound'?houndAt:null); if(!p)continue;
      if(kind==='hound'&&!houndAt)houndAt=p;
      try{ const m=G.monsters.spawn(kind,{x:p.x,y:p.y,z:p.z},{zone,temple:room,intro:kind!=='vigilant',
          heading:Math.atan2(c.x-p.x,c.z-p.z)+(rnd()-.5)*.6});
        if(m){ m.temple=room; mine.push(m); } }catch(e){console.error('temple spawn',e);}
    }
  }
}
function clearMine(){ for(const m of mine)if(m.alive&&G.monsters.despawn)G.monsters.despawn(m); mine.length=0; spawned.clear(); }
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
    if(m.pos.y<origin().y-40&&G.monsters.despawn){ G.monsters.despawn(m); mine.splice(i,1); } }
}
/* Vigilant captions (narration, once each) */
G.on('vigilant:notice',e=>{ if(!inside())return;
  if(e&&e.beam)say('vigBeam','A Vigilant’s hood turns toward the hum of the focused beam. They hear it.',null,{priority:'normal'});
  else say('vigNotice','One of the carved watchers on the stair isn’t carved. It lifts its hood toward your light, and comes.',null,{priority:'high'}); });
G.on('vigilant:lost',()=>{ if(!inside())return; const L=lantern();
  if(L&&L.shut)say('vigLost','In the dark it stops, and stands, listening. Then it turns back to its vigil.',null,{priority:'normal'}); });
G.on('vigilant:glance',e=>{ if(!inside()||!e||e.kind==='swarm')return;
  say('vigGlance',lensOwned()?'The staff skids off its skin of ink. Burn the ink off with the Lens first.':'The staff skids off its skin of ink as if off wet slate. Shut the lantern: it hunts your light.',null,{priority:'high'}); });
G.on('vigilant:burn',()=>{ if(!inside())return; say('vigBurn','Under the beam the ink chars and peels away. Underneath it’s only grey robes and fog. That you can hit.',null,{priority:'high'}); snd('vigilant_burn',null); });

/* the shutter in the temple, until lens.js lands (it owns the shutter hold): a cured lantern can still be shut down here, as
   in the cave. Skipped when lens.js is loaded or player.js already toggled it this frame. */
let shutEvT=-1;
G.on('lantern:shutter',()=>{ shutEvT=G.time; });
function updateShutterFallback(){
  if(G.lens||!inside())return; const L=lantern(), P=G.player; if(!L||!L.carried||!L.cured||!P||P.alive===false)return;
  G.hint('F',L.shut?'Open the shutter':'Close the shutter');
  if(G.input&&G.input.pressed&&G.input.pressed('shutter')&&shutEvT!==G.time){ L.shut=!L.shut; G.emit('lantern:shutter',{shut:L.shut,temple:true}); shutEvT=G.time; }
}
G.on('temple:exit',()=>{ const L=lantern(); if(L&&L.shut&&!G.lens){ L.shut=false; G.emit('lantern:shutter',{shut:false,temple:true}); } });

/* =====================================================================
   2. THE ANSWER
   ===================================================================== */
const T={hp:120,p2:72,p3:30,arenaR:18,startR:12.5,leaveR:21,
  // phase 1: the hands
  handMax:3,handEvery:[5.2,6.8],handFirst:2.6,riseWind:1.1,handHp:6,handKill:12,handSpeed:.5,handR:[5,8.5],gripR:1.6,
  skinNeeds:1.0,slamR:2.6,slamWind:.9,slamHit:1.8,slamDmg:2,slamCool:2.6,
  holdMax:4,inkR0:1.6,inkPer:1.15,inkDmg:1,inkTick:1.3,drinkHp:15,
  // phase 2: the Answer
  bodyR:1.35,bodyH:5.6,sweepWind:1.05,sweepR:7.2,sweepArc:1.7,sweepDmg:2,
  graspWind:1.1,graspR:1.5,graspN:3,graspDmg:2,
  glareWind:1.3,glareR:20,glareDmg:2,glareEvery:9,
  pulseWind:.8,pulseR:3.4,pulseDmg:1,underT:1.6,
  cool:[1.6,2.6],coolP3:[2.4,3.4],
  // phase 3: the sealing
  sealNeed:12,sealDecay:.03,eatRate:2,shieldR:4.2,shieldRate:1.4,seamR:1.7};
const B={built:false,state:'dormant',st:0,phase:1,hp:T.hp,cool:2,atk:null,flash:0,rise:0,solid:0,outT:0,underT:0,
  handT:T.handFirst,hold:T.holdMax,inkR:T.inkR0,inkTickT:0,seal:0,sealOn:false,glareT:T.glareEvery,heading:0,lastHitT:-9,deadT:0,
  hesper:{pose:'hold',at:V(),hold:1}};
let C=V(), floorY=0, door=V(), seamP=V();
function arenaGeo(){
  C=anchor('sanctum','centre'); floorY=groundAt(C,C.y); C.y=floorY;
  seamP=anchor('sanctum','seam')||C.clone(); seamP.y=floorY;
  door=anchor('sanctum','door')||doorFallback(); door.y=groundAt(door,floorY);
  hesperHome();
}
function doorFallback(){ const w=roomCentre('well'), d=V(w.x-C.x,0,w.z-C.z); if(d.lengthSq()<1)d.set(0,0,1); d.normalize(); return V(C.x+d.x*(T.arenaR-2),floorY,C.z+d.z*(T.arenaR-2)); }
function hesperKneel(){ const h=anchor('sanctum','hesper'); if(h){ h.y=groundAt(h,floorY); return h; } return V(C.x,floorY,C.z-1.7); }
function hesperAside(){ // phase 2: she steps back toward the door side, off to the left of it
  const d=V(door.x-C.x,0,door.z-C.z).normalize(), s=V(d.z,0,-d.x); return V(C.x+d.x*7-s.x*6,floorY,C.z+d.z*7-s.z*6); }
function hesperHome(){ B.hesper.at.copy(hesperKneel()); B.hesper.pose='hold'; B.hesper.hold=B.hold/T.holdMax; }

/* ---------------------------------------------------------------- materials */
let MAT=null;
function mats(){
  if(MAT)return MAT;
  const F=FX();
  const handS=F?F.sharedUniforms('#b58cff',1.9,'#1a0c2c',.55):null, skinS=F?F.sharedUniforms('#a37cff',2.2,'#0a0612',.45):null;
  MAT={handS,skinS,
    hand:F?F.inkMat(handS,{amp:.03,wisp:.5,flow:.4,scale:2.4,rimK:.9}):G.toon('#2a1a3a'),
    skin:F?F.inkMat(skinS,{amp:.05,wisp:.3,flow:.6,scale:2.6,rimK:1.2,side:THREE.DoubleSide}):G.toon('#0a0612'),
    body:answerMat(), hollow:new THREE.SpriteMaterial({map:hollowTex(),color:0xffffff,transparent:true,depthWrite:false,opacity:1}),
    glow:new THREE.SpriteMaterial({map:G.tex.soft,color:U.col('#b98cff'),transparent:true,opacity:.6,depthWrite:false,blending:THREE.AdditiveBlending}),
    hole:new THREE.MeshBasicMaterial({color:0x07040c,transparent:true,opacity:.9,depthWrite:false}),
    ink:new THREE.MeshBasicMaterial({map:inkRingTex(),color:0xffffff,transparent:true,opacity:.92,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}),
    seam:new THREE.MeshBasicMaterial({map:G.tex.soft,color:U.col('#9a6cff'),transparent:true,opacity:.0,depthWrite:false,blending:THREE.AdditiveBlending,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3})};
  return MAT;
}
/* the Answer's body: violet light. uSolid 0 = glare (thin, bright, see-through); 1 = solid (dense, dark core, hard rim) */
function answerMat(){
  const u={uTime:{value:0},uSolid:{value:0},uFade:{value:0},uFlash:{value:0},uGlare:{value:0},uBase:{value:0}};
  return new THREE.ShaderMaterial({uniforms:u,transparent:true,depthWrite:false,side:THREE.DoubleSide,
    vertexShader:`varying vec3 vN;varying vec3 vV;varying vec3 vW;void main(){vec4 wp=modelMatrix*vec4(position,1.);vW=wp.xyz;vec4 mv=viewMatrix*wp;vN=normalize(mat3(viewMatrix)*mat3(modelMatrix)*normal);vV=normalize(-mv.xyz);gl_Position=projectionMatrix*mv;}`,
    fragmentShader:`uniform float uTime;uniform float uSolid;uniform float uFade;uniform float uFlash;uniform float uGlare;uniform float uBase;varying vec3 vN;varying vec3 vV;varying vec3 vW;
      void main(){ float f=1.-abs(dot(normalize(vN),normalize(vV)));
        float w=sin(vW.y*3.1-uTime*2.3+sin(vW.x*2.+uTime)*1.4)*.5+.5, w2=sin(vW.y*7.3+uTime*3.7+vW.z*3.)*.5+.5;
        vec3 glare=vec3(.62,.46,.95)*(.22+.95*f)+vec3(.9,.85,1.)*uGlare*(.4+.6*w2);
        vec3 solid=vec3(.09,.04,.16)+vec3(.55,.3,1.)*pow(f,2.2)*1.8+vec3(.3,.15,.6)*w*.35;
        vec3 col=mix(glare,solid,uSolid)+vec3(.9,.8,1.)*uFlash;
        float low=smoothstep(uBase,uBase+1.2,vW.y);
        float a=mix((.06+.38*f)*(.7+.3*w2)+uGlare*.3,.94,uSolid)*uFade*low;
        if(a<.01)discard; gl_FragColor=vec4(col,clamp(a,0.,1.)); }`});
}
function hollowTex(){ return G.canvasTex(128,(g,s)=>{ const gr=g.createRadialGradient(s/2,s/2,0,s/2,s/2,s/2);
  gr.addColorStop(0,'rgba(4,2,8,1)'); gr.addColorStop(.55,'rgba(6,3,12,.98)'); gr.addColorStop(.72,'rgba(200,170,255,.9)'); gr.addColorStop(.82,'rgba(160,110,255,.35)'); gr.addColorStop(1,'rgba(120,80,255,0)');
  g.fillStyle=gr; g.fillRect(0,0,s,s); }); }
function inkRingTex(){ return G.canvasTex(256,(g,s)=>{ const r=U.rng(91); g.clearRect(0,0,s,s);
  // a ragged pool of wet ink, darkest at its edge where it's spreading, a faint violet rim
  for(let i=0;i<70;i++){ const a=r()*TAU, d=s*(.3+r()*.17), x=s/2+Math.cos(a)*d, y=s/2+Math.sin(a)*d, rr=s*(.04+r()*.07);
    const gr=g.createRadialGradient(x,y,0,x,y,rr); gr.addColorStop(0,'rgba(8,4,14,.95)'); gr.addColorStop(1,'rgba(8,4,14,0)'); g.fillStyle=gr; g.beginPath(); g.arc(x,y,rr,0,TAU); g.fill(); }
  const gr=g.createRadialGradient(s/2,s/2,0,s/2,s/2,s*.48); gr.addColorStop(0,'rgba(10,6,18,.82)'); gr.addColorStop(.86,'rgba(10,6,18,.92)'); gr.addColorStop(.95,'rgba(150,100,255,.5)'); gr.addColorStop(1,'rgba(150,100,255,0)');
  g.fillStyle=gr; g.beginPath(); g.arc(s/2,s/2,s*.48,0,TAU); g.fill(); }); }
function decalTex(kind){
  return G.canvasTex(128,(g,s)=>{
    if(kind==='crack'){ g.strokeStyle='rgba(255,255,255,1)'; g.lineWidth=3; const r=U.rng(13); for(let k=0;k<7;k++){ g.beginPath(); g.moveTo(s/2,s/2); let x=s/2,y=s/2,a=k/7*TAU+r()*.4; for(let j=0;j<5;j++){ a+=(r()-.5)*.9; x+=Math.cos(a)*s*.09; y+=Math.sin(a)*s*.09; g.lineTo(x,y); } g.stroke(); }
      const gr=g.createRadialGradient(s/2,s/2,0,s/2,s/2,s*.3); gr.addColorStop(0,'rgba(255,255,255,.8)'); gr.addColorStop(1,'rgba(255,255,255,0)'); g.fillStyle=gr; g.fillRect(0,0,s,s); }
    else { const gr=g.createRadialGradient(s/2,s/2,0,s/2,s/2,s/2); gr.addColorStop(0,'rgba(255,255,255,.12)'); gr.addColorStop(.8,'rgba(255,255,255,.5)'); gr.addColorStop(.97,'rgba(255,255,255,1)'); gr.addColorStop(1,'rgba(255,255,255,0)'); g.fillStyle=gr; g.fillRect(0,0,s,s); }
  });
}

/* ---------------------------------------------------------------- models: the Answer */
let ans=null, inkRing=null, seamGlow=null, coneDecal=null;
const decals=[];   // pooled floor circles (rise cracks, slam rings, grasp circles, glare / pulse rings)
function addM(parent,geo,mat,x=0,y=0,z=0){ const m=new THREE.Mesh(geo,mat); m.position.set(x,y,z); parent.add(m); return m; }
function buildAnswer(){
  const M=mats(), F=FX(), g=new THREE.Group(); g.name='theAnswer';
  // a tall robed shape of light, wide where it pours up out of the seam, narrow at the waist, broad shoulders, a small head
  const prof=[[1.6,0],[1.3,.5],[.85,1.4],[.62,2.4],[.7,3.3],[.95,3.9],[.8,4.3],[.32,4.55],[.3,4.75],[.36,5.05],[.3,5.4],[0,5.6]];
  const body=addM(g,new THREE.LatheGeometry(prof.map(([r,y])=>new THREE.Vector2(r,y)),28),M.body);
  const inner=addM(g,new THREE.LatheGeometry(prof.map(([r,y])=>new THREE.Vector2(r*.62,y*.97)),20),M.body); inner.renderOrder=1;
  // two long arms that reach; each a sweep of light from the shoulder, a hand of long fingers
  const arms=[];
  for(const s of [-1,1]){
    const sh=new THREE.Group(); sh.position.set(s*.92,4.05,0); g.add(sh);
    const geo=F?F.sweep([[0,0,0,.2],[s*.25,-.9,.15,.17],[s*.3,-1.9,.35,.13],[s*.28,-2.7,.6,.09],[s*.25,-3.1,.75,.05]],10,4):new THREE.CylinderGeometry(.1,.2,3,8);
    addM(sh,geo,M.body);
    const fing=[]; for(let k=0;k<4;k++){ const x=(k-1.5)*.07; fing.push(F?F.sweep([[s*.25+x,-3.05,.72,.04],[s*.25+x*1.6,-3.5,.95,.025],[s*.25+x*2,-3.85,1.15,.006]],6,3):null); }
    if(F)addM(sh,F.mergeGeos(fing),M.body);
    arms.push({sh,s});
  }
  // the hollow: where a heart would be, nothing — a dark hole that always faces you, rimmed with light
  const hollow=new THREE.Sprite(M.hollow); hollow.scale.set(1.2,1.5,1); hollow.position.set(0,3.55,.2); hollow.renderOrder=3; g.add(hollow);
  const glow=new THREE.Sprite(M.glow); glow.scale.set(7,9,1); glow.position.y=3; g.add(glow);
  const light=new THREE.PointLight(0xb08aff,0,24,1.4); light.position.set(0,3.4,.6); g.add(light);
  g.visible=false; G.scene.add(g);
  return {g,body,inner,arms,hollow,glow,light};
}
/* ---------------------------------------------------------------- models: the hands */
const hands=[];
function buildHand(i){
  const M=mats(), F=FX(), g=new THREE.Group(); g.name='answerHand'+i;
  const arm=new THREE.Group(); g.add(arm);
  const geo=F?F.sweep([[0,-.3,0,.2],[0,.35,.05,.17],[0,.85,.18,.14],[0,1.2,.38,.12],[0,1.35,.55,.1]],10,4):new THREE.CylinderGeometry(.12,.2,1.4,8);
  const hand=new THREE.Group(); hand.position.set(0,1.35,.55); arm.add(hand);
  const fg=[]; if(F){ fg.push(F.sweep([[0,0,0,.13,.07],[0,.02,.14,.15,.06]],8,2));
    for(let k=0;k<5;k++){ const a=(k-2)*.32, x=Math.sin(a)*.12; fg.push(F.sweep([[x,.02,.12,.035],[x*1.5,.12,.32,.03],[x*1.8,.05,.5,.02],[x*1.9,-.12,.62,.006]],6,3)); } }
  const meshArm=addM(arm,geo,M.hand), meshHand=F?addM(hand,F.mergeGeos(fg),M.hand):null;
  // the ink skin: a glossy black shell a little bigger than the hand (one shared material: the skin is per hand by scale)
  const skin=new THREE.Group(); arm.add(skin);
  const sk=addM(skin,geo,M.skin); sk.scale.set(1.18,1.04,1.18);
  if(meshHand){ const sh=addM(hand,meshHand.geometry,M.skin); sh.scale.setScalar(1.15); skin.userData.handShell=sh; }
  const hole=addM(g,new THREE.CircleGeometry(.75,20).rotateX(-PI/2),M.hole,0,.03,0); hole.renderOrder=1;
  g.visible=false; G.scene.add(g);
  const h={i,g,arm,hand,skin,skinShell:skin.userData.handShell,hole,meshArm,pos:V(),state:'off',st:0,hp:T.handHp,skinOn:true,skinK:1,burnT:0,burnH:null,
    slamCool:0,flash:0,yaw:0,rise:0,hb:null,hitSet:new Set()};
  h.hb={team:'enemy',pos:h.pos,radius:.65,height:1.9,targetable:true,corrupt:true,name:'A hand of ink',lockOffset:1.1,hand:h,
    alive:()=>B.state==='fight'&&B.phase===1&&(h.state==='reach'||h.state==='slamWind'||h.state==='slam'||h.state==='grip'),hit:info=>hitHand(h,info)};
  G.combat.add(h.hb);
  return h;
}
function buildDecals(){
  const ring=decalTex('ring'), crack=decalTex('crack');
  const dm=(t,c)=>new THREE.MeshBasicMaterial({map:t,color:U.col(c||'#a678ff'),transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide});
  for(let i=0;i<10;i++){ const m=new THREE.Mesh(new THREE.PlaneGeometry(2,2).rotateX(-PI/2),dm(ring)); m.visible=false; m.renderOrder=2; G.scene.add(m); decals.push({m,t:9,life:1,r:1,kind:'',ringT:ring,crackT:crack}); }
  coneDecal=new THREE.Mesh(new THREE.CircleGeometry(1,28,0,1).rotateX(-PI/2),dm(ring)); coneDecal.visible=false; coneDecal.renderOrder=2; G.scene.add(coneDecal);
  inkRing=new THREE.Mesh(new THREE.PlaneGeometry(2,2).rotateX(-PI/2),mats().ink); inkRing.visible=false; inkRing.renderOrder=1; G.scene.add(inkRing);
  seamGlow=new THREE.Mesh(new THREE.PlaneGeometry(2,2).rotateX(-PI/2),mats().seam); seamGlow.visible=false; seamGlow.renderOrder=2; G.scene.add(seamGlow);
}
let ansHB=null, seamHB=null, shieldHB=null;
function build(){
  if(B.built)return; B.built=true; arenaGeo();
  ans=buildAnswer(); buildDecals();
  for(let i=0;i<4;i++)hands.push(buildHand(i));
  ansHB={team:'enemy',pos:V(),radius:T.bodyR,height:T.bodyH,targetable:true,corrupt:false,name:'The Answer',lockOffset:3.4,answer:true,
    alive:()=>B.state==='fight'&&B.phase>=2&&B.rise>.6,hit:info=>hitAnswer(info)};
  G.combat.add(ansHB);
  // phase 3: what the swarm sees (creatures.js only lets moths hunt corrupt hurtboxes that opt in): the Answer's open hollow,
  // which pulls them all, and Hesper's shield, which keeps the ones she catches (neither takes damage from them)
  const p3=()=>B.state==='fight'&&B.phase===3;
  seamHB={team:'enemy',pos:V(),radius:1.2,height:2.6,targetable:false,corrupt:true,name:'The Answer',answerHollow:true,
    mothPrey:p3,mothRange:30,mothWant:999,mothDamage:0,alive:p3,hit:()=>{}};
  shieldHB={team:'neutral',pos:V(),radius:1,height:2,targetable:false,corrupt:true,name:'Hesper',hesperShield:true,
    mothPrey:p3,mothRange:.1,mothWant:1,mothDamage:0,alive:p3,hit:()=>{}};
  G.combat.add(seamHB); G.combat.add(shieldHB);
}

/* ---------------------------------------------------------------- telegraphs */
function decal(kind,pos,r,lead,o={}){
  const d=decals.find(q=>q.t>=q.life)||decals[0];
  d.kind=kind; d.t=0; d.life=lead+(o.hold||.25); d.lead=lead; d.r=r; d.pos=V(pos.x,floorY+.05+(o.lift||0),pos.z);
  d.m.material.map=kind==='rise'?d.crackT:d.ringT; d.m.material.color.set(o.color||(kind==='glare'?'#e4d2ff':kind==='rise'?'#b088ff':'#a070ff')); d.m.material.needsUpdate=true;
  d.m.position.copy(d.pos); d.m.scale.set(r,1,r); d.m.visible=true; return d;
}
function updateDecals(dt){
  for(const d of decals){ if(d.t>=d.life){ d.m.visible=false; continue; } d.t+=dt;
    const k=Math.min(1,d.t/Math.max(.05,d.lead)), pulse=d.t<d.lead?.55+.45*Math.sin(d.t*(10+k*14)):1-(d.t-d.lead)/Math.max(.05,d.life-d.lead);
    d.m.material.opacity=Math.max(0,(.25+.75*k)*pulse)*(d.kind==='glare'?.6:.85);
    const s=d.kind==='pulse'||d.kind==='glare'?d.r*(.4+.6*k):d.r; d.m.scale.set(s,1,s); }
}
function clearDecals(){ for(const d of decals){ d.t=9; d.m.visible=false; } if(coneDecal)coneDecal.visible=false; }
function showCone(at,yaw,arc,len,k){ coneDecal.visible=k>0; coneDecal.position.set(at.x,floorY+.07,at.z); coneDecal.scale.set(len,1,len);
  coneDecal.rotation.set(0,yaw-PI/2-arc/2,0); coneDecal.material.opacity=k*.75; }
function telegraph(kind,pos,lead){ G.emit('temple:bossTelegraph',{kind,pos:pos.clone(),lead}); }

/* ---------------------------------------------------------------- phase 1: the hands */
const lensBurn={
  add(h){ const L=G.lens; if(!L||!h.skinOn||h.burnH)return; const o={id:'answer-hand-'+h.i,kind:'hand',pos:h.burnPos||(h.burnPos=V()),radius:.85,needs:T.skinNeeds,
      alive:()=>h.skinOn&&(h.state==='reach'||h.state==='slamWind'||h.state==='grip'),onBurn:()=>burnHand(h)};
    let r=null; try{ const b=L.burnable; if(b&&typeof b.add==='function')r=b.add(o)||o; else if(typeof b==='function')r=b(o)||o; }catch(e){ console.error('lens burnable',e); }
    h.burnH=r||'self'; },
  remove(h){ const r=h.burnH; h.burnH=null; if(!r||r==='self')return; try{ const b=G.lens&&G.lens.burnable; if(b&&typeof b.remove==='function')b.remove(r); else if(r.remove)r.remove(); }catch(e){} }
};
function spawnHand(){
  const h=hands.find(q=>q.state==='off'); if(!h)return false;
  const pp=G.player.pos, hp=B.hesper.at;
  let best=null;
  for(let k=0;k<16;k++){ const a=rnd()*TAU, r=U.lerp(T.handR[0],T.handR[1],rnd()), x=seamP.x+Math.cos(a)*r, z=seamP.z+Math.sin(a)*r;
    const y=floorAt(x,z,floorY+2); if(Math.abs(y-floorY)>1)continue;
    if(Math.hypot(x-pp.x,z-pp.z)<2.6)continue;
    const score=Math.hypot(x-hp.x,z-hp.z)+rnd()*2+(hands.some(o=>o.state!=='off'&&Math.hypot(o.pos.x-x,o.pos.z-z)<3)?6:0);
    if(!best||score<best.s)best={x,z,s:score}; }
  if(!best)return false;
  h.state='rising'; h.st=0; h.hp=T.handHp; h.skinOn=lensOwned()||!!(G.lens&&B.forceSkin); h.skinK=h.skinOn?1:0; h.burnT=0; h.slamCool=1.2; h.flash=0; h.rise=0;
  h.pos.set(best.x,floorY,best.z); h.yaw=Math.atan2(hp.x-best.x,hp.z-best.z);
  decal('rise',h.pos,1.3,T.riseWind,{hold:.1}); telegraph('rise',h.pos,T.riseWind);
  G.emit('temple:hand',{what:'rise',pos:h.pos.clone()}); snd('answer_hands',h.pos);
  return true;
}
function burnHand(h){
  if(!h.skinOn)return; h.skinOn=false; lensBurn.remove(h); h.flash=1;
  const I=INK(); I&&I.burst(V(h.pos.x,floorY+1.1,h.pos.z),{n:22,speed:2.2,size:[.3,.9],life:[.5,1.1],up:1.6,embers:20,drops:4});
  G.emit('temple:hand',{what:'burn',pos:h.pos.clone()});
  say('handBurn','The ink skin chars off the hand under the beam. What’s left underneath is softer.',null,{priority:'high'});
}
function hitHand(h,info){
  if(B.phase!==1||h.state==='off'||h.state==='rising'||h.state==='sink')return;
  if(info.kind==='swarm')return;
  if(h.skinOn){ h.flash=.35; const F=FX(); F&&F.sparks(V(h.pos.x,floorY+1.2,h.pos.z),8,.6); G.emit('temple:hand',{what:'glance',pos:h.pos.clone()});
    say('handGlance',lensOwned()?'The staff skids off the hand’s skin of ink. Burn it with the Lens first.':'The staff skids off the hand’s skin of ink.',null,{priority:'high'}); return; }
  if(G.time-(h.lastHitT||-9)<.1&&info.kind===h.lastKind)return; h.lastHitT=G.time; h.lastKind=info.kind;
  h.hp-=info.damage||1; h.flash=1;
  const F=FX(); F&&F.splash(V(h.pos.x,floorY+1.2,h.pos.z),info.dir||V(0,0,1),.7);
  if(h.hp<=0)breakHand(h);
}
function breakHand(h){
  h.state='sink'; h.st=0; lensBurn.remove(h);
  const I=INK(); I&&I.burst(V(h.pos.x,floorY+.8,h.pos.z),{n:34,speed:3,size:[.4,1.2],life:[.6,1.3],up:1.8,embers:14,drops:10});
  G.emit('temple:hand',{what:'broken',pos:h.pos.clone()});
  B.inkR=Math.max(T.inkR0,B.inkR-.5);
  damage(T.handKill,{},V(h.pos.x,floorY+1,h.pos.z),true);
}
function gripHesper(h){
  h.state='grip'; h.st=0;
  B.hold=Math.max(0,B.hold-1); B.inkR=Math.min(T.inkR0+T.inkPer*T.holdMax,B.inkR+T.inkPer); B.hesper.hold=B.hold/T.holdMax;
  G.ui.shake&&G.ui.shake(.2);
  const lost=B.hold<=0;
  G.emit('temple:hesperHold',{hold:B.hold,lost});
  G.emit('temple:hand',{what:'grip',pos:h.pos.clone()});
  if(lost){ // the Answer drinks what it took; she claws back a little of the floor
    B.hp=Math.min(T.hp,B.hp+T.drinkHp); B.hold=2; B.hesper.hold=B.hold/T.holdMax;
    const I=INK(); I&&I.burst(V(seamP.x,floorY+.4,seamP.z),{n:40,speed:3.5,size:[.5,1.4],life:[.8,1.5],up:1,embers:20,drops:12});
    later(.4,()=>G.ui.say('The seam drinks. The violet under the floor brightens, and the thing under it is stronger for it.',null,{priority:'high'})); }
}
function updateHands(dt){
  const pp=G.player.pos, hp=B.hesper.at;
  B.handT-=dt;
  const live=hands.filter(h=>h.state!=='off'&&h.state!=='sink').length;
  if(B.handT<=0&&!B.noAtk){ if(live<T.handMax&&spawnHand())B.handT=U.lerp(T.handEvery[0],T.handEvery[1],rnd()); else B.handT=1; }
  for(const h of hands){
    if(h.state==='off')continue;
    h.st+=dt; h.flash=Math.max(0,h.flash-dt*4); h.slamCool-=dt;
    if(h.skinOn&&!h.burnH&&G.lens)lensBurn.add(h);
    if(h.burnPos)h.burnPos.set(h.pos.x,floorY+1.05,h.pos.z);
    if(h.skinOn&&h.burnH==='self'&&(h.state==='reach'||h.state==='slamWind'||h.state==='grip')){ if(beamOn(V(h.pos.x,floorY+1.05,h.pos.z),.85)){ h.burnT+=dt; if(h.burnT>=T.skinNeeds)burnHand(h); } else h.burnT=Math.max(0,h.burnT-dt*.5); }
    h.skinK=U.damp(h.skinK,h.skinOn?1:0,h.skinOn?8:2.5,dt);
    const dP=Math.hypot(pp.x-h.pos.x,pp.z-h.pos.z);
    if(h.state==='rising'){ h.rise=U.smooth(T.riseWind*.6,T.riseWind+.5,h.st); if(h.st>=T.riseWind+.5){ h.state='reach'; h.st=0; } }
    else if(h.state==='reach'){
      h.rise=1;
      // crawl toward Hesper along the floor
      const dx=hp.x-h.pos.x, dz=hp.z-h.pos.z, d=Math.hypot(dx,dz);
      h.yaw+=U.angDiff(Math.atan2(dx,dz),h.yaw)*Math.min(1,dt*2);
      if(d<T.gripR){ gripHesper(h); }
      else if(!B.noAtk){ const s=Math.min(d-T.gripR*.8,T.handSpeed*dt); h.pos.x+=dx/d*s; h.pos.z+=dz/d*s; h.pos.y=groundAt(h.pos,floorY); }
      // you're next to it: it rears and slams
      if(dP<T.slamR&&h.slamCool<=0&&!B.noAtk&&G.player.alive!==false){ h.state='slamWind'; h.st=0; h.slamYaw=Math.atan2(pp.x-h.pos.x,pp.z-h.pos.z);
        h.slamAt=V(h.pos.x+Math.sin(h.slamYaw)*1.1,floorY,h.pos.z+Math.cos(h.slamYaw)*1.1);
        decal('slam',h.slamAt,T.slamHit,T.slamWind); telegraph('slam',h.slamAt,T.slamWind); }
    }
    else if(h.state==='slamWind'){
      h.yaw+=U.angDiff(h.slamYaw,h.yaw)*Math.min(1,dt*8);
      if(h.st>=T.slamWind){ h.state='slam'; h.st=0; h.hitSet.clear();
        G.combat.strike({x:h.slamAt.x,y:floorY+.6,z:h.slamAt.z,radius:T.slamHit,team:'enemy',damage:T.slamDmg,knockback:7,kind:'melee',source:h.hb,exclude:h.hitSet});
        const I=INK(); I&&I.burst(V(h.slamAt.x,floorY+.15,h.slamAt.z),{n:18,speed:2.5,size:[.3,.9],life:[.4,.9],up:1,embers:4,drops:8}); G.ui.shake&&G.ui.shake(.18); snd('answer_hands',h.slamAt); }
    }
    else if(h.state==='slam'){ if(h.st>.5){ h.state='reach'; h.st=0; h.slamCool=T.slamCool; } }
    else if(h.state==='grip'){ if(h.st>1.4){ h.state='sink'; h.st=0; lensBurn.remove(h); } }
    else if(h.state==='sink'){ h.rise=1-U.smooth(0,.9,h.st); if(h.st>1){ h.state='off'; h.g.visible=false; } }
  }
  // the ring of ink: standing in it hurts
  B.inkTickT-=dt;
  const dS=Math.hypot(pp.x-seamP.x,pp.z-seamP.z);
  if(dS<B.inkR-.3&&B.inkR>T.inkR0+.2&&B.inkTickT<=0&&G.player.alive!==false&&Math.abs(pp.y-floorY)<1.2){ B.inkTickT=T.inkTick;
    G.combat.strike({x:pp.x,y:pp.y+.5,z:pp.z,radius:.5,team:'enemy',damage:T.inkDmg,knockback:2,kind:'melee'});
    say('inkHurt','The ink around the seam is cold through your boots, and it bites.',null,{priority:'normal'}); }
}
function renderHands(dt){
  const t=G.time, M=mats();
  for(const h of hands){
    const vis=h.state!=='off'; h.g.visible=vis; if(!vis)continue;
    h.g.position.set(h.pos.x,floorY,h.pos.z); h.g.rotation.y=h.yaw;
    const W=h.state==='slamWind'?Math.min(1,h.st/T.slamWind):0, S=h.state==='slam'?1:0, Gp=h.state==='grip';
    h.arm.position.y=-1.6*(1-h.rise);
    h.arm.rotation.x=U.damp(h.arm.rotation.x,W?-.75*W:S?.9:Gp?.6:.15+Math.sin(t*2+h.i)*.08,S?30:8,dt);
    h.arm.rotation.z=Math.sin(t*1.4+h.i*2)*.08;
    h.hand.rotation.x=U.damp(h.hand.rotation.x,W?-.6:S?.5:Gp?.9:Math.sin(t*3+h.i)*.15,10,dt);
    h.skin.visible=h.skinK>.03; h.skin.scale.setScalar(.92+.08*h.skinK);
    if(h.skinShell)h.skinShell.visible=h.skin.visible;
    h.hole.scale.setScalar(.6+.5*h.rise);
  }
  if(M.handS){ const fl=Math.max(...hands.map(h=>h.state!=='off'?h.flash:0),0); M.handS.uFlash.value=fl*.9; M.handS.uFade.value=1; M.skinS.uFade.value=1; }
}
function clearHands(){ for(const h of hands){ h.state='off'; h.g.visible=false; lensBurn.remove(h); } }

/* ---------------------------------------------------------------- phase 2 / 3: the Answer's attacks */
const _d=V();
function lightNear(){ return lightOpen(seamP); }
function chooseAttack(){
  if(B.noAtk)return;
  const pp=G.player.pos, d=Math.hypot(pp.x-seamP.x,pp.z-seamP.z);
  _d.set(pp.x-seamP.x,0,pp.z-seamP.z); if(_d.lengthSq()<.01)_d.set(0,0,1); _d.normalize();
  if(B.phase===2&&B.underT>T.underT){ B.underT=0; B.atk={kind:'pulse',t:0}; decal('pulse',seamP,T.pulseR,T.pulseWind); telegraph('pulse',seamP,T.pulseWind); return; }
  if(B.phase===2&&lightNear()&&B.glareT<=0&&d<T.glareR){ B.glareT=T.glareEvery; B.atk={kind:'glare',t:0}; decal('glare',seamP,6,T.glareWind,{hold:.2}); telegraph('glare',seamP,T.glareWind); snd('answer_glare',seamP); return; }
  if(d<T.sweepR-.6&&rnd()<.55){ B.atk={kind:'sweep',t:0,dir:_d.clone()}; telegraph('sweep',seamP,T.sweepWind); return; }
  // three hands up under you: one where you stand, two where you'd step
  const pts=[V(pp.x,floorY,pp.z)]; const side=V(_d.z,0,-_d.x);
  pts.push(V(pp.x+side.x*2.3,floorY,pp.z+side.z*2.3),V(pp.x-side.x*2.3+_d.x*1.2,floorY,pp.z-side.z*2.3+_d.z*1.2));
  B.atk={kind:'grasp',t:0,pts}; for(const p of pts)decal('grasp',p,T.graspR,T.graspWind,{hold:.35}); telegraph('grasp',pts[0],T.graspWind); snd('answer_hands',pts[0]);
}
function coolNext(){ const c=B.phase===3?T.coolP3:T.cool; return U.lerp(c[0],c[1],rnd()); }
function updateAttack(dt){
  const a=B.atk; if(!a)return; a.t+=dt;
  const pp=G.player.pos;
  if(a.kind==='sweep'){
    const w=T.sweepWind;
    if(a.t<w*.55){ _d.set(pp.x-seamP.x,0,pp.z-seamP.z); if(_d.lengthSq()>.01){ _d.normalize(); a.dir.lerp(_d,Math.min(1,dt*5)).normalize(); } }
    B.heading=Math.atan2(a.dir.x,a.dir.z);
    showCone(seamP,B.heading,T.sweepArc,T.sweepR,Math.min(1,a.t/w*1.4));
    if(a.t>=w&&!a.fired){ a.fired=true; snd('answer_glare',seamP); G.ui.shake&&G.ui.shake(.2);
      const dx=pp.x-seamP.x, dz=pp.z-seamP.z, d=Math.hypot(dx,dz), ang=Math.abs(U.angDiff(Math.atan2(dx,dz),B.heading));
      if(d<T.sweepR&&ang<T.sweepArc/2+.12&&Math.abs(pp.y-floorY)<2.4)G.combat.strike({x:pp.x,y:pp.y+.8,z:pp.z,radius:.6,team:'enemy',damage:T.sweepDmg,knockback:9,kind:'melee',source:ansHB}); }
    if(a.t>=w+.35){ coneDecal.visible=false; B.atk=null; B.cool=coolNext(); }
  }else if(a.kind==='grasp'){
    if(a.t>=T.graspWind&&!a.fired){ a.fired=true; const set=new Set();
      for(const p of a.pts){ G.combat.strike({x:p.x,y:floorY+.7,z:p.z,radius:T.graspR,team:'enemy',damage:T.graspDmg,knockback:6,kind:'melee',source:ansHB,exclude:set});
        const I=INK(); I&&I.burst(V(p.x,floorY+.2,p.z),{n:16,speed:2.6,size:[.3,1],life:[.4,1],up:2.4,embers:5,drops:6}); }
      G.ui.shake&&G.ui.shake(.15); }
    if(a.t>=T.graspWind+.5){ B.atk=null; B.cool=coolNext(); }
  }else if(a.kind==='glare'){
    B.glareK=Math.min(1,a.t/T.glareWind);
    if(a.t>=T.glareWind&&!a.fired){ a.fired=true;
      if(lightNear()&&Math.hypot(pp.x-seamP.x,pp.z-seamP.z)<T.glareR){ const d=V(pp.x-seamP.x,0,pp.z-seamP.z).normalize();
        G.combat.strike({x:pp.x,y:pp.y+.8,z:pp.z,radius:.6,team:'enemy',damage:T.glareDmg,knockback:10,kind:'melee',source:ansHB}); void d;
        G.ui.shake&&G.ui.shake(.35); G.emit('temple:glare',{hit:true}); }
      else G.emit('temple:glare',{hit:false}); }
    if(a.t>=T.glareWind+.5){ B.glareK=0; B.atk=null; B.cool=coolNext(); }
  }else if(a.kind==='pulse'){
    if(a.t>=T.pulseWind&&!a.fired){ a.fired=true; const d=Math.hypot(pp.x-seamP.x,pp.z-seamP.z);
      if(d<T.pulseR)G.combat.strike({x:pp.x,y:pp.y+.8,z:pp.z,radius:.6,team:'enemy',damage:T.pulseDmg,knockback:14,kind:'melee',source:ansHB}); G.ui.shake&&G.ui.shake(.2); }
    if(a.t>=T.pulseWind+.3){ B.atk=null; B.cool=coolNext(); }
  }
}

/* ---------------------------------------------------------------- hits */
function damage(d,info,pos,real){
  if(B.hp<=0)return;
  B.hp=Math.max(0,B.hp-d); B.flash=1; B.lastHitT=G.time;
  const F=FX(); if(F)F.splash(V(pos.x,pos.y,pos.z),(info&&info.dir)||V(0,0,1),.9);
  G.emit('temple:bossHit',{damage:d,hp:B.hp,real:!!real});
  if(B.phase===1&&B.hp<=T.p2)enterPhase(2);
  else if(B.phase===2&&B.hp<=T.p3)enterPhase(3);
}
function hitAnswer(info){
  if(B.state!=='fight'||B.phase<2||info.kind==='swarm')return;
  if(B.solid<.5){ // only glare: the blow goes through it
    B.glanceT=G.time; G.emit('temple:bossHit',{damage:0,hp:B.hp,glare:true});
    say('glareHit','Your staff goes through it like through a sunbeam. In the light it’s only glare.',null,{priority:'high'}); return; }
  if(B.phase===3){ say('p3hit','It hardly notices the staff now. It’s half back into the seam — the seam is what matters.',null,{priority:'high'}); B.flash=.4; return; }
  if(G.time-B.lastHitT<.12&&info.kind===B.lastKind)return; B.lastKind=info.kind;
  if(!S.said.solidHit)later(.3,()=>say('solidHit','In the dark it has weight. The staff lands, and the hollow in it flinches.',null,{priority:'high'}));
  damage(info.damage||1,info,V(ansHB.pos.x,floorY+2.2,ansHB.pos.z),true);
}

/* ---------------------------------------------------------------- the moths (phase 3): it pulls them in; Hesper catches some */
let eatAcc=0; const pulled=new Set(), shielded=new Set(); let ansPrey=null, hesPrey=null;
function mothsAll(){ const c=G.creatures; return (c&&c.moths)||[]; }
let shieldAcc=0;
function pullMoths(dt){
  shieldAcc=Math.min(2,shieldAcc+dt*T.shieldRate);   // she can only catch so many at once
  const ap=V(seamP.x,floorY+3.4,seamP.z), hp=V(B.hesper.at.x,floorY+1.3,B.hesper.at.z);
  ansHB.pos.set(seamP.x,floorY,seamP.z); seamHB.pos.set(seamP.x,floorY+2,seamP.z); shieldHB.pos.set(B.hesper.at.x,floorY,B.hesper.at.z);
  if(!ansPrey)ansPrey={key:seamHB,center:V(),alive:()=>B.state==='fight'&&B.phase===3,r:1.6};
  if(!hesPrey)hesPrey={key:shieldHB,center:V(),alive:()=>B.state==='fight'&&B.phase===3,r:1.4};
  ansPrey.center.copy(ap); hesPrey.center.copy(hp);
  for(const m of mothsAll()){
    if(shielded.has(m)){ if(m.tgt!=='hunt')shielded.delete(m); else m.prey=hesPrey; continue; }
    if(pulled.has(m)){ if(m.tgt!=='hunt'){ pulled.delete(m); continue; }
      if(m.prey&&m.prey.key!==seamHB&&m.prey.key!==shieldHB){ pulled.delete(m); continue; } m.prey=ansPrey;
      if(shieldAcc>=1&&m.p.distanceToSquared(hp)<T.shieldR*T.shieldR){ shieldAcc-=1; pulled.delete(m); shielded.add(m); m.prey=hesPrey; m.rad=.4+rnd()*.9; } continue; }
    if(m.tgt!=='lantern'&&m.tgt!=='hunt'&&m.tgt!=='wander')continue;
    if(m.tgt==='hunt'&&m.prey&&m.prey.key!==seamHB)continue;
    if(m.p.distanceToSquared(ap)>30*30)continue;
    m.tgt='hunt'; m.prey=ansPrey; m.rad=.3+rnd()*.6; m.hy=rnd()*.6; m.feedB=null; pulled.add(m);
  }
  eatAcc+=dt*T.eatRate;
  while(eatAcc>=1){ eatAcc-=1; let best=null,bd=2.2*2.2; for(const m of pulled){ const d=m.p.distanceToSquared(ap); if(d<bd){bd=d;best=m;} }
    if(!best){ eatAcc=0; break; } pulled.delete(best); if(G.moths&&G.moths.eat)G.moths.eat(best); else best.tgt='gone'; B.ate=(B.ate||0)+1; }
}
function releaseMoths(){ for(const set of [pulled,shielded])for(const m of set){ if(m.tgt==='hunt'){ m.prey=null; if(G.moths&&G.moths.baited&&G.moths.toLantern)G.moths.toLantern(m); else if(G.moths&&G.moths.release)G.moths.release(m); else m.tgt='wander'; } }
  pulled.clear(); shielded.clear(); eatAcc=0; }

/* ---------------------------------------------------------------- phases */
function enterPhase(n){
  B.phase=n; B.atk=null; clearDecals(); B.cool=n===2?3.2:2.6;
  G.emit('temple:bossPhase',{n,name:n===2?'answer':'sealing'});
  if(n===2){
    clearHands(); B.rise=0; B.glareT=4; B.underT=0;
    B.hesper.pose='stand'; B.hesper.at.copy(hesperAside());
    G.ui.shake&&G.ui.shake(.45); snd('answer_rise',seamP);
    later(1.2,()=>G.ui.say('Hesper takes her hands off the seam. What comes up out of it is tall and made of violet light, and where its heart should be there’s nothing at all. The light that was not light.',null,{priority:'high'}));
    later(4.2,()=>G.ui.toast&&G.ui.toast('The Answer','Shut your lantern: in the dark it has a body'));
  }else{
    B.seal=0; B.sealOn=false; B.hesper.pose='seal'; B.hesper.at.copy(hesperKneel());
    snd('answer_rise',seamP);
    later(.6,()=>G.ui.say('It opens, and the moths begin to stream toward it. Hesper throws her arms wide and catches the ones that come near her.',null,{priority:'high'}));
    later(3.4,()=>G.ui.toast&&G.ui.toast('The Sealing',lensOwned()?'Hold the Lens beam on the seam while she seals it':'Hold your light on the seam while she seals it'));
  }
}

/* ---------------------------------------------------------------- start / reset / leave */
function startFight(){
  build(); arenaGeo();
  B.state='intro'; B.st=0; B.phase=1; B.hp=T.hp; B.atk=null; B.rise=0; B.solid=0; B.seal=0; B.sealOn=false; B.hold=T.holdMax; B.inkR=T.inkR0;
  B.handT=T.handFirst; B.cool=2; B.underT=0; B.glareK=0; hesperHome();
  G.ui.bossBar('The Answer',1); music(true);
  if(!B.started){ B.started=true; G.emit('temple:bossStart',{}); }
  snd('answer_hands',seamP);
  later(.4,()=>say('bossSeen','Under her hands the violet floor bulges, like something pressing its face against a sheet.',null,{priority:'high'}));
  later(3,()=>G.ui.toast&&G.ui.toast('The Hands',lensOwned()?'Burn their ink skins with the beam, then strike · keep them off Hesper':'Strike them down · keep them off Hesper'));
}
function resetFight(why){
  if(!B.built)return;
  B.state='dormant'; B.started=false; B.phase=1; B.hp=T.hp; B.atk=null; B.rise=0; B.solid=0; B.outT=0; B.seal=0; B.sealOn=false; B.hold=T.holdMax; B.inkR=T.inkR0;
  clearHands(); clearDecals(); releaseMoths(); hesperHome();
  if(ans)ans.g.visible=false; G.ui.bossBar(null); music(false);
  G.emit('temple:bossReset',{why});
}

/* ---------------------------------------------------------------- per-frame */
function updateAnswer(dt){
  const P=G.player, pp=P.pos;
  B.st+=dt; B.cool-=dt; B.glareT-=dt; B.flash=Math.max(0,B.flash-dt*4);
  if(B.state==='intro'){ if(B.st>1.5){ B.state='fight'; B.st=0; } return; }
  if(P.alive===false)return;
  if(B.phase===1){ updateHands(dt); return; }
  B.rise=Math.min(1,B.rise+dt*.55);
  ansHB.pos.set(seamP.x,floorY,seamP.z);
  // solid only in the dark (the Gloaming inverted): your lantern shut, the beam off
  const want=lightNear()?0:1; B.solid=U.damp(B.solid,want,want?5:9,dt);
  if(B.rise<1)return;
  const d=Math.hypot(pp.x-seamP.x,pp.z-seamP.z);
  if(B.phase===2){ B.underT=d<T.pulseR-.6?B.underT+dt:Math.max(0,B.underT-dt*2); }
  if(B.phase===3){
    pullMoths(dt);
    const on=beamOn(V(seamP.x,floorY+.4,seamP.z),T.seamR)||beamOn(V(seamP.x,floorY+1.6,seamP.z),T.seamR);
    if(on!==B.sealOn){ B.sealOn=on; G.emit('temple:seal',{k:B.seal,on}); }
    B.seal=U.clamp(B.seal+(on?dt/T.sealNeed:-dt*T.sealDecay),0,1);
    B.hp=T.p3*(1-B.seal);
    if(B.seal>=1){ startDying(); return; }
  }
  if(!B.atk){ B.heading+=U.angDiff(Math.atan2(pp.x-seamP.x,pp.z-seamP.z),B.heading)*Math.min(1,dt*2); if(B.cool<=0)chooseAttack(); }
  updateAttack(dt);
}
const _q=V();
function render(dt){
  if(!B.built)return;
  const t=G.time, M=mats();
  M.body.uniforms.uTime.value=t;
  // the seam's glow and the ring of ink (phase 1 shows Hesper losing ground)
  const fightOn=B.state==='intro'||B.state==='fight'||B.state==='dying';
  inkRing.visible=fightOn&&B.phase===1&&B.inkR>T.inkR0+.05;
  if(inkRing.visible){ inkRing.position.set(seamP.x,floorY+.04,seamP.z); inkRing.scale.set(B.inkR,1,B.inkR); inkRing.rotation.y=t*.03; }
  seamGlow.visible=!TP()&&(fightOn||(!S.defeated&&inside()));   // temple.js draws the seam itself (setSeam)
  seamTo(S.defeated?0:B.state==='dying'?0:B.phase===3&&fightOn?1-.6*B.seal:1);
  if(seamGlow.visible){ const k=B.state==='dying'?Math.max(0,1-B.deadT/3):1; seamGlow.position.set(seamP.x,floorY+.05,seamP.z);
    const r=2.6+Math.sin(t*1.7)*.2+(B.phase===3?B.seal*1.2:0); seamGlow.scale.set(r,1,r); M.seam.opacity=(.35+.15*Math.sin(t*2.3)+(B.sealOn?.35:0))*k; M.seam.color.set(B.sealOn?'#e9dcff':'#9a6cff'); }
  renderHands(dt);
  // the Answer
  const show=(B.phase>=2&&(B.state==='fight'||B.state==='dying'));
  ans.g.visible=show;
  if(show){
    const g=ans.g, k=B.state==='dying'?Math.max(0,1-B.deadT/3.2):U.smooth(0,1,B.rise);
    g.position.set(seamP.x,floorY-(1-k)*5.6,seamP.z); g.rotation.y=B.heading;
    g.scale.set(1+(1-k)*.3,1,1+(1-k)*.3);
    const U_=M.body.uniforms; U_.uSolid.value=B.solid; U_.uFade.value=Math.max(.0,k); U_.uFlash.value=B.flash*.6; U_.uGlare.value=(B.glareK||0)*1.4; U_.uBase.value=floorY-.6;
    const a=B.atk, wind=a&&!a.fired?Math.min(1,a.t/(a.kind==='sweep'?T.sweepWind:a.kind==='grasp'?T.graspWind:a.kind==='glare'?T.glareWind:T.pulseWind)):0;
    for(const arm of ans.arms){
      let rx=-.25+Math.sin(t*.9+arm.s)*.1, rz=arm.s*.12, ry=0;
      if(a&&a.kind==='sweep'){ if(!a.fired){ rx=-1.2*wind; rz=arm.s*(arm.s>0?1.3:.4)*wind; ry=-arm.s*.4*wind; } else { rx=-1.1; rz=arm.s*-.6; ry=arm.s*.9; } }
      else if(a&&a.kind==='grasp'){ rx=-.5-.7*wind; rz=arm.s*.5*wind; }
      else if(a&&(a.kind==='glare'||a.kind==='pulse')){ rx=-.8*wind; rz=arm.s*1.6*wind; }
      else if(B.phase===3){ rx=-.9+Math.sin(t*2+arm.s)*.15; rz=arm.s*.9; }
      arm.sh.rotation.x=U.damp(arm.sh.rotation.x,rx,a&&a.fired?20:6,dt); arm.sh.rotation.z=U.damp(arm.sh.rotation.z,rz,a&&a.fired?20:6,dt); arm.sh.rotation.y=U.damp(arm.sh.rotation.y,ry,a&&a.fired?20:6,dt);
    }
    ans.body.rotation.y=Math.sin(t*.4)*.1; ans.inner.rotation.y=-t*.3;
    ans.hollow.scale.set(1.1+.15*Math.sin(t*1.3)+(B.phase===3?.5:0),1.4+.15*Math.sin(t*1.1),1);
    M.hollow.opacity=k*(.6+.4*B.solid);
    M.glow.opacity=k*(.12+.22*(1-B.solid)+(B.glareK||0)*.6); ans.glow.scale.set(7+(B.glareK||0)*6,9+(B.glareK||0)*5,1);
    ans.light.intensity=k*(1.2+1.4*B.solid+(B.glareK||0)*3+B.flash);
  }
}

function seamTo(k){ const t=TP(); if(t&&t.setSeam&&t.seam!==k){ try{ t.setSeam(k); }catch(e){} } }
/* ---------------------------------------------------------------- dying + defeat */
function startDying(){
  B.state='dying'; B.st=0; B.deadT=0; B.atk=null; clearDecals(); releaseMoths(); clearHands();
  B.seal=1; B.hp=0; G.ui.bossBar('The Answer',0); G.ui.shake&&G.ui.shake(.6); music(false);
  snd('seam_close',seamP); G.emit('temple:bossDying',{});
  G.ui.say('The seam takes it back. The light folds down into the floor like a sheet pulled through a crack, and the crack closes on it.',null,{priority:'high'});
}
function updateDying(dt){
  B.deadT+=dt;
  if(B.deadT<3.2&&rnd()<dt*25){ const a=rnd()*TAU, I=INK(); I&&I.burst(V(seamP.x+Math.cos(a)*1.2,floorY+.3+rnd()*3,seamP.z+Math.sin(a)*1.2),{n:3,speed:1.5,size:[.3,.8],life:[.4,.9],up:-1,embers:4,drops:0}); }
  if(B.deadT>=3.6&&B.state==='dying')onDefeated(false);
}
function onDefeated(restored){
  S.defeated=true; B.state='dead'; G.flag('answerDead',true);
  G.ui.bossBar(null); music(false); releaseMoths(); clearHands(); clearDecals();
  if(!B.built)build(); arenaGeo();
  if(ans)ans.g.visible=false; if(inkRing)inkRing.visible=false; if(seamGlow)seamGlow.visible=false; seamTo(0);
  B.hesper.pose='free'; B.hesper.at.copy(hesperKneel());
  G.emit('temple:bossDead',{pos:seamP.clone(),restored:!!restored});
  if(restored)return;
  G.emit('monster:killed',{kind:'answer',pos:seamP.clone(),boss:true});
  later(5,grantSecond);
  try{ G.flow&&G.flow.writeSave&&later(8,()=>{ if(isPlay())G.flow.writeSave(); }); }catch(e){}
}
/* the second reward (my call): the Lens ground true — a longer beam — when lens.js can take it; ether for the lamp if not */
function grantSecond(){
  if(S.reward)return;
  const Ls=G.lens; let lens=false;
  try{ if(Ls){ if(typeof Ls.upgrade==='function'){ lens=Ls.upgrade('long')!==false; } else if(Ls.beam&&'length' in Ls.beam&&('range' in Ls||'maxLength' in Ls)){ if('range' in Ls)Ls.range=Math.max(Ls.range||14,20); else Ls.maxLength=Math.max(Ls.maxLength||14,20); lens=true; } } }catch(e){ console.error('lens upgrade',e); }
  S.reward=lens?'lens':'ether';
  if(!lens){ try{ if(G.lamp&&G.lamp.feed)G.lamp.feed(30); }catch(e){} }
  try{ G.progress&&G.progress.reward&&G.progress.reward(lens?{id:'lensLong',icon:'mark',name:'The Lens, ground true',eyebrow:'The Answer',desc:'Where the seam closed, the floor is warm, and the Lens comes out of the light clearer than it went in. The beam reaches further.',sub:'A longer beam'}
    :{id:'vigilEther',icon:'mark',name:'What the Vigil took',eyebrow:'The Answer',desc:'Where the seam closed, a little light the old islanders gave it comes back up through the stone, and goes home to the lamp.',sub:'+30 ether in the lamp'}); }catch(e){ console.error(e); }
}

/* ---------------------------------------------------------------- the fight's frame */
function inArena(p,r){ return Math.hypot(p.x-C.x,p.z-C.z)<r&&Math.abs(p.y-floorY)<5; }
function peopleReady(){ const tp=G.templePeople; return !tp||tp.met!==false; }
function updateBoss(dt){
  if(S.defeated){ if(B.state==='dying'){ updateDying(dt); render(dt); } return; }
  if(B.state==='dying'){ updateDying(dt); render(dt); return; }
  if(!inside()){ if(B.state!=='dormant')resetFight('left'); if(B.built){ if(seamGlow)seamGlow.visible=false; } return; }
  if(!B.built)build(); else if(B.state==='dormant')arenaGeo();
  const P=G.player, pp=P&&P.pos; if(!pp)return;
  if(B.state==='dormant'){ render(dt); if(isPlay()&&P.alive!==false&&inArena(pp,T.startR)&&peopleReady()&&!B.noStart)startFight(); else return; }
  if(!inArena(pp,T.leaveR)&&P.alive!==false){ B.outT+=dt; if(B.outT>2.5){ resetFight('left'); return; } } else B.outT=0;
  if(isPlay())updateAnswer(dt);
  updateDecals(dt);
  render(dt);
  if(B.state==='fight'||B.state==='intro')G.ui.bossBar('The Answer',B.hp/T.hp);
}
/* player death: the fight stops; on rising, it resets cleanly and you stand at the sanctum door */
G.on('player:dead',()=>{ if(!B.built||S.defeated||B.state==='dormant')return; B.atk=null; clearDecals();
  try{ if(G.state.checkpoint&&G.state.checkpoint.copy){ G.state.checkpoint.copy(door); G.state.checkpointName='the door of the sanctum'; } }catch(e){} B.diedHere=true; });
G.on('player:respawn',()=>{
  if(!B.built||S.defeated||!B.diedHere)return; B.diedHere=false;
  resetFight('death');
  later(.02,()=>{ const P=G.player; if(!P||!P.teleport||!inside())return; if(Math.hypot(P.pos.x-door.x,P.pos.z-door.z)>2.5){ const yaw=Math.atan2(C.x-door.x,C.z-door.z); P.teleport(door.x,door.y,door.z,yaw); } });
});

/* ---------------------------------------------------------------- objective while in the sanctum */
let objT=0, objKey='';
function updateObjective(dt){
  if(!inside()||!G.quest){ objKey=''; return; }
  objT-=dt; if(objT>0)return; objT=.5;
  if(S.defeated||B.state==='dormant')return;
  const lens=lensOwned();
  const g=B.phase===1?['The Hands',lens?'Burn the ink skins with the beam, then strike · keep them off Hesper':'Strike the hands down · keep them off Hesper']
    :B.phase===2?['The Answer',lightNear()?'Shut your lantern: in the light it’s only glare':'In the dark it has a body · strike, and mind its reach']
    :['The Sealing',(B.sealOn?'Hold it there':'Hold the beam on the seam')+' · '+Math.round(B.seal*100)+'%'];
  const key=g[0]+'|'+g[1]; if(key===objKey)return; objKey=key;
  G.quest.set('temple:boss',g[0],g[1],null,'');
}

/* =====================================================================
   3. TEST STUB (debug only): until temple.js exists, flat floors for the rooms so the fight can be exercised.
      Never on in a real game: only G.templeBoss.debug.stub(true) turns it on, and only while G.temple is absent.
   ===================================================================== */
let stubOn=false;
function stubFloor(x,z,y){ if(!stubOn||TP())return null; const l=toLocal(V(x,0,z));
  for(const id in LOCAL){ const f=LOCAL[id], ok=f.box?(l.x>f.box[0]&&l.x<f.box[1]&&l.z>f.box[2]&&l.z<f.box[3]):Math.hypot(l.x-f.c[0],l.z-f.c[2])<f.r+(id==='sanctum'?3:0);
    if(ok&&y>=origin().y+f.c[1]-3)return origin().y+f.c[1]; }
  return null; }
function enableStub(on){
  stubOn=!!on;
  if(stubOn&&!enableStub.done){ enableStub.done=true; G.floorProviders.push(stubFloor);
    (G.walkOverrides||[]).push((x,z)=>stubOn&&!TP()&&stubFloor(x,z,1e9)!=null?true:null); }
  if(stubOn&&!TP()&&!G.interior)G.interior={id:'templeStub',contains:(x,z)=>stubOn&&Math.abs(z-origin().z+55)<75&&Math.abs(x-origin().x)<45};
  if(!stubOn&&G.interior&&G.interior.id==='templeStub')G.interior=null;
}

/* =====================================================================
   4. SAVE / LOAD, SYSTEM, API
   ===================================================================== */
function save(){ return {v:1,defeated:S.defeated,reward:S.reward,said:Object.keys(S.said)}; }
function load(d){
  if(!d)return;
  S.reward=d.reward||null; S.said={}; for(const k of d.said||[])S.said[k]=1;
  if(d.defeated&&!S.defeated){ try{ build(); onDefeated(true); }catch(e){console.error(e);} }
}
if(G.persist&&G.persist.register)G.persist.register('templeBoss',{save,load});
else G.on('ready',()=>{ if(G.persist&&G.persist.register)G.persist.register('templeBoss',{save,load}); });

G.system('templeBoss',{order:43,modes:['play','dead'],
  update(dt){
    try{
      runBeats();
      if(!G.monsters)return;
      updateRooms(dt);
      if(isPlay())updateShutterFallback();
      updateBoss(dt);
      updateObjective(dt);
      if(stubOn&&!TP()&&inside()){ G.atmo.darkTarget=Math.max(G.atmo.darkTarget||0,.7); }
    }catch(e){ if(!this._err){console.error('templeBoss',e);this._err=1;} }
  }
});

G.templeBoss={
  get state(){return B.state;}, get phase(){return B.phase;}, get hp(){return B.hp;}, maxHp:T.hp, get defeated(){return S.defeated;},
  get fighting(){return B.state==='fight'||B.state==='intro';}, get seal(){return B.seal;}, get solid(){return B.solid;}, get hold(){return B.hold;},
  get hesper(){return B.hesper;}, get room(){return curRoom;}, get eaten(){return B.ate||0;}, get reward(){return S.reward;},
  hands, monsters:mine, packs:PACKS, T, anchor, roomOf, inside, W,
  debug:G.debug?{S,B,save,load,stub:enableStub,
    /** stand in a room (uses G.temple.enter when it exists, else the test stub) */
    enter(room){ if(!(G.loop&&G.loop.active)&&G.debugStartLoop)G.debugStartLoop();
      if(G.state.mode==='title'){ const t=document.getElementById('title'); if(t)t.hidden=true; G.setMode('play'); }
      const t=TP(); room=room||'sanctum';
      if(t&&t.enter){ t.enter(room,{instant:true}); G.step&&G.step(1/30,2);
        if(room==='sanctum'){ arenaGeo(); const k=3/Math.max(1,Math.hypot(door.x-C.x,door.z-C.z)), x=door.x+(C.x-door.x)*k, z=door.z+(C.z-door.z)*k; G.player.teleport(x,floorAt(x,z,door.y+2),z,Math.atan2(C.x-x,C.z-z)); }
        else if(roomOf(G.player.pos)!==room){ const c=roomCentre(room), p=G.player.pos, k=Math.min(1,6/Math.max(1,Math.hypot(c.x-p.x,c.z-p.z))), x=p.x+(c.x-p.x)*k, z=p.z+(c.z-p.z)*k; G.player.teleport(x,floorAt(x,z,c.y+2),z,Math.atan2(c.x-x,c.z-z)); } }
      else { enableStub(true); arenaGeo(); const p=room==='sanctum'?door.clone():roomCentre(room); G.player.teleport(p.x,p.y+.2,p.z,room==='sanctum'?Math.atan2(C.x-p.x,C.z-p.z):PI); }
      arenaGeo(); return roomOf(G.player.pos); },
    start(){ build(); arenaGeo(); if(G.templePeople&&G.templePeople.debug)G.templePeople.debug.meet(); G.player.teleport(C.x,floorY+.2,C.z+8,PI); startFight(); B.state='fight'; return B.state; },
    phase(n){ if(B.state==='dormant')this.start(); if(n>=2&&B.phase<2){ B.hp=T.p2; enterPhase(2); } if(n>=3&&B.phase<3){ B.hp=T.p3; enterPhase(3); } B.rise=1; return B.phase; },
    hold(on){ B.noAtk=on!==false; if(B.noAtk){ B.cool=1e9; B.handT=1e9; } else { B.cool=1; B.handT=1; } return B.noAtk; },
    noStart(on){ B.noStart=on!==false; return B.noStart; },
    spawnHand, burnHand, breakHand, attack(k){ B.cool=99; const pp=G.player.pos; _d.set(pp.x-seamP.x,0,pp.z-seamP.z).normalize();
      if(k==='sweep')B.atk={kind:'sweep',t:0,dir:_d.clone()}; else if(k==='grasp')chooseAttackKind('grasp');
      else if(k==='glare'){ B.atk={kind:'glare',t:0}; decal('glare',seamP,6,T.glareWind); } else if(k==='pulse'){ B.atk={kind:'pulse',t:0}; decal('pulse',seamP,T.pulseR,T.pulseWind); }
      return B.atk&&B.atk.kind; },
    kill(){ if(B.state==='dormant')this.start(); if(B.phase<3)this.phase(3); startDying(); return B.state; },
    beamOn, lightOpen, centre:()=>C.clone(), seam:()=>seamP.clone(), door:()=>door.clone(), floorY:()=>floorY, spawnPack, clearMine, reset:()=>resetFight('debug'),
    restore(){ S.defeated=false; S.reward=null; B.state='dormant'; B.deadT=0; },
    grantSecond}:null
};
function chooseAttackKind(kind){ // debug: force one kind through the normal chooser's shapes
  const pp=G.player.pos; _d.set(pp.x-seamP.x,0,pp.z-seamP.z); if(_d.lengthSq()<.01)_d.set(0,0,1); _d.normalize();
  if(kind==='grasp'){ const side=V(_d.z,0,-_d.x), pts=[V(pp.x,floorY,pp.z),V(pp.x+side.x*2.3,floorY,pp.z+side.z*2.3),V(pp.x-side.x*2.3,floorY,pp.z-side.z*2.3)];
    B.atk={kind:'grasp',t:0,pts}; for(const p of pts)decal('grasp',p,T.graspR,T.graspWind,{hold:.35}); }
}
})();
