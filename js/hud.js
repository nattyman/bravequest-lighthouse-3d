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
  say(text,who){ if(!text)return; if(cur&&cur.t===text)return; if(queue.some(q=>q.t===text))return; queue.push({t:text,who:who||''}); if(queue.length>4)queue.shift(); },
  objective(text,sub){
    if(text!=null&&objEl.textContent!==text){ objEl.textContent=text; objEl.classList.add('fresh'); clearTimeout(objTimer); objTimer=setTimeout(()=>objEl.classList.remove('fresh'),2600); }
    objSub.textContent=sub||'';
  },
  toast(title,small){ toastEl.innerHTML=''; toastEl.append(document.createTextNode(title||'')); if(small){const s=document.createElement('small');s.textContent=small;toastEl.append(s);} toastEl.classList.add('show'); toastT=3.2; },
  bossBar(name,frac){ if(!name){bossEl.hidden=true;return;} bossEl.hidden=false; if(bossName.textContent!==name)bossName.textContent=name; bossFill.style.width=(U.clamp(frac==null?1:frac,0,1)*100).toFixed(1)+'%'; },
  flash(){ hurtEl.style.transition='none'; hurtEl.style.opacity='1'; requestAnimationFrame(()=>{hurtEl.style.transition='opacity .5s';hurtEl.style.opacity='0';}); },
  shake(a){ if(!reduceMotion)shakeAmt=Math.max(shakeAmt,a||.3); }
};
function updateCaption(dt){
  if(!cur&&queue.length){const q=queue.shift();cur={t:q.t,who:q.who,i:reduceMotion?1e4:0,hold:0,shown:-1};capWho.textContent=q.who;capWho.hidden=!q.who;capEl.classList.add('show');}
  if(!cur)return;
  cur.i+=dt*44; const n=Math.min(cur.t.length,Math.floor(cur.i));
  if(n!==cur.shown){capText.textContent=cur.t.slice(0,n);cur.shown=n;}
  if(n>=cur.t.length){cur.hold+=dt; if(cur.hold>(queue.length?1.8:4)+cur.t.length*.026){cur=null; if(!queue.length)capEl.classList.remove('show');}}
}

/* ---------- hearts ---------- */
const heartsEl=$('hearts'); let lastHearts='';
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
  let h=''; for(let i=0;i<max/2;i++){const v=hp-i*2; h+=`<div class="heart">${heartSVG(v>=2?2:v===1?1:0)}</div>`;}
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
    stam.style.transform=`translate(${pt.x+46}px,${pt.y-10}px)`;
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
function updatePrompt(){
  let html='';
  if(G.state.mode==='play'){
    const rows=[]; const c=G.interact.current;
    if(c)rows.push([G.isMobile?'Use':(c.key||'E'),G.interact.label(c)]);
    for(const h of G.hints){ if(!rows.some(r=>r[1]===h.label))rows.push([h.key,h.label]); }
    html=rows.slice(0,3).map(r=>`<div>${r[0]?`<kbd>${esc(r[0])}</kbd>`:''}${esc(r[1])}</div>`).join('');
  }
  if(html!==lastPrompt){promptEl.innerHTML=html;lastPrompt=html;}
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
let keysFade=0;

G.system('hud',{order:90,modes:'always',
  update(dt){
    updateCaption(dt);
    if(toastT>0){toastT-=dt; if(toastT<=0)toastEl.classList.remove('show');}
    if(G.state.mode!=='play'&&stickId!==null){stickId=null;stick.classList.remove('on');}
    if(G.state.mode==='title')return;
    updateHearts(); updateWorldUI(dt); updatePrompt();
    if(G.state.mode==='play'){ keysFade+=dt; const k=$('keys'); if(k){k.style.opacity=keysFade>50?'0':'1';} }
    // camera shake (applied after the camera system has placed the camera)
    if(shakeAmt>.001&&dt>0){
      const a=shakeAmt; G.camera.position.x+=(Math.random()-.5)*a; G.camera.position.y+=(Math.random()-.5)*a; G.camera.position.z+=(Math.random()-.5)*a;
      shakeAmt=U.damp(shakeAmt,0,9,dt);
    }
  }
});
})();
