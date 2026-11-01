/* =====================================================================
   BRAVE QUEST: LIGHTHOUSE — combat.js
   The Traveler's techniques (sequenced combos), double jump tuning, the
   staff's aiming reticle + aim raycast, and their feedback (names on
   screen, the pause-menu list, ether bursts, sounds).
   player.js owns the state machine and the poses; this file owns the
   numbers and everything around them, so tuning happens in one table.
   Loaded before player.js. API: G.moves (see CONTRACT.md).
   ===================================================================== */
(function(){
'use strict';
const G=window.G, THREE=G.THREE, U=G.U;
const PI=Math.PI, TAU=PI*2;

/* ---------------------------------------------------------------------
   THE TABLE — every number that shapes a technique.
   dmg in half-hearts (hollow 6 hp, hound 4, brineling 3, stag 48).
   kb = knockback impulse passed to the target (monsters scale it: hollow x.75, hound x1.1, boss x.04).
   times in seconds; cooldown starts when the move ends; stamina 0..1.
   --------------------------------------------------------------------- */
const T={
  /* Roll -> strike: a forward thrust out of the roll */
  lunge:{name:'Rolling Lunge',how:'Roll, then strike',dmg:3,kb:8,radius:.95,reach:1.5,dur:.46,act:[.07,.24],speed0:12.5,speed1:1.5,
    window:.16,      // strike up to this long after the roll ends still lunges
    minRoll:.12,     // ... or once the roll is this far along (cancels the rest of the roll)
    cooldown:.45,stamina:0},
  /* Sprint -> strike: a low spinning sweep that keeps your momentum */
  sweep:{name:'Dashing Sweep',how:'Sprint, then strike',dmg:3,kb:9,radius:1.75,dur:.62,act:[.08,.4],carry:.95,speedEnd:2.2,
    minSpeed:6.4,cooldown:.8,stamina:.12},
  /* Jump -> strike: hang, then drive the staff down; shockwave on landing */
  slam:{name:'Skyfall Slam',how:'Jump, then strike',dmg:3,kb:8,radius:2.4,hang:.14,hangVy:2.4,fallVy:-21,recover:.34,
    minAir:.05,minHeight:.55,cooldown:.55,stamina:0},   // below minHeight while falling, a strike waits for the landing (ground swing)
  /* Double jump -> strike: a whirling aerial spin */
  spin:{name:'Moth-Wing Spin',how:'Double jump, then strike',dmg:2,kb:6,radius:1.85,dur:.5,turns:2,hoverVy:1.1,
    cooldown:.7,stamina:.06},
  /* Jump -> air roll -> strike: the spinning plunge (stronger from higher) */
  plunge:{name:'Starfall Plunge',how:'Jump, roll in the air, then strike',dmg:5,dmgPerM:.5,dmgMax:9,kb:14,radius:3.0,radiusPerM:.12,radiusMax:4.4,
    djBonus:2,djRadius:.6,   // after a double jump: +2 damage, +0.6 m radius (plus the extra drop)
    wind:.2,windVy:3.2,fallVy:-24,recover:.55,hitstop:.13,shake:.6,cooldown:1.4,stamina:.15,
    fromDoubleJump:'Starfall Plunge (from on high)'},
  /* movement pieces the combos are built from (not shown as techniques) */
  dive:{speed0:8.6,speed1:5.2,dur:.42,vy:2.4,stamina:.1},
  doubleJump:{vy:5.6,minHeight:.55,minAir:.1,stamina:.08,needsCloak:true},
  /* buffered inputs: a press this long before the move becomes possible still counts */
  buffer:{attack:.18,roll:.12},
  /* the staff's charged shot */
  aim:{after:.14,dist:2.75,right:.82,up:.4,sens:.55,fov:50,pitchMin:-.8,pitchMax:.9,
    rayMax:60,step:.25,spinNear:4.5,
    bolt:{dmg:4,kb:6,speed:26,radius:.38},great:{dmg:6,kb:10,speed:30,radius:.52}}
};
const ORDER=['lunge','sweep','slam','spin','plunge'];

/* ---------------------------------------------------------------------
   discovery: remembered per browser (it is the player's knowledge, not the save's)
   --------------------------------------------------------------------- */
const found=new Set();
try{ const a=JSON.parse(localStorage.getItem('bq-combos')||'[]'); if(Array.isArray(a))a.forEach(k=>T[k]&&found.add(k)); }catch(_){}
function saveFound(){ try{localStorage.setItem('bq-combos',JSON.stringify([...found]));}catch(_){} }

/* ---------------------------------------------------------------------
   DOM: technique name flash, pause-menu list, aim reticle (built here so index.html stays untouched)
   --------------------------------------------------------------------- */
const css=document.createElement('style');
css.textContent=`
#moveName{position:fixed;left:50%;top:calc(31% + env(safe-area-inset-top,0px));transform:translate(-50%,0) scale(.96);pointer-events:none;
  font-family:var(--display,Georgia,serif);font-style:italic;font-size:clamp(17px,2.3vw,23px);letter-spacing:.06em;color:#efe6ff;
  text-shadow:0 0 14px rgba(145,80,255,.85),0 2px 8px rgba(0,0,0,.85);opacity:0;transition:opacity .25s,transform .35s;white-space:nowrap}
#moveName.show{opacity:.92;transform:translate(-50%,0) scale(1)}
#moveName.first{font-size:clamp(22px,3.2vw,30px);color:#fff4dc}
#moveName small{display:block;text-align:center;font-family:var(--body,system-ui,sans-serif);font-style:normal;font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:#c9b2ff;margin-top:3px}
#aimRet{position:fixed;left:0;top:0;width:0;height:0;pointer-events:none;opacity:0;transition:opacity .18s}
#aimRet svg{position:absolute;left:-44px;top:-44px;width:88px;height:88px;overflow:visible;filter:drop-shadow(0 0 6px rgba(145,80,255,.9))}
.techList{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:6px 14px;margin:2px 0 6px}
.techList div{font-size:13px;line-height:1.3}
.techList b{display:block;font-weight:600;color:#4b3863}
.techList span{color:#6c5a7a;font-size:12px}
.techList .unknown b{color:#9b8fa6;font-style:italic}
`;
document.head.appendChild(css);
const nameEl=document.createElement('div'); nameEl.id='moveName'; nameEl.setAttribute('aria-live','polite'); document.body.appendChild(nameEl);
let nameT=0;
function flashName(text,sub,first){
  nameEl.innerHTML=''; nameEl.append(document.createTextNode(text)); if(sub){const s=document.createElement('small'); s.textContent=sub; nameEl.append(s);}
  nameEl.classList.toggle('first',!!first); nameEl.classList.add('show'); nameT=first?2.4:.95;
}
/* pause menu: a "Techniques" block after the controls legend */
let techEl=null;
function buildTechList(){
  const sheet=document.querySelector('#pause .sheet'); if(!sheet)return;
  if(!techEl){
    techEl=document.createElement('div'); techEl.className='techBlock';
    const anchor=sheet.querySelector('.setting'); if(anchor)sheet.insertBefore(techEl,anchor); else sheet.appendChild(techEl);
  }
  const rows=ORDER.map(k=>{ const m=T[k], f=found.has(k);
    return `<div class="${f?'':'unknown'}"><b>${f?m.name:'Undiscovered'}</b><span>${m.how}</span></div>`; }).join('');
  techEl.innerHTML=`<span class="eyebrow">Techniques · ${found.size} of ${ORDER.length}</span><div class="techList">${rows}</div>`;
}
G.on('mode',({mode})=>{ if(mode==='paused')buildTechList(); });

/* aim reticle: soft violet ring + four ticks + centre dot; grows and warms with the charge */
const ret=document.createElement('div'); ret.id='aimRet';
ret.innerHTML=`<svg viewBox="-44 -44 88 88" aria-hidden="true">
  <circle class="halo" r="26" fill="none" stroke="rgba(160,112,255,.28)" stroke-width="7"/>
  <circle class="ring" r="24" fill="none" stroke="#d6bcff" stroke-width="1.6" stroke-dasharray="118 33" />
  <circle class="fill" r="24" fill="none" stroke="#f3e9ff" stroke-width="2.4" stroke-dasharray="0 151" transform="rotate(-90)"/>
  <g class="ticks" stroke="#eadcff" stroke-width="1.8" stroke-linecap="round">
    <line x1="0" y1="-33" x2="0" y2="-28"/><line x1="0" y1="28" x2="0" y2="33"/><line x1="-33" y1="0" x2="-28" y2="0"/><line x1="28" y1="0" x2="33" y2="0"/></g>
  <circle class="dot" r="2.2" fill="#f6efff"/>
</svg>`;
document.body.appendChild(ret);
const rSvg=ret.querySelector('svg'), rRing=ret.querySelector('.ring'), rFill=ret.querySelector('.fill'), rHalo=ret.querySelector('.halo'), rTicks=ret.querySelector('.ticks'), rDot=ret.querySelector('.dot');
const RS={k:0,vis:0,spin:0,x:0,y:0};
/** player.js calls this every camera frame. o={on, charge 0..1, ready 0|1|2, onTarget, x,y (px, null = centre), locked} */
function reticle(o,dt){
  RS.vis=U.damp(RS.vis,o.on?1:0,o.on?14:9,dt||1/60);
  if(RS.vis<.01){ if(ret.style.opacity!=='0')ret.style.opacity='0'; return; }
  const x=o.x==null?innerWidth/2:o.x, y=o.y==null?innerHeight/2:o.y;
  RS.x=RS.vis<.05?x:U.damp(RS.x,x,22,dt||1/60); RS.y=RS.vis<.05?y:U.damp(RS.y,y,22,dt||1/60);
  ret.style.transform=`translate(${RS.x.toFixed(1)}px,${RS.y.toFixed(1)}px)`;
  ret.style.opacity=(RS.vis*.95).toFixed(2);
  const c=U.clamp(o.charge||0,0,1);
  RS.spin+=(dt||0)*(o.ready?60:25);
  const sc=(.74+.42*c)*(o.onTarget?.88:1);
  rSvg.style.transform=`scale(${sc.toFixed(3)}) rotate(${RS.spin.toFixed(1)}deg)`;
  const hot=o.ready>=2, warm=o.ready>=1;
  rRing.setAttribute('stroke',hot?'#ffe6b0':o.onTarget?'#f3e4ff':'#d6bcff');
  rFill.setAttribute('stroke-dasharray',`${(151*c).toFixed(1)} 151`);
  rFill.setAttribute('stroke',hot?'#ffd98a':'#f3e9ff');
  rHalo.setAttribute('stroke',hot?'rgba(255,200,120,.32)':warm?'rgba(170,120,255,.42)':'rgba(160,112,255,.24)');
  rTicks.setAttribute('stroke',o.onTarget?'#ffffff':'#eadcff');
  rDot.setAttribute('r',o.onTarget?'3.2':'2.2');
}

/* ---------------------------------------------------------------------
   aim raycast: terrain + floors, wall constrainers (tower, cave), static colliders, cave ceilings, enemy hurtboxes
   --------------------------------------------------------------------- */
const _p=new THREE.Vector3();
function raycast(from,dir,max,o={}){
  const step=o.step||T.aim.step, t0=o.start||0, team=o.team||'enemy';
  const hbs=[]; for(const hb of G.hurtboxes){ if(hb.team!==team||(hb.alive&&!hb.alive()))continue; hbs.push(hb); }
  let px=from.x+dir.x*t0, pz=from.z+dir.z*t0;
  const cave=G.cave&&G.cave.inside?G.cave:null;
  for(let t=t0;t<=max;t+=step){
    const x=from.x+dir.x*t, y=from.y+dir.y*t, z=from.z+dir.z*t;
    for(const hb of hbs){ const dx=x-hb.pos.x, dz=z-hb.pos.z, r=(hb.radius||.5)+.12;
      if(dx*dx+dz*dz<r*r&&y>=hb.pos.y-.1&&y<=hb.pos.y+(hb.height||1.6)+.1)return {point:_p.set(x,y,z).clone(),dist:t,hb}; }
    if(y<G.floorAt(x,z,y+.02))return {point:new THREE.Vector3(x,y,z),dist:t,hb:null,surface:'floor'};
    if(cave){ const l=cave.toLocal(_p.set(x,y,z)); const c=cave.ceilVis(l.x,l.z); if(c!=null&&isFinite(c)&&l.y>c&&cave.sdf(l.x,l.z)<0)return {point:new THREE.Vector3(x,y,z),dist:t,hb:null,surface:'ceiling'}; }
    for(const c of G.collidersNear(x,z)){ if(y<c.y0||y>c.y1)continue; if(Math.hypot(x-c.x,z-c.z)<c.r)return {point:new THREE.Vector3(x,y,z),dist:t,hb:null,surface:'collider'}; }
    for(const b of G.boxColliders){ if(y<b.y0||y>b.y1)continue; const cs=Math.cos(b.yaw||0),sn=Math.sin(b.yaw||0);
      const lx=(x-b.x)*cs-(z-b.z)*sn, lz=(x-b.x)*sn+(z-b.z)*cs; if(Math.abs(lx)<b.hw&&Math.abs(lz)<b.hd)return {point:new THREE.Vector3(x,y,z),dist:t,hb:null,surface:'box'}; }
    if(t>t0){ const n={x,z}; let blocked=false;
      for(const c of G.constrainers){ try{ if(c({x:px,z:pz},n,y,.05,'aim')&&Math.hypot(n.x-x,n.z-z)>.02){blocked=true;break;} }catch(_){} }
      if(blocked)return {point:new THREE.Vector3(px,y,pz),dist:t,hb:null,surface:'wall'}; }
    px=x; pz=z;
  }
  return {point:new THREE.Vector3(from.x+dir.x*max,from.y+dir.y*max,from.z+dir.z*max),dist:max,hb:null,surface:null};
}

/* ---------------------------------------------------------------------
   ether burst: expanding ground ring + flash light (the plunge, the slam)
   --------------------------------------------------------------------- */
let ringTex=null; const rings=[]; let flash=null;
function ringTexture(){ return ringTex||(ringTex=G.canvasTex(128,(g,s)=>{ const gr=g.createRadialGradient(s/2,s/2,s*.28,s/2,s/2,s/2);
  gr.addColorStop(0,'rgba(255,255,255,0)'); gr.addColorStop(.62,'rgba(255,255,255,.95)'); gr.addColorStop(.78,'rgba(255,255,255,.35)'); gr.addColorStop(1,'rgba(255,255,255,0)');
  g.fillStyle=gr; g.fillRect(0,0,s,s); })); }
function burst(pos,o={}){
  const r=o.radius||3, hex=o.color||'#a070ff';
  let R=rings.find(q=>!q.alive);
  if(!R){ const m=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:ringTexture(),transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide}));
    m.rotation.x=-PI/2; m.renderOrder=6; m.frustumCulled=false; G.scene.add(m); R={m,alive:false}; rings.push(R); }
  R.alive=true; R.t=0; R.life=o.life||.5; R.r=r; R.m.visible=true; R.m.position.set(pos.x,pos.y+.08,pos.z);
  R.m.material.color.copy(U.col(hex)).multiplyScalar(o.bright||2.2); R.m.scale.setScalar(.4);
  if(o.light!==false){ if(!flash){flash=new THREE.PointLight(new THREE.Color('#a77bff'),0,16,1.6); G.scene.add(flash);}
    flash.position.set(pos.x,pos.y+2.4,pos.z); flash.intensity=o.lightI||3; flash.distance=r*3.2; flash.userData.k=o.lightI||3; }
}
function updateBursts(dt){
  for(const R of rings){ if(!R.alive)continue; R.t+=dt; const k=R.t/R.life;
    if(k>=1){R.alive=false; R.m.visible=false; continue;}
    const e=1-Math.pow(1-k,3); R.m.scale.setScalar(.4+R.r*2.3*e); R.m.material.opacity=(1-k)*(1-k); }
  if(flash&&flash.intensity>0){ flash.intensity=Math.max(0,flash.intensity-dt*(flash.userData.k||6)*3.2); }
}

