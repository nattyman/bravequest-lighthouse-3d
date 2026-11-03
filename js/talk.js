/* =====================================================================
   talk.js — the conversation card (People agent; spec: UNDERCROFT.md "Talk")
   G.talk.open({who, name?, title?, portrait?, lines:[string|{text,lie?,who?}], choices:[{id?,text,next?,action?,needs?}],
                lieTag?, onClose?})
     - pauses play the way the map does (mode 'paused'); closing resumes it
     - each line types at the caption system's speed (G.ui.captionConfig().TYPE); 'standard'/'relaxed' move on by
       themselves after the caption reading time, 'hold' waits; Enter / Space / E, A or D-pad down (or a tap) advance
     - 2–3 choices after the last line: click / tap, Up/Down (W/S, 1-3) + Enter, D-pad / stick + A
       choice.next: a node {lines, choices} or a function returning one (the talk goes on);
       choice.action(): runs, then the card closes (or goes on if it returns a node); needs: ()=>bool | flag name
     - every line goes into the pause menu's Messages log (G.ui.logLine)
     - a line flagged {lie:true} bleeds ink while the Remembering Glass is raised, with an "Ink in his words" tag;
       the Glass can be raised during talk (G, controller Y, the lens button on the card)
     - Esc / B leaves the conversation
   Events: talk:open {who} · talk:line {who, text, lie, index} · talk:choice {who, id} · talk:close {who, how}
   ===================================================================== */
