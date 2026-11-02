/* =====================================================================
   flow.js — quest beats, checkpoints, pickups, title camera, pause/death
   ===================================================================== */
(function(){
'use strict';
const G=window.G, THREE=G.THREE, U=G.U;
const $=s=>document.getElementById(s);
const V=(x,y,z)=>new THREE.Vector3(x,y,z);
const LM=()=>G.world.landmarks||{};
const lmV=(k,fb)=>{const l=LM()[k]; return l?V(l.x,l.y,l.z):fb.clone();};

/* ---------- shared hooks for the core-loop modules (fog.js, alchemy.js, moths.js) ----------
   G.persist.register(key,{save:()=>json, load:(json)=>void}) — included in every save, restored on Continue.
   G.quest.set(step, objective, sub, targetVector3|null, targetName) — set the objective + HUD marker.
   G.loop.active — true once the core loop has begun (after the Hollow Stag falls); emits 'loop:start'. */
const persist={};
G.persist={register(key,h){persist[key]=h;}, get keys(){return Object.keys(persist);}};
G.loop={active:false};
function startLoop(restored){
  if(G.loop.active)return; G.loop.active=true; G.flag('loop',true);
  G.emit('loop:start',{restored:!!restored});
}
/* quest target for the HUD marker */
G.quest={target:null,targetName:'',step:'start',set:(...a)=>setStep(...a)};
function setStep(step,objective,sub,target,targetName){
  G.quest.step=step; G.quest.target=target||null; G.quest.targetName=targetName||'';
  G.ui.objective(objective,sub||'');
}

/* ---------- pickups ---------- */
const pickups=[];
function heartMesh(){
  const s=new THREE.Shape(); s.moveTo(0,-.32); s.bezierCurveTo(-.45,-.05,-.36,.3,0,.14); s.bezierCurveTo(.36,.3,.45,-.05,0,-.32);
  const g=new THREE.ExtrudeGeometry(s,{depth:.12,bevelEnabled:true,bevelThickness:.04,bevelSize:.04,bevelSegments:2}); g.center();
  const m=new THREE.Mesh(g,G.toon('#d0465f',{emissive:'#7a1428',emissiveIntensity:.6})); G.outline(m,{thickness:.02});
  const glow=new THREE.Sprite(new THREE.SpriteMaterial({map:G.tex.soft,color:0xff6a88,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,opacity:.6}));
  glow.scale.setScalar(1.3); const grp=new THREE.Group(); grp.add(m,glow); return grp;
}
G.pickups={
  spawn(kind,pos){
    if(kind!=='heart')return null;
    const mesh=heartMesh(); mesh.position.copy(pos); mesh.position.y+=.6; G.scene.add(mesh);
    const p={kind,mesh,pos:mesh.position,life:30,t:0,vy:3}; pickups.push(p); return p;
  }
};
/* glowing mushrooms from world.js become healing pickups that regrow */
let shrooms=[];
function initShrooms(){
  const list=LM().mushrooms||[];
  shrooms=list.map((m,i)=>({pos:V(m.x,m.y,m.z),mesh:(G.world.mushroomMeshes||[])[i]||null,regrow:0}));
}
function updatePickups(dt){
  const P=G.player; if(!P||!P.pos)return;
  for(let i=pickups.length-1;i>=0;i--){
    const p=pickups[i]; p.t+=dt; p.life-=dt;
    const floor=G.floorAt(p.pos.x,p.pos.z,p.pos.y)+.45;
    p.vy-=12*dt; p.pos.y+=p.vy*dt; if(p.pos.y<floor){p.pos.y=floor;p.vy=0;}
    p.mesh.children[0].rotation.y+=dt*2.2; p.mesh.children[0].position.y=Math.sin(p.t*3)*.08;
    const d=Math.hypot(p.pos.x-P.pos.x,p.pos.z-P.pos.z);
    if(d<1.4&&Math.abs(p.pos.y-P.pos.y)<2.2&&P.alive){ P.heal(2); G.emit('pickup',{kind:'heart'}); G.scene.remove(p.mesh); pickups.splice(i,1); continue; }
    if(p.life<4)p.mesh.visible=Math.floor(p.t*8)%2===0;
    if(p.life<=0){G.scene.remove(p.mesh);pickups.splice(i,1);}
  }
  for(const s of (G.alchemy&&G.alchemy.ownsMushrooms)?[]:shrooms){
    if(s.regrow>0){ s.regrow-=dt; if(s.regrow<=0&&s.mesh)s.mesh.visible=true; continue; }
    const d=Math.hypot(s.pos.x-P.pos.x,s.pos.z-P.pos.z);
    if(d<1.5&&Math.abs(s.pos.y-P.pos.y)<2&&P.hp<P.maxHp&&P.alive){
      P.heal(4); s.regrow=90; if(s.mesh)s.mesh.visible=false; G.emit('pickup',{kind:'mushroom'});
      if(!G.flag('ateShroom')){G.flag('ateShroom',true); G.ui.say('The mushroom glows the same violet as the lantern. Eating it, you feel steadier, as if something gave you back a little of yourself.');}
    }
  }
}

/* ---------- title / attract camera ---------- */
let attract=0;
function updateAttract(dt){
  attract+=dt*.035;
  const lh=lmV('lighthouse',V(180,42,0));
  // slow orbit out over the sea, keeping the tower in the right third (the parchment card sits on the left)
  const a=attract*0.8+0.2, R=70;
  const cx=lh.x+Math.cos(a)*R, cz=lh.z+Math.sin(a)*R;
  G.camera.position.set(cx, lh.y+10+Math.sin(attract*.6)*4, cz);
  const dx=lh.x-cx, dz=lh.z-cz, L=Math.hypot(dx,dz), rx=-dz/L, rz=dx/L;
  G.camera.lookAt(lh.x-rx*16, lh.y+11, lh.z-rz*16);
  G.focus.set(lh.x,lh.y,lh.z);
}

/* ---------- beats ---------- */
let finaleArmed=false, finaleT=-1, bossDead=false, endingT=-1, sawDoor=false;
function lighthouseDoor(){const lh=G.world.lighthouse; return lh&&lh.doorOut?lh.doorOut.clone():lmV('lighthouse',V(180,42,0)).add(V(-5,0,0));}
function begin(fromSave){
  $('title').hidden=true; $('hud').hidden=false; $('pauseBtn').hidden=false;
  const save=fromSave===true?readSave():null;
  if(save){ G.setMode('play'); G.input.lockPointer(); applySave(save); setTimeout(()=>G.ui.say('You pick up where you left off: '+(save.objective||'the island')+'.'),500); return; }
  const st=LM().start||{x:164,y:42,z:-4,yaw:Math.PI/2};
  G.state.checkpoint.set(st.x,st.y,st.z); G.state.checkpointYaw=st.yaw; G.state.checkpointName='the lighthouse';
  if(G.player.teleport)G.player.teleport(st.x,st.y,st.z,st.yaw);
  G.setMode('play'); G.input.lockPointer();
  if(G.items.cloak&&!G.items.cloak.owned){
    setStep('cottage','Get out of the cold','There\u2019s a light in the keeper\u2019s cottage',cottageDoor(),'Cottage');
    setTimeout(()=>G.ui.say('You wake on cold stone at the top of a sea cliff, shivering. Fog is rolling in off the water. The great lamp of the lighthouse is dark, but there is warm light in the cottage windows.'),600);
  }else{
    setStep('door','Get inside the lighthouse','',lighthouseDoor(),'Lighthouse door');
    setTimeout(()=>G.ui.say('You wake on cold stone at the top of a sea cliff. Fog is rolling in off the water. Above you, the great lamp of the lighthouse is dark.'),600);
  }
}
function cottageDoor(){ const c=LM().cottageDoor||LM().cottage; return c?V(c.x,c.y,c.z):lmV('lighthouse',V(180,42,0)).add(V(-22,0,24)); }
function onCloak(){
  if(G.quest.step==='cottage'){
    setStep('door','Get inside the lighthouse','',lighthouseDoor(),'Lighthouse door');
    setTimeout(()=>G.ui.say('Warmer now. The lighthouse stands black against the dusk. Whatever happened here, it started up there.'),2600);
  }
  autosave();
}
function onDoorBlocked(){
  if(G.items.lantern.found||G.items.lantern.carried)return;
  if(G.quest.step==='door'||G.quest.step==='cottage'){
    const h=LM().halloran;
    setStep('light','Find a light','Someone stands on the cliff path',h?V(h.x,h.y,h.z):null,'The figure');
  }
}
function onTalk(e){
  if(!e||e.who!=='Halloran')return;
  if(!G.items.lantern.found&&(G.quest.step==='light'||G.quest.step==='door'||G.quest.step==='cottage')&&e.index>=2){
    const l=LM().lanternSpot||LM().resistingTree;
    setStep('forest','Find the keeper’s lantern','In the forest at the island’s western end',l?V(l.x,l.y,l.z):null,'The forest');
  }
}
function onLanternPickup(){
  if(G.flag('lanternBeat'))return; G.flag('lanternBeat',true); G.items.lantern.found=true;
  const t=LM().resistingTree||LM().lanternSpot;
  if(t){G.state.checkpoint.set(t.x+4,t.y,t.z+4);G.state.checkpointName='the Resisting Tree';}
  G.ui.toast('The Keeper’s Lantern','Its flame burns a bruised violet');
  setStep('return','Carry the lantern to the lighthouse','The doorway won’t stay dark with a light in hand',lighthouseDoor(),'Lighthouse');
}
function onTowerEnter(){
  if(['return','door','light','forest','cottage'].includes(G.quest.step)){
    setStep('climb','Climb to the lamp room','',null,'');
  }
}
function onLampPlaced(){ setStep('cure','Watch','',null,''); }
function onLampCured(){
  const lh=lmV('lighthouse',V(180,42,0));
  G.state.checkpoint.set(lh.x-8,lh.y,lh.z+2); G.state.checkpointName='the lighthouse';
  finaleArmed=true; finaleT=-1;
  if(!G.items.staff.owned) setStep('staff','Take the Keeper’s Staff','It hangs on the stairwell wall',G.items.staff.pos&&G.items.staff.pos.lengthSq()>0?G.items.staff.pos.clone():null,'Staff');
  else setStep('descend','Something is climbing the cliff','Go down and meet it',lighthouseDoor(),'Lighthouse door');
}
function updateFinale(dt){
  if(!finaleArmed||bossDead)return;
  const lh=G.world.lighthouse, inside=lh&&lh.inside?lh.inside(G.player.pos):false;
  if(G.quest.step==='staff'&&G.items.staff.owned) setStep('descend','Something is climbing the cliff','Go down and meet it',lighthouseDoor(),'Lighthouse door');
  if(finaleT<0&&G.items.staff.owned&&!inside){
    finaleT=0; G.emit('finale:start');
    G.ui.say('The fog answers the light. Something huge is coming up over the edge of the cliff, and it is not alone.');
    G.ui.toast('The Hollow Stag','The fog’s answer');
    setStep('finale','Defend the lighthouse','',null,'');
  }
}
function onBossDead(){
  bossDead=true; endingT=4.5;
  G.ui.say('The great shape comes apart into ash and the ash comes apart into nothing. Out over the water, the beam keeps turning.');
  setStep('done','The lamp burns','Explore the island freely',null,'');
}

/* ---------- saving ----------
   Auto-saves at milestones and every 45 s of calm play; manual save in the pause menu.
   Stored per browser (localStorage). Killed monsters and freed negatives reset on load. */
const SAVE_KEY='bq-save-v1';
const safePos=new THREE.Vector3(); let safeYaw=0, safeT=0, autoT=0, savedEl=null;
const arr=v=>v?[+v.x.toFixed(2),+v.y.toFixed(2),+v.z.toFixed(2)]:null;
function threatened(){ const P=G.player; if(!G.monsters||!G.monsters.list)return false;
  for(const m of G.monsters.list){ if(!m.alive||m.state==='idle'||m.state==='return'||m.state==='dying')continue; if(Math.hypot(m.pos.x-P.pos.x,m.pos.z-P.pos.z)<28)return true; } return false; }
function snapshot(){
  const L=G.items.lantern, P=G.player;
  return {v:1,at:Date.now(),step:G.quest.step,objective:$('obj').textContent,sub:$('objSub').textContent,
    target:arr(G.quest.target),targetName:G.quest.targetName,
    cp:arr(G.state.checkpoint),cpYaw:G.state.checkpointYaw||0,cpName:G.state.checkpointName||'',
    flags:Object.assign({},G.state.flags),
    pos:arr(safePos.lengthSq()>0?safePos:P.pos),yaw:safeYaw,hp:P.hp,maxHp:P.maxHp,
    lantern:{found:!!L.found,carried:!!L.carried,shut:!!L.shut,cured:!!L.cured,inCradle:!!L.inCradle,pos:arr(L.pos)},
    staff:!!G.items.staff.owned, cloak:!!(G.items.cloak&&G.items.cloak.owned),
    lampCured:!!(G.lighthouse&&G.lighthouse.cured), bossDead,
    freed:(G.creatures&&G.creatures.negatives)?G.creatures.negatives.map((n,i)=>n.dead?i:-1).filter(i=>i>=0):[],
    loop:G.loop.active, mods:Object.fromEntries(Object.entries(persist).map(([k,h])=>{ try{return [k,h.save()];}catch(e){return [k,null];} }))};
}
function writeSave(){
  if(G.state.mode!=='play'&&G.state.mode!=='paused'&&G.state.mode!=='ending')return false;
  try{ localStorage.setItem(SAVE_KEY,JSON.stringify(snapshot())); }catch(e){ return false; }
  if(savedEl){ savedEl.classList.add('show'); clearTimeout(savedEl._t); savedEl._t=setTimeout(()=>savedEl.classList.remove('show'),1600); }
  return true;
}
function autosave(){ setTimeout(writeSave,400); }
function readSave(){ try{ const d=JSON.parse(localStorage.getItem(SAVE_KEY)||'null'); return d&&d.v===1?d:null; }catch(_){ return null; } }
function applySave(d){
  const L=G.items.lantern, P=G.player, v3=a=>a?V(a[0],a[1],a[2]):null;
  Object.assign(G.state.flags,d.flags||{});
  if(d.cloak){ G.items.cloak=G.items.cloak||{}; G.items.cloak.owned=true; if(P.setCloak)P.setCloak(true); }
  L.found=d.lantern.found; L.shut=d.lantern.shut; L.carried=d.lantern.carried; L.inCradle=d.lantern.inCradle; L.cured=d.lantern.cured;
  if(d.lantern.pos)L.pos.set(d.lantern.pos[0],d.lantern.pos[1],d.lantern.pos[2]);
  if(d.staff){ if(G.lighthouse&&G.lighthouse.restoreStaff)G.lighthouse.restoreStaff(); else G.items.staff.owned=true; G.emit('staff:pickup',{restored:true}); }
  if(d.lampCured&&G.lighthouse&&G.lighthouse.restoreCured){ G.lighthouse.restoreCured(); G.emit('lamp:cured',{restored:true}); }
  // restoreCured() puts the lantern back in the lamp's cradle; in the core loop the player may have taken it out (e.g. saved in the sea cave)
  if(d.lampCured&&d.lantern&&d.lantern.carried&&!d.lantern.inCradle){ L.inCradle=false; L.carried=true; L.shut=!!d.lantern.shut; }
  bossDead=!!d.bossDead; if(bossDead){finaleArmed=false;}
  if(d.freed&&d.freed.length&&G.creatures&&G.creatures.restoreFreed){ G.creatures.restoreFreed(d.freed); G.state.freed=d.freed.length; }
  if(d.loop)startLoop(true);
  for(const k in (d.mods||{})){ if(persist[k]&&d.mods[k]!=null){ try{persist[k].load(d.mods[k]);}catch(e){console.error('load '+k,e);} } }
  if(d.cp){ G.state.checkpoint.set(d.cp[0],d.cp[1],d.cp[2]); G.state.checkpointYaw=d.cpYaw; G.state.checkpointName=d.cpName; }
  const p=d.pos||d.cp; if(p&&P.teleport)P.teleport(p[0],p[1],p[2],d.yaw||0);
  if(d.hp)P.hp=Math.max(2,Math.min(d.hp,P.maxHp));
  setStep(d.step,d.objective,d.sub,v3(d.target),d.targetName);
}
function ago(t){ const m=Math.round((Date.now()-t)/60000); return m<1?'just now':m<60?m+' min ago':Math.round(m/60)+' h ago'; }
function trackSafe(dt){
  const P=G.player; if(!P.pos||!P.alive)return;
  safeT-=dt; if(safeT>0)return; safeT=1;
  if(P.grounded!==false&&!threatened()){ safePos.copy(P.pos); safeYaw=P.heading||0; }
  autoT+=1; if(autoT>=45&&!threatened()){ autoT=0; writeSave(); }
}

/* ---------- death / pause ---------- */
function onDead(){
  setTimeout(()=>{ if(G.state.mode!=='dead')return; G.input.unlockPointer();
    $('deadText').textContent='Something in you refuses to come apart. You wake again at '+(G.state.checkpointName||'the lighthouse')+'.';
    $('dead').hidden=false; $('rise').focus(); },2000);
}
function rise(){
  $('dead').hidden=true;
  const c=G.state.checkpoint;
  if(G.player.respawn)G.player.respawn(c.clone(),G.state.checkpointYaw||0);
  G.setMode('play'); G.input.lockPointer();
}
let wasLocked=false, pausedAt=0;
function pause(){ if(G.state.mode!=='play')return; pausedAt=performance.now(); G.setMode('paused'); G.input.unlockPointer(); $('pause').hidden=false; $('saveNote').textContent=''; syncQuality(); $('resume').focus(); }
function syncQuality(){ document.querySelectorAll('#qualitySeg button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.q===G.quality.level)));
  document.querySelectorAll('#invertSeg button').forEach(b=>b.setAttribute('aria-pressed',String((b.dataset.invert==='1')===!!G.settings.invertY))); }
function resume(){ $('pause').hidden=true; G.setMode('play'); G.input.lockPointer(); }
document.addEventListener('pointerlockchange',()=>{
  const locked=document.pointerLockElement!=null;
  if(wasLocked&&!locked&&G.state.mode==='play'&&!G.isMobile)pause();
  wasLocked=locked;
});

/* ---------- system ---------- */
if(G.debug)G.debugStartLoop=()=>{ if(G.lighthouse&&G.lighthouse.restoreCured&&!G.lighthouse.cured){G.lighthouse.restoreCured();G.emit('lamp:cured',{restored:true});} G.items.staff.owned=true; if(G.lighthouse&&G.lighthouse.restoreStaff)G.lighthouse.restoreStaff(); G.emit('staff:pickup',{restored:true}); if(G.items.cloak){G.items.cloak.owned=true; G.player.setCloak&&G.player.setCloak(true);} bossDead=true; finaleArmed=false; startLoop(false); };
G.system('flow',{order:60,modes:'always',
  init(){
    initShrooms();
    savedEl=$('saved');
    const sv=readSave();
    if(sv){ $('continue').hidden=false; $('begin').textContent='New game'; $('begin').classList.add('ghost');
      $('saveInfo').hidden=false; $('saveInfo').textContent='Saved '+ago(sv.at)+' · '+(sv.objective||'')+'. Starting a new game replaces this save once it auto-saves.'; }
    $('continue').addEventListener('click',()=>begin(true));
    $('begin').addEventListener('click',()=>begin(false));
    $('pauseBtn').addEventListener('click',e=>{ e.preventDefault(); if(G.state.mode==='play')pause(); else if(G.state.mode==='paused')resume(); });
    $('saveBtn').addEventListener('click',()=>{ $('saveNote').textContent=writeSave()?'Saved. You can close the game and pick up here later.':'Couldn’t save: this browser is blocking storage.'; });
    $('quitBtn').addEventListener('click',()=>{ writeSave(); location.reload(); });
    document.querySelectorAll('#qualitySeg button').forEach(b=>b.addEventListener('click',()=>{ G.setQuality(b.dataset.q); syncQuality(); }));
    document.querySelectorAll('#invertSeg button').forEach(b=>b.addEventListener('click',()=>{ G.setInvertY(b.dataset.invert==='1'); syncQuality(); }));
    G.on('mode',e=>{ $('pauseBtn').hidden=!(e.mode==='play'||e.mode==='paused'); });
    document.addEventListener('visibilitychange',()=>{ if(document.hidden&&G.state.mode==='play'){ writeSave(); pause(); } });
    G.on('cloak:found',onCloak);
    ['lantern:pickup','staff:pickup','lamp:cured','boss:dead','player:respawn'].forEach(ev=>G.on(ev,d=>{ if(!(d&&d.restored))autosave(); }));
    $('resume').addEventListener('click',resume);
    $('rise').addEventListener('click',rise);
    $('keep').addEventListener('click',()=>{ $('ending').hidden=true; $('hud').hidden=false; G.setMode('play'); G.input.lockPointer(); startLoop(false); autosave(); });
    $('again').addEventListener('click',()=>location.reload());
    G.on('door:blocked',onDoorBlocked);
    G.on('talk',onTalk);
    G.on('lantern:pickup',onLanternPickup);
    G.on('tower:enter',onTowerEnter);
    G.on('lamp:placed',onLampPlaced);
    G.on('lamp:cured',onLampCured);
    G.on('boss:dead',onBossDead);
    G.on('player:dead',onDead);
    G.on('negative:freed',()=>{ G.state.freed=(G.state.freed||0)+1; G.ui.toast('A negative freed',G.state.freed+' of 8'); });
    const l=$('loading'); if(l)l.textContent='Ready when you are.';
  },
  update(dt){
    const mode=G.state.mode;
    if(mode==='title'){updateAttract(dt);return;}
    if(mode==='play'){
      if(G.input.pressed('pause'))pause();
      updatePickups(dt); updateFinale(dt); trackSafe(dt);
      if(endingT>0){ endingT-=dt; if(endingT<=0){ G.setMode('ending'); G.input.unlockPointer(); $('hud').hidden=true; $('ending').hidden=false; $('keep').focus(); } }
      // gentle nudge if the player wanders the cliff top without the light for a long time
      if(G.quest.step==='door'&&G.time>70&&!sawDoor){sawDoor=true;onDoorBlocked();}
    }else if(mode==='paused'){
      if(G.input.pressed('pause')&&performance.now()-pausedAt>350)resume();
    }
  }
});
})();
