/* =====================================================================
   hud.js — hearts, stamina wheel, prompts, captions, objective + marker,
   lock-on reticle, boss bar, toasts, damage flash, camera shake, touch
   ===================================================================== */
(function(){
'use strict';
const G=window.G, THREE=G.THREE, U=G.U;
const $=s=>document.getElementById(s);
const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- captions ---------- */
const capEl=$('cap'), capText=$('capText'), capWho=$('capWho');
const queue=[]; let cur=null;
/* Caption pacing. say(text, who?, {priority:'high'|'normal'|'low', key}) — the old say(text, who) call is 'normal'.
   - high (boss/quest beats, danger): interrupts the current line at once (a current high line keeps its minimum time first)
   - normal: a queued line with the same key is replaced; dropped if it has waited longer than STALE
   - low: flavour; dropped quickly if it can't be shown, never cuts anything
   Reading time scales with length; any waiting line cuts the current one short once its minimum time has passed. */
const CAP={MIN:2.5, PER:.06, MAX:7, TYPE:44, STALE:{0:2.5,1:6,2:14}, QMAX:4};
const PRI={low:0,normal:1,high:2};
const capRead=t=>U.clamp(t.length*CAP.PER,CAP.MIN,CAP.MAX);
function capItem(text,who,o){ const p=PRI[o.priority]; return {t:text,who:who||'',pri:p==null?1:p,key:o.key||null,age:0}; }
function capEnqueue(it){
  let i=queue.length; while(i>0&&(queue[i-1].pri<it.pri||(it.requeued&&queue[i-1].pri===it.pri)))i--; // higher priority goes ahead, FIFO within a priority (an interrupted line resumes first)
  queue.splice(i,0,it);
  while(queue.length>CAP.QMAX){ let w=0; for(let j=1;j<queue.length;j++)if(queue[j].pri<queue[w].pri)w=j; queue.splice(w,1); } // drop the oldest of the least important
}
function capShow(it){
  const typeT=reduceMotion?0:it.t.length/CAP.TYPE;
  cur={t:it.t,who:it.who,pri:it.pri,key:it.key,i:reduceMotion?1e4:0,el:0,shown:-1,
       read:Math.max(capRead(it.t),typeT+1.2), min:Math.max(CAP.MIN,Math.min(typeT+.6,CAP.MAX)), requeued:it.requeued};
  capWho.textContent=it.who; capWho.hidden=!it.who; capEl.classList.add('show');
}
/* ---------- objective ---------- */
const objEl=$('obj'), objSub=$('objSub'); let objTimer=0;
/* ---------- toast ---------- */
const toastEl=$('toast'); let toastT=0;
/* ---------- boss ---------- */
const bossEl=$('boss'), bossName=$('bossName'), bossFill=$('bossFill');
/* ---------- shake ---------- */
let shakeAmt=0;
const hurtEl=$('hurt');

G.ui={
  say(text,who,opts){
    if(!text)return;
    if(who&&typeof who==='object'){opts=who;who=opts.who;} // say(text,{priority,key,who}) also works
    const it=capItem(text,who,opts||{});
    if(cur&&cur.t===text){ cur.pri=Math.max(cur.pri,it.pri); return; }
    const d=queue.findIndex(q=>q.t===text); if(d>=0){ if(queue[d].pri<it.pri){queue.splice(d,1);capEnqueue(it);} return; }
    if(it.key){
      const k=queue.findIndex(q=>q.key===it.key); if(k>=0)queue.splice(k,1); // a newer line for the same thing replaces the waiting one
      if(cur&&cur.key===it.key&&it.pri>=cur.pri){ capShow(it); return; }   // ...or the one on screen
    }
    if(it.pri>=2&&cur&&!(cur.pri>=2&&cur.el<cur.min)){
      // interrupt now; a line cut off early (under half read) comes back once afterwards
      if(cur.pri>=1&&!cur.requeued&&cur.el<cur.read*.5&&!queue.some(q=>q.t===cur.t)) capEnqueue({t:cur.t,who:cur.who,pri:cur.pri,key:cur.key,age:-4,requeued:true});
      capShow(it); return;
    }
    if(it.pri===0&&(cur||queue.length)&&queue.some(q=>q.pri>0))return; // flavour never waits behind real lines
    capEnqueue(it);
  },
  objective(text,sub){
    if(text!=null&&objEl.textContent!==text){ objEl.textContent=text; objEl.classList.add('fresh'); clearTimeout(objTimer); objTimer=setTimeout(()=>objEl.classList.remove('fresh'),2600); }
    objSub.textContent=sub||'';
  },
  toast(title,small){ toastEl.innerHTML=''; toastEl.append(document.createTextNode(title||'')); if(small){const s=document.createElement('small');s.textContent=small;toastEl.append(s);} toastEl.classList.add('show'); toastT=3.2; },
  bossBar(name,frac){ if(!name){bossEl.hidden=true;return;} bossEl.hidden=false; if(bossName.textContent!==name)bossName.textContent=name; bossFill.style.width=(U.clamp(frac==null?1:frac,0,1)*100).toFixed(1)+'%'; },
  flash(){ hurtEl.style.transition='none'; hurtEl.style.opacity='1'; requestAnimationFrame(()=>{hurtEl.style.transition='opacity .5s';hurtEl.style.opacity='0';}); },
  shake(a){ if(!reduceMotion)shakeAmt=Math.max(shakeAmt,a||.3); }
};
/* the boss bar sits top-centre; when the HUD columns (vitals: hearts, light, moths, satchel / the objective) reach under it
   on a narrower window, it drops just below whichever column it would overlap */
const vitEl=document.querySelector('#hud .vitals'), questEl=document.querySelector('#hud .quest'); let bossTop=-1;
function placeBoss(){
  if(bossEl.hidden){ if(bossTop>=0)toastEl.style.top=''; bossTop=-1; return; }
  const b=bossEl.getBoundingClientRect(); let top=64;
  for(const el of [vitEl,questEl]){ if(!el)continue; const r=el.getBoundingClientRect(); if(!r.height)continue;
    if(r.right>b.left-8&&r.left<b.right+8)top=Math.max(top,r.bottom+10); }
  top=Math.round(top); if(Math.abs(top-bossTop)<2)return; bossTop=top;
  bossEl.style.top='calc('+top+'px + env(safe-area-inset-top,0px))';
  toastEl.style.top='calc(max(18%, '+(top+58)+'px) + env(safe-area-inset-top,0px))'; // toasts ("The lens is free") go under the bar
}
function updateCaption(dt){
  dt=dt||0;
  for(let j=queue.length-1;j>=0;j--){ const q=queue[j]; q.age+=dt; if(q.age>CAP.STALE[q.pri])queue.splice(j,1); } // late lines are stale lines
  if(cur){
    cur.el+=dt;
    if(queue.length&&cur.el>=cur.min&&(queue[0].pri>=cur.pri||cur.el>=cur.read*.6))cur=null; // something is waiting: cut short after the minimum
    else if(cur.el>=cur.read)cur=null;
    if(!cur&&!queue.length)capEl.classList.remove('show');
  }
  if(!cur&&queue.length)capShow(queue.shift());
  if(!cur)return;
  cur.i+=dt*(queue.length?CAP.TYPE*1.6:CAP.TYPE); const n=Math.min(cur.t.length,Math.floor(cur.i));
  if(n!==cur.shown){capText.textContent=cur.t.slice(0,n);cur.shown=n;}
}
/* for tests and devtools: what is on screen and waiting */
G.ui.captions=()=>({cur:cur&&{text:cur.t,who:cur.who,pri:cur.pri,key:cur.key,el:+cur.el.toFixed(2),read:+cur.read.toFixed(2)},
  queue:queue.map(q=>({text:q.t,pri:q.pri,key:q.key,age:+q.age.toFixed(2)}))});
G.ui.clearCaptions=()=>{ queue.length=0; cur=null; capEl.classList.remove('show'); };

/* ---------- hearts ---------- */
const heartsEl=$('hearts'); let lastHearts='', lastMax=0;
heartsEl.style.maxWidth='272px'; // ten hearts in one row before wrapping (Heart Shards / Keeper's Hearts raise maxHp to 20)
const HEART='M12 21s-8.5-5.4-10.4-10.6C.3 6.7 2.6 3 6.3 3c2.4 0 4 1.3 5.7 3.4C13.7 4.3 15.3 3 17.7 3c3.7 0 6 3.7 4.7 7.4C20.5 15.6 12 21 12 21z';
function heartSVG(fill){ // fill 0, 1 (half), 2 (full)
  const id='h'+Math.random().toString(36).slice(2,7);
  return `<svg viewBox="0 0 24 22"><defs><clipPath id="${id}"><rect x="0" y="0" width="${fill===1?12:24}" height="22"/></clipPath></defs>
  <path d="${HEART}" fill="rgba(20,12,22,.75)" stroke="#f1e9d8" stroke-opacity=".75" stroke-width="1.4"/>
  ${fill?`<path d="${HEART}" fill="#c2405a" clip-path="url(#${id})"/><path d="M6 6.5c1.5-1.2 3-.8 3.8.2" stroke="#ffd6de" stroke-width="1.4" fill="none" stroke-linecap="round" clip-path="url(#${id})"/>`:''}</svg>`;
}
function updateHearts(){
  const P=G.player; const hp=Math.max(0,Math.round(P.hp||0)), max=Math.max(2,Math.round(P.maxHp||10));
  const key=hp+'/'+max; if(key===lastHearts)return; lastHearts=key;
  const grew=lastMax>0&&max>lastMax, from=lastMax/2; lastMax=max; // a new heart (progression.js) grows in with a glow
  let h=''; for(let i=0;i<max/2;i++){const v=hp-i*2; h+=`<div class="heart${grew&&i>=from?' born':''}">${heartSVG(v>=2?2:v===1?1:0)}</div>`;}
  heartsEl.innerHTML=h; heartsEl.setAttribute('aria-label',`Health ${hp/2} of ${max/2} hearts`);
}

/* ---------- screen projection helpers ---------- */
const v3=new THREE.Vector3();
function project(p,out){ v3.copy(p).project(G.camera); out.x=(v3.x*.5+.5)*innerWidth; out.y=(-v3.y*.5+.5)*innerHeight; out.behind=v3.z>1; return out; }
const reticle=$('reticle'), stam=$('stamina'), stamArc=$('stamArc');
let stamVis=0;
const marker=document.createElement('div');
marker.style.cssText='position:fixed;left:0;top:0;pointer-events:none;display:grid;justify-items:center;gap:2px;transform:translate(-50%,-50%);font:600 12px var(--body);color:#f1e9d8;text-shadow:0 1px 4px #000;transition:opacity .3s';
marker.innerHTML='<svg width="18" height="18" viewBox="0 0 18 18"><path d="M9 1l7 8-7 8-7-8z" fill="rgba(227,161,58,.25)" stroke="#e3a13a" stroke-width="1.6"/></svg><span></span>';
document.body.appendChild(marker); const markerTxt=marker.querySelector('span');
marker.hidden=true;
const pt={x:0,y:0};

function updateWorldUI(dt){
  const P=G.player, playing=G.state.mode==='play';
  // lock-on reticle
  const t=P.lockTarget;
  if(false&&playing&&t&&(!t.alive||t.alive())){ // player.js draws an in-world reticle
    v3.set(t.pos.x,t.pos.y+(t.lockOffset!=null?t.lockOffset:(t.height||1.6)*.6),t.pos.z);
    project(v3,pt); reticle.hidden=pt.behind; reticle.style.transform=`translate(${pt.x}px,${pt.y}px)`;
  }else reticle.hidden=true;
  // stamina wheel beside the player while it's not full
  const s=U.clamp(P.stamina==null?1:P.stamina,0,1);
  stamVis=U.damp(stamVis,(playing&&s<.995)?1:0,6,dt);
  if(stamVis>.02&&P.pos){
    v3.set(P.pos.x,P.pos.y+1.25,P.pos.z); project(v3,pt);
    stam.hidden=pt.behind; stam.style.opacity=stamVis.toFixed(2);
    const big=1+((P.mods&&P.mods.stamMax)||1)*.75-.75; // Moth Wings: the ring grows with the pool (+15% per wing)
    stam.style.transform=`translate(${pt.x+46}px,${pt.y-10}px) scale(${big.toFixed(2)})`;
    stamArc.setAttribute('stroke-dashoffset',(81.7*(1-s)).toFixed(1));
    stamArc.setAttribute('stroke',P.exhausted?'#e0634f':s<.3?'#e3c04a':'#9fdc8a');
  }else stam.hidden=true;
  // objective marker
  const q=G.quest&&G.quest.target;
  if(playing&&q&&P.pos){
    const d=Math.hypot(q.x-P.pos.x,q.z-P.pos.z);
    if(d<6){marker.hidden=true;}
    else{
      marker.hidden=false; v3.set(q.x,q.y+2.5,q.z); project(v3,pt);
      let x=pt.x,y=pt.y; const m=40;
      if(pt.behind){x=innerWidth-x;y=innerHeight-m;}
      x=U.clamp(x,m,innerWidth-m); y=U.clamp(y,m+60,innerHeight-m);
      marker.style.left=x+'px'; marker.style.top=y+'px';
      const label=(G.quest.targetName?G.quest.targetName+' · ':'')+Math.round(d)+' m';
      if(markerTxt.textContent!==label)markerTxt.textContent=label;
    }
  }else marker.hidden=true;
}

/* ---------- prompts ---------- */
const promptEl=$('prompt'); let lastPrompt='';
function esc(s){return String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));}
/* controller glyphs: Xbox face buttons as coloured badges, bumpers/triggers/menu as dark pills */
const PAD_OF_KEY={E:'Y',F:'RB',J:'X',Q:'LT',Tab:'LT',Space:'A',C:'B',Shift:'LB',Esc:'Menu',P:'Menu',Use:'Y',Click:'X',H:'Up',Drink:'Up'};
function glyph(n){
  const face={A:'a',B:'b',X:'x',Y:'y'}[n];
  if(face)return `<span class="pad pad-${face}" role="img" aria-label="${n} button">${n}</span>`;
  if(n==='LS'||n==='RS')return `<span class="pad pad-stick" role="img" aria-label="${n==='LS'?'Left':'Right'} stick">${n[0]}</span>`;
  if(n==='Menu')return `<span class="pad pad-pill" role="img" aria-label="Menu button">&#9776;</span>`;
  if(n==='Up')return `<span class="pad pad-pill" role="img" aria-label="D-pad up">&#9650;</span>`;
  return `<span class="pad pad-pill" role="img" aria-label="${n}">${esc(n)}</span>`;
}
G.ui.glyph=glyph;
const usingPad=()=>G.input.device==='gamepad';
function keyCap(k,isInteract){
  if(usingPad()){ const g=isInteract?'Y':PAD_OF_KEY[k]; if(g)return glyph(g); }
  return k?`<kbd>${esc(k)}</kbd>`:'';
}
function updatePrompt(){
  let html='';
  if(G.state.mode==='play'){
    const rows=[]; const c=G.interact.current;
    if(c)rows.push([G.isMobile&&!usingPad()?'Use':(c.key||'E'),G.interact.label(c),true]);
    for(const h of G.hints){ if(!rows.some(r=>r[1]===h.label))rows.push([h.key,h.label,false]); }
    html=rows.slice(0,3).map(r=>`<div>${keyCap(r[0],r[2])}${esc(r[1])}</div>`).join('');
  }
  if(html!==lastPrompt){promptEl.innerHTML=html;lastPrompt=html;}
}