(function(){
'use strict';
const G=window.G, U=G.U;
const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

const CSS=`
#talk{position:fixed;inset:0;z-index:30;display:flex;align-items:flex-end;justify-content:center;pointer-events:auto;
  padding:0 16px calc(22px + env(safe-area-inset-bottom,0px));background:linear-gradient(180deg,rgba(14,9,20,0) 35%,rgba(14,9,20,.55));
  transition:background .4s}
#talk[hidden]{display:none}
#talk .tk-card{position:relative;width:min(640px,100%);display:grid;grid-template-columns:auto 1fr;gap:4px 16px;align-items:start;
  padding:18px 22px 14px;color:#21161f;cursor:default;
  background:linear-gradient(180deg,#efe4cc,#e2d3b3);border-radius:3px;
  box-shadow:0 18px 50px rgba(0,0,0,.6),inset 0 0 0 1px rgba(60,40,30,.25),inset 0 0 0 5px #efe4cc,inset 0 0 0 6px rgba(60,40,30,.35);
  animation:tkIn .28s ease-out}
@keyframes tkIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
#talk .tk-face{grid-row:1 / span 3;width:74px;height:92px;border-radius:50% / 46%;overflow:hidden;
  box-shadow:0 0 0 2px #e9dcc0,0 0 0 3px rgba(60,40,30,.5),0 4px 10px rgba(0,0,0,.25);background:#3a2c3c}
#talk .tk-face canvas{width:100%;height:100%;display:block}
#talk .tk-face[hidden]{display:none}
#talk .tk-head{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;min-width:0}
#talk .eyebrow{font:600 11px var(--body);letter-spacing:.22em;text-transform:uppercase;color:#6c3f5f}
#talk h3{margin:0;font:400 clamp(21px,3.2vw,26px)/1.1 var(--display);color:#21161f}
#talk .tk-text{margin:2px 0 0;min-height:3.9em;font:italic 400 18px/1.42 var(--serif);color:#3a262c}
#talk .tk-tag{display:inline-flex;align-items:center;gap:6px;justify-self:start;margin-top:2px;padding:2px 10px 2px 7px;border-radius:999px;
  font:700 11px var(--body);letter-spacing:.14em;text-transform:uppercase;color:#f3e8ff;background:#2a1838;box-shadow:inset 0 0 0 1px rgba(170,120,255,.6)}
#talk .tk-tag[hidden]{display:none}
#talk .tk-tag svg{width:10px;height:13px}
#talk .tk-choices{grid-column:1 / -1;display:grid;gap:6px;margin:10px 0 2px;padding:0;list-style:none}
#talk .tk-choices[hidden]{display:none}
#talk .tk-choice{display:flex;align-items:center;gap:10px;width:100%;text-align:left;cursor:pointer;margin:0;
  padding:9px 12px;border:0;border-radius:2px;font:400 16.5px/1.3 var(--serif);color:#2b1c22;background:rgba(255,250,238,.55);
  box-shadow:inset 0 0 0 1px rgba(60,40,30,.22);transition:background .12s,box-shadow .12s,color .12s;touch-action:manipulation}
#talk .tk-choice b{flex:none;width:22px;height:22px;display:grid;place-items:center;border-radius:50%;font:700 12px var(--body);color:#6c3f5f;box-shadow:inset 0 0 0 1px rgba(108,63,95,.45)}
#talk .tk-choice.sel,#talk .tk-choice:hover{background:#4b3863;color:#f6eedd;box-shadow:inset 0 0 0 1px #2c1f3b,0 2px 8px rgba(40,20,50,.3)}
#talk .tk-choice.sel b,#talk .tk-choice:hover b{color:#ffd88a;box-shadow:inset 0 0 0 1px rgba(255,216,138,.6)}
#talk .tk-choice.name{font-family:var(--display);letter-spacing:.02em}
#talk .tk-foot{grid-column:1 / -1;display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:6px;
  font:600 11.5px var(--body);letter-spacing:.06em;color:#6b5560}
#talk .tk-next{display:flex;align-items:center;gap:6px;opacity:.85}
#talk .tk-next[hidden]{visibility:hidden}
#talk .tk-next b{color:#6c3f5f;animation:tkNudge 1.2s ease-in-out infinite}
@keyframes tkNudge{50%{transform:translateX(3px)}}
#talk kbd{display:inline-block;min-width:18px;padding:1px 5px;border-radius:3px;font:700 11px var(--body);color:#2b1c22;background:#f6eedd;box-shadow:inset 0 -1px 0 rgba(60,40,30,.35),0 0 0 1px rgba(60,40,30,.3)}
#talk .tk-btns{display:flex;gap:8px}
#talk .tk-mini{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border:0;border-radius:999px;cursor:pointer;
  font:600 12px var(--body);color:#4b3863;background:rgba(255,250,238,.55);box-shadow:inset 0 0 0 1px rgba(75,56,99,.35)}
#talk .tk-mini[hidden]{display:none}
#talk .tk-mini svg{width:16px;height:16px}
#talk .tk-mini[aria-pressed=true]{color:#f6eedd;background:#5a3f78}
/* the Glass raised: the card takes a sepia-violet cast, and lies bleed */
#talk.glass{background:radial-gradient(ellipse at 50% 60%,rgba(60,30,80,0) 30%,rgba(40,18,52,.62))}
#talk.glass .tk-card{background:linear-gradient(180deg,#eadcc6,#d8c4b0);box-shadow:0 18px 50px rgba(0,0,0,.6),0 0 30px rgba(145,80,255,.25),inset 0 0 0 1px rgba(80,40,90,.35),inset 0 0 0 5px #eadcc6,inset 0 0 0 6px rgba(80,40,90,.45)}
#talk .tk-text.lie .w{position:relative;display:inline-block;color:#2a1336;animation:tkBleed 2.4s ease-in forwards;animation-delay:var(--d,0s);filter:url(#tkInk)}
#talk .tk-text.lie .w::after{content:'';position:absolute;left:var(--x,40%);top:72%;width:2.5px;height:0;border-radius:0 0 3px 3px;
  background:linear-gradient(#2b0b47,rgba(80,30,140,.15));animation:tkDrip 3s ease-in forwards;animation-delay:calc(var(--d,0s) + .6s);opacity:var(--o,0)}
@keyframes tkBleed{0%{color:#3a262c;text-shadow:none}
  45%{color:#3b1758;text-shadow:0 1px 2px rgba(59,23,88,.8),0 0 6px rgba(120,60,200,.4)}
  100%{color:#2b0b47;text-shadow:0 0 1px #2a0f40,0 2px 4px rgba(70,25,120,.9),0 5px 10px rgba(110,50,190,.65),1px 7px 3px rgba(42,15,64,.45)}}
@keyframes tkDrip{to{height:19px}}
@media (prefers-reduced-motion:reduce){ #talk .tk-text.lie .w{animation-duration:.01s} #talk .tk-text.lie .w::after{animation-duration:.01s} #talk .tk-card{animation:none} }
body.talk-open #pauseBtn,body.talk-open #cap,body.talk-open #prompt,body.talk-open #keys{visibility:hidden}
@media (max-width:560px){
  #talk{padding:0 10px calc(10px + env(safe-area-inset-bottom,0px))}
  #talk .tk-card{grid-template-columns:auto 1fr;padding:14px 14px 10px;gap:2px 12px}
  #talk .tk-face{width:52px;height:64px;grid-row:1 / span 2}
  #talk .tk-text{grid-column:1 / -1;font-size:17px;min-height:4.3em}
  #talk .tk-tag{grid-column:1 / -1}
  #talk .tk-choice{padding:11px 12px;font-size:16px}
  #talk .tk-foot .kbonly{display:none}
}
@media (max-height:440px){ #talk .tk-text{min-height:2.9em;font-size:16px} #talk .tk-choice{padding:6px 10px} #talk .tk-face{width:52px;height:64px} }
`;
const DROP_SVG='<svg viewBox="0 0 10 13" aria-hidden="true"><path d="M5 0C5 0 0 6 0 8.6A5 4.4 0 0 0 10 8.6C10 6 5 0 5 0z" fill="#a37cff"/></svg>';
const LENS_SVG='<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10.6 10.6L15 15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M4.6 5.2l2.2 1.4-1 2.4" fill="none" stroke="currentColor" stroke-width=".9" opacity=".8"/></svg>';

let root=null, card, faceEl, eyeEl, nameEl, textEl, tagEl, listEl, nextEl, glassBtn, leaveBtn, hintEl;
function build(){
  if(root)return;
  const st=document.createElement('style'); st.textContent=CSS; document.head.appendChild(st);
  // an SVG filter for the ink: ragged, slightly running edges
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'); svg.setAttribute('width','0'); svg.setAttribute('height','0'); svg.style.position='absolute';
  svg.innerHTML='<filter id="tkInk" x="-10%" y="-20%" width="120%" height="160%"><feTurbulence type="fractalNoise" baseFrequency=".9 .35" numOctaves="2" seed="7" result="n"/>'+
    '<feDisplacementMap in="SourceGraphic" in2="n" scale="2.6" xChannelSelector="R" yChannelSelector="G"/></filter>';
  document.body.appendChild(svg);
  root=document.createElement('div'); root.id='talk'; root.hidden=true;
  root.innerHTML=`<div class="tk-card" role="dialog" aria-modal="true" aria-labelledby="tkName" aria-describedby="tkText">
    <div class="tk-face" aria-hidden="true"></div>
    <div class="tk-head"><h3 id="tkName"></h3><span class="eyebrow"></span></div>
    <p class="tk-text" id="tkText" aria-live="polite"></p>
    <span class="tk-tag" hidden>${DROP_SVG}<span>Ink in his words</span></span>
    <div class="tk-choices" role="listbox" aria-label="What do you say?" hidden></div>
    <div class="tk-foot"><div class="tk-btns">
        <button type="button" class="tk-mini" data-tk="glass" aria-pressed="false" hidden>${LENS_SVG}<span>Raise the Glass</span></button>
        <button type="button" class="tk-mini" data-tk="leave">Leave</button></div>
      <span class="tk-next"><span class="hk"></span><b>▸</b></span></div></div>`;
  document.body.appendChild(root);
  card=root.querySelector('.tk-card'); faceEl=root.querySelector('.tk-face'); eyeEl=root.querySelector('.eyebrow'); nameEl=root.querySelector('h3');
  textEl=root.querySelector('.tk-text'); tagEl=root.querySelector('.tk-tag'); listEl=root.querySelector('.tk-choices'); nextEl=root.querySelector('.tk-next');
  glassBtn=root.querySelector('[data-tk=glass]'); leaveBtn=root.querySelector('[data-tk=leave]'); hintEl=nextEl.querySelector('.hk');
  // a tap / click on the card (not on a button) advances; the backdrop does nothing (never a stray attack)
  root.addEventListener('pointerdown',e=>{ e.stopPropagation(); if(!T.open)return;
    if(e.target.closest('button'))return;
    if(e.target.closest('.tk-card')){ e.preventDefault(); advance(); } });
  root.addEventListener('click',e=>e.stopPropagation());
  root.addEventListener('contextmenu',e=>e.preventDefault());
  glassBtn.addEventListener('click',e=>{ e.stopPropagation(); toggleGlass(); });
  leaveBtn.addEventListener('click',e=>{ e.stopPropagation(); close('leave'); });
  listEl.addEventListener('pointermove',e=>{ const b=e.target.closest('.tk-choice'); if(b&&e.pointerType==='mouse')select(+b.dataset.i,false); });
  listEl.addEventListener('click',e=>{ const b=e.target.closest('.tk-choice'); if(b){ e.stopPropagation(); choose(+b.dataset.i); } });
}

/* ---------------------------------------------------------------- state */
const T={open:null, node:null, li:0, typed:0, el:0, read:0, done:false, choices:[], sel:0, last:0, glass:false, from:null, wasLocked:false};
const lineObj=l=>typeof l==='string'?{text:l}:(l||{text:''});
function capCfg(){ try{ return G.ui.captionConfig(); }catch(_){ return {TYPE:44,MIN:5,PER:.12,MAX:15,hold:false,speed:'relaxed'}; } }
const glassUp=()=>!!(G.glass&&G.glass.raised);
const glassOwned=()=>!!(G.glass&&G.glass.owned);

function open(o){
  if(!o||!o.lines)return false;
  build();
  if(T.open){ T.open=o; showNode(o); return true; }       // a talk replacing a talk (a new node) keeps the card up
  const mode=G.state.mode;
  if(mode!=='play'&&mode!=='paused')return false;
  if(G.map&&G.map.isOpen)return false;
  T.open=o; T.from=mode; T.wasLocked=!!(G.input&&G.input.locked); T.openedAt=performance.now();
  if(mode==='play'){ G.setMode('paused'); try{G.input.unlockPointer();}catch(_){} }
  root.hidden=false; document.body.classList.add('talk-open');
  T.last=performance.now(); padPrev=padButtons(readPad()); padNav=''; keyHeld.clear();
  showNode(o);
  if(G.headless)G.headless.draw(3);
  G.emit('talk:open',{who:o.who});
  return true;
}
function face(o){
  faceEl.innerHTML='';
  const p=o.portrait;
  if(!p){ faceEl.hidden=true; return; }
  faceEl.hidden=false;
  if(typeof p==='function'){ const c=document.createElement('canvas'); c.width=148; c.height=184; try{ p(c.getContext('2d'),148,184,glassUp()); }catch(e){console.error('talk portrait',e);} faceEl.appendChild(c); }
  else if(p instanceof HTMLCanvasElement||p instanceof HTMLImageElement)faceEl.appendChild(p);
}
function showNode(n){
  T.node=n; T.li=-1; T.choices=[]; T.sel=0;
  const o=T.open;
  nameEl.textContent=n.name||o.name||o.who||''; eyeEl.textContent=n.title||o.title||'';
  face(Object.assign({},o,n.portrait?{portrait:n.portrait}:{}));
  tagEl.querySelector('span').textContent=n.lieTag||o.lieTag||'Ink in his words';
  nextLine();
}
function nextLine(){
  const n=T.node, lines=n.lines||[];
  T.li++;
  if(T.li>=lines.length){ // nothing more to say: the choices, or the end
    if(!showChoices())close('end');
    return;
  }
  const L=lineObj(lines[T.li]);
  T.typed=reduceMotion?1e4:0; T.el=0; T.done=false;
  const C=capCfg(); T.read=Math.max(U.clamp(L.text.length*(C.PER||.12),C.MIN||5,C.MAX||15),L.text.length/(C.TYPE||44)+1.2);
  listEl.hidden=true; listEl.innerHTML='';
  renderText(true);
  const who=L.who||T.open.name||T.open.who||'';
  try{ if(G.ui.logLine)G.ui.logLine(L.text,who); }catch(_){}
  G.emit('talk:line',{who:T.open.who,text:L.text,lie:!!L.lie,index:T.li});
  updateHint();
}
function curLine(){ const n=T.node; return n&&n.lines&&T.li>=0&&T.li<n.lines.length?lineObj(n.lines[T.li]):null; }
let shownLie=null, shownN=-1;
function renderText(force){
  const L=curLine(); if(!L)return;
  const lie=!!L.lie&&glassUp();
  if(lie&&T.typed<L.text.length)T.typed=1e4; // seen through the Glass, a lie arrives whole: the ink runs word by word instead of typing
  const n=Math.min(L.text.length,Math.floor(T.typed));
  if(!force&&n===shownN&&lie===shownLie)return;
  shownN=n; shownLie=lie;
  textEl.classList.toggle('lie',lie);
  tagEl.hidden=!lie;
  if(!lie){ textEl.textContent=L.text.slice(0,n); return; }
  // ink: each word runs on its own, a few drip
  const words=L.text.slice(0,n).split(/(\s+)/); let h='', k=0;
  for(const w of words){ if(!w)continue; if(/^\s+$/.test(w)){ h+=w; continue; }
    h+=`<span class="w" style="--d:${(k*.09).toFixed(2)}s;--x:${(20+((k*37)%60))}%;--o:${(k%2===1)?1:0}">${esc(w)}</span>`; k++; }
  textEl.innerHTML=h;
}
function showChoices(){
  const n=T.node, all=(n.choices||[]).filter(c=>{ if(!c)return false; const nd=c.needs; if(nd==null)return true; try{ return typeof nd==='function'?!!nd():G.flag(nd); }catch(_){ return false; } });
  if(!all.length)return false;
  T.choices=all.slice(0,3); T.sel=0;
  listEl.innerHTML=T.choices.map((c,i)=>`<button type="button" role="option" class="tk-choice${c.name?' name':''}" data-i="${i}"><b>${i+1}</b><span>${esc(c.text)}</span></button>`).join('');
  listEl.hidden=false; select(0,true); updateHint();
  if(G.headless)G.headless.draw(2);
  return true;
}
function select(i,focus){
  if(!T.choices.length)return;
  T.sel=(i+T.choices.length)%T.choices.length;
  listEl.querySelectorAll('.tk-choice').forEach((b,k)=>{ b.classList.toggle('sel',k===T.sel); b.setAttribute('aria-selected',String(k===T.sel)); });
  if(focus){ const b=listEl.querySelector('.sel'); if(b)try{ b.focus({preventScroll:true}); }catch(_){} }
}
function choose(i){
  if(!T.open||!T.choices.length)return false;
  const c=T.choices[i==null?T.sel:i]; if(!c)return false;
  const o=T.open;
  G.emit('talk:choice',{who:o.who,id:c.id||c.text});
  try{ if(G.ui.logLine)G.ui.logLine('“'+c.text+'”','You'); }catch(_){}
  let nx=null;
  try{
    if(c.action)nx=c.action(c);
    if(!nx&&c.next)nx=typeof c.next==='function'?c.next(c):c.next;
  }catch(e){ console.error('talk choice',e); }
  if(!T.open)return true;             // the action closed the card itself
  if(nx&&nx.lines){ showNode(nx); return true; }
  close('choice'); return true;
}
/** Enter / A / D-pad down / a tap: finish typing, then the next line (or the choice that's selected) */
function advance(){
  if(!T.open)return '';
  const L=curLine();
  if(T.choices.length&&!listEl.hidden){ choose(); return 'choose'; }
  if(L&&T.typed<L.text.length){ T.typed=1e4; renderText(); updateHint(); return 'complete'; }
  nextLine(); return 'next';
}
function close(how){
  if(!T.open)return false;
  const o=T.open; T.open=null; T.node=null; T.choices=[];
  root.hidden=true; document.body.classList.remove('talk-open'); textEl.textContent=''; listEl.innerHTML='';
  if(T.glass&&glassUp()&&G.glass.raise)try{ G.glass.raise(false); }catch(_){}   // a Glass raised inside the talk goes down with it
  T.glass=false; root.classList.remove('glass');
  if(T.from==='play'&&G.state.mode==='paused'){ G.setMode('play'); if(!G.isMobile&&T.wasLocked&&performance.now()-T.openedAt>300)try{ G.input.lockPointer(); }catch(_){} }   // (a card shut as fast as it opened: the unlock is still in flight; flow.js would read the relock as a pause)
  if(G.headless)G.headless.draw(2);
  try{ o.onClose&&o.onClose(how||'close'); }catch(e){ console.error('talk onClose',e); }
  G.emit('talk:close',{who:o.who,how:how||'close'});
  return true;
}
function toggleGlass(){
  if(!T.open||!glassOwned()||!G.glass.raise)return;
  const on=!glassUp();
  try{ G.glass.raise(on); }catch(e){ console.error('glass',e); }
  T.glass=on&&glassUp();
  syncGlass(); if(G.headless)G.headless.draw(2);
}
function syncGlass(){
  const up=glassUp();
  root.classList.toggle('glass',up);
  glassBtn.hidden=!glassOwned(); glassBtn.setAttribute('aria-pressed',String(up));
  glassBtn.querySelector('span').textContent=up?'Lower the Glass':'Raise the Glass';
  renderText(true);
}
function updateHint(){
  const pad=G.input.device==='gamepad', touch=G.input.device==='touch'||(G.isMobile&&!pad);
  const gl=G.ui.glyph||(n=>n);
  let h='';
  if(T.choices.length&&!listEl.hidden) h=pad?gl('A')+' choose':touch?'Tap to choose':'<span class="kbonly"><kbd>↑</kbd><kbd>↓</kbd> </span><kbd>Enter</kbd> choose';
  else h=pad?gl('A')+' '+gl('Down'):touch?'Tap':'<kbd>Enter</kbd>';
  if(glassOwned()&&!touch) h=(pad?gl('Y'):'<kbd>G</kbd>')+' Glass &nbsp; '+h;
  hintEl.innerHTML=h;
  leaveBtn.innerHTML=pad?gl('B')+' Leave':touch?'Leave':'<kbd>Esc</kbd> Leave';
  glassBtn.hidden=!glassOwned();
}

/* ---------------------------------------------------------------- keyboard (capture: the game never sees these while talking) */
const keyHeld=new Set();
addEventListener('keydown',e=>{
  if(!T.open)return;
  const c=e.code;
  // keep the browser's own keys (reload, devtools) working
  if(e.ctrlKey||e.metaKey)return;
  e.preventDefault(); e.stopPropagation();
  if(e.repeat&&!/Arrow|Key[WS]/.test(c))return;
  if(c==='Enter'||c==='NumpadEnter'||c==='Space'||c==='KeyE'){ advance(); return; }
  if(c==='ArrowUp'||c==='KeyW'){ if(T.choices.length)select(T.sel-1,true); return; }
  if(c==='ArrowDown'||c==='KeyS'){ if(T.choices.length)select(T.sel+1,true); return; }
  if(/^Digit[1-3]$/.test(c)||/^Numpad[1-3]$/.test(c)){ const i=+c.slice(-1)-1; if(T.choices.length&&i<T.choices.length&&!listEl.hidden)choose(i); return; }
  if(c==='KeyG'){ toggleGlass(); return; }
  if(c==='Escape'||c==='KeyP'||c==='Backspace'){ close('leave'); return; }
},true);
addEventListener('keyup',e=>{ if(T.open){ e.stopPropagation(); } keyHeld.delete(e.code); },true);

/* ---------------------------------------------------------------- controller (read directly; core gives a paused game's pad to menus,
   and the talk card is not one of core's cards) */
let padPrev=[], padNav='', padNavT=0, yDown=0;
function readPad(){ try{ for(const g of (navigator.getGamepads?navigator.getGamepads():[])||[])if(g&&g.connected!==false)return g; }catch(_){} return null; }
function padButtons(g){ const out=[]; if(!g)return out; for(let i=0;i<17;i++){ const b=g.buttons[i]; out[i]=b?(typeof b==='object'?(b.pressed||b.value>.5):b>.5):false; } return out; }
function padTick(dt){
  const g=readPad(); if(!g){ padPrev=[]; return; }
  const btn=padButtons(g), prev=padPrev, edge=i=>btn[i]&&!prev[i]; padPrev=btn;
  const ly=+(g.axes&&g.axes[1])||0;
  if(edge(0)){ advance(); return; }
  if(edge(1)){ close('leave'); return; }
  if(edge(3)){ toggleGlass(); return; }
  const choosing=T.choices.length&&!listEl.hidden;
  const dir=(btn[12]||ly<-.55)?'up':(btn[13]||ly>.55)?'down':'';
  if(!choosing){ if(dir==='down'&&padNav!=='down'&&btn[13])advance(); padNav=dir; padNavT=.38; return; }   // a held D-pad down that brings up the choices doesn't also move through them
  if(dir!==padNav){ padNav=dir; padNavT=.38; if(dir)select(T.sel+(dir==='up'?-1:1),true); }
  else if(dir){ padNavT-=dt; if(padNavT<=0){ padNavT=.16; select(T.sel+(dir==='up'?-1:1),true); } }
}

/* ---------------------------------------------------------------- per frame (real time while paused, G.step's dt in tests) */
G.system('talk',{order:57,modes:'always',
  update(dt){
    if(!T.open)return;
    if(G.state.mode!=='paused'){ if(G.state.mode==='play'&&T.from==='play')close('mode'); else if(G.state.mode!=='play')close('mode'); return; }
    const now=performance.now(); let rdt=(now-T.last)/1000; T.last=now; if(dt>0)rdt=dt; rdt=U.clamp(rdt,0,.1);
    padTick(rdt);
    if(!T.open)return;
    if(root.classList.contains('glass')!==glassUp())syncGlass();
    const L=curLine(); if(!L)return;
    const C=capCfg();
    if(T.typed<L.text.length){ T.typed+=rdt*(C.TYPE||44); renderText(); if(T.typed>=L.text.length)updateHint(); }
    else{
      T.el+=rdt;
      // the caption speed: 'standard' and 'relaxed' move on after the reading time (never past the last line: the choices wait); 'hold' waits
      const last=T.li>=((T.node.lines||[]).length-1);
      if(!C.hold&&C.speed!=='hold'&&!last&&T.el>=T.read)nextLine();
    }
  }
});
G.on('input:device',()=>{ if(T.open)updateHint(); });

G.talk={
  open, close:()=>close('api'), advance, choose:i=>choose(i), select:i=>select(i,true), toggleGlass,
  get isOpen(){ return !!T.open; },
  get who(){ return T.open?T.open.who:null; },
  /** for tests: what the card shows */
  state(){ const L=curLine(); return T.open?{who:T.open.who,name:nameEl.textContent,line:L?L.text:null,lie:!!(L&&L.lie),index:T.li,typing:!!(L&&T.typed<L.text.length),
    shown:textEl.textContent,inked:textEl.classList.contains('lie'),tag:!tagEl.hidden,choices:listEl.hidden?[]:T.choices.map(c=>c.text),sel:T.sel,glass:glassUp()}:null; },
  get el(){ build(); return root; }
};
G.on('ready',build);
})();
