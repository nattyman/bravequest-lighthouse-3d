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
/* the stack: lines waiting behind the one on screen show as the edges of cards behind it (index.html .capstack / .capback);
   decoration only, the queue itself is unchanged. When the front card goes and the next one is waiting, it slides away. */
const capStack=$('capStack'), capCount=$('capCount'), capBacks=capStack?[...capStack.querySelectorAll('.capback')].reverse():[]; // [b1, b2]
let stackKey='';
function drawStack(){
  const vis=!!cur&&capEl.classList.contains('show'), n=vis?queue.length:0, depth=Math.min(n,2);
  const key=depth+'|'+n+'|'+(depth?queue.slice(0,depth).map(q=>q.who).join('|'):'');
  if(key===stackKey||!capStack)return; stackKey=key;
  capStack.dataset.depth=String(depth);
  capBacks.forEach((b,i)=>{ const on=i<depth; b.classList.toggle('on',on); const sp=b.firstChild; if(on&&sp){ const w=queue[i].who||''; if(sp.textContent!==w)sp.textContent=w; } }); // off: the name stays while it fades
  if(capCount){ capCount.hidden=n<3; if(n>=3)capCount.textContent='+'+n; }
}
/* the front card leaves: a copy of it slides off down-left and fades while the real one (now the next line) comes forward
   from the first back card's place. Reduced motion: an instant swap. */
function capSlide(){
  if(reduceMotion||!capStack||!capEl.animate||!capEl.classList.contains('show')||!capText.textContent)return;
  const r=capEl.getBoundingClientRect(); if(!r.width||!r.height)return;
  const old=capEl.cloneNode(true); old.removeAttribute('id'); old.querySelectorAll('[id]').forEach(e=>e.removeAttribute('id'));
  old.classList.add('leaving'); old.classList.remove('waiting','held'); old.setAttribute('aria-hidden','true');
  old.style.left=r.left+'px'; old.style.top=r.top+'px'; old.style.width=r.width+'px'; old.style.height=r.height+'px';
  document.body.appendChild(old);
  const a=old.animate([{transform:'none',opacity:1},{transform:'translate(-26px,16px) rotate(-1.2deg)',opacity:0}],{duration:340,easing:'cubic-bezier(.4,0,.7,.2)',fill:'forwards'});
  const done=()=>old.remove(); a.onfinish=done; setTimeout(done,700);
  try{ capEl.animate([{transform:'translate(9px,-13px)',opacity:.55},{transform:'none',opacity:1}],{duration:300,easing:'cubic-bezier(.2,.7,.3,1)'}); }catch(_){}
}
const queue=[]; let cur=null;
/* Caption pacing. say(text, who?, {priority:'high'|'normal'|'low', key}) — the old say(text, who) call is 'normal'.
   - high (boss/quest beats, danger): interrupts the current line at once (a current high line keeps its minimum time first)
   - normal: a queued line with the same key is replaced; dropped if it has waited longer than STALE
   - low: flavour; dropped quickly if it can't be shown, never cuts anything
   Reading time scales with length; a waiting line cuts the current one short once its minimum time has passed.
   The player picks the reading time in the pause menu (SPEEDS, localStorage 'bq-captions'):
   - relaxed (default): about twice the standard reading time, generous minimums; waiting lines cut in later
   - standard: the original pacing
   - hold: normal/high lines stay until the player advances them; low lines still time out
   Advance: the 'advance' action (Enter) or a click/tap on the caption: the first press finishes the typewriter,
   the next shows the next waiting line or dismisses. Every line said is also kept in the message log (pause > Messages). */