/* ---------- Mender's Draught (potions.js): legend rows, the bottle chip by the hearts, the touch button ---------- */
(function addDrinkLegend(){
  const row=short=>{ const s=document.createElement('span'); s.innerHTML='<kbd>H</kbd> '+(short?'drink':'drink a draught'); return s; };
  const k=$('keys'); if(k){ const esc_=[...k.children].find(c=>/pause/.test(c.textContent)); k.insertBefore(row(true),esc_||null); }
  document.querySelectorAll('[data-kb-legend]').forEach(el=>el.appendChild(row(false)));
})();
const POT_CSS=`
.hp-row{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.hearts.mending .heart svg{filter:drop-shadow(0 0 5px rgba(255,170,110,.95)) drop-shadow(0 1px 1px rgba(0,0,0,.6))}
.potions{position:relative;display:inline-flex;align-items:center;gap:3px;font:700 14px var(--body);color:var(--bone);text-shadow:0 1px 3px #000;font-variant-numeric:tabular-nums;transition:transform .25s,opacity .3s}
.potions[hidden]{display:none}
.potions svg{width:17px;height:22px;filter:drop-shadow(0 1px 2px rgba(0,0,0,.8))}
.potions.empty{opacity:.45}
.potions.pulse{transform:scale(1.25)}
.potions .pnote{position:absolute;left:calc(100% + 8px);top:50%;transform:translateY(-50%);white-space:nowrap;font:italic 400 15px var(--serif);color:#ffd9b8;opacity:0;transition:opacity .25s;pointer-events:none}
.potions .pnote.show{opacity:1}
.touch [data-act=potion]{--s:50px;--x:-140px;--y:-52px;border-color:rgba(255,190,140,.6);display:grid;place-items:center}
.touch [data-act=potion][hidden]{display:none}
.touch [data-act=potion] svg{width:20px;height:26px;pointer-events:none}
.touch [data-act=potion] b{position:absolute;right:-2px;bottom:-2px;min-width:19px;height:19px;border-radius:10px;background:#6c3f5f;color:var(--bone);font:700 12px/19px var(--body);text-align:center;pointer-events:none}
.touch [data-act=potion].empty{opacity:.45}
@media (orientation:landscape){ .touch [data-act=potion]{--x:-62px;--y:-150px} }
/* narrow phones: the pause button sits top-centre, so the bottle goes under the hearts instead of beside them */
@media (max-width:480px){ .hp-row{flex-direction:column;align-items:flex-start;gap:4px} }
`;
const BOTTLE_SVG='<svg viewBox="0 0 17 22" aria-hidden="true"><path d="M6.3 1.5h4.4v2.2h-.5v2.8a6.4 6.4 0 1 1-3.4 0V3.7h-.5z" fill="rgba(255,236,214,.22)" stroke="#f1e3cf" stroke-width="1.1" stroke-linejoin="round"/><path d="M2.6 12.6h11.8a5.9 5.9 0 0 1-11.8 0z" fill="#f08a5c"/><path d="M4.4 11.4c.5-1.6 1.6-2.6 2.6-3" stroke="#ffe9d6" stroke-width="1" fill="none" stroke-linecap="round" opacity=".8"/><rect x="6.5" y=".6" width="4" height="2.2" rx=".6" fill="#b5835a"/></svg>';
const potEl=document.createElement('div'); potEl.className='potions'; potEl.id='potions'; potEl.hidden=true; potEl.setAttribute('role','status');
potEl.innerHTML=BOTTLE_SVG+'<span class="pn">0</span><span class="pnote" aria-live="polite"></span>';
const potN=potEl.querySelector('.pn'), potNote=potEl.querySelector('.pnote');
let potBtn=null, potNoteT=0, mendT=0;
(function mountPotions(){
  const st=document.createElement('style'); st.textContent=POT_CSS; document.head.appendChild(st);
  const h=$('hearts'); if(h&&h.parentNode){ const r=document.createElement('div'); r.className='hp-row'; h.parentNode.insertBefore(r,h); r.appendChild(h); r.appendChild(potEl); }
  const t=$('touch'); if(t){ potBtn=document.createElement('button'); potBtn.type='button'; potBtn.dataset.act='potion'; potBtn.hidden=true;
    potBtn.setAttribute('aria-label','Drink a Mender’s Draught'); potBtn.innerHTML=BOTTLE_SVG+'<b>0</b>'; t.insertBefore(potBtn,t.firstChild); }
})();
function refreshPotions(e){
  const Pn=G.potions; if(!Pn)return;
  const n=Pn.count, show=n>0||(Pn.state&&Pn.state.ever);
  potEl.hidden=!show; potEl.classList.toggle('empty',n===0); potN.textContent=n;
  potEl.setAttribute('aria-label','Mender’s Draughts: '+n+' of '+Pn.max);
  if(potBtn){ potBtn.hidden=!show; potBtn.classList.toggle('empty',n===0); potBtn.lastChild.textContent=n; }
  if(e&&e.n>0){ potEl.classList.add('pulse'); setTimeout(()=>potEl.classList.remove('pulse'),300); }
}
G.on('potions:change',refreshPotions);
G.on('potion:refuse',e=>{ potNote.textContent=e&&e.reason==='whole'?'You’re already whole':'No draughts left'; potNote.classList.add('show'); potNoteT=1.6; });
G.on('potion:drink',()=>{ mendT=1.5; });
function updatePotionsUI(dt){
  if(potNoteT>0){ potNoteT-=dt; if(potNoteT<=0)potNote.classList.remove('show'); }
  if(mendT>0){ mendT-=dt; heartsEl.classList.toggle('mending',mendT>0); }
}

