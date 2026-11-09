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
      if(!G.flag('ateShroom')){G.flag('ateShroom',true); G.ui.say('The mushroom glows the same violet as the lantern. Eating it, you feel steadier, as if something gave you back a little of yourself.',{priority:'low'});}
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

/* ---------- beats (Act 1, v12) ----------
   cottage → door → light (Halloran) → storm (his storm lantern on the oil shed) → climb (staff on the way up) →
   failed (the ink drinks the plain flame; logbook on the sill) → halloran2 (he waits at the tower foot) →
   forest (the Hollow Stag guards Maren's lantern at the Resisting Tree) → return (the swarm follows) → ascend → cure →
   descend/finale ('finale:start'; finale_boss.js builds the Gloaming) → done on boss:dead {who:'gloaming'}. */
let finaleArmed=false, finaleT=-1, bossDead=false, endingT=-1, sawDoor=false, stagDead=false, cradleObj=false, halAway=false, halScene=null;
const storm=()=>G.items.storm||{};
function lighthouseDoor(){const lh=G.world.lighthouse; return lh&&lh.doorOut?lh.doorOut.clone():lmV('lighthouse',V(180,42,0)).add(V(-5,0,0));}
function stormHome(){ const h=G.world.lighthouse&&G.world.lighthouse.stormHome; return h?h.clone():lmV('shed',V(150,42,33)); }
function lanternSpot(){ return lmV('lanternSpot',V(-160,9,9)); }
/* where Halloran waits after the failure: a few steps west of the tower door, facing it */
function halTowerSpot(){ const d=lighthouseDoor(); return V(d.x-4.6,d.y,d.z+2.6); }
function halToTower(){ const C=G.creatures; if(!C||!C.halloranAt)return; const p=halTowerSpot(), d=lighthouseDoor(); C.halloranAt(p,Math.atan2(d.x-p.x,d.z-p.z)); halAway=true; }
function halHome(){ const C=G.creatures; if(halAway&&C&&C.halloranAt)C.halloranAt(null); halAway=false; }
function halPos(){ const h=G.creatures&&G.creatures.halloran; return h&&h.pos?h.pos.clone():lmV('halloran',V(124,42,16)); }
/* the Stag's clearing: rise point at its east edge (outside the arena, outside the 30 m trigger) */
function stagEdge(){ const t=LM().resistingTree||{x:-165,z:5}, x=t.x+39, z=t.z+2; return V(x,G.world.height(x,z),z); }
function begin(fromSave){
  $('title').hidden=true; $('hud').hidden=false; $('pauseBtn').hidden=false;
  const save=fromSave===true?readSave():(fromSave&&typeof fromSave==='object'?fromSave:null); // devtools.js passes a built save object
  if(save){ G.setMode('play'); G.input.lockPointer(); applySave(save); if(!save.quiet)setTimeout(()=>G.ui.say('You pick up where you left off: '+(save.objective||'the island')+'.'),500); return; }
  const st=LM().start||{x:164,y:42,z:-4,yaw:Math.PI/2};
  G.state.checkpoint.set(st.x,st.y,st.z); G.state.checkpointYaw=st.yaw; G.state.checkpointName='the lighthouse';
  if(G.player.teleport)G.player.teleport(st.x,st.y,st.z,st.yaw);
  G.setMode('play'); G.input.lockPointer();
  if(G.items.cloak&&!G.items.cloak.owned){
    setStep('cottage','Get out of the cold','There’s a light in the keeper’s cottage',cottageDoor(),'Cottage');
    setTimeout(()=>G.ui.say('You wake on cold stone at the top of a sea cliff, shivering. Fog is rolling in off the water. The great lamp of the lighthouse is dark, and something darker turns slowly around it. But there is warm light in the cottage windows.'),600);
  }else{
    setStep('door','Get inside the lighthouse','',lighthouseDoor(),'Lighthouse door');
    setTimeout(()=>G.ui.say('You wake on cold stone at the top of a sea cliff. Fog is rolling in off the water. Above you, the great lamp of the lighthouse is dark, and something darker turns slowly around it.'),600);
  }
}
function cottageDoor(){ const c=LM().cottageDoor||LM().cottage; return c?V(c.x,c.y,c.z):lmV('lighthouse',V(180,42,0)).add(V(-22,0,24)); }
function onCloak(){
  if(G.quest.step==='cottage'){
    if(storm().found)setStep('climb','Climb to the lamp room','The little flame will get you through the black doorway',lighthouseDoor(),'Lighthouse door');
    else setStep('door','Get inside the lighthouse','',lighthouseDoor(),'Lighthouse door');
    setTimeout(()=>G.ui.say('Warmer now. The lighthouse stands black against the dusk. Whatever happened here, it started up there.'),2600);
  }
  autosave();
}
function onDoorBlocked(){
  if(G.items.lantern.found||G.items.lantern.carried||storm().carried)return;
  if(G.quest.step==='door'||G.quest.step==='cottage'){
    if(storm().found&&!storm().spent){ setStep('storm','Take Halloran’s storm lantern','It hangs on the oil shed behind the cottage',stormHome(),'Storm lantern'); return; }
    const h=LM().halloran;
    setStep('light','Find a light','Someone stands on the cliff path',h?V(h.x,h.y,h.z):null,'The figure');
  }
}
function onTalk(e){
  if(!e||e.who!=='Halloran')return;
  const L=G.items.lantern;
  if(e.phase==='start'&&!storm().found&&['light','door','cottage'].includes(G.quest.step)&&e.index>=2)
    setStep('storm','Take Halloran’s storm lantern','It hangs on the oil shed behind the cottage',stormHome(),'Storm lantern');
  if(e.phase==='failed'&&!L.found&&['halloran2','failed'].includes(G.quest.step)&&e.index>=1){
    setStep('forest','Find Maren’s lantern',G.items.staff.owned?'At the old tree in the forest, far to the west':'Take the Keeper’s Staff from the stairwell first, then go west',lanternSpot(),'The old wood');
    autosave();
  }
}
function onStormPickup(e){
  if(!(e&&e.first))return;
  if(['cottage','door','light','storm'].includes(G.quest.step)||G.quest.step==='start')
    setStep('climb','Climb to the lamp room','The little flame will get you through the black doorway',lighthouseDoor(),'Lighthouse door');
  autosave();
}
function onStaffPickup(e){
  if(e&&e.restored)return;
  if(G.quest.step==='staff'&&!storm().failed&&!G.items.lantern.found){ cradleObj=false; setStep('climb','Climb to the lamp room','The cradle beneath the great lens',null,''); }
  if(G.quest.step==='forest'&&!G.items.lantern.found)setStep('forest','Find Maren’s lantern','At the old tree in the forest, far to the west',lanternSpot(),'The old wood');
}
function onLanternPickup(){
  if(G.flag('lanternBeat'))return; G.flag('lanternBeat',true); G.items.lantern.found=true;
  const t=LM().resistingTree||LM().lanternSpot;
  if(t){G.state.checkpoint.set(t.x+4,t.y,t.z+4);G.state.checkpointName='the Resisting Tree';}
  const T=storm();
  if(T.found&&!T.spent){ // Halloran's lantern stays behind in the roots, cold
    T.carried=false; T.inCradle=false; T.spent=true;
    const sp=lanternSpot(); T.pos.set(sp.x+.7,G.floorAt(sp.x+.7,sp.z-.6,sp.y+1),sp.z-.6);
    setTimeout(()=>G.ui.say('You leave Halloran’s storm lantern in the roots where hers lay. It did what a plain flame could.'),2600);
  }
  G.ui.toast('The Keeper’s Lantern','Its flame burns a bruised violet');
  setStep('return','Carry the lantern to the lighthouse','The moths have found it. Let them follow.',lighthouseDoor(),'Lighthouse');
}
function onTowerEnter(){
  const T=storm(), L=G.items.lantern;
  if(L.carried&&['return','door','light','forest','cottage','climb','storm','failed','halloran2'].includes(G.quest.step)){
    setStep('ascend','Climb to the lamp room','Set Maren’s lantern in the cradle',null,''); return; }
  if(T.carried&&!T.failed&&['climb','storm','light','door','cottage'].includes(G.quest.step)){
    if(!G.items.staff.owned) setStep('staff','Take the Keeper’s Staff','It hangs on the stairwell wall, partway up',G.items.staff.pos&&G.items.staff.pos.lengthSq()>0?G.items.staff.pos.clone():null,'Staff');
    else setStep('climb','Climb to the lamp room','The cradle beneath the great lens',null,'');
  }
}
function onTowerExit(){
  if(G.quest.step==='failed'&&storm().failed&&!G.items.lantern.found){
    halToTower();
    setStep('halloran2','Talk to Halloran','He’s waiting at the foot of the tower',halPos(),'Halloran');
    // a story moment: his card when it's calm (talk.js), the caption otherwise
    const scene={who:'HalloranScene',name:'Halloran',title:G.portraits?G.portraits.title('halloran'):'',portrait:'halloran',key:'halTower',
      lines:[{text:'Halloran is standing at the foot of the tower, as if he’s been waiting a while.',who:''},{text:'“Well,” he says. “I saw it go out from down here.”',who:'Halloran'}]};
    halScene={t:.4,o:scene};   // in game time (updateBeats), so it lands the same in a stepped test
  }
}
function onStormPlaced(){ setStep('failed','Watch','',null,''); }
function onLampFailed(){
  setStep('failed',G.items.staff.owned?'Go back down':'Take the staff on your way down',G.flag('logbook')?'The plain flame wasn’t enough':'Maren’s logbook lies open on the sill',null,'');
  halToTower(); autosave();
}
/* the forest: the Stag rises over the lantern when you come within ~30 m of it */
function updateForest(){
  const L=G.items.lantern, P=G.player; if(L.found||stagDead||!G.monsters||!G.monsters.startStag)return;
  const sp=lanternSpot(), d=Math.hypot(P.pos.x-sp.x,P.pos.z-sp.z);
  if(G.monsters.boss)return;
  if(d>30||!P.alive)return;
  G.monsters.startStag();
  const e=stagEdge(); G.state.checkpoint.copy(e); G.state.checkpointYaw=-Math.PI/2; G.state.checkpointName='the edge of the old wood';
  if(!G.flag('stagSeen')){ G.flag('stagSeen',true);
    G.ui.say('Something vast stands up out of the roots: a stag made of absence, its crown burning with ink. It plants itself over the violet light.',{priority:'high'});
    G.ui.toast('The Hollow Stag','It guards Maren’s lantern'); }
  if(!G.items.staff.owned)setTimeout(()=>G.ui.say('It watches you, and waits. Not with empty hands. The Keeper’s Staff still hangs in the tower.',{key:'stagStaff'}),3800);
  setStep('forest','Take back Maren’s lantern','The Hollow Stag stands over it',sp,'Lantern');
}
function onStagDead(){
  if(stagDead)return; stagDead=true; G.flag('stagDead',true);
  G.ui.say('The Stag comes apart like smoke in a high wind. Among the roots, the violet lantern is still burning.',{priority:'high'});
  setStep('forest','Take Maren’s lantern','It lies in the roots of the old tree',lanternSpot(),'Lantern');
  autosave();
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
    G.ui.say('The fog answers the light. Something vast is dragging itself up over the edge of the cliff, and the beam passes right through it.',{priority:'high'});
    setStep('finale','Defend the lighthouse','Only the beam makes it solid',null,'');
  }
}
function onBossDead(e){
  const who=e&&e.who;
  if(who==='stag'){ onStagDead(); return; }
  if(who!=='gloaming')return; // only the Gloaming ends the act
  if(bossDead)return;
  bossDead=true; endingT=4.5; autosave();
  G.ui.say('Caught in the light, the fog giant comes loose from the bottom up and rises into the beam like breath into a lamp. Then there is only the beam, turning, and the fog lifting off the water.',{priority:'high'});
  setStep('done','The lamp burns','Explore the island freely',null,'');
}
function updateBeats(dt){
  const T=storm(), P=G.player, lh=G.world.lighthouse;
  if(halScene&&(halScene.t-=dt||0)<=0){ const sc=halScene.o; halScene=null;
    if(G.talk&&G.talk.moment)G.talk.moment(sc); else G.ui.say(sc.lines[0].text+' '+sc.lines[1].text,{priority:'high'}); }
  // in the lamp room with the plain flame: say where it goes
  if(!cradleObj&&T.carried&&!T.failed&&lh&&lh.inRoom&&lh.inRoom(P.pos)&&['climb','staff'].includes(G.quest.step)){
    cradleObj=true; setStep('climb','Set the storm lantern in the cradle','Beneath the great lens',lh.cradlePos?lh.cradlePos.clone():null,'Cradle'); }
  // Halloran goes back to his barrel once you've set off west
  if(halAway&&!['failed','halloran2'].includes(G.quest.step)&&lh&&Math.hypot(P.pos.x-lh.x,P.pos.z-lh.z)>90)halHome();
  updateForest();
}

