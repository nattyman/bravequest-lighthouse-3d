/* =====================================================================
   temple_people.js — Hesper Halloran and the Vigil's people (Boss agent; spec: TEMPLE.md)
   - Hesper in the sanctum: half ink, kneeling with both hands on the first seam. She knows Rowan at once (the talk card,
     "You're late, Tide."), says what the seam is and that she can't let go; then the fight (temple_boss.js) starts.
   - her warnings during the fight: captions (never cards), from the boss's events
   - the ending: when it's calm after the seam closes, a card (the ink goes back out of her, all but a mark on one hand);
     the Glass shows the carving on the back wall (an island to the north with a tower; nobody explains it — she only asks
     "Who's keeping the other one?"); then she goes home and keeps the light: an NPC in the lamp room with loop lines
   - Halloran's one-time reunion lines (G.creatures.halloranHooks) · Hesper's five temple pages (author "Hesper")
   - Wren at the hamlet well: a talk about Hesper that tells Rowan about the temple and marks it (temple:unlock). Wren's own
     card (undercroft_people.js) has no way to add a choice from outside, so this is a separate interaction beside her,
     "Ask Wren about Hesper", until it's been asked. Saves from before this version, with Wren already saved, get the marker on load.
   - portraits: 'hesper-ink' (half ink, the seam's violet under her); 'hesper' (calm) only if portraits.js has none
   API: G.templePeople = {state, met, freed, home, hesper, talk(), pages, debug}
   Events (emits): temple:hesper {state:'found'|'freed'|'home'} · temple:unlock {restored?} · temple:page {id} · temple:carving {}
   Listens: temple:bossStart/Phase/Dead/Reset/Telegraph/Hit · temple:hand · temple:hesperHold · temple:seal · temple:glare
   Persist key 'templePeople'.
   ===================================================================== */