/* ---------- controller legend + notices ---------- */
const keysEl=$('keys'), keysHTML=keysEl?keysEl.innerHTML:'';
const PAD_ROWS=[['LS','move'],['RS','camera'],['A','jump · hold to glide'],['B','roll'],['X','strike · hold to charge'],['Y','use'],['LT','lock on'],['LB','sprint'],['RB','lantern shutter'],['Up','drink a draught'],['Menu','pause']];
const padRows=()=>PAD_ROWS.map(([g,t])=>`<span>${glyph(g)} ${esc(t)}</span>`).join('');
const BLOCKED_MSG='Your browser blocked controller access in this view. Open the game on its own page, or run the local copy.';
let keysFade=0, padHint=false;
function refreshPadUI(){
  const st=G.input.gamepad, pad=usingPad();
  if(keysEl){ const want=pad?padRows():keysHTML; if(keysEl.dataset.mode!==(pad?'pad':'kb')){ keysEl.innerHTML=want; keysEl.dataset.mode=pad?'pad':'kb'; keysFade=0; } }
  document.querySelectorAll('[data-pad-legend]').forEach(el=>{
    if(!el.dataset.filled){ el.innerHTML=`<span class="eyebrow">Controller supported</span><div class="controls">${padRows()}</div>`; el.dataset.filled='1'; }
    el.hidden=!st.connected;
  });
  document.querySelectorAll('[data-kb-legend]').forEach(el=>{ el.hidden=pad&&st.connected; });
  const note=$('padNote');
  if(note){
    if(st.blocked){ note.hidden=false; note.classList.add('warn'); note.textContent=BLOCKED_MSG; }
    else if(!st.connected&&!G.isMobile){ note.hidden=false; note.classList.remove('warn'); note.textContent='Using a controller? Press any button.'; }
    else note.hidden=true;
  }
  lastPrompt='';
}
G.on('input:device',refreshPadUI);
G.on('input:pad',refreshPadUI);
G.on('input:padblocked',()=>{ refreshPadUI();
  // one-time notice for players already past the title card
  if(!padHint&&G.state.mode!=='title'){ padHint=true; G.ui.toast('Controller unavailable','Open the game on its own page'); toastT=6; } });