/* ---------- saving ----------
   Auto-saves at milestones and every 45 s of calm play; manual save in the pause menu.
   Stored per browser (localStorage). Killed monsters and freed negatives reset on load. */
const SAVE_KEY='bq-save-v1', TEST_KEY='bq-save-test-v1'; // devtools.js sets G.testSaves: this session then saves to the test slot only
const saveKey=()=>G.testSaves?TEST_KEY:SAVE_KEY;
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
    storm:(()=>{const T=storm(); return {found:!!T.found,carried:!!T.carried,inCradle:!!T.inCradle,failed:!!T.failed,spent:!!T.spent,pos:arr(T.pos)};})(), stagDead,
    lampCured:!!(G.lighthouse&&G.lighthouse.cured), bossDead,
    freed:(G.creatures&&G.creatures.negatives)?G.creatures.negatives.map((n,i)=>n.dead?i:-1).filter(i=>i>=0):[],
    loop:G.loop.active, mods:Object.fromEntries(Object.entries(persist).map(([k,h])=>{ try{return [k,h.save()];}catch(e){return [k,null];} }))};
}
function writeSave(){
  if(G.state.mode!=='play'&&G.state.mode!=='paused'&&G.state.mode!=='ending')return false;
  try{ localStorage.setItem(saveKey(),JSON.stringify(snapshot())); }catch(e){ return false; }
  G.emit('save:written',{test:!!G.testSaves});
  if(savedEl){ savedEl.classList.add('show'); clearTimeout(savedEl._t); savedEl._t=setTimeout(()=>savedEl.classList.remove('show'),1600); }
  return true;
}
function autosave(){ setTimeout(writeSave,400); }
function readSave(key){ try{ const d=JSON.parse(localStorage.getItem(key||SAVE_KEY)||'null'); return d&&d.v===1?d:null; }catch(_){ return null; } }
function applySave(d){
  const L=G.items.lantern, P=G.player, v3=a=>a?V(a[0],a[1],a[2]):null;
  Object.assign(G.state.flags,d.flags||{});
  if(d.cloak){ G.items.cloak=G.items.cloak||{}; G.items.cloak.owned=true; if(P.setCloak)P.setCloak(true); }
  L.found=d.lantern.found; L.shut=d.lantern.shut; L.carried=d.lantern.carried; L.inCradle=d.lantern.inCradle; L.cured=d.lantern.cured;
  if(d.lantern.pos)L.pos.set(d.lantern.pos[0],d.lantern.pos[1],d.lantern.pos[2]);
  if(d.staff){ if(G.lighthouse&&G.lighthouse.restoreStaff)G.lighthouse.restoreStaff(); else G.items.staff.owned=true; G.emit('staff:pickup',{restored:true}); }
  // Halloran's storm lantern (v12). Older saves have none: anything from the forest on implies the plain flame already failed.
  const T=storm();
  if(T.pos){
    if(d.storm){ T.found=!!d.storm.found; T.carried=!!d.storm.carried; T.failed=!!d.storm.failed; T.spent=!!d.storm.spent; T.inCradle=false;
      if(d.storm.inCradle&&!T.failed)T.carried=true; // saved mid-failure: it's back in your hand, the cradle waits
      if(d.storm.pos&&!T.carried)T.pos.set(d.storm.pos[0],d.storm.pos[1],d.storm.pos[2]); }
    else{
      const past=(d.lantern&&(d.lantern.found||d.lantern.inCradle))||d.lampCured||d.loop||['forest','return','climb','ascend','cure','staff','descend','finale','done'].includes(d.step);
      if(past){ T.found=true; T.failed=true; T.carried=false; T.spent=true; G.state.flags.stormFailed=true;
        const sp=lanternSpot(); T.pos.set(sp.x+.7,G.floorAt(sp.x+.7,sp.z-.6,sp.y+1),sp.z-.6); }
    }
    if(T.failed&&G.lighthouse&&G.lighthouse.restoreFailed)G.lighthouse.restoreFailed();
  }
  stagDead=!!(d.stagDead||(d.flags&&d.flags.stagDead));
  // the lamp was cured but the act isn't over: the finale (the Gloaming since v12) starts again when you step outside
  if(d.lampCured&&!d.bossDead&&!d.loop&&d.step!=='done'){ d=Object.assign({},d,{step:'descend',objective:'Something is climbing the cliff',sub:'Go down and meet it',target:arr(lighthouseDoor()),targetName:'Lighthouse door'}); }
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
  cradleObj=d.objective==='Set the storm lantern in the cradle';
  if(d.step==='failed'||d.step==='halloran2'){ halToTower(); if(d.step==='halloran2')G.quest.target=halPos(); }
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
function pause(){ if(G.state.mode!=='play')return; pausedAt=performance.now(); if(G.ui.pauseTab)G.ui.pauseTab('main'); G.setMode('paused'); G.input.unlockPointer(); $('pause').hidden=false; $('saveNote').textContent=''; syncQuality(); $('resume').focus(); }
function syncQuality(){ document.querySelectorAll('#qualitySeg button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.q===G.quality.level)));
  document.querySelectorAll('#invertSeg button').forEach(b=>b.setAttribute('aria-pressed',String((b.dataset.invert==='1')===!!G.settings.invertY))); }
function resume(){ $('pause').hidden=true; G.setMode('play'); G.input.lockPointer(); }
document.addEventListener('pointerlockchange',()=>{
  const locked=document.pointerLockElement!=null;
  // (a conversation card unlocks the pointer; if it was closed before the unlock landed, that unlock isn't a pause)
  if(wasLocked&&!locked&&G.state.mode==='play'&&!G.isMobile&&!(G.talk&&performance.now()-G.talk.closedAt<800))pause();
  wasLocked=locked;
});

/* ---------- system ---------- */
if(G.debug)G.debugStartLoop=()=>{ if(G.lighthouse&&G.lighthouse.restoreCured&&!G.lighthouse.cured){G.lighthouse.restoreCured();G.emit('lamp:cured',{restored:true});} G.items.staff.owned=true; if(G.lighthouse&&G.lighthouse.restoreStaff)G.lighthouse.restoreStaff(); G.emit('staff:pickup',{restored:true}); if(G.items.cloak){G.items.cloak.owned=true; G.player.setCloak&&G.player.setCloak(true);} const T=storm(); if(T.pos&&!T.spent){T.found=T.failed=T.spent=true;T.carried=false;} stagDead=true; bossDead=true; finaleArmed=false; startLoop(false); };
/* the title's Continue button and save line, from whatever save is in this browser (cloud.js calls it again after pulling a newer save) */
function refreshTitle(){
  const sv=readSave(), c=$('continue'), b=$('begin'), info=$('saveInfo'); if(!c||!b||!info)return;
  c.hidden=!sv; b.textContent=sv?'New game':'Begin'; b.classList.toggle('ghost',!!sv);
  info.hidden=!sv; info.textContent=sv?'Saved '+ago(sv.at)+' · '+(sv.objective||'')+'. Starting a new game replaces this save once it auto-saves.':'';
}
/* hooks for devtools.js (test start points build a save object and play it through applySave, the same path as Continue) */
G.flow={begin, refreshTitle, applySave, snapshot, writeSave, readSave, startLoop, keys:{save:SAVE_KEY,test:TEST_KEY}, get bossDead(){return bossDead;}, get stagDead(){return stagDead;},
  stagEdge, halTowerSpot};
G.system('flow',{order:60,modes:'always',
  init(){
    initShrooms();
    savedEl=$('saved');
    refreshTitle();
    $('continue').addEventListener('click',()=>begin(true));
    $('begin').addEventListener('click',()=>begin(false));
    // title sub-screens: Controls and Credits (B / Esc / Back return to the card that opened them: the title, or the ending)
    const sub=(id,backId,openers)=>{ const card=$(id), back=$(backId); if(!card||!back)return;
      const close=()=>{ const from=card.dataset.from||'title'; card.hidden=true; if($(from))$(from).hidden=false; const b=$(card.dataset.opener||''); if(b)try{b.focus();}catch(_){} };
      for(const [btnId,from] of openers){ const btn=$(btnId); if(!btn)continue;
        btn.addEventListener('click',()=>{ card.dataset.from=from; card.dataset.opener=btnId; $(from).hidden=true; card.hidden=false; try{back.focus();}catch(_){} G.emit('title:sub',{id}); }); }
      back.addEventListener('click',close);
      document.addEventListener('keydown',e=>{ if(!card.hidden&&(e.key==='Escape'||e.key==='Backspace')){ e.preventDefault(); close(); } }); };
    sub('controlsCard','controlsBack',[['controlsBtn','title']]); sub('credits','creditsBack',[['creditsBtn','title'],['endCredits','ending']]);
    $('pauseBtn').addEventListener('click',e=>{ e.preventDefault(); if(G.state.mode==='play')pause(); else if(G.state.mode==='paused')resume(); });
    $('saveBtn').addEventListener('click',()=>{ $('saveNote').textContent=writeSave()?(G.cloud&&G.cloud.state==='on'&&!G.testSaves?'Saved, and it will follow you to your other devices.':'Saved. You can close the game and pick up here later.'):'Couldn’t save: this browser is blocking storage.'; if(G.cloud&&G.cloud.flush)G.cloud.flush(); });
    $('quitBtn').addEventListener('click',()=>{ writeSave(); const done=()=>location.reload(); const f=G.cloud&&G.cloud.flush?G.cloud.flush():null; if(f&&f.then){ Promise.race([f,new Promise(r=>setTimeout(r,3000))]).then(done,done); } else done(); });
    document.querySelectorAll('#qualitySeg button').forEach(b=>b.addEventListener('click',()=>{ G.setQuality(b.dataset.q); syncQuality(); }));
    document.querySelectorAll('#invertSeg button').forEach(b=>b.addEventListener('click',()=>{ G.setInvertY(b.dataset.invert==='1'); syncQuality(); }));
    G.on('mode',e=>{ $('pauseBtn').hidden=!(e.mode==='play'||e.mode==='paused'); });
    document.addEventListener('visibilitychange',()=>{ if(document.hidden&&G.state.mode==='play'){ writeSave(); pause(); } });
    G.on('cloak:found',onCloak);
    ['lantern:pickup','staff:pickup','lamp:cured','player:respawn'].forEach(ev=>G.on(ev,d=>{ if(!(d&&d.restored))autosave(); }));
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
    G.on('storm:pickup',onStormPickup);
    G.on('storm:placed',onStormPlaced);
    G.on('lamp:failed',onLampFailed);
    G.on('staff:pickup',onStaffPickup);
    G.on('tower:exit',onTowerExit);
    // Maren's lantern can't be taken while the Stag stands over it
    G.interact.add({pos:()=>G.items.lantern.pos,radius:2.2,priority:9,label:'The Hollow Stag stands over it',
      enabled:()=>{ const L=G.items.lantern; return !L.found&&!L.carried&&!stagDead&&!!(G.monsters&&G.monsters.boss&&G.monsters.boss.kind==='stag'); },
      use(){ G.ui.say('You reach for the lantern and the Stag’s crown flares. Not while it stands.',{priority:'high',key:'stagLantern'}); }});
    G.on('player:dead',onDead);
    G.on('negative:freed',()=>{ G.state.freed=(G.state.freed||0)+1; G.ui.toast('A negative freed',G.state.freed+' of '+((G.creatures&&G.creatures.total)||9)); });
    const l=$('loading'); if(l)l.textContent='Ready when you are.';
  },
  update(dt){
    const mode=G.state.mode;
    if(mode==='title'){updateAttract(dt);return;}
    if(mode==='play'){
      if(G.input.pressed('pause'))pause();
      else if(G.input.pressed('log')){ pause(); if(G.ui.pauseTab)G.ui.pauseTab('msgs',true); }
      updatePickups(dt); updateBeats(dt); updateFinale(dt); trackSafe(dt);
      if(endingT>0){ endingT-=dt; if(endingT<=0){ G.setMode('ending'); G.input.unlockPointer(); $('hud').hidden=true; $('ending').hidden=false; $('keep').focus(); } }
      // gentle nudge if the player wanders the cliff top without the light for a long time
      if(G.quest.step==='door'&&G.time>70&&!sawDoor){sawDoor=true;onDoorBlocked();}
    }else if(mode==='paused'){
      if((G.input.pressed('pause')||G.input.pressed('log'))&&performance.now()-pausedAt>350)resume();
    }
  }
});
})();