(function(){
'use strict';
const G=window.G, THREE=G.THREE, U=G.U, PI=Math.PI, TAU=PI*2;
const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const isPlay=()=>G.state.mode==='play';
const P=()=>G.player;
const LM=()=>(G.world&&G.world.landmarks)||{};
const TP=()=>G.temple||null;
const TB=()=>G.templeBoss||null;

/* ---------------------------------------------------------------- frame (G.temple, else O + local; same as temple_boss.js) */
const O_FALL=V(-800,60,0);
const origin=()=>{ const t=TP(); return t&&t.origin&&t.origin.isVector3?t.origin:O_FALL; };
function W(x,y,z){ const t=TP(); if(t&&t.toWorld){ try{ const v=t.toWorld(x,y,z); if(v&&isFinite(v.x))return V(v.x,v.y,v.z); }catch(e){} } const o=origin(); return V(o.x+x,o.y+y,o.z+z); }
function anchor(room,name){ const b=TB(); if(b&&b.anchor)return b.anchor(room,name); return null; }
function inside(){ const t=TP(); if(t&&'inside' in t)return !!t.inside; const b=TB(); return !!(b&&b.inside&&b.inside()); }
function roomOf(p){ const t=TP(); if(t&&t.room){ try{ return t.room(p); }catch(e){} } const b=TB(); return b&&b.roomOf?b.roomOf(p):null; }
const floorAt=(x,z,y)=>{ const f=G.floorAt(x,z,y); return isFinite(f)?f:y-1; };

/* ---------------------------------------------------------------- state (persisted) */
const S={v:1,met:false,freed:false,home:false,ending:false,carving:false,pages:{},wrenAsked:false,unlocked:false,hal:{},homeTalks:0,heardNorth:false,heardStay:false,said:{}};
function save(){ return JSON.parse(JSON.stringify(S)); }
let loadedNow=false;
function load(d){ if(!d)return; loadedNow=true; for(const k in S){ if(k in d)S[k]=d[k]; } S.pages=Object.assign({},d.pages||{}); S.hal=Object.assign({},d.hal||{}); S.said=Object.assign({},d.said||{});
  if(S.freed)S.home=true;                 // saved after the seam closed: she went home
  if(S.ending&&!S.freed){ S.freed=true; S.home=true; }
  applyLoaded(); }
if(G.persist&&G.persist.register)G.persist.register('templePeople',{save,load});
else G.on('ready',()=>{ if(G.persist&&G.persist.register)G.persist.register('templePeople',{save,load}); });

/* small timers on game time (a paused game waits) */
const pend=[];
function later(s,fn){ pend.push({t:s,fn}); }
function updateLater(dt){ for(let i=pend.length-1;i>=0;i--){ const p=pend[i]; p.t-=dt; if(p.t<=0){ pend.splice(i,1); try{p.fn();}catch(e){console.error('templePeople later',e);} } } }

/* ---------------------------------------------------------------- portraits */
function bg(g,w,h,top,bot){ const gr=g.createLinearGradient(0,0,0,h); gr.addColorStop(0,top); gr.addColorStop(1,bot); g.fillStyle=gr; g.fillRect(0,0,w,h); }
function rim(g,w,h){ g.strokeStyle='rgba(233,220,192,.35)'; g.lineWidth=3; g.beginPath(); g.ellipse(w/2,h/2,w/2-3,h/2-3,0,0,TAU); g.stroke(); }
function glow(g,x,y,r,a,b){ const e=g.createRadialGradient(x,y,0,x,y,r); e.addColorStop(0,a); e.addColorStop(1,b); g.fillStyle=e; g.beginPath(); g.arc(x,y,r,0,TAU); g.fill(); }
function rng(seed){ let s=seed>>>0; return ()=>{ s=(s*1664525+1013904223)>>>0; return s/4294967296; }; }
/* Hesper: the keeper's coat, dark hair tied back with strands loose, a steady look straight at you. ink: half of her gone to
   ink from the hands up — her right side (our left) to the jaw — with the seam's violet light coming up from under her. */
function hesperFace(g,w,h,glass,ink){
  bg(g,w,h,ink?(glass?'#4a3664':'#2c2440'):(glass?'#4e4466':'#3a3a52'),ink?'#0e0a16':'#15121c');
  const cx=w/2, hy=h*.41, hr=w*.205;
  if(ink)glow(g,cx,h*1.05,w*.75,'rgba(150,90,255,.7)','rgba(150,90,255,0)');
  else glow(g,cx+w*.3,h*.2,w*.5,'rgba(255,214,150,.25)','rgba(255,214,150,0)');   // the lamp, behind her
  // the coat: keeper's blue, a turned collar, brass buttons
  g.fillStyle='#2f3a4e'; g.beginPath(); g.ellipse(cx,h*1.04,w*.47,h*.35,0,PI,TAU); g.fill();
  g.fillStyle='#232d40'; g.beginPath(); g.moveTo(cx-w*.2,h*.72); g.lineTo(cx-w*.05,h*.7); g.lineTo(cx,h*.82); g.lineTo(cx+w*.05,h*.7); g.lineTo(cx+w*.2,h*.72); g.lineTo(cx+w*.16,h*.8); g.lineTo(cx,h*.9); g.lineTo(cx-w*.16,h*.8); g.closePath(); g.fill();
  g.fillStyle='#c8a24c'; for(const y of [.86,.94])for(const s of [-1,1]){ g.beginPath(); g.arc(cx+s*w*.075,h*y,2.3,0,TAU); g.fill(); }
  // hair: dark, pulled back, loose at the temples
  g.fillStyle='#2a2026'; g.beginPath(); g.ellipse(cx,hy-hr*.15,hr*1.15,hr*1.3,0,0,TAU); g.fill();
  g.beginPath(); g.ellipse(cx+hr*.9,hy-hr*.75,hr*.42,hr*.36,.5,0,TAU); g.fill();       // the knot at the back
  // neck, face
  g.fillStyle='#c4a898'; g.fillRect(cx-hr*.32,hy+hr*.8,hr*.64,hr*.6);
  g.fillStyle='#cdb3a6'; g.beginPath(); g.ellipse(cx,hy+hr*.05,hr*.88,hr*1.08,0,0,TAU); g.fill();
  g.fillStyle='rgba(196,110,100,.22)'; for(const s of [-1,1]){ g.beginPath(); g.arc(cx+s*hr*.5,hy+hr*.38,hr*.22,0,TAU); g.fill(); }
  g.fillStyle='#2a2026'; g.beginPath(); g.moveTo(cx-hr*.95,hy-hr*.55); g.quadraticCurveTo(cx-hr*.1,hy-hr*.95,cx+hr*.95,hy-hr*.5); g.quadraticCurveTo(cx+hr*.4,hy-hr*1.25,cx-hr*.95,hy-hr*.55); g.fill();
  g.strokeStyle='#2a2026'; g.lineWidth=1.6; for(const s of [-1,1]){ g.beginPath(); g.moveTo(cx+s*hr*.82,hy-hr*.45); g.quadraticCurveTo(cx+s*hr*1.02,hy+hr*.3,cx+s*hr*.78,hy+hr*.95); g.stroke(); }
  // eyes open, on you; straight brows; a mouth that might be about to say something dry
  for(const s of [-1,1]){ const ex=cx+s*hr*.37, ey=hy-hr*.02;
    g.fillStyle='#efe4d8'; g.beginPath(); g.ellipse(ex,ey,hr*.15,hr*.085,0,0,TAU); g.fill();
    g.fillStyle='#4a5a50'; g.beginPath(); g.arc(ex,ey+.5,hr*.075,0,TAU); g.fill();
    g.fillStyle='#120c10'; g.beginPath(); g.arc(ex,ey+.5,hr*.035,0,TAU); g.fill();
    g.fillStyle='rgba(255,255,255,.8)'; g.beginPath(); g.arc(ex-1.2,ey-1,1.2,0,TAU); g.fill();
    g.strokeStyle='#2a1c22'; g.lineWidth=1.5; g.beginPath(); g.moveTo(ex-hr*.16,ey-hr*.05); g.quadraticCurveTo(ex,ey-hr*.12,ex+hr*.16,ey-hr*.05); g.stroke();
    g.strokeStyle='#2a2026'; g.lineWidth=2.4; g.beginPath(); g.moveTo(ex-hr*.19,ey-hr*.25); g.lineTo(ex+hr*.19,ey-hr*.24-s*.8); g.stroke(); }
  g.strokeStyle='#9a6460'; g.lineWidth=1.7; g.beginPath(); g.moveTo(cx-hr*.2,hy+hr*.6); g.quadraticCurveTo(cx+hr*.02,hy+hr*.64,cx+hr*.22,hy+hr*.56); g.stroke();
  if(ink){
    // the ink: up from the bottom on her right side (our left) to the jaw and the cheek, a violet rim at its edge
    const R=rng(41);
    g.save(); g.beginPath();
    g.moveTo(0,h); g.lineTo(0,hy+hr*.2); g.bezierCurveTo(cx-hr*1.2,hy+hr*.1,cx-hr*.55,hy+hr*.35,cx-hr*.45,hy+hr*.75);
    g.bezierCurveTo(cx-hr*.2,hy+hr*1.2,cx-hr*.05,h*.72,cx+w*.04,h*.8); g.bezierCurveTo(cx+w*.1,h*.88,cx+w*.02,h*.95,cx+w*.08,h); g.closePath();
    g.fillStyle='#0b080e'; g.fill(); g.strokeStyle='rgba(176,130,255,.85)'; g.lineWidth=2; g.stroke(); g.restore();
    for(let i=0;i<8;i++){ const x=cx-hr*(.5+R()*1.4), y=hy+hr*(.1+R()*2.8), r=2.5+R()*6;
      g.fillStyle='rgba(11,8,14,'+(.4+R()*.4).toFixed(2)+')'; g.beginPath(); g.ellipse(x,y-r,r*.55,r*1.3,R()-.5,0,TAU); g.fill(); }
    glow(g,cx,hy+hr*1.4,hr*1.4,'rgba(190,150,255,.28)','rgba(190,150,255,0)');   // the seam's light under her chin
  }else{
    // her left hand raised at the collar: the mark across the back of it
    const hx=cx+w*.18, hy2=h*.83;
    g.fillStyle='#cdb3a6'; g.beginPath(); g.ellipse(hx,hy2,w*.07,h*.045,-.4,0,TAU); g.fill();
    g.fillStyle='#0b080e'; g.beginPath(); g.moveTo(hx-w*.045,hy2+h*.01); g.quadraticCurveTo(hx-w*.01,hy2-h*.04,hx+w*.04,hy2-h*.02); g.quadraticCurveTo(hx+w*.01,hy2+h*.005,hx-w*.045,hy2+h*.01); g.fill();
    g.strokeStyle='rgba(176,130,255,.6)'; g.lineWidth=1; g.stroke();
  }
  if(glass){ g.fillStyle='rgba(255,200,140,.12)'; g.beginPath(); g.ellipse(cx,hy,hr*1.4,hr*1.6,0,0,TAU); g.fill(); }
  rim(g,w,h);
}
const hesperInk=(g,w,h,glass)=>hesperFace(g,w,h,glass,true);
const hesperCalm=(g,w,h,glass)=>hesperFace(g,w,h,glass,false);
function registerPortraits(){
  const Pt=G.portraits; if(!Pt)return;
  if(!Pt.get('hesper-ink'))Pt.add('hesper-ink',hesperInk,{title:'At the seam',names:[]});
  if(!Pt.get('hesper'))Pt.add('hesper',hesperCalm,{title:'Keeper of the light',names:[/^hesper$/i]});
}
registerPortraits();
const inkPortrait=()=>'hesper-ink';
const calmPortrait=()=>(G.portraits&&G.portraits.get('hesper'))?'hesper':hesperCalm;

/* ---------------------------------------------------------------- Hesper's figure */
let MAT=null;
function mats(){
  if(MAT)return MAT;
  const F=G.monsters&&G.monsters.fx, inkS=F?F.sharedUniforms('#a37cff',1.9,'#140a20',.55):null;
  MAT={coat:G.toon('#2f3a4e',{emissive:'#0a0d14'}),coatDark:G.toon('#232d40'),skin:G.toon('#cdb3a6',{emissive:'#1a1210'}),hair:G.toon('#2a2026'),
    boot:G.toon('#2a201c'),brass:G.toon('#c8a24c',{emissive:'#2a1e08'}),trousers:G.toon('#3a3430'),scarf:G.toon('#6a3a46'),
    mark:new THREE.MeshBasicMaterial({color:0x0b080e}),
    inkS, ink:F?F.inkMat(inkS,{amp:.025,wisp:.35,flow:.4,scale:3,rimK:1.1}):G.toon('#0b080e'),
    under:new THREE.SpriteMaterial({map:G.tex.soft,color:U.col('#a070ff'),transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending})};
  return MAT;
}
function addM(parent,geo,mat,x=0,y=0,z=0){ const m=new THREE.Mesh(geo,mat); m.position.set(x,y,z); parent.add(m); m.castShadow=true; return m; }
function buildHesper(name){
  const M=mats(), root=new THREE.Group(); root.name=name||'hesper';
  const hips=new THREE.Group(); hips.position.y=.95; root.add(hips);
  // coat skirt from the waist to the knee
  const skirt=addM(hips,new THREE.LatheGeometry([[.19,.06],[.23,-.2],[.29,-.5],[.32,-.6]].map(([r,y])=>new THREE.Vector2(r,y)),16),M.coat); skirt.material.side=THREE.DoubleSide;
  if(G.outline)G.outline(skirt,{thickness:.012});
  const legs=[];
  for(const s of [-1,1]){ const th=new THREE.Group(); th.position.set(s*.1,0,0); hips.add(th);
    addM(th,new THREE.CylinderGeometry(.075,.065,.46,8),M.trousers,0,-.23,0);
    const kn=new THREE.Group(); kn.position.y=-.46; th.add(kn);
    addM(kn,new THREE.CylinderGeometry(.062,.05,.44,8),M.trousers,0,-.22,0);
    addM(kn,new THREE.BoxGeometry(.1,.08,.22),M.boot,0,-.46,.04);
    legs.push({th,kn,s}); }
  const torso=new THREE.Group(); hips.add(torso);
  const chest=addM(torso,new THREE.CylinderGeometry(.17,.2,.52,12),M.coat,0,.26,0); if(G.outline)G.outline(chest,{thickness:.012});
  for(let i=0;i<3;i++)addM(torso,new THREE.SphereGeometry(.018,6,5),M.brass,0,.12+i*.14,.19);
  addM(torso,new THREE.TorusGeometry(.12,.04,6,14),M.scarf,0,.53,0).rotation.x=PI/2;
  const head=new THREE.Group(); head.position.y=.7; torso.add(head);
  addM(head,new THREE.CylinderGeometry(.05,.06,.12,8),M.skin,0,-.06,0);
  const hd=addM(head,new THREE.SphereGeometry(.12,16,12),M.skin,0,.08,.01); hd.scale.set(.9,1.1,.95); if(G.outline)G.outline(hd,{thickness:.01});
  const hair=addM(head,new THREE.SphereGeometry(.13,14,10,0,TAU,0,PI*.6),M.hair,0,.1,-.01); hair.scale.set(.95,1.05,1.02);
  addM(head,new THREE.SphereGeometry(.06,10,8),M.hair,0,.09,-.13);                          // the knot
  for(const s of [-1,1]){ const st=addM(head,new THREE.CylinderGeometry(.008,.004,.16,4),M.hair,s*.1,.02,.07); st.rotation.z=s*.15; }   // loose strands
  for(const s of [-1,1]){ const e=addM(head,new THREE.SphereGeometry(.012,6,5),new THREE.MeshBasicMaterial({color:0x1a1416}),s*.04,.09,.11); void e; }
  const arms=[];
  for(const s of [-1,1]){ const sh=new THREE.Group(); sh.position.set(s*.21,.47,0); torso.add(sh);
    addM(sh,new THREE.CylinderGeometry(.055,.05,.3,8),M.coat,0,-.15,0);
    const el=new THREE.Group(); el.position.y=-.3; sh.add(el);
    addM(el,new THREE.CylinderGeometry(.048,.042,.27,8),M.coat,0,-.135,0);
    const hand=new THREE.Group(); hand.position.y=-.29; el.add(hand);
    addM(hand,new THREE.SphereGeometry(.045,8,6),M.skin).scale.set(.85,1.2,.6);
    // the ink sleeve: from the fingers to above the elbow (fades out when she's freed)
    const inkA=addM(el,new THREE.CylinderGeometry(.06,.058,.34,8),M.ink,0,-.17,0); inkA.castShadow=false;
    const inkH=addM(hand,new THREE.SphereGeometry(.058,8,6),M.ink); inkH.scale.set(.9,1.3,.7); inkH.castShadow=false;
    const inkU=addM(sh,new THREE.CylinderGeometry(.062,.06,.2,8),M.ink,0,-.22,0); inkU.castShadow=false;
    let mark=null; if(s<0){ mark=addM(hand,new THREE.CircleGeometry(.032,10),M.mark,0,.005,.028); mark.scale.set(1.3,.7,1); mark.castShadow=false; mark.visible=false; }   // the moth-wing mark (her left hand)
    arms.push({sh,el,hand,s,ink:[inkA,inkH,inkU],mark}); }
  // the ink up her side and her neck
  const side=addM(torso,new THREE.SphereGeometry(.2,10,8,0,PI*.8,0,PI*.7),M.ink,-.02,.36,0); side.rotation.y=PI*.6; side.scale.set(1.02,1.3,1.03); side.castShadow=false;
  const under=new THREE.Sprite(M.under); under.scale.set(2.6,1.2,1); under.position.y=.2; root.add(under);
  root.visible=false; G.scene.add(root);
  return {root,hips,torso,head,arms,legs,side,under,pose:'stand',k:{}, pos:V(),yaw:0,inkK:1};
}
/* poses: hold (kneel, both hands flat on the seam) · seal (kneel, arms out over it) · stand · shield (standing, arms wide)
   free (kneeling up, sitting back on her heels) · home (standing at the glass) */
const POSES={
  hold:{hipY:.5,lean:.55,thigh:-1.45,knee:1.6,sh:-1.05,shz:.12,el:-.35,head:-.25},
  seal:{hipY:.52,lean:.25,thigh:-1.45,knee:1.6,sh:-1.4,shz:.45,el:-.1,head:-.1},
  stand:{hipY:.95,lean:.06,thigh:0,knee:0,sh:-.15,shz:.12,el:-.25,head:0},
  shield:{hipY:.95,lean:-.05,thigh:-.1,knee:.15,sh:-1.2,shz:1.0,el:-.2,head:.05},
  free:{hipY:.45,lean:.05,thigh:-1.5,knee:2.3,sh:-.3,shz:.1,el:-1.0,head:.15},
  home:{hipY:.95,lean:0,thigh:0,knee:0,sh:-.05,shz:.08,el:-.4,head:.08}
};
function poseHesper(h,dt,pose){
  const p=POSES[pose]||POSES.stand, k=Math.min(1,dt*5), t=G.time;
  const L=(o,key,v)=>{ o[key]+=(v-o[key])*k; };
  L(h.hips.position,'y',p.hipY+Math.sin(t*1.6)*.006);
  L(h.torso.rotation,'x',p.lean+Math.sin(t*1.3)*.01);
  L(h.head.rotation,'x',p.head);
  for(const l of h.legs){ L(l.th.rotation,'x',p.thigh); L(l.kn.rotation,'x',p.knee); }
  for(const a of h.arms){ L(a.sh.rotation,'x',p.sh+(pose==='hold'?Math.sin(t*2.2+a.s)*.03:0)); L(a.sh.rotation,'z',a.s*p.shz); L(a.el.rotation,'x',p.el); }
  // the seam's violet under her, the ink on her
  h.inkK=U.damp(h.inkK,S.freed||h.home?0:1,1.2,dt);
  const ik=h.inkK; for(const a of h.arms){ for(const m of a.ink)m.visible=ik>.03; if(a.mark)a.mark.visible=(S.freed||h.home)&&ik<.6; }
  h.side.visible=ik>.03; h.side.scale.y=1.3*Math.max(.05,ik);
  const M=mats(); if(M.inkS)M.inkS.uFade.value=Math.max(.02,ik);
  M.under.opacity=h.home?0:(pose==='hold'||pose==='seal'?.55:.2)*(.8+.2*Math.sin(t*2))*Math.max(.15,ik);
}

/* ---------------------------------------------------------------- Hesper in the sanctum */
let hs=null, hsIA=null;
function sanctumHesper(){ if(hs)return hs; hs=buildHesper('hesperSanctum'); hs.home=false;
  hsIA=G.interact.add({pos:()=>hs.pos,radius:2.4,priority:6,label:()=>S.met?'Talk to Hesper':'Hesper',enabled:()=>isPlay()&&inside()&&hs.root.visible&&canTalkSanctum(),use:talkSanctum});
  return hs; }
function canTalkSanctum(){ const b=TB(); if(b&&(b.fighting||b.state==='dying'))return false; if(S.home)return false; return !S.met||S.freed; }
function hesperFight(){ const b=TB(); return b&&b.hesper; }
function updateSanctum(dt){
  const ins=inside(); if(!ins){ if(hs)hs.root.visible=false; return; }
  const h=sanctumHesper();
  const gone=S.home||h.leaving==='gone';
  h.root.visible=!gone; if(gone)return;
  const f=hesperFight(); let pose='hold', at=null;
  if(h.leaving){ pose='stand'; }
  else if(S.freed){ pose=h.stood?'stand':'free'; }
  else if(f){ pose=f.pose==='stand'?'stand':f.pose==='seal'?'seal':f.pose==='free'?'free':'hold'; at=f.at; }
  const b=TB(); if(b&&b.phase===3&&b.fighting)pose='seal';
  if(!h.placed||(!h.leaving&&at&&h.pos.distanceTo(at)>.05)){
    const tgt=at||anchor('sanctum','hesper')||W(0,-16,-101.7);
    if(!h.placed){ h.pos.copy(tgt); h.placed=true; }
    else { const d=tgt.clone().sub(h.pos); d.y=0; const L=d.length(); if(L>.05){ const s=Math.min(L,2.6*dt); h.pos.addScaledVector(d.normalize(),s); h.walk=1; } }
    h.pos.y=floorAt(h.pos.x,h.pos.z,h.pos.y+1.5);
  }
  if(h.leaving==='walk'){ const ex=anchor('sanctum','exit')||W(12,-16,-113); const d=ex.clone().sub(h.pos); d.y=0; const L=d.length();
    if(L<1){ h.leaving='gone'; h.root.visible=false; goneHome(); } else { h.pos.addScaledVector(d.normalize(),Math.min(L,1.4*dt)); h.pos.y=floorAt(h.pos.x,h.pos.z,h.pos.y+1.5); h.yaw+=U.angDiff(Math.atan2(d.x,d.z),h.yaw)*Math.min(1,dt*4); } }
  else {
    // she faces the seam while she holds it; otherwise the player (or the fight)
    const seam=anchor('sanctum','seam')||W(0,-16,-100), pp=P().pos;
    const look=(pose==='hold'||pose==='seal')?seam:pp;
    h.yaw+=U.angDiff(Math.atan2(look.x-h.pos.x,look.z-h.pos.z),h.yaw)*Math.min(1,dt*3);
  }
  h.root.position.copy(h.pos); h.root.rotation.y=h.yaw;
  poseHesper(h,dt,pose);
  // the first meeting: she knows you as soon as you're near enough to hear her
  if(!S.met&&isPlay()){ const pp=P().pos, d=Math.hypot(pp.x-h.pos.x,pp.z-h.pos.z);
    if(d<14&&Math.abs(pp.y-h.pos.y)<4){ h.nearT=(h.nearT||0)+dt; if(G.talk&&G.talk.calm&&G.talk.calm())talkSanctum(); else if(h.nearT>5)meetByCaption(); } }
}

/* ---------------------------------------------------------------- the first meeting */
const lensOwned=()=>!!(G.lens&&(G.lens.owned||(G.items&&G.items.lens&&G.items.lens.owned)));
const leave=t=>({id:'leave',text:t||'Not now.',action:()=>null});
function explain(asked){
  const ch=[];
  if(!asked.long)ch.push({id:'long',text:'How long have you been holding it?',next:()=>{ asked.long=1; return {lines:['Since the frost broke. I stopped counting the days.','It’s easier if you don’t count.'],choices:explainChoices(asked)}; }});
  if(!asked.hands)ch.push({id:'hands',text:'Your hands, Hes.',next:()=>{ asked.hands=1; return {lines:['I know.','It doesn’t hurt. That’s what frightens me.'],choices:explainChoices(asked)}; }});
  return ch;
}
function explainChoices(asked){ const ch=explain(asked); ch.push({id:'fight',text:'Then we’ll fight it. Together.',next:()=>({lines:['…All right. Together, then.',
  lensOwned()?'The hands come first. Burn the ink off them with that glass of yours, then break them. Don’t let them reach me.':'The hands come first. Break them. Don’t let them reach me.']})}); return ch.slice(-3); }
function explainNode(asked){ return {lines:[
  'This is the first seam. Before there was ever a lighthouse, the island knelt round it and prayed.',
  'It answered. It gave them what they asked for, and it took the rest. Names. Years. Light.',
  'The cave, the drowned lens, Crane’s tithe — they’re all cracks running off this one.',
  'Something’s been pushing up through it since spring, and I’ve been pushing back. If I take my hands off it, it comes through.'],
  choices:explainChoices(asked)}; }
function talkSanctum(){
  if(!G.talk||G.talk.isOpen)return false;
  if(S.freed&&!S.home)return talkEnding();
  if(S.met)return false;
  const asked={};
  const ok=G.talk.open({who:'hesper',name:'Hesper',title:'At the seam',portrait:inkPortrait(),
    lines:['You’re late, Tide.','No — don’t come round where I can see you. If I look at you, I’ll lose it.','Seven years. You might have written.'],
    choices:[
      {id:'wrote',text:'I did write. Every port.',next:()=>({lines:['I know. Dad kept them in the tea tin by the stove.','I read them all. Some of them twice.'].concat(explainNode(asked).lines),choices:explainChoices(asked)})},
      {id:'what',text:'What is this place?',next:()=>explainNode(asked)},
      {id:'let',text:'Let go of it, Hes. I’ll get you out.',next:()=>({lines:['I can’t. That’s the whole of it.'].concat(explainNode(asked).lines),choices:explainChoices(asked)})}],
    onClose:()=>met()});
  if(ok)G.emit('temple:hesper',{state:'found'});
  return ok;
}
function meetByCaption(){ if(S.met)return;
  G.ui.say('You’re late, Tide.','Hesper',{priority:'high',key:'hesMeet',portrait:inkPortrait()});
  G.ui.say('Not now. Here it comes — keep the hands off me.','Hesper',{priority:'high',key:'hesMeet2',portrait:inkPortrait()});
  G.emit('temple:hesper',{state:'found'}); met(); }
function met(){ if(S.met)return; S.met=true; }

/* ---------------------------------------------------------------- her warnings during the fight (captions) */
let warnT=0;
function warn(text,o){ o=o||{}; if(!o.force&&G.time<warnT)return false; if(o.once){ if(S.said[o.once])return false; S.said[o.once]=1; }
  warnT=G.time+(o.gap||4.5); G.ui.say(text,'Hesper',{priority:o.priority||'high',key:'hesper',portrait:inkPortrait()}); return true; }
let handsSeen=0, sealWasOn=false, sealPeak=0, glareWarnT=0;
G.on('temple:bossStart',()=>{ handsSeen=0; sealWasOn=false; sealPeak=0; later(2.2,()=>warn('Here they come.',{force:true})); });
G.on('temple:hand',e=>{ if(!e)return; const b=TB(); if(!b||!b.fighting)return;
  if(e.what==='rise'){ handsSeen++; const live=b.hands.filter(h=>h.state!=='off'&&h.state!=='sink').length;
    if(handsSeen===1)later(.4,()=>warn('One’s coming up. Don’t let it reach me.',{force:true}));
    else if(live>=3)warn('Three of them, Tide!');
    else warn(['Another one.','Behind me, Tide!','There’s another — by your feet!'][handsSeen%3]); }
  else if(e.what==='broken')warn(S.said.broke1?['That’s it. Again.','Good. Again.','Keep going.'][handsSeen%3]:'That’s it. Again.',{once:S.said.broke1?null:'broke1'});
  else if(e.what==='glance')warn('The ink, Tide — burn the ink off it first!',{once:'glance'});
  else if(e.what==='burn')warn('Now hit it!',{once:'burn'}); });
G.on('temple:hesperHold',e=>{ if(!e)return;
  const lines={3:'It’s got my arm—',2:'I’m slipping. Tide!',1:'I can’t — not much more—'};
  if(e.lost)warn('It took a piece of me. I’ve got it. I’ve still got it.',{force:true}); else if(lines[e.hold])warn(lines[e.hold],{force:true}); });
G.on('temple:bossTelegraph',e=>{ if(!e)return; const b=TB(); if(!b)return;
  if(e.kind==='slam'&&!S.said.slam){ const pp=P().pos; if(Math.hypot(pp.x-e.pos.x,pp.z-e.pos.z)<3)warn('Move — it’s going to come down on you!',{once:'slam'}); }
  else if(e.kind==='glare'){ if(G.time>glareWarnT){ glareWarnT=G.time+14; warn('Shutter, Tide — it’s going to flare!',{force:true}); } }
  else if(e.kind==='sweep'&&!S.said.sweep)warn('Its arm — get down!',{once:'sweep'}); });
G.on('temple:bossHit',e=>{ if(!e)return;
  if(e.glare)warn('Your light’s open! It’s only glare while your light’s open!',{gap:7});
  else if(e.real&&TB()&&TB().phase===2)warn('There. It felt that.',{once:'felt'}); });
G.on('temple:bossPhase',e=>{ if(!e)return;
  if(e.n===2)later(5.5,()=>warn('I can’t hold it and fight it both, so I’ve let go. Shut your lantern — in the dark it has a body.',{force:true}));
  if(e.n===3)later(3.2,()=>warn(lensOwned()?'It’s going for the moths. I’ve got them. Put the beam on the seam and hold it there, whatever it does.':'It’s going for the moths. I’ve got them. Put your light on the seam and hold it there, whatever it does.',{force:true})); });
G.on('temple:seal',e=>{ if(!e)return;
  if(e.on&&!sealWasOn){ sealWasOn=true; warn('That’s it. Hold it. Hold it.',{once:'sealOn'}); }
  else if(!e.on&&e.k>.08)warn('Back on the seam! I’m losing it.',{gap:6}); });
function watchSeal(){ const b=TB(); if(!b||!b.fighting||b.phase!==3)return; const k=b.seal;
  if(k>=.5&&sealPeak<.5){ sealPeak=.5; warn('Halfway. Don’t you dare move.',{force:true}); }
  if(k>=.85&&sealPeak<.85){ sealPeak=.85; warn('Nearly — nearly—',{force:true}); } }
G.on('temple:bossReset',e=>{ if(!e)return;
  if(e.why==='left')later(.3,()=>warn('Tide! Don’t you leave me down here.',{force:true}));
  if(e.why==='death')later(1.2,()=>warn('Get up, Tide. I’ve still got it. Go again.',{force:true})); });

/* ---------------------------------------------------------------- the ending */
G.on('temple:bossDead',e=>{
  if(!e||e.restored)return;
  later(2.2,()=>warn('Now. Now—',{force:true}));
  later(4.2,()=>G.ui.say('The violet goes out of the floor like a tide going out. For a moment it’s only a cold stone room, and two people breathing in it.',null,{priority:'high',key:'hesEnd'}));
  S.ending=true; endingWait=true;
});
let endingWait=false;
function updateEnding(dt){
  if(!endingWait||!isPlay())return;
  if(!(G.talk&&G.talk.calm&&G.talk.calm()))return;
  const pp=P().pos; if(!hs)return; if(Math.hypot(pp.x-hs.pos.x,pp.z-hs.pos.z)>13){ hs.callT=(hs.callT||0)-dt; if(hs.callT<=0){ hs.callT=20; G.ui.say('Tide. Come here.','Hesper',{priority:'normal',key:'hesCall',portrait:calmPortrait()}); } return; }
  endingWait=false; talkEnding();
}
function endingFirst(){ S.freed=true; G.emit('temple:hesper',{state:'freed'}); if(hs)later(1.5,()=>{ hs.stood=true; }); }
function talkEnding(){
  if(!G.talk||G.talk.isOpen)return false;
  const asked={};
  const home={id:'home',text:'Come home, Hes.',next:()=>({lines:['Home. Yes. Somebody has to keep the light, and Dad’s hands aren’t what they were.',
    'But look at the back wall first. With your Glass. I’ve been staring at it since spring and I still don’t like it.']})};
  const more=()=>{ const ch=[];
    if(!asked.dead)ch.push({id:'dead',text:'I thought you were dead.',next:()=>{ asked.dead=1; return {lines:['So did everyone. I let them.','You’re the only one who came down here after me. Of course it was you.'],choices:more()}; }});
    if(!asked.wait)ch.push({id:'wait',text:'You should have waited for me.',next:()=>{ asked.wait=1; return {lines:['I waited seven years, Tide.','Then I stopped waiting and did something about it. You’d have done the same.'],choices:more()}; }});
    ch.push(home); return ch; };
  const first=!S.freed;
  const lines=first?['Tide.','It’s quiet. I’d forgotten it could be quiet.',
    {text:'The ink goes back out of her like water out of sand. All of it but a mark across the back of her left hand, dark as a bruise, the shape of a moth’s wing.',who:''},
    'That’s staying, I think. It can stay.']:(S.carving?['Go on up. I’m right behind you.']:['The back wall, Tide. With the Glass.']);
  const ok=G.talk.open({who:'hesper',name:'Hesper',title:'Keeper of the light',portrait:calmPortrait(),lines,choices:first?more():[leave('All right.')],
    onClose:()=>{ if(!S.freed)endingFirst(); }});
  if(ok&&first&&hs)hs.inkK=Math.min(hs.inkK,.9);
  return ok;
}

/* ---------------------------------------------------------------- the carving (through the Glass, the back wall of the sanctum) */
let carving=null;
function carvingTex(){
  return G.canvasTex(512,(g,s)=>{
    g.fillStyle='#6b6470'; g.fillRect(0,0,s,s);
    const R=rng(77); for(let i=0;i<400;i++){ g.fillStyle='rgba('+(R()<.5?'30,26,36':'160,150,170')+','+(R()*.08).toFixed(3)+')'; g.fillRect(R()*s,R()*s,2+R()*10,1+R()*4); }
    const cut=(fn,w)=>{ g.lineCap='round'; g.lineJoin='round'; g.strokeStyle='rgba(20,16,26,.85)'; g.lineWidth=w+2; g.beginPath(); fn(); g.stroke(); g.strokeStyle='rgba(200,190,210,.35)'; g.lineWidth=w*.5; g.save(); g.translate(-1.2,-1.2); g.beginPath(); fn(); g.stroke(); g.restore(); };
    // the sea: rows of carved waves
    for(let r=0;r<5;r++){ const y=s*(.66+r*.065); cut(()=>{ g.moveTo(s*.06,y); for(let x=s*.06;x<s*.94;x+=s*.06)g.quadraticCurveTo(x+s*.015,y-s*.025,x+s*.03,y),g.quadraticCurveTo(x+s*.045,y+s*.02,x+s*.06,y); },3); }
    // our island, low at the bottom left, with its own small tower (the lighthouse) — and the north island, high and far
    cut(()=>{ g.moveTo(s*.06,s*.68); g.quadraticCurveTo(s*.18,s*.6,s*.34,s*.66); },4);
    cut(()=>{ g.moveTo(s*.2,s*.62); g.lineTo(s*.2,s*.53); g.lineTo(s*.23,s*.53); g.lineTo(s*.23,s*.62); },3);
    cut(()=>{ g.moveTo(s*.46,s*.5); g.quadraticCurveTo(s*.6,s*.34,s*.82,s*.49); },5);
    // the tower on it, tall, with a light at the top
    cut(()=>{ g.moveTo(s*.62,s*.4); g.lineTo(s*.64,s*.16); g.lineTo(s*.68,s*.16); g.lineTo(s*.7,s*.4); },4);
    cut(()=>{ g.moveTo(s*.6,s*.16); g.lineTo(s*.72,s*.16); },4);
    for(let k=0;k<9;k++){ const a=-PI/2+(k-4)*.32; cut(()=>{ g.moveTo(s*.66+Math.cos(a)*s*.05,s*.12+Math.sin(a)*s*.05); g.lineTo(s*.66+Math.cos(a)*s*.13,s*.12+Math.sin(a)*s*.13); },2); }
    cut(()=>{ g.arc(s*.66,s*.12,s*.03,0,TAU); },3);
    // an arrow of moths from our island toward it, and a compass mark: north, up
    for(let k=0;k<6;k++){ const x=s*(.26+k*.06), y=s*(.56-k*.055); cut(()=>{ g.moveTo(x-6,y); g.quadraticCurveTo(x,y-7,x+6,y); g.moveTo(x-6,y); g.quadraticCurveTo(x,y+4,x+6,y); },1.5); }
    cut(()=>{ g.moveTo(s*.12,s*.3); g.lineTo(s*.12,s*.14); g.moveTo(s*.09,s*.18); g.lineTo(s*.12,s*.13); g.lineTo(s*.15,s*.18); },3);
    // a violet ghost of light still in the cut lines
    g.globalCompositeOperation='lighter'; const gr=g.createRadialGradient(s*.66,s*.13,0,s*.66,s*.13,s*.25); gr.addColorStop(0,'rgba(150,100,255,.35)'); gr.addColorStop(1,'rgba(150,100,255,0)'); g.fillStyle=gr; g.fillRect(0,0,s,s); g.globalCompositeOperation='source-over';
    // the frame: a border of carved watchers' eyes
    for(let k=0;k<14;k++){ const x=s*(.07+k*.066); cut(()=>{ g.ellipse(x,s*.04,8,4,0,0,TAU); },1.5); cut(()=>{ g.ellipse(x,s*.96,8,4,0,0,TAU); },1.5); }
  });
}
function buildCarving(){
  if(carving)return carving;
  const at=anchor('sanctum','carving')||W(0,-13,-117.6), seam=anchor('sanctum','seam')||W(0,-16,-100);
  const mat=new THREE.MeshBasicMaterial({map:carvingTex(),transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide});
  const m=new THREE.Mesh(new THREE.PlaneGeometry(6.4,6.4),mat); m.position.copy(at); m.lookAt(seam.x,at.y,seam.z); m.position.addScaledVector(V(seam.x-at.x,0,seam.z-at.z).normalize(),.08);
  m.renderOrder=3; m.visible=false; G.scene.add(m);
  carving={m,mat,at}; return carving;
}
function glassSees(p){ const g=G.glass; if(!g||!g.raised)return false; try{ return !g.canSee||g.canSee(p)!==false; }catch(e){ return true; } }
const _cd=V();
function updateCarving(dt){
  if(!inside()){ if(carving)carving.m.visible=false; return; }
  const c=buildCarving(), see=glassSees(c.at);
  c.mat.opacity=U.damp(c.mat.opacity,see?.92:0,see?2.2:5,dt); c.m.visible=c.mat.opacity>.01;
  if(!see||S.carving||!S.freed)return;
  // you've looked at it: near enough, facing it
  const pp=P().pos; if(Math.hypot(pp.x-c.at.x,pp.z-c.at.z)>18)return;
  if(G.camera){ G.camera.getWorldDirection(_cd); const to=c.at.clone().sub(G.camera.position).normalize(); if(_cd.dot(to)<.6)return; }
  if(c.mat.opacity<.6)return;
  revealCarving();
}
function revealCarving(){
  if(S.carving)return; S.carving=true; G.emit('temple:carving',{});
  G.ui.say('Through the Glass, the back wall isn’t bare. Someone cut a picture into it long before there was a lighthouse: the sea, and an island to the north, and on the island a tower with a light at the top.',null,{priority:'high',key:'carving'});
  later(6.5,()=>{ if(hs&&!S.home&&inside())G.ui.say('Who’s keeping the other one?','Hesper',{priority:'high',key:'hesCarving',portrait:calmPortrait()}); });
  later(11,()=>{ if(!S.home&&inside()){ G.ui.say('I’m going up. I’ll see you at the light, Tide.','Hesper',{priority:'high',key:'hesUp',portrait:calmPortrait()}); later(2.5,()=>{ if(hs&&!S.home){ hs.leaving='walk'; hs.stood=true; } }); } });
}
function goneHome(){ if(S.home)return; S.home=true; G.emit('temple:hesper',{state:'home'}); syncHome(); try{ G.flow&&G.flow.writeSave&&later(1,()=>{ if(isPlay())G.flow.writeSave(); }); }catch(e){} }
G.on('temple:exit',()=>{ if(S.freed&&!S.home){ if(hs)hs.leaving='gone'; goneHome(); } });

/* ---------------------------------------------------------------- Hesper at the lighthouse (the lamp room) */
let lh=null;
function lampSpot(){
  const l=LM().lighthouse||{x:180,y:42,z:0}, cx=l.x!=null?l.x:180, cz=l.z!=null?l.z:0, base=(l.y!=null&&isFinite(l.y))?l.y:42, top=base+24;
  const a=-.55, r=2.55, x=cx+Math.cos(a)*r, z=cz+Math.sin(a)*r;   // by the glass on the sea side, clear of the lamp and the stair hatch
  return {pos:V(x,floorAt(x,z,top+1.5),z),yaw:Math.atan2(Math.cos(a),Math.sin(a)),look:V(cx+Math.cos(a)*30,top,cz+Math.sin(a)*30)};
}
function buildHome(){
  if(lh)return lh; lh=buildHesper('hesperHome'); lh.home=true; lh.inkK=0;
  const sp=lampSpot(); lh.pos.copy(sp.pos); lh.yaw0=sp.yaw; lh.yaw=sp.yaw;
  G.interact.add({pos:()=>lh.pos,radius:2.2,priority:5,label:'Talk to Hesper',enabled:()=>isPlay()&&lh.root.visible&&!inside(),use:talkHome});
  return lh;
}
function syncHome(){ if(S.home){ buildHome(); lh.root.visible=true; } else if(lh)lh.root.visible=false; }
function updateHome(dt){
  if(!lh||!lh.root.visible)return;
  const pp=P()&&P().pos; if(!pp)return; const d=Math.hypot(pp.x-lh.pos.x,pp.z-lh.pos.z);
  const want=d<4.5&&Math.abs(pp.y-lh.pos.y)<3?Math.atan2(pp.x-lh.pos.x,pp.z-lh.pos.z):lh.yaw0;
  lh.yaw+=U.angDiff(want,lh.yaw)*Math.min(1,dt*2.5);
  lh.root.position.copy(lh.pos); lh.root.rotation.y=lh.yaw; poseHesper(lh,dt,'home');
}
const HOME_LINES=[
  ['The lamp’s steadier with two of us. Dad pretends he isn’t watching me trim it.','He is.'],
  ['I sit up here at night and look north. I don’t know what for yet.','The fishermen say there’s nothing up there but weather.'],
  ['You can stop looking at my hand. It doesn’t hurt.','It goes cold when the fog comes in. That’s all.'],
  ['Seven years, and you come home the one spring I wasn’t here. That’s very you, Tide.'],
  ['The moths come up the stair at dusk and sit on the glass with me. I think they’re keeping watch too.']
];
function talkHome(){
  if(!G.talk)return;
  const n=S.homeTalks|0; S.homeTalks=n+1;
  const ch=[];
  if(!S.heardNorth)ch.push({id:'north',text:'That carving. The tower.',next:()=>{ S.heardNorth=true; return {lines:['Somebody cut it into that wall before there was a lighthouse here. Before there was a village.',
    'An island to the north, with a light on it. A light like the one under the floor.','I keep thinking: if ours was holding something off, what’s theirs been doing all this time?']}; }});
  if(!S.heardStay)ch.push({id:'stay',text:'Do you want me to stay?',next:()=>{ S.heardStay=true; return {lines:['You’re asking me that at the top of a lighthouse, Tide.','…Somebody has to carry the oil up all these stairs. Dad’s knees won’t.']}; }});
  ch.push(leave('Goodnight, Hes.'));
  G.talk.open({who:'hesper',name:'Hesper',title:'Keeper of the light',portrait:calmPortrait(),lines:HOME_LINES[n%HOME_LINES.length],choices:ch.slice(-3)});
}

/* ---------------------------------------------------------------- Halloran (creatures.js asks G.creatures.halloranHooks) */
function halloranHook(){
  if(S.home&&!S.hal.home1){ S.hal.home1=true; return 'She came up the stair last night. Didn’t knock. She never did.'; }
  if(S.home&&S.hal.home1&&!S.hal.home2){ S.hal.home2=true; return 'Looked at this arm of mine and didn’t say one word about it. Just put the kettle on. …You found her. I won’t forget that.'; }
  return null;
}
function hookHalloran(){ const C=G.creatures; if(!C)return; if(!C.halloranHooks)C.halloranHooks=[]; if(C.halloranHooks.indexOf(halloranHook)<0)C.halloranHooks.push(halloranHook); }

/* ---------------------------------------------------------------- Hesper's pages (always one room ahead of you) */
/* the texts are mine; temple.js (Place agent) places and reads its pages p1–p5 and asks G.templePeople.pages[id] for the words.
   Without temple.js the pages below are placed here, at the same rooms. */
const PAGES={
  p1:{room:'vestibule',author:'Hesper',title:'On the stair',at:[-3.7,0,-4.3],
    text:'Whoever comes down after me: shut your lantern on the stair. Not all of the watchers are carvings. The ones that aren’t follow light. — H.'},
  p2:{room:'reliquary',author:'Hesper',title:'In the reliquary',at:[-29.6,-4,-38],
    text:'There’s a glass on the altar, a keeper’s burning-glass. Put it in front of a lantern and the light comes out narrow, and hot enough to burn ink. I’ve left it for whoever comes next. I won’t need it where I’m going. — H.'},
  p3:{room:'cloister',author:'Hesper',title:'In the cloister',at:[18,-6,-41],
    text:'The floor’s gone here. Through the Glass it isn’t: there’s a whole walk of them, the old vigil, going round with their candles. Walk where they walk. I did, and I’m still here. More or less.'},
  p4:{room:'well',author:'Hesper',title:'At the well',at:[-2.4,-4,-60.6],
    text:'Dad, if this gets back to you: I’m not sorry. The light was only ever holding off the edge of it. This is the middle, and somebody has to stand in the middle. Tell Tide — no. Don’t tell him anything. He’ll only come.'},
  p5:{room:'well',author:'Hesper',title:'At the sanctum door',at:[1.9,-14,-77.6],
    text:'It’s quiet while I hold it. That’s how I know it’s working. If you can hear it, I’ve let go.'}
};
const ORDER=['p1','p2','p3','p4','p5'];
const pageObjs={};
let pagesBuilt=false;
function pageMesh(){
  const g=new THREE.Group();
  const paper=new THREE.Mesh(new THREE.PlaneGeometry(.34,.44),new THREE.MeshBasicMaterial({color:U.col('#e8dcc0'),side:THREE.DoubleSide}));
  paper.rotation.set(-PI/2+.55,.3,0,'YXZ'); paper.position.y=.14; g.add(paper);
  const fold=new THREE.Mesh(new THREE.PlaneGeometry(.34,.2),new THREE.MeshBasicMaterial({color:U.col('#d4c6a6'),side:THREE.DoubleSide})); fold.rotation.set(-PI/2+.1,.3,0,'YXZ'); fold.position.set(.03,.05,.12); g.add(fold);
  const s=new THREE.Sprite(new THREE.SpriteMaterial({map:G.tex.soft,color:U.col('#e3b46a'),transparent:true,opacity:.35,depthWrite:false,blending:THREE.AdditiveBlending})); s.scale.setScalar(1.3); s.position.y=.3; g.add(s); g.userData.glow=s;
  return g;
}
const placePages=()=>!!(TP()&&Array.isArray(TP().pages)&&TP().readPage);   // temple.js places and reads them
function buildPages(){
  if(pagesBuilt||placePages())return; pagesBuilt=true;
  for(const id of ORDER){ const d=PAGES[id]; const at=W(d.at[0],d.at[1],d.at[2]);
    at.y=floorAt(at.x,at.z,at.y+1.5);
    const g=pageMesh(); g.position.copy(at); g.rotation.y=(ORDER.indexOf(id)*1.7)%TAU; G.scene.add(g);
    const o=pageObjs[id]={g,pos:at};
    G.interact.add({pos:()=>o.pos,radius:1.7,priority:3,label:()=>S.pages[id]?'Read Hesper’s page again':'Read the page',enabled:()=>isPlay()&&inside()&&g.visible,use:()=>readPage(id)});
  }
}
function readPage(id){
  if(placePages())return TP().readPage(id);
  const d=PAGES[id], first=!S.pages[id]; S.pages[id]=1;
  if(G.talk&&G.talk.moment)G.talk.moment({who:'page',name:'Hesper',title:d.title,portrait:'page',key:'page',lines:[{text:d.text,who:'Hesper'}]});
  else G.ui.say(d.text,'Hesper',{priority:'high',key:'page'});
  if(first){ G.emit('temple:page',{id,first,author:'Hesper'}); G.ui.toast&&G.ui.toast('Hesper’s pages',Object.keys(S.pages).length+' of '+ORDER.length+' found'); }
}
G.on('temple:page',e=>{ if(e&&e.id&&PAGES[e.id])S.pages[e.id]=1; });
function updatePages(){ const ins=inside(); if(ins&&!pagesBuilt)buildPages(); for(const id in pageObjs){ const o=pageObjs[id]; o.g.visible=ins; if(ins&&o.g.userData.glow)o.g.userData.glow.material.opacity=(S.pages[id]?.12:.32)+.1*Math.sin(G.time*1.7+id.length); } }

/* ---------------------------------------------------------------- Wren at the hamlet well: about Hesper (unlocks the temple) */
let wrenIA=null;
function hamletWren(){ const up=G.undercroftPeople; try{ return up&&up.debug&&up.debug.hamletWren?up.debug.hamletWren():null; }catch(e){ return null; } }
function wrenSaved(){ const up=G.undercroftPeople; return !!(up&&up.state&&up.state.wren&&up.state.wren.saved); }
function hookWren(){
  if(wrenIA)return;
  wrenIA=G.interact.add({pos:()=>{ const w=hamletWren(); return w?w.pos:V(0,-999,0); },radius:2.4,priority:5,label:'Ask Wren about Hesper',
    enabled:()=>{ if(!isPlay()||S.wrenAsked||inside())return false; const w=hamletWren(); return !!(w&&w.root&&w.root.visible); },use:talkWren});
}
function talkWren(){
  if(!G.talk)return;
  const going={id:'go',text:'I’m going after her.',action:()=>{ unlock(false); return {lines:['Of course you are.',
    'Take the moths with you. She left her lantern in the roots of that big tree on purpose. She said the thing down there eats violet light.']}; }};
  G.talk.open({who:'wren',name:'Wren',title:'Of Wickham’s End',portrait:'wren',
    lines:['Hesper. She came down to us last spring, when I could still remember most things.',
      'She sat with me in the vestry and asked about the old vigil — the one from before the lighthouse. My gran used to tell it.',
      'And she asked Crane. He told her all of it. He liked being asked.',
      'There’s a temple sunk in the old wood, past the big tree, with standing stones round it. She went down there. She said not to send anyone.'],
    choices:[going,{id:'why',text:'Why didn’t you tell me before?',next:()=>({lines:['You never asked me about her. You asked about my name.','And I’d only just got it back.'],choices:[going]})}]});
}
function vigilDoor(){ const t=TP(); if(t&&t.door)return V(t.door.x,t.door.y,t.door.z); const l=LM().vigilDoor; if(l)return V(l.x,l.y,l.z);
  const sp=LM().lanternSpot||{x:-160,y:9,z:9}; const x=sp.x-20, z=sp.z; return V(x,G.world.height?G.world.height(x,z):sp.y,z); }
function unlock(restored){
  S.wrenAsked=true;
  if(S.unlocked&&!restored)return; const first=!S.unlocked; S.unlocked=true;
  if(first){ const t=TP(); if(t&&t.unlock){ if(!t.unlocked)t.unlock({restored:!!restored,quiet:!!restored}); } else G.emit('temple:unlock',{restored:!!restored}); }
  addMarker();
  if(restored)return;
  const d=vigilDoor();
  later(.6,()=>G.ui.say('A sunken temple in the old wood, past the Resisting Tree, with a ring of standing stones round it. The Vigil.',null,{priority:'high',key:'vigilUnlock'}));
  later(1.4,()=>{ if(G.quest&&!inside())G.quest.set('temple','The Vigil','A sunken hollow past the Resisting Tree, in the old wood',d.clone().add(V(0,1.5,0)),'The Vigil'); G.ui.toast&&G.ui.toast('The Vigil','Marked on your map'); });
}
let marker=false;
function addMarker(){ if(marker||!(G.map&&G.map.addMarker))return; marker=true;
  G.map.addMarker({id:'vigil',kind:'cave',label:'The Vigil',pos:()=>{ const d=vigilDoor(); return d?{x:d.x,z:d.z}:null; },visible:()=>S.unlocked||!!(TP()&&TP().unlocked)}); }
let restoreCheck=false;
G.on('loop:start',e=>{ if(e&&e.restored){ loadedNow=false; restoreCheck=true; } });
function checkRestored(){ // a save from before this version: Wren already saved, never asked → the marker on load
  if(!restoreCheck)return; restoreCheck=false;
  if(!loadedNow&&wrenSaved()&&!S.unlocked)unlock(true);
}
G.on('temple:enter',()=>{ if(!S.unlocked){ S.unlocked=true; addMarker(); } if(G.quest&&G.quest.step==='temple')G.quest.set('temple:in','The Vigil','',null,''); });

/* ---------------------------------------------------------------- load / system / API */
function applyLoaded(){ syncHome(); if(S.unlocked)addMarker(); if(hs){ hs.placed=false; hs.leaving=S.home?'gone':null; hs.stood=S.freed; } endingWait=false; }
G.system('templePeople',{order:62,
  init(){ hookHalloran(); hookWren(); registerPortraits(); },
  update(dt){
    try{
      updateLater(dt); checkRestored();
      updateSanctum(dt); updateEnding(dt); updateCarving(dt); updatePages(); watchSeal(); updateHome(dt);
    }catch(e){ if(!this._err){ console.error('templePeople',e); this._err=1; } }
  }
});
G.on('ready',()=>{ hookHalloran(); hookWren(); registerPortraits(); if(S.unlocked)addMarker(); syncHome(); });

G.templePeople={state:S,PAGES,pages:PAGES,HOME_LINES,get met(){ return S.met; },get freed(){ return S.freed; },get home(){ return S.home; },
  get hesper(){ return hs; },get atHome(){ return lh; },talk:()=>talkSanctum(),readPage,
  debug:{meet:()=>met(),talkWren,talkHome,talkEnding,reveal:revealCarving,unlock,goHome:goneHome,pageObjs,carving:()=>carving,lampSpot,halloranHook,
    reset(){ for(const k of ['met','freed','home','ending','carving','wrenAsked','unlocked','heardNorth','heardStay'])S[k]=false; S.pages={}; S.hal={}; S.homeTalks=0; S.said={}; endingWait=false;
      if(hs){ hs.leaving=null; hs.stood=false; hs.placed=false; hs.inkK=1; } syncHome(); }}};
})();