refreshPadUI();

/* ---------- touch buttons ---------- */
document.querySelectorAll('#touch button').forEach(b=>{
  const a=b.dataset.act;
  b.addEventListener('pointerdown',e=>{e.preventDefault();b.classList.add('on');G.input.setVirtual(a,true);});
  const up=e=>{b.classList.remove('on');G.input.setVirtual(a,false);};
  b.addEventListener('pointerup',up); b.addEventListener('pointercancel',up); b.addEventListener('pointerleave',up);
  b.addEventListener('contextmenu',e=>e.preventDefault());
});
const touchEl=$('touch'); if(touchEl)touchEl.addEventListener('contextmenu',e=>e.preventDefault());

/* ---------- movement stick visual (draw only; core.js owns the input) ---------- */
const stick=document.createElement('div'); stick.className='stick'; stick.innerHTML='<i></i>';
document.body.appendChild(stick); const knob=stick.firstChild;
let stickId=null, sx=0, sy=0;
const cv=$('c');
if(cv){
  cv.addEventListener('touchstart',e=>{ if(G.state.mode!=='play')return; for(const t of e.changedTouches){
    if(stickId===null&&t.clientX<innerWidth*.42){stickId=t.identifier;sx=t.clientX;sy=t.clientY;
      stick.style.transform=`translate(${sx}px,${sy}px)`;knob.style.transform='';stick.classList.add('on');}}},{passive:true});
  cv.addEventListener('touchmove',e=>{ for(const t of e.changedTouches){ if(t.identifier!==stickId)continue;
    let dx=t.clientX-sx, dy=t.clientY-sy; const m=Math.hypot(dx,dy); if(m>40){dx*=40/m;dy*=40/m;}
    knob.style.transform=`translate(${dx}px,${dy}px)`; }},{passive:true});
  const endStick=e=>{ for(const t of e.changedTouches) if(t.identifier===stickId){stickId=null;stick.classList.remove('on');} };
  cv.addEventListener('touchend',endStick,{passive:true}); cv.addEventListener('touchcancel',endStick,{passive:true});
}

