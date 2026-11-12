/* =====================================================================
   BRAVE QUEST: LIGHTHOUSE — northfire_story.js
   The fire room's story (Heath, 2026-11-11; Story Bible "The fire room"; contract with northfire.js, which owns the
   room, the giant and the fight). This file owns Rowan's father, Tobias Knox, and everything he does up here:
     - the intro (first time up the stair): he's at the pit feeding it, the fire says Rowan's name, he refuses it,
       and the Wreck Giant climbs out. Retries are short: no shot, it just comes up again.
     - the fight: he backs to the north wall and stays there, afraid to help and unwilling to fight his own son.
     - the hint (once per attempt, Rowan at 3 hearts or less): a short shot. He takes a boathook off the wall.
     - the rescue: a P.hurtFilters filter. A blow that would leave Rowan at 1 heart or less is caught: he's left at
       exactly 1, and his father steps in. He hauls the great chain (the roof cistern over the pit), the sea comes
       down on the giant and cracks all its armour, and it swats him into the wall. His coat catches. He gets up
       anyway and works the cisterns for the rest of the fight.
     - the endings, when the giant goes down: rescued → it reaches for Rowan, his father puts himself in its grip,
       and it takes him with it (last words, a talk card; he dies). Not rescued → it comes apart on its own, and he
       stays to keep a true light on the rock (a talk card; he relights the pit gold).
     - quest text in the room; north:giantDead {pos, outcome} afterwards (progression.js drops the Keeper's Heart).
   Retries: on northFire:reset {why:'death'} he's back at the wall, alive, and it comes up again.
   G.northFireStory = { attempt, hinted, rescued, tobias, state, debug }   Save: G.persist 'northFireStory'.
   ===================================================================== */
