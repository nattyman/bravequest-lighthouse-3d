/* =========================================================================
   cloud.js — saves that follow the player across devices.
   When the game runs as a published Claude artifact and the viewer is signed
   in with write access, the save ('bq-save-v1' in localStorage, see flow.js)
   is mirrored to the artifact's per-person store at data/users/<id>/save.
   Each person's document is private to them (the owner can't read it either).

   On load:  the newer of the local and cloud saves wins (by its `at` time).
             A newer cloud save is copied into localStorage before Continue,
             so Continue/applySave need no changes.
   In play:  every save flow.js writes is uploaded, at most one every 20 s,
             plus right away when the tab is hidden or the player quits.
   Anywhere else (own website, a saved file, tests, the test-save slot) it
   stays off and the game saves to the browser exactly as before.
   API: G.cloud = { state: 'off'|'checking'|'on'|'local-only', flush() }
   ========================================================================= */
(function(){
'use strict';
const G=window.G; if(!G)return;
const GAP=20000, DOC_LIMIT=240*1024;
const S={state:'off',ref:null,busy:false,dirty:false,lastPut:0,timer:0,remoteAt:0};
const $=id=>document.getElementById(id);
function note(t){ const el=$('cloudNote'); if(!el)return; el.hidden=!t; el.textContent=t||''; }
const wait=(p,ms)=>Promise.race([p,new Promise((_,rej)=>setTimeout(()=>rej({code:'timeout'}),ms))]);
function key(){ return G.flow&&G.flow.keys?G.flow.keys.save:'bq-save-v1'; }
function localRaw(){ try{ return localStorage.getItem(key()); }catch(_){ return null; } }
function parse(s){ try{ const d=JSON.parse(s); return d&&d.v===1?d:null; }catch(_){ return null; } }

async function start(){
  // tests run without the platform; ?cloud lets a debug page opt in
  if(G.debug&&!/[?&]cloud(=|&|$)/.test(location.search))return;
  const C=window.claude; if(!C||typeof C.use!=='function')return;
  S.state='checking';
  let user=null, db=null;
  try{ [user,db]=await Promise.all([C.use('user'),C.use('db')]); }catch(_){}
  if(!user||!db){ S.state='off'; return; }
  let id=null; try{ id=await user.id(); }catch(_){}
  if(!id){ S.state='off'; return; }                       // signed out, or no identity for this viewer
  try{ S.ref=db.doc('data/users/'+id+'/save'); }catch(_){ S.state='off'; return; }
  let snap=null;
  try{ snap=await wait(S.ref.get(),10000); }
  catch(e){ S.state='off'; note('Couldn’t reach your cloud save just now, so this session saves on this device.'); return; }
  const body=snap&&snap.exists?snap.data():null;
  const cloud=body&&typeof body.save==='string'?parse(body.save):null;
  const local=parse(localRaw());
  S.remoteAt=cloud?cloud.at:0;
  S.state='on';
  if(cloud&&(!local||cloud.at>local.at)){
    if(G.state.mode==='title'){
      try{ localStorage.setItem(key(),body.save); }catch(_){}
      if(G.flow&&G.flow.refreshTitle)G.flow.refreshTitle();
      note('Your save from another device is ready. Saves follow you wherever you’re signed in to Claude.');
    }else note('');
    return;
  }
  note(local?'Cloud saves are on. Your progress follows you wherever you’re signed in to Claude.':'Cloud saves are on. Once you’ve played a little, your progress will follow you to any device where you’re signed in to Claude.');
  if(local&&(!cloud||local.at>cloud.at))put();
}

/* one upload at a time; anything saved while one is in flight goes up next */
async function put(){
  if(S.state!=='on'||G.testSaves)return;
  if(S.busy){ S.dirty=true; return; }
  const raw=localRaw(), d=parse(raw); if(!d||d.at<=S.remoteAt)return;
  if(raw.length>DOC_LIMIT){ return; }                      // too big for one document: stay local
  S.busy=true; S.dirty=false; clearTimeout(S.timer); S.timer=0; S.lastPut=Date.now();
  try{
    await S.ref.set({v:1,at:d.at,objective:String(d.objective||'').slice(0,120),save:raw});
    S.remoteAt=d.at; G.emit('cloud:saved',{at:d.at});
  }catch(e){
    const c=e&&e.code;
    if(c==='invalid_argument'||c==='not_granted'||c==='revoked'||c==='capability_disabled'||c==='capability_removed'){
      S.state='local-only'; G.emit('cloud:off',{code:c});    // view-only on this artifact: the device save carries on
    }else if(c==='unavailable'&&!S.retried){ S.retried=true; setTimeout(()=>{ S.retried=false; put(); },1500+Math.random()*1500); }
  }finally{ S.busy=false; }
  if(S.dirty)schedule();
}
function schedule(){
  if(S.state!=='on'||G.testSaves||S.timer)return;
  if(S.busy){ S.dirty=true; return; }                      // the upload in flight schedules the next one when it lands
  const ms=Math.max(0,GAP-(Date.now()-S.lastPut));
  S.timer=setTimeout(()=>{ S.timer=0; put(); },ms);
}
function flush(){ if(S.state!=='on')return Promise.resolve(); clearTimeout(S.timer); S.timer=0; return put(); }

G.cloud={ get state(){ return S.state; }, flush };
G.on('save:written',schedule);
document.addEventListener('visibilitychange',()=>{ if(document.hidden)setTimeout(flush,50); });
window.addEventListener('pagehide',()=>{ flush(); });
start();
})();