/* ---------------------------------------------------------------------
   sounds: uses audio.js's synth kit when it is running (no new assets)
   --------------------------------------------------------------------- */
function sfx(kind){
  const A=G.audio; if(!A||!A.ready||!A.S||!A.context)return;
  const S=A.S, t=A.context.currentTime;
  try{
    if(kind==='djump'){ S.whoosh(t,{f0:700,f1:2400,dur:.22,g:.14}); S.chime(t,[86,93],{g:.04,step:.04,decay:.4}); }
    else if(kind==='dive'){ S.whoosh(t,{f0:350,f1:1500,dur:.3,g:.2}); }
    else if(kind==='lunge'){ S.whoosh(t,{f0:500,f1:3200,dur:.2,g:.3}); }
    else if(kind==='sweep'){ S.whoosh(t,{f0:260,f1:1900,dur:.42,g:.34}); }
    else if(kind==='slamUp'){ S.whoosh(t,{f0:900,f1:400,dur:.18,g:.12}); }
    else if(kind==='slam'){ S.thud(t,{g:.55,f0:130,f1:45,dur:.3}); S.whoosh(t,{f0:200,f1:900,dur:.3,g:.18}); }
    else if(kind==='spin'){ S.whoosh(t,{f0:340,f1:2600,dur:.5,g:.32}); S.chime(t+.05,[81,86],{g:.05,step:.06,decay:.6}); }
    else if(kind==='plungeUp'){ S.whoosh(t,{f0:1200,f1:300,dur:.3,g:.2}); S.chime(t,[74,81,86,93],{g:.05,step:.03,decay:.7}); }
    else if(kind==='plunge'){ S.thud(t,{g:.8,f0:100,f1:30,dur:.5}); S.rumble&&S.rumble(t,{g:.35,dur:.9,f0:60,f1:35}); S.chime(t+.04,[62,69,74,81],{g:.08,step:.05,decay:1.4}); }
    else if(kind==='great'){ S.chime(t,[74,81,86,93],{g:.1,step:.03,decay:.8}); S.whoosh(t,{f0:500,f1:4200,dur:.45,g:.24}); }
  }catch(_){}
}