const SPEEDS={
  standard:{k:1,  MIN:2.5,PER:.06,MAX:7, QMAX:4,cut:0,  hold:false},
  relaxed: {k:2.2,MIN:5,  PER:.12,MAX:15,QMAX:6,cut:.6, hold:false},
  hold:    {k:2.2,MIN:5,  PER:.12,MAX:15,QMAX:8,cut:.6, hold:true}
};
const CAP={MIN:2.5, PER:.06, MAX:7, TYPE:44, STALE:{0:2.5,1:6,2:14}, QMAX:4, speed:'relaxed', cut:0, hold:false};
const STALE0={0:2.5,1:6,2:14};
function setCapSpeed(id,quiet){
  if(!SPEEDS[id])id='relaxed';
  const S=SPEEDS[id]; CAP.speed=id; CAP.MIN=S.MIN; CAP.PER=S.PER; CAP.MAX=S.MAX; CAP.QMAX=S.QMAX; CAP.cut=S.cut; CAP.hold=S.hold;
  for(const p in STALE0)CAP.STALE[p]=STALE0[p]*S.k;
  if(S.hold){ CAP.STALE[1]=Infinity; CAP.STALE[2]=Infinity; } // held lines wait for the player (QMAX still bounds the queue)
  if(!quiet){ try{localStorage.setItem('bq-captions',JSON.stringify({speed:id}));}catch(_){} if(G.emit)G.emit('settings',{captionSpeed:id}); }
  if(cur){ const r=capTimes(cur.t); cur.read=r.read; cur.min=r.min; }
  return id;
}
{ let sp='relaxed'; try{ const c=JSON.parse(localStorage.getItem('bq-captions')||'null'); if(c&&SPEEDS[c.speed])sp=c.speed; }catch(_){} setCapSpeed(sp,true); }
const PRI={low:0,normal:1,high:2};
const capRead=t=>U.clamp(t.length*CAP.PER,CAP.MIN,CAP.MAX);
function capTimes(t){ const typeT=reduceMotion?0:t.length/CAP.TYPE; return {typeT, read:Math.max(capRead(t),typeT+1.2), min:Math.max(CAP.MIN,Math.min(typeT+.6,CAP.MAX))}; }
function capItem(text,who,o){ const p=PRI[o.priority]; return {t:text,who:who||'',pri:p==null?1:p,key:o.key||null,age:0}; }
const held=c=>CAP.hold&&c&&c.pri>=1; // waits for the player
function capMissed(it){ if(it&&it.log&&!it.log.seen)it.log.m=1; logDirty=true; }
function capEnqueue(it){
  let i=queue.length; while(i>0&&(queue[i-1].pri<it.pri||(it.requeued&&queue[i-1].pri===it.pri)))i--; // higher priority goes ahead, FIFO within a priority (an interrupted line resumes first)
  queue.splice(i,0,it);
  while(queue.length>CAP.QMAX){ let w=0; for(let j=1;j<queue.length;j++)if(queue[j].pri<queue[w].pri)w=j; capMissed(queue.splice(w,1)[0]); } // drop the oldest of the least important
}
/* the line on screen goes away: was it read? (fully typed and on screen for half its reading time, or the player moved on) */
function capEnd(byPlayer){
  if(!cur)return;
  const done=cur.i>=cur.t.length&&(byPlayer||cur.el>=Math.min(cur.read*.5,cur.min));
  if(cur.log){ if(done){ cur.log.seen=true; cur.log.m=0; logDirty=true; } else if(!cur.requeuing)capMissed(cur); }
  cur=null;
}
function capShow(it){
  if(!it.inPlace)capSlide(); // a card on screen gives way to the next: slide it away (a same-key update just rewrites it)
  if(cur&&cur!==it)capEnd(false);
  const T=capTimes(it.t);
  cur={t:it.t,who:it.who,pri:it.pri,key:it.key,i:reduceMotion?1e4:0,el:0,shown:-1,read:T.read,min:T.min,requeued:it.requeued,log:it.log};
  capWho.textContent=it.who; capWho.hidden=!it.who; capEl.classList.add('show'); capEl.classList.toggle('hi',it.pri>=2);
  capChip=null;
}
/* ---------- the message log (pause menu > Messages; persisted in the save as 'captions') ---------- */
const LOG_MAX=200, LOG_REPEAT=8; // ×N when the same line comes again within LOG_REPEAT game seconds
let msgLog=[], logDirty=true, logSeq=0;
const CAVE_ROOMS={mouth:'mouth',gallery:'gallery',stair:'stair',channel:'channel',drafts:'drafts',arena:'Undertow’s pool'};
function capPlace(){
  try{
    const P=G.player&&G.player.pos; if(!P||G.state.mode==='title')return '';
    if(G.cave&&G.cave.inside){ const r=G.cave.room&&G.cave.room(P); return 'Sea cave'+(r?' · '+(CAVE_ROOMS[r]||r):''); }
    const lh=G.world&&G.world.lighthouse; if(lh&&lh.inside&&lh.inside(P))return 'The lighthouse';
    const L=(G.world&&G.world.landmarks)||{}, near=(l,r)=>l&&Math.hypot(P.x-l.x,P.z-l.z)<r;
    if(near(L.cottage,12)||near(L.shed,7))return 'The keeper’s cottage';
    if(P.x>=128)return 'The headland';
    if(P.x>=88)return 'The cliff path';
    if(near(L.resistingTree,(L.resistingTree&&L.resistingTree.r||14)+10))return 'The Resisting Tree';
    if(near(L.hamlet,28))return 'The ruined hamlet';
    if(near(L.stones,18))return 'The standing stones';
    if(P.x<-70)return 'The forest';
    return 'The moor';
  }catch(_){ return ''; }
}
function logLine(it){
  const last=msgLog[msgLog.length-1];
  if(last&&last.t===it.t&&last.w===it.who&&last.gt!=null&&G.time-last.gt<LOG_REPEAT){
    if(G.time-last.gt>=.5)last.n=(last.n||1)+1; // a line said every frame counts once per half second
    last.gt=G.time; last.at=Date.now(); last.p=Math.max(last.p,it.pri); logDirty=true; return last;
  }
  const e={id:++logSeq,t:it.t,w:it.who||'',p:it.pri,a:capPlace(),at:Date.now(),n:1,gt:G.time};
  msgLog.push(e); if(msgLog.length>LOG_MAX)msgLog.splice(0,msgLog.length-LOG_MAX);
  logDirty=true; return e;
}
const LOG_PERSIST={
  save:()=>({v:1,list:msgLog.map(e=>{ const o={t:e.t,w:e.w,p:e.p,a:e.a,at:e.at}; if(e.n>1)o.n=e.n; if(e.m)o.m=1; return o; })}),
  load(d){
    if(!d||d.v!==1||!Array.isArray(d.list))return; // unknown versions are ignored (the log starts empty)
    const old=d.list.filter(e=>e&&typeof e.t==='string').map(e=>({id:++logSeq,t:e.t,w:e.w||'',p:+e.p||1,a:e.a||'',at:+e.at||0,n:+e.n||1,m:e.m?1:0,seen:!e.m}));
    msgLog=old.concat(msgLog.filter(e=>!old.some(o=>o.t===e.t&&o.at===e.at))).slice(-LOG_MAX); logDirty=true;
  }
};
if(G.persist&&G.persist.register)G.persist.register('captions',LOG_PERSIST);
else G.on('ready',()=>{ if(G.persist&&G.persist.register)G.persist.register('captions',LOG_PERSIST); });
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
    it.log=logLine(it);
    if(cur&&cur.t===text){ cur.pri=Math.max(cur.pri,it.pri); cur.log=it.log; return; }
    const d=queue.findIndex(q=>q.t===text); if(d>=0){ queue[d].log=it.log; if(queue[d].pri<it.pri){queue.splice(d,1);capEnqueue(it);} return; }
    if(it.key){
      const k=queue.findIndex(q=>q.key===it.key); if(k>=0)capMissed(queue.splice(k,1)[0]); // a newer line for the same thing replaces the waiting one
      if(cur&&cur.key===it.key&&it.pri>=cur.pri){ it.inPlace=true; capShow(it); return; }   // ...or the one on screen
    }
    if(it.pri>=2&&cur&&!(cur.pri>=2&&cur.el<cur.min)){
      // interrupt now; a line cut off early (under half read) comes back once afterwards
      if(cur.pri>=1&&!cur.requeued&&cur.el<cur.read*.5&&!queue.some(q=>q.t===cur.t)){ capEnqueue({t:cur.t,who:cur.who,pri:cur.pri,key:cur.key,age:-4,requeued:true,log:cur.log}); cur.requeuing=true; }
      capShow(it); return;
    }
    if(it.pri===0&&(cur||queue.length)&&queue.some(q=>q.pri>0)){ capMissed(it); return; } // flavour never waits behind real lines
    capEnqueue(it);
  },
  /** Enter / a tap on the caption: finish the typing, else move on to the next waiting line (or dismiss). Returns what it did. */
  advance(){
    if(!cur){ if(queue.length){ capShow(queue.shift()); return 'next'; } return ''; }
    if(cur.i<cur.t.length){ cur.i=1e4; return 'complete'; } // the rest of its reading time still runs
    capEnd(true);
    if(queue.length){ capShow(queue.shift()); return 'next'; }
    capEl.classList.remove('show'); return 'dismiss';
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
let capChip=null; // last hint state drawn, so the chip only re-renders when it changes
const capHint=document.createElement('span'); capHint.className='capnext'; capHint.setAttribute('aria-hidden','true');
const capBar=document.createElement('i'); capBar.className='captime';
capEl.append(capHint,capBar);
function hintKey(){ const d=G.input.device; return d==='gamepad'?glyph('Down'):d==='touch'||(G.isMobile&&d!=='keyboard')?'<span class="tap">Tap</span>':'<kbd>Enter</kbd>'; }
function drawChip(){
  const typing=cur.i<cur.t.length, n=queue.length, key=hintKey();
  const want=(typing?'t':'s')+n+key;
  if(want===capChip)return; capChip=want;
  capHint.innerHTML=(n?`<span class="more">${n} more</span>`:'')+key+'<b>▸</b>';
  capEl.classList.toggle('waiting',n>0); capEl.classList.toggle('held',held(cur)&&!typing);
}
function updateCaption(dt){
  dt=dt||0;
  for(let j=queue.length-1;j>=0;j--){ const q=queue[j]; q.age+=dt; if(q.age>CAP.STALE[q.pri])capMissed(queue.splice(j,1)[0]); } // late lines are stale lines
  if(cur){
    cur.el+=dt;
    if(held(cur)){ /* stays until the player advances it (or a high line interrupts) */ }
    else if(queue.length&&cur.el>=cur.min&&(queue[0].pri>=cur.pri?cur.el>=cur.read*CAP.cut:cur.el>=cur.read*Math.max(.6,CAP.cut+.25)))capEnd(false); // something is waiting: cut short
    else if(cur.el>=cur.read)capEnd(false);
    if(!cur&&!queue.length)capEl.classList.remove('show');
  }
  if(!cur&&queue.length)capShow(queue.shift());
  drawStack();
  if(!cur)return;
  cur.i+=dt*(queue.length?CAP.TYPE*1.6:CAP.TYPE); const n=Math.min(cur.t.length,Math.floor(cur.i));
  if(n!==cur.shown){capText.textContent=cur.t.slice(0,n);cur.shown=n;}
  drawChip();
  capBar.style.transform=held(cur)?'scaleX(0)':`scaleX(${U.clamp(1-cur.el/cur.read,0,1).toFixed(3)})`;
}
/* Enter (the 'advance' action, core.js) while playing; clicks/taps on the caption itself (never reach the canvas, so no attack) */
function canAdvance(){ return G.state.mode==='play'&&!!cur&&!document.querySelector('.card:not([hidden])'); }
capEl.addEventListener('pointerdown',e=>{
  if(!capEl.classList.contains('show'))return;
  e.preventDefault(); e.stopPropagation();
  if(G.state.mode==='play')G.ui.advance();
});
capEl.addEventListener('click',e=>{ e.preventDefault(); e.stopPropagation(); });
capEl.addEventListener('contextmenu',e=>e.preventDefault());
/* for tests and devtools: what is on screen and waiting */
G.ui.captions=()=>({cur:cur&&{text:cur.t,who:cur.who,pri:cur.pri,key:cur.key,el:+cur.el.toFixed(2),read:+cur.read.toFixed(2),min:+cur.min.toFixed(2),typing:cur.i<cur.t.length,held:held(cur)},
  queue:queue.map(q=>({text:q.t,pri:q.pri,key:q.key,age:+q.age.toFixed(2)})), speed:CAP.speed});
G.ui.clearCaptions=()=>{ queue.length=0; cur=null; capEl.classList.remove('show'); drawStack(); };
/** for tests: the stack as drawn — {depth (back cards showing, 0-2), count ('+N' badge text or ''), who:[names on the back cards]} */
G.ui.captionStack=()=>({depth:+(capStack&&capStack.dataset.depth||0),count:capCount&&!capCount.hidden?capCount.textContent:'',
  who:capBacks.filter(b=>b.classList.contains('on')).map(b=>b.firstChild?b.firstChild.textContent:''),leaving:document.querySelectorAll('.caption.leaving').length});
/** reading time: 'relaxed' (default) | 'standard' | 'hold'. Persisted in localStorage 'bq-captions'. */
G.ui.setCaptionSpeed=id=>{ const r=setCapSpeed(id); syncCapSeg(); return r; };
Object.defineProperty(G.ui,'captionSpeed',{get:()=>CAP.speed,set:v=>G.ui.setCaptionSpeed(v),enumerable:true});
G.ui.captionConfig=()=>JSON.parse(JSON.stringify(CAP,(k,v)=>v===Infinity?'hold':v));
/** the message log, oldest first: [{t, w (who), p (0 low,1 normal,2 high), a (place), at (ms), n (repeats), m (missed)}] */
G.ui.messages=()=>msgLog.map(e=>({text:e.t,who:e.w,pri:e.p,place:e.a,at:e.at,n:e.n||1,missed:!!e.m}));
G.ui.clearMessages=()=>{ msgLog=[]; logDirty=true; };
/** put a line straight into the message log without showing a caption (talk.js: the conversation card shows its own lines) */
G.ui.logLine=(text,who)=>{ if(!text)return; const e=logLine({t:String(text),who:who||'',pri:1}); e.seen=true; e.m=0; };

/* ---------- pause menu: reading-time setting, tabs (Paused / Messages) and the message log ---------- */
const CAP_NOTES={
  relaxed:'Messages stay on screen about twice as long. Press Enter or tap a message to move on sooner.',
  standard:'The original, quicker pacing. Press Enter or tap a message to skip ahead.',
  hold:'Story and dialogue wait for you: press Enter or tap the message to continue. Small asides still fade on their own.'
};
function syncCapSeg(){
  document.querySelectorAll('#capSpeedSeg button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.cap===CAP.speed)));
  const n=$('capSpeedNote'); if(n)n.textContent=CAP_NOTES[CAP.speed]||'';
}
document.querySelectorAll('#capSpeedSeg button').forEach(b=>b.addEventListener('click',()=>G.ui.setCaptionSpeed(b.dataset.cap)));
syncCapSeg();
const pauseSheet=document.querySelector('#pause .sheet');
let pzTab='main', pzList=null, pzTabs=null, pzCount=null;
(function buildPauseTabs(){
  if(!pauseSheet)return;
  pzTabs=document.createElement('div'); pzTabs.className='pz-tabs'; pzTabs.setAttribute('role','tablist'); pzTabs.setAttribute('aria-label','Pause menu');
  pzTabs.innerHTML='<button type="button" role="tab" id="pzTabMain" data-pz="main" aria-controls="pause" aria-selected="true">Paused</button>'+
    '<button type="button" role="tab" id="pzTabMsgs" data-pz="msgs" aria-controls="pzMsgs" aria-selected="false">Messages <span class="pz-n" id="pzCount"></span></button>';
  // the Messages tab hides everything except the tabs, the log and the buttons row (index.html CSS), so rows other
  // modules add to the pause sheet later (techniques, sound, map) stay in "Paused"; Resume, Journal, Save stay in both
  const acts=pauseSheet.querySelector('.actions');
  const pane=document.createElement('div'); pane.id='pzMsgs'; pane.setAttribute('role','tabpanel'); pane.setAttribute('aria-labelledby','pzTabMsgs');
  pane.innerHTML='<div class="pz-mhead"><span class="eyebrow">Messages · newest first</span><h2>What was said</h2></div>'+
    '<ol class="pz-log" id="pzLog" tabindex="0" aria-label="Messages, newest first"></ol>';
  pauseSheet.insertBefore(pzTabs,pauseSheet.firstChild);
  if(acts)pauseSheet.insertBefore(pane,acts); else pauseSheet.appendChild(pane);
  pzList=pane.querySelector('#pzLog'); pzCount=pzTabs.querySelector('#pzCount');
  pzTabs.addEventListener('click',e=>{ const b=e.target.closest('[data-pz]'); if(b)setPauseTab(b.dataset.pz,true); });
  pzTabs.addEventListener('keydown',e=>{ if(e.code==='ArrowRight'||e.code==='ArrowLeft'){ e.preventDefault(); setPauseTab(pzTab==='main'?'msgs':'main',true); } });
  pauseSheet.dataset.tab='main';
})();
function setPauseTab(t,focus){
  if(!pauseSheet||!pzTabs)return;
  pzTab=t==='msgs'?'msgs':'main'; pauseSheet.dataset.tab=pzTab;
  for(const b of pzTabs.querySelectorAll('[data-pz]'))b.setAttribute('aria-selected',String(b.dataset.pz===pzTab));
  if(pzTab==='msgs'){ renderLog(); pzList.scrollTop=0; }
  const card=$('pause'); if(card)card.scrollTop=0;
  else syncCapSeg();
  if(focus){ const f=pzTabs.querySelector(`[data-pz="${pzTab}"]`); try{f.focus({preventScroll:true});}catch(_){f.focus();} if(G.input.device==='gamepad')f.classList.add('pad-focus'); }
}
G.ui.pauseTab=(t,focus)=>{ if(t)setPauseTab(t,focus); return pzTab; };
function fmtTime(at){
  if(!at)return '';
  const d=new Date(at), now=new Date();
  let s; try{ s=d.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}); }catch(_){ s=d.getHours()+':'+String(d.getMinutes()).padStart(2,'0'); }
  if(d.toDateString()!==now.toDateString()){ try{ s=d.toLocaleDateString([], {month:'short',day:'numeric'})+', '+s; }catch(_){} }
  return s;
}
function renderLog(){
  if(!pzList)return; logDirty=false;
  if(pzCount)pzCount.textContent=msgLog.length?String(msgLog.length):'';
  if(pzTab!=='msgs')return;
  if(!msgLog.length){ pzList.innerHTML='<li class="pz-empty">Nothing has been said yet. Everything you see in the captions is kept here.</li>'; return; }
  let h='';
  for(let i=msgLog.length-1;i>=0;i--){ const e=msgLog[i];
    const ctx=[e.a,fmtTime(e.at)].filter(Boolean).map(esc).join(' · ');
    h+=`<li class="pz-msg p${e.p}${e.m?' missed':''}"><div class="pz-meta">${e.w?`<b>${esc(e.w)}</b>`:''}<span class="ctx">${ctx}</span>`+
      `${e.n>1?`<span class="rep" title="Said ${e.n} times">×${e.n}</span>`:''}${e.m?'<span class="flag" title="This one went by before you could read it">missed</span>':''}</div><p>${esc(e.t)}</p></li>`;
  }
  pzList.innerHTML=h;
}
G.on('mode',e=>{ if(e.mode==='paused'&&pauseSheet){ syncCapSeg(); renderLog(); if(pzTab==='msgs')pzList.scrollTop=0; } });
/* controller: the right stick (or D-pad up/down while a tab has focus) scrolls the log; in play, D-pad down advances captions */
function padScrollLog(dt){
  if(!pzList||pzTab!=='msgs'||$('pause').hidden||!G.input.padState)return;
  const g=G.input.padState(); if(!g)return; const y=+(g.A&&g.A[3])||0;
  if(Math.abs(y)>.2)pzList.scrollTop+=y*900*Math.max(dt,1/60);
}
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
  const P=G.player; const hp=Math.max(0,Math.round(P.hp||0)), max=Math.max(2,Math.round(P.maxHp||4));
  const key=hp+'/'+max; if(key===lastHearts)return; lastHearts=key;
  const grew=lastMax>0&&max>lastMax, from=lastMax/2; lastMax=max; // a new heart (progression.js) grows in with a glow
  let h=''; for(let i=0;i<max/2;i++){const v=hp-i*2; h+=`<div class="heart${grew&&i>=from?' born':''}">${heartSVG(v>=2?2:v===1?1:0)}</div>`;}
  heartsEl.innerHTML=h; heartsEl.setAttribute('aria-label',`Health ${hp/2} of ${max/2} hearts`);
}