(function(){
'use strict';
const G=window.G, THREE=G.THREE, U=G.U;
const PI=Math.PI, TAU=PI*2;
const {clamp,lerp,smooth}=U;
const V=(x,y,z)=>new THREE.Vector3(x||0,y||0,z||0);
const col=U.col;
const NF=()=>G.northFire||null;
const GI=()=>{ const n=NF(); return n&&n.giant||null; };
const call=(o,fn,...a)=>{ try{ if(o&&typeof o[fn]==='function')return o[fn](...a); }catch(e){ console.error('northFireStory',fn,e); } return undefined; };

/* ================================================================ 1. STATE */
const ST={v:1,introSeen:false,attempt:0,hinted:false,rescued:false,rescueQueued:false,ending:null,scene:null,said:{},armed:false,helpCool:0,shout:0,
  keeperTalks:0};
const T={mode:'none',a:PI,r:0,x:0,z:0,y:0,yaw:0,lean:0,lie:0,t:0,walk:0,burn:0,run:null,hook:false,lampK:1,fly:null,grip:null};
let tob=null, hook=null, burnLight=null, embers=[], built=false;

/* the room's numbers (northfire.js), with the contract's values when it isn't there yet */
const R=()=>{ const n=NF(); return n&&isFinite(n.R)?n.R:12.5; };
const PIT=()=>{ const n=NF(); return n&&isFinite(n.PIT_R)?n.PIT_R:3.4; };
const Ov=()=>{ const n=NF(); return n&&n.O&&n.O.isVector3?n.O:V(800,60,800); };
const W=(x,y,z)=>{ const o=Ov(); return V(o.x+x,o.y+y,o.z+z); };
const toL=p=>{ const o=Ov(); return V(p.x-o.x,p.y-o.y,p.z-o.z); };
const pol=(a,r)=>({x:Math.sin(a)*r,z:Math.cos(a)*r});
const SPOT={feed:()=>pol(PI,PIT()+1.0),wall:()=>pol(PI,R()-1.4),intro:()=>pol(PI*.62,PIT()+1.1)};   // intro: beside the fire from the stair, not behind it

/* a clock of our own: G.time runs on under a talk card in tests (G.step), and these beats must wait for it */
let clock=0; const beats=[];
const later=(s,fn)=>beats.push({t:clock+s,fn});
function clearBeats(){ for(const b of beats)b.dead=true; beats.length=0; }
const say=(t,who,o)=>{ try{ G.ui.say(t,who===undefined?null:who,Object.assign({priority:'high'},o||{})); }catch(e){} };
const DAD='Tobias Knox', FIRE='The fire';
const isPlay=()=>G.state.mode==='play';
const inside=()=>{ const n=NF(); return !!(n&&n.inside); };
const fighting=()=>{ const n=NF(); return !!(n&&n.fighting); };
function sfx(kind){ try{ const A=G.audio; if(!A||!A.ready||!A.S)return; const t=A.context.currentTime;
  if(kind==='thud')A.S.thud(t,{g:.3,dur:.4}); else if(kind==='clank'&&A.S.clank)A.S.clank(t,{g:.2,dur:.3}); }catch(e){} }

/* ================================================================ 2. HIM */
function build(){
  if(built)return true; const n=NF(); if(!n||!n.root||!G.northCave||!G.northCave.makeKnox)return false;
  try{
    tob=G.northCave.makeKnox(); tob.name='tobiasFire'; tob.visible=false; n.root.add(tob);
    // his coat, his own: it chars as he burns
    const coat=tob.userData.coat; if(coat){ const c2=coat.clone(); tob.traverse(o=>{ if(o.material===coat)o.material=c2; }); tob.userData.coat=c2; tob.userData.coat0=c2.color.clone(); }
    // the boathook: off the wall, held in his left hand like a pike
    hook=new THREE.Group(); hook.visible=false;
    const pole=new THREE.Mesh(new THREE.CylinderGeometry(.03,.035,2.5,6),G.toon('#6b5340')); pole.position.y=.6; hook.add(pole);
    const iron=G.toon('#2a2729'), tip=new THREE.Mesh(new THREE.TorusGeometry(.12,.025,4,10,PI*1.3),iron); tip.position.set(.08,1.86,0); hook.add(tip);
    const spike=new THREE.Mesh(new THREE.ConeGeometry(.03,.22,5),iron); spike.position.y=1.95; hook.add(spike);
    hook.position.set(-.33,1.2,.22); hook.rotation.set(-1.05,0,.12); tob.add(hook);
    burnLight=new THREE.PointLight(col('#ff8a3a'),0,7,1.6); burnLight.position.y=1.3; tob.add(burnLight);
    for(let i=0;i<14;i++){ const s=new THREE.Sprite(new THREE.SpriteMaterial({map:G.tex.flame,color:col(i%3?'#ff9a4a':'#ffd27a'),transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false}));
      s.scale.setScalar(.25); s.visible=false; tob.add(s); embers.push({s,ph:Math.random()*TAU,sp:.6+Math.random()*.8,x:(Math.random()-.5)*.6,z:(Math.random()-.5)*.4,y:.3+Math.random()*1.5}); }
    built=true; return true;
  }catch(e){ console.error('northFireStory build',e); return false; }
}
function place(mode,at){
  T.mode=mode; T.run=null; T.fly=null; T.grip=null; T.lie=0; T.lean=0;
  const s=at||SPOT.wall(); T.x=s.x; T.z=s.z; T.y=0;
  T.a=Math.atan2(T.x,T.z); T.r=Math.hypot(T.x,T.z);
  faceCentre();
}
function faceCentre(){ T.yaw=Math.atan2(-T.x,-T.z); }
function facePoint(lx,lz){ T.yaw=Math.atan2(lx-T.x,lz-T.z); }
function resetLook(){ T.burn=0; T.hook=false; T.lampK=1; T.lie=0; T.lean=0; }
/* run him to a local point; then call done */
function runTo(lx,lz,speed,done,back){ T.run={x:lx,z:lz,v:speed||5.5,done,back:!!back}; }
function updateRun(dt){
  const r=T.run; if(!r)return false;
  const dx=r.x-T.x, dz=r.z-T.z, d=Math.hypot(dx,dz), step=r.v*dt;
  if(d<=step||d<.05){ T.x=r.x; T.z=r.z; T.run=null; T.walk=0; const f=r.done; if(f)try{ f(); }catch(e){ console.error(e); } return false; }
  // round the pit, not through it: near the rim, the step turns along it (whichever way is shorter), and never inside it
  let ux=dx/d, uz=dz/d; const lim=PIT()+.8, rr=Math.hypot(T.x,T.z);
  if(rr<lim+.6&&rr>1e-3){ const nx=T.x/rr, nz=T.z/rr, inward=-(ux*nx+uz*nz);
    if(inward>0){ let sx=-nz, sz=nx; const cr=nx*dz-nz*dx; if(cr<0){ sx=-sx; sz=-sz; } const k=Math.min(1,inward*1.6); ux=ux*(1-k)+sx*k; uz=uz*(1-k)+sz*k; const ul=Math.hypot(ux,uz)||1; ux/=ul; uz/=ul; } }
  T.x+=ux*step; T.z+=uz*step;
  { const r2=Math.hypot(T.x,T.z); if(r2<lim){ if(r2<1e-3){ T.x=lim; } else { T.x*=lim/r2; T.z*=lim/r2; } } }
  if(!r.back)T.yaw=U.dampAngle(T.yaw,Math.atan2(ux,uz),12,dt); T.walk+=dt*r.v*2.2; return true;
}
const _gw=V();
function giantLocal(){ const g=GI(), p=g&&g.pos; if(!p||!isFinite(p.x))return null; return toL(p); }
function rowanLocal(){ const P=G.player; return P&&P.pos?toL(P.pos):V(0,0,R()-1.8); }

function pose(dt){
  if(!tob)return;
  const n=NF(); tob.visible=!!(n&&n.inside)&&T.mode!=='none'&&T.mode!=='gone';
  if(!tob.visible)return;
  T.t+=dt; const ud=tob.userData, aL=ud.armL, aR=ud.armR;
  const moving=updateRun(dt);
  let y=T.y, rx=T.lean, bob=0, armLx=0, armRx=-1.0, armLz=.12, armRz=-.25;
  if(moving){ bob=.05*Math.abs(Math.sin(T.walk)); armLx=.5*Math.sin(T.walk); armRx=-1.0+.3*Math.sin(T.walk+PI); }
  switch(T.mode){
    case 'feed': armRx=-1.0+.25*Math.sin(T.t*1.3); armLx=-.6-.3*Math.max(0,Math.sin(T.t*.9)); rx=.08; break;
    case 'cower': { const g=giantLocal(); if(g&&!moving)T.yaw=U.dampAngle(T.yaw,Math.atan2(g.x-T.x,g.z-T.z),3,dt);
      rx=-.12; y-= .08; armLx=-.9+.04*Math.sin(T.t*23); armRx=-1.2+.04*Math.sin(T.t*19); break; }
    case 'hook': { const g=giantLocal(); if(g&&!moving)T.yaw=U.dampAngle(T.yaw,Math.atan2(g.x-T.x,g.z-T.z),4,dt);
      rx=.06; armLx=-1.1+.05*Math.sin(T.t*17); break; }
    case 'help': { if(!moving){ const g=giantLocal(); if(g)T.yaw=U.dampAngle(T.yaw,Math.atan2(g.x-T.x,g.z-T.z),5,dt); }
      if(T.pullT>0){ T.pullT-=dt; armLx=armRx=-2.6+.4*Math.sin(T.pullT*12); } rx=.1; break; }
    case 'throw': armLx=-2.4; rx=.15; break;
    case 'haul': armLx=armRx=-2.8+.35*Math.sin(T.t*10); rx=-.1; break;
    case 'fly': { const f=T.fly; if(f){ f.t+=dt; const k=clamp(f.t/f.dur,0,1); T.x=lerp(f.x0,f.x1,k); T.z=lerp(f.z0,f.z1,k); y=Math.sin(k*PI)*1.6; rx=-1.2*k; if(k>=1){ T.fly=null; T.mode='down'; sfx('thud'); } } break; }
    case 'down': rx=-PI/2+.15; y=.18; armLx=-.4; armRx=-.3; break;
    case 'rise': { rx=lerp(-PI/2+.15,.1,smooth(0,1,T.t/1.2)); y=lerp(.18,0,smooth(0,1,T.t/1.2)); armRx=-1.0; break; }
    case 'grip': { const g=GI(), gl=giantLocal(); if(g&&gl){ const h=g.heading||0, s=g.scale||1;   // held against the white heart of it
        if(g.core&&T.t>.05){ T.x=tob.position.x+Math.sin(h)*.8*s; T.z=tob.position.z+Math.cos(h)*.8*s; y=tob.position.y+.15; }   // northfire.js clutch() holds him at its chest; a little out in front of its arms, so he's seen
        else { T.x=gl.x+Math.sin(h)*1.15*s; T.z=gl.z+Math.cos(h)*1.15*s; y=lerp(T.y,2.4*s,smooth(0,1,T.t/.8)); }
        T.yaw=h+PI; }
      rx=.2+.06*Math.sin(T.t*31); armLx=-2.2+.2*Math.sin(T.t*27); armRx=-2.0+.2*Math.sin(T.t*25); break; }
    case 'fallen': rx=-PI/2+.05; y=.12; armLx=-.9; armRx=.2; break;
    case 'keeper': { if(!moving&&T.face){ facePoint(T.face.x,T.face.z); } if(T.kneel){ y-=.32; rx=.25; armRx=-1.5; } break; }
    case 'dead': rx=-PI/2+.05; y=.12; armLx=-.9; armRx=.2; break;
  }
  tob.position.set(T.x,y+bob,T.z); tob.rotation.set(0,T.yaw,0); tob.rotateX(rx);
  if(aL){ aL.rotation.x=U.damp(aL.rotation.x,armLx,10,dt); aL.rotation.z=armLz; }
  if(aR){ aR.rotation.x=U.damp(aR.rotation.x,armRx,10,dt); aR.rotation.z=armRz; }
  if(hook)hook.visible=T.hook;
  // the fire on him
  const b=T.burn; if(ud.coat&&ud.coat0){ ud.coat.color.copy(ud.coat0).lerp(col('#17110d'),clamp(b,0,1)*.85); }
  if(burnLight)burnLight.intensity=b>0?(1.4+.6*Math.sin(T.t*13))*clamp(b,0,1):0;
  for(const e of embers){ e.s.visible=b>.05; if(!e.s.visible)continue; const k=(T.t*e.sp+e.ph)%1;
    e.s.position.set(e.x+.1*Math.sin(T.t*3+e.ph),e.y+k*.8,e.z); e.s.material.opacity=(1-k)*.85*clamp(b,0,1); e.s.scale.setScalar(.12+.22*(1-k)); }
  // his lamp
  const L=ud.lamp; if(L){ L.traverse(o=>{ if(o.isPointLight)o.intensity=1.6*T.lampK*(.85+.15*Math.sin(T.t*7)); if(o.isMesh&&o.material&&o.material.isMeshBasicMaterial)o.visible=T.lampK>.05; }); }
}

/* ================================================================ 3. CAMERA SHOTS (onboarding.js G.cine) */
function shot(id,dur,fn,onEnd){
  const C=G.cine; if(!C||!C.play)return false;
  let ok=false; try{ ok=!!C.play(id,{dur,shot:fn,onEnd}); }catch(e){ console.error(e); }
  return ok;
}
const headOf=()=>W(T.x,T.y+1.75,T.z);
/* a two-shot (local points a, b): from the side of the line between them, inside the room, looking a little toward a */
function frame2(a,b,o,dist,h,bias){
  const mx=(a.x+b.x)/2, mz=(a.z+b.z)/2; let px=-(b.z-a.z), pz=b.x-a.x; const pl=Math.hypot(px,pz)||1; px/=pl; pz/=pl;
  if(Math.hypot(mx+px*dist,mz+pz*dist)>Math.hypot(mx-px*dist,mz-pz*dist)){ px=-px; pz=-pz; }   // the side nearer the room's middle
  let cx=mx+px*dist, cz=mz+pz*dist; const rr=Math.hypot(cx,cz), lim=R()-1.2; if(rr>lim){ cx*=lim/rr; cz*=lim/rr; }
  const k=bias==null?.6:bias; o.cp.copy(W(cx,h,cz)); o.lp.copy(W(lerp(b.x,a.x,k),1.5,lerp(b.z,a.z,k))); }
/* a held camera for the endings' talk cards (a camera shot can't run under a card: the card's keys skip it). Set before the
   card opens (a card pauses the game, and the camera stays where it was put), and kept while the scene plays on after it */
let held=null;
/* a clear view of a local point: tries spots round it (from a preferred angle), keeps the first with no rubble, wall or
   giant between (the endings scatter the giant all over the floor), else the least blocked */
const _rc=new THREE.Raycaster();
function clearView(tx,ty,tz,a0,dist,h){
  const n=NF(); if(!n||!n.root)return null; const tgt=W(tx,ty,tz); let best=null, bestHits=1e9;
  const blockers=[]; n.root.traverse(o=>{ if(!o.isMesh||!o.visible||o.isSprite)return; let p=o; while(p){ if(p===tob)return; p=p.parent; } const m=o.material; if(m&&m.transparent&&m.opacity<.6)return; blockers.push(o); });
  for(let k=0;k<16;k++){ const a=a0+(k%2?1:-1)*Math.ceil(k/2)*TAU/16; let cx=tx+Math.sin(a)*dist, cz=tz+Math.cos(a)*dist; const rr=Math.hypot(cx,cz), lim=R()-2.6; if(rr>lim){ cx*=lim/rr; cz*=lim/rr; }
    if(Math.hypot(cx,cz)<PIT()+.3)continue;
    const c=W(cx,h,cz); let hits=0;
    for(const t2 of [tgt,W(T.x,.3,T.z)]){ const d=t2.clone().sub(c), L=d.length(); d.normalize(); _rc.set(c,d); _rc.near=.05; _rc.far=L-.35; _rc.camera=G.camera;
      try{ hits+=_rc.intersectObjects(blockers,false).length; }catch(e){ hits+=99; } }
    if(hits===0)return {cx,cz,h}; if(hits<bestHits){ bestHits=hits; best={cx,cz,h}; } }
  return best; }
function holdCam(fn){ held=fn; applyHeld(); }
function applyHeld(){ if(!held)return; const o={cp:V(),lp:V()}; try{ held(o); }catch(e){ held=null; return; }
  const cam=G.camera; cam.position.copy(o.cp); cam.lookAt(o.lp); cam.updateMatrixWorld(); }

/* ================================================================ 4. THE INTRO */
function arm(first){
  if(ST.armed||!inside())return; const n=NF(); if(!n||(n.state&&n.state.done))return;
  const g=GI(); if(!g)return; if(g.state&&g.state!=='dormant')return;
  if(!build())return;
  ST.armed=true; ST.hinted=false; ST.rescued=false; ST.rescueQueued=false; ST.ending=null; ST.helpCool=0;
  resetLook();
  if(!ST.introSeen)intro(); else retry(first);
}
function intro(){
  ST.scene='intro'; place('feed',SPOT.intro()); facePoint(0,0);   // at the pit's edge, off to the side of the flames, feeding it
  setQuest('north:fire','The fire room','Your father is up here with the fire',null,'');
  const P=G.player;
  // over Rowan's shoulder, on his father (not on the fire: the flames would hide him)
  try{ const r=rowanLocal(); if(P.aimCamera)P.aimCamera(Math.atan2(T.x-r.x,T.z-r.z)-.12,.16); }catch(e){}
  later(.9,()=>{ const r=rowanLocal(); facePoint(r.x,r.z); });   // he turns from the fire to the stair
  // the words first, on a card (it waits for the player: captions can't keep up with a scene this full)
  later(1.4,()=>{
    const card={who:'Knox',name:DAD,title:G.portraits&&G.portraits.title?G.portraits.title('knox'):'The wrecker',portrait:'knox',key:'nf:intro',
      lines:['I told you to go home.',R_('It said my name.'),'I heard it.','Twenty years I’ve fed it, so it would never have to learn that name.','It’s not having you.']};
    let ok=false; try{ ok=!!(G.talk&&G.talk.open&&G.talk.open(Object.assign(card,{onClose:()=>later(.3,introRise)}))); }catch(e){ console.error(e); }
    if(!ok){ card.lines.forEach(l=>say(typeof l==='string'?l:l.text,typeof l==='string'?DAD:'Rowan')); later(3,introRise); } });
}
function introRise(){
  if(ST.scene!=='intro')return; const P=G.player;
  shot('nf-intro',9,(k,t,o)=>{
    // low by the south-east wall, the pit in the middle of the frame and the north wall behind it, where he backs to
    const k2=smooth(.05,.5,k), a=PI*.3, c0=pol(a,R()-2.2), c1=pol(a+.12,R()-3.4);
    o.cp.copy(W(lerp(c0.x,c1.x,k2),lerp(1.6,2.6,k2),lerp(c0.z,c1.z,k2)));
    o.lp.copy(headOf()).lerp(W(0,lerp(2.2,4.6,smooth(.25,.9,k)),-.6),smooth(.0,.35,k));
    o.fov=52+4*k2;
  });
  later(.3,()=>say('Rowan Knox.',FIRE,{key:'nfI4'}));
  later(1.6,()=>{ T.mode='cower'; T.yaw=0; call(GI(),'rise',{short:false}); const w=SPOT.wall(); runTo(w.x,w.z,2.0,()=>{ T.mode='cower'; },true); });
  later(5.4,()=>say('Rock and burning timber and anchor chain, and for a face, a ship’s figurehead with the paint burned off.',null,{key:'nfI7'}));
  later(9.2,()=>{ ST.introSeen=true; ST.scene=null; fightQuest();
    try{ G.ui.toast('The Wreck Giant','Get it under a cistern and pull the chain · strike while it’s cold'); }catch(e){} });
  later(13,()=>{ if(fighting()&&!ST.rescued&&!ST.hinted&&!ST.scene)say('Rowan, the stair! Get back down the stair!',DAD,{key:'nfI8',priority:'normal'}); });
}
function retry(){
  ST.scene=null; place('cower',SPOT.wall());
  fightQuest();
  later(1.5,()=>{ if(!inside())return; const g=GI(); if(g&&g.state==='dormant')call(g,'rise',{short:true}); });
  const L=['Again? Son, the stair. Please.','Don’t. Don’t do this twice.','It’s coming up again. Rowan, go.'];
  later(2.4,()=>say(L[ST.attempt%L.length],DAD,{key:'nfR'+(ST.attempt%L.length)}));
}
function fightQuest(){ setQuest('north:fireFight','The Wreck Giant','Get it under a cistern and pull the chain, then strike while it’s cold',null,''); }

/* ================================================================ 5. THE HINT (3 hearts) */
function hint(){
  if(ST.rescued||ST.rescueQueued||ST.ending||!fighting())return;
  ST.scene='hint'; call(GI(),'hold',true);
  const id='nf-hint-'+ST.attempt, out=pol(PI,R()-2.8);
  shot(id,5.6,(k,t,o)=>{
    const h=headOf(), ang=Math.atan2(T.x,T.z), side=ang+.6, cx=Math.sin(side)*(R()-5.2), cz=Math.cos(side)*(R()-5.2);
    o.cp.copy(W(cx,1.5+.6*k,cz)); o.lp.copy(h).lerp(W(T.x*.6,1.6,T.z*.6),.15); o.fov=44-4*k;
  });
  later(.9,()=>{ T.hook=true; T.mode='hook'; sfx('clank'); });   // a boathook, down off the wall; his hands won't keep still
  later(1.2,()=>say('That’s my boy. Put him down once more, and I’m coming in there.',DAD,{key:'nfH1'}));
  later(2.4,()=>runTo(out.x,out.z,1.4,null,true));
  later(5.7,()=>{ if(ST.scene==='hint'){ ST.scene=null; call(GI(),'hold',false); } });
}

/* ================================================================ 6. THE RESCUE (1 heart) */
/* the filter: a blow that would leave him at 1 heart or less leaves him at exactly 1 (2 half-hearts), and his father steps in */
function hurtFilter(dmg,info){
  if(!inside()||!fighting()||ST.rescued||ST.ending)return null;
  const P=G.player; if(!P)return null;
  if(ST.rescueQueued)return 0;
  if(P.hp-dmg<=2){ ST.rescueQueued=true; later(.35,rescue); return Math.max(0,P.hp-2); }
  return null;
}
function rescue(){
  if(ST.rescued||ST.ending)return; ST.rescued=true; ST.rescueQueued=false; ST.scene='rescue';
  clearBeats(); const g=GI(); call(g,'hold',true);
  try{ if(G.cine&&G.cine.on&&G.cine.skip)G.cine.skip(); }catch(e){}
  const id='nf-rescue-'+ST.attempt;
  const feed=SPOT.feed();
  later(.05,()=>shot(id,8.6,(k,t,o)=>{   // the two of them, from the side and a little above: the deluge comes down between
    const g=giantLocal()||V(0,0,0); frame2(V(T.x,0,T.z),g,o,8.5-1.5*k,4.6-1.2*k,.45); o.lp.y=Ov().y+2.4; o.fov=54;
  }));
  T.hook=true; T.mode='throw';
  say('Here! It’s me you want, you bastard. It was always me!',DAD,{key:'nfS1'});
  later(.5,()=>{ T.hook=false; sfx('clank'); call(GI(),'lunge',W(T.x,0,T.z)); });
  later(.9,()=>{ T.mode='help'; runTo(feed.x,feed.z,6.2,()=>{ T.mode='haul'; facePoint(0,0); }); });
  later(2.7,()=>{ T.mode='haul'; });   // the great chain, up into the dark over the pit
  later(3.3,()=>{ const G_=GI(); if(G_){ call(G_,'douse',10,{by:'tobias',big:true}); call(G_,'setPhase',3); const mx=G_.maxHp||160; if(isFinite(G_.hp))call(G_,'setHp',Math.min(G_.hp,mx*.3)); }
    sfx('thud'); });
  later(4.8,()=>{ const w=SPOT.wall(); T.mode='fly'; T.fly={t:0,dur:.45,x0:T.x,z0:T.z,x1:w.x,z1:w.z}; T.burn=.15; });
  later(5.2,()=>say('Half the sea comes down on it. It swats him into the wall, and his coat catches.',null,{key:'nfS4'}));
  later(5.4,()=>{ T.burn=1; });
  later(6.6,()=>{ T.mode='rise'; T.t=0; });
  later(8.2,()=>T.mode='help');
  later(8.7,()=>{ if(ST.scene==='rescue'){ ST.scene=null; call(GI(),'hold',false); }
    say('Now, Rowan! Its heart, while it’s cold!',DAD,{key:'nfS6'});
    setQuest('north:fireTogether','The Wreck Giant','Your father’s on the cisterns. Break its heart while it’s cold',null,''); });
}
/* after the rescue: he walks the wall to the cistern nearest the giant and pulls it when it's under the spout */
const SHOUTS=['Under the spout! Bring it to me!','Cold now! Hit it!','Again, son! Again!','It’s slowing. Don’t you stop.'];
function helpAI(dt){
  if(T.mode!=='help'||ST.scene||ST.ending||T.run)return;
  const n=NF(), g=GI(); if(!n||!g||!fighting())return;
  ST.helpCool-=dt;
  const tanks=n.tanks||[]; if(!tanks.length)return;
  const gp=g.pos; if(!gp)return;
  let best=null, bd=1e9; for(const tk of tanks){ const c=tk.circlePos; if(!c)continue; const d=Math.hypot(c.x-gp.x,c.z-gp.z); if(d<bd){ bd=d; best=tk; } }
  if(!best||!best.chainPos)return;
  const cl=toL(best.chainPos), ta=Math.atan2(cl.x,cl.z), rr=R()-1.4;
  const da=U.angDiff(ta,T.a);
  if(Math.abs(da)>.06){ const w=4.6/rr; T.a+=clamp(da,-w*dt,w*dt); const p=pol(T.a,rr); const mx=p.x-T.x, mz=p.z-T.z; T.x=p.x; T.z=p.z; T.walk+=dt*6; T.yaw=Math.atan2(mx,mz)||T.yaw; return; }
  const inC=bd<(best.circleR||2.6)+.4, full=(best.level==null?1:best.level)>=.99;
  if(inC&&full&&ST.helpCool<=0&&!g.doused){ const ok=call(n,'pullTank',best.i!=null?best.i:tanks.indexOf(best),'tobias');
    if(ok!==false){ ST.helpCool=3.5; T.pullT=.7; if(ST.shout%2===0)say(SHOUTS[(ST.shout/2|0)%SHOUTS.length],DAD,{key:'nfHelp'+ST.shout}); ST.shout++; } }
}

/* ================================================================ 7. THE ENDINGS */
function onDown(){
  if(ST.ending||!inside())return; const n=NF(); if(n&&n.state&&n.state.done)return;
  clearBeats(); ST.ending=(ST.rescued||ST.rescueQueued)?'died':'lived'; ST.rescueQueued=false;
  ST.scene='ending'; call(GI(),'hold',true);
  try{ if(G.cine&&G.cine.on&&G.cine.skip)G.cine.skip(); }catch(e){}
  if(!build())return;
  if(T.mode==='none'||T.mode==='gone')place(ST.ending==='died'?'help':'cower',SPOT.wall());
  if(ST.ending==='died')died(); else lived();
}
function endShot(id,dur){
  later(.05,()=>shot(id,dur,(k,t,o)=>{
    const g=giantLocal()||V(0,0,0), r=rowanLocal(), mx=(g.x+r.x)/2, mz=(g.z+r.z)/2;
    let px=-(r.z-g.z), pz=r.x-g.x; const pl=Math.hypot(px,pz)||1; px/=pl; pz/=pl;
    if(Math.hypot(mx+px*6,mz+pz*6)>R()-1)px=-px,pz=-pz;   // stay inside the room
    const d=6.5-1.5*k, cx=mx+px*d, cz=mz+pz*d, rr=Math.hypot(cx,cz), lim=R()-1.2, s=rr>lim?lim/rr:1;
    o.cp.copy(W(cx*s,2.6+1.2*k,cz*s)); o.lp.copy(W(g.x*.7+r.x*.3,2.2,g.z*.7+r.z*.3)); o.fov=50;
    if(id==='nf-died'&&T.mode==='grip'&&tob){ // in its arms: in close, from Rowan's side, on him
      const tx=tob.position.x, tz=tob.position.z; let dx=r.x-tx, dz=r.z-tz; const dl=Math.hypot(dx,dz)||1; dx/=dl; dz/=dl;
      let qx=tx+dx*5.6-dz*2.6, qz=tz+dz*5.6+dx*2.6; const q=Math.hypot(qx,qz), lim2=R()-1.2; if(q>lim2){ qx*=lim2/q; qz*=lim2/q; }
      const m=smooth(0,.6,(T.t||0)); o.cp.lerp(W(qx,3.4+tob.position.y*.4,qz),m); o.lp.lerp(W(tx,tob.position.y+1.2,tz),m); o.fov=44; }   // back and above, over its fists
  }));
}
/* Rowan beside his father, the camera on him (the ending's card plays over this) */
function standBy(dist,away){
  const P=G.player; if(!P||!P.teleport)return; const r=away?V(T.x+(T.x-away.x),0,T.z+(T.z-away.z)):rowanLocal(), dx=r.x-T.x, dz=r.z-T.z, d=Math.hypot(dx,dz)||1;   // away: on his far side from the rubble, so the camera behind Rowan sees him
  let x=T.x+dx/d*dist, z=T.z+dz/d*dist; const rr=Math.hypot(x,z), lim=R()-1; if(rr>lim){ x*=lim/rr; z*=lim/rr; }
  if(Math.hypot(x,z)<PIT()+.7){ const k=(PIT()+.8)/(Math.hypot(x,z)||1); x*=k; z*=k; }
  const yaw=Math.atan2(T.x-x,T.z-z), w=W(x,0,z);
  try{ P.teleport(w.x,w.y,w.z,yaw); if(P.aimCamera)P.aimCamera(yaw,away?.62:.42); }catch(e){}
}
function died(){
  endShot('nf-died',9.2);
  say('It goes down on its knees, white-hot, and reaches for Rowan. It still wants him.',null,{key:'nfD1'});
  later(1.5,()=>{ const P=G.player; if(P&&P.pos)call(GI(),'lunge',P.pos.clone()); });
  later(1.9,()=>{ const g=giantLocal()||V(), r=rowanLocal(); const tx=lerp(g.x,r.x,.38), tz=lerp(g.z,r.z,.38);
    T.mode='help'; T.hook=false; runTo(tx,tz,7.5,()=>{ T.mode='grip'; T.t=0; T.y=0; const G_=GI(); call(G_,'grab',W(T.x,1.2,T.z)); call(G_,'clutch',tob); }); });
  later(3.6,()=>{ if(T.mode!=='grip'){ T.run=null; T.mode='grip'; T.t=0; call(GI(),'clutch',tob); } T.burn=1; });
  later(4.6,()=>say('His father steps in under its arms, and it takes him instead. It holds him against its heart, and he holds on.',null,{key:'nfD4'}));
  let gAt=null;
  later(6.6,()=>{ gAt=giantLocal()||V(tob.position.x,0,tob.position.z); call(GI(),'crumble'); sfx('thud'); T.mode='fallen'; T.y=0; T.burn=.6;
    // it comes apart and he's thrown clear of the rubble, toward Rowan (and never into the pit, never into the wall)
    const r=rowanLocal(); let dx=r.x-gAt.x, dz=r.z-gAt.z; let dl=Math.hypot(dx,dz); if(dl<.3){ dx=-gAt.x; dz=-gAt.z; dl=Math.hypot(dx,dz); } if(dl<.3){ dx=0; dz=1; dl=1; }
    dx/=dl; dz/=dl; ST.fall={dx,dz}; let x=gAt.x+dx*2.8, z=gAt.z+dz*2.8; const rr=Math.hypot(x,z), hi=R()-3.4, lo=PIT()+1.0;   // (not under the cisterns on the wall)
    if(rr>hi){ x*=hi/rr; z*=hi/rr; } else if(rr<lo){ const k=rr>.05?lo/rr:0; if(k){ x*=k; z*=k; } else { x=0; z=lo; } }
    T.x=x; T.z=z; T.yaw=Math.atan2(-dx,-dz); });   // on his back, his head toward Rowan (lying rotates his head out along -forward)
  later(10.0,()=>{ const P=G.player, f=ST.fall||{dx:0,dz:1}; let sx=-f.dz, sz=f.dx; if(Math.hypot(T.x+sx,T.z+sz)>Math.hypot(T.x-sx,T.z-sz)){ sx=-sx; sz=-sz; }
    ST.fallSide={sx,sz}; let x=T.x+sx*1.25, z=T.z+sz*1.25; if(Math.hypot(x,z)<PIT()+.8){ x=T.x+f.dx*1.25; z=T.z+f.dz*1.25; }   // Rowan beside him, on the room's side
    const w=W(x,0,z), yaw=Math.atan2(T.x-x,T.z-z); try{ P.teleport(w.x,w.y,w.z,yaw); }catch(e){} });
  later(10.4,()=>lastWords());
}
const R_=t=>({text:t,who:'Rowan'});
function lastWords(){
  ST.scene='lastWords'; T.burn=.5;
  // above him, on the wall side (the pit's steam and the rubble are toward the middle), looking down at him
  // from beyond him (the rubble behind the camera's back... no: behind him), Rowan kneeling at his other side
  { const f=ST.fall||{dx:0,dz:1}, sd=ST.fallSide||{sx:-f.dz,sz:f.dx};
    const hx=T.x+f.dx*1.2, hz=T.z+f.dz*1.2;   // his head and shoulders
    const a0=Math.atan2(f.dx-sd.sx*.8,f.dz-sd.sz*.8), v=clearView(hx,.35,hz,a0,2.3,4.0)||clearView(hx,.35,hz,a0,1.6,4.6)||{cx:hx+f.dx*1.6,cz:hz+f.dz*1.6,h:4.4};   // high, looking down on them: over the rubble
    holdCam(o=>{ o.cp.copy(W(v.cx,v.h,v.cz)); o.lp.copy(W(hx+sd.sx*.35-f.dx*.3,.4,hz+sd.sz*.35-f.dz*.3)); }); }
  const fin={id:'end',text:'…',next:()=>({lines:['When they come this way in the dark…','…give them something honest to steer by.'],choices:[{id:'bye',text:'Da.',action:()=>{}}]})};
  const card={who:'Knox',name:DAD,title:G.portraits&&G.portraits.title?G.portraits.title('knox'):'The wrecker',portrait:'knox',key:'nf:last',
    lines:['Rowan.',R_('I’m here.'),'Is it out?',R_('It’s out.'),'Good.','Twenty years I fed it other men’s sons, so it would leave mine alone.','And the one ship it really wanted was yours.'],
    choices:[
      {id:'boat',text:'Hold on. I’ll get you down to the boat.',next:{lines:['No. There’s not enough of me left to carry.','Don’t look at my hands, son. Look at me.'],choices:[fin]}},
      {id:'home',text:'You should have come home.',next:{lines:['I know.','Every night I stood up here and looked at the keeper’s lamp across the water.','Every night, I knew.'],choices:[fin]}}],
    onClose:()=>afterDeath()};
  let ok=false; try{ ok=!!(G.talk&&G.talk.open&&G.talk.open(card)); }catch(e){ console.error(e); }
  if(!ok){ card.lines.forEach(l=>say(typeof l==='string'?l:l.text,typeof l==='string'?DAD:'Rowan')); afterDeath(); }
}
function afterDeath(){
  if(ST.scene==='after')return; ST.scene='after';
  later(.6,()=>{ T.lampK=.4; say('The lamp in his hand gutters, and goes out. So does he.',null,{key:'nfE1'}); });
  later(2.2,()=>{ T.lampK=0; T.mode='dead'; T.burn=.15; });
  later(3.0,()=>finishUp('died'));
  later(6.2,()=>say('Goodbye, Da.','Rowan',{key:'nfE3'}));
  later(8.5,()=>{ held=null; });
  later(12,()=>{ T.burn=0; say('No light up here now. Nothing on this coast will steer for it again.','Rowan',{key:'nfE4'}); });
}
function lived(){
  endShot('nf-lived',7.2);
  say('It goes down on its knees, and the heart of it cracks like a hot stone dropped in a bucket.',null,{key:'nfL1'});
  later(2.0,()=>{ call(GI(),'crumble'); sfx('thud'); });   // rock, timber, chain, a figurehead with half a face; the pit sinks to embers
  later(3.4,()=>{ T.hook=false; const r=rowanLocal(), d=Math.hypot(r.x-T.x,r.z-T.z)||1, s=Math.max(0,d-2.2)/d;
    T.mode='keeper'; T.face=null; runTo(T.x+(r.x-T.x)*s,T.z+(r.z-T.z)*s,1.6,()=>{ T.face={x:r.x,z:r.z}; }); });
  later(8.2,()=>{ if(T.run){ T.x=T.run.x; T.z=T.run.z; T.run=null; } standBy(2.0); });
  later(8.4,()=>keeperTalk());
}
function keeperTalk(){
  ST.scene='keeperTalk'; const r=rowanLocal(); T.face={x:r.x,z:r.z}; facePoint(r.x,r.z);
  holdCam(o=>{ const rr=rowanLocal(); frame2(V(T.x,0,T.z),rr,o,3.6,1.9,.72); });
  const fin={id:'go',text:'I’ll look for it.',action:()=>{}};
  const card={who:'Knox',name:DAD,title:G.portraits&&G.portraits.title?G.portraits.title('knox'):'The wrecker',portrait:'knox',key:'nf:keeper',
    lines:['It’s out.','Twenty years it had me, and you put it out in an afternoon.',R_('Come home, Da.')],
    choices:[
      {id:'home',text:'They think you drowned. Let them see you.',next:{lines:['And look every widow in Wickham’s End in the eye?','They’d know whose light it was. They’d be right to.'],choices:[{id:'more',text:'Then what?',next:()=>staying(fin)}]}},
      {id:'did',text:'Do you know how many you put on those rocks?',next:{lines:['Every one. I wrote them down.','That’s why I’m staying.'],choices:[{id:'more',text:'Staying?',next:()=>staying(fin)}]}}],
    onClose:()=>afterLived()};
  let ok=false; try{ ok=!!(G.talk&&G.talk.open&&G.talk.open(card)); }catch(e){ console.error(e); }
  if(!ok){ card.lines.forEach(l=>say(typeof l==='string'?l:l.text,typeof l==='string'?DAD:'Rowan')); afterLived(); }
}
const staying=fin=>({lines:['I’ll keep a light on this rock. A true one.','One that shows them where the rocks are, instead of putting them there.','It won’t pay back a single one of them. I’ll keep it anyway.','Go home to your keeper’s girl. When you look north at night, you’ll see it.','It won’t be green.'],choices:[fin]});
function afterLived(){
  if(ST.scene==='after')return; ST.scene='after'; held=null;
  T.face={x:0,z:0}; const f=pol(PI,PIT()+.9);
  let lit=false; const relight=()=>{ if(lit)return; lit=true; T.face={x:0,z:0}; T.kneel=true;
    // in close, beside him: his face, the lamp, and what catches in the pit (the rubble's behind the camera, not in front)
    shot('nf-relight',8.4,(k,t,o)=>{ const a=Math.atan2(T.x,T.z)-.85, c=pol(a,PIT()+3.4);
      o.cp.copy(W(c.x,1.35+.5*k,c.z)); o.lp.copy(W(T.x*.55,1.0+.4*smooth(.3,.6,k),T.z*.55)); o.fov=48-4*k; });
    say('He kneels at the pit and holds his lamp down to the embers.',null,{key:'nfK1'});
    later(2.6,()=>{ call(NF(),'setFire','true'); say('What catches is gold. Not green.',null,{key:'nfK2'}); });
    later(5.2,()=>T.kneel=false);
    later(8,()=>say('That’s a keeper’s light.','Rowan',{key:'nfK3'})); };
  later(.4,()=>runTo(f.x,f.z,2.2,relight));
  later(12,relight);                       // (however he got there)
  later(3.0,()=>finishUp('lived'));
}
function finishUp(outcome){
  const n=NF(), g=GI(), pos=g&&g.pos?g.pos.clone():W(0,0,0);
  // the Keeper's Heart is left where it fell (progression.js): never in the pit, where Rowan can't reach it
  { const o=Ov(), lx=pos.x-o.x, lz=pos.z-o.z, rr=Math.hypot(lx,lz), lo=PIT()+1.4;
    if(rr<lo){ const r=rowanLocal(); let dx=lx, dz=lz; if(rr<.3){ dx=r.x; dz=r.z; } const dl=Math.hypot(dx,dz)||1; pos.x=o.x+dx/dl*lo; pos.z=o.z+dz/dl*lo; pos.y=o.y; } }
  if(outcome==='died')call(n,'setFire','out');
  call(n,'finish',outcome);
  ST.scene=null; ST.armed=false; call(g,'hold',false);
  try{ G.emit('north:giantDead',{pos,outcome}); }catch(e){ console.error(e); }
  homeQuest();
  try{ G.flow&&G.flow.writeSave&&later(3,()=>{ if(isPlay())G.flow.writeSave(); }); }catch(e){}
}
function homeQuest(){
  const n=NF(), o=n&&n.state&&n.state.outcome; if(!o)return;
  const NI=G.northIsle, m=NI&&NI.cove&&NI.cove.moor, tgt=m?V(m.x,1,m.z):null;
  setQuest('north:home','Sail home',o==='lived'?'Your father keeps the north light now':'The green light is out',tgt,'Your boat');
}
function setQuest(step,obj,sub,tgt,name){ try{ if(G.quest)G.quest.set(step,obj,sub,tgt,name); }catch(e){} }

/* after it's over: what's left in the room when you come back up */
function settle(){
  const n=NF(), o=n&&n.state&&n.state.outcome; if(!o||!build())return;
  if(o==='lived'){ if(T.mode!=='keeper'||ST.scene==null){ const f=pol(PI,PIT()+1.1); place('keeper',f); T.face={x:0,z:0}; T.kneel=false; T.burn=0; T.lampK=1; } }
  else { T.mode='gone'; }
}
const KEEPER_LINES=[['Go on home, son. I’ll keep it.'],['There’s a log on the shelf now. Wind, weather, what passed. No more of the other kind.'],['Tell the keeper’s girl her light’s got company.']];
function talkKeeper(){
  const L=KEEPER_LINES[ST.keeperTalks%KEEPER_LINES.length]; ST.keeperTalks++;
  const card={who:'Knox',name:DAD,title:'The keeper of the north light',portrait:'knox',lines:L.slice(),choices:[{id:'ok',text:'…',action:()=>{}}]};
  let ok=false; try{ ok=!!(G.talk&&G.talk.open&&G.talk.open(card)); }catch(e){}
  if(!ok)L.forEach(l=>say(l,DAD));
}

/* ================================================================ 8. EVENTS */
G.on('northFire:enter',()=>{ const n=NF(); if(n&&n.state&&n.state.done){ clearBeats(); ST.scene=null; settle(); homeQuest(); } });   // (a fight is armed by the update once the giant is dormant)
G.on('northFire:exit',()=>{ held=null; clearBeats(); ST.armed=false; ST.scene=null; if(T.mode!=='keeper')T.mode='none'; });
G.on('northFire:reset',e=>{
  const why=e&&e.why; held=null; clearBeats(); ST.scene=null; ST.armed=false; ST.ending=null;
  if(why==='death'){ ST.attempt++; }
  ST.hinted=false; ST.rescued=false; ST.rescueQueued=false; resetLook(); if(built)place('cower',SPOT.wall());
});
G.on('northFire:giantDown',()=>onDown());
G.on('northFire:douse',e=>{ if(e&&e.by==='rowan'&&!ST.said.douse&&!ST.rescued){ ST.said.douse=1; later(.8,()=>say('That’s it! That’s how I bank it!',DAD,{key:'nfDouse'})); } });
G.on('player:hurt',e=>{
  if(!inside()||!fighting()||ST.rescued||ST.rescueQueued||ST.hinted||ST.ending)return;
  const hp=e&&isFinite(e.hp)?e.hp:(G.player&&G.player.hp);
  if(hp<=6&&hp>2){ ST.hinted=true; later(.55,hint); }
});
G.on('game:reset',()=>{ clearBeats(); Object.assign(ST,{introSeen:false,attempt:0,hinted:false,rescued:false,rescueQueued:false,ending:null,scene:null,said:{},armed:false,keeperTalks:0}); T.mode='none'; resetLook(); });

/* ================================================================ 9. SAVE */
const reg=()=>G.persist&&G.persist.register&&G.persist.register('northFireStory',{
  save:()=>({v:1,introSeen:ST.introSeen,attempt:ST.attempt,keeperTalks:ST.keeperTalks}),
  load:d=>{ if(!d)return; ST.introSeen=!!d.introSeen; ST.attempt=d.attempt|0; ST.keeperTalks=d.keeperTalks|0; ST.armed=false; ST.scene=null; ST.ending=null; clearBeats(); }});
if(G.persist&&G.persist.register)reg(); else G.on('ready',reg);

/* ================================================================ 10. WIRING */
let wasInside=false;
G.system('northFireStory',{order:88,modes:['play','dead'],
  init(){
    try{ const P=G.player; if(P&&P.hurtFilters&&!P.hurtFilters.includes(hurtFilter))P.hurtFilters.push(hurtFilter); }catch(e){ console.error(e); }
    try{ G.interact.add({pos:()=>W(T.x,1,T.z),radius:2.4,priority:6,label:'Talk to your father',
      enabled:()=>isPlay()&&inside()&&T.mode==='keeper'&&!ST.scene&&!T.run&&!!(NF()&&NF().state&&NF().state.outcome==='lived'),use:talkKeeper}); }catch(e){ console.error(e); }
  },
  update(dt){
    dt=dt||0;
    if(G.state.mode==='play'){ clock+=dt;
      const due=[]; for(let i=beats.length-1;i>=0;i--){ if(clock>=beats[i].t){ due.push(beats[i]); beats.splice(i,1); } }
      due.sort((a,b)=>a.t-b.t); for(const b of due){ if(b.dead)continue; try{ b.fn(); }catch(e){ console.error('northFireStory beat',e); } } }
    try{ const P=G.player; if(P&&P.hurtFilters&&!P.hurtFilters.includes(hurtFilter))P.hurtFilters.push(hurtFilter); }catch(e){}
    const inN=inside();
    if(inN&&!wasInside){ build(); const n=NF(); if(n&&n.state&&n.state.done)settle(); }
    wasInside=inN;
    if(!inN){ if(tob)tob.visible=false; return; }
    // a fight that's dormant with nobody to start it (a save loaded inside, an event missed): start it
    const n=NF(), g=GI();
    if(n&&!(n.state&&n.state.done)&&g&&g.state==='dormant'&&!ST.armed&&isPlay()&&G.player&&G.player.alive!==false)arm(false);
    // the giant's down and nobody noticed the event
    if(g&&g.state==='down'&&!ST.ending)onDown();
    if(T.mode==='help')helpAI(dt);
    pose(G.state.mode==='play'?dt:0);
    if(held&&!(G.cine&&G.cine.on))applyHeld();
  }
});

G.northFireStory={ get attempt(){ return ST.attempt; }, get hinted(){ return ST.hinted; }, get rescued(){ return ST.rescued; }, get ending(){ return ST.ending; },
  get scene(){ return ST.scene; }, get tobias(){ return tob; }, get mode(){ return T.mode; }, state:ST,
  debug:{ T, ST, hint, rescue, onDown, arm, settle, hurtFilter, get beats(){ return beats.length; }, skipBeats(){ let n=0; while(beats.length&&n<200){ beats.sort((a,b)=>a.t-b.t); const b=beats.shift(); clock=Math.max(clock,b.t); try{ b.fn(); }catch(e){ console.error(e); } n++; } return n; } } };
})();
