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
const SPOT={feed:()=>pol(PI,PIT()+1.0),wall:()=>pol(PI,R()-1.4)};

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
  T.x+=dx/d*step; T.z+=dz/d*step; if(!r.back)T.yaw=U.dampAngle(T.yaw,Math.atan2(dx,dz),12,dt); T.walk+=dt*r.v*2.2; return true;
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
        T.x=gl.x+Math.sin(h)*1.15*s; T.z=gl.z+Math.cos(h)*1.15*s; y=lerp(T.y,2.4*s,smooth(0,1,T.t/.8)); T.yaw=h+PI; }
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
  ST.scene='intro'; place('feed',SPOT.feed()); T.yaw=0;   // across the pit, facing the stair Rowan just came up
  setQuest('north:fire','The fire room','Your father is up here with the fire',null,'');
  const P=G.player;
  shot('nf-intro',12.5,(k,t,o)=>{
    const pp=P.pos, k2=smooth(.5,.75,k);
    const near=V(pp.x+1.1,pp.y+2.0,pp.z+2.3), far=W(6.8,6.6,7.6);
    o.cp.copy(near).lerp(far,k2);
    o.lp.copy(headOf()).lerp(W(0,3.2+2.2*smooth(.62,1,k),0),k2);
    o.fov=46+8*k2;
  });
  later(.5,()=>say('He’s at the pit with an armful of broken planking, feeding it in. He doesn’t look up.',null,{key:'nfI0'}));
  later(2.6,()=>say('I told you to go home.',DAD,{key:'nfI1'}));
  later(4.4,()=>say('It said my name.','Rowan',{key:'nfI2'}));
  later(5.8,()=>say('I heard it.',DAD,{key:'nfI3'}));
  later(7.0,()=>say('Rowan Knox.',FIRE,{key:'nfI4'}));
  later(8.4,()=>{ T.mode='cower'; say('No. You’ve had twenty years of me. You don’t get him.',DAD,{key:'nfI5'}); });
  later(9.6,()=>{ call(GI(),'rise',{short:false}); say('The fire stands up out of the pit.',null,{key:'nfI6'});
    const w=SPOT.wall(); runTo(w.x,w.z,2.0,()=>{ T.mode='cower'; },true); });
  later(12.2,()=>say('Rock and burning timber and anchor chain, and for a face, a ship’s figurehead with the paint burned off.',null,{key:'nfI7'}));
  later(13.6,()=>{ ST.introSeen=true; ST.scene=null; fightQuest();
    try{ G.ui.toast('The Wreck Giant','Get it under a cistern and pull the chain · strike while it’s cold'); }catch(e){} });
  later(16,()=>{ if(fighting()&&!ST.rescued)say('Rowan, the stair! Get back down the stair!',DAD,{key:'nfI8'}); });
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
  const id='nf-hint-'+ST.attempt;
  const w=SPOT.wall(), out=pol(PI,R()-2.8);
  shot(id,5.6,(k,t,o)=>{
    const h=headOf(), ang=Math.atan2(T.x,T.z), side=ang+.6, cx=Math.sin(side)*(R()-5.2), cz=Math.cos(side)*(R()-5.2);
    o.cp.copy(W(cx,1.5+.6*k,cz)); o.lp.copy(h).lerp(W(T.x*.6,1.6,T.z*.6),.15); o.fov=44-4*k;
  });
  say('That’s my boy you’re hitting.',DAD,{key:'nfH1'});
  later(1.6,()=>{ T.hook=true; T.mode='hook'; say('He pulls a boathook down off the wall. His hands won’t keep still.',null,{key:'nfH2'}); });
  later(2.4,()=>runTo(out.x,out.z,1.4,null,true));
  later(3.6,()=>say('Put him down once more and I’m coming in there.',DAD,{key:'nfH3'}));
  later(5.7,()=>{ if(ST.scene==='hint'){ ST.scene=null; call(GI(),'hold',false); } });
  void w;
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
  later(.05,()=>shot(id,8.6,(k,t,o)=>{
    o.cp.copy(W(lerp(0,3.5,k),10.5-2*k,R()-1.6)); o.lp.copy(W(0,1.4,-2.2)); o.fov=56;
  }));
  T.hook=true; T.mode='throw';
  say('Here! Here, you bastard! It’s me you want. It was always me!',DAD,{key:'nfS1'});
  later(.5,()=>{ T.hook=false; sfx('clank'); const gw=GI()&&GI().pos; if(gw)call(GI(),'lunge',W(T.x,0,T.z)); });
  later(.9,()=>{ T.mode='help'; runTo(feed.x,feed.z,6.2,()=>{ T.mode='haul'; facePoint(0,0); }); });
  later(2.7,()=>{ T.mode='haul'; say('He throws his weight on a chain that runs up into the dark over the pit.',null,{key:'nfS2'}); });
  later(3.3,()=>{ const G_=GI(); if(G_){ call(G_,'douse',10,{by:'tobias',big:true}); call(G_,'setPhase',3); const mx=G_.maxHp||160; if(isFinite(G_.hp))call(G_,'setHp',Math.min(G_.hp,mx*.3)); }
    sfx('thud'); say('The roof cistern opens, and half the sea comes down on the fire.',null,{key:'nfS3'}); });
  later(4.8,()=>{ const gl=giantLocal()||V(0,0,0); const w=SPOT.wall(); T.mode='fly'; T.fly={t:0,dur:.45,x0:T.x,z0:T.z,x1:w.x,z1:w.z};
    T.burn=.15; say('It swats him into the wall like a dog off a step. His coat catches.',null,{key:'nfS4'}); void gl; });
  later(5.4,()=>{ T.burn=1; });
  later(6.6,()=>{ T.mode='rise'; T.t=0; });
  later(7.4,()=>say('He gets up. He’s burning, and he gets up anyway.',null,{key:'nfS5'}));
  later(8.2,()=>{ T.mode='help'; say('Now, Rowan! Its heart, while it’s cold!',DAD,{key:'nfS6'}); });
  later(8.7,()=>{ if(ST.scene==='rescue'){ ST.scene=null; call(GI(),'hold',false); }
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
  if(Math.abs(da)>.06){ const w=3.0/rr; T.a+=clamp(da,-w*dt,w*dt); const p=pol(T.a,rr); const mx=p.x-T.x, mz=p.z-T.z; T.x=p.x; T.z=p.z; T.walk+=dt*6; T.yaw=Math.atan2(mx,mz)||T.yaw; return; }
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
  }));
}
function died(){
  endShot('nf-died',9.2);
  say('It goes down on its knees. The heart of it is white, and getting whiter.',null,{key:'nfD1'});
  later(1.5,()=>{ const P=G.player; if(P&&P.pos)call(GI(),'lunge',P.pos.clone()); say('It reaches for Rowan. It still wants him.',null,{key:'nfD2'}); });
  later(1.9,()=>{ say('No.',DAD,{key:'nfD3'}); const g=giantLocal()||V(), r=rowanLocal(); const tx=lerp(g.x,r.x,.38), tz=lerp(g.z,r.z,.38);
    T.mode='help'; T.hook=false; runTo(tx,tz,7.5,()=>{ T.mode='grip'; T.t=0; T.y=0; const G_=GI(); call(G_,'grab',W(T.x,1.2,T.z)); call(G_,'clutch',tob); }); });
  later(3.6,()=>{ if(T.mode!=='grip'){ T.run=null; T.mode='grip'; T.t=0; call(GI(),'clutch',tob); } T.burn=1;
    say('He steps in under its arms, and it takes him instead. It pulls him in against the white heart of it.',null,{key:'nfD4'}); });
  later(5.4,()=>say('He doesn’t scream. He holds on.',null,{key:'nfD5'}));
  later(6.6,()=>{ call(GI(),'crumble'); sfx('thud'); const gl=giantLocal()||V(T.x,0,T.z); T.mode='fallen'; T.x=gl.x; T.z=gl.z; T.y=0; T.burn=.6;
    say('Then it comes apart. Rock, timber, chain, all of it, down in a heap, and the fire in the pit goes out like a slammed door.',null,{key:'nfD6'}); });
  later(10.4,()=>lastWords());
}
const R_=t=>({text:t,who:'Rowan'});
function lastWords(){
  ST.scene='lastWords'; T.burn=.35;
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
  later(.6,()=>{ T.lampK=.4; say('The lamp in his hand gutters.',null,{key:'nfE1'}); });
  later(2.0,()=>{ T.lampK=0; T.mode='dead'; T.burn=.15; say('Then it goes out, and so does he.',null,{key:'nfE2'}); });
  later(4.2,()=>say('Goodbye, Da.','Rowan',{key:'nfE3'}));
  later(6.4,()=>{ T.burn=0; say('No light up here now. Nothing on this coast will steer for it again.','Rowan',{key:'nfE4'}); });
  later(4.6,()=>finishUp('died'));
}
function lived(){
  endShot('nf-lived',7.2);
  say('It goes down on its knees, and the heart of it cracks like a hot stone dropped in a bucket.',null,{key:'nfL1'});
  later(2.0,()=>{ call(GI(),'crumble'); sfx('thud'); say('It comes apart: rock, timber, chain, a figurehead with half a face. The fire in the pit sinks to embers.',null,{key:'nfL2'}); });
  later(3.4,()=>{ T.hook=false; const r=rowanLocal(), d=Math.hypot(r.x-T.x,r.z-T.z)||1, s=Math.max(0,d-2.2)/d;
    T.mode='keeper'; T.face=null; runTo(T.x+(r.x-T.x)*s,T.z+(r.z-T.z)*s,1.6,()=>{ T.face={x:r.x,z:r.z}; }); });
  later(8.4,()=>keeperTalk());
}
function keeperTalk(){
  ST.scene='keeperTalk'; const r=rowanLocal(); T.face={x:r.x,z:r.z};
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
  if(ST.scene==='after')return; ST.scene='after';
  T.face={x:0,z:0}; const f=pol(PI,PIT()+.9);
  later(.4,()=>runTo(f.x,f.z,1.4,()=>{ T.face={x:0,z:0}; T.kneel=true; }));
  later(1.0,()=>say('He kneels at the pit and holds his lamp down to the embers.',null,{key:'nfK1'}));
  later(3.6,()=>{ call(NF(),'setFire','true'); say('What catches is gold. Not green.',null,{key:'nfK2'}); });
  later(5.4,()=>{ T.kneel=false; say('That’s a keeper’s light.','Rowan',{key:'nfK3'}); });
  later(4.0,()=>finishUp('lived'));
}
function finishUp(outcome){
  const n=NF(), g=GI(), pos=g&&g.pos?g.pos.clone():W(0,0,0);
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
G.on('northFire:exit',()=>{ clearBeats(); ST.armed=false; ST.scene=null; if(T.mode!=='keeper')T.mode='none'; });
G.on('northFire:reset',e=>{
  const why=e&&e.why; clearBeats(); ST.scene=null; ST.armed=false; ST.ending=null;
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
  }
});

G.northFireStory={ get attempt(){ return ST.attempt; }, get hinted(){ return ST.hinted; }, get rescued(){ return ST.rescued; }, get ending(){ return ST.ending; },
  get scene(){ return ST.scene; }, get tobias(){ return tob; }, get mode(){ return T.mode; }, state:ST,
  debug:{ T, ST, hint, rescue, onDown, arm, settle, hurtFilter, get beats(){ return beats.length; }, skipBeats(){ let n=0; while(beats.length&&n<200){ beats.sort((a,b)=>a.t-b.t); const b=beats.shift(); clock=Math.max(clock,b.t); try{ b.fn(); }catch(e){ console.error(e); } n++; } return n; } } };
})();