/* ---------- screen projection helpers ---------- */
const v3=new THREE.Vector3();
function project(p,out){ v3.copy(p).project(G.camera); out.x=(v3.x*.5+.5)*innerWidth; out.y=(-v3.y*.5+.5)*innerHeight; out.behind=v3.z>1; return out; }
const reticle=$('reticle'), stam=$('stamina'), stamArc=$('stamArc');
let stamVis=0, stamFullT=0, stamPrev=1, stamCls='';
const STAM_C=125.66; // circumference of the r=20 arc (index.html #stamArc)
/** for tests: the wheel as drawn — {shown, state:'ok'|'low'|'exh'|'full'|'', opacity, frac} */
G.ui.staminaWheel=()=>({shown:!stam.hidden&&stamVis>.02, state:stamCls.replace('st-',''), opacity:+(+stam.style.opacity||0).toFixed(2), frac:+(1-(+stamArc.getAttribute('stroke-dashoffset')||0)/STAM_C).toFixed(3)});
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
  // stamina wheel beside the player (BotW style) while it's not full: green, amber under 30%, flashing red/grey while
  // exhausted; when it fills back up it pulses once, then fades. Hidden at full stamina.
  const s=U.clamp(P.stamina==null?1:P.stamina,0,1), full=s>=.995;
  if(full&&stamPrev<.995&&stamVis>.3)stamFullT=.75; // just refilled: the pulse (index.html #stamina.st-full)
  stamPrev=s; if(stamFullT>0)stamFullT-=dt||0;
  stamVis=playing?U.damp(stamVis,(!full||stamFullT>0)?1:0,full?5:10,dt):0; // paused / dead / cut to a menu: gone at once
  if(stamVis>.02&&P.pos){
    v3.set(P.pos.x,P.pos.y+1.3,P.pos.z); project(v3,pt);
    stam.hidden=pt.behind; stam.style.opacity=stamVis.toFixed(2);
    const big=1+((P.mods&&P.mods.stamMax)||1)*.75-.75; // Moth Wings: the ring grows with the pool (+15% per wing)
    const off=Math.min(64,Math.max(44,innerHeight*.07))*big; // to the right of the player's shoulder, a little further on big screens
    const x=U.clamp(pt.x+off,34,innerWidth-34), y=U.clamp(pt.y-14,34,innerHeight-34);
    stam.style.transform=`translate(${x.toFixed(1)}px,${y.toFixed(1)}px) scale(${big.toFixed(2)})`;
    stamArc.setAttribute('stroke-dashoffset',(STAM_C*(1-s)).toFixed(2));
    const cls=P.exhausted?'st-exh':(full&&stamFullT>0)?'st-full':s<.3?'st-low':'st-ok';
    if(cls!==stamCls){ if(stamCls)stam.classList.remove(stamCls); stam.classList.add(cls); stamCls=cls; }
  }else{ stam.hidden=true; if(!playing||full){ if(stamCls)stam.classList.remove(stamCls); stamCls=''; } }
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
const PAD_OF_KEY={E:'Y',F:'RB',J:'X',Q:'LT',Tab:'LT',Space:'A',C:'B',Shift:'LB',Esc:'Menu',P:'Menu',Use:'Y',Click:'X',H:'Up',Drink:'Up',Enter:'Down',R:'Left',T:'Right'};
/* touch: the companions' prompts name their buttons (companions.js mounts them) */
const TOUCH_OF_KEY={R:'Fox',T:'Raven'};
function glyph(n){
  const face={A:'a',B:'b',X:'x',Y:'y'}[n];
  if(face)return `<span class="pad pad-${face}" role="img" aria-label="${n} button">${n}</span>`;
  if(n==='LS'||n==='RS')return `<span class="pad pad-stick" role="img" aria-label="${n==='LS'?'Left':'Right'} stick">${n[0]}</span>`;
  if(n==='Menu')return `<span class="pad pad-pill" role="img" aria-label="Menu button">&#9776;</span>`;
  if(n==='Up')return `<span class="pad pad-pill" role="img" aria-label="D-pad up">&#9650;</span>`;
  if(n==='Down')return `<span class="pad pad-pill" role="img" aria-label="D-pad down">&#9660;</span>`;
  if(n==='Left')return `<span class="pad pad-pill" role="img" aria-label="D-pad left">&#9664;</span>`;
  if(n==='Right')return `<span class="pad pad-pill" role="img" aria-label="D-pad right">&#9654;</span>`;
  return `<span class="pad pad-pill" role="img" aria-label="${n}">${esc(n)}</span>`;
}
G.ui.glyph=glyph;
const usingPad=()=>G.input.device==='gamepad';
function keyCap(k,isInteract){
  if(usingPad()){ const g=isInteract?'Y':PAD_OF_KEY[k]; if(g)return glyph(g); }
  if(TOUCH_OF_KEY[k]&&(G.input.device==='touch'||(G.isMobile&&G.input.device!=='keyboard')))return `<span class="tap">${TOUCH_OF_KEY[k]}</span>`;
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
const keysEl=$('keys'); let keysHTML=keysEl?keysEl.innerHTML:'';
const PAD_ROWS=[['LS','move'],['RS','camera'],['A','jump · hold to glide'],['B','roll'],['X','strike · hold to charge'],['Y','use'],['LT','lock on'],['LB','sprint'],['RB','lantern shutter'],['Up','drink a draught'],['Down','next message'],['View','messages'],['Menu','pause']];
const glassOwned=()=>!!(G.glass&&G.glass.owned);
/* other modules add rows once they apply (companions.js: D-pad left / right once Ember / Corvin are with you): G.ui.padRowHooks.push(()=>[[glyph,text],...]) */
G.ui.padRowHooks=G.ui.padRowHooks||[];
const extraPadRows=()=>{ const out=[]; for(const f of G.ui.padRowHooks){ try{ const r=f(); if(r)out.push(...r); }catch(e){} } return out; };
const padRows=()=>{ const ex=extraPadRows(), rows=PAD_ROWS.slice(); const at=rows.findIndex(r=>r[0]==='Menu'); rows.splice(at<0?rows.length:at,0,...ex);
  return rows.map(([g,t])=>`<span>${glyph(g)} ${esc(g==='Y'&&glassOwned()?'use · hold: the Glass':t)}</span>`).join(''); };
/** companions.js: rebuild the legends after a row hook changes (the pad legend is cached once filled) */
G.ui.refreshLegends=()=>{ document.querySelectorAll('[data-pad-legend]').forEach(el=>{ el.dataset.filled=''; }); if(keysEl&&keysEl.dataset.mode==='pad')keysEl.dataset.mode=''; refreshPadUI(); };
const BLOCKED_MSG='Controllers are blocked in this embedded page — open the game in its own tab.';
/* one line of controller status for the pause menu and the Controls screen ([data-pad-status]) */
function padStatus(){
  const st=G.input.gamepad||{};
  if(st.connected)return {state:'connected',text:`Controller: ${st.name||'Controller'} — connected`+(st.remap?' (non-standard layout, remapped)':'')+(st.count>1?` · ${st.count} found, using the last one pressed`:'')};
  if(st.blocked||st.policy===false)return {state:'blocked',text:'Controllers are blocked in this embedded page — open the game in its own tab'+(st.error?` (browser said: ${st.error})`:'')};
  if(st.supported===false)return {state:'unsupported',text:'This browser has no controller support'};
  return {state:'none',text:'No controller found — connect it and press A'};
}
G.ui.padStatus=padStatus;
let padStatusKey='';
function drawPadStatus(){
  const p=padStatus(), k=p.state+p.text; if(k===padStatusKey)return; padStatusKey=k;
  document.querySelectorAll('[data-pad-status]').forEach(el=>{ el.textContent=p.text; el.dataset.state=p.state; });
}
let keysFade=0, padHint=false, padUiT=0, padCountSeen=-1;
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
    if(!st.connected&&(st.blocked||st.policy===false)){ note.hidden=false; note.classList.add('warn'); note.textContent=BLOCKED_MSG; }
    else if(!st.connected&&st.supported&&!st.count&&!G.isMobile){ note.hidden=false; note.classList.remove('warn'); note.textContent='Using a controller? Press A on it.'; }
    else note.hidden=true;
  }
  drawPadStatus();
  lastPrompt='';
}
G.on('input:device',refreshPadUI);
G.on('input:pad',refreshPadUI);
G.on('input:padblocked',()=>{ refreshPadUI();
  // one-time notice for players already past the title card
  if(!padHint&&G.state.mode!=='title'){ padHint=true; G.ui.toast('Controller unavailable','Open the game on its own page'); toastT=6; } });