/* ---------- events ---------- */
G.on('player:hurt',e=>{G.ui.flash();G.ui.shake(.35);});
G.on('staff:pickup',()=>{$('staffChip').hidden=false;});

G.system('hud',{order:90,modes:'always',
  update(dt){
    updateCaption(dt);
    if(toastT>0){toastT-=(dt||G.dt||0); if(toastT<=0)toastEl.classList.remove('show');}
    if(G.state.mode!=='play'&&stickId!==null){stickId=null;stick.classList.remove('on');}
    if(G.state.mode==='title')return;
    updateHearts(); updateWorldUI(dt); updatePrompt(); placeBoss(); updatePotionsUI(dt||0);
    if(G.state.mode==='play'){ keysFade+=dt; const k=$('keys'); if(k){k.style.opacity=keysFade>50?'0':'1'; k.hidden=keysFade>52;} } // once faded, free its row so captions sit low, clear of the prompts
    // camera shake (applied after the camera system has placed the camera)
    if(shakeAmt>.001&&dt>0){
      const a=shakeAmt; G.camera.position.x+=(Math.random()-.5)*a; G.camera.position.y+=(Math.random()-.5)*a; G.camera.position.z+=(Math.random()-.5)*a;
      shakeAmt=U.damp(shakeAmt,0,9,dt);
    }
  }
});
})();