/* ---------------------------------------------------------------------
   touch: while the Strike button is held (charging), dragging the same thumb aims the camera,
   so a phone player doesn't need a third finger on the screen
   --------------------------------------------------------------------- */
const tlook={x:0,y:0,id:null,px:0,py:0};
{ const btn=document.querySelector('#touch button[data-act="attack"]');
  if(btn){
    btn.addEventListener('pointerdown',e=>{ tlook.id=e.pointerId; tlook.px=e.clientX; tlook.py=e.clientY; try{btn.setPointerCapture(e.pointerId);}catch(_){} });
    btn.addEventListener('pointermove',e=>{ if(e.pointerId!==tlook.id)return; tlook.x+=(e.clientX-tlook.px)*1.8; tlook.y+=(e.clientY-tlook.py)*1.8; tlook.px=e.clientX; tlook.py=e.clientY; });
    const end=e=>{ if(e.pointerId===tlook.id)tlook.id=null; };
    btn.addEventListener('pointerup',end); btn.addEventListener('pointercancel',end);
  } }
/** pixels dragged on the Strike button since the last call (+y = down, invert applied like G.input.look) */
function takeLook(){ const o={x:tlook.x,y:G.settings&&G.settings.invertY?-tlook.y:tlook.y}; tlook.x=tlook.y=0; return o; }

/* ---------------------------------------------------------------------
   API
   --------------------------------------------------------------------- */
G.moves={
  T, order:ORDER, found,
  /** a technique just happened: name flash every time, a toast + pause-list entry the first time */
  performed(id,o={}){
    const m=T[id]; if(!m||!m.name)return false;
    const first=!found.has(id);
    if(first){ found.add(id); saveFound(); try{G.ui.toast(m.name,'New technique · '+m.how);}catch(_){} }
    if(!first)flashName(o.label||m.name,'',false); // the first time the toast names it
    G.emit('player:combo',{id,name:m.name,first,power:o.power||null});
    return first;
  },
  isFound:id=>found.has(id),
  /** places can forbid the double jump: push fn(pos)->true (e.g. a room whose ledges assume one jump) */
  noDoubleJump:[],
  forget(){ found.clear(); saveFound(); },
  reticle, raycast, burst, sfx, takeLook
};

G.system('movesUi',{order:91,modes:'always',update(dt){
  if(nameT>0){ nameT-=dt||G.dt||0; if(nameT<=0)nameEl.classList.remove('show'); }
  updateBursts(dt||0);
  if(G.state.mode!=='play'&&G.state.mode!=='dead')reticle({on:false},dt||1/60);
}});
})();
