/* =====================================================================
   onboarding.js — first-time moments the playtest (2026-11-07, Ethan) said needed showing, not telling.
   - G.cine.play(id, {dur, shot(k,t,out), onEnd})  a small letterboxed camera shot, skippable with any button,
     each id plays once per save. Runs after player.js's camera (order 84, like the Gloaming's intro).
   - the cure: when the lens catches, the camera steps outside the tower to watch the warm beam go out over the
     water, then drops to the cliff edge where something is starting to climb (the Gloaming's rise spot).
   - the first ether: the lamp flares violet and the camera pulls up and out over the island while the fog wall
     rolls back, so you see what feeding the light does.
   - two nudges: the lantern shutter (what closing it does), and the staff techniques (once you've swung a lot
     and found none).
   API: G.cine = {play(id,o), on, seen(id), skip()}
   ===================================================================== */
(function(){
'use strict';
const G=window.G, THREE=G.THREE, U=G.U;
const V=(x,y,z)=>new THREE.Vector3(x||0,y||0,z||0);
const smooth=t=>t<=0?0:t>=1?1:t*t*(3-2*t);

const S={seen:{}, said:{}, strikes:0};
const C={on:false,id:null,t:0,dur:5,shot:null,onEnd:null,skip:false,cp:V(),lp:V(),fov:50,bars:null,prevFov:null};

function bars(){
  if(C.bars||typeof document==='undefined')return C.bars;
  const wrap=document.createElement('div'); wrap.id='bqCine'; wrap.setAttribute('aria-hidden','true');
  wrap.style.cssText='position:fixed;inset:0;pointer-events:none;opacity:0;visibility:hidden;transition:opacity .35s';
  const bar=top=>{ const b=document.createElement('div'); b.style.cssText='position:absolute;left:0;right:0;height:8vh;background:#05040a;'+(top?'top:0':'bottom:0'); return b; };
  const hint=document.createElement('div'); hint.textContent='Press any button to skip';
  hint.style.cssText='position:absolute;right:18px;bottom:calc(8vh + 10px);font:500 12px/1 system-ui,sans-serif;letter-spacing:.08em;color:#d8d0e8;opacity:.6;text-shadow:0 1px 3px #000';
  wrap.append(bar(true),bar(false),hint);
  const hud=document.getElementById('hud'); if(hud&&hud.parentNode)hud.parentNode.insertBefore(wrap,hud); else document.body.appendChild(wrap);
  C.bars=wrap; return wrap;
}
function setKeys(v){ const k=typeof document!=='undefined'&&document.getElementById('keys'); if(k)k.style.visibility=v?'':'hidden'; }
const skipKey=()=>{ if(C.on&&C.t>.4)C.skip=true; };
const SKIP_ACTS=['attack','jump','interact','roll','lock','sprint','shutter','potion','pause','advance'];

function play(id,o){
  if(C.on||S.seen[id]||G.state.mode!=='play')return false;
  if(G.cineBusy&&G.cineBusy())return false;
  S.seen[id]=1; Object.assign(C,{on:true,id,t:0,dur:o.dur||5,shot:o.shot,onEnd:o.onEnd||null,skip:false});
  const P=G.player; try{ P.setControl&&P.setControl(false); }catch(e){}
  const b=bars(); if(b){ b.style.visibility='visible'; b.style.opacity='1'; }
  addEventListener('keydown',skipKey,true); addEventListener('pointerdown',skipKey,true);
  C.prevFov=G.camera.fov; setKeys(false);
  G.emit('cine',{on:true,id});
  return true;
}
function end(){
  if(!C.on)return; C.on=false;
  removeEventListener('keydown',skipKey,true); removeEventListener('pointerdown',skipKey,true);
  if(C.bars){ const w=C.bars; w.style.opacity='0'; setTimeout(()=>{ if(!C.on)w.style.visibility='hidden'; },420); }
  if(C.prevFov){ G.camera.fov=C.prevFov; G.camera.updateProjectionMatrix(); }
  setKeys(true);
  const P=G.player; try{ P.setControl&&P.setControl(true); }catch(e){}
  try{ if(P.aimCamera)P.aimCamera(P.camYaw!=null?P.camYaw:P.heading,.26); }catch(e){}
  const f=C.onEnd; C.onEnd=null; try{ f&&f(); }catch(e){ console.error(e); }
  G.emit('cine',{on:false,id:C.id});
}
function update(dt){
  if(!C.on)return;
  if(G.state.mode!=='play'){ end(); return; }
  C.t+=dt;
  if(C.t>.4&&G.input&&G.input.pressed){ for(const a of SKIP_ACTS){ try{ if(G.input.pressed(a)){ C.skip=true; break; } }catch(e){} } }
  if(C.skip||C.t>=C.dur){ end(); return; }
  const k=C.t/C.dur;
  try{ C.shot(k,C.t,C); }catch(e){ console.error('cine',e); end(); return; }
  const cam=G.camera;
  cam.position.copy(C.cp); cam.lookAt(C.lp);
  if(Math.abs(cam.fov-C.fov)>.01){ cam.fov=C.fov; cam.updateProjectionMatrix(); }
  cam.updateMatrixWorld();
}
G.system('cine',{order:84,modes:['play','dead'],update:dt=>{ try{ update(dt); }catch(e){ console.error(e); C.on=true; end(); } }});

G.cine={ play, get on(){ return C.on; }, seen:id=>!!S.seen[id], skip(){ C.skip=true; } };
// the Gloaming has its own intro shot: never start ours on top of it
G.cineBusy=()=>!!(G.finaleBoss&&G.finaleBoss.state==='intro');

/* ---------------------------------------------------------------- shots */
const LH=()=>G.world.lighthouse;
function riseSpot(){ // where the Gloaming climbs over the edge (finale_boss.js: walk WNW from the arena until the plateau ends)
  const A=G.world.landmarks.finale||{x:165,z:0}; const d=V(-.5,0,-.87).normalize(); let x=A.x, z=A.z;
  for(let r=0;r<70;r+=1){ const xx=A.x+d.x*r, zz=A.z+d.z*r; if(G.world.onPlateau&&!G.world.onPlateau(xx,zz))break; x=xx; z=zz; }
  return V(x,42,z);
}

// the cure: the lens catches (lighthouse.js stage 2, 9.5 s in) — outside, round the tower, then down to the cliff edge
let cureWatch=true;
function cureShot(){
  const L=LH(); if(!L)return;
  const lc=L.lampCenter?L.lampCenter.clone():V(180,58,0), edge=riseSpot();
  const a0=Math.atan2(edge.z-lc.z,edge.x-lc.x)+1.15;
  play('cure',{dur:7.5,shot(k,t,o){
    const k1=smooth(Math.min(1,k/.5)), k2=smooth((k-.45)/.38); // hold the last framing ~1 s
    // orbit at lamp height, a little above, looking at the lens and the beam going out to sea
    const a=a0+.75*k1, R=19-4*k1;
    const orb=V(lc.x+Math.cos(a)*R,lc.y+3.5-1.5*k1,lc.z+Math.sin(a)*R);
    // then down the cliff top toward the edge, looking at the drop where the fog is thickest
    // out past the edge, over the drop, looking back down the cliff face (where it climbs)
    const A=G.world.landmarks.finale||{x:165,z:0}, ox=edge.x-A.x, oz=edge.z-A.z, ol=Math.hypot(ox,oz)||1;
    const low=V(edge.x+ox/ol*26,42+6,edge.z+oz/ol*26+4);
    o.cp.copy(orb).lerp(low,k2);
    o.lp.copy(lc).lerp(V(edge.x,33,edge.z),k2);
    o.fov=48+6*k2;
  }});
}

// the first ether: the light flares, the camera rises out over the island and watches the fog wall roll back
function etherShot(){
  const L=LH(); if(!L||!G.fog)return;
  const lc=L.lampCenter?L.lampCenter.clone():V(180,58,0);
  play('ether',{dur:7,shot(k,t,o){
    const k1=smooth(Math.min(1,k/.35)), k2=smooth((k-.25)/.75);
    const r=G.fog.radius, c=G.fog.centre||{x:180,z:0};
    // the fog edge, west along the island (where most of it lies)
    const fe=V(c.x-r,10,c.z+8);
    const near=V(lc.x-7,lc.y+1.5,lc.z+5), high=V(lc.x+16,lc.y+34,lc.z+34);
    o.cp.copy(near).lerp(high,k2);
    o.lp.copy(lc).lerp(fe,Math.max(k1*.15,k2));
    o.fov=50+8*k2;
  }});
}

G.on('lamp:fed',()=>{ // fog.js marks itself fed just after this event: before that, this is the first feed
  try{ const fed=G.fog&&G.fog._persist&&G.fog._persist.save().fed; if(fed||!G.lamp||!G.lamp.active)return; }catch(e){ return; }
  if(S.seen.ether)return;
  setTimeout(()=>etherShot(),350); // let the flash land first
});
G.system('cineWatch',{order:83,update(){
  const L=G.lighthouse; if(!cureWatch||!L)return;
  if(L.cured&&!L.cure){ cureWatch=false; return; }         // already cured (save, test start): nothing to show
  if(L.cure&&L.cure.t>9.3&&!S.seen.cure){ cureWatch=false; cureShot(); }
}});

/* ---------------------------------------------------------------- nudges */
function say(key,text,o){ if(S.said[key])return; S.said[key]=1; try{ G.ui.say(text,Object.assign({key:'onb-'+key},o||{})); }catch(e){} }
G.on('lantern:shutter',e=>{
  if(!e||!e.shut||(G.cave&&G.cave.inside)||(G.undercroft&&G.undercroft.inside))return;
  say('shutter','The shutter drops and the dark closes in. Keep it shut a while and the moths lose the scent and drift away — open it to call them back.');
});
G.on('player:attack',e=>{
  if(!e||e.charged||e.move||e.shove)return; S.strikes++;
  if(S.strikes<30||S.said.combos)return;
  let found=0; try{ const m=G.moves; if(m&&m.isFound)found=['lunge','sweep','slam','spin','plunge'].filter(k=>m.isFound(k)).length; }catch(e){}
  if(found>0){ S.said.combos=1; return; }
  say('combos','The staff remembers more than a plain swing. Strike out of a roll, a sprint, a jump — or a jump on top of a jump. The pause menu keeps what you find.');
});

/* ---------------------------------------------------------------- save */
G.persist&&G.persist.register('onboarding',{
  save:()=>({v:1,seen:Object.assign({},S.seen),said:Object.assign({},S.said),strikes:S.strikes|0}),
  load:d=>{ if(!d||typeof d!=='object')return; S.seen=Object.assign({},d.seen||{}); S.said=Object.assign({},d.said||{}); S.strikes=d.strikes|0; cureWatch=!S.seen.cure; }
});
// a save from before this module: an already-fed lamp or a cured lighthouse means those moments have passed
G.on('loop:start',e=>{ try{ if(G.fog&&G.fog._persist&&G.fog._persist.save().fed)S.seen.ether=1; }catch(_){} });

if(G.debug)G._onb={S,C,cureShot,etherShot,riseSpot};
})();