refreshPadUI();

/* ---------- the Remembering Glass (glass.js owns the tool): touch button beside the lantern's, legend rows once it's yours ---------- */
const GLASS_CSS=`
.touch [data-act=glass]{--s:50px;--x:-158px;--y:-118px;display:grid;place-items:center;border-color:rgba(214,188,255,.65);background:rgba(40,24,64,.55)}
.touch [data-act=glass][hidden]{display:none}
.touch [data-act=glass] svg{width:24px;height:24px;pointer-events:none}
.touch [data-act=glass].up{background:rgba(145,80,255,.5);box-shadow:0 0 14px rgba(170,120,255,.6)}
@media (orientation:landscape){ .touch [data-act=glass]{--x:-150px;--y:-168px} }   /* beside the lantern shutter */
`;
const GLASS_SVG='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="7" fill="rgba(214,188,255,.18)" stroke="#f1e9d8" stroke-width="1.8"/><circle cx="10" cy="10" r="8.6" fill="none" stroke="#c8a24c" stroke-width="1"/><path d="M15.2 15.2L21 21" stroke="#c8a24c" stroke-width="2.4" stroke-linecap="round"/><path d="M7 6.5l3 2-1.4 3.2M10 8.5l3.4-.6" fill="none" stroke="#f1e9d8" stroke-width=".9" opacity=".75"/></svg>';
let glassBtn=null, glassLegend=false;
(function mountGlass(){
  const st=document.createElement('style'); st.textContent=GLASS_CSS; document.head.appendChild(st);
  const t=$('touch'); if(!t)return;
  glassBtn=document.createElement('button'); glassBtn.type='button'; glassBtn.dataset.act='glass'; glassBtn.hidden=true;
  glassBtn.setAttribute('aria-label','Raise the Remembering Glass'); glassBtn.innerHTML=GLASS_SVG;
  const sh=t.querySelector('[data-act=shutter]'); t.insertBefore(glassBtn,sh?sh.nextSibling:t.firstChild);
})();
function glassRows(){
  if(glassLegend||!glassOwned())return; glassLegend=true;
  const row=short=>{ const s=document.createElement('span'); s.innerHTML='<kbd>G</kbd> '+(short?'the Glass':'raise the Remembering Glass'); return s; };
  if(keysEl){ const kb=keysEl.dataset.mode!=='pad'; if(kb){ const esc_=[...keysEl.children].find(c=>/pause/.test(c.textContent)); keysEl.insertBefore(row(true),esc_||null); } }
  // the stored keyboard legend (restored when the controller goes quiet) gets the row too
  try{ const tmp=document.createElement('div'); tmp.innerHTML=keysHTML; const esc_=[...tmp.children].find(c=>/pause/.test(c.textContent)); tmp.insertBefore(row(true),esc_||null); keysHTML=tmp.innerHTML; }catch(_){}
  document.querySelectorAll('[data-kb-legend]').forEach(el=>el.appendChild(row(false)));
  document.querySelectorAll('[data-pad-legend]').forEach(el=>{ el.dataset.filled=''; });
  refreshPadUI();
}
let glassT=0;
function updateGlassUI(dt){
  glassT-=dt||0; if(glassT>0)return; glassT=.25;
  const own=glassOwned();
  if(own)glassRows();
  if(glassBtn){ const usable=own&&!!(G.input.BIND&&G.input.BIND.glass); glassBtn.hidden=!usable; glassBtn.classList.toggle('up',!!(G.glass&&G.glass.raised)); }
}

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
    if(G.input.pressed('advance')&&canAdvance())G.ui.advance();
    updateCaption(dt);
    if(G.state.mode==='paused'){ if(logDirty)renderLog(); padScrollLog(G.dt||0); }
    padUiT-=G.dt||dt||0; if(padUiT<=0&&G.state.mode!=='play'){ padUiT=.5; const c=(G.input.gamepad||{}).count|0; if(c!==padCountSeen){ padCountSeen=c; refreshPadUI(); } else drawPadStatus(); }
    if(toastT>0){toastT-=(dt||G.dt||0); if(toastT<=0)toastEl.classList.remove('show');}
    if(G.state.mode!=='play'&&stickId!==null){stickId=null;stick.classList.remove('on');}
    if(G.state.mode==='title')return;
    updateHearts(); updateWorldUI(dt); updatePrompt(); placeBoss(); updatePotionsUI(dt||0); updateGlassUI(dt||G.dt||0);
    if(G.state.mode==='play'){ keysFade+=dt; const k=$('keys'); if(k){k.style.opacity=keysFade>50?'0':'1'; k.hidden=keysFade>52;} } // once faded, free its row so captions sit low, clear of the prompts
    // camera shake (applied after the camera system has placed the camera)
    if(shakeAmt>.001&&dt>0){
      const a=shakeAmt; G.camera.position.x+=(Math.random()-.5)*a; G.camera.position.y+=(Math.random()-.5)*a; G.camera.position.z+=(Math.random()-.5)*a;
      shakeAmt=U.damp(shakeAmt,0,9,dt);
    }
  }
});
})();
